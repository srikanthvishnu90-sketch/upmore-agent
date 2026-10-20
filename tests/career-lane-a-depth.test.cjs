/* LANE A guards (Feature Depth Program v2 — conversation depth).
   Every test replays a defect measured in the 2026-10-19 channel
   battery (~/workspace/your_files/channel-tests/2026-10-19-battery-1000,
   scoreboard.md + transcripts/) or in the 2026-10-20 live Gusto run
   (channel-tests/2026-10-20-live-loop-gusto/). Each was red on the
   base tree (75ccf5f5 = live v238) and must stay green.
   Conversations run through the real career host with the same
   in-memory production-semantics store as
   tests/career-depth-memory.test.cjs (per-thread snapshots, per-user
   account record, commit-patch whitelist).
   Check: node --test tests/career-lane-a-depth.test.cjs */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW = Date.parse("2026-10-20T15:00:00.000Z");
const WHITELIST = ["paused", "preferred_locations", "erase", "stated_facts"];
const clone = (v) => JSON.parse(JSON.stringify(v));

function makeHost(extra) {
  return CareerHost.createCareerHost(Object.assign({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  }, extra || {}));
}
function makeWorld(hostExtra) {
  const host = makeHost(hostExtra);
  const store = { accounts: new Map(), threads: new Map(), watches: new Map() };
  let n = 0;
  const say = (userId, threadId, text, opts) => {
    const o = opts || {};
    n += 1;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: o.postings || [], batchDeps: o.batchDeps || undefined, profile: o.profile });
    const out = host.runTurn(text, ctx);
    const snap = host.extractSnapshot(ctx);
    store.threads.set(threadId, snap);
    if (ctx._hostPatch) {
      for (const k of Object.keys(ctx._hostPatch)) assert.ok(WHITELIST.includes(k), `commit patch key "${k}" is outside the career_host_commit whitelist`);
      if (ctx._hostPatch.erase === true) store.accounts.set(userId, { paused: true });
      else { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    }
    const aws = snap.stores && snap.stores.alertWatchState;
    const wpk = `career:watch-profile:${userId}`;
    if (aws && aws[wpk]) store.watches.set(userId, { [wpk]: clone(aws[wpk]) });
    return { out, ctx, snap };
  };
  return { host, store, say };
}
const factsOf = (r) => ((r.ctx.statedFacts || {}).facts) || [];
const rowsOf = (r) => { const ts = r.ctx.trackStore || {}; return Array.isArray(ts) ? ts : (ts.rows || []); };
const isFallback = (out) => !out || out.contained || out.intent === "career_fallback" || !out.reply || out.reply.startsWith("I didn't catch that");

// =====================================================================
// ITEM 1 — CONVERSATIONAL MEMORY (battery memory class: 0/60)
// =====================================================================

test("CB-0441: recruiter contact planted in chat is stored and recalled on ask", () => {
  const { say } = makeWorld();
  say("u-m1", "t", "my top target company is Bluepeak Networks (fictional) and my recruiter contact there is Omar Farouk");
  const ack = say("u-m1", "t", "ok thanks");
  assert.ok(!isFallback(ack.out), `"ok thanks" after a plant must not fall back, got: ${ack.out && ack.out.reply}`);
  const r = say("u-m1", "t", "quick check — what do you remember about my Bluepeak Networks (fictional) plans?");
  assert.ok(!isFallback(r.out), `recall ask must not fall back, got: ${r.out && r.out.reply}`);
  assert.match(r.out.reply, /Omar Farouk/);
  assert.match(r.out.reply, /Bluepeak Networks/);
  const facts = factsOf(r);
  assert.ok(facts.some((f) => f.kind === "recruiter_contact" && /Omar Farouk/.test(f.value)), `recruiter_contact fact missing: ${JSON.stringify(facts)}`);
  assert.ok(facts.some((f) => f.kind === "target_firm" && /Bluepeak Networks/.test(f.value)), `target_firm fact missing: ${JSON.stringify(facts)}`);
});

