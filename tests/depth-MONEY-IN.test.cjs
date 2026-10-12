// Money coming in (megadoc M04 "how much am I earning on savings", C08 "did maya pay me back?"; docs/depth/MONEY-IN.md).
// One test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Rows MOCK. Check: node --test tests/depth-MONEY-IN.test.cjs && node evals/depth/run.cjs MONEY-IN
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const MI = require(path.join(dir, "101-money-in.js"));

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-12T15:00:00Z");
let i = 0;
const r = (d, c, m, a, o) => Object.assign({ account_id: a || "chk", provider_transaction_id: `mock-${i++}`, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T12:00:00Z" }, o);
const AC = [{ account_id: "sav", name: "High Yield Savings", institution: "Ally" }, { account_id: "chk", name: "Everyday Checking", institution: "Mock Bank" }];
const TX = [r("2025-10-30", 500, "INTEREST PAYMENT", "sav"), r("2026-01-31", 412, "INTEREST PAYMENT", "sav"), r("2026-08-31", 1250, "INTEREST PAYMENT", "sav"), r("2026-09-30", 1310, "INTEREST PAID", "sav"), r("2026-09-30", 3, "INTEREST PAYMENT", "chk"),
  r("2026-09-15", -2345, "INTEREST CHARGE ON PURCHASES", "card"), r("2026-10-10", 4000, "ZELLE FROM MAYA PATEL"), r("2026-10-01", 2000, "VENMO CASHOUT")];
const ans = (words, rows = TX, now = NOW) => MI.answer(AC, rows, words, now, { tz: TZ });

test("[S01] interest this year so far, to the cent, by account", () => {
  assert.match(ans("how much am I earning on savings"), /^Interest paid to you this year so far: \$29\.75 \(Ally High Yield Savings \$29\.72, Mock Bank Everyday Checking \$0\.03\)\.\n/);
});

test("[S02] the last 12 months and last month apart", () => {
  assert.match(ans("how much interest did i earn"), /\nLast 12 months: \$34\.75\. Last month \(Sep\): \$13\.13\.\n/);
});

test("[S03] a card's interest charge is never interest earned", () => {
  const t = ans("how much am I earning on savings", TX.concat([r("2026-10-05", 2345, "INTEREST CHARGE REVERSAL", "card"), r("2026-10-06", 900, "PURCHASE INTEREST ADJ", "card")]));
  assert.match(t, /this year so far: \$29\.75/);
});

test("[S04] the rate is never made up", () => {
  const t = ans("how much am I earning on savings");
  assert.match(t, /The rate isn't in your bank rows, so I can't say it from them\./);
  assert.doesNotMatch(t, /%|APY|percent/);
});

test("[S05] no interest at all: said with the days checked", () => {
  assert.match(ans("how much am I earning on savings", [r("2026-09-01", -500, "COFFEE")]), /^I don't see any interest paid into your linked accounts since Sep 1, 2026\./);
});

test("[S06] rows that start this year are said", () => {
  assert.match(ans("how much interest did i earn", TX.filter((x) => x.posted_on >= "2026-08-01")), /Your linked transactions start Aug 31, 2026, so this covers only from then\./);
});

test("[S07] did Maya pay me back: yes, to the cent, the app and the bank's own words", () => {
  assert.equal(ans("did maya pay me back?").split("\n")[0], 'Yes: Maya sent $40.00 on Oct 10 (Zelle), "Zelle From Maya Patel".');
});

test("[S08] an amount asked is matched to the cent; another payment is said as not that one", () => {
  assert.match(ans("did i get the $40 from maya"), /^Yes: Maya sent \$40\.00/);
  const t = ans("did i get the $20 from maya");
  assert.match(t, /^I don't see \$20\.00 from Maya since Aug 13\. There is a different payment from Maya: \$40\.00 on Oct 10 \(Zelle\)/);
});

test("[S09] none: said, with where else the money may be", () => {
  assert.match(ans("has jake paid me"), /^I don't see a payment from Jake in your linked accounts since Aug 13\.\nVenmo, Cash App and PayPal money stays in the app until it's moved to your bank, so check there too\.\n/);
});

test("[S10] the name is a whole word: Mayan Grill is not Maya", () => {
  assert.match(ans("did maya pay me back", [r("2026-10-09", 1500, "MAYAN GRILL REFUND")]), /^I don't see a payment from Maya/);
});

test("[S11] 60 days back; a transfer between the person's accounts is not a payment from someone", () => {
  assert.match(ans("did maya pay me back", [r("2026-08-01", 4000, "ZELLE FROM MAYA PATEL")]), /^I don't see a payment from Maya/);
  assert.match(ans("did maya pay me back", [r("2026-10-09", 4000, "TRANSFER FROM MAYA JOINT SAV", "chk", { is_transfer: true })]), /^I don't see a payment from Maya/);
});

test("[S12] pending and other currencies are not paid", () => {
  assert.match(ans("did maya pay me back", [r("2026-10-11", 4000, "ZELLE FROM MAYA PATEL", "chk", { is_pending: true }), r("2026-10-10", 4000, "WISE FROM MAYA PATEL", "chk", { currency: "EUR" }), r("2026-09-01", -100, "X")]), /^I don't see a payment from Maya/);
});

test("[S13] the ways people ask; outgoing money and companies are not this", () => {
  const p = (m) => { const q = MI.ask(m); return q && [q.kind, q.name || null, q.amount_cents ?? null]; };
  assert.deepEqual(p("has jake paid me yet"), ["paid", "jake", null]);
  assert.deepEqual(p("did sam venmo me back"), ["paid", "sam", null]);
  assert.deepEqual(p("whats my interest"), ["interest", null, null]);
  for (const m of ["did i pay maya", "pay maya back", "did amazon pay me", "how much interest am i paying on my card", "did it pay me"]) assert.equal(MI.ask(m), null, m);
});

test("[S14] the person's own today: 11:30 p.m. Oct 12 in New York still counts tonight's UTC-dated row", () => {
  assert.match(ans("did maya pay me back", [r("2026-10-13", 4000, "ZELLE FROM MAYA PATEL"), r("2026-09-01", -100, "X")], Date.parse("2026-10-13T03:30:00Z")), /^Yes: Maya sent \$40\.00 on Oct 13/);
});

test("[S15] every answer ends with the source line", () => {
  for (const m of ["how much am I earning on savings", "did maya pay me back", "has jake paid me"]) assert.match(ans(m), /\nFrom your linked accounts, transactions through Oct 10, 2026, as of Oct 12, 8:00 AM EDT\.$/, m);
});
