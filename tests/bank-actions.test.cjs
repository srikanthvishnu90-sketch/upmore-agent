// Bank actions (K7: C77 case tracking, C79 fee packets, C96 bonus matching, C99 retention, C168 APR,
// C199 closure prep, C141 fraud packet). Every expected dollar below was computed by hand from the fixture
// rows before the code was run (Muse-parity). Fee rows are the owner's REAL rows as twinned in
// tests/phase2-real-feed.test.cjs (three $25.00 MONTHLY SERVICE FEE rows, Jul-Sep 2026).
// Check: node --test tests/bank-actions.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const load = (files, expr) => { const ctx = vm.createContext({ setTimeout, clearTimeout }); vm.runInContext(files.map(f => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\n" + expr, ctx); return ctx; };
const M = load(["32-merchant-label.js", "36-agent-workflows.js", "41-agent-recovery.js", "57-agent-ledger.js", "59-agent-alerts.js", "79-dispute.js", "118-bank-actions.js"], "this.B=BankActions;this.A=AgentAlerts;");
const B = M.B;
const TODAY = "2026-10-12";
let n = 0;
const rtx = (posted_on, amount_cents, merchant_raw, o) => Object.assign({ account_id: "chk", provider_transaction_id: "sf-" + (++n), fact_hash: "h" + n, currency: "USD", presence: "observed", amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false }, o || {});

// ---------- C79: the owner's real fee rows: 3 x $25.00 = $75.00 ----------
const FEES = [rtx("2026-07-20", -2500, "MONTHLY SERVICE FEE"), rtx("2026-08-20", -2500, "MONTHLY SERVICE FEE"), rtx("2026-09-21", -2500, "MONTHLY SERVICE FEE")];
test("C79: fee packet from the real fee rows totals $75.00 with a draft per fee, nothing sent", () => {
  const p = B.feePacket(FEES, TODAY, "Chase");
  assert.equal(p.fees.length, 3);
  assert.equal(p.total_cents, 7500);
  for (const f of p.fees) { assert.equal(f.fee_kind, "monthly_maintenance"); assert.equal(f.action.executes, false); assert.equal(f.action.sent_by, "user"); }
  const text = B.feePacketText(FEES, TODAY, "Chase", "From your linked accounts, as of 2026-09-21.");
  assert.match(text, /3 bank fees totaling \$75\.00/);
  assert.match(text, /Jul 20, 2026: MONTHLY SERVICE FEE, \$25\.00/);
  assert.match(text, /Sep 21, 2026: MONTHLY SERVICE FEE, \$25\.00/);
  assert.match(text, /requesting a courtesy refund from Chase/);
  assert.match(text, /counts as recovered only when a credit of the same amount posts/);
});
test("C79 adversarial: a merchant's own service fee and an oversized 'fee' are not bank fees", () => {
  const rows = [rtx("2026-09-25", -500, "DOORDASH SERVICE FEE"), rtx("2026-09-26", -60000, "MONTHLY SERVICE FEE")];
  assert.equal(B.feePacket(rows, TODAY, "Chase").fees.length, 0);
});
test("C79 tracking: a later $25.00 SERVICE FEE REVERSAL credit marks a fee recovered; a random $25 credit does not", () => {
  const p = B.feePacket(FEES, TODAY, "Chase");
  assert.equal(B.feeRecovered([rtx("2026-10-05", 2500, "SERVICE FEE REVERSAL")], p.fees[0]), true);
  assert.equal(B.feeRecovered([rtx("2026-10-05", 2500, "CARD REWARDS CREDIT")], p.fees[0]), false);
  assert.equal(B.feeRecovered([], p.fees[0]), false);
});

