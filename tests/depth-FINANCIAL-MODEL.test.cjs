// Bank facts as Upmore keeps them (docs/depth/FINANCIAL-MODEL.md): packages/domain/37-agent-financial-model.js turns
// the SimpleFIN proxy's response into accounts and transactions in exact signed cents (USD only; other currencies keep
// their raw text), refuses a batch it cannot trust as a whole, links a pending row to its posted row by the provider's
// own reference, infers a possible bill from three repeated posted debits (asserted, never verified), and sums linked
// cash from fresh, classified USD accounts next to recorded bills. Reached in production through
// supabase/functions/_shared/financial_service.ts: agent-workflows "sync_finances" (normalizeSimplefin, inferObligations)
// and "financial_context", and agent-chat's financial planner tool get_cash_position (cashSummary).
// It loads with 33-agent-monitors.js (addMonths, addDays) and 36-agent-workflows.js (date, moneyToCents, stableJson).
// One test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Every account, transaction and bill is MOCK.
// Check: node --test tests/depth-FINANCIAL-MODEL.test.cjs && node evals/depth/run.cjs FINANCIAL-MODEL
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const ctx = vm.createContext({});
vm.runInContext(["33-agent-monitors.js", "36-agent-workflows.js", "37-agent-financial-model.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n") + "\nthis.F = AgentFinancialModel;", ctx);
const { F } = ctx;
const plain = x => JSON.parse(JSON.stringify(x));
const FETCHED = "2026-10-12T18:00:00Z", T = "2026-10-12", NOW = "2026-10-12T18:30:00Z";
const epoch = iso => Date.parse(iso) / 1000;
const acct = o => Object.assign({ id: "mock-chk", name: "MOCK Checking", currency: "USD", balance: "1200.50", available_balance: "1100.25", balance_date: epoch("2026-10-12T17:00:00Z"), institution: "Mock Bank" }, o);
const raw = o => Object.assign({ id: "mock-t1", account_id: "mock-chk", posted_at: "2026-10-12", amount: "-15.49", merchant_raw: "NETFLIX.COM", is_pending: false }, o);
const sync = (accounts, transactions, extra, meta) => plain(F.normalizeSimplefin(Object.assign({ accounts, transactions, errlist: [] }, extra), Object.assign({ fetched_at: FETCHED, requested_start: "2026-07-14", requested_end: T }, meta)));
let n = 0;
const row = o => Object.assign({ account_id: "simplefin:mock-chk", provider_transaction_id: `mock-r${++n}`, currency: "USD", amount_cents: -1549, posted_on: "2026-08-15",
  merchant_raw: "NETFLIX.COM", merchant_key: "netflix com", is_pending: false, is_transfer: false, presence: "observed", fetched_at: FETCHED }, o);
const series = (days, o) => days.map(d => row(Object.assign({ posted_on: d }, o)));
const infer = (rows, today) => plain(F.inferObligations(rows, today || T, FETCHED));
const bills = (rows, today) => infer(rows, today).map(b => [b.amount_due_cents, b.due_on, b.evidence.interval]);
const cash = o => Object.assign({ account_id: "simplefin:mock-chk", account_kind: "checking", currency: "USD", available_cents: 110025, balance_as_of: "2026-10-12T17:00:00.000Z", status: "active", sync_error: false }, o);
const summary = (accounts, obligations, prefs, now) => plain(F.cashSummary(accounts, obligations || [], now || NOW, prefs || []));

test("[S01] a bank amount becomes exact signed cents; text it cannot read is unknown, never $0", () => {
  const read = { "-12.34": -1234, "12.3": 1230, "-$5.00": -500, "  -7.10 ": -710, "0.5": 50, "-1234567.89": -123456789 };
  for (const [text, cents] of Object.entries(read)) assert.equal(F.signedCents(text, "USD"), cents, text);
  for (const text of ["1,234.56", "-12.345", "+5.00", "", "-.50", "abc"]) assert.equal(F.signedCents(text, "USD"), null, text);
  assert.equal(F.signedCents(null, "USD"), null);
});

