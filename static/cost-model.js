// Vendor prices and allowances verified 2026-11-15. See /cost/#prices-title
// for sources, regions, purchase conditions and billing assumptions.
// Pure model, shared by the UI and offline checks. No currency conversion.
((scope) => {
  "use strict";
  const M = 1e6, MONTH_S = 2592000;
  // 648c2d1 CSV: cluster average, divided by three, NOT node capacity.
  const SOAK_WRITES_PER_S = 643891 / 10804.523835674;
  const PUT_PER_WRITE = 1.03;
  const VPS = {
    ovh2: { name: "OVHcloud VPS-2", cur: "USD", price: 8.5, disk: 75, resident: 1800, rate: SOAK_WRITES_PER_S / 3 },
    ovh1: { name: "OVHcloud VPS-1", cur: "USD", price: 4.54, disk: 40, resident: 900, rate: SOAK_WRITES_PER_S / 6 },
    cx33: { name: "Hetzner CX33", cur: "EUR", price: 8.99, disk: 80, resident: 1800, rate: SOAK_WRITES_PER_S / 3 },
    cx23: { name: "Hetzner CX23", cur: "EUR", price: 5.99, disk: 40, resident: 900, rate: SOAK_WRITES_PER_S / 6 },
  };
  const base = { req: 0, wshare: 20, rows: 2, rread: 20, msgs: 0, conns: 0, rconn: 0, gb: 5, awake: 0, wall: 50, cpu: 2, actors: 10000, resident: 500, sockets: 0, hot: 5 };
  const preset = (note, v) => ({ note, v: { ...base, ...v } });
  const PRESETS = {
    largeApi: preset("Large API: 30M requests/day, 1M actors (50k resident at peak), 20% write 4 rows, 20 rows read/request, 2 ms Worker CPU, 50 ms activity, 2 TB data; busy writers average 5 events/s while active.", { req: 900*M, rows: 4, actors: 1e6, resident: 50000, gb: 2000 }),
    api100: preset("High-traffic API: 100M requests/day, 2M actors (100k resident), 30% write 4 rows, 20 rows read/request, 2 ms CPU, 50 ms activity, 5 TB; busy writers 10 events/s.", { req: 3000*M, wshare: 30, rows: 4, actors: 2e6, resident: 100000, gb: 5000, hot: 10 }),
    iot: preset("Telemetry: 1M devices send 1 small write every 5 minutes (288M/day), 1 row/write, no reads, 1 ms CPU, 10 ms activity, 100k resident, 3 TB retained; 1 writing event/s per active device.", { req: 8640*M, wshare: 100, rows: 1, rread: 0, cpu: 1, wall: 10, actors: 1e6, resident: 100000, gb: 3000, hot: 1 }),
    game: preset("Game: 10k always-active rooms, 100k concurrent sockets, 3M opens/month, 300M incoming writing messages/month, 2 rows/message, 10 rows/open, 1 ms Worker CPU, 10 ms activity, 1 TB; room bursts at 10 writes/s; simulation CPU is not sized.", { msgs: 300*M, conns: 3*M, rconn: 10, actors: 10000, awake: 10000, resident: 10000, sockets: 100000, gb: 1000, wall: 10, cpu: 1, hot: 10 }),
    bigSaas: preset("Data-heavy SaaS: 100k tenant actors, 10M requests/day, 25% write 8 rows, 100 rows read/request, 5 ms CPU, 200 ms activity, 20k resident, 20 TB total (0.2 GB/tenant); busy writers 5 events/s.", { req: 300*M, wshare: 25, rows: 8, rread: 100, cpu: 5, wall: 200, actors: 100000, resident: 20000, gb: 20000 }),
    busyChat: preset("Busy chat, Cloudflare hibernation: 200k rooms, 100k concurrent sockets, 10M opens and 900M incoming writing messages/month, 2 rows/message, 50 rows/open, 1 ms Worker CPU, 10 ms activity, 50k resident, 2 TB; busy-room bursts at 100 writes/s exceed today's per-actor bucket pace.", { msgs: 900*M, conns: 10*M, rconn: 50, actors: 200000, resident: 50000, sockets: 100000, gb: 2000, wall: 10, cpu: 1, hot: 100 }),
    busyChatAwake: preset("Same busy chat without Cloudflare hibernation: 50k rooms stay active all month; WasmKeep residency, sockets, traffic and data are unchanged; 100 writes/s room bursts need application pacing today.", { msgs: 900*M, conns: 10*M, rconn: 50, actors: 200000, awake: 50000, resident: 50000, sockets: 100000, gb: 2000, wall: 10, cpu: 1, hot: 100 }),
    small: preset("Small app: 1k requests/day spread evenly over 100 actors, 20% write 2 rows, 20 rows read/request, 2 ms CPU, 10 ms activity, 20 resident, 1 GB; within the modeled Free daily quotas if no other account usage.", { req: 30000, actors: 100, resident: 20, gb: 1, wall: 10, hot: 1 }),
    api50: preset("Research API: 1M requests/day, 10k actors (1k resident), 20% write 2 rows, 20 rows read/request, 2 ms CPU, 50 ms activity, 5 GB; busy writers 5 events/s.", { req: 30*M, resident: 1000 }),
    api500: preset("Research API: same 1M requests/day and 10k actors, but 500 ms activity per request; 1k resident, 5 GB, 2 ms CPU, 20% write 2 rows and read 20 rows.", { req: 30*M, resident: 1000, wall: 500 }),
    chat: preset("Research chat: 100k rooms, 10k concurrent sockets, 2M opens and 50M incoming messages/month, 2 rows/message, 50 rows/open, 1 ms Worker CPU, 10 ms activity with hibernation, 5k resident, 50 GB; busy writers 5 events/s.", { msgs: 50*M, conns: 2*M, rconn: 50, actors: 100000, resident: 5000, sockets: 10000, gb: 50, wall: 10, cpu: 1 }),
    saas: preset("Research SaaS: 1k tenants (500 resident), 20M requests/month, 25% write 4 rows, 100 rows read/request, 5 ms CPU, 200 ms activity, 50 GB; busy writers 5 events/s.", { req: 20*M, wshare: 25, rows: 4, rread: 100, cpu: 5, wall: 200, actors: 1000, gb: 50 }),
  };
  const writesOf = w => w.req * w.wshare / 100 + w.msgs;
  const over = (used, free, unit) => Math.ceil(Math.max(0, used - free) / unit) * unit;
  function cloudflare(w) {
    const workerReqs = w.req + w.conns;
    // Uniform events across actors; union of activity, not duration counted
    // twice for permanently active actors. Simultaneous events share duration.
    const awake = Math.min(w.awake, w.actors);
    const activeSeconds = Math.min(w.actors * MONTH_S, (w.req + w.msgs + w.conns) * w.wall / 1000);
    const gbs = (awake * MONTH_S + activeSeconds * (1 - awake / Math.max(1, w.actors))) * 0.128;
    const read = w.req * w.rread + w.conns * w.rconn, written = writesOf(w) * w.rows;
    // Free quotas are DAILY. Monthly averages are only a steady-load estimate.
    const free = workerReqs / 30 <= 100000 && (workerReqs + w.msgs / 20) / 30 <= 100000 &&
      gbs / 30 <= 13000 && read / 30 <= 5*M && written / 30 <= 100000 && w.gb <= 5 && w.cpu <= 10;
    if (free) return { lines: [["Free plan (steady daily usage assumed)", 0, "USD"]], totals: { USD: 0 }, free };
    const lines = [
      ["Workers Paid plan", 5],
      ["Workers requests", Math.max(0, workerReqs - 10*M) / M * 0.3],
      ["Workers CPU time", Math.max(0, workerReqs * w.cpu - 30*M) / M * 0.02],
      ["Durable Objects requests", over(workerReqs + w.msgs / 20, M, M) / M * 0.15],
      ["Duration", over(gbs, 400000, M) / M * 12.5],
      ["Rows written", over(written, 50*M, M) / M],
      ["Rows read", over(read, 25e9, M) / M * 0.001],
      ["Stored data", over(w.gb, 5, 1) * 0.2],
    ];
    return { lines: lines.map(([label, value]) => [label, value, "USD"]), totals: { USD: lines.reduce((sum, l) => sum + l[1], 0) }, free };
  }
  function selfHosted(w, key, bucket, batched = false) {
    const vps = VPS[key], writes = writesOf(w);
    const needs = { writes: writes / MONTH_S / vps.rate, resident: Math.max(w.resident, w.awake) / vps.resident,
      sockets: w.sockets / 50000, disk: w.gb / (vps.disk * 0.8) };
    // At least three nodes, plus one node's spare capacity. Balanced placement
    // and linear scaling are assumptions, not automatic rebalancing or proof.
    const nodes = Math.max(3, 1 + Math.ceil(Math.max(...Object.values(needs))));
    const batchFactor = batched ? Math.max(1, w.hot * 0.057) : 1;
    const put = writes * PUT_PER_WRITE / batchFactor + nodes * MONTH_S / 3;
    const list = nodes * MONTH_S * 0.1;
    // One-app cluster: every node reads every node + four control/app keys.
    const get = nodes * (nodes + 4) * MONTH_S / 3;
    const lines = [[`${nodes.toLocaleString("en-US")} x ${vps.name}`, nodes * vps.price, vps.cur]];
    if (bucket === "r2") {
      lines.push(["R2 Class A (PUT + LIST)", over(put + list, M, M) / M * 4.5, "USD"],
        ["R2 Class B (GET)", over(get, 10*M, M) / M * 0.36, "USD"],
        ["R2 storage", over(w.gb, 10, 1) * 0.015, "USD"]);
    } else if (bucket === "ovhos") {
      lines.push(["OVHcloud One Zone storage (GB → GiB)", Math.ceil(w.gb * 1e9 / 2**30) * 0.00001111 * (MONTH_S / 3600), "USD"], ["Bucket API requests", 0, "USD"]);
    } else {
      lines.push(["Hetzner Object Storage", 6.49 + over(w.gb / 1000, 1, 0.0001) * 0.0087 * (MONTH_S / 3600), "EUR"], ["Bucket API requests", 0, "EUR"]);
    }
    const totals = {};
    for (const [, value, currency] of lines) totals[currency] = (totals[currency] || 0) + value;
    return { lines, totals, nodes, needs, requests: { put, list, get }, writes, batchFactor };
  }
  function scaled(w, factor) {
    const out = { ...w };
    for (const key of ["req", "msgs", "conns", "gb", "actors", "resident", "sockets", "awake"]) out[key] *= factor;
    for (const key of ["actors", "resident", "sockets", "awake"]) out[key] = Math.ceil(out[key]);
    return out;
  }
  const api = { MONTH_S, SOAK_WRITES_PER_S, VPS, PRESETS, writesOf, cloudflare, selfHosted, scaled };
  if (typeof module !== "undefined") module.exports = api;
  else scope.CostModel = api;
})(globalThis);
