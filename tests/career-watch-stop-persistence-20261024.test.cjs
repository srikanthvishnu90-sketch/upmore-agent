"use strict";
/* WATCH STOP / ERASE PERSISTENCE (coordinator priority insert, 2026-10-24).
   =====================================================================
   The invariant: preserving a watch must never resurrect cancelled or
   deleted intent — a stale snapshot must not outrank the recorded
   stop/erase.

   The world models the deployed load contract (career_host_load /
   career_host_commit): each turn loads a per-thread SNAPSHOT plus the
   canonical per-user WATCHSTATE (the career:watch-profile KV the load
   returns as `watchState`), and each commit writes the snapshot back,
   updates the canonical KV from the snapshot's watch box when one is
   present, and applies the account patch (an erase deletes the KV row
   and bumps the account privacy epoch, exactly as the SQL commit
   does). Four loads are then driven against a created-then-stopped
   watch:
     (a) the carried POST-STOP snapshot + an explicitly EMPTY seed,
     (b) the carried POST-STOP snapshot + the post-stop canonical seed,
     (c) a STALE PRE-STOP snapshot + the post-stop canonical seed,
     (c-erase) a STALE PRE-ERASE snapshot + an EMPTY canonical seed +
         the post-erase account (the canonical row is gone; only the
         account epoch says the snapshot predates an erase),
     (d) a delete / erase-all intent turn itself, on a stale load.
   Every case must read back NO ACTIVE WATCH and the host alert cycle
   must deliver NOTHING for a matching new posting.

   Tier 2: CareerHost composition + the alerts host cycle against an
   in-memory store and a fake board. Synthetic profile only.
   Check: node --test tests/career-watch-stop-persistence-20261024.test.cjs
*/
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const A = D("152-career-assign.js");

const hostP = import(pathToFileURL(path.join(ROOT, "scripts/career/alerts-host.mjs")).href);
let H;
before(async () => { H = await hostP; });

const seam = CareerHost.createCareerHost({
  CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
  CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
  CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
});

