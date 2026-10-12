// The monthly budget report at the surfaces (real-world C16): the chat ask "how did I do on my budgets last
// month" is served by Budgets.answer kind "report" through budgetReply, and plan() pushes the report for the
// month that just ended once (log key budget_report:<month>), as a cadence message that never re-fires.
// Numbers and counting are proven in tests/budget-report.test.cjs.
import { budgetReply, isBudgetAsk } from "../../supabase/functions/agent-chat/_shared/budget_answer.ts";
import { plan, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";
import { assert, assertEquals } from "jsr:@std/assert@1";

const WATCHES = [
  { id: "b1", kind: "category_budget", category: "restaurants", amount_cents: 40000, period: "month", status: "active" },
  { id: "b2", kind: "category_budget", category: "groceries", amount_cents: 50000, period: "month", status: "active" },
];
const RULES = [{ term: "venmo", group: "restaurants" }];
const row = (id: string, acct: string, on: string, cents: number, m: string) => ({ id, account_id: acct, posted_on: on, amount_cents: cents, merchant_raw: m, currency: "USD", is_pending: false, is_transfer: false });
const ROWS = [
  row("r1", "visa", "2026-09-06", -12000, "CHIPOTLE MEXICAN GRILL"),
  row("r4", "chk", "2026-09-15", -8500, "VENMO *DINNER CLUB"),
  row("r5", "chk", "2026-09-22", -5000, "VENMO PAYMENT"),
  row("r3", "visa", "2026-09-20", -6100, "STARBUCKS"),
  row("r2", "amex", "2026-09-12", -9650, "SWEETGREEN"),
  row("g1", "visa", "2026-09-08", -21010, "TRADER JOES #552"),
  row("g2", "amex", "2026-09-19", -22000, "KROGER #441"),
];
const NOW = Date.UTC(2026, 9, 3, 15, 0, 0); // Oct 3, 2026

Deno.test("chat: the report ask is a budget ask and the reply is September's caps vs actuals", async () => {
  assert(isBudgetAsk("how did i do on my budgets last month"));
  assert(isBudgetAsk("budget report"));
  const reply = await budgetReply("how did i do on my budgets last month", NOW, { budgets: async () => WATCHES, transactions: async () => ROWS }, { tz: "UTC", rules: RULES });
  assert(reply, "a report reply");
  assert(/Your September budget report/.test(reply!), reply!);
  assert(/Restaurants: \$412\.50 spent of a \$400\.00 cap — \$12\.50 over \(103% of the cap\)/.test(reply!), reply!);
  assert(/\$135\.00 of it came through Venmo \$135\.00/.test(reply!), reply!);
});

Deno.test("plan() pushes last month's report once, as a cadence message", () => {
  const bankRows = [
    { account_id: "visa", name: "Visa", institution: "First Bank", currency: "USD", account_kind: "credit", balance_cents: 0, available_cents: 0, balance_as_of: "2026-10-02T13:30:00Z", fetched_at: "2026-10-02T13:30:00Z", sync_error: false, status: "active" },
    { account_id: "chk", name: "checking", institution: "First Bank", currency: "USD", account_kind: "checking", balance_cents: 300000, available_cents: 300000, balance_as_of: "2026-10-02T13:30:00Z", fetched_at: "2026-10-02T13:30:00Z", sync_error: false, status: "active" },
    { account_id: "amex", name: "Amex", institution: "First Bank", currency: "USD", account_kind: "credit", balance_cents: 0, available_cents: 0, balance_as_of: "2026-10-02T13:30:00Z", fetched_at: "2026-10-02T13:30:00Z", sync_error: false, status: "active" },
  ];
  const tx = (r: any) => ({ account_id: r.account_id, provider_transaction_id: r.id, currency: "USD", amount_cents: r.amount_cents, posted_on: r.posted_on, merchant_raw: r.merchant_raw, is_pending: false, is_transfer: false, presence: "observed" });
  const settings = { watches: WATCHES, category_rules: RULES, time_zone: "UTC" };
  const input = { accounts: mapAccounts(bankRows), transactions: mapTransactions(ROWS.map(tx)), settings, sent: [] };
  const p = plan(input as any, Date.UTC(2026, 9, 2, 14, 0, 0));
  const hit = p.messages.find((m: any) => m.key === "budget_report:2026-09");
  assert(hit, JSON.stringify(p.messages.map((m: any) => m.key)));
  assertEquals(hit!.cadence, true, "a monthly cadence message: it never uses the day's finding budget");
  assert(/Your September budget report/.test(hit!.text), hit!.text);
  assert(/Restaurants: \$412\.50 spent of a \$400\.00 cap/.test(hit!.text), hit!.text);
  const p2 = plan({ ...input, sent: [{ key: "budget_report:2026-09", sent_at: Date.UTC(2026, 9, 2, 14, 0, 0), cadence: true }] } as any, Date.UTC(2026, 9, 3, 14, 0, 0));
  assert(!p2.messages.some((m: any) => m.key === "budget_report:2026-09"), "never pushed twice");
});
