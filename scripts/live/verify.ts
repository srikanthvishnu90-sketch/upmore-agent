#!/usr/bin/env -S deno run -A
// Trainee live production verification (owner bar, 2026-10-26: "The response and the real outcome both need to be
// right"). Drives the real live channels as the dedicated test account, then asserts the real outcome in live state
// with SELECTs only, and that each reply agrees with that state. Writes JSON and a markdown matrix.
//
//   SUPABASE_PROJECT_REF=<ref> SUPABASE_DB_URL=<session pooler URI> TRAINEE_VERIFY_EMAIL=trainee-live-verify@upmore.test \
//   (UPMORE_TEST_JWT=<jwt> | TRAINEE_VERIFY_PASSWORD=<pw> SUPABASE_ANON_KEY=<anon>) \
//   [SUPABASE_ANON_KEY] [TRAINEE_APP_URL] [TELEGRAM_WEBHOOK_SECRET TRAINEE_VERIFY_TELEGRAM_CHAT_ID] [SUPABASE_ACCESS_TOKEN] \
//   deno run -A scripts/live/verify.ts [--out <dir>] [--wait-min <n>] [--role "software engineer"] [--place "New York"]
//
// What it changes on the live project, all of it as the test account and through the product's own doors: chat turns
// (threads, messages, turn receipts, model cost rows), a resume confirmed from a synthetic fixture, a watch, queued
// applications for open postings (never approved: no card is ever answered, so nothing is sent to an employer),
// outreach drafts to @example.test contacts (never approved or sent), and a mock interview. At the end the product's own
// erase ("forget my career profile") clears it, and the erase is itself checked. The database connection runs every
// statement inside `begin transaction read only` after a code check that it is a read (lib.ts assertReadOnlySql).
// Exit: 0 all PASS, 1 any FAIL (or NOT_RUN under --strict), 2 the run could not start. No secret is ever printed.
import {
  assertTestAccount, ChatGuard, type Db, fail, FEATURES, guardedFetch, jwtSubject, markdown, notRun, pass, psqlExec, q,
  readOnlyDb, type Result, scrubber, summary,
} from "./lib.ts";
import * as C from "./checks.ts";
import type { Run, Turn } from "./checks.ts";

export interface Options { out: string; waitMin: number; role: string; place: string; strict: boolean; turnTimeoutMs: number }
export function parseArgs(argv: string[]): Options {
  const o: Options = { out: "live-verify-out", waitMin: 20, role: "software engineer", place: "New York", strict: false, turnTimeoutMs: 150_000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => { const x = argv[++i]; if (x == null) throw new Error(`${a} takes a value`); return x; };
    if (a === "--out") o.out = v();
    else if (a === "--wait-min") { o.waitMin = Number(v()); if (!Number.isFinite(o.waitMin) || o.waitMin < 0 || o.waitMin > 120) throw new Error("--wait-min takes 0..120"); }
    else if (a === "--role") o.role = v();
    else if (a === "--place") o.place = v();
    else if (a === "--strict") o.strict = true;
    else throw new Error(`unknown option ${a}`);
  }
  if (!/^[a-z][a-z ]{2,40}$/i.test(o.role) || !/^[a-z][a-z ,]{1,40}$/i.test(o.place)) throw new Error("--role and --place take plain words");
  return o;
}

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const words = (role: string) => role.toLowerCase().split(/\s+/).filter(Boolean);
const CONTACT_DOMAIN = "@example.test";
const CONTACTS_CSV = [
  "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
  "Riley,Verifytest,https://example.test/riley,riley.verifytest@example.test,Verifyco Test,Engineering Manager,01 Oct 2026",
  "Jordan,Verifytest,https://example.test/jordan,jordan.verifytest@example.test,Verifyco Test,Recruiter,01 Oct 2026",
  "Casey,Verifytest,https://example.test/casey,,Verifyco Test,Analyst,01 Oct 2026",
].join("\n");
const MOCK_ANSWER = "I would start from the goal, state my assumptions, write a first version, test it on a small example, measure the result with a number such as a 20% drop in time, and then explain the trade-offs to the team.";

