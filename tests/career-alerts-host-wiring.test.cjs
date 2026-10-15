// MI-032 STEP 2 (Crew A): the alerts host key + the wired Supabase adapter.
//
// Crew B cycle 2 built the design (docs/career/alerts-host-wiring.md), the
// host seam (scripts/career/alerts-host.mjs) and the two 142 watch intents,
// and proved the cycle 13/13 against the file store. This suite proves
// step 2 — the pieces that make it real in the deployed function:
//
//   (a) HOST PLUMBING: "alertWatchState" is in career_host.js STATE_KEYS,
//       so a watch created through the production host seam survives
//       extractSnapshot -> createTurnCtx (a new thread) instead of dying
//       with the turn; a read-only turn materializes no watch state.
//   (b) ADAPTER WIRING: createSupabaseStore works against
//       public.career_watch_kv when the table exists (an in-memory
//       PostgREST stand-in stands in for the owner-run migration), and
//       fails honestly NOT_WIRED — naming the table and the pending
//       migration — when it does not. probeSupabaseStore resolves the
//       verdict up front.
//   (c) E2E MIRROR of Crew B's 13/13, now through (a)+(b): seed cycle
//       delivers 0 -> new IB posting -> exactly 1 delivered record with
//       the deadline verbatim, the F-012 proven-skill line and a
//       match-basis line -> re-run delivers 0 -> a re-presented duplicate
//       is refused by the ledger -> queue empty, log holds 1 record.
//
// Tier 2 throughout: engine + harness + stand-ins; nothing deployed, the
// real migration is owner-run and has NOT been applied anywhere.
// Check: node --test tests/career-alerts-host-wiring.test.cjs
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const D = (n) => require(path.join(root, "packages/domain", n));
const { CareerHost } = require(path.join(root, "supabase/functions/_shared/career_host.js"));
const A = D("152-career-assign.js");

const hostP = import(pathToFileURL(path.join(root, "scripts/career/alerts-host.mjs")).href);
let H; // alerts-host.mjs (ESM)
before(async () => { H = await hostP; });

const USER = "user-mi032-step2";
const NOW_CHAT = Date.parse("2026-10-15T15:00:00.000Z");
const T0 = Date.parse("2026-10-15T12:00:00.000Z");
const HOUR = 3600 * 1000;

// 122-shape master profile (the intents suite's fixture): proven Excel is
// fact F-012, proven Python F-010.
const PROFILE122 = {
  basics: { name: "Alex Testcase", location: "Chicago, IL" },
  facts: [
    { kind: "education", text: "B.S. Computer Science + Finance at TEST University, graduating May 2028", org: "TEST University", title: "B.S. Computer Science", end: "2028-05" },
    { kind: "skill", name: "Python", text: "Skill: Python", fact_id: "F-010", evidence: ["resume lists Python"], unproven: false },
    { kind: "skill", name: "Excel", text: "Skill: Excel", fact_id: "F-012", evidence: ["resume lists Excel"], unproven: false },
  ],
  constraints: { workAuthorization: "US citizen", needsSponsorship: false },
  preferences: { locations: ["Chicago", "New York"], starredCompanies: [] },
};

const DEPS = {
  CareerAccess: D("120-career-access.js"),
  CareerOnboarding: D("130-career-onboarding.js"),
  CareerRouter: D("142-career-router.js"),
  CareerDoorstep: D("141-career-doorstep.js"),
  CareerReply: D("140-career-reply.js"),
  CareerContainment: D("143-career-containment.js"),
};
const seam = CareerHost.createCareerHost(DEPS);

// ---- (a) host plumbing --------------------------------------------------------

test("host plumbing: STATE_KEYS carries alertWatchState", () => {
  assert.ok(CareerHost.STATE_KEYS.includes("alertWatchState"),
    "career_host STATE_KEYS must whitelist the watch-state box (MI-032 step 2)");
  assert.ok(seam.STATE_KEYS.includes("alertWatchState"));
});

