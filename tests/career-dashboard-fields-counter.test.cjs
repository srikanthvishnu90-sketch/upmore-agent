// F1 dashboard — the "Fields filled" header counter must never present 0/0 when
// field-fill telemetry is absent. The telemetry's data source is each
// career_apply_jobs row's payload.fields list (the prepared payload carries one
// entry per form field, with its value). A row whose payload carries no fields
// list has NO field-fill telemetry: the dashboard may not invent a 0/0 beside
// it — least of all beside a confirmed application, where 0/0 reads as "the
// employer confirmed an application with zero fields filled". Absence renders
// as a dash; rows WITH telemetry keep showing the real covered/total count.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
let JSDOM;
try { ({ JSDOM } = require(path.resolve(__dirname, '../packages/extension/tools/node_modules/jsdom'))); }
catch (e) { ({ JSDOM } = require('jsdom')); }
const Dash = require('../src/career-dashboard.js');
const SHA = 'b'.repeat(64);

function row(over = {}) {
  return Object.assign({
    id: 'row-1', user_id: 'user-1', job_id: 'job-1', company: 'Acme Corp',
    url: 'https://example.test/jobs/1',
    payload: { version: '1', job_id: 'job-1', company: 'Acme Corp', url: 'https://example.test/jobs/1' },
    payload_hash: SHA, approval_hash: SHA, state: 'queued', reason: null,
    confirmation_id: null, attempts: 0, claimed_at: null,
    created_at: '2026-10-22T10:00:00.000Z', updated_at: '2026-10-22T10:00:00.000Z',
    evidence: {}, source: null, email_confirmed_at: null, confirmation_mail_hash: null,
  }, over);
}
function mountRoot(document, jobs) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  Dash.mount(root, { jobs, prepared: [], outcomes: [] });
  return root;
}
function dom() {
  const d = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  return d.window.document;
}

test('a confirmed row WITHOUT field telemetry never renders "Fields filled 0/0"', () => {
  const document = dom();
  const confirmedNoTelemetry = row({
    id: 'c1', state: 'confirmed', confirmation_id: 'CONF-1',
    email_confirmed_at: '2026-10-22T11:00:00.000Z', confirmation_mail_hash: SHA,
  }); // payload carries no fields list at all
  const drivingNoTelemetry = row({ id: 'd1', job_id: 'job-2', state: 'driving', payload: null, claimed_at: '2026-10-22T10:05:00.000Z' });
  const root = mountRoot(document, [confirmedNoTelemetry, drivingNoTelemetry]);
  const line = root.querySelector('.f1-coverage');
  assert.ok(line, 'coverage line rendered');
  assert.ok(!line.textContent.includes('Fields filled 0/0'),
    'absent telemetry must not render as 0/0; got: ' + line.textContent);
  assert.ok(!line.textContent.includes('0/0'),
    'no 0/0 anywhere on the header for telemetry-free rows; got: ' + line.textContent);
  assert.match(line.textContent, /Fields filled\s+—/,
    'absent telemetry renders a dash; got: ' + line.textContent);
});

test('rows WITH field telemetry keep showing the real filled count', () => {
  const document = dom();
  const withTelemetry = row({
    id: 't1', state: 'confirmed', confirmation_id: 'CONF-2',
    email_confirmed_at: '2026-10-22T11:00:00.000Z', confirmation_mail_hash: SHA,
    payload: { version: '1', job_id: 'job-1', fields: [
      { name: 'first_name', value: 'TEST', factId: 'F-001' },
      { name: 'email', value: '', factId: 'F-002' },
    ] },
  });
  const root = mountRoot(document, [withTelemetry]);
  const line = root.querySelector('.f1-coverage');
  assert.ok(line.textContent.includes('Fields filled 1/2'),
    'real telemetry shows the real count; got: ' + line.textContent);
});

test('mixed rows: telemetry from the rows that carry it, never a dash and never 0/0', () => {
  const document = dom();
  const withTelemetry = row({
    id: 't1',
    payload: { version: '1', job_id: 'job-1', fields: [
      { name: 'first_name', value: 'TEST', factId: 'F-001' },
      { name: 'email', value: 'a@b.test', factId: 'F-002' },
    ] },
  });
  const confirmedNoTelemetry = row({
    id: 'c1', job_id: 'job-2', state: 'confirmed', confirmation_id: 'CONF-3',
    email_confirmed_at: '2026-10-22T11:00:00.000Z', confirmation_mail_hash: SHA,
  });
  const root = mountRoot(document, [withTelemetry, confirmedNoTelemetry]);
  const line = root.querySelector('.f1-coverage');
  assert.ok(line.textContent.includes('Fields filled 2/2'),
    'the telemetry-bearing row drives the count; got: ' + line.textContent);
  assert.ok(!/Fields filled\s+—/.test(line.textContent), 'telemetry present: no dash');
});
