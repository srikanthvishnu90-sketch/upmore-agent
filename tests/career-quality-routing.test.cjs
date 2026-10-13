// Routing-grade grader tests (Gate 2 grading prep, Quality Spec Pack v1.0).
// Covers: the canonical routing set (coverage, grounding, drift), the
// paraphrase generator + stratified sample, the correctness/counter logic
// on synthetic turns, and a live smoke run of the grader against the
// current build on a fixed scenario subset (deterministic staging path).
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

process.env.ROUTING_GRADE_OUT_DIR = "/tmp/routing-grade-test-evidence";
process.env.HARNESS_OUT_DIR = "/tmp/routing-grade-test-harness";
process.env.GAUNTLET_TRIAL = "routing-grade";

const G = require("../scripts/career/gauntlet/run-routing-grade.cjs");
const Rescore = require("../scripts/career/gauntlet/run-grand-rescore.cjs");
const expectations = JSON.parse(fs.readFileSync(G.EXPECTATIONS_PATH, "utf8"));
const byId = new Map(expectations.entries.map((e) => [e.id, e]));

test("expectations: 300 entries, every scenario grounded or explicitly overridden", () => {
  assert.equal(expectations.entries.length, 300);
  assert.equal(expectations.version, 1);
  for (let i = 1; i <= 300; i++) {
    const id = "SC-" + String(i).padStart(3, "0");
    const e = byId.get(id);
    assert.ok(e, id + " present");
    assert.ok(e.ask && e.ask.length > 3, id + " has canonical ask");
    assert.ok(e.expected_tool, id + " has an expected tool (UNGROUNDED entries must be zero)");
    assert.ok(e.source_citation && e.source_citation.length > 20, id + " carries a source citation");
    assert.ok(["scenario-tool-calls", "family-default", "override-capability-absent"].includes(e.grounding), id + " grounding class");
  }
  const counts = {};
  for (const e of expectations.entries) counts[e.grounding] = (counts[e.grounding] || 0) + 1;
  assert.equal(counts["override-capability-absent"], 2);
  assert.ok(counts["scenario-tool-calls"] >= 240, "majority grounded in scenario tool calls, got " + counts["scenario-tool-calls"]);
});

test("expectations: R-C7 capability-absent draft is exactly SC-105 + SC-179", () => {
  assert.deepEqual(expectations.capability_absent_draft, ["SC-105", "SC-179"]);
  assert.equal(byId.get("SC-105").expected_tool, G.RC7);
  assert.equal(byId.get("SC-179").expected_tool, G.RC7);
  assert.match(byId.get("SC-105").source_citation, /portal status read/);
  assert.match(byId.get("SC-179").source_citation, /voice mock/);
});

test("expectations: spot-grounded primaries match the run-1 handler map", () => {
  assert.equal(byId.get("SC-001").expected_tool, "124-career-outreach"); // 124.* tokens in SC-001.cjs
  assert.equal(byId.get("SC-286").expected_tool, "120-career-access"); // CareerAccess.handleChat
  assert.equal(byId.get("SC-287").expected_tool, "122-career-profile"); // CareerProfile.ingestLinkedIn
  assert.equal(byId.get("SC-300").expected_tool, "139-career-safety"); // CareerSafety.stopEverything
  assert.equal(byId.get("SC-065").expected_tool, "121-career-jobs"); // discovery leg of the apply ask
  // safety-refusal scenarios accept the guard refusal intent
  assert.ok(byId.get("SC-035").acceptable_intents.includes("intent_refusal"));
});

test("expectations: committed file does not drift from the derivation", () => {
  const derived = G.deriveExpectations();
  assert.equal(JSON.stringify(derived.entries), JSON.stringify(expectations.entries),
    "routing-expectations.json drifted — regenerate with run-routing-grade.cjs --write-expectations and review the diff");
});

test("paraphrases: 4 classes per 04 6a, deterministic, meaning tokens preserved", () => {
  const ask = byId.get("SC-004").ask; // "Get me 40 coffee chats with associates at McKinsey, Bain, BCG"
  const a = G.paraphrases("SC-004", ask);
  const b = G.paraphrases("SC-004", ask);
  assert.deepEqual(a, b, "same id + ask = identical variants");
  assert.deepEqual(a.map((v) => v.cls), ["short-casual", "typo-laden", "indirect", "stressed-text"]);
  for (const v of a) {
    assert.ok(v.text.includes("40"), v.cls + " preserves the count (digit tokens are never typo'd)");
    if (v.cls !== "typo-laden") assert.ok(/McKinsey/i.test(v.text), v.cls + " preserves the firm");
    else assert.ok(/Mc\w+sey/i.test(v.text), "typo class garbles but does not drop the firm token");
    assert.notEqual(v.text, ask, v.cls + " actually transforms the ask");
  }
  const other = G.paraphrases("SC-005", ask);
  assert.notEqual(other[1].text, a[1].text, "typo seed varies per scenario");
});

