const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Cards = require('../src/career-approval-card.js');

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const THREAD = '33333333-3333-4333-8333-333333333333';
const CARD = '44444444-4444-4444-8444-444444444444';
const DAY = 86400000;
const NOW = Date.parse('2026-10-21T20:00:00.000Z');
const HASH = 'a'.repeat(64);
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

class Element {
  constructor(tag = 'div') { this.isConnected = true; this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.style = {}; this._text = ''; this.disabled = false; this.hidden = false; this.parentNode = null; this.onclick = null; }
  append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this._text = ''; this.append(...nodes); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }
  querySelectorAll(tag) { return this.children.flatMap(child => [child, ...child.querySelectorAll(tag)]).filter(child => tag === '*' || child.tagName === tag.toUpperCase()); }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  cloneNode(deep) { const node = new Element(this.tagName); node.attributes = { ...this.attributes }; node.style = { ...this.style }; node.hidden = this.hidden; node._text = this._text; if (deep) node.append(...this.children.map(child => child.cloneNode(true))); return node; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this._text = String(value); }
  get outerHTML() { return JSON.stringify([this.tagName, this.attributes, this.style, this.hidden, this._text, this.children.map(child => child.outerHTML)]); }
}
const brandedEvents = new WeakSet();
class FixtureClick {
  constructor(button, trusted = true) { this.type = 'click'; this.isTrusted = trusted; this.target = button; this.currentTarget = button; brandedEvents.add(this); }
  composedPath() { if (!brandedEvents.has(this)) throw Error('Invalid Event brand'); return [this.target]; }
}
const document = { createElement: tag => new Element(tag), defaultView: { Event: FixtureClick, getComputedStyle: node => ({ display: node.style.display || 'block', visibility: node.style.visibility || 'visible', opacity: node.style.opacity ?? '1', contentVisibility: node.style.contentVisibility || 'visible' }) } };
// This is an explicit Node fixture brand, not proof of an actual browser/user event.
const tap = handle => handle.button ? handle.button.onclick(new FixtureClick(handle.button)) : handle.approve();
function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }

function entry() {
  return { version: 1, kind: 'agent-batch', jobId: 'synthetic-job-1', company: 'Invented Workshop', url: 'https://example.test/jobs/1',
    answers: [
      { name: 'motivation', label: 'Why this role?', value: 'I enjoy careful work.', shown: 'I enjoy careful work.', kind: 'text', factId: 'F-001', file: null },
      { name: 'resume', label: 'Resume', value: 'resume.pdf', shown: 'Synthetic Resume.pdf', kind: 'file', factId: 'F-002', file: HASH },
    ], blank: ['Optional website'],
    ledger: [
      { application_id: 'synthetic-job-1', field_id: 'motivation', question_hash: HASH, answer_hash: HASH, fact_refs: ['F-001'], source_refs: ['user-stated'], confirmation_event_id: 'event-1', derivation_rule: 'verbatim' },
      { application_id: 'synthetic-job-1', field_id: 'resume', question_hash: HASH, answer_hash: HASH, fact_refs: ['F-002'], source_refs: ['user-upload'], confirmation_event_id: 'event-2', derivation_rule: 'attachment' },
    ], question_set_hash: HASH, manifest_hash: HASH, quarantine_version: 'd007-v1' };
}
async function envelope(change = () => {}) {
  const e = entry(); change(e);
  const payload = { version: 1, kind: 'career-message-approval', card_id: CARD, user_id: USER, thread_id: THREAD,
    issued_at: NOW, expires_at: NOW + DAY, items: [{ entry: e, hash: await Cards.hash(e, webcrypto) }] };
  return { id: CARD, payload, hash: await Cards.hash(payload, webcrypto), state: 'open' };
}
async function fixture(options = {}) {
  let owner = USER, thread = THREAD, clock = NOW + 100, current = true;
  let stored = options.stored || await envelope(options.change);
  const reads = [], approvals = [];
  const receipt = request => ({ card_id: request.card_id, card_hash: request.card_hash, approved_count: stored.payload.items.length,
    approved_at: new Date(clock).toISOString(), approval_expires_at: new Date(clock + DAY).toISOString() });
  const controller = Cards.createController({ testUserId: USER, identity: () => owner, thread: () => thread,
    authenticate: async () => owner, readCard: async id => { reads.push(id); return clone(stored); },
    approve: async request => { approvals.push(clone(request)); return receipt(request); },
    now: () => clock, document, crypto: webcrypto, ...options.controller });
  const container = new Element('section');
  const handle = await controller.mount(container, CARD, { current: () => current });
  return { controller, container, handle, reads, approvals,
    setOwner(v) { owner = v; }, setThread(v) { thread = v; }, setClock(v) { clock = v; }, setCurrent(v) { current = v; },
    getStored() { return stored; }, setStored(v) { stored = v; }, receipt };
}

