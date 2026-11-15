/* Illustrative event boundaries, not clocks or a live WasmKeep connection.
 * Sources: docs/cluster.md#replication, ADR 0007 and proposed ADR 0034.
 * Each upload here completes under a valid hold; in-flight races are excluded.
 */
(() => {
  'use strict';
  const writes = ['A', 'B', 'C'];
  const modes = {
    plain: 'Released in 0.4.2. Each event replies, then uploads. The next event waits for that upload.',
    durable: 'Released in 0.4.2. Each event uploads before replying. A successful durable call covers every earlier write of this actor too.',
    batched: 'Planned, opt-in; not released in 0.4.2. Later events can read local writes before the bucket has them. Here all three writes share one upload.'
  };

  function timeline(mode) {
    if (!Object.hasOwn(modes, mode)) throw new Error('Unknown write mode');
    const steps = [{ label: 'Before any write', kind: 'start', count: 0 }];
    writes.forEach((write, i) => {
      const count = i + 1;
      steps.push({ label: `${write} commits ${count} locally`, kind: 'commit', count });
      if (mode === 'durable') steps.push({ label: `Bucket holds through ${write}`, kind: 'upload', count });
      steps.push({ label: `Caller receives ${write}: ${count}`, kind: 'reply', count });
      if (mode === 'plain') steps.push({ label: `Event ${write} ends; upload completes`, kind: 'upload', count });
    });
    if (mode === 'batched') steps.push({ label: 'Bucket holds A, B and C', kind: 'upload', count: 3 });
    return steps;
  }

  function stateAt(mode, moment) {
    const steps = timeline(mode);
    const index = Math.max(0, Math.min(steps.length - 1, Math.trunc(Number(moment)) || 0));
    let local = 0, replied = 0, bucket = 0;
    for (const step of steps.slice(0, index + 1)) {
      if (step.kind === 'commit') local = step.count;
      if (step.kind === 'reply') replied = step.count;
      if (step.kind === 'upload') bucket = step.count;
    }
    return { index, local, replied, bucket, steps, writes: writes.map((id, i) => ({
      id, value: i + 1, committed: i < local, replied: i < replied, durable: i < bucket,
      outcome: i < bucket ? 'Survives' : i < local ? 'Lost' : 'Not run'
    })) };
  }

  // The exact model used by the page is also exercised by the offline test.
  if (typeof module !== 'undefined' && module.exports) module.exports = { timeline, stateAt };
  if (typeof document === 'undefined') return;
  const root = document.querySelector('[data-saved]');
  if (!root) return;
  const mode = root.querySelector('#saved-mode');
  const moment = root.querySelector('#saved-moment');
  const list = root.querySelector('.saved-timeline');
  const cards = root.querySelector('.saved-writes');
  const prev = root.querySelector('#saved-prev');
  const next = root.querySelector('#saved-next');
  const put = (id, text) => { root.querySelector(`#${id}`).textContent = text; };

  function render() {
    const state = stateAt(mode.value, moment.value);
    const { index, local, replied, bucket, steps } = state;
    moment.max = String(steps.length - 1);
    moment.value = String(index);
    moment.setAttribute('aria-valuetext', `Step ${index} of ${steps.length - 1}: ${steps[index].label}`);
    put('saved-position', `· ${index} / ${steps.length - 1}`);
    put('saved-mode-note', modes[mode.value]);
    put('saved-current', `${index === 0 ? '' : 'After: '}${steps[index].label}.`);
    const survives = writes.slice(0, bucket).join(', ') || 'none';
    const lost = writes.slice(bucket, local).join(', ') || 'none';
    put('saved-outcome', `Survives: ${survives}. Lost: ${lost}. Restored counter: ${bucket}.`);
    const repeated = bucket < replied;
    const uncertain = bucket > replied;
    put('saved-reuse', `The next increment after restore returns ${bucket + 1}. ${repeated
      ? `That value was already sent to a caller: a plain reply is not a durable acknowledgement.`
      : uncertain ? 'A write survived without its reply reaching the caller. Retrying it may add one again.'
        : 'No previously received counter value is reused at this point.'}`);
    prev.disabled = index === 0;
    next.disabled = index === steps.length - 1;
    // Keep timeline buttons in place so stepping does not discard keyboard focus.
    for (const [i, button] of [...list.querySelectorAll('button')].entries()) {
      if (i === index) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
      button.dataset.past = String(i < index);
    }
    cards.replaceChildren(...state.writes.map(write => {
      const card = document.createElement('li');
      card.dataset.outcome = write.outcome;
      const title = document.createElement('h3');
      title.textContent = `${write.id} → ${write.value}`;
      const outcome = document.createElement('strong');
      outcome.textContent = write.outcome;
      const facts = document.createElement('p');
      facts.textContent = `Local commit: ${write.committed ? 'yes' : 'no'}. Reply received: ${write.replied ? 'yes' : 'no'}. In bucket: ${write.durable ? 'yes' : 'no'}.`;
      card.append(title, outcome, facts);
      return card;
    }));
  }

  function selectMode() {
    list.replaceChildren(...timeline(mode.value).map((step, i) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${i}. ${step.label}`;
      button.addEventListener('click', () => { moment.value = String(i); render(); });
      item.append(button);
      return item;
    }));
    // Start at a useful contrast: plain has replied; durable is in the bucket.
    moment.max = String(timeline(mode.value).length - 1);
    moment.value = '2';
    render();
  }
  mode.addEventListener('change', selectMode);
  moment.addEventListener('input', render);
  prev.addEventListener('click', () => { moment.stepDown(); render(); });
  next.addEventListener('click', () => { moment.stepUp(); render(); });
  selectMode();
  root.querySelector('.saved-controls').hidden = false;
})();
