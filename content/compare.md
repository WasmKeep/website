+++
title = "Compare"
description = "Compare where your data lives, what survives a crash and who runs the servers. WasmKeep and eight alternatives, with sourced feature details."
template = "compare.html"

[extra]
reviewed = "2026-11-15"
release = "0.4.2"
# Competitor documentation reviewed 2026-11-15. Each cell cites its source.
# Unknown means the reviewed docs do not establish the requested behavior.

[[extra.projects]]
id = "wasmkeep"
name = "WasmKeep"

[[extra.projects]]
id = "cloudflare"
name = "Cloudflare Durable Objects"

[[extra.projects]]
id = "celld"
name = "celld"

[[extra.projects]]
id = "rivet"
name = "Rivet"

[[extra.projects]]
id = "golem"
name = "Golem"

[[extra.projects]]
id = "orleans"
name = "Orleans"

[[extra.projects]]
id = "dapr"
name = "Dapr actors"

[[extra.projects]]
id = "restate"
name = "Restate"

[[extra.projects]]
id = "temporal"
name = "Temporal"

[[extra.groups]]
id = "model"
name = "Model"

[[extra.groups.rows]]
name = "Actor per name"
[extra.groups.rows.cells.wasmkeep]
status = "built"
note = "One actor per tenant, app, class and name."
source = "docs/concepts.md"

[extra.groups.rows.cells.cloudflare]
status = "built"
note = "Globally addressable object ID; getByName / idFromName derive identity within a namespace."
source = "https://developers.cloudflare.com/durable-objects/"

[extra.groups.rows.cells.celld]
status = "built"
note = "Named object per script and class; idFromName / getByName address it across the fleet."
source = "https://github.com/denoland/celld/blob/main/docs/services/durable-objects.md"

[extra.groups.rows.cells.rivet]
status = "built"
note = "Actors are addressed by name and key; getOrCreate routes to the same instance."
source = "https://rivet.dev/actors/docs/"

[extra.groups.rows.cells.golem]
status = "built"
note = "Agent type and constructor arguments identify a durable instance, created on its first call."
source = "https://learn.golem.cloud/v1.6/concepts/agents"

[extra.groups.rows.cells.orleans]
status = "built"
note = "Virtual grains have stable, application-defined keys."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/overview"

[extra.groups.rows.cells.dapr]
status = "built"
note = "Actor type plus string actor ID; namespaced actors supported."
source = "https://docs.dapr.io/developing-applications/building-blocks/actors/actors-overview/"

[extra.groups.rows.cells.restate]
status = "built"
note = "Virtual Objects are addressed by service name and object key."
source = "https://docs.restate.dev/foundations/services"

[extra.groups.rows.cells.temporal]
status = "partial"
note = "Workflow IDs model named durable entities; executions have a lifecycle rather than permanent virtual-actor activation."
source = "https://docs.temporal.io/workflow-execution"

[[extra.groups.rows]]
name = "One event at a time"
[extra.groups.rows.cells.wasmkeep]
status = "built"
note = "Events run serially in arrival order; different actors run in parallel."
source = "docs/concepts.md#events"

[extra.groups.rows.cells.cloudflare]
status = "partial"
note = "Single-threaded; events can interleave across external awaits. Storage gates and blockConcurrencyWhile provide ordering."
source = "https://developers.cloudflare.com/durable-objects/api/state/"

[extra.groups.rows.cells.celld]
status = "partial"
note = "One synchronous turn at a time; awaited events can overlap unless blockConcurrencyWhile closes the input gate."
source = "https://github.com/denoland/celld/blob/main/docs/services/durable-objects.md"

[extra.groups.rows.cells.rivet]
status = "no"
note = "Actions run concurrently by default and interleave at awaits; use atomic SQL statements or transactions."
source = "https://rivet.dev/actors/docs/actions/"

[extra.groups.rows.cells.golem]
status = "built"
note = "One method invocation at a time, in order; read-only methods can return cached results outside the queue."
source = "https://learn.golem.cloud/v1.6/concepts/agents"

[extra.groups.rows.cells.orleans]
status = "built"
note = "Non-reentrant grains serialize whole requests by default; optional reentrancy permits interleaving."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/grains/request-scheduling"

[extra.groups.rows.cells.dapr]
status = "built"
note = "Whole-turn serialization, including awaits; optional reentrancy changes nested-call behavior."
source = "https://docs.dapr.io/developing-applications/building-blocks/actors/actors-features-concepts/"

[extra.groups.rows.cells.restate]
status = "partial"
note = "Exclusive handlers serialize writes per key; shared read-only handlers can run concurrently."
source = "https://docs.restate.dev/foundations/services"

[extra.groups.rows.cells.temporal]
status = "partial"
note = "Deterministic workflow execution; async message handlers can interleave and may need workflow locks."
source = "https://docs.temporal.io/develop/typescript/workflows/message-passing"

[[extra.groups.rows]]
name = "Languages / runtime"
[extra.groups.rows.cells.wasmkeep]
status = "built"
note = "Wasmtime, WASI 0.2. Rust, TypeScript, Python, C/C++, Zig, TinyGo. SDK features vary; standard Go, D, MoonBit and C# experimental."
source = "README.md#why-wasmkeep"

[extra.groups.rows.cells.cloudflare]
status = "built"
note = "Workers supports JavaScript, TypeScript, Python and Rust, plus Wasm modules; API support varies by language."
source = "https://developers.cloudflare.com/workers/languages/"

[extra.groups.rows.cells.celld]
status = "built"
note = "Embedded V8 runs Workers JavaScript / TypeScript bundles; WebAssembly modules and optional Python support."
source = "https://github.com/denoland/celld/blob/main/docs/services/workers.md"

[extra.groups.rows.cells.rivet]
status = "built"
note = "Native Node.js / Bun actors; Rust SDK and Effect integration also documented."
source = "https://rivet.dev/actors/docs/"

[extra.groups.rows.cells.golem]
status = "built"
note = "Wasm components: Rust, TypeScript / Effect, Scala, MoonBit and Go; JavaScript runtimes use QuickJS."
source = "https://learn.golem.cloud/v1.6/concepts/agents"

[extra.groups.rows.cells.orleans]
status = "built"
note = "C# / .NET applications hosted in silos."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/overview"

[extra.groups.rows.cells.dapr]
status = "built"
note = "Language-neutral HTTP/gRPC sidecar; actor SDKs include .NET, Java, Python and JavaScript/TypeScript."
source = "https://docs.dapr.io/reference/api/actors_api/"

[extra.groups.rows.cells.restate]
status = "built"
note = "SDK applications in TypeScript, Java/Kotlin, Python, Go, Rust and Ruby; Rust server."
source = "https://docs.restate.dev/foundations/key-concepts"

[extra.groups.rows.cells.temporal]
status = "built"
note = "Go, Java, .NET, PHP, Python, Ruby, Rust and TypeScript SDKs; application workers execute code."
source = "https://docs.temporal.io/encyclopedia/architecture/temporal-sdks"

