// The BrokerageConnector contract (packages/domain/77-brokerage-connectors.js): the rules hold whatever an adapter does.
// Rows and adapters here are MOCK test data; the researched matrix is checked in tests/connector-matrix.test.cjs.
const test = require('node:test'), assert = require('node:assert/strict');
const BC = require('../packages/domain/77-brokerage-connectors.js');

const ROWS = [
  { n: 1, id: 'robinhood', platform: 'Robinhood', route: 'snaptrade', trade: true, read: true, adapter_state: 'not_built', verification: 'researched', sources: ['https://example.test/mock'] },
  { n: 2, id: 'robinhood-crypto', platform: 'Robinhood Crypto', route: 'snaptrade', trade: true, read: true, adapter_state: 'not_built', verification: 'unverified', same_account_as: 'robinhood' },
  { n: 3, id: 'vanguard', platform: 'Vanguard', route: 'plaid', trade: false, read: true, adapter_state: 'not_built', verification: 'researched', sources: ['https://example.test/mock'] },
  { n: 4, id: 'blockfi', platform: 'BlockFi', route: 'none', trade: false, read: false, adapter_state: 'not_built', verification: 'researched', sources: ['https://example.test/mock'], notes: 'shut down' },
  { n: 5, id: 'alpaca', platform: 'Alpaca', route: 'native_api', trade: true, read: true, adapter_state: 'built', verification: 'researched', sources: ['https://example.test/mock'] },
];
const approval = { approved: true, id: 'card-1' };

test('the honest label: trade + track only where the route can trade; track only for read routes; none says so', () => {
  assert.deepEqual(BC.capability(ROWS[0]), { trade: true, read: true, label: 'Trade + track' });
  assert.deepEqual(BC.capability(ROWS[2]), { trade: false, read: true, label: 'Track only' });
  assert.equal(BC.capability(ROWS[3]).label, "Can't connect");
  // A row that claims trading on a read-only route is caught by validation and never labeled as trading.
  const lie = Object.assign({}, ROWS[2], { trade: true });
  assert.equal(BC.capability(lie).trade, false);
  assert.match(BC.validate([lie]).join(' '), /trade promised on a plaid route/);
  assert.deepEqual(BC.validate(ROWS), []);
});

test('a track-only platform never places an order, whatever its adapter would do', async () => {
  let called = 0;
  const a = BC.adapterFor(ROWS[2], { adapters: { plaid: { placeOrder: async () => { called++; return { ok: true }; } } } });
  const r = await a.placeOrder({}, { estimated_cents: 500, approval });
  assert.equal(r.code, 'read_only'); assert.match(r.text, /Vanguard is track-only in Upmore/); assert.equal(called, 0);
});

test('an order needs a fresh approval and stays under the $5 cap before the adapter is ever called', async () => {
  const calls = [];
  const a = BC.adapterFor(ROWS[0], { adapters: { snaptrade: { placeOrder: async (ctx, o) => { calls.push(o.estimated_cents); return { ok: true, order_id: 'mock-1' }; } } } });
  assert.equal((await a.placeOrder({}, { estimated_cents: 500 })).code, 'needs_approval');
  assert.equal((await a.placeOrder({}, { estimated_cents: 500, approval: { approved: true } })).code, 'needs_approval', 'an approval without its card id is not an approval');
  assert.equal((await a.placeOrder({}, { estimated_cents: 501, approval })).code, 'order_cap');
  assert.equal((await a.placeOrder({}, { estimated_cents: 0, approval })).code, 'amount_unknown');
  assert.deepEqual(calls, []);
  assert.deepEqual(await a.placeOrder({}, { estimated_cents: 500, approval }), { ok: true, order_id: 'mock-1' });
  assert.deepEqual(calls, [500]);
});

test('no adapter or keys means NOT_WIRED, never a pretend connection; a throwing adapter is a clean, specific error', async () => {
  const bare = BC.adapterFor(ROWS[0], {});
  const c = await bare.connect({});
  assert.equal(c.code, 'not_wired'); assert.match(c.text, /^NOT_WIRED: Robinhood through SnapTrade is not switched on yet .*Nothing was connected\.$/);
  const broken = BC.adapterFor(ROWS[4], { adapters: { native_api: { verify: async () => { throw new Error('401 token revoked'); } } } });
  assert.deepEqual(await broken.verify({}), { ok: false, code: 'failed', text: 'Alpaca: 401 token revoked' });
  const gone = BC.adapterFor(ROWS[3], { adapters: { none: { connect: async () => ({ ok: true }) } } });
  assert.deepEqual(await gone.connect({}), { ok: false, code: 'unavailable', text: "BlockFi can't be connected: shut down" });
});