interface Ctx {
  db: Db; base: string; jwt: string; anonKey: string | null; run: Run; opts: Options; fetch: typeof fetch;
  guard: ChatGuard; threads: Map<string, string>; results: Result[]; log: (s: string) => void;
}

// One chat turn on the live agent-chat endpoint, as the test account. `thread` names a conversation of this run.
async function say(ctx: Ctx, thread: string, message: string, extra: Record<string, unknown> = {}, allowYes = false): Promise<Turn> {
  const tid = ctx.threads.get(thread) ?? null;
  ctx.guard.check(tid, message, allowYes);
  const turnKey = crypto.randomUUID();
  const at = new Date(Date.now() - 2000).toISOString(); // clock skew margin; every check also filters by the account
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${ctx.jwt}` };
  if (ctx.anonKey) headers.apikey = ctx.anonKey;
  let status = 0, body: any = null, text = "";
  try {
    const res = await ctx.fetch(`${ctx.base}/functions/v1/agent-chat`, {
      method: "POST", headers, signal: AbortSignal.timeout(ctx.opts.turnTimeoutMs),
      body: JSON.stringify({ message, turn_key: turnKey, ...(tid ? { thread_id: tid } : {}), ...extra }),
    });
    status = res.status; text = await res.text();
    try { body = JSON.parse(text); } catch { body = null; }
  } catch (e) { text = `request failed: ${(e as Error).message}`; }
  const threadId = typeof body?.thread_id === "string" ? body.thread_id : tid;
  if (threadId) ctx.threads.set(thread, threadId);
  ctx.guard.noteReply(threadId, body);
  const reply = typeof body?.reply === "string" ? body.reply : (body?.error ? String(body.error) : text.slice(0, 300));
  ctx.log(`  turn [${thread}] "${message.slice(0, 50)}" -> HTTP ${status}, ${reply.length} chars`);
  return { status, reply, threadId, turnKey, meta: body?.meta ?? {}, at, body };
}

async function guarded(ctx: Ctx, feature: string, check: string, fn: () => Promise<Result | Result[]>): Promise<Result[]> {
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

// ------------------------------------------------------------------------------------------------ read-only checks
async function stateChecks(ctx: Ctx, env: Env) {
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
  await guarded(ctx, "CLOUD", "CLOUD.door_refuses_wrong_secret", () => cloudDoor(ctx));
  await guarded(ctx, "F15", "F15.app_is_current_build", () => appCurrent(ctx, env.appUrl));
  if (env.accessToken && env.ref) await guarded(ctx, "ACCOUNT", "ACCOUNT.functions_deployed", () => functionsDeployed(ctx, env));
  else add(ctx, notRun("ACCOUNT", "ACCOUNT.functions_deployed", "no SUPABASE_ACCESS_TOKEN: the deployed function list was not read"));
}

// The cloud runner's dispatch door refuses a wrong secret (and was asked to dispatch nothing). The handler's own refusal
// is HTTP 401 {"error":"unauthorized"}; the platform gateway's 401 (a JWT asked for) is a deploy without --no-verify-jwt.
async function cloudDoor(ctx: Ctx): Promise<Result> {
  const res = await ctx.fetch(`${ctx.base}/functions/v1/career-cloud-runner/dispatch`, {
    method: "POST", headers: { "content-type": "application/json", "x-cloud-dispatch-secret": "wrong-" + crypto.randomUUID() }, body: '{"want":0}', signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => null);
  const C0 = "CLOUD.door_refuses_wrong_secret";
  if (res.status === 404) return fail("CLOUD", C0, "HTTP 404: career-cloud-runner is not deployed");
  if (res.status === 401 && body?.error === "unauthorized") return pass("CLOUD", C0, "HTTP 401 from the handler: deployed, refuses a wrong secret");
  if (res.status === 401) return fail("CLOUD", C0, "HTTP 401 from the gateway: deploy it with --no-verify-jwt (pg_cron carries no JWT)");
  if (res.status === 503) return fail("CLOUD", C0, `HTTP 503: deployed but not configured (${String(body?.error ?? "").slice(0, 80)})`);
  return fail("CLOUD", C0, `HTTP ${res.status}: the door did not refuse a wrong secret`);
}

// The web app served in production is this commit's build (index.html byte for byte) and carries the dashboard.
async function appCurrent(ctx: Ctx, appUrl: string | null): Promise<Result> {
  if (!appUrl) return notRun("F15", "F15.app_is_current_build", "no TRAINEE_APP_URL: the served app was not read");
  const res = await ctx.fetch(appUrl, { signal: AbortSignal.timeout(30_000) });
  const html = await res.text();
  if (res.status !== 200) return fail("F15", "F15.app_is_current_build", `the app answered HTTP ${res.status}`);
  if (!html.includes("careerDash")) return fail("F15", "F15.app_is_current_build", "the served app has no Applications dashboard (careerDash): the F15 build is not deployed");
  const local = await Deno.readTextFile(`${ROOT}/index.html`).catch(() => null);
  if (local != null && local !== html) return fail("F15", "F15.app_is_current_build", "the served index.html is not this commit's build (deploy the rebuilt app)");
  return pass("F15", "F15.app_is_current_build", "the served app is this commit's index.html and carries the dashboard");
}

const LIVE_FUNCTIONS = ["agent-chat", "career-ingest", "career-proactive", "trainee-deliver", "trainee-inbound", "trainee-telegram", "career-cloud-runner"];
async function functionsDeployed(ctx: Ctx, env: Env): Promise<Result> {
  // Read only: the Management API's function list (names, status, versions). Never the secrets endpoint.
  const res = await ctx.fetch(`https://api.supabase.com/v1/projects/${env.ref}/functions`, { headers: { authorization: `Bearer ${env.accessToken}` }, signal: AbortSignal.timeout(30_000) });
  if (res.status !== 200) { await res.body?.cancel(); return fail("ACCOUNT", "ACCOUNT.functions_deployed", `the function list answered HTTP ${res.status}`); }
  const list = (await res.json()) as { slug: string; status: string }[];
  const active = new Set(list.filter((f) => f.status === "ACTIVE").map((f) => f.slug));
  const missing = LIVE_FUNCTIONS.filter((f) => !active.has(f));
  return missing.length
    ? fail("ACCOUNT", "ACCOUNT.functions_deployed", `${LIVE_FUNCTIONS.length - missing.length}/${LIVE_FUNCTIONS.length} functions active; not deployed: ${missing.join(", ")}`)
    : pass("ACCOUNT", "ACCOUNT.functions_deployed", `${LIVE_FUNCTIONS.length}/${LIVE_FUNCTIONS.length} functions active`);
}

