// The earn engine, one sub-capability at a time (docs/depth/EARN.md): packages/domain/44-agent-earn.js (AgentEarn) tracks
// a bank bonus's requirements against the account's own rows, values employer benefits left on the table, matches
// settlements and recalls to the person's own merchants and states, values points at the real rate, tracks referral
// payouts and earn-app thresholds, schedules the 7-day and 1-day deadline alerts, verifies by the credit itself and books
// verified credits only. Nothing here acts: every play is an estimate with its time cost until a verify step finds the
// credit. Not reachable in production today: no edge function or app path loads it (the router bundle leaves it out, so
// the proactive feed's `if (Earn)` branch never runs there). It loads with 33-agent-monitors.js (clean, merchantKey,
// addDays, the unclaimed-search cadence), the only module it needs.
// One test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Rows and programs are MOCK.
// Check: node --test tests/depth-EARN.test.cjs && node evals/depth/run.cjs EARN
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const ctx = vm.createContext({});
vm.runInContext(["33-agent-monitors.js", "44-agent-earn.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n") + "\nthis.E = AgentEarn;", ctx);
const { E } = ctx;
const plain = x => JSON.parse(JSON.stringify(x));
const T = "2026-10-12";
let n = 0;
const tx = (account, on, dollars, label, o) => Object.assign({ id: `mock-t${++n}`, account_id: account, posted_at: on, amount: dollars, merchant_raw: label, is_pending: false, is_transfer: false }, o);
const bonus = (reqs, o) => Object.assign({ id: "mb1", bank: "Mock Bank", account_id: "mock-bonus", amount_cents: 30000, opened_on: "2026-09-20", requirements: reqs }, o);
const one = (input) => plain(E.bonuses(Object.assign({ today: T }, input)))[0];
const detect = input => plain(E.detect(Object.assign({ today: T }, input)));
const byKey = r => Object.fromEntries(r.opportunities.map(o => [o.key, o]));

test("[S01] a direct-deposit requirement counts payroll into the bonus account after it opened, nothing else", () => {
  const rows = [tx("mock-bonus", "2026-09-25", 1000, "ACH DIRECT DEP PAYROLL"), tx("mock-bonus", "2026-10-09", 250, "MOCK CO PAYROLL"),
    tx("mock-chk", "2026-10-01", 3250, "PAYROLL DIRECT DEP"), tx("mock-bonus", "2026-09-19", 900, "PAYROLL DIRECT DEP"), tx("mock-bonus", "2026-10-02", 500, "MOBILE CHECK DEPOSIT")];
  const b = one({ transactions: rows, bonuses: [bonus([{ kind: "direct_deposit", amount_cents: 200000, by: "2026-10-30" }])] });
  assert.deepEqual([b.requirements[0].have_cents, b.requirements[0].met, b.status, b.expected_cents], [125000, false, "in_progress", 30000]);
  assert.equal(b.title, "Mock Bank $300.00 bonus: in progress");
  assert.equal(b.effective_return_bps, 1500, "$300 on the $2,000 deposit asked for");
  assert.deepEqual(b.requirements[0].rows.map(r => r.amount), [1000, 250]);
});

test("[S02] a debit-count requirement counts coffee purchases; a bank fee and a transfer do not count", () => {
  const rows = [tx("mock-bonus", "2026-10-01", -4.5, "STARBUCKS COFFEE #12"), tx("mock-bonus", "2026-10-02", -3.25, "PEETS COFFEE"), tx("mock-bonus", "2026-10-03", -12.4, "DUNKIN #221"),
    tx("mock-bonus", "2026-10-03", -3.5, "MONTHLY SERVICE FEE"), tx("mock-bonus", "2026-10-04", -50, "ONLINE TRANSFER TO SAV", { is_transfer: true }), tx("mock-bonus", "2026-10-05", -2.5, "ATM FEES")];
  const b = one({ transactions: rows, bonuses: [bonus([{ kind: "debit_count", count: 3, by: "2026-11-19" }])] });
  // "COFFEE" has the letters "fee" in it: two coffee purchases were thrown out as fees, so the bonus read 1 of 3.
  assert.deepEqual([b.requirements[0].have, b.requirements[0].met, b.status], [3, true, "earned_awaiting_payout"]);
});

