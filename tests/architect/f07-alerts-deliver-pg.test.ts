// F7 (2026-10-25): job alerts that arrive, end to end on a real Postgres 16 with the career schema. Nothing is faked but
// the job board's rows and the texting provider's send:
//   chat       "Watch for data analyst roles in New York" through handleChat (agent-chat/handler-career.ts), the
//              production handler, after the person's resume is on file and confirmed;
//   the row    career_alert_prefs written by the alerts bridge (career_watch_alerts.ts), with the person's own caps and
//              quiet hours (set on the row as the settings tool would; no chat phrase sets them yet);
//   planner    career-proactive's handleProactive, wired as its index.ts wires it: supabaseAlertStore, the postings through
//              supabasePostingsDb (newSince, the list without descriptions; getMany, whole), the watch records,
//              career_quiet_users. F7: ranked by fit (career_alert_fit.ts, search's fitOf over the confirmed facts on the
//              watch record), the knockout never queued, the rest held for the report;
//   outbox     career_outbox, once per key, deliver_at at the end of quiet hours;
//   drain      trainee-deliver's handleDeliver, wired as its index.ts wires it (supabaseChannelStore, the run recorded in
//              channel_delivery_runs), with the iMessage adapter's provider send faked;
//   channel    the person's texting contact (channel_contacts) gets the text.
// What is left is the owner's: deploy career-proactive and trainee-deliver, set their secrets, and schedule both
// (docs/architect/ALERTS-GO-LIVE-PACKET-2026-10-25.md).
// Run: deno test -A --no-check --import-map=tests/flow/supabase-npm.json tests/architect/f07-alerts-deliver-pg.test.ts
// (needs Postgres 16 binaries; in CI it must run).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { pgBinDir, startPg, type Pg } from "../flow/pg.ts";
import { careerHandler, type Chat, SERVICE_KEY, SUPABASE_URL, supabaseParity } from "../flow/handler.ts";
import { supabaseAlertStore } from "../../supabase/functions/_shared/career_alert_store.ts";
import { supabasePostingsDb } from "../../supabase/functions/_shared/career_ingest.ts";
import { supabaseChannelStore } from "../../supabase/functions/_shared/channel_store.ts";
import { handleProactive } from "../../supabase/functions/career-proactive/handler.ts";
import { handleDeliver } from "../../supabase/functions/trainee-deliver/handler.ts";

const CI = Deno.env.get("CI") === "true";
function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
const eq = (a: unknown, b: unknown, m: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
const HOUR = 3600000, P_SECRET = "p".repeat(40), D_SECRET = "d".repeat(40);
// Tomorrow 11:00 New York (15:00Z, or 16:00Z in winter: the steps read the person's clock, never assume it).
const _d = new Date(); const T0 = Date.UTC(_d.getUTCFullYear(), _d.getUTCMonth(), _d.getUTCDate() + 1, 15);
const nyHour = (at: number) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(new Date(at))) % 24;
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const RESUME = await Deno.readTextFile(`${ROOT}/packages/career-data/fixtures/test-resume.txt`);
const PEOPLE: Record<string, string> = {};
for (let n = 1; n <= 3; n++) PEOPLE[`tok-${n}`] = `00000000-0000-4000-8000-0000000007${String(n).padStart(2, "0")}`;
const contactOf = (n: number) => `+1555007${String(n).padStart(4, "0")}`;

