"use strict";
/* CATCH-ALL META QUESTION (2026-10-27) — fail-first at c93341c9.

   Verified live defect on trunk bdd51e9c: with a served discussion in
   the thread, "Hi, what can you help me with right now?" routes to
   career_catchall and the reply lists the capabilities — then asks
   "Which role or company is it about, and what date does it turn
   on?" A question about the agent's own capabilities is not about a
   role, a company, or a date; the case clarifier misfires on it.

   Root cause: handleCareerCatchAll's nextStep branches only on
   hasAnchor (a capitalized/month/weekday mention). Every no-anchor
   turn gets the case clarifier, whatever kind of question arrived.
   The matcher for the coordinator's input is the standing-context
   clause (servedDiscussion from the prior career_life_event turn);
   the bare text matches no lexicon/worklife/develop clause.

   Pins:
   - a capabilities/meta question with no anchor gets the
     general-picture next step, never the role/company+date one;
   - the date clarifier STAYS for the topics it was written for:
     a no-anchor entitlement turn and a no-anchor work-life
     statement still end on it.
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

test("a capabilities question with no anchor gets the general-picture next step, not the role/company+date clarifier", () => {
  const w = servedWorld();
  const t2 = w.say("u", "Hi, what can you help me with right now?");
  assert.equal(t2.intent, "career_catchall", `intent: ${t2.intent}`);
  assert.match(t2.reply, /Here is what I can do/, `the capability list is the reply's content: ${t2.reply.slice(0, 200)}`);
  assert.ok(!t2.reply.includes(DATE_CLARIFIER), `must not ask for a role/company/date on a capabilities question: ${t2.reply}`);
  assert.ok(t2.reply.includes(GENERAL_PICTURE), `must offer the general-picture choice: ${t2.reply}`);
});

test("capabilities phrasings that reach the catch-all also skip the date clarifier", () => {
  // ("what can you do for me?" never reaches the catch-all — the
  // greeting handler owns it upstream; these two do reach it.)
  for (const q of ["what can you help me with right now?", "how can you help me?"]) {
    const w = servedWorld();
    const t2 = w.say("u", q);
    assert.equal(t2.intent, "career_catchall", `${q}: intent ${t2.intent}`);
    assert.ok(!t2.reply.includes(DATE_CLARIFIER), `${q}: date clarifier misfired: ${t2.reply}`);
    assert.ok(t2.reply.includes(GENERAL_PICTURE), `${q}: expected the general-picture next step: ${t2.reply}`);
  }
});

test("KEEP: a no-anchor entitlement turn still ends on the role/company+date clarifier", () => {
  const w = servedWorld();
  const t2 = w.say("u", "my unemployment benefits are confusing me");
  assert.equal(t2.intent, "career_catchall", `intent: ${t2.intent}`);
  assert.ok(t2.reply.includes(DATE_CLARIFIER), `the entitlement case keeps its clarifier: ${t2.reply}`);
});

test("KEEP: a no-anchor work-life statement still ends on the role/company+date clarifier", () => {
  const w = makeWorld();
  const t1 = w.say("u", "I got written up at work");
  assert.equal(t1.intent, "career_catchall", `intent: ${t1.intent}`);
  assert.ok(t1.reply.includes(DATE_CLARIFIER), `the work-life case keeps its clarifier: ${t1.reply}`);
});
