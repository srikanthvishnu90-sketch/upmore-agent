// HOLD-1450 (work in progress, not passing): career_host_load is refused as service_role here ("permission denied for table agent_threads"); the next step is the persistence call path. Kept in pending/ so the gate does not run it.
// iMessage job alerts end to end on a real Postgres 16 with the career schema (tests/flow/pg.ts): every step is the
// production code over the real tables, functions and constraints, nothing faked but the provider's send and the board.
//   a turn:     the router (the host, 142, 152) -> career_host_commit (createCareerPersistence) -> syncWatchAlerts
//               (career_alert_prefs through supabaseAlertStore), as handler-career.ts runs them
//   the run:    career-proactive's handleProactive (quiet = career_quiet_users, watches = career_watch_kv, as its
//               index.ts reads them) -> career_outbox
//   delivery:   deliverDue over supabaseChannelStore (career_outbox_claim, channel_target, alertWanted) -> a fake send
// Paths: create, change, pause, resume, stop, erase. After a pause, a stop or an erase nothing is sent; alerts queued
// before them are not sent either. In flight: a stop that lands after the row was claimed and before its check sends
// nothing; one that lands during a send lets that one message out and nothing after it (the stated bound).
// Run: deno test -A --no-check tests/architect/alerts-imessage-pg.test.ts (needs /usr/lib/postgresql/16/bin; as root
// the cluster runs as the postgres account).
import { createRequire } from "node:module";
import { pgBinDir, startPg, type Pg } from "../../flow/pg.ts";
import { restAdmin } from "../../flow/rest.ts";
import { syncWatchAlerts } from "../../../supabase/functions/_shared/career_watch_alerts.ts";
import { supabaseAlertStore } from "../../../supabase/functions/_shared/career_alert_store.ts";
import { deliverDue } from "../../../supabase/functions/_shared/channel.ts";
import { supabaseChannelStore } from "../../../supabase/functions/_shared/channel_store.ts";
import { handleProactive } from "../../../supabase/functions/career-proactive/handler.ts";

const require = createRequire(import.meta.url);
const D = (n: string) => require(`../../../packages/domain/${n}`);
const { CareerHost } = require("../../../supabase/functions/_shared/career_host.js");
const { createCareerPersistence } = require("../../../supabase/functions/_shared/career_persistence.js");
const host = CareerHost.createCareerHost({
  CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"), CareerRouter: D("142-career-router.js"),
  CareerDoorstep: D("141-career-doorstep.js"), CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
});
const CI = Deno.env.get("CI") === "true";
function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
const eq = (a: unknown, b: unknown, m: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);

const T0 = Date.parse("2026-10-24T15:00:00Z"), HOUR = 3600000, SECRET = "s".repeat(40);
const PROFILE = { basics: { name: "Alex Testcase", location: "Chicago, IL" }, facts: [], constraints: {}, preferences: { locations: ["Chicago"], starredCompanies: [] } };

