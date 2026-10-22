// F1 dashboard — DOM proofs under jsdom (the same jsdom the extension-sync test loads:
// packages/extension/tools' pinned copy, installed by `npm ci --prefix packages/extension/tools`).
// A queue of 60 renders in ONE view; receipts sit inline in the tracker; the design
// tokens carry the plum as one token used on active states only; prepared queue items
// expose the marked F2 approval-card slot.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
let JSDOM;
try { ({ JSDOM } = require(path.resolve(__dirname, '../packages/extension/tools/node_modules/jsdom'))); }
catch (e) { ({ JSDOM } = require('jsdom')); }
const Dash = require('../src/career-dashboard.js');
const CSS = fs.readFileSync(path.resolve(__dirname, '../src/career-dashboard.css'), 'utf8');
const SHA = 'b'.repeat(64);

function row(over = {}) {
  return Object.assign({
    id: 'row-1', user_id: 'user-1', job_id: 'job-1', company: 'Acme Corp',
    url: 'https://example.test/jobs/1',
    payload: { version: '1', job_id: 'job-1', company: 'Acme Corp', url: 'https://example.test/jobs/1',
      fields: [ { name: 'first_name', value: 'TEST', factId: 'F-001' } ] },
    payload_hash: SHA, approval_hash: SHA, state: 'queued', reason: null,
    confirmation_id: null, attempts: 0, claimed_at: null,
    created_at: '2026-10-22T10:00:00.000Z', updated_at: '2026-10-22T10:00:00.000Z',
    evidence: {}, source: null, email_confirmed_at: null, confirmation_mail_hash: null,
  }, over);
}
function dom() {
  const d = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  return d.window.document;
}

test('a queue of 60 renders all 60 in ONE view — no pagination, nothing hidden', () => {
  const document = dom();
  const rows = Array.from({ length: 60 }, (_, i) => row({ id: 'id-' + i, job_id: 'job-' + i, company: 'Company ' + i }));
  const el = Dash.renderQueue(document, rows, []);
  assert.equal(el.querySelectorAll('[data-f1-queue-item]').length, 60);
  const views = el.querySelectorAll('[data-f1-single-view]');
  assert.equal(views.length, 1, 'exactly one view container holds the queue');
  assert.equal(views[0].querySelectorAll('[data-f1-queue-item]').length, 60);
  assert.equal(el.querySelectorAll('[class*="pagin"], [data-f1-page], button[name="next"], button[name="prev"]').length, 0);
  for (let i = 0; i < 60; i++) assert.ok(el.textContent.includes('job-' + i), 'job-' + i + ' rendered');
});

test('tracker renders the receipt INLINE on the confirmed row and nowhere else', () => {
  const document = dom();
  const confirmed = row({ id: 'c1', state: 'confirmed', confirmation_id: 'CONF-123', email_confirmed_at: '2026-10-22T11:00:00.000Z', confirmation_mail_hash: SHA });
  const unconfirmed = row({ id: 'u1', job_id: 'job-2', state: 'submitted_unconfirmed', evidence: { page_confirmation: true } });
  const el = Dash.renderTracker(document, [confirmed, unconfirmed]);
  const items = el.querySelectorAll('[data-f1-tracker-item]');
  assert.equal(items.length, 2);
  const cItem = el.querySelector('[data-f1-tracker-item="c1"]');
  const receipt = cItem.querySelector('[data-f1-receipt]');
  assert.ok(receipt, 'receipt inside the confirmed tracker item');
  assert.ok(receipt.textContent.includes('Acme Corp'));
  assert.ok(receipt.textContent.includes('job-1'));
  assert.ok(receipt.textContent.includes('CONF-123'));
  assert.ok(receipt.textContent.includes(SHA));
  assert.ok(receipt.textContent.includes('2026-10-22T11:00:00.000Z'));
  const uItem = el.querySelector('[data-f1-tracker-item="u1"]');
  assert.equal(uItem.querySelector('[data-f1-receipt]'), null, 'no receipt on an unconfirmed row');
});

test('record text is rendered as text, never as markup', () => {
  const document = dom();
  const evil = row({ company: '<img src=x onerror=alert(1)>' });
  const el = Dash.renderTracker(document, [evil]);
  assert.equal(el.querySelectorAll('img').length, 0);
  assert.ok(el.textContent.includes('<img src=x onerror=alert(1)>'));
});

test('prepared items awaiting approval expose the marked F2 card slot; mountCards delegates per slot', () => {
  const document = dom();
  const prepared = [
    { id: 'prep-1', job_id: 'job-9', company: 'Beta LLC', url: 'https://example.test/9', payload: { fields: [] }, payload_hash: SHA, state: 'ready', created_at: '2026-10-22T09:00:00.000Z', updated_at: '2026-10-22T09:00:00.000Z' },
    { id: 'prep-2', job_id: 'job-10', company: 'Gamma Inc', url: 'https://example.test/10', payload: { fields: [] }, payload_hash: SHA, state: 'shown', created_at: '2026-10-22T09:01:00.000Z', updated_at: '2026-10-22T09:01:00.000Z' },
    { id: 'prep-3', job_id: 'job-11', company: 'Delta Co', url: 'https://example.test/11', payload: { fields: [] }, payload_hash: SHA, state: 'approved', created_at: '2026-10-22T09:02:00.000Z', updated_at: '2026-10-22T09:02:00.000Z' },
  ];
  const el = Dash.renderQueue(document, [], prepared);
  const slots = el.querySelectorAll('[data-f1-card-slot]');
  assert.equal(slots.length, 2, 'ready + shown get slots; approved no longer awaits approval');
  assert.deepEqual([...slots].map(s => s.getAttribute('data-prepared-id')).sort(), ['prep-1', 'prep-2']);
  const seen = [];
  Dash.mountCards(el, (slot, preparedRow) => seen.push([slot, preparedRow.id]));
  assert.deepEqual(seen.map(s => s[1]).sort(), ['prep-1', 'prep-2']);
  assert.ok(seen.every(([slot]) => slot.hasAttribute('data-f1-card-slot')));
});

test('design tokens: plum is one token, and the accent appears only on active-state rules', () => {
  const defs = CSS.match(/--accent-plum\s*:/g) || [];
  assert.equal(defs.length, 1, 'exactly one --accent-plum token definition');
  assert.ok(/--accent-plum:\s*#[0-9A-Fa-f]{6}/.test(CSS));
  assert.ok(/--accent-plum-light:\s*#A58FB8/i.test(CSS), 'light plum token present');
  assert.ok(/--graphite:\s*#1E1F24/i.test(CSS), 'graphite token present');
  // Every rule that paints with the plum token must be scoped to an active state.
  const rules = CSS.split('}').map(r => r.trim()).filter(Boolean);
  const plumRules = rules.filter(r => r.includes('var(--accent-plum)'));
  assert.ok(plumRules.length > 0, 'the accent is actually used');
  for (const r of plumRules) {
    const selector = r.split('{')[0];
    assert.ok(/aria-selected="true"|\.is-active|:active|\[data-active/.test(selector), 'plum outside an active state: ' + selector.trim());
  }
  assert.ok(/font-family:[^;}]*serif/.test(CSS), 'a serif is declared for headers');
  assert.ok(/font-family:[^;}]*Inter/.test(CSS), 'Inter is declared for body text');
});
