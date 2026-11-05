//! Tauri command layer for the vault (spec §4).
//!
//! Thin wrappers over [`Session`]: resolve the vault path, apply failed-attempt backoff, and map
//! errors to strings for the frontend. Secrets (the DEK and the decrypted vault) never cross this
//! boundary — the only secret returned is the one-time Emergency Kit on create/regenerate, which
//! the user must see once in order to store it (the §4.6-sanctioned exception).

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, UNIX_EPOCH};

use serde::Serialize;
use tauri::http::{header, Request, Response};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use crate::archive;
use crate::biometric::{self, BiometricKeyStore};
use crate::blobs;
use crate::crypto::Argon2Params;
use crate::envelope;
use crate::error::Error;
use crate::file_protocol;
use crate::notifications;
use crate::recovery::EmergencyKit;
use crate::session::{self, Session};
use crate::storage;

/// Managed session state.
pub type SharedSession = Mutex<Session>;

/// Resolve the vault file path inside the OS app-data directory.
fn resolve_vault_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(storage::VAULT_FILE))
}

/// Whether a vault already exists (drives onboarding vs. unlock on launch).
#[tauri::command]
pub fn vault_exists(app: AppHandle) -> Result<bool, String> {
    Ok(storage::vault_exists(&resolve_vault_path(&app)?))
}

/// Absolute path of the active vault file (for onboarding / Settings display).
#[tauri::command]
pub fn vault_path(app: AppHandle) -> Result<String, String> {
    Ok(resolve_vault_path(&app)?.display().to_string())
}

/// Pre-unlock compatibility check (spec §11.2 step 1): returns the incompatibility message if this
/// build is too old to read the on-disk container format, else `null`. Read at launch so a too-new
/// vault is refused before any password entry or key derivation.
#[tauri::command]
pub fn vault_incompatibility(app: AppHandle) -> Result<Option<String>, String> {
    Ok(storage::incompatibility_message(&resolve_vault_path(&app)?))
}

/// Whether the session is currently unlocked.
#[tauri::command]
pub fn is_unlocked(state: State<'_, SharedSession>) -> bool {
    state.lock().unwrap().is_unlocked()
}

/// Create a new vault; returns the one-time Emergency Kit (recovery code) to show the user once.
#[tauri::command]
pub fn create_vault(
    app: AppHandle,
    state: State<'_, SharedSession>,
    password: String,
) -> Result<EmergencyKit, String> {
    let path = resolve_vault_path(&app)?;
    if storage::vault_exists(&path) {
        return Err("a vault already exists at this location".to_string());
    }
    state
        .lock()
        .unwrap()
        .create(&path, &password, Argon2Params::PRODUCTION)
        .map_err(|e| e.to_string())
}

