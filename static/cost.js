// The break-even calculator on /cost/. Prices: the vendors' own pages,
// prices checked on vendor pages 2026-11-15. Currencies are never converted:
// a bill is a sum per currency, and a chart draws one currency per axis.
// Chart colours: the validated pair --series-self / --series-cf (dataviz
// validator, light and dark), with a dashed line for Cloudflare so the
// two are told apart without colour too.
(() => {
  "use strict";
  const root = document.getElementById("calc");
  if (!root) return;
  root.hidden = false;

  const { MONTH_S, SOAK_WRITES_PER_S, VPS, PRESETS, writesOf, cloudflare, selfHosted, scaled } = window.CostModel;
  const form = document.getElementById("calc-form");
  const $ = (id) => document.getElementById(id);
  const fields = Object.keys(PRESETS.largeApi.v);
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
  // the writes they make) from a thousandth to a hundred times; stored data
  // and actors scale together; per-event costs stay fixed.
  const X0 = 0.001;
  const X1 = 100;
  const STEPS = 100;
  const sweepXs = [...Array(STEPS + 1)].map((_, i) => X0 * Math.pow(X1 / X0, i / STEPS));

  const svgNS = "http://www.w3.org/2000/svg";
  const el = (name, attrs, parent) => {
    const e = document.createElementNS(svgNS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (parent) parent.append(e);
    return e;
  };

  // One panel per currency: a line per series that bills in it.
  const panel = (title, cur, series, factor, crosses) => {
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
    const W = Math.max(240, Math.min(760, ($("charts").clientWidth || 640) - 34));
    const H = W < 480 ? 220 : 260;
    const L = 64;
    const R = 16;
    const T = 12;
    const B = 46;
    // Both axes are logarithmic: bills span four orders of magnitude.
    const ys = series.flatMap((s) => s.ys).filter((y) => y > 0);
    const lo = Math.floor(Math.log10(Math.max(1, Math.min(...(ys.length ? ys : [1])))));
    const hi = Math.max(lo + 1, Math.ceil(Math.log10(Math.max(10, ...ys))));
    const yMax = Math.pow(10, hi);
    const sx = (x) => L + ((Math.log10(x) - Math.log10(X0)) / (Math.log10(X1) - Math.log10(X0))) * (W - L - R);
    const sy = (y) => T + (1 - (Math.log10(Math.max(y, Math.pow(10, lo))) - lo) / (hi - lo)) * (H - T - B);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${title}: monthly bill against your traffic, from a thousandth to a hundred times, both on logarithmic scales` });
    for (let e = lo; e <= hi; e++) {
      const y = Math.pow(10, e);
      el("line", { class: "ch-grid", x1: L, x2: W - R, y1: sy(y), y2: sy(y) }, svg);
      const t = el("text", { class: "ch-axis", x: L - 8, y: sy(y) + 4, "text-anchor": "end" }, svg);
      const n = y >= 1e6 ? `${y / 1e6}M` : y >= 1e3 ? `${y / 1e3}k` : String(y);
      t.textContent = `${cur === "EUR" ? "€" : "US$"}${n}`;
    }
    for (const x of W < 480 ? [0.001, 1, 100] : [0.001, 0.01, 0.1, 1, 10, 100]) {
      const t = el("text", { class: "ch-axis", x: sx(x), y: H - 28, "text-anchor": "middle" }, svg);
      t.textContent = times(x);
    }
    const xl = el("text", { class: "ch-axis", x: (L + W - R) / 2, y: H - 6, "text-anchor": "middle" }, svg);
    xl.textContent = "app size, times (log scale; zero at floor)";
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
        if (k >= 0) cut = Math.max(0, k - 1);
      }
      el("path", { class: `ch-line ${s.cf ? "ch-cf" : "ch-self"}`, d: pathOf(s.ys, 0, cut) }, svg);
      if (cut < STEPS) el("path", { class: "ch-line ch-beyond", d: pathOf(s.ys, cut, STEPS) }, svg);
    }
    {
      el("line", { class: "ch-now", x1: sx(factor), x2: sx(factor), y1: T, y2: H - B }, svg);
      const t = el("text", { class: "ch-label", x: sx(factor) + 4, y: T + 10 }, svg);
      t.textContent = "selected";
    }
    for (const cross of crosses) {
      el("circle", { class: "ch-cross", cx: sx(cross.x), cy: sy(cross.y), r: 5 }, svg);
      const right = sx(cross.x) > W * 0.7;
      const t = el("text", { class: "ch-label", x: sx(cross.x) + (right ? -9 : 9), y: sy(cross.y) - 9, "text-anchor": right ? "end" : "start" }, svg);
      t.textContent = `~${times(cross.x)}`;
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
    fig.setAttribute("aria-label", `${title}: use the left and right arrow keys to read the bills at application size`);
    fig.append(svg);
    const tip = document.createElement("div");
    tip.className = "tip";
    tip.hidden = true;
    tip.setAttribute("aria-live", "polite");
    box.append(fig, tip);
    let at = Math.round((Math.log10(factor) + 3) / 5 * STEPS);
    const showAt = (i) => {
      at = Math.max(0, Math.min(STEPS, i));
      const x = sx(sweepXs[at]);
      hair.setAttribute("x1", x);
      hair.setAttribute("x2", x);
      hair.setAttribute("visibility", "visible");
      tip.replaceChildren();
      const head = document.createElement("div");
      head.textContent = `${times(sweepXs[at])} app size`;
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
      // Keep details in document flow: readable on narrow screens and CSP-safe.
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

  const comparison = (cf, self) => {
    if (cf === 0) return "Cloudflare wins: US$0 within modeled Free quotas; no finite price ratio";
    if (Math.abs(cf - self) < 1) return "About the same infrastructure bill";
    return cf > self
      ? `WasmKeep is about ${times(cf / self)} cheaper in this estimate (${money(cf - self, "USD")} less/month)`
      : `Cloudflare is about ${times(self / cf)} cheaper in this estimate (${money(self - cf, "USD")} less/month)`;
  };
  const render = () => {
    const base = read();
    const factor = 10 ** (Number($("in-scale").value) / 10);
    const w = scaled(base, factor);
    const vps = form.elements.vps.value, bucket = form.elements.bucket.value;
    const batched = $("in-batched").checked;
    const cf = cloudflare(w), self = selfHosted(w, vps, bucket, batched);
    const today = selfHosted(w, vps, bucket), projection = selfHosted(w, vps, bucket, true);
    $("scale-value").textContent = `${times(factor)} app size`;
    $("scale-workload").textContent = `${big(Math.round(w.req / 30))} HTTP requests/day; ${big(Math.round(w.msgs / 30))} messages/day; ${Math.round(self.writes / MONTH_S).toLocaleString("en-US")} writes/s; ${big(w.actors)} actors; ${big(w.sockets)} concurrent sockets; ${big(Math.round(w.gb))} GB.`;
    fill($("cf-lines"), cf.lines); fill($("self-lines"), self.lines);
    $("cf-total").textContent = `${totalText(cf.totals)} / month`;
    $("self-total").textContent = `${totalText(self.totals)} / month`;
    $("self-heading").textContent = batched ? "WasmKeep — planned 0.5.0 projection" : "WasmKeep 0.4.2 — estimated fleet";
    const allUsd = Object.keys(self.totals).every(c => c === "USD");
    const cfYs = sweepXs.map(x => cloudflare(scaled(base, x)).totals.USD);
    const fleet = sweepXs.map(x => selfHosted(scaled(base, x), vps, bucket, batched));
    const selfUsd = fleet.map(s => s.totals.USD || 0), selfEur = fleet.map(s => s.totals.EUR || 0);
    // Keep every sign change: stepwise node purchases and request rounding can
    // produce multiple crossings. Refine each bracket, not a false straight line.
    const crosses = [];
    if (allUsd) for (let i = 1; i < sweepXs.length; i++) {
      const sign = cfYs[i - 1] > selfUsd[i - 1];
      if (sign === (cfYs[i] > selfUsd[i])) continue;
      let lo = sweepXs[i - 1], hi = sweepXs[i];
      for (let j = 0; j < 24; j++) {
        const mid = Math.sqrt(lo * hi), mw = scaled(base, mid);
        if ((cloudflare(mw).totals.USD > selfHosted(mw, vps, bucket, batched).totals.USD) === sign) lo = mid;
        else hi = mid;
      }
      crosses.push({ x: hi, y: cloudflare(scaled(base, hi)).totals.USD });
    }
    $("verdict").textContent = allUsd
      ? `${batched ? "Planned 0.5.0 projection. " : "0.4.2 estimate. "}${comparison(cf.totals.USD, self.totals.USD)} at this size. Infrastructure only; capacity is unproven. Prices checked 2026-11-15; purchase conditions below apply.`
      : `Cloudflare: ${totalText(cf.totals)}; WasmKeep: ${totalText(self.totals)}. Different currencies: no cheaper claim or crossover without an exchange rate. Prices checked 2026-11-15; purchase conditions below apply.`;
    $("crossings").textContent = !allUsd ? "Currency panels show separate bill components, not comparable totals." : crosses.length
      ? `Approximate changes of winner: ${crosses.map(c => `${times(c.x)} app size (${big(Math.round((base.req + base.msgs) * c.x / 30))} events/day)`).join("; ")}. Node and billing steps mean these are boundaries, not exact equal bills; the sweep may miss narrower intervals.`
      : "No change of winner found in the sampled 0.001×–100× range. This is not a claim outside that range.";
    const type = VPS[vps];
    $("capacity").textContent = `${self.nodes.toLocaleString("en-US")} x ${type.name}: estimate from the three-node soak average (${type.rate.toFixed(1)} durable writes/s/node), ${type.resident.toLocaleString("en-US")} resident slots/node and 50,000 sockets/node. At least 3 nodes, with one node's spare capacity and 20% disk reserve. These are sizing assumptions, not measured capacity or automatic placement. ${vps !== "ovh2" ? "This VPS type was not soaked; its rate is an assumed equivalent (half for 2-vCPU plans). " : ""}Read traffic, application CPU, peaks and room fan-out still need load testing. Millions of actors and large fleets are unmeasured.`;
    $("disk-note").textContent = `Disk: ${type.disk} GB/node; ${Math.round(w.gb).toLocaleString("en-US")} GB modeled across the fleet. Assumes even placement and enough space after one node fails. Each actor's entire SQLite database must fit on one node; WAL, snapshots, cache duplication, backups and skew need extra space. Cloudflare SQLite also limits an individual paid object to 10 GB (1 GB on Free). ${w.hot * 0.057 > 1 ? "Hot-actor warning: the entered burst rate exceeds one write per assumed 57 ms bucket trip today; adding nodes does not speed up a single actor." : ""}`;
    $("bucket-counts").textContent = `Monthly bucket requests at this size: 0.4.2 ${big(Math.round(today.requests.put))} PUT; planned batching projection ${big(Math.round(projection.requests.put))} PUT. Both: ${big(Math.round(self.requests.list))} LIST and ${big(Math.round(self.requests.get))} GET. Estimated bucket upload reduction: ${times(projection.batchFactor)} for traffic writes only. Idle floor derives from 0.4.2 cadences, not a new measurement; heartbeat GETs grow with the square of node count. Restores, socket ownership checks, alarms and churn add requests.`;
    $("batch-note").textContent = `Today: ${totalText(today.totals)}/month. Planned 0.5.0 projection: ${totalText(projection.totals)}/month. Assumes all writing events are eligible plain writes at ${w.hot} events/s per busy actor during bursts, one upload per 57 ms round trip (12-hour soak p50, not a fixed latency), plus the same 3% PUT overhead. No node reduction is assumed. Durable operations still wait; a plain response is not a durable acknowledgement. Low-rate actors do not benefit.`;
    // Retain the original empirical envelope, even as the estimate buys nodes.
    const rStar = writesOf(base) ? SOAK_WRITES_PER_S * MONTH_S / writesOf(base) : Infinity;
    const charts = $("charts"); charts.replaceChildren();
    const usdSeries = [{ label: "Cloudflare", cf: true, ys: cfYs }];
    if (Object.hasOwn(self.totals, "USD")) usdSeries.push({ label: allUsd ? "WasmKeep estimate" : "WasmKeep US$ component only", ys: selfUsd, beyond: vps === "ovh2" ? rStar : 0 });
    charts.append(panel("Monthly bill in US$", "USD", usdSeries, factor, crosses));
    if (Object.hasOwn(self.totals, "EUR")) charts.append(panel("Monthly bill in euros", "EUR", [{ label: "WasmKeep EUR component only", ys: selfEur, beyond: 0 }], factor, []));
    const table = $("sweep-table"); table.replaceChildren();
    const head = table.createTHead().insertRow();
    for (const text of ["App size", "Nodes", "Cloudflare (US$)", "WasmKeep (US$)", "WasmKeep (EUR)", "At this size, infrastructure only"]) {
      const th = document.createElement("th"); th.scope = "col"; th.textContent = text; head.append(th);
    }
    const body = table.createTBody();
    for (let i = 0; i <= STEPS; i += 10) {
      const row = body.insertRow();
      for (const text of [times(sweepXs[i]), fleet[i].nodes, money(cfYs[i], "USD"), Object.hasOwn(self.totals, "USD") ? money(selfUsd[i], "USD") : "—", Object.hasOwn(self.totals, "EUR") ? money(selfEur[i], "EUR") : "—", allUsd ? comparison(cfYs[i], selfUsd[i]) : "Currencies differ"]) row.insertCell().textContent = text;
    }
  };

  const apply = (name) => {
    const p = PRESETS[name];
    for (const f of fields) form.elements[f].value = p.v[f];
    $("preset-note").textContent = p.note;
    $("in-scale").value = 0;
    for (const b of root.querySelectorAll("[data-preset]")) b.setAttribute("aria-pressed", String(b.dataset.preset === name));
    render();
  };

  for (const b of root.querySelectorAll("[data-preset]")) b.addEventListener("click", () => apply(b.dataset.preset));
  form.addEventListener("input", (event) => {
    if (fields.includes(event.target.name)) {
      for (const b of root.querySelectorAll("[data-preset]")) b.setAttribute("aria-pressed", "false");
      $("preset-note").textContent = "Custom workload: the inputs below define the assumptions at 1×. Busy-actor rate describes bursts; daily/monthly volumes describe average traffic.";
    }
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
  $("in-scale").addEventListener("input", render);
  $("in-batched").addEventListener("change", render);
  apply("largeApi");
})();
