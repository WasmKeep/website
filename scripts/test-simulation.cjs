// Offline model checks: node --test scripts/test-simulation.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('../static/failover-model.js');
const Simulation = globalThis.WasmKeepSimulation;
const step = (s, seconds) => { for (let t = 0; t < seconds; t += 0.1) s.advance(0.1); };
const quiet = () => { const s = new Simulation(); s.load = 0; return s; };

test('adding capacity does not rebalance; spawn is bounded at 30 actors', () => {
  const s = quiet();
  const owners = s.actors.map(a => a.node);
  s.addNode(); s.addNode(); s.addNode();
  assert.equal(s.nodes.length, 5);
  assert.deepEqual(s.actors.map(a => a.node), owners);
  for (let i = 0; i < 40; i++) s.spawn();
  assert.equal(s.active().length, 30);
  assert.equal(new Set(s.actors.map(a => a.id)).size, 30);
});

test('drain uploads actors before removing the node, including pending plain data', () => {
  const s = quiet(); const a = s.actors[0];
  s.mode = 'plain'; s.request(a, 'POST');
  assert.equal(a.local, 4); assert.equal(a.saved, 3);
  s.drain('a');
  assert.equal(s.nodes[0].state, 'draining');
  s.request(a, 'POST');
  assert.equal(s.counts.retry, 1);
  step(s, 4.5);
  assert.ok(!s.nodes.some(n => n.id === 'a'));
  assert.equal(a.local, 4); assert.equal(a.saved, 4);
  assert.ok(s.actors.every(a => a.node !== 'a'));
  s.drain('b'); step(s, 4.5); s.drain('c');
  assert.equal(s.nodes.length, 1, 'the last node cannot be removed');
  s.kill('c'); assert.equal(s.failure, null);
});

test('move targets the chosen node; sleep releases it and next request can claim elsewhere', () => {
  const s = quiet(); const a = s.actors[0];
  s.move(a, 'c'); step(s, 3.5);
  assert.equal(a.node, 'c'); assert.equal(a.saved, 3);
  s.idle(a); step(s, 30.5);
  assert.equal(a.state, 'sleeping'); assert.equal(a.node, null);
  s.request(a, 'GET', true, 'b');
  assert.equal(a.node, 'b'); assert.equal(a.local, 3);
});

test('delete ends an actor and erases history; a later request creates it empty', () => {
  const s = quiet(); const a = s.actors[0];
  s.request(a, 'POST'); s.deleteActor(a); step(s, 3.5);
  assert.equal(a.state, 'deleted'); assert.equal(a.saved, 0);
  assert.equal(a.local, 0); assert.equal(a.node, null);
  assert.equal(s.active().length, 5);
  s.request(a, 'GET', true, 'c');
  assert.equal(a.state, 'serving'); assert.equal(a.node, 'c');
  assert.equal(a.local, 0); assert.equal(s.active().length, 6);
});

for (const [profile, duration] of [['median', 17.427065123], ['p99', 22.470010896]]) {
  test(`${profile}: expiry precedes fence; first failure and POST get 503, eligible GET waits`, () => {
    const s = quiet(); s.profile = profile; const a = s.actors[0];
    s.kill('a');
    s.request(a, 'GET', true, 'b'); assert.equal(s.counts.retry, 1);
    s.request(a, 'GET', true, 'b'); assert.equal(a.waiters.length, 1);
    s.request(a, 'POST', true, 'b'); assert.equal(s.counts.retry, 2);
    step(s, 10.1); assert.equal(s.failure.phase, 'grace');
    assert.equal(a.node, 'a'); assert.equal(a.local, 3);
    step(s, 5.1); assert.equal(s.failure.phase, 'fenced');
    assert.equal(a.state, 'restoring'); assert.notEqual(a.node, 'a');
    step(s, duration - s.now + 0.2);
    assert.equal(s.failure.phase, 'done'); assert.equal(a.state, 'serving');
    assert.equal(a.waiters.length, 0); assert.equal(a.local, 3);
    assert.equal(s.failure.duration, duration);
    s.restart(); assert.equal(s.failure, null);
    assert.equal(s.nodes[0].state, 'live'); assert.notEqual(a.node, 'a');
  });
}

