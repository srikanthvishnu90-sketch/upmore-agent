// F4 / SERIAL-1521: the real alerts chain on a real Postgres 16 with the career schema, nothing faked but the provider's
// send and the job board:
//   chat       "Watch for data analyst roles in New York" through handleChat (supabase/functions/agent-chat/
//              handler-career.ts), the production handler: the router (the host, 142, 152) -> career_host_commit ->
//              syncWatchAlerts, as the handler runs them after the save;
//   the row    career_alert_prefs, the person's alert settings (prefs.on, prefs.interests), written by the bridge;
//   the reader career-proactive's handleProactive, wired as its index.ts wires it: supabaseAlertStore over
//              career_alert_prefs (THAT row, not the legacy one-account systemd reader of career_watch_kv), the watch
//              records (career_watch_kv) only to verify each row, career_quiet_users -> career_outbox;
//   delivery   deliverDue over supabaseChannelStore (career_outbox_claim, channel_target, alertWanted) -> a fake send;
//              a paused or stopped watch's queued alert is marked not sent (skipped_opt_out).
// Paths: create, change, pause and resume, stop, erase, and in flight. Grew out of the bridge branch's pending test
// (tests/architect/pending/alerts-imessage-pg.test.ts, HOLD-1450), whose turns drove the host and persistence by hand
// and were refused as service_role; here the turn is the handler's own, through the flow harness (tests/flow/handler.ts).
// The handler reads the clock through Date.now, which each turn pins to the scenario's time so "watching from now"
// and the board's first_seen_at agree. Run: deno test -A --no-check --import-map=tests/flow/supabase-npm.json
// tests/architect/alerts-chain-pg.test.ts (needs Postgres 16 binaries; as root the cluster runs as postgres).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { pgBinDir, startPg, type Pg } from "../flow/pg.ts";
import { careerHandler, type Chat, SERVICE_KEY, SUPABASE_URL, supabaseParity } from "../flow/handler.ts";
import { supabaseAlertStore } from "../../supabase/functions/_shared/career_alert_store.ts";
import { deliverDue } from "../../supabase/functions/_shared/channel.ts";
import { supabaseChannelStore } from "../../supabase/functions/_shared/channel_store.ts";
import { handleProactive } from "../../supabase/functions/career-proactive/handler.ts";