test("[S03] a requirement met after its deadline is not met: the bonus is missed, worth nothing, with nothing to chase", () => {
  const late = one({ transactions: [tx("mock-bonus", "2026-10-05", 2000, "PAYROLL DIRECT DEP")], bonuses: [bonus([{ kind: "direct_deposit", amount_cents: 200000, by: "2026-09-30" }], { opened_on: "2026-09-01" })] });
  assert.deepEqual([late.requirements[0].have_cents, late.requirements[0].met, late.status, late.expected_cents, late.action], [0, false, "missed", 0, null]);
  assert.equal(late.title, "Mock Bank $300.00 bonus: missed");
  const onTime = one({ transactions: [tx("mock-bonus", "2026-09-30", 2000, "PAYROLL DIRECT DEP")], bonuses: [bonus([{ kind: "direct_deposit", amount_cents: 200000, by: "2026-09-30" }], { opened_on: "2026-09-01" })] });
  assert.deepEqual([onTime.requirements[0].met, onTime.status, onTime.expected_cents], [true, "earned_awaiting_payout", 30000], "the deadline day itself counts");
  const open = one({ transactions: [], bonuses: [bonus([{ kind: "direct_deposit", amount_cents: 200000, by: "2026-10-12" }])] });
  assert.equal(open.status, "in_progress", "due today is not missed yet");
});

test("[S04] the bonus credit of the stated amount marks it paid; a credit of another amount is not the bonus", () => {
  const reqs = [{ kind: "direct_deposit", amount_cents: 200000, by: "2026-10-30" }];
  const paid = one({ transactions: [tx("mock-bonus", "2026-10-01", 2000, "PAYROLL DIRECT DEP"), tx("mock-bonus", "2026-10-10", 300, "NEW ACCOUNT BONUS")], bonuses: [bonus(reqs)] });
  assert.deepEqual([paid.status, paid.expected_cents, paid.action, paid.title], ["paid", 0, null, "Mock Bank $300.00 bonus: paid"]);
  const other = one({ transactions: [tx("mock-bonus", "2026-10-10", 25, "PROMOTIONAL CREDIT")], bonuses: [bonus(reqs)] });
  assert.deepEqual([other.status, other.expected_cents], ["in_progress", 30000]);
});

test("[S05] met but unpaid past the payout date is overdue with a chase step; on the payout date itself it is still awaited", () => {
  const rows = [tx("mock-bonus", "2026-09-25", 2000, "PAYROLL DIRECT DEP")], reqs = [{ kind: "direct_deposit", amount_cents: 200000, by: "2026-10-30" }];
  const over = one({ transactions: rows, bonuses: [bonus(reqs, { payout_expected_by: "2026-10-11" })] });
  assert.deepEqual([over.status, over.action.type, over.title], ["overdue", "chase_payout", "Mock Bank $300.00 bonus: overdue"]);
  assert.equal(over.action.note, "Requirements met and the payout date passed; the user contacts the bank with this evidence.");
  assert.equal(one({ transactions: rows, bonuses: [bonus(reqs, { payout_expected_by: T })] }).status, "earned_awaiting_payout");
});

