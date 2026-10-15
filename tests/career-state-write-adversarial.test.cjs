/* COMPLEXITY WAVE permanent guard (BUG-169 / FR-318, extended by the
   root-cause analysis to ALL TEN state writers W1–W10): the invariant
   — a state write requires evidence: (a) the user's own assertion
   (first-person, present- or past-tense, non-negated, non-conditional,
   non-interrogative, not quoted, not attributed to someone else),
   stored verbatim; or (b) a system/employer record. A regex token
   match is a hypothesis; a hypothesis may ask one confirming
   question; it may never write.
   Every case here was probed against the pre-fix build: the question,
   conditional, and quoted forms of W1/W2/W3/W5/W9 all WROTE.
   Check: node --test tests/career-state-write-adversarial.test.cjs */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const NOW = Date.parse("2026-10-14T23:00:00.000Z");

function makeHost() {
  return CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
}
const host = makeHost();
function run(text, snapshot) {
  const ctx = host.createTurnCtx({ userId: "adv-user", threadId: "adv", now: NOW, snapshot: snapshot || null });
  const res = host.runTurn(text, ctx);
  const stores = (host.extractSnapshot(ctx).stores) || {};
  return { res, stores };
}
// Semantic write extractors — the state each writer may touch.
const invalidation = (st) => !!(st.doorstepState && st.doorstepState.invalidation && st.doorstepState.invalidation.active);
const priorApp = (st) => !!(st.doorstepState && st.doorstepState.prior_application);
const trackerRows = (st) => ((st.trackStore && st.trackStore.rows) || []).length;
const suppressionWrites = (st) => {
  let n = 0;
  if (st._relayedSuppressions) n += st._relayedSuppressions.length;
  if (st.suppression) n += JSON.stringify(st.suppression).includes("name:") || JSON.stringify(st.suppression).includes("@") ? 1 : 0;
  return n;
};
const paused = (st) => !!((st.globalPause || {}).set === true);
const corrections = (st) => ((st.profile && st.profile.profile_corrections) || []).length;

test("W1 role closure: only the user's own closure report writes an invalidation", () => {
  const assertion = run("the Goldman Sachs role I was preparing for has been closed — the posting was taken down yesterday");
  assert.ok(invalidation(assertion.stores) || (assertion.stores.doorstepState && assertion.stores.doorstepState.role_closed), "assertion form must write");
  if (assertion.stores.doorstepState && assertion.stores.doorstepState.invalidation) {
    assert.match(assertion.stores.doorstepState.invalidation.detail || assertion.stores.doorstepState.invalidation.reason || "", /user/i, "the stored evidence names the user's own report");
  }
  const question = run("is the Goldman Sachs role closed?");
  assert.ok(!invalidation(question.stores) && !priorApp(question.stores), "question form must not write");
  const future = run("I am torn: this posting closes in 3 days, and someone at the firm said they might refer me but that could take 2 days. Do I hold the application for the referral or apply now?");
  assert.ok(!invalidation(future.stores), "future-tense deadline talk must not write");
  const quoted = run('my friend said "the Goldman role is closed" yesterday');
  assert.ok(!invalidation(quoted.stores), "a quoted closure report is not the user's assertion");
  const conditional = run("if the Goldman role closes, I will be gutted");
  assert.ok(!invalidation(conditional.stores), "conditional form must not write");
});

test("W2 prior application: a disclosure writes; questions, conditionals, and quotes do not", () => {
  const assertion = run("I already applied to Stripe manually last week");
  assert.ok(priorApp(assertion.stores), "assertion form must write the disclosure");
  assert.ok(trackerRows(assertion.stores) >= 1, "the disclosed application is logged to the tracker");
  for (const [form, text] of [
    ["question", "did I already apply to Stripe?"],
    ["conditional", "if I already applied to Stripe, what happens?"],
    ["quoted", 'my friend said "I applied to Stripe last week" — good for him'],
  ]) {
    const r = run(text);
    assert.ok(!priorApp(r.stores), `${form} form must not write a disclosure`);
    assert.equal(trackerRows(r.stores), 0, `${form} form must not log a tracker row`);
  }
});

