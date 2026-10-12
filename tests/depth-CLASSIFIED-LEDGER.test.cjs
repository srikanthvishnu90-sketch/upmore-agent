// Spending and income from the person's own reviews (docs/depth/CLASSIFIED-LEDGER.md):
// packages/domain/40-agent-classified-ledger.js turns retained posted USD rows plus the person's explicit transaction
// reviews into spending and income for an inclusive date range. A review counts only while the bank's facts still match
// it (fact_hash); a refund needs its reviewed original purchase, a transfer or card payment needs both legs reviewed and
// matching; anything unreviewed or changed keeps the totals unknown while the known subtotals stay visible. No merchant
// name or matching amount is ever read as a classification. Reached in production through
// supabase/functions/_shared/financial_service.ts classifiedLedgerReport: agent-workflows "ledger_report" (the app's
// "Review bank activity" screen) and the agent-chat financial planner tool get_spending_income_report.
// It loads with 36-agent-workflows.js (date, stableJson), the only module it needs.
// One test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Rows and reviews are MOCK.
// Check: node --test tests/depth-CLASSIFIED-LEDGER.test.cjs && node evals/depth/run.cjs CLASSIFIED-LEDGER
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const ctx = vm.createContext({});
vm.runInContext(["36-agent-workflows.js", "40-agent-classified-ledger.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n") + "\nthis.L = AgentClassifiedLedger;", ctx);
const { L } = ctx;
const plain = x => JSON.parse(JSON.stringify(x));
const FROM = "2026-10-01", TO = "2026-10-31";
let n = 0;
const hash = i => (i % 16).toString(16).repeat(63) + "a";
const tx = (amount, o) => { n++; return Object.assign({ account_id: "simplefin:mock-chk", provider_transaction_id: `mock-t${n}`, fact_hash: hash(n), currency: "USD", amount_cents: amount,
  posted_on: "2026-10-05", merchant_raw: "MOCK", merchant_key: "mock", is_pending: false, is_transfer: false, presence: "observed", fetched_at: "2026-10-12T18:00:00Z" }, o); };
const rv = (row, kind, o) => Object.assign({ account_id: row.account_id, provider_transaction_id: row.provider_transaction_id, fact_hash: row.fact_hash, kind, review_revision: 1, category: "Groceries" }, o);
const link = (row, kind, other, o) => rv(row, kind, Object.assign({ linked_account_id: other.account_id, linked_transaction_id: other.provider_transaction_id, linked_fact_hash: other.fact_hash }, o));
const report = (rows, reviews, from, to, account) => plain(L.report(rows, reviews, from || FROM, to || TO, account));
const money = r => [r.spending_cents, r.income_cents, r.known_expenses_cents, r.known_refunds_cents, r.known_income_cents, r.classification_complete];
const pair = (kind, amount) => { const a = tx(-amount), b = tx(amount, { account_id: "simplefin:mock-card" }); return { rows: [a, b], reviews: [link(a, kind, b), link(b, kind, a)] }; };

test("[S01] reviewed purchases are spending and a reviewed paycheck is income, to the cent", () => {
  const food = tx(-4237), rent = tx(-185000), pay = tx(310055);
  assert.deepEqual(money(report([food, rent, pay], [rv(food, "expense"), rv(rent, "expense", { category: "Rent" }), rv(pay, "income")])), [189237, 310055, 189237, 0, 310055, true]);
});

test("[S02] one unreviewed row keeps spending and income unknown; what is known still shows", () => {
  const a = tx(-10000), b = tx(-1000);
  const r = report([a, b], [rv(a, "expense")]);
  assert.deepEqual([money(r), r.unclassified_records, r.invalidated_reviews], [[null, null, 10000, 0, 0, false], 1, 0]);
});

test("[S03] a period with no records is unknown, never $0 spent", () => {
  const r = report([tx(-500, { posted_on: "2026-09-30" })], []);
  assert.deepEqual([money(r), r.record_count], [[null, null, 0, 0, 0, false], 0]);
});

test("[S04] when the bank changes a row's facts, its review stops counting", () => {
  const a = tx(-10000), r0 = rv(a, "expense");
  const r = report([Object.assign({}, a, { amount_cents: -9000, fact_hash: "f".repeat(64) })], [r0]);
  assert.deepEqual([money(r), r.invalidated_reviews, r.references[0].reason], [[null, null, 0, 0, 0, false], 1, "facts_changed"]);
});

test("[S05] the newest review wins, whatever order they arrive in; a later \"unknown\" takes the earlier answer back", () => {
  const a = tx(-2500);
  assert.equal(report([a], [rv(a, "expense", { review_revision: 2, category: "Dining" }), rv(a, "expense", { category: "Groceries" })]).categories[0].category, "Dining");
  assert.deepEqual(money(report([a], [rv(a, "expense"), rv(a, "unknown", { review_revision: 2 })])), [null, null, 0, 0, 0, false]);
});