test("[S06] a minimum balance with no history is unknown, never met; two readings of one day count as one day; a dip resets the count", () => {
  const req = [{ kind: "min_balance", amount_cents: 1500000, days: 2, by: "2026-12-31" }];
  const none = one({ transactions: [], bonuses: [bonus(req)] });
  assert.deepEqual([none.requirements[0].met, none.status, none.requirements[0].note], [null, "unknown", "no balance history for this account; cannot verify"]);
  const day1 = [{ account_id: "mock-bonus", date: "2026-10-01", balance_cents: 1500000 }, { account_id: "mock-bonus", date: "2026-10-01T18:00:00Z", balance_cents: 1600000 }];
  const dip = { account_id: "mock-bonus", date: "2026-10-02", balance_cents: 1499999 }, at = date => ({ account_id: "mock-bonus", date, balance_cents: 1500000 });
  const kept = hist => one({ transactions: [], balance_history: hist, bonuses: [bonus(req)] }).requirements[0];
  assert.deepEqual([kept(day1).have_days, kept(day1).met, one({ transactions: [], balance_history: day1, bonuses: [bonus(req)] }).status], [1, false, "in_progress"], "two readings on Oct 1 are one day");
  assert.deepEqual([kept(day1.concat([at("2026-10-02")])).have_days, kept(day1.concat([at("2026-10-02")])).met], [2, true]);
  // The dip to $14,999.99 on Oct 2 resets the count. These two read [1, false] and [2, true]: Oct 1 and Oct 3 were added up across
  // the dip between them, so a two-day minimum balance read as kept when it was broken.
  assert.deepEqual([kept(day1.concat([dip])).have_days, kept(day1.concat([dip])).met], [0, false]);
  assert.deepEqual([kept(day1.concat([dip, at("2026-10-03")])).have_days, kept(day1.concat([dip, at("2026-10-03")])).met], [1, false], "Oct 1 and Oct 3 with a dip between are not two days kept");
  assert.deepEqual([kept(day1.concat([dip, at("2026-10-03"), at("2026-10-05")])).have_days, kept(day1.concat([dip, at("2026-10-03"), at("2026-10-05")])).met], [2, true], "a day with no reading neither counts nor resets");
  assert.deepEqual([kept([at("2026-10-01"), at("2026-10-02"), dip].map((h, i) => i === 2 ? Object.assign({}, h, { date: "2026-10-03" }) : h)).met], [true], "a run that reached the days asked for stays met after a later dip");
  assert.deepEqual([kept([at("2026-10-01"), at("2026-10-02"), Object.assign({}, dip, { date: "2026-10-02T15:00:00Z" })]).have_days], [0], "a dip during a day breaks that day");
});

test("[S07] the early-closure reminder lands 30 days before the window ends", () => {
  const b = one({ transactions: [], bonuses: [bonus([{ kind: "debit_count", count: 10, by: "2026-11-19" }], { early_closure_until: "2027-03-20" })] });
  assert.deepEqual(b.deadlines, [{ what: "Mock Bank bonus: debit count", on: "2026-11-19" }, { what: "Mock Bank: keep the account open (early-closure fee)", on: "2027-02-18", note: "30 days before the early-closure window ends" }]);
});

test("[S08] the employer match left on the table is said once a year, not twice", () => {
  const r = detect({ benefits: { salary_cents: 9000000, contribution_pct: 3, match: { up_to_pct: 6, rate_pct: 50 } } });
  const m = byKey(r).employer_match_gap;
  assert.deepEqual([m.title, m.expected_cents, m.expected_monthly_cents, m.action.to_pct], ["$1,350.00 a year of employer match not captured", 135000, 11250, 6]);
  // The queue's reason added the yearly figure and twelve months of it: "$2,700.00 a year estimated".
  assert.equal(plain(E.rank(r.opportunities))[0].reason, "$1,350.00 a year estimated, about 10 minutes (high confidence)");
  assert.equal(byKey(detect({ benefits: { salary_cents: 9000000, contribution_pct: 6, match: { up_to_pct: 6, rate_pct: 50 } } })).employer_match_gap, undefined, "the full match is taken");
});

