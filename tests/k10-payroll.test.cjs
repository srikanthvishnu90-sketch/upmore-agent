// Cluster K10 — payroll/benefits/equity preparation surfaces (118-payroll-benefits.js).
// Parity: every expected dollar below was computed by hand from tests/fixtures/k10-standin.json
// (stand-in data, labeled as such in every reply) before the module was run.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PB = require("../packages/domain/118-payroll-benefits.js");
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "packages/offers/payroll-reference.json"), "utf8"));
const profile = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/k10-standin.json"), "utf8"));
const TODAY = "2026-10-12";
const ctx = (over = {}) => ({ profile: { ...profile, ...over }, ref, today: TODAY });
const ans = (msg, c) => PB.answer(msg, c || ctx());

test("reference data validates; a corrupted 83(b) window is refused, never quoted", () => {
  assert.deepEqual(PB.validate(ref), []);
  const bad = JSON.parse(JSON.stringify(ref)); bad.rules.b83_window_days = 45;
  assert.match(PB.answer("keep my equity grants from becoming tax disasters", { profile, ref: bad, today: TODAY }).text, /failed its own checks/);
});

test("routing: each of the 9 asks fires only its own capability; unrelated text fires nothing", () => {
  const cases = [
    ["I had a 401(k) at my first job. Find it.", "C101"],
    ["Submit my FSA expenses before I lose the money.", "C103"],
    ["Am I leaving money on the table at work?", "C108"],
    ["My refund was $4,000 - that's an interest-free loan. Fix my W-4.", "C159"],
    ["Keep my PSLF on track.", "C172"],
    ["Set up and use my dependent care FSA.", "C184"],
    ["Split my paycheck - $500 a month to the new savings account.", "C196"],
    ["Pick my benefits for next year.", "C202"],
    ["Keep my equity grants from becoming tax disasters.", "C204"],
  ];
  for (const [m, id] of cases) assert.equal(PB.kind(m), id, m);
  for (const m of ["what's my balance", "cancel netflix", "buy $5 of VOO", ""]) assert.equal(PB.kind(m), null, m);
  assert.equal(PB.answer("what's my balance", ctx()), null);
});

