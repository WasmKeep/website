+++
title = "Features"
description = "What WasmKeep does today."
+++

WasmKeep is pre-alpha: it works, it is measured, and it does not yet carry
real users' traffic. The [overview](https://docs.wasmkeep.dev/overview.html)
says what is done and what is not.

{{<feature icon="database" title="An SQLite database per actor" />}}

Each actor owns its state in its own database, queried with SQL, and
handles one event at a time.

{{<feature icon="moon" title="Hibernation" />}}

Idle actors leave memory and wake in about a millisecond, so a node keeps
far more actors than fit in memory.

{{<feature icon="languages" title="Any language that compiles to WebAssembly" />}}

Actors are standard WebAssembly components (WASI 0.2), with SDKs for Rust,
TypeScript, Python, Go, C, Zig and more.
[Languages](https://docs.wasmkeep.dev/languages.html).

{{<feature icon="layers" title="Apps with a front" />}}

A stateless front serves pages and APIs and calls the app's actors, several
at once in one batch. Deployed with its classes as one version.

{{<feature icon="clock" title="Alarms and WebSockets" />}}

Alarms fire at least once, and WebSockets stay open while their actor
sleeps.

{{<feature icon="cloud" title="Clusters on one bucket" />}}

Several nodes share an S3-compatible bucket. Databases are replicated to
it, and restored elsewhere when a node dies.
[Running a cluster](https://docs.wasmkeep.dev/cluster.html).

{{<feature icon="server" title="Servers you own" />}}

One binary, Apache-2.0, on one VPS or many. No account, no vendor in the
request path.

{{<feature icon="shield" title="Signed releases" />}}

Every release file has a Sigstore bundle, and each binary a CycloneDX
SBOM. Built and signed by CI, with no key involved.
