// The connector matrix (owner, 2026-10-11, 100-platform coverage prompt v2): the researched rows in
// packages/connectors/platforms.json, read through the BrokerageConnector rules (packages/domain/77). The generated
// report docs/connector-matrix/README.md must be current; the numbers are pinned so any change to them is deliberate.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const BC = require('../packages/domain/77-brokerage-connectors.js');
const data = JSON.parse(fs.readFileSync(path.join(root, 'packages/connectors/platforms.json'), 'utf8'));
const rows = data.platforms, byId = Object.fromEntries(rows.map(r => [r.id, r]));
const owner = rows.filter(r => r.n <= 100);

test('every platform the owner named is a valid row, plus Alpaca as row 101, and the report is current', () => {
  assert.deepEqual(BC.validate(rows), []);
  assert.deepEqual(owner.map(r => r.n), Array.from({ length: 100 }, (_, i) => i + 1));
  assert.deepEqual(rows.filter(r => r.n > 100).map(r => r.id), ['alpaca']);
  for (const r of rows) {
    assert.ok(r.category && r.region && r.auth && r.notes && r.status, `#${r.n}: category, region, auth, status and notes`);
    assert.ok(r.verification === 'unverified' || r.sources.every(u => /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\//i.test(u)), `#${r.n}: sources are real links`);
  }
  execFileSync('node', ['scripts/build-connector-matrix.cjs', '--check'], { cwd: root, stdio: 'pipe' });
});

test('the numbers the owner was given: trade + track, track only, off, none, and where each stands today', () => {
  const s = BC.summary(owner), all = BC.summary(rows);
  assert.deepEqual([s.total, s.trade, s.track_only, s.blocked, s.none, s.shared], [100, 16, 64, 15, 5, 9]);
  assert.deepEqual([all.total, all.trade], [101, 17]);
  assert.deepEqual(all.today, { connect: 12, fallback: 4, not_built: 35, try: 30, blocked: 15, none: 5 });
  // Trading today happens only on a live adapter: Alpaca. Every other trade-capable row says what it still needs.
  assert.deepEqual(rows.filter(r => BC.capability(r).trade && BC.today(r, rows).state === 'connect').map(r => r.id), ['alpaca']);
  for (const r of rows.filter(r => BC.capability(r).trade && r.adapter_state !== 'live')) assert.ok(r.needs, `#${r.n} ${r.platform}: names what trading there still needs`);
  assert.equal(all.verified_live || rows.filter(r => r.verification === 'verified_live').length, 0, 'nothing is claimed verified live until a real account proves it');
});

test('prediction markets and crypto stay off until the owner decides, and connect nothing', async () => {
  for (const r of rows.filter(r => r.category === 'Prediction market' || r.category === 'Crypto')) {
    if (r.route === 'none') continue;
    assert.ok(r.blocked_reason, `#${r.n} ${r.platform} is off`);
    const a = BC.adapterFor(r, { adapters: { [r.route]: { connect: async () => ({ ok: true }), placeOrder: async () => ({ ok: true }) } } });
    assert.equal((await a.connect({})).code, 'blocked');
    assert.equal((await a.placeOrder({}, { estimated_cents: 100, approval: { approved: true, id: 'x' } })).code, 'blocked');
  }
  // Owner, 2026-10-11: never encourage a Kalshi or Polymarket decision; numbers only.
  for (const id of ['kalshi', 'polymarket']) assert.match(byId[id].blocked_reason, /numbers only .* never encourages/);
  const readme = fs.readFileSync(path.join(root, 'docs/connector-matrix/README.md'), 'utf8');
  assert.match(readme, /Upmore never encourages a Kalshi or Polymarket decision/);
  // A blocked platform named in chat finds its own row, not its parent's working connection.
  assert.equal(BC.find(rows, 'my robinhood event contracts').id, 'robinhood-event-contracts');
  assert.equal(BC.find(rows, 'I use robinhood').id, 'robinhood');
});

test('the honest calls from the research hold: no trading where the platform offers no third-party trading', () => {
  for (const id of ['robinhood', 'fidelity', 'vanguard', 'public', 'merrill-edge', 'ally-invest', 'betterment', 'wealthfront']) assert.equal(BC.capability(byId[id]).trade, false, id);
  for (const id of ['charles-schwab', 'etrade', 'interactive-brokers', 'tastytrade', 'tradestation', 'webull', 'moomoo']) assert.equal(BC.capability(byId[id]).trade, true, id);
  // Shared accounts connect once through their parent.
  for (const [child, parent] of [['td-ameritrade', 'charles-schwab'], ['ellevest', 'betterment'], ['marcus-invest', 'betterment'], ['massmutual', 'empower'], ['interactive-brokers-global', 'interactive-brokers']]) assert.equal(byId[child].same_account_as, parent);
  assert.equal(BC.find(rows, 'my old td ameritrade account').id, 'charles-schwab');
  // Nobody gives Upmore a password: every route signs in on the company's site, through a key on the secure link, or
  // by the person logging in themselves in a live window.
  assert.ok(rows.every(r => ['oauth', 'partner_oauth', 'personal_api_key', 'aggregator', 'manual_session', 'none'].includes(r.auth)));
  assert.ok(!/password/i.test(JSON.stringify(rows.map(r => [r.auth, r.needs]))));
});

test('the connector catalog agrees with the matrix on how each brokerage signs in (docs follow the research)', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'packages/connectors/catalog.json'), 'utf8'));
  assert.ok(!catalog.auth_methods.includes('VAULTED_CREDENTIALS') && catalog.auth_methods.includes('LIVE_SESSION'), 'no password storage (owner decision 1)');
  const alias = { schwab: 'charles-schwab', public: 'public', m1: 'm1', 'sofi-invest': 'sofi-invest' };
  for (const c of catalog.connectors) {
    const r = byId[alias[c.provider] || c.provider];
    if (!r || r.n > 100) continue;
    const want = { aggregator: ['AGGREGATOR'], oauth: ['OAUTH'], partner_oauth: ['OAUTH'], personal_api_key: ['PERSONAL_API_KEY'], manual_session: ['LIVE_SESSION', 'MANUAL'], none: ['MANUAL'] }[r.auth];
    assert.ok(want.includes(c.auth_method), `${c.provider}: catalog says ${c.auth_method}, the matrix says ${r.auth}`);
  }
});

