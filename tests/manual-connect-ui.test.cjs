// Guided manual connect in the app (src/upmore-app-template.html, Investments): the consent the person reads, the live
// sign-in window opened from the manual-connect function, "I'm signed in", and the honest status line. Static checks on
// the template and the built app; behaviour of the function is in tests/edge/manual-connect.test.ts.
// Check: node --test tests/manual-connect-ui.test.cjs
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const MC = require('../packages/domain/78-manual-connect.js');
const t = read('src/upmore-app-template.html');
const ui = t.slice(t.indexOf('/* Guided manual connect (owner addendum'), t.indexOf('/* Gmail connection (2026-09-28)'));

test('the manual connect UI exists and has no password field, no code field, no input at all', () => {
  assert.ok(ui.length > 1000, 'the UI block is in the template');
  assert.ok(!/type\s*=\s*["']?password/i.test(ui), 'no type=password');
  assert.ok(!/<input|<textarea|contenteditable/i.test(ui), 'nothing to type into: the person signs in on the platform\'s own page');
  assert.ok(!/password\s*:|otp\s*:|code\s*:/i.test(ui), 'no password or code is ever sent');
  assert.match(ui, /there is no\s+password or code field here/);
});

test('the consent text is the policy module\'s, shown before anything opens; the yes carries the version', () => {
  assert.match(ui, /ManualConnect\.consentText\(p\.display_name\)\.map\(t => `<p class="psub"/);
  assert.match(ui, /agreed \? `<button class="cta" id="mcOpen"[^`]*>Open the sign-in window<\/button>/, 'the window button appears only after the yes');
  assert.match(ui, /`<button class="cta" id="mcAgree"[^`]*>I agree<\/button>`/);
  assert.match(ui, /mcInvoke\(\{ action: "consent", platform_id: id, accepted: true, consent_version: ManualConnect\.CONSENT_VERSION \}\)/);
  assert.ok(ui.includes('r.consent_version === ManualConnect.CONSENT_VERSION'), 'a changed consent text is read again');
});

test('the sign-in window opens the live-view URL in a new tab (https only, no opener); "I\'m signed in" calls check; read asks a read verb', () => {
  assert.match(ui, /mcInvoke\(\{ action: "start", platform_id: id \}\)/);
  assert.match(ui, /if \(res\.ok && \/\^https:\\\/\\\/\/\.test\(res\.live_view_url \|\| ""\)\)/);
  assert.match(ui, /win\.opener = null; win\.location\.href = res\.live_view_url;/);
  assert.match(ui, /id="mcSigned"[^>]*>I'm signed in<\/button>/);
  assert.match(ui, /if \(sg\) sg\.onclick = busy\(sg, async \(\) => \{ const res = await mcInvoke\(\{ action: "check", platform_id: id \}\)/);
  assert.match(ui, /mcInvoke\(\{ action: "read", platform_id: id, verb: "read_balances" \}\)/);
  assert.ok(MC.allow('read_balances').ok, 'and the policy allows it');
});

test('the status line is ManualConnect.statusLine everywhere; the client reads its own rows, never a session or a Vault name', () => {
  assert.ok((ui.match(/ManualConnect\.statusLine\(/g) || []).length >= 2, 'the list and the panel both use it');
  assert.match(ui, /supa\.from\("manual_connections"\)\.select\("platform_id,state,last_checked,consent_version"\)\.eq\("user_id", session\.user\.id\)/);
  assert.ok(!/vault_name|window_id|vault_read|manual_vault/.test(ui), 'no Vault reference on the client');
  assert.match(ui, /unverified playbook/);
});

test('Investments shows the section for a signed-in person; the built app carries the policy module and the playbook names', () => {
  const inv = t.slice(t.indexOf('  async function renderInvestments() {'), t.indexOf('  function wireInvestments() {'));
  assert.match(inv, /\$\{signedIn \? `<div id="manualConnectBox" style="margin-top:14px"><\/div>` : ""\}/);
  assert.match(inv, /if \(signedIn && typeof refreshManualConnect === "function"\) refreshManualConnect\(\);/);
  const built = read('index.html');
  assert.ok(built.includes('async function refreshManualConnect(openId) {'), 'the built app is current (python3 src/build-app.py)');
  assert.ok(built.includes(fs.readFileSync(path.join(root, 'packages/domain/78-manual-connect.js'), 'utf8')), 'the same module the function runs');
  const line = built.split('\n').find(l => l.startsWith('const MANUAL_PLAYBOOKS = '));
  const ctx = vm.createContext({}); vm.runInContext(line.replace('const MANUAL_PLAYBOOKS', 'this.MANUAL_PLAYBOOKS'), ctx);
  const PB = JSON.parse(read('packages/connectors/manual-playbooks.json')).playbooks;
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.MANUAL_PLAYBOOKS)), PB.map(p => ({ platform_id: p.platform_id, display_name: p.display_name, verified: p.verified })));
  assert.ok(!/login_url|signed_in_when|labels/.test(line), 'names only, nothing about the pages');
});