test('durable acknowledgments survive; only unuploaded plain values are lost', () => {
  const s = quiet(); const [a, b] = s.actors;
  s.request(a, 'POST'); assert.equal(a.durable, 4);
  s.mode = 'plain'; s.request(a, 'POST'); s.request(b, 'POST');
  s.kill('a');
  assert.equal(a.local, 4); assert.equal(b.local, 3); assert.equal(s.counts.lost, 2);
  step(s, 18); assert.equal(a.local, 4); assert.equal(a.saved, 4);
  s.restart(); s.mode = 'plain'; s.request(a, 'POST'); step(s, 3.5);
  s.kill(a.node); assert.equal(s.counts.lost, 2, 'uploaded plain data survives too');
});

test('hibernated actors do not wait for the dead node', () => {
  const s = quiet(); step(s, 31);
  s.kill('a'); s.request(s.actors[0], 'GET', true, 'b');
  assert.equal(s.actors[0].state, 'serving'); assert.equal(s.counts.retry, 0);
});

test('read waiting has a per-actor cap and a deadline', () => {
  const s = quiet(); const a = s.actors[0]; s.kill('a');
  s.request(a, 'GET', false, 'b');
  for (let i = 0; i < 65; i++) s.request(a, 'GET', false, 'b');
  assert.equal(a.waiters.length, 64); assert.equal(s.counts.retry, 2);
  // Hold the illustrative restore beyond the normal scenario to test expiry.
  s.failure.duration = 60;
  step(s, 26);
  assert.ok(s.counts.retry >= 66);
});

test('a write admitted after ownership is claimed waits for restore before acknowledgment', () => {
  const s = quiet(); const a = s.actors[0]; s.kill('a'); step(s, 15.2);
  assert.equal(a.state, 'restoring');
  s.request(a, 'POST', true, 'b');
  assert.equal(a.local, 3); assert.equal(a.saved, 3);
  s.mode = 'plain'; // mode at request time, not a later toggle, defines the write
  step(s, 3);
  assert.equal(a.local, 4); assert.equal(a.saved, 4); assert.equal(a.durable, 4);
});

test('mixed operations never give an actor two owners or resurrect a dead owner', () => {
  const s = new Simulation(); s.load = 12;
  let seed = 42;
  const rand = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  for (let i = 0; i < 1800; i++) {
    const a = s.actors[rand(s.actors.length)];
    const id = s.live()[rand(s.live().length)].id;
    switch (rand(12)) {
      case 0: s.kill(id); break;
      case 1: s.restart(); break;
      case 2: s.drain(id); break;
      case 3: s.addNode(); break;
      case 4: s.spawn(); break;
      case 5: s.move(a, id); break;
      case 6: s.deleteActor(a); break;
      case 7: s.idle(a); break;
      case 8: s.request(a, 'POST'); break;
      case 9: s.mode = s.mode === 'plain' ? 'durable' : 'plain'; break;
    }
    s.advance(0.5);
    assert.ok(s.live().length >= 1);
    assert.ok(s.active().length <= 30);
    assert.equal(new Set(s.actors.map(a => a.id)).size, s.actors.length);
    for (const actor of s.actors) {
      if (actor.state === 'serving') assert.ok(s.nodes.some(n => n.id === actor.node && ['live', 'draining'].includes(n.state)));
      if (['sleeping', 'deleted'].includes(actor.state)) assert.equal(actor.node, null);
      assert.ok(actor.local >= actor.saved);
      assert.ok(actor.saved >= actor.durable, 'acknowledged durable values are retained');
    }
    s.takeEvents(); s.takePackets();
  }
});


test('a large drain hands over at most 16 actors at a time', () => {
  const s = quiet();
  while (s.active().length < 30) s.spawn();
  for (const a of s.actors) s.move(a, 'a');
  step(s, 3.5);
  s.drain('a');
  assert.equal(s.actors.filter(a => a.state === 'moving').length, 16);
  step(s, 3.5);
  assert.equal(s.actors.filter(a => a.state === 'moving').length, 14);
  assert.ok(s.nodes.some(n => n.id === 'a'));
  step(s, 3.5);
  assert.ok(!s.nodes.some(n => n.id === 'a'));
  assert.ok(s.actors.every(a => a.node !== 'a'));
});


test('generated writes reach every actor at small and large actor counts', () => {
  for (const count of [1, 2, 3, 6, 30]) {
    const s = quiet();
    while (s.actors.length < count) s.spawn();
    s.actors = s.actors.slice(0, count);
    const before = s.actors.map(a => a.saved);
    s.load = 12;
    step(s, 20);
    assert.ok(s.actors.every((a, i) => a.saved > before[i]), `writes reach all ${count} actors`);
  }
});
