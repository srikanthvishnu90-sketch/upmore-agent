/* TAILORING DEPTH (Crew B Cycle 2, W3) — Lane B residual mechanisms.
   Lane B re-run on this tree (BEFORE): coverage mean 0.686, invention 0,
   zero-satisfiable-with-no-gap-flag 0, knockout silent drops 0, wrongful
   refusals 0, empty Skills sections 0 — the BUG-208..212 axes held.
   What remained, by instance count: GENERIC_NOT_TAILORED 925 (861 of
   them the cross-scenario identical-selection clause),
   KEYWORD_ABSENT_TRUTHFUL 798, MISSING_REQUIREMENT 652. Diagnosis
   pinned four mechanisms, one guard each below:
   (1) nameSafe + skills[]-only names: a lexicon exemption was tried
       for skills evidenced only via a fact's skills[] list (e.g.
       "Legal Writing": the word "writing" in no fact's prose) and
       REVERTED on Lane B measurement — coverage rose 0.686 -> 0.961
       but invention went 0 -> 1,441, every instance the immutability
       name check (a capitalized name mid-line must appear in fact
       PROSE; skills[] is not prose). The invention bar is hard, so the
       prose rule stands for all names: a skills[]-only name whose
       words no fact states in prose does not print (coverage miss,
       never an invention) and is NOT a gap (it is evidenced). Guard
       (1) pins both sides of that line.
   (2) the skills line only carried non-skill-fact skills the JD parser
       extracted as wanted — a persona's other evidenced skills (the
       occupation's own vocabulary, carried in the facts) never reached
       the page, so truthful keywords were absent by construction.
   (3) skillFactSelfEvidences raw-matched " name " — a skill mentioned
       at the END of a fact's sentence ("…in Excel.", "…in Confluence.")
       never self-evidenced, so a substantive skill fact was treated as
       a bare claim and its skill became a false gap.
   (4) selectFacts returned the whole pool for every posting (pool 2–7
       facts, limit 8), so selection was identical across postings by
       construction; and its relevance read only fact.text, missing
       skills evidenced in title/bullets. Selection is now driven by
       posting-relevant skill evidence (+ structural education /
       certification facts), with a small-record floor.
   TEST fixtures only — synthetic personas + fictional postings, inline. */
const test = require("node:test");
const assert = require("node:assert/strict");
const Tailor = require("../packages/domain/123-career-tailor.js");

function baseProfile(facts, extra) {
  return Object.assign({
    basics: { name: "Casey Testcase (TEST)", email: "casey@example.test", location: "Chicago, IL (TEST)", links: {} },
    constraints: {}, defaults: {}, preferences: {},
    facts,
  }, extra || {});
}
const skillsTextOf = (r) => { const l = (r.resume.lines || []).find((x) => x.type === "skills"); return l ? l.text : ""; };

test("depth (1): skills[]-evidenced lexicon skill prints when its words are prose-supported; a prose-unsupported skills[]-only name does not print and is not a gap", () => {
  const p = baseProfile([
    { id: "F-001", kind: "experience", title: "Paralegal, TEST Firm", org: "TEST Firm", start: "2024-01", end: "2026-05", needs_confirmation: false, evidence: [], skills: ["Legal Research", "Legal Writing", "Legal Calendaring"], text: "Paralegal at TEST Firm. Drafts pleadings and researches case law for 30 active matters; writing samples are on file with the firm.", bullets: ["Drafts pleadings for 30 active matters", "Researches case law under attorney supervision"] },
    { id: "F-002", kind: "education", title: "B.A. English, TEST University", org: "TEST University", start: "2019-09", end: "2023-05", needs_confirmation: false, evidence: [], skills: [], text: "B.A. English at TEST University, graduated May 2023.", bullets: [] },
  ]);
  // "writing" IS in F-001's prose; "calendaring" is in NO fact's prose.
  const r = Tailor.tailorResume(p, "Paralegal (TEST posting)\nRequired: Legal Research, Legal Writing, Legal Calendaring.\nYou will support attorneys.", {});
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  assert.match(skillsTextOf(r), /Legal Writing/, `prose-supported skills[] skill must reach the page: "${skillsTextOf(r)}"`);
  assert.ok(!/Calendaring/.test(r.resume.lines.map((l) => l.text).join("\n")), "a skills[]-only name with no prose support must not print (immutability name rule — invention bar)");
  assert.ok(!(r.gaps || []).some((g) => g.requirement === "Legal Writing"), "an evidenced skill is not a gap");
  assert.ok(!(r.gaps || []).some((g) => g.requirement === "Legal Calendaring"), "Legal Calendaring is evidenced (skills[]) — a coverage miss under the name rule, never a gap");
});

