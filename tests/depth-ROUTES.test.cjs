// Brokerage connector routes (owner, 2026-10-11, "meet users where they already invest"; docs/depth/ROUTES.md): one
// contract for every investing platform, a route per row in the owner's order (native API > SnapTrade > Plaid > guided
// manual connect > none), NOT_WIRED for anything not switched on, prediction markets and crypto off, a track-only route
// never trades, every order behind a fresh approval and the $5 cap. One test per sub-capability, tagged so
// evals/depth/run.cjs can prove its planted defect makes exactly this test fail. The matrix is the shipped
// packages/connectors/platforms.json; extra rows and adapters here are MOCK.
// Check: node --test tests/depth-ROUTES.test.cjs && node evals/depth/run.cjs ROUTES
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const BC = require(path.join(dir, "77-brokerage-connectors.js"));
const rows = require(path.join(root, "packages/connectors/platforms.json")).platforms;
const row = id => rows.find(r => r.id === id);
const approval = { approved: true, id: "mock-card-1" };
const mock = (o) => Object.assign({ n: 900, id: "mock", platform: "Mock Broker", route: "snaptrade", trade: true, read: true, adapter_state: "not_built", verification: "researched", sources: ["https://example.test/mock"] }, o);
const counting = () => { const c = { calls: 0 }; c.impl = { connect: async () => { c.calls++; return { ok: true, url: "https://example.test/connect" }; }, placeOrder: async () => { c.calls++; return { ok: true, order_id: "mock-order" }; }, positions: async () => { c.calls++; return { ok: true }; } }; return c; };

