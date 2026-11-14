//! The embedded Zola site.

use crate::{header, text, wall};
use wasmkeep_sdk::actors::Response;
use wasmkeep_sdk::http::IncomingRequest;

/// One file of `public/`, as `build.rs` embedded it.
pub struct Asset {
    /// `/how-it-works/index.html`
    pub path: &'static str,
    pub content_type: &'static str,
    /// A strong ETag, quoted.
    pub etag: &'static str,
    /// What Zola's `cachebust` puts in `?h=` for this file.
    pub fingerprint: &'static str,
    pub body: &'static [u8],
}

include!(concat!(env!("OUT_DIR"), "/site.rs"));

/// A year: for an asset asked for with its current fingerprint.
const IMMUTABLE: &str = "public, max-age=31536000, immutable";
/// Pages: revalidated (cheaply, with the ETag) after five minutes.
const PAGE: &str = "public, max-age=300";
/// Other files without a fingerprint.
const FILE: &str = "public, max-age=3600";

fn find(path: &str) -> Option<&'static Asset> {
    ASSETS
        .binary_search_by(|a| a.path.cmp(path))
        .ok()
        .map(|i| &ASSETS[i])
}

pub fn get(request: &IncomingRequest, path: &str, query: &str) -> Response {
    // The site's own paths are plain ASCII: anything else is not one of them.
    let plain = path.starts_with('/')
        && !path.contains("..")
        && !path.contains("//")
        && path
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"/-_.".contains(&b));
    if !plain {
        return not_found();
    }
    let file = if path.ends_with('/') {
        format!("{path}index.html")
    } else {
        path.to_owned()
    };
    let Some(asset) = find(&file) else {
        // `/features` -> `/features/`
        if find(&format!("{path}/index.html")).is_some() {
            return text(308, "moved\n", &[("location", &format!("{path}/"))]);
        }
        return not_found();
    };
    if asset.path == "/index.html" {
        return home(asset);
    }
    let fingerprinted = query
        .split('&')
        .any(|pair| pair.strip_prefix("h=") == Some(asset.fingerprint));
    let cache = if fingerprinted {
        IMMUTABLE
    } else if query.split('&').any(|pair| pair.starts_with("h=")) {
        // A fingerprint of another version (a page from a node not yet
        // upgraded, or one already upgraded): never cache this answer
        // under that name.
        "no-store"
    } else if asset.content_type.starts_with("text/html") {
        PAGE
    } else {
        FILE
    };
    let headers = vec![
        ("content-type".to_owned(), asset.content_type.to_owned()),
        ("cache-control".to_owned(), cache.to_owned()),
        ("etag".to_owned(), asset.etag.to_owned()),
    ];
    if matches(header(request, "if-none-match").as_deref(), asset.etag) {
        return Response {
            status: 304,
            headers,
            body: Vec::new(),
        };
    }
    Response {
        status: 200,
        headers,
        body: asset.body.to_vec(),
    }
}

/// Whether an `If-None-Match` value names `etag` (weak comparison, as
/// RFC 9110 has it for `If-None-Match`).
fn matches(if_none_match: Option<&str>, etag: &str) -> bool {
    let Some(value) = if_none_match else {
        return false;
    };
    value
        .split(',')
        .map(|tag| tag.trim().trim_start_matches("W/"))
        .any(|tag| tag == "*" || tag == etag)
}

/// The home page, with the wall's counts in it: never cached, as they
/// change.
fn home(asset: &Asset) -> Response {
    let page = String::from_utf8_lossy(asset.body);
    let body = wall::render(&page);
    Response {
        status: 200,
        headers: vec![
            ("content-type".to_owned(), asset.content_type.to_owned()),
            ("cache-control".to_owned(), "no-cache".to_owned()),
        ],
        body: body.into_bytes(),
    }
}

/// Zola's 404 page, with its status.
fn not_found() -> Response {
    match find("/404.html") {
        Some(page) => Response {
            status: 404,
            headers: vec![
                ("content-type".to_owned(), page.content_type.to_owned()),
                ("cache-control".to_owned(), "public, max-age=60".to_owned()),
            ],
            body: page.body.to_vec(),
        },
        None => text(404, "not found\n", &[]),
    }
}