test("depth (1b): a NON-lexicon name sourced only from skills[] with no prose support still does not print", () => {
  const p = baseProfile([
    { id: "F-001", kind: "experience", title: "Analyst, TEST Co", org: "TEST Co", start: "2024-01", end: "2026-05", needs_confirmation: false, evidence: [], skills: ["Python", "Zentharp Analytics"], text: "Analyst at TEST Co. Built Python reports for 12 users.", bullets: ["Built Python reports for 12 users"] },
  ]);
  const r = Tailor.tailorResume(p, "Analyst (TEST posting)\nRequired: Python.\nYou will build reports.", {});
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  assert.ok(!/Zentharp/.test(r.resume.lines.map((l) => l.text).join("\n")), "a non-lexicon proper name no fact states in prose must not print");
});

test("depth (2): an evidenced skill the JD parser did not extract still reaches the skills line (occupation vocabulary)", () => {
  const p = baseProfile([
    { id: "F-001", kind: "experience", title: "Paralegal, TEST Firm", org: "TEST Firm", start: "2024-01", end: "2026-05", needs_confirmation: false, evidence: [], skills: ["Legal Research", "Westlaw"], text: "Paralegal at TEST Firm. Researches case law in Westlaw for 30 active matters.", bullets: ["Researches case law in Westlaw for 30 active matters"] },
  ]);
  const r = Tailor.tailorResume(p, "Legal Assistant (TEST posting)\nRequired: Legal Research.\nYou will support attorneys.", {});
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  assert.match(skillsTextOf(r), /Westlaw/, `evidenced Westlaw must reach the skills line even when the JD names only Legal Research: "${skillsTextOf(r)}"`);
});

test("depth (3): a substantive skill fact whose skill is mentioned sentence-finally self-evidences (no false gap)", () => {
  const p = baseProfile([
    { id: "F-001", kind: "experience", title: "Broker, TEST Realty", org: "TEST Realty", start: "2020-01", end: "2026-05", needs_confirmation: false, evidence: [], skills: ["Excel"], text: "Broker at TEST Realty. Closed 30 leases and sales for commercial clients.", bullets: ["Closed 30 leases and sales for commercial clients"] },
    { id: "F-002", kind: "skill", title: "Valuation skills (TEST)", org: "Self-directed (TEST)", needs_confirmation: false, evidence: [], skills: ["Pro Forma", "NOI", "Excel"], text: "Builds pro forma models with NOI, DSC and cap rate sensitivities in Excel." },
  ]);
  const jd = Tailor.parseJD("Broker (TEST posting)\nRequired: Excel, Pro Forma.\nYou will build models.");
  const rows = Tailor.provenSkills(p, jd);
  const excel = rows.find((x) => x.name === "Excel");
  assert.ok(excel && excel.proven, `the sentence-final Excel mention must self-evidence the skill fact: ${JSON.stringify(rows)}`);
  const r = Tailor.tailorResume(p, "Broker (TEST posting)\nRequired: Excel, Pro Forma.\nYou will build models.", {});
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  assert.match(skillsTextOf(r), /Excel/);
  assert.ok(!(r.gaps || []).some((g) => g.requirement === "Excel"), "Excel is evidenced — not a gap");
});

test("depth (4): fact selection is posting-driven — different postings select different facts; irrelevant facts are not carried", () => {
  const facts = [
    { id: "F-001", kind: "education", title: "B.S. Computer Science, TEST University", org: "TEST University", start: "2020-09", end: "2024-05", needs_confirmation: false, evidence: [], skills: [], text: "B.S. Computer Science at TEST University, graduated May 2024.", bullets: [] },
    { id: "F-002", kind: "experience", title: "Backend Engineer, TEST Co", org: "TEST Co", start: "2024-06", end: "2026-05", needs_confirmation: false, evidence: [], skills: ["Python", "SQL"], text: "Backend Engineer at TEST Co. Built Python services and SQL pipelines for 50 users.", bullets: ["Built Python services and SQL pipelines for 50 users"] },
    { id: "F-003", kind: "experience", title: "Paralegal, TEST Firm", org: "TEST Firm", start: "2024-06", end: "2026-05", needs_confirmation: false, evidence: [], skills: ["Legal Research", "Westlaw"], text: "Paralegal at TEST Firm. Researches case law in Westlaw for 30 active matters.", bullets: ["Researches case law in Westlaw for 30 active matters"] },
    { id: "F-004", kind: "project", title: "Finance models (TEST project)", org: "TEST", start: "2025-01", end: "2025-06", needs_confirmation: false, evidence: [], skills: ["Excel", "Financial Modeling"], text: "Built discounted cash flow models in Excel for 8 fictional companies.", bullets: ["Built discounted cash flow models in Excel"] },
  ];
  const p = baseProfile(facts);
  const swe = Tailor.tailorResume(p, "Backend Engineer (TEST posting)\nRequired: Python, SQL.\nYou will build services.", {});
  const law = Tailor.tailorResume(p, "Paralegal (TEST posting)\nRequired: Legal Research, Westlaw.\nYou will support attorneys.", {});
  assert.equal(swe.ok, true, JSON.stringify(swe.violations || []));
  assert.equal(law.ok, true, JSON.stringify(law.violations || []));
  const sweSel = swe.resume.selectedFactIds, lawSel = law.resume.selectedFactIds;
  assert.notDeepEqual([...sweSel].sort(), [...lawSel].sort(), "selection must differ across postings with different requirements");
  assert.ok(sweSel.includes("F-002") && !sweSel.includes("F-003"), `SWE cut keeps the backend fact, drops the paralegal fact: ${sweSel}`);
  assert.ok(lawSel.includes("F-003") && !lawSel.includes("F-002"), `law cut keeps the paralegal fact, drops the backend fact: ${lawSel}`);
  assert.ok(sweSel.includes("F-001") && lawSel.includes("F-001"), "education is structural — carried by both cuts");
});