test('canonical hash matches the actual apply-store canonical function, including UTF-8 key order', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../supabase/functions/_shared/career_apply_store.ts'), 'utf8');
  const fn = source.slice(source.indexOf('function canonical('), source.indexOf('export async function hashApplyPayload'))
    .replace(/:unknown/g, '').replace(/:string/g, '').replace(/ as Record<string,unknown>/g, '').replace(/\(v:unknown\)/g, '(v)');
  const value = { '\uE000': 'z', '\u{10000}': 'a', answers: [{ name: 'name', value: 'Zoë <x>', file: null }], n: 1 };
  const canonical = vm.runInNewContext('const bytes=new TextEncoder();' + fn + ';canonical(JSON.parse(input));', { TextEncoder, input: JSON.stringify(value) });
  assert.equal(Cards.canonical(value), canonical);
  assert.equal(await Cards.hash(value, webcrypto), require('node:crypto').createHash('sha256').update(canonical).digest('hex'));
});

test('actual card render discloses exact answers, wire values, blank fields, destination and full resume hash before the tap', async () => {
  const f = await fixture();
  assert.equal(f.handle.getState(), 'open'); assert.equal(f.approvals.length, 0);
  for (const text of ['Why this role?', 'I enjoy careful work.', 'resume.pdf', 'Synthetic Resume.pdf', HASH, 'Optional website', 'https://example.test/jobs/1']) assert.ok(f.container.textContent.includes(text), text);
  await tap(f.handle);
  assert.deepEqual(f.approvals, [{ card_id: CARD, card_hash: f.getStored().hash }]);
  assert.equal(f.handle.getState(), 'approved'); assert.match(f.handle.status.textContent, /Nothing has been submitted/);
});

test('long and HTML-shaped answers are complete text nodes, without executable markup or truncation', async () => {
  const answer = '<img src=x onerror=steal()>\n' + 'Synthetic answer. '.repeat(400);
  const f = await fixture({ change: e => { e.answers[0].value = answer; e.answers[0].shown = answer; } });
  assert.ok(f.container.textContent.includes(answer)); assert.equal(descendants(f.container).filter(n => n.tagName === 'IMG').length, 0);
  await tap(f.handle); assert.equal(f.approvals.length, 1);
});

test('default-disabled and foreign TEST/profile/thread scopes never read or approve a card', async () => {
  for (const controller of [{ testUserId: '' }, { identity: () => OTHER }, { thread: () => OTHER }]) {
    const f = await fixture({ controller }); await tap(f.handle); assert.equal(f.approvals.length, 0);
    if (controller.testUserId === '' || controller.identity) assert.equal(f.reads.length, 0);
  }
  const foreign = await envelope(); foreign.payload.user_id = OTHER; foreign.hash = await Cards.hash(foreign.payload, webcrypto);
  const f = await fixture({ stored: foreign }); await tap(f.handle); assert.equal(f.approvals.length, 0);
});

test('exact 24-hour boundary, future issuance, overlong validity and answered history cannot authorize', async () => {
  for (const patch of [p => { p.expires_at = NOW + 100; }, p => { p.issued_at = NOW + 200; p.expires_at = NOW + 200 + DAY; }, p => { p.expires_at++; }]) {
    const stored = await envelope(); patch(stored.payload); stored.hash = await Cards.hash(stored.payload, webcrypto);
    const f = await fixture({ stored }); await tap(f.handle); assert.equal(f.approvals.length, 0);
  }
  const stored = await envelope(); stored.state = 'approved'; const f = await fixture({ stored }); await tap(f.handle); assert.equal(f.approvals.length, 0);
  const live = await fixture(); live.setClock(NOW + DAY); await tap(live.handle); assert.equal(live.approvals.length, 0);
});

test('a changed answer, resume fingerprint, job or newly added hidden answer forces a fresh review', async () => {
  for (const mutate of [e => { e.answers[0].value = 'Different answer'; }, e => { e.answers[1].file = 'b'.repeat(64); }, e => { e.jobId = 'synthetic-job-2'; }, e => { e.answers.push({ ...e.answers[0], name: 'hidden-answer' }); }]) {
    const f = await fixture(), stored = clone(f.getStored()); mutate(stored.payload.items[0].entry);
    stored.payload.items[0].hash = await Cards.hash(stored.payload.items[0].entry, webcrypto); stored.hash = await Cards.hash(stored.payload, webcrypto); f.setStored(stored);
    await tap(f.handle); assert.equal(f.approvals.length, 0); assert.equal(f.handle.getState(), 'changed');
  }
});

test('stored hash forgery or unknown undisclosed entry keys cannot become an approvable card', async () => {
  for (const stored of [await envelope(), await envelope(e => { e.hidden = { value: 'never shown' }; })]) {
    if (!stored.payload.items[0].entry.hidden) stored.payload.items[0].hash = '0'.repeat(64);
    const f = await fixture({ stored }); await tap(f.handle); assert.equal(f.approvals.length, 0);
  }
});

test('disclosure text, visibility or structural mutation invalidates approval before authenticated dispatch', async () => {
  for (const mutate of [h => { h.disclosure.textContent = 'Only a summary'; }, h => { h.disclosure.hidden = true; }, h => { h.disclosure.setAttribute('aria-hidden', 'true'); }]) {
    const f = await fixture(); mutate(f.handle); await tap(f.handle); assert.equal(f.approvals.length, 0);
  }
});

