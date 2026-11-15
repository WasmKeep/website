// Offline behavioral checks: node --test scripts/test-simulation.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
require('../static/failover-model.js');
const Simulation = globalThis.WasmKeepSimulation;
function until(s, predicate, max = 250) {
  for (let t = 0; t < max && !predicate(); t += 0.05) s.advance(0.05);
  assert.ok(predicate(), 'condition reached before the simulation deadline');
}
const finish = (s, r) => until(s, () => r.finished);
const edge = (r, from, to) => r.history.findIndex(h => h.from === from && h.to === to);

test('default stays quiet; a kill restores affected actors without generating client traffic', () => {
  const s = new Simulation();
  const actors = structuredClone(s.actors);
  s.advance(300);
  assert.equal(s.load, 0);
  assert.equal(s.serial, 0);
  assert.equal(s.current, null);
  assert.deepEqual(s.actors, actors);
  assert.deepEqual(s.takeEvents(), []);
  s.kill('a'); s.advance(22);
  assert.equal(s.serial, 0);
  assert.equal(s.failures.get('a').phase, 'done');
  assert.equal(s.actors[0].state, 'serving');
  assert.notEqual(s.actors[0].node, 'a');
});

test('each click gets one complete trace, even during an existing request', () => {
  const s = new Simulation();
  const requests = Array.from({ length: 12 }, () => s.request(s.actors[0]));
  assert.equal(s.current, requests[0]);
  assert.equal(s.queue.length, 11);
  until(s, () => requests.every(r => r.finished), 500);
  assert.equal(s.counts.served, 12);
  assert.equal(s.serial, 12);
  assert.equal(new Set(requests.map(r => r.id)).size, 12);
  for (const r of requests) {
    assert.equal(r.history.filter(h => h.from === 'client').length, 1);
    assert.equal(r.history.filter(h => h.to === 'client').length, 1);
  }
});

test('forwarded read visits ingress, owner and actor, then retraces the response; no bucket write', () => {
  const s = new Simulation(); const a = s.actors[0];
  const r = s.request(a, 'GET', 'c'); finish(s, r);
  assert.deepEqual(r.history.map(h => [h.from, h.to]), [
    ['client', 'lb'], ['lb', 'node:c'], ['node:c', 'node:a'],
    ['node:a', 'actor:room/42'], ['actor:room/42', 'node:a'],
    ['node:a', 'node:c'], ['node:c', 'lb'], ['lb', 'client'],
  ]);
  assert.equal(a.saved, 3);
});

test('a local request has no node-to-node forwarding hop', () => {
  const s = new Simulation(); const r = s.request(s.actors[0], 'GET', 'a'); finish(s, r);
  assert.ok(!r.history.some(h => h.from.startsWith('node:') && h.to.startsWith('node:')));
});

test('durable write reaches the bucket before acknowledgment and survives its owner', () => {
  const s = new Simulation(), a = s.actors[0];
  const r = s.request(a, 'POST', 'b', 'durable');
  until(s, () => a.local === 4);
  assert.equal(a.saved, 3); assert.equal(r.acknowledged, false);
  until(s, () => a.saved === 4);
  assert.equal(r.acknowledged, false);
  finish(s, r);
  assert.ok(edge(r, 'storage:a', 'bucket:a') < edge(r, 'actor:room/42', 'node:a'));
  assert.ok(edge(r, 'bucket:a', 'storage:a') < edge(r, 'lb', 'client'));
  assert.equal(a.durable, 4);
  s.kill('a'); s.advance(16);
  const wake = s.request(a, 'GET', 'c'); finish(s, wake);
  assert.equal(a.saved, 4); assert.equal(a.local, 4); assert.equal(s.counts.lost, 0);
});

test('plain write answers before upload; a kill in that window loses it without retracting the answer', () => {
  const s = new Simulation(), a = s.actors[0];
  const r = s.request(a, 'POST', 'b', 'plain');
  until(s, () => r.acknowledged);
  assert.equal(r.reply, 200); assert.equal(a.local, 4); assert.equal(a.saved, 3);
  assert.equal(edge(r, 'storage:a', 'bucket:a'), -1);
  s.kill('a'); s.advance(16);
  assert.equal(a.local, 3); assert.equal(s.counts.served, 1); assert.equal(s.counts.lost, 1);
  assert.equal(s.counts.retry, 0);
  const wake = s.request(a, 'GET', 'b'); finish(s, wake);
  assert.equal(a.local, 3);
});