test("depth (4c): a fact evidencing a role-FAMILY skill is kept even when the posting's surviving text never named that skill (LB-0134 shape)", () => {
  const p = baseProfile([
    { id: "F-001", kind: "education", title: "M.S. Computer Science, TEST University", org: "TEST University", start: "2025-09", end: "2027-05", needs_confirmation: false, evidence: [], skills: [], text: "M.S. Computer Science at TEST University, graduating May 2027.", bullets: [] },
    { id: "F-002", kind: "project", title: "Open-source contributor (TEST)", org: "TEST", start: "2025-01", end: "2026-01", needs_confirmation: false, evidence: [], skills: [], text: "Open-source contributor: merged 14 PRs into a public data library (TEST).", bullets: ["Merged 14 PRs into a public data library"] },
    { id: "F-003", kind: "experience", title: "SWE Intern, TEST Health Systems", org: "TEST Health Systems", start: "2026-06", end: "2026-08", needs_confirmation: false, evidence: [], skills: [], text: "SWE Intern at TEST Health Systems: shipped a Go API used by 30 clinics.", bullets: ["Shipped a Go API used by 30 clinics"] },
  ]);
  // The posting's surviving text extracts only "Data Structures"; Go is
  // the family's own vocabulary and F-003 is the record's only experience.
  const r = Tailor.tailorResume(p, "Software Engineer (TEST posting)\nRequired: Data Structures.\nYou will build systems.", {});
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  assert.ok(r.resume.selectedFactIds.includes("F-003"), `the family-skill experience fact must be selected: ${r.resume.selectedFactIds}`);
  const body = r.resume.lines.map((l) => l.text).join("\n");
  assert.match(body, /\bGo\b/, "the Go API work reaches the page");
});

test("depth (4b): a skill evidenced only in a fact's BULLETS still makes that fact posting-relevant (kept + covered)", () => {
  const p = baseProfile([
    { id: "F-001", kind: "experience", title: "Legal Assistant, TEST Offices", org: "TEST Offices", start: "2024-01", end: "2026-05", needs_confirmation: false, evidence: [], skills: [], text: "Legal Assistant at TEST Offices since 2024, supporting three attorneys.", bullets: ["Researches case law in Westlaw and LexisNexis under attorney supervision", "Prepared e-filing through the state portal"] },
    { id: "F-002", kind: "experience", title: "Backend Engineer, TEST Co", org: "TEST Co", start: "2024-06", end: "2026-05", needs_confirmation: false, evidence: [], skills: ["Python"], text: "Backend Engineer at TEST Co. Built Python services for 50 users.", bullets: ["Built Python services for 50 users"] },
    { id: "F-003", kind: "project", title: "Finance models (TEST project)", org: "TEST", start: "2025-01", end: "2025-06", needs_confirmation: false, evidence: [], skills: ["Excel"], text: "Built discounted cash flow models in Excel for 8 fictional companies.", bullets: ["Built discounted cash flow models in Excel"] },
  ]);
  const r = Tailor.tailorResume(p, "Paralegal (TEST posting)\nRequired: Westlaw.\nYou will support attorneys.", {});
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  assert.ok(r.resume.selectedFactIds.includes("F-001"), `the bullet-evidencing fact must be selected: ${r.resume.selectedFactIds}`);
  const body = r.resume.lines.map((l) => l.text).join("\n");
  assert.match(body, /Westlaw/, "the bullet carrying Westlaw reaches the page");
});
