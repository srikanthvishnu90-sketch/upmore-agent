// WO-027 (architect): the person never repeats themselves. Every alert, instruction, fact, search, card answer and
// receipt is written to the account's timeline in code by the path that did it; the recall tool reads it back by kind,
// subject and time in the person's words; past the 40-message window a summary written in code from it goes into the
// system prompt (WO-023 B5); a missing integration is one line that asks, never an error; and a timeline that cannot be
// written never fails the person's action. Synthetic data; a scripted model. Run: deno test -A --no-check tests/architect/
import {
  type CareerEvent, dayIn, type EventStore, memoryEventStore, normalizeEvent, recordEvent, SUMMARY_UNREADABLE, threadSummary, windowOf,
} from "../../supabase/functions/_shared/agent/timeline.ts";
import { EMAIL_LEAD, missingIntegration } from "../../supabase/functions/_shared/agent/integrations.ts";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";
import { memoryStandingStore } from "../../supabase/functions/_shared/agent/memory.ts";
import { agentTurn, historyWindow, summaryFor } from "../../supabase/functions/agent-chat/career_brain.ts";
import { memoryAlertStore } from "../../supabase/functions/_shared/career_alert_store.ts";
import { CARD_INTENT, type CardStore, cardTurn } from "../../supabase/functions/_shared/career_apply_cards.ts";
import { runReceipts } from "../../supabase/functions/_shared/career_proactive_run.ts";
import { handleProactive } from "../../supabase/functions/career-proactive/handler.ts";
import HANDLER from "../../supabase/functions/agent-chat/handler-career.ts" with { type: "text" };
import PROACTIVE_INDEX from "../../supabase/functions/career-proactive/index.ts" with { type: "text" };
import STATED from "../../supabase/migrations/20261016120000_career_account_stated_facts.sql" with { type: "text" };
import ERASE from "../../supabase/migrations/20261020120100_career_events_erase.sql" with { type: "text" };
import TABLE from "../../supabase/migrations/20261020120000_career_events.sql" with { type: "text" };

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
const T = Date.parse("2026-10-19T15:00:00Z"); // a Monday, 11:00 in New York
const U = "TEST-U";
const ctx = (message = "", now = T) => ({ userId: U, threadId: "TH", now, state: {} as Record<string, any>, turn: { message, added: [] as string[] } });
const byName = (tools: any[]) => Object.fromEntries(tools.map((t) => [t.name, t]));
const kinds = (s: { dump(): CareerEvent[] }) => s.dump().map((e) => e.kind);
// A timeline that cannot be written: every add throws; the console's error line is captured, not printed.
function brokenStore(): EventStore & { tries: number } {
  const s = { tries: 0, async add() { s.tries++; throw new Error("database unreachable"); }, async recall() { throw new Error("database unreachable"); } };
  return s;
}
async function quietly<T>(f: () => Promise<T>): Promise<{ out: T; logged: string[] }> {
  const logged: string[] = [], was = console.error;
  console.error = (...a: unknown[]) => { logged.push(a.map(String).join(" ")); };
  try { return { out: await f(), logged }; } finally { console.error = was; }
}
const ev = (at: string, kind: CareerEvent["kind"], subject: string, detail: Record<string, unknown> = {}, source = "chat"): CareerEvent =>
  ({ user_id: U, at, kind, subject, detail, source });