[[extra.groups.rows]]
name = "Wasm sandbox per actor"
[extra.groups.rows.cells.wasmkeep]
status = "built"
note = "Separate Wasm instances; no filesystem or raw sockets. Shared process, not a hostile-tenant isolation promise."
source = "README.md#why-wasmkeep"

[extra.groups.rows.cells.cloudflare]
status = "no"
note = "V8 isolate runtime; Wasm can run inside Workers, but each object is not a separate WASI component."
source = "https://github.com/cloudflare/workerd"

[extra.groups.rows.cells.celld]
status = "no"
note = "V8 isolates with optional Wasm modules; not a WASI component instance per actor."
source = "https://github.com/denoland/celld/blob/main/docs/wasm.md"

[extra.groups.rows.cells.rivet]
status = "no"
note = "Actors share an app process. An optional Wasm SDK core is not a separate guest sandbox per actor."
source = "https://rivet.dev/actors/docs/wasm-vs-native-sdk/"

[extra.groups.rows.cells.golem]
status = "built"
note = "Separate WebAssembly instance, memory and permission-checked host calls for each agent."
source = "https://learn.golem.cloud/v1.6/concepts/agents"

[extra.groups.rows.cells.orleans]
status = "no"
note = "Grains are .NET objects in a silo process, not separate Wasm instances."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/overview"

[extra.groups.rows.cells.dapr]
status = "no"
note = "Actor code runs in your application process; Dapr is a separate sidecar, not a Wasm sandbox."
source = "https://docs.dapr.io/operations/hosting/self-hosted/self-hosted-overview/"

[extra.groups.rows.cells.restate]
status = "no"
note = "Handlers run in your normal application runtime, outside the Restate server."
source = "https://docs.restate.dev/foundations/key-concepts"

[extra.groups.rows.cells.temporal]
status = "no"
note = "SDK workers execute language-native code; not a Wasm instance per workflow."
source = "https://docs.temporal.io/encyclopedia/architecture/temporal-sdks"

[[extra.groups]]
id = "state"
name = "State"

[[extra.groups.rows]]
name = "SQLite per actor"
[extra.groups.rows.cells.wasmkeep]
status = "built"
note = "Private SQLite database, one writer."
source = "docs/concepts.md#storage"

[extra.groups.rows.cells.cloudflare]
status = "built"
note = "Private SQLite database per object, with SQL and key-value APIs."
source = "https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/"

[extra.groups.rows.cells.celld]
status = "built"
note = "Each cell owns a SQLite database with SQL, KV and transactional APIs."
source = "https://github.com/denoland/celld/blob/main/docs/services/durable-objects.md"

[extra.groups.rows.cells.rivet]
status = "built"
note = "Private embedded SQLite database per actor, on its durable volume."
source = "https://rivet.dev/actors/docs/sqlite/"

[extra.groups.rows.cells.golem]
status = "built"
note = "Embedded SQLite per agent supported in TypeScript, Effect and Rust; memory or isolated-filesystem storage."
source = "https://learn.golem.cloud/v1.6/develop/embedded-databases"

[extra.groups.rows.cells.orleans]
status = "partial"
note = "SQLite persistence provider exists, but stores grain state rather than exposing a private SQL database per grain."
source = "https://github.com/dotnet/orleans/releases/tag/v10.4.0"

[extra.groups.rows.cells.dapr]
status = "no"
note = "SQLite is an actor-compatible state-store component, not a separate SQL database per actor."
source = "https://docs.dapr.io/reference/components-reference/supported-state-stores/"

[extra.groups.rows.cells.restate]
status = "no"
note = "Embedded key-value state per object/workflow, not per-actor SQL."
source = "https://docs.restate.dev/develop/ts/state"

[extra.groups.rows.cells.temporal]
status = "no"
note = "Service persistence is shared SQL/Cassandra; SQLite is development/testing only, not per-workflow SQL."
source = "https://docs.temporal.io/temporal-service/persistence"

[[extra.groups.rows]]
name = "Where state lives"
[extra.groups.rows.cells.wasmkeep]
status = "built"
note = "Node disk; in a cluster, history replicated to your S3-compatible bucket."
source = "docs/cluster.md#replication"

[extra.groups.rows.cells.cloudflare]
status = "built"
note = "Cloudflare-managed storage colocated with the object; jurisdiction restrictions are available."
source = "https://developers.cloudflare.com/durable-objects/reference/data-location/"

[extra.groups.rows.cells.celld]
status = "built"
note = "Recent replicated logs on node disks; long-term state in the fleet’s object-storage bucket."
source = "https://github.com/denoland/celld/blob/main/docs/guarantees.md"

[extra.groups.rows.cells.rivet]
status = "built"
note = "Replicated control-plane log disks plus object storage; actor-local pages are cached."
source = "https://rivet.dev/docs/deploy/self-host/control-plane/storage/"

[extra.groups.rows.cells.golem]
status = "built"
note = "Durable operation log, agent metadata and filesystem snapshots; backends include SQL, Redis and blob storage."
source = "https://learn.golem.cloud/v1.6/operate/persistence"

[extra.groups.rows.cells.orleans]
status = "built"
note = "In-memory active state backed by configured database or storage providers."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/grains/grain-persistence/"

[extra.groups.rows.cells.dapr]
status = "built"
note = "Actor keys live in a configured transactional state store; Scheduler persists reminders."
source = "https://docs.dapr.io/developing-applications/building-blocks/actors/actors-timers-reminders/"

[extra.groups.rows.cells.restate]
status = "built"
note = "Server-managed journals/state on persistent storage; clusters replicate logs and share bucket snapshots."
source = "https://docs.restate.dev/server/overview"

[extra.groups.rows.cells.temporal]
status = "built"
note = "Event history and execution metadata in the service persistence database; workers replay history."
source = "https://docs.temporal.io/temporal-service/persistence"

[[extra.groups.rows]]
name = "When a write counts as saved"
[extra.groups.rows.cells.wasmkeep]
status = "built"
note = "exec-durable: acknowledged once in your bucket (cluster), or fsynced (standalone). Plain exec: local commit; can be lost."
source = "docs/concepts.md#storage"

[extra.groups.rows.cells.cloudflare]
status = "built"
note = "Storage is transactional and strongly consistent; output gates delay externally visible results until writes persist."
source = "https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/"

[extra.groups.rows.cells.celld]
status = "built"
note = "Multi-node writes wait for follower disks, then upload to the bucket; single-node writes wait for the bucket."
source = "https://github.com/denoland/celld/blob/main/docs/services/durable-objects.md"

[extra.groups.rows.cells.rivet]
status = "built"
note = "Acknowledged after a majority of the volume’s replicas hold the write on disk; bucket upload follows asynchronously."
source = "https://rivet.dev/docs/deploy/self-host/control-plane/storage/"

[extra.groups.rows.cells.golem]
status = "built"
note = "Host interactions and results enter the durable oplog; recovery replays recorded work to reconstruct agent state."
source = "https://learn.golem.cloud/v1.6/concepts/durable-execution"

