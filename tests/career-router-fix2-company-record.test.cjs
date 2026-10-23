'use strict';
// =====================================================================
// ROUTER FIX 2 — the record keeps a company the person stated in an
// earlier turn, and a later turn recalls THAT company.
//
// Root cause (pinned before the fix): captureStatedFacts (142) had
// company frames only for a narrow dialect —
//   target company: "my target firm/company is X", "I'm targeting X",
//     the goal-verb frame, "my #1/top target is X";
//   work-at: past tense only ("I interned/worked at X");
//   interviewed-at: the company reached the record only as the KEY of
//     an interview_day fact, and only for "my interview at X is on
//     <Day>".
// So "my dream company is X", "the company I'm focused on is X",
// "I work at X", "my current employer is X", "I have an interview at
// X next week" and "I have an interview at X on Friday" wrote NOTHING
// to the stated-facts record, and later recall answered the honest
// absence / the generic fallback instead of the company.
//
// All cases here are synthetic, invented for this file (Vantek
// Systems, Corvid Health, Alderpoint Labs, Juniper Row) — no eval
// cases are used as fixtures. Negative controls guard the assertion-
// only law: a company the agent surfaced, or one named inside a
// request, a question, a quote, or a third person's clause, is never
// written to the record.
// =====================================================================
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW = Date.parse("2026-10-22T15:00:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));

function makeWorld() {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const store = { accounts: new Map(), threads: new Map(), watches: new Map() };
  let n = 0;
  const say = (userId, threadId, text, opts) => {
    const o = opts || {};
    n += 1;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: o.postings || [], profile: o.profile });
    const out = host.runTurn(text, ctx);
    const snap = host.extractSnapshot(ctx);
    store.threads.set(threadId, snap);
    if (ctx._hostPatch) {
      if (ctx._hostPatch.erase === true) store.accounts.set(userId, { paused: true });
      else { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    }
    return { out, ctx, snap };
  };
  return { host, store, say };
}
const factsOf = (r) => ((r.ctx.statedFacts || {}).facts) || [];
const ofKind = (r, kind) => factsOf(r).filter((f) => f.kind === kind);
const accountFacts = (w, userId) => {
  const rec = (w.store.accounts.get(userId) || {}).stated_facts || {};
  return [...(rec.facts || []), ...(rec.keyed || [])];
};

// ---------------------------------------------------------------------
// 1. TARGET company — natural assertion shapes land as target_firm and
//    the standing read-back recalls them.
// ---------------------------------------------------------------------
test("target: 'my dream company is X' is kept and recalled", () => {
  const w = makeWorld();
  const r1 = w.say("u-dream", "t1", "My dream company is Vantek Systems.");
  assert.equal(ofKind(r1, "target_firm").map((f) => f.value)[0], "Vantek Systems");
  const r2 = w.say("u-dream", "t1", "What's my target company?");
  assert.match(r2.out.reply, /Vantek Systems/);
});

test("target: 'the company I'm focused on is X' is kept and recalled", () => {
  const w = makeWorld();
  const r1 = w.say("u-focus", "t1", "The company I'm focused on is Corvid Health.");
  assert.equal(ofKind(r1, "target_firm").map((f) => f.value)[0], "Corvid Health");
  const r2 = w.say("u-focus", "t1", "What company am I targeting?");
  assert.match(r2.out.reply, /Corvid Health/);
});

test("target: 'the firm I care about most is X' is kept", () => {
  const w = makeWorld();
  const r1 = w.say("u-care", "t1", "The firm I care about most is Alderpoint Labs.");
  assert.equal(ofKind(r1, "target_firm").map((f) => f.value)[0], "Alderpoint Labs");
});

test("target: inverted 'X is the company I most want to work for' is kept", () => {
  const w = makeWorld();
  const r1 = w.say("u-inv", "t1", "Juniper Row is the company I most want to work for.");
  assert.equal(ofKind(r1, "target_firm").map((f) => f.value)[0], "Juniper Row");
});

