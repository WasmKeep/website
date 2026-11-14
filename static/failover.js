// "Kill a node": the diagram on /how-it-works/, driven. A model of the
// default timings (10 s lease, 5 s grace, then a restore), not a live
// cluster. The clock runs SPEED times faster than real time. Without this
// script the diagram is a still picture and the controls stay hidden.
(() => {
  "use strict";
  const root = document.getElementById("sim");
  if (!root) return;

  const SPEED = 5;
  const LEASE = 10; // s: a node's lease
  const GRACE = 5; // s: then a peer may fence it
  const RENEW = 10 / 3; // s: a live node renews a third of the way through
  const RESTORE = [1.5, 3.5]; // s: how long the demo draws a restore
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  const ids = ["a", "b", "c"];
  const nodeX = { a: 20, b: 280, c: 540 };
  const slotPos = (node, slot) => [nodeX[node] + 10 + (slot % 2) * 95, 170 + Math.floor(slot / 2) * 58];

  const nodes = {};
  for (const id of ids) {
    const g = root.querySelector(`#node-${id}`);
    nodes[id] = {
      id,
      g,
      alive: true,
      lastBeat: 0,
      lease: g.querySelector("[data-lease]"),
      dead: g.querySelector("[data-dead]"),
    };
  }
  const actors = [...root.querySelectorAll(".actor-g")].map((g) => ({
    g,
    addr: g.dataset.addr,
    node: g.dataset.node,
    slot: Number(g.dataset.slot),
    state: "serving", // serving | stranded | restoring
    readyAt: 0,
    label: g.querySelector("[data-state]"),
  }));

  const log = root.querySelector("[data-log]");
  const clock = root.querySelector("[data-clock]");
  const restartBtn = root.querySelector("[data-restart]");
  const killBtns = [...root.querySelectorAll("[data-kill]")];
  const target = root.querySelector("[data-target]");
  const packet = root.querySelector("[data-packet]");
  for (const c of root.querySelectorAll("[data-controls]")) c.hidden = false;

  let now = 0; // simulated seconds since the page started
  let killedAt = null; // simulated time of the current kill
  let fenced = false;
  let doneAt = null;
  let last = performance.now();

  const fmt = (s) => `${s.toFixed(1)} s`;
  const say = (text, t) => {
    const li = document.createElement("li");
    li.dataset.t = t === undefined ? "" : fmt(t);
    li.textContent = text;
    log.append(li);
    while (log.children.length > 40) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  };

  const place = (a) => {
    const [x, y] = slotPos(a.node, a.slot);
    a.g.removeAttribute("transform");
    a.g.style.transform = `translate(${x}px, ${y}px)`;
  };
  actors.forEach(place);

  const freeSlot = (node) => {
    const used = new Set(actors.filter((a) => a.node === node).map((a) => a.slot));
    for (let s = 0; s < 4; s++) if (!used.has(s)) return s;
    return -1;
  };

  const setState = (a, state) => {
    a.state = state;
    a.g.classList.toggle("stranded", state === "stranded");
    a.g.classList.toggle("restoring", state === "restoring");
    a.label.textContent = state === "serving" ? "SQLite" : state === "stranded" ? "waiting" : "restoring";
  };

  const sinceKill = () => (killedAt === null ? 0 : now - killedAt);

  const kill = (id) => {
    const n = nodes[id];
    if (!n.alive || killedAt !== null) return;
    n.alive = false;
    n.g.classList.add("dead");
    n.dead.textContent = "killed (kill -9)";
    killedAt = now;
    fenced = false;
    doneAt = null;
    n.lastBeat = now;
    for (const a of actors) if (a.node === id) setState(a, "stranded");
    killBtns.forEach((b) => (b.disabled = true));
    say(`node ${id} killed: its last heartbeat is now. Its actors wait.`, 0);
  };

  const fence = () => {
    const dead = ids.find((id) => !nodes[id].alive);
    const n = nodes[dead];
    fenced = true;
    n.g.classList.remove("grace");
    n.g.classList.add("fenced");
    n.dead.textContent = "fenced";
    const live = ids.filter((id) => nodes[id].alive);
    say(`a peer writes node ${dead}'s fence: its actors are free.`, sinceKill());
    for (const a of actors.filter((x) => x.node === dead)) {
      // The next request for it reaches some node; draw the least busy.
      const count = (id) => actors.filter((x) => x.node === id).length;
      const to = live.reduce((best, id) => (count(id) < count(best) ? id : best), live[0]);
      a.node = to;
      a.slot = freeSlot(to);
      setState(a, "restoring");
      place(a);
      a.readyAt = now + RESTORE[0] + Math.random() * (RESTORE[1] - RESTORE[0]);
    }
  };

  const restart = () => {
    const dead = ids.find((id) => !nodes[id].alive);
    if (!dead || !fenced || actors.some((a) => a.state !== "serving")) return;
    const n = nodes[dead];
    n.alive = true;
    n.lastBeat = now;
    n.g.classList.remove("dead", "fenced", "grace");
    n.dead.textContent = "";
    killedAt = null;
    restartBtn.disabled = true;
    killBtns.forEach((b) => (b.disabled = false));
    say(`node ${dead} restarted and ready. It holds nothing; new actors start on whichever node a request reaches.`);
    clock.textContent = "No node down.";
  };

  // A durable write, drawn as a packet: load balancer, a front, the owner
  // (one hop over mutual TLS if it is another node), the bucket, back.
  let busy = false;
  const write = () => {
    if (busy) return;
    const a = actors.find((x) => x.addr === target.value);
    const live = ids.filter((id) => nodes[id].alive);
    const entry = live[Math.floor(Math.random() * live.length)];
    if (a.state === "stranded") {
      // A write has a body: it is never kept for later, so it gets a 503 at once.
      say(`write to ${a.addr} via node ${entry}: 503, Retry-After: 1 (its node is not reachable yet; retry).`, sinceKill());
      return;
    }
    if (a.state === "restoring") {
      a.pending = true;
      say(`write to ${a.addr} via node ${entry}: waits while node ${a.node} restores it from the bucket.`, sinceKill());
      return;
    }
    const [ax, ay] = slotPos(a.node, a.slot);
    const fx = nodeX[entry] + 100;
    const pts = [
      [380, 30],
      [fx, 127],
    ];
    if (entry !== a.node) pts.push([nodeX[a.node] + 100, 127]);
    pts.push([ax + 43, ay + 24], [ax + 43, 390], [ax + 43, ay + 24], [380, 30]);
    const hop = entry === a.node ? "no hop" : `forwarded to node ${a.node} over mutual TLS`;
    const done = () => {
      busy = false;
      packet.setAttribute("cx", "-20");
      packet.setAttribute("cy", "-20");
      a.g.classList.remove("target");
      say(`write to ${a.addr}: in at node ${entry}, ${hop}; committed to its SQLite, acknowledged once the bucket had it.`, killedAt === null ? undefined : sinceKill());
    };
    busy = true;
    a.g.classList.add("target");
    if (reduce.matches) return done();
    let i = 0;
    let t0 = performance.now();
    const seg = 260;
    const step = (ts) => {
      const p = Math.min(1, (ts - t0) / seg);
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      packet.setAttribute("cx", String(x0 + (x1 - x0) * p));
      packet.setAttribute("cy", String(y0 + (y1 - y0) * p));
      if (p >= 1) {
        i++;
        t0 = ts;
        if (i >= pts.length - 1) return done();
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const tick = () => {
    const ts = performance.now();
    const dt = Math.min(1, (ts - last) / 1000) * SPEED;
    last = ts;
    now += dt;
    for (const id of ids) {
      const n = nodes[id];
      if (n.alive && now - n.lastBeat >= RENEW) n.lastBeat = now;
      const left = n.alive ? LEASE - (now - n.lastBeat) : Math.max(0, LEASE - (now - n.lastBeat));
      n.lease.setAttribute("width", String(Math.max(0, (84 * left) / LEASE)));
    }
    if (killedAt !== null) {
      const s = sinceKill();
      const dead = ids.find((id) => !nodes[id].alive);
      if (!fenced && s >= LEASE && !nodes[dead].g.classList.contains("grace")) {
        nodes[dead].g.classList.add("grace");
        nodes[dead].dead.textContent = "lease ran out: grace";
        say(`node ${dead}'s lease ran out; 5 s of grace before anyone may fence it.`, s);
      }
      if (!fenced && s >= LEASE + GRACE) fence();
      for (const a of actors) {
        if (a.state === "restoring" && now >= a.readyAt) {
          setState(a, "serving");
          say(`${a.addr} restored from the bucket on node ${a.node}: writable again.`, sinceKill());
          if (a.pending) {
            a.pending = false;
            say(`the waiting write to ${a.addr} is committed and acknowledged once the bucket has it.`, sinceKill());
          }
        }
      }
      const waiting = actors.some((a) => a.state !== "serving");
      if (fenced && !waiting) {
        if (doneAt === null) {
          doneAt = s;
          restartBtn.disabled = false;
          say(`every actor of the dead node is writable again: ${fmt(s)} after the kill in this model.`, s);
        }
        clock.textContent = `Every actor writable again, ${fmt(doneAt)} after the kill in this model.`;
      } else {
        clock.textContent = `${fmt(s)} since the kill (shown ${SPEED} times faster than real time).`;
      }
    }
  };

  killBtns.forEach((b) => b.addEventListener("click", () => kill(b.dataset.kill)));
  restartBtn.addEventListener("click", restart);
  root.querySelector("[data-write]").addEventListener("click", write);
  // A timer, not animation frames: the clock keeps time in a background tab.
  last = performance.now();
  setInterval(tick, 100);
})();