[extra.groups.rows.cells.orleans]
status = "built"
note = "Await WriteStateAsync; durability follows the configured provider. Ordinary field changes are not persisted automatically."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/grains/grain-persistence/"

[extra.groups.rows.cells.dapr]
status = "built"
note = "Actor state transactions persist through the configured store; distributed actor stores must provide strong consistency."
source = "https://docs.dapr.io/developing-applications/building-blocks/state-management/state-management-overview/"

[extra.groups.rows.cells.restate]
status = "built"
note = "State changes are journaled; cluster log acknowledgements require configured replication quorum."
source = "https://docs.restate.dev/server/clusters"

[extra.groups.rows.cells.temporal]
status = "built"
note = "Progress is recoverable from recorded history; external activity effects still require idempotency."
source = "https://docs.temporal.io/workflow-execution"

[[extra.groups.rows]]
name = "Point-in-time restore"
[extra.groups.rows.cells.wasmkeep]
status = "planned"
note = "Single actor to a retained point. Whole-app restore comes later."
source = "ROADMAP.md#now"
release = "0.5.0"
roadmap = "now"

[extra.groups.rows.cells.cloudflare]
status = "built"
note = "SQLite objects can restore SQL and KV state to a bookmark within the past 30 days."
source = "https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/"

[extra.groups.rows.cells.celld]
status = "unknown"
note = "D1 explicitly lacks Time Travel; no supported per-cell historical restore command is specified in the reviewed docs."
source = "https://github.com/denoland/celld/blob/main/docs/services/d1.md"

[extra.groups.rows.cells.rivet]
status = "unknown"
note = "Current-state copy-on-write forks are documented; historical point-in-time restoration is not specified."
source = "https://rivet.dev/actors/docs/forking/"

[extra.groups.rows.cells.golem]
status = "partial"
note = "Revert by oplog index or invocation count, not a wall-clock database restore; external side effects are not automatically undone."
source = "https://learn.golem.cloud/v1.6/how-to-guides/common/golem-undo-agent-state"

[extra.groups.rows.cells.orleans]
status = "partial"
note = "Depends on backing-store recovery; grain persistence does not define a per-grain restore API."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/grains/grain-persistence/"

[extra.groups.rows.cells.dapr]
status = "partial"
note = "Recovery depends on the selected state store; the actor API has no portable per-actor time-travel operation."
source = "https://docs.dapr.io/reference/api/actors_api/"

[extra.groups.rows.cells.restate]
status = "partial"
note = "Full backup restore is documented for a single node; automated full-cluster restoration is not available."
source = "https://docs.restate.dev/server/snapshots"

[extra.groups.rows.cells.temporal]
status = "partial"
note = "Reset resumes from a selected history point; it does not undo external activity side effects."
source = "https://docs.temporal.io/cli/command-reference/workflow#reset"

[[extra.groups.rows]]
name = "Export / online backup"
[extra.groups.rows.cells.wasmkeep]
status = "planned"
note = "SQLite export and verified online backup. Today: a manual stopped-cluster bucket copy and restore drill."
source = "ROADMAP.md#now"
release = "0.5.0"
roadmap = "now"

[extra.groups.rows.cells.cloudflare]
status = "partial"
note = "D1 supports SQL exports; this is a separate database service, not an export API for an object’s SQLite database."
source = "https://developers.cloudflare.com/d1/best-practices/import-export-data/"

[extra.groups.rows.cells.celld]
status = "partial"
note = "KV bulk export exists; rollback requires a full stopped-fleet backup. No documented online SQLite export."
source = "https://github.com/denoland/celld/blob/main/docs/guarantees.md"

[extra.groups.rows.cells.rivet]
status = "partial"
note = "Bucket protection and log-disk preservation documented; fresh-cluster restore is explicitly not yet validated for this release."
source = "https://rivet.dev/docs/deploy/self-host/control-plane/backups/"

[extra.groups.rows.cells.golem]
status = "partial"
note = "Application state snapshots and filesystem snapshots support recovery; not a generic portable online SQLite export."
source = "https://learn.golem.cloud/v1.6/develop/snapshotting"

[extra.groups.rows.cells.orleans]
status = "partial"
note = "Use backing-store backup/export tools; no portable grain-level backup contract in the persistence API."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/grains/grain-persistence/"

[extra.groups.rows.cells.dapr]
status = "partial"
note = "Back up the chosen state store and Scheduler; actor state access is not a complete online backup service."
source = "https://docs.dapr.io/reference/api/actors_api/"

[extra.groups.rows.cells.restate]
status = "partial"
note = "Partition snapshots and single-node backups; snapshots alone are not complete multi-node backups."
source = "https://docs.restate.dev/server/snapshots"

[extra.groups.rows.cells.temporal]
status = "partial"
note = "History download/export and archival; not a backup of external application databases."
source = "https://docs.temporal.io/cloud/export"

[[extra.groups.rows]]
name = "Files / blobs"
[extra.groups.rows.cells.wasmkeep]
status = "planned"
note = "App files, browser uploads and static assets. SQLite BLOB values exist today; no file service."
source = "ROADMAP.md#next"
release = "0.6.0"
roadmap = "next"

[extra.groups.rows.cells.cloudflare]
status = "built"
note = "R2 provides object storage through Workers bindings; separate from the object’s SQLite state."
source = "https://developers.cloudflare.com/r2/"

[extra.groups.rows.cells.celld]
status = "built"
note = "R2-compatible object bindings and static assets; objects live in the fleet bucket."
source = "https://github.com/denoland/celld/blob/main/docs/services/r2.md"

[extra.groups.rows.cells.rivet]
status = "partial"
note = "SQLite can hold binary data; agentOS adds sandbox filesystems. Generic actor file/blob hosting is not specified."
source = "https://github.com/rivet-dev/rivet"

[extra.groups.rows.cells.golem]
status = "built"
note = "Private agent filesystems, seeded files and permission-controlled blob storage."
source = "https://learn.golem.cloud/v1.6/concepts/agents"

[extra.groups.rows.cells.orleans]
status = "partial"
note = "Azure Blob grain storage is available; an application file service remains your integration."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/grains/grain-persistence/"

[extra.groups.rows.cells.dapr]
status = "partial"
note = "Separate bindings expose object/file stores; these are not actor-local files."
source = "https://docs.dapr.io/reference/components-reference/supported-bindings/"

[extra.groups.rows.cells.restate]
status = "partial"
note = "Application code can use external storage within durable steps; built-in state is key/value, not a file service."
source = "https://docs.restate.dev/foundations/key-concepts"

[extra.groups.rows.cells.temporal]
status = "partial"
note = "External Storage offloads large payloads to your store; public preview, not an actor file service."
source = "https://docs.temporal.io/external-storage"