test("C101 parity: $8,432.17 + $12,905.44 = $21,337.61, official workflow, rollover as handoff", () => {
  const t = ans("I had a 401(k) at my first job. Find it.").text;
  assert.match(t, /\$21,337\.61/); assert.match(t, /Northwind Logistics/); assert.match(t, /Lakeside Studio/);
  assert.match(t, /National Registry of Unclaimed Retirement Benefits/); assert.match(t, /rollover packet/);
  assert.match(t, /Stand-in data/);
});
test("C101 adversarial: no accounts on file invents no balances", () => {
  const t = ans("I had a 401(k) at my first job. Find it.", ctx({ oldAccounts: [] })).text;
  assert.match(t, /won't invent any/); assert.doesNotMatch(t, /\$21,337/);
});

test("C103 parity: eligible $42.18 + $180.00 = $222.18; vitamins excluded; $390.22 at risk; 80 days left", () => {
  const t = ans("Submit my FSA expenses before I lose the money.").text;
  assert.match(t, /\$222\.18/); assert.match(t, /Left out: Daily vitamins, Oct 2 \$28\.00/);
  assert.match(t, /\$390\.22 is still at risk/); assert.match(t, /80 days left/); assert.match(t, /you file, I prepare/);
});

test("C108 parity: match $3,360 at 4% vs $3,840 at 5%; ESPP gain $1,694.12; total $3,117.32/yr", () => {
  assert.equal(PB.matchAt(profile, 4), 336000); assert.equal(PB.matchAt(profile, 5), 384000);
  assert.equal(PB.matchAt(profile, 0), 0); assert.equal(PB.matchAt(profile, 10), 384000); // capped at last tier
  const t = ans("Am I leaving money on the table at work?").text;
  assert.match(t, /leaving \$3,117\.32 a year/); assert.match(t, /\$480\.00 a year missed/);
  assert.match(t, /\$1,694\.12/); assert.match(t, /\$343\.20/); assert.match(t, /you submit/);
});

test("C159 parity: $4,000 refund / 0.22 = $18,181.82 on line 4(b); $153.85/paycheck; $333.33/month", () => {
  const t = ans("My refund was $4,000 - fix my W-4 withholding.").text;
  assert.match(t, /Step 4\(b\) — Deductions: \$18,181\.82/); assert.match(t, /\$153\.85 more per paycheck/);
  assert.match(t, /\$333\.33 a month/); assert.match(t, /you file it with your employer/);
});
test("C159 adversarial: a $0 refund gets no W-4 change", () => {
  const t = ans("fix my W-4 withholding", ctx({ w4: { lastRefundCents: 0 } })).text;
  assert.match(t, /No change prepared/);
});

test("C172 parity: 68/120, 52 left, ETA February 2031, paid $14,768.00, forgiven est. $23,682.00, gap flagged", () => {
  const t = ans("Keep my PSLF on track.").text;
  assert.match(t, /68 of 120/); assert.match(t, /52 to go/); assert.match(t, /February 2031/);
  assert.match(t, /roughly \$23,682\.00 would be forgiven \(estimate/); assert.match(t, /Gap flagged: Mar 2023, Apr 2023, May 2023/);
});
test("C172 adversarial: at 120 the answer switches to the final application", () => {
  const t = ans("keep my pslf on track", ctx({ pslf: { ...profile.pslf, qualifyingPayments: 120 } })).text;
  assert.match(t, /final forgiveness application/);
});

test("C184 parity: $5,000 election, saving $5,000 x 29.65% = $1,482.50; receipts $1,700; no SSN in chat", () => {
  const t = ans("Set up and use my dependent care FSA.").text;
  assert.match(t, /elect \$5,000\.00/); assert.match(t, /Tax saving: \$1,482\.50/); assert.match(t, /\$1,700\.00 of provider receipts/);
  assert.match(t, /no SSN in chat, ever/);
});
test("C184 adversarial: an election above the household cap is capped, and says so", () => {
  const t = ans("set up my dependent care fsa", ctx({ dcfsa: { ...profile.dcfsa, proposedElectionCents: 750000 } })).text;
  assert.match(t, /elect \$5,000\.00/); assert.match(t, /capped at the \$5,000\.00 household limit/);
});

test("C196 parity: $500/mo on 26 checks = $230.77/check; remainder $2,616.54; sums to net $2,847.31; prepared only", () => {
  const t = ans("Split my paycheck - $500 a month to the new savings account.").text;
  assert.match(t, /PREPARED — not submitted/); assert.match(t, /\$230\.77 a paycheck/);
  assert.match(t, /\$230\.77 \+ \$2,616\.54 = \$2,847\.31/); assert.match(t, /never paste account or routing numbers in chat/);
});
test("C196 adversarial: a split at or above net pay is refused", () => {
  const t = ans("change my direct deposit: split my paycheck $3,000 to savings", ctx()).text;
  assert.match(t, /won't prepare it/);
});

test("C202 parity: PPO $4,395.00, EPO $3,850.00, HDHP $2,980.00; HDHP least, saves $1,415.00 vs PPO", () => {
  const t = ans("Pick my benefits for next year.").text;
  assert.match(t, /PPO: premiums \$3,720\.00 \+ your usage \$675\.00 = \$4,395\.00/);
  assert.match(t, /EPO: premiums \$2,880\.00 \+ your usage \$970\.00 = \$3,850\.00/);
  assert.match(t, /HDHP: premiums \$2,220\.00 \+ your usage \$1,760\.00 − employer HSA \$1,000\.00 = \$2,980\.00/);
  assert.match(t, /saving \$1,415\.00 versus the PPO/); assert.match(t, /not a recommendation/); assert.match(t, /you submit/);
});

test("C204 parity: 83(b) due Oct 28, 2026, 16 days from Oct 12; RSU vest Nov 15; ESPP closes Oct 31", () => {
  const t = ans("Keep my equity grants from becoming tax disasters.").text;
  assert.match(t, /83\(b\) WARNING/); assert.match(t, /due Oct 28, 2026, 16 days from today/);
  assert.match(t, /75 vest next on Nov 15, 2026/); assert.match(t, /enrollment closes Oct 31, 2026/);
  assert.match(t, /I don't file it/);
});
test("C204 adversarial: a passed 83(b) deadline is never backdated advice", () => {
  const t = PB.answer("keep my equity grants safe", { profile: { ...profile, equity: { ...profile.equity, isoGrantDate: "2026-08-01" } }, ref, today: TODAY }).text;
  assert.match(t, /cannot be extended or backdated/); assert.match(t, /Do not backdate anything/);
  const filed = PB.answer("equity paper chase", { profile: { ...profile, equity: { ...profile.equity, b83Filed: true } }, ref, today: TODAY }).text;
  assert.match(filed, /filed, confirmed/);
});

test("every reply labels stand-in data and names its as-of date", () => {
  for (const m of ["find my 401(k) at my first job", "file my fsa claims", "benefits audit please"]) {
    const t = ans(m).text;
    assert.match(t, /Stand-in data/); assert.match(t, /as of Oct 12, 2026/);
  }
});
