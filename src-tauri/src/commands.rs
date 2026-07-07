//! Tauri command layer for the vault (spec §4).
//!
//! Thin wrappers over [`Session`]: resolve the vault path, apply failed-attempt backoff, and map
//! errors to strings for the frontend. Secrets (the DEK and the decrypted vault) never cross this
//! boundary — the only secret returned is the one-time Emergency Kit on create/regenerate, which
//! the user must see once in order to store it (the §4.6-sanctioned exception).

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

use crate::crypto::Argon2Params;
use crate::recovery::EmergencyKit;
use crate::session::Session;
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
    state.lock().unwrap().vault_json().map_err(|e| e.to_string())
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
