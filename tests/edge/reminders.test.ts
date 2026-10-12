// Reminders in chat (megadoc D11; packages/domain/103-reminders.js) through the real settings path and the hourly run:
// "remind me to pay rent on the 28th" is saved by settingsMessage beside the person's other watches, said by plan() on
// its day from 9 a.m. (with or without linked accounts, alerts on or off), once by its key, listed by "show my alerts",
// and never read as a transaction watch. The store's user list includes a person whose only setting is a reminder.
// Rows and accounts are MOCK, in the database's own shapes. Permission-free.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, parseCommand, settingsMessage, describe, capWatches, mapAccounts, mapTransactions, supabaseProactiveStore, MAX_WATCHES } from "../../supabase/functions/_shared/proactive.ts";
import { accountRows, txRows } from "./lib/proactive_fixture.ts";

const NOW = Date.parse("2026-10-12T15:00:00Z"); // Monday, Oct 12, 11 a.m. in New York
const DUE = Date.parse("2026-10-28T13:30:00Z"); // Wednesday, Oct 28, 9:30 a.m. in New York
const db = (settings: any) => {
  const saved: any[] = [];
  return { saved, read: async () => ({ ok: true, settings }), save: async (c: any) => { saved.push(c); settings = Object.assign({}, settings, c); return true; } };
};
const reminders = (p: any) => p.messages.filter((m: any) => m.key.startsWith("reminder:"));

Deno.test("'remind me to pay rent on the 28th' is saved beside a budget and restated with the day", async () => {
  const budget = { id: "b1", kind: "category_budget", category: "groceries", amount_cents: 40000, period: "month", created_on: "2026-10-01", status: "active" };
  const d = db({ time_zone: "America/New_York", watches: [budget] });
  const r = await settingsMessage("can you remind me to pay rent on the 28th", d as any, NOW);
  assertEquals(r?.changed, true);
  assert(r!.reply.startsWith("I'll remind you to pay rent on Wednesday, Oct 28, from 9 a.m. New York time. It's a reminder only: nothing is paid or moved."), r!.reply);
  const w = d.saved[0].watches;
  assertEquals(w.map((x: any) => x.kind), ["category_budget", "reminder"]);
  assertEquals(w[1].on, "2026-10-28");
  assert(!/\d{9,}/.test(JSON.stringify(w)), "the table refuses a run of 9+ digits in watches");
});

Deno.test("no day is asked, nothing saved; a route reminder and a trial are left to their own paths", async () => {
  const d = db({ watches: [] });
  const r = await settingsMessage("remind me to pay rent", d as any, NOW);
  assertEquals(r, { reply: "When should I remind you to pay rent? Say a day, like \"on the 28th\", \"on Friday\" or \"tomorrow\". Nothing was set.", changed: false });
  assertEquals(d.saved, []);
  assertEquals(parseCommand("remind me tomorrow to check the bonus terms for R2748", null, NOW), null);
  assertEquals(parseCommand("remind me to cancel hulu before my trial ends oct 20", null, NOW), null);
});

Deno.test("'remind me when Netflix charges me' is a watch, and the same watch twice is said, not saved twice", () => {
  const c: any = parseCommand("remind me when netflix charges me", { watches: [] }, NOW);
  assertEquals(c.settings.watches.map((w: any) => w.kind), ["merchant_charge"]);
  const again: any = parseCommand("tell me when netflix charges me", { watches: c.settings.watches }, NOW);
  assertEquals(again.settings, {});
  assertEquals(again.reply, "I'm already watching that: when netflix charges you. Nothing changed.");
});

Deno.test("plan() says it on its day from 9 a.m., once, as a watch outside the budget; never before 9", () => {
  const w = (parseCommand("remind me to pay rent on the 28th", { watches: [] }, NOW) as any).settings.watches;
  const input = (sent: any[] = [], settings: any = {}) => ({ accounts: mapAccounts(accountRows()), transactions: mapTransactions(txRows()), settings: { time_zone: "America/New_York", watches: w, ...settings }, sent });
  const p = plan(input(), DUE);
  const r = reminders(p);
  assertEquals(r.length, 1);
  assertEquals(r[0].text, "Reminder: pay rent. (You asked me to remind you; nothing was paid or moved.)");
  assertEquals([r[0].kind, r[0].cadence, r[0].source], ["watch", true, "the reminder you set in chat"]);
  assertEquals(reminders(plan(input([{ key: r[0].key, sent_at: DUE, cadence: true }]), DUE + 3600000)), [], "once only");
  assertEquals(reminders(plan(input(), Date.parse("2026-10-28T12:30:00Z"))), [], "8:30 a.m. is too early");
  assertEquals(reminders(plan(input([], { alerts: false }), DUE)).length, 1, "alerts off: still said, the person asked for it");
});

Deno.test("with nothing linked the reminder is still said; with a transaction watch beside it nothing breaks", () => {
  const w = (parseCommand("remind me about the dentist on oct 28", { watches: [] }, NOW) as any).settings.watches;
  const p = plan({ accounts: [], transactions: [], settings: { time_zone: "America/New_York", watches: w }, sent: [] }, DUE);
  assertEquals(reminders(p).map((m: any) => m.text), ["Reminder about: the dentist. (You asked me to remind you; nothing was paid or moved.)"]);
  const both = w.concat([{ id: "w1", kind: "merchant_charge", merchant: "netflix", created_on: "2026-10-12", status: "active" }]);
  const q = plan({ accounts: mapAccounts(accountRows()), transactions: mapTransactions(txRows()), settings: { time_zone: "America/New_York", watches: both, alerts: false }, sent: [] }, DUE);
  assertEquals(reminders(q).length, 1);
  assert(!q.messages.some((m: any) => m.key.startsWith("watch:") && /dentist/.test(m.text)), "a reminder is never read as a transaction watch");
});

Deno.test("'show my alerts' lists reminders; a new watch never pushes a reminder out", () => {
  let st: any = { time_zone: "America/New_York", watches: [] };
  for (const m of ["remind me to pay rent on the 28th every month", "remind me about the dentist on friday"]) st = Object.assign(st, (parseCommand(m, st, NOW) as any).settings);
  assert(describe(st, NOW).includes("Reminders: pay rent (the 28th of every month); the dentist (Friday, Oct 16)."), describe(st, NOW));
  const plain = Array.from({ length: MAX_WATCHES }, (_, i) => ({ id: `w${i}`, kind: "amount_over", threshold_cents: 1000 + i, status: "active" }));
  const kept = capWatches(st.watches.concat(plain));
  assertEquals(kept.length, MAX_WATCHES);
  assertEquals(kept.filter((x: any) => x.kind === "reminder").length, 2);
});

Deno.test("the hourly run reads a person whose only setting is a reminder", async () => {
  const table: Record<string, any[]> = {
    agent_financial_accounts: [{ user_id: "u-linked" }],
    standing_payments: [],
    agent_proactive_settings: [{ user_id: "u-remind", watches: [{ id: "r-1", kind: "reminder", text: "pay rent", monthly_day: 28 }] }, { user_id: "u-budget", watches: [{ id: "b1", kind: "category_budget" }] }],
  };
  const q = (name: string) => { const c: any = { select: () => c, eq: () => c, limit: async () => ({ data: table[name], error: null }) }; return c; };
  const users = await supabaseProactiveStore({ from: q } as any).users(200);
  assertEquals(users.sort(), ["u-linked", "u-remind"]);
});
