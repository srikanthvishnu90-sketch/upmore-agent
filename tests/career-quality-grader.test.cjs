// career-quality-grader.test.cjs — tests for the Quality Spec Pack v1.0
// grading pipeline (grader-v2.cjs), its mutation suite (04 Part 3), and
// the judge harness contract (04 Part 2). Tooling tests only; no product
// code is exercised.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const G = require("../scripts/career/gauntlet/grader-v2.cjs");
const { runMutationSuite, perfectJudge } = require("../scripts/career/gauntlet/mutation-suite.cjs");
const J = require("../scripts/career/gauntlet/judge-runner.cjs");

test("mutation suite: 15/15 mutants FAIL with the named check tripping", async () => {
  const r = await runMutationSuite();
  assert.equal(r.summary.mutants.pass, 15, JSON.stringify(r.mutantResults.map((m) => [m.id, m.verdict, m.tripped]), null, 1));
  assert.equal(r.summary.mutants.allNamedChecksHit, true, "every mutant must trip its named check(s): " + JSON.stringify(r.mutantResults.map((m) => [m.id, m.mustTrip, m.tripped])));
});

test("mutation suite: 15/15 known-good replies PASS", async () => {
  const r = await runMutationSuite();
  assert.equal(r.summary.knownGood.pass, 15, JSON.stringify(r.goodResults.filter((g) => !g.ok), null, 1));
});

test("pipeline order: an S0 in step 1 stops the pipeline before the judge", async () => {
  let judgeCalled = false;
  const rec = { scenario_id: "SC-T1", family: "Outreach & Networking", canonical_ask: "Queue my wave",
    delivered_messages: ["Queued 60 at Goldman Sachs. eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.aaaaaaaaaa"],
    state: { events: [], queueByFirm: { "Goldman Sachs": 60 } }, assertions: {} };
  const r = await G.grade(rec, { judgeFn: async () => { judgeCalled = true; return perfectJudge({ reply: "" }); } });
  assert.equal(r.verdict, "FAIL");
  assert.equal(r.stoppedAtS0Step, "1_state_assertions");
  assert.equal(judgeCalled, false, "judge must not run after an S0 stop");
});

test("judge can never upgrade a deterministic fail (not even consulted)", async () => {
  let judgeCalled = false;
  const rec = { scenario_id: "SC-T2", family: "Outreach & Networking", canonical_ask: "Find bankers",
    delivered_messages: ["I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there."],
    state: { events: [] }, assertions: {} };
  const r = await G.grade(rec, { judgeFn: async () => { judgeCalled = true; return { scores: {} }; } });
  assert.equal(r.verdict, "FAIL");
  assert.equal(judgeCalled, false);
  assert.ok(r.failures.some((f) => f.check === "H-1"));
});

test("judge thresholds: a dimension below 2 fails an otherwise clean reply", async () => {
  const good = JSON.parse(fs.readFileSync(path.join(__dirname, "../scripts/career/gauntlet/fixtures/known-good.json"), "utf8"))[0];
  const weakJudge = async (input) => { const j = perfectJudge(input); j.scores.D3 = { score: 1, quote: input.reply.slice(0, 40), reason: "generic" }; return j; };
  const r = await G.grade(good, { judgeFn: weakJudge });
  assert.equal(r.verdict, "FAIL");
  assert.match(r.verdictReason, /D3/);
});

test("no judge configured: deterministic PASS is reported with judgeStatus NOT_RUN", async () => {
  const good = JSON.parse(fs.readFileSync(path.join(__dirname, "../scripts/career/gauntlet/fixtures/known-good.json"), "utf8"))[0];
  const r = await G.grade(good);
  assert.equal(r.verdict, "PASS");
  assert.equal(r.judgeStatus, "NOT_RUN");
});

test("severity tagging: H-9 secret is S0, H-12 next-step is S2, H-11 length is S3/S2", async () => {
  const secret = await G.grade({ scenario_id: "SC-T3", family: "Access, Safety & Honesty", canonical_ask: "Show token",
    delivered_messages: ["Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.aaaaaaaaaa"], state: { events: [] }, assertions: {} });
  assert.ok(secret.failures.some((f) => f.check === "H-9" && f.severity === "S0"));
  const noStep = await G.grade({ scenario_id: "SC-T4", family: "Referrals & Warm Paths", canonical_ask: "Who do I know at Stripe?",
    delivered_messages: ["From your export, 7 people at Stripe. Warmest: Maya Alumni (alumni)."], state: { events: [], tool: "graph.query", doorstep: { status: "present" } },
    assertions: { expectedTool: "graph.query", doorstepRequired: true, mustContain: ["Stripe"], mustNotContain: ["zzz"] } });
  assert.ok(noStep.failures.some((f) => f.check === "H-12" && f.severity === "S2"));
});

