// Launch readiness B7 (2026-10-26): the Trainee web app that the Vercel project "trainee" serves from site/app/, and the
// two shared modules it changed: the chat's card (per-application approve, one answer per tap) and the dashboard's
// queue (the chat's open card counted and shown there). The whole path in a browser against the real handler and
// database is tests/architect/flow-web-signup-e2e.test.ts. Check: node --test tests/career-web-app.test.cjs
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const C = require(path.join(root, 'src/career-apply-card.js'));
const D = require(path.join(root, 'src/career-dashboard.js'));

test('site/app is exactly the build of its sources (scripts/web/build-trainee-web.py --check)', () => {
  const out = execFileSync('python3', ['scripts/web/build-trainee-web.py', '--check'], { cwd: root, encoding: 'utf8' });
  assert.match(out, /site\/app matches its sources \(5 files\)/);
});

test('no Upmore name, copy or finance surface reaches the Trainee app', () => {
  const page = read('site/app/index.html');
  const vendor = read('src/vendor/supabase-js.min.js');
  const own = page.replace(vendor, ''); // the vendored client library is not Trainee copy
  assert.ok(page.includes(vendor), 'the vendored client is inlined whole');
  assert.doesNotMatch(page, /upmore/i);
  for (const w of [/\bbroker/i, /\bplaid\b/i, /simplefin/i, /paycheck/i, /cash available/i, /\binvest/i, /\bbudget/i, /\bstripe\b/i, /credit card/i, /\bfinance\b/i]) {
    assert.doesNotMatch(own, w, String(w));
  }
  assert.match(page, /<title>Trainee<\/title>/);
});

test('the built config carries the project URL and its anon key only, never a service key', () => {
  const cfg = read('site/app/config.js');
  const m = /backendUrl: "(https:\/\/[a-z0-9]+\.supabase\.co)", anonKey: "([A-Za-z0-9._-]+)"/.exec(cfg);
  assert.ok(m, cfg);
  const claims = JSON.parse(Buffer.from(m[2].split('.')[1], 'base64url').toString());
  assert.equal(claims.role, 'anon');
  assert.equal(`https://${claims.ref}.supabase.co`, m[1]);
  assert.doesNotMatch(cfg, /service_role/);
});