test("[S09] ESPP, HSA seed and an unused stipend are arithmetic on stated terms; a stipend that has expired is not offered", () => {
  const r = byKey(detect({ benefits: { salary_cents: 9000000, espp: { enrolled: false, discount_pct: 15, max_pct: 10, window_closes: "2026-10-19" }, hsa_seed_cents: 75000, hsa_enrolled: false,
    stipends: [{ name: "Wellness", amount_cents: 50000, used_cents: 12000, expires_on: "2026-12-31" }, { name: "Learning", amount_cents: 100000, used_cents: 0, expires_on: "2026-09-30" }, { name: "Home Office", amount_cents: 30000, used_cents: 0, expires_on: T }] } }));
  assert.equal(r.espp_not_enrolled.title, "Your ESPP discount is worth about $1,350.00 a year and you're not enrolled");
  assert.equal(r.hsa_seed_unclaimed.title, "$750.00 HSA employer seed not claimed");
  assert.equal(r["stipend_unused:wellness"].title, "$380.00 of the Wellness stipend unused");
  assert.equal(r["stipend_unused:home office"].expected_cents, 30000, "the last day to claim is still a day to claim");
  assert.equal(r["stipend_unused:learning"], undefined, "an expired stipend was offered as $1,000.00 unused");
});

test("[S10] a settlement matches only on the person's own merchant AND an eligible state, and only while it is open", () => {
  const rows = [tx("mock-cc", "2026-08-11", -62.4, "KROGER #123"), tx("mock-cc", "2026-09-11", -40, "KROGER #123")];
  const s = o => Object.assign({ id: "ms1", name: "Mock pork settlement", claim_deadline: "2026-10-30", eligibility_merchants: ["Kroger"], eligibility_states: ["TX"], typical_payout_cents: 2500, status: "open" }, o);
  const got = byKey(detect({ transactions: rows, statesLived: ["tx"], settlements: [s()] }))["settlement:ms1"];
  // This settlement has no class period on file. The title read "Mock pork settlement: you likely qualify (claim by 2026-10-30)"
  // without checking any purchase date against one; it now says the window was not checked (S23 covers a period on file).
  assert.deepEqual([got.title, got.expected_cents, got.tier, got.evidence.rows.length], ["Mock pork settlement: you may qualify (claim by 2026-10-30); no class period on file, so check your purchase dates", 2500, "T3", 2]);
  assert.match(got.action.note, /^Likely, not certain/);
  assert.equal(byKey(detect({ transactions: rows, statesLived: ["CA"], settlements: [s()] }))["settlement:ms1"], undefined, "wrong state");
  assert.equal(byKey(detect({ transactions: rows, statesLived: ["TX"], settlements: [s({ eligibility_merchants: ["Safeway"] })] }))["settlement:ms1"], undefined, "no purchase there");
  assert.equal(byKey(detect({ transactions: rows, statesLived: ["TX"], settlements: [s({ claim_deadline: "2026-10-11" })] }))["settlement:ms1"], undefined, "closed yesterday");
  assert.equal(byKey(detect({ transactions: rows, statesLived: ["TX"], settlements: [s({ status: "closed" })] }))["settlement:ms1"], undefined);
  assert.ok(byKey(detect({ transactions: rows, statesLived: ["TX"], settlements: [s({ claim_deadline: T })] }))["settlement:ms1"], "the last claim day is still open");
});

test("[S11] a recall refund is offered on a matching purchase while its refund deadline has not passed", () => {
  // The purchase names the product (it was the bare "PELOTON", which now reads as unconfirmed: S24).
  const rows = [tx("mock-cc", "2026-05-01", -129.99, "PELOTON MOCK TREAD")];
  const r = o => byKey(detect({ transactions: rows, recalls: [Object.assign({ id: "mr1", product: "Mock Tread", merchant: "Peloton", refund_cents: 12999, purchased_after: "2026-01-01" }, o)] }))["recall:mr1"];
  assert.equal(r({ deadline: "2026-10-13" }).title, "Mock Tread recall: refund of $129.99 available");
  assert.equal(r({ deadline: T }).expected_cents, 12999);
  assert.equal(r({ deadline: "2026-10-01" }), undefined, "a refund whose deadline passed was offered as available");
  assert.equal(r({ purchased_after: "2026-06-01" }), undefined, "bought before the recalled lot");
});

