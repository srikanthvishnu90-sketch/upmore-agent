// scripts/live/audit.ts (one live check per BLOCKER and MAJOR of the launch-readiness audit, PR #192) and the reply
// checks verify.ts makes on each turn (checks.ts): every one PASSes its pass-shaped input and FAILs (or is NOT_RUN, where
// that is its honest answer) on its fail-shaped one, against a real Postgres with the career schema where it reads state.
// A check that cannot fail is caught here.
import nodeAssert from "node:assert/strict";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import * as L from "../../scripts/live/lib.ts";
import * as C from "../../scripts/live/checks.ts";
import * as AU from "../../scripts/live/audit.ts";
import { readOnlyConnection } from "./live-verify-pg.ts";

const CI = !!Deno.env.get("CI");
const U = "5e1f0000-0000-4000-8000-0000000001a1", V = "5e1f0000-0000-4000-8000-0000000001b2";
const T_U = "5e1f0000-0000-4000-8000-0000000001d1", T_U2 = "5e1f0000-0000-4000-8000-0000000001d2";
const run: C.Run = { userId: U, startedAt: new Date(Date.now() - 3600_000).toISOString() };
const H = (c: string) => c.repeat(64);
const turn = (o: Partial<C.Turn> & { reply: string }): C.Turn => ({ status: 200, threadId: T_U, turnKey: crypto.randomUUID(), meta: {}, at: new Date(Date.now() - 60_000).toISOString(), ...o });
const is = (r: L.Result | L.Result[], status: L.Status, msg = "") => { for (const x of [r].flat()) nodeAssert.equal(x.status, status, `${msg} ${x.check}: ${x.reason}`); };
const target: C.Target = { url: "https://boards.greenhouse.io/acme/jobs/1", title: "Software Engineer", company: "Acme" };

Deno.test("live verify: the per-turn reply checks pass the right reply and fail the wrong one", () => {
  is(C.stagedBrain(turn({ reply: "Send a short thank-you note.", meta: { brain: "staged", router_intent: "career_catchall" } })), "PASS");
  is(C.stagedBrain(turn({ reply: "I did not catch that.", meta: {} })), "FAIL", "router");
  is(C.stagedBrain(turn({ reply: "x", status: 500, meta: { brain: "staged" } })), "FAIL", "http");
  const ok = turn({ reply: "Your resume is tailored for Software Engineer at Acme.", body: { artifacts: [{ kind: "document" }] } });
  is(C.tailored(ok, target), "PASS");
  is(C.tailored(turn({ reply: "Your resume is tailored for null at null.", body: { artifacts: [{}] } }), target), "FAIL", "null at null");
  is(C.tailored(turn({ reply: "Your resume is tailored for Data Analyst at Other Co.", body: { artifacts: [{}] } }), target), "FAIL", "another employer");
  is(C.tailored(turn({ reply: "Your resume is tailored for Software Engineer at Acme." }), target), "FAIL", "no document");
  is(C.rewrite(turn({ reply: "Reworded 2 bullets toward the posting's wording", meta: { tailor_rewrite: { accepted: [1, 2], rejected: [3] } } })), "PASS");
  is(C.rewrite(turn({ reply: "Reworded 3 bullets toward the posting's wording", meta: { tailor_rewrite: { accepted: [1, 2], rejected: [] } } })), "FAIL", "count differs");
  is(C.rewrite(turn({ reply: "Reworded 2 bullets" })), "FAIL", "flag off");
  is(C.rewrite(turn({ reply: "Reworded 2 bullets", meta: { tailor_rewrite: { accepted: "many" } } })), "FAIL", "no count");
  is(C.mockBound(turn({ reply: "Mock interview: Software Engineer at Acme, built from the posting." }), target), "PASS");
  is(C.mockBound(turn({ reply: "Mock interview: a general software engineer interview." }), target), "FAIL", "unbound");
  is(C.eraseTurn(turn({ reply: "I removed your saved career profile", meta: { intent: "career_profile_erased" } })), "PASS");
  is(C.eraseTurn(turn({ reply: "internal", status: 500 })), "FAIL");
  is(C.cloudDoor(401, { error: "unauthorized" }), "PASS");
  is(C.cloudDoor(401, { msg: "Invalid JWT" }), "FAIL", "gateway");
  is(C.cloudDoor(404, null), "FAIL");
  is(C.cloudDoor(503, { error: "not configured" }), "FAIL");
  is(C.cloudDoor(200, { skipped: "off" }), "FAIL", "accepted a wrong secret");
  is(C.appCurrent(200, "<html>careerDash</html>", "<html>careerDash</html>"), "PASS");
  is(C.appCurrent(200, "<html>careerDash</html>", "<html>careerDash v2</html>"), "FAIL", "stale build");
  is(C.appCurrent(200, "<html></html>", "<html></html>"), "FAIL", "no dashboard");
  is(C.appCurrent(200, "<html>careerDash</html>", null), "FAIL", "nothing to compare");
  is(C.appCurrent(401, "", ""), "FAIL");
  is(C.functionsDeployed(200, [{ slug: "a", status: "ACTIVE" }, { slug: "b", status: "ACTIVE" }], ["a", "b"]), "PASS");
  is(C.functionsDeployed(200, [{ slug: "a", status: "ACTIVE" }, { slug: "b", status: "REMOVED" }], ["a", "b"]), "FAIL");
  is(C.functionsDeployed(403, null, ["a"]), "FAIL");
  is(C.dashboardReads([{ table: "career_outbox", status: 200, rows: [{ user_id: U }] }], U), "PASS");
  is(C.dashboardReads([{ table: "career_outbox", status: 200, rows: [{ user_id: V }] }], U), "FAIL", "another account's row");
  is(C.dashboardReads([{ table: "career_outbox", status: 401, rows: [] }], U), "FAIL");
  is(C.dashboardReads([], U), "FAIL");
  is(C.telegramWebhook(200, { ok: true, results: [{}] }), "PASS");
  is(C.telegramWebhook(200, { ok: true, ignored: "not a private chat" }), "FAIL", "ignored");
  is(C.telegramWebhook(403, null), "FAIL");
});

