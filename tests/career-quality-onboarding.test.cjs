// Portable contract checks. Original historical validations remain required in tests-archival/.
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
const EVIDENCE = process.env.GAUNTLET_OUT_DIR || path.join(process.env.HOME, "workspace/your_files/upmore-career-gauntlet");

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