test("[S12] points are valued at the real redemption rate, never the advertised one; expired points are worth nothing", () => {
  const r = byKey(detect({ rewards: [{ program: "Mock Rewards", points: 40000, real_cents_per_point_x100: 125, marketing_cents_per_point_x100: 200, expires_on: "2026-11-11" },
    { program: "Mock Miles", points: 12000, real_cents_per_point_x100: 100, marketing_cents_per_point_x100: 150 }, { program: "Old Mock Points", points: 10000, real_cents_per_point_x100: 100, expires_on: "2026-10-01" }] }));
  assert.equal(r["points_expiring:mock rewards"].title, "40,000 Mock Rewards points ($500.00 at the real rate) expire 2026-11-11");
  assert.deepEqual([r["points_expiring:mock rewards"].expected_cents, r["points_expiring:mock rewards"].marketing_cents], [50000, 80000]);
  assert.equal(r["points_balance:mock miles"].title, "12,000 Mock Miles points are worth $120.00 (not the $180.00 the program advertises)");
  assert.equal(r["points_balance:old mock points"], undefined, "points that expired Oct 1 were \"worth $100.00\"");
  assert.equal(r["points_expiring:old mock points"], undefined);
});

test("[S13] a transfer partner above the cash rate is worth the difference, not the whole transfer value", () => {
  const r = byKey(detect({ rewards: [{ program: "Mock MR", points: 12000, real_cents_per_point_x100: 60, transfer_partners: [{ partner: "Mock Air", cents_per_point_x100: 150 }, { partner: "Mock Low", cents_per_point_x100: 50 }] }] }));
  const s = r["transfer_sweet_spot:mock mr"];
  assert.deepEqual([s.title, s.expected_cents], ["Mock MR: transferring to Mock Air is worth $108.00 more than cash", 10800]);
});

test("[S14] referral payouts: pending ones are expected; one referral credit pays one referral", () => {
  const ref = [{ account: "Mock Bank", payout_cents: 5000, referred: [{ name: "A", status: "paid", signed_up_on: "2026-09-01" }, { name: "B", status: "paid", signed_up_on: "2026-09-02" }, { name: "C", status: "signed_up", signed_up_on: "2026-10-01", payout_expected_by: "2026-11-01" }] }];
  const r = plain(E.referrals({ transactions: [tx("mock-chk", "2026-10-05", 50, "MOCK BANK REFERRAL BONUS")], referrals: ref }))[0];
  assert.deepEqual([r.title, r.expected_cents, r.capability_id], ["Mock Bank pays $50.00 per referral; 1 pending", 5000, "EARN-004"]);
  assert.equal(r.evidence.computed.paid_seen, 1, "one $50.00 credit was counted as both A's and B's payout");
  const two = plain(E.referrals({ transactions: [tx("mock-chk", "2026-10-05", 50, "MOCK BANK REFERRAL BONUS"), tx("mock-chk", "2026-10-06", 50, "MOCK BANK REFERRAL BONUS")], referrals: ref }))[0];
  assert.equal(two.evidence.computed.paid_seen, 2);
});

test("[S15] an earn app is rated per hour after its cash-out fee; crossing the threshold is a cash-out reminder", () => {
  const r = plain(E.sideIncome({ earn_apps: [{ name: "Mock Surveys", payout_cents: 5000, cashout_fee_cents: 200, minutes_required: 720, earned_cents: 1900, threshold_cents: 2000 }, { name: "Mock Tasks", payout_cents: 1200, minutes_required: 60, earned_cents: 2000, threshold_cents: 2000, cashout_fee_cents: 100 }] }));
  assert.deepEqual([r[0].title, r[0].effective_hourly_cents, r[0].expected_cents, r[0].action], ["Mock Surveys: $4.00 an hour effective after fees", 400, 4800, null]);
  assert.deepEqual([r[1].title, r[1].expected_cents, r[1].tier, r[1].action.type], ["Mock Tasks: you've crossed the $20.00 cash-out threshold", 1900, "T1", "cash_out_reminder"]);
});

