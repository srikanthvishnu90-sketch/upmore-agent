// W13 shared library for SC-241..SC-260 (Intelligence & Honest Advice, second block).
// Drives the REAL 125-career-intel module over the shipped CIR corpus. Profiles are
// labeled TEST fixtures (packages/career-data/fixtures/*), converted to the module's
// master-profile shape. No real person is advised; no external sends happen.
"use strict";
const path = require("path");
const fs = require("fs");
const ROOT = path.resolve(__dirname, "..", "..", "..");
const CI = require(path.join(ROOT, "packages/domain/125-career-intel.js"));
const H = require(path.join(__dirname, "..", "scenario-harness.cjs"));
const CIR_DIR = path.join(ROOT, "packages/career-data/cirs");
const FIX_DIR = path.join(ROOT, "packages/career-data/fixtures");
const NOW = "2026-10-13";

const loadCIR = (id) => JSON.parse(fs.readFileSync(path.join(CIR_DIR, `${id}.json`), "utf8"));
const loadFixture = (name) => JSON.parse(fs.readFileSync(path.join(FIX_DIR, name), "utf8"));
const store = () => CI.loadCIRsFromDir(CIR_DIR);

// TEST-PERSONA-001 (test-persona.json) in master-profile shape.
const TEST_PERSONA_PROFILE = {
  school: "TEST University", school_tier: "non-target", major: "Computer Science", year: "junior",
  gpa: "3.7",
  internships: [{ role: "Software Engineering Intern", employer: "TEST Systems Inc" }, { role: "Finance Intern", employer: "Example Capital (TEST)" }],
  projects: [{ name: "DeployBoard (TEST project)" }, { name: "MarketSim valuation project (TEST)" }],
  skills: ["Python", "JavaScript", "React", "PostgreSQL", "SQL", "Kubernetes", "Docker", "Go", "Excel", "Financial Modeling"],
  work_authorization: "US citizen",
};
// TEST-PERSONA-004 (persona-international-swe.json) in master-profile shape.
const INTL_PROFILE = {
  school: "M.S. Computer Science program (TEST fixture)", school_tier: "graduate", major: "Computer Science", year: "graduate student, graduating May 2027 (TEST)",
  internships: [{ role: "SWE Intern", employer: "health-tech startup (TEST)" }],
  projects: [{ name: "Open-source data library contributions — fourteen merged PRs (TEST)" }],
  skills: ["Go", "Python", "Kubernetes"],
  work_authorization: "F-1 student (TEST) — needs OPT then H-1B sponsorship",
};
// TEST-PERSONA-006 (persona-switcher-nurse.json) in master-profile shape.
const NURSE_PROFILE = {
  school: "Nursing degree (TEST fixture)", school_tier: "career switcher", major: "Nursing (RN)", year: "career switcher — six years ICU nursing (TEST)",
  internships: [],
  projects: [{ name: "Unit readmission-data analysis presented to hospital leadership (TEST)" }, { name: "Sepsis-alert workflow project and unit dashboards in Excel/Tableau (TEST)" }],
  skills: ["SQL", "Tableau", "Python"],
  work_authorization: "US citizen (TEST)",
};
// SC-241 profile: stated in the canonical ask itself (3.0 GPA, no internship) — labeled TEST.
const GPA30_PROFILE = {
  school: "State university (TEST)", school_tier: "non-target", major: "Business", year: "junior",
  gpa: "3.0", internships: [], projects: [], skills: [], work_authorization: "US citizen",
};

// Full company-file run (SC-249..260 pattern): validator -> compose thesis in the chat
// path -> verifyThesis + lintAdvice from rail state. COMPLETE only if every gate passes.
async function runCompanyFile(scId, slug, cirId, userText, opts) {
  opts = opts || {};
  const s = H.session(scId, slug);
  s.user(userText);
  const cir = loadCIR(cirId);
  const v = CI.validateCIR(cir, { now: NOW });
  s.tool("validateCIR (scripts/validate-cir.cjs gate, same validator)", { company_id: cirId, ok: v.ok, errors: v.errors, warnings: v.warnings.length, stale_count: v.stale.length, sample_size: cir.sample_size, confidence_level: cir.confidence_level, as_of: cir.as_of });
  const profile = opts.profile || TEST_PERSONA_PROFILE;
  const thesis = CI.composeThesis(cir, profile, { now: NOW });
  s.agent(thesis.text);
  const vt = CI.verifyThesis(thesis);
  const lint = CI.lintAdvice(thesis.text);
  s.tool("verifyThesis + lintAdvice", { verifyThesis: vt, lintAdvice: lint, claims: thesis.claims.length, suppressed: thesis.suppressed.length });
  const pass = v.ok && vt.ok && lint.ok;
  s.verify(`CIR ${cirId} loaded from packages/career-data/cirs/${cirId}.json and validated (ok=${v.ok}); thesis composed by the real 125 composeThesis in the chat path and served verbatim above; verifyThesis ok=${vt.ok} (every number traces to a CIR fact); lintAdvice ok=${lint.ok}; coverage labeled in the thesis itself (sample N=${cir.sample_size === null ? "not available — curated-qualitative" : cir.sample_size}, confidence=${cir.confidence_level}).`, { validator_ok: v.ok, verifyThesis_ok: vt.ok, lint_ok: lint.ok });
  await s.finish(pass
    ? { status: "COMPLETE", outcome: `Company file for ${cir.company_name} served in chat: validated CIR + composed thesis with every number traced and coverage labeled.` }
    : { status: "LEARN", outcome: `Company file run for ${cir.company_name} did not pass all gates.`, reason: `validator ok=${v.ok}, verifyThesis ok=${vt.ok}, lint ok=${lint.ok}`, unblock: "Fix the failing gate in the CIR or composer, then rerun this scenario." });
  return { s, pass, v, vt, lint, thesis };
}

module.exports = { CI, H, ROOT, CIR_DIR, NOW, loadCIR, loadFixture, store, TEST_PERSONA_PROFILE, INTL_PROFILE, NURSE_PROFILE, GPA30_PROFILE, runCompanyFile };
