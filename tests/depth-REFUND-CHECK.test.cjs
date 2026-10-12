// "Did my refund arrive?" (megadoc K07; capability list item 38, the asking half; docs/depth/REFUND-CHECK.md). One test
// per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail. Rows MOCK.
// Check: node --test tests/depth-REFUND-CHECK.test.cjs && node evals/depth/run.cjs REFUND-CHECK
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const R = require(path.join(dir, "98-refund-check.js"));

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-12T15:00:00Z"); // Mon Oct 12, 11 a.m. in New York
let i = 0;
const r = (d, c, m, o) => Object.assign({ account_id: "mock-chk", provider_transaction_id: `mock-${i++}`, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T12:00:00Z" }, o);
const BASE = [r("2026-07-01", -9000, "AMAZON.COM*AB12"), r("2026-09-20", -4599, "BEST BUY 00123"), r("2026-10-02", 4599, "BEST BUY 00123"), r("2026-10-08", 1200, "AMAZON.COM REFUND"), r("2026-10-09", -3000, "TARGET 0001")];
const ans = (words, rows = BASE, now = NOW) => R.answer(rows, words, now, { tz: TZ });
const SRC = /\nFrom your linked accounts, transactions through [A-Z][a-z]{2} \d+, 2026, as of [^\n]+\.$/;

test("[S01] a merchant named and its credit there: yes, to the cent, with the date and the source", () => {
  assert.equal(ans("did my amazon refund come in"), "Yes, one credit from Amazon since Jul 14: $12.00 from Amazon on Oct 8.\nFrom your linked accounts, transactions through Oct 9, 2026, as of Oct 12, 8:00 AM EDT.");
});

test("[S02] an amount named is matched to the cent; another credit is said as not that refund", () => {
  assert.match(ans("has the $45.99 refund from best buy posted yet"), /^Yes: \$45\.99 from Best Buy on Oct 2\.\n/);
  const t = ans("did my $90 amazon refund come in");
  assert.match(t, /^I don't see the \$90\.00 refund from Amazon: no \$90\.00 credit from Amazon since Jul 14\.\nThere is a different credit: \$12\.00 from Amazon on Oct 8\.\n/);
});

test("[S03] no merchant named: the credits that look like refunds are listed, never a bare yes", () => {
  const t = ans("did my refund arrive?");
  assert.match(t, /^2 credits that look like refunds since Jul 14: \$12\.00 from Amazon on Oct 8; \$45\.99 from Best Buy on Oct 2\.\n/);
  assert.doesNotMatch(t, /^Yes/);
});

test("[S04] pay, a person paying you back, interest and transfers are never a refund", () => {
  const rows = BASE.concat([r("2026-10-05", 250000, "ACME PAYROLL DIR DEP"), r("2026-10-06", 5000, "ZELLE FROM MOM"), r("2026-10-07", 87, "INTEREST PAYMENT"), r("2026-10-07", 50000, "ONLINE BANKING TRANSFER", { is_transfer: true }), r("2026-10-07", 2500, "VENMO CASHOUT"),
    // The cases only this check stops: a credit word on interest, and a person paid then paid back through Venmo.
    r("2026-10-07", 87, "INTEREST CREDIT"), r("2026-09-15", -2000, "VENMO"), r("2026-10-08", 2000, "VENMO")]);
  assert.match(ans("any refunds", rows), /^2 credits that look like refunds/);
});

test("[S05] without the word refund, a credit counts only from a place the person paid in the 120 days before", () => {
  const rows = BASE.concat([r("2026-10-10", 3000, "TARGET 0001"), r("2026-10-10", 4000, "NEW PLACE LLC")]);
  const t = ans("any refunds", rows);
  assert.match(t, /\$30\.00 from Target on Oct 10/);
  assert.doesNotMatch(t, /New Place/);
});

test("[S06] a pending credit is said as pending, never as arrived", () => {
  const rows = BASE.concat([r("2026-10-11", 3000, "TARGET 0001", { is_pending: true })]);
  assert.match(ans("did target refund me", rows), /^Nothing posted yet from Target\. Pending, not posted yet: \$30\.00 from Target\.\n/);
  assert.match(ans("did my $30 target refund come in", rows), /^It's pending, not posted yet: \$30\.00 from Target\.\n/);
});

test("[S07] none: said with the days checked and the watch offered, with no date made up", () => {
  const t = ans("did i get my refund from delta");
  assert.match(t, /^I don't see a refund from Delta in your linked accounts since Jul 14: no credit from them\.\nIf they gave you a date, say "tell me if my refund from Delta doesn't arrive by" and that date, and I'll watch for it\.\n/);
  assert.doesNotMatch(t, /Oct 20|Nov \d/);
});

test("[S08] 90 days back: a credit from 91 days ago is not listed; rows that start later are said from their start", () => {
  const old = BASE.concat([r("2026-07-13", 1500, "AMAZON.COM REFUND")]);
  assert.doesNotMatch(ans("did my amazon refund come in", old), /\$15\.00/);
  const late = [r("2026-09-01", -9000, "AMAZON.COM*AB12"), r("2026-10-08", 1200, "AMAZON.COM REFUND")];
  assert.match(ans("did my amazon refund come in", late), /since Sep 1:/);
});

test("[S09] a row dated tomorrow in UTC is this evening's and counts", () => {
  const evening = Date.parse("2026-10-13T01:30:00Z"); // 9:30 p.m. Oct 12 in New York
  assert.match(ans("did my amazon refund come in", BASE.concat([r("2026-10-13", 2500, "AMAZON.COM REFUND")]), evening), /\$25\.00 from Amazon on Oct 13/);
});

test("[S10] the merchant's whole words: Amazonia Cafe is not Amazon; BESTBUY run together is Best Buy", () => {
  const rows = [r("2026-09-01", -500, "AMAZONIA CAFE"), r("2026-10-08", 500, "AMAZONIA CAFE"), r("2026-09-20", -4599, "BESTBUY 00123"), r("2026-10-02", 4599, "BESTBUY 00123")];
  assert.match(ans("did my amazon refund come in", rows), /^I don't see a refund from Amazon/);
  assert.match(ans("did best buy refund me", rows), /^Yes, one credit from Best Buy/);
});

test("[S11] a tax refund, a how-to or an advice question is not this answer", () => {
  for (const m of ["did my tax refund arrive", "how long do refunds take", "should i ask for a refund", "why didn't i get a refund", "refund?"]) assert.equal(R.ask(m), null, m);
});

test("[S12] the ways people ask, the merchant as typed", () => {
  const p = (m) => { const q = R.ask(m); return q && [q.merchant, q.amount_cents]; };
  assert.deepEqual(p("did amazon refund me"), ["amazon", null]);
  assert.deepEqual(p("has delta refunded me yet"), ["delta", null]);
  assert.deepEqual(p("wheres my REI refund"), ["REI", null]);
  assert.deepEqual(p("have i been refunded by amazon yet"), ["amazon", null]);
  assert.deepEqual(p("did i get refunded"), [null, null]);
  assert.deepEqual(p("did my refund arrive?"), [null, null]);
});

test("[S13] a generic payer is no merchant: 'the airline' lists what looks like refunds", () => {
  assert.deepEqual(R.ask("did my refund from the airline come"), { merchant: null, amount_cents: null });
});

test("[S14] another currency is never listed as dollars", () => {
  const rows = BASE.concat([r("2026-10-10", 3000, "AMAZON.DE REFUND", { currency: "EUR" })]);
  assert.doesNotMatch(ans("did my amazon refund come in", rows), /\$30\.00/);
});

test("[S15] nothing posted at all: said, never 'no refund'", () => {
  assert.match(ans("did my amazon refund come in", [r("2026-10-11", 1200, "AMAZON.COM REFUND", { is_pending: true })]), /^I don't see any posted transactions in your linked accounts yet, so I can't tell whether a refund came in\./);
});

test("[S16] every answer ends with its source and as-of", () => {
  for (const m of ["did my amazon refund come in", "did my refund arrive?", "did i get my refund from delta", "has the $45.99 refund from best buy posted yet"]) assert.match(ans(m), SRC, m);
});
