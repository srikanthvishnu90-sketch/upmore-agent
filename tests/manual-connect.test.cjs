// Guided manual connect (owner addendum, 2026-10-11; decision 1: no password storage, session-only): the read-only lane
// for platforms with no API. packages/domain/78-manual-connect.js is the policy; packages/connectors/manual-playbooks.json
// holds the template and the first three playbooks (all unverified until a live run). Test-only values throughout.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const MC = require('../packages/domain/78-manual-connect.js');
const BC = require('../packages/domain/77-brokerage-connectors.js');
const PB = JSON.parse(fs.readFileSync(path.join(root, 'packages/connectors/manual-playbooks.json'), 'utf8'));
const rows = JSON.parse(fs.readFileSync(path.join(root, 'packages/connectors/platforms.json'), 'utf8')).platforms;
const NOW = Date.parse('2026-10-12T15:05:00Z');

test('the consent says exactly what happens, and nothing connects without a yes', () => {
  const t = MC.consentText('Fundrise').join(' ');
  for (const must of ['You log in yourself and do your own two-step check', 'never sees or keeps your password or any code', 'keeps only the encrypted session', 'Read-only: it never places an order, moves money or changes a setting', "terms may not allow automated access", 'Turn it off any time with one message']) assert.ok(t.includes(must), must);
  assert.deepEqual(MC.consentRecord('Fundrise', NOW, false), { ok: false, code: 'no_consent', text: 'Nothing was connected: Fundrise connects only after you agree.' });
  const r = MC.consentRecord('Fundrise', NOW, true);
  assert.equal(r.record.text, t, 'the exact words are recorded'); assert.equal(r.record.version, MC.CONSENT_VERSION); assert.equal(r.record.accepted_at, '2026-10-12T15:05:00.000Z');
});

test('read-only whatever is asked', () => {
  for (const v of MC.READ_VERBS) assert.equal(MC.allow(v).ok, true, v);
  for (const v of ['place_order', 'transfer', 'withdraw', 'change_setting', 'buy']) { const a = MC.allow(v); assert.equal(a.code, 'read_only', v); assert.match(a.text, /Nothing was done\.$/); }
});

test('session health: signed in, signed out (said once), a blip, then broken (said once); revoked stays revoked', () => {
  let s = null, r;
  r = MC.onCheck(s, { platform: 'Fundrise', signed_in: true }, NOW); s = r.session;
  assert.deepEqual([s.state, s.last_checked, r.message], ['connected', NOW, null]);
  assert.equal(MC.due(s, NOW + MC.HEALTH_EVERY_MS - 1), false); assert.equal(MC.due(s, NOW + MC.HEALTH_EVERY_MS), true);
  r = MC.onCheck(s, { platform: 'Fundrise', signed_out: true }, NOW + 1); s = r.session;
  assert.equal(s.state, 'needs_login'); assert.match(r.message, /^Fundrise signed you out/);
  assert.equal(MC.onCheck(s, { platform: 'Fundrise', signed_out: true }, NOW + 2).message, null, 'once, not every check');
  assert.equal(MC.due(s, NOW + 10 * MC.HEALTH_EVERY_MS), false, 'a signed-out session is not polled');
  r = MC.onCheck(null, { platform: 'Fundrise', signed_in: true }, NOW); s = r.session;
  r = MC.onCheck(s, { platform: 'Fundrise' }, NOW + 1); s = r.session;
  assert.deepEqual([s.state, r.message], ['connected', null], 'one failed load is a blip');
  r = MC.onCheck(s, { platform: 'Fundrise' }, NOW + 2); s = r.session;
  assert.equal(s.state, 'broken'); assert.match(r.message, /page changed.*Nothing was changed/);
  assert.equal(MC.onCheck(s, { platform: 'Fundrise' }, NOW + 3).message, null, 'broken is said once');
  assert.equal(MC.onCheck({ state: 'revoked' }, { platform: 'Fundrise', signed_in: true }, NOW).session.state, 'revoked');
});