[[extra.groups.rows]]
name = "Change feed"
[extra.groups.rows.cells.wasmkeep]
status = "planned"
note = "Resumable, ordered per actor; Parquet first. Replication history is not a public change feed."
source = "ROADMAP.md#next"
release = "0.6.0"
roadmap = "next"

[extra.groups.rows.cells.cloudflare]
status = "unknown"
note = "Reviewed storage API does not specify a resumable public database change feed."
source = "https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/"

[extra.groups.rows.cells.celld]
status = "unknown"
note = "LTX is replication history; reviewed docs do not specify a public resumable state change feed."
source = "https://github.com/denoland/celld/blob/main/docs/guarantees.md"

[extra.groups.rows.cells.rivet]
status = "partial"
note = "Typed realtime events can publish changes; these are application events, not a documented resumable SQLite CDC feed."
source = "https://rivet.dev/actors/docs/events/"

[extra.groups.rows.cells.golem]
status = "built"
note = "Oplog processor plugins receive agent operation history; this is an execution feed rather than SQL row CDC."
source = "https://learn.golem.cloud/v1.6/operate/plugins"

[extra.groups.rows.cells.orleans]
status = "partial"
note = "Application-published streams with provider-dependent replay; not automatic database change capture."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/streaming/"

[extra.groups.rows.cells.dapr]
status = "unknown"
note = "Actor docs do not specify a resumable state-change feed; pub/sub is a separate building block."
source = "https://docs.dapr.io/reference/api/actors_api/"

[extra.groups.rows.cells.restate]
status = "unknown"
note = "Introspection exposes state/journals, but reviewed docs do not specify a resumable state-change feed."
source = "https://docs.restate.dev/services/introspection"

[extra.groups.rows.cells.temporal]
status = "partial"
note = "Workflow Streams provides a durable application event channel in public preview; not database CDC."
source = "https://docs.temporal.io/develop/dotnet/workflows/workflow-streams"

[[extra.groups]]
id = "runtime"
name = "Runtime"

[[extra.groups.rows]]
name = "WebSockets"
[extra.groups.rows.cells.wasmkeep]
status = "built"
note = "Survive hibernation; reconnect after a move or node loss."
source = "docs/concepts.md#websockets"

[extra.groups.rows.cells.cloudflare]
status = "built"
note = "Hibernation keeps inbound WebSockets connected while the object leaves memory."
source = "https://developers.cloudflare.com/durable-objects/best-practices/websockets/"

[extra.groups.rows.cells.celld]
status = "built"
note = "Hibernating inbound sockets survive same-node eviction; movement closes sockets and clients reconnect."
source = "https://github.com/denoland/celld/blob/main/docs/services/durable-objects.md"

[extra.groups.rows.cells.rivet]
status = "built"
note = "Typed realtime connections and low-level WebSocket handlers."
source = "https://rivet.dev/actors/docs/lifecycle/"

[extra.groups.rows.cells.golem]
status = "partial"
note = "Outbound WebSocket client plus generated streaming-method WebSocket transport; not the same API as hibernating room sockets."
source = "https://learn.golem.cloud/v1.6/invoke/bridge-libraries"

[extra.groups.rows.cells.orleans]
status = "partial"
note = "Use an ASP.NET Core WebSocket endpoint around grains; socket lifetime belongs to the web host."
source = "https://learn.microsoft.com/en-us/aspnet/core/fundamentals/websockets?view=aspnetcore-10.0"

[extra.groups.rows.cells.dapr]
status = "no"
note = "Actor invocation uses HTTP/gRPC calls; no actor-owned WebSocket or socket-hibernation API."
source = "https://docs.dapr.io/reference/api/actors_api/"

[extra.groups.rows.cells.restate]
status = "unknown"
note = "Reviewed service/invocation docs do not specify actor-owned WebSockets or hibernation."
source = "https://docs.restate.dev/foundations/key-concepts"

[extra.groups.rows.cells.temporal]
status = "unknown"
note = "Reviewed SDK docs do not define workflow-owned WebSockets or hibernation; application gateways are separate."
source = "https://docs.temporal.io/encyclopedia/architecture/temporal-sdks"

[[extra.groups.rows]]
name = "Alarms / timers"
[extra.groups.rows.cells.wasmkeep]
status = "built"
note = "One pending alarm per actor; persistent, at least once. Queue multiple timers in SQLite."
source = "docs/concepts.md#alarms"

[extra.groups.rows.cells.cloudflare]
status = "built"
note = "One persistent alarm per object; at-least-once execution with retries."
source = "https://developers.cloudflare.com/durable-objects/api/alarms/"

[extra.groups.rows.cells.celld]
status = "built"
note = "Persistent per-object alarms; Cron Triggers also run scheduled Worker handlers."
source = "https://github.com/denoland/celld/blob/main/docs/services/durable-objects.md"

[extra.groups.rows.cells.rivet]
status = "built"
note = "Durable one-shot actions, cron expressions and fixed-interval schedules survive sleep and restarts."
source = "https://rivet.dev/actors/docs/schedule/"

[extra.groups.rows.cells.golem]
status = "built"
note = "Durable scheduled agent invocations, including future fire-and-forget calls with idempotency keys."
source = "https://learn.golem.cloud/v1.6/how-to-guides/ts/golem-schedule-agent-ts"

[extra.groups.rows.cells.orleans]
status = "built"
note = "Durable reminders and non-durable grain timers."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/overview"

[extra.groups.rows.cells.dapr]
status = "built"
note = "Named durable reminders via Scheduler; timers stop when the actor deactivates."
source = "https://docs.dapr.io/developing-applications/building-blocks/actors/actors-timers-reminders/"

[extra.groups.rows.cells.restate]
status = "built"
note = "Durable sleep, delayed calls and timeouts survive restarts."
source = "https://docs.restate.dev/develop/ts/durable-timers"

[extra.groups.rows.cells.temporal]
status = "built"
note = "Durable timers and workflow scheduling; sleeping workflows do not occupy a worker thread."
source = "https://docs.temporal.io/develop/typescript/workflows/timers"

[[extra.groups.rows]]
name = "Workflows"
[extra.groups.rows.cells.wasmkeep]
status = "partial"
note = "Durable workflow SDK pattern: Rust and TypeScript runners; Go, Python, C and Zig clients."
source = "ROADMAP.md#m4-operating-a-cluster"

[extra.groups.rows.cells.cloudflare]
status = "built"
note = "Cloudflare Workflows is a separate managed durable-step service, with retries, sleeps and events."
source = "https://developers.cloudflare.com/workflows/"

[extra.groups.rows.cells.celld]
status = "built"
note = "Workers-compatible Workflows: durable steps, sleeps, events, pause and restart."
source = "https://github.com/denoland/celld/blob/main/docs/services/workflows.md"

[extra.groups.rows.cells.rivet]
status = "built"
note = "Rivet Workflows provides persisted steps, replay, sleeps and actor-local SQLite progress."
source = "https://rivet.dev/docs/"

[extra.groups.rows.cells.golem]
status = "built"
note = "Durable execution records host interactions and resumes interrupted programs, without explicit workflow-step wrappers."
source = "https://learn.golem.cloud/v1.6/concepts/durable-execution"

