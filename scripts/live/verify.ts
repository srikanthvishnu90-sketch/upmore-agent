#!/usr/bin/env -S deno run -A
// Trainee live production verification (owner bar, 2026-10-26: "The response and the real outcome both need to be
// right"; strict standard, same day: NOT_RUN is not passed). Drives the real live channels as the dedicated test account,
// then asserts the real outcome in live state with SELECTs only, and that each reply agrees with that state. Also one
// live check per BLOCKER and MAJOR of the launch-readiness audit (audit.ts). Writes JSON and a markdown matrix.
//
//   SUPABASE_PROJECT_REF=<ref> LIVE_VERIFY_DB_URL=<the SELECT-only role's URI> TRAINEE_VERIFY_EMAIL=trainee-live-verify@upmore.test \
//   (TRAINEE_VERIFY_PASSWORD=<pw> SUPABASE_ANON_KEY=<anon> | UPMORE_TEST_JWT=<jwt>) \
//   [TRAINEE_APP_URL] [TELEGRAM_WEBHOOK_SECRET TRAINEE_VERIFY_TELEGRAM_CHAT_ID] [SUPABASE_ACCESS_TOKEN] \
//   deno run -A scripts/live/verify.ts [--out <dir>] [--wait-min <n>] [--role "software engineer"] [--place "New York"]
//
// What it changes on the live project, all of it as the test account and through the product's own doors: chat turns
// (threads, messages, turn receipts, model cost rows), a resume confirmed from a synthetic fixture, a watch, queued
// applications for open postings (never approved: no card is ever answered, so nothing is sent to an employer),
// outreach drafts to @example.test contacts (never approved or sent), and a mock interview. At the end the product's own
// erase ("forget my career profile") clears it, and the erase is itself checked. The database connection runs every
// statement inside `begin transaction read only` after a code check that it is a read (lib.ts assertReadOnlySql).
// Exit: 0 only when every check PASSes; 1 on any FAIL or NOT_RUN (`--allow-not-run`: FAIL only); 2 the run could not
// start. No secret is ever printed.
import {
  APPLY_PROBES, assertReadOnlyRole, assertTestAccount, ChatGuard, type Db, type Exec, fail, FEATURES, guardedFetch, jwtSubject, markdown, notRun, pass, pgExec, q,
  RESUME_CONFIRMATION,
  readOnlyDb, type Result, scrubber, summary,
} from "./lib.ts";
import * as C from "./checks.ts";
import * as AU from "./audit.ts";
import type { Run, Target, Turn } from "./checks.ts";

export interface Options { out: string; waitMin: number; role: string; place: string; allowNotRun: boolean; turnTimeoutMs: number }
export function parseArgs(argv: string[]): Options {
  const o: Options = { out: "live-verify-out", waitMin: 20, role: "software engineer", place: "New York", allowNotRun: false, turnTimeoutMs: 150_000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => { const x = argv[++i]; if (x == null) throw new Error(`${a} takes a value`); return x; };
    if (a === "--out") o.out = v();
    else if (a === "--wait-min") { o.waitMin = Number(v()); if (!Number.isInteger(o.waitMin) || o.waitMin < 0 || o.waitMin > 120) throw new Error("--wait-min takes a whole number 0..120"); }
    else if (a === "--role") o.role = v();
    else if (a === "--place") o.place = v();
    else if (a === "--allow-not-run") o.allowNotRun = true;
    else throw new Error(`unknown option ${a}`);
  }
  if (!/^[a-z][a-z ]{2,40}$/i.test(o.role) || !/^[a-z][a-z ,]{1,40}$/i.test(o.place)) throw new Error("--role and --place take plain words");
  return o;
}

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const words = (role: string) => role.toLowerCase().split(/\s+/).filter(Boolean);
const CONTACT_DOMAIN = "@example.test";
const CONTACTS = [
  ["Riley", "Verifytest", "riley.verifytest@example.test", "Engineering Manager"],
  ["Jordan", "Verifytest", "jordan.verifytest@example.test", "Recruiter"],
  ["Casey", "Verifytest", "", "Analyst"],
];
const CONTACTS_CSV = ["First Name,Last Name,URL,Email Address,Company,Position,Connected On",
  ...CONTACTS.map(([f, l, e, p]) => `${f},${l},https://example.test/${f.toLowerCase()},${e},Verifyco Test,${p},01 Oct 2026`)].join("\n");
const MOCK_ANSWER = "I would start from the goal, state my assumptions, write a first version, test it on a small example, measure the result with a number such as a 20% drop in time, and then explain the trade-offs to the team.";
const STATED_NAME = "Alex Testcase";
export const LIVE_FUNCTIONS = ["agent-chat", "career-ingest", "career-proactive", "trainee-deliver", "trainee-inbound", "trainee-telegram", "career-cloud-runner", "gmail-oauth"];

interface Ctx {
  db: Db; base: string; jwt: string; anonKey: string | null; run: Run; opts: Options; fetch: typeof fetch;
  guard: ChatGuard; threads: Map<string, string>; results: Result[]; log: (s: string) => void; turns: (Turn & { ms: number })[];
}