test('the status line is honest: manual session and when it was last checked, or exactly why not', () => {
  const fmt = ms => new Date(ms).toISOString().slice(11, 16) + ' UTC';
  assert.equal(MC.statusLine('Cash App Investing', { state: 'connected', last_checked: NOW }, NOW, fmt), 'Cash App Investing: connected (manual session), last checked 15:05 UTC');
  assert.match(MC.statusLine('Cash App Investing', { state: 'connected', last_checked: NOW }, NOW + MC.STALE_MS + 1, fmt), /older than a day, so the numbers may be out of date$/);
  assert.equal(MC.statusLine('Cash App Investing', { state: 'needs_login', last_checked: NOW }, NOW, fmt), 'Cash App Investing: signed out - log in again to keep reading it (last read 15:05 UTC)');
  assert.equal(MC.statusLine('Cash App Investing', { state: 'broken' }, NOW, fmt), "Cash App Investing: can't be read right now (the page changed)");
  assert.equal(MC.statusLine('Cash App Investing', null, NOW), 'Cash App Investing: not connected');
});

test('no session, cookie, token, password or code survives into a log, however it is nested', () => {
  const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJ0ZXN0LXVzZXIifQ', 'c2lnbmF0dXJlLXRlc3Qtb25seQ'].join('.');
  const entry = { platform: 'Fundrise', state: 'connected', step: 'health', storage_state: { cookies: [{ name: 'sid', value: 'abc' }] }, headers: { Authorization: 'Bearer ' + 'x'.repeat(24) },
    note: `got ${jwt}`, raw: 'sid=' + 'a1'.repeat(12) + ';', password: 'test-only', otp: '000000', nested: [{ deeper: { session_token: 't' } }], last_checked: NOW };
  const s = MC.scrub(entry);
  const out = JSON.stringify(s);
  for (const bad of ['abc', 'Bearer', jwt, 'test-only', '000000', 'session_token', 'a1a1a1']) assert.ok(!out.includes(bad), bad);
  assert.deepEqual([s.platform, s.state, s.step, s.last_checked], ['Fundrise', 'connected', 'health', NOW], 'the useful parts stay');
  assert.equal(MC.leaks(entry), true); assert.equal(MC.leaks(s), false);
  assert.equal(MC.leaks({ platform: 'Fundrise', state: 'needs_login', last_checked: NOW }), false);
});

test('playbooks: the template and three filled examples are valid, read-only and honestly unverified; bad ones are caught', () => {
  assert.ok(Object.keys(PB.template).every(k => k in PB.playbooks[0] || ['notes'].includes(k)), 'examples follow the template');
  assert.equal(PB.playbooks.length, 3);
  for (const p of PB.playbooks) {
    assert.deepEqual(MC.validatePlaybook(p), [], p.platform_id);
    assert.equal(p.verified, false, `${p.platform_id}: unverified until a live run`);
    const row = rows.find(r => r.id === p.platform_id);
    assert.ok(row && row.route === 'browser_assisted' && BC.capability(row).trade === false, `${p.platform_id}: a browser-assisted, track-only row in the matrix`);
  }
  const good = PB.playbooks[1];
  const bad = (patch) => MC.validatePlaybook(Object.assign({}, good, patch)).join(' ');
  assert.match(bad({ steps: [{ kind: 'click', text: 'Invest now' }] }), /could change something; manual connect is read-only/);
  assert.match(bad({ login_url: 'http://fundrise.com/' }), /platform's own https page/);
  assert.match(bad({ reads: [{ field: 'password', page: 'https://fundrise.com/', labels: ['x'] }] }), /not balance, position or as_of/);
  assert.match(bad({ verified: true }), /names the live run/);
  assert.match(bad({ signed_out_when: [] }), /signed_out_when/);
  // Nothing in a playbook names a credential to type.
  assert.ok(!/"credential"|password"\s*:/i.test(JSON.stringify(PB)));
});

test('the design doc carries the decision, the flow and the acceptance still owed', () => {
  const d = fs.readFileSync(path.join(root, 'docs/connector-matrix/guided-manual-connect.md'), 'utf8');
  for (const must of ['no password storage, session-only', 'live window', 'connected (manual session), last checked', 'NOT VERIFIED', 'packages/connectors/manual-playbooks.json']) assert.ok(d.includes(must), must);
});