// ------------------------------------------------------------------------------------------------ the chat scenario
interface Listed { url: string; title: string; company: string }
async function postingsByUrl(db: Db, urls: string[]): Promise<Listed[]> {
  if (!urls.length) return [];
  const r = await db.rows<Listed>(`select url, title, company from career_postings where url in (${urls.map(q).join(",")}) and closed_at is null`);
  return urls.map((u) => r.find((x) => x.url === u)).filter((x): x is Listed => !!x);
}
async function wantedUrls(db: Db, userId: string): Promise<Set<string>> {
  const r = await db.rows<{ url: string }>(`select url from career_apply_wanted where user_id = ${q(userId)}`).catch(() => []);
  return new Set(r.map((x) => x.url));
}

async function scenario(ctx: Ctx, env: Env) {
  const { db, run, opts } = ctx;
  const role = opts.role, place = opts.place;
  // 0. The last run's erase paused the account; lift it, then confirm the synthetic resume.
  const resume = await say(ctx, "setup", "resume career work");
  await guarded(ctx, "ACCOUNT", "ACCOUNT.resume_career_work", () => C.turnRecorded(db, "ACCOUNT", "ACCOUNT.resume_career_work", resume, run));
  const fixture = await Deno.readTextFile(`${ROOT}/packages/career-data/fixtures/test-resume.txt`);
  const pasted = await say(ctx, "setup", `here is my resume:\n${fixture}`);
  let confirmed = pasted, refused: string | null = null;
  try { if (ok(pasted)) confirmed = await say(ctx, "setup", "yes, that's my resume", {}, true); }
  catch (e) { refused = (e as Error).message; } // the chat guard: the resume reply looked like a card, so no yes was said
  const resumeOk = !refused && ok(confirmed) && /confirm/i.test(confirmed.reply);
  add(ctx, resumeOk ? pass("ACCOUNT", "ACCOUNT.resume_confirmed", "the synthetic resume is confirmed on the test account")
    : fail("ACCOUNT", "ACCOUNT.resume_confirmed", refused ?? `the resume was not confirmed: ${confirmed.reply.slice(0, 160)}`));

  // F9 thread A: a stated fact.
  const factA = await say(ctx, "memory-a", "I am a junior majoring in economics");
  await guarded(ctx, "F9", "F9.fact_turn", () => C.turnRecorded(db, "F9", "F9.fact_turn", factA, run));

  // F13: an advice question goes to the staged brain and is metered.
  const advice = await say(ctx, "advice", "how should I follow up after an interview?");
  await guarded(ctx, "F13", "F13.turn", () => C.turnRecorded(db, "F13", "F13.turn", advice, run));
  if (advice.meta?.brain === "staged") {
    add(ctx, pass("F13", "F13.answered_by_staged_brain", `meta.brain staged, router_intent ${advice.meta.router_intent ?? "n/a"}`));
    await guarded(ctx, "F13", "F13.metered", () => C.metered(db, "F13", "F13.metered", advice, run));
  } else {
    add(ctx, fail("F13", "F13.answered_by_staged_brain", ok(advice) ? `the router answered (meta.brain ${advice.meta?.brain ?? "absent"}): CAREER_BRAIN=staged is not on in production` : `agent-chat answered HTTP ${advice.status}`));
    add(ctx, notRun("F13", "F13.metered", "no brain turn to meter"));
  }

  // F12: the numbers in the reply are the benchmark rows'.
  const offerMsg = `I got an offer from Google for $150,000 base as a software engineer in New York`;
  const offer = await say(ctx, "offer", offerMsg);
  await guarded(ctx, "F12", "F12.turn", () => C.turnRecorded(db, "F12", "F12.turn", offer, run));
  await guarded(ctx, "F12", "F12.numbers_match_benchmarks", async () => {
    const m = await import("../../supabase/functions/_shared/career_offer.ts");
    return C.offerNumbers(offer, m.benchmarks(m.parseOfferWords(offerMsg)) as C.Bench[]);
  });

  // F5: search; F1: apply by position; F4: tailor; F11: mock, all on the search thread.
  const search = await say(ctx, "search", `find ${role} jobs in ${place}`);
  await guarded(ctx, "F5", "F5.turn", () => C.turnRecorded(db, "F5", "F5.turn", search, run));
  const listedRes = await guarded(ctx, "F5", "F5.listed_postings_open", () => C.searchListedOpen(db, search));
  const judge = C.judgeState(search);
  if (judge === "judged") await guarded(ctx, "F5", "F5.judged_and_metered", () => C.metered(db, "F5", "F5.judged_and_metered", search, run));
  else add(ctx, fail("F5", "F5.judged_and_metered", judge === "off" ? "the model judge is off in production (CAREER_JUDGE)" : judge === "failed" ? "the judge did not answer" : "the reply says nothing about judging"));
  const urls = C.urlsIn(search.reply);
  const listed = listedRes[0]?.status === "PASS" ? await postingsByUrl(db, urls) : [];
  const wanted = await wantedUrls(db, run.userId);
  const pickIdx = urls.findIndex((u) => !wanted.has(u) && listed.some((l) => l.url === u));
  if (pickIdx < 0) {
    add(ctx, notRun("F1", "F1.queued_matches_state", "no open listed posting that is not already queued (F5)"));
  } else {
    const apply = await say(ctx, "search", `apply to ${pickIdx + 1}`);
    await guarded(ctx, "F1", "F1.turn", () => C.turnRecorded(db, "F1", "F1.turn", apply, run));
    await guarded(ctx, "F1", "F1.queued_matches_state", () => C.applyQueued(db, "F1", "F1.queued_matches_state", apply, run, [urls[pickIdx]]));
  }
  const target = listed[0] ?? null;
  if (!target) {
    for (const c of ["F4.turn", "F4.tailored_for_posting", "F4.rewrite_on", "F4.metered"]) add(ctx, notRun("F4", c, "no open posting was listed (F5)"));
    for (const c of ["F11.bound_to_posting", "F11.mock_done_recorded"]) add(ctx, notRun("F11", c, "no open posting was listed (F5)"));
  } else {
    const tailor = await say(ctx, "search", `tailor my resume for the ${target.title} role at ${target.company}`);
    await guarded(ctx, "F4", "F4.turn", () => C.turnRecorded(db, "F4", "F4.turn", tailor, run));
    add(ctx, /null at null/i.test(tailor.reply) || !/tailored for/i.test(tailor.reply)
      ? fail("F4", "F4.tailored_for_posting", `the reply is not a tailoring for the posting: ${tailor.reply.slice(0, 160)}`)
      : !(tailor.body?.artifacts?.length) ? fail("F4", "F4.tailored_for_posting", "tailored, but no document was attached")
      : pass("F4", "F4.tailored_for_posting", `tailored for ${target.title} at ${target.company}, ${tailor.body.artifacts.length} document(s) attached`));
    const rw = tailor.meta?.tailor_rewrite;
    if (!rw) {
      add(ctx, fail("F4", "F4.rewrite_on", "no rewrite on the turn (meta.tailor_rewrite absent): CAREER_TAILOR_REWRITE is not on in production"));
      add(ctx, notRun("F4", "F4.metered", "no rewrite call to meter"));
    } else {
      const accepted = Array.isArray(rw.accepted) ? rw.accepted.length : Number(rw.accepted ?? NaN);
      const said = Number((/Reworded (\d+) bullet/.exec(tailor.reply) ?? [])[1] ?? 0);
      add(ctx, Number.isFinite(accepted) && accepted !== said
        ? fail("F4", "F4.rewrite_on", `the reply says ${said} bullet(s) reworded, the turn's record says ${accepted}`)
        : pass("F4", "F4.rewrite_on", `${said} bullet(s) reworded; ${Array.isArray(rw.rejected) ? rw.rejected.length : 0} kept with a reason`));
      await guarded(ctx, "F4", "F4.metered", () => C.metered(db, "F4", "F4.metered", tailor, run));
    }
    const mock = await say(ctx, "search", `mock me for the ${target.title} role at ${target.company}`);
    const bound = ok(mock) && /Mock interview/i.test(mock.reply) && norm(mock.reply).includes(norm(target.company));
    add(ctx, bound ? pass("F11", "F11.bound_to_posting", `the mock is built from ${target.title} at ${target.company}`)
      : fail("F11", "F11.bound_to_posting", `the mock is not bound to the posting: ${mock.reply.slice(0, 160)}`));
    let last = mock;
    for (let i = 0; bound && i < 10 && !/Next steps|Weak spots kept|debrief/i.test(last.reply); i++) last = await say(ctx, "search", MOCK_ANSWER);
    if (!bound) add(ctx, notRun("F11", "F11.mock_done_recorded", "the mock did not start"));
    else await guarded(ctx, "F11", "F11.mock_done_recorded", () => C.mockDone(db, run, last));
  }

  // F7: a watch (its alert is waited for below).
  const watch = await say(ctx, "watch", `Watch for ${role} roles in ${place}`);
  await guarded(ctx, "F7", "F7.watch_turn", () => C.turnRecorded(db, "F7", "F7.watch_turn", watch, run));
  await guarded(ctx, "F7", "F7.watch_saved", () => C.watchSaved(db, run, words(role)));

  // E2E: "apply me to this: <link>" for an open posting on a supported ATS, not already queued.
  let e2eUrl: string | null = null;
  const pick = await db.rows<{ url: string }>(
    `select url from career_postings where closed_at is null and provider in ('ashby', 'greenhouse', 'lever') and first_seen_at > now() - interval '7 days'
       and url not in (select url from career_apply_wanted where user_id = ${q(run.userId)}) order by first_seen_at desc limit 1`).catch(() => []);
  if (!pick.length) add(ctx, fail("E2E", "E2E.link_queued", "no open Ashby, Greenhouse or Lever posting seen in 7 days to apply to (F6)"));
  else {
    e2eUrl = pick[0].url;
    const link = await say(ctx, "link", `apply me to this: ${e2eUrl}`);
    await guarded(ctx, "E2E", "E2E.turn", () => C.turnRecorded(db, "E2E", "E2E.turn", link, run));
    await guarded(ctx, "E2E", "E2E.link_queued", () => C.applyQueued(db, "E2E", "E2E.link_queued", link, run, [e2eUrl!]));
  }

  // F10: contacts import, who-do-I-know, a draft (never sent).
  const imp = await say(ctx, "network", "here are my contacts", { attachments: [{ name: "Connections.csv", mime: "text/csv", text: CONTACTS_CSV }] });
  const ic = C.importCount(imp.reply);
  add(ctx, ic && ic.imported === 3 && ic.of === 3 ? pass("F10", "F10.contacts_imported", "imported 3/3 rows")
    : fail("F10", "F10.contacts_imported", `expected "imported 3/3 rows": ${imp.reply.slice(0, 160)}`));
  const who = await say(ctx, "network", "who do I know at Verifyco Test?");
  const names = ["Riley", "Jordan", "Casey"].filter((x) => who.reply.includes(x));
  add(ctx, names.length === 3 ? pass("F10", "F10.who_do_i_know", "the 3 imported contacts are listed back")
    : fail("F10", "F10.who_do_i_know", `${names.length}/3 imported contacts listed: ${who.reply.slice(0, 160)}`));
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

  // F9 thread B: the fact from thread A is known.
  const factB = await say(ctx, "memory-b", "what do you know about me?");
  await guarded(ctx, "F9", "F9.fact_used_in_new_thread", () => C.memoryAcrossThreads(db, factA, factB, run, ["junior", "economics"]));

  // F15: the dashboard's reads, through RLS, as the test account.
  await guarded(ctx, "F15", "F15.dashboard_reads_own_rows", () => dashboardReads(ctx));

  // TG: one turn through the Telegram webhook from the linked test chat.
  if (env.tgSecret && env.tgChat) await telegramTurn(ctx, env);
  else add(ctx, notRun("TG", "TG.turn_recorded", "no TELEGRAM_WEBHOOK_SECRET and TRAINEE_VERIFY_TELEGRAM_CHAT_ID: Telegram not driven"));

  // Outcomes that run on schedules: wait for them together.
  await waitFor(ctx, [
    { feature: "F7", check: "F7.alert_for_new_posting", fn: () => C.alertQueued(db, run, words(role)) },
    { feature: "F3", check: "F3.test_account_prepared_and_carded", fn: () => C.preparedBound(db, "F3", "F3.test_account_prepared_and_carded", run, { exceptUrls: e2eUrl ? [e2eUrl] : [] }) },
    ...(e2eUrl ? [{ feature: "E2E", check: "E2E.prepared_card_hash_bound", fn: () => C.preparedBound(db, "E2E", "E2E.prepared_card_hash_bound", run, { urls: [e2eUrl!] }) }] : []),
  ]);
  if (!e2eUrl) add(ctx, notRun("E2E", "E2E.prepared_card_hash_bound", "nothing was queued"));
  add(ctx, notRun("E2E", "E2E.final_submit", "the final send is the owner's real run (owner check O-1, his Ramp application); this suite never approves a card"));

  // Cleanup through the product's own erase, then check that it erased.
  const erase = await say(ctx, "setup", "forget my career profile");
  add(ctx, erase.meta?.intent === "career_profile_erased" ? pass("ERASE", "ERASE.turn", "the erase ran (career_profile_erased)")
    : fail("ERASE", "ERASE.turn", `the erase did not run: ${erase.reply.slice(0, 160)}`));
  await guarded(ctx, "ERASE", "ERASE.erased", () => C.eraseErased(db, run));
}
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

