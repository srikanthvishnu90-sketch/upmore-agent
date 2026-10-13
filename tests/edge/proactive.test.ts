// The agent speaks first (owner's capability list, section 2): the scheduler and delivery layer around the tested
// engines. Rows in the database's own shapes go through plan(); a memory store stands in for Supabase with the same
// once-only rule the table enforces (unique user + key). Permission-free (static imports only).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, parseCommand, describe, settingsMessage, mapAccounts, mapTransactions, runUser, runAll, handleProactive, localClock, THREAD_TITLE, type ProactiveStore, type ProactiveMessage } from "../../supabase/functions/_shared/proactive.ts";
import { accountRows, txRows, NOW, USER } from "./lib/proactive_fixture.ts";

const H = 3600000, DAY = 24 * H;
const today = (on: string, cents: number, merchant: string, id: string) => ({ account_id: "chk-1", provider_transaction_id: id, currency: "USD", amount_cents: cents, posted_on: on, merchant_raw: merchant, is_pending: false, is_transfer: false, presence: "observed" });
const BIG = today("2026-10-11", -89900, "BEST BUY 00123", "big"), FEE = today("2026-10-11", -3500, "OVERDRAFT FEE", "fee");
const input = (o: any = {}) => ({ accounts: mapAccounts(o.accounts || accountRows(o.balance)), transactions: mapTransactions(txRows(o.extra || [])), settings: o.settings || null, sent: o.sent || [] });

Deno.test("plan: nothing linked means nothing is said, never a number from nothing", () => {
  assertEquals(plan({ accounts: [], transactions: [], settings: null, sent: [] }, NOW).messages, []);
});
Deno.test("plan: the decision order: the low-balance warning, one finding within the daily budget, the Sunday recap; the rest held with a reason", () => {
  const p = plan(input({ extra: [BIG, FEE] }), NOW);
  const kinds = p.messages.map(m => m.kind);
  // K2 (2026-10-12): the C8 big-purchase radar is a standing ask and budget-exempt (cadence_requested, like the
  // C28 reminder), so this fixture's rent ($1,450 due 2026-10-15, over the $500 line) is a second finding; the
  // one budgeted slot still goes to exactly one ordinary finding (Best Buy), and the rest are still held.
  assertEquals(kinds, ["watch", "finding", "finding", "weekly_recap"]);
  assert(/^Your cash is \$412\.00 now; it goes under your \$100\.00 buffer on 2026-10-15/.test(p.messages[0].text), p.messages[0].text);
  assert(/Best Buy is new to your accounts and charged \$899\.00 today/.test(p.messages[1].text), p.messages[1].text);
  assert(/Big charges coming up: Oak Property Mgmt Rent \$1,450\.00 on 2026-10-15/.test(p.messages[2].text), p.messages[2].text);
  assert(p.suppressed.length >= 2 && p.suppressed.every(s => s.reason === "daily_budget"), JSON.stringify(p.suppressed));
  assert(p.suppressed.some(s => /fee/.test(s.key)), "the fee finding was held, not dropped silently");
});
Deno.test("plan: every message names its data source and as-of time", () => {
  for (const m of plan(input({ extra: [BIG] }), NOW).messages) assert(/\(First Bank via SimpleFIN, as of Oct 11, 9:30 AM\)$/.test(m.text), m.text);
});
Deno.test("plan: a message is planned once: what was sent is never planned again; the budget counts only unrequested messages", () => {
  const first = plan(input({ extra: [BIG, FEE] }), NOW);
  const sent = first.messages.map(m => ({ key: m.key, sent_at: NOW, cadence: m.cadence }));
  const again = plan(input({ extra: [BIG, FEE], sent }), NOW + H);
  assertEquals(again.messages.map(m => m.kind), [], "an hour later nothing repeats, and the daily budget is spent");
  const tomorrow = plan(input({ extra: [BIG, FEE], sent }), NOW + DAY);
  assertEquals(tomorrow.messages.filter(m => m.kind === "finding").length, 1, "the next day one more finding fits the budget");
});
Deno.test("plan: A5 low-balance cadence: the warning fires once per episode, plan returns the episode state for the store, and the next day is silent", () => {
  const first = plan(input({ extra: [BIG, FEE] }), NOW);
  assertEquals(first.messages.filter(m => m.key.includes("low_balance")).length, 1, "day one fires once");
  assert(first.watches_update && first.watches_update.some((w: any) => w.kind === "low_balance_episode" && w.status === "open"), "the opened episode is returned as watches_update, to be saved in the person's watches store");
  const sent = first.messages.map(m => ({ key: m.key, sent_at: NOW, cadence: m.cadence }));
  const second = plan(input({ extra: [BIG, FEE], sent, settings: { watches: first.watches_update } }), NOW + DAY);
  assert(!second.messages.some(m => m.key.includes("low_balance")), "the same episode the next day is not re-fired: " + JSON.stringify(second.messages.map(m => m.key)));
  assert(second.suppressed.some(s => s.reason === "low_balance_episode"), "and the suppression is on record as the episode's");
});
Deno.test("plan: quiet hours hold findings and schedules; a safety-level warning still comes through", () => {
  const late = Date.UTC(2026, 9, 12, 3, 0, 0); // Sat 11 p.m. New York
  const p = plan(input({ extra: [BIG] }), late);
  assert(p.messages.every(m => m.kind === "watch" || m.kind === "safety"), JSON.stringify(p.messages.map(m => m.kind)));
  assert(p.suppressed.some(s => s.reason === "quiet_hours"), "the finding waits for morning");
});
Deno.test("plan: the recap goes out on the chosen day only; the monthly close on the 1st; the morning brief only when asked for", () => {
  const monday = NOW + DAY;
  assert(!plan(input(), monday).messages.some(m => m.kind === "weekly_recap"), "not on Monday");
  assert(plan(input({ settings: { weekly_recap_dow: 1 } }), monday).messages.some(m => m.kind === "weekly_recap"), "on the Monday the person picked");
  const first = Date.UTC(2026, 10, 1, 15, 0, 0);
  const close = plan(input(), first).messages.find(m => m.kind === "monthly_close");
  assert(close && /^October closed: \$1,800\.00 in, /.test(close.text), close && close.text);
  assert(!plan(input(), NOW).messages.some(m => m.kind === "morning_brief"), "no brief unless asked");
  const brief = plan(input({ settings: { morning_brief: true } }), NOW).messages.find(m => m.kind === "morning_brief");
  assert(brief && /^Good morning\. Cash: \$412\.00\. Safe to spend (?:until payday|over the next 30 days)/.test(brief.text), brief && brief.text);
});
Deno.test("plan: the morning brief's safe to spend is the chat answer's, from the same rows (one definition)", async () => {
  const { moneyReply } = await import("../../supabase/functions/agent-chat/_shared/money_answers.ts");
  const rows = { accounts: accountRows(), transactions: txRows([]) };
  const brief = plan({ accounts: mapAccounts(rows.accounts), transactions: mapTransactions(rows.transactions), settings: { morning_brief: true }, sent: [] }, NOW).messages.find(m => m.kind === "morning_brief")!;
  const chat = (await moneyReply("how much can i spend", new Date(NOW), { accounts: async () => rows.accounts as any, transactions: async () => rows.transactions as any }))!;
  const head = (t: string) => (/Safe to spend [^:]*: \$[\d,]+\.\d\d(?:, about \$[\d,]+\.\d\d a day)?/.exec(t) || [""])[0];
  assert(head(brief.text), brief.text);
  assertEquals(head(brief.text), head(chat), `brief: ${brief.text}\nchat: ${chat}`);
});
Deno.test("plan: the person's day is counted in their own time zone", () => {
  assertEquals(localClock(NOW, "America/New_York").date, "2026-10-11");
  assertEquals(localClock(Date.UTC(2026, 9, 12, 2, 0, 0), "America/Los_Angeles").dow, 0, "7 p.m. Sunday in Los Angeles is still Sunday");
  const p = plan(input({ settings: { time_zone: "Not/AZone" } }), NOW);
  assert(p.messages.length > 0, "an unknown zone falls back to the default instead of failing");
});