// WCAG relative luminance contrast of the app's own text/surface pairs (the browser test measures every rendered element).
const lum = (hex) => {
  const [r, g, b] = hex.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
test('the brand tokens are the owner\'s, and every text pair the app uses reads at 4.5:1 or more', () => {
  const css = read('web/trainee/app.css');
  const tok = Object.fromEntries([...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual([tok.plum, tok['plum-accent'], tok['plum-dark'], tok.graphite], ['#6B4F7E', '#A58FB8', '#2A1A3A', '#1E1F24']);
  assert.match(css, /--serif: "Libre Baskerville"/);
  assert.match(css, /--sans: Inter/);
  const pairs = [
    ['text', 'graphite'], ['silver', 'graphite'], ['dim', 'graphite'], ['text', 'raise'], ['silver', 'raise'], ['dim', 'raise'],
    ['plum-accent', 'graphite'], ['bad', 'graphite'], ['silver', 'plum-dark'], ['text', 'plum-dark'],
  ];
  for (const [fg, bg] of pairs) assert.ok(ratio(tok[fg], tok[bg]) >= 4.5, `${fg} on ${bg}: ${ratio(tok[fg], tok[bg]).toFixed(2)}`);
  assert.ok(ratio('#FFFFFF', tok.plum) >= 4.5, 'white on plum (the buttons, the selected tab, your messages)');
  assert.ok(ratio('#FFE3DF', tok.plum) >= 4.5, 'the error line inside your message');
  assert.ok(ratio(tok['plum-dark'], tok['plum-accent']) >= 4.5, 'the count badge');
  assert.match(css, /:focus-visible \{ outline: 2px solid var\(--plum-accent\)/, 'a visible focus ring');
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('the home page links to the app on desktop and in the phone menu', () => {
  const site = read('site/index.html');
  assert.match(site, /<a href="\/app" class="nl" id="nav-signin">Sign in<\/a>/);
  assert.match(site, /<nav class="mnav" id="mnav"[\s\S]*?<a href="\/app">Sign in<\/a>[\s\S]*?<\/nav>/);
});

test('the app sends what the server reads: a message within 4,000 characters, a turn key, the same key on a retry', () => {
  const js = read('web/trainee/app.js');
  assert.match(read('supabase/functions/agent-chat/handler-career.ts'), /const MAX_MESSAGE_LEN = 4000;/, 'the server cap this app mirrors');
  assert.match(js, /const MAX_CHARS = 4000;/);
  assert.match(js, /chatFetch\(\{ message: text, thread_id: thread, turn_key: key \}\)/);
  assert.match(js, /retry\.addEventListener\('click', \(\) => send\(text, key, mine\)\)/, 'a retry reuses the key');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, 'server text is never written as HTML');
});

/* ---- the card: approve one application; one answer per tap ---- */
const CARD = '2c1f7a52-6d1e-4b8a-9f3e-0a1b2c3d4e5f', P1 = '3d2e8b63-7e2f-4c9b-8a4f-1b2c3d4e5f60', P2 = '4e3f9c74-8f30-4dac-9b50-2c3d4e5f6071';
const H1 = 'a'.repeat(64), H2 = 'b'.repeat(64);
const card = { id: CARD, state: 'open', shown_at: '2026-10-26T10:00:00Z', items: [{ n: 1, prepared_id: P1, payload_hash: H1 }, { n: 2, prepared_id: P2, payload_hash: H2 }] };
const prepared = [{ id: P1, company: 'TEST Ramp', card_lines: ['Intern at TEST Ramp', 'Name: Alex Testcase'], payload_hash: H1 }, { id: P2, company: 'TEST Acme', card_lines: ['Analyst at TEST Acme'], payload_hash: H2 }];
function doc() {
  const make = (tag) => {
    const e = { tag, children: [], parent: null, own: '', attrs: {}, className: '', hidden: false,
      get textContent() { return this.own; }, set textContent(v) { this.own = String(v); this.children = []; },
      appendChild(c) { c.parent = this; this.children.push(c); return c; }, append(...cs) { cs.forEach((c) => this.appendChild(c)); },
      replaceChildren(...cs) { this.children = []; this.own = ''; this.append(...cs); },
      replaceWith(...cs) { const p = this.parent, i = p.children.indexOf(this); cs.forEach((c) => (c.parent = p)); p.children.splice(i, 1, ...cs); },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      text() { return [this.own, ...this.children.map((c) => c.text())].filter(Boolean).join('\n'); },
      buttons() { return [...(this.tag === 'button' ? [this] : []), ...this.children.flatMap((c) => c.buttons())]; } };
    return e;
  };
  return { createElement: make };
}
const from = (rows) => (table) => {
  const f = [];
  const run = () => (rows[table] || []).filter((x) => f.every(([op, c, v]) => (op === 'eq' ? x[c] === v : v.includes(x[c]))));
  const q = { select: () => q, eq: (c, v) => { f.push(['eq', c, v]); return q; }, in: (c, v) => { f.push(['in', c, v]); return Promise.resolve({ data: run(), error: null }); },
    maybeSingle: () => Promise.resolve({ data: run()[0] || null, error: null }) };
  return q;
};
async function mounted(rpc) {
  const d = doc(), host = d.createElement('div');
  const v = await C.mount(host, { intent: 'career_apply_card', card_id: CARD }, { document: d, from: from({ career_apply_cards: [card], career_apply_prepared: prepared }), rpc });
  return { v, host };
}

test('a card of two: each application has Approve only this one, named for it; the note says the rest is declined', async () => {
  const { v, host } = await mounted(async () => ({ data: [], error: null }));
  assert.equal(v.ok, true);
  const only = host.buttons().filter((b) => b.textContent === 'Approve only this one');
  assert.equal(only.length, 2);
  assert.deepEqual(only.map((b) => b.attrs['aria-label']), ['Approve only 1, TEST Ramp, and decline the others on this card', 'Approve only 2, TEST Acme, and decline the others on this card']);
  assert.match(host.text(), /Approve only this one sends just that application and declines the rest of this card\./);
  assert.deepEqual(C.answerArgs(card, true, 2), { p_card: CARD, p_approve: [2] });
  assert.throws(() => C.answerArgs(card, true, 3), /not_on_card/, 'a number not on the card is refused before any call');
});

test('Approve only this one answers the card once with that number; the card then shows the results and no buttons', async () => {
  const rpcs = [];
  const { host } = await mounted(async (n, a) => { rpcs.push([n, a]); return { data: [{ n: 1, company: 'TEST Ramp', result: 'declined' }, { n: 2, company: 'TEST Acme', result: 'queued' }], error: null }; });
  await host.buttons().filter((b) => b.textContent === 'Approve only this one')[1].onclick();
  assert.deepEqual(rpcs, [['career_apply_card_answer_own', { p_card: CARD, p_approve: [2] }]]);
  assert.match(host.text(), /1\. TEST Ramp: not sent/);
  assert.match(host.text(), /2\. TEST Acme: approved/);
  assert.equal(host.buttons().length, 0, 'answered: no buttons left');
  assert.doesNotMatch(host.text(), /declines the rest of this card/, 'the note goes with the buttons');
});

test('two taps while the first is answered make one call; a failed answer re-enables the buttons for a retry', async () => {
  const rpcs = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const { host } = await mounted(async (n, a) => { rpcs.push(a); await gate; return { data: null, error: { message: 'connection reset' } }; });
  const approve = host.buttons().find((b) => b.textContent === 'Approve all 2');
  const first = approve.onclick();
  const second = approve.onclick();
  assert.equal(approve.disabled, true, 'disabled while the answer is out');
  release(); await first; await second;
  assert.equal(rpcs.length, 1, 'one answer for two taps');
  assert.match(host.text(), /Nothing was approved: the card could not be answered just now\./);
  assert.equal(approve.disabled, false, 'tap again to retry');
});

/* ---- the dashboard's queue counts and shows the chat's open card ---- */
test('queueView: the chat\'s open card is awaiting; its applications are not listed again as reviewed', () => {
  const q = D.queueView([], [{ id: P1, job_id: 'ashby:ramp:1', state: 'shown', updated_at: '2026-10-26T10:00:00Z' }, { id: P2, job_id: 'lever:acme:2', state: 'shown', updated_at: '2026-10-26T10:00:00Z' },
    { id: 'p3', job_id: 'gh:x:3', state: 'ready', updated_at: '2026-10-26T09:00:00Z' }], [], Date.parse('2026-10-26T10:05:00Z'), [card]);
  assert.equal(q.awaitingCount, 2);
  assert.deepEqual(q.applyAwaiting.map((r) => [r.card.id, r.count]), [[CARD, 2]]);
  assert.deepEqual(q.reviewed.map((p) => p.id), ['p3'], 'only the application not on the card');
  const none = D.queueView([], [], [], 0, [{ ...card, state: 'answered' }, { id: 'not-a-uuid', state: 'open', items: [{ n: 1 }] }, null]);
  assert.equal(none.awaitingCount, 0, 'an answered card or a malformed row awaits nothing');
  assert.equal(D.queueView([], [], [], 0).awaitingCount, 0, 'without applyCards the queue is as before');
});

test('load reads the open card of the chat with the person\'s own session, by their id', async () => {
  const calls = [];
  const client = { from(t) { const c = { t, f: [] }; calls.push(c); const q = { select: () => q, eq: (k, v) => { c.f.push(['eq', k, v]); return q; }, order: () => q, in: () => q,
    limit: () => Promise.resolve({ data: t === 'career_apply_cards' ? [card] : [], error: null }) }; return q; } };
  const uid = '6f0c1d3e-0000-4000-8000-000000000001';
  const data = await D.load(client, uid);
  const c = calls.find((x) => x.t === 'career_apply_cards');
  assert.deepEqual(c.f, [['eq', 'user_id', uid], ['eq', 'state', 'open']]);
  assert.deepEqual(data.applyCards, [card]);
});

/* ---- security headers and the page's CSP (review of PR #195) ---- */
test('vercel.json gives /app and everything under it: frame-ancestors none, X-Frame-Options DENY, nosniff, no referrer', () => {
  const v = JSON.parse(read('vercel.json'));
  for (const source of ['/app', '/app/(.*)']) {
    const rule = v.headers.find((h) => h.source === source);
    assert.ok(rule, source);
    const h = Object.fromEntries(rule.headers.map((x) => [x.key, x.value]));
    assert.match(h['Content-Security-Policy'], /(^|; )frame-ancestors 'none'(;|$)/);
    assert.equal(h['X-Frame-Options'], 'DENY');
    assert.equal(h['X-Content-Type-Options'], 'nosniff');
    assert.equal(h['Referrer-Policy'], 'no-referrer', 'an invite token in the address never leaves as a referrer');
  }
  assert.equal(v.headers.filter((h) => /^\/app/.test(h.source)).length, 2, 'only the app\'s paths');
});

test('the page\'s CSP allows exactly its own inline blocks (by sha256), its own files, Google Fonts and the project; nothing inline else', () => {
  const page = read('site/app/index.html');
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(page);
  assert.ok(meta, 'the CSP meta');
  const csp = Object.fromEntries(meta[1].split('; ').map((d) => { const [k, ...v] = d.split(' '); return [k, v]; }));
  const sha = (s) => "'sha256-" + require('node:crypto').createHash('sha256').update(s).digest('base64') + "'";
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => sha(x[1]));
  const styles = [...page.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((x) => sha(x[1]));
  assert.deepEqual(csp['default-src'], ["'none'"]);
  assert.deepEqual(csp['script-src'], ["'self'", ...scripts]);
  assert.deepEqual(csp['style-src'], ["'self'", 'https://fonts.googleapis.com', ...styles]);
  assert.deepEqual(csp['connect-src'], ['https://mrwngntwmnaqrqhupvlt.supabase.co']);
  assert.deepEqual([csp['base-uri'], csp['object-src'], csp['form-action']], [["'none'"], ["'none'"], ["'none'"]]);
  assert.ok(!Object.values(csp).flat().some((x) => /unsafe-(inline|eval)|\*/.test(x)), 'no unsafe-inline, unsafe-eval or wildcard');
  assert.doesNotMatch(page.replace(/<script>[\s\S]*?<\/script>/g, ''), /\son[a-z]+="|\sstyle="|javascript:/, 'no inline handlers or style attributes outside the hashed blocks');
});

test('sign-up is closed in the migration by default, and no env can open it', () => {
  const sql = read('supabase/migrations/20261026230000_trainee_web_admission.sql');
  assert.match(sql, /insert into public\.trainee_settings \(key, value\) values \('web_signup', 'invite'\) on conflict \(key\) do nothing;/);
  assert.match(sql, /coalesce\(\(select value from public\.trainee_settings where key = 'web_signup'\), 'invite'\)/, 'no row reads as closed');
  assert.doesNotMatch(read('supabase/functions/_shared/trainee_admission.ts'), /TRAINEE_WEB_SIGNUP/);
  assert.doesNotMatch(read('scripts/launch/trainee-go-live.sh'), /TRAINEE_WEB_SIGNUP/);
});
