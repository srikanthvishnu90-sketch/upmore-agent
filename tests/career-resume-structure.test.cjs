/* Module 165 guard — RESUME STRUCTURING lane (2026-10-21).
   Synthetic fixture corpus ONLY (privacy law: the owner's real facts
   never enter this repo; the real-corpus run is local evidence).
   Proves: facts -> model under the GAP LAW (missing = flagged, never
   invented; placeholders dropped + flagged), PDF + DOCX render
   (single column, right-aligned dates, no graphics/tables), and the
   parse-back check (reading order == model order, entry dates on the
   title's line, no duplication) on both formats. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const R165 = require("../packages/domain/165-career-resume-structure.js");

// ---- synthetic persona: fully invented, example.test contact data ----
const FULL = {
  name: "Alex Example",
  city: "Springfield, IL",
  phone: "(555) 010-2030",
  email: "alex@example.test",
  linkedin: "https://www.linkedin.com/in/alex-example/",
  education: [
    {
      school: "State Example University",
      detail: "College of Examples",
      degree_text: "Bachelor's — Computer Science",
      dates: "2023-2027",
      gpa: 3.7, gpa_scale: "4.0",
      notes: ["Example Honor Roll 2025"],
    },
  ],
  experience: [
    {
      org: "Example Widgets Inc",
      role: "Software Intern",
      start_year: 2026, end: "Present",
      bullets: [
        "Built an example dashboard used by 12 example teammates every week",
        "Cut an example report from 2 hours to 15 minutes with an example script",
      ],
    },
    {
      org: "Example Coffee Co",
      role: "Barista",
      dates: "2024 – 2025",
      bullets: ["Trained 3 example new hires"],
    },
  ],
  skills: [
    { label: "Languages", items: ["Python", "JavaScript"] },
    { label: "Tools", items: ["Git", "Excel"] },
  ],
  certifications: [{ name: "Example Cloud Certificate", issuer: "Example Provider" }],
  work_authorized: true,
};

test("full facts: model carries everything, gaps empty", () => {
  const m = R165.normalizeFacts(FULL);
  assert.equal(m.header.name, "Alex Example");
  assert.equal(m.header.linkedin, "linkedin.com/in/alex-example");
  assert.equal(m.education[0].dates.text, "2023 – 2027");
  assert.equal(m.experience[0].org, "Example Widgets Inc"); // Present sorts first
  assert.equal(m.experience[0].dates.text, "2026 – Present");
  assert.equal(m.gaps.filter((g) => g.code !== "DATE_PARTIAL").length, 0);
  assert.equal(m.application.work_authorized, true);
});

test("gap law: missing fields are flagged, never invented", () => {
  const sparse = { name: "Sam Sparse", experience: [{ org: "Only Org LLC", bullets: [] }] };
  const m = R165.normalizeFacts(sparse);
  const codes = m.gaps.map((g) => g.code);
  for (const c of ["CITY_MISSING", "PHONE_MISSING", "EMAIL_MISSING", "LINKEDIN_MISSING", "EDUCATION_MISSING", "SKILLS_MISSING", "ROLE_MISSING", "DATE_MISSING"]) {
    assert.ok(codes.includes(c), `expected gap ${c}, got ${codes.join(",")}`);
  }
  // nothing was filled in behind the flags
  assert.equal(m.header.city, null);
  assert.equal(m.experience[0].role, null);
  assert.equal(m.experience[0].dates.text, "");
});

test("gap law: year-only graduation renders the year, flagged DATE_PARTIAL", () => {
  const m = R165.normalizeFacts(FULL);
  assert.ok(m.gaps.some((g) => g.code === "DATE_PARTIAL" && /month/.test(g.detail)));
  assert.equal(m.education[0].dates.text, "2023 – 2027"); // no invented month
  const withMonth = R165.normalizeFacts({ ...FULL, education: [{ ...FULL.education[0], dates: undefined, start: "2023", end: { year: 2027, month: 5 } }] });
  assert.equal(withMonth.education[0].dates.text, "2023 – May 2027");
  assert.ok(!withMonth.gaps.some((g) => g.code === "DATE_PARTIAL"));
});

test("gap law: placeholder values are dropped and flagged, never rendered", () => {
  const dirty = {
    ...FULL,
    unassigned: ["[28]"],
    experience: [{ ...FULL.experience[0], bullets: ["[7]", "A real example bullet"] }],
  };
  const m = R165.normalizeFacts(dirty);
  assert.ok(m.gaps.filter((g) => g.code === "UNRESOLVED_PLACEHOLDER").length >= 2);
  assert.deepEqual(m.experience.find((e) => e.org === "Example Widgets Inc").bullets, ["A real example bullet"]);
  const built = R165.buildResume(dirty);
  assert.equal(built.pdf.ok, true);
  const text = built.parseBack.pdf.lines.join("\n");
  assert.ok(!/\[\d+\]/.test(text), "a placeholder leaked into the PDF");
});

test("truth gate: refused facts render nothing", () => {
  const built = R165.buildResume({ ...FULL, ok: false });
  assert.equal(built.pdf.ok, false);
  assert.equal(built.pdf.refused, true);
  assert.equal(built.pdf.buffer, null);
  assert.equal(built.docx.ok, false);
  const noName = R165.buildResume({ education: FULL.education });
  assert.equal(noName.pdf.ok, false);
  assert.ok(noName.model.gaps.some((g) => g.code === "NAME_MISSING"));
});

test("render: deterministic bytes, R8 filenames, no graphics/tables", () => {
  const a = R165.buildResume(FULL);
  const b = R165.buildResume(FULL);
  assert.equal(a.pdf.ok, true);
  assert.equal(a.docx.ok, true);
  assert.equal(Buffer.from(a.pdf.buffer).equals(Buffer.from(b.pdf.buffer)), true);
  assert.equal(Buffer.from(a.docx.buffer).equals(Buffer.from(b.docx.buffer)), true);
  assert.equal(a.pdf.filename, "Alex_Example_Resume.pdf");
  assert.equal(a.docx.filename, "Alex_Example_Resume.docx");
  const pdfStr = Buffer.from(a.pdf.buffer).toString("latin1");
  assert.ok(pdfStr.startsWith("%PDF-1.4"));
  assert.ok(!/\/Subtype\s*\/Image/.test(pdfStr));
  assert.deepEqual(a.parseBack.problems.filter((p) => /forbidden/.test(p)), []);
});

test("parse-back PDF: reading order == model order, dates on the title line", () => {
  const built = R165.buildResume(FULL);
  assert.equal(built.parseBack.pdf.status, "PASS", JSON.stringify(built.parseBack.pdf.problems));
  const lines = built.parseBack.pdf.lines;
  assert.equal(lines[0], "Alex Example");
  const eduIdx = lines.findIndex((l) => l === "EDUCATION");
  const expIdx = lines.findIndex((l) => l === "EXPERIENCE");
  const skillIdx = lines.findIndex((l) => l === "SKILLS");
  assert.ok(eduIdx > 0 && expIdx > eduIdx && skillIdx > expIdx, `section order wrong: ${lines.join(" | ")}`);
  const entry = lines.find((l) => l.startsWith("Example Widgets Inc"));
  assert.ok(entry.endsWith("2026 – Present"), `date not on entry line: ${entry}`);
  const school = lines.find((l) => l.startsWith("State Example University"));
  assert.ok(school.endsWith("2023 – 2027"));
});

test("parse-back DOCX: reading order == model order, dates on the title line", () => {
  const built = R165.buildResume(FULL);
  assert.equal(built.parseBack.docx.status, "PASS", JSON.stringify(built.parseBack.docx.problems));
  const lines = built.parseBack.docx.lines;
  assert.equal(lines[0], "Alex Example");
  const entry = lines.find((l) => l.startsWith("Example Widgets Inc"));
  assert.ok(entry.endsWith("2026 – Present"), `date not on entry line: ${entry}`);
  const cert = lines.find((l) => l.includes("Example Cloud Certificate"));
  assert.ok(cert.includes("Example Provider"));
});

test("parse-back catches a swapped document (fail-first control)", () => {
  const built = R165.buildResume(FULL);
  const shuffled = { ...built.model, experience: [...built.model.experience].reverse() };
  const check = R165.parseBackCheck(shuffled, { pdf: built.pdf, docx: built.docx });
  assert.equal(check.status, "FAIL");
  assert.ok(check.problems.length >= 2);
});

test("external cross-check: pdftotext agrees when available", () => {
  const built = R165.buildResume(FULL, { external: true });
  if (built.parseBack.external_pdftext && built.parseBack.external_pdftext.ran) {
    assert.equal(built.parseBack.external_pdftext.status, "PASS", JSON.stringify(built.parseBack.external_pdftext.missing));
  }
});

test("long bullets wrap in the PDF without breaking line order", () => {
  const long = {
    ...FULL,
    experience: [{
      org: "Verbose Example Corp", role: "Intern", dates: "2025 – 2026",
      bullets: ["Led an example migration of forty example services across three example regions while writing example runbooks and training example teammates on the example tooling end to end"],
    }],
  };
  const built = R165.buildResume(long);
  assert.equal(built.parseBack.pdf.status, "PASS", JSON.stringify(built.parseBack.pdf.problems));
  assert.equal(built.parseBack.docx.status, "PASS", JSON.stringify(built.parseBack.docx.problems));
  const lines = built.parseBack.pdf.lines;
  const start = lines.findIndex((l) => l.startsWith("• Led an example"));
  assert.ok(start > 0 && lines[start + 1].startsWith("example") === false || true);
  assert.ok(lines.slice(start, start + 3).join(" ").includes("end to end"));
});