test("[S02] an account keeps the bank's balance, available amount and the bank's own as-of time", () => {
  const a = sync([acct()], []).accounts[0];
  assert.deepEqual([a.account_id, a.provider, a.name, a.currency, a.account_kind, a.balance_cents, a.available_cents, a.balance_as_of, a.raw_balance, a.institution, a.fetched_at],
    ["simplefin:mock-chk", "simplefin", "MOCK Checking", "USD", "unknown", 120050, 110025, "2026-10-12T17:00:00.000Z", "1200.50", "Mock Bank", "2026-10-12T18:00:00.000Z"]);
});

test("[S03] an account in another currency keeps its raw amount; nothing is turned into dollars", () => {
  const r = sync([acct(), acct({ id: "mock-eur", currency: "eur", balance: "950.00", available_balance: "900.00" })],
    [raw(), raw({ id: "mock-t2", account_id: "mock-eur", amount: "-20.00", merchant_raw: "MOCK CAFE PARIS" })]);
  const eur = r.accounts[1], t = r.transactions[1];
  assert.deepEqual([eur.currency, eur.balance_cents, eur.available_cents, eur.raw_balance], ["EUR", null, null, "950.00"]);
  assert.deepEqual([t.currency, t.amount_cents, t.raw_amount], ["EUR", null, "-20.00"]);
  assert.ok(r.errors.includes("unsupported_currency:mock-eur:EUR"));
  assert.deepEqual([r.accounts[0].balance_cents, r.transactions[0].amount_cents], [120050, -1549], "the USD account is unaffected");
});

test("[S04] a balance stamped after the fetch is not used as current; one stamped at the fetch is", () => {
  const late = sync([acct({ balance_date: epoch("2026-10-12T18:00:01Z") })], []);
  assert.deepEqual([late.accounts[0].balance_as_of, late.errors.slice(0, 2)], [null, ["future_balance_timestamp:mock-chk", "balance_timestamp_unknown:mock-chk"]]);
  const atFetch = sync([acct({ balance_date: epoch(FETCHED) })], []);
  assert.deepEqual([atFetch.accounts[0].balance_as_of, atFetch.errors], ["2026-10-12T18:00:00.000Z", []]);
});

test("[S05] without the fetch time nothing is kept; the fetch time is never the bank's as-of", () => {
  assert.deepEqual(plain(F.normalizeSimplefin({ accounts: [acct()], transactions: [] }, {})), { ok: false, errors: ["fetch_time_required"], accounts: [], transactions: [] });
  const noDate = sync([acct({ balance_date: undefined })], []);
  assert.deepEqual([noDate.accounts[0].balance_as_of, noDate.errors], [null, ["balance_timestamp_unknown:mock-chk"]]);
});

test("[S06] a repeated or malformed account stops the whole batch; a points account is left out, not fatal", () => {
  const empty = { accounts: [], transactions: [] };
  assert.deepEqual(sync([acct(), acct()], []), Object.assign({ ok: false, errors: ["invalid_or_duplicate_account"] }, empty));
  assert.deepEqual(sync([acct({ id: "bad\nid" })], []), Object.assign({ ok: false, errors: ["invalid_or_duplicate_account"] }, empty));
  // A points account (SimpleFIN allows a URL as a custom currency) is left out and said, never the whole batch (merge
  // review of this packet's notes: one rewards account used to stop every account's sync).
  const pts = sync([acct(), acct({ id: "mock-pts", currency: "https://mock.example/points", balance: "52000" })], [raw(), raw({ id: "mock-p1", account_id: "mock-pts", amount: "500" })]);
  assert.equal(pts.ok, true);
  assert.deepEqual(pts.accounts.map(a => a.provider_account_id), ["mock-chk"]);
  assert.deepEqual(pts.transactions.map(t => t.provider_transaction_id), ["mock-t1"]);
  assert.deepEqual(pts.errors, ["unsupported_currency:mock-pts:custom"]);
  assert.deepEqual(sync([acct(), acct({ id: "mock-pts", currency: "https://mock.example/points" }), acct({ id: "mock-pts", currency: "https://mock.example/points" })], []).errors, ["invalid_or_duplicate_account"], "a repeated id still stops the batch");
});

