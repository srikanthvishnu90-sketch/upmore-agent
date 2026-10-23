'use strict';
// =====================================================================
// Routing families (2026-10-23): the DEV set. The router eval of 2026-10-23 found the generic fallback as the largest
// failure cause (9 of 14 failures on the candidate run). These families send each unowned ask to the owner that already
// serves it, or to an honest answer composed from the record; nothing is invented. Synthetic phrasings only (no eval or
// held-out text); the separate check set (career-routing-families-check.test.cjs) was written before this layer and is
// never used to build it.
// =====================================================================
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const Reply = D("140-career-reply.js");
const host = CareerHost.createCareerHost({ CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"), CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"), CareerReply: Reply, CareerContainment: D("143-career-containment.js") });
let n = 0;
const ask = (text, extra) => { n += 1; const ctx = host.createTurnCtx(Object.assign({ userId: `dev-${n}`, threadId: `dev-${n}`, now: Date.parse("2026-10-23T15:00:00Z"), snapshot: null, postings: [] }, extra || {})); return host.runTurn(text, ctx); };
const isFallback = (o) => !String(o.reply || "").trim() || Reply.isFallbackText(String(o.reply)) || o.contained || o.intent === "career_fallback";
const questions = (r) => (String(r).match(/\?/g) || []).length;

function family(name, asks, intents, more) {
  for (const a of asks) {
    test(`${name}: "${a}" -> ${intents.join("|")}`, () => {
      const o = ask(a);
      assert.ok(!isFallback(o), `fell back: ${o.handler || "-"}/${o.intent || "-"}${o.contained ? " contained" : ""}`);
      assert.ok(intents.includes(o.intent), `owner ${o.intent}: ${String(o.reply).slice(0, 200)}`);
      if (more) more(o, a);
    });
  }
}
// The composer's lint is per delivered bubble (a reply is split into bubbles of at most 3 sentences); one question in all.
const lintClean = (o) => { for (const b of Reply.splitBubbles(String(o.reply))) assert.ok(Reply.lint(b).ok, `${b} -> ${JSON.stringify(Reply.lint(b).violations)}`); assert.ok(questions(o.reply) <= 1, `one question at most: ${o.reply}`); };

family("identity", ["hi! who are you?", "what is this?", "what can you do for me?", "yo what's up"], ["career_greeting"], (o) => assert.match(String(o.reply), /career agent/));
family("onboarding", ["what do you need from me to get started?", "what do you need to know about me?", "how do I set this up", "what should I tell you first?"], ["career_onboarding_needs"], (o) => {
  lintClean(o);
  assert.match(String(o.reply), /role|field/i); assert.match(String(o.reply), /resume/i);
});
family("safety", ["will you send anything without asking me first?", "do you submit applications on your own?", "is anything sent before I say yes?", "make sure nothing goes out unless I approve it"], ["career_approval_rule"], (o) => {
  lintClean(o);
  assert.match(String(o.reply), /approv/i);
  assert.ok(!/\bwithout (asking|your approval)\b[^.]*\bI (will|can) (send|submit)\b/i.test(String(o.reply)), "never claims it sends unasked");
});
family("offtopic", ["what's the weather in chicago tomorrow", "can you write me a poem about cats", "who won the game last night", "help me with my calculus homework", "what's a good pizza place near me"], ["career_out_of_scope"], (o) => {
  lintClean(o);
  assert.match(String(o.reply), /outside what I/i);
});
family("status", ["have you applied anywhere for me yet?", "where am I with my job applications", "how many jobs have I applied to"], ["tracking_status"], (o) => assert.match(String(o.reply), /no applications on record|tracker/i));
family("prep", ["how should I prepare for a product manager interview"], ["prep_brief", "prep_plan", "prep_needs_profile", "prep_question"]);
family("fields", ["what will the application ask me?", "walk me through what the application form needs", "what fields do I need to fill out to apply", "what information will employers ask for on the form"], ["career_application_fields"], (o) => {
  lintClean(o);
  assert.match(String(o.reply), /work authori[sz]ation|sponsor/i);
  assert.match(String(o.reply), /never guess|not guess|asked, never|ask you/i);
});
family("resume (none on file)", ["do you have my resume?", "is my resume on file?", "what resume do you have for me", "did you get my resume"], ["career_resume_on_file"], (o) => {
  lintClean(o);
  assert.match(String(o.reply), /no resume/i);
});
family("search", ["any data analyst roles in Denver?", "show me remote software engineering internships", "nursing jobs near Chicago please"], ["career_discovery", "career_internship", "internship_search", "career_internship_discovery"]);
family("change", ["what jobs can I get with a biology degree besides research"], ["path_plan", "career_guidance", "career_os_plan"]);

