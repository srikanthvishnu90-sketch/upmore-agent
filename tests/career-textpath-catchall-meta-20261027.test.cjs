"use strict";
/* CATCH-ALL META QUESTION (2026-10-27) — fail-first at c93341c9.

   Verified live defect on trunk bdd51e9c: with a served discussion in
   the thread, "Hi, what can you help me with right now?" routes to
   career_catchall and the reply lists the capabilities — then asks
   "Which role or company is it about, and what date does it turn
   on?" A question about the agent's own capabilities is not about a
   role, a company, or a date; the case clarifier misfires on it.

   Root cause, at two levels. (1) Recognition: the router already
   owns a capabilities branch — handleHonestUnavailableAction
   answers "what can you help with" with the real list — but its
   recognition covers "help with", not "help me with", so the
   phrase fell through every earlier handler. (2) Composition:
   whatever meta question still reached the catch-all met a
   nextStep that branches only on hasAnchor (a capitalized /
   month / weekday mention), so every no-anchor turn got the
   case clarifier written for entitlement/work-life topics. The
   clause that carried the coordinator's input into the catch-all
   is the standing-context clause (servedDiscussion, set by the
   prior served turn — a benefits question or a life-event turn);
   the bare text matches no lexicon/worklife/develop clause, and
   in a FRESH context the input reaches no handler at all (the
   containment banner answers) — the answer to a capabilities
   question must not depend on thread history either way.

   Pins:
   - the exact defect input gets the dedicated capabilities reply
     ("Here is what I can do: …", no "did not catch", no date
     clarifier) in a fresh context AND in continued contexts
     (served discussion; prior benefits question);
   - a meta phrasing the dedicated branch does not recognize
     ("how can you help me?") still skips the date clarifier in
     the catch-all — the general-picture next step instead;
   - the date clarifier STAYS for the topics it was written for:
     a no-anchor entitlement turn, a non-meta follow-up inside a
     benefits discussion, and a no-anchor work-life statement
     still end on it.
   Check: node --test tests/career-textpath-catchall-meta-20261027.test.cjs */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW = Date.parse("2026-10-27T15:00:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));
const POSTINGS = JSON.parse(fs.readFileSync(path.join(ROOT, "evals/career/conversations.json"), "utf8")).postings;
const DATE_CLARIFIER = "Which role or company is it about, and what date does it turn on?";
const GENERAL_PICTURE = "Do you want the general picture, or help acting on your specific case?";

function makeWorld() {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const store = { accounts: new Map(), threads: new Map(), watches: new Map() };
  let n = 0;
  const say = (userId, text) => {
    n += 1;
    const threadId = `t-${userId}`;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: POSTINGS });
    const out = host.runTurn(text, ctx);
    store.threads.set(threadId, host.extractSnapshot(ctx));
    return { intent: out ? out.intent : null, reply: String((out && out.reply) || "") };
  };
  return { say };
}

// A served career discussion in the thread, so the catch-all's
// standing-context clause is what brings the second turn in scope —
// the exact shape the defect was verified in.
function servedWorld() {
  const w = makeWorld();
  const t1 = w.say("u", "I got laid off last week and I feel stuck");
  assert.equal(t1.intent, "career_life_event", `setup turn must be a served discussion: ${t1.intent} / ${t1.reply.slice(0, 120)}`);
  return w;
}

test("the exact defect input gets the dedicated capabilities reply — FRESH context", () => {
  // handleHonestUnavailableAction already owns a capabilities
  // branch ("Fair question — here is the real list." + the
  // capability line + "Name one and it starts now."); the phrase
  // "help me with" simply was not in its recognition, so the turn
  // fell through. Fresh context must get that reply too — the
  // answer to "what can you do" cannot depend on thread history.
  const w = makeWorld();
  const t1 = w.say("u", "Hi, what can you help me with right now?");
  assert.equal(t1.intent, "honest_unavailable", `intent: ${t1.intent}`);
  assert.ok(t1.reply.includes("Here is what I can do:"), `the capability line is the reply: ${t1.reply.slice(0, 200)}`);
  assert.ok(!/did not catch/i.test(t1.reply), `must not plead incomprehension at a recognized question: ${t1.reply}`);
  assert.ok(!t1.reply.includes(DATE_CLARIFIER), `must not ask for a role/company/date on a capabilities question: ${t1.reply}`);
});

