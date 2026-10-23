// F1–F2 integration adapter — mapping proofs under jsdom.
// The adapter is the ONLY new logic in the integration: prepared row ->
// F2 review-card input, prepared row -> stored batch state, and the slot
// mount through TraineeDashboard.mountCards. Verification must come from
// the prepared field's own confirmation_event_id (175's v2 rule) — a field
// without one is unverified even when its value happens to be true.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
let JSDOM;
try { ({ JSDOM } = require(path.resolve(__dirname, '../packages/extension/tools/node_modules/jsdom'))); }
catch (e) { ({ JSDOM } = require('jsdom')); }
const Dash = require('../src/career-dashboard.js');
const Mount = require('../src/career-dashboard-f2-mount.js');
const Ui = require('../packages/domain/175-career-approval-ui.js');

const HASH = 'c1'.repeat(32);
function prepared(over = {}) {
  return Object.assign({
    id: 'prep-test-1', job_id: 'job-test-1', company: 'Northwind Test Labs',
    url: 'https://postings.northwind.invalid/jobs/1',
    payload: {
      version: '1', job_id: 'job-test-1', company: 'Northwind Test Labs',
      url: 'https://postings.northwind.invalid/jobs/1',
      fields: [
        { name: 'full_name', label: 'Full name', value: 'Test Person', factId: 'F-T1', confirmation_event_id: 'evt-test-1' },
        { name: 'school', label: 'School', value: 'Fictional State University', factId: 'F-T2' },
      ],
      blank: [],
    },
    payload_hash: HASH, state: 'ready',
    created_at: '2026-10-23T09:00:00.000Z', updated_at: '2026-10-23T09:00:00.000Z',
  }, over);
}

test('mapping: verification comes from the field\u2019s own confirmation event, never assumed', () => {
  const input = Mount.reviewInputFromPrepared(prepared());
  assert.equal(input.runId, 'prep-test-1');
  assert.equal(input.cardSha256, HASH);
  assert.equal(input.applications.length, 1);
  const app = input.applications[0];
  assert.equal(app.id, 'job-test-1');
  assert.equal(app.company, 'Northwind Test Labs');
  assert.deepEqual(app.fields.map(f => [f.name, f.verification]), [
    ['full_name', 'verified'],   // carries confirmation_event_id
    ['school', 'unverified'],    // no confirmation event — unverified even though the value is well-formed
  ]);
  const built = Ui.buildReviewCard(input);
  assert.equal(built.ok, true);
  assert.equal(built.card.applications[0].fields[1].verification, 'unverified');
});

test('stored batch state: one application at awaiting_attestation under the payload hash', () => {
  const st = Mount.batchStateFromPrepared(prepared());
  const norm = Ui.batchState(st);
  assert.equal(norm.runId, 'prep-test-1');
  assert.equal(norm.status, 'awaiting_approval');
  assert.equal(norm.cardSha256, HASH);
  assert.deepEqual(norm.postings.map(p => [p.postingKey, p.stage]), [['job-test-1', 'awaiting_attestation']]);
});

test('commitPrepared mints the record bound to the shown run + hash (175\u2019s mint, unchanged)', () => {
  const row = prepared();
  const built = Ui.buildReviewCard(Mount.reviewInputFromPrepared(row));
  const approved = Ui.approveAllPending(built.card);
  assert.equal(approved.ok, true);
  const res = Mount.commitPrepared(row, approved.card);
  assert.equal(res.ok, true);
  assert.equal(res.record.approvalRef, `batch:prep-test-1:${HASH}`);
  assert.equal(res.record.cardSha256, HASH);
  assert.deepEqual(Object.keys(res.record.approvals), ['job-test-1']);
  // An unreviewed card is refused by the seam, by name.
  const early = Mount.commitPrepared(row, built.card);
  assert.equal(early.ok, false);
  assert.equal(early.code, 'COMMIT_SET_INCOMPLETE');
});

test('mount: mountCards fills the slot with the wired F2 card', async () => {
  const d = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  global.document = d.window.document;
  try {
    const document = d.window.document;
    const root = document.createElement('div');
    document.body.appendChild(root);
    const seam = [];
    Dash.mount(root, { jobs: [], prepared: [prepared()], outcomes: [] }, {
      cards: { mountFn: Mount.createMountFn({ commit: (set, card, row) => { seam.push([set, row.id]); return Mount.commitPrepared(row, card); } }) },
    });
    const slotEl = root.querySelector('[data-f1-card-slot][data-prepared-id="prep-test-1"]');
    assert.ok(slotEl, 'slot rendered');
    const card = slotEl.querySelector('.f2-card');
    assert.ok(card, 'the F2 card is inside the slot');
    assert.equal(card.getAttribute('data-card-sha256'), HASH);
    assert.ok(card.textContent.includes('Fictional State University'));
    // Approve + commit through the wired controls (jsdom click path). The
    // card re-renders on every state change, so re-query after approving.
    card.querySelector('[data-f2-action="approve-app"]').click();
    const rerendered = slotEl.querySelector('.f2-card');
    rerendered.querySelector('[data-f2-action="commit"]').click();
    await new Promise(r => setImmediate(r)); // the card's commit handler is async; let it settle
    assert.equal(seam.length, 1);
    assert.equal(seam[0][1], 'prep-test-1');
    assert.deepEqual(seam[0][0].approved.map(a => a.id), ['job-test-1']);
    assert.match(slotEl.querySelector('.f2-status').textContent, /Approval recorded/);
  } finally {
    delete global.document;
  }
});