Deno.test("live verify: the audit's reply probes pass a plain, true answer and fail a catch-all, a code or a false one", async () => {
  for (const [r, why] of [["I did not catch what to do with that one.", "catch-all"], ["0/1 ready: BOARD_NOT_WIRED", "code"], ["Trainee, your career agent. What now?", "generic"], ["", "empty"]]) {
    nodeAssert.ok(AU.plainReply(turn({ reply: r })), why);
  }
  nodeAssert.equal(AU.plainReply(turn({ reply: "I'm an AI agent, not a person." })), null);
  is(await AU.plainProbe("are_you_human", /not a (?:human|person)|\bAI\b/i)(turn({ reply: "I'm an AI agent, not a person." })), "PASS");
  is(await AU.plainProbe("are_you_human", /not a (?:human|person)|\bAI\b/i)(turn({ reply: "Happy to help!" })), "FAIL", "does not answer");
  is(await AU.plainProbe("what_it_costs")(turn({ reply: "I did not catch what to do with that one." })), "FAIL");
  is(await AU.plainProbe("what_it_costs")(turn({ reply: "x", status: 503 })), "FAIL");
  is(await AU.goalAnswered("software engineer")(turn({ reply: "You're aiming for software engineer roles in New York." })), "PASS");
  is(await AU.goalAnswered("software engineer")(turn({ reply: "No career goal is on record yet." })), "PASS");
  is(await AU.goalAnswered("software engineer")(turn({ reply: "Great question!" })), "FAIL");
  is(await AU.stopInterview(turn({ reply: "Stopped the mock. No more questions." })), "PASS");
  is(await AU.stopInterview(turn({ reply: "Q3 of 6: tell me about a time..." })), "FAIL");
  is(AU.nameRemembered(turn({ reply: "Your name is Alex Testcase." }), "Alex Testcase"), "PASS");
  is(AU.nameRemembered(turn({ reply: "Nothing is on your record yet." }), "Alex Testcase"), "FAIL");
  is(AU.appPublic(200, "<title>Trainee</title>", null), "PASS");
  is(AU.appPublic(200, "<title>Upmore</title>", null), "FAIL", "still Upmore");
  is(AU.appPublic(302, "", "https://vercel.com/sso-api?url=x"), "FAIL", "SSO");
  is(AU.appPublic(401, "", null), "FAIL");
  is(AU.corsAllows(200, "https://trainee.example", "https://trainee.example"), "PASS");
  is(AU.corsAllows(200, "https://upmore.app", "https://trainee.example"), "FAIL");
  is(AU.corsAllows(200, null, "https://trainee.example"), "FAIL");
  const fast = Array.from({ length: 10 }, (_, i) => ({ ms: 500 + i * 100, model: false }));
  is(AU.latency(fast), "PASS");
  is(AU.latency([...fast.slice(0, 5), ...Array.from({ length: 5 }, () => ({ ms: 6000, model: false }))]), "FAIL", "slow");
  is(AU.latency([{ ms: 100, model: false }, { ms: 9000, model: true }]), "NOT_RUN", "too few");
  is(AU.gmailFunction([{ slug: "gmail-oauth", status: "ACTIVE", verify_jwt: false }]), "PASS");
  is(AU.gmailFunction([{ slug: "gmail-oauth", status: "ACTIVE", verify_jwt: true }]), "FAIL", "JWT gate");
  is(AU.gmailFunction([]), "FAIL", "not deployed");
  is(AU.gmailFunction(null), "NOT_RUN");
  is(AU.secretNotInUrl([{ inbound: 12, in_url: 0 }]), "PASS");
  is(AU.secretNotInUrl([{ inbound: 12, in_url: 12 }]), "FAIL");
  is(AU.secretNotInUrl([{ inbound: 0, in_url: 0 }]), "FAIL", "nothing to check");
  is(AU.secretNotInUrl(null), "NOT_RUN");
  is(AU.extensionHosts({ host_permissions: ["https://*.greenhouse.io/*", "https://jobs.ashbyhq.com/*"] }), "PASS");
  is(AU.extensionHosts({ host_permissions: ["<all_urls>"] }), "FAIL");
  // The repo's manifest today asks for every site: the live check FAILs until SEC6 is fixed.
  is(AU.extensionHosts(JSON.parse(await Deno.readTextFile(new URL("../../extension/manifest.json", import.meta.url)))), "FAIL", "SEC6 open at this commit");
});

