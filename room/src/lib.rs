//! One internal actor, `wall-room/main`. The host holds its sockets across
//! hibernation; the room keeps no history and ignores client messages.

use wasmkeep_sdk::http::{self, IncomingRequest, Method, ResponseOutparam};
use wasmkeep_sdk::{Actor, Message, websockets};

struct WallRoom;

impl Actor for WallRoom {
    fn on_websocket_open(_conn: u64, path: String) -> Result<(), String> {
        if path == "/live" {
            Ok(())
        } else {
            Err("no such socket path".into())
        }
    }
    // The default message and close hooks do nothing. Clients cannot write.
}

/// Bound the input and validate before interpolating into JSON.
fn notification(body: &[u8]) -> Option<String> {
    if body.len() > 64 {
        return None;
    }
    let (lang, count) = std::str::from_utf8(body).ok()?.split_once(' ')?;
    if !matches!(
        lang,
        "rust" | "typescript" | "python" | "go" | "c" | "zig" | "d" | "moonbit" | "csharp"
    ) || count.is_empty()
        || !count.bytes().all(|b| b.is_ascii_digit())
    {
        return None;
    }
    let count: u64 = count.parse().ok()?;
    Some(format!("{{\"lang\":\"{lang}\",\"count\":{count}}}"))
}

impl http::Guest for WallRoom {
    fn handle(request: IncomingRequest, out: ResponseOutparam) {
        if !matches!(request.method(), Method::Post)
            || request.path_with_query().as_deref() != Some("/notify")
        {
            return http::respond(out, 404, "text/plain", b"not found\n");
        }
        let Some(body) = http::read_body(&request, 64) else {
            return http::respond(out, 413, "text/plain", b"at most 64 bytes\n");
        };
        let Some(text) = notification(&body) else {
            return http::respond(out, 400, "text/plain", b"expected language and count\n");
        };
        let message = Message::Text(text);
        for conn in websockets::connections() {
            // A slow reader can miss a message; the page's polling catches up.
            let _ = websockets::send(conn, &message);
        }
        http::respond(out, 204, "text/plain", b"");
    }
}

wasmkeep_sdk::export!(WallRoom);
