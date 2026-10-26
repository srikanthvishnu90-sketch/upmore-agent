// FEATURE E2E (2026-10-26): the web chat's apply card (src/career-apply-card.js), without a browser. Synthetic rows only.
// Check: node --test tests/career-apply-card-web.test.cjs
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const C = require(path.join(root, 'src/career-apply-card.js'));

const CARD = '2c1f7a52-6d1e-4b8a-9f3e-0a1b2c3d4e5f', P1 = '3d2e8b63-7e2f-4c9b-8a4f-1b2c3d4e5f60', P2 = '4e3f9c74-8f30-4dac-9b50-2c3d4e5f6071';
const H1 = 'a'.repeat(64), H2 = 'b'.repeat(64);
const card = (over = {}) => ({ id: CARD, state: 'open', shown_at: '2026-10-26T10:00:00Z', items: [{ n: 1, prepared_id: P1, payload_hash: H1 }, { n: 2, prepared_id: P2, payload_hash: H2 }], ...over });
const prepared = (h2 = H2) => [
  { id: P1, company: 'TEST Ramp', card_lines: ['Frontend Engineer Intern at TEST Ramp', 'Name: Alex Testcase', 'Resume: your base resume, tailored for this role (0123456789ab)'], payload_hash: H1 },
  { id: P2, company: 'TEST Acme', card_lines: ['Analyst at TEST Acme', 'Email: alex.testcase@example.test'], payload_hash: h2 },
];

// A tiny DOM: what a person reads (text) and the buttons they tap.
function doc() {
  const make = (tag) => {
    const e = { tag, children: [], parent: null, own: '', attrs: {}, className: '', ownerDocument: null,
      get textContent() { return this.own; }, set textContent(v) { this.own = String(v); this.children = []; },
      appendChild(c) { c.parent = this; this.children.push(c); return c; }, append(...cs) { cs.forEach((c) => this.appendChild(c)); },
      replaceChildren(...cs) { this.children = []; this.own = ''; this.append(...cs); },
      replaceWith(...cs) { const p = this.parent, i = p.children.indexOf(this); cs.forEach((c) => (c.parent = p)); p.children.splice(i, 1, ...cs); },
      setAttribute(k, v) { this.attrs[k] = v; },
      text() { return [this.own, ...this.children.map((c) => c.text())].filter(Boolean).join('\n'); },
      buttons() { return [...(this.tag === 'button' ? [this] : []), ...this.children.flatMap((c) => c.buttons())]; } };
    return e;
  };
  return { createElement: make };
}
// supabase-js's from(), answering from the given rows; every call recorded.
function db(rows, calls) {
  return (table) => {
    const q = { table, filters: [] };
    const run = () => {
      calls.push({ table, filters: q.filters });
      let r = rows[table] || [];
      for (const [op, col, v] of q.filters) r = r.filter((x) => (op === 'eq' ? x[col] === v : v.includes(x[col])));
      return r;
    };
    const chain = { select() { return chain; }, eq(c, v) { q.filters.push(['eq', c, v]); return chain; },
      in(c, v) { q.filters.push(['in', c, v]); return Promise.resolve({ data: run(), error: null }); },
      maybeSingle() { const r = run(); return Promise.resolve({ data: r[0] || null, error: null }); } };
    return chain;
  };
}

test('only a career_apply_card reply with a card id is a card', () => {
  assert.equal(C.cardIdOf({ intent: 'career_apply_card', card_id: CARD }), CARD);
  assert.equal(C.cardIdOf({ intent: 'career_apply_card', card_id: 'not-a-uuid' }), null);
  assert.equal(C.cardIdOf({ intent: 'career_apply_queue', card_id: CARD }), null);
  assert.equal(C.cardIdOf(null), null);
});

