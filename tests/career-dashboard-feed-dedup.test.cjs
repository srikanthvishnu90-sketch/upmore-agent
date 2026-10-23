// Coordinator frontend review 2026-10-23, ITEM 6 — F1 feed dedup.
// A confirmed row produced TWO identical "Confirmed by the employer" feed
// lines: feedView emitted the generic finish event (state confirmed, at
// updated_at) AND the email-confirmed event (at email_confirmed_at). They
// are the same real-world event: career_apply_confirm_as (migration
// 20261021075000_career_apply_ops.sql) writes state='confirmed',
// email_confirmed_at and updated_at in ONE statement, and a row reaches
// confirmed ONLY via the employer's confirmation email. The person must see
// exactly ONE confirmation entry per confirmed row — the email event, whose
// timestamp is the real-world moment. A confirmed row without an email
// timestamp (not producible by the real write path) must still show exactly
// one entry, from the finish event — never zero, never two.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let JSDOM;
try { ({ JSDOM } = require(path.resolve(__dirname, '../packages/extension/tools/node_modules/jsdom'))); }
catch (e) { ({ JSDOM } = require('jsdom')); }
const Dash = require('../src/career-dashboard.js');

const SHA = 'b'.repeat(64);
function confirmedRow(over = {}) {
  return Object.assign({
    id: 'c1', user_id: 'user-test-1', job_id: 'job-test-9', company: 'Northwind Test Labs',
    url: 'https://postings.northwind.invalid/jobs/9',
    payload: { version: '1', job_id: 'job-test-9' }, payload_hash: SHA,
    state: 'confirmed', reason: null, confirmation_id: 'CONF-TEST-1', attempts: 1,
    claimed_at: '2026-10-23T08:05:00.000Z',
    created_at: '2026-10-23T08:00:00.000Z', updated_at: '2026-10-23T09:00:00.000Z',
    evidence: {}, source: null,
    email_confirmed_at: '2026-10-23T09:00:00.000Z', confirmation_mail_hash: SHA,
  }, over);
}
const confirmations = (row) => Dash.feedView([row], [])
  .filter(e => e.kind === 'apply-event' && e.text.endsWith(Dash.STATE_LABELS.confirmed));

test('a confirmed row yields exactly ONE confirmation entry — the email event', () => {
  const events = confirmations(confirmedRow());
  assert.equal(events.length, 1, `expected 1 confirmation entry, got ${events.length}`);
  assert.equal(events[0].at, '2026-10-23T09:00:00.000Z', 'the kept entry is stamped at email_confirmed_at, the real-world moment');
  assert.equal(events[0].state, 'confirmed');
});

test('same when the two write timestamps differ (confirm write, then a later row touch)', () => {
  const events = confirmations(confirmedRow({ updated_at: '2026-10-23T10:30:00.000Z' }));
  assert.equal(events.length, 1, 'a later updated_at must not resurrect a second confirmation line');
  assert.equal(events[0].at, '2026-10-23T09:00:00.000Z');
});

test('control: a confirmed row WITHOUT an email timestamp still shows exactly one entry', () => {
  const events = confirmations(confirmedRow({ email_confirmed_at: null, confirmation_mail_hash: null, confirmation_id: null }));
  assert.equal(events.length, 1, 'never zero: the finish event remains the single record of the state');
  assert.equal(events[0].at, '2026-10-23T09:00:00.000Z', 'stamped at updated_at when no email timestamp exists');
});

test('control: two confirmed rows show one confirmation entry EACH (no cross-row dedup)', () => {
  const a = confirmedRow();
  const b = confirmedRow({ id: 'c2', job_id: 'job-test-7', company: 'Contoso Test Systems' });
  const all = Dash.feedView([a, b], []).filter(e => e.kind === 'apply-event' && e.text.endsWith(Dash.STATE_LABELS.confirmed));
  assert.equal(all.length, 2);
  assert.deepEqual(all.map(e => e.row_id).sort(), ['c1', 'c2']);
});

test('rendered feed (jsdom): the person sees one "Confirmed by the employer" line', () => {
  const d = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  global.document = d.window.document;
  try {
    const root = d.window.document.createElement('main');
    d.window.document.body.appendChild(root);
    Dash.mount(root, { jobs: [confirmedRow()], prepared: [], outcomes: [] }, {});
    const lines = [...root.querySelectorAll('.f1-feed-item')].map(li => li.textContent);
    const hits = lines.filter(t => t.includes('Confirmed by the employer'));
    assert.equal(hits.length, 1, `expected exactly one visible confirmation line, saw: ${JSON.stringify(lines)}`);
  } finally {
    delete global.document;
  }
});
