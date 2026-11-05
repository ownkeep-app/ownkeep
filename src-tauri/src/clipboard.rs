//! Concealed pasteboard writes for secret copies (spec §4.3).

use std::time::Duration;

trait Pasteboard {
    fn clear_contents(&self);
    fn set_string_for_type(&self, value: &str, pasteboard_type: &str) -> bool;
    fn change_count(&self) -> isize;
}

fn copy_concealed_with<P: Pasteboard>(
    pasteboard: &P,
    secret: &str,
    clear_after: Duration,
    on_clear: impl FnOnce(Duration, isize) + Send + 'static,
) -> Result<(), String> {
    pasteboard.clear_contents();

    if !pasteboard.set_string_for_type(secret, "public.utf8-plain-text") {
        return Err("failed to write secret to pasteboard".to_string());
    }

    // Mark as concealed/transient so clipboard-history tools ignore it.
    pasteboard.set_string_for_type("", "org.nspasteboard.ConcealedType");
    pasteboard.set_string_for_type("", "org.nspasteboard.TransientType");

    if !clear_after.is_zero() {
        let change_count = pasteboard.change_count();
        on_clear(clear_after, change_count);
    }

    Ok(())
}

#[cfg(target_os = "macos")]
pub fn copy_concealed(secret: &str, clear_after: Duration) -> Result<(), String> {
    copy_concealed_on(
        objc2_app_kit::NSPasteboard::generalPasteboard,
        secret,
        clear_after,
    )
}

/// The AppKit write, taking how to reach the pasteboard because the clear timer needs it again on its
/// own thread (`NSPasteboard` can't be sent there). Tests pass a private pasteboard, so running them
/// never touches the clipboard of whoever runs them.
#[cfg(target_os = "macos")]
fn copy_concealed_on<G>(
    get_pasteboard: G,
    secret: &str,
    clear_after: Duration,
) -> Result<(), String>
where
    G: Fn() -> objc2::rc::Retained<objc2_app_kit::NSPasteboard> + Send + 'static,
{
    use objc2_app_kit::NSPasteboard;
    use objc2_foundation::NSString;

    struct MacPasteboard(objc2::rc::Retained<NSPasteboard>);

    impl Pasteboard for MacPasteboard {
        fn clear_contents(&self) {
            self.0.clearContents();
        }

        fn set_string_for_type(&self, value: &str, pasteboard_type: &str) -> bool {
            let string = NSString::from_str(value);
            let pasteboard_type = NSString::from_str(pasteboard_type);
            self.0.setString_forType(&string, &pasteboard_type)
        }

        fn change_count(&self) -> isize {
            self.0.changeCount()
        }
    }

    let pasteboard = MacPasteboard(get_pasteboard());

    copy_concealed_with(
        &pasteboard,
        secret,
        clear_after,
        move |delay, change_count| {
            std::thread::spawn(move || {
                std::thread::sleep(delay);
                let pasteboard = get_pasteboard();
                if pasteboard.changeCount() == change_count {
                    pasteboard.clearContents();
                }
            });
        },
    )
}