[extra.groups.rows.cells.orleans]
status = "partial"
note = "Durable Jobs and journaling packages are preview; not equivalent to a stable workflow platform."
source = "https://github.com/dotnet/orleans/releases/tag/v10.4.0"

[extra.groups.rows.cells.dapr]
status = "built"
note = "Dapr Workflow is a separate durable execution building block implemented using actors."
source = "https://docs.dapr.io/developing-applications/building-blocks/workflow/workflow-overview/"

[extra.groups.rows.cells.restate]
status = "built"
note = "Native workflows, durable steps, promises and recovery by journal replay."
source = "https://docs.restate.dev/foundations/services"

[extra.groups.rows.cells.temporal]
status = "built"
note = "Core abstraction: durable workflows, activities, retries, child workflows and history replay."
source = "https://docs.temporal.io/workflow-execution"

[[extra.groups.rows]]
name = "Actor-to-actor calls"
[extra.groups.rows.cells.wasmkeep]
status = "built"
note = "Same-tenant HTTP-shaped calls, routed across nodes; cyclic call chains refused."
source = "docs/concepts.md#calls-between-actors"

[extra.groups.rows.cells.cloudflare]
status = "built"
note = "Object stubs expose remote methods; typed RPC is available within Workers."
source = "https://developers.cloudflare.com/workers/runtime-apis/rpc/typescript/"

[extra.groups.rows.cells.celld]
status = "built"
note = "Object stub fetch and RPC route to the owning node; some RPC compatibility limits apply."
source = "https://github.com/denoland/celld/blob/main/docs/services/durable-objects.md"

[extra.groups.rows.cells.rivet]
status = "built"
note = "Typed c.client() calls reach other actors."
source = "https://rivet.dev/actors/docs/actions/"

[extra.groups.rows.cells.golem]
status = "built"
note = "Typed cross-agent calls with durable execution; agents may be written in different supported languages."
source = "https://learn.golem.cloud/v1.6/develop/rpc"

[extra.groups.rows.cells.orleans]
status = "built"
note = "Typed grain references route asynchronous calls between silos."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/grains/request-scheduling"

[extra.groups.rows.cells.dapr]
status = "built"
note = "Actor calls route through sidecars using placement information."
source = "https://docs.dapr.io/developing-applications/building-blocks/actors/actors-features-concepts/"

[extra.groups.rows.cells.restate]
status = "built"
note = "Durable request/response calls, one-way sends and delayed messages to keyed objects."
source = "https://docs.restate.dev/develop/ts/service-communication"

[extra.groups.rows.cells.temporal]
status = "partial"
note = "Signals and child workflows communicate durably; not ordinary synchronous actor RPC."
source = "https://docs.temporal.io/child-workflows"

[[extra.groups.rows]]
name = "Placement / manual moves"
[extra.groups.rows.cells.wasmkeep]
status = "built"
note = "First request claims an unowned actor. Manual move and node drain; no load-based placement."
source = "docs/failover-and-scaling.md#how-it-scales"

[extra.groups.rows.cells.cloudflare]
status = "partial"
note = "Initial location hints and jurisdiction controls; docs say objects do not change location after creation."
source = "https://developers.cloudflare.com/durable-objects/reference/data-location/"

[extra.groups.rows.cells.celld]
status = "built"
note = "New cells start on the receiving node; overload forwards activation, and drain hands ownership off."
source = "https://github.com/denoland/celld/blob/main/docs/README.md#add-nodes"

[extra.groups.rows.cells.rivet]
status = "built"
note = "Control-plane scheduling plus explicit sleep and reschedule endpoints for fresh placement."
source = "https://rivet.dev/actors/docs/lifecycle/"

[extra.groups.rows.cells.golem]
status = "partial"
note = "Shard manager assigns and rebalances executor shards; not a documented per-agent manual placement control."
source = "https://learn.golem.cloud/v1.6/operate/shard-manager"

[extra.groups.rows.cells.orleans]
status = "built"
note = "Configurable placement policies, including CPU/memory-aware placement."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/grains/grain-placement"

[extra.groups.rows.cells.dapr]
status = "built"
note = "Placement partitions actor IDs across hosts and redistributes when hosts join or leave."
source = "https://docs.dapr.io/developing-applications/building-blocks/actors/actors-features-concepts/"

[extra.groups.rows.cells.restate]
status = "built"
note = "Partition/log placement, cluster scaling and operational reconfiguration; handlers run on separate service hosts."
source = "https://docs.restate.dev/server/clusters"

[extra.groups.rows.cells.temporal]
status = "partial"
note = "Task queues route work to worker pools and balance available capacity; no per-actor manual-move primitive."
source = "https://docs.temporal.io/task-queue"

[[extra.groups.rows]]
name = "Rebalancing at wake-up"
[extra.groups.rows.cells.wasmkeep]
status = "planned"
note = "Placement using available capacity. Automatic moves of running actors are later, on demand."
source = "ROADMAP.md#next"
release = "0.6.0"
roadmap = "next"

[extra.groups.rows.cells.cloudflare]
status = "no"
note = "No documented capacity-based relocation on wake; current docs say locations remain fixed after creation."
source = "https://developers.cloudflare.com/durable-objects/reference/data-location/"

[extra.groups.rows.cells.celld]
status = "built"
note = "Automatic weighted balancing moves hibernated cells; resident cells wait for hibernation and sockets reconnect after moves."
source = "https://github.com/denoland/celld/blob/main/docs/README.md#add-nodes"

[extra.groups.rows.cells.rivet]
status = "partial"
note = "Sleep / wake and explicit rescheduling exist; the reviewed lifecycle docs do not promise capacity-aware balancing on every wake."
source = "https://rivet.dev/actors/docs/lifecycle/"

[extra.groups.rows.cells.golem]
status = "partial"
note = "Shards rebalance when executors join or leave; not specifically capacity-based per-agent wake-up placement."
source = "https://learn.golem.cloud/v1.6/operate/shard-manager"

[extra.groups.rows.cells.orleans]
status = "built"
note = "Resource-optimized activation placement; automatic activation rebalancing is also available."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/overview"

[extra.groups.rows.cells.dapr]
status = "partial"
note = "Dynamic hash-based placement and migration; not documented as capacity-based selection on each wake-up."
source = "https://docs.dapr.io/developing-applications/building-blocks/actors/actors-features-concepts/"

[extra.groups.rows.cells.restate]
status = "partial"
note = "Cluster rebalances partitions; stateless service handlers can run elsewhere. Not an actor wake-up placement API."
source = "https://docs.restate.dev/server/clusters"

[extra.groups.rows.cells.temporal]
status = "partial"
note = "Tasks go to available workers; workflow execution can resume elsewhere, rather than relocating a resident actor."
source = "https://docs.temporal.io/task-queue"