test('a platform named in the person\'s words finds its row; a shared account connects through its parent', () => {
  assert.equal(BC.find(ROWS, 'I invest on robinhood mostly').id, 'robinhood');
  const crypto = BC.find(ROWS, 'my Robinhood Crypto account');
  assert.equal(crypto.id, 'robinhood'); assert.equal(crypto.via, 'Robinhood Crypto');
  assert.equal(BC.find(ROWS, 'acme brokerage'), null);
});

test('the summary counts what can trade, what can only be tracked, and what cannot connect', () => {
  const s = BC.summary(ROWS);
  assert.deepEqual([s.total, s.trade, s.track_only, s.none, s.shared], [5, 3, 1, 1, 1]);
});

test('a platform the owner switched off connects nothing and says so plainly, whatever its route could do', async () => {
  const kalshi = { n: 6, id: 'kalshi', platform: 'Kalshi', route: 'native_api', auth: 'personal_api_key', trade: true, read: true, adapter_state: 'not_built', verification: 'researched', sources: ['https://example.test/mock'], blocked_reason: 'prediction market: owner decision' };
  const rows = ROWS.concat([kalshi]);
  assert.deepEqual(BC.validate(rows), []);
  assert.deepEqual(BC.capability(kalshi), { trade: false, read: false, label: 'Off: owner decision', blocked: true });
  assert.equal(BC.capability(kalshi, { route: true }).label, 'Trade + track', 'the matrix still shows what the route could do');
  let called = 0;
  const a = BC.adapterFor(kalshi, { adapters: { native_api: { connect: async () => { called++; return { ok: true }; }, placeOrder: async () => { called++; return { ok: true }; } } } });
  assert.deepEqual(await a.connect({}), { ok: false, code: 'blocked', text: "Kalshi isn't available in Upmore, so nothing was connected." });
  assert.equal((await a.placeOrder({}, { estimated_cents: 100, approval })).code, 'blocked');
  assert.equal(called, 0);
  assert.equal(BC.find(rows, 'can you hook up kalshi').id, 'kalshi');
  const s = BC.summary(rows);
  assert.deepEqual([s.trade, s.blocked, s.route_trade], [3, 1, 4]);
  assert.match(BC.validate([Object.assign({}, kalshi, { blocked_reason: ' ' })]).join(' '), /a blocked row says why/);
});

test('today is where a platform stands now: connect, track through a live fallback, not built, off or none', () => {
  const plaidLive = { n: 10, id: 'vanguard', platform: 'Vanguard', route: 'plaid', auth: 'aggregator', trade: false, read: true, adapter_state: 'live', verification: 'researched', sources: ['https://example.test/mock'] };
  const schwab = { n: 11, id: 'schwab', platform: 'Charles Schwab', route: 'native_api', auth: 'partner_oauth', trade: true, read: true, adapter_state: 'not_built', verification: 'researched', sources: ['https://example.test/mock'], fallback_route: 'plaid' };
  const tda = { n: 12, id: 'tda', platform: 'TD Ameritrade', route: 'native_api', auth: 'partner_oauth', trade: true, read: true, adapter_state: 'not_built', verification: 'researched', sources: ['https://example.test/mock'], same_account_as: 'schwab' };
  const live = Object.assign({}, ROWS[4], { adapter_state: 'live', auth: 'oauth' });
  const rows = [plaidLive, schwab, tda, live, ROWS[3], ROWS[0]];
  assert.deepEqual(BC.validate(rows), []);
  assert.deepEqual(BC.today(plaidLive, rows), { state: 'connect', label: 'Connect now: track only' });
  assert.deepEqual(BC.today(live, rows), { state: 'connect', label: 'Connect now: trade + track' });
  assert.deepEqual(BC.today(schwab, rows), { state: 'fallback', label: 'Track now through Plaid; trading not built' });
  assert.equal(BC.today(tda, rows).state, 'fallback', 'a shared account stands where its parent stands');
  assert.equal(BC.today(schwab, [schwab]).state, 'not_built', 'a fallback counts only when that route is live');
  assert.equal(BC.today(ROWS[3], rows).state, 'none');
  assert.equal(BC.today(ROWS[0], rows).state, 'not_built');
  assert.deepEqual(BC.today(Object.assign({}, plaidLive, { verification: 'unverified' }), rows), { state: 'try', label: 'Try now through Plaid (coverage unverified)' }, 'unconfirmed coverage is a try, not a promise');
  // How people sign in is checked per route: no aggregator row claims an API key, no browser row claims OAuth.
  assert.match(BC.validate([Object.assign({}, plaidLive, { auth: 'personal_api_key' })]).join(' '), /auth personal_api_key does not fit a plaid route/);
  assert.match(BC.validate([Object.assign({}, schwab, { fallback_route: 'snaptrade' })]).join(' '), /different read-only route/);
  assert.match(BC.validate([schwab, Object.assign({}, tda, { route: 'plaid', trade: false, auth: 'aggregator' })]).join(' '), /uses its parent's route/);
});
