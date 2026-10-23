'use strict';
// =====================================================================
// Router fixes integration (2026-10-23, architect review of Muse's fix1/fix2).
// Synthetic cases only, written for this file; no eval or held-out case is used.
//
// MOCK (the 4th bug, found by Muse): the probe answer went through
// 127's answerMock, which records an answer AND advances the question
// index. So every probe answer was graded as the answer to the NEXT
// question (which was then never asked), and after the last question
// the probe answer threw "mock already complete": the dispatch catch
// cleared the session silently and the candidate got no debrief.
// The probe answer now attaches to the question it followed, the index
// moves only on a main answer, and the probe after the last question
// closes with the debrief.
//
// RECORD (fix2 review): present-tense work ("I work at X", "my employer
// is X") was recorded as experience and read back as "you interned at
// X", a fact the user never stated. And the inverted target frames took
// a clause-initial pronoun ("That is my dream company") as the company.
// =====================================================================
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const NOW = Date.parse("2026-10-23T15:00:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));

function makeWorld() {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const store = { accounts: new Map(), threads: new Map(), watches: new Map() };
  let n = 0;
  const say = (userId, threadId, text) => {
    n += 1;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: [] });
    const out = host.runTurn(text, ctx);
    const snap = host.extractSnapshot(ctx);
    store.threads.set(threadId, snap);
    if (ctx._hostPatch && ctx._hostPatch.erase !== true) { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    return { out, ctx, snap };
  };
  return { say };
}
const mockOf = (snap) => ((((((snap || {}).stores || {}).trackStore || {})._careerThread || {}).prep) || {}).prepMock || null;
const mockRecord = (snap) => { const st = mockOf(snap); const ms = st && st.store && Array.isArray(st.store.mocks) ? st.store.mocks : []; return ms.find((x) => x.mock_id === st.mockId) || null; };

const START = "Start a mock interview for a marketing coordinator role";
const ANSWERS = [
  "In my campus job I ran the library's newsletter for 1,200 students. I rebuilt the signup form, moved sends to Tuesday mornings, and the open rate went from 18% to 31% over one semester.",
  "At my retail job I trained four new hires on the register and returns desk. I wrote a one-page checklist, shadowed each of them for two shifts, and our returns errors dropped by half that quarter.",
  "In a class project my team of five built a launch plan for a local bakery. I owned the social posts, scheduled 20 of them across three weeks, and the bakery counted 60 new customers who mentioned the posts.",
  "When our club's event budget was cut, I compared three venues, negotiated a student rate, and kept the event for 150 people while spending 30% less than the year before.",
  "For my internship I cleaned a contact list of 4,000 rows. I removed duplicates, fixed 600 broken emails, and the next campaign's bounce rate fell from 9% to 2%.",
];
const PROBES = [
  "The hardest part was the signup form, because the old one lost 1 in 5 entries. I tested it with 30 friends first and would test it sooner next time.",
  "The hardest part was the evening shift, since I trained them while the line was long. Next time I would schedule training before opening, which saves about an hour.",
  "The hardest part was keeping five people on one calendar. I set one shared sheet and a 10-minute check-in, and next time I would start that in week one.",
  "The hardest part was the venue contract, because it had a 20% deposit. I asked for a payment plan and next time I would ask for it on the first call.",
  "The hardest part was the broken emails, because 600 of them looked valid. I wrote a simple check and next time I would run it before any send.",
];

test("M-1 every question of the mock is asked, in order: a probe answer never consumes the next question", () => {
  const w = makeWorld();
  let r = w.say("u-m1", "t", START);
  assert.equal(r.out.intent, "prep_mock_start");
  const qs = mockRecord(r.snap).questions.map((q) => q.q);
  assert.ok(qs.length >= 3, "the mock has questions");
  const asked = [mockOf(r.snap).currentQ];
  for (let i = 0; i < qs.length; i++) {
    r = w.say("u-m1", "t", ANSWERS[i % ANSWERS.length]);
    assert.equal(r.out.intent, "prep_mock_followup", `answer ${i + 1}: a probe follows (got ${r.out.intent})`);
    r = w.say("u-m1", "t", PROBES[i % PROBES.length]);
    if (i < qs.length - 1) { assert.equal(r.out.intent, "prep_mock_next", `probe ${i + 1}: the next question follows (got ${r.out.intent})`); asked.push(mockOf(r.snap).currentQ); }
  }
  assert.deepEqual(asked, qs, "the questions asked are exactly the mock's questions, none skipped");
});

