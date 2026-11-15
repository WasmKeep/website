// Local teaching scene. SVG attributes, never inline styles or scripts.
(() => {
  "use strict";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent, text) => {
    const e = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) e.setAttribute(key, value);
    if (text !== undefined) e.textContent = text;
    parent.append(e);
    return e;
  };
  const states = { serving: "SQLite", sleeping: "asleep", stranded: "waiting", restoring: "restoring", moving: "moving", deleting: "deleting", deleted: "deleted" };
  document.querySelectorAll("[data-sim]").forEach(setup);

  function setup(root) {
    const find = key => root.querySelector(`[data-${key}]`);
    const svg = root.querySelector(".sim-fig > svg");
    const stage = root.querySelector(".sim-fig");
    const dialog = find("menu");
    const menu = find("menu-items");
    const target = find("target");
    let model = new WasmKeepSimulation();
    let paused = false, speed = 5;
    let geometry, layoutKey = "", optionKey = "", menuContext = null;
    let nodeViews = new Map(), actorViews = new Map();
    let routePath, packet, packetLabel, drag = null, suppressClick = false;
    let previous = performance.now(), lastMessage = "", lastStep = null;
    const selected = () => model.actors.find(a => a.id === target.value);
    const announce = message => { find("live").textContent = message; };

    function layout() {
      const cols = stage.clientWidth < 560 ? 1 : Math.min(3, model.nodes.length);
      const width = cols === 1 ? 280 : cols * 260;
      const origins = new Map(), goals = new Map(), heights = new Map();
      let y = cols === 1 ? 106 : 138;
      for (let i = 0; i < model.nodes.length; i += cols) {
        let rowHeight = cols === 1 ? 48 : 162;
        for (let j = i; j < Math.min(i + cols, model.nodes.length); j++) {
          const n = model.nodes[j];
          const actors = model.actors.filter(a => a.node === n.id);
          const h = Math.max(cols === 1 ? 48 : 162, (cols === 1 ? 42 : 94) + Math.ceil(actors.length / 2) * 62);
          const x = cols === 1 ? 35 : 20 + (j % cols) * 260;
          origins.set(n.id, [x, y]); heights.set(n.id, h);
          actors.forEach((a, slot) => goals.set(a.id, [x + 10 + slot % 2 * 95, y + (cols === 1 ? 40 : 82) + Math.floor(slot / 2) * 62]));
          rowHeight = Math.max(rowHeight, h);
        }
        y += rowHeight + (cols === 1 ? 16 : 48);
      }
      const free = model.actors.filter(a => a.node === null);
      const freeY = y;
      const shelfCols = cols * 2;
      free.forEach((a, i) => goals.set(a.id, [35 + i % shelfCols * ((width - 70) / shelfCols), y + 24 + Math.floor(i / shelfCols) * 62]));
      if (free.length) y += 36 + Math.ceil(free.length / shelfCols) * 62;
      return { cols, width, height: y + 74, bucketY: y, freeY, free, origins, goals, heights };
    }
    const tileAttrs = (kind, id) => ({ tabindex: 0, role: "button", "aria-haspopup": "menu", "aria-expanded": "false", "aria-controls": `${root.id}-menu`, [`data-${kind}-id`]: id });
    function draw() {
      const focused = document.activeElement;
      const focusActor = focused?.dataset.actorId;
      const focusNode = focused?.dataset.nodeId;
      geometry = layout();
      const g = geometry;
      svg.replaceChildren();
      svg.setAttribute("role", "group"); // role=img would hide interactive descendants
      svg.setAttribute("viewBox", `0 0 ${g.width} ${g.height}`);
      svg.setAttribute("aria-describedby", `${root.id}-help`);
      el("title", { id: `${root.id}-t` }, svg, "Interactive WasmKeep cluster");
      el("desc", { id: `${root.id}-d` }, svg, "Client, load balancer, nodes and shared bucket. Focus a node or actor and press Enter for actions. Requests are shown one at a time.");
      const backdrop = el("g", { "aria-hidden": "true" }, svg);
      el("rect", { class: "dg-lb", x: g.width / 2 - 42, y: 4, width: 84, height: 30, rx: 6 }, backdrop);
      el("text", { class: "dg-text", x: g.width / 2, y: 24, "text-anchor": "middle" }, backdrop, "Client");
      el("path", { class: "dg-link", d: `M${g.width / 2} 34V56` }, backdrop);
      el("rect", { class: "dg-lb", x: 35, y: 56, width: g.width - 70, height: 34, rx: 6 }, backdrop);
      el("text", { class: "dg-text", x: g.width / 2, y: 78, "text-anchor": "middle" }, backdrop, "Load balancer");
      for (const n of model.nodes) {
        const [x, y] = g.origins.get(n.id), h = g.heights.get(n.id);
        const ingress = points("lb", `node:${n.id}`);
        el("path", { class: "dg-link", d: path(ingress) }, backdrop);
        el("path", { class: "dg-repl", d: path(points(`storage:${n.id}`, `bucket:${n.id}`)) }, backdrop);
        const group = el("g", { class: "node-g", transform: `translate(${x} ${y})`, ...tileAttrs("node", n.id) }, svg);
        el("rect", { class: "dg-node", width: 200, height: h, rx: 8 }, group);
        el("text", { class: "dg-text", x: 12, y: 23 }, group, `Node ${n.id}`);
        const status = el("text", { class: "dg-small", x: 188, y: 23, "text-anchor": "end" }, group);
        el("rect", { class: "dg-lease-bg", x: 12, y: 32, width: 176, height: 4, rx: 2 }, group);
        const lease = el("rect", { class: "dg-lease", x: 12, y: 32, width: 176, height: 4, rx: 2 }, group);
        if (g.cols !== 1) {
        el("rect", { class: "dg-front", x: 12, y: 44, width: 176, height: 26, rx: 5 }, group);
        el("text", { class: "dg-small", x: 100, y: 61, "text-anchor": "middle" }, group, "front · pages and APIs");
        }
        nodeViews.set(n.id, { group, status, lease });
      }
      if (g.free.length) el("text", { class: "dg-small", x: 35, y: g.freeY + 12 }, svg, "No owner · saved in the bucket");
      el("rect", { class: "dg-bucket", x: 20, y: g.bucketY, width: g.width - 40, height: 60, rx: 8 }, svg);
      el("text", { class: "dg-text", x: g.width / 2, y: g.bucketY + 24, "text-anchor": "middle" }, svg, g.cols === 1 ? "Your bucket" : "Your S3-compatible bucket");
      el("text", { class: "dg-small", x: g.width / 2, y: g.bucketY + 43, "text-anchor": "middle" }, svg, "leases · owners · saved history");
      actorViews = new Map();
      for (const a of model.actors) {
        const group = el("g", { class: "actor-g", ...tileAttrs("actor", a.id), transform: `translate(${g.goals.get(a.id).join(" ")})` }, svg);
        el("rect", { class: "dg-actor", width: 88, height: 54, rx: 5 }, group);
        el("text", { class: "dg-mono", x: 6, y: 18 }, group, a.id);
        // Same small database silhouette as the original scene.
        el("path", { class: "dg-db", d: "M8 31v10c0 1.6 3 2.8 6 2.8s6-1.2 6-2.8V31" }, group);
        el("ellipse", { class: "dg-db", cx: 14, cy: 31, rx: 6, ry: 2.4 }, group);
        const status = el("text", { class: "dg-small", x: 25, y: 42 }, group);
        actorViews.set(a.id, { group, status });
      }
      const layer = el("g", { "aria-hidden": "true", class: "sim-packets" }, svg);
      routePath = el("path", { class: "dg-trace", d: "" }, layer);
      packet = el("circle", { class: "dg-packet", r: 7, visibility: "hidden" }, layer);
      packetLabel = el("text", { class: "dg-request-id", visibility: "hidden" }, layer);
      const refocus = focusActor ? actorViews.get(focusActor)?.group : focusNode ? nodeViews.get(focusNode)?.group : null;
      if (refocus) refocus.focus({ preventScroll: true });
    }
    const path = pts => pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
    function endpoint(key) {
      const g = geometry;
      if (key === "client") return [g.width / 2, 34];
      if (key === "lb") return [g.width / 2, 90];
      const [kind, ...rest] = key.split(":"), id = rest.join(":");
      if (kind === "actor") { const p = g.goals.get(id); return p ? [p[0] + 44, p[1] + 27] : [g.width / 2, g.freeY]; }
      const [x, y] = g.origins.get(id) || [35, 138];
      if (kind === "bucket") return [g.cols === 1 ? 35 : x + 100, g.bucketY + 12];
      if (kind === "storage") return [x + 100, y + (g.heights.get(id) || 162) - 8];
      return [x + 188, y + 57];
    }
    // Dedicated orthogonal lanes. Forwarding goes node-to-node above/beside
    // the cards, never back through the LB or diagonally across other actors.
    function points(from, to) {
      const g = geometry, a = endpoint(from), b = endpoint(to);
      if (from === "client") return [a, [g.width / 2, 56]];
      if (to === "lb" || to === "client" || from.startsWith("bucket:")) return points(to, from).reverse();
      if (from === "lb" && to.startsWith("node:")) {
        if (g.cols === 1) return [[g.width - 35, 73], [g.width - 12, 73], [g.width - 12, b[1]], b];
        if (b[1] > 200) return [a, [g.width - 12, a[1]], [g.width - 12, b[1] - 77], [b[0] + 22, b[1] - 77], [b[0] + 22, b[1]], b];
        return [a, [a[0], 102], [b[0] + 22, 102], [b[0] + 22, b[1]], b];
      }
      if (from.startsWith("node:") && to.startsWith("node:")) {
        if (g.cols === 1) return [a, [g.width - 26, a[1]], [g.width - 26, b[1]], b];
        return [a, [a[0] + 22, a[1]], [a[0] + 22, a[1] - 77], [b[0] + 22, a[1] - 77], [b[0] + 22, b[1]], b];
      }
      if (from.startsWith("actor:") && to.startsWith("node:")) return points(to, from).reverse();
      if (from.startsWith("node:") && to.startsWith("actor:")) return [a, [a[0] + 6, a[1]], [a[0] + 6, b[1] - 31], [b[0], b[1] - 31], b];
      if (from.startsWith("storage:") && to.startsWith("actor:")) return points(to, from).reverse();
      if (from.startsWith("actor:") && to.startsWith("storage:")) return [a, [a[0], a[1] + 31], [b[0] + 94, a[1] + 31], [b[0] + 94, b[1]], b];
      if ((from.startsWith("storage:") || from.startsWith("node:")) && to.startsWith("bucket:")) {
        const lane = from.startsWith("node:") ? a[0] + 22 : g.cols === 1 ? 15 : a[0] - 110;
        return [a, [lane, a[1]], [lane, g.bucketY - 14], [b[0], g.bucketY - 14], b];
      }
      return [a, b];
    }
    function paintTrace() {
      const r = model.current, s = r?.step;
      packet.setAttribute("visibility", "hidden"); packetLabel.setAttribute("visibility", "hidden");
      routePath.setAttribute("d", "");
      if (!r) { find("trace").textContent = lastMessage || "One request at a time, so you can follow every hop."; return; }
      const label = r.waiting ? `Waiting at node ${r.via}: ownership is not free yet` : s?.label || "Preparing the next hop";
      find("trace").textContent = `#${r.id} · ${r.actor.id} · ${label}${model.queue.length ? ` · ${model.queue.length} queued` : ""}`;
      if (s && s !== lastStep) { lastStep = s; announce(`Request ${r.id}: ${label}.`); }
      if (!s && !r.waiting) return;
      const pts = r.waiting ? [endpoint(`node:${r.via}`), endpoint(`node:${r.via}`)] : points(s.from, s.to);
      const kind = r.waiting ? "wait" : s.kind;
      routePath.setAttribute("class", `dg-trace ${kind}`);
      routePath.setAttribute("d", path(pts));
      // Reduced motion keeps a static highlighted hop and text; no travelling dot.
      if (reduced.matches) return;
      let remaining = (s ? Math.min(1, s.elapsed / s.duration) : 0) * pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
      let pos = pts[0];
      for (let i = 1; i < pts.length; i++) {
        const length = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (remaining <= length && length) { pos = pts[i - 1].map((v, axis) => v + (pts[i][axis] - v) * remaining / length); break; }
        remaining -= length; pos = pts[i];
      }
      packet.setAttribute("class", `dg-packet ${kind}`);
      packet.setAttribute("cx", pos[0]); packet.setAttribute("cy", pos[1]); packet.setAttribute("visibility", "visible");
      packetLabel.setAttribute("x", pos[0] + 10); packetLabel.setAttribute("y", pos[1] - 10);
      packetLabel.setAttribute("visibility", "visible"); packetLabel.textContent = `#${r.id}`;
    }
    function refresh() {
      const key = `${stage.clientWidth < 560}:` + model.nodes.map(n => n.id).join() + model.actors.map(a => `${a.id}:${a.node}`).join();
      if (key !== layoutKey) { layoutKey = key; nodeViews = new Map(); draw(); }
      const nextOptions = model.actors.map(a => a.id).join();
      if (nextOptions !== optionKey) {
        optionKey = nextOptions;
        const old = target.value;
        target.replaceChildren(...model.actors.map(a => { const o = document.createElement("option"); o.value = a.id; o.textContent = a.id; return o; }));
        if (model.actors.some(a => a.id === old)) target.value = old;
      }
      const pending = [...model.failures.values()].filter(f => f.phase !== "done");
      for (const n of model.nodes) {
        const v = nodeViews.get(n.id), f = model.failures.get(n.id), phase = f?.phase || "";
        v.group.setAttribute("class", `node-g ${["dead", "fenced"].includes(n.state) ? "dead" : ""} ${phase}`);
        v.group.setAttribute("aria-label", `Node ${n.id}, ${n.state}. Open node menu`);
        v.status.textContent = n.state === "dead" ? phase === "grace" ? "grace" : "killed" : n.state === "live" ? "ready" : n.state;
        v.lease.setAttribute("width", n.state === "dead" ? Math.max(0, 176 * (1 - (model.now - f.at) / 10)) : n.state === "fenced" ? 0 : 176);
      }
      for (const a of model.actors) {
        const v = actorViews.get(a.id);
        v.group.setAttribute("class", `actor-g ${a.state}${a.id === target.value ? " target" : ""}`);
        v.group.dataset.state = a.state; v.group.dataset.node = a.node || "";
        v.group.setAttribute("aria-label", `${a.id}, ${states[a.state]}${a.node ? ` on node ${a.node}` : ", no owner"}, local value ${a.local}, saved ${a.saved}. Open actor menu`);
        v.status.textContent = a.operation?.kind === "sleep" ? "idling" : states[a.state];
      }
      find("send").disabled = paused;
      find("write").disabled = paused;
      find("add-node").disabled = paused || model.nodes.length >= 5;
      find("spawn").disabled = paused || model.active().length >= 30 || !model.live().length;
      const caption = !model.live().length ? "All nodes down: the bucket keeps the data; restart one" :
        model.failures.size ? "No quorum needed: one live node is enough" : "Ownership lives in the bucket. Try a node or actor menu.";
      if (find("caption").textContent !== caption) find("caption").textContent = caption;
      find("clock").textContent = paused ? "Simulation paused." : pending.length ?
        `${pending.length} lease${pending.length > 1 ? "s" : ""} pending · 10 s + 5 s grace · ${speed}×${speed > 1 ? " faster" : " speed"}` :
        `Simulation · ${speed}×${speed > 1 ? " faster" : " speed"} · ${model.live().length} live`;
      const saved = model.actors.reduce((sum, a) => sum + a.saved, 0);
      const durable = model.actors.reduce((sum, a) => sum + a.durable, 0);
      find("bucket").textContent = `Bucket: ${saved} saved writes · ${durable} durable intact`;
      find("stats").textContent = `${model.counts.served} answered · ${model.counts.retry} got 503 · ${model.counts.lost} plain writes lost`;
      const events = model.takeEvents();
      for (const event of events) {
        const li = document.createElement("li"); li.dataset.t = `${event.time.toFixed(1)} s`; li.textContent = event.text;
        find("log").append(li);
        while (find("log").children.length > 50) find("log").firstChild.remove();
        lastMessage = event.text;
      }
      if (events.length) { announce(events.map(e => e.text).join(" ")); find("log").scrollTop = find("log").scrollHeight; }
      paintTrace();
    }

    function closeMenu() {
      dialog.close();
      const context = menuContext;
      menuContext = null;
      const tile = context?.kind === "actor" ? actorViews.get(context.id)?.group : nodeViews.get(context?.id)?.group;
      if (tile) { tile.setAttribute("aria-expanded", "false"); tile.focus({ preventScroll: true }); }
      else find("send").focus({ preventScroll: true });
    }
    function menuItem(label, action, enabled = true) {
      const b = document.createElement("button"); b.type = "button"; b.role = "menuitem"; b.textContent = label; b.tabIndex = -1;
      b.disabled = !enabled || paused;
      b.addEventListener("click", () => {
        const result = action();
        if (result === "submenu") return;
        if (result === false) model.say("That operation is no longer available. Finish the current hand-over and try again.");
        refresh(); closeMenu();
      });
      menu.append(b);
    }
    function focusFirst() { const b = menu.querySelector("button:not(:disabled)"); if (b) { b.tabIndex = 0; b.focus(); } else find("close").focus(); }
    function openMenu(kind, id) {
      menuContext = { kind, id };
      menu.replaceChildren();
      const a = model.actors.find(a => a.id === id), n = model.nodes.find(n => n.id === id);
      find("menu-title").textContent = kind === "actor" ? id : `Node ${id}`;
      if (kind === "actor") {
        target.value = id;
        find("menu-info").textContent = `${states[a.state]}${a.node ? ` on ${a.node}` : ", no owner"} · local ${a.local} / bucket ${a.saved}`;
        menuItem("Send request", () => model.request(a));
        menuItem("Durable write", () => model.request(a, "POST", null, "durable"));
        menuItem("Plain write", () => model.request(a, "POST", null, "plain"));
        const available = !a.operation && ["serving", "sleeping"].includes(a.state);
        menuItem("Move to…", () => {
          menu.replaceChildren();
          find("menu-info").textContent = "Choose a destination. Finish events, upload, then restore there.";
          for (const to of model.live()) menuItem(`Move to node ${to.id}`, () => model.move(a, to.id), to.id !== a.node);
          menuItem("Back to actor menu", () => { openMenu(kind, id); return "submenu"; });
          focusFirst(); return "submenu";
        }, available && model.live().some(n => n.id !== a.node));
        menuItem("Sleep", () => model.sleep(a), available && a.state === "serving");
        menuItem("Delete", () => model.deleteActor(a), available);
      } else {
        find("menu-info").textContent = `${n.state} · ${model.actors.filter(a => a.node === id).length} actors`;
        menuItem("Kill", () => model.kill(id), model.canKill(id));
        menuItem("Restart", () => model.restart(id), ["dead", "fenced"].includes(n.state));
        menuItem("Drain", () => model.drain(id), n.state === "live" && model.live().length > 1 && !model.unstable());
        menuItem("Remove", () => model.remove(id), n.state === "live" ? model.live().length > 1 && !model.unstable() : ["drained", "fenced"].includes(n.state) && model.nodes.length > 1);
      }
      refresh();
      const tile = kind === "actor" ? actorViews.get(id)?.group : nodeViews.get(id)?.group;
      tile?.setAttribute("aria-expanded", "true");
      if (!dialog.open) dialog.showModal();
      focusFirst();
    }
    dialog.id = `${root.id}-menu`;
    find("close").addEventListener("click", closeMenu);
    dialog.addEventListener("cancel", event => { event.preventDefault(); closeMenu(); });
    dialog.addEventListener("click", event => { if (event.target === dialog) closeMenu(); });
    menu.addEventListener("keydown", event => {
      const buttons = [...menu.querySelectorAll("button:not(:disabled)")];
      const i = buttons.indexOf(document.activeElement);
      let next;
      if (["ArrowDown", "ArrowRight"].includes(event.key)) next = (i + 1) % buttons.length;
      if (["ArrowUp", "ArrowLeft"].includes(event.key)) next = (i - 1 + buttons.length) % buttons.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = buttons.length - 1;
      if (next !== undefined && buttons[next]) { event.preventDefault(); buttons.forEach(b => b.tabIndex = -1); buttons[next].tabIndex = 0; buttons[next].focus(); }
    });
    svg.addEventListener("click", event => {
      if (suppressClick) { suppressClick = false; return; }
      const tile = event.target.closest("[data-actor-id], [data-node-id]");
      if (tile) openMenu(tile.dataset.actorId ? "actor" : "node", tile.dataset.actorId || tile.dataset.nodeId);
    });
    svg.addEventListener("keydown", event => {
      const tile = event.target.closest("[role=button]");
      if (!tile) return;
      if (["Enter", " "].includes(event.key)) { event.preventDefault(); tile.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
      if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        const tiles = [...svg.querySelectorAll("[role=button]")];
        const delta = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
        tiles[(tiles.indexOf(tile) + delta + tiles.length) % tiles.length].focus();
      }
    });
    function svgPoint(event) { return new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse()); }
    // Touch keeps native scrolling and opens menus; drag is a mouse/pen shortcut.
    svg.addEventListener("pointerdown", event => {
      const tile = event.target.closest("[data-actor-id]");
      const a = model.actors.find(a => a.id === tile?.dataset.actorId);
      if (!tile || event.pointerType === "touch" || event.button !== 0 || paused || a.operation || !["serving", "sleeping"].includes(a.state)) return;
      suppressClick = false;
      drag = { id: a.id, pointer: event.pointerId, start: svgPoint(event), moved: false };
    });
    svg.addEventListener("pointermove", event => {
      if (!drag || drag.pointer !== event.pointerId) return;
      const p = svgPoint(event), d = drag;
      if (Math.hypot(p.x - d.start.x, p.y - d.start.y) < 6 && !d.moved) return;
      d.moved = true;
      if (!svg.hasPointerCapture(event.pointerId)) svg.setPointerCapture(event.pointerId);
      const origin = geometry.goals.get(d.id), tile = actorViews.get(d.id).group;
      tile.setAttribute("transform", `translate(${origin[0] + p.x - d.start.x} ${origin[1] + p.y - d.start.y})`);
      tile.classList.add("dragging");
      for (const n of model.nodes) nodeViews.get(n.id).group.classList.toggle("drop-target", n.state === "live" && hitNode(p) === n.id);
    });
    function hitNode(p) {
      return model.nodes.find(n => { const [x, y] = geometry.origins.get(n.id); return p.x >= x && p.x <= x + 200 && p.y >= y && p.y <= y + geometry.heights.get(n.id); })?.id;
    }
    function endDrag(event, cancel = false) {
      if (!drag) return;
      const d = drag; drag = null;
      if (svg.hasPointerCapture(d.pointer)) svg.releasePointerCapture(d.pointer);
      if (d.moved) {
        suppressClick = true;
        const a = model.actors.find(a => a.id === d.id), to = hitNode(svgPoint(event));
        if (!cancel && to && to !== a.node) { if (!model.move(a, to)) model.say("Move unavailable: choose a ready node from the actor menu."); }
        actorViews.get(d.id)?.group.setAttribute("transform", `translate(${geometry.goals.get(d.id).join(" ")})`);
        refresh();
      }
      for (const v of nodeViews.values()) v.group.classList.remove("drop-target");
    }
    svg.addEventListener("pointerup", event => endDrag(event));
    svg.addEventListener("pointercancel", event => endDrag(event, true));
    const action = (key, callback) => find(key).addEventListener("click", () => {
      const button = find(key);
      callback(); refresh();
      if (button.disabled && document.activeElement === button) find("send")?.focus({ preventScroll: true });
    });
    action("send", () => model.request(selected()));
    action("write", () => model.request(selected(), "POST", null, find("mode").value));
    action("add-node", () => model.addNode());
    action("spawn", () => { const a = model.spawn(); refresh(); if (a) target.value = a.id; });
    action("pause", () => { paused = !paused; find("pause").textContent = paused ? "Resume" : "Pause"; find("pause").setAttribute("aria-pressed", String(paused)); announce(paused ? "Simulation paused." : "Simulation resumed."); });
    action("reset", () => {
      model = new WasmKeepSimulation(); paused = false; speed = 5; find("speed").value = "5"; find("mode").value = "durable"; find("write").textContent = "Durable write"; layoutKey = ""; optionKey = ""; lastMessage = ""; lastStep = null;
      find("log").replaceChildren(); find("load").value = 0; find("load-label").textContent = "Off";
      find("pause").textContent = "Pause"; find("pause").setAttribute("aria-pressed", "false");
      announce("Demo reset. Three nodes, six actors, no automatic requests.");
    });
    target.addEventListener("change", refresh);
    find("load").addEventListener("input", () => { model.load = Number(find("load").value); model.traffic = 0; find("load-label").textContent = model.load ? `${model.load} / simulated s (paced)` : "Off"; });
    find("speed").addEventListener("change", () => { speed = Number(find("speed").value); refresh(); });
    find("mode").addEventListener("change", () => { find("write").textContent = find("mode").value === "plain" ? "Plain write" : "Durable write"; });
    const closeSettings = () => { find("settings").open = false; find("settings").querySelector("summary").focus({ preventScroll: true }); };
    action("settings-close", closeSettings);
    find("settings").addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); closeSettings(); } });
    find("settings").addEventListener("focusout", event => { if (!find("settings").contains(event.relatedTarget)) find("settings").open = false; });
    find("feed").hidden = false;
    root.dataset.enhanced = "true";
    find("controls").hidden = false;
    refresh();
    new ResizeObserver(() => { if (!drag) refresh(); }).observe(root);
    reduced.addEventListener("change", paintTrace);
    function frame(now) {
      const dt = Math.min(0.1, (now - previous) / 1000); previous = now;
      // Opening a menu pauses time so keyboard/touch users can inspect calmly.
      if (!paused && !dialog.open && !drag && !document.hidden && (model.current || model.queue.length || model.load || model.unstable() || [...model.failures.values()].some(f => f.phase !== "done"))) { model.advance(dt * speed); refresh(); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
})();