test('an uploaded plain write survives; upload follows the complete client answer', () => {
  const s = new Simulation(), a = s.actors[0];
  const r = s.request(a, 'POST', 'a', 'plain'); finish(s, r);
  assert.ok(edge(r, 'lb', 'client') < edge(r, 'storage:a', 'bucket:a'));
  assert.equal(a.saved, 4);
  s.kill('a'); assert.equal(a.local, 4); assert.equal(s.counts.lost, 0);
});

test('killing during a durable upload never acknowledges an unsaved write', () => {
  const s = new Simulation(), a = s.actors[0];
  const r = s.request(a, 'POST', 'b', 'durable');
  until(s, () => a.local > a.saved);
  s.kill('a'); finish(s, r);
  assert.equal(r.reply, 503); assert.equal(a.saved, 3); assert.equal(a.durable, 3);
  assert.equal(s.counts.served, 0); assert.equal(s.counts.lost, 0);
});

test('first failed connection gets 503; writes during takeover are not held or retried', () => {
  for (const method of ['GET', 'POST']) {
    const s = new Simulation(), a = s.actors[0]; s.kill('a');
    const r = s.request(a, method, 'b'); finish(s, r);
    assert.equal(r.reply, 503); assert.equal(s.serial, 1); assert.equal(a.saved, 3);
    assert.ok(edge(r, 'node:b', 'node:a') >= 0);
    assert.equal(edge(r, 'node:a', 'actor:room/42'), -1);
  }
  const s = new Simulation(); s.kill('a'); s.failures.get('a').seen.add('b');
  const r = s.request(s.actors[0], 'POST', 'b'); finish(s, r);
  assert.equal(r.reply, 503); assert.ok(!r.history.some(h => h.to.startsWith('actor:')));
});

test('eligible read waits at ingress until fencing and recovery finish before delivery', () => {
  const s = new Simulation(), a = s.actors[0]; s.kill('a'); s.failures.get('a').seen.add('b');
  const r = s.request(a, 'GET', 'b');
  until(s, () => r.waiting);
  assert.equal(a.node, 'a'); assert.equal(s.failures.get('a').phase, 'lease');
  s.advance(10 - s.now + 0.05);
  assert.equal(s.failures.get('a').phase, 'grace'); assert.equal(a.node, 'a');
  until(s, () => a.state === 'restoring');
  assert.ok(s.now >= 15); assert.equal(a.node, 'b'); assert.equal(r.acknowledged, false);
  finish(s, r);
  assert.equal(r.reply, 200);
  assert.ok(s.now >= 21, 'recovery finishes before delivery');
  assert.equal(s.serial, 1, 'waiting resumes the same request, not an invisible retry');
  s.restart('a'); assert.equal(a.node, 'b');
});

test('read wait expires with 503 when fencing cannot complete', () => {
  const s = new Simulation(); s.kill('a'); s.failures.get('a').seen.add('b');
  const r = s.request(s.actors[0], 'GET', 'b');
  until(s, () => r.waiting);
  s.failures.get('a').at = s.now + 100; // simulate an extended fencing delay
  finish(s, r);
  assert.equal(r.reply, 503); assert.equal(s.counts.retry, 1);
});

test('sleep releases ownership; first landing claims, unless a parked hold names an owner', () => {
  for (const hold of [null, 'a']) {
    const s = new Simulation(), a = s.actors[0]; a.hold = hold;
    s.sleep(a); s.advance(31);
    assert.equal(a.state, 'sleeping'); assert.equal(a.node, hold);
    const r = s.request(a, 'GET', 'c'); finish(s, r);
    assert.equal(a.node, hold || 'c'); assert.equal(a.local, 3);
    if (hold) assert.ok(edge(r, 'node:c', 'node:a') >= 0);
  }
});

test('move uploads and restores on the requested node; subsequent sleep is not a pin', () => {
  const s = new Simulation(), a = s.actors[0];
  const r = s.request(a, 'POST', 'b', 'plain');
  until(s, () => r.acknowledged);
  assert.equal(s.move(a, 'c'), true);
  s.advance(1); assert.equal(a.node, 'a', 'in-flight upload must finish first');
  until(s, () => a.node === 'c'); assert.equal(a.saved, 4);
  s.sleep(a); s.advance(31);
  const wake = s.request(a, 'GET', 'b'); finish(s, wake);
  assert.equal(a.node, 'b'); assert.equal(a.local, 4);
});

test('drain alone preserves a forwarding node; remove drains first; last live node can be killed but not removed', () => {
  const s = new Simulation(); s.drain('a'); s.advance(15);
  assert.equal(s.nodes[0].state, 'drained');
  assert.ok(s.actors.every(a => a.node !== 'a'));
  const r = s.request(s.actors[0], 'GET', 'a'); finish(s, r);
  assert.equal(r.reply, 200); assert.ok(edge(r, 'node:a', `node:${r.owner}`) >= 0);
  s.remove('a'); assert.ok(!s.nodes.some(n => n.id === 'a'));
  s.remove('b'); s.advance(15);
  assert.deepEqual(s.nodes.map(n => n.id), ['c']);
  assert.equal(s.remove('c'), false); assert.equal(s.kill('c'), true);
});

