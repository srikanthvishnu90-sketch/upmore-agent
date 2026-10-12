// Category rules in chat (capability list item 8, megadoc L07; packages/domain/95-category-rules.js through the router
// bundle): "recategorize Target as groceries" saved through settingsMessage (read, saved through the person's session,
// restated), then counted by the spending answer, the budget answer and the hourly budget alerts; the handler reads the
// rules from the same settings row as the time zone and hands them to both answers. What the chat writes must pass the
// table's own checks (the migration is read as a text import). Rows are MOCK. Permission-free.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { plan, parseCommand, settingsMessage, describe, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";
import { moneyReply, type AccountRow, type MoneyTxRow } from "../../supabase/functions/agent-chat/_shared/money_answers.ts";
import { budgetReply } from "../../supabase/functions/agent-chat/_shared/budget_answer.ts";
import { accountRows, txRows, NOW as PNOW } from "./lib/proactive_fixture.ts";
import SRC_MIGRATION from "../../supabase/migrations/20261012040000_category_rules.sql" with { type: "text" };
import SRC_HANDLER from "../../supabase/functions/agent-chat/handler.ts" with { type: "text" };

const TZ = "America/New_York";
const NOW = new Date("2026-10-12T15:05:00Z");
const SYNC = "2026-10-12T12:00:00Z";
const ACCOUNTS: AccountRow[] = [{ account_id: "mock-chk", name: "Everyday Checking", institution: "Mock Bank", account_kind: "checking", balance_cents: 100000, available_cents: null, balance_as_of: SYNC, fetched_at: SYNC, status: "active", currency: "USD" }];
let n = 0;
const tx = (posted_on: string, amount_cents: number, merchant_raw: string): MoneyTxRow =>
  ({ account_id: "mock-chk", provider_transaction_id: `mock-${++n}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, currency: "USD", fetched_at: SYNC });
const TX: MoneyTxRow[] = [tx("2026-09-03", -5000, "KROGER #123"), tx("2026-10-02", -8000, "KROGER #123"), tx("2026-10-04", -12000, "TARGET 00012345 MINNEAPOLIS MN"), tx("2026-10-09", -4000, "COSTCO GAS #1080")];
const read = { accounts: async () => ACCOUNTS, transactions: async () => TX };
const db = (o: { settings?: any; saveOk?: boolean; readOk?: boolean }, saves: any[]) => ({ async read() { return { ok: o.readOk !== false, settings: o.settings || null }; }, async save(c: any) { saves.push(c); return o.saveOk !== false; } });

Deno.test("set, list and stop in chat: saved in category_rules through the person's session, restated; a failed save changes nothing", async () => {
  const saves: any[] = [];
  const set = await settingsMessage("recategorize Target as groceries", db({ settings: { time_zone: TZ, watches: [] } }, saves), NOW.getTime());
  assertEquals(set!.changed, true);
  assertEquals(set!.reply.split("\n")[0], 'Done: charges that say "Target" now count as groceries instead of shopping, in your spending answers and budgets, past charges included.');
  const rules = saves.pop().category_rules;
  assertEquals(rules.map((r: any) => [r.term, r.group]), [["target", "groceries"]]);
  assertEquals(Object.keys(saves), [], "only the rules column is written");
  const list = await settingsMessage("show my category rules", db({ settings: { category_rules: rules } }, saves), NOW.getTime());
  assertEquals(list, { reply: 'Your category rules: "Target" counts as groceries. They change how I count, nothing at your bank.', changed: false });
  assert(describe({ category_rules: rules } as any).includes('Category rules: "Target" as groceries.'), "what are my alerts lists them");
  const stop = await settingsMessage("stop counting target as groceries", db({ settings: { category_rules: rules } }, saves), NOW.getTime());
  assertEquals(stop!.changed, true);
  assertEquals(saves.pop(), { category_rules: [] });
  assertEquals(await settingsMessage("count Target as groceries", db({ saveOk: false }, saves), NOW.getTime()), { reply: "I couldn't save that right now, so nothing changed. Try again in a moment.", changed: false });
  saves.length = 0;
  assertEquals(await settingsMessage("count Target as groceries", db({ readOk: false }, saves), NOW.getTime()), { reply: "I can't reach your alert settings right now, so nothing changed. Try again in a moment.", changed: false });
  assertEquals(saves.length, 0);
  assertEquals(await settingsMessage("move 500 to savings", db({}, saves), NOW.getTime()), null, "a money move is never a settings command");
});

Deno.test("what the chat stores passes the table's own checks: groups on the list, no 9-digit run, at most 40", () => {
  const c = parseCommand("count joe's corner store as groceries", { category_rules: [] } as any, NOW.getTime())!;
  const rules: any[] = c.settings.category_rules || [];
  assertEquals(rules.length, 1);
  assert(!/\d{9,}/.test(JSON.stringify(rules)), JSON.stringify(rules));
  for (const g of ["delivery", "groceries", "restaurants", "gas", "subscriptions", "transport", "shopping"]) assert(SRC_MIGRATION.includes(`@.group == "${g}"`), g);
  assertMatch(SRC_MIGRATION, /jsonb_array_length\(category_rules\) <= 40/);
});

Deno.test("the spending answer and the budget answer count the person's rule, and say so", async () => {
  const rules = [{ id: "cr-x", term: "target", group: "groceries", created_at: "2026-10-01T12:00:00.000Z", text: "x" }];
  const spend = (await moneyReply("how much did i spend on groceries this month", NOW, read, { tz: TZ, rules }))!;
  assertMatch(spend, /^You spent \$200\.00 on groceries this month so far \(Oct 1-12\)\./);
  assert(spend.includes('By your category rule: "Target" as groceries $120.00.'), spend);
  assert(spend.includes("From your linked accounts"), "the source line stays");
  const plain = (await moneyReply("how much did i spend on groceries this month", NOW, read, { tz: TZ }))!;
  assertMatch(plain, /^You spent \$80\.00 on groceries/);
  const budget = { id: "budget-groceries-x", kind: "category_budget", category: "groceries", amount_cents: 40000, period: "month", created_at: "2026-10-01T12:00:00.000Z", created_on: "2026-10-01", status: "active" };
  const b = (await budgetReply("how am i doing on my grocery budget", NOW, { budgets: async () => [budget], transactions: async () => TX }, { tz: TZ, rules }))!;
  assertMatch(b, /^Groceries budget for October: \$200\.00 spent of \$400\.00, \$200\.00 left\./);
  assert(b.includes('By your category rule: "Target" as groceries $120.00.'), b);
});

Deno.test("the hourly budget alerts count the rules saved in the person's settings", () => {
  // Whole Foods $64.00 on Oct 4 against a $100.00 groceries budget is 64%: no alert. A $90.00 Target charge the person
  // counts as groceries makes $154.00: the 100% message.
  const budget = { id: "budget-groceries-x", kind: "category_budget", category: "groceries", amount_cents: 10000, period: "month", created_at: "2026-10-01T12:00:00.000Z", created_on: "2026-10-01", status: "active" };
  const extra = [{ account_id: "chk-1", provider_transaction_id: "t-target", currency: "USD", amount_cents: -9000, posted_on: "2026-10-10", merchant_raw: "TARGET 00012345", is_pending: false, is_transfer: false, presence: "observed" }];
  const input = (settings: any) => ({ accounts: mapAccounts(accountRows()), transactions: mapTransactions(txRows(extra)), settings, sent: [] });
  const keys = (settings: any) => plan(input(settings), PNOW).messages.filter((m: any) => m.key.startsWith("budget:")).map((m: any) => m.key);
  const base = { time_zone: TZ, watches: [budget], alerts: true };
  assertEquals(keys(base), []);
  assertEquals(keys({ ...base, category_rules: [{ term: "target", group: "groceries" }] }), ["budget:budget-groceries-x:2026-10:100"]);
});

Deno.test("the handler reads the rules from the settings row once per turn and hands them to both answers", () => {
  assert(SRC_HANDLER.includes('supabase.from("agent_proactive_settings").select("*").eq("user_id", user.id).maybeSingle()'), "one read of the person's row");
  assert(SRC_HANDLER.includes("const rules = !tzRead.error && tzRead.data && Array.isArray(tzRead.data.category_rules) ? tzRead.data.category_rules : [];"), "a failed read or no column is no rules");
  assert(SRC_HANDLER.includes("previous: readPrevious,\n      }, { tz, rules });"), "moneyReply gets them");
  assert(SRC_HANDLER.includes("transactions: readTx }, { tz, rules });"), "budgetReply gets them");
});
