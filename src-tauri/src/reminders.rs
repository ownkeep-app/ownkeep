//! Reminder collection for the Rust-side scheduler (spec §8).
//!
//! The frontend still owns the module model shape, but runtime delivery belongs in the Rust core so
//! hidden/suspended WebViews cannot pause due notifications. Auto-renew subscriptions are also
//! rolled forward here so invoice dates advance even when the Subscriptions UI is closed.

use chrono::{DateTime, Days, Local, Months, NaiveDate, NaiveTime, SecondsFormat, TimeZone, Utc};
use serde_json::{json, Value};

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReminderTick {
    pub reminders: Vec<Reminder>,
    /// Updated vault JSON when auto-renew subscriptions were rolled forward.
    pub vault: Option<Vec<u8>>,
}

/// Collect due reminders and roll auto-renew `nextDueDate` values that have been reached.
pub fn process_reminders(vault: &[u8], now: DateTime<Utc>) -> ReminderTick {
    let Ok(mut root) = serde_json::from_slice::<Value>(vault) else {
        return ReminderTick {
            reminders: Vec::new(),
            vault: None,
        };
    };

    let mut reminders = Vec::new();
    reminders.extend(collect_todo_reminders(&root, now));
    let rolled = renew_due_auto_subscriptions(&mut root, now, &mut reminders);
    reminders.extend(collect_manual_subscription_reminders(&root, now));

    ReminderTick {
        reminders,
        vault: rolled.then(|| serde_json::to_vec(&root).unwrap_or_else(|_| vault.to_vec())),
    }
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
            let due_raw = item.get("dueAt")?.as_str()?;
            let due = parse_rfc3339(due_raw)?;
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
                // Include the due instant so a reschedule can notify again once.
                key: format!("{TODOS_MODULE_ID}:{id}:due:{due_raw}"),
                module_id: TODOS_MODULE_ID.to_string(),
                item_id: id.to_string(),
                title: format!("Todo due: {title}"),
                body: Some(format_todo_body(item, due)),
            })
        })
        .collect()
}

/// Auto-renew: when the invoice day is reached, emit a renewal reminder and advance `nextDueDate`.
fn renew_due_auto_subscriptions(
    root: &mut Value,
    now: DateTime<Utc>,
    reminders: &mut Vec<Reminder>,
) -> bool {
    if !module_enabled(root, SUBSCRIPTIONS_MODULE_ID) {
        return false;
    }

    let Some(items) = root
        .pointer_mut(&format!("/modules/{SUBSCRIPTIONS_MODULE_ID}"))
        .and_then(Value::as_array_mut)
    else {
        return false;
    };

    let mut changed = false;
    let updated_at = now.to_rfc3339_opts(SecondsFormat::Millis, true);

    for item in items.iter_mut() {
        if !item
            .get("autoRenew")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            continue;
        }
        let Some(due_raw) = item.get("nextDueDate").and_then(Value::as_str).map(str::to_string) else {
            continue;
        };
        let Some(due) = parse_rfc3339(&due_raw) else {
            continue;
        };
        if !invoice_day_reached(now, due) {
            continue;
        }

        let Some(id) = item.get("id").and_then(Value::as_str).map(str::to_string) else {
            continue;
        };
        let service = item
            .get("service")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();

        reminders.push(Reminder {
            key: format!("{SUBSCRIPTIONS_MODULE_ID}:{id}:due:{due_raw}"),
            module_id: SUBSCRIPTIONS_MODULE_ID.to_string(),
            item_id: id,
            title: format!(
                "Your subscription on {service} has been automatically renewed. Expect invoice to come"
            ),
            body: Some(format_subscription_body(item, due)),
        });

        let cycle = item.get("cycle").and_then(Value::as_str).unwrap_or("monthly");
        let custom_days = item
            .get("customIntervalDays")
            .and_then(Value::as_i64)
            .filter(|days| *days > 0);
        if let Some(next) = next_auto_invoice_date(due, now, cycle, custom_days) {
            if next != due_raw {
                item["nextDueDate"] = json!(next);
                item["updatedAt"] = json!(updated_at);
                changed = true;
            }
        }
    }

    changed
}

