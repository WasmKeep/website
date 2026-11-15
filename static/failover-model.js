// WasmKeep 0.4.2 teaching model. No IO, DOM, randomness or wall clock.
// Contract: docs/cluster.md and docs/concepts.md at v0.4.2.
// Timing source: bench/results/2026-11-14-563cb94-soak-ovh-bhs-3vps-2h-0.4.2-rc.csv.
// Only kill-to-writable totals are measured. Intermediate animation durations,
// traffic, counters and upload windows are deliberately illustrative.
(() => {
  "use strict";
  const TIMING = { median: 17.427065123, p99: 22.470010896 };
  const INITIAL = ["room/42", "user/ada", "tenant/acme", "device/7", "room/9", "user/kim"];

  class Simulation {
    constructor() {
      this.now = 0;
      this.nodes = ["a", "b", "c"].map(id => ({ id, state: "live", beat: 0 }));
      this.actors = INITIAL.map((id, i) => this.actor(id, this.nodes[Math.floor(i / 2)].id, 3));
      this.events = [];
      this.packets = [];
      this.load = 1;
      this.mode = "durable";
      this.profile = "median";
      this.traffic = 0;
      this.cursor = 0;
      this.route = 0;
      this.serial = 0;
      this.nextNode = 3;
      this.nextActor = 1;
      this.failure = null;
      this.counts = { served: 0, retry: 0, lost: 0 };
    }
    actor(id, node, value = 0) {
      return { id, node, state: "serving", local: value, saved: value,
        durable: value, lost: 0, last: this.now, uploadAt: null, waiters: [], pending: [], muted: false };
    }
    live() { return this.nodes.filter(n => n.state === "live"); }
    active() { return this.actors.filter(a => a.state !== "deleted"); }
    unstable() {
      return this.nodes.some(n => n.state === "draining") ||
        this.actors.some(a => ["stranded", "restoring", "moving", "deleting"].includes(a.state));
    }
    entry() {
      const live = this.live();
      return live[this.route++ % live.length]?.id;
    }
    say(text) { this.events.push({ time: this.now, text }); }
    takeEvents() { return this.events.splice(0); }
    takePackets() { return this.packets.splice(0); }
    waiting() { return this.actors.reduce((n, a) => n + a.waiters.length, 0); }

    addNode() {
      if (this.nodes.length >= 5 || this.unstable()) return;
      const id = String.fromCharCode(97 + this.nextNode++);
      this.nodes.push({ id, state: "live", beat: this.now });
      this.say(`Node ${id} joined. Resident actors stay put; new or sleeping actors go to the first request's node.`);
    }
    spawn() {
      if (this.active().length >= 30 || !this.live().length) return;
      // Reuse a deleted tile to keep the diagram bounded; its old address can
      // still be recreated using Send read before spawning another address.
      if (this.actors.length >= 30) this.actors.splice(this.actors.findIndex(a => a.state === "deleted"), 1);
      const a = this.actor(`room/new${this.nextActor++}`, this.entry());
      this.actors.push(a);
      this.say(`${a.id}: first request created an empty actor on node ${a.node}.`);
      return a;
    }
    handoff(a, to) {
      a.state = "moving";
      a.to = to;
      a.readyAt = this.now + 3; // illustrative command polling / hand-over
      a.saved = a.local; // queued events finish and upload before release
      a.uploadAt = null;
    }
    move(a, to) {
      if (!a || !["serving", "sleeping"].includes(a.state) || !this.live().some(n => n.id === to) || a.node === to) return;
      this.handoff(a, to);
      this.say(`${a.id}: move to ${to}; finish queued events, upload, release, then restore. A move is not a pin.`);
    }
    drain(id) {
      const n = this.nodes.find(n => n.id === id);
      if (!n || n.state !== "live" || this.live().length < 2 || this.unstable()) return;
      n.state = "draining";
      this.drainBatch(n);
      n.removeAt = this.now + 4;
      this.say(`Node ${id} draining: takes no new actors, still forwards. Queued events upload before hand-over; stop only when empty.`);
    }
    drainBatch(n) {
      const held = this.actors.filter(a => a.node === n.id);
      const slots = 16 - held.filter(a => a.state === "moving").length;
      for (const a of held.filter(a => a.state === "serving").slice(0, slots)) this.handoff(a, this.entry());
    }
    deleteActor(a) {
      if (!a || !["serving", "sleeping"].includes(a.state)) return;
      a.state = "deleting";
      a.readyAt = this.now + 3;
      this.say(`${a.id}: actor delete requested; finish queued events, then record the delete in the bucket.`);
    }
    idle(a) {
      if (!a || a.state !== "serving") return;
      a.muted = true;
      this.say(`${a.id}: background traffic off for this actor. It hibernates after 30 simulated seconds idle; Send read wakes it.`);
    }
    kill(id) {
      const n = this.nodes.find(n => n.id === id);
      if (!n || n.state !== "live" || this.live().length < 2 || this.unstable() || this.failure) return;
      n.state = "dead";
      // Scenario deliberately kills just after a heartbeat, rather than
      // suggesting every kill starts a fresh ten-second lease in reality.
      n.beat = this.now;
      const affected = this.actors.filter(a => a.node === id);
      const f = this.failure = { id, at: this.now, duration: TIMING[this.profile],
        actors: affected.map(a => a.id), phase: "lease", nextProbe: this.now, seen: new Set() };
      let lost = 0;
      for (const a of affected) {
        a.state = "stranded";
        const delta = a.local - a.saved;
        a.lost += delta;
        lost += delta;
        a.local = a.saved;
        a.uploadAt = null;
      }
      this.counts.lost += lost;
      this.say(`Node ${id} killed just after a heartbeat. ${affected.length} resident actors stranded; other nodes keep serving.`);
      this.say(lost ? `${lost} acknowledged plain write(s) lost before upload. Acknowledged durable writes remain in the bucket.` : "All acknowledged durable writes survive. No unuploaded plain write was caught in this kill.");
      if (f.actors.length) this.say("Demo read probes now request each stranded actor once per simulated second, even at zero background load.");
    }
    restart() {
      const f = this.failure;
      if (!f || f.phase !== "done") return;
      const n = this.nodes.find(n => n.id === f.id);
      n.state = "live";
      n.beat = this.now;
      this.failure = null;
      this.say(`Node ${n.id} restarted empty. It can claim new or sleeping actors; it does not take resident actors back.`);
    }

    // Reads are bodyless GETs. Writes are synthetic counter increments (POST).
    // Discovery failures get 503; only subsequent eligible reads wait. No write
    // is silently retried. The demo's probes are safe reads.
    request(a, method = "GET", manual = false, via = this.entry(), writeMode = this.mode) {
      if (!a || !via) return;
      if (manual) a.muted = false;
      const reply = text => { if (manual) this.say(`${method} ${a.id} via ${via}: ${text}`); };
      const packet = { actor: a.id, via, result: "ok" };
      this.packets.push(packet);
      const retry = reason => {
        packet.result = "retry";
        this.counts.retry++;
        reply(`503, Retry-After: 1 — ${reason}. The demo does not retry writes.`);
      };
      if (["moving", "deleting"].includes(a.state)) return retry("hand-over or deletion in progress");
      if (a.state === "stranded") {
        const f = this.failure;
        if (!f.seen.has(via) && this.now - f.at < 10) {
          f.seen.add(via);
          return retry("first connection failure discovers the dead owner");
        }
        if (method !== "GET" || a.waiters.length >= 64) return retry("owner unavailable, or read wait limit reached");
        a.waiters.push({ until: this.now + 25, manual });
        packet.result = "wait";
        reply("kept on this peer (up to 25 s), waiting for ownership to become free");
        return;
      }
      if (["sleeping", "deleted"].includes(a.state)) {
        const fresh = a.state === "deleted";
        a.node = via; // first claim, never least-loaded placement
        a.state = "serving";
        this.say(`${a.id}: ${fresh ? "new empty actor" : "woke with its saved database"} on node ${via}, first to claim.`);
      }
      if (a.state === "restoring") {
        if (method === "GET") {
          a.waiters.push({ until: this.now + 30, manual });
          packet.result = "wait";
          reply("waiting for the new owner's restore");
        } else {
          a.pending.push({ method, manual, via, writeMode });
          packet.result = "wait";
          reply("ownership acquired; queued behind the new owner's restore, not yet acknowledged");
        }
        return;
      }
      // Events serialize: complete the previous event's illustrative upload
      // before running this one. The model does not benchmark queue latency.
      if (a.uploadAt !== null) {
        a.saved = a.local;
        a.uploadAt = null;
      }
      a.last = this.now;
      this.counts.served++;
      if (method === "POST") {
        a.local++;
        if (writeMode === "durable") {
          a.saved = a.local;
          a.durable = a.local;
          reply(`durable value ${a.local} acknowledged after the bucket has it`);
        } else {
          a.uploadAt = this.now + 3;
          reply(`plain value ${a.local} acknowledged locally; not yet in the bucket. Kill now to catch this illustrative upload window`);
        }
      } else reply(`200, value ${a.local}, owner ${a.node}${via !== a.node ? " (one forwarded hop)" : ""}`);
    }
    advance(dt) {
      this.now += dt;
      for (const n of this.nodes) {
        if (["live", "draining"].includes(n.state) && this.now - n.beat >= 3) n.beat = this.now;
      }
      const f = this.failure;
      if (f && f.phase !== "done") {
        const elapsed = this.now - f.at;
        if (elapsed >= 10 && f.phase === "lease") {
          f.phase = "grace";
          this.say(`Node ${f.id}: 10 s lease expired; 5 s grace protects against overlapping writers.`);
        }
        if (elapsed >= 15 && f.phase === "grace") {
          f.phase = "fenced";
          this.nodes.find(n => n.id === f.id).state = "fenced";
          this.say(`Peer wrote the fence. Old process cannot renew; ownership is free. The next read probe claims each actor.`);
        }
        if (this.now >= f.nextProbe) {
          f.nextProbe = this.now + 1;
          for (const id of f.actors) {
            const a = this.actors.find(a => a.id === id);
            if (a.state === "stranded" && f.phase === "fenced") {
              a.node = this.entry();
              a.state = "restoring";
              a.readyAt = f.at + f.duration;
            }
            if (["stranded", "restoring"].includes(a.state)) this.request(a);
          }
        }
      }
      for (const a of this.actors) {
        if (a.uploadAt !== null && this.now >= a.uploadAt && a.state === "serving") {
          a.saved = a.local;
          a.uploadAt = null;
        }
        if (["moving", "deleting", "restoring"].includes(a.state) && this.now >= a.readyAt) {
          if (a.state === "deleting") {
            Object.assign(a, { state: "deleted", node: null, local: 0, saved: 0, durable: 0, uploadAt: null, waiters: [] });
            this.say(`${a.id}: ended; database and alarm gone, older history erased. Send read creates it new.`);
          } else {
            if (a.state === "moving") a.node = a.to;
            a.state = "serving";
            a.last = this.now;
            a.local = a.saved;
            this.say(`${a.id}: ready on ${a.node}, value ${a.local} restored from the bucket.`);
          }
        }
        if (a.state === "serving") {
          for (const request of a.pending.splice(0)) {
            this.request(a, request.method, request.manual, request.via, request.writeMode);
          }
        }
        const remaining = [];
        for (const waiter of a.waiters) {
          if (a.state === "serving") {
            this.counts.served++;
            a.last = this.now;
            if (waiter.manual) this.say(`Waiting GET ${a.id}: 200 from node ${a.node}, value ${a.local}.`);
          } else if (this.now >= waiter.until) {
            this.counts.retry++;
            if (waiter.manual) this.say(`Waiting GET ${a.id}: 25 s wait expired; 503, Retry-After: 1.`);
          } else remaining.push(waiter);
        }
        a.waiters = remaining;
        if (a.state === "serving" && a.uploadAt === null && this.now - a.last >= 30) {
          a.state = "sleeping";
          a.node = null;
          this.say(`${a.id}: idle 30 s; hibernated and released ownership. Database stays in the bucket.`);
        }
      }
      for (const n of [...this.nodes]) {
        if (n.state === "draining") this.drainBatch(n);
        if (n.state === "draining" && this.now >= n.removeAt && !this.actors.some(a => a.node === n.id)) {
          this.nodes.splice(this.nodes.indexOf(n), 1);
          this.say(`Node ${n.id} drained, then stopped and removed from this diagram. Its actors are safe on the other nodes.`);
        }
      }
      if (f && f.phase === "fenced" && f.actors.every(id => !["stranded", "restoring"].includes(this.actors.find(a => a.id === id).state))) {
        f.phase = "done";
        this.say(`Takeover complete${f.actors.length ? ` at the ${f.duration.toFixed(1)} s scenario target` : " (no resident actors to restore)"}. Restart node ${f.id} when ready.`);
      }
      this.traffic += dt * this.load;
      while (this.traffic >= 1) {
        this.traffic--;
        const candidates = this.active().filter(a => !a.muted && a.state !== "deleting");
        if (!candidates.length) break;
        // Shift the first actor each round so writes reach every actor,
        // while maintaining exactly two generated reads per write.
        const cursor = this.cursor++;
        const round = Math.floor(cursor / candidates.length);
        const a = candidates[(cursor + round) % candidates.length];
        this.request(a, ++this.serial % 3 === 0 ? "POST" : "GET");
      }
    }
  }
  globalThis.WasmKeepSimulation = Simulation;
})();
