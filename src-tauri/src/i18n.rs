//! Native UI strings (tray menu, quit dialog, file pickers, reminder notifications).
//!
//! The Rust shell reads the same locale catalogs the WebView ships (`src/i18n/locales/*.json`),
//! embedded at compile time so nothing is fetched at runtime. The frontend resolves the user's
//! language (Settings → System, or macOS) and reports it through `set_locale`; until then the shell
//! speaks English.

use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Locale {
    En,
    ZhCn,
}

impl Locale {
    /// Parse a frontend locale tag (`"en"` / `"zh-CN"`).
    pub fn parse(tag: &str) -> Option<Self> {
        match tag {
            "en" => Some(Self::En),
            "zh-CN" => Some(Self::ZhCn),
            _ => None,
        }
    }
}

const EN_JSON: &str = include_str!("../../src/i18n/locales/en.json");
const ZH_CN_JSON: &str = include_str!("../../src/i18n/locales/zh-CN.json");

static CURRENT: RwLock<Locale> = RwLock::new(Locale::En);

fn catalog(locale: Locale) -> &'static HashMap<String, String> {
    static EN: OnceLock<HashMap<String, String>> = OnceLock::new();
    static ZH_CN: OnceLock<HashMap<String, String>> = OnceLock::new();
    let (cell, json) = match locale {
        Locale::En => (&EN, EN_JSON),
        Locale::ZhCn => (&ZH_CN, ZH_CN_JSON),
    };
    cell.get_or_init(|| serde_json::from_str(json).expect("bundled locale catalog is valid JSON"))
}

pub fn set_current(locale: Locale) {
    *CURRENT.write().unwrap() = locale;
}

pub fn current() -> Locale {
    *CURRENT.read().unwrap()
}

/// Translate `key` for `locale`, filling `{name}` placeholders from `vars`. Falls back to English,
/// then to the key itself, so a missing string never panics the shell.
pub fn translate(locale: Locale, key: &str, vars: &[(&str, &str)]) -> String {
    let template = catalog(locale)
        .get(key)
        .or_else(|| catalog(Locale::En).get(key))
        .map_or(key, String::as_str);
    vars.iter()
        .fold(template.to_string(), |text, (name, value)| {
            text.replace(&format!("{{{name}}}"), value)
        })
}

/// Translate in the locale the frontend last reported.
pub fn t(key: &str) -> String {
    translate(current(), key, &[])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_frontend_locale_tags() {
        assert_eq!(Locale::parse("en"), Some(Locale::En));
        assert_eq!(Locale::parse("zh-CN"), Some(Locale::ZhCn));
        assert_eq!(Locale::parse("fr"), None);
    }

    #[test]
    fn translates_from_the_bundled_catalogs() {
        assert_eq!(translate(Locale::En, "native.tray.exit", &[]), "Exit");
        assert_eq!(translate(Locale::ZhCn, "native.tray.exit", &[]), "退出");
    }

    #[test]
    fn fills_placeholders() {
        assert_eq!(
            translate(
                Locale::ZhCn,
                "native.reminder.todoDue",
                &[("title", "喝水")]
            ),
            "待办到期：喝水"
        );
    }

    #[test]
    fn unknown_keys_fall_back_to_the_key() {
        assert_eq!(translate(Locale::ZhCn, "no.such.key", &[]), "no.such.key");
    }

    #[test]
    fn both_catalogs_have_the_same_keys() {
        let en: Vec<_> = catalog(Locale::En).keys().collect();
        let zh = catalog(Locale::ZhCn);
        assert!(en.iter().all(|key| zh.contains_key(*key)));
        assert_eq!(en.len(), zh.len());
    }

    #[test]
    fn current_locale_round_trips() {
        let previous = current();
        set_current(Locale::ZhCn);
        assert_eq!(t("native.tray.dashboard"), "仪表盘");
        set_current(previous);
    }
}
