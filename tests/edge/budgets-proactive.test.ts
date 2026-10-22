// Category budgets, the settings and proactive side (overnight H1; _shared/proactive.ts over packages/domain/93-budgets.js):
// set and stop through settingsMessage (read, saved through the person's session, restated), the 80% and 100% messages
// through plan() from rows in the database's own shapes, once only by the log key, outside the daily budget, with alerts
// off too. And what the chat writes into agent_proactive_settings.watches must pass the table's own checks (the
// migration is read as a text import). Rows are MOCK. Permission-free.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, parseCommand, settingsMessage, describe, mapAccounts, mapTransactions, capWatches, MAX_WATCHES } from "../../supabase/functions/_shared/proactive.ts";
import { accountRows, txRows, NOW } from "./lib/proactive_fixture.ts";
const SRC_MIGRATION = Deno.readTextFileSync(new URL("../../supabase/migrations/20261011060000_proactive.sql", import.meta.url));

const H = 3600000;
const CITE = " (First Bank via SimpleFIN, as of Oct 11, 9:30 AM)";
// What the chat stores for "set a $70 grocery budget" (Oct 11, New York), via the real parser.
const stored = (msgs: string[], start: any[] = []) => { let s: any = { time_zone: "America/New_York", watches: start }; msgs.forEach((m, i) => { const c = parseCommand(m, s, NOW + i * 1000)!; s = Object.assign({}, s, c.settings); }); return s.watches; };
const input = (settings: any, sent: any[] = [], extra: any[] = []) => ({ accounts: mapAccounts(accountRows()), transactions: mapTransactions(txRows(extra)), settings, sent });
const budgetMsgs = (p: { messages: any[] }) => p.messages.filter((m) => m.key.startsWith("budget:"));

Deno.test("set and stop in chat: read, saved through the person's session, restated; a failed save changes nothing", async () => {
  let reads = 0; const saves: any[] = [];
  const db = (o: { settings?: any; saveOk?: boolean; readOk?: boolean } = {}) => ({ async read() { reads++; return { ok: o.readOk !== false, settings: o.settings || null }; }, async save(c: any) { saves.push(c); return o.saveOk !== false; } });
  const set = await settingsMessage("set a $400 grocery budget", db({ settings: { time_zone: "America/Los_Angeles", watches: [] } }), NOW);
  assertEquals(set!.changed, true);
  assertEquals(set!.reply.split("\n")[0], "Budget set: groceries, $400.00 a month.");
  assert(set!.reply.includes("each calendar month in America/Los Angeles time"), set!.reply);
  const w = saves.pop().watches;
  assertEquals(w.length, 1); assertEquals([w[0].kind, w[0].category, w[0].amount_cents, w[0].created_on], ["category_budget", "groceries", 40000, "2026-10-11"]);
  const stop = await settingsMessage("stop my grocery budget", db({ settings: { watches: w } }), NOW + H);
  assertEquals(stop, { reply: "Stopped your groceries budget ($400.00 a month). I won't track it or send its alerts. Nothing else changed.", changed: true });
  assertEquals(saves.pop(), { watches: [] });
  const none = await settingsMessage("stop my grocery budget", db({ settings: { watches: [] } }), NOW);
  assertEquals(none, { reply: "You don't have a groceries budget, so nothing changed.", changed: false });
  assertEquals(await settingsMessage("set a $400 grocery budget", db({ saveOk: false }), NOW), { reply: "I couldn't save that right now, so nothing changed. Try again in a moment.", changed: false });
  assertEquals(saves.splice(0).length, 1, "the failed save was tried once and reported");
  const weekly = await settingsMessage("set a $100 weekly grocery budget", db(), NOW);
  assertEquals(weekly!.changed, false);
  assertEquals(saves.length, 0, "nothing is saved for a refused command");
  reads = 0;
  assertEquals(await settingsMessage("how am i doing on my grocery budget", db(), NOW), null, "a status ask is the direct answer's, not a settings command");
  assertEquals(reads, 0);
});

// Megadoc L03 "set a 400 food budget", exactly as the owner wrote it: monthly $400.00 for food (groceries, restaurants
// and delivery together), restated, with the 80% and 100% messages named, saved as the person's own row.
Deno.test("megadoc L03: 'set a 400 food budget' saves a monthly $400.00 food budget and names the 80% and 100% messages", async () => {
  const saves: any[] = [];
  const r = await settingsMessage("set a 400 food budget", { async read() { return { ok: true, settings: { time_zone: "America/New_York", watches: [] } }; }, async save(c: any) { saves.push(c); return true; } }, NOW);
  assertEquals(r!.changed, true);
  assertEquals(r!.reply.split("\n"), [
    "Budget set: food, $400.00 a month.",
    "I'll count posted spending at groceries, restaurants and food delivery together, each calendar month in America/New York time, with refunds taken off. Transfers don't count; pending charges and charges in other currencies are mentioned, not added; anything I can't place in a category is shown apart, never guessed in.",
    "It only tracks: it never moves money or blocks a payment. I'll message you once at 80% and once at 100% each month.",
    "Say \"stop my food budget\" to turn it off.",
  ]);
  assertEquals(saves.length, 1);
  const w = saves[0].watches;
  assertEquals(w.map((x: any) => [x.kind, x.category, x.amount_cents, x.period, x.status]), [["category_budget", "food", 40000, "month", "active"]]);
});