#[cfg(not(target_os = "macos"))]
pub fn copy_concealed(_secret: &str, _clear_after: Duration) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[derive(Default)]
    struct FakePasteboard {
        cleared: Arc<Mutex<u32>>,
        writes: Arc<Mutex<Vec<(String, String)>>>,
        change_count: Arc<Mutex<isize>>,
        allow_write: bool,
    }

    impl Pasteboard for FakePasteboard {
        fn clear_contents(&self) {
            *self.cleared.lock().unwrap() += 1;
        }

        fn set_string_for_type(&self, value: &str, pasteboard_type: &str) -> bool {
            self.writes
                .lock()
                .unwrap()
                .push((value.to_string(), pasteboard_type.to_string()));
            self.allow_write
        }

        fn change_count(&self) -> isize {
            *self.change_count.lock().unwrap()
        }
    }

    #[test]
    fn copy_concealed_marks_concealed_and_transient() {
        let fake = FakePasteboard {
            allow_write: true,
            ..Default::default()
        };

        copy_concealed_with(&fake, "secret", Duration::ZERO, |_d, _c| {}).expect("copy succeeds");

        assert_eq!(*fake.cleared.lock().unwrap(), 1);
        let writes = fake.writes.lock().unwrap();
        assert!(writes.iter().any(|(_, t)| t == "public.utf8-plain-text"));
        assert!(writes
            .iter()
            .any(|(_, t)| t == "org.nspasteboard.ConcealedType"));
        assert!(writes
            .iter()
            .any(|(_, t)| t == "org.nspasteboard.TransientType"));
    }

    #[test]
    fn copy_concealed_fails_when_plaintext_write_fails() {
        let fake = FakePasteboard {
            allow_write: false,
            ..Default::default()
        };

        let err = copy_concealed_with(&fake, "secret", Duration::ZERO, |_d, _c| {})
            .expect_err("must fail");
        assert!(err.contains("failed to write secret"));
    }

    #[test]
    fn copy_concealed_schedules_clear_when_delay_is_set() {
        let fake = FakePasteboard {
            allow_write: true,
            ..Default::default()
        };
        *fake.change_count.lock().unwrap() = 7;

        let scheduled = Arc::new(Mutex::new(None::<(Duration, isize)>));
        let scheduled_clone = Arc::clone(&scheduled);

        copy_concealed_with(&fake, "secret", Duration::from_secs(5), move |d, c| {
            *scheduled_clone.lock().unwrap() = Some((d, c));
        })
        .expect("copy succeeds");

        assert_eq!(
            *scheduled.lock().unwrap(),
            Some((Duration::from_secs(5), 7))
        );
    }

    /// The real AppKit path on a private pasteboard: never the system clipboard, and not shared with
    /// tests running in parallel, whose `clearContents` would make another test's write fail.
    #[cfg(target_os = "macos")]
    mod appkit {
        use super::super::copy_concealed_on;
        use objc2::rc::Retained;
        use objc2_app_kit::NSPasteboard;
        use objc2_foundation::NSString;
        use std::time::{Duration, Instant};

        const PLAIN_TEXT: &str = "public.utf8-plain-text";
        const CLEAR_TIMEOUT: Duration = Duration::from_secs(5);

        struct PrivatePasteboard(String);

        impl PrivatePasteboard {
            fn new() -> Self {
                Self(NSPasteboard::pasteboardWithUniqueName().name().to_string())
            }

            fn getter(&self) -> impl Fn() -> Retained<NSPasteboard> + Send + 'static {
                let name = self.0.clone();
                move || NSPasteboard::pasteboardWithName(&NSString::from_str(&name))
            }

            fn read(&self, pasteboard_type: &str) -> Option<String> {
                (self.getter())()
                    .stringForType(&NSString::from_str(pasteboard_type))
                    .map(|value| value.to_string())
            }

            fn wait_until_cleared(&self) -> bool {
                let started = Instant::now();
                while started.elapsed() < CLEAR_TIMEOUT {
                    if self.read(PLAIN_TEXT).is_none() {
                        return true;
                    }
                    std::thread::sleep(Duration::from_millis(5));
                }
                false
            }
        }

        impl Drop for PrivatePasteboard {
            fn drop(&mut self) {
                let pasteboard = (self.getter())();
                // objc2-app-kit doesn't expose this method. Private pasteboards otherwise last until logout.
                let _: () = unsafe { objc2::msg_send![&*pasteboard, releaseGlobally] };
            }
        }

        #[test]
        fn writes_the_secret_marked_concealed_and_transient() {
            let board = PrivatePasteboard::new();

            copy_concealed_on(board.getter(), "ownkeep-test", Duration::ZERO).unwrap();

            assert_eq!(board.read(PLAIN_TEXT).as_deref(), Some("ownkeep-test"));
            assert!(board.read("org.nspasteboard.ConcealedType").is_some());
            assert!(board.read("org.nspasteboard.TransientType").is_some());
        }

        #[test]
        fn clears_the_secret_after_the_delay() {
            let board = PrivatePasteboard::new();

            copy_concealed_on(board.getter(), "ownkeep-test", Duration::from_millis(1)).unwrap();

            assert!(board.wait_until_cleared(), "secret was never cleared");
        }

        #[test]
        fn leaves_anything_copied_after_the_secret_alone() {
            let board = PrivatePasteboard::new();

            copy_concealed_on(board.getter(), "ownkeep-test", Duration::from_millis(100)).unwrap();
            let pasteboard = (board.getter())();
            pasteboard.clearContents();
            pasteboard.setString_forType(
                &NSString::from_str("copied later"),
                &NSString::from_str(PLAIN_TEXT),
            );

            std::thread::sleep(Duration::from_millis(300));
            assert_eq!(board.read(PLAIN_TEXT).as_deref(), Some("copied later"));
        }
    }
}
