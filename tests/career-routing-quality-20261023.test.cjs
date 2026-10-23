'use strict';
// Routing quality (2026-10-23, coordinator's remaining block). Synthetic cases only; no eval or held-out text.
// (a) "I want to be a <role>" reaches the role library like "become"; the generic ladder never routes a field switch
//     through promotions in the old field ("teacher -> senior teacher -> ... -> director-level seat -> tech").
// (b) a non-company interview-prep ask gets a brief for its role family, not one generic brief for every role.
// (c) "becme" reads as "become".
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const Reply = D("140-career-reply.js");
const host = CareerHost.createCareerHost({ CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"), CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"), CareerReply: Reply, CareerContainment: D("143-career-containment.js") });
let n = 0;
const ask = (text) => { n += 1; const ctx = host.createTurnCtx({ userId: `q-${n}`, threadId: `q-${n}`, now: Date.parse("2026-10-23T15:00:00Z"), snapshot: null, postings: [] }); return host.runTurn(text, ctx); };
const isFallback = (o) => !String(o.reply || "").trim() || Reply.isFallbackText(String(o.reply)) || o.contained || o.intent === "career_fallback";

test("(a) 'I want to be a data analyst' gets the same owner and answer shape as 'I want to become a data analyst'", () => {
  const be = ask("I want to be a data analyst"), become = ask("I want to become a data analyst");
  assert.equal(be.intent, become.intent);
  assert.match(String(be.reply), /Data Analyst — what its postings actually ask for/);
});
for (const q of ["I want to be a teacher", "I want to be a pharmacist one day"]) {
  test(`(a) "${q}" never gets a ladder built from 'your current role'`, () => {
    const r = String(ask(q).reply);
    assert.ok(!/senior your current role|your current role manager/.test(r), r.slice(0, 200));
    assert.ok(!isFallback(ask(q)));
  });
}
test("(a) a field switch is never routed through promotions in the old field", () => {
  const r = String(ask("I'm a teacher and want to move into tech, what are my options?").reply);
  assert.ok(!/senior teacher|teacher manager|director-level seat/.test(r), r.slice(0, 300));
  assert.match(r, /tech/);
});
test("(a) control: a climb inside one field keeps its ladder", () => {
  const r = String(ask("I'm an analyst and I want to be a director one day").reply);
  assert.match(r, /senior analyst/);
});
test("(a) control: an authored switch ladder (retail -> HR) is unchanged", () => {
  assert.match(String(ask("I'm a retail manager and want to move into HR eventually").reply), /HR coordinator/);
});

const PREP = [
  ["How do I prepare for a software engineering interview?", /coding|data structures/i, /linked list|time and space|system design/i],
  ["what should I do to get ready for a finance interview", /three statements|valuation|DCF/i, /three financial statements|depreciation|DCF/i],
  ["how should I prepare for a nursing interview", /patient/i, /patient/i],
  ["help me prepare for a consulting interview", /case/i, /market size|profits fell/i],
];
for (const [q, tests, qs] of PREP) {
  test(`(b) "${q}" gets a brief for its role family`, () => {
    const o = ask(q), r = String(o.reply);
    assert.equal(o.intent, "prep_brief");
    assert.ok(!/for this company/i.test(r), "no company named, so no 'this company'");
    assert.match(r, tests); assert.match(r, qs);
    for (const b of Reply.splitBubbles(r)) assert.ok(Reply.lint(b).ok, `${b} -> ${Reply.lint(b).violations}`);
  });
}
test("(b) two role families get two different briefs", () => {
  assert.notEqual(String(ask("How do I prepare for a software engineering interview?").reply), String(ask("what should I do to get ready for a finance interview").reply));
});

test("(c) 'I want to becme a data analyst' reads as become", () => {
  const o = ask("I want to becme a data analyst");
  assert.ok(!isFallback(o));
  assert.match(String(o.reply), /Data Analyst/);
});
test("(c) control: 'became' is a real word and is never rewritten", () => {
  assert.equal(D("142-career-router.js").detypo("I became a nurse last year"), "I became a nurse last year");
});

// (d) Coordinator probe on a48b1a9d: a practice request asked politely or as a question fell back after a prep brief,
//     while the imperative "give me a practice question" reached the practice owner.
function afterBrief(q) {
  n += 1; const th = `prac-${n}`; let snap = null, out = null;
  for (const text of ["help me prepare for my interview with a hospital", q]) {
    const ctx = host.createTurnCtx({ userId: th, threadId: th, now: Date.parse("2026-10-23T15:00:00Z") + n * 1000, snapshot: snap, postings: [] });
    out = host.runTurn(text, ctx); snap = host.extractSnapshot(ctx);
  }
  return out;
}
for (const q of ["can we do a practice question?", "can we practice?", "what else should I practice?", "could you ask me another practice question?", "let's practice", "can I practice an answer with you?"]) {
  test(`(d) "${q}" after a prep brief reaches the practice owner`, () => {
    const o = afterBrief(q);
    assert.ok(!isFallback(o), `${o.handler || "-"}/${o.intent || "-"}${o.contained ? " contained" : ""}`);
    assert.match(String(o.reply), /question/i);
  });
}
test("(d) control: 'practice' as a noun is not a practice request", () => {
  for (const q of ["what are the best practices for a resume?", "I work at a small law practice"]) {
    const r = String(ask(q).reply);
    assert.ok(!/^Here is your question/.test(r), `${q} -> ${r.slice(0, 120)}`);
  }
});