const T0 = Date.parse("2026-10-15T12:00:00.000Z");
const HOUR = 3600 * 1000;
const NOW_CHAT = Date.parse("2026-10-15T15:00:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));

const PROFILE = {
  basics: { name: "Alex Testcase", location: "Chicago, IL" },
  facts: [
    { kind: "education", text: "B.S. Computer Science + Finance at TEST University, graduating May 2028", org: "TEST University", title: "B.S. Computer Science", end: "2028-05" },
    { kind: "skill", name: "Python", text: "Skill: Python", fact_id: "F-010", evidence: ["resume lists Python"], unproven: false },
    { kind: "skill", name: "Excel", text: "Skill: Excel", fact_id: "F-012", evidence: ["resume lists Excel"], unproven: false },
  ],
  constraints: { workAuthorization: "US citizen", needsSponsorship: false },
  preferences: { locations: ["Chicago", "New York"], starredCompanies: [] },
};

const ghJob = (id, title, postedMs, locationName, content) => ({
  id, title, location: { name: locationName },
  absolute_url: `https://boards.greenhouse.io/testbank/jobs/${id}`,
  first_published: new Date(postedMs).toISOString(),
  requisition_id: `REQ-${id}`, departments: [{ name: "Finance" }], content,
});
const OLD_JOB = ghJob(1, "Finance Intern", T0 - 7 * 24 * HOUR, "New York, NY",
  "&lt;p&gt;Finance intern role. Work in Python with the finance team.&lt;/p&gt;");
const IB_JOB = ghJob(42, "Investment Banking Summer Analyst", T0 + HOUR, "Chicago, IL",
  "&lt;p&gt;Investment Banking Summer Analyst program in Chicago. Build financial models in Excel with the deal team. Applications close November 1, 2026.&lt;/p&gt;");

// One user's persistence world: thread snapshots, the canonical watch
// KV box, and the account record — committed after every turn the way
// career_host_commit does it.
function makeWorld(userId) {
  const world = {
    userId,
    threads: new Map(),       // threadId -> snapshot
    canonical: {},            // the watchState a load returns ({} = no KV row)
    account: {},              // the account record a load returns
    n: 0,
  };
  world.commit = (threadId, ctx, snap) => {
    world.threads.set(threadId, clone(snap));
    const patch = ctx._hostPatch || {};
    if (patch.erase === true) {
      world.canonical = {};
      world.account = { paused: true, epoch: (world.account.epoch || 0) + 1 };
      return;
    }
    const box = (snap.stores || {}).alertWatchState;
    if (box !== undefined) world.canonical = clone(box);
    for (const k of Object.keys(patch)) {
      if (k !== "erase") world.account[k] = clone(patch[k]);
    }
  };
  // load: { snapshot, watchState } overrides model a caller holding a
  // stale or partial load; defaults are the world's current records.
  world.turn = (threadId, text, load) => {
    world.n += 1;
    const l = load || {};
    const ctx = seam.createTurnCtx({
      userId, threadId, now: NOW_CHAT + world.n * 60000, accountPersistence: true,
      snapshot: l.snapshot !== undefined ? clone(l.snapshot) : clone(world.threads.get(threadId) || null),
      account: clone(world.account),
      watchState: l.watchState !== undefined ? clone(l.watchState) : clone(world.canonical),
      postings: [], profile: PROFILE,
    });
    const out = seam.runTurn(text, ctx);
    const snap = seam.extractSnapshot(ctx);
    world.commit(threadId, ctx, snap);
    return { out, ctx, snap };
  };
  return world;
}

const profileOf = (snap, userId) => ((snap.stores || {}).alertWatchState || {})[A.PROFILE_KEY(userId)] || null;
const activeCount = (wp) => (wp && !(wp.opt_out && wp.opt_out.global) ? (wp.interests || []).length : 0);

// In-memory PostgREST stand-in for public.career_watch_kv — the same
// fixture tests/career-alerts-host-wiring.test.cjs runs the cycle
// through (the cycle's atomic commit seam is an RPC, so a plain
// {get,set} store is NOT_WIRED to it by design).
function makeFakePostgrest() {
  const rows = new Map();
  const from = () => ({
    select: () => {
      const filters = [];
      let limitN = null;
      const run = () => {
        let out = [...rows.values()].filter((r) => filters.every(([k, v]) => r[k] === v));
        if (limitN != null) out = out.slice(0, limitN);
        return { data: out, error: null };
      };
      const b = {
        eq(k, v) { filters.push([k, v]); return b; },
        limit(n) { limitN = n; return b; },
        async maybeSingle() { const r = run(); return { data: r.data.length ? r.data[0] : null, error: null }; },
        then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
      };
      return b;
    },
    upsert: async (row) => { rows.set(`${row.user_id}|${row.key}`, { ...row }); return { data: null, error: null }; },
  });
  return { rows, from, rpc: require("./helpers/career-alerts-rpc-fake.cjs")(rows, true) };
}

// The scheduler's verdict on a watch box: seed the board, then a
// matching new posting appears — an active watch delivers exactly 1,
// a stopped/deleted one delivers 0.
async function deliveriesFor(userId, canonicalBox) {
  const client = makeFakePostgrest();
  const store = H.createSupabaseStore({ client, userId });
  for (const [k, v] of Object.entries(canonicalBox || {})) await store.set(k, clone(v));
  const board = { name: "Test Bank", jobs: [OLD_JOB] };
  const fetchImpl = async () => ({ status: 200, json: async () => board });
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "watch-persist-"));
  const logPath = path.join(logDir, "delivered.jsonl");
  const feeds = [H.Jobs.feeds.greenhouse("testbank")];
  const cycle = (now) => H.runUserAlertCycle(userId, { store, fetch: fetchImpl, feeds, now, deliveredLogPath: logPath });
  // The cycle's status is its own honest state ("ok" when a profile
  // stands, "no_watch_profile" / "opted_out" when none can fire) —
  // the invariant asserted here is the DELIVERED count only.
  await cycle(T0);
  board.jobs.push(IB_JOB);
  const r = await cycle(T0 + 2 * HOUR);
  return r.delivered.length;
}

const CREATE = "Watch for investment banking analyst intern roles in Chicago";
const READ = "What alerts do I have?";

// Setup shared by (a)/(b)/(c): create, capture the pre-stop snapshot,
// stop the watch by removing its only interest, capture the post-stop
// snapshot and the post-stop canonical box.
function createdThenStopped(userId) {
  const w = makeWorld(userId);
  const created = w.turn("t-1", CREATE);
  assert.equal(created.out.intent, "career_watch_create", created.out.reply);
  const preStopSnap = clone(w.threads.get("t-1"));
  const canonicalPre = clone(w.canonical);
  assert.equal(activeCount(profileOf(preStopSnap, userId)), 1, "setup: one active watch stands before the stop");
  const stopped = w.turn("t-1", "Stop watching investment banking");
  assert.equal(stopped.out.intent, "career_watch_manage", stopped.out.reply);
  const postStopSnap = clone(w.threads.get("t-1"));
  const canonicalPost = clone(w.canonical);
  assert.equal(activeCount(profileOf(postStopSnap, userId)), 0, "setup: the stop leaves no active watch");
  return { w, preStopSnap, canonicalPre, postStopSnap, canonicalPost };
}