test("the exact defect input gets the dedicated capabilities reply — CONTINUED context (served discussion)", () => {
  const w = servedWorld();
  const t2 = w.say("u", "Hi, what can you help me with right now?");
  assert.equal(t2.intent, "honest_unavailable", `intent: ${t2.intent}`);
  assert.ok(t2.reply.includes("Here is what I can do:"), `the capability line is the reply: ${t2.reply.slice(0, 200)}`);
  assert.ok(!/did not catch/i.test(t2.reply), `must not plead incomprehension at a recognized question: ${t2.reply}`);
  assert.ok(!t2.reply.includes(DATE_CLARIFIER), `must not ask for a role/company/date on a capabilities question: ${t2.reply}`);
});

test("the exact defect input gets the dedicated capabilities reply — CONTINUED context (prior benefits question)", () => {
  // The trigger context of the external reproduction: a benefits
  // question first (itself a served catch-all turn), then the
  // capabilities question. Same answer as fresh — context-free.
  const w = makeWorld();
  const t1 = w.say("u", "how do unemployment benefits work?");
  assert.equal(t1.intent, "career_catchall", `setup turn: ${t1.intent}`);
  const t2 = w.say("u", "Hi, what can you help me with right now?");
  assert.equal(t2.intent, "honest_unavailable", `intent: ${t2.intent}`);
  assert.ok(t2.reply.includes("Here is what I can do:"), `the capability line is the reply: ${t2.reply.slice(0, 200)}`);
  assert.ok(!t2.reply.includes(DATE_CLARIFIER), `must not ask for a role/company/date on a capabilities question: ${t2.reply}`);
});

test("a capabilities phrasing the dedicated branch does not recognize still skips the date clarifier in the catch-all", () => {
  // "how can you help me?" is not in the capabilities branch's
  // recognition; it lands on the catch-all, whose next step must
  // be the general-picture choice, never the case clarifier.
  const w = servedWorld();
  const t2 = w.say("u", "how can you help me?");
  assert.equal(t2.intent, "career_catchall", `intent: ${t2.intent}`);
  assert.ok(!t2.reply.includes(DATE_CLARIFIER), `date clarifier misfired: ${t2.reply}`);
  assert.ok(t2.reply.includes(GENERAL_PICTURE), `expected the general-picture next step: ${t2.reply}`);
});

test("KEEP: a no-anchor entitlement turn still ends on the role/company+date clarifier", () => {
  const w = servedWorld();
  const t2 = w.say("u", "my unemployment benefits are confusing me");
  assert.equal(t2.intent, "career_catchall", `intent: ${t2.intent}`);
  assert.ok(t2.reply.includes(DATE_CLARIFIER), `the entitlement case keeps its clarifier: ${t2.reply}`);
});

test("KEEP: a non-meta follow-up inside a benefits discussion still ends on the role/company+date clarifier", () => {
  const w = makeWorld();
  w.say("u", "how do unemployment benefits work?");
  const t2 = w.say("u", "and how long do they last?");
  assert.equal(t2.intent, "career_catchall", `intent: ${t2.intent}`);
  assert.ok(t2.reply.includes(DATE_CLARIFIER), `the in-topic follow-up keeps its clarifier: ${t2.reply}`);
});

test("KEEP: a no-anchor work-life statement still ends on the role/company+date clarifier", () => {
  const w = makeWorld();
  const t1 = w.say("u", "I got written up at work");
  assert.equal(t1.intent, "career_catchall", `intent: ${t1.intent}`);
  assert.ok(t1.reply.includes(DATE_CLARIFIER), `the work-life case keeps its clarifier: ${t1.reply}`);
});
