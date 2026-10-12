// Scheduled send (megadoc A08 "pay maya 40 tomorrow at 9"; _shared/proactive.ts over packages/domain/113-scheduled-send.js):
// set, show and cancel through parseCommand (restated with the day and time in the person's zone); at the time, plan()
// asks whether to put up the card, as an offer; offerMessage's yes runs the send flow on the person's own words (its card
// needs its own yes), no skips it, a day late offers nothing; one offer per run, so a trial question waits. Rows MOCK.
// Permission-free.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, parseCommand, offerMessage, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";
import { accountRows, txRows, NOW } from "./lib/proactive_fixture.ts";

const H = 3600000, DAY = 86400000;
const input = (settings: any, sent: any[] = [], subs: any[] = []) => ({ accounts: mapAccounts(accountRows()), transactions: mapTransactions(txRows()), settings, sent, subscriptions: subs });
// NOW is Sun Oct 11, 10:00 a.m. in New York.
const set = (msg: string, watches: any[] = []) => parseCommand(msg, { time_zone: "America/New_York", watches }, NOW)!;

Deno.test("set in chat: restated with the day and time in the person's zone; saved as a watch; show and cancel", () => {
  const s = set("pay maya 40 tomorrow at 9");
  assertEquals(s.reply, "Scheduled: tomorrow, Monday, Oct 12, at 9:00 AM your time (I took that as morning; say the time with am or pm to change it), I'll ask you to send Maya $40.00. Nothing is sent before then, and nothing is sent without its own card and your yes at that time. The check runs hourly, so the question can come up to an hour after 9:00 AM. Say \"cancel the scheduled send to Maya\" to drop it.");
  const w = (s.settings as any).watches;
  assertEquals([w[0].kind, w[0].command, w[0].amount_cents, w[0].at_date, w[0].at_hour], ["scheduled_send", "pay maya 40", 4000, "2026-10-12", 9]);
  assert(!/\d{9,}/.test(JSON.stringify(w)), "the table refuses a run of 9 digits");
  assertEquals(parseCommand("show my scheduled sends", { time_zone: "America/New_York", watches: w }, NOW)!.reply, "Scheduled: send Maya $40.00 on Monday, Oct 12 at 9:00 AM. Each one asks you for the card at that time; nothing is sent without your yes.");
  const c = parseCommand("cancel the scheduled send to maya", { time_zone: "America/New_York", watches: w }, NOW)!;
  assertEquals(c.reply, "Cancelled: send Maya $40.00 on Monday, Oct 12 at 9:00 AM. Nothing was sent. Nothing else changed.");
  assertEquals((c.settings as any).watches, []);
  assertEquals(parseCommand("pay my rent tomorrow", { time_zone: "America/New_York", watches: [] }, NOW), null, "rent keeps its own path");
  assertEquals(parseCommand("pay maya 40 every friday", { time_zone: "America/New_York", watches: [] }, NOW), null, "repeating stays the send flow's answer");
});

Deno.test("plan(): at the time, the question as an offer, once; not before; through quiet hours; one offer per run", () => {
  const w = (set("pay maya 40 tomorrow at 9").settings as any).watches;
  const st = { time_zone: "America/New_York", watches: w, quiet_start: 22, quiet_end: 10 };
  const before = plan(input(st), NOW + 22 * H); // Oct 12, 8:00 a.m. New York
  assertEquals(before.messages.filter((m) => m.key.startsWith("ssend:")).length, 0);
  const at = plan(input(st), NOW + 23 * H + 7 * 60000); // Oct 12, 9:07 a.m. (the :07 run), inside quiet hours
  const m = at.messages.find((x) => x.key.startsWith("ssend:"))!;
  assertEquals(m.text, "It's time for the payment you scheduled: send Maya $40.00. Want the card? Reply yes and I'll put it up (it needs its own yes), or no to skip it.");
  assertEquals((m.offer as any).kind, "scheduled_send"); assertEquals((m.offer as any).command, "pay maya 40");
  assertEquals(plan(input(st, [{ key: m.key, sent_at: NOW + 23 * H }]), NOW + 24 * H).messages.filter((x) => x.key.startsWith("ssend:")).length, 0, "asked once");
  // A trial question in the same run waits: one yes must answer one question.
  const TRIAL = { id: "sub-9", merchant: "Paramount+", amount: 11.99, billing_interval: "trial", next_billing_date: "2026-10-13", status: "active", cancel_url: null, cancel_steps: null };
  const both = plan(input({ time_zone: "America/New_York", watches: w }, [], [TRIAL]), NOW + 23 * H + 7 * 60000);
  assertEquals(both.messages.filter((x) => x.offer).length, 1);
  assert(both.suppressed.some((x) => x.reason === "one_offer_at_a_time"), JSON.stringify(both.suppressed));
});

Deno.test("the answer: yes runs the send flow on the person's words; no skips; a day late offers nothing", async () => {
  const offer = { kind: "scheduled_send", id: "ss-x", command: "pay maya 40", name: "maya", amount_cents: 4000, at_ms: NOW, thread_id: "th-updates" };
  const deps = (flow: any = { reply: "Set up $40.00 to Maya K (@maya-k) in Venmo. Reply YES or NO.", route: { outcome: "confirm" } }) => { const calls = { flows: [] as string[], cleared: 0 }; return { calls, deps: { offer, threadId: "th-updates", liveCard: async () => false, runFlow: async (t: string) => { calls.flows.push(t); return flow; }, clear: async () => { calls.cleared++; return true; }, watch: async () => true } }; };
  const y = deps(); const r = await offerMessage("yes", y.deps as any, NOW + H);
  assertEquals(r!.reply, "Set up $40.00 to Maya K (@maya-k) in Venmo. Reply YES or NO."); assertEquals(y.calls.flows, ["pay maya 40"]); assertEquals(y.calls.cleared, 1);
  const n = deps(); assertEquals((await offerMessage("no", n.deps as any, NOW + H))!.reply, "Okay, skipped: nothing was sent to Maya."); assertEquals(n.calls.flows, []);
  const late = deps(); assertEquals((await offerMessage("yes", late.deps as any, NOW + DAY + H))!.reply, "That question has expired, so nothing was sent. Say \"pay maya 40\" if you still want to send Maya $40.00."); assertEquals(late.calls.flows, []);
});
