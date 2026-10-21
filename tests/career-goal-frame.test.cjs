/* GOAL FRAME guards (spine: stated -> recorded -> recallable).
   Live battery v247 (2026-10-21, channel-tests/2026-10-21-battery-v247.md)
   scenarios 4-5: "My career goal is a data analyst internship for
   summer 2027." was routed to career_internship_discovery and
   answered with the F-006 wrong-zero list verdict — the goal was
   never acknowledged or recorded — and "what's my career goal?"
   one turn later fell to career_fallback. Root cause: no capture
   frame and no dispatch claim existed for a goal declaration, so
   the turn fell through every owner to the discovery tail, whose
   internship/summer alternation claimed it as a search ask.
   Fix (142 only): captureStatedFacts records the clause verbatim
   as a KEYED stated fact (kind "goal", key "career" — the keyed
   carriage rides stated_facts.keyed past the account validator
   and folds back into later threads); handleGoalFrame claims the
   declaration and its recall beside the early conversation-recall
   claim, ahead of recommendations, the mock capture and the
   discovery tail. Conversations run through the real career host
   with the in-memory production-semantics store (the depth-memory
   idiom): per-thread snapshots, a per-user account record, and the
   career_host_commit patch whitelist.
   Check: node --test tests/career-goal-frame.test.cjs */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW = Date.parse("2026-10-21T12:00:00.000Z");
const WHITELIST = ["paused", "preferred_locations", "erase", "stated_facts"];
const clone = (v) => JSON.parse(JSON.stringify(v));

function makeHost() {
  return CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
}
function makeWorld() {
  const host = makeHost();
  const store = { accounts: new Map(), threads: new Map(), watches: new Map() };
  let n = 0;
  const say = (userId, threadId, text, opts) => {
    const o = opts || {};
    n += 1;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: o.postings || [] });
    const out = host.runTurn(text, ctx);
    const snap = host.extractSnapshot(ctx);
    store.threads.set(threadId, snap);
    if (ctx._hostPatch) {
      for (const k of Object.keys(ctx._hostPatch)) assert.ok(WHITELIST.includes(k), `commit patch key "${k}" is outside the career_host_commit whitelist — the database would reject this commit`);
      if (ctx._hostPatch.erase === true) store.accounts.set(userId, { paused: true });
      else { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    }
    return { out, ctx, snap };
  };
  return { host, store, say };
}
const accountRecord = (store, userId) => (store.accounts.get(userId) || {}).stated_facts || { facts: [], keyed: [] };
const GOAL_TEXT = "My career goal is a data analyst internship for summer 2027.";
const GOAL_CLAUSE = "a data analyst internship for summer 2027";

test("battery scenario 4: a stated career goal is recorded verbatim, never searched", () => {
  const { store, say } = makeWorld();
  const r = say("u-goal", "t1", GOAL_TEXT);
  assert.equal(r.out.intent, "career_goal_record", `declaration must be the goal-record outcome, not ${r.out.intent}`);
  assert.notEqual(r.out.intent, "career_internship_discovery");
  assert.ok(!r.out.contained, "the declaration turn must not be contained");
  assert.ok(r.out.reply.includes(GOAL_CLAUSE), `the reply must quote the recorded clause verbatim — got: ${r.out.reply}`);
  assert.ok(!/none of them are data/.test(r.out.reply), "the wrong-zero list verdict must never answer a goal declaration");
  // The committed account record: the goal rides the KEYED list and
  // the SQL-shaped facts list is untouched (validator-clean).
  const rec = accountRecord(store, "u-goal");
  assert.deepEqual(rec.facts, [], "stated_facts.facts must stay unchanged — the goal is not a SQL-shaped kind");
  assert.equal(rec.keyed.length, 1, "exactly one keyed fact is committed");
  assert.equal(rec.keyed[0].kind, "goal");
  assert.equal(rec.keyed[0].value, GOAL_CLAUSE, "the clause is stored verbatim");
});

