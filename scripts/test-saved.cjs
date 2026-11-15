// Offline contract checks for every selectable crash boundary.
const assert = require('node:assert/strict');
const { timeline, stateAt } = require('../static/saved.js');

for (const mode of ['plain', 'durable', 'batched']) {
  for (let moment = 0; moment < timeline(mode).length; moment++) {
    const state = stateAt(mode, moment);
    assert.ok(state.bucket <= state.local, 'Only committed writes can reach the bucket');
    assert.ok(state.replied <= state.local, 'Only committed writes can be answered');
    assert.equal(state.writes.filter(write => write.outcome === 'Survives').length, state.bucket);
    assert.equal(state.writes.filter(write => write.outcome === 'Lost').length, state.local - state.bucket);
    assert.equal(state.writes.filter(write => write.outcome === 'Not run').length, 3 - state.local);
    if (mode === 'durable') {
      assert.ok(state.replied <= state.bucket, 'Every durable reply and earlier write survives');
      for (const write of state.writes.filter(write => write.replied)) assert.equal(write.outcome, 'Survives');
    }
    if (mode === 'plain') assert.ok(state.local - state.bucket <= 1, 'Strict mode waits before the next event');
  }
  assert.equal(stateAt(mode, 0).local, 0);
  assert.equal(stateAt(mode, 100).bucket, 3);
  assert.equal(stateAt(mode, -1).index, 0);
}

const plainReply = stateAt('plain', 2);
assert.equal(plainReply.replied, 1);
assert.equal(plainReply.bucket, 0, 'An answered plain increment can be lost and its value reused');
const durableBeforeReply = stateAt('durable', 2);
assert.equal(durableBeforeReply.bucket, 1);
assert.equal(durableBeforeReply.replied, 0, 'A durable write can survive without a received reply');
const unsentWindow = stateAt('batched', 6);
assert.equal(unsentWindow.local, 3);
assert.equal(unsentWindow.replied, 3);
assert.equal(unsentWindow.bucket, 0, 'The whole unreplicated window can be lost');
assert.deepEqual(unsentWindow.writes.map(write => write.outcome), ['Lost', 'Lost', 'Lost']);
assert.equal(stateAt('plain', 4).bucket, 1, 'B sees A only after its strict upload');
assert.equal(stateAt('batched', 3).bucket, 0, 'B sees local A before its batched upload');
assert.throws(() => timeline('unknown'));
console.log('saved timeline: all crash boundaries passed');
