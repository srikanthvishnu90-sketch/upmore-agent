/* ROUTER-FIX-1 guard — the mock-interview session's advance and debrief,
   on the deployed path (real CareerHost, production commit semantics,
   same world as the wave-1 mock guard).

   Defect (a): the session's only advance gate (handleMockAdvance in 142)
   recognized a control turn solely when the turn BEGAN with one of six
   stems. The same instruction in any framed form — "please skip",
   "can we skip this one?" — and the product's own skip word "pass"
   (career_mock.ts maps it to a skip; 142's own don't-know branch treats
   it as a pass) matched nothing, were released by dispatch, and died on
   the generic fallback: no next question, the candidate stranded on the
   pending question. A skip must advance to the next question and keep
   the session open, in the forms a person actually types.

   Defect (b): every composition that verdicts or closes the mock
   (handleMockDebrief, the completion branch of handlePrepAnswer,
   handleMockAdvance's finish) built the verdict from mockSummary's
   fix_first — the weakest rubric DIMENSION — and dropped the per-answer
   record (what_didnt[].fix: 127's feedback for that very answer,
   recorded at answer time). The debrief must name ONE concrete
   improvement on an answer actually given.

   All candidate content below is synthetic and written for this guard.
   Check: node --test tests/career-router-fix1-mock-skip.test.cjs */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
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
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: o.postings || [] });
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
const mockOf = (snap) => {
  const ts = ((snap || {}).stores || {}).trackStore || {};
  const prep = ((ts._careerThread || {}).prep) || {};
  return prep.prepMock || null;
};
const mockRecord = (snap) => {
  const st = mockOf(snap);
  const mocks = st && st.store && Array.isArray(st.store.mocks) ? st.store.mocks : [];
  return mocks.find((x) => x.mock_id === st.mockId) || null;
};

const START = "Start a mock interview for a data analyst role";
// A substantive narrative answer (lands as the Q1 answer; a probe follows).
const LONG = "In my internship at a payments company I built a SQL dashboard that tracked checkout conversion for 30 merchants. First I cleaned the event data, then I automated the weekly pull, and in the end the team cut its reporting time from five hours to thirty minutes.";
// A probe answer with numbers (records the next slot; the next question is posed).
const PROBE_ANSWER = "The hardest part was the messy returns data, because two tables disagreed on order IDs. I sampled 200 rows by hand, measured a 9% mismatch, and wrote a Python script that cut the cleanup from 4 hours to 15 minutes for our 3-person team.";
// A weak answer: a named project, no number anywhere — 127's rubric records the
// missing-result-metric diagnosis for THIS answer (verified: total 3, its
// feedback[0] is the missing-result-metric line).
const WEAK = "For my databases class I built a returns-forecast workbook for a pretend clothing shop. I set up the tables, wrote the queries myself, and kept improving it until it felt solid and the shop owner in our case study was happy with how it looked.";
// Control: a real answer that merely contains the word "skip" mid-sentence.
const SKIP_IN_SENTENCE = "I had to skip the morning standup for two weeks while I finished the data migration, because the vendor changed the schema twice. I documented every change, and in the end the migration finished 3 days early for a team of 8.";

test("F1-1 'please skip' mid-mock (probe pending) poses the next question and keeps the session open", () => {
  const w = makeWorld();
  const s = w.say("u", "t", START);
  assert.equal(s.out.intent, "prep_mock_start");
  const a = w.say("u", "t", LONG);
  assert.equal(a.out.intent, "prep_mock_followup", "setup: the answer lands and a probe is pending");
  const before = mockRecord(a.snap);
  assert.equal(before.answers.length, 1);
  const r = w.say("u", "t", "please skip");
  assert.equal(r.out.intent, "prep_mock_next", `the skip advances (intent: ${r.out.intent}; reply: ${String(r.out.reply).slice(0, 160)})`);
  const st = mockOf(r.snap);
  assert.ok(st, "the session is still open after the skip");
  assert.equal(st.phase, "question");
  assert.equal(st.currentQ, before.questions[1].q, "the NEXT question is the pending one");
  assert.ok(String(r.out.reply).includes(before.questions[1].q), "the reply poses the next question");
  assert.equal(mockRecord(r.snap).answers.length, 1, "no answer was recorded for the skipped probe");
});

test("F1-2 'pass' at the first question advances — the product's own skip word", () => {
  const w = makeWorld();
  const s = w.say("u", "t", START);
  const rec = mockRecord(s.snap);
  const r = w.say("u", "t", "pass");
  assert.equal(r.out.intent, "prep_mock_next", `pass advances (intent: ${r.out.intent}; reply: ${String(r.out.reply).slice(0, 160)})`);
  const st = mockOf(r.snap);
  assert.ok(st, "the session is still open");
  assert.equal(st.currentQ, rec.questions[1].q, "the next question is posed");
  assert.equal(mockRecord(r.snap).answers.length, 0, "the passed question stays unanswered");
});

