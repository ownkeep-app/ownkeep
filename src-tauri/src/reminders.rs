//! Reminder collection for the Rust-side scheduler (spec §8).
//!
//! The frontend still owns the module model shape, but runtime delivery belongs in the Rust core so
//! hidden/suspended WebViews cannot pause due notifications.

use chrono::{DateTime, Local, Utc};
use serde_json::Value;

const TODOS_MODULE_ID: &str = "todos";
const SUBSCRIPTIONS_MODULE_ID: &str = "subscriptions";
const DEFAULT_TODO_LEAD_MINUTES: f64 = 30.0;
const DEFAULT_SUBSCRIPTION_LEAD_DAYS: f64 = 3.0;
const MINUTE_MS: f64 = 60_000.0;
const DAY_MS: f64 = 86_400_000.0;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reminder {
    pub key: String,
    pub module_id: String,
    pub item_id: String,
    pub title: String,
    pub body: Option<String>,
}

pub fn collect_due_reminders(vault: &[u8], now: DateTime<Utc>) -> Vec<Reminder> {
    let Ok(root) = serde_json::from_slice::<Value>(vault) else {
        return Vec::new();
    };

    let mut reminders = Vec::new();
    reminders.extend(collect_todo_reminders(&root, now));
    reminders.extend(collect_subscription_reminders(&root, now));
    reminders
}

fn collect_todo_reminders(root: &Value, now: DateTime<Utc>) -> Vec<Reminder> {
    if !module_enabled(root, TODOS_MODULE_ID) {
        return Vec::new();
    }

    module_items(root, TODOS_MODULE_ID)
        .into_iter()
        .filter_map(|item| {
            if item.get("done").and_then(Value::as_bool).unwrap_or(false) {
                return None;
            }
            let due = parse_rfc3339(item.get("dueAt")?.as_str()?)?;
            let lead = item
                .get("notifyLeadMinutes")
                .and_then(Value::as_f64)
                .filter(|value| value.is_finite() && *value >= 0.0)
                .unwrap_or_else(|| {
                    module_number_setting(root, TODOS_MODULE_ID, "defaultLeadMinutes")
                        .unwrap_or(DEFAULT_TODO_LEAD_MINUTES)
                });
            if !inside_lead_window(now, due, lead * MINUTE_MS) {
                return None;
            }

            let id = item.get("id")?.as_str()?;
            let title = item.get("title")?.as_str()?.trim();
            Some(Reminder {
                key: format!("{TODOS_MODULE_ID}:{id}:due"),
                module_id: TODOS_MODULE_ID.to_string(),
                item_id: id.to_string(),
                title: format!("Todo due: {title}"),
                body: Some(format_todo_body(item, due)),
            })
        })
        .collect()
}

fn collect_subscription_reminders(root: &Value, now: DateTime<Utc>) -> Vec<Reminder> {
    if !module_enabled(root, SUBSCRIPTIONS_MODULE_ID) {
        return Vec::new();
    }

    module_items(root, SUBSCRIPTIONS_MODULE_ID)
        .into_iter()
        .filter_map(|item| {
            let due = parse_rfc3339(item.get("nextDueDate")?.as_str()?)?;
            let lead = item
                .get("notifyLeadDays")
                .and_then(Value::as_f64)
                .filter(|value| value.is_finite() && *value >= 0.0)
                .unwrap_or_else(|| {
                    module_number_setting(root, SUBSCRIPTIONS_MODULE_ID, "defaultLeadDays")
                        .unwrap_or(DEFAULT_SUBSCRIPTION_LEAD_DAYS)
                });
            if !inside_lead_window(now, due, lead * DAY_MS) {
                return None;
            }

            let id = item.get("id")?.as_str()?;
            let service = item.get("service")?.as_str()?.trim();
            Some(Reminder {
                key: format!("{SUBSCRIPTIONS_MODULE_ID}:{id}:due"),
                module_id: SUBSCRIPTIONS_MODULE_ID.to_string(),
                item_id: id.to_string(),
                title: format!("Subscription due: {service}"),
                body: Some(format_subscription_body(item, due)),
            })
        })
        .collect()
}

fn module_items<'a>(root: &'a Value, module_id: &str) -> Vec<&'a Value> {
    root.pointer(&format!("/modules/{module_id}"))
        .and_then(Value::as_array)
        .map(|items| items.iter().collect())
        .unwrap_or_default()
}

