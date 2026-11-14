#!/usr/bin/env bash
# Runs the app with `wasmkeep dev` (which builds the site and the front)
# and checks it answers: the pages, the caching headers, the wall's API,
# and that the counters are reachable only through the front.
#
#   scripts/smoke.sh
#
# Environment:
#   WASMKEEP  the CLI (default: .cache/bin/wasmkeep, from
#             `scripts/fetch-components.sh --cli`, then `wasmkeep` on PATH)
#   PORT      the port to listen on, on 127.0.0.1 (default 18080)
# ZOLA or ZOLA_IMAGE are passed on to the build (scripts/build-site.sh).
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
wasmkeep=${WASMKEEP:-}
if [[ -z $wasmkeep ]]; then
  if [[ -x .cache/bin/wasmkeep ]]; then
    wasmkeep=.cache/bin/wasmkeep
  else
    wasmkeep=wasmkeep
  fi
fi
port=${PORT:-18080}
base="http://127.0.0.1:$port"
[[ -f components/rust-counter.wasm ]] || {
  echo "components/ is empty: run scripts/fetch-components.sh first" >&2
  exit 1
}

data=$(mktemp -d)
log="$data/dev.log"
"$wasmkeep" dev --listen "127.0.0.1:$port" --data-dir "$data/state" >"$log" 2>&1 &
pid=$!
cleanup() {
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  rm -rf "$data"
}
trap cleanup EXIT

# The first run builds the front: give it time.
for _ in $(seq 600); do
  if curl -fs -o /dev/null "$base/"; then break; fi
  if ! kill -0 "$pid" 2>/dev/null; then
    cat "$log" >&2
    echo "FAIL: wasmkeep dev exited" >&2
    exit 1
  fi
  sleep 1
done

failures=0
check() {
  local what=$1 got=$2 want=$3
  if [[ $got == "$want" ]]; then
    echo "ok   $what"
  else
    echo "FAIL $what: got '$got', want '$want'"
    failures=$((failures + 1))
  fi
}
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
header() { curl -s -D - -o /dev/null "${@:2}" | tr -d '\r' | awk -v h="$1:" 'tolower($1) == h { $1 = ""; sub(/^ /, ""); print }'; }

home=$(curl -fs "$base/")
check "GET / is the home page" "$(grep -c 'The language wall' <<<"$home")" 1
check "GET / has the wall's counts filled in" "$(grep -c '%wall:' <<<"$home")" 0
check "GET /how-it-works/" "$(status "$base/how-it-works/")" 200
check "GET /how-it-works redirects" "$(status "$base/how-it-works")" 308
check "GET /nope is the 404 page" "$(status "$base/nope")" 404
check "HTML is cached briefly" "$(header cache-control "$base/features/")" "public, max-age=300"
etag=$(header etag "$base/features/")
check "If-None-Match answers 304" "$(status -H "if-none-match: $etag" "$base/features/")" 304
css=$(grep -o '/style.css?h=[0-9a-f]*' <<<"$home" | head -1)
check "a fingerprinted asset is immutable" "$(header cache-control "$base$css")" "public, max-age=31536000, immutable"
check "CSS has its content type" "$(header content-type "$base$css")" "text/css; charset=utf-8"
check "a stale fingerprint is not cached" "$(header cache-control "$base/style.css?h=0000")" "no-store"

wall=$(curl -fs "$base/api/wall")
before=$(grep -o '"lang":"rust","name":"Rust","state":"live","count":[0-9]*' <<<"$wall" | grep -o '[0-9]*$' || true)
check "GET /api/wall lists rust as live" "${before:+live}" live
added=$(curl -fs -X POST -H 'accept: application/json' "$base/api/wall/rust")
check "POST /api/wall/rust adds one" "$added" "{\"lang\":\"rust\",\"count\":$((${before:-0} + 1)),\"node\":null}"
check "POST /api/wall/cobol is refused" "$(status -X POST "$base/api/wall/cobol")" 404
check "a cross-site POST is refused" "$(status -X POST -H 'sec-fetch-site: cross-site' "$base/api/wall/rust")" 403
check "the counters are internal" "$(status "$base/actor/rust/wall")" 403

if ((failures)); then
  echo "--- wasmkeep dev log" >&2
  tail -50 "$log" >&2
  echo "$failures check(s) failed" >&2
  exit 1
fi
echo "smoke test passed"