test('the card verifies only when every item still hashes to what the card carries; lines come from the prepared rows', () => {
  const ok = C.verifyCard(card(), prepared());
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.items.map((i) => [i.n, i.lines[0], i.payload_hash]), [[1, 'Frontend Engineer Intern at TEST Ramp', H1], [2, 'Analyst at TEST Acme', H2]]);
  const changed = C.verifyCard(card(), prepared('c'.repeat(64)));
  assert.deepEqual([changed.ok, changed.why, changed.items[1].changed], [false, 'changed', true]);
  assert.deepEqual([C.verifyCard(card({ state: 'answered' }), prepared()).ok, C.verifyCard(card({ state: 'answered' }), prepared()).why], [false, 'answered']);
  assert.equal(C.verifyCard(card(), prepared().slice(0, 1)).why, 'missing', 'an item with no prepared row');
});

test('the tap answers this card with exactly its numbers; decline with none', () => {
  assert.deepEqual(C.answerArgs(card(), true), { p_card: CARD, p_approve: [1, 2] });
  assert.deepEqual(C.answerArgs(card(), false), { p_card: CARD, p_approve: [] });
});

test('mount: renders every line, Approve calls career_apply_card_answer_own once with the card and its numbers', async () => {
  const calls = [], rpcs = [], d = doc(), host = d.createElement('div');
  const v = await C.mount(host, { intent: 'career_apply_card', card_id: CARD }, {
    document: d, from: db({ career_apply_cards: [card()], career_apply_prepared: prepared() }, calls),
    rpc: async (name, args) => { rpcs.push([name, args]); return { data: [{ n: 1, company: 'TEST Ramp', result: 'queued' }, { n: 2, company: 'TEST Acme', result: 'company_cooldown' }], error: null }; },
  });
  assert.equal(v.ok, true);
  for (const line of [...prepared()[0].card_lines, ...prepared()[1].card_lines]) assert.ok(host.text().includes(line), line);
  assert.deepEqual(calls.map((c) => c.table), ['career_apply_cards', 'career_apply_prepared']);
  const approve = host.buttons().find((b) => b.textContent === 'Approve all 2');
  await approve.onclick();
  assert.deepEqual(rpcs, [['career_apply_card_answer_own', { p_card: CARD, p_approve: [1, 2] }]]);
  assert.match(host.text(), /1 approved exactly as shown\. Nothing has gone to an employer yet\./);
  assert.match(host.text(), /2\. TEST Acme: not sent: you applied to them in the last 30 days/);
  assert.equal(host.buttons().length, 0, 'answered: no buttons left');
});

test('mount: a card whose hashes no longer match shows no Approve and calls nothing', async () => {
  const rpcs = [], d = doc(), host = d.createElement('div');
  const v = await C.mount(host, { intent: 'career_apply_card', card_id: CARD }, {
    document: d, from: db({ career_apply_cards: [card()], career_apply_prepared: prepared('c'.repeat(64)) }, []), rpc: async (...a) => { rpcs.push(a); return { data: [], error: null }; },
  });
  assert.equal(v.ok, false);
  assert.equal(host.buttons().length, 0);
  assert.match(host.text(), /Changed since this card was shown/);
  assert.equal(rpcs.length, 0);
});

test('mount: a stale card (over 10 minutes) says so; nothing approved', async () => {
  const d = doc(), host = d.createElement('div');
  await C.mount(host, { intent: 'career_apply_card', card_id: CARD }, {
    document: d, from: db({ career_apply_cards: [card()], career_apply_prepared: prepared() }, []),
    rpc: async () => ({ data: null, error: { message: 'card_stale' } }),
  });
  await host.buttons().find((b) => b.textContent === 'Approve all 2').onclick();
  assert.match(host.text(), /more than 10 minutes ago, so nothing was approved/);
});

test('the web app mounts it under every chat reply, live and from history, and the build carries the module', () => {
  const tpl = fs.readFileSync(path.join(root, 'src/upmore-app-template.html'), 'utf8');
  assert.match(tpl, /<!--__CAREER_APPLY_CARD__-->/);
  assert.match(tpl, /renderCareerApplyCard\(m, meta, chatRequests\.capture\(\)\);/, 'history bubbles');
  assert.match(tpl, /renderCareerApplyCard\(m, messageMeta, ticket\);/, 'live replies');
  const built = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(built.includes(fs.readFileSync(path.join(root, 'src/career-apply-card.js'), 'utf8').trim()), 'index.html is built with the module');
});
