// C11 (TXN-019): tip and junk-fee inflation tracker (packages/domain/116-tip-fees.js). Effective tip % and
// fee load % per merchant, current calendar month vs the month before, from itemized receipt rows only.
// Fixture receipts are constructed so the computed percentages are exactly 24% (March) and 31% (April)
// for DoorDash fees, and exactly 10% then 15% for DoorDash tips — the tests never hardcode a reply number
// the function did not compute. Rows are MOCK.
// Check: node --test tests/tip-fees.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const TF = require(path.join(root, "packages/domain/116-tip-fees.js"));
const Docs = require(path.join(root, "packages/domain/62-agent-documents.js"));

const NOW = Date.parse("2026-04-15T15:00:00Z"); // April 2026; previous month is March 2026.
const TZ = "UTC";
// One receipt row in the shape parseReceipt (62-agent-documents.js) returns.
const rc = (merchant, on, o) => Object.assign({
  merchant, on, total_cents: null, order: null,
  subtotal_cents: null, tip_cents: null, delivery_fee_cents: null, service_fee_cents: null, tax_cents: null,
  source: "receipt email",
}, o);
// March DoorDash: fees (700+500)/5000 = 24%, tip 500/5000 = 10%, twice.
const MARCH_DD = [
  rc("DoorDash", "2026-03-05", { subtotal_cents: 5000, delivery_fee_cents: 700, service_fee_cents: 500, tip_cents: 500 }),
  rc("DoorDash", "2026-03-20", { subtotal_cents: 5000, delivery_fee_cents: 700, service_fee_cents: 500, tip_cents: 500 }),
];
// April DoorDash: fees (900+650)/5000 = 31%, tip 750/5000 = 15%, twice.
const APRIL_DD = [
  rc("DoorDash", "2026-04-03", { subtotal_cents: 5000, delivery_fee_cents: 900, service_fee_cents: 650, tip_cents: 750 }),
  rc("DoorDash", "2026-04-10", { subtotal_cents: 5000, delivery_fee_cents: 900, service_fee_cents: 650, tip_cents: 750 }),
];
// One April Uber Eats receipt: fees (400+200)/4000 = 15%, tip 400/4000 = 10%.
const APRIL_UE = [rc("Uber Eats", "2026-04-08", { subtotal_cents: 4000, delivery_fee_cents: 400, service_fee_cents: 200, tip_cents: 400 })];
const ALL = [...MARCH_DD, ...APRIL_DD, ...APRIL_UE];

test("ask: fee and tip asks are recognised, with kind and merchant; unrelated messages are not this", () => {
  assert.equal(TF.ask("are delivery fees getting worse?").kind, "fees");
  assert.equal(TF.ask("how much do i tip on doordash").kind, "tip");
  assert.equal(TF.ask("how much do i tip on doordash").merchant, "doordash");
  assert.equal(TF.ask("tips and junk fees on doordash").kind, "both");
  for (const m of ["what's my balance", "how much did i spend on doordash", "how much did i spend on groceries", "set a grocery budget of 400", "what is a tip", ""]) {
    assert.equal(TF.ask(m), null, m);
  }
});

test("the math: DoorDash fee load is exactly 24% in March and 31% in April; tip % is tracked separately", () => {
  const s = TF.summarize(ALL, NOW, { tz: TZ });
  assert.equal(s.current.key, "2026-04");
  assert.equal(s.previous.key, "2026-03");
  const dd = s.merchants.find((m) => m.merchant === "DoorDash");
  assert.equal(dd.current.fees.pct, 31);
  assert.equal(dd.previous.fees.pct, 24);
  assert.equal(dd.current.fees.count, 2);
  assert.equal(dd.previous.fees.count, 2);
  assert.equal(dd.current.orders, 2);
  assert.equal(dd.previous.orders, 2);
  // Tips are their own number, never folded into the fee load (and fees never into tips).
  assert.equal(dd.current.tip.pct, 15);
  assert.equal(dd.previous.tip.pct, 10);
  assert.equal(dd.current.tip.count, 2);
});

test("the answer states the current and previous percentages, the direction, the order counts, source and as-of", () => {
  const t = TF.answer({ receipts: ALL, words: "are delivery fees getting worse?", now: NOW, tz: TZ });
  assert.match(t, /DoorDash/);
  assert.match(t, /31% in fees, up from 24% in March/);
  assert.match(t, /2 orders in April, 2 orders in March/);
  assert.match(t, /From your itemized receipts/);
  assert.match(t, /as of Apr 15, \d{1,2}:\d{2} [AP]M UTC/);
  // The tip answer is a different number from the same rows.
  const tip = TF.answer({ receipts: ALL, words: "how much do i tip on doordash", now: NOW, tz: TZ });
  assert.match(tip, /DoorDash/);
  assert.match(tip, /15%/);
  assert.match(tip, /up from 10% in March/);
  assert.doesNotMatch(tip, /Uber Eats/, "a merchant named in the ask limits the answer to that merchant");
});

test("a merchant with 1 itemized receipt is reported with its count, and no comparison is invented for it", () => {
  const s = TF.summarize(ALL, NOW, { tz: TZ });
  const ue = s.merchants.find((m) => m.merchant === "Uber Eats");
  assert.equal(ue.current.fees.pct, 15);
  assert.equal(ue.current.fees.count, 1);
  assert.equal(ue.current.orders, 1);
  assert.equal(ue.previous.fees.count, 0);
  assert.equal(ue.previous.fees.pct, null);
  const t = TF.answer({ receipts: ALL, words: "are delivery fees getting worse?", now: NOW, tz: TZ });
  assert.match(t, /Uber Eats/);
  assert.match(t, /15% in fees in April \(1 order\)/);
  assert.match(t, /no itemized receipts in March to compare with/);
});

