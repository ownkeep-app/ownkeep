//! The `ownkeep-file://` preview scheme (spec §4.8): serves decrypted file ranges to the WebView.
//!
//! The custom scheme, rather than IPC, is what lets `<video>` and `<audio>` seek through a file of any
//! size: the browser asks for byte ranges and only those chunks are decrypted. Pure over its inputs so
//! the whole request path is unit-tested without Tauri.
//!
//! URLs carry the blob id and its stored content type: `ownkeep-file://localhost/<id>/video/mp4`.

use std::io::ErrorKind;
use std::path::Path;

use tauri::http::{header, Response, StatusCode};

use crate::blobs;
use crate::crypto::Key;
use crate::error::{Error, Result};

pub const SCHEME: &str = "ownkeep-file";

/// Most bytes returned for one range request; the browser simply asks again for the next part.
const MAX_RANGE_RESPONSE: u64 = 4 << 20;
/// Most bytes returned to a request with no range, which must be held in memory. Images and PDFs
/// (which don't use ranges) above this aren't previewed; the frontend mirrors it as `MAX_WHOLE_PREVIEW_BYTES`.
const MAX_WHOLE_RESPONSE: u64 = 512 << 20;
/// An SVG opened directly must not be able to run script.
const SVG_MIME: &str = "image/svg+xml";
const SVG_CSP: &str = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

#[derive(Debug, PartialEq, Eq)]
enum RangeRequest {
    Whole,
    Partial { start: u64, end: u64 },
    Unsatisfiable,
}

/// Parse a `Range` header against a file of `total` bytes. `end` is inclusive. Multi-range requests
/// are answered with the whole file, which HTTP allows and browsers don't send for media.
fn parse_range(value: Option<&str>, total: u64) -> RangeRequest {
    let Some(spec) = value.and_then(|v| v.strip_prefix("bytes=")) else {
        return RangeRequest::Whole;
    };
    let Some((start, end)) = spec.split_once('-') else {
        return RangeRequest::Whole;
    };
    if spec.contains(',') {
        return RangeRequest::Whole;
    }
    let range = match (start.trim().parse::<u64>(), end.trim().parse::<u64>()) {
        // bytes=a-b, clamped to the end of the file
        (Ok(start), Ok(end)) if start <= end => (start, end.min(total.saturating_sub(1))),
        // bytes=a-
        (Ok(start), Err(_)) if end.trim().is_empty() => (start, total.saturating_sub(1)),
        // bytes=-n, the last n bytes
        (Err(_), Ok(suffix)) if start.trim().is_empty() && suffix > 0 => {
            (total.saturating_sub(suffix), total.saturating_sub(1))
        }
        _ => return RangeRequest::Unsatisfiable,
    };
    if total == 0 || range.0 >= total {
        return RangeRequest::Unsatisfiable;
    }
    RangeRequest::Partial {
        start: range.0,
        end: range.1,
    }
}

/// Split `/<id>/<type>/<subtype>` into a valid blob id and a content type that may be displayed.
fn parse_path(path: &str) -> Option<(&str, &str)> {
    let (id, mime) = path.strip_prefix('/')?.split_once('/')?;
    (blobs::validate_id(id).is_ok() && blobs::is_previewable_mime(mime)).then_some((id, mime))
}

fn status(code: StatusCode) -> Response<Vec<u8>> {
    let mut response = Response::new(Vec::new());
    *response.status_mut() = code;
    response
}

