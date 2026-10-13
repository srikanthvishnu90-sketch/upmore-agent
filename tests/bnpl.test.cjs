// Buy now, pay later from the person's own bank and card rows (capability list items 85 and 87; packages/domain/97-bnpl.js).
// Exact strings and cents. Every account and transaction row is MOCK; the provider terms are the real dated file
// (packages/offers/bnpl-providers.json).
// Check: node --test tests/bnpl.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const B = require(path.join(root, "packages/domain/97-bnpl.js"));
const PROVIDERS = JSON.parse(fs.readFileSync(path.join(root, "packages/offers/bnpl-providers.json"), "utf8"));

const TZ = "America/New_York";
const NOW = "2026-10-13T03:30:00Z"; // 11:30 p.m. Oct 12 in New York; the bank's UTC date is already Oct 13
const SYNC = "2026-10-13T03:00:00Z";
let i = 0;
const tx = (posted_on, amount_cents, merchant_raw, o) => Object.assign({ account_id: "mock-chk", provider_transaction_id: `mock-${i++}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, currency: "USD", fetched_at: SYNC }, o);
const ACCOUNTS = [
  { account_id: "mock-chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: 100000, available_cents: null, balance_as_of: SYNC, fetched_at: SYNC, status: "active", currency: "USD" },
  { account_id: "mock-card", name: "Freedom Flex", institution: "Mock Chase", account_kind: "credit", balance_cents: -20000, available_cents: null, balance_as_of: SYNC, fetched_at: SYNC, status: "active", currency: "USD" },
];
const RENT = ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"].map((d) => tx(d, -80000, "OAK PROPERTY MGMT RENT"));
const ROWS = RENT.concat([
  // Two Klarna plans at once, different amounts: one names the store, one doesn't.
  tx("2026-09-28", -2500, "KLARNA*TARGET"), tx("2026-10-12", -2500, "KLARNA*TARGET"),
  tx("2026-09-07", -4000, "KLARNA INC"), tx("2026-09-21", -4000, "KLARNA INC"), tx("2026-10-05", -4000, "KLARNA INC"),
  // Affirm monthly: how many payments the loan has is not in the rows.
  tx("2026-08-03", -6218, "AFFIRM *PAY"), tx("2026-09-03", -6218, "AFFIRM *PAY"), tx("2026-10-03", -6218, "AFFIRM *PAY"),
  // Afterpay, finished: 4 of 4.
  tx("2026-08-09", -3000, "AFTERPAY"), tx("2026-08-23", -3000, "AFTERPAY"), tx("2026-09-06", -3000, "AFTERPAY"), tx("2026-09-20", -3000, "AFTERPAY"),
  // Klarna at Best Buy, refunded: the credit equals what the plan paid.
  tx("2026-09-21", -5000, "KLARNA*BEST BUY"), tx("2026-10-05", -5000, "KLARNA*BEST BUY"), tx("2026-10-08", 10000, "KLARNA*BEST BUY"),
  // Zip: the first payment carries a fee, then 2 equal ones.
  tx("2026-09-14", -2650, "ZIP.CO"), tx("2026-09-28", -2500, "ZIP.CO"), tx("2026-10-12", -2500, "ZIP.CO"),
  // PayPal Pay in 4: one payment so far.
  tx("2026-10-01", -3000, "PAYPAL *PAY IN 4"),
  // Look-alikes that are not pay-later payments.
  tx("2026-10-01", -3000, "PAYPAL INST XFER"), tx("2026-10-02", -4500, "ZIPCAR TRIP"), tx("2026-10-03", -12000, "AFFIRMATIVE INSURANCE"), tx("2026-10-04", -2500, "ZIPRECRUITER"),
  // Pending, and another currency.
  tx("2026-10-12", -2000, "AFTERPAY", { is_pending: true }), tx("2026-10-02", -2500, "KLARNA*ZALANDO", { currency: "EUR" }),
]);
const opts = { tz: TZ, providers: PROVIDERS };

test("each provider's descriptor names the provider, and the store only when the descriptor carries it", () => {
  const d = (raw) => { const r = B.detect(raw, PROVIDERS); return r ? `${r.provider.id}|${r.merchant}` : null; };
  assert.equal(d("KLARNA*TARGET"), "klarna|Target");
  assert.equal(d("KLARNA* ASOS.COM"), "klarna|Asos.com");
  assert.equal(d("KLARNA INC"), "klarna|null");
  assert.equal(d("KLARNA.COM"), "klarna|null");
  assert.equal(d("AFFIRM *PAY"), "affirm|null");
  assert.equal(d("AFFIRM.COM PAYMENTS"), "affirm|null");
  assert.equal(d("AFTERPAY"), "afterpay|null");
  assert.equal(d("AFTERPAY US INC"), "afterpay|null");
  assert.equal(d("ZIP.CO"), "zip|null");
  assert.equal(d("QUADPAY"), "zip|null");
  assert.equal(d("PAYPAL *PAY IN 4"), "paypal|null");
  assert.equal(d("PAYPAL *PAYIN4"), "paypal|null");
});

test("the owner's Affirm shapes: the code after PAY names no store, and the AFFIRM.COM number is the plan's stable id", () => {
  // Descriptor structure from the provider file (Affirm, checked 2026-10-12): in "AFFIRM * PAY <CODE>" the
  // 8-character code is a per-payment reference — letters-only and digit-leading codes both occur — and in
  // "AFFIRM.COM PAYMENTS <number>" the number is the same on every payment of that plan.
  for (const code of ["Y8PRUXM0", "IAYRAUTH", "6KHJY9TY", "OIDHK430"]) {
    const d = B.detect(`AFFIRM * PAY ${code} SAN FRANCISCO CA`, PROVIDERS);
    assert.deepEqual([d.provider.id, d.merchant, d.plan_id], ["affirm", null, null], code);
  }
  const s = B.detect("AFFIRM.COM PAYMENTS 185-54233729 CA", PROVIDERS);
  assert.deepEqual([s.provider.id, s.merchant, s.plan_id], ["affirm", null, "185-54233729"]);
  const rows = [tx("2026-07-27", -1084, "AFFIRM * PAY SD6B2XRK SAN FRANCISCO CA"), tx("2026-08-24", -1084, "AFFIRM * PAY ZQILNSJX SAN FRANCISCO CA"), tx("2026-09-25", -1084, "AFFIRM * PAY Y8PRUXM0 SAN FRANCISCO CA")];
  const p = B.plans(ROWS.slice(0, 4).concat(rows), NOW, opts).plans.filter((x) => x.provider.id === "affirm" && x.amount_cents === 1084);
  assert.equal(p.length, 1);
  assert.deepEqual([p[0].cadence, p[0].seen.length, p[0].label], ["monthly", 3, "Affirm"]);
});

test("look-alikes are never read as a pay-later payment", () => {
  for (const raw of ["ZIPCAR TRIP", "ZIPRECRUITER", "AFFIRMATIVE INSURANCE", "PAYPAL INST XFER", "PAYPAL *TARGET", "ZIP CODE 30301 PARKING", "TARGET 00012345"]) assert.equal(B.detect(raw, PROVIDERS), null, raw);
});

test("the plans: two Klarna plans side by side, 3 of 4 seen, a monthly Affirm with no total, a refund, a finished plan", () => {
  const p = B.plans(ROWS, NOW, opts);
  const by = (label) => p.plans.find((x) => x.label === label && x.status !== "refunded");
  const t = by("Klarna, Target"), k = by("Klarna"), a = by("Affirm"), z = by("Zip"), pp = by("PayPal");
  assert.deepEqual([t.amount_cents, t.seen.length, t.left, t.owed_cents, t.next], [2500, 2, 2, 5000, "2026-10-26"]);
  assert.deepEqual([k.amount_cents, k.seen.length, k.left, k.owed_cents, k.next], [4000, 3, 1, 4000, "2026-10-19"]);
  assert.deepEqual([a.cadence, a.seen.length, a.left, a.owed_cents, a.next], ["monthly", 3, null, null, "2026-11-03"]);
  assert.deepEqual([z.first_cents, z.amount_cents, z.seen.length, z.left, z.owed_cents, z.next], [2650, 2500, 3, 1, 2500, "2026-10-26"]);
  assert.deepEqual([pp.cadence, pp.seen.length, pp.left, pp.next], ["single", 1, null, null]);
  assert.equal(p.plans.find((x) => x.label === "Klarna, Best Buy").status, "refunded");
  assert.equal(p.finished.map((x) => x.label).join(), "Afterpay");
  assert.equal(p.pending.length, 1);
  assert.equal(p.foreign.length, 1);
});

test("the list answer, in full", () => {
  assert.equal(B.list(ROWS, "show my buy now pay later plans", NOW, opts), [
    "Buy now, pay later: 5 plans in progress in your bank and card rows.",
    "- Klarna: $40.00 every 2 weeks, 3 of 4 payments seen (Sep 7, Sep 21, Oct 5). Next expected Oct 19. Left: 1 payment, $40.00 (inferred from Klarna's Pay in 4 pattern).",
    "- Klarna, Target: $25.00 every 2 weeks, 2 of 4 payments seen (Sep 28, Oct 12). Next expected Oct 26. Left: 2 payments, $50.00 (inferred from Klarna's Pay in 4 pattern).",
    "- Zip: $25.00 every 2 weeks after a first payment of $26.50 (Zip's first payment can include a fee), 3 of 4 payments seen (Sep 14, Sep 28, Oct 12). Next expected Oct 26. Left: 1 payment, $25.00 (inferred from Zip's Pay in 4 pattern).",
    "- Affirm: $62.18 a month, 3 payments seen (Aug 3, Sep 3, Oct 3). Next expected Nov 3 (inferred from the monthly pattern). Still owed: not in your bank rows; check the Affirm app.",
    "- PayPal: 1 payment seen ($30.00 on Oct 1). One payment doesn't show the schedule; check the PayPal app.",
    "Still owed where the plan's shape makes it certain: $115.00 in 3 plans (inferred from the Pay in 4 pattern).",
    "Not known from your rows: what's left on Affirm and PayPal. Your bank rows show payments, not balances.",
    "Finished: Afterpay $30.00 every 2 weeks, 4 of 4 paid (last Sep 20).",
    "Refunded: Klarna, Best Buy ($50.00 every 2 weeks, 2 paid): $100.00 came back on Oct 8, so no more payments are counted for it (inferred; check the Klarna app).",
    "Pending, counted once it posts: Afterpay $20.00 (Oct 12).",
    "In another currency, not added into dollars: Klarna, Zalando 25.00 EUR (Oct 2).",
    "Afterpay can take two payments due together as one charge, so a plan can show fewer payments than it made.",
    "Paying a plan, paying one off early or moving a payment date isn't built; this is read from your rows only.",
    "From your linked accounts, transactions through Oct 12, 2026, as of Oct 12, 11:00 PM EDT.",
  ].join("\n"));
});

test("one provider asked for: only its plans", () => {
  const r = B.list(ROWS, "what do i owe klarna", NOW, opts);
  assert.match(r, /^Klarna: 2 plans in progress in your bank and card rows\.\n- Klarna: \$40\.00/);
  assert.match(r, /\nStill owed where the plan's shape makes it certain: \$90\.00 in 2 plans/);
  assert.doesNotMatch(r, /Affirm|Zip|PayPal|Afterpay/);
  assert.match(r, /\nRefunded: Klarna, Best Buy/);
  const af = B.list(ROWS, "my afterpay payments", NOW, opts);
  assert.equal(af.split("\n")[0], "Afterpay: no plan in progress in your bank and card rows.");
  assert.equal(af.split("\n")[1], "Finished: Afterpay $30.00 every 2 weeks, 4 of 4 paid (last Sep 20).");
});

test("a pay-in-4 whose first payment is before the rows start: an upper bound, never a total", () => {
  const rows = [tx("2026-09-28", -4000, "KLARNA INC"), tx("2026-10-12", -4000, "KLARNA INC")];
  const r = B.list(rows, "bnpl", NOW, opts);
  assert.equal(r.split("\n")[1], "- Klarna: $40.00 every 2 weeks, 2 payments seen (Sep 28, Oct 12). Next expected Oct 26. Left: up to 2 payments, up to $80.00 (Pay in 4 has 4; the first payment isn't in your rows, so the count isn't certain; check the Klarna app).");
  assert.doesNotMatch(r, /Still owed where/);
  assert.match(r, /\nNot known from your rows: what's left on Klarna\./);
});

test("nothing from a provider: said plainly, never $0.00 owed", () => {
  const r = B.list(RENT, "bnpl", NOW, opts);
  assert.equal(r.split("\n")[0], "I don't see any Klarna, Affirm, Afterpay, Zip or PayPal Pay in 4 payments in your bank and card rows.");
  assert.doesNotMatch(r, /\$0\.00/);
  assert.equal(B.list(RENT, "my afterpay payments", NOW, opts).split("\n")[0], "I don't see any Afterpay payments in your bank and card rows.");
});

test("next payment dates are the person's day: 11:30 p.m. in New York is still Oct 12", () => {
  const rows = [tx("2026-08-01", -100, "KROGER #1"), tx("2026-09-14", -2000, "AFTERPAY"), tx("2026-09-28", -2000, "AFTERPAY")];
  assert.match(B.list(rows, "bnpl", NOW, opts), /Next expected today \(Oct 12\)\./);
  assert.match(B.list(rows, "bnpl", NOW, { tz: "UTC", providers: PROVIDERS }), /Next expected Oct 12, not in your rows yet\./);
  // A payment dated the bank's tomorrow (UTC) is this evening's and counts.
  const evening = rows.concat([tx("2026-10-13", -2000, "AFTERPAY")]);
  assert.match(B.list(evening, "bnpl", NOW, opts), /3 of 4 payments seen \(Sep 14, Sep 28, Oct 13\)\. Next expected Oct 27\./);
});

test("the asks: list, check, and what goes on", () => {
  for (const m of ["show my buy now pay later plans", "what do I owe klarna", "my afterpay payments", "bnpl", "how much do i owe on affirm", "whats my klarna balance", "when is my next afterpay payment", "list my pay later plans", "how much is left on my zip plan", "do i have any klarna plans"]) assert.equal(B.ask(m), "list", m);
  for (const m of ["would a $400 afterpay plan push me negative", "can i afford a $200 klarna pay in 4", "will my bnpl payments push me negative", "if i split $300 with affirm will i go negative", "will a new pay later plan overdraw me"]) assert.equal(B.ask(m), "check", m);
  for (const m of ["pay my klarna", "pay off my affirm early", "should i use afterpay", "is klarna safe", "klarna stock price", "reschedule my afterpay payment", "zip", "what's my zip code", "can i afford a $400 tv", "how much did i spend at target", "cancel my klarna order", "I've got 6 buy-now-pay-later plans running — two on Affirm, two on Klarna, one on Afterpay, one on Zip — totaling $2,300. Build me a calendar"]) assert.equal(B.ask(m), null, m);
});

test("item 87: the next 30 days with the pay-later payments, and a new plan's effect, numbers only", () => {
  const r = B.check(ACCOUNTS, ROWS, "would a $400 afterpay plan push me negative", NOW, opts);
  const L = r.split("\n");
  assert.equal(L[0], "Next 30 days (Oct 12-Nov 11), from your cash, repeating bills, paychecks and pay-later payments: lowest $22.82 on Nov 9.");
  assert.equal(L[1], "With a new $400.00 Afterpay plan: lowest -$277.18 on Nov 9, below zero.");
  assert.equal(L[2], "That plan, inferred from Afterpay's Pay in 4 terms: 4 payments of $100.00, the first today, then every 2 weeks (Oct 12, Oct 26, Nov 9, Nov 23); 3 fall in these 30 days ($300.00).");
  assert.match(r, /\nPay-later payments counted: Klarna \$40\.00 Oct 19; Klarna, Target \$25\.00 Oct 26, Nov 9; Zip \$25\.00 Oct 26; Affirm \$62\.18 Nov 3 \(monthly, assumed to continue\)\./);
  assert.match(r, /\nNot counted: PayPal \$30\.00 \(one payment doesn't show the schedule\)\./);
  assert.match(r, /\nAlso counted: \$800\.00 of repeating bills \(1\); no paycheck found\. Not counted: everyday spending that doesn't repeat\./);
  assert.match(r, /\nFrom your linked accounts \(Mock Bank\): balances as of Oct 12, 11:00 PM EDT; transactions through Oct 12, 2026, synced Oct 12, 11:00 PM EDT\.$/);
  assert.doesNotMatch(r, /\bshould\b|\brecommend|\bdon't\b/i);
});

test("item 87: a plan already started that takes the low point below zero is said with the date and amounts", () => {
  const accts = [Object.assign({}, ACCOUNTS[0], { available_cents: 96000 })];
  const r = B.check(accts, ROWS, "will my bnpl payments push me negative", NOW, opts);
  assert.equal(r.split("\n")[0], "Next 30 days (Oct 12-Nov 11), from your cash, repeating bills, paychecks and pay-later payments: lowest -$17.18 on Nov 9, below zero.");
  assert.equal(r.split("\n")[1], "Your newest plan (Klarna, Target, first payment Sep 28): without its 2 payments left ($50.00), the lowest would be $32.82 on Nov 3.");
  const list = B.list(ROWS, "bnpl", NOW, Object.assign({ accounts: accts }, opts));
  assert.match(list, /\nHeads up: with your newest plan \(Klarna, Target\), your cash is projected to reach -\$17\.18 on Nov 9; without it, \$32\.82 on Nov 3 \(from your cash, repeating bills, paychecks and pay-later payments only; everyday spending isn't counted\)\./);
});

test("item 87 with no cash account linked: no number invented", () => {
  const r = B.check([ACCOUNTS[1]], ROWS, "will my bnpl payments push me negative", NOW, opts);
  assert.equal(r.split("\n")[0], "I can't project it: no checking or savings balance is linked, so there's no cash number to start from.");
});
