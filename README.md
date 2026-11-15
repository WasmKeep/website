# WasmKeep website

The website of [WasmKeep](https://github.com/WasmKeep/wasmkeep), served by
WasmKeep itself. It is a real WasmKeep app, and an example of one: a Rust
front that serves a static site and calls the app's actors.

- `content/`, `templates/`, `sass/`, `static/`, `config.toml`: the site,
  built with [Zola](https://www.getzola.org/) (0.23). One stylesheet with
  colour tokens and a dark scheme, system fonts, inline SVG icons, and a
  small script per interactive page, each a file of its own (the front's
  CSP allows no inline script or style):
  - `static/wall.js`: the language wall and what answered (home);
  - `static/tabs.js`: the language tabs of the code sample (home);
  - `static/failover.js`: the "kill a node" diagram (`/how-it-works/`), a
    model of the default lease timings, not a live cluster;
  - `static/cost.js`: the break-even calculator (`/cost/`). Its prices
    are dated and linked on the page; update both together.
- `front/`: the app's front, a Rust WebAssembly component
  ([`wasmkeep-sdk`](https://crates.io/crates/wasmkeep-sdk), front API). It
  embeds the Zola output at build time and serves it with ETags and
  caching (fingerprinted assets for a year, pages for five minutes), and
  answers the language wall's API.
- `wasmkeep.toml`: the [project file](https://docs.wasmkeep.dev/project-file.html):
  the front, and one `internal` class per language counter.
- `scripts/`: building the site, fetching the components, the smoke test.

## The language wall

The home page shows one counter per language. Each is the WasmKeep
example counter written in that language, as its own class (`rust`,
`typescript`, ...), with one actor named `wall`; only the front reaches
them.

- `GET /api/wall`: every language's count, read with one `calls.call-many`
  batch.
- `POST /api/wall/<lang>`: adds one to that language's counter and returns
  the new count. `<lang>` is checked against a fixed list.

The home page has the counts filled in by the front, and each button is a
plain form, so the wall works without JavaScript; `static/wall.js` updates
it in place when JavaScript runs.

The counters come from the signed assets of the WasmKeep release in
`WASMKEEP_VERSION`. The 0.4.2 release carries Rust (`counter.wasm`),
TypeScript, Python, Go (TinyGo), C and Zig counters, each signed and listed
in `SHA256SUMS`. These six classes are enabled in `wasmkeep.toml`. D,
MoonBit and C# are not release assets yet and show as "soon".

## Run it locally

You need Rust with the `wasm32-wasip2` target (`rust-toolchain.toml`
installs it with rustup), [Zola](https://www.getzola.org/documentation/getting-started/installation/)
or podman, and, to check signatures, cosign 3 or podman.

```bash
scripts/fetch-components.sh --cli   # components/ and .cache/bin/wasmkeep, verified
.cache/bin/wasmkeep dev             # or `wasmkeep dev` with your own CLI
```

Then open <http://127.0.0.1:8080>. `wasmkeep dev` builds the site and the
front (the `[front] build` command), serves the app as a node would, and
rebuilds when a source changes.

Without Zola or cosign installed, run them from their images with podman:

```bash
export ZOLA_IMAGE=ghcr.io/getzola/zola:v0.23.6
export COSIGN_IMAGE=ghcr.io/sigstore/cosign/cosign:v3.1.4
```

`scripts/fetch-components.sh` verifies the Sigstore bundle of
`SHA256SUMS`, then each file's bundle and checksum, as the
[WasmKeep docs](https://docs.wasmkeep.dev/deploy/single-node.html) do.
Without cosign it checks the checksums only, with a warning. Nothing it
downloads is committed.

`scripts/smoke.sh` runs the app with `wasmkeep dev` and checks the pages,
the caching headers and the wall's API; CI runs it with the released CLI.

## How it is built

1. `scripts/build-site.sh` runs `zola build` into `public/`.
2. `cargo build --release --target wasm32-wasip2` in `front/`: `build.rs`
   embeds every file of `public/` with its content type, ETag and Zola
   fingerprint, and reads the deployed language classes from
   `wasmkeep.toml`.
3. `wasmkeep dev` (or `wasmkeep deploy`) runs both through the `[front]`
   build command.

Not deployed yet. Deployment is handled by the maintainers; not from CI.

## License

Apache License 2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