fn collect_manual_subscription_reminders(root: &Value, now: DateTime<Utc>) -> Vec<Reminder> {
    if !module_enabled(root, SUBSCRIPTIONS_MODULE_ID) {
        return Vec::new();
    }

    module_items(root, SUBSCRIPTIONS_MODULE_ID)
        .into_iter()
        .filter_map(|item| {
            if item
                .get("autoRenew")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                return None;
            }
            let due_raw = item.get("nextDueDate")?.as_str()?;
            let due = parse_rfc3339(due_raw)?;
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
                key: format!("{SUBSCRIPTIONS_MODULE_ID}:{id}:due:{due_raw}"),
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

fn local_calendar_day(value: DateTime<Utc>) -> NaiveDate {
    value.with_timezone(&Local).date_naive()
}

fn invoice_day_reached(now: DateTime<Utc>, due: DateTime<Utc>) -> bool {
    local_calendar_day(now) >= local_calendar_day(due)
}

fn next_auto_invoice_date(
    due: DateTime<Utc>,
    now: DateTime<Utc>,
    cycle: &str,
    custom_days: Option<i64>,
) -> Option<String> {
    let start = local_calendar_day(due);
    let today = local_calendar_day(now);
    for periods in 1u32..=1_200 {
        let advanced = add_billing_cycles(start, cycle, custom_days, periods)?;
        if advanced <= start {
            return None;
        }
        if advanced > today {
            return Some(local_end_of_day_iso(advanced));
        }
    }
    None
}

fn add_billing_cycles(
    start: NaiveDate,
    cycle: &str,
    custom_days: Option<i64>,
    periods: u32,
) -> Option<NaiveDate> {
    match cycle {
        "weekly" => start.checked_add_days(Days::new(7 * u64::from(periods))),
        "monthly" => start.checked_add_months(Months::new(periods)),
        "yearly" => start.checked_add_months(Months::new(periods.saturating_mul(12))),
        "custom" => {
            let days = custom_days.filter(|value| *value > 0)?;
            start.checked_add_days(Days::new(
                days.checked_mul(i64::from(periods))?
                    .try_into()
                    .ok()?,
            ))
        }
        _ => None,
    }
}

fn local_end_of_day_iso(date: NaiveDate) -> String {
    let naive = date.and_time(NaiveTime::from_hms_opt(23, 59, 59).unwrap());
    let local = Local
        .from_local_datetime(&naive)
        .single()
        .or_else(|| Local.from_local_datetime(&naive).earliest())
        .unwrap_or_else(|| Local.from_utc_datetime(&naive));
    local
        .with_timezone(&Utc)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
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

        let reminders = process_reminders(vault.as_bytes(), now()).reminders;

        assert_eq!(reminders.len(), 1);
        assert_eq!(
            reminders[0].key,
            format!("todos:todo-1:due:{}", due.to_rfc3339())
        );
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
        assert!(process_reminders(vault.as_bytes(), now()).reminders.is_empty());

        let disabled = vault.replace(r#""enabled":true"#, r#""enabled":false"#);
        assert!(process_reminders(disabled.as_bytes(), now()).reminders.is_empty());
    }

    #[test]
    fn renews_auto_subscription_on_invoice_day_and_rolls_next_due() {
        let due = Local
            .with_ymd_and_hms(2026, 7, 12, 23, 59, 59)
            .single()
            .unwrap()
            .with_timezone(&Utc);
        let due_raw = due.to_rfc3339_opts(SecondsFormat::Millis, true);
        let vault = format!(
            r#"{{
              "settings":{{"modules":{{"subscriptions":{{"enabled":true}}}}}},
              "modules":{{"subscriptions":[{{
                "id":"sub-1",
                "service":"YouTube",
                "nextDueDate":"{due_raw}",
                "notifyLeadDays":3,
                "amount":9.5,
                "currency":"usd",
                "autoRenew":true,
                "cycle":"monthly",
                "customIntervalDays":null,
                "updatedAt":"2026-06-12T00:00:00.000Z"
              }}]}}
            }}"#
        );

        let tick = process_reminders(vault.as_bytes(), now());

        assert_eq!(tick.reminders.len(), 1);
        assert_eq!(
            tick.reminders[0].title,
            "Your subscription on YouTube has been automatically renewed. Expect invoice to come"
        );
        assert_eq!(
            tick.reminders[0].key,
            format!("subscriptions:sub-1:due:{due_raw}")
        );

        let updated = serde_json::from_slice::<Value>(tick.vault.as_ref().unwrap()).unwrap();
        let next = updated["modules"]["subscriptions"][0]["nextDueDate"]
            .as_str()
            .unwrap();
        let next_due = parse_rfc3339(next).unwrap();
        assert!(local_calendar_day(next_due) > local_calendar_day(now()));
        assert_eq!(
            local_calendar_day(next_due),
            NaiveDate::from_ymd_opt(2026, 8, 12).unwrap()
        );
    }

    #[test]
    fn collects_manual_subscriptions_with_default_lead_days() {
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
                "autoRenew":false
              }}]}}
            }}"#,
            due.to_rfc3339()
        );

        let reminders = process_reminders(vault.as_bytes(), now()).reminders;

        assert_eq!(reminders.len(), 1);
        assert_eq!(
            reminders[0].key,
            format!("subscriptions:sub-1:due:{}", due.to_rfc3339())
        );
        assert_eq!(reminders[0].module_id, "subscriptions");
        assert_eq!(reminders[0].item_id, "sub-1");
        assert_eq!(reminders[0].title, "Subscription due: Hosting");
    }

    #[test]
    fn skips_future_auto_subscriptions_until_invoice_day() {
        let due = Local
            .with_ymd_and_hms(2026, 7, 20, 23, 59, 59)
            .single()
            .unwrap()
            .with_timezone(&Utc);
        let vault = format!(
            r#"{{
              "settings":{{"modules":{{"subscriptions":{{"enabled":true}}}}}},
              "modules":{{"subscriptions":[{{
                "id":"sub-1",
                "service":"YouTube",
                "nextDueDate":"{}",
                "autoRenew":true,
                "cycle":"monthly",
                "customIntervalDays":null
              }}]}}
            }}"#,
            due.to_rfc3339_opts(SecondsFormat::Millis, true)
        );

        let tick = process_reminders(vault.as_bytes(), now());
        assert!(tick.reminders.is_empty());
        assert!(tick.vault.is_none());
    }
}