test("battery scenario 5: the goal recalls verbatim in a SECOND, fresh thread", () => {
  const { say } = makeWorld();
  say("u-goal", "t1", GOAL_TEXT);
  const r = say("u-goal", "t2", "what's my career goal?");
  assert.equal(r.out.intent, "career_goal_recall", `recall must resolve against the record, not ${r.out.intent}`);
  assert.notEqual(r.out.intent, "career_fallback");
  assert.ok(r.out.reply.includes(GOAL_CLAUSE), `the recall must quote the goal verbatim — got: ${r.out.reply}`);
});

test("recall with no goal on record stands down (fall-through unchanged)", () => {
  const { store, say } = makeWorld();
  const r = say("u-none", "t1", "what's my career goal?");
  assert.notEqual(r.out.intent, "career_goal_recall", "no recorded goal: the goal claim must stand down");
  assert.deepEqual(accountRecord(store, "u-none").keyed.filter((f) => f.kind === "goal"), [], "a recall question writes no goal fact");
});

test("a conditional goal shape records nothing (BUG-169 discipline)", () => {
  const { store, say } = makeWorld();
  const r = say("u-cond", "t1", "if my goal is a data analyst internship, what should I do first?");
  assert.notEqual(r.out.intent, "career_goal_record");
  assert.deepEqual(accountRecord(store, "u-cond").keyed.filter((f) => f.kind === "goal"), [], "a conditional records no goal");
  const r2 = say("u-cond", "t1", "what's my career goal?");
  assert.notEqual(r2.out.intent, "career_goal_recall", "nothing was recorded, so the recall still stands down");
});

test("'my goal is to ...' records verbatim, and a later statement replaces the slot", () => {
  const { store, say } = makeWorld();
  const r1 = say("u-replace", "t1", "My goal is to break into product management.");
  assert.equal(r1.out.intent, "career_goal_record");
  assert.ok(r1.out.reply.includes("to break into product management"));
  const r2 = say("u-replace", "t2", "My career goal is a data analyst internship for summer 2027.");
  assert.equal(r2.out.intent, "career_goal_record");
  const rec = accountRecord(store, "u-replace");
  const goals = rec.keyed.filter((f) => f.kind === "goal");
  assert.equal(goals.length, 1, "one goal slot: a later statement replaces, never accumulates");
  assert.equal(goals[0].value, GOAL_CLAUSE);
  const r3 = say("u-replace", "t3", "what is my goal?");
  assert.equal(r3.out.intent, "career_goal_recall");
  assert.ok(r3.out.reply.includes(GOAL_CLAUSE));
  assert.ok(!/product management/.test(r3.out.reply), "the replaced goal is never recalled");
});

test("genuine discovery asks still route to discovery (precedence)", () => {
  const { say } = makeWorld();
  const r1 = say("u-disc", "t1", "find data analyst internships in Chicago");
  assert.notEqual(r1.out.intent, "career_goal_record");
  assert.notEqual(r1.out.intent, "career_goal_recall");
  assert.match(r1.out.intent, /discovery|internship/, `a find ask keeps its discovery owner — got ${r1.out.intent}`);
  const r2 = say("u-disc", "t1", "show me software engineering internships");
  assert.notEqual(r2.out.intent, "career_goal_record");
  assert.notEqual(r2.out.intent, "career_goal_recall");
  // In this harness (empty pool, no profile) the show-me ask is
  // unowned and the router stands down (intent null) — IDENTICAL
  // on the base tree: the goal claim must not capture it, and the
  // fix must not change its fall-through. (With the live pool the
  // ask takes the discovery path, as the find ask above proves
  // for its shape family.)
  assert.ok(r2.out.intent === null || /discovery|internship/.test(r2.out.intent || ""), `a show-me ask must stand down or keep discovery — got ${r2.out.intent}`);
});