fn module_enabled(root: &Value, module_id: &str) -> bool {
    root.pointer(&format!("/settings/modules/{module_id}/enabled"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn module_number_setting(root: &Value, module_id: &str, key: &str) -> Option<f64> {
    root.pointer(&format!("/settings/modules/{module_id}/{key}"))
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value >= 0.0)
}

fn parse_rfc3339(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|date| date.with_timezone(&Utc))
}

fn inside_lead_window(now: DateTime<Utc>, due: DateTime<Utc>, lead_ms: f64) -> bool {
    now.timestamp_millis() >= due.timestamp_millis() - lead_ms.round() as i64
}

fn format_due_datetime(due: DateTime<Utc>) -> String {
    due.with_timezone(&Local)
        .format("%Y-%m-%d %H:%M")
        .to_string()
}

fn format_due_date(due: DateTime<Utc>) -> String {
    due.with_timezone(&Local).format("%Y-%m-%d").to_string()
}

fn format_todo_body(item: &Value, due: DateTime<Utc>) -> String {
    let mut parts = vec![format!("Due {}", format_due_datetime(due))];
    if let Some(priority) = item.get("priority").and_then(Value::as_str) {
        if priority != "normal" {
            parts.push(format!("{priority} priority"));
        }
    }
    if let Some(category) = item.get("category").and_then(Value::as_str) {
        if !category.trim().is_empty() {
            parts.push(category.trim().to_string());
        }
    }
    parts.join(" - ")
}

fn format_subscription_body(item: &Value, due: DateTime<Utc>) -> String {
    let amount = item.get("amount").and_then(Value::as_f64).unwrap_or(0.0);
    let currency = item
        .get("currency")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("CNY")
        .to_uppercase();
    let renew = if item
        .get("autoRenew")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        "auto-renew"
    } else {
        "manual renewal"
    };
    format!(
        "Due {} - {} {:.2} - {}",
        format_due_date(due),
        currency,
        amount,
        renew
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn now() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 7, 12, 11, 8, 0).unwrap()
    }

    #[test]
    fn collects_due_todo_with_zero_lead_after_local_wall_clock_due_time() {
        let due = Utc.with_ymd_and_hms(2026, 7, 12, 11, 5, 0).unwrap();
        let vault = format!(
            r#"{{
              "settings":{{"modules":{{"todos":{{"enabled":true}}}}}},
              "modules":{{"todos":[{{
                "id":"todo-1",
                "title":"Take break",
                "done":false,
                "dueAt":"{}",
                "notifyLeadMinutes":0,
                "priority":"normal",
                "category":"Personal"
              }}]}}
            }}"#,
            due.to_rfc3339()
        );

        let reminders = collect_due_reminders(vault.as_bytes(), now());

        assert_eq!(reminders.len(), 1);
        assert_eq!(reminders[0].key, "todos:todo-1:due");
        assert_eq!(reminders[0].module_id, "todos");
        assert_eq!(reminders[0].item_id, "todo-1");
        assert_eq!(reminders[0].title, "Todo due: Take break");
    }

    #[test]
    fn skips_todos_before_lead_window_and_when_module_is_disabled() {
        let due = Utc.with_ymd_and_hms(2026, 7, 12, 11, 9, 0).unwrap();
        let vault = format!(
            r#"{{
              "settings":{{"modules":{{"todos":{{"enabled":true}}}}}},
              "modules":{{"todos":[{{
                "id":"todo-1",
                "title":"Soon",
                "done":false,
                "dueAt":"{}",
                "notifyLeadMinutes":0,
                "priority":"normal",
                "category":"Personal"
              }}]}}
            }}"#,
            due.to_rfc3339()
        );
        assert!(collect_due_reminders(vault.as_bytes(), now()).is_empty());

        let disabled = vault.replace(r#""enabled":true"#, r#""enabled":false"#);
        assert!(collect_due_reminders(disabled.as_bytes(), now()).is_empty());
    }

    #[test]
    fn collects_subscriptions_with_default_lead_days() {
        let due = Utc.with_ymd_and_hms(2026, 7, 13, 11, 8, 0).unwrap();
        let vault = format!(
            r#"{{
              "settings":{{"modules":{{"subscriptions":{{"enabled":true,"defaultLeadDays":1}}}}}},
              "modules":{{"subscriptions":[{{
                "id":"sub-1",
                "service":"Hosting",
                "nextDueDate":"{}",
                "notifyLeadDays":-1,
                "amount":9.5,
                "currency":"usd",
                "autoRenew":true
              }}]}}
            }}"#,
            due.to_rfc3339()
        );

        let reminders = collect_due_reminders(vault.as_bytes(), now());

        assert_eq!(reminders.len(), 1);
        assert_eq!(reminders[0].key, "subscriptions:sub-1:due");
        assert_eq!(reminders[0].module_id, "subscriptions");
        assert_eq!(reminders[0].item_id, "sub-1");
        assert_eq!(reminders[0].title, "Subscription due: Hosting");
    }
}