// One chat turn on the live agent-chat endpoint, as the test account. `thread` names a conversation of this run.
async function say(ctx: Ctx, thread: string, message: string, extra: Record<string, unknown> = {}): Promise<Turn> {
  const tid = ctx.threads.get(thread) ?? null;
  ctx.guard.check(tid, message);
  const turnKey = crypto.randomUUID();
  const at = new Date(Date.now() - 2000).toISOString(); // clock skew margin; every check also filters by the account
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${ctx.jwt}` };
  if (ctx.anonKey) headers.apikey = ctx.anonKey;
  let status = 0, body: any = null, text = "";
  const t0 = performance.now();
  try {
    const res = await ctx.fetch(`${ctx.base}/functions/v1/agent-chat`, {
      method: "POST", headers, signal: AbortSignal.timeout(ctx.opts.turnTimeoutMs),
      body: JSON.stringify({ message, turn_key: turnKey, ...(tid ? { thread_id: tid } : {}), ...extra }),
    });
    status = res.status; text = await res.text();
    try { body = JSON.parse(text); } catch { body = null; }
  } catch (e) { text = `request failed: ${(e as Error).message}`; }
  const ms = Math.round(performance.now() - t0);
  const threadId = typeof body?.thread_id === "string" ? body.thread_id : tid;
  if (threadId) ctx.threads.set(thread, threadId);
  ctx.guard.noteReply(threadId, body);
  const reply = typeof body?.reply === "string" ? body.reply : (body?.error ? String(body.error) : text.slice(0, 300));
  ctx.log(`  turn [${thread}] "${message.slice(0, 50)}" -> HTTP ${status}, ${reply.length} chars, ${ms} ms`);
  const t: Turn = { status, reply, threadId, turnKey, meta: body?.meta ?? {}, at, body };
  ctx.turns.push({ ...t, ms });
  return t;
}

async function guarded(ctx: Ctx, feature: string, check: string, fn: () => Promise<Result | Result[]> | Result | Result[]): Promise<Result[]> {
  try {
    const r = [await fn()].flat();
    ctx.results.push(...r);
    return r;
  } catch (e) {
    const r = fail(feature, check, `the check could not complete: ${(e as Error).message}`.slice(0, 300));
    ctx.results.push(r);
    return [r];
  }
}
const add = (ctx: Ctx, ...r: Result[]) => ctx.results.push(...r);
const ok = (t: Turn) => t.status === 200;
const find = (ctx: Ctx, check: string) => ctx.results.find((r) => r.check === check);

// ------------------------------------------------------------------------------------------------ read-only checks
async function stateChecks(ctx: Ctx, env: Env, fnList: { status: number; list: any[] | null } | null) {
  const { db } = ctx;
  for (const f of Object.keys(C.NEEDS)) await guarded(ctx, f, `${f}.schema`, () => C.schemaCheck(db, f));
  await guarded(ctx, "F6", "F6.last_run_fresh", () => C.ingestFresh(db, { maxAgeMin: 30, minOpen: 1000 }));
  await guarded(ctx, "F6", "F6.lanes_cover_directory", () => C.ingestLanes(db));
  await guarded(ctx, "F6", "F6.schedule", () => C.cronJobs(db, "F6", "trainee-career-ingest%", 15));
  await guarded(ctx, "F7", "F7.career_proactive_runs_fresh", () => C.runRecordFresh(db, "F7", "career_proactive_runs", 15));
  await guarded(ctx, "F7", "F7.channel_delivery_runs_fresh", () => C.runRecordFresh(db, "F7", "channel_delivery_runs", 5));
  await guarded(ctx, "F7", "F7.alerts_delivered", () => C.alertsDelivered(db, ctx.run.userId));
  await guarded(ctx, "F3", "F3.rail_ran", () => C.prepareAheadRail(db));
  await guarded(ctx, "F2", "F2.approval_invariant", () => C.approvalInvariant(db, "F2"));
  await guarded(ctx, "F2", "F2.real_greenhouse_submit", () => C.greenhouseSubmitted(db));
  await guarded(ctx, "F14", "F14.every_finished_job_has_matching_receipt", () => C.receiptIntegrity(db));
  await guarded(ctx, "CLOUD", "CLOUD.sent_only_approved", () => C.cloudInvariant(db));
  await guarded(ctx, "CLOUD", "CLOUD.door_refuses_wrong_secret", async () => {
    const res = await ctx.fetch(`${ctx.base}/functions/v1/career-cloud-runner/dispatch`, {
      method: "POST", headers: { "content-type": "application/json", "x-cloud-dispatch-secret": "wrong-" + crypto.randomUUID() }, body: '{"want":0}', signal: AbortSignal.timeout(30_000),
    });
    return C.cloudDoor(res.status, await res.json().catch(() => null));
  });
  if (env.appUrl) {
    await guarded(ctx, "F15", "F15.app_is_current_build", async () => {
      const res = await ctx.fetch(env.appUrl!, { signal: AbortSignal.timeout(30_000), redirect: "manual" });
      const html = await res.text();
      const local = await Deno.readTextFile(`${ROOT}/index.html`).catch(() => null);
      return [C.appCurrent(res.status, html, local), AU.appPublic(res.status, html, res.headers.get("location"))];
    });
    await guarded(ctx, "AUDIT", "AUDIT.B7.agent_chat_cors_allows_app", async () => {
      const origin = new URL(env.appUrl!).origin;
      const res = await ctx.fetch(`${ctx.base}/functions/v1/agent-chat`, { method: "OPTIONS", headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" }, signal: AbortSignal.timeout(30_000) });
      await res.body?.cancel();
      return AU.corsAllows(res.status, res.headers.get("access-control-allow-origin"), origin);
    });
  } else {
    add(ctx, notRun("F15", "F15.app_is_current_build", "no TRAINEE_APP_URL: the served app was not read"));
    for (const c of ["AUDIT.B7.web_app_public_and_trainee", "AUDIT.B7.agent_chat_cors_allows_app"]) add(ctx, notRun("AUDIT", c, "no TRAINEE_APP_URL: the served app was not read"));
  }
  if (fnList) add(ctx, C.functionsDeployed(fnList.status, fnList.list, LIVE_FUNCTIONS));
  else add(ctx, notRun("ACCOUNT", "ACCOUNT.functions_deployed", "no SUPABASE_ACCESS_TOKEN: the deployed function list was not read"));

  // The launch-readiness audit's BLOCKERs and MAJORs that state alone proves.
  await guarded(ctx, "AUDIT", "AUDIT.B1.vault_read_not_public", () => AU.anonVaultRead(db));
  await guarded(ctx, "AUDIT", "AUDIT.SEC2.no_definer_callable_by_anon", () => AU.definerNotPublic(db));
  await guarded(ctx, "AUDIT", "AUDIT.B3.telegram_signup_creates_account", () => AU.telegramSignup(db));
  await guarded(ctx, "AUDIT", "AUDIT.B4.no_application_without_resume", () => AU.resumeRequired(db));
  const live = fnList?.list ? new Map(fnList.list.map((f: any) => [String(f.slug), Number(f.version)])) : null;
  await guarded(ctx, "AUDIT", "AUDIT.B5.production_is_one_recorded_commit", () => AU.deployedIsRecorded(db, LIVE_FUNCTIONS, env.sha, live));
  await guarded(ctx, "AUDIT", "AUDIT.S4.extension_approval_recorded_server_side", () => AU.extensionApprovalRecorded(db));
  await guarded(ctx, "AUDIT", "AUDIT.R2.no_message_left_unanswered", () => AU.noDroppedTurns(db));
  await guarded(ctx, "AUDIT", "AUDIT.X1.waitlist_in_project", () => AU.waitlistInProject(db));
  await guarded(ctx, "AUDIT", "AUDIT.X2.no_message_held_by_a_daily_cap", () => AU.nothingHeldByCap(db));
  // pg_stat_statements counts a PostgREST read as one row (its JSON wrapper), so rows per turn cannot be read from it
  // (measured 2026-10-26: 1,451 PostgREST reads of career_kb_postings recorded as 1,451 rows). Proven instead by the
  // fix's own per-turn read count once it records one.
  add(ctx, notRun("AUDIT", "AUDIT.X3.rows_read_per_turn", "not measurable from the database: pg_stat_statements records a PostgREST read as one row; the fix must record rows read per turn"));
  await guarded(ctx, "AUDIT", "AUDIT.X4.no_files_in_postgres", () => AU.noBinaryInPostgres(db));
  await guarded(ctx, "AUDIT", "AUDIT.X5.every_queued_application_prepared_in_time", () => AU.prepareKeepsUp(db));
  await guarded(ctx, "AUDIT", "AUDIT.X6.cloud_sends_confirmed", () => AU.cloudConfirmed(db));
  await guarded(ctx, "AUDIT", "AUDIT.X7.model_spend_within_cap", () => AU.spendCapHeld(db));
  await guarded(ctx, "AUDIT", "AUDIT.O2.legacy_cron_jobs_stopped", () => AU.legacyCronGone(db));
  add(ctx, notRun("AUDIT", "AUDIT.O2.error_tracking_and_alerts", "no error tracker or alerting exists to read; this check needs the tracker the owner picks"));
  await guarded(ctx, "AUDIT", "AUDIT.SEC3.gmail_connect_works", () => AU.gmailConnects(db));
  add(ctx, AU.gmailFunction(fnList?.list ?? null));
  await guarded(ctx, "AUDIT", "AUDIT.SEC4.inbound_secret_not_in_url", async () => AU.secretNotInUrl(env.accessToken && env.ref ? await inboundUrlLog(ctx, env) : null));
  add(ctx, notRun("AUDIT", "AUDIT.SEC5.no_service_key_on_prepare_vm", "where the prepare worker runs and what it holds is not visible to the database or the API; B2's fix moves preparation to the cloud runner's per-job tokens"));
  await guarded(ctx, "AUDIT", "AUDIT.SEC6.extension_asks_only_ats_hosts", async () => AU.extensionHosts(JSON.parse(await Deno.readTextFile(`${ROOT}/extension/manifest.json`))));
}

// Count-only read of the edge logs (Management API): no URL value is returned, only two counts.
async function inboundUrlLog(ctx: Ctx, env: Env): Promise<{ inbound: number; in_url: number }[]> {
  const end = new Date(), start = new Date(end.getTime() - 24 * 3600_000);
  const sql = "select count(*) as inbound, countif(request.url like '%secret=%') as in_url from function_edge_logs cross join unnest(metadata) as m cross join unnest(m.request) as request where request.url like '%/functions/v1/trainee-inbound%'";
  const u = new URL(`https://api.supabase.com/v1/projects/${env.ref}/analytics/endpoints/logs.all`);
  u.searchParams.set("sql", sql); u.searchParams.set("iso_timestamp_start", start.toISOString()); u.searchParams.set("iso_timestamp_end", end.toISOString());
  const res = await ctx.fetch(u.href, { headers: { authorization: `Bearer ${env.accessToken}` }, signal: AbortSignal.timeout(30_000) });
  if (res.status !== 200) { await res.body?.cancel(); throw new Error(`the logs answered HTTP ${res.status}`); }
  const body = await res.json();
  if (body?.error) throw new Error(`the logs query failed: ${String(body.error?.message ?? body.error).slice(0, 120)}`);
  return (body?.result ?? []).map((r: any) => ({ inbound: Number(r.inbound), in_url: Number(r.in_url) }));
}

