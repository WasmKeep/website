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
  const SOAK_WRITES_PER_S = 2306192 / 43212; // b849bfe, 12 h

  const VPS = {
    ovh1: { name: "3 x OVHcloud VPS-1", cur: "USD", price: 4.54 },
    ovh2: { name: "3 x OVHcloud VPS-2", cur: "USD", price: 8.5 },
    cx23: { name: "3 x Hetzner CX23", cur: "EUR", price: 5.99 },
    cx33: { name: "3 x Hetzner CX33", cur: "EUR", price: 8.99 },
  };

  const PRESETS = {
    small: { req: 30e6, wshare: 10, rows: 1, rread: 2, gb: 5, awake: 0, wall: 20, cpu: 2 },
    rooms: { req: 150e6, wshare: 60, rows: 2, rread: 4, gb: 40, awake: 0, wall: 10, cpu: 1 },
    heavy: { req: 500e6, wshare: 50, rows: 4, rread: 10, gb: 500, awake: 0, wall: 20, cpu: 2 },
    awake: { req: 20e6, wshare: 20, rows: 2, rread: 2, gb: 20, awake: 2000, wall: 20, cpu: 2 },
  };

  const form = document.getElementById("calc-form");
  const $ = (id) => document.getElementById(id);
  const fields = ["req", "wshare", "rows", "rread", "gb", "awake", "wall", "cpu"];

  const over = (used, free, unit) => Math.ceil(Math.max(0, used - free) / unit) * unit;

  // Cloudflare Workers Paid + Durable Objects (USD).
  const cloudflare = (w) => {
    const writes = w.req * (w.wshare / 100);
    const gbs = w.req * (w.wall / 1000) * GB_PER_OBJECT + w.awake * GB_PER_OBJECT * MONTH_S;
    const lines = [
      ["Workers Paid plan", 5],
      ["Workers requests", (Math.max(0, w.req - 10 * M) / M) * 0.3],
      ["Workers CPU time", (Math.max(0, w.req * w.cpu - 30 * M) / M) * 0.02],
      ["Durable Objects requests", (over(w.req, M, M) / M) * 0.15],
      ["Duration", (over(gbs, 400000, M) / M) * 12.5],
      ["Rows written", (over(writes * w.rows, 50 * M, M) / M) * 1],
      ["Rows read", (over(w.req * w.rread, 25e9, M) / M) * 0.001],
      ["Stored data", over(w.gb, 5, 1) * 0.2],
    ];
    return { lines: lines.map(([l, v]) => [l, v, "USD"]), totals: { USD: sum(lines) } };
  };

  // Three VPS and a bucket (the currency of each).
  const selfHosted = (w, vpsKey, bucket) => {
    const writes = w.req * (w.wshare / 100);
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

  const money = (v, cur) => {
    const sym = cur === "EUR" ? "€" : "US$";
    const digits = v !== 0 && Math.abs(v) < 10 ? 2 : 0;
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
  const tick = (n) => (n >= 1e9 ? `${n / 1e9}B` : n >= 1e6 ? `${n / 1e6}M` : `${n / 1e3}k`);

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
      b.textContent = money(v, cur);
      tr.append(a, b);
      tbody.append(tr);
    }
  };

  // Requests per month along the x axis, on a log scale.
  const X0 = 1e6;
  const X1 = 1e10;
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
    }
    box.append(legend);

    // Drawn at the panel's own width, so its text stays legible on a phone.
    const W = Math.max(300, Math.min(760, ($("charts").clientWidth || 640) - 34));
    const H = W < 480 ? 220 : 260;
    const L = 64;
    const R = 16;
    const T = 12;
    const B = 34;
    // Both axes are logarithmic: bills span four orders of magnitude.
    const ys = series.flatMap((s) => s.ys).filter((y) => y > 0);
    const lo = Math.floor(Math.log10(Math.max(1, Math.min(...ys))));
    const hi = Math.max(lo + 1, Math.ceil(Math.log10(Math.max(10, ...ys))));
    const yMax = Math.pow(10, hi);
    const sx = (x) => L + ((Math.log10(x) - Math.log10(X0)) / (Math.log10(X1) - Math.log10(X0))) * (W - L - R);
    const sy = (y) => T + (1 - (Math.log10(Math.max(y, Math.pow(10, lo))) - lo) / (hi - lo)) * (H - T - B);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${title}: monthly bill against requests per month, both on logarithmic scales, from 1 million to 10 billion requests` });
    for (let e = lo; e <= hi; e++) {
      const y = Math.pow(10, e);
      el("line", { class: "ch-grid", x1: L, x2: W - R, y1: sy(y), y2: sy(y) }, svg);
      const t = el("text", { class: "ch-axis", x: L - 8, y: sy(y) + 4, "text-anchor": "end" }, svg);
      t.textContent = `${cur === "EUR" ? "€" : "US$"}${y.toLocaleString("en-US")}`;
    }
    for (const x of W < 480 ? [1e6, 1e8, 1e10] : [1e6, 1e7, 1e8, 1e9, 1e10]) {
      const t = el("text", { class: "ch-axis", x: sx(x), y: H - 12, "text-anchor": "middle" }, svg);
      t.textContent = tick(x);
    }
    const xl = el("text", { class: "ch-axis", x: L, y: H - 2, "text-anchor": "start" }, svg);
    xl.textContent = "requests per month (log scale)";
    for (const s of series) {
      const d = s.ys.map((y, i) => `${i ? "L" : "M"}${sx(sweepXs[i]).toFixed(1)} ${sy(Math.min(y, yMax)).toFixed(1)}`).join("");
      el("path", { class: `ch-line ${s.cf ? "ch-cf" : "ch-self"}`, d }, svg);
    }
    if (w.req >= X0 && w.req <= X1) {
      el("line", { class: "ch-now", x1: sx(w.req), x2: sx(w.req), y1: T, y2: H - B }, svg);
      const t = el("text", { class: "ch-label", x: sx(w.req) + 4, y: T + 10 }, svg);
      t.textContent = "you";
    }
    if (cross) {
      el("circle", { class: "ch-cross", cx: sx(cross.x), cy: sy(cross.y), r: 5 }, svg);
      const right = sx(cross.x) > W * 0.7;
      const t = el("text", { class: "ch-label", x: sx(cross.x) + (right ? -9 : 9), y: sy(cross.y) - 9, "text-anchor": right ? "end" : "start" }, svg);
      t.textContent = `cross at ${big(cross.x)}`;
    }
    // Hover and focus: a crosshair that snaps to the nearest step.
    const hair = el("line", { class: "ch-hair", y1: T, y2: H - B, visibility: "hidden" }, svg);
    const dots = series.map((s) => el("circle", { class: s.cf ? "ch-dot-cf" : "ch-dot-self", r: 4, visibility: "hidden" }, svg));
    const hit = el("rect", { x: L, y: T, width: W - L - R, height: H - T - B, fill: "transparent", tabindex: 0, "aria-label": "Move along the chart with the arrow keys" }, svg);
    const tip = document.createElement("div");
    tip.className = "tip";
    tip.hidden = true;
    box.append(svg, tip);
    let at = Math.round((STEPS * Math.log10(w.req / X0)) / 4) || 0;
    const showAt = (i) => {
      at = Math.max(0, Math.min(STEPS, i));
      const x = sx(sweepXs[at]);
      hair.setAttribute("x1", x);
      hair.setAttribute("x2", x);
      hair.setAttribute("visibility", "visible");
      tip.replaceChildren();
      const head = document.createElement("div");
      head.textContent = `${big(sweepXs[at])} requests`;
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
      const px = (x / W) * rect.width;
      tip.style.left = `${Math.min(px + 12, rect.width - tip.offsetWidth)}px`;
      tip.style.top = `${svg.offsetTop + 8}px`;
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
    hit.addEventListener("focus", () => showAt(at));
    hit.addEventListener("blur", hide);
    hit.addEventListener("keydown", (e) => {
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
    const at = (x) => ({ ...w, req: x });
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
          ? `With everything else fixed, ${cross.cfAbove ? "Cloudflare" : "self-hosting"} costs more above about ${big(cross.x)} requests a month.`
          : `With everything else fixed, ${cfYs[0] > selfUsd[0] ? "self-hosting" : "Cloudflare"} stays cheaper from 1 million to 10 billion requests a month.`
      }`;
    } else {
      verdict.textContent = `Cloudflare: ${totalText(cf.totals)}. Self-hosted: ${totalText(self.totals)}. Part of that is in euros, and we do not convert currencies, so no crossing is drawn: compare the two at your own exchange rate.`;
    }

    const perS = self.writes / MONTH_S;
    $("capacity").textContent =
      perS > SOAK_WRITES_PER_S
        ? `Your writes come to about ${perS.toFixed(0)} a second, above the ${SOAK_WRITES_PER_S.toFixed(0)} a second our 12-hour soak carried on three VPS. Whether three small VPS keep up is not measured.`
        : `Three small VPS carrying this is assumed, not measured; your writes come to about ${perS.toFixed(1)} a second (our 12-hour soak carried ${SOAK_WRITES_PER_S.toFixed(0)}). Bucket requests: ${big(Math.round(self.requests.put))} PUT, ${big(Math.round(self.requests.list))} LIST, ${big(Math.round(self.requests.get))} GET a month.`;

    const charts = $("charts");
    charts.replaceChildren();
    const usdSeries = [{ label: "Cloudflare", cf: true, ys: cfYs }];
    if (curs.includes("USD") && selfUsd.some((y) => y > 0)) {
      usdSeries.push({ label: allUsd ? "WasmKeep, self-hosted" : "WasmKeep, its US$ part", ys: selfUsd });
    }
    charts.append(panel("Monthly bill in US$", "USD", usdSeries, w, cross));
    if (!allUsd) {
      charts.append(panel("Monthly bill in euros", "EUR", [{ label: "WasmKeep, its euro part", ys: selfEur }], w, null));
    }

    const table = $("sweep-table");
    table.replaceChildren();
    const head = table.createTHead().insertRow();
    for (const t of ["Requests / month", "Cloudflare (US$)", "Self-hosted (US$)", "Self-hosted (EUR)"]) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = t;
      head.append(th);
    }
    const body = table.createTBody();
    for (let i = 0; i <= STEPS; i += 10) {
      const r = body.insertRow();
      for (const v of [big(sweepXs[i]), money(cfYs[i], "USD"), money(selfUsd[i], "USD"), money(selfEur[i], "EUR")]) {
        r.insertCell().textContent = v;
      }
    }
  };

  const apply = (name) => {
    const p = PRESETS[name];
    for (const f of fields) form.elements[f].value = p[f];
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
  apply("small");
})();
