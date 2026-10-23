/* WAVE-1 guard (BL-240…BL-269, census cause fallback-routing) — the
   mock-interview SESSION LIFECYCLE on web chat. Mechanisms, not
   battery shapes (the BUG-213 standard): a mock start named its
   role/company in the ask and was refused for want of a full
   profile (the gate read the stale pre-bridge profile const, and
   the refusal stranded every later turn — no session existed for
   answers, advances or debrief asks to land in); a LABELED answer
   ("My answer: …") was released as a label-led new task; a debrief
   ask ("how did I do? score me honestly") was owned by no handler;
   and the question-bank ask in its natural shape ("what questions
   does <Co> ask for <Role> roles?") never contained the words
   "question bank", so the bank's own branch never fired.

   This guard runs the DEPLOYED path (real CareerHost, production
   commit semantics, same world as the prep-kb guard) with:
   (a) the battery's EXACT failing turns, full multi-turn replays
       (CB-0329 / CB-0321 sessions, CB-0347 / CB-0350 question
       banks, CB-0355 mock + debrief), and
   (b) fresh paraphrases in different words and firms (mechanism
       proof), plus controls (the questions-TO-ask direction keeps
       its owner; a cold debrief ask invents no score; a live mock
       still does not swallow a genuinely new task).
   Check: node --test tests/career-wave1-mock-session.test.cjs */
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
const isFallback = (out) => !out || !out.reply || String(out.reply).match(/^(I didn't catch that|I'm Trainee, a career agent: I find roles)/);

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
function seedAccount(w, u) {
  w.say(u, "seed", "I'm a sophomore studying economics, and I'm targeting Meridian Capital");
  w.say(u, "seed", "I'm based in Denver and I want data roles");
}
const mockInSnapshot = (snap) => {
  const ts = ((snap || {}).stores || {}).trackStore || {};
  const prep = ((ts._careerThread || {}).prep) || {};
  return prep.prepMock || null;
};

// ---------- (a) CB-0329 verbatim: the mock session, no profile on file ----------
test("W1-1 (CB-0329 verbatim): mock start runs profile-less, the answer lands, the advance poses the next question", () => {
  const w = makeWorld();
  const u = "u-w1-0329";
  const T = "t0329";
  const t1 = w.say(u, T, "start a mock interview for a Backend Engineer, New Grad role at Fieldnote Software (fictional)");
  assert.ok(!isFallback(t1.out), `start fell to fallback: ${t1.out.reply}`);
  assert.equal(t1.out.intent, "prep_mock_start", `the mock starts (intent: ${t1.out.intent}; reply: ${t1.out.reply.slice(0, 200)})`);
  assert.match(t1.out.reply, /Fieldnote Software/, "the start names the ask's company");
  assert.match(t1.out.reply, /Backend Engineer/, "the start names the ask's role");
  assert.match(t1.out.reply, /No profile is on file/, "the grounding is honest about the missing profile — no invented profile grounding");
  const posed1 = (t1.out.result && t1.out.result.mock && t1.out.result.mock.question) || "";
  assert.ok(posed1.length > 10, `a first question is posed (posed: ${JSON.stringify(posed1)})`);
  assert.ok(mockInSnapshot(t1.snap), "the session state rides the thread snapshot after turn 1");

  const t2 = w.say(u, T, "I would start by sizing the market, then segment by user type and willingness to pay.");
  assert.ok(!isFallback(t2.out), `the answer fell to fallback: ${t2.out.reply}`);
  assert.match(t2.out.intent || "", /^prep_mock/, `the answer lands in the mock (intent: ${t2.out.intent})`);
  assert.match(t2.out.reply, /[Rr]ubric/, "the answer is scored against the rubric");

  const t3 = w.say(u, T, "keep going — next question");
  assert.ok(!isFallback(t3.out), `the advance fell to fallback: ${t3.out.reply}`);
  assert.equal(t3.out.intent, "prep_mock_next", `the advance poses the next question (intent: ${t3.out.intent})`);
  const posed3 = (t3.out.result && t3.out.result.mock && t3.out.result.mock.question) || "";
  assert.ok(posed3.length > 10 && posed3 !== posed1, `a NEW question is posed (posed: ${JSON.stringify(posed3)})`);
});

