// A job watch set by text reaches the scheduled alerts run (career-proactive), with what the person said and no more.
//
// The chat router keeps a watch in its own record (152's watch profile in the account's watch state,
// career_watch_kv). The scheduled run reads only career_alert_prefs, which only the held agent brain's tools wrote
// (AGENT_BRAIN_RELEASED=false). syncWatchAlerts (career_watch_alerts.ts) is the bridge the handler calls after a saved
// turn: the watch the turn left becomes the person's alert settings. Each case runs the real router turn, the bridge and
// the real alerts run (runAlerts) with a fake board, and reads the outbox:
//   1 a watch set by text alerts a new matching posting, and nothing else (the role's blockers, the city, remote)
//   2 two watches keep their own cities: never one watch's role in the other's city
//   3 a watch for one firm alerts that firm only; an internship watch never alerts a title of another level
//   4 pause stops every alert, resume brings them back; stop watching the last role turns alerts off
//   5 a turn that changes no watch writes nothing; settings the person set elsewhere are not overwritten
//   6 forget my career profile removes the alert settings, not only the alerts
//   7 a change starts watching from now: postings already on the boards are never alerted; the day's counters stay
//   8 the handler calls the bridge after the turn is saved, for every turn, not inside the held brain branch
// Run: deno test -A --no-check tests/architect/watch-alerts-bridge.test.ts
import { createRequire } from "node:module";
import { syncWatchAlerts } from "../../supabase/functions/_shared/career_watch_alerts.ts";
import { memoryAlertStore, type AlertRow } from "../../supabase/functions/_shared/career_alert_store.ts";
import { runAlerts } from "../../supabase/functions/_shared/career_proactive_run.ts";

const require = createRequire(import.meta.url);
const D = (n: string) => require(`../../packages/domain/${n}`);
const { CareerHost } = require("../../supabase/functions/_shared/career_host.js");
const host = CareerHost.createCareerHost({
  CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"), CareerRouter: D("142-career-router.js"),
  CareerDoorstep: D("141-career-doorstep.js"), CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
});
const HANDLER = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/handler-career.ts", import.meta.url));

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
const eq = (a: unknown, b: unknown, m: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);

const USER = "11111111-2222-4333-8444-555555555555";
const T0 = Date.parse("2026-10-24T15:00:00Z"), HOUR = 3600000;
const PROFILE = { basics: { name: "Alex Testcase", location: "Chicago, IL" }, facts: [], constraints: {}, preferences: { locations: ["Chicago"], starredCompanies: [] } };

// One person's conversation: each say() is one saved turn, then the handler's bridge call, as the deployed handler does it.
function person(store = memoryAlertStore(), now = T0) {
  let snapshot: any = null, account: any = {};
  const results: any[] = [];
  return {
    store,
    async say(text: string, at = now) {
      const before = account;
      const ctx = host.createTurnCtx({ userId: USER, threadId: "thread-1", now: at, snapshot, profile: PROFILE, watchState: before });
      const out = host.runTurn(text, ctx);
      snapshot = host.extractSnapshot(ctx);
      account = JSON.parse(JSON.stringify(ctx.alertWatchState ?? {}));
      const r = await syncWatchAlerts({ userId: USER, before, after: account, erased: ctx._hostPatch?.erase === true, store, now: at });
      results.push(r);
      return { out, r };
    },
    results,
  };
}
const posting = (id: string, title: string, company: string, location: string, seen: number) =>
  ({ job_id: id, title, company, location, url: `https://boards.example.test/${id}`, first_seen_at: new Date(seen).toISOString(), posted_at: new Date(seen).toISOString() });
// The scheduled run at `at` over a board holding `postings`; returns the job ids alerted.
async function run(store: any, postings: any[], at: number): Promise<string[]> {
  const n = store.dump().outbox.length;
  await runAlerts({ store, outbox: store, now: at, recentPostings: async () => postings, postingsById: async () => [] });
  return store.dump().outbox.slice(n).filter((o: any) => o.kind === "alert").map((o: any) => o.key.replace(/^alert:/, ""));
}

