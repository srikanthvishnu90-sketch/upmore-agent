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
  assertEquals(kinds, ["watch", "finding", "weekly_recap"]);
  assert(/^Your cash is \$412\.00 now; it goes under your \$100\.00 buffer on 2026-10-15/.test(p.messages[0].text), p.messages[0].text);
  assert(/Best Buy is new to your accounts and charged \$899\.00 today/.test(p.messages[1].text), p.messages[1].text);
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
  assertEquals(three.messages.filter(m => m.kind === "finding").length, 1, "3 days out it takes the day's one slot, ahead of the new-merchant note (money at risk first)");
  const two = plan(Object.assign(input({ extra: [BIG] }), { subscriptions: [Object.assign({}, trial, { next_billing_date: "2026-10-13" })] }), NOW);
  assertEquals(two.messages.filter(m => m.kind === "finding").length, 2, "2 days out it is a deadline: exempt, and the ordinary note still goes");
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