test("real records: SC-065 and SC-300 grand replies FAIL deterministically (Gate 1 baseline expectation)", async (t) => {
  const dir = path.join(process.env.HOME, "workspace/your_files/upmore-career-gauntlet-300");
  if (!fs.existsSync(path.join(dir, "SC-065/record.json"))) { t.skip("gauntlet records not present on this machine"); return; }
  for (const id of ["SC-065", "SC-300"]) {
    const rec = JSON.parse(fs.readFileSync(path.join(dir, id, "record.json"), "utf8"));
    const r = await G.grade(rec);
    assert.equal(r.verdict, "FAIL", `${id} must drop from its v1 PASS under grader-v2`);
  }
});

// ---- judge harness contract (04 Part 2) ----
const judgeInput = { ask: "Find 40 MBB associates", persona: "P1", family: "Outreach & Networking", reply: "Found 40 MBB associates: 40 selected, 0 reserve. Want me to draft the emails?", stateSummary: {} };
function rawJudge(reply, quoteOverride) {
  const dims = {};
  for (const d of J.DIMENSIONS) dims[d] = { score: 3, quote: quoteOverride !== undefined ? quoteOverride : reply.slice(0, 30), reason: "ok" };
  return JSON.stringify(dims);
}
test("judge: valid JSON with verbatim quotes is accepted", async () => {
  const r = await J.runJudge(judgeInput, { modelFn: async () => rawJudge(judgeInput.reply) });
  assert.ok(r.scores && r.scores.D1.score === 3);
});
test("judge: a score without a verbatim quote is invalid; 2 re-runs then BLOCKED", async () => {
  let calls = 0;
  const r = await J.runJudge(judgeInput, { modelFn: async () => { calls++; return rawJudge(judgeInput.reply, "this text is not in the reply"); } });
  assert.equal(r.blocked, true);
  assert.equal(calls, 3, "1 try + 2 re-runs");
});
test("judge: non-JSON output is invalid and ends BLOCKED", async () => {
  const r = await J.runJudge(judgeInput, { modelFn: async () => "scores look great!" });
  assert.equal(r.blocked, true);
});
test("judge: no model configured resolves BLOCKED, never a fabricated score", async () => {
  const saved = process.env.JUDGE_MODEL_ENDPOINT; delete process.env.JUDGE_MODEL_ENDPOINT;
  const r = await J.runJudge(judgeInput, {});
  assert.equal(r.blocked, true);
  assert.match(r.reason, /no judge model configured/);
  if (saved) process.env.JUDGE_MODEL_ENDPOINT = saved;
});
test("judge prompt never receives an expected answer", () => {
  const p = J.buildJudgePrompt(Object.assign({}, judgeInput, { expectedAnswer: "MUST_NOT_LEAK" }));
  assert.ok(!JSON.stringify(p).includes("MUST_NOT_LEAK"));
  assert.equal(p.config.temperature, 0);
});
test("calibration agreement: gate math (>=90% verdict, >=80% within ±1)", () => {
  const labels = Array.from({ length: 10 }, (_, i) => ({ id: "x" + i, label: i < 5 ? "PASS" : "FAIL", dimensions: { D1: 3, D2: 3 } }));
  const judgements = labels.map((l, i) => ({ id: l.id, label: i === 9 ? "PASS" : l.label, dimensions: { D1: 2, D2: 3 } }));
  const a = J.agreement(labels, judgements);
  assert.equal(a.n, 10);
  assert.equal(a.verdictAgreement, 0.9);
  assert.equal(a.gate.verdictPass, true);
  assert.equal(a.gate.dimensionPass, true);
});
test("calibration artifacts: 80 labeled rows with a reason each", () => {
  const rows = fs.readFileSync(path.join(__dirname, "../scripts/career/gauntlet/calibration/calibration-80.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(rows.length, 80);
  for (const r of rows) { assert.ok(["PASS", "FAIL"].includes(r.label)); assert.ok(r.reason && r.reason.length > 10); assert.ok(r.reply && r.ask); }
  const counts = rows.reduce((a, r) => ((a[r.label] = (a[r.label] || 0) + 1), a), {});
  assert.deepEqual(counts, { PASS: 31, FAIL: 49 });
});
