/* BUG-208..212 / FR-365..369 — depth-wave guards (fail-first).
   TEST fixtures only — synthetic personas + fictional postings, inline.
   Pins: (a) uncovered requirements are named as gaps in the result object
   AND in the document model (packet gap section) — silence is the defect;
   (b) failed knockouts and seniority-band mismatches are stated, never
   silently dropped; (c) evidenced skill facts reach the page by name and
   module 148's parse-check FAILS a present-but-empty SKILLS section;
   (d) a bare skill fact with empty evidence is not proven — it is excluded
   from the page, named as a gap, and never poisons the resume into a
   wrongful refusal. */
const test = require("node:test");
const assert = require("node:assert/strict");
const Tailor = require("../packages/domain/123-career-tailor.js");
const Render = require("../packages/domain/148-career-render.js");

function baseProfile(facts, extra) {
  return Object.assign({
    basics: { name: "Casey Testcase (TEST)", email: "casey@example.test", location: "Chicago, IL (TEST)", links: {} },
    constraints: {}, defaults: {}, preferences: {},
    facts,
  }, extra || {});
}
const expFact = {
  id: "F-001", kind: "experience", title: "Software Engineer, TEST Co", org: "TEST Co",
  start: "2024-06", end: "2025-08", needs_confirmation: false, evidence: [],
  skills: ["Python", "SQL"],
  text: "Software Engineer at TEST Co. Built data pipelines in Python and SQL for 40 internal users.",
  bullets: ["Built data pipelines in Python and SQL for 40 internal users"],
};

test("BUG-208 (a): zero-satisfiable pairing ships with named gaps in result + document model, claiming nothing", () => {
  const p = baseProfile([expFact]);
  const r = Tailor.tailorResume(p, "Platform Engineer (TEST posting)\nRequired: Terraform, Rust.\nYou will own infrastructure as code.", {});
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  assert.ok(Array.isArray(r.gaps), "result must carry gaps as real data");
  const names = r.gaps.map((g) => g.requirement);
  assert.ok(names.includes("Terraform"), `Terraform gap missing: ${JSON.stringify(names)}`);
  assert.ok(names.includes("Rust"), `Rust gap missing: ${JSON.stringify(names)}`);
  assert.ok(r.gaps.every((g) => g.reasonClass && g.reason), "every gap carries a reason class + reason");
  // The lane runner copies `version` into the graded result blob — the gap
  // flag must ride there too.
  assert.ok(r.version && Array.isArray(r.version.gaps) && r.version.gaps.length >= 2, "version snapshot must carry the gaps");
  assert.match(JSON.stringify(r.version).toLowerCase(), /gap/);
  // Document model (the packet) names them too.
  assert.ok(r.resume.gaps && r.resume.gaps.length >= 2, "document model must carry gaps");
  assert.ok(r.resume.gapSection && /Terraform/.test(r.resume.gapSection.text) && /Rust/.test(r.resume.gapSection.text),
    `gap section must name the items: ${JSON.stringify(r.resume.gapSection)}`);
  assert.ok(r.rendered && /Terraform/.test(r.rendered.gapsText || ""), "rendered packet must name the gaps");
  // ...while the resume body claims neither skill.
  const body = r.resume.lines.map((l) => l.text).join("\n");
  assert.ok(!Tailor.skillsInText(body).includes("Terraform"), "gap item must not be claimed in the body");
  assert.ok(!Tailor.skillsInText(body).includes("Rust"), "gap item must not be claimed in the body");
});