test("CB-0442: interview day + hiring manager planted in chat are recalled on ask", () => {
  const { say } = makeWorld();
  say("u-m2", "t", "my interview at Waypoint Onboarding (fictional) is on Tuesday — the hiring manager is Diego Alvarez");
  say("u-m2", "t", "ok thanks");
  const r = say("u-m2", "t", "quick check — what do you remember about my Waypoint Onboarding (fictional) plans?");
  assert.ok(!isFallback(r.out), `recall ask must not fall back, got: ${r.out && r.out.reply}`);
  assert.match(r.out.reply, /Diego Alvarez/);
  assert.match(r.out.reply, /Tuesday/);
  const facts = factsOf(r);
  assert.ok(facts.some((f) => f.kind === "hiring_manager" && /Diego Alvarez/.test(f.value)), `hiring_manager fact missing: ${JSON.stringify(facts)}`);
  assert.ok(facts.some((f) => f.kind === "interview_day" && /Tuesday/.test(f.value)), `interview_day fact missing: ${JSON.stringify(facts)}`);
});

test("memory: a stated per-company role/location preference is recalled on ask", () => {
  const { say } = makeWorld();
  say("u-m3", "t", "remember: for Bluepeak Networks (fictional) I only want Data Analyst roles in Chicago");
  say("u-m3", "t", "ok thanks");
  const r = say("u-m3", "t", "quick check — what do you remember about my Bluepeak Networks (fictional) plans?");
  assert.ok(!isFallback(r.out), `recall ask must not fall back, got: ${r.out && r.out.reply}`);
  assert.match(r.out.reply, /Chicago/);
  assert.match(r.out.reply, /Data Analyst/);
});

test("CB-0459: an interview-day correction REPLACES the day — recall states the new day only", () => {
  const { say } = makeWorld();
  say("u-m4", "t", "my interview is on Thursday");
  say("u-m4", "t", "actually, correction: it's Friday, not Thursday");
  const r = say("u-m4", "t", "which day is my interview?");
  assert.ok(!isFallback(r.out), `day ask must not fall back, got: ${r.out && r.out.reply}`);
  assert.match(r.out.reply, /Friday/);
  assert.ok(!/Thursday/.test(r.out.reply), `recall must state the current day only, got: ${r.out.reply}`);
  const days = factsOf(r).filter((f) => f.kind === "interview_day");
  assert.equal(days.length, 1, `exactly one interview_day fact may stand, got: ${JSON.stringify(days)}`);
  assert.match(days[0].value, /Friday/);
});

test("memory: the first thing told today is recalled verbatim after later turns", () => {
  const { say } = makeWorld();
  say("u-m5", "t", "first thing: my dream role is Data Analyst at Bluepeak Networks (fictional)");
  say("u-m5", "t", "also, tailor my resume for a data analyst role");
  const r = say("u-m5", "t", "what was the first thing I told you today?");
  assert.ok(!isFallback(r.out), `first-thing ask must not fall back, got: ${r.out && r.out.reply}`);
  assert.match(r.out.reply, /Bluepeak Networks/);
});

test("memory: facts planted in one thread are recalled in a NEW thread for the same user", () => {
  const { say } = makeWorld();
  say("u-m6", "thread-a", "my top target company is Bluepeak Networks (fictional) and my recruiter contact there is Omar Farouk");
  const r = say("u-m6", "thread-b", "quick check — what do you remember about my Bluepeak Networks (fictional) plans?");
  assert.ok(!isFallback(r.out), `cross-thread recall must not fall back, got: ${r.out && r.out.reply}`);
  assert.match(r.out.reply, /Omar Farouk/);
});

test("memory discipline: a question or a quote about a recruiter records NOTHING (BUG-169 speech-act law)", () => {
  const { say } = makeWorld();
  const q = say("u-m7", "t", "is my recruiter contact at Bluepeak Networks (fictional) Omar Farouk?");
  assert.ok(!factsOf(q).some((f) => f.kind === "recruiter_contact"), `a question must not record a recruiter fact: ${JSON.stringify(factsOf(q))}`);
  const q2 = say("u-m7", "t", "my friend said \"my recruiter contact there is Omar Farouk\" — wild, right?");
  assert.ok(!factsOf(q2).some((f) => f.kind === "recruiter_contact"), `quoted speech must not record a recruiter fact: ${JSON.stringify(factsOf(q2))}`);
});