async function dashboardReads(ctx: Ctx): Promise<Result> {
  if (!ctx.anonKey) return notRun("F15", "F15.dashboard_reads_own_rows", "no SUPABASE_ANON_KEY: PostgREST was not read");
  const tables = ["career_outbox", "career_apply_jobs", "career_alert_prefs", "career_apply_wanted"];
  const bad: string[] = [];
  let rows = 0;
  for (const t of tables) {
    const res = await ctx.fetch(`${ctx.base}/rest/v1/${t}?select=user_id&limit=200`, { headers: { apikey: ctx.anonKey, authorization: `Bearer ${ctx.jwt}` }, signal: AbortSignal.timeout(30_000) });
    if (res.status !== 200) { bad.push(`${t}: HTTP ${res.status}`); await res.body?.cancel(); continue; }
    const data = (await res.json()) as { user_id: string }[];
    rows += data.length;
    if (data.some((x) => x.user_id !== ctx.run.userId)) bad.push(`${t}: another account's row is visible`);
  }
  return bad.length ? fail("F15", "F15.dashboard_reads_own_rows", bad.join("; "))
    : pass("F15", "F15.dashboard_reads_own_rows", `${tables.length}/${tables.length} dashboard tables readable through RLS, ${rows} row(s), all the test account's`);
}