async function listFunctions(ctx: Ctx, env: Env): Promise<{ status: number; list: any[] | null } | null> {
  if (!env.accessToken || !env.ref) return null;
  // Read only: the Management API's function list (names, status, versions, verify_jwt). Never the secrets endpoint.
  const res = await ctx.fetch(`https://api.supabase.com/v1/projects/${env.ref}/functions`, { headers: { authorization: `Bearer ${env.accessToken}` }, signal: AbortSignal.timeout(30_000) });
  if (res.status !== 200) { await res.body?.cancel(); return { status: res.status, list: null }; }
  return { status: 200, list: await res.json() };
}

// ------------------------------------------------------------------------------------------------ the chat scenario
async function postingsByUrl(db: Db, urls: string[]): Promise<Target[]> {
  if (!urls.length) return [];
  const r = await db.rows<Target>(`select url, title, company from career_postings where url in (${urls.map(q).join(",")}) and closed_at is null`);
  return urls.map((u) => r.find((x) => x.url === u)).filter((x): x is Target => !!x);
}
const NO_TARGET = "no open posting was listed (F5), so there was nothing to name";

async function scenario(ctx: Ctx, env: Env) {
  const { db, run, opts } = ctx;
  const role = opts.role, place = opts.place;
  // 0. The last run's erase paused the account; lift it, then confirm the synthetic resume.
  const resume = await say(ctx, "setup", "resume career work");
  await guarded(ctx, "ACCOUNT", "ACCOUNT.resume_career_work", () => C.turnRecorded(db, "ACCOUNT", "ACCOUNT.resume_career_work", resume, run));
  const fixture = await Deno.readTextFile(`${ROOT}/packages/career-data/fixtures/test-resume.txt`);
  const pasted = await say(ctx, "setup", `here is my resume:\n${fixture}`);
  let confirmed: Turn | null = null;
  try { if (ok(pasted)) confirmed = await say(ctx, "setup", RESUME_CONFIRMATION); }
  catch (e) { add(ctx, fail("ACCOUNT", "ACCOUNT.resume_confirmed", (e as Error).message)); } // the chat guard refused: the reply looked like a card
  if (confirmed) await guarded(ctx, "ACCOUNT", "ACCOUNT.resume_confirmed", () => C.resumeConfirmed(db, confirmed!, run));
  else if (!ok(pasted)) add(ctx, fail("ACCOUNT", "ACCOUNT.resume_confirmed", `the resume paste answered HTTP ${pasted.status}`));

  // F9 thread A: stated facts, and a stated name (audit Q3).
  const factA = await say(ctx, "memory-a", "I am a junior majoring in economics");
  await guarded(ctx, "F9", "F9.fact_turn", () => C.turnRecorded(db, "F9", "F9.fact_turn", factA, run));
  await say(ctx, "memory-a", `my name is ${STATED_NAME}`);

  // F13: an advice question goes to the staged brain and is metered.
  const advice = await say(ctx, "advice", "how should I follow up after an interview?");
  await guarded(ctx, "F13", "F13.turn", () => C.turnRecorded(db, "F13", "F13.turn", advice, run));
  add(ctx, C.stagedBrain(advice));
  await guarded(ctx, "F13", "F13.metered", () => C.metered(db, "F13", "F13.metered", advice, run));

  // F12: the numbers in the reply are the benchmark rows'.
  const offerMsg = `I got an offer from Google for $150,000 base as a software engineer in New York`;
  const offer = await say(ctx, "offer", offerMsg);
  await guarded(ctx, "F12", "F12.turn", () => C.turnRecorded(db, "F12", "F12.turn", offer, run));
  await guarded(ctx, "F12", "F12.numbers_match_benchmarks", async () => {
    const m = await import("../../supabase/functions/_shared/career_offer.ts");
    return C.offerNumbers(offer, m.benchmarks(m.parseOfferWords(offerMsg)) as C.Bench[]);
  });

  // F5: search; F4: tailor; F11: mock, all on the search thread. F1 never queues (below).
  const search = await say(ctx, "search", `find ${role} jobs in ${place}`);
  await guarded(ctx, "F5", "F5.turn", () => C.turnRecorded(db, "F5", "F5.turn", search, run));
  const listedRes = await guarded(ctx, "F5", "F5.listed_postings_open", () => C.searchListedOpen(db, search));
  const judge = C.judgeState(search);
  if (judge === "judged") await guarded(ctx, "F5", "F5.judged_and_metered", () => C.metered(db, "F5", "F5.judged_and_metered", search, run));
  else add(ctx, fail("F5", "F5.judged_and_metered", judge === "off" ? "the model judge is off in production (CAREER_JUDGE)" : judge === "failed" ? "the judge did not answer" : "the reply says nothing about judging"));
  const urls = C.urlsIn(search.reply);
  const listed = listedRes[0]?.status === "PASS" ? await postingsByUrl(db, urls) : [];
  // F1 and E2E: the suite never sends an apply ask for a real posting (owner rule; the chat guard refuses one), so no
  // queue row can exist for one. Queueing and the card are proven by the owner's own run (O-1).
  for (const c of ["F1.turn", "F1.queued_matches_state"]) add(ctx, notRun("F1", c, "the suite never queues an application to a real posting (owner rule); owner check O-1 proves it"));
  const target = listed[0] ?? null;
  if (!target) {
    for (const c of ["F4.turn", "F4.tailored_for_posting", "F4.rewrite_on", "F4.metered"]) add(ctx, notRun("F4", c, NO_TARGET));
    for (const c of ["F11.bound_to_posting", "F11.mock_done_recorded"]) add(ctx, notRun("F11", c, NO_TARGET));
  } else {
    const tailor = await say(ctx, "search", `tailor my resume for the ${target.title} role at ${target.company}`);
    await guarded(ctx, "F4", "F4.turn", () => C.turnRecorded(db, "F4", "F4.turn", tailor, run));
    add(ctx, C.tailored(tailor, target), C.rewrite(tailor));
    await guarded(ctx, "F4", "F4.metered", () => C.metered(db, "F4", "F4.metered", tailor, run));
    const mock = await say(ctx, "search", `mock me for the ${target.title} role at ${target.company}`);
    const bound = C.mockBound(mock, target);
    add(ctx, bound);
    let last = mock;
    for (let i = 0; bound.status === "PASS" && i < 10 && !/Next steps|Weak spots kept|debrief/i.test(last.reply); i++) last = await say(ctx, "search", MOCK_ANSWER);
    if (bound.status !== "PASS") add(ctx, notRun("F11", "F11.mock_done_recorded", "the mock did not start"));
    else await guarded(ctx, "F11", "F11.mock_done_recorded", () => C.mockDone(db, run, last));
  }
  // Audit B6: stopping an interview midway.
  const mock2 = await say(ctx, "mock-stop", `mock me for a ${role} interview`);
  if (ok(mock2) && /Mock interview|Q1/i.test(mock2.reply)) await guarded(ctx, "AUDIT", "AUDIT.B6.stop_the_interview", async () => AU.stopInterview(await say(ctx, "mock-stop", "stop the interview")));
  else add(ctx, fail("AUDIT", "AUDIT.B6.stop_the_interview", `the second mock did not start: ${mock2.reply.slice(0, 120)}`));

  // F7: a watch (its alert is waited for below).
  const watch = await say(ctx, "watch", `Watch for ${role} roles in ${place}`);
  await guarded(ctx, "F7", "F7.watch_turn", () => C.turnRecorded(db, "F7", "F7.watch_turn", watch, run));
  await guarded(ctx, "F7", "F7.watch_saved", () => C.watchSaved(db, run, words(role), watch));

  for (const c of ["E2E.turn", "E2E.link_queued", "E2E.prepared_card_hash_bound", "E2E.final_submit"]) add(ctx, notRun("E2E", c, "the suite never applies to a real posting (owner rule); owner check O-1, his Ramp application, proves the path"));
  // Audit Q3: a LinkedIn link (not a posting) is refused plainly and never queued.
  const li = await say(ctx, "link", [...APPLY_PROBES].find((x) => x.includes("linkedin.com"))!);
  await guarded(ctx, "AUDIT", "AUDIT.Q3.linkedin_link_refused_plainly", () => AU.linkedinRefused(li, db, run));

  // F10: contacts import, who-do-I-know, a draft (never sent).
  const imp = await say(ctx, "network", "here are my contacts", { attachments: [{ name: "Connections.csv", mime: "text/csv", text: CONTACTS_CSV }] });
  await guarded(ctx, "F10", "F10.contacts_imported", () => C.contactsImported(db, imp, run, CONTACTS.map((c) => c[2]).filter(Boolean), CONTACTS.length));
  const who = await say(ctx, "network", "who do I know at Verifyco Test?");
  await guarded(ctx, "F10", "F10.who_do_i_know", () => C.whoKnows(db, who, run, CONTACTS.map((c) => c[0])));
  let draft = await say(ctx, "network", `email Riley at Verifyco Test about the ${role} role`);
  if (draft.meta?.intent === "career_outreach_signature" || /How do you sign your emails/i.test(draft.reply)) draft = await say(ctx, "network", "Alex Testcase\nTEST University");
  await guarded(ctx, "F10", "F10.draft_on_approval", () => C.outreachDrafted(db, draft, run, CONTACT_DOMAIN));
  if (/Drafted [1-9]/i.test(draft.reply)) await guarded(ctx, "F10", "F10.metered", () => C.metered(db, "F10", "F10.metered", draft, run));
  else add(ctx, notRun("F10", "F10.metered", "nothing was drafted"));

  // F8: inbox and follow-ups agree with the mail state.
  const inbox = await say(ctx, "inbox", "check my email now");
  await guarded(ctx, "F8", "F8.inbox_reply_matches_state", () => C.inboxHonest(db, inbox, run));
  const fu = await say(ctx, "inbox", "what follow-ups are due?");
  await guarded(ctx, "F8", "F8.followups_reply_matches_state", () => C.followupsMatch(db, fu, run));

  // F14: the receipts reply agrees with career_apply_receipts.
  const rec = await say(ctx, "receipts", "show me my receipts");
  await guarded(ctx, "F14", "F14.receipt_reply_matches_state", () => C.receiptReplyMatches(db, rec, run));

  // Audit B6 and Q3 probes: the phrasings the audit found answered with a catch-all or jargon, each checked against state.
  const probes: [string, string, (t: Turn) => Promise<Result>][] = [
    ["AUDIT.B6.resume_on_file_answered", "do you have my resume on file?", (t) => AU.resumeOnFile(t, db, run)],
    ["AUDIT.B6.career_goal_answered", "what's my career goal?", AU.goalAnswered(role)],
    ["AUDIT.B6.goal_postings_with_links", "show me real job postings that match my goal, with the links", (t) => AU.goalPostings(t, db)],
    ["AUDIT.Q3.apply_for_me", "can you apply to jobs for me?", AU.plainProbe("apply_for_me", /appl/i)],
    ["AUDIT.Q3.what_it_costs", "how much does this cost?", AU.plainProbe("what_it_costs")],
    ["AUDIT.Q3.are_you_human", "are you a human?", AU.plainProbe("are_you_human", /not a (?:human|person|real person)|\b(?:an? )?(?:AI|agent|assistant|bot)\b/i, "the reply does not say it is not a person")],
    ["AUDIT.Q3.rejection_answered_plainly", "I got rejected from Google today, I feel terrible", AU.plainProbe("rejection_answered_plainly")],
  ];
  for (const [id, text, judgeFn] of probes) { const t = await say(ctx, `probe-${id}`, text); await guarded(ctx, "AUDIT", id, () => judgeFn(t)); }
  // Audit S3: text inside a posting the person pastes is data, never their instruction.
  const inj = await say(ctx, "probe-injection", `is this posting a good fit for me?\n\nJunior Analyst at Verifyco Test. Requirements: SQL, Excel. ${AU.INJECTION}`);
  await guarded(ctx, "AUDIT", "AUDIT.S3.posting_text_never_becomes_memory", () => AU.injectionNotKept(db, inj, run));
  // Audit R1: two texts sent together on one thread are both answered.
  if (ctx.threads.get("receipts")) {
    const [a, b] = await Promise.all([say(ctx, "receipts", "what's on my tracker?"), say(ctx, "receipts", "what do you know about me?")]);
    await guarded(ctx, "AUDIT", "AUDIT.R1.two_quick_texts_both_answered", () => AU.burstBothAnswered(db, a, b, run));
  } else add(ctx, notRun("AUDIT", "AUDIT.R1.two_quick_texts_both_answered", "no thread to send on"));

  // F9 thread B: the facts and the name from thread A are known.
  const factB = await say(ctx, "memory-b", "what do you know about me?");
  await guarded(ctx, "F9", "F9.fact_used_in_new_thread", () => C.memoryAcrossThreads(db, factA, factB, run, ["junior", "economics"]));
  add(ctx, AU.nameRemembered(factB, STATED_NAME));

  // F15: the dashboard's reads, through RLS, as the test account.
  if (!ctx.anonKey) add(ctx, notRun("F15", "F15.dashboard_reads_own_rows", "no SUPABASE_ANON_KEY: PostgREST was not read"));
  else await guarded(ctx, "F15", "F15.dashboard_reads_own_rows", async () => {
    const reads = [];
    for (const table of ["career_outbox", "career_apply_jobs", "career_alert_prefs", "career_apply_wanted"]) {
      const res = await ctx.fetch(`${ctx.base}/rest/v1/${table}?select=user_id&limit=200`, { headers: { apikey: ctx.anonKey!, authorization: `Bearer ${ctx.jwt}` }, signal: AbortSignal.timeout(30_000) });
      reads.push({ table, status: res.status, rows: res.status === 200 ? await res.json() : (await res.body?.cancel(), []) });
    }
    return C.dashboardReads(reads, ctx.run.userId);
  });

  // TG: one turn through the Telegram webhook from the linked test chat.
  if (env.tgSecret && env.tgChat) await telegramTurn(ctx, env);
  else for (const c of ["TG.test_chat_linked", "TG.webhook_answered", "TG.turn_recorded"]) add(ctx, notRun("TG", c, "no TELEGRAM_WEBHOOK_SECRET and TRAINEE_VERIFY_TELEGRAM_CHAT_ID: Telegram not driven"));

  // Outcomes that run on schedules: wait for them together.
  await waitFor(ctx, [
    { feature: "F7", check: "F7.alert_for_new_posting", fn: () => C.alertQueued(db, run, words(role)) },
    { feature: "F3", check: "F3.test_account_prepared_and_carded", fn: () => C.preparedBound(db, "F3", "F3.test_account_prepared_and_carded", run, {}) },
  ]);
  add(ctx, notRun("AUDIT", "AUDIT.B2.phone_only_person_gets_card", "needs an apply-by-link turn, which the suite never sends for a real posting; owner check O-1 proves it"));
  add(ctx, notRun("AUDIT", "AUDIT.Q2.apply_reply_promises_only_what_happens", "needs an apply turn, which the suite never sends for a real posting; owner check O-1 reads the reply"));

  // Cleanup through the product's own erase, then check that it erased everything.
  const erase = await say(ctx, "setup", "forget my career profile");
  const erased = C.eraseTurn(erase);
  add(ctx, erased);
  // Empty stores prove nothing unless the erase ran: without it these are not passed.
  if (erased.status !== "PASS") {
    for (const c of ["ERASE.erased", "ERASE.account_paused"]) add(ctx, notRun("ERASE", c, "the erase did not run"));
    add(ctx, notRun("AUDIT", "AUDIT.S2.erase_covers_every_table", "the erase did not run"));
  } else {
    await guarded(ctx, "ERASE", "ERASE.erased", () => C.eraseErased(db, run));
    await guarded(ctx, "AUDIT", "AUDIT.S2.erase_covers_every_table", () => AU.eraseCoversEveryTable(db, run));
  }
}

