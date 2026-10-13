/* TEST fixtures only — synthetic TEST persona + fictional TEST companies/JDs. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Profile = require("../packages/domain/122-career-profile.js");
const Tailor = require("../packages/domain/123-career-tailor.js");

const fixtureDir = path.join(__dirname, "..", "packages", "career-data", "fixtures");
function loadFixture() {
  return Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(fixtureDir, "test-persona.json"), "utf8")));
}
const SWE_JD = `Software Engineer, New Grad (TEST posting)
Required: Python, JavaScript, React, SQL, PostgreSQL, Git.
Nice to have: Kubernetes, Docker, AWS.
You will build APIs and deploy services.`;
const IB_JD = `Investment Banking Summer Analyst (TEST posting)
Required: Excel, Financial Modeling, Valuation.
Nice to have: Bloomberg.
You will build DCF models and support deal teams.`;
const CIR = { company: "TEST Systems Inc", facts: [{ text: "TEST Systems Inc launched a self-serve analytics product for small retailers in March 2026 (TEST fact)." }] };

test("JD parser: must-have vs nice-to-have, level, family", () => {
  const jd = Tailor.parseJD(SWE_JD);
  assert.ok(jd.mustHaveSkills.includes("Python"));
  assert.ok(jd.mustHaveSkills.includes("React"));
  assert.ok(jd.niceToHaveSkills.includes("Kubernetes"));
  assert.ok(!jd.niceToHaveSkills.includes("Python"));
  assert.equal(jd.family, "swe");
  assert.equal(Tailor.parseJD(IB_JD).family, "ib_finance");
});

test("SWE variant (most realised): skills block, projects with stack, audit passes, ATS render", () => {
  const p = loadFixture();
  const r = Tailor.tailorResume(p, SWE_JD, { jobId: "TEST-JOB-1", date: "2026-10-12" });
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  assert.equal(r.resume.family, "swe");
  assert.ok(r.resume.lines.every((l) => Array.isArray(l.factIds) && l.factIds.length >= 1));
  assert.match(r.rendered.text, /SKILLS/);
  assert.match(r.rendered.text, /Kubernetes/); // evidenced by F-003
  assert.ok(!/\|.*\|/.test(r.rendered.text.split("\n").slice(3).join("\n")), "no table pipes in body");
  assert.ok(r.rendered.pdf && r.rendered.pdf.filename === "Alex_Testcase_Resume.pdf", "CA-02: real PDF artifact (148-career-render), R8 filename");
  assert.ok(r.rendered.docx && r.rendered.docx.base64, "CA-02: real DOCX artifact from the same JSON");
  assert.equal(r.rendered.parseCheck.status, "PASS", JSON.stringify(r.rendered.parseCheck.reasons));
  assert.equal(r.version.jobId, "TEST-JOB-1");
});

test("IB/finance variant: education first, strict one-pager, single Technical skills line", () => {
  const p = loadFixture();
  const r = Tailor.tailorResume(p, IB_JD, { family: "ib_finance" });
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  assert.equal(r.resume.sections[0].heading, "Education");
  assert.equal(r.resume.pageLimit, 1);
  const skills = r.resume.lines.find((l) => l.type === "skills");
  assert.match(skills.text, /^Technical skills: /);
  assert.match(skills.text, /Excel/);
  assert.ok(!/Bloomberg/.test(skills.text), "Bloomberg is nice-to-have in the JD but unevidenced — must not appear");
});

test("consulting variant: accomplished-X-by-Y-resulting-in-Z bullets", () => {
  const p = loadFixture();
  const r = Tailor.tailorResume(p, "Consulting Analyst (TEST): strategy, client engagement. Required: Excel.", { family: "consulting" });
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  const structured = r.resume.lines.filter((l) => /^Accomplished /.test(l.text));
  assert.ok(structured.length >= 1);
  assert.match(structured[0].text, / by .+, resulting in /);
});

test("Appendix B T3 replay: unevidenced skill insertion FAILS the audit and produces NO output", () => {
  const p = loadFixture();
  // Direct audit: a line claiming Rust (F-017, unproven) with an invented metric.
  const bad = { lines: [
    { text: "Built a Rust compiler serving 1,000,000 users", factIds: ["F-017"], type: "bullet" },
    { text: "Expert in Rust and Kubernetes", factIds: ["F-017"], type: "bullet" },
    { text: "Did something with no citation at all", factIds: [], type: "bullet" },
  ] };
  const a = Tailor.auditResume(bad, p);
  assert.equal(a.ok, false);
  assert.ok(a.violations.length >= 3, JSON.stringify(a.violations));
  assert.ok(a.violations.some((v) => /Rust/.test(v.reason) || /Rust/.test(v.line)));
  assert.ok(a.violations.some((v) => /number/.test(v.reason)));
  assert.ok(a.violations.some((v) => /no fact ID/.test(v.reason)));

  // Through the gate: tamper with an assembled resume, then re-audit via tailor path.
  // tailorResume assembles only evidenced facts, so simulate the attack by
  // auditing a resume whose line cites a real fact for an unevidenced claim:
  const forged = { lines: [{ text: "Deployed Rust services on Kubernetes for 500 users", factIds: ["F-002"], type: "bullet" }] };
  const fa = Tailor.auditResume(forged, p);
  assert.equal(fa.ok, false);
  assert.ok(fa.violations.some((v) => v.skill === "Rust"));
  // Through the tailor gate itself: an attempt to insert an unevidenced
  // claim as an extra line refuses the whole tailored output.
  const attempt = Tailor.tailorResume(p, SWE_JD, { extraLines: [{ text: "Expert in Rust with 5 years of production experience", factIds: ["F-017"], type: "bullet" }] });
  assert.equal(attempt.ok, false);
  assert.equal(attempt.refused, true);
  assert.equal(attempt.output, null);
  assert.equal(attempt.resume, null);
  assert.ok(attempt.violations.some((v) => v.skill === "Rust" || /Rust/.test(v.line)));
  // And the honest tailor run refuses nothing while producing output — the
  // contrast proves the gate, not the assembler, is what stops the forgery.
  const honest = Tailor.tailorResume(p, SWE_JD, {});
  assert.equal(honest.ok, true);
  assert.ok(honest.resume);
});

test("truth audit: unconfirmed resume drafts support nothing", () => {
  const p = Profile.createProfile({});
  const { drafts } = Profile.ingestResume(p, fs.readFileSync(path.join(fixtureDir, "test-resume.txt"), "utf8"));
  const py = drafts.find((f) => f.kind === "skill" && f.name === "Python");
  const a = Tailor.auditResume({ lines: [{ text: "Python", factIds: [py.id], type: "skills" }] }, p);
  assert.equal(a.ok, false);
  assert.match(a.violations[0].reason, /unconfirmed/);
});

test("cover letter: 150-250 words, real company fact + one proof point, no banned phrases", () => {
  const p = loadFixture();
  const cl = Tailor.generateCoverLetter(p, SWE_JD, CIR, { role: "new-grad software engineer" });
  assert.equal(cl.ok, true, cl.reason || "");
  assert.ok(cl.wordCount >= 150 && cl.wordCount <= 250, `wordCount=${cl.wordCount}`);
  assert.ok(cl.text.includes("TEST Systems Inc launched a self-serve analytics product"));
  assert.ok(cl.proofFactId);
  assert.deepEqual(Tailor.bannedPhrasesIn(cl.text), []);
  // no CIR fact -> refused, never fabricated
  const noCir = Tailor.generateCoverLetter(p, SWE_JD, { company: "TEST Systems Inc", facts: [] }, {});
  assert.equal(noCir.ok, false);
});

test("banned-phrase lint catches Doc 1 §3.2 / Doc 2 §3.4 filler", () => {
  assert.ok(Tailor.bannedPhrasesIn("I hope this email finds you well, I am writing to express my interest").length >= 2);
  assert.ok(Tailor.bannedPhrasesIn("I'd love to pick your brain").length >= 1);
});

test("S8 / AI-ban branch: CIR ban degrades tailor to outline+bullets, no cover prose", () => {
  const p = loadFixture();
  const banCir = { company: "NoAi Bank (TEST)", aiPolicy: "ban", facts: [{ text: "NoAi Bank (TEST) states applications using AI-generated content will be disqualified (TEST fact)." }] };
  const r = Tailor.tailorResume(p, IB_JD, { family: "ib_finance", cir: banCir, wantCoverLetter: true });
  assert.equal(r.ok, true);
  assert.equal(r.mode, "outline");
  assert.equal(r.coverLetter, null);
  assert.equal(r.rendered, null);
  assert.ok(r.outline && r.outline.points.length >= 2);
  assert.ok(r.bullets && r.bullets.length >= 1 && r.bullets.every((b) => b.factIds.length >= 1));
  const cl = Tailor.generateCoverLetter(p, IB_JD, banCir, {});
  assert.equal(cl.ok, false); assert.equal(cl.mode, "outline"); assert.equal(cl.text, null);
});

test("diff vs base: added bullet carries its reason with the fact ID (Doc 2 §3.1 step 8)", () => {
  const p = loadFixture();
  const base = ["Built a reporting dashboard in React and Python used by 200 internal users"];
  const r = Tailor.tailorResume(p, SWE_JD, { baseLines: base });
  assert.equal(r.ok, true);
  const kube = r.diff.added.find((a) => /Kubernetes/.test(a.text));
  assert.ok(kube, JSON.stringify(r.diff.added));
  assert.match(kube.reason, /Kubernetes/);
  assert.match(kube.reason, /F-003/);
  assert.ok(typeof r.diff.summary === "string");
});

test("answer bank: why-us grounded in CIR facts passed in, company parts rewritten", () => {
  const p = loadFixture();
  const bank = Tailor.buildAnswerBank(p, SWE_JD, CIR, {});
  assert.equal(bank.ok, true);
  const why = bank.entries.find((e) => e.theme === "why_us");
  assert.ok(why);
  assert.ok(why.text.includes("TEST Systems Inc"));
  assert.ok(why.text.includes("self-serve analytics product"));
  assert.ok(why.factIds.length >= 1);
  assert.equal(Tailor.buildAnswerBank(p, SWE_JD, null, {}).ok, false);
});

test("per-family coverage: all seven families assemble and pass the audit", () => {
  const p = loadFixture();
  for (const fam of ["swe", "quant", "ib_finance", "consulting", "pm", "data_ml", "design"]) {
    const r = Tailor.tailorResume(p, SWE_JD, { family: fam });
    assert.equal(r.ok, true, `${fam}: ${JSON.stringify(r.violations || [])}`);
    assert.equal(r.resume.family, fam);
  }
});
