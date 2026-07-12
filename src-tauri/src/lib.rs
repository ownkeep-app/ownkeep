mod biometric;
mod clipboard;
mod commands;
mod container;
mod crypto;
mod envelope;
mod error;
mod notifications;
mod recovery;
mod secrets;
mod session;
mod storage;

use tauri::{Emitter, Manager};
#[cfg(desktop)]
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

/// Whether the main launcher window should hide when it loses focus (command bar only).
pub struct MainWindowBehavior(pub std::sync::Mutex<bool>);

/// Module id the Dashboard should select after being opened from the command bar.
pub struct PendingDashboardModule(pub std::sync::Mutex<Option<String>>);

#[cfg(desktop)]
use tauri::{
    menu::{MenuBuilder, MenuItem, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle,
};

/// Tray menu items whose accelerators track the configured global / Dashboard hotkeys.
#[cfg(desktop)]
struct TrayMenuItems {
    search: MenuItem<tauri::Wry>,
    dashboard: MenuItem<tauri::Wry>,
}

#[cfg(desktop)]
use std::str::FromStr;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[cfg(desktop)]
const DEFAULT_GLOBAL_HOTKEY: &str = "Cmd+Shift+Space";
#[cfg(desktop)]
const DEFAULT_DASHBOARD_HOTKEY: &str = "Cmd+Shift+D";
#[cfg(desktop)]
const TRAY_TITLE: &str = "KS";

/// Hide a labeled window if it exists.
#[cfg(desktop)]
fn hide_labeled(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.hide();
    }
}

/// Show and focus one surface while hiding the other — command bar and Dashboard never share the screen (§7.6).
#[cfg(desktop)]
fn show_exclusive(app: &AppHandle, label: &str) {
    let other = if label == "main" {
        "dashboard"
    } else {
        "main"
    };
    hide_labeled(app, other);
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Show the main launcher window and give it keyboard focus.
#[cfg(desktop)]
fn show_and_focus_main(app: &AppHandle) {
    show_exclusive(app, "main");
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
            show_exclusive(app, "main");
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
            show_exclusive(app, "dashboard");
        }
    }
}

/// Confirm before the traffic-light close button quits the app (accidental clicks).
#[cfg(desktop)]
fn confirm_close_window(window: &tauri::Window) {
    let Some(webview) = window
        .app_handle()
        .get_webview_window(window.label())
    else {
        return;
    };

    // Blur-to-hide would dismiss the launcher under the sheet — pause it for the confirm.
    let blur = window.state::<MainWindowBehavior>();
    let previous_blur = *blur.0.lock().unwrap();
    *blur.0.lock().unwrap() = false;

    let app = window.app_handle().clone();

    app.dialog()
        .message("This will quit keystash completely (command bar and Dashboard). Reminder notifications will stop until you open it again.")
        .title("Quit keystash?")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Quit".into(),
            "Cancel".into(),
        ))
        .parent(&webview)
        .show(move |confirmed| {
            if confirmed {
                app.exit(0);
                return;
            }
            if let Some(behavior) = app.try_state::<MainWindowBehavior>() {
                *behavior.0.lock().unwrap() = previous_blur;
            }
        });
}

/// Register the configured launcher + Dashboard hotkeys. Settings can call the same helper at
/// runtime; both shortcut strings are parsed before unregistering the previous bindings.
#[cfg(desktop)]
fn register_desktop_hotkeys(
    app: &AppHandle,
    global_hotkey: &str,
    dashboard_hotkey: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let toggle_launcher = Shortcut::from_str(global_hotkey)?;
    let toggle_dash = Shortcut::from_str(dashboard_hotkey)?;
    let shortcuts = app.global_shortcut();
    shortcuts.unregister_all()?;
    shortcuts.on_shortcut(toggle_launcher, move |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            toggle_main_window(app);
        }
    })?;
    shortcuts.on_shortcut(toggle_dash, move |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            toggle_dashboard_window(app);
        }
    })?;
    Ok(())
}