test("host plumbing: a watch created in one thread is listed from a fresh thread restored from the snapshot", () => {
  const ctx1 = seam.createTurnCtx({ userId: USER, threadId: "thread-1", now: NOW_CHAT, snapshot: null, profile: PROFILE122 });
  const created = seam.runTurn("Watch for investment banking analyst intern roles in Chicago", ctx1);
  assert.equal(created.intent, "career_watch_create", created.reply);
  const snap = seam.extractSnapshot(ctx1);
  assert.ok(snap.stores.alertWatchState, "the watch box must ride the snapshot");
  const wp = snap.stores.alertWatchState[A.PROFILE_KEY(USER)];
  assert.ok(wp && wp.user_id === USER && wp.interests.length === 1, "152's per-user profile record must be in the box");
  // A brand-new thread: only the snapshot carries over.
  const ctx2 = seam.createTurnCtx({ userId: USER, threadId: "thread-2", now: NOW_CHAT, snapshot: snap, profile: PROFILE122 });
  const listed = seam.runTurn("What am I watching?", ctx2);
  assert.equal(listed.intent, "career_watch_manage", listed.reply);
  assert.match(listed.reply, /Investment Banking Analyst/);
});

test("host plumbing: a read-only turn materializes no watch state", () => {
  const ctx = seam.createTurnCtx({ userId: USER, threadId: "thread-3", now: NOW_CHAT, snapshot: null, profile: PROFILE122 });
  const r = seam.runTurn("What am I watching?", ctx);
  assert.equal(r.intent, "career_watch_manage", r.reply);
  assert.equal(seam.extractSnapshot(ctx).stores.alertWatchState, undefined,
    "neither the host nor a read may create the watch-state container");
});

// ---- (b) the Supabase adapter, wired ------------------------------------------
// In-memory PostgREST stand-in for public.career_watch_kv: the exact client
// surface the adapter consumes (from().select().eq().maybeSingle(),
// from().select().eq().limit() awaited, from().upsert()). With
// tableExists:false every call answers PGRST205, PostgREST's real
// missing-table error — the stand-in for the owner-run migration not
// having been applied yet.
function makeFakePostgrest({ tableExists = true } = {}) {
  const rows = new Map();
  const missingError = () => ({ code: "PGRST205", message: "Could not find the table 'public.career_watch_kv' in the schema cache" });
  const from = () => ({
    select: () => {
      const filters = [];
      let limitN = null;
      const run = () => {
        if (!tableExists) return { data: null, error: missingError() };
        let out = [...rows.values()].filter((r) => filters.every(([k, v]) => r[k] === v));
        if (limitN != null) out = out.slice(0, limitN);
        return { data: out, error: null };
      };
      const b = {
        eq(k, v) { filters.push([k, v]); return b; },
        limit(n) { limitN = n; return b; },
        async maybeSingle() { const r = run(); return r.error ? r : { data: r.data.length ? r.data[0] : null, error: null }; },
        then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
      };
      return b;
    },
    upsert: async (row) => {
      if (!tableExists) return { data: null, error: missingError() };
      rows.set(`${row.user_id}|${row.key}`, { ...row });
      return { data: null, error: null };
    },
  });
  return { rows, from };
}

test("adapter: probe reports WIRED when the table answers", async () => {
  const client = makeFakePostgrest();
  const p = await H.probeSupabaseStore({ client, userId: USER });
  assert.equal(p.status, "WIRED");
  assert.equal(p.table, "career_watch_kv");
  assert.deepEqual(p.missing, []);
});

test("adapter: probe reports NOT_WIRED with the missing-table reason when the table is absent", async () => {
  const client = makeFakePostgrest({ tableExists: false });
  const p = await H.probeSupabaseStore({ client, userId: USER });
  assert.equal(p.status, "NOT_WIRED");
  assert.ok(p.missing.some((m) => /career_watch_kv/.test(m) && /does not exist/.test(m)), p.missing.join("; "));
  assert.ok(p.missing.some((m) => /20261015020000_career_watch_kv\.sql/.test(m)), "the reason must name the pending owner-run migration");
});

