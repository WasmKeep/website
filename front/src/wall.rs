//! The language wall: one counter actor per language, each of its own
//! class (`rust/wall`, `go/wall`, ...), deployed `internal` so only this
//! front reaches them.
//!
//! The counters are the WasmKeep example components (`GET` returns the
//! value, `POST` adds one and returns the new value, as text).

use crate::header;
use crate::site::DEPLOYED;
use wasmkeep_sdk::actors::{self, Response};
use wasmkeep_sdk::front::{self, calls};
use wasmkeep_sdk::http::IncomingRequest;

/// Every language the wall knows, in display order: its class and its
/// name. Keep in step with `extra.wall` in config.toml. A request for any
/// other language is refused before any call, so a request never names a
/// class or an actor.
const LANGUAGES: &[(&str, &str)] = &[
    ("rust", "Rust"),
    ("typescript", "TypeScript"),
    ("python", "Python"),
    ("go", "Go"),
    ("c", "C"),
    ("zig", "Zig"),
    ("d", "D"),
    ("moonbit", "MoonBit"),
    ("csharp", "C#"),
];

/// The one actor of each class the wall uses.
const ACTOR: &str = "wall";

/// The host marks real upgrades; WASI HTTP strips the Upgrade header.
pub fn live(request: &IncomingRequest) -> Response {
    if !front::is_websocket(request) {
        return json_error(426, "websocket upgrade required");
    }
    front::hand_off("wall-room", "main", "/live")
}

/// A language's place on the wall.
enum Count {
    /// Its counter answered.
    Live(u64),
    /// Deployed, but its counter did not answer.
    Unavailable,
    /// Not deployed: no release carries its counter yet.
    Soon,
}

fn deployed(class: &str) -> bool {
    DEPLOYED.contains(&class)
}

fn request(method: &str) -> actors::Request {
    actors::Request {
        method: method.into(),
        path: "/".into(),
        headers: Vec::new(),
        body: Vec::new(),
    }
}

fn parse(result: Result<Response, actors::CallError>, class: &str) -> Option<u64> {
    match result {
        Ok(r) if r.status == 200 => String::from_utf8_lossy(&r.body).trim().parse().ok(),
        Ok(r) => {
            eprintln!("{class}/{ACTOR}: status {}", r.status);
            None
        }
        Err(e) => {
            eprintln!("{class}/{ACTOR}: {e:?}");
            None
        }
    }
}

/// Every language's count: the deployed counters read with one
/// `call_many` (at most 16 entries; the wall has 9 languages).
fn counts() -> Vec<(&'static str, &'static str, Count)> {
    let live: Vec<&str> = LANGUAGES
        .iter()
        .map(|(class, _)| *class)
        .filter(|class| deployed(class))
        .collect();
    let entries: Vec<(String, actors::Request)> = live
        .iter()
        .map(|class| (format!("{class}/{ACTOR}"), request("GET")))
        .collect();
    let mut results = if entries.is_empty() {
        Vec::new()
    } else {
        calls::call_many(&entries)
    }
    .into_iter();
    let mut answers = Vec::new();
    for class in &live {
        let result = results.next();
        answers.push((*class, result.and_then(|r| parse(r, class))));
    }
    LANGUAGES
        .iter()
        .map(|(class, name)| {
            let count = match answers.iter().find(|(c, _)| c == class) {
                None => Count::Soon,
                Some((_, Some(n))) => Count::Live(*n),
                Some((_, None)) => Count::Unavailable,
            };
            (*class, *name, count)
        })
        .collect()
}

/// `GET /api/wall`:
/// `{"wall":[{"lang":"rust","name":"Rust","state":"live","count":3},...],"node":null}`.
///
/// `node` is the node that answered, when the host tells a front: it does
/// not yet (WasmKeep 0.4 keeps `x-wasmkeep-node` from guests), so it is
/// `null` for now.
pub fn list() -> Response {
    let items: Vec<String> = counts()
        .into_iter()
        .map(|(class, name, count)| {
            let (state, count) = match count {
                Count::Live(n) => ("live", n.to_string()),
                Count::Unavailable => ("unavailable", "null".to_owned()),
                Count::Soon => ("soon", "null".to_owned()),
            };
            format!(
                "{{\"lang\":\"{class}\",\"name\":{},\"state\":\"{state}\",\"count\":{count}}}",
                json_string(name)
            )
        })
        .collect();
    json(
        200,
        format!("{{\"wall\":[{}],\"node\":null}}\n", items.join(",")),
    )
}

