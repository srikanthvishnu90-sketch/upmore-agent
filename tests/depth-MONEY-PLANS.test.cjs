// Money plans in depth (docs/depth/MONEY-PLANS.md): packages/domain/60-agent-money-plans.js, the pure half of requests for
// money, scheduled and recurring sends, own-account transfers, autosave rules, the overdraft-prevention move, failed-payment
// triage, group expenses, shared goals, gifts and household roles. Every plan is a loop request with exact confirm fields;
// nothing here moves money. The module is not yet imported by any edge or app path (no build script bundles it), so these
// tests pin the module itself. One test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect
// makes exactly this test fail. People, accounts and rows are MOCK.
// Check: node --test tests/depth-MONEY-PLANS.test.cjs && node evals/depth/run.cjs MONEY-PLANS
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const ctx = vm.createContext({});
vm.runInContext(["32-merchant-label.js", "33-agent-monitors.js", "42-agent-recipients.js", "48-money-math.js", "54-agent-money.js", "57-agent-ledger.js", "60-agent-money-plans.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n") + "\nthis.MP = AgentMoneyPlans;", ctx);
const { MP } = ctx;
const plain = x => JSON.parse(JSON.stringify(x));
const T = "2026-10-12"; // a Monday
const PEOPLE = [
  { id: "mock-p1", name: "Sarah Mock", handle: "@sarah-mock", rails: ["paypal"], history: [{ amount_cents: 2500, on: "2026-09-01" }] },
  { id: "mock-p2", name: "Maya Mock", rails: ["cash_app"], history: [{ amount_cents: 2000, on: "2026-09-05" }] },
  { id: "mock-p3", name: "Landlord Mock LLC", bank_account: true, rails: [], history: [{ amount_cents: 180000, on: "2026-09-01" }] },
  { id: "mock-p4", name: "Dev Mock", handle: "@dev-mock", rails: ["venmo"], history: [{ amount_cents: 3000, on: "2026-09-10" }] }
];
const ACCOUNTS = [
  { id: "mock-chk", kind: "checking", nickname: "checking", institution: "Mock Bank", balance_cents: 150000, available_cents: 142000, owners: ["me"] },
  { id: "mock-sav", kind: "savings", nickname: "savings", institution: "Mock Bank", balance_cents: 400000, owners: ["me"] },
  { id: "mock-joint", kind: "checking", nickname: "joint", institution: "Mock Credit Union", balance_cents: 80000, owners: ["me", "partner"] },
  { id: "mock-teen", kind: "checking", nickname: "teen", institution: "Mock Bank", balance_cents: 5000, owners: ["kid"] }
];
const ctxOf = extra => Object.assign({ people: PEOPLE, accounts: ACCOUNTS, today: T }, extra || {});
let n = 0;
const tx = (d, c, m, o) => Object.assign({ id: `mock-${++n}`, account_id: "mock-chk", posted_at: d, amount_cents: c, merchant_raw: m, is_pending: false, is_transfer: false }, o);

test("[S01] rails are said by their names: PayPal, Cash App, Venmo, ACH (never \"Paypal\" or \"CASH_APP\")", () => {
  assert.equal(MP.requestMoney({ from: "Sarah Mock", amount_cents: 4250, what: "dinner" }, ctxOf()).text, "PayPal request to Sarah Mock (@sarah-mock) for $42.50, note \"dinner\": staged, you tap Request.");
  assert.equal(MP.requestMoney({ from: "Maya Mock", amount_cents: 2000, what: "tickets" }, ctxOf()).text, "Cash App request to Maya Mock for $20.00, note \"tickets\": staged, you tap Request.");
  assert.match(MP.schedulePayment({ to: "Dev Mock", amount_cents: 3000, on: "2026-10-20" }, ctxOf()).text, /^Scheduled: \$30\.00 to Dev Mock on 2026-10-20 by Venmo\. You can cancel until 2026-10-19;/);
  assert.match(MP.schedulePayment({ to: "Landlord Mock LLC", amount_cents: 180000, on: "2026-11-02" }, ctxOf()).text, /^Scheduled: \$1,800\.00 to Landlord Mock LLC on 2026-11-02 by ACH\./);
  assert.match(MP.allowance({ to: "Maya Mock", amount_cents: 2000, cadence: "weekly", day: 5 }, ctxOf()).text, / by Cash App\./);
});

