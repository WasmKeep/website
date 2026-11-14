+++
title = "Features"
description = "What WasmKeep does today, and where each part is documented."

[extra]
lead = "What works today, each with tests that run before every merge. WasmKeep is pre-alpha: it is measured, and it does not yet carry real users' traffic."
+++

{{<feature icon="database" title="An SQLite database per actor" />}}

Each actor owns its state in its own database, queried with plain SQL, and
handles one event at a time, in arrival order: two requests to the same
actor never interleave. [Concepts](https://docs.wasmkeep.dev/concepts.html).

{{<feature icon="cloud" title="Durable writes, acknowledged once in the bucket" />}}

Nodes share one S3-compatible bucket. A write made with `exec-durable`
answers only once the bucket holds it, so it survives its node; a plain
`exec` answers sooner and is uploaded right after the event, so it can be
lost with its node in that moment.
[The replication contract](https://docs.wasmkeep.dev/cluster.html).

{{<feature icon="server" title="Failover without a consensus cluster" />}}

The bucket holds the node leases, the ownership records and each actor's
history. When a node dies, its actors are free 15 to about 21 s after its
last heartbeat, then another node restores them from the bucket.
[When a node dies](https://docs.wasmkeep.dev/failover-and-scaling.html).

{{<feature icon="moon" title="Hibernation" />}}

Idle actors leave memory and wake in about a millisecond, with their
data, their pending alarm and their open WebSockets, so a node keeps far
more actors than fit in memory.

{{<feature icon="languages" title="Any language that compiles to WebAssembly" />}}

Actors are standard WASI 0.2 components. Rust, TypeScript, Python, C, Zig
and Go (TinyGo) have SDKs and pass the same tests; standard Go, D and
MoonBit are experimental, and a C# counter builds. An app can mix them.
[Languages](https://docs.wasmkeep.dev/languages.html).

{{<feature icon="layers" title="Apps with a front" />}}

A stateless front serves pages and APIs and calls the app's actors,
several at once in one batch. It is deployed with its classes as one
version, with `wasmkeep deploy`.
[The project file](https://docs.wasmkeep.dev/project-file.html).

{{<feature icon="clock" title="Alarms and WebSockets" />}}

Alarms fire at least once, also when their node dies, and WebSockets stay
open while their actor sleeps.

{{<feature icon="shield" title="A sandbox per actor, mutual TLS between nodes" />}}

Each actor runs in its own Wasm instance with a CPU budget per event,
memory and SQL limits, no filesystem and no data but its own database.
Nodes talk mutual TLS by default. Every actor of a node shares one
process, so this is not yet a boundary for hostile tenants.
[Security model](https://docs.wasmkeep.dev/security.html).

{{<feature icon="terminal" title="Built to operate" />}}

`wasmkeep cluster status` reads a cluster's state from the bucket alone,
`wasmkeep cluster drain` empties a node before you replace it, and
`wasmkeep secrets` keeps an app's secrets sealed in the bucket.
[Running a cluster](https://docs.wasmkeep.dev/cluster.html).

{{<feature icon="check" title="Signed releases, Apache-2.0" />}}

One binary per node. Every release file has a Sigstore bundle, and each
binary a CycloneDX SBOM, built and signed by CI. No account, and no vendor
in the request path.

## Not yet

Weeks of real traffic, a run against AWS S3, an independent security
audit, and a sandbox tier for tenants who do not trust each other. What is
left is on the [roadmap](https://github.com/WasmKeep/wasmkeep/blob/main/ROADMAP.md).
