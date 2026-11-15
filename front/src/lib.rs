//! The front of the WasmKeep website (a WasmKeep front, ADR 0023): every
//! request outside `/actor/` comes here.
//!
//! - `GET /api/wall`: every language's count, gathered with one
//!   `calls::call_many` batch (ADR 0025).
//! - `POST /api/wall/<lang>`: adds one to that language's counter.
//! - Everything else: the Zola site, embedded at build time (`build.rs`),
//!   with ETags, `If-None-Match`, and long caching for fingerprinted
//!   (`?h=`) assets only. The home page has the wall's counts filled in,
//!   so it reads without JavaScript.

mod site;
mod wall;

use wasmkeep_sdk::actors;
use wasmkeep_sdk::http::{self, IncomingRequest, Method, ResponseOutparam};

struct Front;

impl http::Guest for Front {
    fn handle(request: IncomingRequest, out: ResponseOutparam) {
        let target = request.path_with_query().unwrap_or_else(|| "/".into());
        let (path, query) = target.split_once('?').unwrap_or((&target, ""));
        let method = request.method();
        let response = match (&method, path) {
            (Method::Get, "/api/wall/live") => wall::live(&request),
            (Method::Get | Method::Head, "/api/wall") => wall::list(),
            (Method::Post, p) if p.starts_with("/api/wall/") => {
                wall::add(&request, &p["/api/wall/".len()..])
            }
            (_, p) if p == "/api" || p.starts_with("/api/") => wall::json_error(404, "no such API"),
            (Method::Get | Method::Head, p) => site::get(&request, p, query),
            _ => text(405, "use GET or HEAD\n", &[("allow", "GET, HEAD")]),
        };
        let mut response = with_security_headers(response);
        if matches!(method, Method::Head) {
            response.body.clear();
        }
        http::respond_with(out, &response);
    }
}

/// A plain-text answer.
fn text(status: u16, body: &str, extra: &[(&str, &str)]) -> actors::Response {
    let mut headers = vec![
        (
            "content-type".to_owned(),
            "text/plain; charset=utf-8".to_owned(),
        ),
        ("cache-control".to_owned(), "no-store".to_owned()),
    ];
    headers.extend(
        extra
            .iter()
            .map(|(k, v)| ((*k).to_owned(), (*v).to_owned())),
    );
    actors::Response {
        status,
        headers,
        body: body.as_bytes().to_vec(),
    }
}

/// The headers every answer carries. Scripts, styles and requests stay on
/// this origin; the SVG is inline, the script a file.
fn with_security_headers(mut response: actors::Response) -> actors::Response {
    for (name, value) in [
        ("x-content-type-options", "nosniff"),
        ("referrer-policy", "strict-origin-when-cross-origin"),
        (
            "content-security-policy",
            "default-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; \
             base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
        ),
    ] {
        response.headers.push((name.to_owned(), value.to_owned()));
    }
    response
}

/// The first value of a request header, as text.
fn header(request: &IncomingRequest, name: &str) -> Option<String> {
    let values = request.headers().get(name);
    String::from_utf8(values.into_iter().next()?).ok()
}

wasmkeep_sdk::export_front!(Front);