test("F1-3 'can we skip this one?' mid-mock (question pending) advances and keeps the session open", () => {
  const w = makeWorld();
  w.say("u", "t", START);
  w.say("u", "t", LONG);
  const p = w.say("u", "t", PROBE_ANSWER);
  const recBefore = mockRecord(p.snap);
  const pendingBefore = mockOf(p.snap).currentQ;
  const r = w.say("u", "t", "can we skip this one?");
  assert.equal(r.out.intent, "prep_mock_next", `the framed skip advances (intent: ${r.out.intent}; reply: ${String(r.out.reply).slice(0, 160)})`);
  const st = mockOf(r.snap);
  assert.ok(st, "the session is still open");
  assert.notEqual(st.currentQ, pendingBefore, "the pending question moved on");
  assert.equal(st.currentQ, recBefore.questions[3].q, "exactly one question was skipped");
});

test("F1-4 a run of skips in mixed forms closes gracefully on the last question", () => {
  const w = makeWorld();
  w.say("u", "t", START);
  assert.equal(w.say("u", "t", "skip").out.intent, "prep_mock_next");
  assert.equal(w.say("u", "t", "please skip").out.intent, "prep_mock_next");
  assert.equal(w.say("u", "t", "pass").out.intent, "prep_mock_next");
  assert.equal(w.say("u", "t", "skip this question").out.intent, "prep_mock_next");
  const last = w.say("u", "t", "please skip");
  assert.equal(last.out.intent, "prep_mock_complete", `the last skip closes the mock (intent: ${last.out.intent}; reply: ${String(last.out.reply).slice(0, 160)})`);
  assert.match(String(last.out.reply), /That is the set for now\./, "the close is the session's own summary, not a fallback");
  assert.equal(mockOf(last.snap), null, "a completed mock leaves no pending session");
});

test("F1-5 the mid-mock debrief names one concrete improvement on the answer actually given", () => {
  const w = makeWorld();
  const s = w.say("u", "t", START);
  const q1 = mockRecord(s.snap).questions[0].q;
  w.say("u", "t", WEAK);
  const r = w.say("u", "t", "how did I do?");
  assert.equal(r.out.intent, "prep_mock_debrief", `the debrief is served from the session (intent: ${r.out.intent})`);
  const reply = String(r.out.reply);
  assert.ok(reply.includes("result metric"), `the debrief names the concrete improvement 127 recorded for that answer — naming the result metric it lacked (reply: ${reply.slice(0, 400)})`);
  assert.ok(reply.includes(q1.slice(0, 40)), "the improvement is attached to the answer it belongs to (its question is named)");
  assert.ok(reply.indexOf("result metric") > reply.indexOf(q1.slice(0, 40)), "the improvement is stated for that answer, after naming it");
});

test("F1-6 the completion close names the same concrete improvement", () => {
  const w = makeWorld();
  w.say("u", "t", START);
  w.say("u", "t", WEAK);          // Q1 recorded (the weak answer), probe pending
  w.say("u", "t", PROBE_ANSWER);  // probe answer recorded, next question posed
  w.say("u", "t", "skip");
  w.say("u", "t", "skip");
  const last = w.say("u", "t", "skip"); // last question skipped: the mock closes
  assert.equal(last.out.intent, "prep_mock_complete", `the mock completes (intent: ${last.out.intent}; reply: ${String(last.out.reply).slice(0, 160)})`);
  assert.ok(String(last.out.reply).includes("result metric"), `the close names the concrete improvement recorded for the weakest answer (reply: ${String(last.out.reply).slice(0, 400)})`);
});

test("F1-7 the answer-path completion close names the concrete improvement too", () => {
  const w = makeWorld();
  w.say("u", "t", START);
  assert.equal(w.say("u", "t", "skip").out.intent, "prep_mock_next"); // Q1 skipped
  w.say("u", "t", WEAK);          // answer recorded, probe pending
  w.say("u", "t", PROBE_ANSWER);  // probe answer recorded, next question posed
  w.say("u", "t", LONG);          // answer recorded, probe pending
  const last = w.say("u", "t", PROBE_ANSWER); // final probe answer completes the set
  assert.equal(last.out.intent, "prep_mock_complete", `the mock completes on the answer path (intent: ${last.out.intent}; reply: ${String(last.out.reply).slice(0, 160)})`);
  assert.ok(String(last.out.reply).includes("result metric"), `the close names the concrete improvement recorded for the weakest answer (reply: ${String(last.out.reply).slice(0, 400)})`);
});

test("F1-8 control: a narrative answer containing 'skip' mid-sentence is still scored as an answer", () => {
  const w = makeWorld();
  w.say("u", "t", START);
  const r = w.say("u", "t", SKIP_IN_SENTENCE);
  assert.equal(r.out.intent, "prep_mock_followup", `the answer is captured, not advanced past (intent: ${r.out.intent})`);
  assert.equal(mockRecord(r.snap).answers.length, 1, "the answer was recorded");
});

test("F1-9 control: a skip form with no live mock is not claimed by the mock", () => {
  const w = makeWorld();
  const r = w.say("u", "t", "please skip");
  assert.notEqual(r.out.intent, "prep_mock_next");
  assert.notEqual(r.out.intent, "prep_mock_complete");
  assert.equal(mockOf(r.snap), null, "no session was created");
});