test('adding nodes does not rebalance; actor/node limits and a 16-actor drain batch are enforced', () => {
  const s = new Simulation(); const before = s.actors.map(a => a.node);
  s.addNode(); s.addNode(); assert.equal(s.addNode(), false);
  assert.deepEqual(s.actors.map(a => a.node), before);
  while (s.active().length < 30) s.spawn();
  assert.equal(s.spawn(), null);
  for (const a of s.actors) s.move(a, 'a');
  s.advance(7); s.drain('a'); s.advance(0.1);
  assert.equal(s.actors.filter(a => a.operation?.kind === 'move').length, 16);
  s.advance(7);
  assert.equal(s.actors.filter(a => a.operation?.kind === 'move').length, 14);
  s.advance(7); assert.equal(s.nodes[0].state, 'drained');
});

test('operator delete erases history; the next request creates an empty actor', () => {
  const s = new Simulation(), a = s.actors[0];
  s.deleteActor(a); s.advance(7);
  assert.equal(a.state, 'deleted'); assert.equal(a.local, 0); assert.equal(a.saved, 0);
  const r = s.request(a, 'GET', 'b'); finish(s, r);
  assert.equal(a.state, 'serving'); assert.equal(a.node, 'b'); assert.equal(a.local, 0);
});

test('opt-in load is paced; turning it off prevents more generated requests', () => {
  const s = new Simulation(); s.load = 3; s.advance(10);
  assert.equal(s.serial, 1); assert.equal(s.queue.length, 0);
  s.load = 0; s.advance(100); assert.equal(s.serial, 1); assert.equal(s.current, null);
});

test('mixed operations retain one live owner, bounded capacity and acknowledged durable state', () => {
  const s = new Simulation();
  let seed = 42;
  const rand = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
  for (let i = 0; i < 1200; i++) {
    const a = s.actors[rand(s.actors.length)], id = s.nodes[rand(s.nodes.length)].id;
    switch (rand(12)) {
      case 0: s.kill(id); break;
      case 1: s.restart(); break;
      case 2: s.drain(id); break;
      case 3: s.addNode(); break;
      case 4: s.spawn(); break;
      case 5: s.move(a, id); break;
      case 6: s.deleteActor(a); break;
      case 7: s.sleep(a); break;
      case 8: if (!s.current) s.request(a, 'POST', null, rand(2) ? 'durable' : 'plain'); break;
    }
    s.advance(1);
    assert.ok(s.active().length <= 30);
    assert.equal(new Set(s.actors.map(a => a.id)).size, s.actors.length);
    for (const actor of s.actors) {
      if (actor.state === 'serving') assert.ok(s.nodes.some(n => n.id === actor.node && ['live', 'draining'].includes(n.state)));
      if (['sleeping', 'deleted'].includes(actor.state) && !actor.hold) assert.equal(actor.node, null);
      assert.ok(actor.local >= actor.saved);
      assert.ok(actor.saved >= actor.durable);
    }
    s.takeEvents();
  }
});

test('remove waits for an ingress request to finish before stopping its drained node', () => {
  const s = new Simulation();
  for (const a of s.actors.filter(a => a.node === 'a')) s.move(a, 'b');
  s.advance(7);
  const r = s.request(s.actors[0], 'GET', 'a');
  s.remove('a'); s.advance(1);
  assert.equal(s.nodes.find(n => n.id === 'a').state, 'drained');
  finish(s, r); s.advance(.1);
  assert.ok(!s.nodes.some(n => n.id === 'a'));
  assert.equal(r.reply, 200);
});

test('a killed forwarding ingress cannot return a successful response', () => {
  const s = new Simulation();
  const r = s.request(s.actors[0], 'GET', 'b');
  until(s, () => r.owner === 'a');
  s.kill('b'); finish(s, r);
  assert.equal(r.reply, 503); assert.equal(s.counts.served, 0);
  assert.equal(r.history.at(-1).from, 'lb');
  assert.equal(r.history.at(-1).to, 'client');
});