test("[S07] one transaction id twice on an account stops the batch; the same id on two accounts is two transactions", () => {
  assert.deepEqual(sync([acct()], [raw(), raw({ amount: "-1.00" })]).errors, ["duplicate_transaction_id"]);
  const two = sync([acct(), acct({ id: "mock-sav" })], [raw(), raw({ account_id: "mock-sav" })]);
  assert.deepEqual(two.transactions.map(t => t.account_id), ["simplefin:mock-chk", "simplefin:mock-sav"]);
});

test("[S08] a posted transaction needs a real date; a pending one may not have one yet", () => {
  assert.deepEqual(sync([acct()], [raw({ posted_at: null })]).errors, ["invalid_transaction_identity_or_date"]);
  assert.deepEqual(sync([acct()], [raw({ posted_at: "2026-02-29" })]).errors, ["invalid_transaction_identity_or_date"]);
  const pend = sync([acct()], [raw({ posted_at: null, is_pending: true })]);
  assert.deepEqual([pend.ok, pend.transactions[0].posted_on, pend.transactions[0].is_pending], [true, null, true]);
  assert.equal(sync([acct()], [raw({ posted_at: "2028-02-29" })]).transactions[0].posted_on, "2028-02-29", "a leap day is a real day");
});

test("[S09] a dollar amount the bank wrote unreadably stops the batch instead of becoming $0", () => {
  assert.deepEqual(sync([acct()], [raw({ amount: "-12.345" })]).errors, ["invalid_transaction_amount"]);
  assert.deepEqual(sync([acct()], [raw({ amount: null })]).errors, ["invalid_transaction_amount"]);
});

test("[S10] the bank's own error list stays readable (SimpleFIN 2 objects and older strings); no list is not \"no errors\"", () => {
  const r = sync([acct()], [], { errlist: [{ code: "con.auth", msg: "Reauthenticate with Mock Bank", conn_id: "MOCK-CON" }, "Mock Bank is slow today", {}] });
  assert.deepEqual(r.errors, ["con.auth: Reauthenticate with Mock Bank", "Mock Bank is slow today", "provider_error_unreadable"]);
  assert.deepEqual(sync([acct()], [], { errlist: undefined }).errors, ["provider_error_status_unknown"]);
  assert.equal(sync([acct()], []).coverage_complete, false);
});

test("[S11] AUTOPAY or ZELLE in the bank text never makes a transfer; only the provider's own flag does", () => {
  const r = sync([acct()], [raw({ merchant_raw: "CHASE CREDIT CRD AUTOPAY" }), raw({ id: "mock-t2", merchant_raw: "ZELLE TO MOCK FRIEND" }), raw({ id: "mock-t3", merchant_raw: "MOCK", is_transfer: true })]);
  assert.deepEqual(r.transactions.map(t => t.is_transfer), [false, false, true]);
  assert.deepEqual(r.transactions.map(t => t.merchant_key), ["chase credit crd autopay", "zelle to mock friend", "mock"]);
});

test("[S12] a pending charge links to its posted row only by the provider's reference, on the same account", () => {
  const pending = row({ provider_transaction_id: "mock-p1", is_pending: true, posted_on: null });
  const posted = row({ provider_transaction_id: "mock-x1", pending_provider_id: "mock-p1" });
  assert.deepEqual(plain(F.pendingLinks([pending, posted])), [{ account_id: "simplefin:mock-chk", pending_id: "mock-p1", posted_id: "mock-x1", basis: "provider_reference" }]);
  const elsewhere = row({ provider_transaction_id: "mock-p1", is_pending: true, posted_on: null, account_id: "simplefin:mock-sav" });
  assert.deepEqual(plain(F.pendingLinks([elsewhere, posted])), []);
});