// ---------------------------------------------------------------------
// 2. WORK-AT company — present-tense assertions land as experience
//    (the record's work-at kind) and company-scoped recall finds them.
// ---------------------------------------------------------------------
test("work-at: 'I work at X' is kept and recalled by company", () => {
  const w = makeWorld();
  const r1 = w.say("u-work", "t1", "I work at Corvid Health.");
  assert.ok(ofKind(r1, "experience").some((f) => /Corvid Health/.test(f.value)), JSON.stringify(factsOf(r1)));
  const r2 = w.say("u-work", "t1", "What do you remember about my Corvid Health plans?");
  assert.match(r2.out.reply, /Corvid Health/);
});

test("work-at: 'my current employer is X' is kept", () => {
  const w = makeWorld();
  const r1 = w.say("u-emp", "t1", "My current employer is Vantek Systems.");
  assert.ok(ofKind(r1, "experience").some((f) => /Vantek Systems/.test(f.value)), JSON.stringify(factsOf(r1)));
  const r2 = w.say("u-emp", "t1", "What do you have on record for me?");
  assert.match(r2.out.reply, /Vantek Systems/);
});

test("work-at: 'I intern at X this semester' is kept", () => {
  const w = makeWorld();
  const r1 = w.say("u-intern", "t1", "I intern at Alderpoint Labs this semester.");
  assert.ok(ofKind(r1, "experience").some((f) => /Alderpoint Labs/.test(f.value)), JSON.stringify(factsOf(r1)));
});

// ---------------------------------------------------------------------
// 3. INTERVIEWED-AT company — the company itself lands on the record
//    (kind interview_company), with or without a day; the day shape
//    also records interview_day keyed by the company.
// ---------------------------------------------------------------------
test("interview: 'I have an interview at X next week' keeps the company; recall names it", () => {
  const w = makeWorld();
  const r1 = w.say("u-iv1", "t1", "I have an interview at Vantek Systems next week.");
  assert.ok(ofKind(r1, "interview_company").some((f) => f.value === "Vantek Systems"), JSON.stringify(factsOf(r1)));
  const r2 = w.say("u-iv1", "t1", "Which company do I have an interview at?");
  assert.match(r2.out.reply, /Vantek Systems/);
  const r3 = w.say("u-iv1", "t1", "What do you remember about my Vantek Systems plans?");
  assert.match(r3.out.reply, /Vantek Systems/);
});

test("interview: 'I'm interviewing with X' keeps the company", () => {
  const w = makeWorld();
  const r1 = w.say("u-iv2", "t1", "I'm interviewing with Alderpoint Labs.");
  assert.ok(ofKind(r1, "interview_company").some((f) => f.value === "Alderpoint Labs"), JSON.stringify(factsOf(r1)));
});

test("interview: 'I have an interview at X on Friday' keeps the company AND the day", () => {
  const w = makeWorld();
  const r1 = w.say("u-iv3", "t1", "I have an interview at Corvid Health on Friday.");
  assert.ok(ofKind(r1, "interview_company").some((f) => f.value === "Corvid Health"), JSON.stringify(factsOf(r1)));
  const days = ofKind(r1, "interview_day");
  assert.ok(days.some((f) => (f.key || "").toLowerCase() === "corvid health" && f.value === "Friday"), JSON.stringify(factsOf(r1)));
  const r2 = w.say("u-iv3", "t1", "When is my interview?");
  assert.match(r2.out.reply, /Friday/);
});

