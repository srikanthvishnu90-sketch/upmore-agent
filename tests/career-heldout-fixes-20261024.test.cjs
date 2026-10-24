"use strict";
/* HELD-OUT FIXES (coordinator item (3), 2026-10-24): the fixable gaps from
   tests/career-textpath-heldout-20261024.test.cjs, as assertions. Each
   block names the held-out turn it comes from. Same harness as the
   measurement set. Check: node --test tests/career-heldout-fixes-20261024.test.cjs */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const NOW = Date.parse("2026-10-24T15:00:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));
const POSTINGS = JSON.parse(fs.readFileSync(path.join(ROOT, "evals/career/conversations.json"), "utf8")).postings;
const FALLBACK_RE = /^(I didn't catch that|I'm Trainee, a career agent: I find roles)/;

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
    return out;
  };
  return { say };
}
const notFallback = (out, msg) => { assert.ok(out && out.intent && !FALLBACK_RE.test(String(out.reply || "")), `${msg}: got intent=${out && out.intent} reply=${String(out && out.reply).slice(0, 140)}`); };

// ---------- PREP: counted set in the "questions to practice" shape ----
test("held-out fix PREP: 'give me 4 questions to practice' + its follow-ups bind to the set frame", () => {
  const w = makeWorld(); const U = "hfix-prep";
  const t1 = w.say(U, "i have a product sense interview coming up, give me 4 questions to practice");
  assert.equal(t1.intent, "prep_brief", t1.reply);
  const qs = (t1.result && t1.result.questions) || [];
  assert.equal(qs.length, 4, t1.reply);
  const t2 = w.say(U, "do number 3");
  assert.equal(t2.intent, "prep_brief", t2.reply);
  assert.ok(String(t2.reply).includes(qs[2].q.slice(0, 30)), `the served example is question 3's: ${t2.reply.slice(0, 200)}`);
  const t3 = w.say(U, "that answer was long, condense it");
  assert.equal(t3.intent, "prep_brief", t3.reply);
  const t4 = w.say(U, "what would a strong answer include?");
  assert.equal(t4.intent, "prep_brief", t4.reply);
});

// ---------- RESUME: cleanup cold ask + short marker paste + loop ------
test("held-out fix RESUME: 'can u help me clean it up' routes; the short one-paragraph paste ingests; the bullet loop runs", () => {
  const w = makeWorld(); const U = "hfix-resume";
  const t1 = w.say(U, "hi, my resume is kind of a mess rn, can u help me clean it up?");
  assert.equal(t1.intent, "career_resume_update", t1.reply);
  const t2 = w.say(U, "Jordan Lee - Marketing Coordinator at Brightpath Media. Ran email campaigns for retail clients, grew the list, wrote copy. Skills: HubSpot, Google Analytics, copywriting. Education: B.A. Communications, DePaul University 2024");
  assert.equal(t2.intent, "career_resume_ingest", t2.reply);
  const t3 = w.say(U, "yes, that's my resume");
  notFallback(t3, "confirm");
  const t4 = w.say(U, "the email bullet is weak, make it stronger");
  notFallback(t4, "bullet fix ask");
  const t5 = w.say(U, "we sent to like 40k subscribers and click rate went up 18%");
  notFallback(t5, "metric fold");
  assert.match(String(t5.reply), /18\s?%/, t5.reply);
  const t6 = w.say(U, "yeah go with that one");
  notFallback(t6, "accept the version");
});

// ---------- ALERTS: pinged create, add-city fragment, cap read/set ---
test("held-out fix ALERTS: pinged create + 'also austin' + cap read + limit-set all land in the watch frame", () => {
  const w = makeWorld(); const U = "hfix-alerts";
  w.say(U, "i'm a cs senior at ut austin, graduating may 2027");
  const t2 = w.say(U, "can i get pinged when new product manager jobs drop in denver?");
  assert.equal(t2.intent, "career_watch_create", t2.reply);
  const t3 = w.say(U, "also austin too actually");
  assert.equal(t3.intent, "career_watch_manage", t3.reply);
  assert.match(String(t3.reply), /Austin/, t3.reply);
  const t4 = w.say(U, "how many alerts am i getting per day max?");
  assert.equal(t4.intent, "career_watch_manage", t4.reply);
  const t5 = w.say(U, "set the limit to 2 daily");
  assert.equal(t5.intent, "career_watch_manage", t5.reply);
  assert.match(String(t5.reply), /2/, t5.reply);
  const t6 = w.say(U, "what alerts do i have?");
  assert.match(String(t6.reply), /Cap: at most 2/, t6.reply);
});

// ---------- UNPAUSE: 'turn them back on' lifts the global pause -------
test("held-out fix UNPAUSE: after 'pause everything', 'ok turn them back on' lifts it", () => {
  const w = makeWorld(); const U = "hfix-unpause";
  const t1 = w.say(U, "pause everything for now");
  notFallback(t1, "pause");
  const t2 = w.say(U, "ok turn them back on");
  notFallback(t2, "turn back on");
  assert.match(String(t2.reply), /lift|resum|back on|no longer paused/i, t2.reply);
});

// ---------- POW: the design family (spec3 8B.1) recommends + paces ---
test("held-out fix POW: design-family recommender, stated budget paced verbatim, selection, proof card", () => {
  const w = makeWorld(); const U = "hfix-pow";
  w.say(U, "i want to get into ux design, i've done a couple figma projects in class");
  const t2 = w.say(U, "what proof of work would help me for product design roles?");
  assert.equal(t2.intent, "career_proof_of_work", t2.reply);
  const t3 = w.say(U, "i've got like 6 hrs a week");
  assert.equal(t3.intent, "career_proof_of_work", t3.reply);
  assert.match(String(t3.reply), /6 hours a week/, t3.reply);
  const t4 = w.say(U, "the second one sounds best");
  assert.equal(t4.intent, "career_proof_of_work", t4.reply);
  assert.match(String(t4.reply), /[Aa]ccessibility|WCAG/, t4.reply);
  const t5 = w.say(U, "ok whats the proof card for it");
  assert.equal(t5.intent, "career_proof_of_work", t5.reply);
});

// ---------- APP: 'apply to the first two' binds to the shortlist -----
test("held-out fix APP: 'apply to the first two' binds to the just-shown shortlist; the yes answers from the run", () => {
  const w = makeWorld(); const U = "hfix-app";
  w.say(U, "i'm a finance junior at depaul, graduating 2027");
  const t2 = w.say(U, "show me investment banking intern roles in chicago");
  notFallback(t2, "discovery");
  const t3 = w.say(U, "apply to the first two");
  assert.equal(t3.intent, "career_batch_apply", t3.reply);
  assert.match(String(t3.reply), /From the list I just showed you/, t3.reply);
  const t5 = w.say(U, "yes submit them");
  assert.equal(t5.intent, "career_batch_apply", t5.reply);
  assert.equal(t5.result && t5.result.sends, 0, "nothing was submitted");
});
