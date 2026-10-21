/* Module 168 guard — COVER-LETTER FILL lane (2026-10-21).
   Synthetic fixture corpus ONLY (privacy law: the owner's real facts
   never enter this repo; the real-corpus run is local evidence).
   Proves: facts are read ONLY through the trusted-fact reader seam
   (module 167 contract — stub until 167 lands, labeled on the record);
   quarantined / unconfirmed facts cannot reach the letter (D-007);
   every fact-claiming sentence traces to cleared fact IDs and passes
   123's truth audit; uncovered skills/themes are GAP FLAGS, never
   claimed; length discipline drops whole sentences; PDF + DOCX render
   through 148 with a passing parse-check; an AI-ban posting degrades
   to an outline with no prose. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const CL = require("../packages/domain/168-career-cover-letter.js");
const Render = require("../packages/domain/148-career-render.js");

// ---- synthetic persona: fully invented, example.test contact data ----
const FULL = {
  basics: { name: "Alex Example", email: "alex@example.test", location: "Springfield, IL", links: { linkedin: "linkedin.com/in/alex-example" } },
  facts: [
    { id: "E1", kind: "education", title: "State Example University", text: "Bachelor's degree in Computer Science at State Example University, 2023 to 2027.", skills: [] },
    { id: "X1", kind: "experience", title: "Software Intern, Example Widgets Inc", text: "Built an internal dashboard in Python and React used by 12 teammates weekly, cutting report time from 2 hours to 15 minutes.", skills: ["Python", "React"] },
    { id: "X2", kind: "experience", title: "Data helper, Example Coffee Co", text: "Wrote SQL queries and a Python script that reconciled 4,000 example records for the operations team.", skills: ["SQL", "Python"] },
    { id: "S1", kind: "skill", name: "Python", text: "Python", evidence: ["X1", "X2"] },
  ],
};
const SWE_POSTING = { title: "Software Engineering Intern", company: "Example Systems Inc", skills: ["Python", "React", "SQL"], themes: ["internal tools"] };

test("full coverage: structured letter, three movements, audit clean, files render + parse-check PASS", () => {
  const r = CL.buildCoverLetter(FULL, SWE_POSTING);
  assert.equal(r.ok, true, JSON.stringify(r.gaps || []) + JSON.stringify(r.droppedByAudit || []));
  assert.equal(r.kind, "cover_letter");
  assert.ok(["injected", "module167", "stub167"].includes(r.readerSource), "reader source is labeled");
  assert.equal(r.clearedFactCount, 4);
  assert.equal(r.quarantinedFactCount, 0);
  // three movements populated, in order
  assert.ok(r.movements.fit.length >= 2, "fit: application + skills/education");
  assert.ok(r.movements.proof.length >= 1, "proof: at least one experience fact");
  assert.ok(r.movements.close.length >= 1, "close present");
  assert.equal(r.greeting, "Dear Example Systems Inc hiring team,");
  // every fact sentence traces to cleared fact ids, audit zero violations
  for (const s of r.sentences.filter((x) => x.source === "fact")) {
    assert.ok(s.factIds.length >= 1, `fact sentence without ids: ${s.text}`);
    assert.ok(s.factIds.every((id) => ["E1", "X1", "X2", "S1"].includes(id)));
  }
  assert.equal(r.audit.ok, true, JSON.stringify(r.audit.violations));
  assert.equal(r.audit.checked, r.sentences.filter((x) => x.source === "fact").length);
  // no gaps on a fully covered posting (timeline: posting is an internship
  // but E1's text gives years only -> TIMELINE_DETAIL is the one honest gap)
  assert.deepEqual(r.gaps.map((g) => g.code), ["TIMELINE_DETAIL"]);
  // length + paste text shape
  assert.ok(r.wordCount <= r.maxWords);
  assert.match(r.text, /^Alex Example\n/);
  assert.match(r.text, /Dear Example Systems Inc hiring team,/);
  assert.match(r.text, /Sincerely,\nAlex Example/);
  // files via 148
  assert.ok(r.files && r.files.pdf && r.files.docx, "PDF + DOCX artifacts");
  assert.equal(r.files.pdf.filename, "Alex_Example_Cover_Letter.pdf");
  assert.equal(r.files.docx.filename, "Alex_Example_Cover_Letter.docx");
  assert.equal(r.files.parseCheck.status, "PASS", JSON.stringify(r.files.parseCheck.reasons));
});

test("partial coverage: uncovered skill + theme are GAP FLAGS and never claimed", () => {
  const posting = { title: "Software Engineering Intern", company: "Example Systems Inc", skills: ["Python", "Kubernetes"], themes: ["payments infrastructure"] };
  const r = CL.buildCoverLetter(FULL, posting);
  assert.equal(r.ok, true);
  const codes = r.gaps.map((g) => g.code);
  assert.ok(codes.includes("UNCOVERED_SKILL") && r.gaps.find((g) => g.code === "UNCOVERED_SKILL").skill === "Kubernetes", JSON.stringify(r.gaps));
  assert.ok(codes.includes("UNCOVERED_THEME"), JSON.stringify(r.gaps));
  assert.ok(!/Kubernetes/.test(r.text), "the uncovered skill is never claimed");
  assert.ok(!/payments infrastructure/i.test(r.text), "the uncovered theme is never asserted");
  assert.match(r.text, /Python/, "the covered skill IS claimed");
});

test("D-007 quarantine proof (stub reader): marker strings in uncleared facts appear NOWHERE", () => {
  const MARK_A = "QUARANTINEMARKER-ALPHA-9911";
  const MARK_B = "QUARANTINEMARKER-BETA-9922";
  const p = {
    basics: { name: "Alex Example", email: "alex@example.test", location: "Springfield, IL", links: {} },
    facts: [
      { id: "X1", kind: "experience", title: "Software Intern", text: "Built an internal dashboard in Python used by 12 teammates weekly.", skills: ["Python"] },
      { id: "Q1", kind: "experience", title: "Secret project", text: `Led the ${MARK_A} initiative in Python with 40 engineers.`, skills: ["Python"], needs_confirmation: true },
      { id: "Q2", kind: "experience", title: "Held record", text: `Owned the ${MARK_B} platform in Python serving 9,000 users.`, skills: ["Python"], quarantined: true },
      { id: "Q3", kind: "experience", title: "Draft record", text: `Drafted the ${MARK_A} migration in Python.`, skills: ["Python"], status: "draft" },
    ],
  };
  const r = CL.buildCoverLetter(p, { title: "Software Engineering Intern", company: "Example Systems Inc", skills: ["Python"] });
  assert.equal(r.ok, true);
  assert.equal(r.readerSource, "module167", "this proof runs against the real module 167");
  assert.equal(r.clearedFactCount, 1, "only the one cleared fact is visible to the drafter");
  assert.equal(r.quarantinedFactCount, 3);
  for (const [label, hay] of [["text", r.text], ["sentences", JSON.stringify(r.sentences)], ["gaps", JSON.stringify(r.gaps)]]) {
    assert.ok(!hay.includes(MARK_A), `${label} leaked marker A`);
    assert.ok(!hay.includes(MARK_B), `${label} leaked marker B`);
  }
  // and inside the rendered files themselves (extracted back out via 148)
  const pdfText = Render.extractPdfLines(r.files.pdf ? Buffer.from(r.files.pdf.base64, "base64") : null).join("\n");
  const docxText = Render.extractDocxLines(r.files.docx ? Buffer.from(r.files.docx.base64, "base64") : null).join("\n");
  assert.ok(!pdfText.includes(MARK_A) && !pdfText.includes(MARK_B), "PDF leaked a quarantined marker");
  assert.ok(!docxText.includes(MARK_A) && !docxText.includes(MARK_B), "DOCX leaked a quarantined marker");
  // no sentence may cite a quarantined id
  for (const s of r.sentences) assert.ok(!s.factIds.some((id) => ["Q1", "Q2", "Q3"].includes(id)));
});

test("reader seam: an injected reader governs — 167-style contract honored verbatim", () => {
  const MARK = "INJECTEDREADERMARK-7731";
  const p = {
    basics: { name: "Alex Example", email: "alex@example.test", location: "Springfield, IL", links: {} },
    facts: [
      { id: "X1", kind: "experience", text: "Built an internal dashboard in Python used by 12 teammates weekly.", skills: ["Python"] },
      { id: "X2", kind: "experience", text: `Shipped the ${MARK} service in Python for 300 users.`, skills: ["Python"], status: "confirmed" },
    ],
  };
  // A 167-style reader that clears ONLY status === "confirmed" facts:
  // X1 (no status) must be invisible even though the stub would clear it.
  const reader167Style = (profile) => profile.facts.filter((f) => f.status === "confirmed");
  const r = CL.buildCoverLetter(p, { title: "Software Engineering Intern", company: "Example Systems Inc", skills: ["Python"] }, { reader: reader167Style });
  assert.equal(r.readerSource, "injected");
  assert.equal(r.clearedFactCount, 1, "the injected reader's verdict governs, not the stub's");
  assert.match(r.text, new RegExp(MARK), "the reader-cleared fact IS used");
  assert.ok(!/internal dashboard/.test(r.text), "the reader-withheld fact is NOT used");
});

test("defense in depth: a reader that wrongly returns an uncleared fact still cannot leak it", () => {
  const MARK = "BYPASSMARK-5510";
  const p = {
    basics: { name: "Alex Example", email: "alex@example.test", location: "Springfield, IL", links: {} },
    facts: [
      { id: "X1", kind: "experience", text: "Built an internal dashboard in Python used by 12 teammates weekly.", skills: ["Python"] },
      { id: "Q1", kind: "experience", text: `Ran the ${MARK} program in Python for 80 people.`, skills: ["Python"], needs_confirmation: true },
    ],
  };
  const sloppyReader = (profile) => profile.facts; // returns everything, including the unconfirmed fact
  const r = CL.buildCoverLetter(p, { title: "Software Engineering Intern", company: "Example Systems Inc", skills: ["Python"] }, { reader: sloppyReader });
  assert.equal(r.ok, true);
  assert.equal(r.safetyExcluded, 1, "the drafter excluded the uncleared fact itself");
  assert.ok(!JSON.stringify(r).includes(MARK), "no leak anywhere in the record");
});

test("truth audit is a real gate: a doctored fact sentence is caught by auditSentences", () => {
  const clearedProfile = { basics: FULL.basics, facts: FULL.facts };
  const good = CL.auditSentences([{ text: "In my own work, Built an internal dashboard in Python and React used by 12 teammates weekly, cutting report time from 2 hours to 15 minutes.", source: "fact", factIds: ["X1"] }], clearedProfile);
  assert.equal(good.ok, true, JSON.stringify(good.violations));
  const bad = CL.auditSentences([{ text: "In my own work, I led a 500-person Kubernetes migration at Global Megacorp.", source: "fact", factIds: ["X1"] }], clearedProfile);
  assert.equal(bad.ok, false, "an invented claim citing a real fact must fail");
  assert.ok(bad.violations.length >= 1);
  const orphan = CL.auditSentences([{ text: "I am fluent in Python.", source: "fact", factIds: [] }], clearedProfile);
  assert.equal(orphan.ok, false, "a fact claim with no fact id is an orphan claim");
});

test("length discipline: a tight word cap drops whole optional sentences, never truncates", () => {
  const r = CL.buildCoverLetter(FULL, SWE_POSTING, { maxWords: 80 });
  assert.equal(r.ok, true, JSON.stringify(r.droppedForLength));
  assert.ok(r.wordCount <= 80, `wordCount ${r.wordCount} <= 80`);
  assert.ok(r.droppedForLength.length >= 1, "something was dropped to fit");
  assert.match(r.text, /I am applying for the Software Engineering Intern role/, "the core application sentence survives");
});

test("AI-ban posting degrades to outline — no letter prose is generated", () => {
  const r = CL.buildCoverLetter(FULL, { ...SWE_POSTING, aiPolicy: "ban" });
  assert.equal(r.ok, false);
  assert.equal(r.mode, "outline");
  assert.equal(r.text, null);
  assert.ok(Array.isArray(r.outline) && r.outline.length === 3, "three movement prompts");
  assert.ok(r.outline[1].factIds.length >= 1, "the proof prompt carries cleared fact ids for the user to write from");
});

test("all facts quarantined: refusal, never a letter from nothing", () => {
  const p = { basics: FULL.basics, facts: FULL.facts.map((f) => ({ ...f, needs_confirmation: true })) };
  const r = CL.buildCoverLetter(p, SWE_POSTING);
  assert.equal(r.ok, false);
  assert.equal(r.text, null);
  assert.equal(r.clearedFactCount, 0);
});

test("missing name: sign-off is explicitly bracketed and flagged, never guessed", () => {
  const p = { basics: { email: "alex@example.test", location: "Springfield, IL", links: {} }, facts: FULL.facts };
  const r = CL.buildCoverLetter(p, SWE_POSTING);
  assert.equal(r.ok, true);
  assert.ok(r.gaps.some((g) => g.code === "MISSING_NAME"));
  assert.match(r.text, /\[name not on file\]/);
});

test("deterministic: same facts + posting render identical text and file hashes", () => {
  const a = CL.buildCoverLetter(FULL, SWE_POSTING);
  const b = CL.buildCoverLetter(FULL, SWE_POSTING);
  assert.equal(a.text, b.text);
  assert.equal(a.files.pdf.sha256, b.files.pdf.sha256);
  assert.equal(a.files.docx.sha256, b.files.docx.sha256);
});