[[extra.groups.rows]]
name = "Broadcast / fan-out patterns"
[extra.groups.rows.cells.wasmkeep]
status = "partial"
note = "Today: loop over sockets; batches of up to 16 actor calls in Rust / TypeScript. Managed broadcast groups and fan-out trees are planned."
source = "docs/concepts.md#calls-between-actors"
release = "0.6.0"
roadmap = "next"

[extra.groups.rows.cells.cloudflare]
status = "partial"
note = "Documented room pattern loops over sockets, with tagged connection lookup; application code builds cross-object fan-out."
source = "https://developers.cloudflare.com/durable-objects/best-practices/websockets/"

[extra.groups.rows.cells.celld]
status = "partial"
note = "Workers WebSocket / object-call patterns; application code builds broadcasts and cross-cell fan-out."
source = "https://github.com/denoland/celld/blob/main/docs/services/durable-objects.md"

[extra.groups.rows.cells.rivet]
status = "built"
note = "Typed c.broadcast events and per-connection sends; copy-on-write forks support fan-out work."
source = "https://rivet.dev/actors/docs/events/"

[extra.groups.rows.cells.golem]
status = "built"
note = "Parallel agent calls support fan-out / fan-in; streams communicate results to clients."
source = "https://learn.golem.cloud/v1.6/how-to-guides/ts/golem-parallel-workers-ts"

[extra.groups.rows.cells.orleans]
status = "built"
note = "Streams provide publish/subscribe across grains and clients, with multiple provider integrations."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/streaming/"

[extra.groups.rows.cells.dapr]
status = "partial"
note = "Dapr pub/sub supports fan-out through a broker; actor routing from subscribers is application code."
source = "https://docs.dapr.io/developing-applications/building-blocks/pubsub/pubsub-overview/"

[extra.groups.rows.cells.restate]
status = "built"
note = "Durable parallel calls and result aggregation; application code defines the fan-out recipients."
source = "https://docs.restate.dev/develop/ts/concurrent-tasks"

[extra.groups.rows.cells.temporal]
status = "built"
note = "Parallel activities/child workflows and fan-out trees; history limits shape large fan-outs."
source = "https://docs.temporal.io/child-workflows"

[[extra.groups]]
id = "operations"
name = "Operations"

[[extra.groups.rows]]
name = "Self-hosted"
[extra.groups.rows.cells.wasmkeep]
status = "built"
note = "Your servers and bucket; one region per cluster."
source = "README.md#who-it-is-for"

[extra.groups.rows.cells.cloudflare]
status = "partial"
note = "workerd can be self-hosted; it is the runtime, not Cloudflare’s managed distributed service."
source = "https://github.com/cloudflare/workerd"

[extra.groups.rows.cells.celld]
status = "built"
note = "Run your own nodes and object-storage bucket."
source = "https://github.com/denoland/celld/blob/main/README.md"

[extra.groups.rows.cells.rivet]
status = "built"
note = "Self-host control-plane instances, disks, bucket and application nodes."
source = "https://rivet.dev/docs/deploy/self-host/control-plane/"

[extra.groups.rows.cells.golem]
status = "built"
note = "Self-hosted all-in-one and multi-service deployment modes."
source = "https://learn.golem.cloud/v1.6/deploy/server"

[extra.groups.rows.cells.orleans]
status = "built"
note = "Run silos on your machines, VMs or Kubernetes."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/overview"

[extra.groups.rows.cells.dapr]
status = "built"
note = "Self-hosted VMs, local processes or Kubernetes."
source = "https://docs.dapr.io/operations/hosting/self-hosted/self-hosted-overview/"

[extra.groups.rows.cells.restate]
status = "built"
note = "Single-node or clustered deployments on your infrastructure."
source = "https://docs.restate.dev/server/overview"

[extra.groups.rows.cells.temporal]
status = "built"
note = "Self-host the Temporal service and persistence database with your application workers."
source = "https://docs.temporal.io/temporal-service/persistence"

[[extra.groups.rows]]
name = "Single binary"
[extra.groups.rows.cells.wasmkeep]
status = "built"
note = "One WasmKeep binary per node, plus your components. A cluster also needs a bucket."
source = "README.md#why-wasmkeep"

[extra.groups.rows.cells.cloudflare]
status = "partial"
note = "workerd is a runnable binary; the hosted Cloudflare platform is not a single downloadable cluster binary."
source = "https://github.com/cloudflare/workerd"

[extra.groups.rows.cells.celld]
status = "built"
note = "One daemon per node embeds V8; Worker deployment additionally needs esbuild."
source = "https://github.com/denoland/celld/blob/main/README.md"

[extra.groups.rows.cells.rivet]
status = "partial"
note = "One control-plane engine image runs all services, but application nodes remain separate processes."
source = "https://rivet.dev/docs/deploy/self-host/control-plane/"

[extra.groups.rows.cells.golem]
status = "built"
note = "golem server run hosts all services in one process; production persistence depends on deployment mode."
source = "https://learn.golem.cloud/v1.6/deploy/server"

[extra.groups.rows.cells.orleans]
status = "partial"
note = "Embedded .NET framework; package your application host. Production storage/clustering dependencies depend on providers."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/quickstarts/build-your-first-orleans-app"

[extra.groups.rows.cells.dapr]
status = "no"
note = "Application plus sidecar, placement/Scheduler services and state store; not one standalone server binary."
source = "https://docs.dapr.io/operations/hosting/self-hosted/self-hosted-overview/"

[extra.groups.rows.cells.restate]
status = "built"
note = "One server binary with cluster roles; application services are separate processes."
source = "https://docs.restate.dev/server/overview"

[extra.groups.rows.cells.temporal]
status = "partial"
note = "CLI bundles a development server; production adds database and application workers."
source = "https://github.com/temporalio/temporal"

[[extra.groups.rows]]
name = "Bucket backends"
[extra.groups.rows.cells.wasmkeep]
status = "built"
note = "S3-compatible API; R2 and OVHcloud measured. Native GCS / Azure are on hold, with no release assigned."
source = "ROADMAP.md#later-on-demand"

[extra.groups.rows.cells.cloudflare]
status = "no"
note = "Object state uses Cloudflare-managed storage, not a selectable replication bucket; R2 is a separate binding."
source = "https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/"

[extra.groups.rows.cells.celld]
status = "built"
note = "S3-compatible, Google Cloud Storage and Azure Blob Storage; provider credential and consistency limits apply."
source = "https://github.com/denoland/celld/blob/main/docs/limitations.md"

[extra.groups.rows.cells.rivet]
status = "built"
note = "S3-compatible, Google Cloud Storage and Azure Blob Storage backends."
source = "https://rivet.dev/docs/deploy/self-host/control-plane/storage/"

[extra.groups.rows.cells.golem]
status = "partial"
note = "S3-compatible blob storage, local files or SQLite; other persistence layers are also needed depending on deployment."
source = "https://learn.golem.cloud/v1.6/operate/persistence"