test("M-2 a probe answer is kept with the question it followed; the record holds one answer per question asked", () => {
  const w = makeWorld();
  let r = w.say("u-m2", "t", START);
  r = w.say("u-m2", "t", ANSWERS[0]);
  r = w.say("u-m2", "t", PROBES[0]);
  const m = mockRecord(r.snap);
  assert.equal(m.answers.length, 1, "one question asked, one answer recorded");
  assert.equal(m.answers[0].q, m.questions[0].q);
  assert.equal(m.answers[0].answer, ANSWERS[0]);
  assert.ok(m.answers[0].probe && m.answers[0].probe.answer === PROBES[0], "the probe answer rides the question it followed");
  assert.equal(m.idx, 1, "the index moved once");
});

test("M-3 the probe answer after the LAST question closes the mock with the debrief, never a thrown error or a silent clear", () => {
  const w = makeWorld();
  let r = w.say("u-m3", "t", START);
  const n = mockRecord(r.snap).questions.length;
  for (let i = 0; i < n; i++) { w.say("u-m3", "t", ANSWERS[i % ANSWERS.length]); r = w.say("u-m3", "t", PROBES[i % PROBES.length]); }
  assert.equal(r.out.intent, "prep_mock_complete", `the last probe answer closes the mock (got ${r.out.intent}: ${String(r.out.reply).slice(0, 160)})`);
  assert.match(String(r.out.reply), /weakest rubric area/);
  assert.ok(!/didn'?t catch that|I'm Trainee, a career agent: I find roles/.test(String(r.out.reply)), "not the fallback");
  assert.equal(mockOf(r.snap), null, "the session is closed after the debrief");
});

test("M-4 the summary scores only the main answers (one per question), so the count matches the questions answered", () => {
  const w = makeWorld();
  let r = w.say("u-m4", "t", START);
  const n = mockRecord(r.snap).questions.length;
  for (let i = 0; i < n; i++) { w.say("u-m4", "t", ANSWERS[i % ANSWERS.length]); r = w.say("u-m4", "t", PROBES[i % PROBES.length]); }
  assert.equal(r.out.result.summary.answered, n);
});

test("R-1 'I work at X' reads back as 'you work at X', never as an internship the user did not state", () => {
  const w = makeWorld();
  for (const [said, co] of [["I work at Brindle Analytics.", "Brindle Analytics"], ["I work for Saltmarsh Media.", "Saltmarsh Media"], ["My current employer is Ferrow Labs.", "Ferrow Labs"]]) {
    const r = w.say(`u-r1-${co}`, `t-${co}`, said);
    const text = String(r.out.reply);
    assert.ok(text.includes(`you work at ${co}`), `${said} -> ${text.slice(0, 200)}`);
    assert.ok(!text.includes(`you interned at ${co}`), `${said} is not an internship`);
  }
});

test("R-2 control: past internships and past jobs keep their own tense", () => {
  const w = makeWorld();
  const a = w.say("u-r2a", "t-a", "I interned at Quillon Bank.");
  assert.ok(String(a.out.reply).includes("you interned at Quillon Bank"), String(a.out.reply).slice(0, 200));
  const b = w.say("u-r2b", "t-b", "I worked at Tarrow Freight.");
  assert.ok(String(b.out.reply).includes("you worked at Tarrow Freight"), String(b.out.reply).slice(0, 200));
});

test("R-3 a pronoun or a possessive phrase is never recorded as the target company", () => {
  for (const said of ["That is my dream company.", "This is the company I most want to work for.", "It is the company I want to work for.", "My current employer is the company I want to work for."]) {
    const w = makeWorld();
    const r = w.say("u-r3", "t", said);
    const targets = (((r.ctx.statedFacts || {}).facts) || []).filter((f) => f.kind === "target_firm").map((f) => f.value);
    assert.deepEqual(targets, [], `${said} -> ${JSON.stringify(targets)}`);
  }
});

test("R-4 control: a named company in the same frames is still recorded", () => {
  const w = makeWorld();
  const r = w.say("u-r4", "t", "Halvorsen Group is my dream company.");
  const targets = (((r.ctx.statedFacts || {}).facts) || []).filter((f) => f.kind === "target_firm").map((f) => f.value);
  assert.deepEqual(targets, ["Halvorsen Group"]);
});
