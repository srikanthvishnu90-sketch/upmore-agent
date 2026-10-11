// The agent speaks first (owner's capability list, section 2): the scheduler and delivery layer around the tested
// engines. Rows in the database's own shapes go through plan(); a memory store stands in for Supabase with the same
// once-only rule the table enforces (unique user + key). Permission-free (static imports only).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { plan, parseCommand, describe, mapAccounts, mapTransactions, runUser, runAll, handleProactive, localClock, THREAD_TITLE, type ProactiveStore, type ProactiveMessage } from "../../supabase/functions/_shared/proactive.ts";
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
  assert(brief && /^Good morning\. Cash: \$412\.00\. Safe to spend today: /.test(brief.text), brief && brief.text);
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
  assert(/Nothing was set up/.test(parseCommand("tell me when the moon is full", null, NOW)!.reply));
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
