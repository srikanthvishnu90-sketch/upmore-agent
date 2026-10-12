// The monthly budget report (real-world C16; packages/domain/93-budgets.js monthlyReport): for a completed
// month, caps versus actuals in dollars per budget — spent, cap, over or left, percent of the cap, the biggest
// merchants in the category, and the P2P share. Merchant-level tracking is asserted across three accounts
// (two cards and checking): a Venmo payment placed in Restaurants by the person's own category rule counts
// toward the cap like any card charge and is named as P2P money; transfers, pending rows, other months and
// uncategorized spend never leak into a budget's number. Check: node --test tests/budget-report.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const ctx = vm.createContext({});
vm.runInContext(["32-merchant-label.js", "80-money-answers.js", "93-budgets.js"].map(f => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\nthis.B=Budgets;", ctx);
const B = ctx.B;
const same = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
const watches = [
  { id: "b1", kind: "category_budget", category: "restaurants", amount_cents: 40000, period: "month", status: "active" },
  { id: "b2", kind: "category_budget", category: "groceries", amount_cents: 50000, period: "month", status: "active" },
];
const rules = [{ term: "venmo", group: "restaurants" }];
const row = (id, acct, on, cents, m, extra) => Object.assign({ id, account_id: acct, posted_on: on, amount_cents: cents, merchant_raw: m, currency: "USD", is_pending: false, is_transfer: false }, extra || {});
const rows = [
  row("r1", "visa", "2026-09-06", -12000, "CHIPOTLE MEXICAN GRILL"),
  row("r2", "amex", "2026-09-12", -9650, "SWEETGREEN"),
  row("r3", "visa", "2026-09-20", -6100, "STARBUCKS"),
  row("r4", "chk", "2026-09-15", -8500, "VENMO *DINNER CLUB"),
  row("r5", "chk", "2026-09-22", -5000, "VENMO PAYMENT"),
  row("g1", "visa", "2026-09-08", -21010, "TRADER JOES #552"),
  row("g2", "amex", "2026-09-19", -22000, "KROGER #441"),
  row("u1", "visa", "2026-09-10", -6320, "MYSTERY SHOP"),                       // no category: said apart
  row("x1", "chk", "2026-09-14", -20000, "ONLINE TRANSFER", { is_transfer: true }), // own-account move: never spend
  row("x2", "visa", "2026-09-25", -4500, "CHIPOTLE MEXICAN GRILL", { is_pending: true }), // pending: not added
  row("x3", "visa", "2026-10-02", -3000, "CHIPOTLE MEXICAN GRILL"),              // October: outside the report month
];

test("the report: caps vs actuals in dollars, merchant level, across cards and checking", () => {
  const rep = B.monthlyReport(watches, rows, "2026-09", { rules });
  assert.ok(rep); assert.equal(rep.key, "2026-09"); assert.equal(rep.name, "September");
  const rest = rep.budgets.find(b => b.category === "restaurants");
  assert.equal(rest.cap_cents, 40000); assert.equal(rest.spent_cents, 41250, "120.00 + 96.50 + 61.00 + 85.00 + 50.00 across visa, amex and checking");
  assert.equal(rest.left_cents, -1250); assert.equal(rest.pct, 103);
  same(rest.top[0], ["Chipotle", 12000], "the biggest merchant in the category, in dollars");
  const groc = rep.budgets.find(b => b.category === "groceries");
  assert.equal(groc.spent_cents, 43010); assert.equal(groc.left_cents, 6990); assert.equal(groc.pct, 86);
  assert.equal(rep.uncategorized_cents, 6320, "the mystery shop is said apart, never guessed into a budget");
  assert.equal(rep.total_spent_cents, 84260); assert.equal(rep.total_cap_cents, 90000);
  assert.match(rep.text, /Your September budget report \(caps vs what you spent\):/);
  assert.match(rep.text, /Restaurants: \$412\.50 spent of a \$400\.00 cap — \$12\.50 over \(103% of the cap\)\./);
  assert.match(rep.text, /Biggest: Chipotle \$120\.00/);
  assert.match(rep.text, /Groceries: \$430\.10 spent of a \$500\.00 cap — \$69\.90 left \(86% of the cap\)\./);
  assert.match(rep.text, /Across all 2 budgets: \$842\.60 spent against \$900\.00 of caps\./);
  assert.match(rep.text, /\$63\.20 of September spending wasn't in any category I know/);
});

test("P2P counts toward the cap and is named: Venmo money is in the total AND broken out", () => {
  const rep = B.monthlyReport(watches, rows, "2026-09", { rules });
  const rest = rep.budgets.find(b => b.category === "restaurants");
  assert.equal(rest.p2p_cents, 13500, "the two Venmo payments, $85.00 + $50.00, count toward the Restaurants cap");
  same(rest.p2p_rails, [["Venmo", 13500]]);
  assert.match(rep.text, /\$135\.00 of it came through Venmo \$135\.00\./);
  // Without the person's rule, the same Venmo rows are NOT guessed into the category: they land in the
  // uncategorized total and the cap number drops by exactly their sum. Placement is the person's rule, not a guess.
  const noRule = B.monthlyReport(watches, rows, "2026-09", { rules: [] });
  const rest2 = noRule.budgets.find(b => b.category === "restaurants");
  assert.equal(rest2.spent_cents, 41250 - 13500); assert.equal(rest2.p2p_cents, 0);
  assert.equal(noRule.uncategorized_cents, 6320 + 13500);
  // A merchant billed through a rail still classifies by the merchant: PayPal *DoorDash is delivery spend.
  const rep2 = B.monthlyReport([{ id: "b3", kind: "category_budget", category: "delivery", amount_cents: 20000, period: "month", status: "active" }],
    [row("d1", "visa", "2026-09-11", -4200, "PAYPAL *DOORDASH")], "2026-09", {});
  assert.equal(rep2.budgets[0].spent_cents, 4200); assert.equal(rep2.budgets[0].p2p_cents, 4200);
  same(rep2.budgets[0].p2p_rails, [["PayPal", 4200]]);
});

test("the report ask parses apart from status and set, and answer serves last month or a named month", () => {
  assert.equal(B.parse("budget report").kind, "report");
  assert.equal(B.parse("budget report").month, null);
  assert.equal(B.parse("how did i do on my budgets last month").kind, "report");
  const named = B.parse("september budget report");
  assert.equal(named.kind, "report"); assert.equal(named.month, 9);
  assert.equal(B.parse("how are my budgets").kind, "status", "the this-month status ask is untouched");
  assert.equal(B.parse("set a grocery budget of 400").kind, "set", "a set is never a report");
  const now = Date.UTC(2026, 9, 3, 15, 0, 0); // Oct 3, 2026
  const a = B.answer("how did i do on my budgets last month", { budgets: watches, transactions: rows, now, tz: "UTC", rules });
  assert.match(a.text, /Your September budget report/);
  assert.ok(a.report); assert.equal(a.report.key, "2026-09");
  const b = B.answer("september budget report", { budgets: watches, transactions: rows, now, tz: "UTC", rules });
  assert.equal(b.report.key, "2026-09", "a named past month resolves to this year's");
  const none = B.answer("budget report", { budgets: [], transactions: rows, now, tz: "UTC", rules });
  assert.match(none.text, /You don't have any budgets set/);
});
