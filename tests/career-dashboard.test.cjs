// F1 dashboard — pure view-model truth tests (Trainee builder plan 2026-10-22, item F1).
// Every state the dashboard shows must be a state the record can actually be in
// (the career_apply_jobs check constraint is the source of truth, parsed here from
// the migration itself), every fraction stays covered/total unreduced, every batch
// outcome comes back exactly once with its reason, and a receipt exists only for an
// email-confirmed row, byte-bound to that row.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const Dash = require('../src/career-dashboard.js');

const MIGRATION = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20261020000001_career_apply_jobs.sql'), 'utf8');
const DB_STATES = /state in \('([^']+)','([^']+)','([^']+)','([^']+)','([^']+)','([^']+)','([^']+)','([^']+)'\)/.exec(MIGRATION)
  .slice(1);
const SHA = 'b'.repeat(64);

function row(over = {}) {
  return Object.assign({
    id: 'row-1', user_id: 'user-1', job_id: 'job-1', company: 'Acme Corp',
    url: 'https://example.test/jobs/1',
    payload: { version: '1', job_id: 'job-1', company: 'Acme Corp', url: 'https://example.test/jobs/1',
      fields: [ { name: 'first_name', value: 'TEST', factId: 'F-001' }, { name: 'email', value: '', factId: 'F-002' } ] },
    payload_hash: SHA, approval_hash: SHA, state: 'queued', reason: null,
    confirmation_id: null, attempts: 0, claimed_at: null,
    created_at: '2026-10-22T10:00:00.000Z', updated_at: '2026-10-22T10:00:00.000Z',
    evidence: {}, source: null, email_confirmed_at: null, confirmation_mail_hash: null,
  }, over);
}

test('state vocabulary is exactly the career_apply_jobs check constraint, each with a label', () => {
  assert.deepEqual(Dash.APPLY_STATES.map(s => s.state), DB_STATES);
  for (const s of Dash.APPLY_STATES) assert.ok(typeof s.label === 'string' && s.label.length > 0, s.state);
  // One shared place for the words: the label map is derived from the same list.
  for (const s of Dash.APPLY_STATES) assert.equal(Dash.STATE_LABELS[s.state], s.label);
});

test('an out-of-vocabulary state is refused, never given an invented label', () => {
  assert.throws(() => Dash.queueView([row({ state: 'bogus' })]), /unknown apply state/);
  assert.throws(() => Dash.trackerView([row({ state: 'sent-ish' })]), /unknown apply state/);
  assert.throws(() => Dash.feedView([row({ state: '' })], []), /unknown apply state/);
});

test('lifecycle walk: queue, tracker and feed agree at every recorded state', () => {
  const r = row();
  const stages = [
    { state: 'queued' },
    { state: 'driving', attempts: 1, claimed_at: '2026-10-22T10:05:00.000Z' },
    { state: 'submitted_unconfirmed', updated_at: '2026-10-22T10:09:00.000Z', evidence: { page_confirmation: true } },
    { state: 'confirmed', confirmation_id: 'CONF-123', email_confirmed_at: '2026-10-22T11:00:00.000Z', confirmation_mail_hash: SHA },
  ];
  for (const patch of stages) {
    Object.assign(r, patch);
    const inQueue = Dash.queueView([r]).items.some(i => i.row.id === r.id);
    const inFlight = ['queued', 'driving', 'needs_user'].includes(r.state);
    assert.equal(inQueue, inFlight, `queue membership at ${r.state}`);
    const tracked = Dash.trackerView([r]).rows[0];
    assert.equal(tracked.state, r.state);
    assert.equal(tracked.label, Dash.STATE_LABELS[r.state]);
    const latest = Dash.feedView([r], [])[0];
    assert.equal(latest.state, r.state, `feed head at ${r.state}`);
    if (r.state !== 'confirmed') assert.equal(tracked.receipt, null, `no receipt at ${r.state}`);
  }
  const receipt = Dash.trackerView([r]).rows[0].receipt;
  assert.ok(receipt, 'receipt once confirmed by email');
  assert.equal(receipt.company, r.company);
  assert.equal(receipt.job_id, r.job_id);
  assert.equal(receipt.confirmation_number, 'CONF-123');
  assert.equal(receipt.payload_hash, SHA);
  assert.equal(receipt.confirmed_at, '2026-10-22T11:00:00.000Z');
});

test('no receipt without the employer email: page-only and unconfirmed rows earn none', () => {
  const pageOnly = row({ state: 'submitted_unconfirmed', evidence: { page_confirmation: true } });
  assert.equal(Dash.receiptFor(pageOnly), null);
  const confirmedNoMail = row({ state: 'confirmed', confirmation_id: 'CONF-9' }); // email_confirmed_at null
  assert.equal(Dash.receiptFor(confirmedNoMail), null);
  const notSubmitted = row({ state: 'not_submitted', reason: 'stopped before submit' });
  assert.equal(Dash.receiptFor(notSubmitted), null);
});

test('receipt is byte-bound: changing a source field changes the receipt, nothing is reformatted', () => {
  const base = row({ state: 'confirmed', confirmation_id: 'CONF-123', email_confirmed_at: '2026-10-22T11:00:00.000Z', confirmation_mail_hash: SHA });
  const a = Dash.receiptFor(base);
  const b = Dash.receiptFor(Object.assign({}, base, { confirmation_id: 'CONF-124' }));
  assert.equal(a.confirmation_number, 'CONF-123');
  assert.equal(b.confirmation_number, 'CONF-124');
  assert.equal(a.payload_hash, base.payload_hash); // full 64 chars, never truncated
  assert.equal(a.payload_hash.length, 64);
});

test('coverage fractions are covered/total, never reduced, never a bare percentage, 0/0 when empty', () => {
  assert.deepEqual(Dash.coverage([]), { prepared: '0/0', filled: '0/0', confirmed: '0/0' });
  const rows = [
    row({ id: 'a', job_id: 'a' }), // payload fields 2, filled 1
    row({ id: 'b', job_id: 'b', payload: { fields: [ { name: 'x', value: 'v' }, { name: 'y', value: 'v' }, { name: 'z', value: 'v' } ] }, state: 'confirmed', confirmation_id: 'C', email_confirmed_at: '2026-10-22T11:00:00.000Z', confirmation_mail_hash: SHA }),
    row({ id: 'c', job_id: 'c', payload: {} }), // not prepared
  ];
  const cov = Dash.coverage(rows);
  assert.equal(cov.prepared, '2/3');
  assert.equal(cov.filled, '4/5');
  assert.equal(cov.confirmed, '1/3');
  // Unreduced: 30 of 60 stays 30/60.
  const sixty = Array.from({ length: 60 }, (_, i) => row({ id: 'r' + i, job_id: 'j' + i, state: i < 30 ? 'confirmed' : 'queued', confirmation_id: 'C' + i, email_confirmed_at: '2026-10-22T11:00:00.000Z', confirmation_mail_hash: SHA }));
  assert.equal(Dash.coverage(sixty).confirmed, '30/60');
  for (const v of Object.values(cov)) assert.ok(!v.includes('%') && !v.includes('.'), v);
});

test('queue partition: every row appears exactly once across queue and tracker-only, none lost', () => {
  const states = DB_STATES;
  const rows = states.map((s, i) => row({ id: 'id-' + s, job_id: 'job-' + s, state: s, reason: s === 'needs_user' ? 'Answer needed: work authorization?' : null }));
  const q = Dash.queueView(rows);
  const qIds = q.items.map(i => i.row.id);
  assert.equal(new Set(qIds).size, qIds.length, 'no duplicates in queue');
  assert.deepEqual(qIds.sort(), ['id-driving', 'id-needs_user', 'id-queued'].sort());
  const needsYou = q.items.find(i => i.row.state === 'needs_user');
  assert.equal(needsYou.row.reason, 'Answer needed: work authorization?'); // reason carried verbatim
  const trackerIds = Dash.trackerView(rows).rows.map(r => r.id).sort();
  assert.deepEqual(trackerIds, rows.map(r => r.id).sort(), 'tracker holds every row');
});

test('batch outcomes: each application returns exactly once, dropped ones with their reason', () => {
  const outcomes = [
    { job_id: 'j1', company: 'A', kept: true },
    { job_id: 'j2', company: 'B', kept: false, reason: 'company already applied within 30 days' },
    { job_id: 'j3', company: 'C', kept: false, reason: 'no verifiable posting URL' },
    { job_id: 'j4', company: 'D', kept: true },
  ];
  const feed = Dash.feedView([], outcomes);
  const batch = feed.filter(e => e.kind === 'batch-outcome');
  assert.equal(batch.length, 4);
  assert.deepEqual(batch.map(e => e.job_id).sort(), ['j1', 'j2', 'j3', 'j4']);
  for (const e of batch) {
    if (!e.kept) assert.ok(typeof e.reason === 'string' && e.reason.length > 0, e.job_id);
  }
  assert.equal(batch.find(e => e.job_id === 'j2').reason, 'company already applied within 30 days');
  // A dropped outcome without a reason is refused — an item may never just disappear.
  assert.throws(() => Dash.feedView([], [{ job_id: 'jx', company: 'X', kept: false }]), /reason/);
});

test('feed events use only timestamps the record carries (no invented times)', () => {
  const r = row({ state: 'queued' }); // claimed_at and email_confirmed_at are null
  const events = Dash.feedView([r], []).filter(e => e.kind === 'apply-event');
  assert.ok(events.length >= 1);
  for (const e of events) assert.ok(typeof e.at === 'string' && e.at.length > 0);
  assert.ok(!events.some(e => /confirm/i.test(e.text)), 'no confirmation event before it happened');
});