test("[S02] a date that is not on the calendar is asked about, never scheduled (2026-02-30 would never come round) and never a crash", () => {
  const ask = "Which date? I could not read that as a calendar day.";
  assert.deepEqual(plain(MP.schedulePayment({ to: "Landlord Mock LLC", amount_cents: 180000, on: "2027-02-30" }, ctxOf())), { ask });
  assert.deepEqual(plain(MP.schedulePayment({ to: "Landlord Mock LLC", amount_cents: 180000, on: "11/02/2026" }, ctxOf())), { ask });
  assert.deepEqual(plain(MP.schedulePayment({ to: "Landlord Mock LLC", amount_cents: 180000, on: "2026-10-12" }, ctxOf())), { ask: "Which date? It has to be after today." });
  assert.equal(MP.schedulePayment({ to: "Landlord Mock LLC", amount_cents: 180000, on: "2028-02-29" }, ctxOf()).schedule.cutoff_on, "2028-02-28", "a leap day is a real day");
});

test("[S03] one credit settles one request: two open $20.00 requests and one $20.00 payment leave one open", () => {
  const a = MP.requestMoney({ from: "Maya Mock", amount_cents: 2000, what: "concert" }, ctxOf({ today: "2026-10-01" })).request;
  const b = Object.assign({}, a, { id: "mock-req-2", what: "parking" });
  const out = MP.settleRequests([a, b], [tx("2026-10-05", 2000, "CASH APP FROM MAYA MOCK", { id: "mock-credit-1" })], PEOPLE);
  assert.deepEqual(plain(out), [{ request_id: a.id, transaction_id: "mock-credit-1", text: "Maya Mock paid the $20.00 for concert on 2026-10-05." }]);
  assert.equal(a.status, "settled");
  assert.equal(b.status, "open", "the same $20.00 never pays two requests");
});

test("[S04] round-ups are on posted purchases only: a pending charge is rounded once, when it posts, never twice", () => {
  const rows = [tx("2026-10-10", -425, "COFFEE MOCK", { account_id: "mock-card" }), tx("2026-10-11", -310, "BAKERY MOCK", { account_id: "mock-card", is_pending: true })];
  const out = MP.autosave([{ id: "mock-ru", kind: "round_up", from: "mock-chk", to: "mock-sav", account_id: "mock-card", last_run_on: "2026-10-01" }], ctxOf({ transactions: rows }));
  assert.equal(out[0].request.params.amount_cents, 75);
  assert.deepEqual(plain(out[0].request.evidence.rows), [rows[0].id]);
  assert.equal(out[0].request.describe, "Autosave $0.75 to savings (round-ups on 1 purchases since 2026-10-01)");
});

test("[S05] the overdraft move is never a $0.00 transfer: empty savings says so and asks for nothing", () => {
  const rent = ["2026-07-15", "2026-08-15", "2026-09-15"].map(d => tx(d, -90000, "RENT MOCK"));
  const od = MP.overdraftPrevention({ today: T, accounts: [{ id: "mock-chk", kind: "checking", nickname: "checking", balance_cents: 1000, available_cents: 1000 }, { id: "mock-sav", kind: "savings", nickname: "savings", balance_cents: 0 }], transactions: rent, buffer_cents: 20000 });
  assert.equal(od.needed, true);
  assert.equal(od.amount_cents, 0);
  assert.equal(od.short_cents, 109000);
  assert.equal(od.request, null);
  assert.equal(od.text, "Checking goes under your $200.00 buffer on 2026-10-13 and bottoms at -$890.00 on 2026-10-15. Savings has $0.00 available, so there is nothing to move from it; checking is $1,090.00 short of the line.");
});

test("[S06] a monthly allowance on the 29th-31st goes on the month's last day in a shorter month (leap years included)", () => {
  const al = day => ({ id: `mock-al-${day}`, name: "Maya Mock", status: "active", cadence: "monthly", day, amount_cents: 5000, rail: "cash_app" });
  const due = (a, d) => MP.dueAllowances([a], d).length;
  assert.equal(due(al(31), "2026-11-30"), 1, "November has 30 days");
  assert.equal(due(al(31), "2026-11-29"), 0);
  assert.equal(due(al(31), "2026-10-31"), 1);
  assert.equal(due(al(31), "2026-10-30"), 0, "October has a 31st");
  assert.equal(due(al(30), "2028-02-29"), 1, "2028 is a leap year");
  assert.equal(due(al(29), "2028-02-29"), 1);
  assert.equal(due(al(29), "2027-02-28"), 1, "2027 is not");
  assert.equal(due(al(29), "2028-02-28"), 0);
});

