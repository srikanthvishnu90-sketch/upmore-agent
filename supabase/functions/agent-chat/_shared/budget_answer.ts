// Category budgets in chat (overnight H1; teardown 2 build-order step 4; packages/domain/93-budgets.js through the router
// bundle): "how am i doing on my grocery budget", "how are my budgets", "am i over budget", "what's left in my dining
// budget". Spent this month so far, left, the day of the month and the pace, the top 3 places, uncategorized spending
// said apart, every number from the person's own rows with its source and as-of. Numbers only, no advice; tracking only.
// Setting and stopping a budget ("set a $400 grocery budget", "stop my grocery budget") is a settings command
// (_shared/proactive.ts parseCommand, saved in agent_proactive_settings.watches); this answer returns null for those.
// Pure apart from the injected readers, so tests/edge/budgets-answer.test.ts drives it with fixtures.
import { Budgets } from "../../_shared/router_core.js";

export type BudgetReaders = { budgets(): Promise<any[]>; transactions(): Promise<any[]> };
export const BUDGETS_UNAVAILABLE = "I can't read your budgets right now, so I won't guess at a number. Try again in a minute.";

// A status ask about the person's budgets, or not (set and stop are settings commands, anything else goes on).
export function isBudgetAsk(message: string): boolean {
  const p: any = (Budgets as any).parse(message);
  return !!p && p.kind === "status";
}

export async function budgetReply(message: string, now: Date | number | string, read: BudgetReaders, opts?: { tz?: string }): Promise<string | null> {
  const p: any = (Budgets as any).parse(message);
  if (!p || p.kind !== "status") return null;
  let budgets: any[];
  try { budgets = (await read.budgets()) || []; } catch { return BUDGETS_UNAVAILABLE; }
  // No budget to count against: the transactions are never read.
  const tx = (Budgets as any).budgetsIn(budgets).length ? (await read.transactions()) || [] : [];
  return (Budgets as any).answer(p, { budgets, transactions: tx, now, tz: opts?.tz || "UTC" })?.text ?? null;
}

// The person's budgets, through their own session (RLS): the watches column of their settings row. A failed read throws,
// so the reply says it can't read them instead of saying there are none.
export async function readBudgets(supabase: any, userId: string): Promise<any[]> {
  const r = await supabase.from("agent_proactive_settings").select("watches").eq("user_id", userId).maybeSingle();
  if (r.error) throw new Error("Budgets unavailable.");
  return (r.data && Array.isArray(r.data.watches) ? r.data.watches : []);
}
