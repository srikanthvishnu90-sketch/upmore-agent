// Savings goals in chat, the progress (megadoc M08 "how's my vacation fund"; teardown 2 build-order step 4, tracking-only
// goals; packages/domain/114-savings-goals.js through the router bundle): the goal's account balance against its target,
// what's left and, with a date, the amount a month, from the person's own linked accounts with the source and as-of.
// Asked before the not-built answers, and only for a person who has a goal: with none, the not-yet answer says how to set
// one. Setting, tying and stopping a goal are settings commands (_shared/proactive.ts parseCommand). Tracking only.
// Pure apart from the injected reader, so tests/edge/goal-answer.test.ts drives it with fixtures.
import { SavingsGoals } from "../../_shared/router_core.js";

export const GOALS_UNAVAILABLE = "I can't read your accounts right now, so I won't guess at your goal's progress. Try again in a minute.";

export async function goalReply(message: string, watches: any[], readAccounts: () => Promise<any[]>, opts?: { tz?: string; now?: number }): Promise<string | null> {
  const G: any = SavingsGoals;
  if (!G.isStatus(message) || !G.goalsIn(watches || []).length) return null;
  let accounts: any[];
  try { accounts = (await readAccounts()) || []; } catch { return GOALS_UNAVAILABLE; }
  return G.status(message, watches, accounts, opts?.now ?? Date.now(), opts?.tz || "UTC");
}
