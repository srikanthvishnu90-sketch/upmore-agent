// FEATURE 15 (2026-10-25): the Trainee dashboard's views, reads and approval wiring, without a browser.
// Check: node --test tests/career-dashboard.test.cjs. Synthetic rows only; no service is contacted.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const D = require(path.join(root, 'src/career-dashboard.js'));

const OWNER = '11111111-1111-4111-8111-111111111111';
const NOW = Date.parse('2026-10-25T16:00:00.000Z');
const prefs = { on: true, keywords: ['data analyst'], locations: ['Chicago'], remote_ok: true };
const posting = (job_id, title, location, extra = {}) => ({ job_id, company: 'Invented Co ' + job_id.slice(-1), title, location, url: 'https://example.test/' + encodeURIComponent(job_id), remote: null, closed_at: null, ...extra });

test('the state vocabulary is the career_apply_jobs check constraint, in order', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261020000001_career_apply_jobs.sql'), 'utf8');
  const listed = sql.match(/check\(state in \(([^)]*)\)\)/)[1].split(',').map(s => s.trim().replace(/'/g, ''));
  assert.deepEqual(D.APPLY_STATES.map(s => s.state), listed);
});

test('fit verdicts say only what the person\'s targets and the posting say', () => {
  const fits = D.fitVerdict(posting('greenhouse:a:1', 'Senior Data Analyst', 'Chicago, IL'), prefs);
  assert.equal(fits.verdict, 'fits');
  assert.deepEqual(fits.reasons, ['Title names “data analyst”, one of your target roles', 'Location Chicago, IL is in your list (Chicago)']);
  assert.equal(D.fitVerdict(posting('lever:a:2', 'Data Analyst', 'Remote - US', { remote: 'remote' }), prefs).verdict, 'fits');
  const partial = D.fitVerdict(posting('lever:a:3', 'Data Analyst', 'Austin, TX'), prefs);
  assert.equal(partial.verdict, 'partial');
  assert.match(partial.reasons[1], /not one you listed \(Chicago\)/);
  assert.equal(D.fitVerdict(posting('ashby:a:4', 'Software Engineer', 'Chicago'), prefs).verdict, 'weak');
  const none = D.fitVerdict(posting('ashby:a:5', 'Data Analyst', 'Chicago'), null);
  assert.equal(none.verdict, 'unchecked');
  assert.deepEqual(none.reasons, []);
});

test('matches: newest first, one per posting, a missing posting counted and named, applied state carried', () => {
  const alerts = [
    { key: 'alert:greenhouse:a:1', created_at: '2026-10-25T10:00:00Z' },
    { key: 'alert:lever:a:3', created_at: '2026-10-25T12:00:00Z' },
    { key: 'alert:smartrecruiters:a:9', created_at: '2026-10-25T11:00:00Z' },
    { key: 'alert:greenhouse:a:1', created_at: '2026-10-25T09:00:00Z' },
    { key: 'report:2026-10-25', created_at: '2026-10-25T13:00:00Z' },
  ];
  const v = D.matchesView(alerts, [posting('greenhouse:a:1', 'Data Analyst', 'Chicago'), posting('lever:a:3', 'Data Analyst', 'Austin')], prefs,
    [{ job_id: 'greenhouse:a:1', state: 'queued' }]);
  assert.deepEqual(v.rows.map(r => r.job_id), ['lever:a:3', 'greenhouse:a:1']);
  assert.deepEqual(v.missing, [{ job_id: 'smartrecruiters:a:9', reason: 'The posting is no longer on file' }]);
  assert.deepEqual(v.coverage, { onFile: '2/3', fitChecked: '2/2' });
  assert.equal(v.rows[1].applied, 'Queued to send');
  assert.equal(v.rows[0].provider, 'lever');
});

function v1Card(id, jobId, { approved = false, expires = NOW + 3600000 } = {}) {
  const entry = { version: 1, kind: 'agent-batch', jobId, company: 'Invented ' + jobId, url: 'https://example.test/' + jobId,
    answers: [{ name: 'why', label: 'Why us?', value: 'x', shown: 'x', kind: 'text', factId: 'F-1', file: null }],
    blank: ['Website'], ledger: [{ application_id: jobId, field_id: 'why', question_hash: 'a'.repeat(64), answer_hash: 'a'.repeat(64), fact_refs: ['F-1'], source_refs: ['s'], confirmation_event_id: 'ev-1', derivation_rule: 'verbatim' }],
    question_set_hash: 'a'.repeat(64), manifest_hash: 'a'.repeat(64), quarantine_version: 'd007-v1' };
  return { id, thread_id: '33333333-3333-4333-8333-333333333333', payload: { version: 1, items: [{ entry, hash: 'b'.repeat(64) }] }, payload_hash: 'c'.repeat(64),
    shown_at: new Date(NOW - 60000).toISOString(), expires_at: new Date(expires).toISOString(),
    approved_at: approved ? new Date(NOW - 30000).toISOString() : null, approval_expires_at: approved ? new Date(NOW + 86370000).toISOString() : null };
}
function v2Card(id, jobId, fields) {
  return { id, thread_id: '33333333-3333-4333-8333-333333333333', shown_at: new Date(NOW - 60000).toISOString(), expires_at: new Date(NOW + 3600000).toISOString(), approved_at: null,
    payload: { version: 2, execution_mode: 'cloud', items: [{ payload: { job_id: jobId, company: 'Cloud Co', url: 'https://example.test/c', fields }, readback: { blank: [] }, hash: 'd'.repeat(64) }] } };
}