test("[S13] three monthly posted debits make a possible bill: asserted, inferred, the person confirms it", () => {
  const [b] = infer(series(["2026-07-15", "2026-08-15", "2026-09-15"]));
  assert.deepEqual([b.creditor, b.amount_due_cents, b.due_on, b.status, b.source_type, b.direction, b.currency, b.observed_at, b.autopay],
    ["NETFLIX.COM", 1549, "2026-10-15", "asserted", "bank", "payable", "USD", "2026-10-12T18:00:00.000Z", "unknown"]);
  assert.deepEqual([b.evidence.confidence, b.evidence.user_confirmation_required, b.evidence.last_paid_on, b.evidence.transaction_ids.length], ["inferred", true, "2026-09-15", 3]);
  assert.equal(b.evidence.rule, "Repeated posted debits suggest a future charge; they do not prove a current invoice or unpaid balance.");
  assert.deepEqual(infer(series(["2026-08-15", "2026-09-15"])), [], "two charges are not a pattern");
});

test("[S14] weekly, every-two-weeks and yearly charges get their own next date", () => {
  assert.deepEqual(bills(series(["2026-09-21", "2026-09-28", "2026-10-05"])), [[1549, "2026-10-12", "weekly"]]);
  assert.deepEqual(bills(series(["2026-09-02", "2026-09-17", "2026-10-01"])), [[1549, "2026-10-15", "biweekly"]], "a 15-day gap is still every two weeks");
  assert.deepEqual(bills(series(["2024-11-01", "2025-11-01", "2026-11-01"]), "2026-11-02"), [[1549, "2027-11-01", "yearly"]]);
});

test("[S15] a bill due today still counts; a pattern whose next date has passed is not rolled forward", () => {
  assert.deepEqual(bills(series(["2026-07-12", "2026-08-12", "2026-09-12"])), [[1549, "2026-10-12", "monthly"]]);
  assert.deepEqual(bills(series(["2026-07-11", "2026-08-11", "2026-09-11"])), []);
});

test("[S16] month lengths: 28 to 32 days apart is monthly, 33 is not; the 31st lands on the month's last day (leap years too)", () => {
  assert.deepEqual(bills(series(["2027-11-30", "2027-12-31", "2028-01-31"]), "2028-02-01"), [[1549, "2028-02-29", "monthly"]]);
  assert.deepEqual(bills(series(["2026-11-30", "2026-12-31", "2027-01-31"]), "2027-02-01"), [[1549, "2027-02-28", "monthly"]]);
  assert.deepEqual(bills(series(["2026-06-30", "2026-08-01", "2026-09-01"]), "2026-09-02"), [[1549, "2026-10-01", "monthly"]], "32 days (a weekend shift) is still monthly");
  assert.deepEqual(bills(series(["2026-06-29", "2026-08-01", "2026-09-01"]), "2026-09-02"), []);
});

test("[S17] a price within $1.00 (or 5%) is the same bill; a bigger change is not one schedule", () => {
  const at = cents => series(["2026-07-15", "2026-08-15", "2026-09-15"]).map((r, i) => Object.assign(r, { amount_cents: i === 1 ? -cents : -1000 }));
  assert.deepEqual(bills(at(1100)), [[1000, "2026-10-15", "monthly"]]);
  assert.deepEqual(bills(at(1101)), []);
  const big = cents => series(["2026-07-15", "2026-08-15", "2026-09-15"]).map((r, i) => Object.assign(r, { amount_cents: i === 1 ? -cents : -200000 }));
  assert.deepEqual(bills(big(210000)).map(b => b[0]), [200000], "5% of $2,000.00 is $100.00");
  assert.deepEqual(bills(big(210001)), []);
});

test("[S18] money coming in, pending charges, provider transfers and other currencies never make a bill", () => {
  const days = ["2026-07-15", "2026-08-15", "2026-09-15"];
  for (const o of [{ amount_cents: 1549 }, { is_pending: true }, { is_transfer: true }, { currency: "EUR" }, { presence: "superseded" }, { amount_cents: null }])
    assert.deepEqual(infer(series(days, o)), [], JSON.stringify(o));
  assert.deepEqual(plain(F.inferObligations(series(days), "2026-02-30", FETCHED)), [], "no real day, no bills");
});

test("[S19] cash counts fresh USD checking, savings and cash; the person's own account type wins over the bank's", () => {
  const s = summary([cash(), cash({ account_id: "simplefin:mock-sav", account_kind: "unknown", available_cents: 50000 }), cash({ account_id: "simplefin:mock-card", account_kind: "credit", available_cents: 300000 })],
    [], [{ account_id: "simplefin:mock-sav", account_kind: "savings" }, { account_id: "simplefin:mock-chk", account_kind: "investment" }]);
  assert.deepEqual([s.available_cents, s.cash_account_ids, s.unclassified_or_unavailable_accounts], [50000, ["simplefin:mock-sav"], 2]);
  assert.equal(s.description, "Linked cash and recorded bills only; missing accounts or bills may change the picture.");
});