test('every update shows verified vs unverified, and a row is unverified until a real account connects through it', () => {
  const readme = fs.readFileSync(path.join(root, 'docs/connector-matrix/README.md'), 'utf8');
  assert.match(readme, /\| \*\*Verified with a real account\*\* \| \*\*0\*\* \| \*\*0\*\* \|/);
  assert.match(readme, /\| \*\*Unverified\*\* \(researched with sources \/ research could not confirm\) \| \*\*100\*\* \(47 \/ 53\) \| \*\*101\*\* \(48 \/ 53\) \|/);
  assert.ok(!/\| researched \|/.test(readme), 'researched is never shown as if it were verified');
  for (const r of rows) assert.ok(r.verification !== 'verified_live', `${r.id}: verified only after a real account connects (none has yet)`);
});

test('matrix honesty: no row contradicts its own research, and the report shows verified vs unverified (benchmark 2026-10-12)', () => {
  assert.deepEqual(BC.contradictions(rows), []);
  const readme = fs.readFileSync(path.join(root, 'docs/connector-matrix/README.md'), 'utf8');
  assert.match(readme, /\*\*Research contradictions: 0\.\*\*/);
  // The checker catches each kind on a planted row.
  const base = rows.find(r => r.id === 'fidelity');
  const planted = [
    Object.assign({}, base, { id: 'p1', route: 'snaptrade', auth: 'aggregator' }),
    Object.assign({}, rows.find(r => r.id === 'empower'), { id: 'p2', verification: 'researched' }),
    Object.assign({}, rows.find(r => r.id === 'public'), { id: 'p3', trade: true, research: Object.assign({}, rows.find(r => r.id === 'public').research, { snaptrade: 'listed; read-only' }) }),
  ];
  assert.deepEqual(BC.contradictions(planted).map(c => c.kind), ['route', 'verification', 'trade']);
});
