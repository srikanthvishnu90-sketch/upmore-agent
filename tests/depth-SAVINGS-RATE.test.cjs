// "Find me a better savings rate" (megadoc M05; docs/depth/SAVINGS-RATE.md). One test per sub-capability, tagged so
// evals/depth/run.cjs can prove its planted defect makes exactly this test fail. Rows MOCK.
// Check: node --test tests/depth-SAVINGS-RATE.test.cjs && node evals/depth/run.cjs SAVINGS-RATE
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const SR = require(path.join(dir, "110-savings-rate.js"));

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-12T15:00:00Z");
const CHK = { account_id: "chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: 250000, status: "active", currency: "USD" };
const SAV = { account_id: "sav", name: "High Yield Savings", institution: "Ally", account_kind: "savings", balance_cents: 300000, status: "active", currency: "USD" };
let i = 0;
const r = (d, c, m, a = "chk", o) => Object.assign({ account_id: a, provider_transaction_id: `mock-${i++}`, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T12:00:00Z" }, o);
const TX = [r("2026-08-01", -100, "X"), r("2026-08-31", 1180, "INTEREST PAID", "sav"), r("2026-09-30", 1240, "INTEREST PAID", "sav"), r("2026-09-15", 300000, "ACME PAYROLL"), r("2026-10-01", -150000, "OAK RENT"), r("2026-10-11", 900, "INTEREST PAID", "sav", { is_pending: true })];
const ans = (words, o = {}) => SR.answer(o.acc || [CHK, SAV], o.tx || TX, words, NOW, { tz: TZ });
const L = (t, n) => t.split("\n")[n];
const SRC = "From your linked accounts, transactions through Oct 1, 2026, as of Oct 12, 8:00 AM EDT.";

test("[S01] 'better': no bank or rate is ever named, said first", () => {
  const t = ans("find me a better savings rate");
  assert.equal(L(t, 0), "I don't have a verified, dated source for today's savings rates, so I won't name banks or rates.");
  assert.doesNotMatch(t.split("\n").slice(1, -1).join("\n").replace(/High Yield Savings \(Ally\)/, ""), /\b(?:Marcus|Ally|Capital One|Discover|SoFi|Wealthfront|Amex)\b/);
});

test("[S02] the interest the savings account was paid last full month, from its own rows", () => {
  assert.match(L(ans("what apy am i getting"), 0), /^High Yield Savings \(Ally\) paid \$12\.40 in interest in September/);
});

test("[S03] the rough yearly rate: last month's interest times 12 over today's balance, to one decimal", () => {
  assert.match(L(ans("what apy am i getting"), 0), /; times 12 over today's \$3,000\.00 balance, that's roughly 5\.0% a year/);
  const t = ans("what apy am i getting", { acc: [CHK, Object.assign({}, SAV, { balance_cents: 1000000 })] });
  assert.match(L(t, 0), /roughly 1\.5% a year/);
});

test("[S04] said as rough: the balance may have moved", () => {
  assert.match(L(ans("what apy am i getting"), 0), /\(rough: the balance may have moved during the month\)\.$/);
});

test("[S05] only the last full month counts: this month's and older interest are not added", () => {
  assert.doesNotMatch(ans("what apy am i getting"), /\$24\.20|\$21\.40|\$9\.00/);
});

test("[S06] a pending interest row is not counted", () => {
  const tx = TX.filter((x) => x.posted_on !== "2026-09-30").concat([r("2026-09-30", 1240, "INTEREST PAID", "sav", { is_pending: true })]);
  assert.match(L(ans("what apy am i getting", { tx }), 0), /^No interest payment shows on High Yield Savings \(Ally\) in September\.$/);
});

test("[S07] only that account's interest: a checking account's interest is not the savings rate", () => {
  const tx = TX.concat([r("2026-09-30", 500, "INTEREST PAID", "chk")]);
  assert.match(L(ans("what apy am i getting", { tx }), 0), /paid \$12\.40 in interest/);
});

test("[S08] interest as banks write it: INT PD, interest earned, dividend", () => {
  for (const m of ["INT PD", "Interest Earned", "DIVIDEND PAYMENT", "INT. PAID"]) {
    const tx = TX.filter((x) => x.posted_on !== "2026-09-30").concat([r("2026-09-30", 1240, m, "sav")]);
    assert.match(L(ans("what apy am i getting", { tx }), 0), /paid \$12\.40 in interest/, m);
  }
});

test("[S09] no interest row is said as none, never as 0%", () => {
  const t = ans("what apy am i getting", { tx: TX.filter((x) => !/INTEREST/.test(x.merchant_raw)) });
  assert.match(L(t, 0), /^No interest payment shows on High Yield Savings \(Ally\) in September\.$/);
  assert.doesNotMatch(t, /0\.0%/);
});

test("[S10] rows that don't cover the whole month: said, no rate", () => {
  const t = ans("what apy am i getting", { tx: TX.filter((x) => x.posted_on >= "2026-09-10") });
  assert.match(L(t, 0), /^Your linked transactions don't cover all of September, so I can't say what High Yield Savings \(Ally\) paid in interest\.$/);
});

test("[S11] no savings account linked: said, nothing worked out", () => {
  assert.match(L(ans("find me a better savings rate", { acc: [CHK] }), 1), /^I don't see a linked savings account, so I can't say what yours earns\.$/);
});

test("[S12] every savings account is shown, each on its own line", () => {
  const S2 = { account_id: "sav2", name: "Vacation Fund", institution: "Mock Bank", account_kind: "savings", balance_cents: 50000, status: "active", currency: "USD" };
  const t = ans("what apy am i getting", { acc: [CHK, SAV, S2] });
  assert.match(L(t, 1), /^No interest payment shows on Vacation Fund \(Mock Bank\) in September\.$/);
});

test("[S13] the ways people ask; mortgages, cards, loans and a vague better rate are not this", () => {
  for (const m of ["find me a better savings rate", "what apy am i getting", "is my savings rate good", "best hysa", "how much interest does my savings pay", "are there better high yield savings rates", "what's my savings rate"]) assert.ok(SR.ask(m), m);
  for (const m of ["what is a good credit card rate", "better mortgage rate", "find me a better rate", "find me savings", "how do i save money", "better car loan rate", "cd rates"]) assert.equal(SR.ask(m), null, m);
});

test("[S14] what switching means: the person opens the account; Upmore opens none and moves nothing", () => {
  assert.ok(ans("find me a better savings rate").includes("\nTo compare, check the rate your bank shows for your account against banks' own pages; switching means opening a new account yourself and moving the money. Upmore doesn't open accounts, and nothing was moved.\n"));
});

test("[S15] every answer ends with the source line", () => {
  for (const m of ["find me a better savings rate", "what apy am i getting"]) assert.ok(ans(m).endsWith(`\n${SRC}`), m);
});
