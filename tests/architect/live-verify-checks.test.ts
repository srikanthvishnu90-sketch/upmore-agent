// scripts/live/verify.ts (the live production verification suite): every check run against a real Postgres with the
// career schema (tests/flow/pg.ts), seeded pass-shaped and then fail-shaped. A check that cannot fail is caught here:
// each one must return PASS on the first seed and FAIL (or NOT_RUN where that is its honest answer) on the second.
// Also: the suite's two write locks (code refuses a non-read; the database refuses a write inside the read-only
// transaction), its HTTP and chat guards, and a whole run against a product that answers nothing, which must FAIL,
// never PASS, and must call nothing but agent-chat as the test account.
import nodeAssert from "node:assert/strict";
const assert = (v: unknown, msg?: string) => nodeAssert.ok(v, msg);
const assertEquals = (a: unknown, b: unknown, msg?: string) => nodeAssert.deepStrictEqual(a, b, msg);
const esc = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const assertThrows = (fn: () => unknown, _e?: unknown, inc = "", msg?: string) => nodeAssert.throws(fn, esc(inc), msg);
const assertRejects = (fn: () => Promise<unknown>, _e?: unknown, inc = "", msg?: string) => nodeAssert.rejects(fn, esc(inc), msg);
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import * as L from "../../scripts/live/lib.ts";
import * as C from "../../scripts/live/checks.ts";
import { exitCode, main } from "../../scripts/live/verify.ts";
import { readOnlyConnection } from "./live-verify-pg.ts";

const CI = !!Deno.env.get("CI");
const U = "5e1f0000-0000-4000-8000-0000000000a1"; // the flagged test account
const V = "5e1f0000-0000-4000-8000-0000000000b2"; // a real person
const W = "5e1f0000-0000-4000-8000-0000000000c3"; // on the test domain, not flagged
const U_EMAIL = "trainee-live-verify@upmore.test";
const T_U = "5e1f0000-0000-4000-8000-0000000000d1", T_V = "5e1f0000-0000-4000-8000-0000000000d2", T_U2 = "5e1f0000-0000-4000-8000-0000000000d3";
const run: C.Run = { userId: U, startedAt: "2026-10-26T00:00:00Z" };
const H = (c: string) => c.repeat(64);
const prefs = (on: boolean, kw: string) => JSON.stringify({ on, keywords: [kw], locations: ["New York"], remote_ok: false, report_hour: 8, quiet_start: 22, quiet_end: 7, max_instant_per_day: 3 });

let pg: Pg | null = null, conn: { exec: L.Exec; end: () => Promise<void> } | null = null;
async function world(): Promise<Pg> {
  if (pg) return pg;
  pg = await startPg();
  await pg.sql(`
    alter table auth.users add column if not exists raw_app_meta_data jsonb not null default '{}'::jsonb;
    insert into auth.users (id, email, raw_app_meta_data) values ('${U}', '${U_EMAIL}', '{"trainee_test_account": true}'),
      ('${V}', 'real.person@example.com', '{}'), ('${W}', 'other@upmore.test', '{}');
    insert into public.profiles (id) values ('${U}'), ('${V}'), ('${W}');
    insert into public.agent_threads (id, user_id) values ('${T_U}', '${U}'), ('${T_V}', '${V}'), ('${T_U2}', '${U}');
    create schema if not exists cron;
    create table if not exists cron.job (jobid bigint primary key, jobname text, schedule text);
    create table if not exists cron.job_run_details (jobid bigint, status text, start_time timestamptz);`);
  conn = await readOnlyConnection(pg);
  return pg;
}
const skip = () => {
  if (pgBinDir()) return false;
  if (CI) throw Error("the live-verify checks need Postgres 16 in CI");
  console.log("NOT_RUN locally: no Postgres binaries");
  return true;
};
const db = () => L.readOnlyDb(conn!.exec); // every read goes as the SELECT-only role, one extended-protocol query
const seed = (s: string) => pg!.sql(s);
const turn = (o: Partial<C.Turn> & { reply: string }): C.Turn => ({ status: 200, threadId: T_U, turnKey: crypto.randomUUID(), meta: {}, at: new Date(Date.now() - 60_000).toISOString(), ...o });
const is = (r: L.Result | L.Result[], status: L.Status, msg = "") => {
  for (const x of [r].flat()) assertEquals(x.status, status, `${msg} ${x.check}: ${x.reason}`);
};

// ------------------------------------------------------------------------------------------------ pure guards
Deno.test("live verify: the read-only guard passes reads and refuses every write shape", () => {
  for (const s of [
    "select 1", "with a as (select 1) select * from a", "select count(*) from career_events where kind = 'insert into x'",
    "select * from public.career_ingest_coverage(interval '1 hour')", "select updated_at, created_at, start_time from x",
    "select encode(sha256(convert_to(public.career_apply_canonical(p.payload), 'UTF8')), 'hex') from career_apply_prepared p",
    "select case when 1 = 1 then 'a' else 'b' end as x", "select 'a -- not a comment' as x", "select $$ ; delete $$ as x",
    "select u.email from auth.users u", "select j.jobname from cron.job j", "with me as (select 1 as id) select me.id from me",
    "select c.table_name from information_schema.columns c", "select e'it\\'s' as x", "select 'it''s' as x",
  ]) L.assertReadOnlySql(s);
  for (const s of [
    "insert into career_events values (1)", "update career_watch_kv set value = '{}'", "delete from career_outbox",
    "with d as (delete from career_events returning 1) select count(*) from d", "select 1; delete from career_events",
    "select 1; select 2", "select 1;", "select nextval('s')", "select career_apply_enqueue('{}'::jsonb, 'a', 'a', 1)",
    "select public.career_host_commit(null)", "set role postgres", "truncate career_events", "select pg_advisory_lock(1)",
    "copy x to stdout", "select set_config('a','b',false)", "call p()", "do $$ begin end $$", "values (1)",
    // the review's bypass: a comment marker inside a string, then a second statement
    "select '--' as a) lv_row; commit; delete from career_postings; select (1",
    "select '/*' as a, 1 as b; delete from career_postings --*/",
    "select 'it''s' as a; commit", "select e'\\'' ; commit; delete from x --' as a",
    "select $tag$ x $tag$ as a; commit", "select 'unterminated", "select /* unterminated", "select $q$ unterminated",
    // functions and schemas off the allow-list
    "select exec_vault_read('exec_cred_x')", "select public.exec_vault_read('x')", "select \"exec_vault_read\"('x')",
    "select * from vault.decrypted_secrets", "select cron.schedule('x', '* * * * *', 'select 1')", "select dblink('x')",
    "select pg_read_file('/etc/passwd')", "select current_setting('x') as a, pg_sleep(1) as b", "select * from auth.refresh_tokens",
    "select * from storage.buckets", "select lo_import('/x')", "select * from extensions.pg_stat_statements",
    "select q.x from pg_temp.q", "select a.b from vault.secrets a", "select vault.id from career_events vault",
    "select 1 from career_events vault, vault.decrypted_secrets", "select 1 from career_events auth, auth.sessions",
    "select e'it\\\\'s; commit; delete from x' as a; commit",
  ]) assertThrows(() => L.assertReadOnlySql(s), Error, "refused", s);
});

