//! Desktop reminder notifications (spec §8).
//!
//! On modern macOS, `tauri-plugin-notification` uses the deprecated
//! `NSUserNotificationCenter` path (via notify-rust defaults), which often
//! delivers nothing — especially under `tauri dev` without a real `.app`
//! bundle. Prefer `UNUserNotificationCenter` when a bundle id exists; otherwise
//! fall back to `osascript` so reminders still surface during development.

#[cfg(target_os = "macos")]
use notify_rust::Notification;

/// Ask macOS for alert permission when the process is a real `.app` bundle.
/// Bare `tauri dev` binaries have no bundle id; those always report granted and
/// rely on the osascript fallback in [`send`].
pub fn request_permission() -> Result<&'static str, String> {
    #[cfg(target_os = "macos")]
    {
        match notify_rust::request_auth_blocking() {
            Ok(true) => Ok("granted"),
            Ok(false) => Ok("denied"),
            // No bundle id / unsigned bare binary — osascript path still works.
            Err(_) => Ok("granted"),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok("granted")
    }
}

/// Deliver a desktop notification. Returns an error only when every strategy fails.
pub fn send(title: &str, body: Option<&str>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if send_user_notification(title, body).is_ok() {
            return Ok(());
        }
        return send_osascript(title, body.unwrap_or(""));
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (title, body);
        Err("notifications are only implemented on macOS".into())
    }
}

#[cfg(target_os = "macos")]
fn send_user_notification(title: &str, body: Option<&str>) -> Result<(), String> {
    // Ensure permission before showing (no-op / Err when not bundled).
    match notify_rust::request_auth_blocking() {
        Ok(false) => return Err("notification permission denied".into()),
        Ok(true) | Err(_) => {}
    }

    let mut notification = Notification::new();
    notification.summary(title);
    if let Some(body) = body {
        notification.body(body);
    }
    notification
        .show()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn send_osascript(title: &str, body: &str) -> Result<(), String> {
    let script = format!(
        "display notification \"{}\" with title \"{}\"",
        escape_applescript(body),
        escape_applescript(title),
    );
    let status = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .status()
        .map_err(|error| error.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("osascript exited with {status}"))
    }
}

#[cfg(target_os = "macos")]
fn escape_applescript(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "macos")]
    #[test]
    fn escapes_applescript_quotes_and_backslashes() {
        assert_eq!(super::escape_applescript(r#"a"b"#), r#"a\"b"#);
        assert_eq!(super::escape_applescript(r#"a\b"#), r#"a\\b"#);
    }
}
