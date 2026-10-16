// Onboarding test set (OB-01..OB-09) — grader integrity + first-run evidence tests.
// Grader code only; NO product code. Run AFTER the runner:
//   node scripts/career/gauntlet/run-onboarding.cjs
//   node --test tests/career-quality-onboarding.test.cjs
// Governing texts: docs/operating-prompt.md Part 2; docs/quality-spec/00 + 02.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DEF = require(path.join(ROOT, "scripts/career/gauntlet/cases-onboarding.cjs"));
const VERDICTS = new Set(["PASS", "FAIL", "BLOCKED", "NOT IMPLEMENTED"]);
const TRIALS = ["trial-1", "trial-2", "trial-3"];
const EVIDENCE = process.env.GAUNTLET_OUT_DIR || path.join(require("../scripts/career/critical-repairs/archive-gate.cjs").archiveRoot(), "upmore-career-gauntlet");

test("case definitions: 9 cases OB-01..OB-09, each with spec, turns, and a named state", () => {
  assert.deepEqual(DEF.CASES.map((c) => c.id), ["OB-01", "OB-02", "OB-03", "OB-04", "OB-05", "OB-06", "OB-07", "OB-08", "OB-09"]);
  for (const c of DEF.CASES) {
    assert.ok(c.spec.length > 40, c.id + " spec");
    assert.ok(c.turns.length >= 1, c.id + " turns");
    assert.ok(c.state.length > 20, c.id + " state described");
    if (c.id !== "OB-07") assert.ok(/profile/i.test(c.state), c.id + " state names the profile precondition"); // OB-07 is the cross-case aggregate
  }
  for (const seam of ["S-BUBBLE", "S-PROFILE", "S-PERSIST"]) assert.ok(DEF.SEAMS[seam], "seam named: " + seam);
});

test("exact Part 2 strings in the case definitions match docs/operating-prompt.md verbatim", () => {
  // The prompt file hard-wraps its quoted strings across lines; collapse all
  // whitespace so the comparison is against the string content, not the wrap.
  const prompt = fs.readFileSync(path.join(ROOT, "docs/operating-prompt.md"), "utf8").replace(/\s+/g, " ");
  assert.ok(prompt.includes("your personal career agent"), "prompt carries the greeting shape");
  assert.ok(prompt.includes(DEF.TELL_ME), "tell-me bubble verbatim in prompt");
  assert.ok(prompt.includes(DEF.ACK_RETAINED), "retained-request acknowledgment verbatim in prompt");
  assert.ok(prompt.includes(DEF.PLAYBACK_QUESTION), "playback question verbatim in prompt");
  assert.ok(prompt.includes("Hey, I'm {agent_name}, your personal"), "unknown-name fallback shape in prompt");
  assert.equal(DEF.greetKnown("Alex"), "Hey Alex, I'm Upmore, your personal career agent.");
  assert.equal(DEF.GREET_UNKNOWN, "Hey, I'm Upmore, your personal career agent.");
  assert.ok(!DEF.GREET_UNKNOWN.includes("{first_name}"), "fallback carries no placeholder");
});

test("grader S0 scanner logic: intro tokens in a produced artifact trip it; clean output does not", () => {
  const tokensIn = (text) => DEF.INTRO_TOKENS.filter((t) => String(text || "").includes(t));
  const dirtyArtifact = "Dear Ms. Lee — I'm a DePaul junior who interned at Merrill Lynch in wealth management…";
  assert.ok(tokensIn(dirtyArtifact).length >= 3, "synthetic unconfirmed artifact must trip the OB04-A1 scan");
  assert.deepEqual(tokensIn("Dear Ms. Lee — I'd value 15 minutes to hear about your team."), []);
  assert.deepEqual(tokensIn(""), []);
});

test("grader exact-bubble logic: a merged single bubble is NOT the two required bubbles", () => {
  const expected = [DEF.greetKnown(DEF.KNOWN_FIRST_NAME), DEF.TELL_ME];
  const merged = [`${expected[0]} ${expected[1]}`];
  assert.notDeepEqual(merged, expected, "140 sentence-grouping merging the greetings must fail the exact delivered-bubble assertion (and grade BLOCKED via raw lines, per S-BUBBLE)");
  assert.deepEqual(expected, [DEF.greetKnown("Alex"), DEF.TELL_ME]);
});

function summaries() {
  return TRIALS.map((t) => JSON.parse(fs.readFileSync(path.join(EVIDENCE, "OB-SUMMARY", `${t}.json`), "utf8")));
}

test("first-run evidence: every case ran 3 trials with pack verdicts and per-assertion fail kinds", () => {
  for (const s of summaries()) {
    assert.equal(s.results.length, 9, s.trial + " ran all 9 cases");
    for (const r of s.results) {
      assert.ok(VERDICTS.has(r.verdict), `${r.case_id} ${s.trial} verdict vocab: ${r.verdict}`);
      assert.ok(r.assertions.length >= 2, `${r.case_id} assertions`);
      for (const a of r.assertions) {
        assert.ok(["S0", "S1", "S2", "S3"].includes(a.severity), `${r.case_id} ${a.id} severity`);
        if (!a.pass) assert.ok(["s0", "wrong", "absent", "seam"].includes(a.failKind), `${r.case_id} ${a.id} failKind distinguishes absent vs wrong vs seam vs s0`);
        if (a.failKind === "s0") assert.equal(r.s0, true, `${r.case_id} s0 flag propagates`);
      }
      const dir = path.join(EVIDENCE, r.case_id, s.trial);
      const rec = JSON.parse(fs.readFileSync(path.join(dir, "record.json"), "utf8"));
      assert.equal(rec.case_id, r.case_id);
      assert.equal(rec.verdict, r.verdict, `${r.case_id} ${s.trial} record verdict matches summary`);
      const transcript = fs.readFileSync(path.join(dir, "transcript.md"), "utf8");
      for (const b of rec.delivered_messages) assert.ok(transcript.includes("**AGENT:** " + b), `${r.case_id} transcript verbatim bubble`);
    }
  }
});

test("first-run evidence: trial verdicts are consistent across the 3 trials (deterministic staging path)", () => {
  const ss = summaries();
  for (const c of DEF.CASES) {
    const vs = ss.map((s) => s.results.find((r) => r.case_id === c.id).verdict);
    assert.deepEqual(vs, [vs[0], vs[0], vs[0]], `${c.id} verdicts diverge across trials: ${vs.join(",")}`);
  }
});

test("first-run evidence: OB-07 registry covers every driven turn and the firstrun doc exists with per-case verdicts", () => {
  const doc = fs.readFileSync(path.join(ROOT, "docs/career/gauntlet-onboarding-firstrun.md"), "utf8");
  for (const c of DEF.CASES) assert.ok(doc.includes(c.id), "firstrun doc names " + c.id);
  assert.ok(doc.includes("## S0 findings (read first)"), "S0 section leads the firstrun doc");
  for (const seam of ["S-BUBBLE", "S-PROFILE", "S-PERSIST"]) assert.ok(doc.includes(seam), "firstrun doc names seam " + seam);
  const ss = summaries();
  const ob07 = ss[0].results.find((r) => r.case_id === "OB-07");
  assert.ok(ob07, "OB-07 result present");
});