Deno.test("live verify: the HTTP guard allows only the test account's doors", async () => {
  const calls: string[] = [];
  const inner = (async (i: string | URL | Request) => { calls.push(String(i)); return new Response("{}"); }) as typeof fetch;
  const f = L.guardedFetch({ base: "https://abcdefghijklmnopqrst.supabase.co", appUrl: "https://app.example.test", ref: "abcdefghijklmnopqrst" }, inner);
  const B = "https://abcdefghijklmnopqrst.supabase.co";
  await f(`${B}/functions/v1/agent-chat`, { method: "POST", body: "{}" });
  await f(`${B}/functions/v1/trainee-telegram`, { method: "POST", body: "{}" });
  await f(`${B}/rest/v1/career_outbox?select=user_id`);
  await f(`${B}/auth/v1/token?grant_type=password`, { method: "POST", body: "{}" });
  await f(`${B}/functions/v1/career-cloud-runner/dispatch`, { method: "POST", body: '{"want":0}', headers: { "x-cloud-dispatch-secret": "wrong-1" } });
  await f("https://app.example.test/");
  await f("https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/functions");
  await f(`https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/analytics/endpoints/logs.all?sql=${encodeURIComponent("select count(*) as inbound, countif(x) as in_url from function_edge_logs")}`);
  await f(`${B}/functions/v1/agent-chat`, { method: "OPTIONS" });
  for (const [url, init] of [
    [`${B}/rest/v1/career_outbox`, { method: "POST", body: "{}" }],
    [`${B}/rest/v1/career_outbox?id=eq.1`, { method: "PATCH", body: "{}" }],
    [`${B}/rest/v1/rpc/career_apply_message_card_approve_own`, { method: "POST", body: "{}" }],
    [`${B}/functions/v1/trainee-deliver`, { method: "POST", body: "{}" }],
    [`${B}/functions/v1/career-cloud-runner/dispatch`, { method: "POST", body: '{"want":5}', headers: { "x-cloud-dispatch-secret": "wrong-1" } }],
    [`${B}/functions/v1/career-cloud-runner/dispatch`, { method: "POST", body: '{"want":0}', headers: { "x-cloud-dispatch-secret": "the-real-one" } }],
    [`${B}/auth/v1/signup`, { method: "POST", body: "{}" }],
    ["https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/secrets", { method: "GET" }],
    ["https://api.supabase.com/v1/projects/zzzzzzzzzzzzzzzzzzzz/functions", { method: "GET" }],
    [`https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/analytics/endpoints/logs.all?sql=${encodeURIComponent("select event_message from function_edge_logs")}`, { method: "GET" }],
    [`${B}/rest/v1/rpc/exec_vault_read?name=x`, { method: "GET" }],
    [`${B}/rest/v1//rpc/exec_vault_read`, { method: "GET" }],
    [`${B}/rest/v1/%72pc/exec_vault_read`, { method: "GET" }],
    [`${B}/rest/v1/career_outbox/../rpc/exec_vault_read`, { method: "GET" }],
    [`${B}/rest/v1/career_outbox/%2e%2e/rpc/x`, { method: "GET" }],
    [`${B}/rest/v1/rpc/../career_outbox`, { method: "GET" }],
    [`${B}/rest/v1/rpc\t/../career_outbox`, { method: "GET" }],
    [`${B}/rest/v1/career_out\tbox`, { method: "GET" }], // the URL parser drops the tab: what is sent is not what was read
    [`${B}/functions/v1/x/../agent-chat`, { method: "POST", body: "{}" }],
    [`${B}/rest/v1/profiles?select=*`, { method: "GET" }],
    [`${B}/rest/v1/career_outbox/x`, { method: "GET" }],
    [`${B}/rest/v1/Career_Outbox`, { method: "GET" }],
    [`${B}\\rest\\v1\\career_outbox`, { method: "GET" }],
    [`${B}/auth/v1/admin/users`, { method: "GET" }],
    ["https://app.example.test/other-page", { method: "GET" }],
    [`${B}/functions/v1/trainee-deliver`, { method: "GET" }],
    [`${B}/functions/v1/trainee-deliver`, { method: "OPTIONS" }],
    ["https://boards.greenhouse.io/x/jobs/1", { method: "POST", body: "{}" }],
  ] as [string, RequestInit][]) await assertRejects(() => f(url, init), Error, "refused", url);
  assertEquals(calls.length, 9);
});

Deno.test("live verify: the chat guard never lets the suite approve, send or apply", () => {
  const g = new L.ChatGuard();
  g.check(null, "find software engineer jobs in New York");
  for (const m of ["yes", "send 1", "approve these", "go ahead", "Submit it", "ok", "please send it", "can you send it now?",
    "looks good, send them", "I confirm", "sure, do it", "that is fine, approve"]) assertThrows(() => g.check(T_U, m), Error, "refused", m);
  for (const m of ["apply to 1", "apply to all of them", "apply me to this: https://jobs.ashbyhq.com/ramp/1", "please apply for me to Stripe",
    "I applied to Acme", "submit my application"]) assertThrows(() => g.check(T_U, m), Error, "refused", m);
  for (const m of L.APPLY_PROBES) g.check(T_U, m);
  g.noteReply(T_U, { reply: "Here is your card. A yes sends exactly this." });
  assertThrows(() => g.check(T_U, L.RESUME_CONFIRMATION), Error, "card");
  const g2 = new L.ChatGuard();
  g2.check(T_U2, L.RESUME_CONFIRMATION);
  assertThrows(() => g2.check(T_U2, L.RESUME_CONFIRMATION), Error, "already");
  assertThrows(() => new L.ChatGuard().check(null, "yes, that's my resume and send it"), Error, "refused");
});