test("interview: the company survives into a NEW thread via the account record", () => {
  const w = makeWorld();
  w.say("u-iv4", "tA", "My dream company is Vantek Systems.");
  w.say("u-iv4", "tA", "I have an interview at Corvid Health next week.");
  const acct = accountFacts(w, "u-iv4");
  assert.ok(acct.some((f) => f.kind === "target_firm" && f.value === "Vantek Systems"), JSON.stringify(acct));
  assert.ok(acct.some((f) => f.kind === "interview_company" && f.value === "Corvid Health"), JSON.stringify(acct));
  const r = w.say("u-iv4", "tB", "Which company did I mention?");
  assert.match(r.out.reply, /Vantek Systems/);
  assert.match(r.out.reply, /Corvid Health/);
});

test("recall: 'what companies have I told you about?' lists the stated companies", () => {
  const w = makeWorld();
  w.say("u-list", "t1", "I work at Juniper Row.");
  const r = w.say("u-list", "t1", "What companies have I told you about?");
  assert.match(r.out.reply, /Juniper Row/);
});

// ---------------------------------------------------------------------
// 4. NEGATIVE CONTROLS — the assertion-only law. None of these may
//    write the company to the record.
// ---------------------------------------------------------------------
test("negative: a question about a company writes nothing", () => {
  const w = makeWorld();
  const r = w.say("u-neg1", "t1", "What do you know about Vantek Systems?");
  assert.ok(!factsOf(r).some((f) => /Vantek/.test(f.value || "") || /vantek/.test(f.key || "")), JSON.stringify(factsOf(r)));
});

test("negative: a request naming a company writes nothing", () => {
  const w = makeWorld();
  const r = w.say("u-neg2", "t1", "Find me people at Vantek Systems to network with.");
  assert.ok(!factsOf(r).some((f) => /Vantek/.test(f.value || "") || /vantek/.test(f.key || "")), JSON.stringify(factsOf(r)));
});

test("negative: a company inside a request to prep writes no interview company", () => {
  const w = makeWorld();
  const r = w.say("u-neg3", "t1", "Prep me for my interview at Vantek Systems.");
  assert.ok(!ofKind(r, "interview_company").length, JSON.stringify(factsOf(r)));
});

test("negative: a hypothetical question writes nothing", () => {
  const w = makeWorld();
  const r = w.say("u-neg4", "t1", "What if I worked at Vantek Systems someday?");
  assert.ok(!factsOf(r).some((f) => /Vantek/.test(f.value || "")), JSON.stringify(factsOf(r)));
});

test("negative: a quoted company (someone else's words) writes nothing", () => {
  const w = makeWorld();
  const r = w.say("u-neg5", "t1", 'My friend said "I work at Vantek Systems" — lucky him.');
  assert.ok(!factsOf(r).some((f) => /Vantek/.test(f.value || "")), JSON.stringify(factsOf(r)));
});

test("negative: a third person's employer writes nothing", () => {
  const w = makeWorld();
  const r = w.say("u-neg6", "t1", "My roommate works at Vantek Systems.");
  assert.ok(!factsOf(r).some((f) => /Vantek/.test(f.value || "")), JSON.stringify(factsOf(r)));
});

// ---------------------------------------------------------------------
// 5. NO-REGRESSION ANCHORS — the canonical shapes that already worked
//    keep working byte-for-behavior.
// ---------------------------------------------------------------------
test("anchor: 'my target company is X' + read-back still works", () => {
  const w = makeWorld();
  const r1 = w.say("u-a1", "t1", "My target company is Vantek Systems.");
  assert.equal(ofKind(r1, "target_firm").map((f) => f.value)[0], "Vantek Systems");
  const r2 = w.say("u-a1", "t1", "What's my target firm?");
  assert.match(r2.out.reply, /Vantek Systems/);
});

test("anchor: 'my interview at X is on Friday' still records the day", () => {
  const w = makeWorld();
  const r1 = w.say("u-a2", "t1", "My interview at Vantek Systems is on Friday.");
  const days = ofKind(r1, "interview_day");
  assert.ok(days.some((f) => (f.key || "").toLowerCase() === "vantek systems" && f.value === "Friday"), JSON.stringify(factsOf(r1)));
});