[extra.groups.rows.cells.orleans]
status = "partial"
note = "Azure Blob persistence; preview S3 journal provider. Not a universal bucket-only cluster architecture."
source = "https://github.com/dotnet/orleans/releases/tag/v10.4.0"

[extra.groups.rows.cells.dapr]
status = "partial"
note = "Object-store bindings exist, but actor state requires a transactional, ETag-capable store."
source = "https://docs.dapr.io/reference/components-reference/supported-state-stores/"

[extra.groups.rows.cells.restate]
status = "built"
note = "Snapshot repositories support S3-compatible, GCS and Azure Blob storage."
source = "https://docs.restate.dev/server/snapshots"

[extra.groups.rows.cells.temporal]
status = "partial"
note = "Cloud history export supports S3, GCS and Azure Blob; live service state still needs its persistence database."
source = "https://docs.temporal.io/cloud/export"

[[extra.groups.rows]]
name = "Managed cloud"
[extra.groups.rows.cells.wasmkeep]
status = "no"
note = "No hosted WasmKeep service; not planned."
source = "ROADMAP.md#not-planned"

[extra.groups.rows.cells.cloudflare]
status = "built"
note = "Cloudflare operates the Workers / Durable Objects platform."
source = "https://developers.cloudflare.com/durable-objects/"

[extra.groups.rows.cells.celld]
status = "no"
note = "Self-hosted daemon; no account service, managed ingress or hosted fleet service provided."
source = "https://github.com/denoland/celld/blob/main/docs/limitations.md"

[extra.groups.rows.cells.rivet]
status = "built"
note = "Rivet Cloud and managed BYOC are documented deployment options."
source = "https://github.com/rivet-dev/rivet"

[extra.groups.rows.cells.golem]
status = "built"
note = "Hosted Golem Cloud available, managed through CLI and REST API."
source = "https://learn.golem.cloud/v1.6/deploy/golem-cloud"

[extra.groups.rows.cells.orleans]
status = "partial"
note = "Deploy on managed Azure hosting, but operate the Orleans application and its storage."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/overview"

[extra.groups.rows.cells.dapr]
status = "partial"
note = "Dapr ecosystem offers Diagrid Catalyst Cloud; managed workflows/agents are not the same product as raw self-hosted actors."
source = "https://docs.dapr.io/integrations/diagrid/catalyst"

[extra.groups.rows.cells.restate]
status = "built"
note = "Restate Cloud; BYOC also documented."
source = "https://docs.restate.dev/server/overview"

[extra.groups.rows.cells.temporal]
status = "built"
note = "Temporal Cloud with managed service operations and documented SLAs."
source = "https://docs.temporal.io/cloud"

[[extra.groups.rows]]
name = "Inspector / dashboard"
[extra.groups.rows.cells.wasmkeep]
status = "partial"
note = "CLI status, Prometheus metrics and a Grafana dashboard today. Authenticated read-only inspector planned."
source = "ROADMAP.md#next"
release = "0.6.0"
roadmap = "next"

[extra.groups.rows.cells.cloudflare]
status = "built"
note = "Dashboard metrics and Data Studio SQL inspection; Data Studio is beta."
source = "https://developers.cloudflare.com/durable-objects/observability/data-studio/"

[extra.groups.rows.cells.celld]
status = "partial"
note = "CLI diagnose / cell listing, operator state endpoint and telemetry; no documented graphical actor inspector."
source = "https://github.com/denoland/celld/blob/main/README.md#operate-a-fleet"

[extra.groups.rows.cells.rivet]
status = "built"
note = "Dashboard plus actor gateway inspection endpoints for metadata, health and actions."
source = "https://rivet.dev/actors/docs/debugging/"

[extra.groups.rows.cells.golem]
status = "built"
note = "CLI state, logs and oplog inspection, including a local interactive browser viewer."
source = "https://learn.golem.cloud/v1.6/debug"

[extra.groups.rows.cells.orleans]
status = "built"
note = "Built-in Orleans Dashboard in 10.x for grains, silos and cluster monitoring."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/overview"

[extra.groups.rows.cells.dapr]
status = "built"
note = "Dev Dashboard can inspect actor types, active counts and actor state."
source = "https://docs.dapr.io/developing-applications/building-blocks/actors/actors-overview/"

[extra.groups.rows.cells.restate]
status = "built"
note = "UI, CLI and SQL introspection of invocations, journals and application state."
source = "https://docs.restate.dev/services/introspection"

[extra.groups.rows.cells.temporal]
status = "built"
note = "Web UI with event history, execution actions, worker visibility and debugging views."
source = "https://docs.temporal.io/web-ui"

[[extra.groups.rows]]
name = "Typed application clients"
[extra.groups.rows.cells.wasmkeep]
status = "planned"
note = "Typed TypeScript actor clients first; typed Rust clients follow in 0.6.0. Existing SDK helpers are not that client layer."
source = "ROADMAP.md#now"
release = "0.5.0"
roadmap = "now"

[extra.groups.rows.cells.cloudflare]
status = "partial"
note = "Typed TypeScript RPC stubs inside Workers; browser applications still need an exposed API."
source = "https://developers.cloudflare.com/workers/runtime-apis/rpc/typescript/"

[extra.groups.rows.cells.celld]
status = "unknown"
note = "Workers-compatible RPC is documented, but a generated typed external application-client layer is not specified."
source = "https://github.com/denoland/celld/blob/main/docs/cloudflare-compat.md"

[extra.groups.rows.cells.rivet]
status = "built"
note = "TypeScript clients infer action arguments and results from the registry; additional client SDKs are documented."
source = "https://rivet.dev/actors/docs/actions/"

[extra.groups.rows.cells.golem]
status = "built"
note = "Generated external bridge clients for Rust, TypeScript / Effect, Scala, MoonBit and Go."
source = "https://learn.golem.cloud/v1.6/invoke/bridge-libraries"

[extra.groups.rows.cells.orleans]
status = "built"
note = "Typed grain interfaces and generated client proxies."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/quickstarts/build-your-first-orleans-app"

[extra.groups.rows.cells.dapr]
status = "built"
note = "SDK actor proxies; the TypeScript guide shares a typed host/client contract."
source = "https://docs.dapr.io/developing-applications/sdks/js/js-actors/js-actors-howto/"

[extra.groups.rows.cells.restate]
status = "built"
note = "Typed SDK clients, including TypeScript object/workflow clients."
source = "https://docs.restate.dev/services/invocation/clients/typescript-sdk"

[extra.groups.rows.cells.temporal]
status = "built"
note = "Typed SDK clients for workflow starts, queries, signals and updates; typing differs by language."
source = "https://docs.temporal.io/develop/typescript/workflows/message-passing"

[[extra.groups.rows]]
name = "Framework quickstarts"
[extra.groups.rows.cells.wasmkeep]
status = "planned"
note = "One framework quickstart. Today: wasmkeep new scaffolds Rust / TypeScript apps; full framework example follows in 0.6.0."
source = "ROADMAP.md#now"
release = "0.5.0"
roadmap = "now"