test("[S16] deadline alerts fire 7 days out, 1 day out and on the day; 6 and 2 days out stay quiet; a past one is missed", () => {
  const ds = plain(E.deadlines([{ key: "mock", deadlines: ["2026-10-19", "2026-10-18", "2026-10-14", "2026-10-13", T, "2026-10-11"].map(on => ({ what: on, on })) }], T));
  assert.deepEqual(ds.map(d => [d.on, d.days_left, d.fires_today, d.status]), [["2026-10-11", -1, false, "missed"], [T, 0, true, "today"], ["2026-10-13", 1, true, "upcoming"], ["2026-10-14", 2, false, "upcoming"], ["2026-10-18", 6, false, "upcoming"], ["2026-10-19", 7, true, "upcoming"]]);
  assert.deepEqual(ds.find(d => d.on === "2026-10-19").alert_days, ["2026-10-12", "2026-10-18"]);
});

test("[S17] a bonus is verified by its credit posting to the bonus account, not another bank's bonus of the same size", () => {
  const b = plain(E.bonuses({ today: T, transactions: [], bonuses: [bonus([{ kind: "direct_deposit", amount_cents: 200000, by: "2026-10-30" }])] }))[0];
  const other = E.verify(b, { transactions: [tx("mock-other-bank", "2026-10-20", 300, "NEW ACCOUNT BONUS")], since: "2026-09-20" });
  assert.deepEqual(plain(other), { verified: false, reason: "no matching credit has posted" });
  const own = plain(E.verify(b, { transactions: [tx("mock-bonus", "2026-10-21", 300, "NEW ACCOUNT BONUS")], since: "2026-09-20" }));
  assert.deepEqual([own.verified, own.verified_cents, own.evidence.date], [true, 30000, "2026-10-21"]);
});

test("[S18] raising the 401(k) election verifies the step, not the dollars: nothing is booked until the match posts", () => {
  const m = byKey(detect({ benefits: { salary_cents: 9000000, contribution_pct: 3, match: { up_to_pct: 6, rate_pct: 50 } } })).employer_match_gap;
  const v = plain(E.verify(m, { benefits: { contribution_pct: 6 } }));
  assert.deepEqual([v.verified, v.verified_cents], [true, 0], "a changed election was booked as $1,350.00 found, verified");
  assert.equal(v.note, "contribution raised; the match verifies as it posts on payroll");
  assert.deepEqual(plain(E.verify(m, { benefits: { contribution_pct: 5 } })), { verified: false, reason: "contribution election unchanged" });
});

test("[S19] the ledger books verified credits only, and one credit once, however many days it is verified again", () => {
  const L = E.ledger(), o = { play: "E1_bonus", key: "bank_bonus:mb1", expected_cents: 30000, time_minutes: 30 }, v = { verified: true, verified_cents: 30000, evidence: { id: "mock-credit-1" } };
  assert.throws(() => L.book(o, { verified: false, reason: "nothing yet" }, "2026-11-01"), /books verified credits only/);
  L.book(o, v, "2026-11-01"); L.book(o, v, "2026-11-02"); L.book({ play: "E5_referrals", key: "referral:mock bank", time_minutes: 5 }, v, "2026-11-03");
  assert.equal(L.entries.length, 1, "the daily re-check booked the same $300.00 again");
  assert.equal(L.message("2026-11-01"), "$300.00 found since 2026-11-01, about 30 minutes of your actions, verified.");
  L.book({ play: "E6_side_income", key: "earn_app:mock", time_minutes: 5 }, { verified: true, verified_cents: 1900, evidence: { id: "mock-credit-2" } }, "2026-11-02");
  assert.deepEqual(plain(L.summary("2026-11-01", "2026-11-30")), { verified_cents: 31900, time_minutes: 35, count: 2 });
  assert.equal(L.message("2027-01-01"), null);
});