const CI = Deno.env.get("CI") === "true";
function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
const eq = (a: unknown, b: unknown, m: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
const HOUR = 3600000, SECRET = "s".repeat(40);
// The scenario runs tomorrow at 11:00 New York (15:00Z): the handler's turns are pinned to T0 and later, the board's
// postings come after each watch, and the runs at T0 + 2h .. 7h fall outside the default quiet hours (22:00 to 7:00).
// Each person watches a different role, so one person's postings never match another's watch (a remote posting matches
// every watch of its role, by design).
const _d = new Date(); const T0 = Date.UTC(_d.getUTCFullYear(), _d.getUTCMonth(), _d.getUTCDate() + 1, 15);
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const RESUME = await Deno.readTextFile(`${ROOT}/packages/career-data/fixtures/test-resume.txt`);
const PEOPLE: Record<string, string> = {};
for (let n = 1; n <= 7; n++) PEOPLE[`tok-${n}`] = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const contactOf = (n: number) => `+1555000${String(n).padStart(4, "0")}`;

let jobs = 0;
async function board(pg: Pg, title: string, company: string, location: string, seen: number) {
  const id = `greenhouse:acme:${++jobs}`, at = new Date(seen).toISOString();
  await pg.sql(`insert into public.career_postings (job_id, provider, board, company, title, location, url, posted_at, first_seen_at, last_seen_at)
    values ('${id}', 'greenhouse', 'acme', '${company}', '${title}', '${location}', 'https://boards.greenhouse.io/acme/jobs/${jobs}', '${at}', '${at}', '${at}')`);
  return id;
}
// career-proactive at `at`, wired as its index.ts wires it: the alert settings row, the watch records to verify it, quiet users.
async function scheduled(pg: Pg, admin: any, at: number) {
  const posts = async (sql: string) => JSON.parse((await pg.sql(`select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.career_postings p ${sql}`)) || "[]");
  let recorded: any = null;
  const res = await handleProactive(new Request("http://local/career-proactive", { method: "POST", headers: { "x-trainee-proactive-secret": SECRET } }), {
    env: { get: (k: string) => (k === "CAREER_PROACTIVE_SECRET" ? SECRET : undefined) }, now: () => at,
    store: () => supabaseAlertStore(admin),
    recentPostings: (since) => posts(`where closed_at is null and first_seen_at > '${since}'`),
    postingsById: (ids) => posts(`where job_id in (${ids.map((i) => `'${i}'`).join(",") || "''"})`),
    quiet: async (ids) => new Set(((await admin.rpc("career_quiet_users", { p_users: ids })).data ?? []).map((r: any) => String(r.user_id))),
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
  return recorded;
}
const outbox = async (pg: Pg, id: string) => JSON.parse((await pg.sql(`select coalesce(jsonb_agg(jsonb_build_object('key', key, 'status', status, 'error', error, 'text', text) order by id), '[]') from public.career_outbox where user_id = '${id}'`)) || "[]");
const settings = async (pg: Pg, id: string) => JSON.parse((await pg.sql(`select coalesce((select to_jsonb(a) from public.career_alert_prefs a where user_id = '${id}')::text, 'null')`)) || "null");
// trainee-deliver at `at`: the real claim and checks; the provider is a fake that records what it was given.
async function delivery(admin: any, at: number, o: { onSend?: (n: number) => Promise<void>; afterClaim?: () => Promise<void> } = {}) {
  const store: any = supabaseChannelStore(admin), sent: { contact: string; text: string }[] = [];
  if (o.afterClaim) { const due = store.due.bind(store); store.due = async (now: number, limit: number) => { const rows = await due(now, limit); await o.afterClaim!(); return rows; }; }
  const r = await deliverDue({ store, now: at, send: async (contact, bubbles) => { sent.push({ contact, text: bubbles.join("\n") }); await o.onSend?.(sent.length); return { ok: true, id: `p${sent.length}` }; } });
  await store.release();
  return { r, sent };
}

Deno.test({
  name: "F4: a watch said in chat -> the alert settings row -> the proactive reader over that row -> delivery; paused and stopped watches are marked not sent",
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
        await pg.sql(`insert into auth.users (id, email) values ('${id}', 'alerts${n}@example.test'); insert into public.profiles (id) values ('${id}');
          insert into public.career_watch_kv (user_id, key, value) values ('${id}', 'career:account', '{"epoch":0,"version":0,"paused":false}');
          insert into public.channel_contacts (contact, user_id) values ('${contactOf(n)}', '${id}');`);
      }
      handler = await careerHandler(pg, PEOPLE);
      // The stores and career-proactive use the service client the edge functions use (supabase-js over the harness's
      // PostgREST double), the same way agent-chat does.
      const admin: any = createClient(SUPABASE_URL, SERVICE_KEY);
      const person = async (n: number) => {
        const chat: Chat = handler!.chat(`tok-${n}`), id = PEOPLE[`tok-${n}`], contact = contactOf(n);
        // One turn through the production handler at the scenario's time (Date.now pinned for the turn, restored after).
        const say = async (text: string, at: number) => {
          Date.now = () => at;
          try { const r = await chat.say(text); assert(r.status === 200, `${r.status} ${r.reply}`); return r; } finally { Date.now = realNow; }
        };
        // A watch needs the person's profile on file (the router refuses one with no facts to match against): their resume, confirmed in chat.
        await say(`here is my resume:\n${RESUME}`, T0 - 120000);
        const yes = await say("yes, that's my resume", T0 - 60000);
        eq([yes.intent, yes.resultStatus], ["career_resume_ingest", "completed"], `profile on file: ${yes.reply}`);
        return { id, contact, say };
      };

      await t.step("create: the watch said in chat is the settings row the proactive reader reads; a new matching posting is texted; nothing else is", async () => {
        const p = await person(1);
        const r = await p.say("Watch for data analyst roles in New York", T0);
        eq([r.intent, r.resultStatus], ["career_watch_create", "prepared"], `the router's watch: ${r.reply}`);
        const row = await settings(pg, p.id);
        assert(row && row.prefs.on === true && row.prefs.interests?.length === 1, `the bridge wrote the person's settings through the table's own constraint: ${JSON.stringify(row)}`);
        eq(row.prefs.interests[0].keywords, ["data analyst"], "the watch's own words");
        const hit = await board(pg, "Data Analyst", "Acme", "New York, NY", T0 + HOUR);
        await board(pg, "Senior Data Analyst", "Acme", "New York, NY", T0 + HOUR);
        await board(pg, "Data Analyst", "Acme", "Boston, MA", T0 + HOUR);
        const run = await scheduled(pg, admin, T0 + 2 * HOUR);
        eq((await outbox(pg, p.id)).map((o: any) => o.key), [`alert:${hit}`], `the reader queued the match only (run ${JSON.stringify(run)})`);
        const d = await delivery(admin, T0 + 2 * HOUR);
        eq(d.sent.map((s) => s.contact), [p.contact], `texted once, to the person's contact (delivery ${JSON.stringify(d.r)}; outbox ${JSON.stringify(await outbox(pg, p.id))})`);
        assert(/Data Analyst at Acme/.test(d.sent[0].text) && /https:\/\/boards\.greenhouse\.io\/acme\/jobs\//.test(d.sent[0].text), d.sent[0].text);
        eq((await outbox(pg, p.id)).map((o: any) => o.status), ["delivered"], "recorded delivered");
      });

      await t.step("change: a second watch in another city alerts its own role there, never the first role in it", async () => {
        const p = await person(2);
        await p.say("Watch for data engineer roles in New York", T0);
        await p.say("Watch for investment banking analyst roles in Chicago", T0 + 60000);
        eq((await settings(pg, p.id)).prefs.interests.length, 2, "both watches on the row");
        const ib = await board(pg, "Investment Banking Analyst", "Acme", "Chicago, IL", T0 + HOUR);
        const daChi = await board(pg, "Data Engineer", "Acme", "Chicago, IL", T0 + HOUR);
        await scheduled(pg, admin, T0 + 2 * HOUR);
        const keys = (await outbox(pg, p.id)).map((o: any) => o.key);
        assert(keys.includes(`alert:${ib}`) && !keys.includes(`alert:${daChi}`), JSON.stringify(keys));
      });

      await t.step("pause, then resume: an alert queued before the pause is marked not sent; the run queues nothing while paused; after the resume only new postings", async () => {
        const p = await person(3);
        await p.say("Watch for financial analyst roles in Miami", T0);
        const a = await board(pg, "Financial Analyst", "Beta", "Miami, FL", T0 + HOUR);
        await scheduled(pg, admin, T0 + 2 * HOUR);
        eq((await outbox(pg, p.id)).map((o: any) => o.key), [`alert:${a}`], "queued");
        const paused = await p.say("pause my job alerts", T0 + 2 * HOUR + 60000);
        eq(paused.intent, "career_watch_manage", paused.reply);
        eq((await settings(pg, p.id)).prefs.on, false, "the row is off after the pause");
        const d = await delivery(admin, T0 + 2 * HOUR + 120000);
        eq(d.sent.filter((s) => s.contact === p.contact), [], "nothing sent after the pause");
        eq((await outbox(pg, p.id)).map((o: any) => o.status), ["skipped_opt_out"], "marked not sent");
        const b = await board(pg, "Financial Analyst", "Beta", "Miami, FL", T0 + 3 * HOUR);
        await scheduled(pg, admin, T0 + 4 * HOUR);
        eq((await outbox(pg, p.id)).length, 1, "paused: the run queues nothing");
        await p.say("resume my job alerts", T0 + 5 * HOUR);
        eq((await settings(pg, p.id)).prefs.on, true, "on again");
        const c = await board(pg, "Financial Analyst", "Gamma", "Miami, FL", T0 + 6 * HOUR);
        await scheduled(pg, admin, T0 + 7 * HOUR);
        const keys = (await outbox(pg, p.id)).map((o: any) => o.key);
        assert(keys.includes(`alert:${c}`) && !keys.includes(`alert:${b}`), `after the resume: new postings only: ${JSON.stringify(keys)}`);
        eq((await delivery(admin, T0 + 7 * HOUR)).sent.filter((s) => s.contact === p.contact).length, 1, "the new one is texted");
      });

      await t.step("stop: the last watch stopped; what was queued before it is marked not sent, nothing new is queued", async () => {
        const p = await person(4);
        await p.say("Watch for product analyst roles in Denver", T0);
        await board(pg, "Product Analyst", "Delta", "Denver, CO", T0 + HOUR);
        await scheduled(pg, admin, T0 + 2 * HOUR);
        eq((await outbox(pg, p.id)).length, 1, "queued");
        const stopped = await p.say("stop watching product analyst roles", T0 + 2 * HOUR + 60000);
        eq(stopped.intent, "career_watch_manage", stopped.reply);
        eq((await delivery(admin, T0 + 2 * HOUR + 120000)).sent.filter((s) => s.contact === p.contact), [], "nothing sent after the stop");
        eq((await outbox(pg, p.id)).map((o: any) => o.status), ["skipped_opt_out"], "marked not sent");
        await board(pg, "Product Analyst", "Delta", "Denver, CO", T0 + 3 * HOUR);
        await scheduled(pg, admin, T0 + 4 * HOUR);
        eq((await outbox(pg, p.id)).length, 1, "nothing new queued");
      });

      await t.step("erase: \"forget my career profile\"; the settings row and the watch record are gone; nothing queued before it is sent", async () => {
        const p = await person(5);
        await p.say("Watch for research analyst roles in Austin", T0);
        await board(pg, "Research Analyst", "Epsilon", "Austin, TX", T0 + HOUR);
        await scheduled(pg, admin, T0 + 2 * HOUR);
        const r = await p.say("forget my career profile", T0 + 2 * HOUR + 60000);
        eq(r.intent, "career_profile_erased", r.reply);
        eq(await pg.sql(`select count(*) from public.career_alert_prefs where user_id = '${p.id}'`), "0", "the settings row is removed");
        eq(await pg.sql(`select count(*) from public.career_watch_kv where user_id = '${p.id}' and key like 'career:watch-profile:%'`), "0", "the watch record is gone (career_host_commit's erase)");
        eq((await delivery(admin, T0 + 2 * HOUR + 120000)).sent.filter((s) => s.contact === p.contact), [], "nothing sent after the erase");
      });

      await t.step("in flight: a pause after the claim and before the check sends nothing; one during a send lets that one out and no more", async () => {
        const p = await person(6);
        await p.say("Watch for business analyst roles in Seattle", T0);
        await board(pg, "Business Analyst", "Zeta", "Seattle, WA", T0 + HOUR);
        await scheduled(pg, admin, T0 + 2 * HOUR);
        const d = await delivery(admin, T0 + 2 * HOUR + 1000, { afterClaim: async () => { await p.say("pause my job alerts", T0 + 2 * HOUR + 1500); } });
        eq(d.sent.filter((s) => s.contact === p.contact), [], "claimed before the pause: not sent");
        const q = await person(7);
        await q.say("Watch for marketing analyst roles in Portland", T0);
        await board(pg, "Marketing Analyst", "Eta", "Portland, OR", T0 + HOUR);
        await board(pg, "Marketing Analyst", "Theta", "Portland, OR", T0 + HOUR);
        await scheduled(pg, admin, T0 + 2 * HOUR);
        eq((await outbox(pg, q.id)).length, 2, "two queued");
        const e = await delivery(admin, T0 + 2 * HOUR + 2000, { onSend: async (n) => { if (n === 1) await q.say("pause my job alerts", T0 + 2 * HOUR + 2500); } });
        eq(e.sent.filter((s) => s.contact === q.contact).length, 1, "the bound: the one send in flight, nothing after it");
        eq((await outbox(pg, q.id)).map((o: any) => o.status).sort(), ["delivered", "skipped_opt_out"], "one delivered, the next not sent");
      });
    } finally {
      Date.now = realNow;
      handler?.restore();
      await pg.stop();
    }
  },
});