fn error_status(error: &Error) -> StatusCode {
    match error {
        Error::Io(e) if e.kind() == ErrorKind::NotFound => StatusCode::NOT_FOUND,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

fn file_response(mime: &str, code: StatusCode, body: Vec<u8>) -> Response<Vec<u8>> {
    let mut builder = Response::builder()
        .status(code)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_LENGTH, body.len())
        .header(header::ACCEPT_RANGES, "bytes")
        // Decrypted content must not outlive the session in a WebView cache.
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff");
    if mime == SVG_MIME {
        builder = builder.header(header::CONTENT_SECURITY_POLICY, SVG_CSP);
    }
    builder
        .body(body)
        .unwrap_or_else(|_| status(StatusCode::INTERNAL_SERVER_ERROR))
}

/// Answer one preview request. `key` is the session's file key, or an error while locked.
pub fn respond(key: Result<Key>, dir: &Path, path: &str, range: Option<&str>) -> Response<Vec<u8>> {
    let Some((id, mime)) = parse_path(path) else {
        return status(StatusCode::BAD_REQUEST);
    };
    let Ok(key) = key else {
        return status(StatusCode::FORBIDDEN);
    };
    let total = match blobs::plain_len(dir, id) {
        Ok(total) => total,
        Err(e) => return status(error_status(&e)),
    };

    match parse_range(range, total) {
        RangeRequest::Whole if total > MAX_WHOLE_RESPONSE => status(StatusCode::PAYLOAD_TOO_LARGE),
        RangeRequest::Whole => match blobs::read_range(&key, dir, id, 0, total) {
            Ok(body) => file_response(mime, StatusCode::OK, body),
            Err(e) => status(error_status(&e)),
        },
        RangeRequest::Partial { start, end } => {
            let len = (end - start + 1).min(MAX_RANGE_RESPONSE);
            match blobs::read_range(&key, dir, id, start, len) {
                Ok(body) => {
                    let mut response = file_response(mime, StatusCode::PARTIAL_CONTENT, body);
                    let content_range = format!("bytes {start}-{}/{total}", start + len - 1);
                    if let Ok(value) = content_range.parse() {
                        response.headers_mut().insert(header::CONTENT_RANGE, value);
                    }
                    response
                }
                Err(e) => status(error_status(&e)),
            }
        }
        RangeRequest::Unsatisfiable => {
            let mut response = status(StatusCode::RANGE_NOT_SATISFIABLE);
            if let Ok(value) = format!("bytes */{total}").parse() {
                response.headers_mut().insert(header::CONTENT_RANGE, value);
            }
            response
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blobs::no_progress;
    use crate::storage::unique_temp_dir;
    use std::fs;
    use std::path::PathBuf;
    use zeroize::Zeroizing;

    fn key() -> Result<Key> {
        Ok(Zeroizing::new([5u8; 32]))
    }

    fn stored(plain: &[u8]) -> (PathBuf, String) {
        let dir = unique_temp_dir();
        let source = dir.join("source");
        fs::write(&source, plain).unwrap();
        let blobs_dir = dir.join("blobs");
        let (id, _) =
            blobs::import_file(&key().unwrap(), &blobs_dir, &source, &mut no_progress()).unwrap();
        (blobs_dir, id)
    }

    fn sample(len: usize) -> Vec<u8> {
        (0..len).map(|i| (i % 251) as u8).collect()
    }

    fn get(dir: &Path, id: &str, mime: &str, range: Option<&str>) -> Response<Vec<u8>> {
        respond(key(), dir, &format!("/{id}/{mime}"), range)
    }

    fn header_value(response: &Response<Vec<u8>>, name: header::HeaderName) -> &str {
        response.headers().get(name).unwrap().to_str().unwrap()
    }

    #[test]
    fn parses_every_range_form() {
        use RangeRequest::*;
        assert_eq!(parse_range(None, 100), Whole);
        assert_eq!(parse_range(Some("items=0-1"), 100), Whole);
        assert_eq!(parse_range(Some("bytes=5"), 100), Whole);
        assert_eq!(parse_range(Some("bytes=0-1,5-6"), 100), Whole);
        assert_eq!(
            parse_range(Some("bytes=0-1"), 100),
            Partial { start: 0, end: 1 }
        );
        assert_eq!(
            parse_range(Some("bytes=10-"), 100),
            Partial { start: 10, end: 99 }
        );
        assert_eq!(
            parse_range(Some("bytes=-10"), 100),
            Partial { start: 90, end: 99 }
        );
        assert_eq!(
            parse_range(Some("bytes=-1000"), 100),
            Partial { start: 0, end: 99 }
        );
        assert_eq!(
            parse_range(Some("bytes=90-5000"), 100),
            Partial { start: 90, end: 99 }
        );
        assert_eq!(parse_range(Some("bytes=100-"), 100), Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=100-200"), 100), Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=5-1"), 100), Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=-0"), 100), Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=a-b"), 100), Unsatisfiable);
        assert_eq!(parse_range(Some("bytes=0-"), 0), Unsatisfiable);
    }

    #[test]
    fn serves_a_whole_file_with_safe_headers() {
        let plain = sample(1000);
        let (dir, id) = stored(&plain);
        let response = get(&dir, &id, "application/pdf", None);

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.body(), &plain);
        assert_eq!(
            header_value(&response, header::CONTENT_TYPE),
            "application/pdf"
        );
        assert_eq!(header_value(&response, header::CACHE_CONTROL), "no-store");
        assert_eq!(
            header_value(&response, header::X_CONTENT_TYPE_OPTIONS),
            "nosniff"
        );
        assert_eq!(header_value(&response, header::ACCEPT_RANGES), "bytes");
        assert_eq!(header_value(&response, header::CONTENT_LENGTH), "1000");
    }

    #[test]
    fn serves_the_probe_range_media_players_start_with() {
        let plain = sample(1000);
        let (dir, id) = stored(&plain);
        let response = get(&dir, &id, "video/mp4", Some("bytes=0-1"));

        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.body(), &plain[..2]);
        assert_eq!(
            header_value(&response, header::CONTENT_RANGE),
            "bytes 0-1/1000"
        );
        assert_eq!(header_value(&response, header::CONTENT_LENGTH), "2");
    }

    #[test]
    fn caps_an_open_ended_range_and_reports_what_it_sent() {
        let plain = sample((MAX_RANGE_RESPONSE + 10) as usize);
        let (dir, id) = stored(&plain);
        let response = get(&dir, &id, "video/mp4", Some("bytes=5-"));

        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.body().len() as u64, MAX_RANGE_RESPONSE);
        assert_eq!(
            header_value(&response, header::CONTENT_RANGE),
            format!("bytes 5-{}/{}", MAX_RANGE_RESPONSE + 4, plain.len())
        );
    }

    #[test]
    fn serves_an_empty_file_and_refuses_ranges_into_it() {
        let (dir, id) = stored(&[]);
        let whole = get(&dir, &id, "image/png", None);
        assert_eq!(whole.status(), StatusCode::OK);
        assert!(whole.body().is_empty());

        let ranged = get(&dir, &id, "image/png", Some("bytes=0-"));
        assert_eq!(ranged.status(), StatusCode::RANGE_NOT_SATISFIABLE);
        assert_eq!(header_value(&ranged, header::CONTENT_RANGE), "bytes */0");
    }

    #[test]
    fn a_locked_vault_serves_nothing() {
        let (dir, id) = stored(&sample(10));
        let response = respond(Err(Error::Locked), &dir, &format!("/{id}/image/png"), None);
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert!(response.body().is_empty());
    }

    #[test]
    fn refuses_bad_ids_and_types_that_could_execute() {
        let (dir, id) = stored(&sample(10));
        for path in [
            String::new(),
            "no-leading-slash/image/png".to_string(),
            format!("/{id}"),
            format!("/{id}/text/html"),
            format!("/{id}/application/octet-stream"),
            "/../vault/image/png".to_string(),
        ] {
            let response = respond(key(), &dir, &path, None);
            assert_eq!(response.status(), StatusCode::BAD_REQUEST, "{path}");
        }
    }

    #[test]
    fn a_missing_blob_is_not_found() {
        let dir = unique_temp_dir();
        assert_eq!(
            get(&dir, "missing", "image/png", None).status(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn corrupt_data_is_an_error_not_garbage() {
        let (dir, id) = stored(&sample(10));
        let wrong: Result<Key> = Ok(Zeroizing::new([6u8; 32]));
        let path = format!("/{id}/image/png");
        let response = respond(wrong, &dir, &path, None);
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        assert!(response.body().is_empty());

        let wrong: Result<Key> = Ok(Zeroizing::new([6u8; 32]));
        let ranged = respond(wrong, &dir, &path, Some("bytes=0-1"));
        assert_eq!(ranged.status(), StatusCode::INTERNAL_SERVER_ERROR);

        fs::write(dir.join(format!("{id}.blob")), b"junk").unwrap();
        assert_eq!(
            get(&dir, &id, "image/png", None).status(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
    }

    #[test]
    fn an_svg_cannot_run_script_if_opened_directly() {
        let (dir, id) = stored(b"<svg xmlns='http://www.w3.org/2000/svg'/>");
        let response = get(&dir, &id, SVG_MIME, None);
        assert_eq!(
            header_value(&response, header::CONTENT_SECURITY_POLICY),
            SVG_CSP
        );
        let png = get(&dir, &id, "image/png", None);
        assert!(png.headers().get(header::CONTENT_SECURITY_POLICY).is_none());
    }

    #[test]
    fn a_large_file_is_refused_whole_but_still_served_by_range() {
        // A sparse-looking blob: only the header matters for the size check.
        let dir = unique_temp_dir();
        let id = "big";
        let mut header = vec![0u8; 40];
        header[..4].copy_from_slice(b"OKBL");
        header[4] = 1;
        header[8..12].copy_from_slice(&(1u32 << 20).to_le_bytes());
        header[12..20].copy_from_slice(&(MAX_WHOLE_RESPONSE + 1).to_le_bytes());
        fs::write(dir.join(format!("{id}.blob")), &header).unwrap();

        assert_eq!(
            get(&dir, id, "application/pdf", None).status(),
            StatusCode::PAYLOAD_TOO_LARGE
        );
        // It got past the size gate to the (absent) ciphertext, so this isn't the 413 path.
        assert_eq!(
            get(&dir, id, "video/mp4", Some("bytes=0-1")).status(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
    }
}
