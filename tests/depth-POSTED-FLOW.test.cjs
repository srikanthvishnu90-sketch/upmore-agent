// Money in and out of the bank, as posted (docs/depth/POSTED-FLOW.md): packages/domain/39-agent-posted-flow.js adds up
// the person's retained, observed, posted USD rows in an inclusive date range to exact cents: bank debits, bank credits,
// net flow and the merchants behind them. Credits are not called income and debits are not called spending (both stay
// null); pending, superseded, vanished, other-currency and provider-labeled transfer rows are left out and counted.
// Reached in production through supabase/functions/_shared/financial_service.ts postedFlowReport, the agent-chat
// financial planner tool get_posted_flow_report (financial_tools.ts writes "Recorded bank debits $X, credits $Y, net
// flow $Z ... These are not verified spending or income totals." with the oldest fetch time as its as-of).
// It loads with 36-agent-workflows.js (date, stableJson), the only module it needs.
// One test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Rows are MOCK.
// Check: node --test tests/depth-POSTED-FLOW.test.cjs && node evals/depth/run.cjs POSTED-FLOW
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const ctx = vm.createContext({});
vm.runInContext(["36-agent-workflows.js", "39-agent-posted-flow.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n") + "\nthis.P = AgentPostedFlow;", ctx);
const { P } = ctx;
const plain = x => JSON.parse(JSON.stringify(x));
const FROM = "2026-10-01", TO = "2026-10-31";
let n = 0;
const tx = o => Object.assign({ account_id: "simplefin:mock-chk", provider_transaction_id: `mock-t${++n}`, currency: "USD", amount_cents: -1549, posted_on: "2026-10-05",
  merchant_raw: "NETFLIX.COM", merchant_key: "netflix com", is_pending: false, is_transfer: false, presence: "observed", fetched_at: "2026-10-12T18:00:00Z" }, o);
const pay = o => tx(Object.assign({ amount_cents: 250000, merchant_raw: "PAYROLL MOCK CO", merchant_key: "payroll mock co" }, o));
const report = (rows, from, to, account) => plain(P.report(rows, from || FROM, to || TO, account));
const totals = r => [r.recorded_debits_cents, r.recorded_credits_cents, r.recorded_net_flow_cents, r.record_count];

test("[S01] debits and credits to the cent, and the net flow is credits minus debits", () => {
  const r = report([tx(), tx({ amount_cents: -4237, merchant_raw: "MOCK GROCER", merchant_key: "mock grocer" }), pay()]);
  assert.deepEqual(totals(r), [5786, 250000, 244214, 3]);
  assert.deepEqual(totals(report([tx({ amount_cents: -300000 }), pay()])), [300000, 250000, -50000, 2], "more out than in is a negative net flow");
});

test("[S02] bank credits are not income and bank debits are not spending", () => {
  const r = report([tx(), pay()]);
  assert.deepEqual([r.spending_cents, r.income_cents, r.unclassified_records, r.coverage_complete, r.currency], [null, null, 2, false, "USD"]);
  assert.equal(r.description, "Retained posted bank activity only. Unclassified transfers, refunds, loan proceeds and card payments can change true spending and income. Unconnected accounts and missing history are not covered.");
});

test("[S03] a pending charge is left out and counted", () => {
  const r = report([tx(), tx({ is_pending: true, amount_cents: -9000, posted_on: null })]);
  assert.deepEqual([totals(r), r.excluded.pending], [[1549, 0, -1549, 1], 1]);
});

test("[S04] a pending row replaced by its posted row is counted as superseded, not twice", () => {
  const r = report([tx(), tx({ presence: "superseded" })]);
  assert.deepEqual([totals(r), r.excluded.superseded, r.excluded.unavailable], [[1549, 0, -1549, 1], 1, 0]);
});

test("[S05] a row the bank no longer shows (or never said it saw) is unavailable, not counted", () => {
  const r = report([tx(), tx({ presence: "not_seen" }), tx({ presence: undefined })]);
  assert.deepEqual([totals(r), r.excluded.unavailable], [[1549, 0, -1549, 1], 2]);
});

test("[S06] the range includes its first and last day, nothing outside", () => {
  const r = report([tx({ posted_on: "2026-09-30" }), tx({ posted_on: "2026-10-01" }), tx({ posted_on: "2026-10-31" }), tx({ posted_on: "2026-11-01" })]);
  assert.deepEqual(totals(r), [3098, 0, -3098, 2]);
  assert.deepEqual(r.references.map(x => x.posted_on), ["2026-10-01", "2026-10-31"]);
});

test("[S07] a report for one account counts only that account", () => {
  const rows = [tx(), tx({ account_id: "simplefin:mock-sav", amount_cents: -100000 })];
  const r = report(rows, FROM, TO, "simplefin:mock-sav");
  assert.deepEqual([totals(r), r.account_id], [[100000, 0, -100000, 1], "simplefin:mock-sav"]);
  assert.equal(report(rows).account_id, null);
});

test("[S08] a row in another currency is counted aside, never added to dollars", () => {
  const r = report([tx(), tx({ currency: "EUR", amount_cents: -2000 }), tx({ currency: "EUR", amount_cents: -1, posted_on: "2026-09-01" })]);
  assert.deepEqual([totals(r), r.excluded.unsupported_currency], [[1549, 0, -1549, 1], 1]);
});

