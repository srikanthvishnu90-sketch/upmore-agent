// Category budgets in chat, the status answer (overnight H1; _shared/budget_answer.ts over packages/domain/93-budgets.js):
// rows in the database's own shapes (agent_financial_transactions, newest first as the handler reads them; the budgets as
// the settings path stores them in agent_proactive_settings.watches). Exact strings, exact cents. Rows are MOCK.
// Permission-free: the handler is read as a text import.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { budgetReply, readBudgets, isBudgetAsk, BUDGETS_UNAVAILABLE } from "../../supabase/functions/agent-chat/_shared/budget_answer.ts";
import { parseCommand } from "../../supabase/functions/_shared/proactive.ts";
import SRC_HANDLER from "../../supabase/functions/agent-chat/handler.ts" with { type: "text" };

const NOW = new Date("2026-10-12T15:05:00Z"), TZ = "America/New_York";
let n = 0;
const tx = (on: string | null, cents: number, merchant: string, more: any = {}) => Object.assign({ account_id: "mock-chk", provider_transaction_id: `mock-${++n}`, currency: "USD", amount_cents: cents, posted_on: on, merchant_raw: merchant, is_pending: false, is_transfer: false, fetched_at: "2026-10-12T12:00:00Z" }, more);
// Newest first, as readRecentTransactions returns them.
const ROWS = [
  tx(null, -4200, "SAFEWAY #9", { is_pending: true }),
  tx("2026-10-11", -2500, "WHOLE FOODS MKT"), tx("2026-10-10", 2500, "KROGER #123 REFUND"), tx("2026-10-09", -4000, "KROGER #123"),
  tx("2026-10-08", -3000, "LIDL BERLIN", { currency: "EUR" }), tx("2026-10-07", -1700, "COSTCO WHSE #1"), tx("2026-10-06", -21200, "ACME HARDWARE 99"),
  tx("2026-10-05", -5043, "TRADER JOE'S #55"), tx("2026-10-04", -31000, "CHIPOTLE 1234"), tx("2026-10-03", -50000, "TRANSFER TO SAVINGS", { is_transfer: true }),
  tx("2026-10-02", -8000, "KROGER #123"), tx("2026-09-28", -9900, "KROGER #123"),
];
// Set through the chat's own path, so the stored shape is the real one.
const settings = (msgs: string[]) => { let s: any = { time_zone: TZ, watches: [] }; msgs.forEach((m, i) => { const c = parseCommand(m, s, NOW.getTime() + i * 1000)!; s = Object.assign({}, s, c.settings); }); return s.watches; };
const STORED = settings(["set a $400 grocery budget", "budget $250 a month for eating out"]);
const reply = (m: string, budgets: any[] = STORED, rows: any[] = ROWS) => budgetReply(m, NOW, { budgets: async () => budgets, transactions: async () => rows }, { tz: TZ });

Deno.test("how am i doing on my grocery budget: spent, left, day and pace, top 3, refunds, pending, other currency, uncategorized, source", async () => {
  assertEquals(await reply("how am i doing on my grocery budget"), [
    "Groceries budget for October: $187.43 spent of $400.00, $212.57 left.",
    "Day 12 of 31: an even pace is $154.84 by now; you're $32.59 ahead of pace (spending faster).",
    "Top: Kroger $95.00, Trader Joe's $50.43, Whole Foods $25.00.",
    "Refunds taken off: $25.00.",
    "Pending, not added yet: $42.00 (1 charge).",
    "In another currency, not added: 30.00 EUR.",
    "$212.00 of your spending this month matched no category I know, so it isn't counted in any budget.",
    "From your linked accounts, transactions through Oct 11, 2026, as of Oct 12, 8:00 AM EDT. A budget only tracks: it never moves money or blocks a payment.",
  ].join("\n"));
});