test("resume on file (uploaded): the answer names the file from the record, never a guess", () => {
  const o = ask("do you have my resume?", { profile: { facts: [], resume: { filename: "jordan-lee-resume.pdf", sha256: "a".repeat(64) } } });
  assert.equal(o.intent, "career_resume_on_file");
  assert.match(String(o.reply), /jordan-lee-resume\.pdf/);
});

test("resume on file (pasted, drafts): the answer says it is on record as drafts awaiting the user's word", () => {
  const facts = [{ kind: "experience", value: "Analyst at Brindle", source: "resume-ingest", needs_confirmation: true }, { kind: "school", value: "State U", source: "resume-ingest", needs_confirmation: true }];
  const o = ask("is my resume on file?", { profile: { facts } });
  assert.equal(o.intent, "career_resume_on_file");
  assert.match(String(o.reply), /2 facts/); assert.match(String(o.reply), /draft|confirm/i);
});

// Controls: asks that already have an owner keep it; career words in an off-topic-looking turn are not refused.
const CONTROLS = [
  ["hey", "career_greeting"],
  ["find me marketing jobs in Austin", "career_discovery"],
  ["what's the status of my applications?", "tracking_status"],
  ["can you apply to jobs without my permission?", "named_role_apply"],
  ["can you make me a plan to prepare for my interview next week?", "prep_plan"],
];
for (const [a, intent] of CONTROLS) test(`control: "${a}" keeps its owner ${intent}`, () => assert.equal(ask(a).intent, intent));
test("control: a cover letter ask is never refused as out of scope", () => assert.notEqual(ask("can you write me a cover letter for a marketing job").intent, "career_out_of_scope"));
test("control: an interview about a weather company is not refused as out of scope", () => assert.notEqual(ask("I have an interview at a weather forecasting company, help me prepare").intent, "career_out_of_scope"));

// Career change and degree asks are answered on the field named, never the same two unrelated roles for everyone.
test("change: a move into a named field is answered on that field, and the stated background is not assumed", () => {
  const o = ask("how can I move from retail management into HR");
  assert.equal(o.intent, "path_plan");
  assert.match(String(o.reply), /HR coordinator|recruiting coordinator/);
  assert.match(String(o.reply), /retail management/);
  assert.ok(!/Operations coordinator: An exploration option/.test(String(o.reply)), "not the generic two-paths body");
});
test("change: two different fields get two different answers (no canned body)", () => {
  const a = String(ask("I'm a nurse who wants to get into data analysis, how do I do it?").reply);
  const b = String(ask("how do I switch to marketing from teaching?").reply);
  // The marketing move has its own owner (the guidance engine's interest_change map), which answers on the field too.
  assert.match(a, /data analyst/); assert.match(b, /marketing/i);
  assert.notEqual(a, b);
});
test("change: a degree ask names that degree's common starting points and honors 'besides research'", () => {
  const r = String(ask("what jobs can I get with a biology degree besides research").reply);
  assert.match(r, /biology/i);
  assert.ok(!/research|lab technician/i.test(r.split("These come from")[0].replace(/besides research/i, "")), r);
  assert.match(r, /healthcare administration|science writing/);
});
test("change: a licensed field carries its licensing caveat", () => {
  assert.match(String(ask("how do I move from retail into nursing?").reply), /license/i);
});
test("change: a field the table does not hold keeps the existing path (nothing invented for it)", () => {
  const o = ask("how do I get into beekeeping from accounting?");
  assert.ok(!/Common entry points into beekeeping/i.test(String(o.reply)));
});

// detypo: a real word is never "corrected" into a different word; a misspelling still is.
const Router = D("142-career-router.js");
test("detypo keeps real words that sit one edit from a routing word", () => {
  for (const w of ["analysis", "fine", "mind", "states", "contracts", "director", "officer", "closer", "resumed", "light", "sound"]) {
    assert.equal(Router.detypo(`I care about ${w} here`), `I care about ${w} here`, w);
  }
});
test("detypo still corrects plain misspellings and inflections of routing words", () => {
  assert.equal(Router.detypo("my intervew is friday"), "my interview is friday");
  assert.equal(Router.detypo("update my resmue"), "update my resume");
  assert.equal(Router.detypo("check my campaigns"), "check my campaign");
});
test("the analysis misroute: 'get into data analysis' is a career move, never a banking outreach list", () => {
  const o = ask("I'm a nurse who wants to get into data analysis, how do I do it?");
  assert.notEqual(o.intent, "outreach_clarification");
  assert.ok(!/Goldman Sachs|bulge bracket/.test(String(o.reply)), String(o.reply).slice(0, 200));
  assert.match(String(o.reply), /data analys/i);
});
test("'I'm fine with remote' is not read as a find command", () => {
  const o = ask("I'm fine with remote work");
  assert.ok(!/^career_discovery$/.test(o.intent || ""), `${o.intent}: ${String(o.reply).slice(0, 160)}`);
});