test("[S09] a transfer the bank labeled is left out and counted", () => {
  const r = report([tx(), tx({ is_transfer: true, amount_cents: -50000, merchant_raw: "TRANSFER TO SAVINGS" })]);
  assert.deepEqual([totals(r), r.excluded.provider_labeled_transfers], [[1549, 0, -1549, 1], 1]);
});

test("[S10] the same transaction read twice counts once, even fetched at another time", () => {
  const t = tx();
  assert.deepEqual(totals(report([t, Object.assign({}, t, { fetched_at: "2026-10-13T09:00:00Z" })])), [1549, 0, -1549, 1]);
});

test("[S11] two different copies of one transaction stop the report", () => {
  const t = tx();
  assert.throws(() => report([t, Object.assign({}, t, { amount_cents: -1594 })]), /Conflicting duplicate transaction facts/);
  assert.throws(() => report([t, Object.assign({}, t, { posted_on: "2026-10-06" })]), /Conflicting duplicate transaction facts/);
});

test("[S12] merchants are ranked by money out, biggest first, ties by name", () => {
  const r = report([tx({ amount_cents: -500, merchant_raw: "B CAFE", merchant_key: "b cafe" }), tx({ amount_cents: -500, merchant_raw: "A CAFE", merchant_key: "a cafe" }), tx({ amount_cents: -9999, merchant_raw: "MOCK RENT", merchant_key: "mock rent" }), pay()]);
  assert.deepEqual(r.merchants.map(m => [m.label, m.recorded_debits_cents, m.recorded_credits_cents, m.count]),
    [["MOCK RENT", 9999, 0, 1], ["A CAFE", 500, 0, 1], ["B CAFE", 500, 0, 1], ["PAYROLL MOCK CO", 0, 250000, 1]]);
});

test("[S13] one merchant written two ways by the bank is one merchant", () => {
  const r = report([tx(), tx({ merchant_raw: "NETFLIX.COM 866-579-7172 CA", amount_cents: 1549 })]);
  assert.deepEqual(r.merchants, [{ merchant_key: "netflix com", label: "NETFLIX.COM", recorded_debits_cents: 1549, recorded_credits_cents: 1549, count: 2 }]);
});

test("[S14] the as-of is the oldest fetch of a counted row; one row without a fetch time makes it unknown", () => {
  assert.equal(report([tx({ fetched_at: "2026-10-12T18:00:00Z" }), tx({ fetched_at: "2026-10-03T07:15:00Z" })]).oldest_receipt_at, "2026-10-03T07:15:00.000Z");
  assert.equal(report([tx(), tx({ fetched_at: null })]).oldest_receipt_at, null);
  assert.equal(report([tx(), tx({ fetched_at: "not a time" })]).oldest_receipt_at, null);
});

test("[S15] the range must be real days in order; a leap day is real", () => {
  assert.throws(() => report([], "2026-10-31", "2026-10-01"), /A real inclusive date range is required/);
  assert.throws(() => report([], "2026-02-01", "2026-02-29"), /A real inclusive date range is required/);
  assert.throws(() => report([], "2026-10-1", "2026-10-31"), /A real inclusive date range is required/);
  assert.equal(report([tx({ posted_on: "2028-02-29" })], "2028-02-29", "2028-02-29").record_count, 1);
});

test("[S16] a posted row with a broken date stops the report", () => {
  assert.throws(() => report([tx({ posted_on: "2026-10-1" })]), /Posted record has an invalid date/);
  assert.throws(() => report([tx({ posted_on: "2026-10-05T23:00:00Z" })]), /Posted record has an invalid date/);
});

test("[S17] an unknown or fractional dollar amount stops the report; it is never $0", () => {
  for (const amount_cents of [null, 12.5, "1549"]) assert.throws(() => report([tx({ amount_cents })]), /Posted amount is unknown or invalid/, String(amount_cents));
});

test("[S18] nothing in the range is zero records with no as-of, never a made-up time", () => {
  const r = report([tx({ posted_on: "2026-09-15" })]);
  assert.deepEqual([totals(r), r.oldest_receipt_at, r.merchants, r.references], [[0, 0, 0, 0], null, [], []]);
});

test("[S19] a row without its account or transaction id stops the report", () => {
  assert.throws(() => report([tx({ provider_transaction_id: "" })]), /Posted record identity is missing/);
  assert.throws(() => report([tx({ account_id: null })]), /Posted record identity is missing/);
});

test("[S20] a total too big to hold exactly is unknown, not a rounded number", () => {
  const r = report([tx({ amount_cents: -Number.MAX_SAFE_INTEGER }), tx({ amount_cents: -1 })]);
  assert.deepEqual([r.recorded_debits_cents, r.recorded_net_flow_cents, r.merchants[0].recorded_debits_cents], [null, null, null]);
});

test("[ADV] hostile or oversized input is refused, not half-read", () => {
  assert.throws(() => report(null), /processing limit/);
  assert.throws(() => P.report({ length: 1 }, FROM, TO), /processing limit/);
  assert.throws(() => P.report(new Array(100001), FROM, TO), /processing limit/);
  const r = report([tx({ merchant_raw: "<script>x</script>", merchant_key: null })]);
  assert.equal(r.merchants[0].merchant_key, "<script>x</script>", "the label is data; financial_tools.ts escapes it before chat");
  assert.equal(report([tx({ merchant_raw: "", merchant_key: "" })]).merchants[0].label, "Unknown merchant");
});
