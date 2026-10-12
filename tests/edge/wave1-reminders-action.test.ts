// Wave 1 C24: money reminders that remember context — a fired reminder attaches its action where one exists
// (with the capability it routes to), and it survives, re-surfacing at most once a day, until dismissed in chat.
// Through parseCommand / settingsMessage / plan() (supabase/functions/_shared/proactive.ts) and
// packages/domain/103-reminders.js. Rows and accounts are MOCK, in the database's own shapes. Permission-free.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, parseCommand, mapAccounts, mapTransactions } from "../../supabase/functions/_shared/proactive.ts";
import { accountRows, txRows } from "./lib/proactive_fixture.ts";

const SET_AT = Date.parse("2026-10-12T15:00:00Z"); // Monday, Oct 12, 11 a.m. in New York
const DAY1 = Date.parse("2026-10-28T13:30:00Z"); // Wednesday, Oct 28, 9:30 a.m. in New York
const DAY = 86400000;
const reminders = (p: any) => p.messages.filter((m: any) => m.key.startsWith("reminder:"));
const sentOf = (p: any, at: number) => p.messages.map((m: any) => ({ key: m.key, sent_at: at, cadence: m.cadence }));
const run = (watches: any[], now: number, sent: any[] = []) => plan({ accounts: mapAccounts(accountRows()), transactions: mapTransactions(txRows()), settings: { time_zone: "America/New_York", watches }, sent }, now);
const watchesOf = (words: string, now = SET_AT) => (parseCommand(words, { watches: [] }, now) as any).settings.watches;

Deno.test("C24 action: an annual-fee reminder fires with the retention-offer action line and its capability", () => {
  const w = watchesOf("remind me to check the amex annual fee on oct 28");
  const r = reminders(run(w, DAY1));
  assertEquals(r.length, 1, JSON.stringify(run(w, DAY1).messages.map((m: any) => m.key)));
  assert(r[0].text.includes("Reminder: check the amex annual fee."), r[0].text);
  assert(r[0].text.includes("Want me to get a retention offer first?"), r[0].text);
  assertEquals(r[0].capability_id, "CARD-008", "the action routes to the annual-fee audit (retention path)");
});
Deno.test("C24 action: a subscription reminder fires with the cancel path and its capability", () => {
  const w = watchesOf("remind me to cancel netflix on oct 28");
  const r = reminders(run(w, DAY1));
  assertEquals(r.length, 1);
  assert(r[0].text.includes("Want me to set up the cancellation for Netflix? You approve it before anything happens."), r[0].text);
  assertEquals(r[0].capability_id, "subscriptions.cancel");
});
Deno.test("C24 no invented action: a reminder with no action in its words carries none", () => {
  const w = watchesOf("remind me about the dentist on oct 28");
  const r = reminders(run(w, DAY1));
  assertEquals(r.length, 1);
  assertEquals(r[0].text, "Reminder about: the dentist. (You asked me to remind you; nothing was paid or moved.)");
  assertEquals(r[0].capability_id, "ALRT-010");
  assert(!/Want me to/.test(r[0].text), r[0].text);
});
Deno.test("C24 survival: a fired reminder is still present the next day when not dismissed, at most once that day, with its action and context", () => {
  const w = watchesOf("remind me to check the amex annual fee on oct 28");
  const day1 = run(w, DAY1);
  const day2 = run(w, DAY1 + DAY, sentOf(day1, DAY1));
  const r2 = reminders(day2);
  assertEquals(r2.length, 1, JSON.stringify(day2.messages.map((m: any) => m.key)));
  assertEquals(r2[0].key, `reminder:${w[0].id}:2026-10-28:again:2026-10-29`);
  assert(r2[0].text.includes("check the amex annual fee"), r2[0].text);
  assert(r2[0].text.includes("Want me to get a retention offer first?"), r2[0].text);
  const day2Later = run(w, DAY1 + DAY + 3600000, sentOf(day1, DAY1).concat(sentOf(day2, DAY1 + DAY)));
  assertEquals(reminders(day2Later).length, 0, "at most once a day");
});
Deno.test("C24 dismissal: 'dismiss the <name> reminder' in chat ends it — gone the day after, stored as dismissed in the watches", () => {
  const w = watchesOf("remind me to check the amex annual fee on oct 28");
  const day1 = run(w, DAY1);
  const day2 = run(w, DAY1 + DAY, sentOf(day1, DAY1));
  const dismissed: any = parseCommand("dismiss the amex annual fee reminder", { watches: w } as any, DAY1 + DAY);
  assert(dismissed, "the dismiss command is answered in chat");
  assert(/Dismissed the reminder/.test(dismissed.reply), dismissed.reply);
  const watches = dismissed.settings.watches;
  assertEquals(watches.length, 1, "dismissal is stored in the existing watches store, not deleted silently");
  assertEquals(watches[0].status, "dismissed");
  const day3 = run(watches, DAY1 + 2 * DAY, sentOf(day1, DAY1).concat(sentOf(day2, DAY1 + DAY)));
  assertEquals(reminders(day3).length, 0, "gone after dismissal");
  const day4 = run(watches, DAY1 + 3 * DAY, sentOf(day1, DAY1).concat(sentOf(day2, DAY1 + DAY)));
  assertEquals(reminders(day4).length, 0, "and it stays gone");
});
Deno.test("C24 dismissal of a reminder that does not exist changes nothing and says so", () => {
  const w = watchesOf("remind me to pay rent on the 28th");
  const d: any = parseCommand("dismiss the gym reminder", { watches: w } as any, SET_AT);
  assert(d && /don't have a reminder/.test(d.reply), d && d.reply);
  assertEquals(d.settings, {});
});
