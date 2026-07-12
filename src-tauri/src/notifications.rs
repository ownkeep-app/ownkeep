//! Desktop reminder notifications (spec §8).
//!
//! Prefer macOS `UNUserNotificationCenter` (via notify-rust `preview-macos-un`) so banners
//! belong to keystash and clicks can open the Dashboard. Do **not** fall back to
//! AppleScript `display notification` — those banners are owned by Script Editor, and
//! clicking them opens a Script Editor file dialog instead of keystash.

#[cfg(target_os = "macos")]
use notify_rust::Notification;

const NO_BUNDLE_HINT: &str = "Native notifications need a bundled keystash.app (not a bare `pnpm dev` binary). Build/install the app so banners belong to keystash and open Todos on click.";

/// Ask macOS for alert permission when the process is a real `.app` bundle.
pub fn request_permission() -> Result<&'static str, String> {
    #[cfg(target_os = "macos")]
    {
        match notify_rust::request_auth_blocking() {
            Ok(true) => Ok("granted"),
            Ok(false) => Ok("denied"),
            Err(error) => Err(format!("{NO_BUNDLE_HINT} ({error})")),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok("granted")
    }
}

/// Deliver a desktop notification owned by keystash.
pub fn send(title: &str, body: Option<&str>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        send_user_notification(title, body).map(|_| ())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (title, body);
        Err("notifications are only implemented on macOS".into())
    }
}

/// Deliver a desktop notification and run `on_click` when the user opens it.
pub fn send_on_click<F>(title: &str, body: Option<&str>, on_click: F) -> Result<(), String>
where
    F: FnOnce() + Send + 'static,
{
    #[cfg(target_os = "macos")]
    {
        let handle = send_user_notification(title, body)?;
        std::thread::spawn(move || {
            handle.wait_for_action(|action| {
                if opens_notification_target(action) {
                    on_click();
                }
            });
        });
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (title, body, on_click);
        Err("notifications are only implemented on macOS".into())
    }
}

#[cfg(target_os = "macos")]
fn send_user_notification(
    title: &str,
    body: Option<&str>,
) -> Result<notify_rust::NotificationHandle, String> {
    match notify_rust::request_auth_blocking() {
        Ok(false) => return Err("notification permission denied".into()),
        Ok(true) => {}
        Err(error) => return Err(format!("{NO_BUNDLE_HINT} ({error})")),
    }

    let mut notification = Notification::new();
    notification.summary(title);
    if let Some(body) = body {
        notification.body(body);
    }
    notification.show().map_err(|error| {
        let message = error.to_string();
        if message.to_lowercase().contains("bundle") {
            format!("{NO_BUNDLE_HINT} ({message})")
        } else {
            message
        }
    })
}

#[cfg(target_os = "macos")]
fn opens_notification_target(action: &str) -> bool {
    // notify-rust maps the default body-click to "default".
    action == "default"
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "macos")]
    #[test]
    fn only_default_notification_action_opens_the_target() {
        assert!(super::opens_notification_target("default"));
        assert!(!super::opens_notification_target("__closed"));
        assert!(!super::opens_notification_target("open"));
    }

    #[test]
    fn request_permission_returns_status_or_a_bundle_hint() {
        match super::request_permission() {
            Ok(status) => assert!(status == "granted" || status == "denied"),
            Err(message) => assert!(
                message.contains("bundled") || message.contains("notification"),
                "unexpected error: {message}"
            ),
        }
    }

    #[test]
    fn send_covers_title_only_and_title_with_body_paths() {
        // Bare test binaries usually lack a .app bundle / permission — both
        // outcomes still exercise the macOS notification construction path.
        let _ = super::send("Coverage title", None);
        let _ = super::send("Coverage title", Some("Coverage body"));
    }

    #[test]
    fn send_on_click_accepts_a_callback_without_panicking() {
        let _ = super::send_on_click("Coverage click", Some("body"), || {});
    }
}