test("adapter: construction without a client is NOT_WIRED and names why", () => {
  assert.throws(() => H.createSupabaseStore({ userId: USER }),
    (e) => e.code === "NOT_WIRED" && /no PostgREST client/.test(e.message));
  const st = H.supabaseStoreStatus({});
  assert.equal(st.status, "NOT_WIRED");
  assert.ok(st.missing.length >= 2);
  const unprobed = H.supabaseStoreStatus({ client: makeFakePostgrest(), userId: USER });
  assert.equal(unprobed.status, "UNPROBED", "with inputs present the sync status must not guess the table either way");
});

test("adapter: get/set round-trips through the table stand-in, per user", async () => {
  const client = makeFakePostgrest();
  const store = H.createSupabaseStore({ client, userId: USER });
  assert.equal(await store.get("career:watch-profile:" + USER), null);
  await store.set("career:watch-profile:" + USER, { user_id: USER, interests: [1] });
  assert.deepEqual(await store.get("career:watch-profile:" + USER), { user_id: USER, interests: [1] });
  await store.set("career:watch-profile:" + USER, { user_id: USER, interests: [1, 2] }); // upsert overwrites
  assert.deepEqual((await store.get("career:watch-profile:" + USER)).interests, [1, 2]);
  const other = H.createSupabaseStore({ client, userId: "user-someone-else" });
  assert.equal(await other.get("career:watch-profile:" + USER), null, "rows are scoped by user_id");
});

test("adapter: operations against an absent table fail NOT_WIRED, never a fake write", async () => {
  const client = makeFakePostgrest({ tableExists: false });
  const store = H.createSupabaseStore({ client, userId: USER });
  await assert.rejects(() => store.get("k"),
    (e) => e.code === "NOT_WIRED" && /career_watch_kv does not exist/.test(e.message) && /20261015020000_career_watch_kv\.sql/.test(e.message));
  await assert.rejects(() => store.set("k", { v: 1 }),
    (e) => e.code === "NOT_WIRED" && /career_watch_kv does not exist/.test(e.message));
  assert.equal(client.rows.size, 0, "nothing may be written when the table is absent");
});

// ---- (c) the E2E mirror, through (a) + (b) -------------------------------------
const ghJob = (id, title, postedMs, locationName, content) => ({
  id, title,
  location: { name: locationName },
  absolute_url: `https://boards.greenhouse.io/testbank/jobs/${id}`,
  first_published: new Date(postedMs).toISOString(),
  requisition_id: `REQ-${id}`,
  departments: [{ name: "Finance" }],
  content,
});
const OLD_JOB = ghJob(1, "Finance Intern", T0 - 7 * 24 * HOUR, "New York, NY",
  "&lt;p&gt;Finance intern role. Work in Python with the finance team.&lt;/p&gt;");
const IB_JOB = ghJob(42, "Investment Banking Summer Analyst", T0 + HOUR, "Chicago, IL",
  "&lt;p&gt;Investment Banking Summer Analyst program in Chicago. Build financial models in Excel with the deal team. Applications close November 1, 2026.&lt;/p&gt;");

const world = {};
before(async () => {
  H = await hostP;
  // The watch is created through the chat seam (a), then the box's records
  // are carried into the deployed store (b) under the SAME 152 keys — the
  // shared key contract is what joins the chat turn to the scheduler.
  const ctx = seam.createTurnCtx({ userId: USER, threadId: "thread-e2e", now: NOW_CHAT, snapshot: null, profile: PROFILE122 });
  seam.runTurn("Watch for investment banking analyst intern roles in Chicago", ctx);
  const box = seam.extractSnapshot(ctx).stores.alertWatchState;
  assert.ok(box, "chat-created watch state must exist before the cycle can run");
  const client = makeFakePostgrest();
  const store = H.createSupabaseStore({ client, userId: USER });
  for (const [k, v] of Object.entries(box)) await store.set(k, v);
  const board = { name: "Test Bank", jobs: [OLD_JOB] };
  const fetchImpl = async () => ({ status: 200, json: async () => board });
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "mi032-e2e-"));
  Object.assign(world, {
    client, store, board,
    logPath: path.join(logDir, "delivered.jsonl"),
    feeds: [H.Jobs.feeds.greenhouse("testbank")],
    cycle: (now) => H.runUserAlertCycle(USER, { store, fetch: fetchImpl, feeds: world.feeds, now, deliveredLogPath: world.logPath }),
  });
});

