// Price-drop claims (packages/domain/88-price-drop.js, overnight C5) over MOCK card rows: the window and exclusions come
// from the dated offer book, the purchase from the person's own card, and the request is a draft they send.
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../packages/domain/88-price-drop.js");
const OfferBook = require("../packages/domain/82-offer-book.js");
const book = OfferBook.create(require("../packages/offers/terms.json"));
let n = 0;
const tx = (d, c, m, o) => Object.assign({ account_id: "mock-card", provider_transaction_id: `mock-${++n}`, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false, currency: "USD" }, o);
const T = "2026-10-12";

test("Target inside 14 days: the charge from their card, the difference, the draft they send, the cited window", () => {
  const rows = [tx("2026-10-03", -9630, "TARGET 00012345"), tx("2026-09-01", -9630, "TARGET 00012345"), tx("2026-10-04", -2000, "KROGER #1")];
  const a = P.answer("target dropped the price of my air fryer from $89.99 to $69.99", T, rows, book);
  assert.match(a, /^Your Target charge of \$96\.30 on 2026-10-03 is 9 days old, inside Target's 14-day window \(per Target Price Match Guarantee, checked 2026-10-11\)/);
  assert.match(a, /The difference to ask for is \$20\.00 \(\$89\.99 then, \$69\.99 now\), plus the tax on it/);
  assert.match(a, /I can't contact Target for you/);
  assert.match(a, /"Hi, I bought the air fryer on 2026-10-03 for \$89\.99 and it's now \$69\.99/);
  assert.match(a, /ask me then and I'll look for a Target credit near \$20\.00/);
});

test("past the window: no claim, the days and the cited window said", () => {
  const a = P.answer("target price dropped from $89.99 to $69.99, bought sep 20", T, [tx("2026-09-20", -9630, "TARGET 00012345")], book);
  assert.match(a, /is 22 days old, past Target's 14-day window/);
  assert.doesNotMatch(a, /You could send/);
});

test("the purchase day, when said, picks the row; several same-day matches ask", () => {
  const rows = [tx("2026-10-05", -5000, "COSTCO WHSE #1"), tx("2026-10-05", -5100, "COSTCO WHSE #1"), tx("2026-10-08", -5000, "COSTCO WHSE #1")];
  assert.match(P.answer("costco price drop from $49.99 to $39.99 bought oct 8", T, rows, book), /charge of \$50\.00 on 2026-10-08 is 4 days old, inside Costco's 30-day window/);
  assert.match(P.answer("costco price drop from $49.99 to $39.99 bought oct 5", T, rows, book), /more than one Costco charge that could be it/);
});

test("Best Buy's window is its return period: never turned into a number", () => {
  const a = P.answer("best buy price match: my headphones went from $199.99 to $149.99", T, [tx("2026-10-01", -21499, "BEST BUY 00001234")], book);
  assert.match(a, /matches its own lower price during your return period, which depends on your membership: check the receipt/);
  assert.doesNotMatch(a, /\d+-day window/);
  assert.match(a, /Matches its own lower price during the return and exchange period; open-box, membership prices and Thanksgiving-week sales excluded; the store decides/);
  assert.match(a, /I bought the headphones on 2026-10-01/);
});

test("no matching charge, no lower price, no prices: said plainly or asked", () => {
  assert.match(P.answer("target price drop from $89.99 to $69.99", T, [tx("2026-10-03", -2000, "TARGET 1")], book), /I don't see a Target charge near \$89\.99/);
  assert.match(P.answer("target price drop from $69.99 to $89.99", T, [], book), /isn't lower/);
  assert.match(P.answer("target dropped the price of my lamp", T, [], book), /What did you pay at Target/);
});

test("a charge at a different store with the same amount is never taken as the purchase", () => {
  const a = P.answer("target price drop from $89.99 to $69.99", T, [tx("2026-10-03", -9630, "WALMART SUPERCENTER"), tx("2026-10-04", -8999, "AMAZON MKTPLACE")], book);
  assert.match(a, /I don't see a Target charge near \$89\.99/);
});

test("other stores, other messages and pending or foreign rows are not claims", () => {
  for (const m of ["walmart price drop from $10 to $5", "what's my balance", "cancel target circle", "send sam 40"]) assert.equal(P.answer(m, T, [], book), null, m);
  const a = P.answer("target price drop from $89.99 to $69.99", T, [tx("2026-10-03", -9630, "TARGET 1", { is_pending: true }), tx("2026-10-03", -9630, "TARGET 1", { currency: "EUR" })], book);
  assert.match(a, /I don't see a Target charge/);
});

test("a stale window term says it may have changed", () => {
  const a = P.answer("costco price drop from $49.99 to $39.99", "2027-02-01", [tx("2027-01-20", -5000, "COSTCO WHSE #1")], book);
  assert.match(a, /may have changed, so check before acting/);
});
