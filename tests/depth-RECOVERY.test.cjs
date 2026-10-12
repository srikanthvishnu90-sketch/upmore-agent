// Money a bank may owe back, found in the person's own rows (docs/depth/RECOVERY.md): packages/domain/41-agent-recovery.js
// names bank fees by kind, finds possible duplicate charges and holds that never posted, links a later reversal credit
// as an unverified lead, and drafts a request the person sends. A candidate is never money recovered. The save engine
// (49-agent-save.js, "find me money" in chat and the proactive feed) builds its fee findings on scan() and drops a
// recurring charge from the subscription list when feeKind() calls it a fee; supabase/functions/_shared/recovery_service.ts
// serves the full report. It loads with 36-agent-workflows.js (stableJson, date), the only module it needs.
// One test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Rows are MOCK.
// Check: node --test tests/depth-RECOVERY.test.cjs && node evals/depth/run.cjs RECOVERY
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const ctx = vm.createContext({});
vm.runInContext(["36-agent-workflows.js", "41-agent-recovery.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n") + "\nthis.R = AgentRecovery;", ctx);
const { R } = ctx;
const plain = x => JSON.parse(JSON.stringify(x));
const T = "2026-10-12";
let n = 0;
const tx = o => Object.assign({ account_id: "mock-chk", provider_transaction_id: `mock-t${++n}`, fact_hash: `mock-h${n}`, currency: "USD", presence: "observed", is_pending: false,
  is_transfer: false, merchant_key: null, merchant_raw: "", amount_cents: -100, posted_on: "2026-10-01" }, o);
const scan = (rows, o) => plain(R.scan(rows, Object.assign({ today: T }, o)));
const kinds = r => r.candidates.map(c => c.kind + ":" + c.amount_cents);
const fee = (label, cents, on, o) => tx(Object.assign({ merchant_raw: label, amount_cents: -cents, posted_on: on }, o));
const credit = (label, cents, on, o) => tx(Object.assign({ merchant_raw: label, amount_cents: cents, posted_on: on }, o));

test("[S01] a bank fee is named by its kind, the way banks write them", () => {
  const named = { "OVERDRAFT ITEM FEE": "overdraft", "OD FEE": "overdraft", "Extended Overdraft Fee": "overdraft", "NSF RETURNED ITEM FEE": "nsf", "INSUFFICIENT FUNDS FEE": "nsf",
    "MONTHLY SERVICE FEE": "monthly_maintenance", "Non-Network ATM Fee": "atm", "FOREIGN TRANSACTION FEE": "foreign_transaction", "LATE PAYMENT FEE": "late_payment", "PAPER STATEMENT FEE": "paper_statement" };
  for (const [label, kind] of Object.entries(named)) assert.equal(R.feeKind({ merchant_raw: label }), kind, label);
});

test("[S02] cash taken out at an ATM is the person's money, not a fee", () => {
  for (const label of ["ATM WITHDRAWAL 1234 MAIN ST", "NON-NETWORK ATM WITHDRAWAL", "ATMOSPHERE RESTAURANT"]) assert.equal(R.feeKind({ merchant_raw: label }), null, label);
  assert.deepEqual(kinds(scan([fee("ATM WITHDRAWAL 1234 MAIN ST", 20000, "2026-10-05")])), []);
});

test("[S03] a business with \"maintenance\" or \"monthly service\" in its name is not a bank fee; the bank's own fee still is", () => {
  for (const label of ["VALLEY AUTO MAINTENANCE", "ABC POOL MAINTENANCE", "GREENLEAF LAWN MAINTENANCE CO", "XFINITY MONTHLY SERVICE"]) assert.equal(R.feeKind({ merchant_raw: label }), null, label);
  for (const label of ["MAINTENANCE FEE", "ACCOUNT MAINTENANCE FEE", "MONTHLY MAINTENANCE FEE", "Monthly Service Charge", "SERVICE CHARGE", "SERVICE FEE", "ACCOUNT FEE"])
    assert.equal(R.feeKind({ merchant_raw: label }), "monthly_maintenance", label);
  // Three months of an $89.99 auto-shop charge were offered as "$89.99 monthly maintenance fee" with a bank refund draft.
  assert.deepEqual(kinds(scan(["2026-07-15", "2026-08-15", "2026-09-15"].map(d => fee("VALLEY AUTO MAINTENANCE", 8999, d)))), []);
});