test("e2e: the seed cycle through the Supabase store delivers 0", async () => {
  const r = await world.cycle(T0);
  assert.equal(r.status, "ok", JSON.stringify(r.errors));
  assert.equal(r.alerts, 0);
  assert.equal(r.delivered.length, 0);
  assert.equal(r.boards_seeded, 1);
});

test("e2e: the new IB posting delivers exactly one record, deadline verbatim", async () => {
  world.board.jobs.push(IB_JOB);
  const r = await world.cycle(T0 + 2 * HOUR);
  assert.equal(r.alerts, 1, JSON.stringify(r.errors));
  assert.equal(r.reminders_queued, 1);
  assert.equal(r.delivered.length, 1);
  const rec = r.delivered[0];
  world.record = rec;
  assert.equal(rec.type, "career_job_reminder_delivered");
  assert.equal(rec.company, "Test Bank");
  assert.equal(rec.title, "Investment Banking Summer Analyst");
  assert.ok(rec.deadline, "the delivered record must carry the deadline");
  assert.equal(rec.deadline.text, "Applications close November 1, 2026",
    "the deadline rides the record in the posting's own words, never converted or invented");
});

test("e2e: fit lines carry the F-012 proven-skill line and a match-basis line; speak_line quotes the deadline", () => {
  const rec = world.record;
  assert.ok(rec, "the previous beat must have delivered");
  assert.ok(rec.fit_lines.some((l) => /Excel/.test(l) && /F-012/.test(l)), rec.fit_lines.join(" | "));
  assert.ok(rec.fit_lines.some((l) => l.startsWith("match basis:")), rec.fit_lines.join(" | "));
  assert.ok(rec.speak_line.includes('"Applications close November 1, 2026"'), rec.speak_line);
});

test("e2e: a full re-run delivers 0 new and the delivered log holds exactly 1 record", async () => {
  const r = await world.cycle(T0 + 3 * HOUR);
  assert.equal(r.delivered.length, 0);
  const lines = fs.readFileSync(world.logPath, "utf8").trim().split("\n").filter(Boolean);
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).reminder_id, world.record.reminder_id);
});

test("bridge (BUG-232): watchCycleProfile derives the gate's watched occupations from the interests — and never overrides a profile's own watch leg", async () => {
  const wp = await A.loadWatchProfile(world.store, USER);
  const composed = H.watchCycleProfile(wp);
  assert.deepEqual(composed.preferences.watched_occupations,
    [{ occupation: "Investment Banking Analyst", terms: ["investment banking"] }]);
  assert.equal(wp.scoring_profile.preferences.watched_occupations, undefined,
    "composition must never mutate the stored record");
  const own = { scoring_profile: { preferences: { role_families: ["Finance"] } }, interests: wp.interests };
  assert.deepEqual(H.watchCycleProfile(own).preferences.role_families, ["Finance"], "producer data wins");
  assert.equal(H.watchCycleProfile(own).preferences.watched_occupations, undefined);
  const bare = H.watchCycleProfile({ scoring_profile: { preferences: {} }, interests: [] });
  assert.equal(bare.preferences.watched_occupations, undefined, "no interests -> no bridge is invented");
});

test("e2e: a re-presented duplicate is refused by the ledger; the table's queue is empty", async () => {
  const res = await H.deliverReminder({ reminder_id: world.record.reminder_id, user_id: USER }, { store: world.store, now: T0 + 4 * HOUR });
  assert.equal(res.delivered, false);
  assert.equal(res.duplicate, true);
  assert.equal(res.record.reminder_id, world.record.reminder_id);
  const queueRows = await world.store.get(A.QUEUE_KEY(USER));
  assert.equal((queueRows || []).length, 0, "the drained queue in the table must be empty");
  const ledger = await world.store.get(H.DELIVERY_LEDGER_KEY(USER));
  assert.deepEqual(ledger.delivered_ids, [world.record.reminder_id], "exactly one delivery is on the ledger");
});
