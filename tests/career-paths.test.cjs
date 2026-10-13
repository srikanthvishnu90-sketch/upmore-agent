// Career paths for non-CIR ladders (134; Doc 3 §4 short paths; scenarios SC-222..SC-240):
// every path is sourced, every number in a composed answer traces, every answer passes the
// 125 honest-advice lint, and the SWE market read is built only from CIR cadence facts.
// Check: node --test tests/career-paths.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const CP = require(path.join(root, "packages/domain/134-career-paths.js"));
const CI = require(path.join(root, "packages/domain/125-career-intel.js"));
const NOW = "2026-10-13";
const PROFILE = { school: "DePaul University", school_tier: "non-target", major: "Computer Science", year: "sophomore", internships: [], projects: [], skills: ["Python", "SQL"], work_authorization: "US citizen", location: "Chicago" };

test("[PATHS] every path record is structurally complete and sourced", () => {
  assert.ok(CP.PATHS.length >= 10, CP.PATHS.length);
  for (const p of CP.PATHS) {
    assert.ok(p.id && p.title && p.bottom_line, p.id);
    assert.ok(p.ladder.length >= 3 && p.filters.length >= 1, p.id);
    for (const s of p.ladder) { assert.match(s.source_url, /^https?:\/\//, `${p.id} ladder source`); assert.match(s.as_of, /^\d{4}-\d{2}-\d{2}$/); }
    for (const f of p.filters) { assert.match(f.source_url, /^https?:\/\//, `${p.id} filter source`); assert.match(f.as_of, /^\d{4}-\d{2}-\d{2}$/); }
    for (const h of ["30d", "semester", "year"]) assert.ok(p.plan[h].length >= 1, `${p.id} plan ${h}`);
    assert.ok(p.sources.length >= 1 && p.honesty.length >= 1, p.id);
  }
});

test("[PATHS] every composed path answer verifies (all numbers traced) and passes lintAdvice", () => {
  for (const p of CP.PATHS) {
    const ans = CP.answerPath(p, PROFILE, { now: NOW });
    const v = CP.verifyPathAnswer(ans);
    assert.equal(v.ok, true, `${p.id}: verify=${JSON.stringify(v.verify.errors)} lint=${JSON.stringify(v.lint.violations)}`);
    assert.match(ans.text, /no company CIR/, `${p.id} must label itself as the general-ladder answer`);
  }
});

test("[PATHS] replay: an injected unsourced number fails a path answer's verification", () => {
  const ans = CP.answerPath(CP.getPath("big-law"), PROFILE, { now: NOW });
  const bad = CI.verifyClaims(ans.text + "\nExactly 61% of graduates get Big Law.", ans.claims, { allowedNumbers: ans.allowed_numbers });
  assert.equal(bad.ok, false);
  assert.ok(bad.unsourced_numbers.includes(61));
});

test("[PATHS] law and medicine answers carry the not-advice label; government carries the clearance facts", () => {
  const law = CP.answerPath(CP.getPath("big-law"), PROFILE, { now: NOW });
  assert.match(law.text, /Standard 509/); assert.match(law.text, /not legal advice/);
  const med = CP.answerPath(CP.getPath("pre-med"), PROFILE, { now: NOW });
  assert.match(med.text, /MCAT/); assert.match(med.text, /not medical advice/);
  const gov = CP.answerPath(CP.getPath("government-intel"), PROFILE, { now: NOW });
  assert.match(gov.text, /243 days/); assert.match(gov.text, /conditional offer/);
});

test("[PATHS] the SWE market read uses only CIR cadence facts and claims no anecdotal number", () => {
  const store = CI.loadCIRsFromDir(path.join(root, "packages/career-data/cirs"));
  const read = CP.sweMarketRead(store, { now: NOW });
  assert.ok(read.companies_checked.length >= 6, JSON.stringify(read.companies_checked));
  const v = CI.verifyClaims(read.text, read.claims, { allowedNumbers: read.allowed_numbers });
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  assert.equal(CI.lintAdvice(read.text).ok, true, JSON.stringify(CI.lintAdvice(read.text).violations));
  assert.equal(read.known_vs_anecdotal.anecdotal_claims_made, 0);
});