/// Wire the desktop shell: tray icon, no-Dock activation policy, and global toggle hotkeys.
#[cfg(desktop)]
fn setup_desktop(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // Build the tray *before* switching to Accessory so macOS registers the status item while the
    // process still looks like a normal app (helps on Tahoe / crowded menu bars).
    let search = MenuItemBuilder::with_id("search", "Search ...")
        .accelerator(DEFAULT_GLOBAL_HOTKEY)
        .build(app)?;
    let dashboard = MenuItemBuilder::with_id("dashboard", "Dashboard")
        .accelerator(DEFAULT_DASHBOARD_HOTKEY)
        .build(app)?;
    let exit = MenuItemBuilder::with_id("exit", "Exit").build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&search)
        .item(&dashboard)
        .separator()
        .item(&exit)
        .build()?;

    // macOS menu-bar icons must be a template silhouette (black + transparent). The colorful app
    // icon is invisible / washed out in the status area — especially on Tahoe with a full bar.
    let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon.png"))
        .expect("tray-icon.png embeds");

    let tray = TrayIconBuilder::with_id("main-tray")
        .tooltip("keystash")
        // Local unsigned macOS builds can occasionally fail to render a template image in a
        // crowded menu bar. A short title keeps the status item visible and clickable.
        .title(TRAY_TITLE)
        .icon(tray_icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "search" => show_and_focus_main(app),
            "dashboard" => toggle_dashboard_window(app),
            "exit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    // Must manage the TrayIcon — Tauri removes the status item when the last ref is dropped.
    app.manage(tray);
    app.manage(TrayMenuItems {
        search,
        dashboard,
    });

    // Menu-bar app with no Dock icon — keystash is summoned by its hotkey, not clicked in the Dock.
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    // Global hotkeys (need Accessibility perm): defaults come from the encrypted settings model.
    register_desktop_hotkeys(
        app.handle(),
        DEFAULT_GLOBAL_HOTKEY,
        DEFAULT_DASHBOARD_HOTKEY,
    )?;

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
            .plugin(tauri_plugin_global_shortcut::Builder::new().build())
            // Open login/website URLs in the system browser (WebView window.open is blocked).
            .plugin(tauri_plugin_opener::init());
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(std::sync::Mutex::new(session::Session::new(Some(
            session::DEFAULT_AUTO_LOCK,
        ))))
        // Blur-to-hide stays off until the compact command bar enables it — otherwise startup
        // focus churn (tray/hotkeys) hides onboarding / lock before React can resize.
        .manage(MainWindowBehavior(std::sync::Mutex::new(false)))
        .manage(PendingDashboardModule(std::sync::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::vault_exists,
            commands::vault_path,
            commands::vault_incompatibility,
            commands::is_unlocked,
            commands::create_vault,
            commands::unlock,
            commands::unlock_recovery,
            commands::lock,
            commands::set_auto_lock,
            commands::change_master,
            commands::regenerate_recovery,
            commands::biometric_status,
            commands::enable_biometric_unlock,
            commands::disable_biometric_unlock,
            commands::reenroll_biometric_unlock,
            commands::unlock_biometric,
            commands::get_vault,
            commands::save_vault,
            commands::copy_secret,
            commands::reveal_secret,
            commands::backup_vault,
            commands::backup_vault_to_chosen_location,
            commands::request_notification_permission,
            commands::send_notification,
            commands::restore_vault_from_chosen_location_with_password,
            commands::restore_vault_from_chosen_location_with_recovery,
            commands::erase_vault,
            commands::quit_app,
            set_hotkeys,
            set_main_window_blur_dismiss,
            show_command_bar,
            show_dashboard,
            take_dashboard_module,
        ])
        .setup(|app| {
            spawn_auto_lock(app.handle().clone());
            #[cfg(desktop)]
            {
                setup_desktop(app)?;
                // Cold start always surfaces the main window so first-run onboarding and the
                // lock screen are visible (tray/hotkey still work after the user hides it).
                show_and_focus_main(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                // Traffic-light close: confirm first, then hide (tray keeps the app alive).
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    #[cfg(desktop)]
                    confirm_close_window(window);
                }
                // Launcher behavior: hide the main window when it loses focus (Esc is handled in the UI).
                // Scoped to "main" so the Dashboard isn't hidden on blur.
                // Disabled while auth/onboarding screens are shown — resize and form entry need focus.
                tauri::WindowEvent::Focused(false) if window.label() == "main" => {
                    let blur_dismiss = window.state::<MainWindowBehavior>();
                    let dismiss = *blur_dismiss.0.lock().unwrap();
                    if dismiss {
                        let _ = window.hide();
                    }
                }
                _ => {}
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

/// Show and focus the command bar (Dashboard → Search bridge, §7.6).
#[tauri::command]
fn show_command_bar(app: tauri::AppHandle) {
    #[cfg(desktop)]
    {
        show_and_focus_main(&app);
    }
}

/// Show and focus the Dashboard, optionally selecting a module pane (command-bar bridge, §7.6).
#[tauri::command]
fn show_dashboard(
    app: tauri::AppHandle,
    state: tauri::State<'_, PendingDashboardModule>,
    module_id: Option<String>,
) {
    if let Some(id) = module_id {
        *state.0.lock().unwrap() = Some(id.clone());
        let _ = app.emit("dashboard-open-module", id);
    }
    #[cfg(desktop)]
    {
        show_exclusive(&app, "dashboard");
    }
}

/// Consume a pending Dashboard module selection (set by `show_dashboard`).
#[tauri::command]
fn take_dashboard_module(
    state: tauri::State<'_, PendingDashboardModule>,
) -> Option<String> {
    state.0.lock().unwrap().take()
}

/// Apply the hotkeys persisted in the encrypted vault settings.
#[tauri::command]
fn set_hotkeys(
    app: tauri::AppHandle,
    global_hotkey: String,
    dashboard_hotkey: String,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        register_desktop_hotkeys(&app, &global_hotkey, &dashboard_hotkey)
            .map_err(|e| e.to_string())?;
        // Keep tray accelerator labels in sync with Settings rebinds.
        if let Some(items) = app.try_state::<TrayMenuItems>() {
            items
                .search
                .set_accelerator(Some(global_hotkey.as_str()))
                .map_err(|e| e.to_string())?;
            items
                .dashboard
                .set_accelerator(Some(dashboard_hotkey.as_str()))
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, global_hotkey, dashboard_hotkey);
        Ok(())
    }
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
    #[cfg(desktop)]
    use super::*;

    #[test]
    fn rust_test_harness_is_wired() {
        assert_eq!(env!("CARGO_PKG_NAME"), "keystash");
    }

    #[test]
    #[cfg(desktop)]
    fn default_hotkeys_parse_with_the_plugin_parser() {
        assert!(Shortcut::from_str(DEFAULT_GLOBAL_HOTKEY).is_ok());
        assert!(Shortcut::from_str(DEFAULT_DASHBOARD_HOTKEY).is_ok());
    }
}