let jobs = 0;
const q = (s: string) => s.replace(/'/g, "''");
async function board(pg: Pg, o: { title: string; company: string; location: string; description: string; seen: number }) {
  const id = `greenhouse:f7:${++jobs}`, at = new Date(o.seen).toISOString();
  await pg.sql(`insert into public.career_postings (job_id, provider, board, company, title, location, url, description, posted_at, first_seen_at, last_seen_at)
    values ('${id}', 'greenhouse', 'f7', '${q(o.company)}', '${q(o.title)}', '${q(o.location)}', 'https://boards.greenhouse.io/f7/jobs/${jobs}', '${q(o.description)}', '${at}', '${at}', '${at}')`);
  return id;
}
const STRONG = "You will build reporting dashboards in Python and React on PostgreSQL, automate data pulls, and model results in Excel.";
const WEAK = "Weekly status notes for the operations team.";
const KNOCKOUT = "Python and PostgreSQL reporting for a federal program. Requires an active TS/SCI security clearance.";

// career-proactive at `at`, wired as its index.ts wires it.
async function proactive(admin: any, at: number) {
  const postings = supabasePostingsDb(admin);
  let recorded: any = null;
  const res = await handleProactive(new Request("http://local/career-proactive", { method: "POST", headers: { "x-trainee-proactive-secret": P_SECRET } }), {
    env: { get: (k: string) => (k === "CAREER_PROACTIVE_SECRET" ? P_SECRET : undefined) }, now: () => at,
    store: () => supabaseAlertStore(admin),
    recentPostings: (since) => postings.newSince(since), postingsById: (ids) => postings.getMany(ids),
    quiet: async (ids) => {
      const { data, error } = await admin.rpc("career_quiet_users", { p_users: ids });
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((r: any) => String(r.user_id)));
    },
    watches: async (ids) => {
      const out = new Map<string, unknown>();
      const { data, error } = await admin.from("career_watch_kv").select("user_id,value").in("user_id", ids).in("key", ids.map((u) => `career:watch-profile:${u}`));
      if (error) throw new Error(error.message);
      for (const r of data ?? []) out.set(String(r.user_id), r.value);
      return out;
    },
    recordRun: async (r) => { recorded = r; },
  });
  assert(res.status === 200, `career-proactive answered ${res.status}: ${await res.text()}`);
  assert(!recorded?.error, `career-proactive run error: ${JSON.stringify(recorded)}`);
  return recorded;
}
// trainee-deliver at `at`, wired as its index.ts wires it; the iMessage provider's send is the one fake.
async function deliver(admin: any, at: number) {
  const sent: { contact: string; text: string }[] = [];
  const env: Record<string, string> = { TRAINEE_DELIVER_SECRET: D_SECRET, LOOPMESSAGE_API_KEY: "fake-loop-key" };
  const res = await handleDeliver(new Request("http://local/trainee-deliver", { method: "POST", headers: { "x-trainee-deliver-secret": D_SECRET } }), {
    env: { get: (k: string) => env[k] }, now: () => at, store: () => supabaseChannelStore(admin),
    send: (apiKey) => async (contact, bubbles) => { assert(apiKey === "fake-loop-key", "the provider gets the configured key"); sent.push({ contact, text: bubbles.join("\n") }); return { ok: true, id: `loop-${sent.length}` }; },
    adapters: () => ({}),
    recordRun: async (r) => {
      const { error } = await admin.from("channel_delivery_runs").insert({ run_at: r.at, delivered: r.delivered, failed: r.failed, retried: r.retried, skipped_opt_out: r.skipped_opt_out,
        capped: r.capped, swept: r.swept, ms: r.ms, error: r.error, held: r.held ?? 0, nudged: r.nudged ?? 0, not_wired: r.not_wired ?? 0 });
      if (error) throw new Error(`record run: ${error.message}`);
    },
  });
  const body = await res.json();
  assert(res.status === 200, `trainee-deliver answered ${res.status}: ${JSON.stringify(body)}`);
  return { run: body, sent };
}
const outbox = async (pg: Pg, id: string) => JSON.parse((await pg.sql(`select coalesce(jsonb_agg(jsonb_build_object('key', key, 'kind', kind, 'status', status, 'at', deliver_at) order by id), '[]') from public.career_outbox where user_id = '${id}'`)) || "[]");
const row = async (pg: Pg, id: string) => JSON.parse((await pg.sql(`select coalesce((select to_jsonb(a) from public.career_alert_prefs a where user_id = '${id}')::text, 'null')`)) || "null");

