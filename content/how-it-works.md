+++
title = "How it works"
description = "Clients, a load balancer, nodes running the same front, actors with their own SQLite database, and a bucket."
+++

{{<cluster_diagram />}}

A WasmKeep **app** is a front and a set of actor classes, deployed together
as one version.

- **Clients** reach any node through a **load balancer**. Every node runs
  the same **front**: a stateless WebAssembly component that serves pages
  and APIs, like this site.
- **Any front calls any actor.** An actor is addressed by its class and its
  name (`rust/wall`). The node a request lands on finds the node that holds
  the actor and forwards the call once; the caller never needs to know
  where an actor lives.
- **Actors of the same classes run across the nodes.** Each actor is on one
  node at a time and handles one event at a time, so its code never races
  with itself. Idle actors leave memory and come back in about a
  millisecond.
- **Each actor has its own SQLite database**, on the node's disk, written
  with plain SQL.
- **Every database is replicated to an object storage bucket**, any
  S3-compatible one. When a node dies, its actors are restored from the
  bucket on the other nodes.

The details, with their limits and measured numbers, are in the
documentation: [concepts](https://docs.wasmkeep.dev/concepts.html),
[running a cluster](https://docs.wasmkeep.dev/cluster.html) and
[when a node dies](https://docs.wasmkeep.dev/failover-and-scaling.html).

## This site

This site is a WasmKeep app. Its front is a Rust component that serves
these pages, built with [Zola](https://www.getzola.org/) and embedded at
build time, and the language wall's API. Each counter on the wall is an
actor of its language's class, `wall` by name, reached only by the front.
`GET /api/wall` reads every counter with one batch of calls, and
`POST /api/wall/<language>` adds one. The source is
[on GitHub](https://github.com/WasmKeep/website).