test("[S01] a track-only route never trades, whatever the row claims", () => {
  for (const route of ["plaid", "browser_assisted", "none"]) assert.equal(BC.capability(mock({ route, trade: true })).trade, false, route);
  for (const r of rows.filter(r => ["plaid", "browser_assisted"].includes(r.route))) assert.equal(BC.capability(r, { route: true }).trade, false, r.id);
  assert.equal(BC.capability(row("alpaca")).label, "Trade + track");
});
test("[S02] a platform the owner switched off can do nothing: every prediction market and crypto row", () => {
  const off = rows.filter(r => /prediction market|crypto/i.test(r.blocked_reason || ""));
  assert.ok(off.length >= 14, `${off.length} off rows`);
  for (const id of ["kalshi", "polymarket", "predictit", "forecastex", "robinhood-event-contracts", "coinbase", "kraken", "robinhood-crypto", "etoro-crypto"]) assert.ok(off.some(r => r.id === id), id);
  for (const r of off) assert.deepEqual(BC.capability(r), { trade: false, read: false, label: "Off: owner decision", blocked: true }, r.id);
  assert.equal(BC.capability(row("kalshi"), { route: true }).label, "Trade + track", "the matrix still shows what the route could do");
});
test("[S03] an off row is off today even when its route is live", () => {
  assert.equal(row("robinhood-event-contracts").adapter_state, "live");
  assert.deepEqual(BC.today(row("robinhood-event-contracts"), rows), { state: "blocked", label: "Off: owner decision" });
  for (const r of rows.filter(r => r.blocked_reason)) assert.equal(BC.today(r, rows).state, "blocked", r.id);
});
test("[S04] a live route whose coverage nobody confirmed is a try, never a promise", () => {
  assert.deepEqual(BC.today(row("sofi-invest"), rows), { state: "try", label: "Try now through Plaid (coverage unverified)" });
  assert.equal(BC.today(row("fidelity"), rows).state, "connect");
  assert.match(BC.connectAnswer(rows, "connect my sofi invest").text, /isn't confirmed yet, so it's worth a try/);
});
test("[S05] a shared account is one connection: it stands where its parent stands", () => {
  assert.equal(row("ellevest").verification, "researched");
  assert.equal(BC.today(row("ellevest"), rows).state, "try", "Betterment's coverage is unverified, so Ellevest's is too");
  assert.equal(BC.today(row("td-ameritrade"), rows).state, "fallback", "TD Ameritrade tracks through Schwab's fallback");
});
test("[S06] a fallback is offered only through a live, switched-on row on that route", () => {
  const schwab = mock({ id: "schwab", platform: "Schwab", route: "native_api", auth: "partner_oauth", fallback_route: "plaid" });
  const plaidRow = o => mock(Object.assign({ n: 901, id: "p1", platform: "P1", route: "plaid", trade: false, auth: "aggregator" }, o));
  assert.equal(BC.today(schwab, [schwab, plaidRow({ adapter_state: "not_built" })]).state, "not_built");
  assert.equal(BC.today(schwab, [schwab, plaidRow({ adapter_state: "live" })]).state, "fallback");
  assert.equal(BC.today(row("charles-schwab"), rows).state, "fallback");
});
test("[S07] the matrix refuses trading on a read route and a fallback that could trade", () => {
  assert.match(BC.validate([mock({ route: "plaid", auth: "aggregator" })]).join(" "), /trade promised on a plaid route/);
  assert.match(BC.validate([mock({ route: "native_api", auth: "oauth", fallback_route: "snaptrade" })]).join(" "), /a fallback route is a different read-only route/);
  assert.match(BC.validate([mock({ route: "plaid", trade: false, auth: "aggregator", fallback_route: "plaid" })]).join(" "), /different read-only route/);
  assert.deepEqual(BC.validate([mock({ route: "native_api", auth: "oauth", fallback_route: "plaid" })]), []);
});
test("[S08] verified live means a live adapter, and a researched row cites its sources", () => {
  assert.match(BC.validate([mock({ verification: "verified_live", adapter_state: "built" })]).join(" "), /verified live needs a live adapter/);
  assert.match(BC.validate([mock({ sources: [] })]).join(" "), /cites its sources/);
  assert.equal(rows.filter(r => r.verification === "verified_live" && r.adapter_state !== "live").length, 0);
});
test("[S09] no route signs in with a password: manual connect is a live session the person logs into", () => {
  for (const [route, list] of Object.entries(BC.AUTH)) for (const a of list) assert.doesNotMatch(a, /password|credential|username|login|otp|code/i, `${route}: ${a}`);
  assert.deepEqual(BC.AUTH.browser_assisted, ["manual_session"]);
  assert.match(BC.validate([mock({ route: "browser_assisted", trade: false, auth: "password" })]).join(" "), /auth password does not fit a browser_assisted route/);
  assert.match(BC.validate([mock({ route: "plaid", trade: false, auth: "manual_session" })]).join(" "), /auth manual_session does not fit a plaid route/);
  for (const r of rows.filter(r => r.route === "browser_assisted")) assert.equal(r.auth, "manual_session", r.id);
});
test("[S10] the route is the one the research names best (native API > SnapTrade > Plaid > manual)", () => {
  assert.deepEqual(BC.validate(rows), []); assert.deepEqual(BC.contradictions(rows), []);
  const wrong = mock({ route: "plaid", trade: false, auth: "aggregator", research: { best_route: "SnapTrade (trading)", plaid: "covered" } });
  assert.deepEqual(BC.contradictions([wrong]).map(x => x.kind), ["route"]);
  const order = Object.keys(BC.ROUTES);
  assert.deepEqual(order, ["native_api", "snaptrade", "plaid", "browser_assisted", "none"]);
});
test("[S11] an off platform is found as itself, never connected through the account it shares", () => {
  const f = BC.find(rows, "connect my forecastex");
  assert.equal(f.id, "forecastex"); assert.equal(f.via, undefined);
  assert.equal(BC.connectAnswer(rows, "connect my forecastex").state, "blocked");
  assert.equal(BC.connectAnswer(rows, "link my etoro crypto").state, "blocked");
  assert.equal(BC.find(rows, "connect my ellevest").id, "betterment", "a shared row that is not off connects through its parent");
});
test("[S12] a platform's name counts only as a whole word", () => {
  assert.equal(BC.find(rows, "I really want to link something"), null);
  assert.equal(BC.find(rows, "the m1a1 tank"), null);
  assert.equal(BC.find(rows, "I use Ally for savings").id, "ally-invest");
});
test("[S13] every platform is found by its own full name, punctuation and all", () => {
  for (const r of rows) {
    const want = r.blocked_reason ? r.id : (r.same_account_as || r.id);
    for (const a of [r.platform].concat(r.aliases || [])) { const f = BC.find(rows, `connect my ${a}`); assert.equal(f && f.id, want, `${r.id}: "${a}"`); }
  }
  assert.equal(BC.connectAnswer(rows, "connect my ForecastEx (Interactive Brokers)").state, "blocked");
  assert.equal(BC.connectAnswer(rows, "connect my eToro (crypto + stocks)").state, "blocked");
});
test("[S14] a route with no adapter, or a step the adapter lacks, is NOT_WIRED; a failing adapter is a clean error", async () => {
  const bare = await BC.adapterFor(row("charles-schwab"), {}).connect({});
  assert.equal(bare.code, "not_wired"); assert.match(bare.text, /^NOT_WIRED: Charles Schwab through direct connection is not switched on yet \(no adapter or keys\)\. Nothing was connected\.$/);
  const noStep = await BC.adapterFor(row("charles-schwab"), { adapters: { native_api: { verify: async () => ({ ok: true }) } } }).connect({});
  assert.equal(noStep.code, "not_wired"); assert.match(noStep.text, /the connect step is not built/);
  const broken = await BC.adapterFor(row("alpaca"), { adapters: { native_api: { verify: async () => { throw new Error("401 token revoked"); } } } }).verify({});
  assert.deepEqual(broken, { ok: false, code: "failed", text: "Alpaca: 401 token revoked" });
});
test("[S15] an off platform connects nothing and its adapter is never called", async () => {
  const c = counting();
  for (const id of ["kalshi", "coinbase", "robinhood-crypto"]) {
    const a = BC.adapterFor(row(id), { adapters: { native_api: c.impl, snaptrade: c.impl, plaid: c.impl } });
    const r = await a.connect({});
    assert.equal(r.code, "blocked", id); assert.match(r.text, /isn't available in Upmore, so nothing was connected\.$/);
    assert.equal((await a.placeOrder({}, { estimated_cents: 100, approval })).code, "blocked", id);
  }
  assert.equal(c.calls, 0);
});
test("[S16] a track-only platform never places an order, even when its row wrongly claims trading", async () => {
  const c = counting();
  for (const r of [row("fidelity"), mock({ route: "plaid", auth: "aggregator", trade: true })]) {
    const o = await BC.adapterFor(r, { adapters: { plaid: c.impl } }).placeOrder({}, { estimated_cents: 100, approval });
    assert.equal(o.code, "read_only"); assert.match(o.text, /is track-only in Upmore, so I can't place orders there\. Nothing was placed\.$/);
  }
  assert.equal(c.calls, 0);
});
test("[S17] every order needs the person's yes on its own card", async () => {
  const c = counting(), a = BC.adapterFor(row("alpaca"), { adapters: { native_api: c.impl } });
  for (const ap of [undefined, {}, { approved: true }, { approved: "yes", id: "mock-card-1" }, { approved: 1, id: "mock-card-1" }, { approved: true, id: "" }]) assert.equal((await a.placeOrder({}, { estimated_cents: 100, approval: ap })).code, "needs_approval", JSON.stringify(ap));
  assert.equal(c.calls, 0);
  assert.equal((await a.placeOrder({}, { estimated_cents: 100, approval })).ok, true);
});
test("[S18] the per-order cap is $5.00 in cents, checked before the adapter", async () => {
  const c = counting(), a = BC.adapterFor(row("alpaca"), { adapters: { native_api: c.impl } });
  assert.equal(BC.DEFAULT_CAP_CENTS, 500);
  const over = await a.placeOrder({}, { estimated_cents: 501, approval });
  assert.equal(over.code, "order_cap"); assert.match(over.text, /limited to \$5\.00 each/);
  assert.equal((await a.placeOrder({}, { estimated_cents: 50000, approval })).code, "order_cap");
  for (const e of [0, -5, 1.5, NaN, "400"]) assert.equal((await a.placeOrder({}, { estimated_cents: e, approval })).code, "amount_unknown", String(e));
  assert.equal(c.calls, 0);
  assert.equal((await a.placeOrder({}, { estimated_cents: 500, approval })).ok, true);
});
test("[S19] a host cap that is not a positive whole number of cents falls back to $5", async () => {
  for (const cap of [Infinity, "100000", -1, 0, 2.5, null]) {
    const c = counting(), a = BC.adapterFor(row("alpaca"), { adapters: { native_api: c.impl }, order_cap_cents: cap });
    assert.equal((await a.placeOrder({}, { estimated_cents: 501, approval })).code, "order_cap", String(cap));
    assert.equal(c.calls, 0, String(cap));
  }
});
test("[S20] only a platform a person can actually connect gets the connect card, in the reference design's words", () => {
  const al = BC.connectAnswer(rows, "connect my alpaca");
  assert.deepEqual([al.state, al.card, al.text], ["connect", "alpaca", "Not connected yet - here's the link."]);
  for (const m of ["connect my fidelity", "connect my sofi invest", "connect my schwab", "connect my fundrise", "connect my kalshi", "connect my blockfi"]) {
    const a = BC.connectAnswer(rows, m); assert.ok(a, m); assert.equal(a.card, undefined, m); assert.doesNotMatch(a.text, /here's the link/, m);
  }
});
test("[ADV] sloppy or loaded words never connect an off platform or promise a link it can't give", () => {
  for (const m of ["pls hook up my KALSHI!!!", "can you link my Polymarket?", "connect my robinhood crypto", "set up my coinbase.", "connect my PredictIt"]) {
    const a = BC.connectAnswer(rows, m); assert.equal(a && a.state, "blocked", m); assert.equal(a.card, undefined, m);
  }
  assert.equal(BC.connectAnswer(rows, "what's my balance"), null);
  assert.match(BC.connectAnswer(rows, "connect my fundrise").text, /Upmore can't connect Fundrise yet: .*secure window where you log in yourself.*Nothing was connected\.$/);
});