Deno.test("live verify: the workflow runs only when the owner starts it, only from trunk, with every action pinned to a commit", async () => {
  const y = await Deno.readTextFile(new URL("../../.github/workflows/live-verify.yml", import.meta.url));
  const code = y.replace(/^\s*#.*$/gm, "");
  const on = code.slice(code.indexOf("\non:"), code.indexOf("\npermissions:"));
  assert(/^\s*workflow_dispatch:/m.test(on), on);
  assert(!/^\s*(?:push|pull_request|pull_request_target|schedule|workflow_run|repository_dispatch|release|issue_comment):/m.test(on), `only workflow_dispatch may start it: ${on}`);
  assert(/^\s*if: github\.ref == 'refs\/heads\/trunk'\s*$/m.test(code), "the job runs only from trunk");
  assert(/environment: production/.test(code));
  const uses = [...code.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
  assert(uses.length >= 3, uses.join(","));
  for (const u of uses) assert(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/.test(u), `${u} is not pinned to a commit SHA`);
  assert(!/SUPABASE_DB_URL/.test(code), "the owner's database URL is never handed to the suite");
  assert(/LIVE_VERIFY_DB_URL/.test(code));
  assert(!/deploy|supabase functions|db push|vercel/i.test(code), "the workflow deploys nothing");
});

Deno.test("live verify: the exit code passes only when every check passed (a NOT_RUN is not passed)", () => {
  assertEquals(exitCode({ pass: 3, fail: 0, not_run: 0, total: 3 }, false), 0);
  assertEquals(exitCode({ pass: 2, fail: 0, not_run: 1, total: 3 }, false), 1, "a NOT_RUN fails the run");
  assertEquals(exitCode({ pass: 2, fail: 0, not_run: 1, total: 3 }, true), 0, "--allow-not-run");
  assertEquals(exitCode({ pass: 2, fail: 1, not_run: 0, total: 3 }, true), 1);
  assertEquals(exitCode({ pass: 0, fail: 0, not_run: 0, total: 0 }, false), 1, "nothing checked is not a pass");
});

Deno.test("live verify: the JWT subject, the matrix and the F12 number match", () => {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  assertEquals(L.jwtSubject(`${b64({ alg: "HS256" })}.${b64({ sub: U, exp: 10 })}.sig`), { sub: U, exp: 10 });
  assertThrows(() => L.jwtSubject(`${b64({})}.${b64({ sub: "x" })}.s`));
  const md = L.markdown([L.pass("F5", "F5.a", "ok"), L.fail("F5", "F5.b", "bad | pipe"), L.notRun("F7", "F7.c", "why")], { started: "s", finished: "f", sha: null, project: null });
  assert(md.includes("| F5 Search + judge | 1 | 1 | 0 |") && md.includes("bad \\| pipe") && md.includes("**1/3 passed.** Not passed: 1 FAIL and 1 NOT_RUN"), md);
  const bench: C.Bench[] = [{ kind: "lca", shown: true, median: 197000, n: 49 }, { kind: "oews", shown: true, median: 166830, n: 121000 }];
  is(C.offerNumbers(turn({ reply: "median $197,000 from 49 filings; BLS median $166,830, about 121,000 people employed" }), bench), "PASS");
  is(C.offerNumbers(turn({ reply: "median $195,000 from 49 filings; BLS median $166,830, about 121,000 people employed" }), bench), "FAIL", "a wrong median");
  is(C.offerNumbers(turn({ reply: "median $197,000; BLS median $166,830, about 121,000 people employed" }), bench), "FAIL", "no n");
  is(C.offerNumbers(turn({ reply: "anything" }), [{ kind: "lca", shown: false, median: null, n: 3 }]), "NOT_RUN");
});

// ------------------------------------------------------------------------------------------------ the database checks
Deno.test({ name: "live verify: every check passes its pass-shaped seed and fails its fail-shaped one (real Postgres)", sanitizeResources: false, sanitizeOps: false, async fn(t) {
  if (skip()) return;
  await world();
  try {
    await t.step("the three locks, each alone: protocol, transaction, role", async () => {
      // Lock 2, protocol: one extended-protocol query; Postgres refuses a second command in it, whatever the role.
      // A superuser connection that does not ask for read-only at startup: only `begin read only` stands in the way.
      const su = await L.pgExec({ path: `${pg!.host}/.s.PGSQL.${pg!.port}`, user: "postgres", database: "postgres" }, { startupReadOnly: false });
      try {
        await assertRejects(() => su.exec("select 1; delete from career_postings"), Error, "multiple commands");
        // Lock 2, transaction: a write inside `begin read only` is refused even for a superuser.
        await assertRejects(() => su.exec("select nextval(pg_get_serial_sequence('public.career_events', 'id'))"), Error, "read-only transaction");
        await assertRejects(() => su.exec("delete from career_events"), Error, "read-only transaction");
        // Lock 3, role: a superuser, or a role that can write a table, is refused before anything runs.
        await assertRejects(() => L.assertReadOnlyRole(L.readOnlyDb(su.exec)), Error, "superuser");
      } finally { await su.end(); }
      await seed(`do $$ begin if not exists (select from pg_roles where rolname = 'lv_rw') then create role lv_rw login; end if; end $$;
        grant usage on schema public to lv_rw; grant select on all tables in schema public to lv_rw; grant insert on public.career_events to lv_rw;
        alter role lv_rw set default_transaction_read_only = on`);
      const rw = await L.pgExec({ path: `${pg!.host}/.s.PGSQL.${pg!.port}`, user: "lv_rw", database: "postgres" });
      try { await assertRejects(() => L.assertReadOnlyRole(L.readOnlyDb(rw.exec)), Error, "can write"); } finally { await rw.end(); }
      await seed(`alter role lv_rw reset default_transaction_read_only; revoke insert on public.career_events from lv_rw`);
      const off = await L.pgExec({ path: `${pg!.host}/.s.PGSQL.${pg!.port}`, user: "lv_rw", database: "postgres" });
      try { assertEquals((await L.readOnlyDb(off.exec).rows<{ ro: string }>("select current_setting('default_transaction_read_only') as ro"))[0].ro, "on", "the connection asks for read-only at startup"); } finally { await off.end(); }
      await L.assertReadOnlyRole(db());
      assertEquals(await db().rows("select 1 as one"), [{ one: 1 }]);
    });

    await t.step("ACCOUNT test account", async () => {
      await L.assertTestAccount(db(), U, U_EMAIL);
      await assertRejects(() => L.assertTestAccount(db(), V, U_EMAIL), Error, "test domain");
      await assertRejects(() => L.assertTestAccount(db(), W, "other@upmore.test"), Error, "not flagged");
      await assertRejects(() => L.assertTestAccount(db(), U, "someone@upmore.test"), Error, "configured test account");
      await assertRejects(() => L.assertTestAccount(db(), U, "a@gmail.com"), Error, "test email");
    });

    await t.step("schema", async () => {
      for (const f of ["F1", "F6", "F7", "F8", "F9", "F14", "F15", "CLOUD"]) is(await C.schemaCheck(db(), f), "PASS", f);
      C.NEEDS.ZZ = [{ obj: "public.career_not_a_table", kind: "table", migration: "x.sql" }];
      is(await C.schemaCheck(db(), "ZZ"), "FAIL");
      delete C.NEEDS.ZZ;
    });

    await t.step("turnRecorded and metered", async () => {
      const k = crypto.randomUUID(), kv = crypto.randomUUID();
      await seed(`insert into agent_messages (thread_id, role, content, meta) values ('${T_U}', 'assistant', 'Hello there.', '{"career_turn_key":"${k}"}'),
        ('${T_V}', 'assistant', 'Hi.', '{"career_turn_key":"${kv}"}')`);
      is(await C.turnRecorded(db(), "X", "X.t", turn({ reply: "Hello there.", turnKey: k }), run), "PASS");
      is(await C.turnRecorded(db(), "X", "X.t", turn({ reply: "Something else.", turnKey: k }), run), "FAIL", "differs");
      is(await C.turnRecorded(db(), "X", "X.t", turn({ reply: "Hello there.", turnKey: crypto.randomUUID() }), run), "FAIL", "no record");
      is(await C.turnRecorded(db(), "X", "X.t", turn({ reply: "Hi.", turnKey: kv, threadId: T_V }), run), "FAIL", "another account");
      is(await C.turnRecorded(db(), "X", "X.t", turn({ reply: "x", status: 503, turnKey: k }), run), "FAIL", "http");
      const at = new Date(Date.now() - 5000).toISOString();
      is(await C.metered(db(), "X", "X.m", turn({ reply: "", at }), run), "FAIL", "no cost row yet");
      await seed(`insert into agent_turn_costs (user_id, thread_id, calls, usd_micros) values ('${U}', '${T_U}', 1, 120)`);
      is(await C.metered(db(), "X", "X.m", turn({ reply: "", at }), run), "PASS");
      await seed(`insert into agent_turn_costs (user_id, thread_id, calls, created_at) values ('${U}', '${T_U2}', 0, now())`);
      is(await C.metered(db(), "X", "X.m", turn({ reply: "", at, threadId: T_U2 }), run), "FAIL", "zero calls");
    });

    await t.step("F5 listed postings exist and are open", async () => {
      await seed(`insert into career_postings (job_id, provider, board, company, title, url, first_seen_at, last_seen_at, closed_at) values
        ('greenhouse:acme:1', 'greenhouse', 'acme', 'Acme', 'Software Engineer', 'https://boards.greenhouse.io/acme/jobs/1', now(), now(), null),
        ('greenhouse:acme:2', 'greenhouse', 'acme', 'Acme', 'Software Engineer II', 'https://boards.greenhouse.io/acme/jobs/2', now(), now(), now())`);
      is(await C.searchListedOpen(db(), turn({ reply: "1. Software Engineer at Acme — New York (https://boards.greenhouse.io/acme/jobs/1). fit 40/100." })), "PASS");
      is(await C.searchListedOpen(db(), turn({ reply: "1. (https://boards.greenhouse.io/acme/jobs/1). 2. (https://boards.greenhouse.io/acme/jobs/2)." })), "FAIL", "closed");
      is(await C.searchListedOpen(db(), turn({ reply: "1. (https://boards.greenhouse.io/acme/jobs/9)." })), "FAIL", "not on file");
      is(await C.searchListedOpen(db(), turn({ reply: "From 2 postings in the saved snapshot of job boards (https://boards.greenhouse.io/acme/jobs/1)" })), "FAIL", "snapshot");
      is(await C.searchListedOpen(db(), turn({ reply: "No matches." })), "FAIL", "no links");
      assertEquals(C.judgeState(turn({ reply: "not judged (the model judge is off)." })), "off");
      assertEquals(C.judgeState(turn({ reply: "3/3 judged; 1 strong" })), "judged");
    });

    await t.step("F3/E2E prepared, hash-bound and carded", async () => {
      const urls = { urls: ["https://boards.greenhouse.io/acme/jobs/1"] };
      is(await C.preparedBound(db(), "E2E", "E2E.p", run, urls), "FAIL", "nothing prepared");
      const id = (await seed(`set session_replication_role = replica; insert into career_apply_prepared (user_id, job_id, company, url, payload, payload_hash, card_lines)
        select '${U}', 'greenhouse:acme:1', 'Acme', 'https://boards.greenhouse.io/acme/jobs/1', p, encode(sha256(convert_to(public.career_apply_canonical(p), 'UTF8')), 'hex'), '{"1. Acme"}'
        from (select '{"answers":{"first_name":"Alex"}}'::jsonb as p) s returning id`)).split("\n")[0];
      is(await C.preparedBound(db(), "E2E", "E2E.p", run, urls), "FAIL", "no card");
      await seed(`set session_replication_role = replica; insert into career_apply_cards (user_id, items, shown_at) select '${U}', jsonb_build_array(jsonb_build_object('n', 1, 'prepared_id', id, 'payload_hash', payload_hash)), now() from career_apply_prepared where id = '${id}'`);
      is(await C.preparedBound(db(), "E2E", "E2E.p", run, urls), "PASS");
      await seed(`update career_apply_cards set items = jsonb_build_array(jsonb_build_object('n', 1, 'prepared_id', '${id}', 'payload_hash', '${H("e")}')) where user_id = '${U}'`);
      is(await C.preparedBound(db(), "E2E", "E2E.p", run, urls), "FAIL", "card names another hash");
      await seed(`update career_apply_prepared set payload = '{"answers":{"first_name":"Changed"}}' where id = '${id}'`);
      is(await C.preparedBound(db(), "E2E", "E2E.p", run, urls), "FAIL", "payload no longer hashes");
      is(await C.preparedBound(db(), "F3", "F3.p", run, { exceptUrls: urls.urls }), "FAIL", "F3 excludes the E2E posting");
      await seed(`delete from career_apply_cards where user_id = '${U}'; delete from career_apply_prepared where user_id = '${U}'`);
    });

    await t.step("SAFETY never approved", async () => {
      is(await C.neverApproved(db(), run), "PASS");
      await seed(`set session_replication_role = replica; insert into career_apply_cards (user_id, items, state, shown_at, answered_at) values ('${U}', '[{"n":1}]', 'answered', now(), now())`);
      is(await C.neverApproved(db(), run), "FAIL", "an answered card");
      await seed(`delete from career_apply_cards where user_id = '${U}'; set session_replication_role = replica;
        insert into career_apply_jobs (user_id, job_id, company, url, payload, payload_hash, approval_hash, state) values ('${U}', 'j', 'Acme', 'https://x.test/1', '{}', '${H("a")}', '${H("a")}', 'queued')`);
      is(await C.neverApproved(db(), run), "FAIL", "a job");
      await seed(`delete from career_apply_jobs where user_id = '${U}'`);
    });

    await t.step("F2 approval invariant and a real Greenhouse submit; F14 receipts; CLOUD", async () => {
      is(await C.greenhouseSubmitted(db()), "FAIL", "none yet");
      is(await C.cloudInvariant(db()), "FAIL", "no cloud job yet");
      is(await C.receiptIntegrity(db()), "NOT_RUN", "0/0 proves nothing");
      is(await C.approvalInvariant(db(), "F2"), "NOT_RUN", "0/0 proves nothing");
      const job = (await seed(`set session_replication_role = replica;
        insert into career_apply_jobs (user_id, job_id, company, url, payload, payload_hash, approval_hash, state, source, updated_at)
        values ('${V}', 'greenhouse:acme:1', 'Acme', 'https://boards.greenhouse.io/acme/jobs/1', '{}', '${H("b")}', '${H("b")}', 'submitted_unconfirmed', 'cloud', now()) returning id`)).split("\n").filter(Boolean).at(-1)!;
      is(await C.approvalInvariant(db(), "F2"), "PASS");
      is(await C.greenhouseSubmitted(db()), "PASS");
      is(await C.cloudInvariant(db()), "PASS");
      is(await C.receiptIntegrity(db()), "FAIL", "no receipt");
      await seed(`insert into career_apply_receipts (application_id, user_id, company, url, state, reached_employer, answers, payload_hash, approval_hash, approved_at, finished_at, pictures_keep_until)
        values ('${job}', '${V}', 'Acme', 'https://boards.greenhouse.io/acme/jobs/1', 'submitted_unconfirmed', 'yes', '[]', '${H("b")}', '${H("b")}', now(), now(), now() + interval '30 days')`);
      is(await C.receiptIntegrity(db()), "PASS");
      await seed(`update career_apply_receipts set state = 'confirmed' where application_id = '${job}'`);
      is(await C.receiptIntegrity(db()), "FAIL", "receipt state differs");
      await seed(`alter table career_apply_jobs drop constraint if exists career_apply_jobs_check; alter table career_apply_jobs drop constraint if exists career_apply_jobs_approval_hash_check;`);
      const cons = await pg!.sql(`select conname from pg_constraint where conrelid = 'public.career_apply_jobs'::regclass and pg_get_constraintdef(oid) like '%approval_hash = payload_hash%'`);
      for (const c of cons.split("\n").filter(Boolean)) await seed(`alter table career_apply_jobs drop constraint ${c}`);
      await seed(`set session_replication_role = replica; update career_apply_jobs set approval_hash = '${H("c")}' where id = '${job}'`);
      is(await C.approvalInvariant(db(), "F2"), "FAIL", "unbound send");
      is(await C.cloudInvariant(db()), "FAIL", "unbound cloud send");
      await seed(`set session_replication_role = replica; update career_apply_jobs set approval_hash = payload_hash, state = 'driving', attempts = 1, lease_token = gen_random_uuid(), claimed_at = now() - interval '2 hours' where id = '${job}'`);
      is(await C.cloudInvariant(db()), "FAIL", "stuck");
      await seed(`set session_replication_role = replica; delete from career_apply_receipts; delete from career_apply_jobs;`);
    });

    await t.step("F3 rail", async () => {
      is(await C.prepareAheadRail(db()), "FAIL");
      await seed(`insert into career_watch_kv (user_id, key, value) values ('${V}', 'career:prepare-ahead:${V}', '{"day":"2026-10-26"}')`);
      is(await C.prepareAheadRail(db()), "PASS");
    });

    await t.step("F6 ingest fresh, lanes and schedule", async () => {
      is((await C.ingestFresh(db(), { maxAgeMin: 30, minOpen: 1 }))[0], "FAIL", "no runs");
      const run1 = (lane: number, ago: string, fresh = 95) => `insert into career_ingest_runs (at, lane, lanes, window_min, ms, boards_due, boards_read, boards_ok, boards_failed, postings_new, directory_fresh, directory_total, report)
        values (now() - interval '${ago}', ${lane}, 2, 60, 100, 10, 10, 10, 0, 5, ${fresh}, 100, 'lane ${lane}')`;
      await seed(run1(0, "2 hours"));
      const r = await C.ingestFresh(db(), { maxAgeMin: 30, minOpen: 1 });
      is(r[0], "FAIL", "stale");
      is(r[1], "PASS", "1 open posting first seen now");
      is((await C.ingestFresh(db(), { maxAgeMin: 30, minOpen: 1000 }))[1], "FAIL", "too few open");
      await seed(run1(0, "5 minutes"));
      is(await C.ingestFresh(db(), { maxAgeMin: 30, minOpen: 1 }), "PASS");
      is(await C.ingestLanes(db()), "FAIL", "lane 1 silent");
      await seed(run1(1, "4 minutes", 80));
      is(await C.ingestLanes(db()), "FAIL", "80% fresh");
      await seed(run1(1, "3 minutes", 95));
      is(await C.ingestLanes(db()), "PASS");
      is(await C.cronJobs(db(), "F6", "trainee-career-ingest%", 15), "FAIL", "no job");
      await seed(`insert into cron.job values (1, 'trainee-career-ingest', '*/5 * * * *'), (2, 'trainee-career-ingest-lane-1', '*/5 * * * *');
        insert into cron.job_run_details values (1, 'succeeded', now() - interval '2 minutes'), (2, 'failed', now() - interval '1 minute')`);
      is(await C.cronJobs(db(), "F6", "trainee-career-ingest%", 15), "FAIL", "a lane failed");
      await seed(`insert into cron.job_run_details values (2, 'succeeded', now())`);
      is(await C.cronJobs(db(), "F6", "trainee-career-ingest%", 15), "PASS");
    });

    await t.step("F7 watch, runs, alert, deliveries, containment", async () => {
      is(await C.watchSaved(db(), run, ["software", "engineer"]), "FAIL", "no row");
      await seed(`insert into career_alert_prefs (user_id, prefs, last_checked_at) values ('${U}', '${prefs(true, "data analyst")}', now())`);
      is(await C.watchSaved(db(), run, ["software", "engineer"]), "FAIL", "other words");
      await seed(`update career_alert_prefs set prefs = '${prefs(false, "software engineer")}' where user_id = '${U}'`);
      is(await C.watchSaved(db(), run, ["software", "engineer"]), "FAIL", "off");
      await seed(`update career_alert_prefs set prefs = '${prefs(true, "software engineer")}' where user_id = '${U}'`);
      is(await C.watchSaved(db(), run, ["software", "engineer"]), "PASS");

      is(await C.runRecordFresh(db(), "F7", "career_proactive_runs", 15), "FAIL", "none");
      await seed(`insert into career_proactive_runs (run_at, users, alerts, held, reports, duplicates, postings, ms, error) values (now() - interval '1 minute', 1, 0, 0, 0, 0, 0, 5, 'boom')`);
      is(await C.runRecordFresh(db(), "F7", "career_proactive_runs", 15), "FAIL", "error");
      await seed(`insert into career_proactive_runs (run_at, users, alerts, held, reports, duplicates, postings, ms) values (now(), 1, 0, 0, 0, 0, 0, 5)`);
      is(await C.runRecordFresh(db(), "F7", "career_proactive_runs", 15), "PASS");
      await seed(`insert into channel_delivery_runs (run_at, delivered, failed, retried, skipped_opt_out, capped, swept, ms) values (now() - interval '1 hour', 0, 0, 0, 0, 0, 0, 1)`);
      is(await C.runRecordFresh(db(), "F7", "channel_delivery_runs", 5), "FAIL", "old");

      const r2 = { ...run, startedAt: new Date(Date.now() - 60_000).toISOString() };
      is(await C.alertQueued(db(), r2, ["software", "engineer"]), "FAIL", "none");
      await seed(`insert into career_outbox (user_id, key, kind, text, deliver_at) values ('${U}', 'alert:greenhouse:acme:2', 'alert', 'New match', now())`);
      is(await C.alertQueued(db(), r2, ["software", "engineer"]), "FAIL", "closed posting");
      await seed(`insert into career_outbox (user_id, key, kind, text, deliver_at) values ('${U}', 'alert:greenhouse:acme:1', 'alert', 'New match', now())`);
      is(await C.alertQueued(db(), r2, ["software", "engineer"]), "PASS");

      is(await C.alertsDelivered(db(), U), "FAIL", "only the test account's");
      await seed(`insert into career_outbox (user_id, key, kind, text, deliver_at, status, delivered_at, contact) values ('${V}', 'alert:greenhouse:acme:1', 'alert', 'New match', now(), 'delivered', now(), '+15550100')`);
      is(await C.alertsDelivered(db(), U), "PASS");

      is(await C.testOutboxContained(db(), run, null), "PASS", "nothing delivered for the test account");
      await seed(`update career_outbox set status = 'delivered', delivered_at = now(), contact = 'tg:42' where user_id = '${U}' and key = 'alert:greenhouse:acme:1'`);
      is(await C.testOutboxContained(db(), run, "tg:42"), "PASS");
      is(await C.testOutboxContained(db(), run, null), "FAIL", "no test chat");
      await seed(`update career_outbox set contact = '+15550100' where user_id = '${U}' and key = 'alert:greenhouse:acme:1'`);
      is(await C.testOutboxContained(db(), run, "tg:42"), "FAIL", "a real number");
    });

    await t.step("F8 inbox and follow-ups agree with the mail state", async () => {
      const at = new Date(Date.now() - 1000).toISOString();
      is(await C.inboxHonest(db(), turn({ at, reply: "Nothing was read: your Gmail is not connected." }), run), "PASS");
      is(await C.inboxHonest(db(), turn({ at, reply: "I read your mail through Oct 25: 1 new message." }), run), "FAIL", "claims a read");
      is(await C.inboxHonest(db(), turn({ at, reply: "Sure thing." }), run), "FAIL", "says nothing");
      await seed(`insert into career_mail_cursors (user_id, read_through, updated_at) values ('${U}', now(), now())`);
      is(await C.inboxHonest(db(), turn({ at, reply: "I read your mail through Oct 25: 1 new message." }), run), "PASS");
      is(await C.inboxHonest(db(), turn({ at, reply: "Nothing was read: your Gmail is not connected." }), run), "FAIL", "cursor moved");
      is(await C.followupsMatch(db(), turn({ reply: "No follow-ups are due." }), run), "PASS");
      is(await C.followupsMatch(db(), turn({ reply: "Stripe: follow-up due." }), run), "FAIL", "invented");
      await seed(`insert into career_mail_drafts (user_id, draft_key, application_ref, kind, company, text, basis) values ('${U}', 'followup:k1', 'job:a1', 'followup', 'Stripe', 'Hi', 'no reply in 16 days')`);
      is(await C.followupsMatch(db(), turn({ reply: "No follow-ups are due." }), run), "FAIL", "one is due");
      is(await C.followupsMatch(db(), turn({ reply: "Stripe (Data Analyst): follow-up due." }), run), "PASS");
    });

    await t.step("F9 memory across threads", async () => {
      const at = new Date(Date.now() - 1000).toISOString();
      const a = turn({ at, threadId: T_U, reply: "Noted." }), b = turn({ threadId: T_U2, reply: "You are a junior majoring in Economics." });
      is((await C.memoryAcrossThreads(db(), a, b, run, ["junior", "economics"]))[1], "FAIL", "no events");
      await seed(`insert into career_events (user_id, at, kind, subject, source) values ('${U}', now(), 'fact_confirmed', 'year: junior', 'chat'), ('${U}', now(), 'fact_confirmed', 'majors: economics', 'chat');
        insert into career_watch_kv (user_id, key, value) values ('${U}', 'career:account', '{"epoch":0,"version":1,"paused":false,"memory":{"v":1}}')
        on conflict (user_id, key) do update set value = excluded.value`);
      is(await C.memoryAcrossThreads(db(), a, b, run, ["junior", "economics"]), "PASS");
      is((await C.memoryAcrossThreads(db(), a, turn({ threadId: T_U2, reply: "Nothing is on your record yet." }), run, ["junior", "economics"]))[0], "FAIL", "forgotten");
      is((await C.memoryAcrossThreads(db(), a, { ...b, threadId: T_U }, run, ["junior", "economics"]))[0], "FAIL", "same thread");
    });

    await t.step("F10 outreach drafts wait for approval", async () => {
      const at = new Date(Date.now() - 1000).toISOString();
      const t1 = turn({ at, reply: "Drafted 1/1. Say send 1 to send it." });
      is(await C.outreachDrafted(db(), t1, run, "@example.test"), "FAIL", "no row");
      await seed(`insert into career_outreach_drafts (user_id, batch_id, thread_id, n, recipient, recipient_email, subject, body, footer, hash)
        values ('${U}', gen_random_uuid(), '${T_U}', 1, '{}', 'riley.verifytest@example.test', 'Hi', 'Body', 'Alex', '${H("d")}')`);
      is(await C.outreachDrafted(db(), t1, run, "@example.test"), "PASS");
      is(await C.outreachDrafted(db(), turn({ at, reply: "Drafted 2/2." }), run, "@example.test"), "FAIL", "count");
      is(await C.outreachDrafted(db(), turn({ at, reply: "Drafting is not switched on; nothing is drafted." }), run, "@example.test"), "FAIL", "off");
      await seed(`update career_outreach_drafts set status = 'sent', sent_at = now() where user_id = '${U}'`);
      is(await C.outreachDrafted(db(), t1, run, "@example.test"), "FAIL", "sent");
      await seed(`update career_outreach_drafts set status = 'shown', sent_at = null, recipient_email = 'someone@gmail.com' where user_id = '${U}'`);
      is(await C.outreachDrafted(db(), t1, run, "@example.test"), "FAIL", "a real address");
      assertEquals(C.importCount("Connections.csv: imported 3/3 rows into your contacts"), { imported: 3, of: 3 });
    });

    await t.step("F11 mock_done matches the debrief", async () => {
      const r3 = { ...run, startedAt: new Date(Date.now() - 60_000).toISOString() };
      const debrief = turn({ reply: "Weak spots kept for a drill: SQL.\nNext steps: ..." });
      is(await C.mockDone(db(), r3, debrief), "FAIL", "no event");
      await seed(`insert into career_events (user_id, at, kind, subject, detail) values ('${U}', now(), 'mock_done', 'Software Engineer at Acme', '{"answers":[{"skill":"SQL","weak":true},{"skill":"statistics","weak":false}]}')`);
      is(await C.mockDone(db(), r3, debrief), "PASS");
      is(await C.mockDone(db(), r3, turn({ reply: "Weak spots kept for a drill: statistics." })), "FAIL", "wrong weak spot");
    });

    await t.step("F14 the receipts reply agrees with career_apply_receipts", async () => {
      is(await C.receiptReplyMatches(db(), turn({ reply: "No application receipts are on record yet. Each application gets one when it finishes." }), run), "PASS");
      is(await C.receiptReplyMatches(db(), turn({ reply: "Your application receipts, newest first: Acme" }), run), "FAIL", "invented");
    });

    await t.step("TG link and turn", async () => {
      is((await C.telegramLinked(db(), run, "42")).result, "NOT_RUN", "unlinked");
      await seed(`insert into channel_contacts (contact, user_id, channel, address) values ('tg:42', '${V}', 'telegram', '42')`);
      is((await C.telegramLinked(db(), run, "42")).result, "FAIL", "another account");
      await seed(`update channel_contacts set user_id = '${U}' where contact = 'tg:42'`);
      is((await C.telegramLinked(db(), run, "42")).result, "PASS");
      const at = new Date(Date.now() - 1000).toISOString();
      is(await C.telegramTurnRecorded(db(), run, at, "what do you know about me?"), "FAIL", "not recorded");
      await seed(`insert into agent_messages (thread_id, role, content) values ('${T_U2}', 'user', 'what do you know about me?'), ('${T_U2}', 'assistant', 'You are a junior.')`);
      is(await C.telegramTurnRecorded(db(), run, at, "what do you know about me?"), "PASS");
    });

    await t.step("ERASE erased, and SAFETY no foreign writes", async () => {
      is(await C.eraseErased(db(), run), "FAIL", "everything is still there");
      await seed(`delete from career_events where user_id = '${U}'; delete from career_alert_prefs where user_id = '${U}'; delete from career_outreach_drafts where user_id = '${U}';
        delete from career_mail_drafts where user_id = '${U}'; delete from career_watch_kv where user_id = '${U}' and key <> 'career:account';
        update career_watch_kv set value = '{"epoch":1,"version":2,"paused":true}' where user_id = '${U}' and key = 'career:account'`);
      is(await C.eraseErased(db(), run), "PASS");
      await seed(`update career_watch_kv set value = '{"epoch":1,"version":2,"paused":false}' where user_id = '${U}' and key = 'career:account'`);
      is((await C.eraseErased(db(), run))[1], "FAIL", "not paused");
      await seed(`insert into career_watch_kv (user_id, key, value) values ('${U}', 'career:turn:${T_U}:k', '{"hash":"h","response":{"reply":"kept"}}')`);
      is((await C.eraseErased(db(), run))[0], "FAIL", "a turn receipt kept its reply");
      is(await C.noForeignWrites(db(), run, [T_U, T_U2]), "PASS");
      is(await C.noForeignWrites(db(), run, [T_U, T_V]), "FAIL", "another account's thread");
      await seed(`insert into career_outreach_drafts (user_id, batch_id, thread_id, n, recipient, recipient_email, subject, body, footer, hash)
        values ('${V}', gen_random_uuid(), '${T_U}', 1, '{}', 'x@example.test', 'Hi', 'Body', 'X', '${H("9")}')`);
      is(await C.noForeignWrites(db(), run, [T_U, T_U2]), "FAIL", "another account's draft in the test account's thread");
      await seed(`delete from career_outreach_drafts where user_id = '${V}'`);
      is(await C.noForeignWrites(db(), run, []), "NOT_RUN");
    });

    await t.step("SAFETY no queue row, and ACCOUNT no apply authority (each kind refused)", async () => {
      is(await C.noQueueRow(db(), run), "PASS");
      await seed(`insert into career_apply_wanted (user_id, posting_key, url) values ('${U}', 'greenhouse:acme:1', 'https://boards.greenhouse.io/acme/jobs/1')`);
      is(await C.noQueueRow(db(), run), "FAIL", "a queue row");
      await assertRejects(() => C.assertNoApplyAuthority(db(), U), Error, "queued applications");
      await seed(`delete from career_apply_wanted where user_id = '${U}'`);
      await C.assertNoApplyAuthority(db(), U);
      const kinds: [string, string, string][] = [
        ["career_apply_cloud_optin", `insert into career_apply_cloud_optin (user_id) values ('${U}')`, "a cloud opt-in"],
        ["career_apply_batch_approvals", "", "a batch approval"],
        ["extension_submission_reports", "", "an extension submission record"],
        ["career_apply_jobs", `set session_replication_role = replica; insert into career_apply_jobs (user_id, job_id, company, url, payload, payload_hash, approval_hash, state) values ('${U}', 'j', 'Acme', 'https://x.test/1', '{}', '${H("a")}', '${H("a")}', 'queued'); set session_replication_role = origin;`, "an application job"],
        ["career_apply_cards", `set session_replication_role = replica; insert into career_apply_cards (user_id, items, state, shown_at, answered_at) values ('${U}', '[{"n":1}]', 'answered', now(), now())`, "an answered card"],
        ["career_cloud_settings", `insert into career_cloud_settings (key, value) values ('gate_user_ids', '${U}') on conflict (key) do update set value = excluded.value`, "career_cloud_settings"],
      ];
      for (const [table, insert, what] of kinds) {
        let sql = insert;
        if (!sql) {
          // Fill every required column with a value of its type, so the row exists for this account.
          const cols = (await pg!.sql(`select string_agg(column_name || ':' || udt_name, ',') from information_schema.columns where table_schema = 'public' and table_name = '${table}' and is_nullable = 'NO' and column_default is null and column_name <> 'user_id'`)).split(",").filter(Boolean);
          const val = (t: string) => t === "uuid" ? "gen_random_uuid()" : t === "jsonb" || t === "json" ? "'{}'" : /^int|^float|^numeric/.test(t) ? "1" : t === "bool" ? "true" : t === "timestamptz" ? "now()" : t === "_text" ? "'{}'" : `'${H("b")}'`;
          sql = `set session_replication_role = replica; insert into public.${table} (user_id${cols.map((c) => `, ${c.split(":")[0]}`).join("")}) values ('${U}'${cols.map((c) => `, ${val(c.split(":")[1])}`).join("")}); set session_replication_role = origin;`;
        }
        await seed(sql);
        await assertRejects(() => C.assertNoApplyAuthority(db(), U), Error, what, table);
        await seed(table === "career_cloud_settings" ? `delete from career_cloud_settings where key = 'gate_user_ids'` : `set session_replication_role = replica; delete from public.${table} where user_id = '${U}'; set session_replication_role = origin;`);
      }
      await C.assertNoApplyAuthority(db(), U);
    });

    await t.step("the owner checks' SQL: every statement is a read and runs on the career schema", async () => {
      // user_oauth_connections as the live project has it (read 2026-10-26), when the flow schema lacks it.
      await seed(`create table if not exists public.user_oauth_connections (user_id uuid, provider text, vault_name text, email text, scopes text, connected_at timestamptz)`);
      const text = (await Deno.readTextFile(new URL("../../scripts/live/owner-checks.sql", import.meta.url))).replace(/--[^\n]*/g, "");
      const stmts = text.split(";").map((s) => s.trim()).filter(Boolean);
      assert(stmts.length >= 9, `${stmts.length} statements`);
      for (const s of stmts) {
        const sql = s.replaceAll("YOUR_EMAIL", U_EMAIL);
        L.assertReadOnlySql(sql);
        await db().rows(sql);
      }
    });
  } finally {
    await conn?.end();
    await pg?.stop();
    pg = null; conn = null;
  }
} });

// ------------------------------------------------------------------------------------------------ a whole run
Deno.test({ name: "live verify: a run refuses a non-test account and calls nothing; a run against a dead product FAILS and stays in its lane", sanitizeResources: false, sanitizeOps: false, async fn() {
  if (skip()) return;
  const p = await startPg();
  try {
    await p.sql(`alter table auth.users add column if not exists raw_app_meta_data jsonb not null default '{}'::jsonb;
      insert into auth.users (id, email, raw_app_meta_data) values ('${U}', '${U_EMAIL}', '{"trainee_test_account": true}'), ('${V}', 'real.person@example.com', '{}');
      insert into public.profiles (id) values ('${U}'), ('${V}');`);
    const ro = await readOnlyConnection(p);
    const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    const jwt = (sub: string) => `${b64({ alg: "HS256" })}.${b64({ sub, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
    const out = await Deno.makeTempDir();
    const calls: { url: string; method: string; auth: string | null; body: string }[] = [];
    const dead = (async (i: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(i), method: String(init?.method ?? "GET"), auth: new Headers(init?.headers).get("authorization"), body: String(init?.body ?? "") });
      return new Response('{"error":"internal"}', { status: 500 });
    }) as typeof fetch;
    const env = (sub: string) => (k: string) => ({ SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst", LIVE_VERIFY_DB_URL: "postgres://x", UPMORE_TEST_JWT: jwt(sub), TRAINEE_VERIFY_EMAIL: U_EMAIL } as Record<string, string>)[k];
    const quiet = () => {};

    // Nothing given: exit 2, NOT_RUN everywhere, nothing called.
    assertEquals(await main(["--out", out, "--wait-min", "0"], () => undefined, { exec: ro.exec, fetch: dead, log: quiet }), 2);
    assertEquals(calls.length, 0);
    const empty = JSON.parse(await Deno.readTextFile(`${out}/live-verify.json`));
    assert(empty.results.every((r: L.Result) => r.status === "NOT_RUN"));

    // A real person's JWT: refused before any call.
    assertEquals(await main(["--out", out, "--wait-min", "0"], env(V), { exec: ro.exec, fetch: dead, log: quiet }), 2);
    assertEquals(calls.length, 0, "nothing is called as a real person");

    // The test account against a product that answers 500 to everything: the run completes, FAILs, never PASSes a
    // feature, and every request went to a door the guard allows, as the test account.
    const before = await p.sql(`select (select count(*) from career_events) || ',' || (select count(*) from career_watch_kv) || ',' || (select count(*) from agent_messages)`);
    assertEquals(await main(["--out", out, "--wait-min", "0"], env(U), { exec: ro.exec, fetch: dead, log: quiet }), 1);
    const report = JSON.parse(await Deno.readTextFile(`${out}/live-verify.json`));
    const feat = report.results.filter((r: L.Result) => /^F\d+$|^E2E$/.test(r.feature));
    assert(feat.length >= 30, `${feat.length} feature checks`);
    // Only state checks may pass here (the schema is present, the empty job table breaks no invariant); no check of a
    // reply or of what a reply caused may.
    const stateOnly = (c: string) => /\.schema$/.test(c);
    assertEquals(feat.filter((r: L.Result) => r.status === "PASS" && !stateOnly(r.check)).map((r: L.Result) => r.check), [], "a dead product passes nothing");
    // The audit checks a reply decides, and the erase checks, pass nothing either (an erase that did not run is NOT_RUN,
    // never an empty-and-therefore-PASS).
    const replyDriven = report.results.filter((r: L.Result) => /^AUDIT\.(?:B2|B6|Q2|Q3|S2|S3|R1|Q4)\.|^ERASE\.|^USER\./.test(r.check));
    assert(replyDriven.length >= 30, `${replyDriven.length} reply-driven audit, erase and new-user checks`);
    assertEquals(replyDriven.filter((r: L.Result) => r.status === "PASS").map((r: L.Result) => r.check), [], "no reply-driven audit, erase or new-user check passes on a dead product");
    assertEquals(report.results.filter((r: L.Result) => r.check === "ERASE.erased" || r.check === "AUDIT.S2.erase_covers_every_table").map((r: L.Result) => r.status), ["NOT_RUN", "NOT_RUN"]);
    assert(report.summary.not_run > 0 && report.summary.pass < report.summary.total, "NOT_RUN counted as not passed");
    assert(report.results.some((r: L.Result) => r.check === "ACCOUNT.test_account" && r.status === "PASS"));
    for (const c of calls) {
      const path = new URL(c.url).pathname;
      if (c.method === "POST") {
        assert(["/functions/v1/agent-chat", "/functions/v1/career-cloud-runner/dispatch"].includes(path), path);
        if (path === "/functions/v1/agent-chat") {
          assertEquals(L.jwtSubject(c.auth!.replace(/^Bearer /, "")).sub, U);
          const m = JSON.parse(c.body).message;
          assert(!L.APPROVING.test(m) || m === L.RESUME_CONFIRMATION, c.body);
          assert(!L.APPLYING.test(m) || L.APPLY_PROBES.has(m), `an apply ask was sent: ${m}`);
        }
      }
    }
    assert(calls.some((c) => c.url.endsWith("/functions/v1/agent-chat")));
    assert(report.results.some((r: L.Result) => r.check === "ACCOUNT.read_only_role" && r.status === "PASS"));
    assert(report.results.some((r: L.Result) => r.check === "SAFETY.no_queue_row" && r.status === "PASS"));

    const after = await p.sql(`select (select count(*) from career_events) || ',' || (select count(*) from career_watch_kv) || ',' || (select count(*) from agent_messages)`);
    assertEquals(after, before, "the suite itself wrote nothing to the database");
    const md = await Deno.readTextFile(`${out}/live-verify.md`);
    assert(md.includes("| F12 Offer benchmark |") && !md.includes(jwt(U)), "the matrix is written and carries no secret");
    // A test account holding apply authority (here: a cloud opt-in) is refused before any call.
    const n0 = calls.length;
    await p.sql(`alter table career_apply_cloud_optin disable trigger user; insert into career_apply_cloud_optin (user_id) values ('${U}')`).catch(async () => {
      const cols = await p.sql(`select string_agg(column_name || ':' || data_type, ',') from information_schema.columns where table_name = 'career_apply_cloud_optin' and is_nullable = 'NO' and column_default is null`);
      throw new Error(`seed the opt-in: ${cols}`);
    });
    assertEquals(await main(["--out", out, "--wait-min", "0"], env(U), { exec: ro.exec, fetch: dead, log: quiet }), 2);
    assertEquals(calls.length, n0, "nothing is called while the test account holds apply authority");
    const refused = JSON.parse(await Deno.readTextFile(`${out}/live-verify.json`));
    assert(refused.results.some((r: L.Result) => r.check === "ACCOUNT.test_account" && /apply authority: a cloud opt-in/.test(r.reason)), JSON.stringify(refused.results.slice(0, 4)));

    await Deno.remove(out, { recursive: true });
    await ro.end();
  } finally {
    await p.stop();
  }
} });