test("W3 sensitive correction: only a statement-sentence direction writes to the profile", () => {
  const seed = () => ({ stores: { profile: { user_id: "adv-user", profile_corrections: [], dependent_state: {}, _onboarding: { answers: { work_authorization: { needs_sponsorship: true } } } } } });
  const assertion = run("I no longer need sponsorship — update my profile", seed());
  assert.equal(corrections(assertion.stores), 1, "assertion form must write the correction");
  const question = run("will I need sponsorship in the future?", seed());
  assert.equal(corrections(question.stores), 0, "a question about the fact must not write");
  assert.ok(!invalidation(question.stores), "a question about the fact must not invalidate packets either");
  const conditional = run("if I needed sponsorship, would that change anything?", seed());
  assert.equal(corrections(conditional.stores), 0, "conditional form must not write");
});

test("W5 opt-out: a relayed report writes; a question about a relay asks, and writes nothing", () => {
  const assertion = run('He replied to my last email: "Please stop emailing me and never contact me again"');
  assert.ok(suppressionWrites(assertion.stores) >= 1, "a relayed opt-out report must write the record");
  const question = run("did he reply saying stop emailing me?");
  assert.equal(suppressionWrites(question.stores), 0, "a question about a possible opt-out must not write");
  assert.equal(question.res.intent, "intent_opt_out");
  assert.equal(question.res.resultStatus, "awaiting_user");
});

test("W5b user suppression (BUG-172): an instruction writes; a question about it does not", () => {
  const assertion = run("take Maya off my outreach list completely");
  const supp = JSON.stringify(assertion.stores.suppression || {});
  assert.match(supp, /name:maya/);
  const question = run("should I take Maya off my outreach list?");
  assert.ok(!question.stores.suppression || !JSON.stringify(question.stores.suppression).includes("name:maya"), "question form must not suppress");
});

test("W6/W7 cancels: question forms write nothing anywhere", () => {
  for (const text of ["should I cancel the queue?", "should I cancel the application I was preparing?", "do I want to cancel everything?"]) {
    const r = run(text);
    assert.ok(!paused(r.stores), `question form must not halt: ${text}`);
    assert.ok(!invalidation(r.stores), `question form must not invalidate: ${text}`);
  }
  const emptyCancel = run("cancel the queue please");
  assert.equal(emptyCancel.res.intent, "queue_halt");
  assert.match(emptyCancel.res.reply, /no queue standing/i);
});

test("W8 halt (141): the assertion halts — spelled correctly or with typos — and a question never does", () => {
  const plain = run("Stop everything. Pause all my outreach right now.");
  assert.ok(paused(plain.stores), "plain assertion must halt");
  const typo = run("stop evrything pls, pause all teh outreach rite now");
  assert.ok(paused(typo.stores), "the typo'd kill switch must halt (BUG-170)");
  const question = run("should I stop everything?");
  assert.ok(!paused(question.stores), "a question about stopping must not halt");
  const quoted = run('my cofounder said "stop everything" in the meeting');
  assert.ok(!paused(quoted.stores), "a quoted stop is not the user's order");
});

test("W9 tracker (BUG-175): assertion logs; hypothetical and quoted forms get a question, never a row", () => {
  const assertion = run("add my Goldman application to the tracker, I applied yesterday");
  assert.equal(trackerRows(assertion.stores), 1);
  for (const [form, text] of [
    ["question", "did I apply to Goldman yesterday?"],
    ["conditional", "if I applied to Goldman yesterday, log it for me"],
    ["hypothetical", "what if I applied to Goldman yesterday — would it be on my tracker?"],
    ["quoted", 'my friend said "I applied to Goldman yesterday" — lucky him'],
    ["attributed", "my friend said I applied to Goldman yesterday"],
  ]) {
    const r = run(text);
    assert.equal(trackerRows(r.stores), 0, `${form} form must not log a row`);
  }
});

test("W4 recipient change / W10 onboarding: question forms write nothing", () => {
  const q = run("should I send it to Maria instead of John?");
  assert.ok(!paused(q.stores) && !invalidation(q.stores) && trackerRows(q.stores) === 0);
  // W10 (130) is safe by design — no conversational write happens
  // without the onboarding interview's own answer path; a bare
  // question in chat changes no onboarding state.
  const bare = run("what is my work authorization status?");
  assert.ok(!invalidation(bare.stores));
});