Deno.test("1 a watch set by text alerts a new matching posting, and nothing else", async () => {
  const p = person();
  const { out } = await p.say("Watch for data analyst roles in New York");
  assert(out.intent === "career_watch_create", out.reply);
  const row = await p.store.get(USER);
  assert(row && row.prefs.on, `the watch is the person's alert settings: ${JSON.stringify(row)}`);
  const seen = T0 + HOUR;
  const got = await run(p.store, [
    posting("nyc", "Data Analyst", "Acme", "New York, NY", seen),
    posting("remote", "Data Analyst", "Acme", "Remote", seen),
    posting("senior", "Senior Data Analyst", "Acme", "New York, NY", seen),
    posting("boston", "Data Analyst", "Acme", "Boston, MA", seen),
    posting("other", "Marketing Coordinator", "Acme", "New York, NY", seen),
  ], T0 + 2 * HOUR);
  eq(got.sort(), ["nyc", "remote"], "the city and remote, never a blocked title, another city or another role");
});

Deno.test("2 two watches keep their own cities: never one watch's role in the other's city", async () => {
  const p = person();
  await p.say("Watch for data analyst roles in New York");
  await p.say("Watch for investment banking analyst roles in Chicago");
  const seen = T0 + HOUR;
  const got = await run(p.store, [
    posting("da-nyc", "Data Analyst", "Acme", "New York, NY", seen),
    posting("ib-chi", "Investment Banking Analyst", "Acme", "Chicago, IL", seen),
    posting("da-chi", "Data Analyst", "Acme", "Chicago, IL", seen),
    posting("ib-nyc", "Investment Banking Analyst", "Acme", "New York, NY", seen),
  ], T0 + 2 * HOUR);
  eq(got.sort(), ["da-nyc", "ib-chi"], "each role in its own city only");
});

Deno.test("3 a watch for one firm alerts that firm only; an internship watch never alerts a title of another level", async () => {
  const p = person();
  await p.say("Watch for investment banking analyst roles at Goldman Sachs in Chicago");
  await p.say("Watch for data analyst internships in New York");
  const seen = T0 + HOUR;
  const got = await run(p.store, [
    posting("gs", "Investment Banking Analyst", "Goldman Sachs", "Chicago, IL", seen),
    posting("ms", "Investment Banking Analyst", "Morgan Stanley", "Chicago, IL", seen),
    posting("intern", "Data Analyst Intern", "Acme", "New York, NY", seen),
    posting("lead", "Lead Data Analyst", "Acme", "New York, NY", seen),
    posting("junior", "Junior Data Analyst", "Acme", "New York, NY", seen),
  ], T0 + 2 * HOUR);
  eq(got.sort(), ["gs", "intern"], "the named firm, and the internship, only: never another level's title");
});

Deno.test("4 pause stops every alert, resume brings them back; stop watching the last role turns alerts off", async () => {
  const p = person();
  await p.say("Watch for data analyst roles in New York");
  await p.say("pause my job alerts", T0 + HOUR);
  assert((await p.store.get(USER))?.prefs.on === false, "paused: off");
  eq(await run(p.store, [posting("a", "Data Analyst", "Acme", "New York, NY", T0 + 2 * HOUR)], T0 + 3 * HOUR), [], "paused: nothing");
  await p.say("resume my job alerts", T0 + 4 * HOUR);
  eq(await run(p.store, [posting("b", "Data Analyst", "Acme", "New York, NY", T0 + 5 * HOUR)], T0 + 6 * HOUR), ["b"], "resumed");
  await p.say("stop watching data analyst roles", T0 + 7 * HOUR);
  const row = await p.store.get(USER);
  assert(row && row.prefs.on === false, `no watch left: off, ${JSON.stringify(row?.prefs)}`);
  eq(await run(p.store, [posting("c", "Data Analyst", "Acme", "New York, NY", T0 + 8 * HOUR)], T0 + 9 * HOUR), [], "no watch: nothing");
});