Deno.test("plan: 80% of a budget is said once, as a watch, with the numbers and the source; the 100% later; never again that month", () => {
  // October so far in the fixture: Whole Foods $64.00 (Oct 4) in groceries; Chipotle 3 x $23.50 in restaurants.
  const w = stored(["set a $70 grocery budget"]);
  const id = w[0].id;
  const p = plan(input({ watches: w }), NOW);
  assertEquals(budgetMsgs(p).map((m) => [m.key, m.kind, m.cadence, m.capability_id, m.text]), [[`budget:${id}:2026-10:80`, "watch", true, "ALRT-010",
    "Your groceries budget is at 91% for October: $64.00 spent of $70.00, $6.00 left, on day 11 of 31. Transactions through Oct 9, 2026. A budget only tracks: it never moves money or blocks a payment. (You set this budget; say \"stop my groceries budget\" to end it.)" + CITE]]);
  const sent = p.messages.map((m) => ({ key: m.key, sent_at: NOW, cadence: m.cadence }));
  assertEquals(budgetMsgs(plan(input({ watches: w }, sent), NOW + H)), [], "an hour later it is not said again");
  const more = plan(input({ watches: w }, sent, [{ account_id: "chk-1", provider_transaction_id: "k1", currency: "USD", amount_cents: -1000, posted_on: "2026-10-11", merchant_raw: "KROGER #123", is_pending: false, is_transfer: false, presence: "observed" }]), NOW + 2 * H);
  assertEquals(budgetMsgs(more).map((m) => m.key), [`budget:${id}:2026-10:100`]);
  assert(budgetMsgs(more)[0].text.startsWith("Your groceries budget for October is used up: $74.00 spent of $70.00, $4.00 over, on day 11 of 31. Transactions through Oct 11, 2026."), budgetMsgs(more)[0].text);
});

Deno.test("plan: budget messages skip the daily budget, come through quiet hours and with alerts off, as watches do", () => {
  const w = stored(["set a $70 grocery budget", "budget $60 a month for eating out"]);
  const p = plan(input({ watches: w }), NOW);
  assertEquals(budgetMsgs(p).map((m) => m.key.split(":").slice(-1)[0]), ["80", "100"], "groceries at 91%, restaurants at 117%");
  assert(budgetMsgs(p).every((m) => m.cadence), "a budget the person set never spends the one-a-day budget");
  const late = Date.UTC(2026, 9, 12, 3, 0, 0); // Sat 11 p.m. New York
  assertEquals(budgetMsgs(plan(input({ watches: w }), late)).length, 2, "quiet hours hold findings, not what the person asked to hear");
  assertEquals(budgetMsgs(plan(input({ watches: w, alerts: false }), NOW)).length, 2, "\"stop alerts\" keeps what the person asked me to watch");
});

Deno.test("plan: a plain watch still comes through with alerts off, as the \"stop alerts\" reply promises", () => {
  const off = parseCommand("stop alerts", null, NOW)!;
  assert(/Anything you asked me to watch still comes through/.test(off.reply));
  const w = stored(["alert me if a charge over $20 posts"]);
  const big = { account_id: "chk-1", provider_transaction_id: "big", currency: "USD", amount_cents: -4500, posted_on: "2026-10-11", merchant_raw: "BEST BUY 00123", is_pending: false, is_transfer: false, presence: "observed" };
  const p = plan(input({ watches: w, alerts: false }, [], [big]), NOW);
  assertEquals(p.messages.filter((m) => m.kind === "watch").map((m) => m.text.replace(CITE, "")), ["Best Buy charged $45.00, over your $20.00 line. (you asked me to watch this)"]);
  assertEquals(p.messages.filter((m) => m.kind === "finding").length, 0, "the findings themselves stay off");
});

Deno.test("what the chat stores passes the settings table's own checks: no 9-digit run, at most 20 watches, budgets never pushed out", () => {
  const check = /watches::text !~ '\\d\{9,\}'/.test(SRC_MIGRATION) && /jsonb_array_length\(watches\) <= 20/.test(SRC_MIGRATION);
  assert(check, "the migration still carries the two checks this test mirrors");
  const longDigits = /\d{9,}/;
  for (const m of ["tell me when checking drops below $500", "alert me if a charge over $200 posts", "text me when netflix charges me", "set a $400 grocery budget", "budget $250 a month for eating out"]) {
    const w = stored([m]);
    assertEquals(w.length, 1, m);
    assert(!longDigits.test(JSON.stringify(w)), `${m}: ${JSON.stringify(w)}`);
  }
  const many = Array.from({ length: 19 }, (_, i) => ({ id: `w${i}`, kind: "amount_over", threshold_cents: 1000 + i }));
  const withBudget = stored(["set a $400 grocery budget"], many);
  assertEquals(withBudget.length, 20);
  const after = stored(["alert me if a charge over $300 posts"], withBudget);
  assertEquals(after.length, MAX_WATCHES);
  assert(after.some((x: any) => x.kind === "category_budget"), "the budget survives; the oldest plain watch goes");
  assertEquals(after.find((x: any) => x.kind === "amount_over").id, "w1");
  assertEquals(capWatches([]), []);
});

Deno.test("show my alerts lists the budgets apart from the watches", () => {
  const w = stored(["set a $400 grocery budget", "alert me if a charge over $200 posts"]);
  const text = describe({ watches: w } as any);
  assert(text.includes("You asked me to watch: about any charge over $200.00."), text);
  assert(text.includes("Budgets: groceries $400.00 a month."), text);
  assert(!/undefined/.test(text), text);
});
