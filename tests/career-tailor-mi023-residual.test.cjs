/* MI-023 TAILORING RESIDUAL — permanent guard (Crew B, tier 2).
   Lane B cycle-2 state on release/career-v224: coverage mean 0.736,
   law 0.467, invention 0. The residual analysis (this lane, 2026-10-17)
   classified ALL 165 law MISSING_REQUIREMENT instances on the frozen
   Lane B corpus: every one is a lexicon skill attested ONLY in a
   non-skill fact's skills[] list (Legal Writing 110, Legal Research 44,
   Legal Operations 10, Legal Calendaring 1) with at least one word of
   the name appearing NOWHERE in the persona's fact prose
   (title/text/bullets/org). Under the Lane B invention rule — a
   capitalized name mid-line must appear in fact PROSE; skills[] is
   evidence for the skill claim but is not prose — printing any of
   those names is an INVENTED_FACT instance, one per unsupported word
   per line. A blanket lexicon exemption was measured on this build:
   it raises coverage and invents names in exact proportion (see the
   MI-023 completion entry in the reports log); it was reverted.
   This guard pins the lawful side of that line forever:
   (a) a skills[]-only, prose-unsupported name does NOT print, the
       resume still ships (ok:true), and the skill is NOT named a gap
       (it is evidenced — a coverage miss, never an invention, never
       a false gap);
   (b) the prose-supported control DOES print and cover;
   (c) the audit stays clean (invention 0 at the product gate too).
   If a future change makes (a) print, this test goes red — that is
   the fail-first tripwire for the invention-for-coverage trade.
   Fixtures are the Lane B LB-0526 persona shape, synthetic TEST data. */
const test = require("node:test");
const assert = require("node:assert/strict");
const Tailor = require("../packages/domain/123-career-tailor.js");

function lawPersona() {
  return {
    basics: { name: "Riley Testcase (TEST)", email: "riley@example.test", location: "Chicago, IL (TEST)", links: {} },
    constraints: {}, defaults: {}, preferences: {},
    facts: [
      { id: "F-001", kind: "education", title: "B.A. English, TEST University", org: "TEST University", start: "2019-09", end: "2023-05", needs_confirmation: false, evidence: [], skills: ["Legal Writing"], text: "B.A. English at TEST University, GPA 3.6, graduated May 2023.", bullets: [] },
      { id: "F-002", kind: "certification", title: "Paralegal Certificate (TEST fixture)", org: "TEST Community College", start: "2023-01", end: "2023-12", needs_confirmation: false, evidence: [], skills: ["Legal Research", "Legal Writing"], text: "Paralegal Certificate from TEST Community College, completed December 2023, stated exactly as issued (TEST fixture credential).", bullets: [] },
      { id: "F-003", kind: "experience", title: "Paralegal, TEST Family Law Firm", org: "TEST Family Law Firm", start: "2024-01", end: "2026-05", needs_confirmation: false, evidence: [], skills: ["Legal Research", "Legal Writing", "Westlaw", "LexisNexis", "Legal Calendaring"], text: "Paralegal at TEST Family Law Firm since January 2024. Drafts pleadings and discovery responses, researches case law in Westlaw and LexisNexis, and maintains legal calendaring for 60 active matters.", bullets: ["Drafts pleadings and discovery responses for 60 active matters", "Researches case law in Westlaw and LexisNexis under attorney supervision"] },
      { id: "F-004", kind: "experience", title: "Legal Assistant, TEST Law Offices", org: "TEST Law Offices", start: "2023-01", end: "2023-12", needs_confirmation: false, evidence: [], skills: ["E-Filing", "Contract Review"], text: "Legal Assistant at TEST Law Offices 2023. Prepared e-filing through the state portal and handled contract review intake for 3 attorneys.", bullets: [] },
    ],
  };
}
const JD = "Paralegal (TEST posting)\nRequired: Legal Research, Legal Writing, Westlaw.\nYou will support attorneys.";

test("mi023 (a): skills[]-only prose-unsupported name (Legal Writing) does not print, is not a gap, audit clean", () => {
  const r = Tailor.tailorResume(lawPersona(), JD, {});
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  const body = r.resume.lines.map((l) => l.text).join("\n");
  assert.ok(!/Legal Writing/.test(body), `Legal Writing is attested only in skills[] and the word "writing" is in no fact's prose — printing it is invention: "${body}"`);
  assert.ok(!(r.gaps || []).some((g) => g.requirement === "Legal Writing"), "an evidenced (skills[]) skill is a coverage miss under the name rule, never a gap");
  assert.equal(r.audit.ok, true);
});

test("mi023 (b): prose-supported skills print and cover (Legal Research via 'Researches' prose, Westlaw, Legal Calendaring)", () => {
  const r = Tailor.tailorResume(lawPersona(), JD, {});
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  const skillsLine = (r.resume.lines.find((l) => l.type === "skills") || {}).text || "";
  assert.match(skillsLine, /Westlaw/, `prose-evidenced Westlaw must print: "${skillsLine}"`);
  assert.match(skillsLine, /Legal Research/, `"research" is prose-supported (substring in "Researches") and skills[]-attested — must print: "${skillsLine}"`);
  const body = r.resume.lines.map((l) => l.text).join("\n");
  assert.match(body, /legal calendaring/i, "the fact's own prose clause carrying Legal Calendaring reaches the page in the fact's own words");
});

test("mi023 (c): a name with NO attestation anywhere (not skills[], not prose) never prints", () => {
  const r = Tailor.tailorResume(lawPersona(), "Paralegal (TEST posting)\nRequired: Legal Research, Contract Review, Legal Writing, Legal Operations.\nYou will support attorneys.", {});
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  const body = r.resume.lines.map((l) => l.text).join("\n");
  assert.ok(!/Legal Operations/.test(body), "Legal Operations is attested nowhere in this persona — must not print");
  assert.ok((r.gaps || []).some((g) => g.requirement === "Legal Operations"), "a truly unevidenced requirement IS a named gap");
});