test("receipts missing a subtotal are excluded from every percentage and counted as excluded", () => {
  const noSub = rc("DoorDash", "2026-04-11", { subtotal_cents: null, delivery_fee_cents: 900, service_fee_cents: 650, tip_cents: 750 });
  const receipts = [...ALL, noSub];
  const s = TF.summarize(receipts, NOW, { tz: TZ });
  assert.equal(s.excluded_count, 1);
  const dd = s.merchants.find((m) => m.merchant === "DoorDash");
  assert.equal(dd.current.fees.pct, 31, "the excluded receipt does not move the number");
  assert.equal(dd.current.fees.count, 2, "and is not counted as an order behind it");
  const t = TF.answer({ receipts, words: "are delivery fees getting worse?", now: NOW, tz: TZ });
  assert.match(t, /1 receipt .* left out/);
});

test("receipts with a subtotal but no stated fee are not counted as 0% fees; no itemized receipts says so plainly", () => {
  const bare = rc("Chipotle", "2026-04-06", { subtotal_cents: 2000, total_cents: 2170, tax_cents: 170 });
  const s = TF.summarize([...ALL, bare], NOW, { tz: TZ });
  assert.equal(s.merchants.find((m) => m.merchant === "Chipotle"), undefined, "no tip and no fee stated: nothing to track");
  assert.equal(TF.answer({ receipts: [], words: "are delivery fees getting worse?", now: NOW, tz: TZ }),
    "Tips and fees can only be tracked from itemized receipts, and none are on file.");
  assert.equal(TF.answer({ receipts: [bare], words: "are delivery fees getting worse?", now: NOW, tz: TZ }),
    "Tips and fees can only be tracked from itemized receipts, and none are on file.");
  assert.equal(TF.answer({ receipts: ALL, words: "what's my balance", now: NOW, tz: TZ }), null);
});

test("end to end from receipt-level data: DoorDash receipt emails parsed by 62-agent-documents feed the tracker verbatim", () => {
  // March email: subtotal $50.00, delivery $7.00 + service $5.00 = $12.00 in fees (24%), tip $5.00 (10%).
  // April email: subtotal $50.00, delivery $9.00 + service $6.50 = $15.50 in fees (31%), tip $7.50 (15%).
  const email = (placed, lines) => Docs.parseReceipt({
    from: "receipts@doordash.example", from_name: "DoorDash", subject: "Your DoorDash order receipt",
    body: [`Placed ${placed}.`, ...lines].join("\n"), received_at: "2026-04-10T18:00:00Z",
  });
  const march = ["Subtotal $50.00", "Delivery Fee $7.00", "Service Fee $5.00", "Tip: $5.00", "Tax $3.00", "Total $70.00"];
  const april = ["Subtotal $50.00", "Delivery Fee $9.00", "Service Fee: $6.50", "Tip: $7.50", "Tax $3.00", "Total $76.00"];
  const receipts = [email("Mar 5, 2026", march), email("Mar 20, 2026", march), email("Apr 3, 2026", april), email("Apr 10, 2026", april)];
  // The parsed rows themselves carry the receipt-level fields the tracker reads — nothing is re-derived.
  assert.equal(receipts[0].subtotal_cents, 5000); assert.equal(receipts[0].delivery_fee_cents, 700);
  assert.equal(receipts[0].service_fee_cents, 500); assert.equal(receipts[0].tip_cents, 500);
  assert.equal(receipts[2].delivery_fee_cents + receipts[2].service_fee_cents, 1550);
  const fees = TF.answer({ receipts, words: "are delivery fees getting worse?", now: NOW, tz: TZ });
  assert.match(fees, /DoorDash: your average order now carries 31% in fees, up from 24% in March \(2 orders in April, 2 orders in March\)\./);
  const tips = TF.answer({ receipts, words: "how much do i tip on doordash", now: NOW, tz: TZ });
  assert.match(tips, /DoorDash: your average tip is 15% of the subtotal in April, up from 10% in March \(2 orders in April, 2 orders in March\)\./);
});

test("ask regression (routing corpus, 2026-10-12): other people's fees and tipping etiquette are not this", () => {
  // Each of these reached TipFees when the handler chain put tipFeesReply ahead of the airline and card answers:
  // an airline bag fee, a card's fee schedule, and etiquette questions. The fee-load ask is about the person's
  // own orders only.
  assert.equal(TF.ask("my bag came 14 hours late on jetblue, do they owe me the bag fee"), null);
  assert.equal(TF.ask("what are the fees on my chase card"), null);
  assert.equal(TF.ask("is it unusual to tip 20%"), null);
  assert.equal(TF.ask("should i tip 20% on takeout"), null);
  // The genuine asks still fire, and no junk merchant is extracted from question words.
  assert.equal(TF.ask("are delivery fees getting worse?").kind, "fees");
  assert.equal(TF.ask("how much do i tip on doordash").merchant, "doordash");
  assert.equal(TF.ask("how much did i pay in fees this year").merchant, null);
});

test("a named month is the current period and the month before it is the comparison", () => {
  const t = TF.answer({ receipts: ALL, words: "how were delivery fees in march", now: NOW, tz: TZ });
  assert.match(t, /24% in fees in March/);
  assert.match(t, /no itemized receipts in February to compare with|down from|up from/, t);
  const s = TF.summarize(ALL, NOW, { tz: TZ, ask: TF.ask("how were delivery fees in march") });
  assert.equal(s.current.key, "2026-03");
  assert.equal(s.previous.key, "2026-02");
});
