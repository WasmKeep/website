// Deterministic WasmKeep 0.4.2 teaching model: no DOM, IO or wall clock.
// docs/cluster.md (ownership, failover waits, moves and drains), docs/concepts.md.
// Packets and lifecycle operations share one clock. Presentation hops are NOT
// measured latencies. The scene deliberately idles until the visitor acts.
(() => {
  "use strict";
  const INITIAL = ["room/42", "user/ada", "tenant/acme", "device/7", "room/9", "user/kim"];
  const HOP = 3; // 0.6 seconds on screen at 5x; deliberately easy to follow
  class Simulation {
    constructor() {
      this.now = 0;
      this.nodes = ["a", "b", "c"].map(id => ({ id, state: "live" }));
      this.actors = INITIAL.map((id, i) => this.actor(id, this.nodes[Math.floor(i / 2)].id, 3));
      this.events = [];
      this.queue = [];
      this.current = null;
      this.lastRequest = null;
      this.load = 0;
      this.traffic = 0;
      this.route = 0;
      this.serial = 0;
      this.nextNode = 3;
      this.nextActor = 1;
      this.failures = new Map();
      this.counts = { served: 0, retry: 0, lost: 0 };
    }
    actor(id, node, value = 0) {
      return { id, node, state: "serving", local: value, saved: value, durable: value,
        lost: 0, hold: null, operation: null };
    }
    live() { return this.nodes.filter(n => n.state === "live"); }
    active() { return this.actors.filter(a => a.state !== "deleted"); }
    entry() { const nodes = this.live(); return nodes[this.route++ % nodes.length]?.id; }
    say(text) { this.events.push({ time: this.now, text }); }
    takeEvents() { return this.events.splice(0); }
    unstable() { return this.actors.some(a => a.operation) || this.nodes.some(n => n.state === "draining"); }
    busy(a) { return this.current?.actor === a && !this.current.finished; }
    canKill(id) {
      return this.nodes.some(n => n.id === id && ["live", "draining", "drained"].includes(n.state));
    }
    addNode() {
      if (this.nodes.length >= 5) return false;
      const id = String.fromCharCode(97 + this.nextNode++);
      this.nodes.push({ id, state: "live" });
      this.say(`Node ${id} added. Resident actors stay where they are.`);
      return true;
    }
    spawn() {
      if (this.active().length >= 30 || !this.live().length) return null;
      if (this.actors.length >= 30) {
        const slot = this.actors.findIndex(a => a.state === "deleted" && !this.busy(a) && !this.queue.some(r => r.actor === a));
        if (slot === -1) return null;
        this.actors.splice(slot, 1);
      }
      const a = this.actor(`room/new${this.nextActor++}`, this.entry());
      this.actors.push(a);
      this.say(`${a.id} created on node ${a.node} with an empty database.`);
      return a;
    }
    move(a, to) {
      if (!a || a.operation || !["serving", "sleeping"].includes(a.state) || a.node === to || !this.live().some(n => n.id === to)) return false;
      a.operation = { kind: "move", to, due: null };
      this.say(`${a.id}: move requested to ${to}. Finish the current event, upload, release, then restore. A move is not a pin.`);
      return true;
    }
    sleep(a) {
      if (!a || a.operation || a.state !== "serving") return false;
      a.operation = { kind: "sleep", due: null };
      this.say(`${a.id}: let it idle for 30 simulated seconds (6 seconds at the default 5× speed), then hibernate. No automatic idle timer runs elsewhere in this teaching scene.`);
      return true;
    }
    deleteActor(a) {
      if (!a || a.operation || !["serving", "sleeping"].includes(a.state)) return false;
      a.operation = { kind: "delete", due: null };
      this.say(`${a.id}: finish its event, record the delete in the bucket, then erase its history.`);
      return true;
    }
    drain(id, remove = false) {
      const n = this.nodes.find(n => n.id === id);
      if (!n || n.state !== "live" || this.live().length < 2 || this.unstable()) return false;
      n.state = "draining";
      n.removeWhenDrained = remove;
      this.say(`Node ${id} draining: no new claims; finish events and upload before hand-over.`);
      return true;
    }
    remove(id) {
      const n = this.nodes.find(n => n.id === id);
      if (!n || this.nodes.length === 1) return false;
      if (n.state === "live") return this.drain(id, true);
      if (!["drained", "fenced"].includes(n.state) || this.actors.some(a => a.node === id) || this.current?.via === id) return false;
      this.nodes.splice(this.nodes.indexOf(n), 1);
      this.failures.delete(id);
      this.say(`Node ${id} stopped and removed from this diagram. This does not erase bucket history.`);
      return true;
    }
    kill(id) {
      if (!this.canKill(id)) return false;
      this.nodes.find(n => n.id === id).state = "dead";
      this.failures.set(id, { id, at: this.now, phase: "lease", seen: new Set() });
      let lost = 0;
      for (const a of this.actors.filter(a => a.node === id)) {
        const plainReplyInFlight = this.current?.actor === a && this.current.method === "POST" && this.current.mode === "plain" && this.current.responseLeftOwner;
        const delta = a.plainAcknowledged || plainReplyInFlight ? a.local - a.saved : 0;
        a.lost += delta;
        lost += delta;
        a.plainAcknowledged = false;
        a.local = a.saved;
        a.state = "stranded";
        a.operation = null;
        a.recover = true;
        a.hold = null;
      }
      // Invalidate the old process now, even if restart is clicked before the
      // next clock tick. A new process cannot finish the old process's event.
      const r = this.current;
      if (r?.via === id && !r.responseLeftIngress) this.retry(r, "entry node killed", true);
      else if (r?.owner === id) {
        if (r.acknowledged) { r.steps = []; r.step = null; }
        else if (!r.responseLeftOwner) this.retry(r, "owner killed before its answer returned");
      }
      this.counts.lost += lost;
      this.say(`Node ${id} killed just after a heartbeat. Its actors wait for the lease and grace (15 simulated seconds, sped up).`);
      this.say(this.live().length ? "No quorum needed: one live node is enough." : "All nodes down: the bucket keeps the data; restart one.");
      if (lost) this.say(`${lost} unuploaded plain write(s) lost. Acknowledged durable writes remain in the bucket.`);
      return true;
    }
    restart(id = this.nodes.find(n => ["dead", "fenced"].includes(n.state))?.id) {
      const n = this.nodes.find(n => n.id === id);
      if (!n || !["dead", "fenced"].includes(n.state)) return false;
      n.state = "live";
      if (this.failures.get(id)?.phase === "done") this.failures.delete(id);
      this.say(`Node ${id} restarted. Recover affected actors from the bucket after their old leases expire; resident actors stay put.`);
      this.recoverActors();
      return true;
    }

    // Each click is retained. Requests are illustrated one at a time so paths
    // remain legible; this is presentation pacing, not cluster throughput.
    request(a, method = "GET", via = null, mode = "durable") {
      if (!a) return null;
      const r = { id: ++this.serial, actor: a, method, mode, requestedVia: via,
        steps: [], history: [], step: null, reply: null, acknowledged: false, finished: false };
      this.queue.push(r);
      this.say(`Request ${r.id}: ${method} ${a.id}${method === "POST" ? ` (${mode})` : ""}${this.current ? " queued for the next trace" : ""}.`);
      this.startNext();
      return r;
    }
    startNext() {
      if (this.current || !this.queue.length) return;
      const r = this.current = this.queue.shift();
      r.via = r.requestedVia || this.entry();
      this.hop(r, "client", "lb", "request", "Client → load balancer");
      this.hop(r, "lb", `node:${r.via}`, "request", `Load balancer → node ${r.via}`, () => this.routeRequest(r));
    }
    hop(r, from, to, kind, label, done = null, duration = HOP) {
      r.steps.push({ from, to, kind, label, done, duration, elapsed: 0 });
    }
    routeRequest(r) {
      const a = r.actor;
      const n = this.nodes.find(n => n.id === r.via);
      if (!n || !["live", "draining", "drained"].includes(n.state)) return this.retry(r, "entry node unavailable");
      if (a.operation && !["sleep", "recover"].includes(a.operation.kind)) return this.retry(r, "actor hand-over or deletion in progress");
      if (a.operation?.kind === "sleep") {
        a.operation = null;
        this.say(`${a.id}: request cancels idle sleep.`);
      }
      if (a.state === "stranded") {
        const f = this.failures.get(a.node);
        if (f && this.now - f.at < 10 && !f.seen.has(r.via)) {
          f.seen.add(r.via);
          this.hop(r, `node:${r.via}`, `node:${a.node}`, "retry", "Forward attempt: owner is unreachable", () => this.retry(r, "first connection failure discovers the dead owner"));
          return;
        }
        if (r.method !== "GET") return this.retry(r, "owner unavailable; writes are not held or automatically retried");
        r.waitUntil = this.now + 25;
        r.waiting = true;
        this.say(`Request ${r.id} waits at node ${r.via}, up to 25 simulated seconds, for ownership to become free.`);
        return;
      }
      if (a.state === "restoring" && a.operation?.kind === "recover") {
        r.waitUntil = this.now + 25;
        r.waiting = true;
        return;
      }
      if (["sleeping", "deleted"].includes(a.state)) {
        const fresh = a.state === "deleted";
        // A parked WebSocket ownership record is still a hold. Otherwise the
        // first node to claim wins; never place on the least-loaded node.
        const owner = a.hold || (["draining", "drained"].includes(n.state) ? this.entry() : r.via);
        a.node = owner;
        a.state = "restoring";
        r.owner = owner;
        this.forward(r, () => {
          this.hop(r, `node:${owner}`, `bucket:${owner}`, "restore", fresh ? "Claim a new actor" : "Claim ownership; read saved history");
          this.hop(r, `bucket:${owner}`, `node:${owner}`, "restore", "Restore on the owner", () => {
            a.state = "serving";
            a.local = a.saved;
            this.say(`${a.id}: ${fresh ? "created empty" : "awake with saved database"} on node ${owner}${a.hold ? "; existing hold respected" : ", first to claim"}.`);
            this.deliver(r);
          });
        });
        return;
      }
      r.owner = a.node;
      this.forward(r, () => this.deliver(r));
    }
    forward(r, done) {
      if (r.owner !== r.via) this.hop(r, `node:${r.via}`, `node:${r.owner}`, "request", `Forward once over mTLS: ${r.via} → ${r.owner}`, done);
      else done();
    }
    deliver(r) {
      this.hop(r, `node:${r.owner}`, `actor:${r.actor.id}`, "request", `${r.actor.id} handles one event`, () => {
        if (r.method === "POST") {
          r.actor.local++;
          if (r.mode === "durable") return this.upload(r, () => {
            this.hop(r, `storage:${r.owner}`, `actor:${r.actor.id}`, "upload", "Durable commit confirmed to the actor", () => this.answer(r));
          });
        }
        this.answer(r);
      });
    }
    upload(r, done = null) {
      const a = r.actor;
      this.hop(r, `actor:${a.id}`, `storage:${r.owner}`, "upload", `Node ${r.owner}: upload the write`);
      this.hop(r, `storage:${r.owner}`, `bucket:${r.owner}`, "upload", "Owner → bucket: persist SQLite history", () => {
        a.saved = a.local;
        a.plainAcknowledged = false;
        if (r.mode === "durable") a.durable = a.saved;
      });
      this.hop(r, `bucket:${r.owner}`, `storage:${r.owner}`, "upload", "Bucket confirms the upload", done);
    }
    answer(r) {
      r.reply = 200;
      this.hop(r, `actor:${r.actor.id}`, `node:${r.owner}`, "reply", "Actor → owner: answer ready", () => { r.responseLeftOwner = true; });
      if (r.owner !== r.via) this.hop(r, `node:${r.owner}`, `node:${r.via}`, "reply", "Answer returns through the forwarding node");
      this.replyToClient(r);
    }
    replyToClient(r, fromLB = false) {
      const kind = r.reply === 503 ? "retry" : "reply";
      if (!fromLB) this.hop(r, `node:${r.via}`, "lb", kind, `${r.reply} → load balancer`, () => { r.responseLeftIngress = true; });
      this.hop(r, "lb", "client", kind, `${r.reply} → client`, () => {
        r.acknowledged = true;
        this.counts[r.reply === 200 ? "served" : "retry"]++;
        this.say(`Request ${r.id}: ${r.reply}${r.reply === 503 ? ", Retry-After: 1. No automatic retry; a 503 does not prove a write never ran." : r.method === "POST" ? r.mode === "durable" ? ", durable write acknowledged after bucket confirmation." : ", plain write acknowledged before upload. Kill its owner now to explore that window." : `, ${r.actor.id} answered from node ${r.owner}.`}`);
        if (r.reply === 200 && r.method === "POST" && r.mode === "plain") {
          r.actor.plainAcknowledged = true;
          this.hop(r, `storage:${r.owner}`, `storage:${r.owner}`, "wait", "Plain write answered; upload is still pending", () => this.upload(r), 10);
        }
      });
    }
    retry(r, reason, fromLB = false) {
      r.steps = [];
      r.step = null;
      r.waiting = false;
      r.reply = 503;
      r.owner = null;
      this.say(`Request ${r.id}: ${reason}.`);
      this.replyToClient(r, fromLB);
    }
    tickRequest(dt) {
      const r = this.current;
      if (!r) { this.startNext(); return; }
      const ingress = this.nodes.find(n => n.id === r.via);
      if (r.reply !== 503 && !r.responseLeftIngress && (!ingress || !["live", "draining", "drained"].includes(ingress.state))) {
        this.retry(r, "load balancer cannot reach the entry node", true);
      }
      const owner = this.nodes.find(n => n.id === r.owner);
      if (r.owner && (!owner || !["live", "draining", "drained"].includes(owner.state)) && (!r.responseLeftOwner || r.acknowledged)) {
        if (r.acknowledged) { r.steps = []; r.step = null; }
        else this.retry(r, "owner died before its answer returned");
      }
      if (r.waiting) {
        if (this.now >= r.waitUntil) this.retry(r, "25 s wait expired");
        else if (!["stranded", "restoring"].includes(r.actor.state)) { r.waiting = false; this.routeRequest(r); }
        else return;
      }
      if (!r.step) {
        r.step = r.steps.shift();
        if (r.step) r.history.push({ from: r.step.from, to: r.step.to, kind: r.step.kind });
      }
      if (!r.step) {
        r.finished = true;
        this.lastRequest = r;
        this.current = null;
        this.startNext();
        return;
      }
      r.step.elapsed += dt;
      if (r.step.elapsed + 1e-8 >= r.step.duration) {
        const done = r.step.done;
        r.step = null;
        if (done) done();
      }
    }
    tickOperations() {
      for (const n of [...this.nodes]) {
        if (n.state === "drained" && n.removeWhenDrained) this.remove(n.id);
      }
      for (const n of this.nodes.filter(n => n.state === "draining")) {
        const held = this.actors.filter(a => a.node === n.id);
        let slots = 16 - held.filter(a => a.operation?.kind === "move").length;
        for (const a of held) {
          if (slots > 0 && !a.operation) { this.move(a, this.entry()); slots--; }
        }
        if (!held.length) {
          n.state = "drained";
          this.say(`Node ${n.id} drained. It keeps forwarding until stopped.`);
          if (n.removeWhenDrained) this.remove(n.id);
        }
      }
      for (const a of this.actors) {
        const op = a.operation;
        if (!op || (this.busy(a) && op.kind !== "recover")) continue;
        if (["move", "recover"].includes(op.kind) && !this.live().some(n => n.id === op.to)) {
          const to = this.entry();
          if (!to) { a.operation = null; a.recover = true; a.node = null; a.state = "sleeping"; continue; }
          op.to = to;
        }
        if (op.kind === "recover") {
          if (this.now < op.due) continue;
          a.local = a.saved; a.state = "serving"; a.recover = false; a.operation = null;
          this.say(`${a.id}: restored on node ${a.node}, bucket value ${a.saved}; durable writes intact.`);
          continue;
        }
        if (op.due === null) {
          op.due = this.now + (op.kind === "sleep" ? 30 : 6);
          if (op.kind !== "sleep") a.state = op.kind === "move" ? "moving" : "deleting";
        }
        if (this.now < op.due) continue;
        a.saved = a.local;
        if (op.kind === "move") {
          a.node = op.to;
          a.hold = null;
          a.state = "serving";
          this.say(`${a.id}: uploaded, released, restored on node ${a.node}.`);
        } else if (op.kind === "sleep") {
          a.state = "sleeping";
          a.node = a.hold;
          this.say(`${a.id}: asleep; ${a.hold ? `hold stays on ${a.hold}` : "ownership released"}. Its saved database stays in the bucket.`);
        } else {
          Object.assign(a, { node: null, hold: null, state: "deleted", local: 0, saved: 0, durable: 0 });
          this.say(`${a.id}: deleted; history erased. A new request creates it empty.`);
        }
        a.operation = null;
      }
    }
    recoverActors() {
      const live = this.live();
      if (!live.length) return;
      for (const a of this.actors.filter(a => a.recover && a.state === "sleeping" && !a.operation)) {
        // Spread the illustration's recovery claims across survivors. This is
        // not automatic runtime rebalancing: bucket ownership still gates claims.
        const to = [...live].sort((x, y) =>
          this.actors.filter(a => a.node === x.id).length - this.actors.filter(a => a.node === y.id).length)[0].id;
        a.node = to; a.state = "restoring";
        a.operation = { kind: "recover", to, due: this.now + 6 };
        this.say(`${a.id}: claim on ${to}; restore saved value ${a.saved} from the bucket.`);
      }
    }
    advance(dt) {
      // Small deterministic slices also make large test advances safe.
      while (dt > 1e-8) {
        const slice = Math.min(dt, 0.05);
        dt -= slice;
        this.now += slice;
        for (const f of this.failures.values()) {
          if (f.phase === "done") continue;
          const elapsed = this.now - f.at;
          if (elapsed + 1e-8 >= 10 && f.phase === "lease") {
            f.phase = "grace";
            this.say(`Node ${f.id}: lease expired. Five simulated seconds of grace before fencing.`);
          }
          if (elapsed + 1e-8 >= 15 && f.phase === "grace") {
            f.phase = "done";
            const n = this.nodes.find(n => n.id === f.id);
            if (n?.state === "dead") n.state = "fenced";
            for (const a of this.actors.filter(a => a.node === f.id && a.state === "stranded")) {
              a.node = null;
              a.state = "sleeping";
            }
            this.say(`Node ${f.id}: lease and grace elapsed. The illustration now claims and restores affected actors across live nodes; no client writes are generated.`);
          }
        }
        this.recoverActors();
        this.tickRequest(slice);
        this.tickOperations();
        this.traffic += slice * this.load;
        if (this.traffic >= 1) {
          this.traffic %= 1;
          // Opt-in reads only, with backpressure to keep the illustration calm.
          if (!this.current && !this.queue.length) this.request(this.active()[this.serial % this.active().length]);
        }
      }
    }
  }
  globalThis.WasmKeepSimulation = Simulation;
})();
