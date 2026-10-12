// Savings goals, the chat side (megadoc M08; _shared/goal_answer.ts and _shared/proactive.ts over
// packages/domain/114-savings-goals.js): set and tie through parseCommand (restated; nothing moved), the progress through
// goalReply from the goal's own account with its as-of, a failed account read said, and no goal at all left to the
// not-yet answer. Rows MOCK. Permission-free.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { parseCommand } from "../../supabase/functions/_shared/proactive.ts";
import { goalReply, GOALS_UNAVAILABLE } from "../../supabase/functions/agent-chat/_shared/goal_answer.ts";
import { notYetReply } from "../../supabase/functions/agent-chat/_shared/direct_answers.ts";

const NOW = Date.parse("2026-10-12T15:00:00Z"), TZ = "America/New_York";
const ACCTS = [{ account_id: "sav", name: "High Yield Savings", institution: "Ally", balance_cents: 125000, balance_as_of: "2026-10-12T09:30:00Z" }, { account_id: "chk", name: "Everyday Checking", institution: "Ally", balance_cents: 50000, balance_as_of: "2026-10-12T09:30:00Z" }];

Deno.test("set and tie in chat: restated, saved as a watch, nothing moved", () => {
  const s = parseCommand("set a $3000 vacation goal by june in high yield savings", { time_zone: TZ, watches: [] }, NOW)!;
  assertEquals(s.reply, "Goal set: vacation, $3,000.00 by Jun 30, 2027. I'll track it against the balance of \"High Yield Savings\". It's tracking only: nothing is moved, set aside or scheduled.");
  const w = (s.settings as any).watches;
  assertEquals([w[0].kind, w[0].name, w[0].target_cents, w[0].by, w[0].account], ["savings_goal", "vacation", 300000, "2027-06-30", "high yield savings"]);
  assert(!/\d{9,}/.test(JSON.stringify(w)));
  const h = parseCommand("set a goal to save 5k for a house", { time_zone: TZ, watches: w }, NOW)!;
  assert(h.reply.includes("Which account holds it? Say \"my house fund is in\""), h.reply);
  const tie = parseCommand("my house fund is in everyday checking", { time_zone: TZ, watches: (h.settings as any).watches }, NOW)!;
  assertEquals(tie.reply, "Your house goal now tracks the balance of \"Everyday Checking\". Nothing was moved.");
});

Deno.test("progress: the goal's account balance against the target, the monthly amount to the date, the as-of; tracking only", async () => {
  const w = (parseCommand("set a $3000 vacation goal by june in high yield savings", { time_zone: TZ, watches: [] }, NOW)!.settings as any).watches;
  const r = await goalReply("how's my vacation fund", w, async () => ACCTS, { tz: TZ, now: NOW });
  assertEquals(r, "Vacation: $1,250.00 of $3,000.00 (41.6%) in High Yield Savings at Ally, as of 2026-10-12. $1,750.00 to go: $218.75 a month for 8 months to reach it by Jun 30, 2027.\nThe balance is the whole account, so money in it for other things counts too. Tracking only: nothing is moved.");
  assertEquals(await goalReply("how's my vacation fund", w, async () => { throw new Error("down"); }, { tz: TZ, now: NOW }), GOALS_UNAVAILABLE);
  assertEquals(await goalReply("how's my vacation fund", [], async () => ACCTS, { tz: TZ, now: NOW }), null, "no goal: the not-yet answer says how to set one");
  assert(/^You don't have a savings goal set/.test(notYetReply("how's my vacation fund")!));
  assertEquals(await goalReply("what's my balance", w, async () => ACCTS, { tz: TZ, now: NOW }), null);
});