test("[S07] a shared goal's monthly amounts actually get there: $100.00 over three people and three months is $11.12, $11.11, $11.11", () => {
  const g = MP.group({ name: "Mock trip", members: ["Ana", "Ben", "Cy"], goal: { name: "Mock fund", target_cents: 10000, by: "2027-01-10" } });
  const p = MP.goalPlan(g, T);
  assert.deepEqual(plain(p.per_member.map(m => [m.remaining_cents, m.per_month_cents])), [[3334, 1112], [3333, 1111], [3333, 1111]]);
  for (const m of p.per_member) assert.ok(m.per_month_cents * 3 >= m.remaining_cents, `${m.who} reaches their share`);
  assert.equal(p.text, "Mock fund: $0.00 of $100.00 in. Ana $11.12/month, Ben $11.11/month, Cy $11.11/month gets there by 2027-01-10.");
});

test("[S08] a gift without an amount asks how much (never \"$NaN.NaN\")", () => {
  assert.deepEqual(plain(MP.gift({ to: "Sarah Mock", occasion: "Happy birthday" }, ctxOf())), { ask: "How much?" });
  assert.deepEqual(plain(MP.gift({ to: "Sarah Mock", occasion: "Happy birthday", amount_cents: 0 }, ctxOf())), { ask: "How much?" });
  const g = MP.gift({ to: "Sarah Mock", occasion: "Happy birthday", amount_cents: 5000 }, ctxOf());
  assert.equal(g.text, "$50.00 to Sarah Mock today with the note \"Happy birthday\". Confirm and it goes.");
  assert.equal(g.request.confirm.amount, "$50.00");
});

test("[S09] an allowance is restated in exact terms and says each send waits for a yes (it never promises to run on its own)", () => {
  assert.equal(MP.allowance({ to: "Maya Mock", amount_cents: 2000, cadence: "weekly", day: 5, max_per_month_cents: 6000 }, ctxOf()).text, "Allowance: $20.00 to Maya Mock every Friday by Cash App, never more than $60.00 a month. I ask for your yes before each send.");
  assert.equal(MP.allowance({ to: "Maya Mock", amount_cents: 2000, cadence: "biweekly", day: 1 }, ctxOf()).text, "Allowance: $20.00 to Maya Mock every other Monday by Cash App. I ask for your yes before each send.");
  assert.equal(MP.allowance({ to: "Landlord Mock LLC", amount_cents: 5000, cadence: "monthly", day: 31 }, ctxOf()).text, "Allowance: $50.00 to Landlord Mock LLC monthly on the 31st (the last day in shorter months) by ACH. I ask for your yes before each send.");
  assert.equal(MP.allowance({ to: "Maya Mock", amount_cents: 2000, cadence: "monthly" }, ctxOf()).text, "Allowance: $20.00 to Maya Mock monthly on the 1st by Cash App. I ask for your yes before each send.");
});

test("[S10] an own transfer never overdraws, and moving exactly what is available is allowed (it leaves $0.00)", () => {
  const over = MP.ownTransfer({ from: "checking", to: "savings", amount_cents: 142001 }, ctxOf());
  assert.equal(over.stop, true);
  assert.equal(over.text, "checking has $1,420.00 available; $1,420.01 would overdraw it. Nothing moved.");
  const all = MP.ownTransfer({ from: "checking", to: "savings", amount_cents: 142000 }, ctxOf());
  assert.equal(all.leaves_cents, 0);
  assert.deepEqual(plain(all.request.confirm), { action: "Move", amount: "$1,420.00", recipient: "savings", from: "checking", timing: "instant", fee_cents: 0 });
  assert.equal(MP.ownTransfer({ from: "checking", to: "joint", amount_cents: 100 }, ctxOf()).request.confirm.timing, "1-2 business days", "another institution is not instant");
});

