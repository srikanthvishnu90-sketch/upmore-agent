// "I want to save 10000 by June" (megadoc M06; docs/depth/SAVE-GOAL.md). One test per sub-capability, tagged so
// evals/depth/run.cjs can prove its planted defect makes exactly this test fail. Rows MOCK.
// Check: node --test tests/depth-SAVE-GOAL.test.cjs && node evals/depth/run.cjs SAVE-GOAL
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const SG = require(path.join(dir, "107-save-goal.js"));

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-12T15:00:00Z");
const ACC = [{ account_id: "chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: 250000, status: "active", currency: "USD" }, { account_id: "sav", name: "High Yield Savings", institution: "Ally", account_kind: "savings", balance_cents: 300000, status: "active", currency: "USD" }];
let i = 0;
const r = (d, c, m, o) => Object.assign({ account_id: "chk", provider_transaction_id: `mock-${i++}`, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T12:00:00Z" }, o);
const TX = [];
for (const m of ["2026-06", "2026-07", "2026-08", "2026-09"]) { TX.push(r(`${m}-01`, -150000, "OAK RENT")); TX.push(r(`${m}-15`, 300000, "ACME PAYROLL")); TX.push(r(`${m}-20`, -80000, "KROGER")); TX.push(r(`${m}-21`, -50000, "ONLINE TRANSFER TO SAVINGS", { is_transfer: true })); }
TX.push(r("2026-10-01", -150000, "OAK RENT"));
// August had a one-off $600 bonus, so the three months differ.
TX.push(r("2026-08-28", 60000, "ACME BONUS"));
const ans = (words, rows = TX, acc = ACC) => SG.answer(acc, rows, words, NOW, { tz: TZ });
const L = (t, n) => t.split("\n")[n];
const SRC = "From your linked accounts, transactions through Oct 1, 2026, as of Oct 12, 8:00 AM EDT.";

test("[S01] the monthly amount over the months to the date, and per week", () => {
  assert.equal(L(ans("I want to save 10000 by June"), 0), "To save $10,000.00 by Jun 30, 2027: $1,250.00 a month for 8 months (Nov through Jun), or about $264.00 a week.");
});

test("[S02] a month already past this year is next year's; the end of the year is Dec 31", () => {
  assert.equal(SG.when("save 10000 by june", "2026-10-12"), "2027-06-30");
  assert.equal(SG.when("save 10000 by december", "2026-10-12"), "2026-12-31");
  assert.equal(SG.when("save 10k by the end of the year", "2026-10-12"), "2026-12-31");
});

test("[S03] a month and day, m/d, and 'in N months'", () => {
  assert.equal(SG.when("save 2000 by march 15", "2026-10-12"), "2027-03-15");
  assert.equal(SG.when("save 2000 by 3/1", "2026-10-12"), "2027-03-01");
  assert.equal(SG.when("save 5000 in 6 months", "2026-10-12"), "2027-04-12");
});

test("[S04] no date said is asked, never assumed; an impossible date is said", () => {
  assert.equal(ans("i want to save 10000"), "By when? Say it like \"save $10,000 by June\" or \"in 6 months\", and I'll work out the monthly amount from your own numbers. Nothing was set up.");
  assert.match(ans("i want to save 2000 by feb 30"), /^I couldn't read that date/);
});

test("[S05] a target this month is counted in weeks", () => {
  assert.equal(L(ans("i want to save 500 by oct 20"), 0), "To save $500.00 by Oct 20: about $250.00 a week for 2 weeks.");
});

test("[S06] what the person keeps: money in minus money out over the last full months, averaged", () => {
  assert.equal(L(ans("I want to save 10000 by June"), 1), "Over the last 3 full months (Jul-Sep), $3,200.00 a month came in and $2,300.00 went out on average: you kept about $900.00 a month.");
});

test("[S07] transfers to savings are not spending", () => {
  assert.doesNotMatch(L(ans("I want to save 10000 by June"), 1), /\$2,800\.00 went out/);
});

test("[S08] at that pace, where they'd be by the date: short or enough", () => {
  assert.equal(L(ans("I want to save 10000 by June"), 2), "At that pace you'd have about $7,200.00 by Jun 30, 2027, $2,800.00 short of $10,000.00.");
  assert.equal(L(ans("my goal is to save 2000 by 3/1"), 2), "At that pace you'd have about $4,500.00 by Mar 1, 2027, enough for $2,000.00.");
});

test("[S09] more out than in is said, and no pace is projected", () => {
  const t = ans("I want to save 10000 by June", TX.concat([r("2026-07-05", -200000, "BEST BUY"), r("2026-08-05", -200000, "BEST BUY"), r("2026-09-05", -200000, "BEST BUY")]));
  assert.match(L(t, 1), /: \$1,100\.00 a month more went out than came in\.$/);
  assert.doesNotMatch(t, /At that pace/);
});

test("[S10] fewer than a full month of rows: said, nothing averaged", () => {
  assert.match(L(ans("I want to save 10000 by June", [r("2026-10-01", -150000, "OAK RENT")]), 1), /^Your linked transactions don't cover a full month yet/);
});

test("[S11] only months the rows fully cover count: rows starting Aug 3 use September alone", () => {
  assert.match(L(ans("I want to save 10000 by June", TX.filter((x) => x.posted_on >= "2026-08-03")), 1), /^Over the last full month \(Sep\), \$3,000\.00 a month came in and \$2,300\.00 went out: you kept about \$700\.00 a month\.$/);
});

test("[S12] savings balances are said, never assumed to be for this", () => {
  assert.match(ans("I want to save 10000 by June"), /\nYour savings account holds \$3,000\.00 today; if some of it is for this, you need less\.\n/);
  assert.doesNotMatch(ans("I want to save 10000 by June", TX, [ACC[0]]), /savings account holds/);
});

test("[S13] amounts as people write them: 10k, $5,000, 2500.50", () => {
  assert.equal(SG.ask("i want to save 10k by june").amount_cents, 1000000);
  assert.equal(SG.ask("help me save $5,000 in 6 months").amount_cents, 500000);
  assert.equal(SG.ask("i want to save 2500.50 by june").amount_cents, 250050);
});

test("[S14] the ways people ask; saving on a bill or a vague wish is not this", () => {
  for (const m of ["I want to save 10000 by June", "help me save $5,000 in 6 months", "my goal is to save 2000 by 3/1", "how can i save 3000 by december", "i need to put away 1500 by march"]) assert.ok(SG.ask(m), m);
  for (const m of ["how can i save money", "i want to save 50 on groceries by june", "help me save on gas", "save me a seat", "i saved 200 last month"]) assert.equal(SG.ask(m), null, m);
});

test("[S15] the math only, said; nothing moved; the source line ends it", () => {
  const t = ans("I want to save 10000 by June");
  assert.match(t, /\nThis is the math only: nothing is moved or set aside, and goals aren't saved yet\.\n/);
  assert.ok(t.endsWith(`\n${SRC}`));
});