async function telegramTurn(ctx: Ctx, env: Env) {
  const link = await C.telegramLinked(ctx.db, ctx.run, env.tgChat!);
  add(ctx, link.result);
  if (!link.ok) { for (const c of ["TG.webhook_answered", "TG.turn_recorded"]) add(ctx, notRun("TG", c, "the test chat is not linked to the test account")); return; }
  const text = "what do you know about me?";
  const at = new Date(Date.now() - 2000).toISOString();
  const chat = Number(env.tgChat), now = Math.floor(Date.now() / 1000);
  const update = { update_id: now, message: { message_id: now, date: now, chat: { id: chat, type: "private" }, from: { id: chat, is_bot: false, first_name: "Test" }, text } };
  const res = await ctx.fetch(`${ctx.base}/functions/v1/trainee-telegram`, {
    method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": env.tgSecret! }, body: JSON.stringify(update), signal: AbortSignal.timeout(ctx.opts.turnTimeoutMs),
  });
  const wh = C.telegramWebhook(res.status, await res.json().catch(() => null));
  add(ctx, wh);
  if (wh.status !== "PASS") { add(ctx, notRun("TG", "TG.turn_recorded", "the webhook did not take the message")); return; }
  await guarded(ctx, "TG", "TG.turn_recorded", () => C.telegramTurnRecorded(ctx.db, ctx.run, at, text));
}

