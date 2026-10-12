// The year in money (capability list item 26; packages/domain/96-year-in-money.js): exact strings and exact cents over
// MOCK rows. Check: node --test tests/year-in-money.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Y = require(path.join(__dirname, "..", "packages/domain/96-year-in-money.js"));

const TZ = "America/New_York";
const NOW = "2026-10-13T03:30:00Z"; // 11:30 p.m. Oct 12 in New York; the bank's UTC date is already Oct 13
const SYNC = "2026-10-13T03:00:00Z";
let n = 0;
const tx = (posted_on, amount_cents, merchant_raw, o, fetched_at = SYNC) => Object.assign({ account_id: "mock-chk", provider_transaction_id: `mock-${n++}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, currency: "USD", fetched_at }, o);

// MOCK: rows that start Mar 4, 2026 (mid-year): rent and Netflix every month, pay, groceries with a refund, a transfer,
// a card payment, a EUR charge, a pending charge, a charge the bank dated tomorrow (this evening in New York).
const TX = [];
for (const m of ["03", "04", "05", "06", "07", "08", "09", "10"]) {
  TX.push(tx(`2026-${m}-05`, -150000, "OAK PROPERTY MGMT RENT"), tx(`2026-${m}-10`, -1599, "NETFLIX.COM"));
  if (m !== "03") TX.push(tx(`2026-${m}-01`, 300000, "MOCK EMPLOYER PAYROLL"));
}
TX.push(
  tx("2026-03-15", 300000, "MOCK EMPLOYER PAYROLL"), tx("2026-03-04", -12000, "KROGER #0042"), tx("2026-06-20", -8000, "KROGER #0042"),
  tx("2026-10-02", -25000, "KROGER #0042"), tx("2026-10-10", 2000, "KROGER #0042 REFUND"), tx("2026-09-20", -9000, "TARGET 00012345"),
  tx("2026-07-08", -4500, "CHIPOTLE 1234"), tx("2026-07-20", -5000, "BLUE HERON HARDWARE"), tx("2026-08-03", -50000, "ONLINE TRANSFER TO SAV 9921", { is_transfer: true }),
  tx("2026-09-08", -30000, "CREDIT CARD PAYMENT THANK YOU"), tx("2026-06-04", -3000, "PARIS CAFE", { currency: "EUR" }), tx(null, -2850, "DOORDASH*THAI PLACE", { is_pending: true }),
  tx("2026-10-13", -1200, "STARBUCKS STORE 01234"), tx("2026-05-12", -48900, "DELTA AIR LINES"),
);
const SRC = "From your linked accounts, transactions through Oct 13, 2026, as of Oct 12, 11:00 PM EDT. Transfers and card payments are left out.";
const SAVED = "Saved or recovered by Upmore: no confirmed savings are on record yet, so none is counted here (one counts only once its record confirms it, like a fee's credit posting).";
const review = (words, rows = TX, now = NOW, opts = { tz: TZ }) => Y.review(rows, words, now, opts);

test("this year so far, from rows that start mid-year: every line, exact cents", () => {
  assert.equal(review("my year in money"), [
    "Your 2026 so far (Jan 1-Oct 12): $24,000.00 in, $13,243.92 out, so $10,756.08 more came in than went out. Your linked transactions start Mar 4, 2026, so this covers only from then.",
    "By category: groceries $430.00, subscriptions $127.92, shopping $90.00, restaurants $57.00; $12,539.00 matched no category I know, so it isn't put in one.",
    "Top places: Oak Property Mgmt Rent $12,000.00, Delta Air Lines $489.00, Kroger $430.00, Netflix $127.92, Target $90.00.",
    "Biggest month: May, $2,004.99 out. Quietest full month: April, $1,515.99.",
    "Repeating charges (Oak Property Mgmt Rent, Netflix): $12,127.92 charged this year.",
    "Refunds taken off what went out: $20.00. Pending, not added yet: $28.50 (1 charge). In another currency, not added: 30.00 EUR out.",
    SAVED,
    SRC,
  ].join("\n"));
});

test("transfers, card payments, pending and EUR rows never reach the totals; a refund comes off what went out, never in", () => {
  const base = review("year in review").split("\n")[0];
  const more = TX.concat([tx("2026-09-09", -70000, "ONLINE TRANSFER TO SAV 9921", { is_transfer: true }), tx("2026-09-10", -40000, "CREDIT CARD PAYMENT THANK YOU"),
    tx("2026-09-11", -9900, "KROGER #0042", { is_pending: true }), tx("2026-09-12", -50000, "LONDON HOTEL", { currency: "GBP" }), tx("2026-09-13", 25000, "ONLINE TRANSFER FROM SAV 9921", { is_transfer: true })]);
  assert.equal(review("year in review", more).split("\n")[0], base);
  // The $20.00 Kroger refund: $13,243.92 out is $13,263.92 of charges less $20.00; $24,000.00 in is pay only.
  assert.match(base, /\$24,000\.00 in, \$13,243\.92 out/);
  assert.match(review("year in review", more), /In another currency, not added: 30\.00 EUR out, 500\.00 GBP out\./);
});

test("the person's category rule moves Target into groceries, and says so with its amount", () => {
  const lines = review("annual review", TX, NOW, { tz: TZ, rules: [{ term: "target", group: "groceries" }] }).split("\n");
  assert.equal(lines[1], "By category: groceries $520.00, subscriptions $127.92, restaurants $57.00; $12,539.00 matched no category I know, so it isn't put in one.");
  assert.equal(lines[5], "By your category rule: \"Target\" as groceries $90.00.");
});

const NY_TX = [tx("2026-01-01", 100000, "ACME CORP PAYROLL"), tx("2026-06-01", -5000, "KROGER #0042"), tx("2026-12-31", -2000, "KROGER #0042"), tx("2027-01-01", -1200, "STARBUCKS STORE 01234")].map((r) => ({ ...r, fetched_at: "2027-01-01T03:30:00Z" }));
const NYE = "2027-01-01T04:00:00Z"; // 11 p.m. Dec 31, 2026 in New York; already Jan 1, 2027 in UTC
test("Dec 31, 11 p.m. in New York is still 2026 (the bank's Jan 1 row is this evening's); in UTC it is 2027", () => {
  assert.equal(review("how did my year go financially", NY_TX, NYE), [
    "Your 2026 so far (Jan 1-Dec 31): $1,000.00 in, $82.00 out, so $918.00 more came in than went out.",
    "By category: groceries $70.00, restaurants $12.00.",
    "Top places: Kroger $70.00, Starbucks $12.00.",
    "Biggest month: June, $50.00 out. Quietest full month: January, $0.00.",
    SAVED,
    "From your linked accounts, transactions through Jan 1, 2027, as of Dec 31, 10:30 PM EST. Transfers and card payments are left out.",
  ].join("\n"));
  assert.equal(review("how did my year go financially", NY_TX, NYE, { tz: "UTC" }), [
    "Your 2027 so far (Jan 1): $0.00 in, $12.00 out, so $12.00 more went out than came in.",
    "By category: restaurants $12.00.",
    "Top places: Starbucks $12.00.",
    SAVED,
    "From your linked accounts, transactions through Jan 1, 2027, as of Jan 1, 3:30 AM UTC. Transfers and card payments are left out.",
  ].join("\n"));
});

test("an empty history says so; a covered year with only transfers says nothing came in or went out", () => {
  assert.equal(review("my year in money", []), "I don't see any posted transactions in your linked accounts yet, so there's no year to review. From your linked accounts, no posted transactions yet.");
  const moves = [tx("2025-12-15", -1000, "KROGER #0042"), tx("2026-02-03", -50000, "ONLINE TRANSFER TO SAV 9921", { is_transfer: true }), tx("2026-04-03", -30000, "CREDIT CARD PAYMENT THANK YOU")];
  assert.equal(review("my year in money", moves).split("\n")[0], "Your 2026 so far (Jan 1-Oct 12): nothing came in or went out, apart from transfers and card payments.");
});

test("a named past year the rows don't reach is said, never a $0.00 year", () => {
  assert.equal(review("how did 2025 go"), `Your linked transactions start Mar 4, 2026, so I can't see 2025: there's nothing from then to add up.\n${SRC}`);
  assert.equal(review("how did last year go financially"), `Your linked transactions start Mar 4, 2026, so I can't see 2025: there's nothing from then to add up.\n${SRC}`);
  assert.doesNotMatch(review("how did 2025 go"), /\$0\.00/);
});

// MOCK: a past year whose rows run Jan 3 to Jun 20, 2024 only (the account was unlinked after).
const OLD = [["2024-01-03", -10000], ["2024-02-10", -4000], ["2024-03-10", -6000], ["2024-04-10", -3000], ["2024-05-10", -5000], ["2024-06-20", -2000]].map(([d, c]) => tx(d, c, "KROGER #0042")).concat([tx("2024-02-01", 200000, "MOCK EMPLOYER PAYROLL")]);
test("a named past year the rows cover only part of: both ends said, and the quietest month is a full one", () => {
  assert.equal(review("my 2024 year in review", OLD), [
    "Your 2024 (Jan 1-Dec 31): $2,000.00 in, $300.00 out, so $1,700.00 more came in than went out. Your linked transactions start Jan 3, 2024, so this covers only from then. Your linked transactions end Jun 20, 2024, so this covers only until then.",
    "By category: groceries $300.00.",
    "Top places: Kroger $300.00.",
    "Biggest month: January (from Jan 3), $100.00 out. Quietest full month: April, $30.00.",
    SAVED,
    "From your linked accounts, transactions through Jun 20, 2024, as of Oct 12, 11:00 PM EDT. Transfers and card payments are left out.",
  ].join("\n"));
  assert.equal(review("my year in money", OLD), "Your linked transactions end Jun 20, 2024, so there's nothing from 2026 to add up yet.\nFrom your linked accounts, transactions through Jun 20, 2024, as of Oct 12, 11:00 PM EDT. Transfers and card payments are left out.");
});

test("a year not here yet, a read that hit its row cap, and pay from a store that is not a refund", () => {
  assert.equal(review("how did 2027 go"), `There's no 2027 to review yet: it's Oct 12, 2026 where you are.\nFrom your linked accounts, transactions through Oct 13, 2026, as of Oct 12, 11:00 PM EDT.`);
  assert.match(review("my year in money", TX, NOW, { tz: TZ, capped: 5000 }).split("\n")[0], /I can read only your newest 5,000 transactions, and they start Mar 4, 2026, so this covers only from then\.$/);
  const pay = [tx("2026-01-01", -1000, "KROGER #0042"), tx("2026-02-01", 150000, "TARGET CORP PAYROLL")];
  assert.equal(review("my year in money", pay).split("\n")[0], "Your 2026 so far (Jan 1-Oct 12): $1,500.00 in, $10.00 out, so $1,490.00 more came in than went out.");
});

test("which asks are the year's; spending, advice, taxes, investments and small talk go on", () => {
  for (const m of ["my year in money", "year in review", "how did my year go financially", "how did 2026 go", "annual review", "show me my year", "how's my year going", "my 2025 year in review",
    "annual spending report", "year-end recap", "how did last year go financially", "how did my finances do this year", "recap my 2025", "summarize my year financially", "hey, can you show me my year in money?"]) assert.ok(Y.ask(m), m);
  assert.deepEqual([Y.ask("how did 2025 go"), Y.ask("how did last year go financially"), Y.ask("year in review")], [{ year: 2025 }, { year: "last" }, { year: "this" }]);
  for (const m of ["how much did i spend this year", "how much did I spend last year", "how can i do better next year", "how did this year go", "how was last year", "is my sapphire annual fee worth it",
    "should i switch spotify to annual", "how did the market do this year", "how did my portfolio do this year", "year end tax summary", "my annual review at work is tomorrow", "how much did i spend in 2025", "what should I change next year"]) assert.equal(Y.ask(m), null, m);
});

test("short enough for a chat: at most 12 lines, the source line last", () => {
  const text = review("my year in money", TX, NOW, { tz: TZ, rules: [{ term: "target", group: "groceries" }] });
  assert.ok(text.split("\n").length <= 12, String(text.split("\n").length));
  assert.match(text.split("\n").slice(-1)[0], /^From your linked accounts, transactions through /);
});
