"use strict";
/* FAIL-FIRST TESTS from the 2026-10-24 text-path measurement
   (tests/career-textpath-measure-20261024.test.cjs, branch
   muse/2026-10-23-widget-eligibility-integration).
   =====================================================================
   EVERY TEST IN THIS FILE IS RED AT THE HEAD IT LANDS ON. That is the
   point: each test states, in its name and assertions, the behavior the
   career spec requires, and fails today because the router at this head
   does not do it. A test here turns green only when the product behavior
   changes — never by loosening the assertion.

   Method: identical to the measurement — the repo's own CareerHost
   composition of domain modules 120/130/142/141 (+143 containment, 140
   fallback) exactly as tests/career-router-fix1-mock-skip.test.cjs
   composes them. Messages go in as a user's texts; the router decides.
   No scripted tool picks. Approval turns appear only in the shape the
   spec describes (spec1 section 7 per-message approval; spec3 section 5
   user accepts the rewritten version). Synthetic profiles only.

   fallback := the composed generic answer: intent null, intent
   "career_fallback", or a reply matching module 140's FALLBACK_TEXT_RE.
*/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const FALLBACK_RE = /^(I didn't catch that|I'm Trainee, a career agent: I find roles)/;
const NOW = Date.parse("2026-10-24T15:00:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));
const POSTINGS = JSON.parse(fs.readFileSync(path.join(ROOT, "evals/career/conversations.json"), "utf8")).postings;

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
    if (ctx._hostPatch) {
      if (ctx._hostPatch.erase === true) store.accounts.set(userId, { paused: true });
      else { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    }
    const reply = String((out && out.reply) || "");
    return {
      text,
      intent: (out && out.intent) ?? null,
      fallback: Boolean(!out || out.intent == null || out.intent === "career_fallback" || FALLBACK_RE.test(reply)),
      reply,
    };
  };
  return { say };
}

const INTAKE = "I'm a data analyst with 2 years of SQL and Tableau, based in Chicago";
const RESUME_PASTE = "here's my resume: Alex Rivera, Data Analyst, Chicago IL. Experience: Data Analyst at Brightpath Logistics, 2023 to now - built SQL reports for warehouse operations, made Tableau dashboards for the ops team. Skills: SQL, Tableau, Excel. Education: B.S. Economics, 2023.";
const WATCH = new Set(["career_watch_create", "career_watch_manage"]);
const isNet = (i) => typeof i === "string" && (i.startsWith("outreach_") || i.startsWith("graph_"));
const isPrep = (i) => typeof i === "string" && i.startsWith("prep_");
const isResume = (i) => typeof i === "string" && i.startsWith("career_resume");

test("resume fix: a pasted resume is taken in, and the bullet loop (ask, user metric, accept) stays in the resume flow", () => {
  const w = makeWorld();
  w.say("u-ff-resume", INTAKE);
  const paste = w.say("u-ff-resume", RESUME_PASTE);
  assert.equal(paste.fallback, false, "REQUIRED: pasting a resume routes to resume ingest, not the generic fallback");
  assert.ok(isResume(paste.intent), `REQUIRED: paste intent is a resume intent (career_resume_*), got ${paste.intent}`);
  const bullet = w.say("u-ff-resume", "make the Brightpath bullet stronger");
  assert.equal(bullet.fallback, false, "REQUIRED: 'make the Brightpath bullet stronger' is served by the resume flow (spec3 section 5), not the fallback");
  const metric = w.say("u-ff-resume", "the reports cut the weekly reporting time from 5 hours to 1 hour, and about 30 people use them");
  assert.equal(metric.fallback, false, "REQUIRED: the user-supplied metric is consumed by the bullet loop, not the fallback");
  const accept = w.say("u-ff-resume", "yes, use that version");
  assert.equal(accept.fallback, false, "REQUIRED: the spec-shaped acceptance ('yes, use that version') is consumed by the resume flow, not the fallback");
});

test("alerts: set, cap, read back, correction, and stop all stay in the watch flow (conversations.json C14/C22/C25 phrasing)", () => {
  const w = makeWorld();
  w.say("u-ff-alerts", INTAKE);
  const set = w.say("u-ff-alerts", "set alerts for data analyst jobs in chicago");
  assert.equal(set.intent, "career_watch_create", `REQUIRED: 'set alerts for...' creates a watch (the eval corpus's own phrasing), got ${set.intent}`);
  const cap = w.say("u-ff-alerts", "max 3 a day");
  assert.equal(cap.fallback, false, "REQUIRED: 'max 3 a day' is consumed as the watch's cap, not the fallback");
  assert.ok(WATCH.has(cap.intent), `REQUIRED: cap turn stays in the watch family, got ${cap.intent}`);
  const read = w.say("u-ff-alerts", "what alerts do I have?");
  assert.equal(read.intent, "career_watch_manage", `REQUIRED: 'what alerts do I have?' reads the watch back, got ${read.intent}`);
  const fix = w.say("u-ff-alerts", "no sorry, make it 1 a day, not 3");
  assert.ok(WATCH.has(fix.intent), `REQUIRED: the cap correction stays in the watch family, got ${fix.intent}`);
  const stop = w.say("u-ff-alerts", "actually stop my alerts");
  assert.ok(WATCH.has(stop.intent), `REQUIRED: 'actually stop my alerts' is handled by the watch flow, got ${stop.intent}`);
  assert.equal(stop.fallback, false, "REQUIRED: the stop turn is not the generic fallback");
});