Deno.test("WO-027/E1 every wired chat tool writes its event: alerts set, changed, stopped; instructions kept and removed; a fact confirmed; a search; a reported stage", async () => {
  const events = memoryEventStore(), alerts = memoryAlertStore(), memory = memoryStandingStore();
  const pool = [{ job_id: "1", title: "Data Analyst", company: "Ramp", location: "Chicago, IL", url: "https://jobs.ashbyhq.com/ramp/1", description: "Data Analyst at Ramp.", first_seen_at: "2026-10-19T14:00:00Z" }];
  const t = byName(careerTools({ postings: async () => pool, alerts, memory, events }));
  await t.set_job_alerts.run({ keywords: ["data analyst"], locations: ["chicago"] }, ctx());
  await t.set_job_alerts.run({ locations: ["austin"] }, ctx());
  await t.stop_job_alerts.run({}, ctx());
  await t.stop_job_alerts.run({}, ctx());
  eq(kinds(events), ["alert_set", "alert_changed", "alert_stopped"], "a second stop, with nothing on, writes nothing");
  const changed = events.dump()[1];
  eq([changed.subject, changed.detail.locations, changed.detail.timezone, changed.source], ["data analyst", ["austin"], "America/New_York", "chat"], "the alert in exact terms");
  await t.set_job_alerts.run({ max_instant_per_day: 1 }, ctx());
  eq(kinds(events).at(-1), "alert_set", "turning alerts back on after a stop is a set");

  const said = "important: I will need visa sponsorship";
  await t.remember_instruction.run({ instruction: "Needs visa sponsorship", quote: "I will need visa sponsorship" }, ctx(said));
  await t.remember_instruction.run({ instruction: "needs visa sponsorship", quote: "need visa sponsorship" }, ctx(said));
  await t.forget_instruction.run({ id: "S-001" }, ctx("I got my green card, I don't need sponsorship anymore"));
  const ins = events.dump().filter((e) => e.kind.startsWith("instruction_"));
  eq(ins.map((e) => [e.kind, e.subject, e.detail.id]), [["instruction_kept", "Needs visa sponsorship", "S-001"], ["instruction_removed", "Needs visa sponsorship", "S-001"]], "kept once, removed once");

  const c = ctx("I was a data analyst for 2 years");
  const added: any = await t.add_profile_fact.run({ kind: "experience", text: "2 years as a data analyst" }, c);
  await t.confirm_profile_fact.run({ id: added.fact.id }, { ...ctx("yes, correct"), state: c.state });
  const fact = events.dump().find((e) => e.kind === "fact_confirmed")!;
  eq([fact.subject, fact.detail.id, fact.detail.kind], ["2 years as a data analyst", added.fact.id, "experience"]);

  await t.search_jobs.run({ query: "data analyst" }, ctx());
  const s = events.dump().find((e) => e.kind === "search")!;
  eq([s.subject, s.detail.results, s.detail.companies], ["data analyst", 1, ["Ramp"]], "what was searched and what came back");
  await t.track_application.run({ company: "Stripe", role: "Data Analyst", stage: "Interview rounds" }, ctx());
  const st = events.dump().find((e) => e.kind === "status_change")!;
  eq([st.subject, st.detail.stage, st.detail.role], ["Stripe", "Interview rounds", "Data Analyst"]);
  assert(events.dump().every((e) => e.user_id === U && e.at === new Date(T).toISOString()), "each event is the person's, at the turn's time");
});

function cardStore(results: { n: number; company: string; result: string }[]): CardStore {
  return {
    async pending() { return []; },
    async open() { throw new Error("not used"); },
    async latestOpen() { return { id: "CARD-1", items: results.map((r) => ({ n: r.n, prepared_id: `P-${r.n}`, payload_hash: "a".repeat(64) })), shown_at: new Date(T - 3600000).toISOString() }; },
    async answer() { return results; },
    async lastAssistantIntent() { return CARD_INTENT; },
  };
}

Deno.test("WO-027/E2 a card answer writes each line (approved, or why not sent); a receipt writes application_finished once", async () => {
  const events = memoryEventStore();
  const store = cardStore([{ n: 1, company: "Ramp", result: "declined" }, { n: 2, company: "Plaid", result: "declined" }]);
  eq((await cardTurn({ message: "yes but not 2", userId: U, threadId: "TH", now: T, store, events }))?.status, "needs_tap", "option A (chosen 2026-10-22 under the owner's delegation): a text yes never approves or sends; only the person's tap on the exact payload does");
  eq(events.dump().length, 0, "a text yes answers nothing, so writes nothing");
  const r = await cardTurn({ message: "no", userId: U, threadId: "TH", now: T, store, events });
  eq(r?.status, "answered");
  eq(events.dump().map((e) => [e.kind, e.subject, e.detail.result, e.source]), [["status_change", "Ramp", "declined", "card"], ["status_change", "Plaid", "declined", "card"]]);
  eq((await cardTurn({ message: "show my applications", userId: U, threadId: "TH", now: T, store: { ...store, pending: async () => [] }, events }))?.status, "empty");
  eq(events.dump().length, 2, "showing nothing writes nothing");

  const outbox = memoryAlertStore(), receipts = memoryEventStore();
  const rows = [{ id: "A-1", user_id: U, company: "Stripe", url: "https://boards.greenhouse.io/stripe/jobs/1", state: "confirmed", confirmation_id: "C-77" }];
  eq(await runReceipts({ outbox, now: T, finished: async () => rows, events: receipts }), 1);
  eq(await runReceipts({ outbox, now: T + 300000, finished: async () => rows, events: receipts }), 0, "the outbox keeps one receipt ever");
  const fin = receipts.dump();
  eq(fin.map((e) => [e.kind, e.subject, e.detail.state, e.detail.confirmation_id, e.source]), [["application_finished", "Stripe", "confirmed", "C-77", "receipt"]], "and so does the timeline");
  assert(/events: \(\) => supabaseEventStore\(admin\)/.test(PROACTIVE_INDEX), "the scheduled run writes receipts to the real timeline");
});