Deno.test({
  name: "F7: a watch said in chat -> ranked by fit, floored, capped, quiet hours -> career_outbox -> trainee-deliver -> the person's texting contact",
  sanitizeResources: false, sanitizeOps: false,
  async fn(t) {
    if (!pgBinDir()) { if (CI) throw Error("needs Postgres 16 binaries in CI"); console.log("NOT_RUN locally: no Postgres binaries"); return; }
    const pg = await startPg();
    let handler: Awaited<ReturnType<typeof careerHandler>> | null = null;
    const realNow = Date.now;
    try {
      await supabaseParity(pg);
      for (const [tok, id] of Object.entries(PEOPLE)) {
        const n = Number(tok.split("-")[1]);
        await pg.sql(`insert into auth.users (id, email) values ('${id}', 'f7-${n}@example.test'); insert into public.profiles (id) values ('${id}');
          insert into public.career_watch_kv (user_id, key, value) values ('${id}', 'career:account', '{"epoch":0,"version":0,"paused":false}');
          insert into public.channel_contacts (contact, user_id) values ('${contactOf(n)}', '${id}');`);
      }
      handler = await careerHandler(pg, PEOPLE);
      const admin: any = createClient(SUPABASE_URL, SERVICE_KEY);
      const person = async (n: number, watch: string) => {
        const chat: Chat = handler!.chat(`tok-${n}`), id = PEOPLE[`tok-${n}`];
        const say = async (text: string, at: number) => {
          Date.now = () => at;
          try { const r = await chat.say(text); assert(r.status === 200, `${r.status} ${r.reply}`); return r; } finally { Date.now = realNow; }
        };
        await say(`here is my resume:\n${RESUME}`, T0 - 120000);
        const yes = await say("yes, that's my resume", T0 - 60000);
        eq([yes.intent, yes.resultStatus], ["career_resume_ingest", "completed"], `profile on file: ${yes.reply}`);
        const w = await say(watch, T0);
        eq([w.intent, w.resultStatus], ["career_watch_create", "prepared"], `the router's watch: ${w.reply}`);
        const r = await row(pg, id);
        assert(r?.prefs?.on === true && r.prefs.interests?.length === 1, `the bridge wrote the settings row: ${JSON.stringify(r)}`);
        return { id, contact: contactOf(n), say };
      };

      await t.step("fit: the person's one alert today is the posting their confirmed facts fit best; the weaker one is held for the report; the clearance knockout is never queued; trainee-deliver texts it", async () => {
        const p = await person(1, "Watch for data analyst roles in New York");
        const rec = JSON.parse(await pg.sql(`select value::text from public.career_watch_kv where key = 'career:watch-profile:${p.id}'`));
        assert(Array.isArray(rec?.scoring_profile?.skills) && rec.scoring_profile.skills.some((s: any) => /python/i.test(s.name)), `the watch record carries the confirmed facts: ${JSON.stringify(rec?.scoring_profile)}`);
        // The person's own cap: one instant alert a day (the settings tool's field; the bridge keeps it on later turns).
        await pg.sql(`update public.career_alert_prefs set prefs = prefs || '{"max_instant_per_day":1}' where user_id = '${p.id}'`);
        // The freshest posting is the weakest fit and the knockout is fresher still: freshest-first would have texted one of them.
        const strong = await board(pg, { title: "Data Analyst", company: "Northwind", location: "New York, NY", description: STRONG, seen: T0 + HOUR });
        const weak = await board(pg, { title: "Data Analyst", company: "Contoso", location: "New York, NY", description: WEAK, seen: T0 + HOUR + 60000 });
        const knockout = await board(pg, { title: "Data Analyst", company: "Fabrikam", location: "New York, NY", description: KNOCKOUT, seen: T0 + HOUR + 120000 });
        const run = await proactive(admin, T0 + 2 * HOUR);
        assert((run.fit_scored ?? 0) >= 3, `the run scored the matches: ${JSON.stringify(run)}`);
        eq((await outbox(pg, p.id)).map((o: any) => o.key), [`alert:${strong}`], `one alert, the best fit (run ${JSON.stringify(run)})`);
        const r = await row(pg, p.id);
        eq(r.held, [weak], "the weaker fit is held for the daily report; the knockout is not");
        const d = await deliver(admin, T0 + 2 * HOUR);
        eq(d.sent.map((s) => s.contact), [p.contact], `texted once, to the person's contact (run ${JSON.stringify(d.run)})`);
        assert(/Data Analyst at Northwind/.test(d.sent[0].text) && /https:\/\/boards\.greenhouse\.io\/f7\/jobs\//.test(d.sent[0].text), d.sent[0].text);
        eq((await outbox(pg, p.id)).map((o: any) => o.status), ["delivered"], "recorded delivered");
        const runs = JSON.parse(await pg.sql(`select coalesce(jsonb_agg(jsonb_build_object('delivered', delivered, 'error', error) order by id), '[]') from public.channel_delivery_runs`));
        assert(runs.some((x: any) => x.delivered === 1 && x.error === null), `the delivery run is recorded: ${JSON.stringify(runs)}`);
        // The next day's report, at the person's report hour: the held posting, never the knockout; drained the same way.
        let at = T0 + 24 * HOUR; while (nyHour(at) !== 8) at += HOUR;
        await proactive(admin, at);
        const report = (await outbox(pg, p.id)).filter((o: any) => o.kind === "report");
        eq(report.length, 1, "one daily report");
        const dr = await deliver(admin, at);
        eq(dr.sent.length, 1, `the report is texted (run ${JSON.stringify(dr.run)})`);
        assert(dr.sent[0].text.includes("Contoso") && !dr.sent[0].text.includes("Fabrikam"), `the report carries the held posting, never the knockout: ${dr.sent[0].text}`);
        void knockout;
      });

      await t.step("quiet hours: an alert found inside the person's quiet hours is queued for their end and is not texted before it", async () => {
        const p = await person(2, "Watch for supply chain analyst roles in Chicago");
        const runAt = T0 + 2 * HOUR, h = nyHour(runAt);
        // Quiet from an hour before the run to two hours after it, on the person's clock.
        await pg.sql(`update public.career_alert_prefs set prefs = prefs || '{"quiet_start":${(h + 23) % 24},"quiet_end":${(h + 2) % 24}}' where user_id = '${p.id}'`);
        const hit = await board(pg, { title: "Supply Chain Analyst", company: "Litware", location: "Chicago, IL", description: STRONG, seen: T0 + HOUR });
        await proactive(admin, runAt);
        const ob = await outbox(pg, p.id);
        eq(ob.map((o: any) => o.key), [`alert:${hit}`], "queued");
        const due = Date.parse(ob[0].at);
        assert(due > runAt && nyHour(due) === (h + 2) % 24, `deliver_at is the end of quiet hours on the person's clock: ${ob[0].at}`);
        const early = await deliver(admin, runAt);
        eq(early.sent.filter((s) => s.contact === p.contact).length, 0, "nothing texted inside quiet hours");
        const late = await deliver(admin, due + 60000);
        eq(late.sent.map((s) => s.contact), [p.contact], `texted once quiet hours end (run ${JSON.stringify(late.run)})`);
      });

      await t.step("min_fit: a person who set a fit floor gets nothing under it, queued or texted", async () => {
        const p = await person(3, "Watch for financial analyst roles in Boston");
        await pg.sql(`update public.career_alert_prefs set prefs = prefs || '{"min_fit":90}' where user_id = '${p.id}'`);
        await board(pg, { title: "Financial Analyst", company: "Adatum", location: "Boston, MA", description: WEAK, seen: T0 + HOUR });
        await proactive(admin, T0 + 2 * HOUR);
        eq((await outbox(pg, p.id)).map((o: any) => o.key), [], "under the person's min_fit: not queued");
        const d = await deliver(admin, T0 + 2 * HOUR);
        eq(d.sent.filter((s) => s.contact === p.contact).length, 0, "nothing texted");
      });
    } finally {
      Date.now = realNow;
      handler?.restore();
      await pg.stop();
    }
  },
});