test("[S11] an ACH can be cancelled until the business day before (Monday's payment until Friday); after that it is in flight", () => {
  const s = MP.schedulePayment({ to: "Landlord Mock LLC", amount_cents: 180000, on: "2026-11-02" }, ctxOf()).schedule;
  assert.equal(s.cutoff_on, "2026-10-30");
  assert.equal(MP.cancelScheduled(Object.assign({}, s), "2026-10-30").cancelled, true, "the cutoff day itself still cancels");
  const late = MP.cancelScheduled(Object.assign({}, s), "2026-10-31");
  assert.equal(late.text, "The $1,800.00 to Landlord Mock LLC passed its cutoff on 2026-10-30 and is in flight. An ACH can be recalled the same day through the bank; I can draft that request.");
  assert.equal(MP.schedulePayment({ to: "Landlord Mock LLC", amount_cents: 100, on: "2026-10-13" }, ctxOf()).schedule.cutoff_on, "2026-10-12", "Tuesday's ACH cuts off Monday");
});

test("[S12] reminders keep their pace: friendly after 7 days then 14, firm after 3, the days counted in the text", () => {
  const r = MP.requestMoney({ from: "Sarah Mock", amount_cents: 4250, what: "dinner", tone: "friendly" }, ctxOf()).request;
  assert.equal(MP.reminder(r, "2026-10-18"), null, "6 days");
  assert.equal(MP.reminder(r, "2026-10-19").text, "Hey Sarah, when you get a sec: $42.50 for dinner. No rush!");
  r.reminders_sent = 1;
  assert.equal(MP.reminder(r, "2026-10-25"), null, "13 days");
  assert.equal(MP.reminder(r, "2026-10-26").text, "Gentle nudge on the $42.50 for dinner whenever works.");
  const f = MP.requestMoney({ from: "Maya Mock", amount_cents: 2000, what: "tickets", tone: "firm" }, ctxOf()).request;
  assert.equal(MP.reminder(f, "2026-10-15").text, "Maya, the $20.00 for tickets is now 3 days old. Can you send it today?");
});

test("[S13] a failed payment's cause decides the step; a retry is a new key that names the original, never a blind resend", () => {
  const failed = { capability_id: "PAY-001", idempotency_key: "send:mock-p4:3000:2026-10-11", describe: "Send $30.00 to Dev Mock", params: { amount_cents: 3000, recipient: "Dev Mock", from: "mock-chk" }, reason: "ACH return R01 insufficient funds" };
  const t1 = MP.triageFailed(failed, ctxOf());
  assert.equal(t1.request.idempotency_key, "send:mock-p4:3000:2026-10-11:retry:2026-10-12");
  assert.equal(t1.request.retry_of, "send:mock-p4:3000:2026-10-11");
  assert.equal(t1.text, "Send $30.00 to Dev Mock failed: insufficient funds. Funds are there now; retry. The retry is a new confirmation.");
  const t2 = MP.triageFailed(Object.assign({}, failed, { reason: "R04 invalid account number" }), ctxOf());
  assert.equal(t2.retry, false);
  assert.equal(t2.request, undefined);
  assert.equal(MP.triageFailed(Object.assign({}, failed, { reason: "rail timeout" }), ctxOf()).cause, "rail_down");
});

test("[S14] a sweep keeps the floor: $2,000.00 on payday from $1,420.00 available with a $1,000.00 floor moves $420.00", () => {
  const out = MP.autosave([{ id: "mock-x", kind: "payday_sweep", from: "mock-chk", to: "mock-sav", amount_cents: 200000, keep_at_least_cents: 100000 }], ctxOf({ transactions: [tx(T, 160000, "PAYROLL MOCK")] }));
  assert.equal(out[0].request.params.amount_cents, 42000);
  assert.equal(out[0].request.describe, "Autosave $420.00 to savings (your fixed $2,000.00 on payday, trimmed to keep $1,000.00 in checking)");
  const th = MP.autosave([{ id: "mock-th", kind: "threshold", from: "mock-chk", to: "mock-sav", above_cents: 120000, keep_at_least_cents: 100000 }], ctxOf());
  assert.equal(th[0].request.params.amount_cents, 22000, "only what is above the line");
});