test("(a) post-stop snapshot + explicitly EMPTY watchState seed: read-back none, no alert fires", async () => {
  const U = "user-wp-a";
  const { w, postStopSnap } = createdThenStopped(U);
  const read = w.turn("t-1", READ, { snapshot: postStopSnap, watchState: {} });
  assert.equal(activeCount(profileOf(read.snap, U)), 0, `no active watch may read back: ${read.out.reply}`);
  assert.doesNotMatch(read.out.reply, /You are watching 1 role/, read.out.reply);
  assert.equal(await deliveriesFor(U, w.canonical), 0, "no alert may fire for a stopped watch");
});

test("(b) post-stop snapshot + post-stop canonical seed: read-back none, no alert fires", async () => {
  const U = "user-wp-b";
  const { w, postStopSnap, canonicalPost } = createdThenStopped(U);
  const read = w.turn("t-1", READ, { snapshot: postStopSnap, watchState: canonicalPost });
  assert.equal(activeCount(profileOf(read.snap, U)), 0, `no active watch may read back: ${read.out.reply}`);
  assert.equal(await deliveriesFor(U, w.canonical), 0, "no alert may fire for a stopped watch");
});

test("(c) STALE pre-stop snapshot + post-stop canonical seed: the recorded stop outranks the stale snapshot", async () => {
  const U = "user-wp-c";
  const { w, preStopSnap, canonicalPost } = createdThenStopped(U);
  const read = w.turn("t-1", READ, { snapshot: preStopSnap, watchState: canonicalPost });
  assert.equal(activeCount(profileOf(read.snap, U)), 0, `a stale snapshot must not resurrect the stopped watch: ${read.out.reply}`);
  assert.doesNotMatch(read.out.reply, /You are watching 1 role/, read.out.reply);
  assert.equal(await deliveriesFor(U, w.canonical), 0, "no alert may fire off a stale snapshot");
});

test("(c-erase) STALE pre-erase snapshot + EMPTY canonical seed + post-erase account: the erase outranks the stale snapshot", async () => {
  const U = "user-wp-c-erase";
  const w = makeWorld(U);
  const created = w.turn("t-1", CREATE);
  assert.equal(created.out.intent, "career_watch_create", created.out.reply);
  const preEraseSnap = clone(w.threads.get("t-1"));
  assert.equal(activeCount(profileOf(preEraseSnap, U)), 1, "setup: one active watch stands before the erase");
  const erased = w.turn("t-1", "Forget my career profile");
  assert.equal(erased.out.intent, "career_profile_erased", erased.out.reply);
  assert.deepEqual(w.canonical, {}, "setup: the erase deletes the canonical watch row");
  assert.equal(w.account.epoch, 1, "setup: the erase bumps the account privacy epoch (the SQL commit's own record)");
  // A caller still holding the pre-erase snapshot loads it with the
  // post-erase account and the (empty) canonical seed.
  const read = w.turn("t-1", READ, { snapshot: preEraseSnap, watchState: {} });
  assert.equal(activeCount(profileOf(read.snap, U)), 0, `a stale pre-erase snapshot must not resurrect the watch: ${read.out.reply}`);
  assert.equal(await deliveriesFor(U, w.canonical), 0, "no alert may fire for an erased watch");
});

test("(d) erase-all intent turn on a stale load erases; the next read is none and no alert fires", async () => {
  const U = "user-wp-d";
  const { w, preStopSnap, canonicalPost } = createdThenStopped(U);
  const erased = w.turn("t-1", "Forget my career profile", { snapshot: preStopSnap, watchState: canonicalPost });
  assert.equal(erased.out.intent, "career_profile_erased", erased.out.reply);
  const read = w.turn("t-1", READ);
  assert.equal(activeCount(profileOf(read.snap, U)), 0, `nothing may read back after the erase: ${read.out.reply}`);
  assert.equal(await deliveriesFor(U, w.canonical), 0, "no alert may fire after the erase");
});

test("(a-alerts) stop-my-alerts opt-out, post-stop snapshot + EMPTY seed: no active watch, no alert fires", async () => {
  const U = "user-wp-a-alerts";
  const w = makeWorld(U);
  const created = w.turn("t-1", CREATE);
  assert.equal(created.out.intent, "career_watch_create", created.out.reply);
  const stopped = w.turn("t-1", "Actually stop my alerts");
  assert.equal(stopped.out.intent, "career_watch_manage", stopped.out.reply);
  const postStopSnap = clone(w.threads.get("t-1"));
  assert.equal(activeCount(profileOf(postStopSnap, U)), 0, "setup: the opt-out leaves no ACTIVE watch");
  const read = w.turn("t-1", READ, { snapshot: postStopSnap, watchState: {} });
  assert.equal(activeCount(profileOf(read.snap, U)), 0, `the opt-out must survive the empty seed: ${read.out.reply}`);
  assert.equal(await deliveriesFor(U, w.canonical), 0, "no alert may fire while alerts are stopped");
});