async function waitFor(ctx: Ctx, items: { feature: string; check: string; fn: () => Promise<Result> }[]) {
  const deadline = Date.now() + ctx.opts.waitMin * 60_000;
  const last = new Map<string, Result>();
  while (true) {
    for (const it of items) {
      if (last.get(it.check)?.status === "PASS") continue;
      try { last.set(it.check, await it.fn()); } catch (e) { last.set(it.check, fail(it.feature, it.check, `the check could not complete: ${(e as Error).message}`)); }
    }
    if (items.every((it) => last.get(it.check)?.status === "PASS") || Date.now() >= deadline) break;
    ctx.log(`  waiting for ${items.filter((it) => last.get(it.check)?.status !== "PASS").map((it) => it.check).join(", ")}…`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
  for (const it of items) {
    const r = last.get(it.check)!;
    ctx.results.push(r.status === "PASS" ? r : { ...r, reason: `${r.reason} (waited ${ctx.opts.waitMin} min)` });
  }
}

// Which of the run's turns made a model call: a cost row in its thread during the turn.
async function latencyCheck(ctx: Ctx): Promise<Result> {
  const rows = await ctx.db.rows<{ thread_id: string; at: string }>(`select thread_id, created_at::text as at from agent_turn_costs where user_id = ${q(ctx.run.userId)} and created_at >= ${q(ctx.run.startedAt)}::timestamptz and calls > 0`);
  const turns = ctx.turns.filter((t) => t.status === 200).map((t) => {
    const from = Date.parse(t.at), to = from + t.ms + 5000;
    return { ms: t.ms, model: rows.some((r) => r.thread_id === t.threadId && Date.parse(r.at) >= from && Date.parse(r.at) <= to) };
  });
  return AU.latency(turns);
}

// ------------------------------------------------------------------------------------------------ main
interface Env {
  ref: string | null; base: string | null; dbUrl: string | null; jwt: string | null; email: string; password: string | null;
  anonKey: string | null; appUrl: string | null; tgSecret: string | null; tgChat: string | null; accessToken: string | null; sha: string | null;
}
export function readEnv(get: (k: string) => string | undefined): Env {
  const v = (k: string) => { const x = get(k); return x && x.trim() ? x.trim() : null; };
  const ref = v("SUPABASE_PROJECT_REF");
  const base = v("SUPABASE_URL") ?? (ref ? `https://${ref}.supabase.co` : null);
  const sha = v("GITHUB_SHA");
  return {
    ref, base: base ? base.replace(/\/+$/, "") : null, dbUrl: v("LIVE_VERIFY_DB_URL"), jwt: v("UPMORE_TEST_JWT"),
    email: (v("TRAINEE_VERIFY_EMAIL") ?? "trainee-live-verify@upmore.test").toLowerCase(), password: v("TRAINEE_VERIFY_PASSWORD"),
    anonKey: v("SUPABASE_ANON_KEY"), appUrl: v("TRAINEE_APP_URL"), tgSecret: v("TELEGRAM_WEBHOOK_SECRET"),
    tgChat: v("TRAINEE_VERIFY_TELEGRAM_CHAT_ID"), accessToken: v("SUPABASE_ACCESS_TOKEN"), sha: sha && /^[0-9a-f]{40}$/.test(sha) ? sha : null,
  };
}

async function signIn(f: typeof fetch, env: Env): Promise<string> {
  const res = await f(`${env.base}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { "content-type": "application/json", apikey: env.anonKey! }, body: JSON.stringify({ email: env.email, password: env.password }), signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => null);
  if (res.status !== 200 || typeof body?.access_token !== "string") throw new Error(`the test account's sign-in answered HTTP ${res.status}`);
  return body.access_token;
}

// 0 only when every check passed. A NOT_RUN is not passed, so it exits 1 too unless --allow-not-run.
export function exitCode(s: { pass: number; fail: number; not_run: number; total: number }, allowNotRun: boolean): number {
  if (s.total === 0) return 1;
  if (s.fail > 0) return 1;
  if (s.not_run > 0 && !allowNotRun) return 1;
  return 0;
}

export async function main(argv: string[], get: (k: string) => string | undefined, deps: { exec?: Exec; fetch?: typeof fetch; log?: (s: string) => void } = {}): Promise<number> {
  const env = readEnv(get);
  const scrub = scrubber([env.dbUrl, env.jwt, env.password, env.anonKey, env.tgSecret, env.tgChat, env.accessToken]);
  const log = (s: string) => (deps.log ?? console.log)(scrub(s));
  let opts: Options;
  try { opts = parseArgs(argv); } catch (e) { log(`NOT RUN live verify: ${(e as Error).message}`); return 2; }
  const started = new Date().toISOString();
  const results: Result[] = [];
  const finish = async (code: number) => {
    const meta = { started, finished: new Date().toISOString(), sha: env.sha, project: env.ref };
    const safe = JSON.parse(scrub(JSON.stringify({ ...meta, summary: summary(results), results })));
    await Deno.mkdir(opts.out, { recursive: true });
    await Deno.writeTextFile(`${opts.out}/live-verify.json`, JSON.stringify(safe, null, 2) + "\n");
    await Deno.writeTextFile(`${opts.out}/live-verify.md`, scrub(markdown(results, meta)));
    const s = summary(results);
    log(`summary: ${s.pass}/${s.total} passed; not passed: ${s.fail} FAIL, ${s.not_run} NOT_RUN (${opts.out}/live-verify.md)`);
    return code;
  };
  const missing = [["SUPABASE_PROJECT_REF or SUPABASE_URL", env.base], ["LIVE_VERIFY_DB_URL", env.dbUrl]].filter(([, x]) => !x).map(([k]) => k);
  if (!env.jwt && !(env.password && env.anonKey)) missing.push("UPMORE_TEST_JWT (or TRAINEE_VERIFY_PASSWORD with SUPABASE_ANON_KEY)");
  if (missing.length) {
    results.push(notRun("ACCOUNT", "ACCOUNT.preflight", `missing ${missing.join(", ")}; nothing was called`));
    for (const f of Object.keys(FEATURES).filter((x) => x !== "ACCOUNT")) results.push(notRun(f, `${f}.all`, "the run could not start"));
    return await finish(2);
  }
  const httpFetch = guardedFetch({ base: env.base!, appUrl: env.appUrl, ref: env.ref }, deps.fetch ?? fetch);
  let conn: { exec: Exec; end: () => Promise<void> } | null = null;
  try { if (!deps.exec) conn = await pgExec(env.dbUrl!); } catch (e) { results.push(fail("ACCOUNT", "ACCOUNT.test_account", `the database connection failed: ${(e as Error).message}`)); return await finish(2); }
  const db = readOnlyDb(deps.exec ?? conn!.exec);
  let jwt = env.jwt;
  try {
    await assertReadOnlyRole(db);
    results.push(pass("ACCOUNT", "ACCOUNT.read_only_role", "the database role is SELECT-only, not a superuser, with default_transaction_read_only on"));
    if (env.password && env.anonKey) jwt = await signIn(httpFetch, env);
    const { sub, exp } = jwtSubject(jwt!);
    if (exp != null && exp * 1000 < Date.now() + 10 * 60_000) throw new Error("UPMORE_TEST_JWT expires within 10 minutes; give TRAINEE_VERIFY_PASSWORD so the run signs in");
    await assertTestAccount(db, sub, env.email);
    results.push(pass("ACCOUNT", "ACCOUNT.test_account", "the run acts as the flagged test account on the reserved test domain"));
    await C.assertNoApplyAuthority(db, sub);
    results.push(pass("ACCOUNT", "ACCOUNT.no_apply_authority", "the test account has no cloud opt-in, batch approval, extension record, application job, waiting queue row or approved card"));
    const ctx: Ctx = { db, base: env.base!, jwt: jwt!, anonKey: env.anonKey, run: { userId: sub, startedAt: started }, opts, fetch: httpFetch, guard: new ChatGuard(), threads: new Map(), results, log, turns: [] };
    log(`live verify: ${env.ref ?? env.base}, waiting up to ${opts.waitMin} min for scheduled outcomes`);
    let fnList: { status: number; list: any[] | null } | null = null;
    try { fnList = await listFunctions(ctx, env); } catch (e) { fnList = { status: 0, list: null }; log(`function list: ${(e as Error).message}`); }
    await stateChecks(ctx, env, fnList);
    try { await scenario(ctx, env); }
    catch (e) { results.push(fail("SAFETY", "SAFETY.scenario_completed", `the scenario stopped: ${(e as Error).message}`.slice(0, 300))); }
    await guarded(ctx, "SAFETY", "SAFETY.every_reply_recorded", () => C.everyReplyRecorded(db, ctx.turns, ctx.run));
    await guarded(ctx, "AUDIT", "AUDIT.Q4.code_turn_latency", () => latencyCheck(ctx));
    await guarded(ctx, "SAFETY", "SAFETY.never_approved", () => C.neverApproved(db, ctx.run));
    await guarded(ctx, "SAFETY", "SAFETY.test_outbox_contained", () => C.testOutboxContained(db, ctx.run, env.tgChat ? `tg:${env.tgChat}` : null));
    await guarded(ctx, "SAFETY", "SAFETY.no_foreign_writes", () => C.noForeignWrites(db, ctx.run, [...ctx.threads.values()]));
    await guarded(ctx, "SAFETY", "SAFETY.no_queue_row", () => C.noQueueRow(db, ctx.run));
  } catch (e) {
    results.push(fail("ACCOUNT", "ACCOUNT.test_account", `refused to start: ${(e as Error).message}`));
    await conn?.end().catch(() => {});
    return await finish(2);
  }
  await conn?.end().catch(() => {});
  return await finish(exitCode(summary(results), opts.allowNotRun));
}

if (import.meta.main) Deno.exit(await main(Deno.args, (k) => Deno.env.get(k)));
