//! Secret-field registry and redaction helpers (spec §3.4/§4.5).
//!
//! The frontend owns the module registry shape, but Rust owns decrypted secret values. This small
//! registry is the Rust-side allow-list for fields that must never appear in the default projection
//! and may only be copied through the concealed pasteboard path.

use std::collections::HashMap;

use serde_json::Value;

use crate::error::{Error, Result};

pub const REDACTED_SECRET: &str = "__OWNKEEP_REDACTED_SECRET__";
const PASSWORDS_MODULE_ID: &str = "passwords";
const PASSWORD_FIELD: &str = "password";
const DEFAULT_CLIPBOARD_CLEAR_SECONDS: u64 = 30;

#[derive(Clone, Copy)]
struct SecretField {
    module_id: &'static str,
    field: &'static str,
}

const SECRET_FIELDS: &[SecretField] = &[SecretField {
    module_id: PASSWORDS_MODULE_ID,
    field: PASSWORD_FIELD,
}];

pub fn redact_projection(vault: &[u8]) -> Result<String> {
    let mut value = parse_model(vault)?;
    redact_value(&mut value);
    serde_json::to_string(&value)
        .map_err(|e| Error::Format(format!("vault projection could not be serialized: {e}")))
}

pub fn merge_redacted_secrets(current: &[u8], incoming: &str) -> Result<Vec<u8>> {
    let current_value = parse_model(current)?;
    let mut incoming_value = parse_model(incoming.as_bytes())?;

    for secret in SECRET_FIELDS {
        merge_module_secret(&current_value, &mut incoming_value, secret);
    }

    serde_json::to_vec(&incoming_value)
        .map_err(|e| Error::Format(format!("vault model could not be serialized: {e}")))
}

pub fn find_secret(vault: &[u8], id: &str, field: &str) -> Result<String> {
    let Some(secret) = SECRET_FIELDS.iter().find(|secret| secret.field == field) else {
        return Err(Error::Format("secret field is not registered".to_string()));
    };
    let value = parse_model(vault)?;
    let Some(items) = module_items(&value, secret.module_id) else {
        return Err(Error::Format("secret module is not an array".to_string()));
    };
    for item in items {
        let Some(object) = item.as_object() else {
            continue;
        };
        if object.get("id").and_then(Value::as_str) == Some(id) {
            return object
                .get(field)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .ok_or_else(|| Error::Format("secret value is missing".to_string()));
        }
    }
    Err(Error::Format("secret item was not found".to_string()))
}

pub fn clipboard_clear_seconds(vault: &[u8]) -> u64 {
    parse_model(vault)
        .ok()
        .and_then(|value| {
            value
                .pointer("/settings/clipboardClearSeconds")
                .and_then(Value::as_u64)
        })
        .unwrap_or(DEFAULT_CLIPBOARD_CLEAR_SECONDS)
}

fn parse_model(bytes: &[u8]) -> Result<Value> {
    serde_json::from_slice(bytes)
        .map_err(|e| Error::Format(format!("vault model is not valid JSON: {e}")))
}

fn redact_value(value: &mut Value) {
    for secret in SECRET_FIELDS {
        if let Some(items) = module_items_mut(value, secret.module_id) {
            for item in items {
                if let Some(object) = item.as_object_mut() {
                    if object.contains_key(secret.field) {
                        object.insert(
                            secret.field.to_string(),
                            Value::String(REDACTED_SECRET.to_string()),
                        );
                    }
                }
            }
        }
    }
}

fn merge_module_secret(current: &Value, incoming: &mut Value, secret: &SecretField) {
    let Some(current_items) = module_items(current, secret.module_id) else {
        return;
    };
    let Some(incoming_items) = module_items_mut(incoming, secret.module_id) else {
        return;
    };

    let current_by_id: HashMap<&str, &Value> = current_items
        .iter()
        .filter_map(|item| {
            let object = item.as_object()?;
            let id = object.get("id")?.as_str()?;
            let value = object.get(secret.field)?;
            Some((id, value))
        })
        .collect();

    for item in incoming_items {
        let Some(object) = item.as_object_mut() else {
            continue;
        };
        let Some(id) = object.get("id").and_then(Value::as_str) else {
            continue;
        };
        let should_restore = object
            .get(secret.field)
            .and_then(Value::as_str)
            .map(|value| value == REDACTED_SECRET)
            .unwrap_or(true);
        if should_restore {
            if let Some(existing) = current_by_id.get(id) {
                object.insert(secret.field.to_string(), (*existing).clone());
            }
        }
    }
}

fn module_items<'a>(value: &'a Value, module_id: &str) -> Option<&'a Vec<Value>> {
    value
        .pointer(&format!("/modules/{module_id}"))
        .and_then(Value::as_array)
}

fn module_items_mut<'a>(value: &'a mut Value, module_id: &str) -> Option<&'a mut Vec<Value>> {
    value
        .pointer_mut(&format!("/modules/{module_id}"))
        .and_then(Value::as_array_mut)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MODEL: &str = r#"{
      "settings": {"clipboardClearSeconds": 12},
      "modules": {
        "passwords": [
          {"id":"github","name":"GitHub","username":"sha","password":"secret","updatedAt":"now"}
        ]
      }
    }"#;

    #[test]
    fn redacts_registered_secret_fields() {
        let projection = redact_projection(MODEL.as_bytes()).unwrap();
        assert!(!projection.contains("secret"));
        assert!(projection.contains(REDACTED_SECRET));
    }

    #[test]
    fn finds_registered_secret_by_id_and_field() {
        assert_eq!(
            find_secret(MODEL.as_bytes(), "github", "password").unwrap(),
            "secret"
        );
        assert!(find_secret(MODEL.as_bytes(), "github", "username").is_err());
        assert!(find_secret(MODEL.as_bytes(), "missing", "password").is_err());
    }

    #[test]
    fn merge_preserves_redacted_existing_secrets_but_allows_new_plaintext() {
        let incoming = r#"{
          "settings": {"clipboardClearSeconds": 9},
          "modules": {
            "passwords": [
              {"id":"github","name":"GitHub","password":"__OWNKEEP_REDACTED_SECRET__"},
              {"id":"new","name":"New","password":"fresh"}
            ]
          }
        }"#;
        let merged = merge_redacted_secrets(MODEL.as_bytes(), incoming).unwrap();
        let value: Value = serde_json::from_slice(&merged).unwrap();
        let items = value
            .pointer("/modules/passwords")
            .unwrap()
            .as_array()
            .unwrap();
        assert_eq!(items[0].get("password").unwrap(), "secret");
        assert_eq!(items[1].get("password").unwrap(), "fresh");
    }

    #[test]
    fn reads_clipboard_clear_seconds_or_default() {
        assert_eq!(clipboard_clear_seconds(MODEL.as_bytes()), 12);
        assert_eq!(
            clipboard_clear_seconds(br#"{}"#),
            DEFAULT_CLIPBOARD_CLEAR_SECONDS
        );
    }
}