[extra.groups.rows.cells.cloudflare]
status = "built"
note = "Workers deployment guides for React, Next.js, SvelteKit, Hono and other frameworks."
source = "https://developers.cloudflare.com/workers/framework-guides/"

[extra.groups.rows.cells.celld]
status = "partial"
note = "Wrangler-compatible deployment and service examples; no dedicated frontend-framework quickstart specified."
source = "https://github.com/denoland/celld/blob/main/README.md#what-runs-on-celld"

[extra.groups.rows.cells.rivet]
status = "built"
note = "Node.js / Bun, React / Next.js, Rust and Effect quickstarts."
source = "https://rivet.dev/actors/docs/"

[extra.groups.rows.cells.golem]
status = "partial"
note = "Language quickstarts and generated clients; a dedicated web-framework quickstart is not specified in the reviewed guide."
source = "https://learn.golem.cloud/v1.6/quickstart"

[extra.groups.rows.cells.orleans]
status = "built"
note = "ASP.NET Core quickstart and Aspire integration."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/quickstarts/build-your-first-orleans-app"

[extra.groups.rows.cells.dapr]
status = "built"
note = "Documented SDK host/client walkthroughs; framework and language support varies."
source = "https://docs.dapr.io/developing-applications/sdks/js/js-actors/js-actors-howto/"

[extra.groups.rows.cells.restate]
status = "built"
note = "Spring Boot starter and Java/Kotlin quickstart templates."
source = "https://docs.restate.dev/develop/java/spring-boot"

[extra.groups.rows.cells.temporal]
status = "built"
note = "Language quickstarts and Spring Boot integration."
source = "https://docs.temporal.io/develop/java/integrations/spring-boot-integration"

[[extra.groups]]
id = "project"
name = "Project"

[[extra.groups.rows]]
name = "Licence"
[extra.groups.rows.cells.wasmkeep]
status = "built"
note = "Apache-2.0; dependencies carry their own notices."
source = "README.md#license"

[extra.groups.rows.cells.cloudflare]
status = "built"
note = "workerd is Apache-2.0; the hosted service has separate Cloudflare terms."
source = "https://github.com/cloudflare/workerd"

[extra.groups.rows.cells.celld]
status = "built"
note = "Apache-2.0."
source = "https://github.com/denoland/celld/blob/main/LICENSE"

[extra.groups.rows.cells.rivet]
status = "built"
note = "Apache-2.0 for the current repository."
source = "https://github.com/rivet-dev/rivet/blob/main/LICENSE"

[extra.groups.rows.cells.golem]
status = "built"
note = "Server uses BSL 1.1 with an additional use grant restricting competing hosted developer-platform services."
source = "https://github.com/golemcloud/golem/blob/main/LICENSE"

[extra.groups.rows.cells.orleans]
status = "built"
note = "MIT."
source = "https://github.com/dotnet/orleans"

[extra.groups.rows.cells.dapr]
status = "built"
note = "Apache-2.0."
source = "https://github.com/dapr/dapr"

[extra.groups.rows.cells.restate]
status = "built"
note = "Server: BSL 1.1, converting to Apache-2.0 after four years; public Restate platform services are restricted."
source = "https://github.com/restatedev/restate/blob/main/LICENSE"

[extra.groups.rows.cells.temporal]
status = "built"
note = "MIT server licence; cloud service terms are separate."
source = "https://github.com/temporalio/temporal"

[[extra.groups.rows]]
name = "Open contribution"
[extra.groups.rows.cells.wasmkeep]
status = "built"
note = "Pull requests welcome; first contribution requires a CLA."
source = "README.md#contributing"

[extra.groups.rows.cells.cloudflare]
status = "partial"
note = "Contributions accepted to workerd; the hosted platform is separately operated."
source = "https://github.com/cloudflare/workerd"

[extra.groups.rows.cells.celld]
status = "partial"
note = "Pull requests disabled; focused emailed patches accepted under the project’s rights-assignment terms."
source = "https://github.com/denoland/celld/blob/main/README.md#contributions"

[extra.groups.rows.cells.rivet]
status = "built"
note = "Public repository accepts pull requests and issues."
source = "https://github.com/rivet-dev/rivet"

[extra.groups.rows.cells.golem]
status = "partial"
note = "First pull request requires maintainer vouching; contribution guide documents the process."
source = "https://github.com/golemcloud/golem/blob/main/CONTRIBUTING.md"

[extra.groups.rows.cells.orleans]
status = "built"
note = "Public contribution guide and pull requests."
source = "https://github.com/dotnet/orleans"

[extra.groups.rows.cells.dapr]
status = "built"
note = "Public contribution guide and community development."
source = "https://github.com/dapr/dapr"

[extra.groups.rows.cells.restate]
status = "built"
note = "Public contributions, including issues and pull requests, explicitly welcomed."
source = "https://github.com/restatedev/restate/blob/main/README.md#contributing"

[extra.groups.rows.cells.temporal]
status = "built"
note = "Public contribution guide and pull requests welcomed."
source = "https://github.com/temporalio/temporal"

[[extra.groups.rows]]
name = "Maturity / version"
[extra.groups.rows.cells.wasmkeep]
status = "partial"
note = "0.4.2 pre-alpha pre-release. For evaluation, side projects and staging; not a stable production release."
source = "CHANGELOG.md#042"

[extra.groups.rows.cells.cloudflare]
status = "built"
note = "Managed service; SQLite storage and SQL API are generally available. Individual features may remain beta."
source = "https://developers.cloudflare.com/durable-objects/"

[extra.groups.rows.cells.celld]
status = "partial"
note = "v0.6.3 beta; current limitations include one application per fleet and private-network requirements."
source = "https://github.com/denoland/celld/blob/main/docs/limitations.md"

[extra.groups.rows.cells.rivet]
status = "partial"
note = "Current 3.0 storage architecture was introduced as a preview; read the self-host production and recovery limitations."
source = "https://rivet.dev/blog/"

[extra.groups.rows.cells.golem]
status = "built"
note = "Versioned v1.6 documentation and hosted service; evaluate deployment-mode limits for production use."
source = "https://learn.golem.cloud/v1.6/"

[extra.groups.rows.cells.orleans]
status = "built"
note = "Orleans 10.x; long-running Microsoft production use. Preview packages have separate maturity."
source = "https://learn.microsoft.com/en-us/dotnet/orleans/overview"

[extra.groups.rows.cells.dapr]
status = "built"
note = "Current docs target Dapr 1.19; 1.20 is explicitly preview."
source = "https://docs.dapr.io/developing-applications/building-blocks/actors/actors-overview/"

[extra.groups.rows.cells.restate]
status = "built"
note = "Documented single-node and high-availability production deployment choices; assess each SDK separately."
source = "https://docs.restate.dev/server/overview"

[extra.groups.rows.cells.temporal]
status = "built"
note = "Mature workflow platform with managed cloud; individual newer features are explicitly preview."
source = "https://github.com/temporalio/temporal"

+++