// One person: account rows, an iMessage home contact; say() is one turn through the handler's own sequence.
async function person(pg: Pg, admin: any, n: number) {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, thread = crypto.randomUUID(), contact = `+1555000${String(n).padStart(4, "0")}`;
  await pg.sql(`insert into auth.users (id, email) values ('${id}', 'alerts${n}@example.test');
    insert into public.profiles (id) values ('${id}');
    insert into public.career_watch_kv (user_id, key, value) values ('${id}', 'career:account', '{"epoch":0,"version":0,"paused":false}');
    insert into public.channel_contacts (contact, user_id) values ('${contact}', '${id}');`);
  const persistence = createCareerPersistence(admin);
  let turn = 0, snapshot: any = null;
  return {
    id, contact,
    async say(text: string, at: number) {
      const turnKey = `turn-${++turn}`, requestHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${thread}:${turnKey}:${text}`)))].map((x) => x.toString(16).padStart(2, "0")).join("");
      const loaded = await persistence.load({ userId: id, threadId: thread, turnKey, requestHash });
      const ctx = host.createTurnCtx({ userId: id, threadId: thread, now: at, accountPersistence: true, snapshot: loaded.snapshot ?? snapshot, account: loaded.account, watchState: loaded.watchState, profile: PROFILE });
      const out = host.runTurn(text, ctx);
      const response = { thread_id: thread, reply: out.reply, turn_key: turnKey, reminders: [], meta: { career: true, intent: out.intent } };
      await persistence.commit({ userId: id, threadId: thread, turnKey, requestHash, revision: loaded.revision, accountVersion: loaded.accountVersion, snapshot: host.extractSnapshot(ctx), patch: ctx._hostPatch, input: text, response });
      snapshot = host.extractSnapshot(ctx);
      // The handler's call, after the commit.
      const r = await syncWatchAlerts({ userId: id, before: loaded.watchState, after: ctx.alertWatchState, erased: ctx._hostPatch?.erase === true, store: supabaseAlertStore(admin), now: at })
        .catch((e) => ({ action: "threw", error: String(e?.message ?? e) }));
      return { out, r };
    },
  };
}
let jobs = 0;
async function board(pg: Pg, title: string, company: string, location: string, seen: number) {
  const id = `greenhouse:acme:${++jobs}`, at = new Date(seen).toISOString();
  await pg.sql(`insert into public.career_postings (job_id, provider, board, company, title, location, url, posted_at, first_seen_at, last_seen_at)
    values ('${id}', 'greenhouse', 'acme', '${company}', '${title}', '${location}', 'https://boards.greenhouse.io/acme/jobs/${jobs}', '${at}', '${at}', '${at}')`);
  return id;
}
// career-proactive at `at`, wired as its index.ts wires it (alerts only: no other rail is configured).
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
// trainee-deliver at `at`: the real claim and checks; the provider is a fake that records what it was given.
async function delivery(admin: any, at: number, o: { onSend?: (n: number) => Promise<void>; afterClaim?: () => Promise<void> } = {}) {
  const store: any = supabaseChannelStore(admin), sent: { contact: string; text: string }[] = [];
  if (o.afterClaim) { const due = store.due.bind(store); store.due = async (now: number, limit: number) => { const rows = await due(now, limit); await o.afterClaim!(); return rows; }; }
  const r = await deliverDue({ store, now: at, send: async (contact, bubbles) => { sent.push({ contact, text: bubbles.join("\n") }); await o.onSend?.(sent.length); return { ok: true, id: `p${sent.length}` }; } });
  await store.release();
  return { r, sent };
}

Deno.test({
  name: "iMessage job alerts end to end on Postgres: create, change, pause, resume, stop, erase; in flight",
  sanitizeResources: false, sanitizeOps: false,
  async fn(t) {
    if (!pgBinDir()) {
      if (CI) throw Error("needs Postgres 16 binaries in CI");
      console.log("NOT_RUN locally: no Postgres binaries");
      return;
    }
    const pg = await startPg(), admin = restAdmin(pg);
    try {
      await t.step("create: a watch set by text is the person's alert settings; a new matching posting is texted to their iMessage", async () => {
        const p = await person(pg, admin, 1);
        const { out, r } = await p.say("Watch for data analyst roles in New York", T0);
        assert(out.intent === "career_watch_create" && r.action === "saved", `${out.intent} ${JSON.stringify(r)}`);
        const row = JSON.parse(await pg.sql(`select to_jsonb(a) from public.career_alert_prefs a where user_id = '${p.id}'`));
        assert(row.prefs.on === true && row.prefs.interests?.length === 1, `saved through the table's own constraint: ${JSON.stringify(row.prefs)}`);
        const hit = await board(pg, "Data Analyst", "Acme", "New York, NY", T0 + HOUR);
        await board(pg, "Senior Data Analyst", "Acme", "New York, NY", T0 + HOUR);
        await board(pg, "Data Analyst", "Acme", "Boston, MA", T0 + HOUR);
        const run = await scheduled(pg, admin, T0 + 2 * HOUR);
        eq((await outbox(pg, p.id)).map((o: any) => o.key), [`alert:${hit}`], `queued the match only (run ${JSON.stringify(run)})`);
        const d = await delivery(admin, T0 + 2 * HOUR);
        eq(d.sent.map((s) => s.contact), [p.contact], "texted once, to the person's iMessage contact");
        assert(/Data Analyst at Acme/.test(d.sent[0].text) && /https:\/\/boards\.greenhouse\.io\/acme\/jobs\//.test(d.sent[0].text), d.sent[0].text);
        eq((await outbox(pg, p.id)).map((o: any) => o.status), ["delivered"], "recorded delivered");
      });

      await t.step("change: a second watch in another city alerts its own role there, never the first role in it", async () => {
        const p = await person(pg, admin, 2);
        await p.say("Watch for data analyst roles in New York", T0);
        await p.say("Watch for investment banking analyst roles in Chicago", T0 + 60000);
        const ib = await board(pg, "Investment Banking Analyst", "Acme", "Chicago, IL", T0 + HOUR);
        const daChi = await board(pg, "Data Analyst", "Acme", "Chicago, IL", T0 + HOUR);
        await scheduled(pg, admin, T0 + 2 * HOUR);
        const keys = (await outbox(pg, p.id)).map((o: any) => o.key);
        assert(keys.includes(`alert:${ib}`) && !keys.includes(`alert:${daChi}`), JSON.stringify(keys));
      });

      await t.step("pause, then resume: an alert queued before the pause is not sent; after the resume new ones are", async () => {
        const p = await person(pg, admin, 3);
        await p.say("Watch for data analyst roles in Remote", T0);
        const a = await board(pg, "Data Analyst", "Beta", "Remote", T0 + HOUR);
        await scheduled(pg, admin, T0 + 2 * HOUR);
        eq((await outbox(pg, p.id)).map((o: any) => o.key), [`alert:${a}`], "queued");
        await p.say("pause my job alerts", T0 + 2 * HOUR + 60000);
        const d = await delivery(admin, T0 + 2 * HOUR + 120000);
        eq(d.sent.filter((s) => s.contact === p.contact), [], "nothing sent after the pause");
        eq((await outbox(pg, p.id)).map((o: any) => o.status), ["skipped_opt_out"], "marked not sent");
        const b = await board(pg, "Data Analyst", "Beta", "Remote", T0 + 3 * HOUR);
        await scheduled(pg, admin, T0 + 4 * HOUR);
        eq((await outbox(pg, p.id)).length, 1, "paused: the run queues nothing");
        await p.say("resume my job alerts", T0 + 5 * HOUR);
        const c = await board(pg, "Data Analyst", "Gamma", "Remote", T0 + 6 * HOUR);
        await scheduled(pg, admin, T0 + 7 * HOUR);
        const keys = (await outbox(pg, p.id)).map((o: any) => o.key);
        assert(keys.includes(`alert:${c}`) && !keys.includes(`alert:${b}`), `after the resume: new postings only: ${JSON.stringify(keys)}`);
        eq((await delivery(admin, T0 + 7 * HOUR)).sent.filter((s) => s.contact === p.contact).length, 1, "the new one is texted");
      });

      await t.step("stop: \"stop watching\" the last watch; nothing queued before it is sent, nothing new is queued", async () => {
        const p = await person(pg, admin, 4);
        await p.say("Watch for data analyst roles in Denver", T0);
        await board(pg, "Data Analyst", "Delta", "Denver, CO", T0 + HOUR);
        await scheduled(pg, admin, T0 + 2 * HOUR);
        eq((await outbox(pg, p.id)).length, 1, "queued");
        await p.say("stop watching data analyst roles", T0 + 2 * HOUR + 60000);
        eq((await delivery(admin, T0 + 2 * HOUR + 120000)).sent.filter((s) => s.contact === p.contact), [], "nothing sent after the stop");
        await board(pg, "Data Analyst", "Delta", "Denver, CO", T0 + 3 * HOUR);
        await scheduled(pg, admin, T0 + 4 * HOUR);
        eq((await outbox(pg, p.id)).length, 1, "nothing new queued");
      });

      await t.step("erase: \"forget my career profile\"; the settings row is gone and nothing queued before it is sent", async () => {
        const p = await person(pg, admin, 5);
        await p.say("Watch for data analyst roles in Austin", T0);
        await board(pg, "Data Analyst", "Epsilon", "Austin, TX", T0 + HOUR);
        await scheduled(pg, admin, T0 + 2 * HOUR);
        const { out, r } = await p.say("forget my career profile", T0 + 2 * HOUR + 60000);
        assert(out.intent === "career_profile_erased" && r.action === "removed", `${out.intent} ${JSON.stringify(r)}`);
        eq(await pg.sql(`select count(*) from public.career_alert_prefs where user_id = '${p.id}'`), "0", "the settings row is removed");
        eq(await pg.sql(`select count(*) from public.career_watch_kv where user_id = '${p.id}' and key like 'career:watch-profile:%'`), "0", "the watch record is gone (career_host_commit's erase)");
        eq((await delivery(admin, T0 + 2 * HOUR + 120000)).sent.filter((s) => s.contact === p.contact), [], "nothing sent after the erase");
      });

      await t.step("in flight: a stop after the claim and before the check sends nothing; one during a send lets that one out and no more", async () => {
        const p = await person(pg, admin, 6);
        await p.say("Watch for data analyst roles in Seattle", T0);
        await board(pg, "Data Analyst", "Zeta", "Seattle, WA", T0 + HOUR);
        await scheduled(pg, admin, T0 + 2 * HOUR);
        // The row is claimed (status 'sending') when the person pauses; the check after the claim stops it.
        const d = await delivery(admin, T0 + 2 * HOUR + 1000, { afterClaim: async () => { await p.say("pause my job alerts", T0 + 2 * HOUR + 1500); } });
        eq(d.sent.filter((s) => s.contact === p.contact), [], "claimed before the pause: not sent");
        const q = await person(pg, admin, 7);
        await q.say("Watch for data analyst roles in Portland", T0);
        await board(pg, "Data Analyst", "Eta", "Portland, OR", T0 + HOUR);
        await board(pg, "Data Analyst", "Theta", "Portland, OR", T0 + HOUR);
        await scheduled(pg, admin, T0 + 2 * HOUR);
        eq((await outbox(pg, q.id)).length, 2, "two queued");
        // The pause lands while the provider is sending the first: that one is out; the second is checked and held back.
        const e = await delivery(admin, T0 + 2 * HOUR + 2000, { onSend: async (n) => { if (n === 1) await q.say("pause my job alerts", T0 + 2 * HOUR + 2500); } });
        eq(e.sent.filter((s) => s.contact === q.contact).length, 1, "the bound: the one send in flight, nothing after it");
        eq((await outbox(pg, q.id)).map((o: any) => o.status).sort(), ["delivered", "skipped_opt_out"], "one delivered, the next not sent");
      });
    } finally {
      await pg.stop();
    }
  },
});