test("[S20] the queue puts verified money first, then dollars by confidence over time, so a small play that costs an hour sinks", () => {
  const ops = [{ key: "a", expected_cents: 500, time_minutes: 60, confidence: "high" }, { key: "b", expected_cents: 2000, time_minutes: 5, confidence: "low" }, { key: "c", expected_cents: 100, time_minutes: 5, confidence: "high" },
    { key: "d", expected_cents: 800, time_minutes: 240, confidence: "high" }];
  const L = E.ledger(); L.book(ops[2], { verified: true, verified_cents: 100, evidence: { id: "mock-c" } }, T);
  const q = plain(E.rank(ops, L));
  assert.deepEqual(q.map(o => o.key), ["c", "b", "a", "d"], "$8.00 that costs four hours sinks below $5.00 that costs one");
  assert.deepEqual(q.map(o => o.reason), ["verified: $1.00", "$20.00 a year estimated, about 5 minutes (low confidence)", "$5.00 a year estimated, about 60 minutes (high confidence)", "$8.00 a year estimated, about 240 minutes (high confidence)"]);
});

test("[S21] a scan needs today's date, and every play stays an estimate with its time cost", () => {
  assert.throws(() => E.detect({}), /today is required \(YYYY-MM-DD\)/);
  assert.throws(() => E.detect({ today: "10/12/2026" }), /today is required/);
  const r = detect({ statesLived: ["TX"] });
  assert.equal(r.note, "Estimates with their time cost. Nothing is booked until a verify step confirms the credit posted.");
  assert.deepEqual(r.opportunities.map(o => [o.key, o.tier, o.estimate, o.expected_cents]), [["unclaimed_search:TX:first", "T0", true, 0]]);
});

test("[S22] the ESPP estimate stops at the $25,000 yearly purchase limit (IRC section 423(b)(8)) and says so", () => {
  const espp = (salary_cents, max_pct, o) => byKey(detect({ benefits: { salary_cents, espp: Object.assign({ enrolled: false, discount_pct: 15, max_pct }, o) } })).espp_not_enrolled;
  const big = espp(30000000, 15);
  // It read "worth about $6,750.00 a year": 15 percent of $300,000 is $45,000 of contributions, past what the limit lets buy.
  assert.deepEqual([big.title, big.expected_cents], ["Your ESPP discount is worth about $3,187.50 a year and you're not enrolled; the $25,000 yearly purchase limit caps it", 318750]);
  assert.equal(big.limit_note, "A tax-qualified ESPP is capped at $25,000 of stock a calendar year, valued at the grant-date price (IRC section 423(b)(8)); at a 15 percent discount that is $21,250.00 of your pay, so the estimate counts $21,250.00, not the $45,000.00 the plan maximum would take.");
  assert.deepEqual([big.evidence.computed.purchase_limit_cents, big.evidence.computed.limit_contribution_cents], [2500000, 2125000]);
  const edge = espp(21250000, 10);
  assert.deepEqual([edge.expected_cents, edge.limit_note, edge.title], [318750, undefined, "Your ESPP discount is worth about $3,187.50 a year and you're not enrolled"], "exactly at the limit is not capped");
  assert.equal(espp(9000000, 10).expected_cents, 135000, "under the limit nothing changes");
  assert.equal(espp(30000000, 15, { section_423: false }).expected_cents, 675000, "a plan stated as not qualified is not under section 423");
});

