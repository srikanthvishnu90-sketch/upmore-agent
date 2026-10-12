// The connector model, one sub-capability at a time (docs/depth/CONNECTORS.md): packages/domain/51-connectors.js
// (Connectors, Instinct spec doc 04) is the pure half of every source: an adapter with five verbs (connect, sync, act,
// health, revoke), consent as a record in plain words, one canonical schema stamped with source and as-of, source
// ranking that reports conflicts, health that says one calm thing, act() behind the autonomy and compliance gates, and
// revoke that destroys the token handle. Not reachable in production today: no edge function or app path loads it (the
// live chat's connectors are `liveConnectors` in supabase/functions/_shared/flow_router.ts, which answer NOT_WIRED, and
// the connector matrix in 77-brokerage-connectors.js). Its three reference adapters (a fake aggregator, a manual CSV
// reader and a sandbox OAuth stub) are fixtures, never a live source. It loads with 33-agent-monitors.js (merchantKey),
// 43-agent-loop.js (the autonomy gate) and 53-compliance.js (the partner and KYC gate), the modules it needs.
// One test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Rows, adapters and secrets are MOCK.
// Check: node --test tests/depth-CONNECTORS.test.cjs && node evals/depth/run.cjs CONNECTORS
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const load = files => { const ctx = vm.createContext({}); vm.runInContext(files.map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n") + "\nthis.C = Connectors;", ctx); return ctx.C; };
const C = load(["33-agent-monitors.js", "43-agent-loop.js", "53-compliance.js", "51-connectors.js"]);
const plain = x => JSON.parse(JSON.stringify(x));
const T0 = 1700000000000;
const MOCK_BANK = { accounts: [{ id: "mock-chk", name: "Mock Checking", type: "checking", balance: 4212.08, available: 4100, mask: "004471" }],
  transactions: [{ id: "mock-t1", account_id: "mock-chk", date: "2026-10-09", amount: -15.49, name: "NETFLIX.COM" }, { id: "mock-t2", account_id: "mock-chk", date: "2026-10-08", amount: -6.24, name: "SQ *TRADER JOE S AUSTIN TX" }] };
const setup = (fixture, o) => {
  let t = T0; const destroyed = [], put = [];
  const store = C.create(Object.assign({ clock: () => t, vault: { put: (id, secret) => { put.push([id, secret]); return { handle: "vh_" + id }; }, destroy: id => { destroyed.push(id); return true; } } }, o));
  const agg = C.fakeAggregator(fixture || MOCK_BANK); store.register(agg);
  return { store, agg, destroyed, put, tick: ms => { t += ms; }, now: () => t };
};
const LIVE = { partners: { money_movement: { live: true, name: "Mock Partner" } }, kyc: { state: "verified" } };
const PAY009 = { id: "PAY-009", name: "transfer between own accounts", tier: "T3", status: "TESTED" };
const MOVE = { scope: "INITIATE_TRANSFER", amount_cents: 500, recipient: "mock-sav" };
const writable = async s => { const rec = await s.store.connect("fake-aggregator", "mock-user", {}, ["READ_BALANCES", "INITIATE_TRANSFER"], { write_consent: true }); await s.store.sync(rec.id); return rec; };

test("[S01] an adapter has all five verbs, a known way to sign in and known scopes; a stored password is not a way in", () => {
  const verbs = { connect() {}, sync() {}, act() {}, health() {}, revoke() {} };
  assert.equal(C.validateAdapter(Object.assign({ provider: "mock", authMethod: "OAUTH", scopes: ["READ_BALANCES"] }, verbs)), true);
  assert.throws(() => C.validateAdapter({ provider: "half", authMethod: "OAUTH", connect() {}, sync() {}, act() {}, health() {} }), /^Error: adapter half lacks revoke$/);
  assert.throws(() => C.validateAdapter(Object.assign({ provider: "vaulted", authMethod: "VAULTED_CREDENTIALS" }, verbs)), /invalid authMethod VAULTED_CREDENTIALS/);
  assert.throws(() => C.validateAdapter(Object.assign({ provider: "greedy", authMethod: "OAUTH", scopes: ["READ_EVERYTHING"] }, verbs)), /unknown scope READ_EVERYTHING/);
  assert.deepEqual([...C.AUTH], ["AGGREGATOR", "OAUTH", "PERSONAL_API_KEY", "LIVE_SESSION", "MANUAL"]);
});

test("[S02] consent is a record in plain words: read-only by default; moving money needs its own grant and a yes each time", () => {
  const r = plain(C.consentRecord(["READ_BALANCES", "READ_TRANSACTIONS"], { now: T0 }));
  assert.equal(r.text, "Upmore can see your balances, see your transactions. Data is kept while the connection is active and for 90 days after, then deleted. You can revoke at any time; revoking deletes the token, stops syncs and tells you what is retained and why.");
  assert.deepEqual([r.read_only, r.granted_at], [true, T0]);
  assert.throws(() => C.consentRecord(["READ_BALANCES", "INITIATE_TRANSFER"], {}), /write scopes need their own consent grant/);
  const w = plain(C.consentRecord(["INITIATE_TRANSFER"], { write_consent: true }));
  assert.deepEqual([w.text.slice(0, 104), w.read_only], ["Upmore can move money between your own accounts or to people you approve, each time you confirm. Data is", false]);
});

test("[S03] connecting vaults the token as a handle; the secret is never in the record or the audit; a handoff waits for the person", async () => {
  const s = setup();
  const rec = plain(await s.store.connect("fake-aggregator", "mock-user", { public_token: "mock-public" }));
  assert.deepEqual([rec.status, rec.token_handle, rec.scopes], ["HEALTHY", "vh_conn_001", ["READ_BALANCES", "READ_TRANSACTIONS"]]);
  assert.deepEqual(s.put, [["conn_001", "agg-access-token-mock-user"]]);
  assert.ok(!JSON.stringify(rec).includes("agg-access-token") && !JSON.stringify(s.store.audit).includes("agg-access-token"));
  await assert.rejects(s.store.connect("fake-aggregator", "mock-user", {}, ["PLACE_ORDER"]), /fake-aggregator does not offer scope PLACE_ORDER/);
  s.store.register(C.stubOAuth());
  const h = await s.store.connect("sandbox-oauth", "mock-user", {});
  assert.deepEqual([h.status, h.token_handle, h.handoff.instruction], ["NEEDS_REAUTH", null, "Approve read-only access in the provider's window; nothing is stored by Upmore until you return."]);
});

test("[S04] a sync lands in one schema: merchant keys at ingest, and every datum stamped with its source, sign-in kind and as-of", async () => {
  const s = setup(); const rec = await s.store.connect("fake-aggregator", "mock-user", {}); s.tick(5000);
  const b = plain(await s.store.sync(rec.id));
  assert.deepEqual(b.accounts[0], { account_id: "mock-chk", name: "Mock Checking", kind: "checking", mask: "4471", balance_cents: 421208, available_cents: 410000, currency: "USD", connector_id: "conn_001", source: "fake-aggregator", auth: "AGGREGATOR", as_of: T0 + 5000 });
  assert.deepEqual(b.transactions.map(t => [t.merchant_key, t.amount_cents, t.posted_on, t.as_of, t.source]), [["netflix com", -1549, "2026-10-09", T0 + 5000, "fake-aggregator"], ["trader joe s austin tx", -624, "2026-10-08", T0 + 5000, "fake-aggregator"]]);
  assert.equal(b.as_of, T0 + 5000);
});

test("[S05] a missing balance, available amount, price, cost basis or bill amount stays unknown, never $0.00", () => {
  const a = plain(C.normalizeAccount({ id: "mock-card", name: "Mock Card", type: "credit", balance: null, available: null }));
  assert.deepEqual([a.balance_cents, a.available_cents], [null, null], "Plaid sends available: null for most cards; it read as $0.00 available");
  assert.deepEqual([C.normalizeAccount({ id: "x", balance: 12.5 }).balance_cents, C.normalizeAccount({ id: "x", balance: 0, available: 0 }).available_cents], [1250, 0], "a real zero is still zero");
  const h = plain(C.normalizeHolding({ account_id: "mock-brk", symbol: "VTI", quantity: 10, price: 300, cost_basis: null }));
  assert.deepEqual([h.price_cents, h.cost_cents], [30000, null], "no basis on file was a $0.00 basis: the whole sale read as gain");
  assert.equal(C.normalizeHolding({ account_id: "mock-brk", symbol: "VTI", quantity: 1 }).price_cents, null);
  assert.equal(C.normalizeBill({ id: "mock-b1", payee: "Mock Power", due: "2026-10-20" }).amount_cents, null);
});

test("[S06] a transaction keeps its currency; a 45.00 EUR charge is not $45.00", () => {
  const t = plain(C.normalizeTransaction({ id: "mock-t9", account_id: "mock-chk", date: "2026-10-09", amount: -45, name: "CAFE DE FLORE PARIS", iso_currency_code: "EUR" }));
  assert.deepEqual([t.amount_cents, t.currency], [-4500, "EUR"]);
  assert.equal(C.normalizeTransaction({ id: "x", account_id: "a", date: "2026-10-09", amount: -1, name: "x", currency: "CAD" }).currency, "CAD");
  assert.equal(C.normalizeTransaction({ id: "x", account_id: "a", date: "2026-10-09", amount: -1, name: "x" }).currency, "USD");
  assert.equal(C.normalizeAccount({ id: "mock-eur", balance: 10, iso_currency_code: "EUR" }).currency, "EUR");
});

test("[S07] the CSV the person uploads at connect is the CSV the sync reads", async () => {
  const store = C.create({ clock: () => T0 }); store.register(C.manualCsv());
  const rec = await store.connect("manual-csv", "mock-user", "date,amount,description\n2026-10-01,-4.75,Starbucks\n2026-10-02,-15.49,Netflix");
  const s = plain(await store.sync(rec.id));
  assert.deepEqual(s.transactions.map(t => [t.transaction_id, t.posted_on, t.amount_cents, t.merchant_key]), [["csv-1", "2026-10-01", -475, "starbucks"], ["csv-2", "2026-10-02", -1549, "netflix"]], "the upload was dropped and the sync read nothing");
  assert.equal(store.describe()[0].consent, "Upmore can see your transactions. Data is kept while the connection is active and for 90 days after, then deleted. You can revoke at any time; revoking deletes the token, stops syncs and tells you what is retained and why.");
});

test("[S08] a bank's CSV with a quoted comma or a formatted amount reads the row it says", async () => {
  const store = C.create({ clock: () => T0 }); store.register(C.manualCsv());
  const rec = await store.connect("manual-csv", "mock-user", "Date,Description,Amount\r\n2026-10-01,\"STARBUCKS, SEATTLE WA\",-5.40\r\n2026-10-03,\"MOCK \"\"BEST\"\" RENT\",\"-1,850.00\"\r\n2026-10-04,PAYROLL,$3250.00");
  const s = plain(await store.sync(rec.id));
  assert.deepEqual(s.transactions.map(t => [t.merchant_raw, t.amount_cents]), [["STARBUCKS, SEATTLE WA", -540], ["MOCK \"BEST\" RENT", -185000], ["PAYROLL", 325000]]);
});

test("[S09] revoking destroys the token, stops syncs and acts, and states what is kept and until when", async () => {
  const s = setup(); const rec = await writable(s); s.tick(60000);
  const r = plain(await s.store.revoke(rec.id, "person asked"));
  assert.deepEqual(s.destroyed, ["conn_001"]);
  assert.deepEqual(r, { status: "REVOKED", retention_note: "Token destroyed and syncs stopped on 2023-11-14T22:14:20.000Z. Retained: transactions and balances already synced, for 90 days, so your history and receipts stay readable; then deleted. Nothing new is read." });
  await assert.rejects(s.store.sync(rec.id), /conn_001 is revoked; syncs are stopped/);
  assert.deepEqual(plain(await s.store.health(rec.id)), { status: "REVOKED", message: null });
  const a = plain(await s.store.act(rec.id, PAY009, Object.assign({ confirmed: true }, MOVE), LIVE));
  assert.deepEqual([a.reached_adapter, a.reason], [false, "connector_revoked"]);
});

test("[S10] a sync that breaks is named for what broke: sign-in needed, provider slow or a bad batch; a good sync heals", async () => {
  const s = setup(); const rec = await s.store.connect("fake-aggregator", "mock-user", {});
  s.agg.failNext("reauth"); assert.deepEqual(plain(await s.store.sync(rec.id)), { ok: false, status: "NEEDS_REAUTH", error: "ITEM_LOGIN_REQUIRED" });
  assert.equal(s.store.events[0].message, "fake-aggregator needs you to sign in again. One tap here relinks it; nothing else changes.");
  s.agg.failNext("timeout"); assert.equal((await s.store.sync(rec.id)).status, "STALE");
  s.agg.failNext("corrupt"); assert.deepEqual(plain(await s.store.sync(rec.id)), { ok: false, status: "BROKEN", error: "batch failed validation" });
  assert.equal((await s.store.sync(rec.id)).status, "HEALTHY");
  assert.deepEqual(["invalid_grant", "MFA required", "provider returned 503", "account 4471 not found"].map(m => C.classify(new Error(m)).status), ["NEEDS_REAUTH", "NEEDS_REAUTH", "STALE", "BROKEN"]);
  // An outage is the HTTP status, not any number from 500 to 599 in the words: "account 512 not found" is a broken request.
  assert.deepEqual(["account 512 not found", "order 599 rejected: insufficient buying power", "Request failed with status code 502", "HTTP/1.1 500 Internal Server Error", "502 Bad Gateway", "status: 504"].map(m => C.classify(new Error(m)).status),
    ["BROKEN", "BROKEN", "STALE", "STALE", "STALE", "STALE"], "\"account 512 not found\" was read as the provider being down");
  assert.deepEqual([C.classify(Object.assign(new Error("upstream said no"), { status: 503 })).status, C.classify(Object.assign(new Error("account 512 not found"), { status: 404 })).status], ["STALE", "BROKEN"]);
});

test("[S11] sign-in trouble is said once calmly, escalated once, then never again", async () => {
  const s = setup(); const rec = await s.store.connect("fake-aggregator", "mock-user", {});
  for (let i = 0; i < 4; i++) { s.agg.failNext("reauth"); await s.store.sync(rec.id); }
  assert.deepEqual(plain(s.store.events).map(e => [e.message, e.escalated]), [["fake-aggregator needs you to sign in again. One tap here relinks it; nothing else changes.", false],
    ["fake-aggregator still needs a fresh sign-in; the data from it is getting old. Relink when you can.", true]]);
  assert.equal(s.store.audit.filter(e => e.kind === "reauth_suppressed").length, 2);
});

test("[S12] data older than twice its cadence is stale; exactly twice is not yet; the last good sync's age is known", async () => {
  const s = setup(); const rec = await s.store.connect("fake-aggregator", "mock-user", {}); await s.store.sync(rec.id);
  s.tick(2 * 86400000);
  assert.deepEqual(plain(await s.store.health(rec.id)), { status: "HEALTHY", changed: false, message: null, degraded: false, last_good_age_ms: 2 * 86400000 });
  s.tick(1);
  const h = plain(await s.store.health(rec.id));
  assert.deepEqual([h.status, h.changed, h.degraded, h.message], ["STALE", true, true, null]);
});

test("[S13] act(): a T5 never reaches the adapter, a T3 needs the person's yes, and a T4 inside an envelope still asks (envelope autonomy is off)", async () => {
  const s = setup(); const rec = await writable(s);
  const t5 = plain(await s.store.act(rec.id, { id: "PAY-002", name: "send to a new recipient", tier: "T5", status: "TESTED" }, Object.assign({ confirmed: true }, MOVE), LIVE));
  assert.deepEqual([t5.reached_adapter, t5.reason], [false, "t5_never_autonomous"]);
  assert.deepEqual(plain(await s.store.act(rec.id, PAY009, MOVE, LIVE)).reason, "needs_confirmation");
  const env = [{ id: "mock-env", capability_id: "PAY-009", max_cents: 10000 }];
  const t4 = plain(await s.store.act(rec.id, Object.assign({}, PAY009, { tier: "T4" }), MOVE, Object.assign({ envelopes: env }, LIVE)));
  assert.deepEqual([t4.reached_adapter, t4.reason], [false, "needs_confirmation"]);
  const ok = plain(await s.store.act(rec.id, PAY009, Object.assign({ confirmed: true }, MOVE), LIVE));
  assert.deepEqual([ok.reached_adapter, ok.result.reference, ok.result.token_handle_seen], [true, "agg-ref-500", "vh_conn_001"]);
});

test("[S14] act() fails closed when the compliance gate is missing, and refuses a money move with no live partner", async () => {
  const s = setup(); const rec = await writable(s);
  const none = plain(await s.store.act(rec.id, PAY009, Object.assign({ confirmed: true }, MOVE), { partners: {} }));
  assert.deepEqual([none.reached_adapter, none.reason], [false, "compliance:no_live_partner"]);
  assert.match(none.message, /^I can't move money on a real rail yet: that needs a licensed money-movement partner/);
  const bare = load(["33-agent-monitors.js", "43-agent-loop.js", "51-connectors.js"]);
  const store = bare.create({ clock: () => T0 }); const agg = bare.fakeAggregator(MOCK_BANK); store.register(agg);
  const r2 = await store.connect("fake-aggregator", "mock-user", {}, ["READ_BALANCES", "INITIATE_TRANSFER"], { write_consent: true }); await store.sync(r2.id);
  const open = plain(await store.act(r2.id, PAY009, Object.assign({ confirmed: true }, MOVE), {}));
  assert.deepEqual([open.reached_adapter, open.reason], [false, "no_compliance_gate"], "with 53-compliance.js not loaded, a confirmed $5.00 transfer reached the adapter");
});

test("[S15] every write needs the person's yes, whatever tier or gate the caller brings", async () => {
  const s = setup(); const rec = await writable(s);
  const t1 = plain(await s.store.act(rec.id, Object.assign({}, PAY009, { tier: "T1" }), MOVE, LIVE));
  assert.deepEqual([t1.reached_adapter, t1.reason], [false, "needs_confirmation"], "a capability mislabeled T1 moved money with no yes");
  const lax = plain(await s.store.act(rec.id, PAY009, MOVE, Object.assign({ autonomy: () => ({ allowed: true, confirm: false }) }, LIVE)));
  assert.deepEqual([lax.reached_adapter, lax.reason], [false, "needs_confirmation"]);
  const t5 = plain(await s.store.act(rec.id, { id: "PAY-002", name: "send to a new recipient", tier: "T5", status: "TESTED" }, Object.assign({ confirmed: true }, MOVE), Object.assign({ autonomy: () => ({ allowed: true, confirm: false }) }, LIVE)));
  assert.deepEqual([t5.reached_adapter, t5.reason], [false, "t5_never_autonomous"], "a T5 is never decided in act(), whatever gate is passed in");
  assert.equal(plain(await s.store.act(rec.id, PAY009, Object.assign({ confirmed: true }, MOVE), Object.assign({ autonomy: () => ({ allowed: false, reason: "mock_block" }) }, LIVE))).reason, "mock_block");
});

test("[S16] act() refuses a read scope, a scope never granted and a connection that is not healthy, before any adapter call", async () => {
  const s = setup(); const rec = await writable(s);
  assert.equal(plain(await s.store.act(rec.id, PAY009, { scope: "READ_BALANCES", confirmed: true }, LIVE)).reason, "not_a_write_scope");
  const ro = await s.store.connect("fake-aggregator", "mock-user-2", {}); await s.store.sync(ro.id);
  assert.equal(plain(await s.store.act(ro.id, PAY009, Object.assign({ confirmed: true }, MOVE), LIVE)).reason, "scope_not_granted");
  s.agg.failNext("reauth"); await s.store.sync(rec.id);
  const r = plain(await s.store.act(rec.id, PAY009, Object.assign({ confirmed: true }, MOVE), LIVE));
  assert.deepEqual([r.reached_adapter, r.reason], [false, "connector_needs_reauth"]);
  assert.ok(!s.store.audit.some(e => e.kind === "act"), "nothing reached the adapter");
});

test("[S17] a code, PIN, passcode or card number in an action never lands in the audit log; ordinary fields stay readable", async () => {
  const s = setup(); const rec = await writable(s);
  const action = Object.assign({ confirmed: true, mfa_code: "481516", card_pin: "4321", passcode: "mock-pass-9", verification_code: "777111", card_number: "4111111111111111", account_number: "000123456789", cvv: "123", currency_code: "USD" }, MOVE);
  await s.store.act(rec.id, PAY009, action, LIVE);
  const log = JSON.stringify(s.store.audit);
  for (const secret of ["481516", "4321", "mock-pass-9", "777111", "4111111111111111", "000123456789", "\"123\""]) assert.ok(!log.includes(secret), secret);
  const entry = s.store.audit.find(e => e.kind === "act");
  assert.deepEqual([entry.action.amount_cents, entry.action.currency_code, entry.action.recipient, entry.action.mfa_code], [500, "USD", "mock-sav", "[redacted]"]);
});

test("[S18] conflicting sources follow the ranking per datum and are reported in dollars with each source's as-of, never merged", () => {
  // As-of values are sync times, as sync() stamps them (they were 5, 3 and 4 here: the order is kept, now on real clock times).
  const r = plain(C.resolve("balance", [{ source: "mock-manual", auth: "MANUAL", value: 400000, as_of: T0 + 7200000 }, { source: "mock-plaid", auth: "AGGREGATOR", value: 421208, as_of: T0 }, { source: "mock-session", auth: "LIVE_SESSION", value: 418000, as_of: T0 + 3600000 }]));
  assert.deepEqual([r.value, r.winner, r.conflict], [421208, { source: "mock-plaid", auth: "AGGREGATOR", as_of: T0 }, true]);
  // It read "Sources disagree: mock-plaid says 421208, mock-session says 418000, mock-manual says 400000." (raw cents, no as-of).
  assert.equal(r.statement, "Sources disagree: mock-plaid says $4,212.08 as of 2023-11-14 22:13 UTC, mock-session says $4,180.00 as of 2023-11-14 23:13 UTC, mock-manual says $4,000.00 as of 2023-11-15 00:13 UTC. Using mock-plaid (AGGREGATOR), the source of truth for balances.");
  assert.equal(plain(C.resolve("bill", [{ source: "mock-biller", auth: "OAUTH", value: 8400, as_of: "2026-10-12" }, { source: "mock-csv", auth: "MANUAL", value: 9000 }])).statement, "Sources disagree: mock-biller says $84.00 as of 2026-10-12, mock-csv says $90.00 as of an unknown time. Using mock-biller (OAUTH), the source of truth for bills.");
  assert.equal(plain(C.resolve("holding", [{ source: "mock-broker", auth: "OAUTH", value: 10, as_of: T0 }, { source: "mock-plaid", auth: "AGGREGATOR", value: 9.5, as_of: T0 }])).statement, "Sources disagree: mock-broker says 10 as of 2023-11-14 22:13 UTC, mock-plaid says 9.5 as of 2023-11-14 22:13 UTC. Using mock-broker (OAUTH), the source of truth for holdings.", "a share count is not dollars");
  const h = plain(C.resolve("holding", [{ source: "mock-plaid", auth: "AGGREGATOR", value: 10, as_of: 9 }, { source: "mock-broker", auth: "OAUTH", value: 10, as_of: 1 }]));
  assert.deepEqual([h.winner.source, h.conflict, h.statement], ["mock-broker", false, null]);
  assert.deepEqual(plain(C.resolve("bill", [])), { value: null, winner: null, conflict: false, readings: [] });
});

test("[S21] a sign-in that is needed stays needed until a sync succeeds; a health ping that answers OK does not clear it", async () => {
  const s = setup(); const rec = await writable(s);
  s.agg.failNext("reauth"); await s.store.sync(rec.id);
  const ping = plain(await s.store.health(rec.id));
  assert.deepEqual([ping.status, ping.changed, ping.degraded, ping.message], ["NEEDS_REAUTH", false, true, null], "the provider's OK ping turned NEEDS_REAUTH into HEALTHY with no sync");
  assert.equal(s.store.records.get(rec.id).status, "NEEDS_REAUTH");
  assert.equal(s.store.events.length, 1, "still one calm message, none added by the ping");
  const act = plain(await s.store.act(rec.id, PAY009, Object.assign({ confirmed: true }, MOVE), LIVE));
  assert.deepEqual([act.reached_adapter, act.reason], [false, "connector_needs_reauth"], "after the ping, a confirmed $5.00 transfer reached the adapter on a connection still needing sign-in");
  assert.equal((await s.store.sync(rec.id)).status, "HEALTHY");
  assert.equal(plain(await s.store.health(rec.id)).status, "HEALTHY", "a successful sync clears it");
  s.store.register(C.stubOAuth());
  const h = await s.store.connect("sandbox-oauth", "mock-user", {});
  assert.equal(plain(await s.store.health(h.id)).status, "NEEDS_REAUTH", "a handoff the person has not finished is not healthy because the provider answers");
});

test("[S19] a sync is due on a webhook first, then on the class cadence; exactly one cadence later is due", () => {
  assert.deepEqual(plain(C.due({ lastSyncAt: 1000 }, "banking", 2000, true)), { due: true, why: "webhook" });
  assert.deepEqual(plain(C.due({ lastSyncAt: null }, "balances", 1000, false)), { due: true, why: "never synced" });
  assert.deepEqual(plain(C.due({ lastSyncAt: 1000 }, "balances", 1000 + 900000, false)), { due: true, why: "cadence" });
  assert.deepEqual(plain(C.due({ lastSyncAt: 1000 }, "balances", 1000 + 899999, false)), { due: false, next_at: 901000 });
});

test("[S20] \"what are you connected to\" is read from the records: status, scopes, consent and how reliable each kind is", async () => {
  const s = setup(); s.store.register(C.manualCsv());
  const rec = await s.store.connect("fake-aggregator", "mock-user", {});
  await s.store.connect("manual-csv", "mock-user", "date,amount,description");
  s.store.adapters.set("mock-session", Object.assign(C.manualCsv(), { provider: "mock-session", authMethod: "LIVE_SESSION" }));
  await s.store.connect("mock-session", "mock-user", "");
  const d = plain(s.store.describe());
  assert.deepEqual(d.map(x => [x.id, x.provider, x.status, x.reliability]), [["conn_001", "fake-aggregator", "HEALTHY", "high"], ["conn_002", "manual-csv", "HEALTHY", "exact (user-entered)"], ["conn_003", "mock-session", "HEALTHY", "low (a live session the person logs into; least reliable class)"]]);
  assert.deepEqual([d[0].scopes, d[0].last_success_at, d[0].retention_note], [["READ_BALANCES", "READ_TRANSACTIONS"], null, null]);
  await s.store.sync(rec.id); assert.equal(s.store.describe()[0].last_success_at, T0);
});