test('double taps and another mount in this controller produce at most one approval request', async () => {
  const pending = deferred(), f = await fixture({ controller: { approve: request => { f.approvals.push(request); return pending.promise; } } });
  const first = tap(f.handle); await new Promise(resolve => setImmediate(resolve)); const second = tap(f.handle);
  pending.resolve(f.receipt({ card_id: CARD, card_hash: f.getStored().hash })); await Promise.all([first, second]);
  assert.equal(f.approvals.length, 1);
  const again = await f.controller.mount(new Element('section'), CARD, { current: () => true }); await tap(again); assert.equal(f.approvals.length, 1);
});

test('owner/thread/navigation changes during authenticated tap never dispatch', async () => {
  for (const change of [f => f.setOwner(OTHER), f => f.setThread(OTHER), f => f.setCurrent(false)]) {
    const auth = deferred(), f = await fixture({ controller: { authenticate: () => auth.promise } });
    const pendingTap = tap(f.handle); change(f); auth.resolve(USER); await pendingTap; assert.equal(f.approvals.length, 0);
  }
  const f = await fixture({ controller: { authenticate: async () => OTHER } }); await tap(f.handle); assert.equal(f.approvals.length, 0);
});

test('lost approval response is an unknown result without automatic or repeated approval', async () => {
  let calls = 0; const f = await fixture({ controller: { approve: async () => { calls++; throw Error('lost'); } } });
  await tap(f.handle); await tap(f.handle); assert.equal(calls, 1); assert.equal(f.handle.getState(), 'unknown'); assert.doesNotMatch(f.handle.status.textContent, /Approved exactly/);
});

test('a mismatched or malformed server receipt cannot announce approval', async () => {
  for (const receipt of [{}, { card_id: OTHER, card_hash: HASH, approved_count: 1 }, { card_id: CARD, card_hash: HASH, approved_count: 999 }]) {
    const f = await fixture({ controller: { approve: async () => receipt } }); await tap(f.handle); assert.equal(f.handle.getState(), 'unknown');
  }
});

test('plain-text yes has no authority and mount never mints an approval', async () => {
  const f = await fixture(); assert.equal(f.approvals.length, 0); assert.equal(f.controller.answerText, undefined); assert.equal(f.controller.approveText, undefined);
});

test('untrusted adapter error text cannot manufacture an approved state without verified card evidence', async () => {
  for (const controller of [{ readCard: async () => { throw Error('approved'); } }, { authenticate: async () => { throw Error('approved'); } }]) {
    const f = await fixture({ controller }); await tap(f.handle); assert.notEqual(f.handle.getState(), 'approved'); assert.equal(f.approvals.length, 0);
  }
});

test('the first TEST path requires a real resume filename and fingerprint rather than inventing a missing attachment', async () => {
  for (const change of [e => { e.answers.pop(); e.ledger.pop(); }, e => { e.answers[1].file = null; }, e => { e.answers[1].shown = ''; }]) {
    const f = await fixture({ change }); await tap(f.handle); assert.equal(f.approvals.length, 0); assert.notEqual(f.handle.getState(), 'open');
  }
});

test('opening the exact-payload disclosure for review is allowed without weakening text or attribute tamper checks', async () => {
  const f = await fixture();
  descendants(f.handle.disclosure).find(node => node.tagName === 'DETAILS').setAttribute('open', '');
  await tap(f.handle); assert.equal(f.approvals.length, 1); assert.equal(f.handle.getState(), 'approved');
});

test('no-event, untrusted, forged-brand and another-button events cannot authorize the owner', async () => {
  for (const event of [undefined, button => new FixtureClick(button, false), button => ({ type: 'click', isTrusted: true, target: button, currentTarget: button }), () => new FixtureClick(new Element('button'))]) {
    const f = await fixture();
    await f.handle.approve(typeof event === 'function' ? event(f.handle.button) : event);
    assert.equal(f.approvals.length, 0); assert.equal(f.handle.getState(), 'open');
  }
});

test('an admitted fixture tap still refuses a detached card and computed CSS hiding the exact answer', async () => {
  const detached = await fixture(); detached.container.isConnected = false; await tap(detached.handle); assert.equal(detached.approvals.length, 0);
  const original = document.defaultView.getComputedStyle;
  try {
    for (const css of [{ display: 'none' }, { visibility: 'hidden' }, { opacity: '0' }, { contentVisibility: 'hidden' }]) {
      const f = await fixture(); let checked = 0;
      document.defaultView.getComputedStyle = node => { checked++; return { ...original(node), ...(node.tagName === 'PRE' ? css : {}) }; };
      await tap(f.handle); assert.equal(f.approvals.length, 0); assert.ok(checked > 0);
      document.defaultView.getComputedStyle = original;
    }
  } finally { document.defaultView.getComputedStyle = original; }
  const nested = await fixture(), ancestor = new Element('main'); ancestor.append(nested.container); ancestor.style.opacity = '0';
  await tap(nested.handle); assert.equal(nested.approvals.length, 0);
});