// ---------- (a) CB-0321 verbatim, on a stated-facts account ----------
test("W1-2 (CB-0321 verbatim): the same lifecycle holds for a user whose record is stated facts, not a profile", () => {
  const w = makeWorld();
  const u = "u-w1-0321";
  seedAccount(w, u);
  const T = "t0321";
  const t1 = w.say(u, T, "start a mock interview for a Software Engineer, Defence Systems role at Sentinel Works (fictional)");
  assert.ok(!isFallback(t1.out), `start fell to fallback: ${t1.out.reply}`);
  assert.equal(t1.out.intent, "prep_mock_start", `the mock starts (intent: ${t1.out.intent}; reply: ${t1.out.reply.slice(0, 200)})`);
  assert.match(t1.out.reply, /Sentinel Works/);
  const t2 = w.say(u, T, "I would start by sizing the market, then segment by user type and willingness to pay.");
  assert.ok(!isFallback(t2.out), `the answer fell to fallback: ${t2.out.reply}`);
  assert.match(t2.out.intent || "", /^prep_mock/);
  const t3 = w.say(u, T, "keep going — next question");
  assert.ok(!isFallback(t3.out), `the advance fell to fallback: ${t3.out.reply}`);
  assert.equal(t3.out.intent, "prep_mock_next");
});

// ---------- (a) CB-0347 + CB-0350 verbatim: the question bank in natural words ----------
test("W1-3 (CB-0347/CB-0350 verbatim): 'what questions does <Co> ask for <Role> roles?' serves the bank for that role", () => {
  const w = makeWorld();
  const t1 = w.say("u-w1-qb1", "qb1", "what questions does Fieldnote Software (fictional) ask for Backend Engineer, New Grad roles?");
  assert.ok(!isFallback(t1.out), `the question-bank ask fell to fallback: ${t1.out.reply}`);
  assert.equal(t1.out.intent, "prep_brief", `the bank serves (intent: ${t1.out.intent})`);
  assert.ok(t1.out.result && t1.out.result.bank, "the bank record rides the result");
  // The served set leads with the named role's own questions (the
  // SWE coding set), not the generic behavioral opener.
  assert.match(t1.out.reply, /two numbers that sum to it|linked list|URL shortener|hash map/i, `a backend question is served (reply: ${t1.out.reply.slice(0, 300)})`);

  const t2 = w.say("u-w1-qb2", "qb2", "what questions does Meridian Fulfillment (fictional) ask for Operations Analyst roles?");
  assert.ok(!isFallback(t2.out), `the second firm's ask fell to fallback: ${t2.out.reply}`);
  assert.equal(t2.out.intent, "prep_brief", `the bank serves for the second firm too (intent: ${t2.out.intent})`);
});

// ---------- (a) CB-0355 verbatim: mock + debrief ----------
test("W1-4 (CB-0355 verbatim): a labeled answer lands in the mock, and 'how did I do? score me honestly' debriefs from the session record", () => {
  const w = makeWorld();
  const u = "u-w1-0355";
  const T = "t0355";
  const t1 = w.say(u, T, "run a short mock interview for Ironstack Payments (fictional)");
  assert.ok(!isFallback(t1.out), `start fell to fallback: ${t1.out.reply}`);
  assert.equal(t1.out.intent, "prep_mock_start", `the mock starts (intent: ${t1.out.intent}; reply: ${t1.out.reply.slice(0, 200)})`);
  assert.match(t1.out.reply, /Ironstack Payments/, "the start names the company named after 'for'");

  const t2 = w.say(u, T, "My answer: I'd build a three-statement model starting from revenue drivers and check it against comps.");
  assert.ok(!isFallback(t2.out), `the labeled answer fell to fallback: ${t2.out.reply}`);
  assert.match(t2.out.intent || "", /^prep_mock/, `the labeled answer lands in the mock, not in a new task (intent: ${t2.out.intent}; reply: ${t2.out.reply.slice(0, 200)})`);

  const t3 = w.say(u, T, "how did I do? score me honestly");
  assert.ok(!isFallback(t3.out), `the debrief ask fell to fallback: ${t3.out.reply}`);
  assert.equal(t3.out.intent, "prep_mock_debrief", `the debrief is served from the session (intent: ${t3.out.intent}; reply: ${t3.out.reply.slice(0, 200)})`);
  assert.match(t3.out.reply, /structure \d/i, "the debrief speaks the recorded rubric scores");
  assert.match(t3.out.reply, /1 answer/, "the debrief counts only the answers actually given");
  assert.ok(t3.out.result && t3.out.result.summary && t3.out.result.summary.answered === 1, "the summary record carries the true answered count");
  assert.ok(!mockInSnapshot(t3.snap), "the debrief closes the session — no stale mock rides the snapshot");
});

