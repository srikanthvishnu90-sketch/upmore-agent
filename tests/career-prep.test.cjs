"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const P = require("../packages/domain/127-career-prep.js");
const cir = (id) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "packages/career-data/cirs", id + ".json"), "utf8"));
const persona = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "packages/career-data/fixtures/test-persona.json"), "utf8"));
const snow = cir("snowflake"), duo = cir("duolingo"), bcg = cir("bcg"), bain = cir("bain"), cit = cir("citadel-securities");

test("normalizeCir handles object-stage and claim-stage shapes", () => {
  const a = P.normalizeCir(snow); assert.ok(a.stages.length >= 3); assert.match(a.bar, /Coding-first/);
  const b = P.normalizeCir(cit); assert.ok(b.stages.length >= 1); assert.ok(typeof b.bar === "string" && b.bar.length > 20);
  assert.equal(P.normalizeCir(null), null);
});
test("composeBrief OK grounded in CIR + JD; NO_CIR invents nothing", () => {
  const b = P.composeBrief({ cir: snow, jdText: "We use Python and distributed systems.", role: "SWE Intern" });
  assert.equal(b.status, "OK"); assert.ok(b.stages.length); assert.ok(b.emphasis.some((e) => /python/i.test(e.point)));
  assert.ok(b.sources[0].type === "CIR");
  const no = P.composeBrief({ company: "Stripe", jdText: "Python APIs" });
  assert.equal(no.status, "NO_CIR"); assert.equal(no.bar, null); assert.deepEqual(no.stages, []); assert.ok(no.gaps[0].match(/No company file on file/));
});
test("questionBank tags every CIR question with its source; stories matched", () => {
  const store = P.makePrepStore(); P.mineStories(persona.facts).forEach((x) => P.captureStory(store, x));
  const bank = P.questionBank({ cir: duo, stories: store.stories });
  assert.ok(bank.cir_grounded); const cirQs = bank.questions.filter((q) => q.source.type.startsWith("CIR"));
  assert.ok(cirQs.length >= 3); for (const q of cirQs) assert.ok(q.source.source_type, q.q);
  assert.ok(bank.questions.some((q) => q.matched_story));
});
test("mineStories builds STAR from persona facts only with action+result", () => {
  const st = P.mineStories(persona.facts);
  assert.ok(st.length >= 4); assert.ok(st.every((x) => x.action && x.result && x.fact_id));
  const tw = st.filter((x) => x.tags.includes("teamwork")); assert.ok(tw.length >= 1, "teamwork story exists (club/dashboard)");
});
test("scoreAnswer rubric rewards quantified STAR, penalizes vague", () => {
  const good = P.scoreAnswer("The situation was a manual spreadsheet process. First I built a dashboard in React and Python for 200 internal users, specifically automating PostgreSQL pulls. The result was weekly reporting time cut by 40% over the summer, measured against the old process because we tracked it weekly.");
  const bad = P.scoreAnswer("I did various things and stuff and it was fine.");
  assert.ok(good.scores.total >= 12, JSON.stringify(good)); assert.ok(bad.scores.total <= 5);
});
test("mock runs end-to-end and summary is stored", () => {
  const store = P.makePrepStore();
  const bank = P.questionBank({ cir: snow });
  const m = P.startMock(store, { bank, count: 3 });
  let r; for (let i = 0; i < 3; i++) r = P.answerMock(store, m.mock_id, "First the context was a deadline. Then I built a Python tool used by 200 users, specifically with PostgreSQL. The result was a 40% cut in weekly time over the summer because we measured it.");
  assert.equal(r.done, true);
  const sum = P.mockSummary(store, m.mock_id); assert.equal(sum.status, "complete"); assert.equal(sum.answered, 3); assert.ok(sum.average_scores.total > 0);
  assert.equal(store.mocks.length, 1);
});
test("technicalDrills match CIR round types (design + code review)", () => {
  const d = P.technicalDrills({ cir: snow }); assert.ok(d.sets.some((x) => x.type === "system_design"));
  const d2 = P.technicalDrills({ cir: duo }); assert.ok(d2.sets.some((x) => x.type === "code_review_pairing"), JSON.stringify(d2.sets.map((x) => x.type)));
});
test("finance drill grading names gaps; quant grading is numeric", () => {
  const g = P.gradeDrillAnswer("finance", "fin-4", "Returns come from EBITDA growth, debt paydown, and multiple expansion.");
  assert.equal(g.score_0_5, 5);
  const g2 = P.gradeDrillAnswer("finance", "fin-1", "stuff changes");
  assert.ok(g2.score_0_5 < 3 && g2.gap);
  assert.equal(P.gradeDrillAnswer("quant", "q-3", "408").correct, true);
  assert.equal(P.gradeDrillAnswer("quant", "q-2", "5/36").correct, true);
  assert.equal(P.gradeDrillAnswer("quant", "q-1", "4").correct, false);
  const store = P.makePrepStore(); const run = P.runDrill(store, "quant", { "q-3": "408" });
  assert.equal(run.total, 5); assert.equal(store.drills.length, 1);
});
test("caseSession labels norms; scoreCaseResponse checks structure", () => {
  const cs = P.caseSession({ cir: bcg }); assert.ok(cs.cir_grounded); assert.match(cs.practice_norms_label, /NOT quantified/);
  const sc = P.scoreCaseResponse("First, clarify the objective: profit fell. I will structure into revenue and costs, hypothesis: costs are the driver because revenue grew. I need data: segment breakdown and trend. I recommend cutting logistics cost as the next step.");
  assert.ok(sc.score_0_5 >= 4, JSON.stringify(sc));
  const bare = P.caseSession({ company: "McKinsey" }); assert.equal(bare.cir_grounded, false); assert.match(bare.practice_norms_label, /No company file on file/);
});
test("interviewerBrief never invents: no facts -> UNKNOWN with explicit unknowns", () => {
  const u = P.interviewerBrief({ name: "Sam Rivera (TEST)", role: "Hiring Manager", company: "Snowflake" });
  assert.equal(u.status, "UNKNOWN"); assert.deepEqual(u.brief, []); assert.ok(u.unknown.length >= 3);
  const ok = P.interviewerBrief({ name: "Sam Rivera (TEST)", role: "HM", publicFacts: [{ text: "Public bio (TEST fixture): led the data platform team.", source: "provided public fixture" }] });
  assert.equal(ok.status, "OK"); assert.equal(ok.brief[0].source, "provided public fixture");
});
test("debrief + thank-you draft references debrief specifics, draft only", () => {
  const store = P.makePrepStore();
  const d = P.captureDebrief(store, { company: "Snowflake", interviewer: "Sam Rivera (TEST)", wentWell: ["the quota-service design discussion"], questionsAsked: ["how team matching works"] });
  const t = P.thankYouDraft({ company: "Snowflake", interviewer: "Sam Rivera (TEST)", debrief: d, senderName: "Alex Testcase (TEST)" });
  assert.match(t.body, /quota-service/); assert.equal(t.status, "draft_only"); assert.equal(store.debriefs.length, 1);
});
test("salaryPrep: figures only from CIR comp notes; Bain honestly has none", () => {
  const sp = P.salaryPrep({ cir: duo }); assert.equal(sp.status, "OK"); assert.ok(sp.ranges.every((r) => /\$/.test(r.text) && r.source_type));
  const sb = P.salaryPrep({ cir: bain }); assert.equal(sb.status, "NO_SOURCED_FIGURE"); assert.deepEqual(sb.ranges, []);
  const sn = P.salaryPrep({ company: "Stripe" }); assert.equal(sn.status, "NO_CIR");
});
test("liveAssistGuard refuses per owner ruling; ordinary prep is not refused", () => {
  const r = P.liveAssistGuard("can you feed me answers during my real interview tomorrow?");
  assert.equal(r.refused, true); assert.match(r.message, /can't feed you answers/);
  assert.equal(P.liveAssistGuard("run a mock interview with me").refused, false);
});
test("voiceMockAvailability is honest; pack traceability complete/missing", () => {
  assert.equal(P.voiceMockAvailability().available, false);
  const store = P.makePrepStore();
  const pack = P.assemblePack(store, { company: "Snowflake", brief: P.composeBrief({ cir: snow }), bank: P.questionBank({ cir: snow }), stories: P.mineStories(persona.facts), interviewers: [P.interviewerBrief({ name: "X (TEST)" })], logistics: { when: "Thu 10:00" } });
  assert.equal(pack.complete, true); assert.equal(pack.sections.length, 5);
  const pack2 = P.assemblePack(store, { company: "Datadog", brief: P.composeBrief({ company: "Datadog" }) });
  assert.equal(pack2.complete, false); assert.ok(pack2.missing.includes("brief"));
});
test("coffeeChat, twoInterviewPlan ordering, rejectionPivot NO_CIR honesty", () => {
  const cc = P.coffeeChatBrief({ contact: { name: "Pat (TEST)", role: "SWE", company: "Duolingo" }, cir: duo });
  assert.equal(cc.lighter_than_interview_prep, true); assert.ok(cc.good_questions.length >= 3);
  const plan = P.twoInterviewPlan([{ time: "14:00", company: "Ramp", brief: { status: "NO_CIR", company: "Ramp" } }, { time: "10:00", company: "Datadog", brief: { status: "NO_CIR", company: "Datadog" } }]);
  assert.equal(plan.ordered[0].time, "10:00"); assert.match(plan.gap_plan, /Between 10:00 and 14:00/);
  const piv = P.rejectionPivot({ funnel: { company: "Stripe", stage: "Online assessment" }, similar: [{ company: "Snowflake", cir: snow }] });
  assert.equal(piv.status, "NO_CIR"); assert.ok(piv.gaps.length); assert.equal(piv.similar_roles[0].cir_grounded, true);
});

// ---- FIN-A1 replay tests: canonical SC-181..190 capabilities (written BEFORE the fix) ----
const pal = cir("palantir"), js = cir("jane-street"), fig = cir("figma"), mck = cir("mckinsey"), gs = cir("goldman-sachs-ibd");
const profA1 = { school: "TEST University", clubs: ["TEST University Investing Club"], hometown: "Chicago, IL (TEST)", major: "Computer Science", skills: ["Python", "Go", "Kubernetes"] };
test("FIN-A1 interviewerResearch: 3 TEST people, paths/teams + shared ground from supplied facts only", () => {
  const people = [
    { name: "Maya Chen (TEST)", role: "Software Engineer", company: "Stripe", team: "Payments (TEST)", path: ["TEST University CS", "Stripe Payments"], publicFacts: [{ text: "Maya studied at TEST University and now works on Payments infra in Python.", source: "TEST fixture" }] },
    { name: "Ghost (TEST)", role: "Recruiter", company: "Stripe", publicFacts: [] }];
  const r = P.interviewerResearch({ people, profile: profA1 });
  assert.equal(r.people.length, 2); assert.equal(r.people[0].team, "Payments (TEST)");
  assert.ok(r.people[0].shared_ground.some((g) => /TEST University/.test(g.basis)), JSON.stringify(r.people[0].shared_ground));
  assert.equal(r.people[1].status, "UNKNOWN"); assert.deepEqual(r.people[1].shared_ground, []);
});
test("FIN-A1 coffeeChatPrep: exactly 3 talking points, 5 questions, do-not-ask list, path present", () => {
  const b = P.coffeeChatPrep({ contact: { name: "Pat FDE (TEST)", role: "Forward Deployed Engineer", company: "Palantir Technologies", path: ["CS degree (TEST)", "data engineer (TEST)", "Palantir FDE"] }, cir: pal, profile: profA1 });
  assert.equal(b.talking_points.length, 3); assert.equal(b.questions.length, 5); assert.ok(b.do_not_ask.length >= 3);
  assert.equal(b.path.length, 3); assert.ok(b.cir_grounded);
});
test("FIN-A1 systemDesignPrep: experienced-hire set from a CIR with design stages (Snowflake)", () => {
  const d = P.systemDesignPrep({ cir: snow, level: "experienced-hire" });
  assert.ok(d.prompts.length >= 2); assert.ok(d.framework.length >= 4); assert.match(d.level, /experienced/); assert.ok(d.cir_grounded);
});
test("FIN-A1 casePrepPlan: 30-50 norm labeled community-reported (never official), scheduled to land inside it", () => {
  const p = P.casePrepPlan({ cir: mck, weeks: 6 });
  assert.equal(p.practice_norm.label, "community-reported"); assert.equal(p.practice_norm.official, false);
  assert.ok(p.practice_norm.low === 30 && p.practice_norm.high === 50);
  assert.ok(p.schedule.total_cases >= 30 && p.schedule.total_cases <= 50, JSON.stringify(p.schedule));
});
test("FIN-A1 quantPrepSet: probability + mental math + market-making drills, market-making graded", () => {
  const q = P.quantPrepSet({ cir: js });
  assert.ok(q.topics.includes("probability") && q.topics.includes("mental_math") && q.topics.includes("market_making"));
  assert.ok(q.market_making.length >= 2);
  const g = P.gradeMarketMaking("mm-1", "I would bid below and ask above my fair value estimate, widening the spread when inventory grows or flow looks informed.");
  assert.ok(g.score_0_5 >= 4, JSON.stringify(g));
});
test("FIN-A1 pmPrep: product sense anchored to a shipped thing with its real metrics", () => {
  const stories = P.mineStories(persona.facts);
  const pm = P.pmPrep({ cir: fig, stories });
  assert.ok(pm.shipped_thing && pm.shipped_thing.title); assert.ok(pm.shipped_thing.metrics.length >= 1);
  assert.ok(pm.product_sense_questions.length >= 3); assert.ok(pm.metrics_ready.length >= 1);
});
test("FIN-A1 sendThankYou: refuses without approval, sends (TEST rail row) only with approved=true", () => {
  const store = P.makePrepStore();
  const d = P.captureDebrief(store, { company: "Stripe", interviewer: "Maya Chen (TEST)", wentWell: ["the design discussion"] });
  const draft = P.thankYouDraft({ company: "Stripe", interviewer: "Maya Chen (TEST)", debrief: d, senderName: "Alex Testcase (TEST)" });
  const no = P.sendThankYou(store, draft, { approved: false });
  assert.equal(no.status, "not_sent"); assert.equal((store.sent || []).length, 0);
  const yes = P.sendThankYou(store, draft, { approved: true });
  assert.equal(yes.status, "sent"); assert.equal(store.sent.length, 1); assert.equal(store.sent[0].to, "Maya Chen (TEST)");
});