test('queue: awaiting, approved, expired and reviewed; verification counted per answer', () => {
  const unverified = v2Card('55555555-5555-4555-8555-555555555555', 'greenhouse:c:1', [
    { name: 'email', label: 'Email', value: 'a@b.test', factId: 'F-2', confirmation_event_id: 'ev-2' },
    { name: 'phone', label: 'Phone', value: '555', factId: 'F-3' }]);
  const cards = [v1Card('44444444-4444-4444-8444-444444444444', 'job-a'), unverified,
    v1Card('66666666-6666-4666-8666-666666666666', 'job-b', { approved: true }),
    v1Card('77777777-7777-4777-8777-777777777777', 'job-c', { expires: NOW - 1 })];
  const prepared = [{ id: 'p1', job_id: 'job-a', state: 'ready' }, { id: 'p2', job_id: 'job-d', state: 'shown', updated_at: '2026-10-25T10:00:00Z' }, { id: 'p3', job_id: 'job-e', state: 'declined' }];
  const q = D.queueView(cards, prepared, [{ id: 'j1', job_id: 'job-b', state: 'queued' }, { id: 'j2', job_id: 'job-x', state: 'confirmed' }], NOW);
  assert.deepEqual(q.awaiting.map(r => r.card.id).sort(), ['44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555']);
  assert.equal(q.awaiting.find(r => r.card === unverified).verified, '1/2');
  assert.deepEqual(D.cardItems(unverified)[0].fields.map(f => f.verified), [true, false]);
  assert.equal(q.awaiting.find(r => r.card !== unverified).verified, '1/1');
  assert.deepEqual(q.approved.map(r => r.card.id), ['66666666-6666-4666-8666-666666666666']);
  assert.deepEqual(q.expired.map(r => r.card.id), ['77777777-7777-4777-8777-777777777777']);
  assert.deepEqual(q.reviewed.map(p => p.id), ['p2'], 'a prepared application already on an open card is not listed twice');
  assert.deepEqual(q.sending.map(j => j.id), ['j1']);
});

test('tracker: every application with its recorded state; a receipt only where the employer email confirmed it', () => {
  const rows = [
    { id: 'r1', job_id: 'g:1', company: 'A', url: 'https://a.test', state: 'confirmed', email_confirmed_at: '2026-10-24T10:00:00Z', confirmation_id: 'CONF-1', payload_hash: 'e'.repeat(64), updated_at: '2026-10-24T10:00:00Z' },
    { id: 'r2', job_id: 'g:2', company: 'B', url: 'https://b.test', state: 'confirmed', email_confirmed_at: null, payload_hash: 'f'.repeat(64) },
    { id: 'r3', job_id: 'g:3', company: 'C', url: 'https://c.test', state: 'failed', reason: 'The form asked for a portfolio link we do not have' },
  ];
  const t = D.trackerView(rows);
  assert.deepEqual(t.rows.map(r => r.id), ['r1', 'r2', 'r3']);
  assert.deepEqual(t.rows[0].receipt, { company: 'A', job_id: 'g:1', confirmation_number: 'CONF-1', payload_hash: 'e'.repeat(64), confirmed_at: '2026-10-24T10:00:00Z' });
  assert.equal(t.rows[1].receipt, null);
  assert.equal(t.rows[2].reason, 'The form asked for a portfolio link we do not have');
  assert.deepEqual(t.coverage, { confirmed: '1/3' });
  assert.throws(() => D.trackerView([{ id: 'x', state: 'sent' }]), /unknown apply state/);
});

test('setup messages are the person\'s own words in the phrasing the live handler files', () => {
  assert.deepEqual(D.setupMessages({ resume: '  Jane\nSQL ', roles: 'Data analyst, financial analyst', place: 'Chicago' }),
    { resume: 'Here’s my resume:\nJane\nSQL', watch: 'Watch for Data analyst, financial analyst roles in Chicago' });
  assert.deepEqual(D.setupMessages({ resume: ' ', roles: '' }), { resume: null, watch: null });
});

