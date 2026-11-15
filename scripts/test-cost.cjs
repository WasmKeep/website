// Accounting and sizing checks; price-source evidence is linked on /cost/.
const assert = require('node:assert/strict');
const { PRESETS, MONTH_S, VPS, SOAK_WRITES_PER_S, writesOf, cloudflare, selfHosted, scaled } = require('../static/cost-model.js');
const empty = { ...PRESETS.small.v, req: 0, msgs: 0, conns: 0, gb: 0, resident: 0, sockets: 0, awake: 0 };
const idle = selfHosted(empty, 'ovh2', 'r2');
assert.deepEqual(idle.requests, { put: 2592000, list: 777600, get: 18144000 });
assert.equal(idle.totals.USD, 42.24, 'Three VPS + rounded R2 idle request floor');
assert.equal(cloudflare(PRESETS.small.v).totals.USD, 0);
const paid = cloudflare({ ...empty, req: 30e6, wshare: 0, rread: 0, wall: 0, cpu: 0 });
assert.equal(paid.totals.USD, 15.35, 'Paid minimum + Worker request overage + DO request overage');
// 11M seconds would fit the lower duration billing bracket at 0.125 GB;
// the vendor example uses 0.128 GB and crosses into the next million GB-s.
const durationBoundary = cloudflare({ ...empty, actors: 100, req: 11000000, wall: 1000 });
assert.equal(durationBoundary.lines.find(l => l[0] === 'Duration')[1], 25);
const fullTime = cloudflare({ ...empty, actors: 100, awake: 100, req: 100e6, wall: 100000 });
const noEvents = cloudflare({ ...empty, actors: 100, awake: 100, req: 0 });
assert.equal(fullTime.lines.find(l => l[0] === 'Duration')[1], noEvents.lines.find(l => l[0] === 'Duration')[1], 'Always-active object duration is never billed twice');
const sockets = selfHosted({ ...empty, sockets: 150000 }, 'ovh2', 'ovhos');
assert.equal(sockets.nodes, 4, 'Three socket budgets plus one spare');
const residents = selfHosted({ ...empty, resident: 5400 }, 'ovh2', 'ovhos');
assert.equal(residents.nodes, 4, 'Pool leaves 10% for front requests');
assert.equal(selfHosted({ ...empty, gb: 180 }, 'ovh2', 'ovhos').nodes, 4, 'Disk reserve and one spare');
assert.equal(selfHosted({ ...empty, req: (SOAK_WRITES_PER_S / 3) * 4 * MONTH_S, wshare: 100 }, 'ovh2', 'ovhos').nodes, 5);
assert.equal(selfHosted({ ...empty, gb: 2**30/1e9 }, 'ovh2', 'ovhos').lines[1][1], 0.00001111 * 720, 'OVH GiB hourly price uses the modeled 30-day month');
assert.equal(selfHosted({ ...empty, gb: 0.1 }, 'ovh2', 'ovhos').lines[1][1], 0.00001111 * 720, 'OVH storage rounds up to a whole GiB');
assert.equal(selfHosted({ ...empty, gb: 1000.01 }, 'cx33', 'hzos').lines[1][1], 6.49 + 0.0001 * 0.0087 * 720, 'Hetzner excess storage rounds to 100 MB');
for (const [name, p] of Object.entries(PRESETS)) {
  for (const vps of Object.keys(VPS)) for (const bucket of ['ovhos', 'r2', 'hzos']) {
    let lastNodes = 0;
    for (const factor of [0.001, 0.01, 0.1, 1, 10, 100]) {
      const w = scaled(p.v, factor), strict = selfHosted(w, vps, bucket), batch = selfHosted(w, vps, bucket, true);
      assert.ok(strict.nodes >= lastNodes, `${name}: scale must not reduce nodes`);
      assert.equal(batch.nodes, strict.nodes, 'Planned batching must not invent measured capacity');
      assert.ok(batch.requests.put <= strict.requests.put);
      assert.equal(batch.requests.get, strict.requests.get);
      assert.equal(batch.requests.list, strict.requests.list);
      for (const bill of [strict, batch, cloudflare(w)]) for (const value of Object.values(bill.totals)) assert.ok(Number.isFinite(value) && value >= 0);
      lastNodes = strict.nodes;
    }
  }
}
assert.deepEqual(selfHosted(PRESETS.iot.v, 'ovh2', 'r2', true), selfHosted(PRESETS.iot.v, 'ovh2', 'r2'), 'Slow independent devices cannot batch across actors');
const chat = selfHosted(PRESETS.busyChat.v, 'ovh2', 'r2');
const planned = selfHosted(PRESETS.busyChat.v, 'ovh2', 'r2', true);
assert.equal(planned.batchFactor, 5.7);
assert.ok(planned.requests.put > writesOf(PRESETS.busyChat.v) / 5.7, 'Idle and snapshot overhead survive the projection');
assert.ok(cloudflare(PRESETS.busyChatAwake.v).totals.USD > cloudflare(PRESETS.busyChat.v).totals.USD);
assert.deepEqual(Object.keys(selfHosted(PRESETS.largeApi.v, 'cx33', 'hzos').totals), ['EUR']);
assert.deepEqual(Object.keys(selfHosted(PRESETS.largeApi.v, 'cx33', 'r2').totals), ['EUR', 'USD']);
console.log('cost: accounting, free/paid boundaries, duration, fleet sizing, currency separation and planned batching passed');