/// Unlock with the master password.
#[tauri::command]
pub async fn unlock(app: AppHandle, password: String) -> Result<(), String> {
    let path = resolve_vault_path(&app)?;
    let delay = {
        let session = app.state::<SharedSession>();
        let delay = session.lock().unwrap().backoff_delay();
        delay
    };
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if !delay.is_zero() {
            std::thread::sleep(delay);
        }
        app.state::<SharedSession>()
            .lock()
            .unwrap()
            .unlock_password(&path, &password)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Unlock with the recovery code. The caller must then set a new master password (§4.1 path B).
#[tauri::command]
pub async fn unlock_recovery(app: AppHandle, code: String) -> Result<(), String> {
    let path = resolve_vault_path(&app)?;
    let delay = {
        let session = app.state::<SharedSession>();
        let delay = session.lock().unwrap().backoff_delay();
        delay
    };
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if !delay.is_zero() {
            std::thread::sleep(delay);
        }
        app.state::<SharedSession>()
            .lock()
            .unwrap()
            .unlock_recovery(&path, &code)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Lock the vault, zeroizing all decrypted state.
#[tauri::command]
pub fn lock(state: State<'_, SharedSession>) {
    state.lock().unwrap().lock();
}

/// Update the idle auto-lock timeout (minutes; `0` = never). Spec §4.3/§9.
#[tauri::command]
pub fn set_auto_lock(state: State<'_, SharedSession>, minutes: u64) {
    state
        .lock()
        .unwrap()
        .set_auto_lock(session::auto_lock_from_minutes(minutes));
}

/// Change the master password (requires the vault to be unlocked).
#[tauri::command]
pub fn change_master(
    app: AppHandle,
    state: State<'_, SharedSession>,
    new_password: String,
) -> Result<(), String> {
    let path = resolve_vault_path(&app)?;
    state
        .lock()
        .unwrap()
        .change_master(&path, &new_password, Argon2Params::PRODUCTION)
        .map_err(|e| e.to_string())
}

/// Regenerate the recovery code; returns a fresh Emergency Kit (requires unlocked).
#[tauri::command]
pub fn regenerate_recovery(
    app: AppHandle,
    state: State<'_, SharedSession>,
) -> Result<EmergencyKit, String> {
    let path = resolve_vault_path(&app)?;
    state
        .lock()
        .unwrap()
        .regenerate_recovery(&path)
        .map_err(|e| e.to_string())
}

/// Touch ID status for the current vault (spec §4.7): `{ available, enrolled }`. Reads only the
/// public container header, so it needs no unlock and never prompts.
#[tauri::command]
pub fn biometric_status(app: AppHandle) -> Result<biometric::BiometricStatus, String> {
    let path = resolve_vault_path(&app)?;
    Ok(session::biometric_status(&path, &biometric::system_store()))
}

/// Enable Touch ID unlock: store a biometric-gated key and wrap the DEK (requires unlocked).
#[tauri::command]
pub fn enable_biometric_unlock(
    app: AppHandle,
    state: State<'_, SharedSession>,
) -> Result<(), String> {
    let path = resolve_vault_path(&app)?;
    state
        .lock()
        .unwrap()
        .enable_biometric(&path, &biometric::system_store())
        .map_err(|e| e.to_string())
}

/// Disable Touch ID unlock: delete the Keychain key and drop the wrap (requires unlocked).
#[tauri::command]
pub fn disable_biometric_unlock(
    app: AppHandle,
    state: State<'_, SharedSession>,
) -> Result<(), String> {
    let path = resolve_vault_path(&app)?;
    state
        .lock()
        .unwrap()
        .disable_biometric(&path, &biometric::system_store())
        .map_err(|e| e.to_string())
}

/// Re-enroll ("update") Touch ID with a fresh key + wrap (requires unlocked). Recovers after a
/// fingerprint-set change invalidated the item (§4.7).
#[tauri::command]
pub fn reenroll_biometric_unlock(
    app: AppHandle,
    state: State<'_, SharedSession>,
) -> Result<(), String> {
    let path = resolve_vault_path(&app)?;
    state
        .lock()
        .unwrap()
        .reenroll_biometric(&path, &biometric::system_store())
        .map_err(|e| e.to_string())
}

/// Unlock via Touch ID (path C, §4.7). Runs on a blocking thread since the prompt + Keychain read
/// block; the master password and recovery code remain available if this fails.
#[tauri::command]
pub async fn unlock_biometric(app: AppHandle) -> Result<(), String> {
    let path = resolve_vault_path(&app)?;
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<SharedSession>()
            .lock()
            .unwrap()
            .unlock_biometric(&path, &biometric::system_store())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Return the decrypted vault model (JSON) for the frontend projection. Requires unlocked.
#[tauri::command]
pub fn get_vault(state: State<'_, SharedSession>) -> Result<String, String> {
    state
        .lock()
        .unwrap()
        .vault_json()
        .map_err(|e| e.to_string())
}

/// Persist an updated vault model (JSON), re-sealed under the DEK. Requires unlocked.
#[tauri::command]
pub fn save_vault(
    app: AppHandle,
    state: State<'_, SharedSession>,
    json: String,
) -> Result<(), String> {
    let path = resolve_vault_path(&app)?;
    state
        .lock()
        .unwrap()
        .save_vault(&path, &json)
        .map_err(|e| e.to_string())
}

/// Copy a registered secret by item id and field directly to the concealed pasteboard.
#[tauri::command]
pub fn copy_secret(
    state: State<'_, SharedSession>,
    id: String,
    field: String,
) -> Result<(), String> {
    state
        .lock()
        .unwrap()
        .copy_secret(&id, &field)
        .map_err(|e| e.to_string())
}

/// Reveal a registered secret in a native dialog without returning plaintext to the WebView.
/// Parented to the invoking window so it shows as a sheet — an unparented modal would return
/// focus to the previously active app on dismiss (Accessory policy), hiding the Dashboard.
#[tauri::command]
pub fn reveal_secret(
    app: AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, SharedSession>,
    id: String,
    field: String,
) -> Result<(), String> {
    let secret = state
        .lock()
        .unwrap()
        .secret_value(&id, &field)
        .map_err(|e| e.to_string())?;
    // Non-blocking show: blocking on the sheet's dismissal deadlocks the app on macOS, and the
    // command has nothing to do after the user closes the dialog anyway.
    app.dialog()
        .message(secret.as_str())
        .title(crate::i18n::t("native.secret.title"))
        .kind(MessageDialogKind::Info)
        .parent(&window)
        .show(|_| {});
    Ok(())
}

/// Copy the encrypted active vault to a versioned sibling backup file.
#[tauri::command]
pub fn backup_vault(app: AppHandle, file_name: String) -> Result<String, String> {
    let path = resolve_vault_path(&app)?;
    let backup_path = storage::backup_vault_file(&path, &file_name).map_err(|e| e.to_string())?;
    Ok(backup_path.display().to_string())
}

/// Ask the user where to back up, then stream the vault and every file blob there as one archive.
/// Returns `None` if the dialog or the transfer was canceled. Needs no key: it copies ciphertext, so
/// a locked vault can be backed up too.
#[tauri::command]
pub async fn backup_vault_to_chosen_location(
    app: AppHandle,
    window: tauri::WebviewWindow,
    file_name: String,
) -> Result<Option<String>, String> {
    storage::validate_backup_file_name(&file_name).map_err(|e| e.to_string())?;
    let path = resolve_vault_path(&app)?;
    let destination = app
        .dialog()
        .file()
        .set_title(crate::i18n::t("native.backup.title"))
        .set_file_name(file_name.clone())
        .add_filter(crate::i18n::t("native.backup.filter"), BACKUP_EXTENSIONS)
        .blocking_save_file();

    let Some(destination) = destination else {
        return Ok(None);
    };
    let destination = destination.into_path().map_err(|e| e.to_string())?;

    run_transfer(&app, &window, TRANSFER_BACKUP, move |reporter| {
        reporter.start(&file_name, archive::blob_bytes(&path)?);
        let written = archive::write_archive(&path, &destination, &mut |n| reporter.advance(n))?;
        Ok(written.display().to_string())
    })
    .await
}

/// Request native notification permission for the reminder scheduler (§8).
#[tauri::command]
pub fn request_notification_permission() -> Result<String, String> {
    notifications::request_permission().map(str::to_string)
}

/// Send a native reminder notification. Optional module/item ids make the banner clickable so it
/// opens the matching Dashboard pane (spec §8).
#[tauri::command]
pub fn send_notification(
    app: AppHandle,
    title: String,
    body: Option<String>,
    module_id: Option<String>,
    item_id: Option<String>,
) -> Result<(), String> {
    match (module_id, item_id) {
        (Some(module_id), Some(item_id)) => {
            let app_handle = app.clone();
            notifications::send_on_click(&title, body.as_deref(), move || {
                let app_for_main = app_handle.clone();
                let module_id = module_id.clone();
                let item_id = item_id.clone();
                let _ = app_handle.run_on_main_thread(move || {
                    crate::open_dashboard_item(&app_for_main, module_id, item_id);
                });
            })
        }
        _ => notifications::send(&title, body.as_deref()),
    }
}

/// Pick and restore an encrypted backup after validating it with the backup's master password.
#[tauri::command]
pub async fn restore_vault_from_chosen_location_with_password(
    app: AppHandle,
    window: tauri::WebviewWindow,
    password: String,
    pre_restore_file_name: String,
) -> Result<Option<String>, String> {
    storage::validate_backup_file_name(&pre_restore_file_name).map_err(|e| e.to_string())?;
    let Some(backup_path) = pick_restore_path(&app)? else {
        return Ok(None);
    };
    restore_selected_vault(
        app,
        window,
        backup_path,
        pre_restore_file_name,
        move |container| envelope::unlock_with_password(container, &password),
    )
    .await
}

/// Pick and restore an encrypted backup after validating it with the backup's recovery code.
#[tauri::command]
pub async fn restore_vault_from_chosen_location_with_recovery(
    app: AppHandle,
    window: tauri::WebviewWindow,
    code: String,
    pre_restore_file_name: String,
) -> Result<Option<String>, String> {
    storage::validate_backup_file_name(&pre_restore_file_name).map_err(|e| e.to_string())?;
    let Some(backup_path) = pick_restore_path(&app)? else {
        return Ok(None);
    };
    restore_selected_vault(
        app,
        window,
        backup_path,
        pre_restore_file_name,
        move |container| envelope::unlock_with_recovery(container, &code),
    )
    .await
}

fn pick_restore_path(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let source = app
        .dialog()
        .file()
        .set_title(crate::i18n::t("native.restore.title"))
        .add_filter(crate::i18n::t("native.backup.filter"), BACKUP_EXTENSIONS)
        .blocking_pick_file();
    source
        .map(|file| file.into_path().map_err(|e| e.to_string()))
        .transpose()
}

/// Verify and unpack the backup without holding the session lock (it can take minutes), then take the
/// lock only for the final swap.
async fn restore_selected_vault<F>(
    app: AppHandle,
    window: tauri::WebviewWindow,
    backup_path: PathBuf,
    pre_restore_file_name: String,
    derive: F,
) -> Result<Option<String>, String>
where
    F: FnOnce(&crate::container::Container) -> crate::error::Result<crate::crypto::Key>
        + Send
        + 'static,
{
    let active_path = resolve_vault_path(&app)?;
    let delay = app.state::<SharedSession>().lock().unwrap().backoff_delay();
    let session_app = app.clone();
    let restored = run_transfer(&app, &window, TRANSFER_RESTORE, move |reporter| {
        if !delay.is_zero() {
            std::thread::sleep(delay);
        }
        let name = backup_path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        reporter.start(&name, std::fs::metadata(&backup_path)?.len());

        let session = session_app.state::<SharedSession>();
        let mut rejected = false;
        let prepared = session::prepare_restore(
            &active_path,
            &backup_path,
            |container| {
                let key = derive(container);
                rejected = key.is_err();
                key
            },
            &mut |n| reporter.advance(n),
        );
        let mut guard = session.lock().unwrap();
        if rejected {
            guard.record_restore_failure();
        }
        guard.commit_restore(&active_path, prepared?, &pre_restore_file_name)?;
        Ok(backup_path.display().to_string())
    })
    .await?;
    if restored.is_some() {
        // A restored vault carries no biometric wrap (§4.7); clear any stale Touch ID key on this Mac
        // so it re-enrolls fresh.
        let _ = biometric::system_store().delete_key();
    }
    Ok(restored)
}

/// Permanently erase the active vault file and lock any decrypted in-memory state.
#[tauri::command]
pub fn erase_vault(app: AppHandle, state: State<'_, SharedSession>) -> Result<(), String> {
    let path = resolve_vault_path(&app)?;
    state.lock().unwrap().lock();
    // Clear the device-local Touch ID key so no orphan remains after wiping the vault (§4.7).
    let _ = biometric::system_store().delete_key();
    storage::remove_vault_file(&path).map_err(|e| e.to_string())
}

/// Serve one `ownkeep-file://` preview request (spec §4.8).
pub fn preview_response(app: &AppHandle, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let key = app.state::<SharedSession>().lock().unwrap().files_key();
    let dir = resolve_vault_path(app)
        .map(|path| blobs::dir_for(&path))
        .unwrap_or_default();
    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok());
    file_protocol::respond(key, &dir, request.uri().path(), range)
}

/// One file added by [`import_files`]. The frontend owns its title, description and date.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedFile {
    id: String,
    file_name: String,
    mime: String,
    size: u64,
    /// The file's own last-modified time (ms since the epoch), a useful default date.
    modified_ms: Option<u64>,
}

/// A file the batch could not add, with the reason to show the user.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RejectedFile {
    file_name: String,
    error: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportOutcome {
    imported: Vec<ImportedFile>,
    too_large: Vec<String>,
    failed: Vec<RejectedFile>,
}

fn file_name_of(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn modified_ms(path: &Path) -> Option<u64> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    let since_epoch = modified.duration_since(UNIX_EPOCH).ok()?;
    u64::try_from(since_epoch.as_millis()).ok()
}

/// Let the user pick files, then encrypt each into the blob folder. Paths stay on the Rust side: the
/// WebView can only ever add what the user chose in the native dialog. `max_bytes` is the configured
/// per-file limit (`0` = none). Files finished before a cancel are kept and returned. `None` means the
/// dialog was dismissed.
#[tauri::command]
pub async fn import_files(
    app: AppHandle,
    window: tauri::WebviewWindow,
    max_bytes: u64,
) -> Result<Option<ImportOutcome>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title(crate::i18n::t("native.files.addTitle"))
        .blocking_pick_files();
    let Some(picked) = picked else {
        return Ok(None);
    };
    let paths = picked
        .into_iter()
        .map(|file| file.into_path().map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()?;

    let dir = blobs::dir_for(&resolve_vault_path(&app)?);
    let session_app = app.clone();
    let outcome = run_transfer(&app, &window, TRANSFER_IMPORT, move |reporter| {
        let session = session_app.state::<SharedSession>();
        let mut outcome = ImportOutcome::default();
        for path in paths {
            let file_name = file_name_of(&path);
            let size = match std::fs::metadata(&path) {
                Ok(metadata) => metadata.len(),
                Err(e) => {
                    outcome.failed.push(RejectedFile {
                        file_name,
                        error: e.to_string(),
                    });
                    continue;
                }
            };
            if max_bytes > 0 && size > max_bytes {
                outcome.too_large.push(file_name);
                continue;
            }

            reporter.start(&file_name, size);
            // A separate statement so the session lock is released before the import starts: the
            // progress callback below takes it again.
            let key = session.lock().unwrap().files_key();
            let imported = key.and_then(|key| {
                blobs::import_file(&key, &dir, &path, &mut |n| {
                    // Locking the vault must stop an import still using its key.
                    if !session.lock().unwrap().is_unlocked() {
                        return Err(Error::Locked);
                    }
                    reporter.advance(n)
                })
            });
            match imported {
                Ok((id, size)) => outcome.imported.push(ImportedFile {
                    id,
                    mime: blobs::mime_for_file_name(&file_name).to_string(),
                    file_name,
                    size,
                    modified_ms: modified_ms(&path),
                }),
                // Stop the batch, but report what already made it: those blobs need their metadata.
                Err(Error::Canceled | Error::Locked) => break,
                Err(e) => outcome.failed.push(RejectedFile {
                    file_name,
                    error: e.to_string(),
                }),
            }
        }
        Ok(outcome)
    })
    .await?;
    Ok(outcome)
}

/// Ask where to save a decrypted copy of a file, then stream it there. `None` if canceled.
#[tauri::command]
pub async fn export_file(
    app: AppHandle,
    window: tauri::WebviewWindow,
    id: String,
    file_name: String,
) -> Result<Option<String>, String> {
    let dir = blobs::dir_for(&resolve_vault_path(&app)?);
    let total = blobs::plain_len(&dir, &id).map_err(|e| e.to_string())?;
    let destination = app
        .dialog()
        .file()
        .set_title(crate::i18n::t("native.files.saveTitle"))
        .set_file_name(file_name.clone())
        .blocking_save_file();
    let Some(destination) = destination else {
        return Ok(None);
    };
    let destination = destination.into_path().map_err(|e| e.to_string())?;

    let session_app = app.clone();
    run_transfer(&app, &window, TRANSFER_EXPORT, move |reporter| {
        reporter.start(&file_name, total);
        let session = session_app.state::<SharedSession>();
        let key = session.lock().unwrap().files_key()?;
        blobs::export_file(&key, &dir, &id, &destination, &mut |n| {
            if !session.lock().unwrap().is_unlocked() {
                return Err(Error::Locked);
            }
            reporter.advance(n)
        })?;
        Ok(destination.display().to_string())
    })
    .await
}

/// Delete a file's blob (requires unlocked). Its metadata is removed from the vault first, so a crash
/// here only ever wastes disk space and can't leave an entry pointing at nothing.
#[tauri::command]
pub fn delete_file(
    app: AppHandle,
    state: State<'_, SharedSession>,
    id: String,
) -> Result<(), String> {
    state
        .lock()
        .unwrap()
        .files_key()
        .map_err(|e| e.to_string())?;
    let dir = blobs::dir_for(&resolve_vault_path(&app)?);
    blobs::remove(&dir, &id).map_err(|e| e.to_string())
}

/// Ask the running transfer to stop at its next chunk.
#[tauri::command]
pub fn cancel_transfer(transfers: State<'_, Transfers>) {
    transfers.cancel.store(true, Ordering::Relaxed);
}

/// Native save/open dialogs offer the current archive format and older plain-container backups.
const BACKUP_EXTENSIONS: &[&str] = &["okbak", "dat"];

const TRANSFER_IMPORT: &str = "import";
const TRANSFER_EXPORT: &str = "export";
const TRANSFER_BACKUP: &str = "backup";
const TRANSFER_RESTORE: &str = "restore";
/// Progress event for the window that started a transfer, and the event that ends it.
const TRANSFER_PROGRESS_EVENT: &str = "file-transfer-progress";
const TRANSFER_DONE_EVENT: &str = "file-transfer-done";
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

/// One transfer at a time: a backup must not race an import that is adding to the folder it's listing.
#[derive(Default)]
pub struct Transfers {
    busy: AtomicBool,
    cancel: AtomicBool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TransferProgress<'a> {
    kind: &'a str,
    name: &'a str,
    done: u64,
    total: u64,
}

/// Reports a transfer's progress to its window, and is where cancellation and activity are noticed.
struct TransferReporter {
    app: AppHandle,
    window_label: String,
    kind: &'static str,
    name: String,
    done: u64,
    total: u64,
    last_emit: Instant,
}

impl TransferReporter {
    fn emit(&mut self) {
        self.last_emit = Instant::now();
        let _ = self.app.emit_to(
            self.window_label.as_str(),
            TRANSFER_PROGRESS_EVENT,
            TransferProgress {
                kind: self.kind,
                name: &self.name,
                done: self.done,
                total: self.total,
            },
        );
    }

    /// Begin the next item of the transfer.
    fn start(&mut self, name: &str, total: u64) {
        self.name = name.to_string();
        self.done = 0;
        self.total = total;
        self.emit();
    }

    /// Record `bytes` more processed; fails with [`Error::Canceled`] once the user asks to stop.
    fn advance(&mut self, bytes: u64) -> crate::error::Result<()> {
        if self.app.state::<Transfers>().cancel.load(Ordering::Relaxed) {
            return Err(Error::Canceled);
        }
        self.done += bytes;
        if self.last_emit.elapsed() >= PROGRESS_INTERVAL {
            self.emit();
            // A long transfer is activity: don't auto-lock in the middle of it.
            self.app.state::<SharedSession>().lock().unwrap().touch();
        }
        Ok(())
    }
}

/// Run a long transfer off the async runtime, enforcing one at a time. A canceled transfer resolves to
/// `None`, like a dismissed dialog. The done event always fires so the progress UI can't get stuck.
async fn run_transfer<T, F>(
    app: &AppHandle,
    window: &tauri::WebviewWindow,
    kind: &'static str,
    work: F,
) -> Result<Option<T>, String>
where
    T: Send + 'static,
    F: FnOnce(&mut TransferReporter) -> crate::error::Result<T> + Send + 'static,
{
    let transfers = app.state::<Transfers>();
    if transfers.busy.swap(true, Ordering::SeqCst) {
        return Err(crate::i18n::t("native.files.busy"));
    }
    transfers.cancel.store(false, Ordering::SeqCst);

    let window_label = window.label().to_string();
    let mut reporter = TransferReporter {
        app: app.clone(),
        window_label: window_label.clone(),
        kind,
        name: String::new(),
        done: 0,
        total: 0,
        last_emit: Instant::now(),
    };
    let result = tauri::async_runtime::spawn_blocking(move || work(&mut reporter)).await;

    app.state::<Transfers>().busy.store(false, Ordering::SeqCst);
    let _ = app.emit_to(window_label.as_str(), TRANSFER_DONE_EVENT, ());

    match result.map_err(|e| e.to_string())? {
        Ok(value) => Ok(Some(value)),
        Err(Error::Canceled) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Quit the app after a rejected migration choice.
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