test('load reads only the signed-in person\'s rows from the existing tables', async () => {
  const calls = [];
  const rows = {
    career_outbox: [{ key: 'alert:greenhouse:a:1', created_at: '2026-10-25T10:00:00Z' }],
    career_alert_prefs: [{ prefs }],
    career_apply_message_cards: [v1Card('44444444-4444-4444-8444-444444444444', 'job-a')],
    career_apply_prepared: [], career_apply_jobs: [],
    career_postings: [posting('greenhouse:a:1', 'Data Analyst', 'Chicago')],
  };
  const client = { from(table) {
    const q = { table, ops: [] }; calls.push(q);
    const chain = new Proxy({}, { get(_, op) {
      if (op === 'then') return (res, rej) => Promise.resolve({ data: rows[table], error: null }).then(res, rej);
      return (...args) => { q.ops.push([op, ...args]); return chain; };
    } });
    return chain;
  } };
  const data = await D.load(client, OWNER);
  assert.deepEqual(calls.map(c => c.table), ['career_outbox', 'career_alert_prefs', 'career_apply_message_cards', 'career_apply_prepared', 'career_apply_jobs', 'career_postings']);
  for (const c of calls.slice(0, 5)) assert.ok(c.ops.some(o => o[0] === 'eq' && o[1] === 'user_id' && o[2] === OWNER), c.table + ' is filtered to the person');
  assert.deepEqual(calls[5].ops.find(o => o[0] === 'in'), ['in', 'job_id', ['greenhouse:a:1', 'job-a']]);
  assert.deepEqual(data.prefs, prefs);
  await assert.rejects(D.load(client, 'not-a-uuid'), /sign in/);
});

test('the dashboard approves through the chat card\'s own RPCs with the same arguments', async () => {
  const template = fs.readFileSync(path.join(root, 'src/upmore-app-template.html'), 'utf8');
  const chat = template.slice(template.indexOf('const careerApprovalCards ='), template.indexOf('function renderCareerApproval('));
  assert.match(chat, /supa\.rpc\('career_apply_message_card_approve_own', \{ p_card: card_id, p_hash: card_hash \}\)/);
  assert.match(chat, /supa\.rpc\('career_apply_message_card_read_own', \{ p_card: cardId \}\)/);
  assert.match(chat, /supa\.rpc\('career_apply_message_cloud_enabled_own'\)/);
  assert.deepEqual(D.RPC, { cloudEnabled: 'career_apply_message_cloud_enabled_own', read: 'career_apply_message_card_read_own', approve: 'career_apply_message_card_approve_own' });
  // The mounter hands exactly those calls to the host's rpc and binds the controller to the card's own thread.
  const seen = [];
  let options;
  const Cards = { createController(o) { options = o; return { mount: async () => 'mounted' } } };
  const mount = D.cardMounter({ Cards, rpc: async (name, args) => { seen.push([name, args]); return { data: name.endsWith('enabled_own') ? true : { ok: 1 }, error: null }; }, identity: () => OWNER, authenticate: async () => OWNER });
  assert.equal(await mount({ ownerDocument: {} }, { id: 'card-1', thread_id: 'thread-9' }), 'mounted');
  assert.equal(options.thread(), 'thread-9');
  await options.cloudEnabled(); await options.readCard('card-1'); await options.approve({ card_id: 'card-1', card_hash: 'h'.repeat(64) });
  assert.deepEqual(seen, [['career_apply_message_cloud_enabled_own', undefined], ['career_apply_message_card_read_own', { p_card: 'card-1' }],
    ['career_apply_message_card_approve_own', { p_card: 'card-1', p_hash: 'h'.repeat(64) }]]);
  const failing = D.cardMounter({ Cards, rpc: async () => ({ data: null, error: Error('denied') }) });
  await failing({ ownerDocument: {} }, { id: 'c', thread_id: 't' });
  await assert.rejects(options.approve({ card_id: 'c', card_hash: 'x' }), /denied/);
});

test('one build: the dashboard and its styles are inlined by src/build-app.py into the published app', () => {
  const build = fs.readFileSync(path.join(root, 'src/build-app.py'), 'utf8');
  assert.match(build, /'\/\*__CAREER_DASHBOARD__\*\/', 'career-dashboard\.js', False/);
  assert.match(build, /'\/\*__CAREER_DASHBOARD_CSS__\*\/', 'career-dashboard\.css', False/);
  const published = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(published.includes(fs.readFileSync(path.join(root, 'src/career-dashboard.js'), 'utf8')), 'index.html carries the current dashboard module (rebuild with python3 src/build-app.py)');
  assert.ok(published.includes('id="careerDash"'));
});
