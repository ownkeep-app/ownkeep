#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