/// `POST /api/wall/<lang>`: adds one. Answers
/// `{"lang":"rust","count":4,"node":null}`, or, to a browser's form post
/// (no JavaScript), a redirect back to the wall.
pub fn add(request: &IncomingRequest, lang: &str) -> Response {
    let Some(class) = LANGUAGES.iter().map(|(c, _)| *c).find(|c| *c == lang) else {
        return json_error(404, "unknown language");
    };
    if !deployed(class) {
        return json_error(404, "this language is not on the wall yet");
    }
    // A browser says where a request comes from: only this site adds one.
    if header(request, "sec-fetch-site").as_deref() == Some("cross-site") {
        return json_error(403, "cross-site requests are refused");
    }
    let count = match actors::call(&format!("{class}/{ACTOR}"), &request_post()) {
        Ok(r) if r.status == 200 => String::from_utf8_lossy(&r.body).trim().parse::<u64>().ok(),
        Ok(r) => {
            eprintln!("{class}/{ACTOR}: status {}", r.status);
            None
        }
        Err(e) => {
            eprintln!("{class}/{ACTOR}: {e:?}");
            return front::unavailable(&e);
        }
    };
    let Some(count) = count else {
        return json_error(502, "the counter gave no count");
    };
    // Best effort: the counter's write already succeeded. The SDK call
    // waits for a reply, but a notify error must never fail that write.
    let notify = actors::Request {
        method: "POST".into(),
        path: "/notify".into(),
        headers: Vec::new(),
        body: format!("{class} {count}").into_bytes(),
    };
    match actors::call("wall-room/main", &notify) {
        Ok(r) if r.status == 204 => {}
        Ok(r) => eprintln!("wall-room/main notify: status {}", r.status),
        Err(e) => eprintln!("wall-room/main notify: {e:?}"),
    }
    let accept = header(request, "accept").unwrap_or_default();
    if accept.contains("text/html") && !accept.contains("application/json") {
        return Response {
            status: 303,
            headers: vec![
                ("location".into(), "/#wall".into()),
                ("cache-control".into(), "no-store".into()),
            ],
            body: Vec::new(),
        };
    }
    json(
        200,
        format!("{{\"lang\":\"{class}\",\"count\":{count},\"node\":null}}\n"),
    )
}

fn request_post() -> actors::Request {
    request("POST")
}

/// The home page with each `%wall:<lang>%` filled in: a count and its
/// button, or "soon".
pub fn render(page: &str) -> String {
    let mut page = page.to_owned();
    for (class, name, count) in counts() {
        let button = format!(
            "<form method=\"post\" action=\"/api/wall/{class}\"><button type=\"submit\" \
             aria-label=\"+1 for {name}\">+1</button></form>"
        );
        let html = match count {
            Count::Live(n) => format!("<span class=\"wall-count\">{n}</span>{button}"),
            Count::Unavailable => {
                format!("<span class=\"wall-count\" title=\"not answering\">-</span>{button}")
            }
            Count::Soon => "<span class=\"wall-count wall-soon\">soon</span>".to_owned(),
        };
        page = page.replace(&format!("%wall:{class}%"), &html);
    }
    page
}

pub fn json_error(status: u16, message: &str) -> Response {
    json(status, format!("{{\"error\":{}}}\n", json_string(message)))
}

fn json(status: u16, body: String) -> Response {
    Response {
        status,
        headers: vec![
            ("content-type".into(), "application/json".into()),
            ("cache-control".into(), "no-store".into()),
        ],
        body: body.into_bytes(),
    }
}

/// `s` as a JSON string literal.
fn json_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if u32::from(c) < 0x20 || c == '<' || c == '>' || c == '&' => {
                out.push_str(&format!("\\u{:04x}", u32::from(c)));
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}
