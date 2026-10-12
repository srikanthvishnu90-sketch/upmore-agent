// No password storage (owner, 2026-10-11, decision 1, settled): "Passwords never sit in chat or in a database; the person
// logs in themselves through a live browser window, completes their own 2FA, and only the encrypted session persists."
// Read from the source (the edge functions need a live project to run).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('the merchant login vault refuses a password and stores only the sign-in email', () => {
  const v = read('supabase/functions/exec-vault-store/index.ts');
  const refuse = v.indexOf('if (password !== undefined && password !== null && String(password) !== "") {'), store = v.indexOf('admin.rpc("exec_vault_store"');
  assert.ok(refuse > 0 && refuse < store, 'refused before anything is stored');
  assert.ok(v.includes('const secret = JSON.stringify({ username: String(username) });'));
  assert.ok(!/password:\s*String\(password\)/.test(v));
});

test('the cancel agent never carries or types a password', () => {
  const x = read('supabase/functions/agent-exec/index.ts');
  const ctx = x.slice(x.indexOf('type ExecContext = {'), x.indexOf('};', x.indexOf('type ExecContext = {')));
  assert.ok(!/password/.test(ctx), 'no password in the run context');
  assert.ok(!/ctx\.password|password:\s*(?:v?cred)\.password|typeInto\(\[?['"]input\[type="password"\]/.test(x), 'nothing reads or types one');
  assert.ok(x.includes('Upmore never stores or types passwords. Nothing was changed'));
});

test('the app asks only for the sign-in email, and says why', () => {
  const t = read('src/upmore-app-template.html');
  const view = t.slice(t.indexOf('<div id="agentCredView"'), t.indexOf('<div id="agentRunView"'));
  assert.ok(!/type="password"|agentCredPass/.test(view));
  assert.ok(view.includes('Upmore never asks for or stores your password.'));
  assert.ok(!t.includes('agentCredPass'), 'no code path reads a password field');
  assert.ok(t.includes('body: { merchant_key: mkey, username: u, label: sub.merchant },'));
});

test('the connector model has no stored-login method: a login is a live session the person signs into', () => {
  for (const f of ['packages/domain/51-connectors.js', 'packages/domain/52-connector-catalog.js', 'packages/connectors/catalog.json', 'docs/instinct-spec-series/04.md', 'docs/instinct-spec-series/05.md']) assert.ok(!read(f).includes('VAULTED_CREDENTIALS'), f);
  assert.ok(require('../packages/domain/51-connectors.js').AUTH.includes('LIVE_SESSION'));
});

test('a cancel playbook that reaches a password field stops there: nothing typed, nothing changed', () => {
  const g = read('supabase/functions/agent-exec/execution-guards.ts');
  assert.ok(g.includes('ctx: { username: string }, page: GuardPage,'));
  const stop = g.indexOf('if (a.credential === "password") {'), type = g.indexOf('const typed = await page.typeInto(a.selectors, text);');
  assert.ok(stop > 0 && stop < type, 'the stop comes before any typing');
  assert.ok(g.includes('Upmore never stores or types passwords. Nothing was changed: sign in yourself and cancel there.'));
  // Proven in a real browser by tests/execution/live-local/run-live-local.js ("the production playbook's password step stops the run").
  assert.ok(read('tests/execution/live-local/run-live-local.js').includes("pw.state.logins === 0 && pw.state.cancel_posts === 0"));
});