test("[S04] a fee's own reversal is never read as a fee", () => {
  for (const label of ["OVERDRAFT FEE REVERSAL", "MONTHLY SERVICE FEE WAIVED", "ATM FEE REFUND", "COURTESY CREDIT OD FEE", "NSF FEE ADJUSTMENT"]) assert.equal(R.feeKind({ merchant_raw: label }), null, label);
});

test("[S05] the fee request, word for word: the bank's name, the date, the amount to the cent and the reference", () => {
  n = 0;
  const r = scan([fee("OVERDRAFT FEE", 3505, "2026-10-02")], { institution: "Mock Bank" });
  assert.equal(r.candidates[0].action.text, "Hello, I'm requesting a courtesy refund from Mock Bank of this fee:\n- 2026-10-02: OVERDRAFT FEE $35.05 (reference mock-t1)\nI value my account and would appreciate the refund. Thank you.");
  assert.match(scan([fee("OVERDRAFT FEE", 3500, "2026-10-02")]).candidates[0].action.text, /^Hello, I'm requesting a courtesy refund from your bank of this fee:\n- 2026-10-02: OVERDRAFT FEE \$35\.00 \(reference mock-t\d+\)\n/);
  assert.deepEqual([r.candidates[0].fee_kind, r.candidates[0].age_days, r.candidates[0].amount_cents], ["overdraft", 10, 3505]);
});

test("[S06] a candidate is a lead, never money recovered; the request is the person's to send", () => {
  const r = scan([fee("OVERDRAFT FEE", 3500, "2026-10-02")]);
  const c = r.candidates[0];
  assert.deepEqual([c.status, c.recovered_cents, c.remaining_cents, c.refund_linkage_status, c.possible_refund], ["open", null, 3500, "not_found", null]);
  assert.deepEqual([c.action.type, c.action.sent_by, c.action.requires_user_approval, c.action.executes, c.action.review_note], ["draft_request", "user", true, false, null]);
  assert.deepEqual([r.open_candidate_cents, r.verified_recovered_cents, r.recovery_verification], [3500, 0, "unavailable_without_trusted_refund_linkage"]);
  assert.equal(r.description, "Candidates only. Open amounts are not money owed or recovered. Credit matches are unverified leads; this scanner cannot certify recovery. Nothing is sent without the user.");
});

test("[S07] a reversal credit up to 60 days after the fee is an unverified lead with a review note; day 61 is not", () => {
  const f = fee("OVERDRAFT FEE", 3500, "2026-08-01");
  const day60 = scan([f, credit("OVERDRAFT FEE REVERSAL", 3500, "2026-09-30")]).candidates[0];
  assert.deepEqual([day60.refund_linkage_status, day60.possible_refund.label, day60.possible_refund.amount_cents], ["unverified", "OVERDRAFT FEE REVERSAL", 3500]);
  assert.equal(day60.action.review_note, "A possibly related credit exists. Confirm which charge it concerns and the remaining request amount before sending; this draft does not establish that more money is owed.");
  assert.equal(day60.status, "open", "a lead is not recovery");
  assert.equal(scan([f, credit("OVERDRAFT FEE REVERSAL", 3500, "2026-10-01")]).candidates[0].refund_linkage_status, "not_found");
});

test("[S08] a reversal the bank names twice over (\"OD FEE REVERSAL CREDIT\") is still the fee's lead, so no refund is asked for twice", () => {
  for (const label of ["OD FEE REVERSAL CREDIT", "COURTESY REFUND OVERDRAFT FEE", "OVERDRAFT FEE REFUND CREDIT", "REVERSAL - NSF FEE WAIVED"]) {
    const f = fee(/NSF/.test(label) ? "NSF FEE" : "OVERDRAFT FEE", 3500, "2026-10-02");
    const c = scan([f, credit(label, 3500, "2026-10-04")]).candidates[0];
    assert.deepEqual([c.refund_linkage_status, c.possible_refund && c.possible_refund.label], ["unverified", label], label);
  }
});

test("[S09] one reversal answers one fee: the second fee still has no lead", () => {
  const r = scan([fee("OVERDRAFT FEE", 3500, "2026-10-01"), fee("OVERDRAFT FEE", 3500, "2026-10-02"), credit("OVERDRAFT FEE REVERSAL", 3500, "2026-10-03")]);
  assert.deepEqual(r.candidates.map(c => [c.evidence[0].posted_on, c.refund_linkage_status]).sort(), [["2026-10-01", "unverified"], ["2026-10-02", "not_found"]]);
});

test("[S10] a credit bigger than the fee, or on another account, is not its refund", () => {
  assert.equal(scan([fee("ATM FEE", 300, "2026-10-01"), credit("ATM FEE REFUND", 999, "2026-10-02")]).candidates[0].refund_linkage_status, "not_found");
  assert.equal(scan([fee("OVERDRAFT FEE", 3500, "2026-10-01"), credit("OVERDRAFT FEE REVERSAL", 3500, "2026-10-02", { account_id: "mock-sav" })]).candidates[0].refund_linkage_status, "not_found");
  assert.equal(scan([fee("ATM FEE", 300, "2026-10-01"), credit("ATM FEE REFUND", 200, "2026-10-02")]).candidates[0].refund_linkage_status, "unverified", "a partial refund is still a lead");
});

test("[S11] two identical charges within 3 days are a possible duplicate; 4 days apart they are two purchases", () => {
  const pair = (a, b) => scan([fee("GYM ONE", 4999, a, { merchant_key: "gym-one" }), fee("GYM ONE", 4999, b, { merchant_key: "gym-one" })]).candidates;
  const same = pair("2026-10-05", "2026-10-05");
  assert.deepEqual([same.length, same[0].kind, same[0].confidence], [1, "duplicate_charge", "likely"]);
  assert.equal(same[0].caveat, "Two identical charges can be legitimate, such as two separate purchases. Confirm before requesting a refund.");
  assert.deepEqual(pair("2026-10-02", "2026-10-05").map(c => c.confidence), ["possible"]);
  assert.deepEqual(pair("2026-10-01", "2026-10-05"), []);
});

test("[S12] a duplicate asks back one charge's amount, and the draft lists both charges", () => {
  n = 0;
  const c = scan([fee("GYM ONE", 4999, "2026-10-05", { merchant_key: "gym-one" }), fee("GYM ONE", 4999, "2026-10-05", { merchant_key: "gym-one" })]).candidates[0];
  assert.deepEqual([c.amount_cents, c.remaining_cents], [4999, 4999]);
  assert.equal(c.action.text, "Hello, I was charged twice for what appears to be the same purchase:\n- 2026-10-05: GYM ONE $49.99 (reference mock-t1)\n- 2026-10-05: GYM ONE $49.99 (reference mock-t2)\nPlease confirm whether one is a duplicate and refund it if so. Thank you.");
});

test("[S13] three identical charges are one pair, not two overlapping pairs", () => {
  const rows = [1, 2, 3].map(() => fee("COFFEE CART", 500, "2026-10-05", { merchant_key: "coffee-cart" }));
  assert.deepEqual(kinds(scan(rows)), ["duplicate_charge:500"]);
});

test("[S14] transfers and money coming in are never duplicate charges", () => {
  const transfers = [1, 2].map(() => fee("TRANSFER TO SAVINGS", 50000, "2026-10-05", { merchant_key: "to-savings", is_transfer: true }));
  assert.deepEqual(kinds(scan(transfers)), []);
  const refunds = [1, 2].map(() => credit("AMAZON REFUND", 2000, "2026-10-05", { merchant_key: "amazon" }));
  assert.deepEqual(kinds(scan(refunds)), []);
});

test("[S15] a fee is a fee once, never also a duplicate of the next one", () => {
  const rows = [1, 2].map(() => fee("ATM FEE", 300, "2026-10-05", { merchant_key: "atm-fee" }));
  assert.deepEqual(kinds(scan(rows)), ["bank_fee:300", "bank_fee:300"]);
});

test("[S16] a hold still pending after 7 days is a lead with its own draft; at 6 days it is normal", () => {
  n = 0;
  const r = scan([fee("MOCK HOTEL", 20000, "2026-10-05", { is_pending: true })]);
  const c = r.candidates[0];
  assert.deepEqual([c.kind, c.age_days, c.amount_cents], ["stale_hold", 7, 20000]);
  assert.equal(c.caveat, "A pending hold may still post. Hotel, rental and fuel holds can last longer than a week.");
  assert.equal(c.action.text, "Hello, this pending authorization has not posted or released:\n- 2026-10-05: MOCK HOTEL $200.00 (reference mock-t1)\nPlease release the hold if no charge is due. Thank you.");
  assert.deepEqual(kinds(scan([fee("MOCK HOTEL", 20000, "2026-10-06", { is_pending: true })])), []);
});

test("[S17] rows in another currency, or no longer observed, are left out and counted", () => {
  const r = scan([fee("OVERDRAFT FEE", 3500, "2026-10-02", { currency: "EUR" }), fee("OVERDRAFT FEE", 3500, "2026-10-03", { presence: "not_seen" })]);
  assert.deepEqual(kinds(r), []);
  assert.deepEqual([r.currency, r.excluded.unsupported_currency, r.excluded.unavailable], ["USD", 1, 1]);
});

test("[S18] a row dated tomorrow is today's (bank dates are UTC); one dated later is left out and counted; the scan still answers", () => {
  // Bank dates arrive in UTC (simplefin-proxy) while chat's today is the person's own day: an evening charge is "tomorrow",
  // and an evening reversal must link to its fee, or the draft asks for money already given back (merge review).
  const r = scan([fee("OVERDRAFT FEE", 3500, "2026-10-12"), fee("CHIPOTLE 0123", 1250, "2026-10-13"), credit("OVERDRAFT FEE REVERSAL", 3500, "2026-10-13"), fee("MOCK HOTEL", 9000, "2026-10-13", { is_pending: true })]);
  assert.equal(r.excluded.future_dated, 0);
  assert.notEqual(r.candidates.length && r.candidates[0].refund_linkage_status, "not_found", "this evening's reversal links to its fee");
  const later = scan([fee("OVERDRAFT FEE", 3500, "2026-10-12"), credit("OVERDRAFT FEE REVERSAL", 3500, "2026-10-15"), fee("MOCK FEE 2", 3500, "2026-10-16")]);
  assert.deepEqual(kinds(later), ["bank_fee:3500"]);
  assert.equal(later.candidates[0].refund_linkage_status, "not_found", "a credit dated days ahead is not used today");
  assert.equal(later.excluded.future_dated, 2);
  assert.equal(later.coverage.included_posted, 1);
});

test("[S19] the same transaction seen twice counts once; two different copies of it stop the scan", () => {
  const f = fee("OVERDRAFT FEE", 3500, "2026-10-02");
  const r = scan([f, Object.assign({}, f)]);
  assert.deepEqual([kinds(r), r.coverage.duplicate_rows, r.coverage.unique_facts], [["bank_fee:3500"], 1, 1]);
  assert.throws(() => scan([f, Object.assign({}, f, { amount_cents: -350 })]), /Conflicting duplicate transaction facts/);
});

test("[S20] the biggest lead comes first, and the open total adds every lead", () => {
  const r = scan([fee("ATM FEE", 300, "2026-10-01"), fee("OVERDRAFT FEE", 3500, "2026-10-02"), fee("MOCK HOTEL", 20000, "2026-10-01", { is_pending: true })]);
  assert.deepEqual(kinds(r), ["stale_hold:20000", "bank_fee:3500", "bank_fee:300"]);
  assert.equal(r.open_candidate_cents, 23800);
});

test("[S21] a fee label on a debit over $500 is not trusted as a fee; $500.00 is", () => {
  assert.deepEqual(kinds(scan([fee("OVERDRAFT FEE", 50000, "2026-10-02")])), ["bank_fee:50000"]);
  assert.deepEqual(kinds(scan([fee("OVERDRAFT FEE", 50001, "2026-10-02")])), []);
});

test("[ADV] merchant text cannot make a refund lead, a fee or a bigger request", () => {
  // A debit that calls itself a reversal is not a credit; a credit from a merchant is not a fee reversal for the bank's fee.
  assert.equal(scan([fee("OVERDRAFT FEE", 3500, "2026-10-02"), fee("OVERDRAFT FEE REVERSAL", 3500, "2026-10-03")]).candidates.filter(c => c.kind === "bank_fee").length, 1);
  assert.equal(scan([fee("OVERDRAFT FEE", 3500, "2026-10-02"), credit("REFUND MOCK STORE", 3500, "2026-10-03", { merchant_key: "mock-store" })]).candidates[0].refund_linkage_status, "not_found");
  assert.throws(() => scan([tx({ provider_transaction_id: "" })]), /identity is missing/);
  assert.throws(() => scan([tx({ amount_cents: 12.5 })]), /amount is unknown or invalid/);
  assert.throws(() => R.scan([], { today: "2026-02-30" }), /real current date/);
});