test("[S23] a settlement with a class period counts only purchases inside it; outside it is not offered", () => {
  const rows = [tx("mock-cc", "2026-08-11", -62.4, "KROGER #123"), tx("mock-cc", "2026-09-11", -40, "KROGER #123")];
  const s = o => Object.assign({ id: "ms2", name: "Mock dairy settlement", claim_deadline: "2026-10-30", eligibility_merchants: ["Kroger"], eligibility_states: ["TX"], typical_payout_cents: 2500, status: "open", proof_required: "receipt" }, o);
  const inside = byKey(detect({ transactions: rows, statesLived: ["TX"], settlements: [s({ class_period: { from: "2026-09-01", to: "2026-12-31" } })] }))["settlement:ms2"];
  assert.deepEqual([inside.title, inside.confidence, inside.evidence.rows.map(r => r.date), inside.class_period], ["Mock dairy settlement: you likely qualify (claim by 2026-10-30)", "medium", ["2026-09-11"], { from: "2026-09-01", to: "2026-12-31" }]);
  assert.equal(inside.evidence.rule, "Purchases at a named merchant inside the class period (2026-09-01 to 2026-12-31) and a state in the eligible list.");
  assert.equal(byKey(detect({ transactions: rows, statesLived: ["TX"], settlements: [s({ class_period: { from: "2019-01-01", to: "2025-12-31" } })] }))["settlement:ms2"], undefined, "purchases in 2026 were offered a claim for a 2019-2025 class");
  assert.equal(byKey(detect({ transactions: rows, statesLived: ["TX"], settlements: [s({ class_period: { to: "2026-08-11" } })] }))["settlement:ms2"].evidence.rows.length, 1, "an open start and the last day of the period");
  const none = byKey(detect({ transactions: rows, statesLived: ["TX"], settlements: [s()] }))["settlement:ms2"];
  assert.deepEqual([none.confidence, none.class_period, none.evidence.rule], ["low", null, "Purchases at a named merchant and a state in the eligible list; no class period on file, so the eligibility window is not checked."]);
  assert.match(none.action.note, /No class period is on file, so whether these purchases fall inside it is not checked\./);
});

test("[S24] a recall that names only a store is unconfirmed: never offered as money, no claim, no refund alert", () => {
  const rows = [tx("mock-cc", "2026-05-01", -129.99, "PELOTON"), tx("mock-cc", "2026-06-01", -45, "PELOTON APPAREL")];
  const rec = o => Object.assign({ id: "mr2", product: "Mock Tread", merchant: "Peloton", refund_cents: 12999, purchased_after: "2026-01-01", deadline: "2026-10-13" }, o);
  const r = detect({ transactions: rows, recalls: [rec()] }), u = byKey(r)["recall:mr2"];
  // It read "Mock Tread recall: refund of $129.99 available" for any purchase at the store, with a T3 claim and a refund alert.
  assert.deepEqual([u.title, u.expected_cents, u.action, u.tier, u.deadlines, u.unconfirmed, u.check_by], ["Mock Tread recall: 2 purchases at Peloton may be the recalled product, but the record does not name it; check before claiming", 0, null, "T0", [], true, "2026-10-13"]);
  assert.deepEqual([r.estimated_cents, r.deadlines.length], [0, 0]);
  assert.equal(byKey(detect({ transactions: rows, recalls: [rec({ product: "Peloton" })] }))["recall:mr2"].expected_cents, 0, "a product named the same as the store can't be told apart from anything else bought there");
  const named = byKey(detect({ transactions: rows.concat([tx("mock-cc", "2026-07-01", -129.99, "PELOTON MOCK TREAD")]), recalls: [rec()] }))["recall:mr2"];
  assert.deepEqual([named.expected_cents, named.evidence.rows.map(x => x.merchant), named.action.type], [12999, ["PELOTON MOCK TREAD"], "file_refund"]);
});

test("[ADV] sloppy and empty input: no rows, a null row, a bonus with no requirements and unknown kinds never read as earned", () => {
  const r = detect({ transactions: [null, { amount: "abc" }], bonuses: [bonus([]), bonus([{ kind: "spend", amount_cents: 50000 }], { id: "mb2" })] });
  const b = byKey(r);
  assert.deepEqual([b["bank_bonus:mb1"].status, b["bank_bonus:mb2"].status, b["bank_bonus:mb2"].requirements[0].note], ["in_progress", "unknown", "unknown requirement kind"]);
  assert.equal(r.estimated_cents, 60000, "two bonuses still to earn, never verified money");
});