test("[S06] a purchase review on money coming in, or income on money going out, is not believed", () => {
  const credit = tx(5000), debit = tx(-5000);
  const r = report([credit, debit], [rv(credit, "expense"), rv(debit, "income")]);
  assert.deepEqual([money(r), r.references.map(x => x.reason)], [[null, null, 0, 0, 0, false], ["direction_conflict", "direction_conflict"]]);
});

test("[S07] a refund lowers spending in the month it posts, under the original purchase's category; it is not income", () => {
  const shoes = tx(-12000, { posted_on: "2026-09-20" }), back = tx(4000, { posted_on: "2026-10-03" }), food = tx(-6000);
  const r = report([shoes, back, food], [rv(shoes, "expense", { category: "Clothing" }), link(back, "refund", shoes, { category: "Something else" }), rv(food, "expense")]);
  assert.deepEqual(money(r), [2000, 0, 6000, 4000, 0, true]);
  assert.deepEqual(r.categories, [{ category: "Clothing", expenses_cents: 0, refunds_cents: 4000, net_spending_cents: -4000 }, { category: "Groceries", expenses_cents: 6000, refunds_cents: 0, net_spending_cents: 6000 }]);
});

test("[S08] a full refund is a refund; one bigger than the purchase is not believed", () => {
  const buy = tx(-12000), full = tx(12000, { posted_on: "2026-10-06" });
  assert.deepEqual(money(report([buy, full], [rv(buy, "expense"), link(full, "refund", buy)])), [0, 0, 12000, 12000, 0, true]);
  const buy2 = tx(-12000), more = tx(12001, { posted_on: "2026-10-06" });
  assert.equal(report([buy2, more], [rv(buy2, "expense"), link(more, "refund", buy2)]).references[1].reason, "original_expense_changed");
});

test("[S09] refunds that together pass the purchase are not believed, even when one fell in another month", () => {
  const buy = tx(-10000, { posted_on: "2026-09-01" }), first = tx(6000, { posted_on: "2026-09-05" }), second = tx(6000, { posted_on: "2026-10-02" });
  const r = report([buy, first, second], [rv(buy, "expense"), link(first, "refund", buy), link(second, "refund", buy)]);
  assert.deepEqual([money(r), r.references.map(x => x.reason)], [[null, null, 0, 0, 0, false], ["refunds_exceed_original_expense"]]);
});

test("[S10] a refund dated before its purchase is not believed", () => {
  const buy = tx(-5000, { posted_on: "2026-10-10" }), early = tx(5000, { posted_on: "2026-10-09" });
  assert.equal(report([buy, early], [rv(buy, "expense"), link(early, "refund", buy)]).references[1].reason, "original_expense_changed");
});

test("[S11] a transfer between the person's accounts needs both legs reviewed, opposite and equal", () => {
  const ok = pair("internal_transfer", 50000);
  const r = report(ok.rows, ok.reviews);
  assert.deepEqual([money(r), r.transfer_records], [[0, 0, 0, 0, 0, true], 2]);
  const a = tx(-50000), b = tx(49999, { account_id: "simplefin:mock-sav" });
  const off = report([a, b], [link(a, "internal_transfer", b), link(b, "internal_transfer", a)]);
  assert.deepEqual([off.transfer_records, off.unclassified_records, off.references.map(x => x.reason)], [0, 2, ["opposite_leg_not_reconciled", "opposite_leg_not_reconciled"]]);
  const lone = tx(-100), other = tx(100, { account_id: "simplefin:mock-sav" });
  assert.equal(report([lone, other], [link(lone, "internal_transfer", other)]).transfer_records, 0, "one reviewed leg is not a transfer");
});

test("[S12] a card payment is neither spending nor income, and both legs must say card payment", () => {
  const ok = pair("credit_payment", 82011);
  assert.deepEqual([money(report(ok.rows, ok.reviews)), report(ok.rows, ok.reviews).credit_payment_records], [[0, 0, 0, 0, 0, true], 2]);
  const a = tx(-82011), b = tx(82011, { account_id: "simplefin:mock-card" });
  const mixed = report([a, b], [link(a, "internal_transfer", b), link(b, "credit_payment", a)]);
  assert.deepEqual([mixed.transfer_records, mixed.credit_payment_records, mixed.unclassified_records], [0, 0, 2]);
});

test("[S13] a transfer the bank itself labeled needs no review", () => {
  const r = report([tx(-50000, { is_transfer: true }), tx(-1200)], []);
  assert.deepEqual([r.transfer_records, r.unclassified_records, r.references[0].kind], [1, 1, "provider_transfer"]);
});

