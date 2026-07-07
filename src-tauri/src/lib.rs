mod commands;
mod container;
mod crypto;
mod envelope;
mod error;
mod recovery;
mod session;
mod storage;

use tauri::Manager;

/// Whether the main launcher window should hide when it loses focus (command bar only).
pub struct MainWindowBehavior(pub std::sync::Mutex<bool>);

#[cfg(desktop)]
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle,
};

/// Show the main launcher window and give it keyboard focus.
#[cfg(desktop)]
fn show_and_focus_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Toggle the launcher: hide it if it is already frontmost, otherwise show + focus it.
#[cfg(desktop)]
fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let is_frontmost =
            window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false);
        if is_frontmost {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

/// Toggle the persistent Dashboard window (Cmd+Shift+D). Unlike the launcher it is not hidden on
/// blur — it stays open until dismissed.
#[cfg(desktop)]
fn toggle_dashboard_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("dashboard") {
        let is_frontmost =
            window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false);
        if is_frontmost {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

/// Wire the desktop shell: no-Dock activation policy, tray icon, and the global toggle hotkeys.
#[cfg(desktop)]
fn setup_desktop(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::{
        Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
    };

    // Menu-bar app with no Dock icon — keystash is summoned by its hotkey, not clicked in the Dock.
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    // Tray icon keeps the process (and the future notification scheduler) alive while hidden.
    let show = MenuItemBuilder::with_id("show", "Show keystash").build(app)?;
    let dashboard = MenuItemBuilder::with_id("dashboard", "Open Dashboard").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit keystash").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&show, &dashboard, &quit])
        .build()?;
    TrayIconBuilder::with_id("main-tray")
        .tooltip("keystash")
        .icon(
            app.default_window_icon()
                .cloned()
                .expect("bundled default window icon"),
        )
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_and_focus_main(app),
            "dashboard" => toggle_dashboard_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    // Global hotkeys (need Accessibility perm): Cmd+Shift+Space = launcher, Cmd+Shift+D = Dashboard.
    let toggle_launcher = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space);
    app.global_shortcut()
        .on_shortcut(toggle_launcher, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                toggle_main_window(app);
            }
        })?;
    let toggle_dash = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyD);
    app.global_shortcut()
        .on_shortcut(toggle_dash, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                toggle_dashboard_window(app);
            }
        })?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // `single-instance` must be registered first so a second launch focuses the running window
    // instead of spawning a duplicate. Both of these plugins are desktop-only.
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                show_and_focus_main(app);
            }))
            .plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(std::sync::Mutex::new(session::Session::new(
            session::DEFAULT_AUTO_LOCK,
        )))
        .manage(MainWindowBehavior(std::sync::Mutex::new(true)))
        .invoke_handler(tauri::generate_handler![
            commands::vault_exists,
            commands::is_unlocked,
            commands::create_vault,
            commands::unlock,
            commands::unlock_recovery,
            commands::lock,
            commands::change_master,
            commands::regenerate_recovery,
            commands::get_vault,
            commands::save_vault,
            commands::backup_vault,
            commands::backup_vault_to_chosen_location,
            commands::erase_vault,
            commands::quit_app,
            set_main_window_blur_dismiss,
        ])
        .setup(|app| {
            spawn_auto_lock(app.handle().clone());
            #[cfg(desktop)]
            setup_desktop(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Launcher behavior: hide the main window when it loses focus (Esc is handled in the UI).
            // Scoped to "main" so later windows (e.g. the Phase 2 Dashboard) aren't hidden on blur.
            // Disabled while auth/onboarding screens are shown — resize and form entry need focus.
            if window.label() == "main" {
                if let tauri::WindowEvent::Focused(false) = event {
                    let blur_dismiss = window.state::<MainWindowBehavior>();
                    let dismiss = *blur_dismiss.0.lock().unwrap();
                    if dismiss {
                        let _ = window.hide();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Enable or disable blur-to-hide on the main launcher window (compact command bar only).
#[tauri::command]
fn set_main_window_blur_dismiss(state: tauri::State<'_, MainWindowBehavior>, enabled: bool) {
    *state.0.lock().unwrap() = enabled;
}

/// Periodically wipe keys if the vault has been idle past its auto-lock timeout (spec §4.3).
/// A dedicated background thread keeps this independent of window/UI activity.
fn spawn_auto_lock(handle: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(15));
        let state = handle.state::<commands::SharedSession>();
        let mut session = state.lock().unwrap();
        if session.is_idle_expired(std::time::Instant::now()) {
            session.lock();
        }
    });
}

#[cfg(test)]
mod tests {
    #[test]
    fn rust_test_harness_is_wired() {
        assert_eq!(env!("CARGO_PKG_NAME"), "keystash");
    }
}