test("BUG-209 (b): a failed license knockout is stated as a gap, never silently dropped", () => {
  const p = baseProfile([
    { id: "F-001", kind: "certification", title: "Basic Life Support (BLS) Provider — TEST", org: "TEST", needs_confirmation: false, evidence: [], skills: ["BLS"], text: "Basic Life Support (BLS) Provider certification, stated exactly as issued (TEST fixture).", bullets: [] },
    { id: "F-002", kind: "experience", title: "Certified Nursing Assistant, TEST Medical Center", org: "TEST Medical Center", start: "2025-01", end: "2026-05", needs_confirmation: false, evidence: [], skills: ["Patient Care", "BLS"], text: "Certified Nursing Assistant at TEST Medical Center. Recorded vital signs for 12 patients per shift.", bullets: ["Recorded vital signs for 12 patients per shift"] },
  ]);
  const jd = "Pediatric Registered Nurse (TEST posting)\nRequirements: active RN License required (knockout); BLS required; patient care experience in pediatrics.";
  const r = Tailor.tailorResume(p, jd, {});
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  const ko = (r.gaps || []).find((g) => g.reasonClass === "knockout-failed" && /rn license/i.test(g.requirement));
  assert.ok(ko, `RN license knockout must be a stated gap: ${JSON.stringify(r.gaps)}`);
  assert.ok(r.resume.gapSection && /rn license/i.test(r.resume.gapSection.text), "document gap section must state the knockout");
});

test("BUG-209 (b): intern-level record vs a senior-band posting is named as a level gap", () => {
  const p = baseProfile([expFact], { level: "intern" });
  const r = Tailor.tailorResume(p, "Senior Software Engineer (TEST posting)\nRequired: Python.\nYou will lead design reviews.", {});
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  const lv = (r.gaps || []).find((g) => g.kind === "level");
  assert.ok(lv, `level mismatch must be named: ${JSON.stringify(r.gaps)}`);
  assert.match(lv.reason, /senior/i);
  assert.match(lv.reason, /intern/i);
});

test("BUG-210 (c source): nameless evidenced skill facts reach the page by name — no ', , ' body", () => {
  const p = baseProfile([
    expFact,
    { id: "F-002", kind: "skill", text: "Skill: Tableau", needs_confirmation: false, evidence: ["F-001"] },
    { id: "F-003", kind: "skill", title: "SQL", text: "Skill: SQL", needs_confirmation: false, evidence: ["F-001"], skills: ["SQL"] },
  ]);
  const r = Tailor.tailorResume(p, "Data Analyst (TEST posting)\nRequired: Python, Tableau.\nYou will build dashboards.", {});
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  const skills = r.resume.lines.find((l) => l.type === "skills");
  assert.ok(skills, "a SKILLS line must exist when proven skills exist");
  assert.match(skills.text, /Tableau/);
  assert.ok(!/,\s*,/.test(skills.text), `skills body must not contain empty entries: "${skills.text}"`);
  assert.ok(!/,\s*,/.test(r.rendered.text), "rendered document must not contain ', ,'");
});

test("BUG-210 (c enforcement): parse-check FAILS a present-but-empty SKILLS section, PASSes a real one", () => {
  const head = { name: "Casey Testcase", email: "casey@example.test", location: "Chicago, IL", links: {} };
  const emptyResume = { header: head, sections: [
    { heading: "Skills", lines: [{ text: ", , ", factIds: ["F-001"], type: "skills" }] },
    { heading: "Experience", lines: [{ text: "Software Engineer, TEST Co, 2024–2025", factIds: ["F-001"], type: "entry" }, { text: "Built data pipelines in Python", factIds: ["F-001"], type: "bullet" }] },
  ], lines: [] };
  emptyResume.lines = emptyResume.sections.flatMap((s) => s.lines.map((l) => ({ ...l, section: s.heading })));
  const pdfE = Render.renderPdf(emptyResume), docxE = Render.renderDocx(emptyResume);
  assert.ok(pdfE.ok && docxE.ok);
  const pcEmpty = Render.parseCheck({ resume: emptyResume, pdf: pdfE.buffer, docx: docxE.buffer });
  assert.equal(pcEmpty.status, "FAIL", `empty SKILLS must fail parse-check: ${JSON.stringify(pcEmpty.reasons)}`);
  assert.ok(pcEmpty.reasons.some((x) => x.level === "fail" && /skills/i.test(x.check + " " + x.detail)), JSON.stringify(pcEmpty.reasons));

  const realResume = { header: head, sections: [
    { heading: "Skills", lines: [{ text: "Python, SQL", factIds: ["F-001"], type: "skills" }] },
    { heading: "Experience", lines: [{ text: "Software Engineer, TEST Co, 2024–2025", factIds: ["F-001"], type: "entry" }, { text: "Built data pipelines in Python", factIds: ["F-001"], type: "bullet" }] },
  ], lines: [] };
  realResume.lines = realResume.sections.flatMap((s) => s.lines.map((l) => ({ ...l, section: s.heading })));
  const pdfR = Render.renderPdf(realResume), docxR = Render.renderDocx(realResume);
  const pcReal = Render.parseCheck({ resume: realResume, pdf: pdfR.buffer, docx: docxR.buffer });
  assert.equal(pcReal.status, "PASS", JSON.stringify(pcReal.reasons));
});

