/* 148 CONTENT FLOOR (Crew B Cycle 2, W3) — parse-check must FAIL a
   present-but-contentless SKILLS section in every document shape:
   empty body, punctuation-only body, a "Technical skills:" label with
   nothing after it, and the lines-form resume (no sections array).
   Lane B's recorded defect was 307/475 Skills sections empty or
   punctuation-only while parse-check returned PASS; the BUG-210
   source-level check closed the sections-form case — these guards pin
   the floor across all the shapes 148 accepts, plus the honest shapes
   (no SKILLS section at all; a real skills body) which must NOT fail
   on this check. TEST fixtures only. */
const test = require("node:test");
const assert = require("node:assert/strict");
const Render = require("../packages/domain/148-career-render.js");

const head = { name: "Casey Testcase", email: "casey@example.test", location: "Chicago, IL", links: {} };
const expLines = [
  { text: "Software Engineer, TEST Co, 2024–2025", factIds: ["F-001"], type: "entry" },
  { text: "Built data pipelines in Python", factIds: ["F-001"], type: "bullet" },
];
function check(resume) {
  const pdf = Render.renderPdf(resume), docx = Render.renderDocx(resume);
  assert.ok(pdf.ok && docx.ok, "fixture resume must render");
  return Render.parseCheck({ resume, pdf: pdf.buffer, docx: docx.buffer });
}
const failsOnSkills = (pc) => pc.status === "FAIL" && pc.reasons.some((x) => x.check === "empty_skills_section" && x.level === "fail");

test("148 floor: SKILLS section with ZERO lines fails parse-check", () => {
  const resume = { header: head, sections: [
    { heading: "Skills", lines: [] },
    { heading: "Experience", lines: expLines },
  ], lines: [] };
  resume.lines = resume.sections.flatMap((s) => s.lines.map((l) => ({ ...l, section: s.heading })));
  assert.ok(failsOnSkills(check(resume)), "an empty SKILLS section must FAIL");
});

test("148 floor: punctuation-only SKILLS body fails parse-check (sections form)", () => {
  const resume = { header: head, sections: [
    { heading: "Skills", lines: [{ text: ", , ", factIds: ["F-001"], type: "skills" }] },
    { heading: "Experience", lines: expLines },
  ], lines: [] };
  resume.lines = resume.sections.flatMap((s) => s.lines.map((l) => ({ ...l, section: s.heading })));
  assert.ok(failsOnSkills(check(resume)), "a punctuation-only SKILLS body must FAIL");
});

test("148 floor: 'Technical skills:' label with no skills after it fails parse-check", () => {
  const resume = { header: head, sections: [
    { heading: "Skills", lines: [{ text: "Technical skills: ", factIds: ["F-001"], type: "skills" }] },
    { heading: "Experience", lines: expLines },
  ], lines: [] };
  resume.lines = resume.sections.flatMap((s) => s.lines.map((l) => ({ ...l, section: s.heading })));
  assert.ok(failsOnSkills(check(resume)), "a label-only SKILLS body must FAIL");
});

test("148 floor: punctuation-only SKILLS body fails parse-check in the LINES form (no sections array)", () => {
  const resume = { header: head, sections: [], lines: [
    { text: ", , ", factIds: ["F-001"], type: "skills", section: "Skills" },
    ...expLines.map((l) => ({ ...l, section: "Experience" })),
  ] };
  const pc = check(resume);
  assert.ok(failsOnSkills(pc), `lines-form empty SKILLS must FAIL: ${JSON.stringify(pc.reasons)}`);
});

test("148 floor: honest shapes do not fail on the skills check — no SKILLS section, and a real skills body", () => {
  const noSkills = { header: head, sections: [{ heading: "Experience", lines: expLines }], lines: [] };
  noSkills.lines = expLines.map((l) => ({ ...l, section: "Experience" }));
  const pc1 = check(noSkills);
  assert.ok(!pc1.reasons.some((x) => x.check === "empty_skills_section"), "no SKILLS section at all is honest — no empty_skills_section failure");
  const real = { header: head, sections: [
    { heading: "Skills", lines: [{ text: "Python, SQL", factIds: ["F-001"], type: "skills" }] },
    { heading: "Experience", lines: expLines },
  ], lines: [] };
  real.lines = real.sections.flatMap((s) => s.lines.map((l) => ({ ...l, section: s.heading })));
  const pc2 = check(real);
  assert.equal(pc2.status, "PASS", JSON.stringify(pc2.reasons));
});