async function telegramTurn(ctx: Ctx, env: Env) {
  const link = await C.telegramLinked(ctx.db, ctx.run, env.tgChat!);
  add(ctx, link.result);
  if (!link.ok) { add(ctx, notRun("TG", "TG.turn_recorded", "the test chat is not linked to the test account")); return; }
  const text = "what do you know about me?";
  const at = new Date(Date.now() - 2000).toISOString();
  const chat = Number(env.tgChat);
  const update = { update_id: Math.floor(Date.now() / 1000), message: { message_id: Math.floor(Date.now() / 1000), date: Math.floor(Date.now() / 1000), chat: { id: chat, type: "private" }, from: { id: chat, is_bot: false, first_name: "Test" }, text } };
  const res = await ctx.fetch(`${ctx.base}/functions/v1/trainee-telegram`, {
    method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": env.tgSecret! }, body: JSON.stringify(update), signal: AbortSignal.timeout(ctx.opts.turnTimeoutMs),
  });
  const body = await res.json().catch(() => null);
  if (res.status !== 200 || !body?.ok) { add(ctx, fail("TG", "TG.webhook_answered", `HTTP ${res.status}: ${JSON.stringify(body).slice(0, 160)}`)); return; }
  add(ctx, pass("TG", "TG.webhook_answered", "HTTP 200 ok"));
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

// ------------------------------------------------------------------------------------------------ main
interface Env {
  ref: string | null; base: string | null; dbUrl: string | null; jwt: string | null; email: string; password: string | null;
  anonKey: string | null; appUrl: string | null; tgSecret: string | null; tgChat: string | null; accessToken: string | null;
}
export function readEnv(get: (k: string) => string | undefined): Env {
  const v = (k: string) => { const x = get(k); return x && x.trim() ? x.trim() : null; };
  const ref = v("SUPABASE_PROJECT_REF");
  const base = v("SUPABASE_URL") ?? (ref ? `https://${ref}.supabase.co` : null);
  return {
    ref, base: base ? base.replace(/\/+$/, "") : null, dbUrl: v("SUPABASE_DB_URL"), jwt: v("UPMORE_TEST_JWT"),
    email: (v("TRAINEE_VERIFY_EMAIL") ?? "trainee-live-verify@upmore.test").toLowerCase(), password: v("TRAINEE_VERIFY_PASSWORD"),
    anonKey: v("SUPABASE_ANON_KEY"), appUrl: v("TRAINEE_APP_URL"), tgSecret: v("TELEGRAM_WEBHOOK_SECRET"),
    tgChat: v("TRAINEE_VERIFY_TELEGRAM_CHAT_ID"), accessToken: v("SUPABASE_ACCESS_TOKEN"),
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

export async function main(argv: string[], get: (k: string) => string | undefined, deps: { exec?: (sql: string) => Promise<string>; fetch?: typeof fetch; log?: (s: string) => void } = {}): Promise<number> {
  const env = readEnv(get);
  const scrub = scrubber([env.dbUrl, env.jwt, env.password, env.anonKey, env.tgSecret, env.tgChat, env.accessToken]);
  const log = (s: string) => (deps.log ?? console.log)(scrub(s));
  let opts: Options;
  try { opts = parseArgs(argv); } catch (e) { log(`NOT RUN live verify: ${(e as Error).message}`); return 2; }
  const started = new Date().toISOString();
  const results: Result[] = [];
  const finish = async (code: number) => {
    const meta = { started, finished: new Date().toISOString(), sha: get("GITHUB_SHA") ?? null, project: env.ref };
    const safe = JSON.parse(scrub(JSON.stringify({ ...meta, summary: summary(results), results })));
    await Deno.mkdir(opts.out, { recursive: true });
    await Deno.writeTextFile(`${opts.out}/live-verify.json`, JSON.stringify(safe, null, 2) + "\n");
    await Deno.writeTextFile(`${opts.out}/live-verify.md`, scrub(markdown(results, meta)));
    const s = summary(results);
    log(`summary: ${s.pass} PASS, ${s.fail} FAIL, ${s.not_run} NOT_RUN (${opts.out}/live-verify.md)`);
    return code;
  };
  const missing = [["SUPABASE_PROJECT_REF or SUPABASE_URL", env.base], ["SUPABASE_DB_URL", env.dbUrl]].filter(([, x]) => !x).map(([k]) => k);
  if (!env.jwt && !(env.password && env.anonKey)) missing.push("UPMORE_TEST_JWT (or TRAINEE_VERIFY_PASSWORD with SUPABASE_ANON_KEY)");
  if (missing.length) {
    results.push(notRun("ACCOUNT", "ACCOUNT.preflight", `missing ${missing.join(", ")}; nothing was called`));
    for (const f of Object.keys(FEATURES).filter((x) => x !== "ACCOUNT")) results.push(notRun(f, `${f}.all`, "the run could not start"));
    return await finish(2);
  }
  const httpFetch = guardedFetch({ base: env.base!, appUrl: env.appUrl }, deps.fetch ?? fetch);
  const db = readOnlyDb(deps.exec ?? psqlExec(env.dbUrl!));
  let jwt = env.jwt;
  try {
    if (env.password && env.anonKey) jwt = await signIn(httpFetch, env);
    const { sub, exp } = jwtSubject(jwt!);
    if (exp != null && exp * 1000 < Date.now() + 10 * 60_000) throw new Error("UPMORE_TEST_JWT expires within 10 minutes; give TRAINEE_VERIFY_PASSWORD so the run signs in");
    await assertTestAccount(db, sub, env.email);
    results.push(pass("ACCOUNT", "ACCOUNT.test_account", "the run acts as the flagged test account on the reserved test domain"));
    const ctx: Ctx = { db, base: env.base!, jwt: jwt!, anonKey: env.anonKey, run: { userId: sub, startedAt: started }, opts, fetch: httpFetch, guard: new ChatGuard(), threads: new Map(), results, log };
    log(`live verify: ${env.ref ?? env.base}, waiting up to ${opts.waitMin} min for scheduled outcomes`);
    await stateChecks(ctx, env);
    try { await scenario(ctx, env); }
    catch (e) { results.push(fail("SAFETY", "SAFETY.scenario_completed", `the scenario stopped: ${(e as Error).message}`.slice(0, 300))); }
    await guarded(ctx, "SAFETY", "SAFETY.never_approved", () => C.neverApproved(db, ctx.run));
    await guarded(ctx, "SAFETY", "SAFETY.test_outbox_contained", () => C.testOutboxContained(db, ctx.run, env.tgChat ? `tg:${env.tgChat}` : null));
    await guarded(ctx, "SAFETY", "SAFETY.no_foreign_writes", () => C.noForeignWrites(db, ctx.run, [...ctx.threads.values()]));
  } catch (e) {
    results.push(fail("ACCOUNT", "ACCOUNT.test_account", `refused to start: ${(e as Error).message}`));
    return await finish(2);
  }
  const s = summary(results);
  return await finish(s.fail || (opts.strict && s.not_run) ? 1 : 0);
}

if (import.meta.main) Deno.exit(await main(Deno.args, (k) => Deno.env.get(k)));
