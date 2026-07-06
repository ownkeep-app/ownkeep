#[cfg(desktop)]
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Manager,
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

/// Wire the desktop shell: no-Dock activation policy, tray icon, and the global toggle hotkey.
#[cfg(desktop)]
fn setup_desktop(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

    // Menu-bar app with no Dock icon — keystash is summoned by its hotkey, not clicked in the Dock.
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    // Tray icon keeps the process (and the future notification scheduler) alive while hidden.
    let show = MenuItemBuilder::with_id("show", "Show keystash").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit keystash").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;
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
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    // Global hotkey: Cmd+Shift+Space toggles the launcher from any app (needs Accessibility perm).
    let toggle = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::Space);
    app.global_shortcut()
        .on_shortcut(toggle, move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                toggle_main_window(app);
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
        .setup(|app| {
            #[cfg(desktop)]
            setup_desktop(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Launcher behavior: hide the main window when it loses focus (Esc is handled in the UI).
            // Scoped to "main" so later windows (e.g. the Phase 2 Dashboard) aren't hidden on blur.
            if window.label() == "main" {
                if let tauri::WindowEvent::Focused(false) = event {
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    #[test]
    fn rust_test_harness_is_wired() {
        assert_eq!(env!("CARGO_PKG_NAME"), "keystash");
    }
}