Deno.test("WO-027/E3 a timeline that cannot be written never fails the action: alerts, instructions, card answers, receipts and the scheduled run all go on", async () => {
  const broken = brokenStore(), alerts = memoryAlertStore(), memory = memoryStandingStore();
  const t = byName(careerTools({ postings: async () => [], alerts, memory, events: broken }));
  const { out, logged } = await quietly(async () => {
    const a: any = await t.set_job_alerts.run({ keywords: ["icu nurse"] }, ctx());
    const k: any = await t.remember_instruction.run({ instruction: "No staffing agencies", quote: "no staffing agencies" }, ctx("no staffing agencies please"));
    const card = await cardTurn({ message: "no", userId: U, threadId: "TH", now: T, store: cardStore([{ n: 1, company: "Ramp", result: "declined" }]), events: broken });
    const outbox = memoryAlertStore();
    const n = await runReceipts({ outbox, now: T, finished: async () => [{ id: "A-9", user_id: U, company: "Stripe", state: "failed", reason: "x" }], events: broken });
    return { a, k, card, n, outbox };
  });
  eq(out.a.alerts.keywords, ["icu nurse"]);
  eq((await alerts.get(U))?.prefs.on, true, "the alert is saved");
  eq([out.k.kept.text, (await memory.standing(U)).length], ["No staffing agencies", 1], "the instruction is saved");
  eq(out.card?.status, "answered");
  assert(out.card?.reply.startsWith("Nothing was approved."), "the card answer is unchanged");
  eq([out.n, out.outbox.dump().outbox.length], [1, 1], "the receipt is queued");
  eq(broken.tries, 4, "each write was tried once");
  assert(logged.length === 4 && logged.every((l) => /career event not recorded \(\w+\): database unreachable/.test(l)), logged.join("\n"));
  eq(await recordEvent(null, { user_id: U, kind: "note" }), false, "no store: nothing written, nothing thrown");
  eq((await quietly(() => recordEvent(memoryEventStore(), { user_id: U, kind: "sent_money" }))).out, false, "an unknown kind is not written, and not thrown");

  const store = { ...memoryAlertStore(), active: async () => [] };
  const res = await quietly(() => handleProactive(new Request("https://x.test", { method: "POST", headers: { "x-trainee-proactive-secret": "s".repeat(32) } }), {
    env: { get: (k: string) => (k === "CAREER_PROACTIVE_SECRET" ? "s".repeat(32) : undefined) }, now: () => T, store: () => store,
    recentPostings: async () => [], postingsById: async () => [], events: () => brokenStore(),
    finishedApplications: async () => [{ id: "A-10", user_id: U, company: "Ramp", state: "confirmed" }], recordRun: async () => {},
  }));
  eq([res.out.status, (await res.out.json()).receipts], [200, 1], "the scheduled run succeeds and counts the receipt");
});

Deno.test("WO-027/E4 events are bounded like the table: a known kind, a subject of 200, detail of 4 KB", () => {
  const e = normalizeEvent({ user_id: U, kind: "note", subject: "x".repeat(300), detail: { big: "y".repeat(5000) }, at: T });
  eq([e.subject.length, e.detail.cut, e.detail.keys, e.at], [200, "detail left out for length", ["big"], "2026-10-19T15:00:00.000Z"]);
  let err = "";
  try { normalizeEvent({ user_id: U, kind: "sent_money" }); } catch (x) { err = (x as Error).message; }
  assert(/unknown event kind/.test(err));
  for (const k of ["application_prepared", "application_approved", "application_finished", "alert_set", "alert_changed", "alert_stopped", "instruction_kept", "instruction_removed", "fact_confirmed", "search", "outreach_drafted", "outreach_sent", "intro_proposed", "intro_made", "mock_done", "status_change", "note"]) {
    assert(TABLE.includes(`'${k}'`), `${k} is in the table's check`);
    normalizeEvent({ user_id: U, kind: k });
  }
});

