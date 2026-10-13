"use strict";
// Shared lib for SC-221..SC-240 (Intelligence & Honest Advice, worker w12).
// Drives the REAL 125-career-intel module over the shipped CIR corpus, plus 134-career-paths
// for ladders with no CIR. Personas are the labeled TEST fixtures / the 125 suite's canonical profile.
const fs = require("fs");
const path = require("path");
const H = require("../scenario-harness.cjs");
const root = path.resolve(__dirname, "../../..");
const CI = require(path.join(root, "packages/domain/125-career-intel.js"));
const CP = require(path.join(root, "packages/domain/134-career-paths.js"));
const CIR_DIR = path.join(root, "packages/career-data/cirs");
const FIX_DIR = path.join(root, "packages/career-data/fixtures");
const NOW = "2026-10-13"; // run date; CIR corpus as_of 2026-10-12

const store = CI.loadCIRsFromDir(CIR_DIR);
const fixture = (f) => JSON.parse(fs.readFileSync(path.join(FIX_DIR, f), "utf8"));

// Canonical sophomore: the exact profile the 125 suite composes against (tests/career-intel.test.cjs).
const SOPHOMORE = {
  school: "DePaul University", school_tier: "non-target", major: "Computer Science", year: "sophomore",
  internships: [], projects: [{ name: "Course-planner app with real users" }],
  skills: ["Python", "SQL"], work_authorization: "US citizen", location: "Chicago",
};
// TEST-PERSONA-003 (persona-nontarget-freshman.json) mapped to the compareMe profile shape.
const fxFresh = fixture("persona-nontarget-freshman.json");
const FRESHMAN = {
  school: "large state university (TEST)", school_tier: "non-target", major: "Finance", year: "freshman", gpa: 3.6,
  internships: [], projects: [], skills: ["Excel"], work_authorization: "US citizen (TEST)", location: "Columbus, OH (TEST)",
  persona_id: fxFresh.persona_id,
};
// TEST-PERSONA-002 (persona-target-junior.json) mapped likewise.
const fxJunior = fixture("persona-target-junior.json");
const TARGET_JUNIOR = {
  school: "target university (TEST)", school_tier: "target", major: "Economics", year: "junior", gpa: 3.8,
  internships: [{ role: "Summer Analyst (sophomore)", employer: "boutique bank (TEST)" }],
  projects: [], skills: ["Financial Modeling", "Excel", "PowerPoint"],
  work_authorization: "US citizen (TEST)", location: "Philadelphia, PA (TEST)", persona_id: fxJunior.persona_id,
};
// Derived TEST variant of the canonical sophomore with the GPA the SC-224 question states (3.4).
const GPA34 = { ...SOPHOMORE, gpa: 3.4, label: "TEST variant — canonical sophomore with a stated 3.4 GPA (for SC-224)" };
// TEST-PERSONA-004 (persona-international-swe.json).
const fxIntl = fixture("persona-international-swe.json");
const INTERNATIONAL = {
  school: "TEST university (M.S.)", school_tier: "unknown", major: "Computer Science", year: "graduate (M.S., graduating May 2027)",
  internships: [{ role: "SWE Intern", employer: "health-tech startup (TEST)" }],
  projects: [{ name: "Open-source data library contributions (TEST)" }], skills: ["Go", "Python"],
  work_authorization: "F-1 student (TEST) — needs sponsorship", location: "Pittsburgh, PA (TEST)", persona_id: fxIntl.persona_id,
};

// Harvest a claim for every number anywhere in a CIR (mirrors the 125 validator's thesis-trace rule),
// for scenario answers that quote CIR facts outside composeThesis (SC-224 / SC-231).
function claimsFromCIR(cir) {
  const claims = [];
  const harvest = (v) => {
    if (typeof v === "number") { if (!claims.some((c) => c.value === v)) claims.push({ text: `${cir.company_id} fact`, value: v, unit: null, source_url: cir.data_sources[0].url, as_of: cir.as_of, sample_size: cir.sample_size }); }
    else if (typeof v === "string") for (const n of CI.numbersIn(v)) if (!claims.some((c) => c.value === n)) claims.push({ text: `${cir.company_id} fact`, value: n, unit: null, source_url: cir.data_sources[0].url, as_of: cir.as_of, sample_size: cir.sample_size });
    else if (Array.isArray(v)) v.forEach(harvest);
    else if (v && typeof v === "object") Object.values(v).forEach(harvest);
  };
  const { thesis_text, ...rest } = cir; harvest(rest);
  return claims;
}

// Compose a thesis for cirId, record it fully, verify from rail state. Returns { th, ok }.
function thesisRun(s, cirId, profile) {
  const cir = CI.getCIR(store, cirId);
  const gate = CI.respondToRequest(s.messages[0].text);
  const th = CI.composeThesis(cir, profile, { now: NOW });
  s.tool(`125.respondToRequest gate`, gate);
  s.tool(`125.composeThesis(${cirId})`, { company_id: cirId, sample_size: cir.sample_size, as_of: cir.as_of, confidence_level: cir.confidence_level, claims: th.claims.length, cir_validation_ok: th.cir_validation.ok, stale_count: th.cir_validation.stale_count });
  s.agent(th.text);
  const v = CI.verifyThesis(th);
  const lint = CI.lintAdvice(th.text);
  s.verify(`verifyThesis on the produced ${cirId} thesis: every number traced to the CIR claim ledger; lintAdvice verdict recorded`, { verify_ok: v.ok, verify_errors: v.errors, unsourced_numbers: v.unsourced_numbers, lint_ok: lint.ok, lint_violations: lint.violations, sample_size: cir.sample_size, as_of: cir.as_of });
  return { th, ok: v.ok && lint.ok && gate.action === "proceed", v, lint };
}

// Answer a non-CIR ladder from 134, record it fully, verify from rail state.
function pathRun(s, pathId, profile) {
  const p = CP.getPath(pathId);
  const ans = CP.answerPath(p, profile, { now: NOW });
  s.tool(`134.answerPath(${pathId})`, { path_id: pathId, claims: ans.claims.length, sources: ans.sources });
  s.agent(ans.text);
  const v = CP.verifyPathAnswer(ans);
  s.verify(`verifyClaims + lintAdvice on the produced ${pathId} general-ladder answer (no CIR exists for this path; answer is labeled as such in its own text)`, { verify_ok: v.verify.ok, verify_errors: v.verify.errors, lint_ok: v.lint.ok, lint_violations: v.lint.violations });
  return { ans, ok: v.ok, v };
}

async function finish(s, ok, completeOutcome, learnReason, unblock) {
  await s.finish(ok
    ? { status: "COMPLETE", outcome: completeOutcome }
    : { status: "LEARN", outcome: "Answer produced but rail-state verification did not fully pass.", reason: learnReason, unblock });
}

module.exports = { H, CI, CP, store, NOW, SOPHOMORE, FRESHMAN, TARGET_JUNIOR, GPA34, INTERNATIONAL, claimsFromCIR, thesisRun, pathRun, finish };
