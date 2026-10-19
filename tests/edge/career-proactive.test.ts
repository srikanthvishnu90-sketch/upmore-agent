// WO-007b builder tests: the scheduled alerts run end to end over memory stores (once per key across runs, the day's
// count reset at the person's midnight, held postings carried by the next report and then cleared, watching starting
// now), the three chat tools, the function's door, and the Supabase outbox mapping a duplicate key to "already queued".
// Run: deno test --no-check tests/edge/career-proactive.test.ts
import { memoryAlertStore, startWatching, supabaseAlertStore, validPrefs } from "../../supabase/functions/_shared/career_alert_store.ts";
import { runAlerts } from "../../supabase/functions/_shared/career_proactive_run.ts";
import { DEFAULT_PREFS } from "../../supabase/functions/_shared/career_alerts.ts";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";
import { handleProactive } from "../../supabase/functions/career-proactive/handler.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
async function rejects(f: () => Promise<unknown>, re: RegExp) { try { await f(); } catch (e) { assert(re.test(String((e as Error).message)), `wrong error: ${(e as Error).message}`); return; } throw new Error("did not reject"); }
const T = Date.UTC(2026, 9, 19, 15); // 11:00 New York
const iso = (t: number) => new Date(t).toISOString();
const posting = (id: string, at: number, title = "Data Analyst") => ({ job_id: `lever:acme:${id}`, title, company: "Acme", location: "Remote - US", url: `https://jobs.lever.co/acme/${id}`, first_seen_at: iso(at), closed_at: null });
const prefs = (p: Record<string, unknown> = {}) => { const v = validPrefs({ keywords: ["data analyst"], ...p }); if (!v.ok) throw new Error(v.error); return v.prefs; };
function world() {
  const store = memoryAlertStore(), posts: any[] = [];
  const run = (now: number) => runAlerts({ store, outbox: store, now, recentPostings: async (since) => posts.filter((p) => p.first_seen_at > since), postingsById: async (ids) => posts.filter((p) => ids.includes(p.job_id)) });
  return { store, posts, run };
}

Deno.test("WO-007b/R1 two runs never queue the same alert twice; a new posting between them is the only new alert", async () => {
  const w = world();
  await w.store.save(startWatching(null, { userId: "u1", prefs: prefs(), tz: "America/New_York", now: T }));
  w.posts.push(posting("1", T + 60000));
  eq((await w.run(T + 300000)).alerts, 1);
  w.posts.push(posting("2", T + 360000));
  const s = await w.run(T + 600000);
  eq([s.alerts, s.duplicates], [1, 0]);
  eq(w.store.dump().outbox.map((o) => o.key), ["alert:lever:acme:1", "alert:lever:acme:2"]);
});

Deno.test("WO-007b/R2 the instant cap is per local day: reached today, reset after the person's midnight", async () => {
  const w = world();
  await w.store.save(startWatching(null, { userId: "u1", prefs: prefs({ max_instant_per_day: 2 }), tz: "America/New_York", now: T }));
  for (const i of [1, 2, 3]) w.posts.push(posting(String(i), T + i * 1000));
  const a = await w.run(T + 300000);
  eq([a.alerts, a.held], [2, 1]);
  w.posts.push(posting("4", T + 400000));
  eq((await w.run(T + 600000)).alerts, 0, "still the same day: the cap holds");
  const tomorrow = Date.UTC(2026, 9, 20, 4, 30); // 00:30 New York, quiet hours
  w.posts.push(posting("5", tomorrow - 60000));
  const b = await w.run(tomorrow);
  eq(b.alerts, 1, "a new local day starts the count over");
  eq(w.store.dump().outbox.at(-1)!.at, Date.UTC(2026, 9, 20, 11), "and at night it waits for 07:00");
});

Deno.test("WO-007b/R3 held postings ride the next report, and nothing is held after it", async () => {
  const w = world();
  await w.store.save(startWatching(null, { userId: "u1", prefs: prefs({ max_instant_per_day: 0 }), tz: "America/New_York", now: T }));
  w.posts.push(posting("h", T + 1000));
  eq((await w.run(T + 300000)).held, 1);
  eq((await w.store.get("u1"))!.held, ["lever:acme:h"]);
  const s = await w.run(Date.UTC(2026, 9, 20, 12, 5)); // 08:05 next day
  eq(s.reports, 1);
  const rep = w.store.dump().outbox.find((o) => o.kind === "report")!;
  assert(rep.text.includes("https://jobs.lever.co/acme/h"), rep.text);
  eq((await w.store.get("u1"))!.held, []);
});