// =====================================================================
// ITEM 2 — LF-02 ROUTING REPAIR (tracker assertions + watch creation)
// =====================================================================

test("CB-0401: 'I applied to the X role at Y today' WRITES the tracker row the same turn", () => {
  const { say } = makeWorld();
  const w = say("u-t1", "t", "I applied to the Operations Analyst role at Meridian Fulfillment (fictional) today");
  assert.notEqual(w.out.intent, "career_recommendations", `assertion stolen by recommendations: ${w.out.reply}`);
  assert.equal(w.out.intent, "tracking_log", `expected tracking_log, got ${w.out.intent}: ${w.out.reply}`);
  const rows = rowsOf(w);
  assert.equal(rows.length, 1, `exactly one tracker row must be written, got ${JSON.stringify(rows)}`);
  assert.equal(rows[0].company, "Meridian Fulfillment (fictional)");
  assert.equal(rows[0].role, "Operations Analyst");
  const r = say("u-t1", "t", "what's on my tracker?");
  assert.ok(!/no applications|nothing on file|tracker is empty/i.test(r.out.reply), `read-back must not disown the row: ${r.out.reply}`);
  assert.match(r.out.reply, /Meridian Fulfillment/);
});

test("CB-0429: assertion 'two weeks ago' parses role+company fully; an onsite move lands on the row", () => {
  const { say } = makeWorld();
  const w = say("u-t2", "t", "I applied to the Junior Software Engineer role at Quietline Apps (fictional) two weeks ago");
  assert.equal(w.out.intent, "tracking_log", `expected tracking_log, got ${w.out.intent}`);
  const rows = rowsOf(w);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].company, "Quietline Apps (fictional)", `company misparsed: ${JSON.stringify(rows[0])}`);
  assert.equal(rows[0].role, "Junior Software Engineer", `role truncated: ${JSON.stringify(rows[0])}`);
  const applied = Date.parse(rows[0].applied_at || rows[0].appliedAt || "");
  assert.ok(Number.isFinite(applied) && Math.abs(applied - (NOW - 14 * 86400000)) < 3 * 86400000, `applied date should be ~two weeks back, got ${rows[0].applied_at}`);
  const mv = say("u-t2", "t", "I moved to the onsite round at Quietline Apps (fictional) for the Junior Software Engineer role");
  assert.ok(!isFallback(mv.out), `stage move must not fall back, got: ${mv.out && mv.out.reply}`);
  const after = rowsOf(mv);
  assert.equal(after.length, 1);
  assert.equal(after[0].stage, "Interview rounds", `stage must move to Interview rounds, got ${after[0].stage}`);
  const r = say("u-t2", "t", "show me my tracker");
  assert.match(r.out.reply, /Interview rounds/);
});

test("TN-1a: an application with NO company stated still writes — company blank + company_not_stated, never invented", () => {
  const { say } = makeWorld();
  const w = say("u-t3", "t", "I applied to a role today");
  assert.equal(w.out.intent, "tracking_log", `expected tracking_log, got ${w.out.intent}: ${w.out.reply}`);
  const rows = rowsOf(w);
  assert.equal(rows.length, 1, `the write is never refused for a missing company: ${JSON.stringify(rows)}`);
  assert.ok(!rows[0].company, `company must stay blank, got ${JSON.stringify(rows[0].company)}`);
  assert.equal(rows[0].company_not_stated, true, `company_not_stated flag required: ${JSON.stringify(rows[0])}`);
});

test("tracker discipline: a hypothetical application writes NOTHING", () => {
  const { say } = makeWorld();
  const w = say("u-t4", "t", "if I applied to the Data Analyst role at Stripe tomorrow, would that be a good move?");
  assert.equal(rowsOf(w).length, 0, `a hypothetical must not write a row: ${JSON.stringify(rowsOf(w))}`);
});

