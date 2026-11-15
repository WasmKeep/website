// Presentation for the deterministic model in failover-model.js.
// SVG attributes only (no style attributes), including animated positions.
(() => {
  "use strict";
  const SPEED = 5;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs, parent, text) => {
    const e = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) e.setAttribute(key, value);
    if (text !== undefined) e.textContent = text;
    parent.append(e);
    return e;
  };
  const STATES = { serving: "serving", stranded: "waiting", restoring: "restoring",
    sleeping: "asleep", moving: "moving", deleting: "deleting", deleted: "ended" };

  for (const root of document.querySelectorAll("[data-sim]")) setup(root);

  function setup(root) {
    const find = key => root.querySelector(`[data-${key}]`);
    const svg = root.querySelector(".sim-fig > svg");
    const log = find("log");
    const clock = find("clock");
    const target = find("target");
    let model = new WasmKeepSimulation();
    let paused = false;
    let visible = true;
    let layoutKey = "";
    let controlKey = "";
    let geometry;
    let nodeViews = new Map();
    let actorViews = new Map();
    let positions = new Map();
    let packets = [];
    let packetLayer;
    let lastTick = performance.now();
    let lastFrame = lastTick;
    const selected = () => model.actors.find(a => a.id === target.value);

    function say(event) {
      const li = document.createElement("li");
      li.dataset.t = `${event.time.toFixed(1)} s`;
      li.textContent = event.text;
      log.append(li);
      while (log.children.length > 35) log.firstChild.remove();
      log.scrollTop = log.scrollHeight;
    }

    // Nodes keep their original silhouette. Extra actors add rows; narrow
    // screens stack the nodes at readable size inside a scrollable scene.
    function layout() {
      const columns = root.clientWidth < 560 ? 1 : Math.min(3, model.nodes.length);
      const width = columns === 1 ? 270 : columns * 260 - 20;
      const origins = new Map();
      const goals = new Map();
      const heights = new Map();
      const narrow = columns === 1;
      let y = narrow ? 60 : 80;
      for (let i = 0; i < model.nodes.length; i += columns) {
        let rowHeight = narrow ? 122 : 210;
        for (let j = i; j < Math.min(i + columns, model.nodes.length); j++) {
          const node = model.nodes[j];
          const actors = model.actors.filter(a => a.node === node.id);
          const h = Math.max(narrow ? 122 : 210, (narrow ? 60 : 100) + Math.ceil(actors.length / 2) * 62);
          heights.set(node.id, h);
          rowHeight = Math.max(rowHeight, h);
          const x = columns === 1 ? 35 : 20 + (j % columns) * 260;
          origins.set(node.id, [x, y]);
          actors.forEach((a, slot) => goals.set(a.id, [x + 10 + slot % 2 * 95, y + (narrow ? 62 : 90) + Math.floor(slot / 2) * 62]));
        }
        y += rowHeight + (narrow ? 18 : 60);
      }
      const free = model.actors.filter(a => a.node === null);
      const freeY = y;
      const shelfColumns = columns === 1 ? 2 : columns * 2;
      free.forEach((a, i) => goals.set(a.id, [35 + i % shelfColumns * ((width - 70) / shelfColumns), y + 24 + Math.floor(i / shelfColumns) * 62]));
      if (free.length) y += 40 + Math.ceil(free.length / shelfColumns) * 62;
      return { columns, width, height: y + 90, bucketY: y, freeY, free,
        origins, goals, heights };
    }

    function draw() {
      geometry = layout();
      const g = geometry;
      root.dataset.compact = String(g.columns === 1 && g.height <= 600);
      svg.replaceChildren();
      svg.setAttribute("viewBox", `0 0 ${g.width} ${g.height}`);
      svgEl("title", { id: `${root.id}-t` }, svg, "WasmKeep nodes sharing one bucket: interactive simulation");
      svgEl("desc", { id: `${root.id}-d` }, svg, "Requests enter any node and are forwarded to an actor's owner. Kill controls and a text event log follow the diagram. Sleeping actors have no owner; the next request claims them.");
      const rail = svgEl("g", { "aria-hidden": "true" }, svg);
      svgEl("rect", { class: "dg-lb", x: 35, y: 12, width: g.width - 70, height: 36, rx: 6 }, rail);
      svgEl("text", { class: "dg-text", x: g.width / 2, y: 35, "text-anchor": "middle" }, rail, g.columns === 1 ? "Load balancer" : "Load balancer: clients reach any node");
      nodeViews = new Map();
      for (const n of model.nodes) {
        const [x, y] = g.origins.get(n.id);
        const h = g.heights.get(n.id);
        // Separate side rails keep connections away from actor tiles.
        svgEl("path", { class: "dg-link", d: `M${g.width - 35} 30H${g.width - 12}V${y + 47}H${x + 200}` }, rail);
        svgEl("path", { class: "dg-repl", d: `M${x} ${y + h - 15}H12V${g.bucketY + 30}H35` }, rail);
        const group = svgEl("g", { class: "node-g", transform: `translate(${x} ${y})`, "data-node-id": n.id }, svg);
        svgEl("rect", { class: "dg-node", width: 200, height: h, rx: 8 }, group);
        svgEl("text", { class: "dg-text", x: 12, y: 21 }, group, `Node ${n.id}`);
        svgEl("text", { class: "dg-small", x: 100, y: 20, "text-anchor": "end" }, group, "lease");
        svgEl("rect", { class: "dg-lease-bg", x: 104, y: 12, width: 84, height: 8, rx: 4 }, group);
        const lease = svgEl("rect", { class: "dg-lease", x: 104, y: 12, width: 84, height: 8, rx: 4 }, group);
        svgEl("rect", { class: "dg-front", x: 12, y: 32, width: 176, height: g.columns === 1 ? 22 : 30, rx: 5 }, group);
        const front = svgEl("text", { class: "dg-small", x: 100, y: g.columns === 1 ? 47 : 51, "text-anchor": "middle" }, group, "front: pages and APIs");
        const status = svgEl("text", { class: "dg-small", x: 100, y: g.columns === 1 ? 47 : 80, "text-anchor": "middle" }, group);
        nodeViews.set(n.id, { group, lease, status, front });
      }
      // Mutual TLS links between adjacent nodes in each row.
      model.nodes.forEach((n, i) => {
        if (i % g.columns === g.columns - 1 || i === model.nodes.length - 1) return;
        const [x, y] = g.origins.get(n.id);
        svgEl("path", { class: "dg-mtls", d: `M${x + 200} ${y + 47}h60` }, svg);
        svgEl("text", { class: "dg-small", x: x + 230, y: y + 38, "text-anchor": "middle" }, svg, "mTLS");
      });
      if (g.free.length) svgEl("text", { class: "dg-small", x: 35, y: g.freeY + 12 }, svg, "No owner · asleep or ended");
      svgEl("rect", { class: "dg-bucket", x: 20, y: g.bucketY, width: g.width - 40, height: 64, rx: 8 }, svg);
      svgEl("text", { class: "dg-text", x: g.width / 2, y: g.bucketY + 25, "text-anchor": "middle" }, svg, g.columns === 1 ? "Your bucket" : "Your S3-compatible bucket");
      svgEl("text", { class: "dg-small", x: g.width / 2, y: g.bucketY + 45, "text-anchor": "middle" }, svg, g.columns === 1 ? "leases, owners, saved history" : "node leases, who holds each actor, saved actor history");
      actorViews = new Map();
      for (const a of model.actors) {
        const group = svgEl("g", { class: "actor-g", "data-actor-id": a.id }, svg);
        svgEl("rect", { class: "dg-actor", width: 88, height: 54, rx: 5 }, group);
        svgEl("text", { class: "dg-mono", x: 6, y: 15 }, group, a.id);
        const status = svgEl("text", { class: "dg-small", x: 6, y: 31 }, group);
        const value = svgEl("text", { class: "dg-small", x: 6, y: 46 }, group);
        actorViews.set(a.id, { group, status, value });
        // Resizes snap to the new layout; actor hand-overs travel between nodes.
        if (!positions.has(a.id) || reduce.matches) positions.set(a.id, g.goals.get(a.id));
        group.setAttribute("transform", `translate(${positions.get(a.id).join(" ")})`);
      }
      positions = new Map([...positions].filter(([id]) => actorViews.has(id)));
      packetLayer = svgEl("g", { "aria-hidden": "true" }, svg);
      packets = [];
    }

    function options(select, items) {
      const old = select.value;
      select.replaceChildren(...items.map(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
      }));
      if (items.some(([value]) => value === old)) select.value = old;
    }
    function controls() {
      const key = model.nodes.map(n => `${n.id}:${n.state}`).join() + model.actors.map(a => a.id).join();
      if (key !== controlKey) {
        controlKey = key;
        const buttons = find("node-buttons");
        const existing = new Map([...buttons.children].map(b => [b.dataset.kill, b]));
        for (const n of model.nodes) {
          if (existing.has(n.id)) continue;
          const button = document.createElement("button");
          button.type = "button";
          button.className = "kill";
          button.dataset.kill = n.id;
          // Reuse the project's decorative inline SVG.
          const icon = buttons.querySelector("svg");
          if (icon) button.append(icon.cloneNode(true));
          button.append(`Kill node ${n.id}`);
          buttons.append(button);
        }
        for (const [id, b] of existing) if (!model.nodes.some(n => n.id === id)) b.remove();
        options(target, model.actors.map(a => [a.id, a.id]));
        const live = model.live().map(n => [n.id, `Node ${n.id}`]);
        options(find("remove-node"), live);
        options(find("destination"), live);
      }
      const unstable = model.unstable();
      for (const b of find("node-buttons").children) {
        b.disabled = paused || unstable || !!model.failure || model.live().length < 2 || !model.live().some(n => n.id === b.dataset.kill);
      }
      find("restart").disabled = paused || model.failure?.phase !== "done";
      find("add-node").disabled = paused || unstable || model.nodes.length >= 5;
      find("drain").disabled = paused || unstable || model.live().length < 2;
      find("spawn").disabled = paused || model.active().length >= 30;
      const a = selected();
      const available = a && ["serving", "sleeping"].includes(a.state);
      find("move").disabled = paused || !available || find("destination").value === a?.node;
      find("delete").disabled = paused || !available;
      find("idle").disabled = paused || a?.state !== "serving" || a?.muted;
      find("read").disabled = find("write").disabled = paused || !a;
      find("actor-count").textContent = `${model.active().length} / 30`;
      find("inspect").textContent = a ? `${a.id} · ${STATES[a.state]}${a.node ? ` on ${a.node}` : ", no owner"} · local ${a.local} / bucket ${a.saved} · lost ${a.lost}${a.uploadAt !== null ? " · plain upload pending" : ""}${a.muted ? " · background traffic off" : ""}` : "";
    }

    function refresh() {
      const key = `${root.clientWidth < 560}:` + model.nodes.map(n => n.id).join() + model.actors.map(a => `${a.id}:${a.node}`).join();
      if (key !== layoutKey) { layoutKey = key; draw(); }
      for (const n of model.nodes) {
        const view = nodeViews.get(n.id);
        const phase = model.failure?.id === n.id ? model.failure.phase : "";
        view.group.setAttribute("class", `node-g ${["dead", "fenced"].includes(n.state) ? "dead" : ""} ${phase}`);
        view.lease.setAttribute("width", Math.max(0, 84 * (1 - (model.now - n.beat) / 10)));
        view.front.textContent = geometry.columns === 1 && n.state !== "live" ? "" : "front: pages and APIs";
        view.status.textContent = n.state === "live" ? "" : n.state === "draining" ? "draining before removal" : phase === "grace" ? "lease expired · grace" : n.state === "fenced" ? "fenced · no owner rights" : "killed (kill -9)";
      }
      for (const a of model.actors) {
        const view = actorViews.get(a.id);
        view.group.setAttribute("class", `actor-g ${a.state} ${a.id === target.value ? "target" : ""}`);
        view.group.dataset.state = a.state;
        view.group.dataset.node = a.node || "";
        view.status.textContent = STATES[a.state];
        view.value.textContent = a.state === "deleted" ? "history erased" : `${a.local} / saved ${a.saved}`;
      }
      controls();
      const f = model.failure;
      clock.textContent = paused ? "Simulation paused." : !f ? "Ready. Pick a node to kill." :
        f.phase === "done" ? `Takeover complete. ${f.actors.length ? `${f.duration.toFixed(1)} s scenario · ${(f.duration / SPEED).toFixed(1)} s on screen.` : "No resident actors needed restoring."}` :
        `${(model.now - f.at).toFixed(1)} s since kill · ${f.phase === "lease" ? "lease running down" : f.phase === "grace" ? "grace period" : "fenced; restoring"} · 5× faster`;
      find("stats").textContent = `${model.counts.served} answered · ${model.waiting()} reads waiting · ${model.counts.retry} got 503 · ${model.counts.lost} plain writes lost`;
      model.takeEvents().forEach(say);
      for (const p of model.takePackets()) {
        if (reduce.matches || paused || !visible || packets.length >= 40) continue;
        const start = geometry.origins.get(p.via);
        const end = geometry.goals.get(p.actor);
        if (!start || !end) continue;
        const a = model.actors.find(a => a.id === p.actor);
        const owner = geometry.origins.get(a.node);
        const points = [[geometry.width / 2, 30], [start[0] + 100, start[1] + 47]];
        if (owner && a.node !== p.via) points.push([owner[0] + 100, owner[1] + 47]);
        points.push([end[0] + 44, end[1] + 27]);
        packets.push({ points, age: 0, element: svgEl("circle", { class: `dg-packet ${p.result}`, r: 4, cx: points[0][0], cy: points[0][1] }, packetLayer) });
      }
    }

    // One animation loop owns every dot and actor movement. Pausing, hiding the
    // tab or reduced motion also stops decorative movement, without losing state.
    function frame(ts) {
      const dt = Math.min(0.05, (ts - lastFrame) / 1000);
      lastFrame = ts;
      if (!paused && visible && !document.hidden) {
        for (const [id, goal] of geometry.goals) {
          const pos = positions.get(id);
          const next = reduce.matches ? goal : pos.map((v, i) => Math.abs(goal[i] - v) < 0.5 ? goal[i] : v + (goal[i] - v) * Math.min(1, dt * 9));
          positions.set(id, next);
          actorViews.get(id).group.setAttribute("transform", `translate(${next.join(" ")})`);
        }
        packets = packets.filter(p => {
          p.age += dt;
          if (reduce.matches || p.age >= 0.9) { p.element.remove(); return false; }
          const progress = p.age / 0.9 * (p.points.length - 1);
          const i = Math.floor(progress);
          const t = progress - i;
          const [x, y] = p.points[i].map((v, axis) => v + (p.points[i + 1][axis] - v) * t);
          p.element.setAttribute("cx", x);
          p.element.setAttribute("cy", y);
          return true;
        });
      }
      requestAnimationFrame(frame);
    }

    const act = callback => event => {
      callback(event);
      refresh();
      // Disabled controls should not strand keyboard focus.
      if (event.currentTarget.disabled && document.activeElement === event.currentTarget) clock.focus();
    };
    find("node-buttons").addEventListener("click", event => {
      const button = event.target.closest("[data-kill]");
      if (!button || button.disabled) return;
      model.kill(button.dataset.kill);
      refresh();
      clock.focus({ preventScroll: true });
    });
    const actions = {
      restart: () => model.restart(),
      "add-node": () => model.addNode(),
      drain: () => model.drain(find("remove-node").value),
      spawn: () => { const a = model.spawn(); controls(); if (a) target.value = a.id; },
      move: () => model.move(selected(), find("destination").value),
      delete: () => model.deleteActor(selected()),
      idle: () => model.idle(selected()),
      read: () => model.request(selected(), "GET", true),
      write: () => model.request(selected(), "POST", true),
      pause: () => {
        paused = !paused;
        find("pause").textContent = paused ? "Resume" : "Pause";
        find("pause").setAttribute("aria-pressed", String(paused));
      },
      reset: () => {
        model = new WasmKeepSimulation();
        paused = false;
        find("pause").textContent = "Pause";
        find("pause").setAttribute("aria-pressed", "false");
        find("load").value = "1";
        find("load-label").textContent = "1 / simulated s";
        find("mode").value = "durable";
        find("timing").value = "median";
        controlKey = layoutKey = "";
        positions.clear();
        log.replaceChildren();
        model.say("Reset: six actors, each with a saved value of 3. Kill any node to try a takeover.");
      },
    };
    for (const [key, callback] of Object.entries(actions)) find(key).addEventListener("click", act(callback));
    find("load").addEventListener("input", () => {
      model.load = Number(find("load").value);
      find("load-label").textContent = `${model.load} / simulated s`;
    });
    find("mode").addEventListener("change", () => { model.mode = find("mode").value; });
    find("timing").addEventListener("change", () => { model.profile = find("timing").value; });
    target.addEventListener("change", refresh);
    find("destination").addEventListener("change", controls);
    new ResizeObserver(() => {
      const wasNarrow = layoutKey.startsWith("true:");
      if (wasNarrow !== (root.clientWidth < 560)) positions.clear();
      refresh();
    }).observe(root);
    if (window.IntersectionObserver) new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
    }).observe(root);
    model.say("Six actors, each with a saved value of 3. Kill a node; its peers keep serving. Times run 5× faster.");
    refresh();
    root.dataset.enhanced = "true";
    const stage = root.querySelector(".sim-fig");
    stage.tabIndex = 0;
    stage.setAttribute("role", "region");
    stage.setAttribute("aria-label", "Cluster diagram; scroll to see additional nodes and actors");
    for (const control of root.querySelectorAll("[data-controls]")) control.hidden = false;
    setInterval(() => {
      const ts = performance.now();
      const dt = Math.min(0.2, (ts - lastTick) / 1000);
      lastTick = ts;
      if (paused || !visible || document.hidden) return;
      model.advance(dt * SPEED);
      refresh();
    }, 100);
    requestAnimationFrame(frame);
  }
})();