test("stratified sample: >=60 scenarios, every family group represented", () => {
  const sample = G.stratifiedSample(expectations.entries);
  assert.ok(sample.length >= 60, "sample >= 60, got " + sample.length);
  const groups = new Set(expectations.entries.map((e) => e.family_group));
  const sampled = new Set(sample.map((e) => e.family_group));
  assert.deepEqual([...sampled].sort(), [...groups].sort());
  assert.deepEqual(G.stratifiedSample(expectations.entries).map((e) => e.id), sample.map((e) => e.id), "sample is deterministic");
});

test("isCorrect: handler match, intent match, tool-name match, and misses", () => {
  const exp = byId.get("SC-001"); // 124-career-outreach, accepts outreach_draft
  assert.equal(G.isCorrect(exp, { handler: "142-career-router.handleChat", result: { intent: "outreach_draft" } }, "draft ready"), true);
  assert.equal(G.isCorrect(exp, { handler: "124-career-outreach.handleChat", result: { intent: "anything" } }, "x"), true, "handler module match");
  assert.equal(G.isCorrect(exp, { handler: "142-career-router.handleChat", result: { intent: "career_discovery" } }, "roles"), false);
  assert.equal(G.isCorrect(exp, { handler: null, contained: true, result: null }, "I didn't catch that."), false);
  assert.equal(G.observedTool({ contained: true, result: null, handler: null }), "none");
  assert.equal(G.observedTool({ handler: "142-career-router.handleChat", result: { intent: "queue_halt" } }), "queue_halt");
});

test("isCorrect: R-C7 expectations require an honest-unavailable reply", () => {
  const exp = byId.get("SC-179");
  assert.equal(G.isCorrect(exp, { handler: "142-career-router.handleChat", result: { intent: "capability_status" } },
    "Voice is not wired yet. I can run the same mock by text instead."), true);
  assert.equal(G.isCorrect(exp, { handler: null, contained: true, result: null },
    "I didn't catch that. Try naming the job, company, or person."), false, "fallback is never an honest R-C7 answer");
  assert.equal(G.isCorrect(exp, { handler: "142-career-router.handleChat", result: { intent: "prep_mock_start" } },
    "Here is your first voice question."), false, "faked capability is not honest-unavailable");
});

test("zero-counters: didn't-catch class and canned fingerprint (reused from hardened grader)", () => {
  assert.ok(G.DIDNT_CATCH_RE.test("I didn't catch that. Try naming the job..."));
  assert.ok(!G.DIDNT_CATCH_RE.test("I need one detail: which firm?"));
  const cannedText = "Here are the 5 roles most worth applying to, ranked by fit with your profile. New Grad Software Engineer at Northwind Ledger (fictional). Software Engineering Intern at Lakefront Cloud (fictional). Backend Engineer at Eastbank Systems (fictional).";
  assert.equal(Rescore.cannedSignature(cannedText).canned, true);
  assert.equal(Rescore.expectedDomain({ canonical_ask: byId.get("SC-001").ask, family: byId.get("SC-001").family }).discovery, false,
    "SC-001 is a people-search ask, so the canned list there trips counter 2");
  assert.equal(Rescore.cannedSignature("Your draft to Priya is ready for review.").canned, false);
});

test("personas: P1 wired, P2 pluggable and never silently substituted", () => {
  assert.equal(G.PERSONAS.P1.wired, true);
  assert.equal(G.PERSONAS.P1.fixtureDir, "p1-early-career-swe");
  assert.equal(G.PERSONAS.P2.wired, false);
  assert.equal(G.PERSONAS.P2.fixtureDir, null, "P2 stays unregistered until its spec fixture lands");
});

test("live smoke: grader runs the current build on a fixed subset, deterministically", () => {
  // Subset chosen to cover: outreach people-search, R-C7, access, safety.
  const ids = ["SC-001", "SC-105", "SC-286", "SC-300"];
  const runOnce = () => {
    // grade() is internal; drive it through the CLI surface instead.
    const { execFileSync } = require("child_process");
    const out = execFileSync(process.execPath, [path.join(__dirname, "..", "scripts/career/gauntlet/run-routing-grade.cjs"),
      "--only", ids.join(","), "--no-paraphrases", "--out-json", "/tmp/routing-grade-test-smoke.json"], { encoding: "utf8" });
    return JSON.parse(fs.readFileSync("/tmp/routing-grade-test-smoke.json", "utf8"));
  };
  const r1 = runOnce();
  assert.equal(r1.scenarios_run, 4);
  assert.equal(r1.persona, "P1");
  for (const row of r1.canonical_rows) {
    assert.ok("correct" in row && "observed_tool" in row && "didnt_catch" in row, row.id + " row shape");
  }
  const sc286 = r1.canonical_rows.find((r) => r.id === "SC-286");
  assert.equal(sc286.correct, true, "SC-286 connect ask is one of the few routes the current build owns (120 connect_google)");
  const r2 = runOnce();
  assert.equal(r2.canonical.correct_tool_pct, r1.canonical.correct_tool_pct, "re-run = same canonical numbers");
  assert.deepEqual(r2.zero_counters, r1.zero_counters, "re-run = same zero-counters");
});
