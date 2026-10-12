// Late-fee alert, the settings and proactive side (megadoc D15; _shared/proactive.ts over
// packages/domain/112-late-fee-watch.js): set and stop through parseCommand (restated in exact terms), and plan() saying
// each late fee once by its log key, outside the daily budget, with the account's name, from rows in the database's own
// shapes. Rows are MOCK. Permission-free.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, parseCommand, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";
import { accountRows, txRows, NOW } from "./lib/proactive_fixture.ts";

const DAY = 86400000;
const input = (settings: any, sent: any[] = [], extra: any[] = []) => ({ accounts: mapAccounts(accountRows()), transactions: mapTransactions(txRows(extra)), settings, sent });
const fee = (on: string, cents: number, words: string, more: any = {}) => Object.assign({ account_id: "chk-1", provider_transaction_id: `fee-${on}-${cents}`, currency: "USD", amount_cents: cents, posted_on: on, merchant_raw: words, is_pending: false, is_transfer: false, presence: "observed" }, more);
const feeMsgs = (p: { messages: any[] }) => p.messages.filter((m) => m.key.startsWith("latefee:"));

Deno.test("set, show and stop in chat: restated in exact terms; set twice changes nothing; stop removes only the alert", () => {
  const set = parseCommand("set a late fee alert for bills", { time_zone: "America/New_York", watches: [{ id: "b1", kind: "category_budget", category: "groceries", amount_cents: 40000 }] }, NOW)!;
  assert(set.reply.startsWith("Late-fee alert on, from today (Oct 11). When a charge your bank calls a late fee posts on any linked account, I'll tell you once"), set.reply);
  assert(set.reply.includes("nothing is paid, disputed or asked of the bank"), set.reply);
  const w = (set.settings as any).watches;
  assertEquals(w.length, 2); assertEquals([w[1].kind, w[1].created_on, w[1].status], ["late_fee", "2026-10-11", "active"]);
  assert(!/\d{9,}/.test(JSON.stringify(w)), "the table refuses a run of 9 digits");
  assertEquals(parseCommand("tell me if i get charged a late fee", { watches: w }, NOW)!.reply, "Your late-fee alert is already on, since Oct 11. Nothing changed.");
  const stop = parseCommand("stop the late fee alert", { watches: w }, NOW)!;
  assertEquals(stop.reply, "Late-fee alert off. I won't tell you about late fees anymore. Nothing else changed.");
  assertEquals((stop.settings as any).watches.map((x: any) => x.kind), ["category_budget"]);
  assertEquals(parseCommand("stop the late fee alert", { watches: [] }, NOW)!.reply, "You don't have a late-fee alert on, so nothing changed.");
  assertEquals(parseCommand("how much did i pay in late fees", { watches: w }, NOW), null, "a question is not a command");
});

Deno.test("plan(): each late fee posted since the alert was set, once, with the amount, the bank's words, the account and date; old, pending, refunded or look-alike rows never", () => {
  const w = [{ id: "latefee-20261005", kind: "late_fee", created_on: "2026-10-05", status: "active" }];
  const extra = [fee("2026-10-09", -3900, "LATE FEE"), fee("2026-10-01", -2900, "LATE PAYMENT FEE"), fee("2026-10-10", -500, "LATE FEE", { is_pending: true }), fee("2026-10-10", 3900, "LATE FEE REVERSAL"), fee("2026-10-10", -4200, "LATE NIGHT TACOS")];
  const p = plan(input({ time_zone: "America/New_York", watches: w }, [], extra), NOW);
  const m = feeMsgs(p);
  assertEquals(m.length, 1);
  assertEquals(m[0].text, "A late fee posted: $39.00, \"LATE FEE\" on Everyday Checking, Oct 9. Your bank or card issuer is who can waive it; Upmore hasn't contacted anyone. (First Bank via SimpleFIN, as of Oct 11, 9:30 AM)");
  assertEquals(m[0].kind, "watch");
  assertEquals(feeMsgs(plan(input({ time_zone: "America/New_York", watches: w }, [{ key: m[0].key, sent_at: NOW - DAY }], extra), NOW)).length, 0, "said once");
  assertEquals(feeMsgs(plan(input({ time_zone: "America/New_York", watches: w, alerts: false }, [], extra), NOW)).length, 1, "the person asked for it, so it comes with alerts off");
  assertEquals(feeMsgs(plan(input({ time_zone: "America/New_York", watches: [] }, [], extra), NOW)).length, 0, "nothing without the alert");
});