Deno.test("WO-027/W1 windowOf reads time in the person's words, in their zone", () => {
  const w = (s: string, now = T, tz = "America/New_York") => { const x = windowOf(s, now, tz); return x && [x.from, x.to, x.label]; };
  eq(w("in October"), ["2026-10-01T04:00:00.000Z", "2026-11-01T04:00:00.000Z", "October 2026"]);
  eq(w("Oct"), w("october"));
  eq(w("in November", Date.parse("2027-03-02T15:00:00Z")), ["2026-11-01T04:00:00.000Z", "2026-12-01T05:00:00.000Z", "November 2026"], "a month not yet started this year is last year's; the clocks changed inside it");
  eq(w("last October")?.[2], "October 2025", "last October, said in October, is a year ago");
  eq(w("september 2025")?.[2], "September 2025");
  eq(w("yesterday"), ["2026-10-18T04:00:00.000Z", "2026-10-19T04:00:00.000Z", "yesterday (2026-10-18)"]);
  eq(w("today")?.[0], "2026-10-19T04:00:00.000Z");
  eq(w("last week"), ["2026-10-12T04:00:00.000Z", "2026-10-19T04:00:00.000Z", "last week (2026-10-12 to 2026-10-18)"], "Monday to Sunday");
  eq(w("this week")?.slice(0, 2), ["2026-10-19T04:00:00.000Z", "2026-10-20T04:00:00.000Z"]);
  eq(w("this month")?.slice(0, 2), ["2026-10-01T04:00:00.000Z", "2026-10-20T04:00:00.000Z"]);
  eq(w("last month")?.slice(0, 2), ["2026-09-01T04:00:00.000Z", "2026-10-01T04:00:00.000Z"]);
  eq(w("in the last 30 days")?.[0], "2026-09-20T04:00:00.000Z");
  eq(w("yesterday", Date.parse("2026-10-19T02:00:00Z"), "America/Los_Angeles")?.[2], "yesterday (2026-10-17)", "it is still the 18th in Los Angeles");
  eq(w("in October", T, "Asia/Tokyo")?.[0], "2026-09-30T15:00:00.000Z");
  eq(w("someday"), null);
  eq(w("in octember"), null);
  eq(dayIn("2026-10-19T02:00:00Z", "America/Chicago"), "2026-10-18");
});

const PAST: CareerEvent[] = [
  ev("2026-09-20T14:00:00Z", "outreach_sent", "Ari Cohen", { company: "Goldman Sachs", role: "Banker" }),
  ev("2026-10-03T14:00:00Z", "outreach_sent", "Dana Lee", { company: "JPMorgan Chase", role: "Banker" }),
  ev("2026-10-06T14:00:00Z", "outreach_drafted", "Priya Shah", { company: "Morgan Stanley", role: "Recruiter" }),
  ev("2026-10-09T14:00:00Z", "intro_made", "Sam Ortiz", { company: "JPMorgan Chase", role: "Associate" }),
  ev("2026-10-14T14:00:00Z", "application_finished", "Stripe", { state: "confirmed" }, "receipt"),
];

Deno.test("WO-027/R1 recall: 'which bankers did I email in October?', 'who did you introduce me to at JPM?', newest first with dates", async () => {
  const events = memoryEventStore(PAST);
  const t = byName(careerTools({ postings: async () => [], events, tz: "America/New_York" }));
  const bankers: any = await t.recall.run({ kinds: ["outreach_sent"], subject: "bankers", when: "in October" }, ctx());
  eq([bankers.window, bankers.count, bankers.events.map((e: any) => [e.date, e.subject, e.detail.company])], ["October 2026", 1, [["2026-10-03", "Dana Lee", "JPMorgan Chase"]]], "September's banker is outside the month");
  const intro: any = await t.recall.run({ kinds: ["intro_made", "intro_proposed"], subject: "JPM" }, ctx());
  eq([intro.window, intro.events.map((e: any) => e.subject)], ["all time", ["Sam Ortiz"]]);
  const all: any = await t.recall.run({ subject: "jpmorgan" }, ctx());
  eq(all.events.map((e: any) => e.subject), ["Sam Ortiz", "Dana Lee"], "newest first");
  const one: any = await t.recall.run({ limit: 1 }, ctx());
  eq(one.events.map((e: any) => e.subject), ["Stripe"]);
  const later: any = await t.recall.run({ when: "last week" }, ctx());
  eq(later.events.map((e: any) => e.subject), ["Stripe"]);
  const odd: any = await t.recall.run({ when: "a while back" }, ctx());
  assert(odd.count === 0 && /could not read the time "a while back"/.test(odd.note), "a time it cannot read is said, not guessed");
  let err = "";
  try { await t.recall.run({ kinds: ["emails"] }, ctx()); } catch (e) { err = (e as Error).message; }
  assert(/unknown kinds emails/.test(err), err);
  const none: any = await byName(careerTools({ postings: async () => [], events: memoryEventStore() })).recall.run({ kinds: ["outreach_sent"], when: "in October" }, ctx());
  eq([none.count, none.ask], [0, missingIntegration("email")], "no emails on record: one line that asks, with the Gmail link");
  const off: any = await byName(careerTools({ postings: async () => [] })).recall.run({}, ctx());
  assert(off.count === 0 && /not kept here; say so, never guess/.test(off.note), "no timeline: said, never an error");
  const failing: any = byName(careerTools({ postings: async () => [], events: brokenStore() })).recall;
  err = "";
  try { await failing.run({}, ctx()); } catch (e) { err = (e as Error).message; }
  assert(/database unreachable/.test(err), "a read that fails is the tool's error for the model to say, never an empty answer");
});

