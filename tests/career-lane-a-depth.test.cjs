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
