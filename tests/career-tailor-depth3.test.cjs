// Guards for Depth Lane C's tailoring items (BUG LAW: one fail-first
// replay guard per fixed defect):
//   MI-024 — module 148's empty-section floor covered SKILLS only; a
//     punctuation-only EXPERIENCE (or an entirely empty EDUCATION)
//     section passed parse-check. The floor is now every section.
//   MI-025 — the tailored document carried its gaps as packet data
//     but printed no eligibility VERDICT on the document itself. The
//     verdict line now prints in the document (Summary section), is
//     returned on the result, and names nothing unsupported — the
//     missing items stay in the gap list.
//   MI-026 — the historical poison: one persona fact with empty
//     evidence (a bare skill fact) once refused the WHOLE tailoring.
//     BUG-211's proof rule closed the mechanism; these cases pin the
//     behavior so the class cannot reopen: the run ships, the bare
//     skill is a named gap, and the skill is never claimed.
// Check: node --test tests/career-tailor-depth3.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const Tailor = require(path.join(ROOT, "packages/domain/123-career-tailor.js"));
const Render = require(path.join(ROOT, "packages/domain/148-career-render.js"));

/* ---------------- MI-024: every section has a floor ---------------- */

test("MI-024: a punctuation-only EXPERIENCE section fails parse-check", () => {
  const resume = { header: { name: "Test Person" }, sections: [{ heading: "Experience", lines: [{ text: "— , ·", type: "bullet", factIds: [] }] }], lines: [] };
  const pc = Render.parseCheck({ resume });
  assert.equal(pc.status, "FAIL");
  assert.ok(pc.reasons.some((r) => r.check === "empty_section" && /EXPERIENCE/.test(r.detail)), JSON.stringify(pc.reasons));
});

test("MI-024: a heading-only EDUCATION section fails parse-check", () => {
  const resume = { header: { name: "Test Person" }, sections: [{ heading: "Education", lines: [] }], lines: [] };
  const pc = Render.parseCheck({ resume });
  assert.ok(pc.reasons.some((r) => r.check === "empty_section" && /EDUCATION/.test(r.detail)), JSON.stringify(pc.reasons));
});

test("MI-024: the SKILLS floor keeps its BUG-210 check name", () => {
  const resume = { header: { name: "Test Person" }, sections: [{ heading: "Skills", lines: [{ text: ", ,", type: "skills", factIds: [] }] }], lines: [] };
  const pc = Render.parseCheck({ resume });
  assert.ok(pc.reasons.some((r) => r.check === "empty_skills_section"), JSON.stringify(pc.reasons));
});

test("MI-024: a section with real content does not trip the floor", () => {
  const resume = { header: { name: "Test Person" }, sections: [{ heading: "Experience", lines: [{ text: "Analyst at Acme, 2023 — built reports.", type: "entry", factIds: ["F-001"] }] }], lines: [] };
  const pc = Render.parseCheck({ resume });
  assert.ok(!pc.reasons.some((r) => r.check === "empty_section" || r.check === "empty_skills_section"), JSON.stringify(pc.reasons));
});

/* ---------------- MI-025: the printed eligibility verdict ---------------- */

const RICH = {
  basics: { name: "Test Person" }, level: "early",
  facts: [
    { id: "F-001", kind: "experience", title: "Data Analyst, Acme", org: "Acme", text: "Data Analyst at Acme. Builds dashboards in SQL and Python for finance reporting.", bullets: ["Automated reporting in SQL"], skills: ["SQL", "Python"], start: "2023-01", end: "present" },
    { id: "F-002", kind: "education", title: "B.S. Computer Science", org: "State University", text: "B.S. Computer Science, State University, 2022.", skills: [] },
  ],
};

test("MI-025: a fully-covered posting prints the eligible verdict on the document", () => {
  const out = Tailor.tailorResume(RICH, "Data Analyst role. Requirements: SQL, Python.", {});
  assert.equal(out.ok, true);
  assert.equal(out.eligibilityVerdict.status, "eligible");
  assert.match(out.rendered.text, /Eligibility verdict: this record evidences every hard requirement/);
  const allLines = out.resume.sections.flatMap((s) => s.lines || []);
  assert.ok(allLines.some((l) => l.text === out.eligibilityVerdict.line));
  const lastSec = out.resume.sections[out.resume.sections.length - 1];
  assert.ok(lastSec.lines.some((l) => l.text === out.eligibilityVerdict.line), "verdict rides as the closing line of the last section");
});

test("MI-025: a required-skill gap prints the with-gaps verdict and names nothing missing", () => {
  const out = Tailor.tailorResume(RICH, "Data Analyst role. Requirements: SQL, Rust.", {});
  assert.equal(out.ok, true);
  assert.equal(out.eligibilityVerdict.status, "eligible_with_required_gaps");
  assert.match(out.rendered.text, /Eligibility verdict: this record meets the posting's hard requirements/);
  assert.doesNotMatch(out.eligibilityVerdict.line, /Rust/); // gaps are named in the gap list, never inside the verdict line
  assert.ok(out.gaps.some((g) => g.requirement === "Rust"));
});

test("MI-025: a failed knockout prints the not-eligible verdict", () => {
  const out = Tailor.tailorResume(RICH, "Registered Nurse role. Requirements: SQL. Candidates must hold a current RN license.", {});
  assert.equal(out.ok, true);
  assert.equal(out.eligibilityVerdict.status, "not_eligible");
  assert.match(out.rendered.text, /Eligibility verdict: this record does not meet every hard requirement/);
  assert.doesNotMatch(out.eligibilityVerdict.line, /RN license/);
});

/* ---------------- MI-026: the empty-evidence poison ---------------- */

test("MI-026: a bare skill fact with empty evidence cannot poison the run — it ships, the skill is a gap, never a claim", () => {
  const persona = {
    basics: { name: "Test Person" }, level: "early",
    facts: [
      ...RICH.facts,
      { id: "F-009", kind: "skill", name: "Rust", text: "Skill: Rust", skills: ["Rust"], evidence: [] },
    ],
  };
  const out = Tailor.tailorResume(persona, "Data Analyst role. Requirements: SQL, Python, Rust.", {});
  assert.equal(out.ok, true, `run refused: ${out.reason || ""} ${JSON.stringify(out.violations || [])}`);
  assert.equal(out.refused, undefined);
  assert.ok(out.gaps.some((g) => g.requirement === "Rust" && /empty evidence/.test(g.reason)), JSON.stringify(out.gaps));
  assert.doesNotMatch(out.rendered.text.split("Eligibility verdict")[0], /\bRust\b/); // never claimed on the page
});

test("MI-026: a persona whose only fact is a bare skill claim still ships an honest document (no wholesale refusal)", () => {
  const persona = { basics: { name: "Thin Person" }, level: "early", facts: [{ id: "F-001", kind: "skill", name: "Rust", text: "Skill: Rust", skills: ["Rust"], evidence: [] }] };
  const out = Tailor.tailorResume(persona, "Engineer role. Requirements: Rust.", {});
  assert.equal(out.ok, true, `run refused: ${out.reason || ""}`);
  assert.ok(out.eligibilityVerdict && out.eligibilityVerdict.status !== "eligible");
  assert.doesNotMatch(out.rendered.text.split("Eligibility verdict")[0], /\bRust\b/);
});