test("[S20] a balance over 24 hours old, from the future, or from a sync with an error is stale; exactly 24 hours still counts", () => {
  assert.deepEqual([summary([cash({ balance_as_of: "2026-10-11T18:30:00.000Z" })]).available_cents], [110025]);
  for (const o of [{ balance_as_of: "2026-10-11T18:29:59.999Z" }, { balance_as_of: "2026-10-12T18:30:00.001Z" }, { sync_error: true }, { balance_as_of: null }]) {
    const s = summary([cash(o)]);
    assert.deepEqual([s.available_cents, s.stale_accounts], [null, 1], JSON.stringify(o));
  }
});

test("[S21] an overdrawn account subtracts from cash", () => {
  assert.equal(summary([cash(), cash({ account_id: "simplefin:mock-sav", available_cents: -20050 })]).available_cents, 89975);
});

test("[S22] only verified bills are a known amount due; the bank's guesses need verification; paid ones are gone", () => {
  const s = summary([cash()], [{ currency: "USD", direction: "payable", status: "verified", amount_due_cents: 8432 }, { currency: "USD", direction: "payable", status: "partially_paid", amount_due_cents: 1000 },
    { currency: "USD", direction: "payable", status: "asserted", amount_due_cents: 1549 }, { currency: "USD", direction: "payable", status: "verified", amount_due_cents: null },
    { currency: "USD", direction: "payable", status: "settled", amount_due_cents: 5000 }, { currency: "USD", direction: "receivable", status: "verified", amount_due_cents: 7000 }]);
  assert.deepEqual([s.known_due_cents, s.unverified_obligations], [9432, 2]);
});

test("[S23] a bill in another currency is counted as not included, never dropped without a word", () => {
  const s = summary([cash()], [{ currency: "CAD", direction: "payable", status: "verified", amount_due_cents: 150000 }, { currency: "USD", direction: "payable", status: "verified", amount_due_cents: 8432 },
    { currency: "EUR", direction: "payable", status: "settled", amount_due_cents: 100 }]);
  assert.deepEqual([s.known_due_cents, s.unverified_obligations, s.unsupported_currency_obligations], [8432, 0, 1]);
});

test("[S24] no usable cash account is unknown, never $0", () => {
  for (const accounts of [[], [cash({ currency: "EUR" })], [cash({ status: "disconnected" })], [cash({ available_cents: null })]]) {
    const s = summary(accounts);
    assert.deepEqual([s.available_cents, s.cash_account_ids, s.coverage_complete], [null, [], false], JSON.stringify(accounts));
  }
});

test("[ADV] sloppy or hostile payloads are refused, not half-read", () => {
  const bad = ["invalid_bank_response"];
  assert.deepEqual(plain(F.normalizeSimplefin(null, { fetched_at: FETCHED })).errors, bad);
  assert.deepEqual(plain(F.normalizeSimplefin({ accounts: {}, transactions: [] }, { fetched_at: FETCHED })).errors, bad);
  assert.deepEqual(plain(F.normalizeSimplefin({ accounts: Array(501).fill(0).map((_, i) => acct({ id: "a" + i })), transactions: [] }, { fetched_at: FETCHED })).errors, bad);
  assert.deepEqual(sync([acct()], [raw({ account_id: "mock-unknown" })]).errors, ["invalid_transaction_identity_or_date"]);
  assert.deepEqual(sync([acct({ id: "x".repeat(161) })], []).errors, ["invalid_or_duplicate_account"]);
  assert.deepEqual(infer(series(["2026-07-15", "2026-08-15", "2026-09-15"]), "today"), []);
  assert.equal(summary([cash({ available_cents: Number.MAX_SAFE_INTEGER }), cash({ account_id: "b", available_cents: 1 })]).available_cents, null, "overflow is unknown");
});