test("[S15] a payday percent rounds to the cent, half up: 10 percent of $1,234.55 is $123.46", () => {
  const out = MP.autosave([{ id: "mock-pct", kind: "payday_sweep", from: "mock-chk", to: "mock-sav", percent_bps: 1000, keep_at_least_cents: 0 }], ctxOf({ transactions: [tx(T, 123455, "ACME MOCK DIRECT DEP")] }));
  assert.equal(out[0].request.params.amount_cents, 12346);
  assert.equal(out[0].request.describe, "Autosave $123.46 to savings (10 percent of today's $1,234.55 paycheck)");
});

test("[S16] group balances say who is owed and who owes, and settle in the fewest transfers", () => {
  const g = MP.group({ name: "Mock trip", members: ["me", "Sarah Mock", "Maya Mock"] });
  MP.addExpense(g, { what: "deposit", amount_cents: 30001, payer: "me", on: "2026-10-01" });
  const b = MP.groupBalances(g);
  assert.deepEqual(plain(b.balances.map(x => x.statement)), ["me is owed $200.00", "Sarah Mock owes $100.00", "Maya Mock owes $100.00"]);
  assert.equal(b.settle_up.reduce((s, t) => s + t.amount_cents, 0), 20000);
});

test("[S17] a teen acts only on their own account and up to their limit; the owner approves above it", () => {
  const h = MP.household({ members: [{ id: "me", name: "Vee", role: "owner" }, { id: "kid", name: "Sam", role: "teen", limit_cents: 2500 }] });
  assert.equal(MP.mayAct(h, "kid", { params: { from: "mock-teen", amount_cents: 2500 } }, ACCOUNTS).allowed, true, "at the limit");
  assert.deepEqual(plain(MP.mayAct(h, "kid", { params: { from: "mock-teen", amount_cents: 2501 } }, ACCOUNTS)), { allowed: false, reason: "over Sam's $25.00 limit; the owner approves above it" });
  assert.deepEqual(plain(MP.mayAct(h, "kid", { params: { from: "mock-chk", amount_cents: 100 } }, ACCOUNTS)), { allowed: false, reason: "Sam may only act on their own account" });
});

test("[S18] the settled-debts feed is off unless the person turned it on with a real yes (a stored \"false\" string stays off)", () => {
  const settled = [{ from: "me", to: "Sarah Mock", what: "dinner", on: T }];
  assert.equal(MP.socialFeed(settled, { social_feed: "false" }).enabled, false);
  assert.equal(MP.socialFeed(settled, {}).text, "The settled-debts feed is off. It stays off unless you turn it on; nothing is shared.");
  assert.equal(MP.socialFeed(settled, { social_feed: true }).items[0].text, "me and Sarah Mock settled dinner");
});

test("[S19] the monthly cap on an allowance is inclusive: $40.00 sent plus $20.00 fits a $60.00 cap, $40.01 does not", () => {
  const al = MP.allowance({ to: "Maya Mock", amount_cents: 2000, cadence: "weekly", day: 5, max_per_month_cents: 6000 }, ctxOf()).allowance;
  assert.equal(MP.dueAllowances([al], "2026-10-16", { [al.id]: 4000 })[0].request.params.amount_cents, 2000);
  assert.deepEqual(plain(MP.dueAllowances([al], "2026-10-16", { [al.id]: 4001 })), [{ allowance_id: al.id, skipped: "this month's $60.00 cap would be passed" }]);
});

test("[ADV] sloppy inputs ask instead of guessing: an unknown person, a string amount, a past date, a missing amount", () => {
  assert.match(MP.requestMoney({ from: "Priya", amount_cents: 4000 }, ctxOf()).ask, /^Who is Priya\? I only request money from people in your list/);
  assert.deepEqual(plain(MP.requestMoney({ from: "Sarah Mock", amount_cents: "20" }, ctxOf())), { ask: "How much?" });
  assert.deepEqual(plain(MP.schedulePayment({ to: "Dev Mock", amount_cents: 100, on: "2026-10-01" }, ctxOf())), { ask: "Which date? It has to be after today." });
  assert.deepEqual(plain(MP.ownTransfer({ from: "checking", to: "savings", amount_cents: -500 }, ctxOf())), { ask: "How much?" });
  assert.deepEqual(plain(MP.allowance({ to: "Maya Mock", amount_cents: 2000, cadence: "daily" }, ctxOf())), { ask: "Weekly, every two weeks, or monthly?" });
});