// ---------- (b) fresh paraphrases: different words, different firms ----------
test("W1-5 (paraphrase): a practice-interview start in new words runs the full lifecycle at a new firm", () => {
  const w = makeWorld();
  const u = "u-w1-para";
  const T = "tpara";
  const t1 = w.say(u, T, "could we practice interviewing for a data analyst seat at Northwind Traders (fictional)?");
  assert.ok(!isFallback(t1.out), `start fell to fallback: ${t1.out.reply}`);
  assert.equal(t1.out.intent, "prep_mock_start", `the mock starts (intent: ${t1.out.intent}; reply: ${t1.out.reply.slice(0, 200)})`);
  assert.match(t1.out.reply, /Northwind Traders/);
  const t2 = w.say(u, T, "In my last project I cleaned a messy sales dataset in Python and built a dashboard the ops team used every week, which cut their reporting time by about a third.");
  assert.ok(!isFallback(t2.out), `the answer fell to fallback: ${t2.out.reply}`);
  assert.match(t2.out.intent || "", /^prep_mock/, `the narrative answer lands in the mock (intent: ${t2.out.intent})`);
  const t3 = w.say(u, T, "next one please");
  assert.ok(!isFallback(t3.out), `the advance fell to fallback: ${t3.out.reply}`);
  assert.equal(t3.out.intent, "prep_mock_next", `the advance poses the next question (intent: ${t3.out.intent})`);
  const t4 = w.say(u, T, "ok stop there — grade me, what needs work?");
  assert.ok(!isFallback(t4.out), `the debrief fell to fallback: ${t4.out.reply}`);
  assert.equal(t4.out.intent, "prep_mock_debrief", `the paraphrased debrief is served (intent: ${t4.out.intent})`);
  assert.match(t4.out.reply, /weakest/i, "the debrief names the weakest rubric area");
});

test("W1-6 (paraphrase): the question-bank ask in new words, for a new firm and role", () => {
  const w = makeWorld();
  const t1 = w.say("u-w1-qbp", "qbp", "which questions does Harbor Freight Systems ask in interviews for support engineer roles?");
  assert.ok(!isFallback(t1.out), `the paraphrased bank ask fell to fallback: ${t1.out.reply}`);
  assert.equal(t1.out.intent, "prep_brief", `the bank serves (intent: ${t1.out.intent}; reply: ${t1.out.reply.slice(0, 200)})`);
  assert.ok(t1.out.result && t1.out.result.bank, "the bank record rides the result");
});

// ---------- controls: neighboring owners keep their turns ----------
test("W1-7 (control): questions the CANDIDATE should ask keep their own producer — never the company's bank", () => {
  const w = makeWorld();
  const t1 = w.say("u-w1-ctl1", "ctl1", "what questions should I ask the panel at the end?");
  assert.ok(!isFallback(t1.out), `the questions-to-ask turn fell to fallback: ${t1.out.reply}`);
  assert.match(t1.out.reply, /questions to ask/i, `the questions-to-ask product answers (reply: ${t1.out.reply.slice(0, 200)})`);
  assert.ok(!(t1.out.result && t1.out.result.bank), "the company question bank is not served for the candidate's own questions");
});

test("W1-8 (control): a debrief ask with NO live mock invents no score", () => {
  const w = makeWorld();
  const t1 = w.say("u-w1-ctl2", "ctl2", "how did I do? score me honestly");
  assert.notEqual(t1.out.intent, "prep_mock_debrief", "no session, no debrief verdict");
  assert.ok(!/Rubric averages/.test(t1.out.reply || ""), `no fabricated rubric averages are spoken (reply: ${(t1.out.reply || "").slice(0, 200)})`);
});

test("W1-9 (control): a live mock still does not swallow a genuinely new task", () => {
  const w = makeWorld();
  const u = "u-w1-ctl3";
  const T = "ctl3";
  const t1 = w.say(u, T, "run a short mock interview for Ironstack Payments (fictional)");
  assert.equal(t1.out.intent, "prep_mock_start");
  const t2 = w.say(u, T, "find data analyst jobs in Denver");
  assert.ok(!/^prep_mock/.test(t2.out.intent || ""), `a new task is not eaten as a mock answer (intent: ${t2.out.intent}; reply: ${t2.out.reply.slice(0, 200)})`);
});
