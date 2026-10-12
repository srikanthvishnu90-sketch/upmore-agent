// "What subscriptions do I have?" (megadoc J03; docs/depth/SUBS-LIST.md): packages/domain/100-subscription-list.js over
// AgentLedger.recurring with the monitors' merchant key and MoneyAnswers' categories, loaded together as the router bundle
// loads them. One test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this
// test fail. Rows MOCK. Check: node --test tests/depth-SUBS-LIST.test.cjs && node evals/depth/run.cjs SUBS-LIST
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const ctx = vm.createContext({});
vm.runInContext(["32-merchant-label.js", "33-agent-monitors.js", "48-money-math.js", "57-agent-ledger.js", "80-money-answers.js", "100-subscription-list.js"].map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n") + "\nthis.SL = SubscriptionList;", ctx);
const { SL } = ctx;

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-12T15:00:00Z");
let i = 0;
const r = (d, c, m, o) => Object.assign({ account_id: "mock-card", provider_transaction_id: `mock-${i++}`, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T12:00:00Z" }, o);
const monthly = (days, c, m) => days.map((d) => r(d, c, m));
const BASE = [].concat(
  monthly(["2026-08-05", "2026-09-05"], -1599, "NETFLIX.COM"), [r("2026-10-05", -1799, "NETFLIX.COM")],
  monthly(["2026-08-12", "2026-09-12", "2026-10-12"], -1099, "SPOTIFY USA"),
  monthly(["2026-07-03", "2026-08-03"], -1499, "HULU 877-8244858"),
  [r("2025-10-03", -13900, "AMAZON PRIME*AB1"), r("2026-10-03", -13900, "AMAZON PRIME*CD2")],
  monthly(["2026-08-01", "2026-09-01", "2026-10-01"], -145000, "OAK PROPERTY MGMT RENT"),
);
const ans = (rows = BASE, opts = {}) => SL.answer(rows, "what subscriptions do I have", NOW, Object.assign({ tz: TZ }, opts));

test("[S01] the subscriptions that repeat, each with its latest charge, how often and when", () => {
  const t = ans();
  assert.match(t, /\n- Netflix: \$17\.99 a month, last charged Oct 5 \(it was \$15\.99 before\)\n/);
  assert.match(t, /\n- Spotify: \$10\.99 a month, last charged Oct 12\n/);
});

test("[S02] a yearly one is counted at its yearly price, its charges grouped across reference codes", () => {
  assert.match(ans(), /\n- Amazon Prime: \$139\.00 a year, last charged Oct 3\n/);
});

test("[S03] the total a month and a year, a yearly price spread to the cent", () => {
  // $17.99 + $10.99 + $139.00 / 12 ($11.58) = $40.56 a month; $486.72 a year.
  assert.match(ans(), /^3 subscriptions repeat in your linked accounts, about \$40\.56 a month \(\$486\.72 a year\):\n/);
});

test("[S04] rent and other bills are not subscriptions", () => {
  assert.doesNotMatch(ans(), /Oak|Rent|1,450/);
});

test("[S05] one that stopped charging for a full cycle and a week is said apart as possibly ended", () => {
  assert.match(ans(), /\nThis one hasn't charged for a full cycle, so it may have ended:\n- Hulu: \$14\.99 a month, last charged Aug 3; expected about Sep 3\n/);
  // Within the week after it was expected: still listed as active.
  const late = BASE.filter((x) => !/HULU/.test(x.merchant_raw)).concat(monthly(["2026-08-08", "2026-09-08"], -999, "PEACOCK TV"));
  assert.match(SL.answer(late, "what subscriptions do I have", Date.parse("2026-10-15T15:00:00Z"), { tz: TZ }), /\n- Peacock: \$9\.99 a month, last charged Sep 8\n/);
});

test("[S06] a single charge is not a subscription yet, and the reply says why it may be missing", () => {
  const t = ans(BASE.concat([r("2026-10-08", -899, "DISNEY PLUS")]));
  assert.doesNotMatch(t, /Disney/);
  assert.match(t, /A new subscription shows after its second charge, and one billed to a card that isn't linked can't show here\./);
});

test("[S07] the person's category rule counts: a merchant they moved to subscriptions is listed", () => {
  const gym = monthly(["2026-08-10", "2026-09-10", "2026-10-10"], -2999, "IRONWORKS FITNESS");
  assert.doesNotMatch(ans(BASE.concat(gym)), /Ironworks/);
  assert.match(ans(BASE.concat(gym), { rules: [{ term: "ironworks fitness", group: "subscriptions" }] }), /\n- Ironworks Fitness: \$29\.99 a month, last charged Oct 10\n/);
});

test("[S08] nothing is cancelled here: the cancel flow is named with its own yes", () => {
  assert.match(ans(), /Say "cancel Netflix" to start a cancellation; nothing is cancelled until you say yes to it\./);
});

test("[S09] pending, other-currency and refund rows never make a subscription", () => {
  const rows = BASE.concat([r("2026-10-11", -1099, "SPOTIFY USA", { is_pending: true }), r("2026-08-20", -999, "SPOTIFY AB", { currency: "EUR" }), r("2026-09-20", -999, "SPOTIFY AB", { currency: "EUR" })]);
  const t = ans(rows);
  assert.match(t, /Spotify: \$10\.99 a month, last charged Oct 12/);
  assert.doesNotMatch(t, /9\.99/, "a EUR service is not listed in dollars");
});

test("[S10] none repeating: said, with why one may be missing", () => {
  assert.equal(ans([r("2026-10-08", -899, "DISNEY PLUS")]), "I don't see any subscriptions repeating in your linked accounts. A new one shows after its second charge, and one billed to a card that isn't linked can't show here.\nFrom your linked accounts, transactions through Oct 8, 2026, as of Oct 12, 8:00 AM EDT.");
  assert.match(ans([]), /^I don't see any posted transactions in your linked accounts yet, so I can't list your subscriptions\./);
});

test("[S11] the ways people ask; spending questions and cancels are not this", () => {
  for (const m of ["what subscriptions do I have", "list my subscriptions", "what am i subscribed to", "show me all my subscriptions", "my subscriptions", "how many subscriptions do i have", "can you list my subscriptions?"]) assert.ok(SL.ask(m), m);
  for (const m of ["how much did i spend on subscriptions", "cancel netflix", "am i overpaying for subscriptions", "should i cancel my subscriptions", "my subscriptions are too expensive", "list my subscriptions and cancel netflix"]) assert.equal(SL.ask(m), null, m);
});

test("[S12] the source line ends the answer", () => {
  assert.match(ans(), /\nFrom your linked accounts, transactions through Oct 12, 2026, as of Oct 12, 8:00 AM EDT\.$/);
});

test("[S13] rows older than 400 days are not read", () => {
  const old = [r("2025-01-05", -1299, "PEACOCK TV"), r("2025-02-05", -1299, "PEACOCK TV"), r("2025-03-05", -1299, "PEACOCK TV")];
  assert.doesNotMatch(ans(BASE.concat(old)), /Peacock/);
});

test("[S14] a weekly one is counted at 52 a year", () => {
  const weekly = ["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"].map((d) => r(d, -499, "NYTIMES DIGITAL"));
  // $4.99 a week is $21.62 a month ($4.99 x 52 / 12).
  assert.match(ans(weekly), /^1 subscription repeats in your linked accounts, about \$21\.62 a month \(\$259\.44 a year\):\n- New York Times: \$4\.99 a week/);
});

test("[S15] the person's own time zone decides today", () => {
  // 11:30 p.m. Oct 12 in New York is Oct 13 in UTC; Hulu, expected Sep 3, has passed its week either way, and Spotify's
  // Oct 12 charge is today's.
  assert.match(SL.answer(BASE, "what subscriptions do I have", Date.parse("2026-10-13T03:30:00Z"), { tz: TZ }), /Spotify: \$10\.99 a month, last charged Oct 12/);
  // Peacock, expected Oct 5, is a week late on Oct 12: still active there, though UTC already says Oct 13.
  const p = BASE.concat(monthly(["2026-08-05", "2026-09-05"], -799, "PEACOCK TV"));
  assert.match(SL.answer(p, "what subscriptions do I have", Date.parse("2026-10-13T03:30:00Z"), { tz: TZ }), /:\n(?:- [^\n]+\n)*- Peacock: \$7\.99 a month, last charged Sep 5\n(?:- [^\n]+\n)*This one hasn't/);
});
