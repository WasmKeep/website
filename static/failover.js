// "Kill a node": the diagram on /how-it-works/ and the home page, driven.
// A model of the default timings (10 s lease, 5 s grace, then a
// restore), not a live cluster. The clock runs SPEED times faster than
// real time. Without this script the diagram is a still picture and the
// controls stay hidden. The diagram is redrawn in one of two layouts:
// three nodes side by side, or stacked when the space is narrow.
(() => {
  "use strict";
  const SPEED = 5;
  const LEASE = 10; // s: a node's lease
  const GRACE = 5; // s: then a peer may fence it
  const RENEW = 10 / 3; // s: a live node renews a third of the way through
  const RESTORE = [1.5, 3.5]; // s: how long the demo draws a restore
  const NARROW = 560; // px: below this width, stack the nodes
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const svgNS = "http://www.w3.org/2000/svg";
  const IDS = ["a", "b", "c"];

  const LAYOUTS = {
    wide: {
      w: 760,
      h: 440,
      lb: { x: 150, y: 12, w: 460, h: 36 },
      node: (i) => [20 + i * 260, 80],
      bucket: { x: 20, y: 360, w: 720, h: 60 },
    },
    narrow: {
      w: 270,
      h: 846,
      lb: { x: 35, y: 12, w: 200, h: 36 },
      node: (i) => [35, 70 + i * 232],
      bucket: { x: 35, y: 772, w: 200, h: 64 },
    },
  };
  const NODE_W = 200;
  const NODE_H = 210;
  const slotLocal = (slot) => [10 + (slot % 2) * 95, 90 + Math.floor(slot / 2) * 58];

  const el = (name, attrs, parent, text) => {
    const e = document.createElementNS(svgNS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    if (parent) parent.append(e);
    return e;
  };

  for (const root of document.querySelectorAll("[data-sim]")) setup(root);

  function setup(root) {
    const svg = root.querySelector("svg");
    const log = root.querySelector("[data-log]");
    const clock = root.querySelector("[data-clock]");
    const restartBtn = root.querySelector("[data-restart]");
    const killBtns = [...root.querySelectorAll("[data-kill]")];
    const target = root.querySelector("[data-target]");
    const writeBtn = root.querySelector("[data-write]");
    for (const c of root.querySelectorAll("[data-controls]")) c.hidden = false;

    const initial = [
      ["room/42", "a", 0],
      ["user/ada", "a", 1],
      ["tenant/acme", "b", 0],
      ["device/7", "b", 1],
      ["room/9", "c", 0],
      ["user/kim", "c", 1],
    ];
    const nodes = Object.fromEntries(IDS.map((id) => [id, { id, alive: true, lastBeat: 0, phase: "" }]));
    const actors = initial.map(([addr, node, slot]) => ({ addr, node, slot, state: "serving", readyAt: 0, pending: false }));

    let layoutName = "";
    let L = LAYOUTS.wide;
    let packet = null;
    let now = 0;
    let killedAt = null;
    let fenced = false;
    let doneAt = null;
    let last = performance.now();
    let busy = false;

    const origin = (id) => L.node(IDS.indexOf(id));
    const slotPos = (id, slot) => {
      const [ox, oy] = origin(id);
      const [sx, sy] = slotLocal(slot);
      return [ox + sx, oy + sy];
    };

    // Draws the whole diagram for the current layout and state.
    const draw = () => {
      svg.replaceChildren();
      svg.setAttribute("viewBox", `0 0 ${L.w} ${L.h}`);
      el("title", { id: `${root.id}-t` }, svg, "Three WasmKeep nodes on one bucket");
      el(
        "desc",
        { id: `${root.id}-d` },
        svg,
        "A load balancer spreads requests over nodes a, b and c. Each node runs the front and holds actors, each with its own SQLite database. The nodes talk mutual TLS to each other and replicate every database to one S3-compatible bucket, which also holds each node's lease.",
      );
      svg.setAttribute("aria-labelledby", `${root.id}-t ${root.id}-d`);
      const wide = L === LAYOUTS.wide;
      const { lb, bucket } = L;
      el("rect", { class: "dg-lb", x: lb.x, y: lb.y, width: lb.w, height: lb.h, rx: 6 }, svg);
      el("text", { class: "dg-text", x: lb.x + lb.w / 2, y: lb.y + 23, "text-anchor": "middle" }, svg, wide ? "Load balancer: clients reach any node" : "Load balancer");
      if (wide) {
        IDS.forEach((id) => {
          const [ox, oy] = origin(id);
          el("path", { class: "dg-link", d: `M${ox + NODE_W / 2} ${lb.y + lb.h}V${oy}` }, svg);
          el("path", { class: "dg-repl", d: `M${ox + NODE_W / 2} ${oy + NODE_H}V${bucket.y}` }, svg);
        });
        for (let i = 0; i < 2; i++) {
          const [ax, ay] = L.node(i);
          const [bx] = L.node(i + 1);
          el("path", { class: "dg-mtls", d: `M${ax + NODE_W} ${ay + 47}H${bx}` }, svg);
          el("text", { class: "dg-small", x: (ax + NODE_W + bx) / 2, y: ay + 40, "text-anchor": "middle" }, svg, "mTLS");
        }
        el("text", { class: "dg-small", x: L.node(0)[0] + NODE_W / 2 + 8, y: 330 }, svg, "replicated");
      } else {
        // Stacked: the load balancer's rail on the right, replication on the left.
        const rx = lb.x + lb.w + 18;
        el("path", { class: "dg-link", d: `M${lb.x + lb.w} ${lb.y + lb.h / 2}H${rx}V${origin("c")[1] + 30}` }, svg);
        IDS.forEach((id) => {
          const [ox, oy] = origin(id);
          el("path", { class: "dg-link", d: `M${rx} ${oy + 30}H${ox + NODE_W}` }, svg);
          el("path", { class: "dg-repl", d: `M${ox} ${oy + NODE_H - 30}H${ox - 18}` }, svg);
        });
        el("path", { class: "dg-repl", d: `M${lb.x - 18} ${origin("a")[1] + NODE_H - 30}V${bucket.y + bucket.h / 2}H${bucket.x}` }, svg);
        for (let i = 0; i < 2; i++) {
          const [ax, ay] = L.node(i);
          el("path", { class: "dg-mtls", d: `M${ax + NODE_W / 2} ${ay + NODE_H}V${ay + 232}` }, svg);
          el("text", { class: "dg-small", x: ax + NODE_W / 2 + 6, y: ay + NODE_H + 15 }, svg, "mTLS");
        }
      }
      el("rect", { class: "dg-bucket", x: bucket.x, y: bucket.y, width: bucket.w, height: bucket.h, rx: 8 }, svg);
      el("text", { class: "dg-text", x: bucket.x + bucket.w / 2, y: bucket.y + 25, "text-anchor": "middle" }, svg, wide ? "Your S3-compatible bucket" : "Your bucket");
      el("text", { class: "dg-small", x: bucket.x + bucket.w / 2, y: bucket.y + 45, "text-anchor": "middle" }, svg, wide ? "node leases, who holds each actor, every actor's history" : "leases, owners, history");

      for (const id of IDS) {
        const n = nodes[id];
        const [ox, oy] = origin(id);
        const g = el("g", { class: "node-g", transform: `translate(${ox} ${oy})` }, svg);
        el("rect", { class: "dg-node", x: 0, y: 0, width: NODE_W, height: NODE_H, rx: 8 }, g);
        el("text", { class: "dg-text", x: 12, y: 21 }, g, `Node ${id}`);
        el("text", { class: "dg-small", x: 100, y: 20, "text-anchor": "end" }, g, "lease");
        el("rect", { class: "dg-lease-bg", x: 104, y: 12, width: 84, height: 8, rx: 4 }, g);
        n.lease = el("rect", { class: "dg-lease", x: 104, y: 12, width: 84, height: 8, rx: 4 }, g);
        el("rect", { class: "dg-front", x: 12, y: 32, width: 176, height: 30, rx: 5 }, g);
        el("text", { class: "dg-small", x: 100, y: 51, "text-anchor": "middle" }, g, "front: pages and APIs");
        n.dead = el("text", { class: "dead-mark", x: 100, y: 80, "text-anchor": "middle" }, g);
        n.g = g;
        paintNode(n);
      }
      for (const a of actors) {
        const g = el("g", { class: "actor-g" }, svg);
        el("rect", { class: "dg-actor", x: 0, y: 0, width: 88, height: 48, rx: 5 }, g);
        el("text", { class: "dg-mono", x: 6, y: 19 }, g, a.addr);
        el("path", { class: "dg-db", d: "M8 29v10c0 1.6 3 2.8 6 2.8s6-1.2 6-2.8V29" }, g);
        el("ellipse", { class: "dg-db", cx: 14, cy: 29, rx: 6, ry: 2.4 }, g);
        a.label = el("text", { class: "dg-small", x: 25, y: 40 }, g);
        a.g = g;
        place(a);
        paintActor(a);
      }
      packet = el("circle", { class: "dg-packet", r: 6, cx: -20, cy: -20 }, svg);
    };

    const paintNode = (n) => {
      n.g.classList.toggle("dead", !n.alive);
      n.g.classList.toggle("grace", n.phase === "grace");
      n.g.classList.toggle("fenced", n.phase === "fenced");
      n.dead.textContent = n.alive ? "" : n.phase === "grace" ? "lease ran out: grace" : n.phase === "fenced" ? "fenced" : "killed (kill -9)";
    };
    const paintActor = (a) => {
      a.g.classList.toggle("stranded", a.state === "stranded");
      a.g.classList.toggle("restoring", a.state === "restoring");
      a.label.textContent = a.state === "serving" ? "SQLite" : a.state === "stranded" ? "waiting" : "restoring";
    };
    const place = (a) => {
      const [x, y] = slotPos(a.node, a.slot);
      a.g.style.transform = `translate(${x}px, ${y}px)`;
    };

    const relayout = () => {
      const name = root.clientWidth < NARROW ? "narrow" : "wide";
      if (name === layoutName) return;
      layoutName = name;
      L = LAYOUTS[name];
      draw();
    };

    const fmt = (s) => `${s.toFixed(1)} s`;
    const say = (text, t) => {
      const li = document.createElement("li");
      li.dataset.t = t === undefined ? "" : fmt(t);
      li.textContent = text;
      log.append(li);
      while (log.children.length > 40) log.firstChild.remove();
      log.scrollTop = log.scrollHeight;
    };
    const sinceKill = () => (killedAt === null ? 0 : now - killedAt);
    const freeSlot = (node) => {
      const used = new Set(actors.filter((a) => a.node === node).map((a) => a.slot));
      for (let s = 0; s < 4; s++) if (!used.has(s)) return s;
      return 0;
    };

    const kill = (id, btn) => {
      const n = nodes[id];
      if (!n.alive || killedAt !== null) return;
      n.alive = false;
      n.phase = "";
      killedAt = now;
      fenced = false;
      doneAt = null;
      n.lastBeat = now;
      for (const a of actors) {
        if (a.node === id) {
          a.state = "stranded";
          paintActor(a);
        }
      }
      paintNode(n);
      killBtns.forEach((b) => (b.disabled = true));
      // The pressed button is now disabled: keep focus somewhere useful.
      if (btn && document.activeElement === btn) clock.focus();
      say(`node ${id} killed: its last heartbeat is now. Its actors wait.`, 0);
    };

    const fence = () => {
      const dead = IDS.find((id) => !nodes[id].alive);
      const n = nodes[dead];
      fenced = true;
      n.phase = "fenced";
      paintNode(n);
      const live = IDS.filter((id) => nodes[id].alive);
      say(`a peer writes node ${dead}'s fence: its actors are free.`, sinceKill());
      for (const a of actors.filter((x) => x.node === dead)) {
        // The next request for it reaches some node; draw the least busy.
        const count = (id) => actors.filter((x) => x.node === id).length;
        const to = live.reduce((best, id) => (count(id) < count(best) ? id : best), live[0]);
        a.node = to;
        a.slot = freeSlot(to);
        a.state = "restoring";
        paintActor(a);
        place(a);
        a.readyAt = now + RESTORE[0] + Math.random() * (RESTORE[1] - RESTORE[0]);
      }
    };

    const restart = () => {
      const dead = IDS.find((id) => !nodes[id].alive);
      if (!dead || !fenced || actors.some((a) => a.state !== "serving")) return;
      const n = nodes[dead];
      n.alive = true;
      n.phase = "";
      n.lastBeat = now;
      paintNode(n);
      killedAt = null;
      restartBtn.disabled = true;
      killBtns.forEach((b) => (b.disabled = false));
      const back = killBtns.find((b) => b.dataset.kill === dead);
      if (back && document.activeElement === restartBtn) back.focus();
      say(`node ${dead} restarted and ready. It holds nothing; new actors start on whichever node a request reaches.`);
      clock.textContent = "No node down.";
    };

    // A durable write, drawn as a packet: load balancer, a front, the owner
    // (one hop over mutual TLS if it is another node), the bucket, back.
    const write = () => {
      if (busy) return;
      const a = actors.find((x) => x.addr === target.value);
      const live = IDS.filter((id) => nodes[id].alive);
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
      const front = (id) => {
        const [ox, oy] = origin(id);
        return [ox + NODE_W / 2, oy + 47];
      };
      const [ax, ay] = slotPos(a.node, a.slot);
      const lbC = [L.lb.x + L.lb.w / 2, L.lb.y + L.lb.h / 2];
      const pts = [lbC, front(entry)];
      if (entry !== a.node) pts.push(front(a.node));
      const actorC = [ax + 44, ay + 24];
      const bucketP = [Math.min(Math.max(actorC[0], L.bucket.x + 10), L.bucket.x + L.bucket.w - 10), L.bucket.y + 10];
      pts.push(actorC, bucketP, actorC, lbC);
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
      const step = (ts) => {
        const p = Math.min(1, (ts - t0) / 260);
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
      for (const id of IDS) {
        const n = nodes[id];
        if (n.alive && now - n.lastBeat >= RENEW) n.lastBeat = now;
        const left = Math.max(0, LEASE - (now - n.lastBeat));
        n.lease.setAttribute("width", String((84 * left) / LEASE));
      }
      if (killedAt === null) return;
      const s = sinceKill();
      const dead = IDS.find((id) => !nodes[id].alive);
      if (!fenced && s >= LEASE && nodes[dead].phase === "") {
        nodes[dead].phase = "grace";
        paintNode(nodes[dead]);
        say(`node ${dead}'s lease ran out; 5 s of grace before anyone may fence it.`, s);
      }
      if (!fenced && s >= LEASE + GRACE) fence();
      for (const a of actors) {
        if (a.state === "restoring" && now >= a.readyAt) {
          a.state = "serving";
          paintActor(a);
          say(`${a.addr} restored from the bucket on node ${a.node}: writable again.`, s);
          if (a.pending) {
            a.pending = false;
            say(`the waiting write to ${a.addr} is committed and acknowledged once the bucket has it.`, s);
          }
        }
      }
      if (fenced && !actors.some((a) => a.state !== "serving")) {
        if (doneAt === null) {
          doneAt = s;
          restartBtn.disabled = false;
          say(`every actor of the dead node is writable again: ${fmt(s)} after the kill in this model.`, s);
        }
        clock.textContent = `Every actor writable again, ${fmt(doneAt)} after the kill in this model.`;
      } else {
        clock.textContent = `${fmt(s)} since the kill (shown ${SPEED} times faster than real time).`;
      }
    };

    killBtns.forEach((b) => b.addEventListener("click", () => kill(b.dataset.kill, b)));
    restartBtn.addEventListener("click", restart);
    writeBtn.addEventListener("click", write);
    relayout();
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(root);
    // A timer, not animation frames: the clock keeps time in a background tab.
    last = performance.now();
    setInterval(tick, 100);
  }
})();