test("[S14] loan money is counted on its own, never as income", () => {
  const loan = tx(500000), pay = tx(310055);
  const r = report([loan, pay], [rv(loan, "loan_proceeds"), rv(pay, "income")]);
  assert.deepEqual([money(r), r.loan_proceeds_cents], [[0, 310055, 0, 0, 310055, true], 500000]);
});

test("[S15] pending, vanished and other-currency rows are left out and counted", () => {
  const r = report([tx(-100, { is_pending: true }), tx(-100, { presence: "not_seen" }), tx(-100, { currency: "EUR" }), tx(-100, { currency: "EUR", posted_on: "2026-09-01" })], []);
  assert.deepEqual([r.record_count, r.excluded], [0, { pending: 1, unavailable: 1, unsupported_currency: 1 }]);
});

test("[S16] each category shows its purchases, refunds and net, in name order", () => {
  const a = tx(-3000), b = tx(-2000), c = tx(-999);
  const r = report([a, b, c], [rv(a, "expense", { category: "Dining" }), rv(b, "expense", { category: "Dining" }), rv(c, "expense", { category: null })]);
  assert.deepEqual(r.categories, [{ category: "Dining", expenses_cents: 5000, refunds_cents: 0, net_spending_cents: 5000 }, { category: "Uncategorized", expenses_cents: 999, refunds_cents: 0, net_spending_cents: 999 }]);
});

test("[S17] the range includes its first and last day, nothing outside", () => {
  const rows = ["2026-09-30", "2026-10-01", "2026-10-31", "2026-11-01"].map(d => tx(-100, { posted_on: d }));
  const r = report(rows, rows.map(x => rv(x, "expense")));
  assert.deepEqual([r.record_count, r.spending_cents], [2, 200]);
});

test("[S18] a report for one account counts only that account, but still sees the other leg of a transfer", () => {
  const t = pair("internal_transfer", 50000), food = tx(-700);
  const r = report(t.rows.concat(food), t.reviews.concat(rv(food, "expense")), FROM, TO, "simplefin:mock-chk");
  assert.deepEqual([r.record_count, r.transfer_records, r.spending_cents, r.account_id], [2, 1, 700, "simplefin:mock-chk"]);
});

test("[S19] two different copies of one transaction, or of one review revision, stop the report", () => {
  const a = tx(-100);
  assert.throws(() => report([a, Object.assign({}, a, { amount_cents: -101 })], []), /Conflicting duplicate transaction facts/);
  assert.throws(() => report([a], [rv(a, "expense"), rv(a, "income")]), /Conflicting duplicate transaction reviews/);
  assert.equal(report([a, Object.assign({}, a)], [rv(a, "expense"), rv(a, "expense")]).spending_cents, 100, "an identical copy counts once");
});

test("[S20] a total too big to hold exactly is unknown, not a rounded number", () => {
  const a = tx(-Number.MAX_SAFE_INTEGER), b = tx(-1);
  const r = report([a, b], [rv(a, "expense"), rv(b, "expense")]);
  assert.deepEqual([r.known_expenses_cents, r.spending_cents, r.classification_complete], [null, null, true]);
});

test("[S21] the totals carry their as-of: the oldest bank fetch of a counted row; unknown if any counted row has none", () => {
  const a = tx(-100, { fetched_at: "2026-10-12T18:00:00Z" }), b = tx(-200, { fetched_at: "2026-10-03T07:15:00Z" }), late = tx(-300, { posted_on: "2026-11-02", fetched_at: "2026-09-01T00:00:00Z" });
  assert.equal(report([a, b, late], [rv(a, "expense"), rv(b, "expense"), rv(late, "expense")]).oldest_receipt_at, "2026-10-03T07:15:00.000Z");
  const c = tx(-100, { fetched_at: null });
  assert.equal(report([a, c], [rv(a, "expense"), rv(c, "expense")]).oldest_receipt_at, null);
  assert.equal(report([], []).oldest_receipt_at, null);
});

test("[ADV] a bad review or range is refused; a review cannot vouch for itself", () => {
  const a = tx(-100);
  assert.throws(() => report([a], [rv(a, "gift")]), /Invalid transaction review/);
  assert.throws(() => report([a], [rv(a, "expense", { review_revision: 0 })]), /Invalid transaction review/);
  assert.throws(() => report([a], [], "2026-10-31", "2026-10-01"), /real inclusive date range/);
  assert.throws(() => report([tx(-1, { provider_transaction_id: "" })], []), /identity is missing/);
  assert.equal(report([Object.assign({}, a, { fact_hash: "MOCK" })], [rv(Object.assign({}, a, { fact_hash: "MOCK" }), "expense")]).references[0].reason, "facts_changed", "a hash that is not a real hash vouches for nothing");
  const buy = tx(-5000), back = tx(5000);
  assert.equal(report([buy, back], [link(back, "refund", buy)]).references[1].reason, "linked_facts_or_review_missing", "a refund of an unreviewed purchase is not believed");
});