Deno.test("WO-007b/R4 watching starts now: nothing already on the boards, and no report minutes after turning alerts on", async () => {
  const w = world();
  w.posts.push(posting("old", T - 3600000));
  await w.store.save(startWatching(null, { userId: "u1", prefs: prefs(), tz: "America/New_York", now: T }));
  const s = await w.run(T + 300000);
  eq([s.alerts, s.reports], [0, 0], "11:00 is past the 08:00 report hour: the first report is tomorrow's");
  const early = startWatching(null, { userId: "u2", prefs: prefs(), tz: "America/New_York", now: Date.UTC(2026, 9, 19, 10) }); // 06:00 NY
  eq(early.last_report_on, null, "set before the report hour: today's report still comes");
});

Deno.test("WO-007b/T1 set_job_alerts saves what the person said (validated), get reads it back, stop turns everything off", async () => {
  const store = memoryAlertStore();
  const tools = Object.fromEntries(careerTools({ postings: async () => [], alerts: store }).map((t) => [t.name, t]));
  const c = { userId: "u1", threadId: "t1", now: T, state: {} };
  const set = await tools.set_job_alerts.run({ keywords: ["Data Analyst", "data analyst"], locations: ["New York"], timezone: "America/Chicago" }, c) as any;
  eq([set.alerts.keywords, set.alerts.locations, set.alerts.timezone, set.alerts.first_report], [["data analyst"], ["new york"], "America/Chicago", "tomorrow"]);
  eq(((await tools.get_job_alerts.run({}, c)) as any).alerts.on, true);
  await rejects(() => tools.set_job_alerts.run({ keywords: [] }, c), /at least one/);
  await rejects(() => tools.set_job_alerts.run({ keywords: ["x"], max_instant_per_day: 50 }, c), /0 to 10/);
  await rejects(() => tools.set_job_alerts.run({ keywords: ["x"], timezone: "Mars/Olympus" }, c), /time zone/);
  await rejects(() => tools.set_job_alerts.run({ keywords: ["x"], report_hour: 25 }, c), /0 to 23/);
  eq(((await tools.stop_job_alerts.run({}, c)) as any).stopped, true);
  eq((await store.active()).length, 0, "one message stops everything");
  await rejects(() => careerTools({ postings: async () => [] }).find((t) => t.name === "get_job_alerts")!.run({}, c), /not configured/);
});

const SECRET = "y".repeat(40);
const env = (m: Record<string, string>) => ({ get: (k: string) => m[k] });
Deno.test("WO-007b/F1 the function: POST with a 32+ character secret only; every run, failed or not, is recorded", async () => {
  const runs: any[] = [];
  const store = memoryAlertStore();
  const deps = (over: Record<string, unknown> = {}, e: Record<string, string> = { CAREER_PROACTIVE_SECRET: SECRET }) => ({ env: env(e), store: () => store, now: () => T,
    recentPostings: async () => [], postingsById: async () => [], recordRun: async (r: any) => { runs.push(r); }, ...over });
  const post = (s?: string) => new Request("https://fn.test/career-proactive", { method: "POST", headers: s ? { "x-trainee-proactive-secret": s } : {} });
  eq((await handleProactive(new Request("https://fn.test/", { method: "GET" }), deps())).status, 405);
  eq((await handleProactive(post("short"), deps({}, { CAREER_PROACTIVE_SECRET: "short" }))).status, 503);
  eq((await handleProactive(post("wrong"), deps())).status, 401);
  eq((await handleProactive(post(SECRET), deps())).status, 200);
  await store.save(startWatching(null, { userId: "u1", prefs: prefs(), tz: "America/New_York", now: T - 600000 }));
  const failed = await handleProactive(post(SECRET), deps({ recentPostings: async () => { throw new Error("read new postings: timeout"); } }));
  eq(failed.status, 500);
  eq([runs.length, runs[1].error], [2, "read new postings: timeout"], "the failure is in the run log, not only the logs");
});

Deno.test("WO-007b/S1 the Supabase outbox: a duplicate key is 'already queued', any other error is an error", async () => {
  const mk = (error: any) => ({ from: () => ({ insert: async () => ({ data: null, error }) }) });
  eq(await supabaseAlertStore(mk(null)).enqueue("u1", { key: "alert:1", kind: "alert", text: "x", at: T }), true);
  eq(await supabaseAlertStore(mk({ code: "23505", message: "duplicate key value violates unique constraint \"career_outbox_once\"" })).enqueue("u1", { key: "alert:1", kind: "alert", text: "x", at: T }), false);
  await rejects(() => supabaseAlertStore(mk({ code: "42501", message: "permission denied" })).enqueue("u1", { key: "alert:1", kind: "alert", text: "x", at: T }), /permission denied/);
});

Deno.test("WO-007b/V1 defaults: alerts default to 3 a day, report at 8, quiet 22-7", () => {
  eq([DEFAULT_PREFS.max_instant_per_day, DEFAULT_PREFS.report_hour, DEFAULT_PREFS.quiet_start, DEFAULT_PREFS.quiet_end], [3, 8, 22, 7]);
});
