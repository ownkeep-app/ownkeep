//! Tauri command layer for the vault (spec §4).
//!
//! Thin wrappers over [`Session`]: resolve the vault path, apply failed-attempt backoff, and map
//! errors to strings for the frontend. Secrets (the DEK and the decrypted vault) never cross this
//! boundary — the only secret returned is the one-time Emergency Kit on create/regenerate, which
//! the user must see once in order to store it (the §4.6-sanctioned exception).

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::plugin::PermissionState;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_notification::NotificationExt;

use crate::crypto::Argon2Params;
use crate::recovery::EmergencyKit;
use crate::session::{self, Session};
use crate::storage;

/// Managed session state.
pub type SharedSession = Mutex<Session>;

/// Resolve the vault file path inside the OS app-data directory.
fn vault_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(storage::VAULT_FILE))
}

/// Whether a vault already exists (drives onboarding vs. unlock on launch).
#[tauri::command]
pub fn vault_exists(app: AppHandle) -> Result<bool, String> {
    Ok(storage::vault_exists(&vault_path(&app)?))
}

/// Pre-unlock compatibility check (spec §11.2 step 1): returns the incompatibility message if this
/// build is too old to read the on-disk container format, else `null`. Read at launch so a too-new
/// vault is refused before any password entry or key derivation.
#[tauri::command]
pub fn vault_incompatibility(app: AppHandle) -> Result<Option<String>, String> {
    Ok(storage::incompatibility_message(&vault_path(&app)?))
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
    let path = vault_path(&app)?;
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
    let path = vault_path(&app)?;
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
    let path = vault_path(&app)?;
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
    let path = vault_path(&app)?;
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
    let path = vault_path(&app)?;
    state
        .lock()
        .unwrap()
        .regenerate_recovery(&path)
        .map_err(|e| e.to_string())
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
    let path = vault_path(&app)?;
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
        .title("keystash secret")
        .kind(MessageDialogKind::Info)
        .parent(&window)
        .show(|_| {});
    Ok(())
}

/// Copy the encrypted active vault to a versioned sibling backup file.
#[tauri::command]
pub fn backup_vault(app: AppHandle, file_name: String) -> Result<String, String> {
    let path = vault_path(&app)?;
    let backup_path = storage::backup_vault_file(&path, &file_name).map_err(|e| e.to_string())?;
    Ok(backup_path.display().to_string())
}

/// Ask the user where to back up the encrypted active vault, then copy it there.
#[tauri::command]
pub async fn backup_vault_to_chosen_location(
    app: AppHandle,
    file_name: String,
) -> Result<Option<String>, String> {
    storage::validate_backup_file_name(&file_name).map_err(|e| e.to_string())?;
    let path = vault_path(&app)?;
    let destination = app
        .dialog()
        .file()
        .set_title("Back up keystash vault")
        .set_file_name(file_name)
        .add_filter("Keystash vault backup", &["dat"])
        .blocking_save_file();

    let Some(destination) = destination else {
        return Ok(None);
    };

    let backup_path = destination.into_path().map_err(|e| e.to_string())?;
    let backup_path =
        storage::backup_vault_to_path(&path, &backup_path).map_err(|e| e.to_string())?;
    Ok(Some(backup_path.display().to_string()))
}

/// Request native notification permission for the reminder scheduler (§8).
#[tauri::command]
pub fn request_notification_permission(app: AppHandle) -> Result<String, String> {
    app.notification()
        .request_permission()
        .map(permission_state_label)
        .map_err(|e| e.to_string())
}

/// Send a native reminder notification. The scheduler decides de-dupe; Rust only talks to macOS.
#[tauri::command]
pub fn send_notification(
    app: AppHandle,
    title: String,
    body: Option<String>,
) -> Result<(), String> {
    let mut builder = app.notification().builder().title(title);
    if let Some(body) = body {
        builder = builder.body(body);
    }
    builder.show().map_err(|e| e.to_string())
}

fn permission_state_label(state: PermissionState) -> String {
    match state {
        PermissionState::Granted => "granted",
        PermissionState::Denied => "denied",
        PermissionState::Prompt | PermissionState::PromptWithRationale => "prompt",
    }
    .to_string()
}

/// Pick and restore an encrypted backup after validating it with the backup's master password.
#[tauri::command]
pub async fn restore_vault_from_chosen_location_with_password(
    app: AppHandle,
    password: String,
    pre_restore_file_name: String,
) -> Result<Option<String>, String> {
    storage::validate_backup_file_name(&pre_restore_file_name).map_err(|e| e.to_string())?;
    let Some(backup_path) = pick_restore_path(&app)? else {
        return Ok(None);
    };
    restore_selected_vault(
        app,
        backup_path,
        move |session, active_path, backup_path| {
            session.restore_password(active_path, backup_path, &password, &pre_restore_file_name)
        },
    )
    .await
}

/// Pick and restore an encrypted backup after validating it with the backup's recovery code.
#[tauri::command]
pub async fn restore_vault_from_chosen_location_with_recovery(
    app: AppHandle,
    code: String,
    pre_restore_file_name: String,
) -> Result<Option<String>, String> {
    storage::validate_backup_file_name(&pre_restore_file_name).map_err(|e| e.to_string())?;
    let Some(backup_path) = pick_restore_path(&app)? else {
        return Ok(None);
    };
    restore_selected_vault(
        app,
        backup_path,
        move |session, active_path, backup_path| {
            session.restore_recovery(active_path, backup_path, &code, &pre_restore_file_name)
        },
    )
    .await
}

fn pick_restore_path(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let source = app
        .dialog()
        .file()
        .set_title("Restore keystash vault")
        .add_filter("Keystash vault backup", &["dat"])
        .blocking_pick_file();
    source
        .map(|file| file.into_path().map_err(|e| e.to_string()))
        .transpose()
}

async fn restore_selected_vault<F>(
    app: AppHandle,
    backup_path: PathBuf,
    restore: F,
) -> Result<Option<String>, String>
where
    F: FnOnce(&mut Session, &std::path::Path, &std::path::Path) -> crate::error::Result<()>
        + Send
        + 'static,
{
    let active_path = vault_path(&app)?;
    let restored_path = backup_path.display().to_string();
    let delay = {
        let session = app.state::<SharedSession>();
        let guard = session.lock().unwrap();
        guard.backoff_delay()
    };
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if !delay.is_zero() {
            std::thread::sleep(delay);
        }
        let state = app.state::<SharedSession>();
        let mut guard = state.lock().unwrap();
        restore(&mut guard, &active_path, &backup_path).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(Some(restored_path))
}

/// Permanently erase the active vault file and lock any decrypted in-memory state.
#[tauri::command]
pub fn erase_vault(app: AppHandle, state: State<'_, SharedSession>) -> Result<(), String> {
    let path = vault_path(&app)?;
    state.lock().unwrap().lock();
    storage::remove_vault_file(&path).map_err(|e| e.to_string())
}

/// Quit the app after a rejected migration choice.
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
