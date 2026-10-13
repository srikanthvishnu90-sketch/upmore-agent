"use strict";
const test = require("node:test"); const assert = require("node:assert"); const fs = require("fs"); const path = require("path");
const P = require("../packages/domain/127-career-prep.js");
const cir = (id) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "packages/career-data/cirs", id + ".json"), "utf8"));
const persona = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "packages/career-data/fixtures/test-persona.json"), "utf8"));
const goldman = cir("goldman-sachs-ibd"), stripe = cir("stripe");

test("BUG-A2-01 videoInterviewPractice scores content and never submits", () => {
  assert.equal(typeof P.videoInterviewPractice, "function");
  const store = P.makePrepStore();
  const r = P.videoInterviewPractice(store, { company: "Goldman Sachs", questions: ["Why banking?"], answers: ["First, the situation: I built models in Excel for 8 fictional companies. Then I presented to 45 members. In the end the result was materials used by the club, measured over a semester."] });
  assert.equal(r.submitted, false); assert.equal(r.submission_attempted, false); assert.ok(r.feedback[0].scores.total > 5); assert.ok(store.drills.some((d) => d.kind === "video_practice"));
});
test("BUG-A2-02 takeHomePlan is plan-only, fits schedule, work stays mine", () => {
  assert.equal(typeof P.takeHomePlan, "function");
  const p = P.takeHomePlan({ title: "TEST take-home", deliverables: [{ name: "Model", est_min: 60 }, { name: "Write-up", est_min: 30 }], available: [{ label: "Tue 18:00", minutes: 90 }] });
  assert.equal(p.agent_does_work, false); assert.equal(p.work_stays_mine, true); assert.equal(p.total_est_min, 90); assert.equal(p.fits, true); assert.equal(p.schedule.length, 2);
  const over = P.takeHomePlan({ title: "X", deliverables: [{ name: "Big", est_min: 300 }], available: [{ label: "Tue", minutes: 60 }] });
  assert.equal(over.fits, false); assert.ok(over.warning);
});
test("BUG-A2-03 finalRoundDelta grounds delta in CIR stages; NO_CIR honest", () => {
  assert.equal(typeof P.finalRoundDelta, "function");
  const d = P.finalRoundDelta({ cir: goldman }); assert.equal(d.status, "OK"); assert.ok(d.final_stage.name.match(/Superday/i)); assert.ok(d.earlier_stages.length >= 2); assert.ok(d.changes.length >= 2);
  assert.equal(P.finalRoundDelta({ company: "Nope" }).status, "NO_CIR");
});
test("BUG-A2-04 salaryDeflectionScripts never invents a figure for Goldman", () => {
  assert.equal(typeof P.salaryDeflectionScripts, "function");
  const r = P.salaryDeflectionScripts({ cir: goldman }); assert.ok(r.scripts.length >= 3); assert.equal(r.ranges.length, 0); assert.ok(r.scripts.every((x) => !/\$\s?\d/.test(x.text))); assert.match(r.anchor_rule, /anchor/i);
});
test("BUG-A2-05 questionsToAsk tailored to interviewer team, flags unknown team", () => {
  assert.equal(typeof P.questionsToAsk, "function");
  const r = P.questionsToAsk({ cir: goldman, interviewer: { name: "Pat Analyst (TEST)", role: "Analyst", team: "Healthcare M&A (TEST)", publicFacts: [{ text: "Works on Healthcare M&A team (TEST fixture).", source: "TEST fixture" }] } });
  assert.ok(r.questions.some((q) => /Healthcare M&A/.test(q.text))); assert.ok(r.questions.every((q) => q.source));
  const u = P.questionsToAsk({ cir: goldman, interviewer: { name: "Unknown (TEST)" } }); assert.equal(u.team_unknown, true);
});
test("BUG-A2-06 failureStoryFromFacts: persona has no setback -> asks, invents nothing", () => {
  assert.equal(typeof P.failureStoryFromFacts, "function");
  const r = P.failureStoryFromFacts({ facts: persona.facts }); assert.equal(r.status, "NO_SETBACK_FACT"); assert.equal(r.story, null); assert.ok(r.ask.length >= 2);
  const ok = P.failureStoryFromFacts({ facts: [{ id: "F-X", kind: "experience", title: "Launch that failed", text: "Our launch failed and missed the deadline", action: "I rebuilt the rollout after the failure", result: "shipped two weeks later" }] });
  assert.equal(ok.status, "OK"); assert.equal(ok.story.fact_id, "F-X");
});
test("BUG-A2-07 structureDrill gives exact scaffold for a low-structure answer", () => {
  assert.equal(typeof P.structureDrill, "function");
  const d = P.structureDrill({ answer: "I did various things and stuff and it was fine." }); assert.equal(d.fix_first, "structure"); assert.ok(d.scaffold.length >= 4); assert.ok(d.before_scores.structure < 4);
});
test("BUG-A2-08 dayOfChecklist covers logistics/links/tech/materials and flags missing link", () => {
  assert.equal(typeof P.dayOfChecklist, "function");
  const c = P.dayOfChecklist({ company: "Goldman Sachs", cir: goldman, when: "Fri 09:00 (TEST)", link: "https://example.test/superday (TEST)", materials: ["resume (TEST)"] });
  assert.ok(c.groups.logistics.length); assert.ok(c.groups.tech_check.length); assert.ok(c.groups.materials.length); assert.deepEqual(c.missing, []);
  assert.ok(P.dayOfChecklist({ company: "Goldman Sachs", cir: goldman }).missing.includes("link"));
});
test("BUG-A2-09 debriefRetro mines recurring misses across debriefs", () => {
  assert.equal(typeof P.debriefRetro, "function");
  const store = P.makePrepStore();
  P.captureDebrief(store, { company: "Goldman Sachs", stumbled: ["technical valuation depth on DCF follow-ups"], questionsAsked: [] });
  P.captureDebrief(store, { company: "Evercore", stumbled: ["valuation technicals — froze on accretion math"], questionsAsked: [] });
  P.captureDebrief(store, { company: "Stripe", stumbled: ["answer structure rambled"], questionsAsked: [] });
  const r = P.debriefRetro(store); assert.equal(r.total_debriefs, 3); assert.ok(r.patterns[0].count >= 2); assert.match(r.top_miss, /technical|valuation/i);
});
test("BUG-A2-10 superdayPlan grounded in Goldman CIR final stage + finance drills", () => {
  assert.equal(typeof P.superdayPlan, "function");
  const p = P.superdayPlan({ cir: goldman, when: "Fri 09:00 (TEST)" }); assert.equal(p.status, "OK"); assert.match(p.final_stage.name, /Superday/i); assert.ok(p.schedule.length >= 4); assert.ok(p.drill_topics.length >= 3);
  assert.equal(P.superdayPlan({ company: "Nope" }).status, "NO_CIR");
});
