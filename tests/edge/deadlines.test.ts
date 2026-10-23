// A deadline is near (capability list item 39; packages/domain/99-deadlines.js through the router bundle): the hourly
// run's plan() says a dated deadline on its own, 14 and 2 days before, once by its log key, in the person's day, held in
// quiet hours, with alerts off only for the dates the person gave; the chat answers "what deadlines are coming up", "when
// are taxes due" and "when is open enrollment" from the dated file with its sources; what the person tells it is saved
// through settingsMessage as a watch the table accepts (the migration is read as a text import). Rows and facts are MOCK.
// Permission-free: JSON and text imports only.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { plan, settingsMessage, describe, mapAccounts, mapTransactions, capWatches, MAX_WATCHES } from "../../supabase/functions/_shared/proactive.ts";
import { deadlinesReply } from "../../supabase/functions/agent-chat/_shared/deadlines_answer.ts";
import { DEADLINES_JSON } from "../../supabase/functions/_shared/router_core.js";
import { accountRows, txRows } from "./lib/proactive_fixture.ts";
const SRC_MIGRATION = Deno.readTextFileSync(new URL("../../supabase/migrations/20261011060000_proactive.sql", import.meta.url));
const SRC_STANDING = Deno.readTextFileSync(new URL("../../supabase/migrations/20261012020000_standing_payments.sql", import.meta.url));
const SRC_HANDLER = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/handler.ts", import.meta.url));
import DATA from "../../packages/offers/deadlines.json" with { type: "json" };

const at = (iso: string) => Date.parse(iso);
const NY = "America/New_York";
// The settings path's own store: what settingsMessage saves is what plan() reads next hour.
const store = (settings: any = { time_zone: NY, watches: [] }) => ({ settings, async read() { return { ok: true, settings: this.settings }; }, async save(c: any) { this.settings = Object.assign({}, this.settings, c); return true; } });
const run = (settings: any, now: number, sent: any[] = [], linked = true) => plan({ accounts: linked ? mapAccounts(accountRows()) : [], transactions: linked ? mapTransactions(txRows()) : [], settings, sent }, now);
const deadlines = (p: { messages: any[] }) => p.messages.filter((m) => m.key.startsWith("deadline:"));

Deno.test("the bundle carries the dated file as it is on disk", () => {
  assertEquals(DEADLINES_JSON, DATA);
});