Deno.test("how are my budgets / am i over budget: every budget, over named with the amount", async () => {
  const all = (await reply("how are my budgets"))!;
  assertEquals(all.split("\n").slice(0, 3), [
    "Your budgets for October, day 12 of 31:",
    "- Groceries: $187.43 of $400.00 spent, $212.57 left; $32.59 ahead of pace (top: Kroger $95.00, Trader Joe's $50.43, Whole Foods $25.00).",
    "- Restaurants: $310.00 of $250.00 spent, $60.00 over (top: Chipotle $310.00).",
  ]);
  assert(/\nPending, not added yet: groceries \$42\.00 \(1 charge\)\.\n/.test(all), all);
  assertEquals((await reply("am i over budget"))!.split("\n")[0], "Yes, over on restaurants ($60.00 over).");
  assertEquals((await reply("am i over my grocery budget"))!.split("\n")[0], "No, you're not over on your groceries budget.");
});

Deno.test("nothing set, a category not set, a category it doesn't track: said plainly, never a number from nothing", async () => {
  let reads = 0;
  const none = await budgetReply("how are my budgets", NOW, { budgets: async () => [], transactions: async () => { reads++; return ROWS; } }, { tz: TZ });
  assertEquals(none, "You don't have any budgets set. Say \"set a grocery budget of 400\" (any category and amount, by the month) and I'll track it. Categories I can budget: food delivery, groceries, restaurants (eating out, dining, coffee), food (groceries, restaurants and delivery together), gas, subscriptions, transport, shopping.");
  assertEquals(reads, 0, "with no budget the transactions are never read");
  assertEquals(await reply("how am i doing on my gas budget"), "You don't have a gas budget. Your budgets: groceries, restaurants. Say \"set a gas budget of 400\" with your number to add one.");
  assertEquals(await reply("how am i doing on my grocry budget"), "You don't have a \"grocry\" budget. Your budgets: groceries, restaurants.");
  assertEquals(await reply("how am i doing on my grocery budget", STORED, []), "Your groceries budget is $400.00 a month, but I don't see a linked bank or card with posted transactions yet, so there's nothing to count against it.");
});

Deno.test("a settings read that fails says so; set and stop are not this answer's (they are settings commands)", async () => {
  assertEquals(await budgetReply("how are my budgets", NOW, { budgets: async () => { throw new Error("down"); }, transactions: async () => ROWS }, { tz: TZ }), BUDGETS_UNAVAILABLE);
  for (const m of ["set a $400 grocery budget", "budget $250 a month for eating out", "my dining budget is 300", "stop my grocery budget", "delete my budgets", "how do i make a budget", "what's my balance"]) {
    assertEquals(await reply(m), null, m);
    assertEquals(isBudgetAsk(m), false, m);
  }
  for (const m of ["how am i doing on my grocery budget", "how are my budgets", "am i over budget", "what's left in my dining budget"]) assert(isBudgetAsk(m), m);
});

Deno.test("the budgets are read through the person's own session from their settings row; a failed read throws", async () => {
  const calls: string[] = [];
  const sb = (res: any) => ({ from(t: string) { calls.push(t); return { select(c: string) { calls.push(c); return { eq(k: string, v: string) { calls.push(`${k}=${v}`); return { maybeSingle: async () => res }; } }; } }; } });
  assertEquals(await readBudgets(sb({ data: { watches: STORED }, error: null }), "u1"), STORED);
  assertEquals(calls, ["agent_proactive_settings", "watches", "user_id=u1"]);
  assertEquals(await readBudgets(sb({ data: null, error: null }), "u1"), []);
  await assertRejects(() => readBudgets(sb({ data: null, error: { message: "rls" } }), "u1"));
});

Deno.test("handler wiring: the status answer runs first in the direct chain with the person's zone; set and stop reach the settings path", () => {
  const h = SRC_HANDLER;
  const at = h.indexOf("direct = await budgetReply(message, new Date(), { budgets: () => readBudgets(supabase, user.id), transactions: readTx }, { tz });");
  assert(at > 0, "budgetReply is wired with the RLS client, the shared transaction read and tz");
  assert(at < h.indexOf("direct = await whatsNewReply("), "before what's new");
  assert(h.indexOf("direct = await budgetReply(") < h.indexOf("const s = await settingsMessage(message"), "status asks are answered before the settings path, which takes set and stop");
});