test("networking: the cold ask 'who should I network with for banking?' routes to the networking flow", () => {
  const w = makeWorld();
  const cold = w.say("u-ff-net-cold", "who should I network with for banking?");
  assert.equal(cold.fallback, false, "REQUIRED: the cold networking ask is served, not the generic fallback (measured live on v249 and at this head)");
  assert.ok(isNet(cold.intent), `REQUIRED: cold ask intent is networking (outreach_*/graph_*), got ${cold.intent}`);
});

test("networking: narrowing to a target firm mid-flow ('let's focus on people at Ferrow Bank') is consumed by the outreach flow", () => {
  const w = makeWorld();
  const open = w.say("u-ff-net-focus", "I am a sophomore who wants to network into investment banking. Help me find people to reach out to and draft my first outreach.");
  assert.ok(isNet(open.intent), `setup: the canonical ask opens the outreach flow, got ${open.intent}`);
  const focus = w.say("u-ff-net-focus", "let's focus on people at Ferrow Bank");
  assert.equal(focus.fallback, false, "REQUIRED: a target-firm narrowing inside an open outreach flow is consumed, not the fallback");
  assert.ok(isNet(focus.intent), `REQUIRED: focus turn stays in the networking family, got ${focus.intent}`);
});

test("proof-of-work: the spec3 8.8 recommender ask and its follow-ups (time budget, pick one, proof card) are served", () => {
  const w = makeWorld();
  w.say("u-ff-pow", INTAKE);
  const ask = w.say("u-ff-pow", "I keep getting rejected for not having dashboard projects. what project should I build to prove I can do this work?");
  assert.equal(ask.fallback, false, "REQUIRED: the proof-of-work project ask (spec3 section 8.8) is served, not the generic fallback");
  const time = w.say("u-ff-pow", "I only have weekends, like 4 hours a week");
  assert.equal(time.fallback, false, "REQUIRED: the time-budget follow-up stays in the project-scoping flow");
  assert.notEqual(time.intent, "company_intel", "REQUIRED: a time-budget reply is not routed to company intel");
  assert.ok(!/2 hours per week/.test(time.reply), "REQUIRED: the reply does not restate the user's stated 4 hours a week as 2 hours per week");
  const pick = w.say("u-ff-pow", "ok let's do the first one");
  assert.equal(pick.fallback, false, "REQUIRED: picking a recommended project is consumed by the flow, not the fallback");
  const card = w.say("u-ff-pow", "what goes on the proof card for it?");
  assert.equal(card.fallback, false, "REQUIRED: the proof-card question (spec3 section 8.0) is answered, not the fallback");
});

test("interview prep: 'give me 3 interview questions' opens question practice and the follow-up is consumed (conversations.json C17)", () => {
  const w = makeWorld();
  const open = w.say("u-ff-prepq", "give me 3 interview questions for a data analyst role");
  assert.equal(open.fallback, false, "REQUIRED: the question-practice ask routes to prep, not the generic fallback");
  assert.ok(isPrep(open.intent), `REQUIRED: intent is a prep intent, got ${open.intent}`);
  const follow = w.say("u-ff-prepq", "answer the 2nd one as an example");
  assert.equal(follow.fallback, false, "REQUIRED: 'answer the 2nd one as an example' is consumed by the prep flow, not the fallback");
});

test("wrong route: an alerts cap correction is never captured by negotiation ('make it 1 a day, not 3')", () => {
  const w = makeWorld();
  w.say("u-ff-wrong-neg", "set alerts for data analyst jobs in chicago");
  w.say("u-ff-wrong-neg", "max 3 a day");
  w.say("u-ff-wrong-neg", "what alerts do I have?");
  const fix = w.say("u-ff-wrong-neg", "no sorry, make it 1 a day, not 3");
  assert.notEqual(fix.intent, "negotiation_revision", "REQUIRED: an alerts cap correction is not routed to negotiation revision (measured at this head: negotiation_revision, answering about offers and counters)");
  assert.equal(fix.fallback, false, "REQUIRED: the correction is handled in the alerts context, not dropped to the fallback");
});

test("wrong route: 'now make it shorter' after interview questions is not captured by the cover-letter/tailor flow", () => {
  const w = makeWorld();
  w.say("u-ff-wrong-short", "give me 3 interview questions for a data analyst role");
  w.say("u-ff-wrong-short", "answer the 2nd one as an example");
  const shorter = w.say("u-ff-wrong-short", "now make it shorter");
  assert.notEqual(shorter.intent, "career_tailor", "REQUIRED: a revision of prep material is not routed to career_tailor (measured at this head: career_tailor answering that no draft exists)");
  assert.equal(shorter.fallback, false, "REQUIRED: the revision is handled in the prep context, not dropped to the fallback");
});

test("wrong route: a proof-of-work time-budget reply is not routed to company intel and the stated budget is not rewritten", () => {
  const w = makeWorld();
  w.say("u-ff-wrong-intel", INTAKE);
  w.say("u-ff-wrong-intel", "I keep getting rejected for not having dashboard projects. what project should I build to prove I can do this work?");
  const time = w.say("u-ff-wrong-intel", "I only have weekends, like 4 hours a week");
  assert.notEqual(time.intent, "company_intel", "REQUIRED: a time-budget statement in a project-scoping conversation is not routed to company_intel (measured at this head: company_intel)");
  assert.ok(!/2 hours per week/.test(time.reply), "REQUIRED: the reply keeps the user's stated budget (4 hours a week), measured reply restated it as 2 hours per week");
});