const PILOT = require(path.join(ROOT, "scripts/career/gauntlet/pilot-lib.cjs"));
const CORPUS = JSON.parse(require("node:fs").readFileSync(path.join(ROOT, "packages/career-data/fixtures/gauntlet/jobs/scored-corpus.json"), "utf8")).postings;
function watchWorld() {
  const w = makeWorld();
  const profile = PILOT.gauntletProfile("p1-early-career-swe");
  const sayP = (uid, tid, text) => w.say(uid, tid, text, { postings: CORPUS, profile });
  return { sayP, store: w.store };
}
const watchInterests = (r, uid) => {
  const aws = (r.snap.stores || {}).alertWatchState || {};
  const wp = aws[`career:watch-profile:${uid}`];
  return wp ? (wp.interests || []) : [];
};

test("watch create: all four natural phrasings create a REAL watch (SWE pair)", () => {
  const shapes = [
    "watch for Junior Software Engineer roles at Quietline Apps (fictional) and alert me the moment one opens",
    "alert me when Quietline Apps (fictional) posts a Junior Software Engineer role",
    "set up a watch: Junior Software Engineer at Quietline Apps (fictional)",
    "let me know as soon as a Junior Software Engineer opening goes live at Quietline Apps (fictional)",
  ];
  shapes.forEach((shape, i) => {
    const { sayP } = watchWorld();
    const uid = `u-w${i}`;
    const w = sayP(uid, "t", shape);
    const interests = watchInterests(w, uid);
    assert.equal(interests.length, 1, `phrasing ${i} created no watch: ${w.out.reply}`);
    assert.ok((interests[0].filters.firms_include || []).some((f) => /Quietline Apps/.test(f)), `watch must name the firm: ${JSON.stringify(interests[0])}`);
    assert.ok(/^\d{2}-\d{4}$/.test(interests[0].role.soc), `watch role must carry a real SOC: ${JSON.stringify(interests[0].role)}`);
    const r = sayP(uid, "t", "what am I watching now?");
    assert.ok(!/no job watches on file/i.test(r.out.reply), `read-back disowns the watch: ${r.out.reply}`);
    assert.match(r.out.reply, /Quietline Apps/);
  });
});

test("watch create: an operations title outside the curated splits still resolves a taxonomy SOC", () => {
  const { sayP } = watchWorld();
  const w = sayP("u-wops", "t", "watch for Operations Analyst roles at Meridian Fulfillment (fictional) and alert me the moment one opens");
  const interests = watchInterests(w, "u-wops");
  assert.equal(interests.length, 1, `operations watch not created: ${w.out.reply}`);
  assert.ok(/^\d{2}-\d{4}$/.test(interests[0].role.soc));
  const r = sayP("u-wops", "t", "what am I watching now?");
  assert.match(r.out.reply, /Meridian Fulfillment/);
});

test("watch manage chain: create → list → stop → list again all answer from the record", () => {
  const { sayP } = watchWorld();
  sayP("u-wm", "t", "watch for Junior Software Engineer roles at Quietline Apps (fictional)");
  const l1 = sayP("u-wm", "t", "list my watches");
  assert.match(l1.out.reply, /Quietline Apps/);
  const stop = sayP("u-wm", "t", "stop watching the Quietline Apps (fictional) one");
  assert.ok(!isFallback(stop.out), `stop turn fell back: ${stop.out.reply}`);
  const l2 = sayP("u-wm", "t", "list my watches again");
  assert.ok(!isFallback(l2.out), `second list fell back: ${l2.out.reply}`);
  assert.ok(!/Quietline Apps/.test(l2.out.reply.split("\n")[0] || "") || /empty|no watches|holds no/i.test(l2.out.reply), `stopped watch must be off the list: ${l2.out.reply}`);
});

test("watch discipline: a role with NO taxonomy occupation gets the honest stop, never an invented SOC", () => {
  const { sayP } = watchWorld();
  const w = sayP("u-wx", "t", "watch for Chief Vibes Officer roles at Quietline Apps (fictional)");
  assert.equal(watchInterests(w, "u-wx").length, 0, "an unresolvable role must not produce a watch");
  assert.ok(!isFallback(w.out), `the honest stop is a real answer, not the fallback: ${w.out.reply}`);
});
