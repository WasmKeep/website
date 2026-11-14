// The break-even calculator on /cost/. Prices: the vendors' own pages,
// read on 2026-11-14 (listed on the page). Currencies are never converted:
// a bill is a sum per currency, and a chart draws one currency per axis.
// Chart colours: the validated pair --series-self / --series-cf (dataviz
// validator, light and dark), with a dashed line for Cloudflare so the
// two are told apart without colour too.
(() => {
  "use strict";
  const root = document.getElementById("calc");
  if (!root) return;
  root.hidden = false;

  const M = 1e6;
  const MONTH_S = 30 * 24 * 3600;
  const NODES = 3;
  const GB_PER_OBJECT = 128 / 1024; // Cloudflare bills 128 MB per active object

  // Measured inputs (see "Assumptions" on the page).
  const PUT_PER_WRITE = 1.03;
  const IDLE = { put: 0.334, list: 1.1, get: 1.67 }; // per node and second, idle
  // The highest rate of acknowledged durable writes among the soaks the
  // site cites: 643,891 in 10,804.5 s (648c2d1, 3 h); b849bfe carried
  // 53.4 a second, 0bf0547 52.3.
  const SOAK_WRITES_PER_S = 643891 / 10804.5;

  const VPS = {
    ovh1: { name: "3 x OVHcloud VPS-1", cur: "USD", price: 4.54, disk: 40 },
    ovh2: { name: "3 x OVHcloud VPS-2", cur: "USD", price: 8.5, disk: 75 },
    cx23: { name: "3 x Hetzner CX23", cur: "EUR", price: 5.99, disk: 40 },
    cx33: { name: "3 x Hetzner CX33", cur: "EUR", price: 8.99, disk: 80 },
  };

  // The three scenarios of our cost research, each with its assumptions in
  // one line. Extremes are reachable through the inputs, not as presets.
  const PRESETS = {
    api50: {
      note: "An API at 1 million requests a day (30 million a month) over 10,000 actors: 20% write 2 rows, each request reads 20 rows, 2 ms of Worker CPU, 50 ms of billed wall-clock, 5 GB stored.",
      v: { req: 30e6, wshare: 20, rows: 2, rread: 20, msgs: 0, conns: 0, rconn: 0, gb: 5, awake: 0, wall: 50, cpu: 2 },
    },
    api500: {
      note: "The same API, but each request keeps its object busy for 500 ms of billed wall-clock (waiting on an outside call, say).",
      v: { req: 30e6, wshare: 20, rows: 2, rread: 20, msgs: 0, conns: 0, rconn: 0, gb: 5, awake: 0, wall: 500, cpu: 2 },
    },
    chat: {
      note: "Chat: 100,000 rooms, 2 million WebSocket connections and 50 million incoming messages a month; each message writes 1 row and 1 index entry, each connection reads 50 rows of history; rooms hibernate between messages (10 ms billed per message assumed); about 50 GB stored.",
      v: { req: 0, wshare: 0, rows: 2, rread: 0, msgs: 50e6, conns: 2e6, rconn: 50, gb: 50, awake: 0, wall: 10, cpu: 1 },
    },
    saas: {
      note: "A SaaS with 1,000 tenant databases: 20 million requests a month, 25% write 4 rows, each request reads 100 rows, 5 ms of Worker CPU, 200 ms of billed wall-clock, 50 GB stored.",
      v: { req: 20e6, wshare: 25, rows: 4, rread: 100, msgs: 0, conns: 0, rconn: 0, gb: 50, awake: 0, wall: 200, cpu: 5 },
    },
  };

  const form = document.getElementById("calc-form");
  const $ = (id) => document.getElementById(id);
  const fields = ["req", "wshare", "rows", "rread", "msgs", "conns", "rconn", "gb", "awake", "wall", "cpu"];
  // Writes: the requests that write, and every incoming message.
  const writesOf = (w) => w.req * (w.wshare / 100) + w.msgs;

  const over = (used, free, unit) => Math.ceil(Math.max(0, used - free) / unit) * unit;

  // Cloudflare Workers Paid + Durable Objects (USD).
  const cloudflare = (w) => {
    const writes = writesOf(w);
    const workerReqs = w.req + w.conns; // a WebSocket starts with one request
    const gbs = (w.req + w.msgs) * (w.wall / 1000) * GB_PER_OBJECT + w.awake * GB_PER_OBJECT * MONTH_S;
    const lines = [
      ["Workers Paid plan", 5],
      ["Workers requests", (Math.max(0, workerReqs - 10 * M) / M) * 0.3],
      ["Workers CPU time", (Math.max(0, workerReqs * w.cpu - 30 * M) / M) * 0.02],
      // Incoming WebSocket messages are billed 20 to 1 as requests.
      ["Durable Objects requests", (over(workerReqs + w.msgs / 20, M, M) / M) * 0.15],
      ["Duration", (over(gbs, 400000, M) / M) * 12.5],
      ["Rows written", (over(writes * w.rows, 50 * M, M) / M) * 1],
      ["Rows read", (over(w.req * w.rread + w.conns * w.rconn, 25e9, M) / M) * 0.001],
      ["Stored data", over(w.gb, 5, 1) * 0.2],
    ];
    return { lines: lines.map(([l, v]) => [l, v, "USD"]), totals: { USD: sum(lines) } };
  };

  // Three VPS and a bucket (the currency of each).
  const selfHosted = (w, vpsKey, bucket) => {
    const writes = writesOf(w);
    const put = writes * PUT_PER_WRITE + IDLE.put * NODES * MONTH_S;
    const list = IDLE.list * NODES * MONTH_S;
    const get = IDLE.get * NODES * MONTH_S;
    const vps = VPS[vpsKey];
    const lines = [[vps.name, vps.price * NODES, vps.cur]];
    if (bucket === "r2") {
      lines.push(["R2 Class A (PUT, LIST)", (Math.max(0, put + list - M) / M) * 4.5, "USD"]);
      lines.push(["R2 Class B (GET)", (Math.max(0, get - 10 * M) / M) * 0.36, "USD"]);
      lines.push(["R2 storage", Math.max(0, w.gb - 10) * 0.015, "USD"]);
    } else if (bucket === "ovhos") {
      lines.push(["OVHcloud Object Storage", w.gb * 0.0081103, "USD"]);
      lines.push(["Its API requests", 0, "USD"]);
    } else {
      const tb = w.gb / 1000;
      lines.push(["Hetzner Object Storage", 6.49 + Math.max(0, tb - 1) * 0.0087 * 720, "EUR"]);
      lines.push(["Its API requests", 0, "EUR"]);
    }
    const totals = {};
    for (const [, v, c] of lines) totals[c] = (totals[c] || 0) + v;
    return { lines, totals, requests: { put, list, get }, writes };
  };

  function sum(lines) {
    return lines.reduce((s, l) => s + l[1], 0);
  }

  const money = (v, cur, cents) => {
    const sym = cur === "EUR" ? "€" : "US$";
    const digits = cents || (v !== 0 && Math.abs(v) < 10) ? 2 : 0;
    return `${sym}${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  };
  const totalText = (totals) =>
    Object.entries(totals)
      .sort()
      .reverse()
      .map(([c, v]) => money(v, c))
      .join(" + ");
  const big = (n) => {
    if (n >= 1e9) return `${+(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} billion`;
    if (n >= 1e6) return `${+(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} million`;
    return n.toLocaleString("en-US");
  };
  const times = (f) => `${f >= 10 ? Math.round(f) : f >= 1 ? +f.toFixed(1) : +f.toPrecision(2)}×`;

  const read = () => {
    const w = {};
    for (const f of fields) w[f] = Math.max(0, Number(form.elements[f].value) || 0);
    w.wshare = Math.min(100, w.wshare);
    return w;
  };

  const fill = (tbody, lines) => {
    tbody.replaceChildren();
    for (const [label, v, cur] of lines) {
      const tr = document.createElement("tr");
      const a = document.createElement("td");
      a.textContent = label;
      const b = document.createElement("td");
      b.textContent = money(v, cur, true);
      tr.append(a, b);
      tbody.append(tr);
    }
  };

  // Requests per month along the x axis, on a log scale.
  // The x axis scales your traffic (requests, messages, connections and
  // the writes they make) from a hundredth to a hundred times; stored data
  // and always-awake actors stay as you set them.
  const X0 = 0.01;
  const X1 = 100;
  const STEPS = 80;
  const sweepXs = [...Array(STEPS + 1)].map((_, i) => X0 * Math.pow(X1 / X0, i / STEPS));

  const svgNS = "http://www.w3.org/2000/svg";
  const el = (name, attrs, parent) => {
    const e = document.createElementNS(svgNS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (parent) parent.append(e);
    return e;
  };

  // One panel per currency: a line per series that bills in it.
  const panel = (title, cur, series, w, cross) => {
    const box = document.createElement("div");
    box.className = "chart-panel";
    const h = document.createElement("h3");
    h.textContent = title;
    box.append(h);
    const legend = document.createElement("ul");
    legend.className = "legend";
    for (const s of series) {
      const li = document.createElement("li");
      const k = document.createElement("span");
      k.className = `key${s.cf ? " cf" : ""}`;
      li.append(k, document.createTextNode(s.label));
      legend.append(li);
      if (s.beyond !== undefined && s.beyond < X1) {
        const li2 = document.createElement("li");
        const k2 = document.createElement("span");
        k2.className = "key beyond";
        li2.append(k2, document.createTextNode(`beyond the ${SOAK_WRITES_PER_S.toFixed(0)} writes a second our soaks carried: not measured`));
        legend.append(li2);
      }
    }
    box.append(legend);

    // Drawn at the panel's own width, so its text stays legible on a phone.
    const W = Math.max(300, Math.min(760, ($("charts").clientWidth || 640) - 34));
    const H = W < 480 ? 220 : 260;
    const L = 64;
    const R = 16;
    const T = 12;
    const B = 46;
    // Both axes are logarithmic: bills span four orders of magnitude.
    const ys = series.flatMap((s) => s.ys).filter((y) => y > 0);
    const lo = Math.floor(Math.log10(Math.max(1, Math.min(...ys))));
    const hi = Math.max(lo + 1, Math.ceil(Math.log10(Math.max(10, ...ys))));
    const yMax = Math.pow(10, hi);
    const sx = (x) => L + ((Math.log10(x) - Math.log10(X0)) / (Math.log10(X1) - Math.log10(X0))) * (W - L - R);
    const sy = (y) => T + (1 - (Math.log10(Math.max(y, Math.pow(10, lo))) - lo) / (hi - lo)) * (H - T - B);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${title}: monthly bill against your traffic, from a hundredth to a hundred times, both on logarithmic scales` });
    for (let e = lo; e <= hi; e++) {
      const y = Math.pow(10, e);
      el("line", { class: "ch-grid", x1: L, x2: W - R, y1: sy(y), y2: sy(y) }, svg);
      const t = el("text", { class: "ch-axis", x: L - 8, y: sy(y) + 4, "text-anchor": "end" }, svg);
      const n = y >= 1e6 ? `${y / 1e6}M` : y >= 1e3 ? `${y / 1e3}k` : String(y);
      t.textContent = `${cur === "EUR" ? "€" : "US$"}${n}`;
    }
    for (const x of W < 480 ? [0.01, 1, 100] : [0.01, 0.1, 1, 10, 100]) {
      const t = el("text", { class: "ch-axis", x: sx(x), y: H - 28, "text-anchor": "middle" }, svg);
      t.textContent = times(x);
    }
    const xl = el("text", { class: "ch-axis", x: (L + W - R) / 2, y: H - 6, "text-anchor": "middle" }, svg);
    xl.textContent = "your traffic, times (log scale)";
    const pathOf = (ys, from, to) =>
      ys
        .slice(from, to + 1)
        .map((y, j) => `${j ? "L" : "M"}${sx(sweepXs[from + j]).toFixed(1)} ${sy(Math.min(y, yMax)).toFixed(1)}`)
        .join("");
    for (const s of series) {
      // A self-hosted line turns grey and dotted past the soaked write rate.
      let cut = STEPS;
      if (s.beyond !== undefined) {
        const k = sweepXs.findIndex((x) => x > s.beyond);
        if (k >= 0) cut = Math.max(0, k);
      }
      el("path", { class: `ch-line ${s.cf ? "ch-cf" : "ch-self"}`, d: pathOf(s.ys, 0, cut) }, svg);
      if (cut < STEPS) el("path", { class: "ch-line ch-beyond", d: pathOf(s.ys, cut, STEPS) }, svg);
    }
    {
      el("line", { class: "ch-now", x1: sx(1), x2: sx(1), y1: T, y2: H - B }, svg);
      const t = el("text", { class: "ch-label", x: sx(1) + 4, y: T + 10 }, svg);
      t.textContent = "you";
    }
    if (cross) {
      el("circle", { class: "ch-cross", cx: sx(cross.x), cy: sy(cross.y), r: 5 }, svg);
      const right = sx(cross.x) > W * 0.7;
      const t = el("text", { class: "ch-label", x: sx(cross.x) + (right ? -9 : 9), y: sy(cross.y) - 9, "text-anchor": right ? "end" : "start" }, svg);
      t.textContent = `cross at ${times(cross.x)}`;
    }
    // Hover and focus: a crosshair that snaps to the nearest step.
    const hair = el("line", { class: "ch-hair", y1: T, y2: H - B, visibility: "hidden" }, svg);
    const dots = series.map((s) => el("circle", { class: s.cf ? "ch-dot-cf" : "ch-dot-self", r: 4, visibility: "hidden" }, svg));
    const hit = el("rect", { x: L, y: T, width: W - L - R, height: H - T - B, fill: "transparent" }, svg);
    // The keyboard target is the figure around the picture, not a shape in it.
    const fig = document.createElement("div");
    fig.className = "chart-focus";
    fig.tabIndex = 0;
    fig.setAttribute("role", "group");
    fig.setAttribute("aria-label", `${title}: use the left and right arrow keys to read the bills at each number of requests`);
    fig.append(svg);
    const tip = document.createElement("div");
    tip.className = "tip";
    tip.hidden = true;
    tip.setAttribute("aria-live", "polite");
    box.append(fig, tip);
    let at = STEPS / 2;
    const showAt = (i) => {
      at = Math.max(0, Math.min(STEPS, i));
      const x = sx(sweepXs[at]);
      hair.setAttribute("x1", x);
      hair.setAttribute("x2", x);
      hair.setAttribute("visibility", "visible");
      tip.replaceChildren();
      const head = document.createElement("div");
      head.textContent = `${times(sweepXs[at])} your traffic`;
      tip.append(head);
      series.forEach((s, j) => {
        dots[j].setAttribute("cx", x);
        dots[j].setAttribute("cy", sy(Math.min(s.ys[at], yMax)));
        dots[j].setAttribute("visibility", "visible");
        const row = document.createElement("div");
        const v = document.createElement("strong");
        v.textContent = money(s.ys[at], cur);
        row.append(v, document.createTextNode(` ${s.label}`));
        tip.append(row);
      });
      tip.hidden = false;
      const rect = svg.getBoundingClientRect();
      const px = (x / W) * rect.width + (rect.left - box.getBoundingClientRect().left);
      const room = box.clientWidth - tip.offsetWidth - 4;
      tip.style.left = `${Math.max(4, px + 12 > room ? px - tip.offsetWidth - 12 : px + 12)}px`;
      tip.style.top = `${rect.top - box.getBoundingClientRect().top + 8}px`;
    };
    const hide = () => {
      tip.hidden = true;
      hair.setAttribute("visibility", "hidden");
      dots.forEach((d) => d.setAttribute("visibility", "hidden"));
    };
    hit.addEventListener("pointermove", (e) => {
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * W;
      const f = (x - L) / (W - L - R);
      showAt(Math.round(f * STEPS));
    });
    hit.addEventListener("pointerleave", hide);
    fig.addEventListener("focus", () => showAt(at));
    fig.addEventListener("blur", hide);
    fig.addEventListener("keydown", (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: 5, ArrowDown: -5 }[e.key];
      if (d === undefined) return;
      e.preventDefault();
      showAt(at + d);
    });
    return box;
  };

  const render = () => {
    const w = read();
    const vps = form.elements.vps.value;
    const bucket = form.elements.bucket.value;
    const cf = cloudflare(w);
    const self = selfHosted(w, vps, bucket);
    fill($("cf-lines"), cf.lines);
    fill($("self-lines"), self.lines);
    $("cf-total").textContent = `${totalText(cf.totals)} / month`;
    $("self-total").textContent = `${totalText(self.totals)} / month`;

    const curs = Object.keys(self.totals).filter((c) => self.totals[c] > 0 || c === "USD");
    const allUsd = Object.keys(self.totals).every((c) => c === "USD");
    const at = (f) => ({ ...w, req: w.req * f, msgs: w.msgs * f, conns: w.conns * f });
    const cfYs = sweepXs.map((x) => cloudflare(at(x)).totals.USD);
    const selfUsd = sweepXs.map((x) => selfHosted(at(x), vps, bucket).totals.USD || 0);
    const selfEur = sweepXs.map((x) => selfHosted(at(x), vps, bucket).totals.EUR || 0);

    let cross = null;
    if (allUsd) {
      for (let i = 1; i < sweepXs.length; i++) {
        const a = cfYs[i - 1] - selfUsd[i - 1];
        const b = cfYs[i] - selfUsd[i];
        if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) {
          const f = a / (a - b);
          const lx = Math.log10(sweepXs[i - 1]) + f * (Math.log10(sweepXs[i]) - Math.log10(sweepXs[i - 1]));
          cross = { x: Math.pow(10, lx), y: cfYs[i - 1] + f * (cfYs[i] - cfYs[i - 1]), cfAbove: b > a };
          break;
        }
      }
    }

    const verdict = $("verdict");
    if (allUsd) {
      const d = cf.totals.USD - self.totals.USD;
      const now =
        Math.abs(d) < 1
          ? "about the same"
          : d > 0
            ? `${money(d, "USD")} more a month on Cloudflare`
            : `${money(-d, "USD")} more a month self-hosted`;
      verdict.textContent = `At your numbers: ${now}, before your time and the rest of what the bill leaves out. ${
        cross
          ? `Scaling your traffic with storage fixed, ${cross.cfAbove ? "Cloudflare" : "self-hosting"} costs more above about ${times(cross.x)} your traffic.`
          : `Scaling your traffic from a hundredth to a hundred times, with storage fixed, ${cfYs[0] > selfUsd[0] ? "self-hosting" : "Cloudflare"} stays cheaper throughout.`
      }`;
    } else {
      verdict.textContent = `Cloudflare: ${totalText(cf.totals)}. Self-hosted: ${totalText(self.totals)}. Part of that is in euros, and we do not convert currencies, so no crossing is drawn: compare the two at your own exchange rate.`;
    }
    if (w.awake > 0) {
      const dur = cf.lines.find((l) => l[0] === "Duration")[1];
      verdict.textContent += ` The ${w.awake.toLocaleString("en-US")} actors that never hibernate are ${money(dur, "USD", true)} of Cloudflare's duration bill: actors that use its WebSocket Hibernation API are not billed while idle, so check whether yours can.`;
    }

    const perS = self.writes / MONTH_S;
    const soaked = SOAK_WRITES_PER_S.toFixed(0);
    const disk = VPS[vps].disk;
    const notes = [
      perS > SOAK_WRITES_PER_S
        ? `Your writes come to about ${perS.toFixed(0)} a second, above the ${soaked} a second the busiest of our soaks carried on three VPS: whether three small VPS keep up is not measured.`
        : `Three small VPS carrying this is assumed, not measured; your writes come to about ${perS.toFixed(1)} a second (the busiest of our soaks carried ${soaked}).`,
    ];
    if (w.gb > disk) {
      notes.push(
        `Disk: each actor's database lives on the disk of the node that runs it, and these VPS have ${disk} GB each. ${
          w.gb > 3 * disk * 0.8 ? `${w.gb} GB does not fit on three of them` : `${w.gb} GB fits only if it spreads evenly, with room left when a node dies`
        }; bigger disks or servers are not in this bill.`,
      );
    }
    notes.push(`Bucket requests: ${big(Math.round(self.requests.put))} PUT, ${big(Math.round(self.requests.list))} LIST, ${big(Math.round(self.requests.get))} GET a month.`);
    $("capacity").textContent = notes.join(" ");
    if (perS > SOAK_WRITES_PER_S || w.gb > disk) {
      verdict.textContent += " The servers in this bill may not carry it: read the capacity and disk notes below the bills.";
    }

    // The traffic factor at which writes pass the soaked rate.
    const rStar = self.writes > 0 ? (SOAK_WRITES_PER_S * MONTH_S) / self.writes : Infinity;
    const charts = $("charts");
    charts.replaceChildren();
    const usdSeries = [{ label: "Cloudflare", cf: true, ys: cfYs }];
    if (curs.includes("USD") && selfUsd.some((y) => y > 0)) {
      usdSeries.push({ label: allUsd ? "WasmKeep, self-hosted" : "WasmKeep, its US$ part", ys: selfUsd, beyond: rStar });
    }
    charts.append(panel("Monthly bill in US$", "USD", usdSeries, w, cross));
    if (!allUsd) {
      charts.append(panel("Monthly bill in euros", "EUR", [{ label: selfUsd.some((y) => y > 0) ? "WasmKeep, its euro part" : "WasmKeep, self-hosted", ys: selfEur, beyond: rStar }], w, null));
    }

    const table = $("sweep-table");
    table.replaceChildren();
    const head = table.createTHead().insertRow();
    for (const t of ["Your traffic", "Cloudflare (US$)", "Self-hosted (US$)", "Self-hosted (EUR)"]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = t;
      head.append(th);
    }
    const body = table.createTBody();
    for (let i = 0; i <= STEPS; i += 10) {
      const r = body.insertRow();
      for (const v of [times(sweepXs[i]), money(cfYs[i], "USD"), money(selfUsd[i], "USD"), money(selfEur[i], "EUR")]) {
        r.insertCell().textContent = v;
      }
    }
  };

  const apply = (name) => {
    const p = PRESETS[name];
    for (const f of fields) form.elements[f].value = p.v[f];
    $("preset-note").textContent = p.note;
    for (const b of root.querySelectorAll("[data-preset]")) b.setAttribute("aria-pressed", String(b.dataset.preset === name));
    render();
  };

  for (const b of root.querySelectorAll("[data-preset]")) b.addEventListener("click", () => apply(b.dataset.preset));
  form.addEventListener("input", () => {
    for (const b of root.querySelectorAll("[data-preset]")) b.setAttribute("aria-pressed", "false");
    render();
  });
  form.addEventListener("submit", (e) => e.preventDefault());
  let resizeTimer = 0;
  let lastWidth = $("charts").clientWidth;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if ($("charts").clientWidth !== lastWidth) {
        lastWidth = $("charts").clientWidth;
        render();
      }
    }, 150);
  });
  apply("api50");
})();
