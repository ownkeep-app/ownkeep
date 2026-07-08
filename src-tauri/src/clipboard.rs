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

    let pasteboard = MacPasteboard(NSPasteboard::generalPasteboard());

    copy_concealed_with(
        &pasteboard,
        secret,
        clear_after,
        move |delay, change_count| {
            std::thread::spawn(move || {
                std::thread::sleep(delay);
                let pasteboard = NSPasteboard::generalPasteboard();
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

    #[cfg(target_os = "macos")]
    #[test]
    fn copy_concealed_hits_the_macos_pasteboard_path() {
        // Best-effort: this should be available in the unit test harness on macOS.
        copy_concealed("keystash-test", Duration::ZERO).expect("pasteboard write succeeds");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn copy_concealed_can_schedule_a_clear_timer() {
        copy_concealed("keystash-test", Duration::from_millis(1))
            .expect("pasteboard write succeeds");
    }
}