Deno.test("chat commands: a recap day, a brief, quiet hours, a time zone, each restated exactly", () => {
  assertEquals(parseCommand("send me a weekly recap on fridays", null, NOW)!.settings, { weekly_recap_dow: 5 });
  assertEquals(parseCommand("turn on the morning brief", null, NOW)!.settings, { morning_brief: true });
  assertEquals(parseCommand("quiet hours 10pm to 7am", null, NOW)!.settings, { quiet_start: 22, quiet_end: 7 });
  assertEquals(parseCommand("my time zone is pacific", null, NOW)!.settings, { time_zone: "America/Los_Angeles" });
  assertEquals(parseCommand("stop alerts", null, NOW)!.settings, { alerts: false });
  assert(/Nothing changed/.test(parseCommand("my time zone is mars", null, NOW)!.reply));
  assertEquals(parseCommand("what's my balance", null, NOW), null, "anything else goes to the normal chat");
});
Deno.test("chat commands: a watch in the person's words becomes a condition that fires, and is never guessed", () => {
  const c = parseCommand("tell me when checking drops below $500", null, NOW)!;
  assert(/I'll tell you when checking drops below \$500\.00/.test(c.reply), c.reply);
  const p = plan(input({ settings: c.settings }), NOW);
  assert(p.messages.some(m => m.kind === "watch" && /500/.test(m.text)), JSON.stringify(p.messages.map(m => m.text)));
  assertEquals(parseCommand("tell me when my rent is due", null, NOW), null, "a question goes to the normal chat");
  assert(/Nothing was set up/.test(parseCommand("alert me when the moon is full", null, NOW)!.reply));
});
// Megadoc L09 "text me when I spend over 100 on one thing": a single charge over the amount is the existing "charge
// over an amount" watch; a category or a merchant in the words is never dropped into it (it is refused, as before).
Deno.test("megadoc L09: spending over an amount on one thing is the charge-over watch, and it fires on one charge", () => {
  const c = parseCommand("text me when I spend over 100 on one thing", null, NOW)!;
  assertEquals(c.reply, "I'll tell you about any charge over $100.00. Say \"show my alerts\" to see them.");
  const w = (c.settings.watches || [])[0] as any;
  assertEquals([w.kind, w.threshold_cents, c.settings.watches!.length], ["amount_over", 10000, 1]);
  for (const [m, cents] of [["text me when i spend more than $250 in one purchase", 25000], ["alert me if I spend over $50 on a single purchase", 5000], ["warn me if I spend over $1,200.50 in a single transaction", 120050], ["ping me when i spend over $100 at once", 10000], ["tell me if anything over $100 posts", 10000], ["text me if anything over 100 posts", 10000], ["tell me when anything over $20 hits my card", 2000], ["let me know if any purchase over $75 hits", 7500]] as [string, number][]) {
    const x = parseCommand(m, null, NOW)!;
    assertEquals([(x.settings.watches || [])[0]?.kind, (x.settings.watches || [])[0]?.threshold_cents], ["amount_over", cents], `${m}: ${x && x.reply}`);
  }
  // Words that name a category, a merchant or no single purchase are not this watch: refused with the list, never guessed.
  for (const m of ["alert me when i spend over 400 on food", "alert me when i spend over 100 on one thing at target", "text me when i spend over 100", "alert me when spending goes over 500"]) {
    const x = parseCommand(m, null, NOW)!;
    assertEquals(x.settings, {}, m);
    assert(/^I can watch a balance below an amount, a charge over an amount/.test(x.reply) && /Nothing was set up\.$/.test(x.reply), x.reply);
  }
  assertEquals(parseCommand("tell me when my balance is anything over 100", null, NOW), null, "a balance question is not a charge watch");
  // It fires on one charge over the line, not on several smaller ones.
  const big = today("2026-10-11", -10001, "BEST BUY 00123", "one"), small = today("2026-10-11", -9000, "TARGET 00012345", "two");
  const p = plan(input({ settings: c.settings, extra: [big, small] }), NOW);
  assertEquals(p.messages.filter(m => m.kind === "watch" && /over your \$100\.00 line/.test(m.text)).map(m => m.text.split(" (")[0]), ["Best Buy charged $100.01, over your $100.00 line."]);
});
// Megadoc L10 "weekly spending summary every Sunday": the weekly recap (money in, money out, where most of it went,
// what's coming up), on the day named; the same reply as "weekly recap".
Deno.test("megadoc L10: a weekly spending summary is the weekly recap, on the day named", () => {
  const c = parseCommand("weekly spending summary every Sunday", { weekly_recap_dow: null } as any, NOW)!;
  assertEquals(c, { settings: { weekly_recap_dow: 0 }, reply: "I'll send your weekly recap every Sunday from 8 a.m.: money in, money out, and what's coming up." });
  for (const [m, d] of [["send me a weekly spending report on fridays", 5], ["weekly spending recap every monday", 1], ["give me a weekly spend summary on saturdays", 6], ["i want a weekly spending update", 0], ["weekly money summary every thursday", 4], ["send me a weekly recap on fridays", 5], ["weekly summary", 0]] as [string, number][]) {
    assertEquals(parseCommand(m, null, NOW)!.settings, { weekly_recap_dow: d }, m);
  }
  assertEquals(parseCommand("stop my weekly spending summary", null, NOW)!.settings, { weekly_recap_dow: null });
  for (const m of ["what was my weekly spending", "how much did i spend this week", "weekly spending summary for groceries every sunday"]) assertEquals(parseCommand(m, null, NOW), null, m);
  // The recap it turns on says what was spent: money out and where most of it went.
  const sun = plan(input({ settings: c.settings }), NOW).messages.find(m => m.kind === "weekly_recap")!;
  assert(/^Your week \(2026-10-04 to 2026-10-10\): \$[\d,]+\.\d\d in, \$[\d,]+\.\d\d out; most went to /.test(sun.text), sun.text);
});
// Megadoc J15 "tell me when free trials are about to convert": what is true, from code. The proactive run asks before a
// trial the person tracks in the app (save_subscriptions, billing "trial" with its end date) bills, within the 7 days
// before; trials are not found on their own (nothing shows in transactions before the first charge). Nothing is saved.
Deno.test("megadoc J15: trial alerts are on for the trials it tracks, said truthfully, with how to add one; nothing changes", () => {
  const on = parseCommand("tell me when free trials are about to convert", null, NOW)!;
  assertEquals(on.settings, {});
  assertEquals(on.reply, "That's on for the free trials I track. In the week before one turns into a paid charge, I message you with the date and the amount and ask \"Should I cancel it for you?\"; nothing is cancelled without your yes. A trial doesn't show in your transactions until it charges, so I only track the ones you add: in the app, Add a subscription, choose Free trial under \"Bills every\" and enter the trial-end date. These messages go to people with a linked bank or card. Nothing changed.");
  const off = parseCommand("let me know before my free trials charge me", { alerts: false } as any, NOW)!;
  assertEquals(off.settings, {});
  assert(off.reply.startsWith("Alerts are off, so I'm not sending trial messages right now. Say \"turn alerts back on\" to start them."), off.reply);
  assert(off.reply.endsWith("Nothing changed."), off.reply);
  for (const m of ["alert me when my free trials end", "text me before any free trial bills me", "notify me when trials are about to convert to paid", "Tell me when free trials are about to convert."]) assertEquals(parseCommand(m, null, NOW)?.reply, on.reply, m);
  // A named trial with its date is the trial tracker's (it saves that one); a question about trials goes to the chat.
  for (const m of ["tell me when my hulu trial ends", "tell me when my free trial ends oct 20", "what free trials do i have", "remind me before my free trials charge"]) assertEquals(parseCommand(m, null, NOW), null, m);
  // The promise matches the run: a tracked trial 3 days out gets the ask; nothing is asked for a trial that isn't tracked.
  const trial = { id: "sub-j15", merchant: "Paramount+", amount: 11.99, billing_interval: "trial", next_billing_date: "2026-10-13", status: "active", cancel_url: null, cancel_steps: null };
  const asked = plan(Object.assign(input(), { subscriptions: [trial] }), NOW).messages.find(m => m.offer);
  assert(asked && /Should I cancel it for you\? Reply YES or NO\./.test(asked.text), asked ? asked.text : "no ask");
  assert(!plan(input(), NOW).messages.some(m => m.offer), "no tracked trial, no ask");
});
Deno.test("chat commands: a standing report fires on its day, once per period, and can be stopped", () => {
  const friday = Date.UTC(2026, 9, 16, 14, 0, 0);
  const c = parseCommand("every friday tell me my food spend", null, NOW)!;
  assertEquals(c.reply, "Done: I'll tell you your food spending every Friday. It only reads your linked accounts; it never moves money. Say \"stop my food report\" to end it.");
  const p = plan(input({ settings: c.settings }), friday);
  const r = p.messages.find(m => m.kind === "standing_report");
  assert(r && /^Your food spending from 2026-10-09 to 2026-10-15: \$23\.50 across 1 charge\. \(You asked for this every Friday\.\) \(First Bank/.test(r.text), r && r.text);
  assertEquals(p.fired_reports.length, 1);
  assert(!plan(input({ settings: c.settings }), NOW).messages.some(m => m.kind === "standing_report"), "not on a Sunday");
  const stop = parseCommand("stop my food report", c.settings, NOW)!;
  assert(/^Stopped/.test(stop.reply), stop.reply);
  assert(!plan(input({ settings: stop.settings }), friday).messages.some(m => m.kind === "standing_report"), "stopped means stopped");
  assert(/isn't one I can measure/.test(parseCommand("every friday tell me my vibes spend", null, NOW)!.reply));
  assert(/Reports: food spending every Friday\./.test(describe(c.settings)), describe(c.settings));
});

// A memory store with the table's once-only rule (unique user + key) and a thread per person.
function memStore(o: { failMessage?: boolean } = {}) {
  const log = new Map<string, any>(), threads: any[] = [], messages: any[] = [];
  const store: ProactiveStore & { log: typeof log; threads: any[]; messages: any[] } = {
    log, threads, messages,
    async users() { return [USER]; },
    async load() { return { accounts: mapAccounts(accountRows()), transactions: mapTransactions(txRows([BIG])), settings: null, sent: [...log.values()].map(x => ({ key: x.key, sent_at: x.sent_at, cadence: x.cadence })) }; },
    async deliver(user: string, msgs: ProactiveMessage[]) {
      const out: string[] = [];
      for (const m of msgs) {
        if (log.has(user + m.key)) continue;
        log.set(user + m.key, { key: m.key, sent_at: NOW, cadence: m.cadence });
        if (o.failMessage) { log.delete(user + m.key); throw new Error("message delivery failed"); }
        let t = threads.find(x => x.user === user && x.title === THREAD_TITLE); if (!t) { t = { user, title: THREAD_TITLE, id: "th" + threads.length }; threads.push(t); }
        messages.push({ thread: t.id, role: "assistant", content: m.text, meta: { proactive: true, key: m.key } }); out.push(m.key);
      }
      return out;
    },
  };
  return store;
}
Deno.test("delivery: messages land in the person's 'Updates from Upmore' thread, once; a second run sends nothing", async () => {
  const s = memStore();
  const a = await runUser(s, USER, NOW);
  assert(a.delivered >= 2, JSON.stringify(a));
  assertEquals(s.threads.length, 1); assertEquals(s.threads[0].title, "Updates from Upmore");
  assert(s.messages.every(m => m.role === "assistant" && m.meta.proactive));
  const b = await runUser(s, USER, NOW + 5 * 60000);
  assertEquals(b.delivered, 0, "the same hour twice delivers nothing new");
});
Deno.test("delivery: a failed write releases its claim so the next run can deliver it; one person's failure never stops the others", async () => {
  const s = memStore({ failMessage: true });
  const t = await runAll(s, NOW, 10);
  assertEquals(t.failed, 1); assertEquals(s.log.size, 0, "no claim is left behind for a message that never landed");
});
Deno.test("endpoint: POST only, the secret header is required and compared in full, the body is bounded, the reply carries counts only", async () => {
  const env = { get: (k: string) => k === "PROACTIVE_SECRET" ? "s".repeat(40) : undefined };
  const call = (init: RequestInit) => handleProactive(new Request("https://x/functions/v1/agent-proactive", init), { env, store: memStore(), now: () => NOW });
  assertEquals((await call({ method: "GET" })).status, 405);
  assertEquals((await call({ method: "POST" })).status, 401);
  assertEquals((await call({ method: "POST", headers: { "x-upmore-proactive-secret": "s".repeat(39) } })).status, 401);
  assertEquals((await handleProactive(new Request("https://x", { method: "POST", headers: { "x-upmore-proactive-secret": "" } }), { env: { get: () => "" }, store: memStore() })).status, 401, "no configured secret means nothing runs");
  assertEquals((await call({ method: "POST", headers: { "x-upmore-proactive-secret": "s".repeat(40) }, body: JSON.stringify({ limit: 9999 }) })).status, 400);
  const ok = await call({ method: "POST", headers: { "x-upmore-proactive-secret": "s".repeat(40) } });
  assertEquals(ok.status, 200);
  const body = await ok.json();
  assertEquals(Object.keys(body).sort(), ["delivered", "failed", "ok", "suppressed", "users"]);
  assert(!/\$/.test(JSON.stringify(body)), "no amounts in the response");
});

Deno.test("chat side: ordinary messages cost no read; a command is read, saved through the person's session and restated; failures say nothing changed", async () => {
  let reads = 0, saves: any[] = [];
  const db = (o: { readOk?: boolean; saveOk?: boolean; settings?: any } = {}) => ({ async read() { reads++; return { ok: o.readOk !== false, settings: o.settings || null }; }, async save(c: any) { saves.push(c); return o.saveOk !== false; } });
  assertEquals(await settingsMessage("send sam $40", db(), NOW), null); assertEquals(await settingsMessage("what's my balance", db(), NOW), null);
  assertEquals(reads, 0, "no database read for messages that are not settings");
  const ok = await settingsMessage("send me a weekly recap on fridays", db(), NOW);
  assertEquals(ok, { reply: "I'll send your weekly recap every Friday from 8 a.m.: money in, money out, and what's coming up.", changed: true });
  assertEquals(saves.pop(), { weekly_recap_dow: 5 });
  const w = await settingsMessage("text me when checking drops below $500", db({ settings: { watches: [{ kind: "amount_over", threshold_cents: 10000, id: "w1" }] } }), NOW);
  assert(w && w.changed); assertEquals(saves.pop().watches.length, 2, "a new watch is added to the ones already set");
  assertEquals((await settingsMessage("quiet hours 10pm to 7am", db({ readOk: false }), NOW))!.reply, "I can't reach your alert settings right now, so nothing changed. Try again in a moment.");
  assertEquals(await settingsMessage("quiet hours 10pm to 7am", db({ saveOk: false }), NOW), { reply: "I couldn't save that right now, so nothing changed. Try again in a moment.", changed: false });
  const show = await settingsMessage("show my alerts", db({ settings: { morning_brief: true } }), NOW);
  assert(show && !show.changed && /Morning brief on\./.test(show.reply), show ? show.reply : "no reply");
});

Deno.test("plan: a trial the person tracks in the app (save_subscriptions) warns before the first charge; within 2 days it is exempt from the budget", () => {
  const trial = { id: "sub-1", merchant: "Paramount+", amount: 11.99, billing_interval: "trial", next_billing_date: "2026-10-14", status: "active" };
  const three = plan(Object.assign(input({ extra: [BIG] }), { subscriptions: [trial] }), NOW);
  const t = three.messages.find(m => m.key.startsWith("finding:trial_converting:"));
  assert(t && /^Paramount\+ trial ends in 3 days\. The first charge of \$11\.99 lands 2026-10-14 unless it is cancelled first\./.test(t.text), t ? t.text : JSON.stringify(three.messages.map(m => m.key)));
  // K2 (2026-10-12): this fixture's rent also trips the C8 radar, which is budget-exempt (a standing ask), so it
  // rides along in both runs; the trial's own budget behavior is unchanged (one budgeted slot at 3 days, exempt at 2).
  assertEquals(three.messages.filter(m => m.kind === "finding").length, 2, "3 days out it takes the day's one slot, ahead of the new-merchant note (money at risk first), plus the exempt radar");
  const two = plan(Object.assign(input({ extra: [BIG] }), { subscriptions: [Object.assign({}, trial, { next_billing_date: "2026-10-13" })] }), NOW);
  assertEquals(two.messages.filter(m => m.kind === "finding").length, 3, "2 days out it is a deadline: exempt, and the ordinary note still goes, plus the exempt radar");
  assert(!plan(Object.assign(input(), { subscriptions: [Object.assign({}, trial, { status: "cancelled" })] }), NOW).messages.some(m => /trial/.test(m.key)), "a cancelled trial is never warned about");
});

// Owner, 2026-10-11: "before someone's free trial ends, message them: your free trial is about to end, should I cancel
// this for you?" Nothing is cancelled without that person's yes; the cancel flow's own card is the one approval.
import { offerMessage } from "../../supabase/functions/_shared/proactive.ts";
const TRIAL = { id: "sub-9", merchant: "Paramount+", amount: 11.99, billing_interval: "trial", next_billing_date: "2026-10-13", status: "active", cancel_url: "https://www.paramountplus.com/account/", cancel_steps: null };
Deno.test("trial offer: the message asks first, in one line, and carries the offer for that thread", () => {
  const m = plan(Object.assign(input(), { subscriptions: [TRIAL] }), NOW).messages.find(x => x.offer);
  assert(m && /^Paramount\+ trial ends in 2 days\. The first charge of \$11\.99 lands 2026-10-13 unless it is cancelled first\. Should I cancel it for you\? Reply YES or NO\./.test(m.text), m ? m.text : "no offer");
  assertEquals(m!.offer, { kind: "cancel_trial", merchant: "Paramount+", subscription_id: "sub-9", ends_on: "2026-10-13", amount_cents: 1199, cancel_url: "https://www.paramountplus.com/account/", cancel_steps: null });
});
function offerDeps(o: { live?: boolean; flow?: any; threadId?: string } = {}) {
  const calls = { cleared: 0, flows: [] as string[], watched: [] as string[] };
  const offer = { kind: "cancel_trial", merchant: "Paramount+", subscription_id: "sub-9", ends_on: "2026-10-13", amount_cents: 1199, cancel_url: "https://www.paramountplus.com/account/", cancel_steps: null, thread_id: "th-updates" };
  return { calls, deps: { offer, threadId: o.threadId || "th-updates", liveCard: async () => !!o.live, runFlow: async (t: string) => { calls.flows.push(t); return o.flow || null; }, clear: async () => { calls.cleared++; return true; }, watch: async (m: string) => { calls.watched.push(m); return true; } } };
}
Deno.test("trial offer: NO keeps it and says when it bills; anything else is not an answer", async () => {
  const { calls, deps } = offerDeps();
  assertEquals((await offerMessage("no", deps, NOW))!.reply, "Okay, I'll leave Paramount+ alone. The first charge of $11.99 lands Oct 13.");
  assertEquals(calls.flows, [], "no means nothing runs"); assertEquals(calls.cleared, 1);
  assertEquals(await offerMessage("what's my balance", offerDeps().deps, NOW), null);
  assertEquals(await offerMessage("yes", offerDeps({ threadId: "another-thread" }).deps, NOW), null, "an offer is answered in its own thread only");
});
Deno.test("trial offer: YES starts the real cancel flow; a trial that never charged gets the steps, a plain 'nothing was cancelled', and a watch", async () => {
  const { calls, deps } = offerDeps();
  const r = await offerMessage("yes", deps, NOW);
  assertEquals(calls.flows, ["cancel Paramount+"], "the cancel flow is tried first, never skipped");
  assertEquals(r!.reply, "Paramount+ hasn't charged you yet, so there's nothing on your cards for me to cancel from here, and nothing was cancelled. To stop it before Oct 13: open https://www.paramountplus.com/account/. I'll tell you if Paramount+ charges you anyway.");
  assertEquals(calls.watched, ["Paramount+"]);
});
Deno.test("trial offer: when the cancel flow can act, its card is the approval; a live card's own yes wins; a yes after the trial ended fires nothing", async () => {
  const card = { reply: "Cancel Paramount+ ($11.99/mo) on card ••8830? Reply YES or NO.", route: { flow: "cancel", outcome: "confirm" } };
  const a = await offerMessage("yes", offerDeps({ flow: card }).deps, NOW);
  assertEquals(a!.reply, "Okay, cancelling Paramount+. Cancel Paramount+ ($11.99/mo) on card ••8830? Reply YES or NO.");
  assertEquals(a!.route.outcome, "confirm", "a card, not a cancellation: the person still says yes to the card");
  assertEquals(await offerMessage("yes", offerDeps({ live: true }).deps, NOW), null, "a live card in the thread answers its own yes");
  const late = await offerMessage("yes", offerDeps().deps, Date.UTC(2026, 9, 15, 12));
  assertEquals(late!.reply, 'That offer has expired: the Paramount+ trial ended Oct 13, so nothing was cancelled. If you still want it gone, say "cancel Paramount+".');
});

// Monthly rent (a standing flow the person turned on, packages/domain/81-standing-rent.js): a few days before the due day
// the person is offered that month's card. The offer is a question; it never stages anything. A yes puts up the rent
// flow's own card (amount, month and recipient restated, its own yes); a no skips the month. Rows are a MOCK of
// public.standing_payments.
const RENT = { id: "sp-1", kind: "rent", payee_name: "Mike", payee_handle: "mike@example.com", rail: "zelle", amount_cents: 145000, day_of_month: 14, funding: "checking", status: "active", created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-01T12:00:00Z", last_staged_month: null };
const withRent = (o: any = {}, rows: any[] = [RENT]) => Object.assign(input(o), { standing: rows });
Deno.test("rent offer: three days before the due day the month's card is offered once, as a question, citing the rent setup; it is a cadence the person asked for", () => {
  const p = plan(withRent(), NOW); // Sun Oct 11, 10 a.m. New York; rent due the 14th
  const m = p.messages.find(x => x.kind === "standing_payment");
  assert(m, JSON.stringify(p.messages.map(x => x.key)));
  assertEquals(m!.key, "rent:sp-1:2026-10");
  assertEquals(m!.text, "Rent for October is due Oct 14: $1,450.00 to Mike on Zelle, from checking. Want this month's card to send it? Reply YES or NO. Nothing is staged without your yes. (from your rent setup, as of Sep 1, 8:00 AM)");
  assertEquals(m!.offer, { kind: "rent_month", standing_id: "sp-1", month: "2026-10", due_on: "2026-10-14", amount_cents: 145000, payee_name: "Mike", rail: "zelle" });
  assertEquals([m!.cadence, m!.urgent, m!.capability_id], [true, false, "PAY-005"]);
  assert(!/staged,|Staged/.test(JSON.stringify(p.messages)), "the scheduler never stages anything");
  assert(!plan(withRent(), NOW - 2 * DAY).messages.some(x => x.kind === "standing_payment"), "five days out: not yet");
  assert(!plan(withRent({ sent: [{ key: "rent:sp-1:2026-10", sent_at: NOW - H, cadence: true }] }), NOW).messages.some(x => x.kind === "standing_payment"), "once per month: what was sent is not offered again");
  assert(!plan(withRent({}, [Object.assign({}, RENT, { last_staged_month: "2026-10" })]), NOW).messages.some(x => x.kind === "standing_payment"), "a month already staged is not offered");
  assert(!plan(withRent({}, [Object.assign({}, RENT, { status: "stopped" })]), NOW).messages.some(x => x.kind === "standing_payment"), "stopped means no offer");
  const late = plan(withRent(), Date.UTC(2026, 9, 12, 3, 0, 0)); // Sat 11 p.m. New York
  assert(!late.messages.some(x => x.kind === "standing_payment") && late.suppressed.some(s => s.key === "rent:sp-1:2026-10"), "quiet hours hold it for the morning");
  const noBank = plan({ accounts: [], transactions: [], settings: null, sent: [], standing: [RENT] }, NOW);
  assertEquals(noBank.messages.map(x => x.kind), ["standing_payment"], "rent the person set up is offered even with nothing linked");
});
Deno.test("rent offer: never in the same run as another offer, so one yes answers exactly one question", () => {
  const p = plan(Object.assign(withRent(), { subscriptions: [TRIAL] }), NOW);
  assertEquals(p.messages.filter(x => x.offer).length, 1);
  assert(p.suppressed.some(s => s.key === "rent:sp-1:2026-10" && s.reason === "one_offer_at_a_time"), JSON.stringify(p.suppressed));
  const next = plan(Object.assign(withRent({ sent: p.messages.map(x => ({ key: x.key, sent_at: NOW, cadence: x.cadence })) }), { subscriptions: [TRIAL] }), NOW + H);
  assert(next.messages.some(x => x.key === "rent:sp-1:2026-10"), "it goes the next hour");
});
function rentOfferDeps(o: { live?: boolean; flow?: any } = {}) {
  const calls = { cleared: 0, flows: [] as string[] };
  const offer = { kind: "rent_month", standing_id: "sp-1", month: "2026-10", due_on: "2026-10-14", amount_cents: 145000, payee_name: "Mike", rail: "zelle", thread_id: "th-updates" };
  return { calls, deps: { offer, threadId: "th-updates", liveCard: async () => !!o.live, runFlow: async (t: string) => { calls.flows.push(t); return o.flow === undefined ? null : o.flow; }, clear: async () => { calls.cleared++; return true; }, watch: async () => true } };
}
Deno.test("rent offer: YES puts up the rent flow's own card (its yes is the approval); NO skips the month; nothing is staged here", async () => {
  const card = { reply: "Rent for October: $1,450.00 to Mike on Zelle, due Oct 14, from checking, for you to send. Reply YES to stage it or NO to skip this month, within 10 min.", route: { flow: "rent", outcome: "confirm" } };
  const y = rentOfferDeps({ flow: card });
  const r = await offerMessage("yes", y.deps, NOW);
  assertEquals(y.calls.flows, ["pay my rent"]); assertEquals(r!.reply, card.reply); assertEquals(r!.route.outcome, "confirm", "a card, not a staged payment");
  assertEquals(y.calls.cleared, 1);
  const n = rentOfferDeps();
  assertEquals((await offerMessage("no", n.deps, NOW))!.reply, "Okay, skipping October's rent card. Nothing was staged or sent. Say \"pay my rent\" if you change your mind.");
  assertEquals(n.calls.flows, [], "no runs nothing");
  assertEquals(await offerMessage("yes", rentOfferDeps({ live: true }).deps, NOW), null, "a live card in the thread answers its own yes");
  assertEquals((await offerMessage("yes", rentOfferDeps().deps, NOW))!.reply, "I couldn't put up October's rent card right now, so nothing was staged. Say \"pay my rent\" in a moment.");
  const old = rentOfferDeps({ flow: card });
  assertEquals((await offerMessage("yes", old.deps, Date.UTC(2026, 9, 30, 12)))!.reply, "That offer has expired: October's rent was due Oct 14, so nothing was staged. Say \"pay my rent\" if you want a card.");
  assertEquals(old.calls.flows, [], "an expired offer runs nothing");
});

// The deposit-insurance check reaches a message from database rows (overnight 2026-10-12): the feed used to hand the
// monitors no accounts, so a $312,500 savings balance was never mentioned. MOCK rows.
Deno.test("plan: a savings balance over the deposit-insurance limit is said, with its source and as-of", () => {
  const sav = { account_id: "sav-1", name: "High Yield Savings", institution: "First Bank", currency: "USD", account_kind: "savings", balance_cents: 31250000, available_cents: 31250000, balance_as_of: "2026-10-11T13:30:00Z", fetched_at: "2026-10-11T13:30:00Z", sync_error: false, status: "active" };
  const p = plan(input({ accounts: accountRows(500000).concat([sav]) }), NOW);
  const said = p.messages.find(m => /over the deposit insurance limit/.test(m.text));
  assert(said, JSON.stringify({ messages: p.messages.map(m => m.text), suppressed: p.suppressed }));
  assert(/\$62,500\.00 may be uninsured\..*Balance per First Bank via SimpleFIN, as of 2026-10-11 13:30 UTC\./.test(said.text), said.text);
});

// Found 2026-10-12: "stop the alerts for netflix" turned off every alert. Alerts for one merchant can't be turned off on
// their own yet, so nothing changes and the person hears what would; plain opt-outs ("stop texting me", "unsubscribe")
// turn alerts off and say what still comes; a bare "stop" changes nothing here (with a card open it means that card).
Deno.test("opt-outs: one merchant's alerts change nothing; plain opt-outs turn alerts off and say what remains; bare stop is not a setting", async () => {
  const one = parseCommand("stop the alerts for netflix", null, NOW)!;
  assertEquals(one.settings, {});
  assert(/^I can't turn off alerts for just one merchant or account yet, so nothing changed\./.test(one.reply));
  for (const t of ["stop texting me", "unsubscribe", "no more messages", "don't text me anymore", "stop sending me alerts"]) {
    const c = parseCommand(t, null, NOW)!;
    assertEquals(c.settings, { alerts: false }, t);
    assert(/Anything you asked me to watch, and reports you asked for, still come through/.test(c.reply), t);
  }
  for (const t of ["stop", "STOP", "pause", "stop sending sam money", "stop payment to sam"]) assertEquals(parseCommand(t, null, NOW), null, t);
  assertEquals(parseCommand("turn off notifications from you", null, NOW)!.settings, { alerts: false });
});