// ---------- C96: direct-deposit pattern + dated stand-in offers ----------
const PAY = ["2026-07-02", "2026-08-02", "2026-09-02", "2026-10-02"].map(d => rtx(d, 220000, "ACME CORP PAYROLL DIR DEP"));
test("C96: the learned pattern is median $2,200.00 every 31 days; 90-day projection is $6,387.10", () => {
  const p = B.ddPattern(PAY);
  assert.equal(p.count, 4); assert.equal(p.total_cents, 880000); assert.equal(p.largest_cents, 220000);
  assert.equal(p.median_each_cents, 220000); assert.equal(p.interval_days, 31);
  assert.equal(B.projectedInWindow(p, 90), 638710); // 220000 x 90 / 31 = 638709.68 -> 638710
});
const SRC = { title: "Example Bank offer page (stand-in offer data)", url: "https://example.com/offers" };
const OFFERS = [
  { id: "a", bank: "Example Bank One", bonus_cents: 40000, checked_on: "2026-10-06", source: SRC, requirements: [{ kind: "dd_total", amount_cents: 200000, within_days: 90 }], keep_open_days: 180, early_closure_fee_cents: 2500 },
  { id: "b", bank: "Example Bank Two", bonus_cents: 75000, checked_on: "2026-10-06", source: SRC, requirements: [{ kind: "dd_single", amount_cents: 500000, within_days: 60 }] },
  { id: "c", bank: "Example Bank Three", bonus_cents: 20000, checked_on: "2026-09-20", source: SRC, requirements: [{ kind: "debit_count", count: 10, within_days: 60 }] },
];
test("C96: matcher — $400 offer met by the pattern, $750 single-deposit offer not met, debit-count offer has no DD requirement and its stale terms are flagged", () => {
  const m = B.matchBonuses(OFFERS, B.ddPattern(PAY), TODAY);
  const a = m.find(x => x.id === "a"), b = m.find(x => x.id === "b"), c = m.find(x => x.id === "c");
  assert.equal(a.eligible, true); assert.equal(a.checks[0].projected_cents, 638710); assert.equal(a.stale, false);
  assert.equal(b.eligible, false); assert.equal(b.checks[0].met, false);
  assert.equal(c.dd_met, null); assert.equal(c.stale, true); // checked 22 days ago, past the 7-day promo window
  const text = B.bonusText(OFFERS, B.ddPattern(PAY), TODAY, "From your linked accounts, as of 2026-10-02.");
  assert.match(text, /median \$2,200\.00 each, about every 31 days/);
  assert.match(text, /Example Bank One: \$400\.00 bonus/);
  assert.match(text, /projects \$6,387\.10 in that window: met/);
  assert.match(text, /may have changed, so check before acting/);
  assert.match(text, /Opening and funding an account is your step/);
});
test("C96 adversarial: no paycheck pattern, no match claimed", () => {
  const text = B.bonusText(OFFERS, B.ddPattern([rtx("2026-10-01", -500, "COFFEE SHOP")]), TODAY, "src");
  assert.match(text, /don't see a direct-deposit pattern/);
});

// ---------- C77: dispute case with deadlines + tracking ----------
const CHARGE = rtx("2026-09-16", -30240, "PEPTIRA 402-5550199 NE 09/15");
test("C77: case opens with a stable id, the merchant deadline Oct 22 and the FCBA deadline Nov 29 (statement closed Sep 30 + 60 days)", () => {
  const c = B.disputeCase(CHARGE, { today: TODAY, statement_close_on: "2026-09-30", source: "From your linked accounts, as of 2026-09-16.", unauthorized: true });
  assert.equal(c.status, "prepared_not_filed");
  assert.equal(c.case_id, B.caseIdFor(CHARGE));
  assert.equal(c.deadlines[0].on, "2026-10-22");
  assert.equal(c.deadlines[1].on, "2026-11-29");
  assert.match(c.draft, /\$302\.40/); assert.match(c.draft, /didn't authorize/i);
  const text = B.disputeCaseText(CHARGE, { today: TODAY, statement_close_on: "2026-09-30", source: "From your linked accounts, as of 2026-09-16." });
  assert.match(text, new RegExp(`Dispute case ${c.case_id} opened`));
  assert.match(text, /nothing has been sent or filed by me/i);
  assert.match(text, /by Nov 29, 2026/);
});
test("C77 adversarial: without a statement date no exact FCBA date is claimed", () => {
  const c = B.disputeCase(CHARGE, { today: TODAY });
  assert.equal(c.deadlines[1].on, null);
  assert.match(c.deadlines[1].what, /not in your bank rows/);
});
test("C77 tracking: provisional credit, merchant refund, and silence are three different states", () => {
  assert.equal(B.trackDispute([rtx("2026-10-20", 30240, "PROVISIONAL CREDIT DISPUTE")], CHARGE).status, "provisional_credit_posted");
  assert.equal(B.trackDispute([rtx("2026-10-20", 30240, "PEPTIRA REFUND")], CHARGE).status, "merchant_refunded");
  assert.equal(B.trackDispute([rtx("2026-10-20", 30241, "PROVISIONAL CREDIT DISPUTE")], CHARGE).status, "awaiting_outcome");
  assert.equal(B.trackDispute([], CHARGE).status, "awaiting_outcome");
});

// ---------- C99: retention math — $95 fee, $40 credits back, $55 behind ----------
const CARD_TX = [
  rtx("2026-09-15", -9500, "ANNUAL FEE", { account_id: "card-1" }),
  rtx("2026-03-01", 2500, "STATEMENT CREDIT", { account_id: "card-1" }),
  rtx("2026-06-01", 1500, "STATEMENT CREDIT", { account_id: "card-1" }),
  rtx("2026-08-01", 9500, "PAYMENT THANK YOU", { account_id: "card-1" }), // a payment is not a credit back
];
test("C99: fee $95.00, credits back $40.00, net -$55.00; a $75 credit offer makes keeping $20.00 ahead", () => {
  const p = B.retentionPacket({ account_id: "card-1", account_name: "Chase Sapphire Preferred", issuer: "Chase", transactions: CARD_TX, today: TODAY });
  assert.equal(p.fee_cents, 9500); assert.equal(p.credits_back_cents, 4000); assert.equal(p.net_cents, -5500);
  assert.match(p.draft, /annual fee of \$95\.00/); assert.match(p.draft, /\$55\.00 behind/);
  const withOffer = B.retentionPacket({ account_id: "card-1", account_name: "Chase Sapphire Preferred", issuer: "Chase", transactions: CARD_TX, today: TODAY, offer: { credit_cents: 7500 } });
  assert.equal(withOffer.offer.keep_net_cents, 2000);
  assert.match(withOffer.verdict, /^Keep:/);
  const points = B.retentionPacket({ account_id: "card-1", account_name: "Chase Sapphire Preferred", issuer: "Chase", transactions: CARD_TX, today: TODAY, offer: { points: 10000 } });
  assert.match(points.verdict, /can't value those points/);
  const pointsValued = B.retentionPacket({ account_id: "card-1", account_name: "Chase Sapphire Preferred", issuer: "Chase", transactions: CARD_TX, today: TODAY, offer: { points: 10000, points_value_cents: 1 } });
  assert.equal(pointsValued.offer.total_value_cents, 10000); assert.equal(pointsValued.offer.keep_net_cents, 4500);
});
test("C99 adversarial: no annual fee row, no retention case", () => {
  assert.equal(B.retentionPacket({ account_id: "card-1", account_name: "X", transactions: [], today: TODAY }).found, false);
});

// ---------- C168: APR math — $4,800 at 26.99% = $1,295.52/yr; at 21.99% = $1,055.52; saves $240.00/yr ----------
test("C168: APR packet math to the cent, written-channel draft, hardship tradeoff disclosed", () => {
  const p = B.aprPacket({ card_name: "Chase Sapphire Preferred", issuer: "Chase", balance_cents: 480000, apr_bps: 2699 });
  assert.equal(p.current_yearly_cents, 129552);
  assert.equal(p.scenarios.length, 1);
  assert.equal(p.scenarios[0].apr_bps, 2199); assert.equal(p.scenarios[0].yearly_cents, 105552);
  assert.equal(p.scenarios[0].saving_year_cents, 24000); assert.equal(p.scenarios[0].saving_month_cents, 2000);
  assert.match(p.text, /\$1,295\.52 a year/); assert.match(p.text, /\$240\.00 a year saved/);
  assert.match(p.draft, /lower my APR to 21\.99%/);
  assert.match(p.text, /hardship plan or a settlement is different/);
  assert.match(p.text, /I don't make calls/);
});
test("C168 adversarial: a scenario at or above the current APR is never offered as a saving", () => {
  const p = B.aprPacket({ card_name: "X", balance_cents: 10000, apr_bps: 2000, scenarios_bps: [2000, 2500] });
  assert.equal(p.scenarios.length, 0); assert.equal(p.draft, null);
});

// ---------- C199: closure disclosure — utilization 12.00% -> 17.14% (+5.14), oldest card, recurring breaks ----------
const ACCTS = [
  { id: "co1", name: "Capital One Quicksilver", type: "credit_card", balance_cents: 0, limit_cents: 300000, opened_on: "2019-03-01", status: "open" },
  { id: "cs1", name: "Chase Sapphire Preferred", type: "credit_card", balance_cents: 120000, limit_cents: 700000, opened_on: "2022-06-01", status: "open" },
];
const CO_TX = [
  rtx("2026-08-15", -1599, "NETFLIX.COM", { account_id: "co1" }), rtx("2026-09-15", -1599, "NETFLIX.COM", { account_id: "co1" }),
  rtx("2026-09-20", 50000, "CAPITAL ONE PAYMENT", { account_id: "co1" }),
];
test("C199: closure packet discloses utilization 12% -> 17% (+5.14 points), oldest-card age effect, and what breaks", () => {
  const p = B.closurePacket({ accounts: ACCTS, target_id: "co1", issuer: "Capital One", transactions: CO_TX, today: TODAY });
  assert.equal(p.utilization_before_bps, 1200); assert.equal(p.utilization_after_bps, 1714);
  assert.equal(p.is_oldest, true);
  assert.match(p.text, /5\.14 points higher/);
  assert.match(p.text, /oldest card \(opened 2019-03-01\)/);
  assert.match(p.text, /NETFLIX\.COM charged this card 2 times/);
  assert.match(p.text, /autopay from your bank/);
  assert.match(p.text, /closure is your tap at Capital One after your yes/);
  assert.match(p.text, /Average account age goes from 6\.0 years to 4\.3 years/);
});
test("C199: verification reads the issuer state back; an open account is not closed", () => {
  assert.equal(B.closureVerified([{ id: "co1", status: "closed" }], "co1").closed_at_issuer, true);
  assert.equal(B.closureVerified(ACCTS, "co1").closed_at_issuer, false);
  assert.equal(B.closurePacket({ accounts: ACCTS, target_id: "nope", transactions: [], today: TODAY }).found, false);
});

// ---------- C141: fraud packet over the detector's own firing ----------
test("C141: probe-then-large stand-in rows fire the safety detector, and the 'not me' packet totals $500.98 with a case per charge", () => {
  const rows = [
    { id: "h1", account_id: "chk", posted_at: "2026-10-04", amount_cents: -5200, merchant_raw: "KROGER", is_pending: false, is_transfer: false },
    { id: "h2", account_id: "chk", posted_at: "2026-09-27", amount_cents: -6100, merchant_raw: "KROGER", is_pending: false, is_transfer: false },
    { id: "f1", account_id: "chk", posted_at: "2026-10-11", amount_cents: -99, merchant_raw: "XYZ TEST CHARGE", is_pending: false, is_transfer: false },
    { id: "f2", account_id: "chk", posted_at: "2026-10-11", amount_cents: -49999, merchant_raw: "ABC ELECTRONICS ONLINE", is_pending: false, is_transfer: false },
  ];
  const firing = M.A.detect({ today: "2026-10-11", transactions: rows, accounts: [] }).find(x => x.kind === "fraud_pattern");
  assert.ok(firing, "the detector fires");
  assert.equal(firing.evidence.computed.pattern, "probe_then_large");
  const charges = rows.filter(r => ["f1", "f2"].includes(r.id)).map(r => ({ account_id: r.account_id, provider_transaction_id: r.id, amount_cents: r.amount_cents, posted_on: "2026-10-11", merchant_raw: r.merchant_raw }));
  const p = B.fraudPacket(firing, charges, { today: TODAY, issuer: "Chase", statement_close_on: "2026-10-31" });
  assert.equal(p.total_cents, 50098);
  assert.equal(p.cases.length, 2);
  assert.match(p.text, /Lock the card now/);
  assert.match(p.text, /\$500\.98 in total/);
  assert.match(p.text, /replacement card with a new number/);
});
test("C141 quiet case: the owner's real September rows (twins) fire no fraud pattern on Sep 21", () => {
  const sept = [
    ["2026-09-16", -30240, "PEPTIRA 402-5550199 NE 09/15"], ["2026-09-17", -2799, "PEPTIRA 402-5550199 NE 09/15"],
    ["2026-09-08", -2000, "Rebet 5550134477 NH 09/06"], ["2026-09-22", -5513, "Rebet 5550134477 NH 09/22"],
    ["2026-09-15", -6144, "AFFIRM.COM PAYMENTS 185-55501234 CA"], ["2026-09-21", -2500, "MONTHLY SERVICE FEE"], ["2026-09-21", -1000, "POLYMARKET CLEARING POLYMARKETCLE FL"], ["2026-09-01", -500, "ROBINHOOD DEBITS 555001999 WEB ID:"],
  ].map(([d, a, m], i) => ({ id: "s" + i, account_id: "chk", posted_at: d, amount_cents: a, merchant_raw: m, is_pending: false, is_transfer: false }));
  const fraud = M.A.detect({ today: "2026-09-21", transactions: sept, accounts: [] }).filter(x => x.kind === "fraud_pattern");
  assert.equal(fraud.length, 0, JSON.stringify(fraud));
});

test("C77/C79 status texts: provisional credit and fee reversal are reported in words, from later rows", () => {
  const c = B.disputeCase(CHARGE, { today: TODAY, statement_close_on: "2026-09-30" });
  const s = B.disputeStatusText(c, [rtx("2026-10-20", 30240, "PROVISIONAL CREDIT DISPUTE")], "From your linked accounts, as of 2026-10-20.");
  assert.match(s, /provisional credit of \$302\.40 posted on Oct 20, 2026/);
  const s2 = B.disputeStatusText(c, [], null);
  assert.match(s2, /no provisional credit and no refund has posted yet/);
  const p = B.feePacket(FEES, TODAY, "Chase");
  assert.match(B.feeStatusText(p.fees[0], [rtx("2026-10-05", 2500, "SERVICE FEE REVERSAL")], null), /that fee is recovered/);
  assert.match(B.feeStatusText(p.fees[0], [], null), /No reversal credit/);
});