test('overlapping kills track each lease and spread all affected actors across survivors', () => {
  const s = new Simulation(); s.addNode(); s.addNode();
  assert.equal(s.kill('a'), true); s.advance(4);
  assert.equal(s.kill('b'), true); s.advance(11);
  assert.equal(s.failures.get('a').phase, 'done');
  assert.equal(s.failures.get('b').phase, 'grace');
  assert.ok(s.actors.filter(a => a.node === 'b').every(a => a.state === 'stranded'));
  s.advance(11);
  assert.ok(s.actors.every(a => a.state === 'serving' && ['c', 'd', 'e'].includes(a.node)));
  assert.deepEqual(['c', 'd', 'e'].map(id => s.actors.filter(a => a.node === id).length), [2, 2, 2]);
  assert.equal(s.serial, 0);
});

test('one survivor serves every actor with no quorum, even after killing a recovery destination', () => {
  const s = new Simulation(); s.kill('a'); s.advance(16);
  assert.ok(s.actors.some(a => a.state === 'restoring' && a.node === 'b'));
  s.kill('b'); s.advance(22);
  assert.ok(s.actors.every(a => a.node === 'c' && a.state === 'serving'));
  for (const a of s.actors) { const r = s.request(a); finish(s, r); assert.equal(r.reply, 200); }
});

test('all down visibly fails reads and writes; restart any node restores every durable write', () => {
  for (const restart of ['a', 'b', 'c']) {
    const s = new Simulation();
    for (const a of s.actors) finish(s, s.request(a, 'POST', a.node, 'durable'));
    const saved = s.actors.map(a => a.saved);
    for (const n of s.nodes) assert.equal(s.kill(n.id), true);
    assert.equal(s.live().length, 0); assert.equal(s.spawn(), null);
    s.advance(30);
    for (const method of ['GET', 'POST']) {
      const r = s.request(s.actors[0], method); finish(s, r);
      assert.equal(r.reply, 503); assert.equal(r.history.at(-1).to, 'client');
      assert.ok(!r.history.some(h => h.to.startsWith('actor:')));
    }
    assert.deepEqual(s.actors.map(a => a.saved), saved);
    assert.equal(s.restart(restart), true); s.advance(7);
    assert.ok(s.actors.every(a => a.node === restart && a.state === 'serving'));
    assert.deepEqual(s.actors.map(a => a.local), saved);
    assert.deepEqual(s.actors.map(a => a.durable), saved);
    assert.equal(s.counts.lost, 0);
    const r = s.request(s.actors[0]); finish(s, r); assert.equal(r.reply, 200);
  }
});

test('restart before expiry still respects old leases; a pending plain write can be lost', () => {
  const s = new Simulation(), a = s.actors[0];
  const r = s.request(a, 'POST', 'a', 'plain'); until(s, () => r.acknowledged);
  const killedAt = s.now;
  for (const n of s.nodes) s.kill(n.id);
  assert.equal(s.counts.lost, 1); assert.equal(a.saved, 3);
  s.restart('b'); s.advance(10);
  assert.ok(s.actors.every(a => a.state === 'stranded'));
  s.advance(12);
  assert.ok(s.now >= killedAt + 21);
  assert.ok(s.actors.every(a => a.node === 'b' && a.local === a.saved && a.state === 'serving'));
  assert.equal(a.local, 3);
});

test('kills interrupt lifecycle operations without resurrecting a dead owner or erasing saved data', () => {
  for (const operation of ['move', 'sleep', 'deleteActor', 'drain']) {
    const s = new Simulation(), a = s.actors[0];
    if (operation === 'drain') s.drain('a');
    else s[operation](a, 'b');
    s.advance(.1);
    assert.equal(s.kill('a'), true);
    s.kill('b'); s.kill('c'); s.advance(30);
    assert.equal(a.saved, 3); assert.equal(a.operation, null);
    s.restart('c'); s.advance(7);
    assert.equal(a.local, 3); assert.equal(a.state, 'serving'); assert.equal(a.node, 'c');
  }
});


test('rapid kill and restart cannot acknowledge an old unsaved durable event', () => {
  const s = new Simulation(), a = s.actors[0];
  const r = s.request(a, 'POST', 'b', 'durable');
  until(s, () => a.local > a.saved);
  s.kill('a'); s.restart('a'); finish(s, r);
  assert.equal(r.reply, 503); assert.equal(a.saved, 3); assert.equal(a.durable, 3);
});

test('all five nodes can fail, then recover on any newly restarted survivor', () => {
  const s = new Simulation(); s.addNode(); s.addNode();
  while (s.active().length < 30) s.spawn();
  for (const id of ['e', 'b', 'd', 'a', 'c']) { assert.equal(s.kill(id), true); s.advance(1); }
  s.advance(30); assert.equal(s.live().length, 0);
  assert.equal(s.restart('e'), true); s.advance(7);
  assert.ok(s.actors.every(a => a.node === 'e' && a.state === 'serving' && a.local === a.saved));
});