test("BUG-211 (d): the poisoned-fact persona produces a document — empty-evidence skill excluded, named as gap, no refusal", () => {
  const p = baseProfile([
    expFact,
    { id: "F-002", kind: "skill", name: "Python", title: "Python", text: "Skill: Python", skills: ["Python"], needs_confirmation: false, evidence: ["F-001"] },
    { id: "F-003", kind: "skill", name: "Rust", title: "Rust", text: "Skill: Rust", skills: ["Rust"], needs_confirmation: false, evidence: [] },
  ]);
  const r = Tailor.tailorResume(p, "Software Engineer (TEST posting)\nRequired: Python, Rust.\nYou will build services.", {});
  assert.equal(r.ok, true, `empty-evidence fact must not poison the resume into refusal: ${JSON.stringify(r.violations || [])}`);
  assert.ok(r.resume && r.rendered && r.rendered.pdf, "a document must be produced");
  const body = r.resume.lines.map((l) => l.text).join("\n");
  assert.match(body, /Python/);
  assert.ok(!Tailor.skillsInText(body).includes("Rust"), "the empty-evidence skill must be absent from the page");
  const gap = (r.gaps || []).find((g) => g.requirement === "Rust");
  assert.ok(gap, `Rust must be named as a gap: ${JSON.stringify(r.gaps)}`);
  assert.equal(gap.reasonClass, "no-evidence");
});

test("BUG-212 (e): the operative clause of a multi-clause experience fact reaches the page", () => {
  const p = baseProfile([
    { id: "F-001", kind: "experience", title: "Associate Attorney, TEST Corporate Law Firm", org: "TEST Corporate Law Firm", start: "2021-01", end: "2026-05", needs_confirmation: false, evidence: [], skills: ["Contract Review", "Legal Operations", "Legal Writing"],
      text: "Associate Attorney at TEST Corporate Law Firm since 2021. Drafts and negotiates commercial contracts, leads contract review for M&A diligence on 8 transactions, and manages legal operations for a 12-client portfolio.",
      bullets: ["Leads contract review for M&A diligence on 8 transactions", "Drafts and negotiates commercial contracts for a 12-client portfolio"] },
    { id: "F-002", kind: "education", title: "J.D., TEST Law School", org: "TEST Law School", start: "2017-09", end: "2020-05", needs_confirmation: false, evidence: [], skills: ["Legal Research", "Legal Writing"], text: "J.D. at TEST Law School, graduated May 2020.", bullets: [] },
  ]);
  const r = Tailor.tailorResume(p, "Legal Operations Associate (TEST posting)\nRequired: Legal Operations, Contract Review.\nYou will run legal operations.", {});
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  const body = r.resume.lines.map((l) => l.text).join("\n");
  assert.match(body, /manages legal operations for a 12-client portfolio/i, `operative clause must survive: ${body}`);
});