Deno.test("WO-027/D1 the degrade line: one short line that asks, then the Gmail link alone; LinkedIn is public data and one ask", () => {
  const [lead, link, ...rest] = missingIntegration("email").split("\n\n");
  eq([lead, link, rest.length], [EMAIL_LEAD, "https://upmore-srikanthvishnu90-sketchs-projects.vercel.app/connect/gmail", 0]);
  assert(/^I can't see your email\. Forward or paste it here, or connect Gmail - here's the link\.$/.test(lead));
  assert(/only public information/.test(missingIntegration("linkedin")) && !missingIntegration("linkedin").includes("\n"));
  assert(!/[*#`]/.test(missingIntegration("email") + missingIntegration("linkedin")), "plain text-message words");
});

Deno.test("WO-027/B5 the summary is written in code from what happened: counts and names with dates, never the person's words", () => {
  const events = [
    ...PAST,
    ev("2026-10-02T14:00:00Z", "search", "data analyst chicago", { results: 4 }),
    ev("2026-10-05T14:00:00Z", "search", "sql analyst remote", { results: 0 }),
    ev("2026-10-03T15:00:00Z", "alert_set", "data analyst", {}),
    ev("2026-10-05T15:00:00Z", "alert_changed", "data analyst", {}),
    ev("2026-10-01T15:00:00Z", "instruction_kept", "Needs visa sponsorship", { id: "S-001", said: "ugh i literally need sponsorship lol" }),
    ev("2026-10-10T15:00:00Z", "application_approved", "Ramp", { result: "queued" }, "card"),
    ev("2026-10-10T15:00:00Z", "status_change", "Plaid", { result: "declined" }, "card"),
    ev("2026-10-04T15:00:00Z", "fact_confirmed", "2 years as a data analyst", { id: "F-001" }),
  ];
  const s = threadSummary(events, T, "America/New_York");
  assert(s.startsWith("EARLIER IN THIS CONVERSATION.") && /not from the person's words/.test(s), s);
  assert(s.includes('- Searches: 2, latest "sql analyst remote" (Oct 5), "data analyst chicago" (Oct 2).'), s);
  assert(s.includes("- Job alerts: set Oct 3 (data analyst); changed Oct 5 (data analyst)."), s);
  assert(s.includes("- Standing instructions: kept 1 (Needs visa sponsorship)."), s);
  assert(s.includes("- Facts confirmed: 1, latest Oct 4."), s);
  assert(s.includes("- Cards answered, approved: 1 (Ramp), latest Oct 10."), s);
  assert(s.includes("- Cards answered, not sent: 1 (Plaid)."), s);
  assert(s.includes("- Applications finished: Stripe confirmed (Oct 14)."), s);
  assert(s.includes("- Outreach sent: 2 (Ari Cohen, Dana Lee)."), s);
  assert(s.includes("- Intros made: 1 (Sam Ortiz)."), s);
  assert(!s.includes("literally") && !s.includes("lol"), "the person's own words are never in it");
  assert(s.length <= 1600 && !/[*#`]/.test(s));
  eq(threadSummary([], T).split("\n")[1], "- Nothing else is on record.");
  const many = Array.from({ length: 300 }, (_, i) => ev(new Date(T - i * 3600000).toISOString(), "note", `note number ${i} with words`));
  assert(threadSummary(many, T).length <= 1600, "bounded");
  assert(threadSummary([ev("2025-12-30T15:00:00Z", "search", "nurse", {})], T).includes("(Dec 30, 2025)"), "another year is said");
});

Deno.test("WO-027/B5 the 40-message window: the summary goes after the person block only when the thread is longer, and an erase still cuts", async () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `message ${n - i}`, meta: {} })); // newest first
  const long = historyWindow(rows(41)), exact = historyWindow(rows(40));
  eq([long.cut, long.history.length, long.history[0].content, long.history[39].content], [true, 40, "message 2", "message 41"], "oldest first, the newest 40");
  eq([exact.cut, exact.history.length], [false, 40]);
  const erased = historyWindow([...rows(5), { role: "assistant", content: "I removed your saved career profile.", meta: { intent: "career_profile_erased" } }, ...rows(60)]);
  eq([erased.cut, erased.history.length], [false, 5], "past an erase there is nothing older to summarize");
  eq(summaryFor(false, PAST, T), null);
  eq(summaryFor(true, null, T), SUMMARY_UNREADABLE);

  const systems: string[] = [], sent: number[] = [];
  const model = async (p: any) => { systems.push(p.system); sent.push(p.messages.length); return { content: [{ type: "text", text: "Here is where things stand." }], stop_reason: "end_turn" }; };
  const known = { standing: [{ id: "S-001", text: "Needs visa sponsorship", said: "I will need visa sponsorship", at: "2026-10-01T15:00:00.000Z" }], alerts: null, pipeline: null };
  const turn = (w: ReturnType<typeof historyWindow>) => agentTurn({ message: "where are we?", history: w.history, stores: {}, userId: U, threadId: "TH", now: T, model, known,
    events: memoryEventStore(PAST), summary: summaryFor(w.cut, PAST, T, "America/New_York"), tz: "America/New_York" });
  await turn(historyWindow(rows(55)));
  const block = systems[0].indexOf("WHAT YOU KNOW ABOUT THIS PERSON"), summary = systems[0].indexOf("EARLIER IN THIS CONVERSATION.");
  assert(block > 0 && summary > block, "the summary comes after the person block");
  assert(systems[0].includes("- Outreach sent: 2 (Ari Cohen, Dana Lee)."), systems[0]);
  eq(sent[0], 41, "40 messages and this one");
  await turn(historyWindow(rows(12)));
  assert(!systems[1].includes("EARLIER IN THIS CONVERSATION"), "a short thread gets no summary");
  eq(sent[1], 13);
});

Deno.test("WO-027/H the handler reads 41 rows, keeps the erase cut, adds the summary only when cut, and gives the turn the timeline", () => {
  assert(HANDLER.includes('.order("id", { ascending: false }).limit(HISTORY_WINDOW + 1);'), "one more row than the window");
  assert(HANDLER.includes("const win = historyWindow((hist.data || []) as any[]), history = win.history;"));
  assert(/const recent = win\.cut \? await events\.recall\(user\.id, \{ limit: 200 \}\)\.catch\(/.test(HANDLER), "the timeline is read only when the window cut the thread, and a failed read is said, never thrown");
  assert(HANDLER.includes("const summary = summaryFor(win.cut, recent, now, tz);"));
  const at = HANDLER.indexOf("const turn = await agentTurn(");
  assert(HANDLER.indexOf("events, tz, summary,", at) > at && HANDLER.indexOf("events, tz, summary,", at) < HANDLER.indexOf("known: {", at), "the turn gets the timeline, the zone and the summary");
  assert(HANDLER.includes("store: supabaseCardStore(admin), events })"), "card answers are written to the timeline");
});

Deno.test("WO-027/X the erase migration is the stated-facts commit with exactly one line added: the person's events are deleted", () => {
  const fn = (s: string) => s.slice(s.indexOf("create or replace function public.career_host_commit("));
  const added = "  delete from career_events where user_id=p_user;\n";
  assert(fn(ERASE).includes("update career_reminder_outbox set payload=null,record=null,status='cancelled',updated_at=now() where user_id=p_user;\n" + added), "inside the erase branch");
  eq(fn(ERASE).replace(added, ""), fn(STATED), "everything else byte-identical");
  assert(/references public\.profiles\(id\) on delete cascade/.test(TABLE) && /enable row level security/.test(TABLE), "cascade and row security");
});