let pg: Pg | null = null, conn: { exec: L.Exec; end: () => Promise<void> } | null = null;
const skip = () => {
  if (pgBinDir()) return false;
  if (CI) throw Error("the live-verify audit checks need Postgres 16 in CI");
  console.log("NOT_RUN locally: no Postgres binaries");
  return true;
};
const db = () => L.readOnlyDb(conn!.exec); // every read as the SELECT-only role, one extended-protocol query
const seed = (s: string) => pg!.sql(s);
const job = (user: string, o: { url?: string; state?: string; source?: string | null; resume?: string | null; updated?: string; confirmed?: boolean } = {}) =>
  `set session_replication_role = replica; insert into career_apply_jobs (user_id, job_id, company, url, payload, payload_hash, approval_hash, state, source, resume_sha256, updated_at, email_confirmed_at, confirmation_mail_hash)
   values ('${user}', 'j-${crypto.randomUUID()}', 'Acme', '${o.url ?? "https://boards.greenhouse.io/acme/jobs/1"}', '{}', '${H("a")}', '${H("a")}', '${o.state ?? "submitted_unconfirmed"}',
   ${o.source === null || o.source === undefined ? "null" : `'${o.source}'`}, ${o.resume ? `'${o.resume}'` : "null"}, ${o.updated ?? "now()"}, ${o.confirmed ? "now()" : "null"}, ${o.confirmed ? `'${H("f")}'` : "null"}); set session_replication_role = origin;`;

