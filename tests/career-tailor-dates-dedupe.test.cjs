/* BUG-2026-10-14-NDER — tailored-document render QA guard (bug law: permanent).
   FAIL-FIRST: written against the pre-fix tree, where module 123's assembler
   (a) dropped fact.start/fact.end, so tailored entry lines carried NO dates,
   (b) emitted the same bullet once per fact that carried it, so a line two
   facts share rendered twice, and (c) never bucketed kind:"certification"
   facts at all, so selected certifications appeared in no document.
   Measured on the owner's real batch-001 packets by the human-sounding lane
   (HS-10/HS-11, brief B6) and independently by the four-vertical battery
   (FV-6). Fixtures here are synthetic TEST data + the repo TEST personas
   only — never the owner's real fact bank. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Profile = require("../packages/domain/122-career-profile.js");
const Tailor = require("../packages/domain/123-career-tailor.js");
const Render = require("../packages/domain/148-career-render.js");

const fixtureDir = path.join(__dirname, "..", "packages", "career-data", "fixtures");
const loadPersona = (name) => Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8")));

const IB_JD = `Investment Banking Summer Analyst (TEST posting)
Required: Excel, Financial Modeling, Valuation.
You will build DCF models and support deal teams.`;

const yearOf = (v) => { const m = String(v == null ? "" : v).match(/\d{4}/); return m ? m[0] : null; };

// ---------- 1. dates: every dated fact's entry carries its range ----------
test("dated facts render their date range on entry lines (123 assemble)", () => {
  const p = loadPersona("test-persona.json");
  const r = Tailor.tailorResume(p, IB_JD, { family: "ib_finance", jobId: "GUARD-DATES-1", date: "2026-10-14" });
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  const entries = r.resume.lines.filter((l) => l.type === "entry");
  assert.ok(entries.length >= 4, "fixture should yield several entries");
  for (const l of entries) {
    const fact = Profile.getFact(p, (l.factIds || [])[0]);
    if (!fact || (!fact.start && !fact.end)) continue;
    const sy = yearOf(fact.start), ey = yearOf(fact.end);
    if (sy) assert.ok(l.text.includes(sy), `entry "${l.text}" drops start year ${sy} from fact ${fact.id}`);
    if (/^present$/i.test(String(fact.end || "").trim())) assert.match(l.text, /present/i, `entry "${l.text}" drops "Present" end from fact ${fact.id}`);
    else if (ey && ey !== sy) assert.ok(l.text.includes(ey), `entry "${l.text}" drops end year ${ey} from fact ${fact.id}`);
  }
  // the three shapes the owner's packets got wrong, pinned on the fixture:
  const byFact = (id) => entries.find((l) => (l.factIds || [])[0] === id);
  assert.match(byFact("F-006").text, /2024/, "2024-06..2024-08 fact must show its year");
  assert.match(byFact("F-002").text, /2025/, "2025-06..2025-08 fact must show its year");
  assert.match(byFact("F-001").text, /2028/, "end-only education fact must show its graduation year");
  assert.match(r.rendered.text, /2024/, "rendered text must carry the dates, not just the JSON");
});

// ---------- 2. dedupe + certifications on an owner-shaped synthetic profile ----------
const SHARED_LINE = "Involvement/Courses: TEST Finance Club, TEST Investing Club";
function ownerShapedProfile() {
  return Profile.profileFromData({
    basics: { name: "Test Owner (TEST)", email: "test.owner@example.test", location: "Chicago, IL (TEST)", links: {} },
    facts: [
      { id: "F-001", kind: "education", title: "B.S. Finance, TEST University", start: "2025", end: "2029", text: "B.S. Finance at TEST University, 2025 - 2029. GPA: 3.9/ 4.0.", bullets: [SHARED_LINE, "GPA: 3.9/ 4.0"], skills: [], evidence: [], status: "confirmed" },
      { id: "F-002", kind: "experience", title: "Founder, TEST Ventures", start: "2025", end: "present", text: "Founder of TEST Ventures, 2025-Present. Built a Python screening tool used by 40 test users.", bullets: ["Built a Python screening tool used by 40 test users.", "Ran weekly reviews with 6 test mentors."], skills: ["Python"], evidence: [], status: "confirmed" },
      { id: "F-006", kind: "leadership", title: "TEST involvement: Finance Club, Investing Club", text: "TEST involvement: Finance Club, Investing Club.", bullets: [SHARED_LINE], skills: [], evidence: [], status: "confirmed" },
      { id: "F-007", kind: "certification", title: "TEST Prep – Financial Modeling Certificate", text: "TEST Prep – Financial Modeling Certificate.", bullets: ["Licenses & Certifications: TEST Prep – Financial Modeling Certificate"], skills: [], evidence: [], status: "confirmed" },
      { id: "F-010", kind: "skill", name: "Python", title: "Python", text: "Skill: Python", skills: ["Python"], evidence: ["F-002"], status: "confirmed" },
    ],
  });
}

test("a bullet two facts carry renders ONCE, and the drop is recorded (123 assemble)", () => {
  const p = ownerShapedProfile();
  const r = Tailor.tailorResume(p, "Finance Analyst Intern (TEST). Required: Python.", { family: "ib_finance", jobId: "GUARD-DEDUPE-1", date: "2026-10-14", baseLines: [
    { text: "Founder, TEST Ventures", factIds: ["F-002"], type: "entry" },
    { text: "Built a Python screening tool used by 40 test users.", factIds: ["F-002"], type: "bullet" },
  ] });
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  const hits = r.resume.lines.filter((l) => l.text === SHARED_LINE);
  assert.equal(hits.length, 1, `shared line rendered ${hits.length} times: ${JSON.stringify(r.resume.lines.map((l) => l.text))}`);
  assert.equal(hits[0].section, "Education", "first occurrence (Education) is the one kept");
  assert.ok(Array.isArray(r.resume.deduped) && r.resume.deduped.length === 1, "the drop must be recorded on the resume for the packet ledger");
  assert.equal(r.resume.deduped[0].droppedFrom, "Leadership");
  // dates ride along on the same assembly pass
  const edu = r.resume.lines.find((l) => l.type === "entry" && (l.factIds || [])[0] === "F-001");
  assert.match(edu.text, /2025/); assert.match(edu.text, /2029/);
  const exp = r.resume.lines.find((l) => l.type === "entry" && (l.factIds || [])[0] === "F-002");
  assert.match(exp.text, /2025/); assert.match(exp.text, /Present/);
  // diff honesty: a dated re-issue of a base entry is a move, not add+remove
  const diffTexts = (r.diff.added || []).map((x) => x.text);
  assert.ok(!diffTexts.includes(exp.text), "dated entry must not be reported as newly added content");
  assert.ok(!(r.diff.removed || []).some((x) => x.text === "Founder, TEST Ventures"), "the undated base entry must not be reported as removed");
  // and the whole document still passes the (extended) parse-check
  assert.equal(r.rendered.parseCheck.status, "PASS", JSON.stringify(r.rendered.parseCheck.reasons));
});

test("certification facts render as a Certifications section, title lines only (123 assemble)", () => {
  const p = ownerShapedProfile();
  const r = Tailor.tailorResume(p, "Finance Analyst Intern (TEST). Required: Python.", { family: "ib_finance", jobId: "GUARD-CERT-1", date: "2026-10-14" });
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  const cert = (r.resume.sections || []).find((s) => s.heading === "Certifications");
  assert.ok(cert, "no Certifications section was assembled although F-007 was selected");
  assert.ok(cert.lines.some((l) => l.text === "TEST Prep – Financial Modeling Certificate"), "cert title line missing");
  assert.ok(!r.resume.lines.some((l) => /^Licenses & Certifications:/.test(l.text)), "the fact's restated bullet must not duplicate its own title line");
  assert.match(r.rendered.text, /CERTIFICATIONS/);
});

// ---------- 3. parse-check enforcement (148): duplicates + dropped dates FAIL ----------
function handResume(lines) {
  return {
    header: { name: "Test Person (TEST)", email: "test.person@example.test", location: "Chicago, IL (TEST)", links: {} },
    sections: [{ heading: "Experience", lines }],
    lines: lines.map((l) => ({ ...l, section: "Experience" })),
  };
}
const DATED_PROFILE = { facts: [{ id: "F-100", kind: "experience", title: "Intern, TEST Capital", start: "2024", end: "2025", text: "Intern at TEST Capital.", bullets: [], skills: [], evidence: [] }] };

test("parse-check FAILs a document whose lines duplicate (148)", () => {
  const resume = handResume([
    { text: "Intern, TEST Capital, 2024–2025", type: "entry", factIds: ["F-100"] },
    { text: "Built a model in Excel.", type: "bullet", factIds: ["F-100"] },
    { text: "Built a model in Excel.", type: "bullet", factIds: ["F-100"] },
  ]);
  const pdf = Render.renderPdf(resume);
  assert.equal(pdf.ok, true);
  const pc = Render.parseCheck({ resume, pdf: pdf.buffer, profile: DATED_PROFILE });
  assert.equal(pc.status, "FAIL", JSON.stringify(pc.reasons));
  assert.ok(pc.reasons.some((x) => x.check === "duplicate_line"), "duplicate_line reason missing");
});

test("parse-check FAILs an entry that drops its fact's dates; the dated twin passes (148)", () => {
  const bare = handResume([{ text: "Intern, TEST Capital", type: "entry", factIds: ["F-100"] }]);
  const pcBare = Render.parseCheck({ resume: bare, pdf: Render.renderPdf(bare).buffer, profile: DATED_PROFILE });
  assert.equal(pcBare.status, "FAIL", JSON.stringify(pcBare.reasons));
  assert.ok(pcBare.reasons.some((x) => x.check === "missing_dates"), "missing_dates reason missing");
  const dated = handResume([{ text: "Intern, TEST Capital, 2024–2025", type: "entry", factIds: ["F-100"] }]);
  const pcDated = Render.parseCheck({ resume: dated, pdf: Render.renderPdf(dated).buffer, profile: DATED_PROFILE });
  assert.ok(!pcDated.reasons.some((x) => x.check === "missing_dates"), JSON.stringify(pcDated.reasons));
});

// ---------- 4. regulated-field credentials survive tailoring (FV-6 mirror) ----------
test("nursing + law persona credentials render verbatim (certifications bucket)", () => {
  const maya = loadPersona("persona-medicine-nursing.json");
  const r1 = Tailor.tailorResume(maya, "Patient Care Technician (TEST posting). Required: Patient Care, Vital Signs.", { jobId: "GUARD-CERT-2", date: "2026-10-14" });
  assert.equal(r1.ok, true, JSON.stringify(r1.violations || []));
  assert.match(r1.rendered.text, /Certified Nursing Assistant \(CNA\)/);
  assert.match(r1.rendered.text, /Illinois Nurse Aide Registry/);
  assert.match(r1.rendered.text, /Basic Life Support \(BLS\) Provider/);
  const riley = loadPersona("persona-law-prelaw.json");
  const r2 = Tailor.tailorResume(riley, "Legal Assistant (TEST posting). Required: Legal Research.", { jobId: "GUARD-CERT-3", date: "2026-10-14" });
  assert.equal(r2.ok, true, JSON.stringify(r2.violations || []));
  assert.match(r2.rendered.text, /Paralegal Studies Certificate \(in progress\)/);
});