Deno.test("told in chat, said by the hourly run: an extension's date 3 days out, with its source and checked date, once", async () => {
  const db = store();
  const said = await settingsMessage("I filed an extension", db, at("2026-10-12T15:00:00Z"));
  assertEquals(said!.changed, true);
  assertMatch(said!.reply, /^Noted: you filed an extension for your 2025 return\. Extended 2025 returns are due Thursday, October 15, 2026; I'll tell you 14 days and 2 days before it\./);
  const p = run(db.settings, at("2026-10-12T16:00:00Z"));
  const d = deadlines(p);
  assertEquals(d.map((m) => [m.key, m.kind, m.capability_id, m.cadence, m.source, m.as_of]), [["deadline:fed-extended-2025:14", "watch", "TAX-010", true, "IRS fourth-quarter tax calendar, Publication 509 for 2026", "2026-10-12"]]);
  assertEquals(d[0].text, "Tax date: extended 2025 federal income tax returns (Form 1040) are due Thursday, October 15, 2026, 3 days from today. You told me you filed an extension. (IRS fourth-quarter tax calendar, Publication 509 for 2026, checked Oct 12, 2026)");
  assertEquals(deadlines(run(db.settings, at("2026-10-12T17:00:00Z"), [{ key: d[0].key, sent_at: at("2026-10-12T16:00:00Z"), cadence: true }])), []);
  // Two days out is the second note; with nothing linked the date is still the person's.
  assertEquals(deadlines(run(db.settings, at("2026-10-13T15:00:00Z"), [{ key: d[0].key, sent_at: 0, cadence: true }], false)).map((m) => m.key), ["deadline:fed-extended-2025:2"]);
});

Deno.test("a public date for everyone: alerts on, inside the daily budget, exempt within 2 days, held in quiet hours", () => {
  const s = { time_zone: NY, watches: [] };
  const apr1 = at("2027-04-01T15:00:00Z");
  const p = run(s, apr1, [], false);
  const d = deadlines(p);
  assertEquals(d.map((m) => [m.key, m.kind, m.cadence]), [["deadline:fed-return-2026:14", "finding", false]]);
  assertMatch(d[0].text, /^Tax date: 2026 federal income tax returns \(Form 1040\) and extension requests \(Form 4868\) are due Thursday, April 15, 2027, 14 days from today\. \(IRS Publication 509 for 2027, draft, checked Oct 12, 2026\)$/);
  // The day's unrequested note already went out: held for the budget.
  const used = run(s, apr1, [{ key: "finding:other", sent_at: apr1 - 3600000, cadence: false }], false);
  assertEquals(deadlines(used), []);
  assert(used.suppressed.some((x: any) => x.key === "deadline:fed-return-2026:14" && x.reason === "daily_budget"), JSON.stringify(used.suppressed));
  // With accounts linked, a note about the person's own money goes first (here: the fixture's rows, six months old, are
  // stale) and the date waits for tomorrow's budget.
  const linked = run(s, apr1);
  assert(linked.messages.some((m: any) => m.key.startsWith("finding:connection:")), JSON.stringify(linked.messages.map((m: any) => m.key)));
  assert(linked.suppressed.some((x: any) => x.key === "deadline:fed-return-2026:14" && x.reason === "daily_budget"));
  const near = run(s, at("2027-04-13T15:00:00Z"), [{ key: "finding:other", sent_at: at("2027-04-13T14:00:00Z"), cadence: false }]);
  assertEquals(deadlines(near).map((m) => [m.key, m.cadence]), [["deadline:fed-return-2026:2", true]]);
  // 11 p.m. in New York: quiet hours (10 p.m. to 7 a.m. by default) hold it.
  const quiet = run(s, at("2027-04-14T03:00:00Z"));
  assertEquals(deadlines(quiet), []);
  assert(quiet.suppressed.some((x: any) => x.key === "deadline:fed-return-2026:2" && x.reason === "quiet_hours"));
  // Alerts off: the public date is not said.
  const off = run({ ...s, alerts: false }, apr1);
  assertEquals(deadlines(off), []);
  assert(off.suppressed.some((x: any) => x.key === "deadline:fed-return-2026:14" && x.reason === "alerts_off"));
});

Deno.test("the FSA date only from what the person said, with alerts off too; a Saturday tax date rolled to Tuesday", async () => {
  const db = store({ time_zone: NY, watches: [], alerts: false });
  await settingsMessage("my FSA plan year ends December 31 with a grace period until March 15", db, at("2026-10-12T15:00:00Z"));
  const p = deadlines(run(db.settings, at("2027-03-13T15:00:00Z")));
  assertEquals(p.map((m) => [m.key, m.kind, m.capability_id]), [["deadline:fsa-2027-03-15:2", "watch", "SAVE-020"]]);
  assertEquals(p[0].text, "FSA: your use-it-or-lose-it date is Monday, March 15, 2027 (the grace period you told me about), 2 days from today. Your plan's terms decide what happens to money left after it. (from what you told me on Oct 12, 2026)");
  assertEquals(deadlines(run({ time_zone: NY, watches: [] }, at("2027-03-13T15:00:00Z"))), [], "no FSA is assumed");
  const est = store();
  await settingsMessage("I pay estimated taxes", est, at("2027-12-01T15:00:00Z"));
  const jan = deadlines(run(est.settings, at("2028-01-04T15:00:00Z")));
  assertEquals(jan.map((m) => m.key), ["deadline:fed-est-2027-q4:14"]);
  assertMatch(jan[0].text, /is due Tuesday, January 18, 2028, moved from Saturday, January 15 \(a weekend, then Martin Luther King Jr\. Day on Monday, January 17\), 14 days from today\./);
});

Deno.test("what the chat saves passes the table's checks, keeps budgets and facts when watches are capped, and shows in \"show my alerts\"", async () => {
  const db = store();
  for (const m of ["i'm on medicare", "I pay estimated taxes", "my open enrollment at work is November 2 to November 13", "my fsa plan year ends 12/31/2026"]) assertEquals((await settingsMessage(m, db, at("2026-10-12T15:00:00Z")))!.changed, true, m);
  const w = db.settings.watches;
  assertEquals(w.map((x: any) => x.fact).sort(), ["estimated_tax", "fsa", "medicare", "work_oe"]);
  assert(!/\d{9,}/.test(JSON.stringify(w)), "the table refuses a run of 9 or more digits in watches");
  assert(SRC_MIGRATION.includes("check (watches::text !~ '\\d{9,}'"), "the check this mirrors is still the table's");
  assert(/kind in \([^)]*'watch'[^)]*'finding'/.test(SRC_STANDING), "deadline notes log as kinds the log table accepts");
  const plain = Array.from({ length: MAX_WATCHES }, (_, i) => ({ id: `w${i}`, kind: "amount_over", threshold_cents: 1000 + i, status: "active" }));
  const capped = capWatches(plain.concat(w));
  assertEquals(capped.length, MAX_WATCHES);
  assertEquals(capped.filter((x: any) => x.kind === "deadline_fact").length, 4, "facts are never pushed out");
  assertMatch(describe(db.settings), /Deadlines you told me about: you pay estimated tax; you're on Medicare; your FSA use-it-or-lose-it date is Dec 31, 2026; open enrollment at work closes Nov 13, 2026 \(I tell you 14 days and 2 days before\)\./);
  assert(!/You asked me to watch/.test(describe(db.settings)), "facts are not listed as charge watches");
  const gone = await settingsMessage("forget my fsa deadline", db, at("2026-10-12T16:00:00Z"));
  assertEquals(gone!.reply, "Done: I've forgotten your FSA dates. Public dates that apply to everyone still come with your alerts.");
  assertEquals(db.settings.watches.map((x: any) => x.fact).sort(), ["estimated_tax", "medicare", "work_oe"]);
});

Deno.test("chat: \"what deadlines are coming up\", \"when are taxes due\", \"when is open enrollment\", dates and sources only", async () => {
  const now = new Date("2026-10-12T15:00:00Z");
  const all = (await deadlinesReply("what deadlines are coming up", now, { tz: NY, watches: async () => [] }))!;
  assertEquals(all.split("\n")[0], "Deadlines coming up (today is Monday, October 12, 2026, New York time):");
  assertEquals(all.split("\n")[1], "- Thursday, October 15, 2026 (in 3 days): extended 2025 federal income tax returns (Form 1040) are due, if you requested an extension.");
  assertMatch(all, /\nClass-action claim dates aren't here: I don't have a verified settlement list yet\.\n/);
  assertMatch(all, /\nSources, checked Oct 12, 2026: [^\n]+\.$/);
  assert(!/\byou should\b|\brecommend\b/i.test(all));
  const tax = (await deadlinesReply("when are taxes due", now, { tz: NY }))!;
  assertMatch(tax, /\n- Thursday, April 15, 2027 \(in 185 days\): 2026 federal income tax returns \(Form 1040\) and extension requests \(Form 4868\) are due\.\n/);
  assertMatch(tax, /\nA tax date that lands on a weekend or a legal holiday moves to the next business day\. State dates can differ, and the IRS can postpone dates for disaster areas\.\n/);
  const oe = (await deadlinesReply("when is open enrollment", now, { tz: NY, watches: () => [{ kind: "deadline_fact", fact: "work_oe", opens: "2026-11-02", closes: "2026-11-13", created_on: "2026-10-12", status: "active" }] }))!;
  assertEquals(oe.split("\n").slice(1, 4), [
    "- Friday, November 13, 2026 (in 32 days): open enrollment at work closes (it opens Monday, November 2, 2026), as you told me on Oct 12, 2026.",
    "- Monday, December 7, 2026 (in 56 days): Medicare Open Enrollment for 2027 coverage ends (it opens Thursday, October 15, 2026), for people with Medicare.",
    "- Tuesday, December 15, 2026 (in 64 days): the last day to enroll in or change a HealthCare.gov plan for coverage starting January 1, 2027 (open enrollment opens Sunday, November 1, 2026), if you buy coverage there.",
  ]);
  // The person's day: 11:30 p.m. in Los Angeles is still Oct 12 there.
  assertMatch((await deadlinesReply("when are taxes due", new Date("2026-10-13T06:30:00Z"), { tz: "America/Los_Angeles" }))!, /^Federal tax dates ahead \(today is Monday, October 12, 2026, Los Angeles time\):\n- Thursday, October 15, 2026 \(in 3 days\)/);
  // Not a deadline ask: nothing is read.
  let reads = 0;
  assertEquals(await deadlinesReply("what bills are coming up", now, { tz: NY, watches: () => { reads++; return []; } }), null);
  assertEquals(reads, 0);
});

Deno.test("the handler runs the deadline answer in its direct chain, with the person's zone and their settings row's facts", () => {
  assert(SRC_HANDLER.includes('import { deadlinesReply } from "./_shared/deadlines_answer.ts";'));
  const line = SRC_HANDLER.indexOf("if (!direct) direct = await deadlinesReply(message, new Date(), { tz, watches: () => (!tzRead.error && tzRead.data && Array.isArray(tzRead.data.watches) ? tzRead.data.watches : []) });");
  assert(line > SRC_HANDLER.indexOf("const tzRead = await supabase.from(\"agent_proactive_settings\")"), "after the settings row is read");
  assert(line < SRC_HANDLER.indexOf("} catch { direct = MONEY_UNAVAILABLE; }"), "inside the direct chain's try");
  assert(line < SRC_HANDLER.indexOf("const s = await settingsMessage(message, supabaseSettingsDb(supabase, user.id), Date.now());"), "before the settings commands, which own the person's statements");
});