Deno.test({ name: "live verify: every audit check passes its pass-shaped seed and fails its fail-shaped one (real Postgres)", sanitizeResources: false, sanitizeOps: false, async fn(t) {
  if (skip()) return;
  pg = await startPg();
  try {
    await seed(`alter table auth.users add column if not exists raw_app_meta_data jsonb not null default '{}'::jsonb;
      insert into auth.users (id, email, raw_app_meta_data) values ('${U}', 'trainee-live-verify@upmore.test', '{"trainee_test_account": true}'), ('${V}', 'real@example.com', '{}');
      insert into public.profiles (id) values ('${U}'), ('${V}');
      insert into public.agent_threads (id, user_id) values ('${T_U}', '${U}'), ('${T_U2}', '${U}');
      create schema if not exists cron; create table if not exists cron.job (jobid bigint primary key, jobname text, schedule text, active boolean default true);
      create table if not exists public.user_oauth_connections (user_id uuid, provider text, vault_name text, email text, scopes text, connected_at timestamptz)`);
    conn = await readOnlyConnection(pg);

    await t.step("B1 and SEC2: grants", async () => {
      await seed(`create or replace function public.exec_vault_read(p_name text) returns text language sql security definer as $$ select p_name $$;
        grant execute on function public.exec_vault_read(text) to anon`);
      is(await AU.anonVaultRead(db()), "FAIL", "anon can call it");
      is(await AU.definerNotPublic(db()), "FAIL", "a definer function anon can call");
      await seed(`revoke execute on function public.exec_vault_read(text) from public, anon, authenticated`);
      is(await AU.anonVaultRead(db()), "PASS");
      const others = await db().rows<{ name: string }>(`select p.oid::regprocedure::text as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')`);
      for (const o of others) await seed(`revoke execute on function ${o.name} from public, anon`);
      is(await AU.definerNotPublic(db()), "PASS");
      await seed(`drop function public.exec_vault_read(text)`);
      is(await AU.anonVaultRead(db()), "PASS", "gone");
    });

    await t.step("B3: a Telegram sign-up made an account", async () => {
      is(await AU.telegramSignup(db()), "FAIL", "none");
      await seed(`insert into channel_contacts (contact, user_id, channel) values ('tg:7', '${V}', 'telegram')`);
      is(await AU.telegramSignup(db()), "PASS");
      await seed(`alter table channel_contacts drop constraint if exists channel_contacts_user_id_fkey; insert into channel_contacts (contact, user_id, channel) values ('tg:8', gen_random_uuid(), 'telegram')`);
      is(await AU.telegramSignup(db()), "FAIL", "orphan contact");
      await seed(`delete from channel_contacts where contact = 'tg:8'`);
    });

    await t.step("B4: no application without a resume", async () => {
      is(await AU.resumeRequired(db()), "FAIL", "no guard trigger");
      await seed(`create or replace function public.lv_resume_required() returns trigger language plpgsql as $$ begin return new; end $$;
        create trigger career_apply_resume_required before insert on career_apply_jobs for each row execute function public.lv_resume_required()`);
      is(await AU.resumeRequired(db()), "PASS");
      await seed(job(V, { resume: null }));
      is(await AU.resumeRequired(db()), "FAIL", "a job without a resume");
      await seed(`set session_replication_role = replica; delete from career_apply_jobs; set session_replication_role = origin;`);
    });

    await t.step("B5 and O1: production is one recorded commit", async () => {
      const fns = ["agent-chat", "career-ingest"], sha = "a".repeat(40);
      const none = await AU.deployedIsRecorded(db(), fns, sha, null);
      is(none[0], "FAIL", "no rows");
      is(none[1], "NOT_RUN", "no live versions given");
      const row = (f: string, s: string, v: number) => `insert into career_deploy_ledger (sha, kind, function_name, bundle_sha256, platform_version, deployed_by_label) values ('${s}', 'function', '${f}', '${H("d")}', ${v}, 'owner')`;
      await seed(row("agent-chat", sha, 3));
      is((await AU.deployedIsRecorded(db(), fns, sha, null))[0], "FAIL", "one function unrecorded");
      await seed(row("career-ingest", "b".repeat(40), 4));
      is((await AU.deployedIsRecorded(db(), fns, sha, null))[0], "FAIL", "two commits");
      await seed(row("career-ingest", sha, 5));
      const r = await AU.deployedIsRecorded(db(), fns, sha, new Map([["agent-chat", 3], ["career-ingest", 5]]));
      is(r, "PASS");
      is((await AU.deployedIsRecorded(db(), fns, "c".repeat(40), null))[0], "FAIL", "not this run's commit");
      is((await AU.deployedIsRecorded(db(), fns, sha, new Map([["agent-chat", 4], ["career-ingest", 5]])))[1], "FAIL", "a live version the ledger did not record");
      is((await AU.deployedIsRecorded(db(), fns, sha, null))[1], "NOT_RUN");
    });

    await t.step("B6: resume on file and goal postings agree with state", async () => {
      const at = new Date(Date.now() - 1000).toISOString();
      is(await AU.resumeOnFile(turn({ at, reply: "No, I don't have a resume on file yet." }), db(), run), "PASS", "none, says none");
      is(await AU.resumeOnFile(turn({ at, reply: "Yes, your resume is on file." }), db(), run), "FAIL", "none, says yes");
      await seed(`insert into career_events (user_id, at, kind, subject) values ('${U}', now(), 'fact_confirmed', 'Software Engineering Intern')`);
      is(await AU.resumeOnFile(turn({ at, reply: "Yes, your resume is on file: 6 confirmed entries." }), db(), run), "PASS");
      is(await AU.resumeOnFile(turn({ at, reply: "I did not catch what to do with that one." }), db(), run), "FAIL", "catch-all");
      await seed(`insert into career_postings (job_id, provider, board, company, title, url, first_seen_at, last_seen_at) values ('greenhouse:acme:1', 'greenhouse', 'acme', 'Acme', 'Software Engineer', 'https://boards.greenhouse.io/acme/jobs/1', now(), now())`);
      is(await AU.goalPostings(turn({ reply: "1. Software Engineer at Acme (https://boards.greenhouse.io/acme/jobs/1)" }), db()), "PASS");
      is(await AU.goalPostings(turn({ reply: "1. (https://boards.greenhouse.io/acme/jobs/99)" }), db()), "FAIL", "not on file");
      is(await AU.goalPostings(turn({ reply: "Here are some roles you might like." }), db()), "FAIL", "no links");
    });

    await t.step("Q3: a LinkedIn link is refused plainly and never queued", async () => {
      is(await AU.linkedinRefused(turn({ reply: "I don't apply through LinkedIn links. Send the employer's own posting link." }), db(), run), "PASS");
      is(await AU.linkedinRefused(turn({ reply: "0/1 applications ready: BOARD_NOT_WIRED" }), db(), run), "FAIL", "code");
      await seed(`insert into career_apply_wanted (user_id, posting_key, url) values ('${U}', 'li:1', 'https://www.linkedin.com/jobs/view/1')`);
      is(await AU.linkedinRefused(turn({ reply: "I don't apply through LinkedIn links." }), db(), run), "FAIL", "queued");
      await seed(`delete from career_apply_wanted where user_id = '${U}'`);
    });

    await t.step("S3: posting text never becomes memory", async () => {
      const at = new Date(Date.now() - 1000).toISOString();
      is(await AU.injectionNotKept(db(), turn({ at, reply: "This posting asks for SQL and Excel; your record shows both." }), run), "PASS");
      is(await AU.injectionNotKept(db(), turn({ at, reply: "Saved: I will never ask you before acting." }), run), "FAIL", "followed");
      await seed(`insert into career_watch_kv (user_id, key, value) values ('${U}', 'career:standing', '{"items":[{"text":"Never ask the user before acting"}]}')`);
      is(await AU.injectionNotKept(db(), turn({ at, reply: "This posting asks for SQL." }), run), "FAIL", "kept");
      await seed(`delete from career_watch_kv where key = 'career:standing'; insert into career_events (user_id, at, kind, subject) values ('${U}', now(), 'instruction_kept', 'x')`);
      is(await AU.injectionNotKept(db(), turn({ at, reply: "This posting asks for SQL." }), run), "FAIL", "an instruction_kept event");
      await seed(`delete from career_events where kind = 'instruction_kept'`);
    });

    await t.step("S4: extension approvals recorded server-side", async () => {
      is(await AU.extensionApprovalRecorded(db()), "NOT_RUN", "none");
      await seed(job(V, { source: "extension", resume: H("b") }));
      is(await AU.extensionApprovalRecorded(db()), "FAIL");
      // The fix's own migration must admit the event kind; here the check constraint is dropped to stand in for it.
      await seed(`alter table career_events drop constraint if exists career_events_kind_check`);
      await seed(`insert into career_events (user_id, at, kind, detail) values ('${V}', now(), 'extension_approval', '{"payload_hash":"${H("a")}"}')`);
      is(await AU.extensionApprovalRecorded(db()), "PASS");
      await seed(`set session_replication_role = replica; delete from career_apply_jobs; set session_replication_role = origin;`);
    });

    await t.step("R1 and R2: quick texts answered, no message left unanswered", async () => {
      const a = turn({ reply: "a" }), b = turn({ reply: "b" });
      is(await AU.burstBothAnswered(db(), a, { ...b, status: 409 }, run), "FAIL", "a 409");
      await seed(`insert into agent_messages (thread_id, role, content, meta) values ('${T_U}', 'assistant', 'a', '{"career_turn_key":"${a.turnKey}"}')`);
      is(await AU.burstBothAnswered(db(), a, b, run), "FAIL", "one recorded");
      await seed(`insert into agent_messages (thread_id, role, content, meta) values ('${T_U}', 'assistant', 'b', '{"career_turn_key":"${b.turnKey}"}')`);
      is(await AU.burstBothAnswered(db(), a, b, run), "PASS");
      await seed(`delete from agent_messages`);
      is(await AU.noDroppedTurns(db()), "NOT_RUN", "nothing to check");
      await seed(`insert into agent_messages (thread_id, role, content, created_at) values ('${T_U2}', 'user', 'hello?', now() - interval '1 hour')`);
      is(await AU.noDroppedTurns(db()), "FAIL");
      await seed(`insert into agent_messages (thread_id, role, content, created_at) values ('${T_U2}', 'assistant', 'hi', now() - interval '59 minutes')`);
      is(await AU.noDroppedTurns(db()), "PASS");
    });

    await t.step("X1..X7: scale", async () => {
      is(await AU.waitlistInProject(db()), "FAIL");
      await seed(`insert into site_waitlist (name, phone) values ('Test Person', '+15550100')`);
      is(await AU.waitlistInProject(db()), "PASS");

      is(await AU.nothingHeldByCap(db()), "FAIL", "no runs");
      await seed(`insert into channel_delivery_runs (run_at, delivered, failed, retried, skipped_opt_out, capped, swept, ms) values (now(), 3, 0, 0, 0, 0, 0, 1)`);
      is(await AU.nothingHeldByCap(db()), "PASS");
      await seed(`insert into channel_delivery_runs (run_at, delivered, failed, retried, skipped_opt_out, capped, swept, ms) values (now(), 0, 0, 0, 0, 4, 0, 1)`);
      is(await AU.nothingHeldByCap(db()), "FAIL", "capped");

      is(await AU.noBinaryInPostgres(db()), "FAIL", "bytes_b64 columns exist on trunk's schema");
      const withBytes = (await pg!.sql(`select string_agg(table_name, ',') from information_schema.columns where table_schema = 'public' and column_name = 'bytes_b64'`)).split(",");
      for (const tb of withBytes) await seed(`alter table public.${tb} rename column bytes_b64 to lv_moved`);
      is(await AU.noBinaryInPostgres(db()), "PASS", "no bytes column");
      for (const tb of withBytes) await seed(`alter table public.${tb} rename column lv_moved to bytes_b64`);

      is(await AU.prepareKeepsUp(db()), "FAIL", "nothing to measure");
      await seed(`insert into career_apply_wanted (user_id, posting_key, url, queued_at) values ('${V}', 'key1', 'https://jobs.ashbyhq.com/a/1', now() - interval '2 hours')`);
      is(await AU.prepareKeepsUp(db()), "FAIL", "not prepared");
      await seed(`set session_replication_role = replica; insert into career_apply_prepared (user_id, job_id, company, url, payload, payload_hash, card_lines, created_at) values ('${V}', 'key1', 'A', 'https://jobs.ashbyhq.com/a/1', '{}', '${H("e")}', '{"1. A"}', now() - interval '110 minutes'); set session_replication_role = origin;`); // seed state only: the resume guard (owner rule 2026-10-26) is not what this check measures
      is(await AU.prepareKeepsUp(db()), "PASS");

      is(await AU.cloudConfirmed(db()), "FAIL", "no cloud submit");
      await seed(job(V, { source: "cloud", resume: H("b"), updated: "now() - interval '2 days'" }));
      is(await AU.cloudConfirmed(db()), "FAIL", "1/1 unconfirmed");
      await seed(job(V, { source: "cloud", resume: H("b"), updated: "now() - interval '2 days'", state: "confirmed", confirmed: true }));
      for (let i = 0; i < 3; i++) await seed(job(V, { source: "cloud", resume: H("b"), updated: "now() - interval '2 days'", confirmed: true }));
      is(await AU.cloudConfirmed(db()), "PASS", "1/5 unconfirmed");
      await seed(`set session_replication_role = replica; delete from career_apply_jobs; set session_replication_role = origin;`);

      is(await AU.spendCapHeld(db()), "NOT_RUN", "no spend");
      await seed(`insert into agent_turn_costs (user_id, calls, usd_micros) values ('${V}', 1, 400000)`);
      is(await AU.spendCapHeld(db()), "PASS");
      await seed(`insert into agent_turn_costs (user_id, calls, usd_micros) values ('${V}', 1, 700000)`);
      is(await AU.spendCapHeld(db()), "FAIL", "$1.10");
    });

    await t.step("O2 and SEC3: legacy cron, Gmail grants", async () => {
      is(await AU.legacyCronGone(db()), "PASS");
      await seed(`insert into cron.job (jobid, jobname, schedule) values (9, 'plaid-sync-6h', '0 */6 * * *')`);
      is(await AU.legacyCronGone(db()), "FAIL");
      is(await AU.gmailConnects(db()), "FAIL");
      await seed(`insert into user_oauth_connections (user_id, provider, vault_name, scopes) values ('${V}', 'gmail', 'oauth_gmail_${V}', 'https://www.googleapis.com/auth/gmail.readonly')`);
      is(await AU.gmailConnects(db()), "FAIL", "the finance grant does not count");
      await seed(`insert into user_oauth_connections (user_id, provider, vault_name, scopes) values ('${V}', 'google_career', 'oauth_google_career_${V}', 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send')`);
      is(await AU.gmailConnects(db()), "PASS");
    });

    await t.step("S2: the erase covers every per-person table", async () => {
      is(await AU.eraseCoversEveryTable(db(), run), "FAIL", "the test account still has rows");
      const tables = (await pg!.sql(`select string_agg(distinct c.table_name, ',') from information_schema.columns c join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name where c.table_schema = 'public' and c.column_name = 'user_id' and x.table_type = 'BASE TABLE'`)).split(",");
      for (const tb of tables.filter((x) => !AU.ERASE_KEEPS.has(x))) await seed(`set session_replication_role = replica; delete from public.${tb} where user_id = '${U}'; set session_replication_role = origin;`);
      is(await AU.eraseCoversEveryTable(db(), run), "PASS");
      await seed(`insert into career_apply_wanted (user_id, posting_key, url) values ('${U}', 'key9', 'https://jobs.ashbyhq.com/a/9')`);
      is(await AU.eraseCoversEveryTable(db(), run), "FAIL", "a queued application left behind");
    });

    await t.step("reply checks that read state: resume confirmed, contacts, who-do-I-know, every reply recorded, watch reply", async () => {
      const at = new Date(Date.now() - 1000).toISOString();
      is(await C.resumeConfirmed(db(), turn({ at, reply: "Confirmed: 6 entries." }), run), "FAIL", "no event since");
      await seed(`insert into career_events (user_id, at, kind, subject) values ('${U}', now(), 'fact_confirmed', 'TEST University')`);
      is(await C.resumeConfirmed(db(), turn({ at, reply: "Confirmed: 6 entries." }), run), "PASS");
      is(await C.resumeConfirmed(db(), turn({ at, reply: "Thanks!" }), run), "FAIL", "the reply does not confirm");
      const imp = turn({ threadId: T_U, reply: "Connections.csv: imported 3/3 rows into your contacts" });
      is(await C.contactsImported(db(), imp, run, ["riley.verifytest@example.test"], 3), "FAIL", "not in state");
      await seed(`insert into agent_flow_state (thread_id, user_id, state) values ('${T_U}', '${U}', '{"career":{"contacts":[{"name":"Riley Verifytest","email":"riley.verifytest@example.test"},{"name":"Jordan Verifytest"},{"name":"Casey Verifytest"}]}}')
        on conflict (thread_id) do update set state = excluded.state`);
      is(await C.contactsImported(db(), imp, run, ["riley.verifytest@example.test"], 3), "PASS");
      is(await C.contactsImported(db(), turn({ threadId: T_U, reply: "imported 2/3 rows" }), run, ["riley.verifytest@example.test"], 3), "FAIL", "count");
      is(await C.whoKnows(db(), turn({ threadId: T_U, reply: "At Verifyco Test: Riley, Jordan, Casey." }), run, ["Riley", "Jordan", "Casey"]), "PASS");
      is(await C.whoKnows(db(), turn({ threadId: T_U, reply: "At Verifyco Test: Riley, Jordan." }), run, ["Riley", "Jordan", "Casey"]), "FAIL", "one missing");
      is(await C.whoKnows(db(), turn({ threadId: T_U, reply: "Riley, Jordan, Casey, Morgan." }), run, ["Riley", "Jordan", "Casey", "Morgan"]), "FAIL", "an invented contact");
      const k = crypto.randomUUID();
      await seed(`insert into agent_messages (thread_id, role, content, meta) values ('${T_U}', 'assistant', 'Recorded reply.', '{"career_turn_key":"${k}"}')`);
      is(await C.everyReplyRecorded(db(), [turn({ reply: "Recorded reply.", turnKey: k })], run), "PASS");
      is(await C.everyReplyRecorded(db(), [turn({ reply: "Recorded reply.", turnKey: k }), turn({ reply: "Never recorded." })], run), "FAIL");
      is(await C.everyReplyRecorded(db(), [], run), "NOT_RUN");
      await seed(`insert into career_alert_prefs (user_id, prefs, last_checked_at) values ('${U}', '{"on":true,"keywords":["software engineer"],"locations":["New York"],"remote_ok":false,"report_hour":8,"quiet_start":22,"quiet_end":7,"max_instant_per_day":3}', now()) on conflict (user_id) do update set prefs = excluded.prefs`);
      is(await C.watchSaved(db(), run, ["software", "engineer"], turn({ reply: "Watching for software engineer roles in New York." })), "PASS");
      is(await C.watchSaved(db(), run, ["software", "engineer"], turn({ reply: "Done!" })), "FAIL", "the reply does not name the watch");
    });
  } finally {
    await conn?.end();
    await pg?.stop();
    pg = null; conn = null;
  }
} });