Deno.test("5 a turn that changes no watch writes nothing; settings the person set elsewhere are not overwritten", async () => {
  const store = memoryAlertStore();
  let saves = 0;
  const counted = { ...store, save: async (r: AlertRow) => { saves++; return store.save(r); }, remove: store.remove };
  // Alerts the person set elsewhere (the brain's tools): their own keywords and report hour.
  await store.save({ id: USER, tz: "America/Chicago", prefs: { on: true, keywords: ["product manager"], locations: ["austin"], remote_ok: false, report_hour: 9, quiet_start: 22, quiet_end: 7, max_instant_per_day: 3 },
    last_checked_at: new Date(T0).toISOString(), instant_sent_today: 0, sent_on: null, last_report_on: null, held: [] });
  const p = person(counted as any);
  await p.say("What am I watching?");
  await p.say("Tell me about investment banking");
  eq(saves, 0, "no watch changed: no write");
  eq((await store.get(USER))?.prefs.keywords, ["product manager"], "the person's own settings stand");
  // A watch the person sets by text is their latest word: it is saved, keeping their zone and report hour.
  await p.say("Watch for data analyst roles in New York");
  const row = await store.get(USER);
  assert(row && row.tz === "America/Chicago" && row.prefs.report_hour === 9, `zone and report hour kept: ${JSON.stringify(row)}`);
});

Deno.test("6 forget my career profile removes the alert settings, not only the alerts", async () => {
  const p = person();
  await p.say("Watch for data analyst roles in New York");
  assert(await p.store.get(USER), "set");
  const { out, r } = await p.say("forget my career profile", T0 + HOUR);
  assert(out.intent === "career_profile_erased", out.reply);
  eq(r.action, "removed", "the bridge removed the settings");
  eq(await p.store.get(USER), null, "the row, with the person's keywords, is gone");
});

Deno.test("7 a change starts watching from now: postings already on the boards are never alerted; the day's counters stay", async () => {
  const p = person();
  await p.say("Watch for data analyst roles in New York");
  const before = await p.store.get(USER);
  await p.store.saveCounters!(USER, { last_checked_at: before!.last_checked_at, instant_sent_today: 2, sent_on: before!.sent_on, held: ["held-1"], last_report_on: before!.last_report_on });
  await p.say("Watch for investment banking analyst roles in Chicago", T0 + 3 * HOUR);
  const row = await p.store.get(USER);
  assert(row && row.instant_sent_today === 2 && row.held?.includes("held-1"), `today's count and held kept: ${JSON.stringify(row)}`);
  eq(await run(p.store, [posting("old", "Data Analyst", "Acme", "New York, NY", T0 + 2 * HOUR)], T0 + 4 * HOUR), [], "seen before the change: never news");
});

Deno.test("8 the handler calls the bridge after the turn is saved, for every turn, not inside the held brain branch", () => {
  const commit = HANDLER.indexOf("const saved = await persistence.commit(");
  const call = HANDLER.indexOf("syncWatchAlerts(");
  assert(commit > 0 && call > commit, "syncWatchAlerts runs after persistence.commit (a refused save writes no alert settings)");
  assert(call < HANDLER.indexOf("return json(cors, saved.response, 200)"), "and before the saved reply is returned");
  const brain = HANDLER.indexOf('AGENT_BRAIN_RELEASED && chooseBrain(Deno.env) === "agent"');
  const brainEnd = HANDLER.indexOf("persistence.commit(");
  assert(!(call > brain && call < brainEnd), "not inside the brain branch");
  assert(/syncWatchAlerts\(\{[^}]*before: loaded\.watchState/.test(HANDLER), "from the watch state the turn loaded");
  assert(/syncWatchAlerts\(\{[^}]*after: ctx\.alertWatchState/.test(HANDLER), "to the one it left");
  const statement = HANDLER.slice(call, HANDLER.indexOf("flowCtx.note = null", call));
  assert(statement.includes(".catch("), "a failed alert write never fails the saved turn");
});
