// A send that waits for the paycheck (megadoc A15; agent-chat/_shared/paycheck_send.ts and _shared/proactive.ts over
// packages/domain/115-paycheck-send.js): landed today or yesterday puts up the send flow's card now (its own yes); not yet
// saves a watch and says so; the hourly run asks once when the next paycheck posts; cancel through parseCommand; a failed
// read or save sets nothing up. Rows MOCK. Permission-free.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { paycheckSendMessage } from "../../supabase/functions/agent-chat/_shared/paycheck_send.ts";
import { plan, parseCommand, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";
import { accountRows, txRows, NOW } from "./lib/proactive_fixture.ts";

const TZ = "America/New_York", DAY = 86400000;
// NOW is Sun Oct 11, 10:00 a.m. New York; the fixture's last payroll posted Oct 2.
const pay = (on: string) => ({ posted_on: on, amount_cents: 180000, merchant_raw: "ACME CORP PAYROLL DIR DEP", is_pending: false });
function deps(rows: any[], o: { save?: boolean; flow?: any } = {}) {
  const calls = { flows: [] as string[], saved: [] as any[] };
  return { calls, d: { transactions: async () => rows, readWatches: async () => [], saveWatches: async (w: any[]) => { calls.saved.push(w); return o.save !== false; }, runFlow: async (t: string) => { calls.flows.push(t); return o.flow === undefined ? { reply: "Set up $40.00 to Maya K (@maya-k) in Venmo. Reply YES or NO.", route: { outcome: "confirm" } } : o.flow; } } };
}

Deno.test("landed (today or yesterday): said with the deposit, then the send flow's own card; nothing saved", async () => {
  const x = deps([pay("2026-10-10")]);
  const r = await paycheckSendMessage("pay maya 40 but only if my paycheck landed", x.d, NOW, TZ);
  assertEquals(r!.reply, "Your paycheck landed: $1,800.00, \"ACME CORP PAYROLL DIR DEP\", on Oct 10. Set up $40.00 to Maya K (@maya-k) in Venmo. Reply YES or NO.");
  assertEquals(x.calls.flows, ["pay maya 40"]); assertEquals(x.calls.saved.length, 0);
});

Deno.test("not yet: saved as a watch and said, with the last paycheck; a failed read or save sets nothing up", async () => {
  const x = deps([pay("2026-10-02")]);
  const r = await paycheckSendMessage("pay maya 40 but only if my paycheck landed", x.d, NOW, TZ);
  assertEquals(r!.reply, "No paycheck has posted yet (the last one: $1,800.00, \"ACME CORP PAYROLL DIR DEP\", on Oct 2). I'll ask you for the card to send Maya $40.00 when your next paycheck posts; I see it after your bank rows refresh. Nothing is sent before then, and the card still needs your yes. Say \"cancel the paycheck send to Maya\" to drop it.");
  assertEquals(x.calls.flows, []); assertEquals(x.calls.saved[0][0].kind, "paycheck_send"); assertEquals(x.calls.saved[0][0].command, "pay maya 40");
  assert(!/\d{9,}/.test(JSON.stringify(x.calls.saved[0])));
  const bad = deps([], { save: false }); assertEquals((await paycheckSendMessage("pay maya 40 when my paycheck lands", bad.d, NOW, TZ))!.reply, "I couldn't save that right now, so nothing was set up or sent. Try again in a moment.");
  const down = { transactions: async () => { throw new Error("down"); }, readWatches: async () => [], saveWatches: async () => true, runFlow: async () => null };
  assert(/^I can't read your bank rows right now/.test((await paycheckSendMessage("pay maya 40 when my paycheck lands", down, NOW, TZ))!.reply));
  assertEquals(await paycheckSendMessage("pay maya 40 tomorrow at 9", x.d, NOW, TZ), null, "a time is the scheduled send's");
  assertEquals(await paycheckSendMessage("send maya 40 if it rains", x.d, NOW, TZ), null, "another condition is the send flow's not-built answer");
});

Deno.test("plan(): when the next paycheck posts, the question as an offer, once; cancel through parseCommand", async () => {
  const x = deps([pay("2026-10-02")]); await paycheckSendMessage("pay maya 40 but only if my paycheck landed", x.d, NOW, TZ);
  const w = x.calls.saved[0];
  const st = { time_zone: TZ, watches: w };
  const none = plan({ accounts: mapAccounts(accountRows()), transactions: mapTransactions(txRows()), settings: st, sent: [] }, NOW + 3600000);
  assertEquals(none.messages.filter((m) => m.key.startsWith("paysend:")).length, 0, "no new paycheck yet");
  const extra = [{ account_id: "chk-1", provider_transaction_id: "pay-new", currency: "USD", amount_cents: 180000, posted_on: "2026-10-16", merchant_raw: "ACME CORP PAYROLL DIR DEP", is_pending: false, is_transfer: false, presence: "observed" }];
  const p = plan({ accounts: mapAccounts(accountRows()), transactions: mapTransactions(txRows(extra)), settings: st, sent: [] }, NOW + 5 * DAY);
  const m = p.messages.find((x) => x.key.startsWith("paysend:"))!;
  assertEquals(m.text, "Your paycheck posted: $1,800.00, \"ACME CORP PAYROLL DIR DEP\", on Oct 16. You asked me to send Maya $40.00 after it lands. Want the card? Reply yes and I'll put it up (it needs its own yes), or no to skip it.");
  assertEquals((m.offer as any).kind, "scheduled_send"); assertEquals((m.offer as any).command, "pay maya 40");
  assertEquals(plan({ accounts: mapAccounts(accountRows()), transactions: mapTransactions(txRows(extra)), settings: st, sent: [{ key: m.key, sent_at: NOW, cadence: true }] }, NOW + 5 * DAY).messages.filter((x) => x.key.startsWith("paysend:")).length, 0, "once");
  const c = parseCommand("cancel the paycheck send to maya", st, NOW)!;
  assertEquals(c.reply, "Cancelled: send Maya $40.00, waiting on your paycheck. Nothing was sent. Nothing else changed."); assertEquals((c.settings as any).watches, []);
});
