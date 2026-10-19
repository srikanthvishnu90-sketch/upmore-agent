/* FOUR-VERTICAL BATTERY — fail-first guards (bug law).
   Every test in the DEFECT section was RED on the tree of 2026-10-13 (HEAD 33cf986)
   against REAL fetched postings (fixtures/gauntlet/jobs/public-snapshots) and TEST
   personas. They pin the defect, not one specific fix: if a fix legitimately
   renames a family, update the expected value in the same commit and say so in
   docs/bug-ledger.md. GUARD tests at the bottom were GREEN when written and
   must stay green — they pin strengths the fixes must not break. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Jobs = require("../packages/domain/121-career-jobs.js");
const Profile = require("../packages/domain/122-career-profile.js");
const Tailor = require("../packages/domain/123-career-tailor.js");
const Apply3 = require("../packages/domain/132-career-apply3.js");

const FIX = path.join(__dirname, "..", "packages", "career-data", "fixtures");
const SNAPS = path.join(FIX, "gauntlet", "jobs", "public-snapshots");

function decodeEntities(s) {
  return String(s || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
function htmlToText(html) {
  return decodeEntities(html)
    .replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/\s*(p|div|li|h\d|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
function jdText(file) {
  const s = JSON.parse(fs.readFileSync(path.join(SNAPS, file), "utf8"));
  return s.content ? htmlToText(s.content) : (s.descriptionPlain || htmlToText(s.descriptionHtml || ""));
}
function persona(file) {
  const data = JSON.parse(fs.readFileSync(path.join(FIX, file), "utf8"));
  return { data, profile: Profile.profileFromData(data) };
}
function withSkills(data, profile) {
  const skills = data.facts.filter((f) => f.kind === "skill").map((f) => ({ name: f.name, proven: (f.evidence || []).length > 0 }));
  return Object.assign({}, profile, { skills });
}

/* ---------------- DEFECTS (red on 2026-10-13 tree) ---------------- */

test("FV-1: 121 roleFamily has a Medicine family — nursing/clinical titles must not classify as Other/SWE", () => {
  for (const t of ["Utilization Review Nurse", "Bilingual Medical Assistant", "CCM Case Management RN", "Clinical Oncology Genomics APP", "Registered Nurse", "Patient Care Technician"]) {
    assert.equal(Jobs.roleFamily(t, ""), "Medicine", `title "${t}" classified ${Jobs.roleFamily(t, "")}`);
  }
});

test("FV-2: 121 roleFamily has a Law family — legal titles must not classify as Other/Marketing/Operations", () => {
  for (const t of ["Legal Operations Analyst", "Paralegal", "Legal Assistant", "Applied Legal Researcher", "Law Clerk"]) {
    assert.equal(Jobs.roleFamily(t, ""), "Law", `title "${t}" classified ${Jobs.roleFamily(t, "")}`);
  }
});

test("FV-3: 121 location filter — a multi-office posting that lists the user's city must not be location-excluded", () => {
  const snap = JSON.parse(fs.readFileSync(path.join(SNAPS, "greenhouse-stripe-8128745.json"), "utf8"));
  const [posting] = Jobs.normalizeGreenhouse({ jobs: [snap] }, "stripe");
  const { profile } = persona("test-persona.json"); // wants Chicago, IL / New York, NY / Remote
  const fit = Jobs.scoreFit(posting, profile);
  const locReasons = (fit.reasons || []).filter((r) => /^location:/.test(r));
  assert.deepEqual(locReasons, [], `posting lists New York City among its offices but was location-excluded: ${locReasons.join("; ")}`);
});

test("FV-4: 123 detectFamily on real JD texts — medicine/law/finance postings get their own family, not an SWE/consulting fallback", () => {
  const FINANCE_FAMILIES = ["ib_finance", "accounting", "finance"];
  const cases = [
    ["greenhouse-oscar-8232510.json", ["medicine"]],
    ["greenhouse-oscar-8084238.json", ["medicine"]],
    ["greenhouse-oscar-8172223.json", ["medicine"]],
    ["greenhouse-datadog-8202086.json", ["law"]],
    ["greenhouse-robinhood-8198142.json", FINANCE_FAMILIES],
    ["greenhouse-robinhood-8198153.json", FINANCE_FAMILIES],
    ["greenhouse-coinbase-8173991.json", FINANCE_FAMILIES],
  ];
  for (const [file, expected] of cases) {
    const fam = Tailor.parseJD(jdText(file)).family;
    assert.ok(expected.includes(fam), `${file}: family=${fam}, expected one of ${expected.join("/")}`);
  }
});

test("FV-5: 123 parseJD must-haves are requirements, not boilerplate — no Spring/Spark/Go invented from culture text or dates", () => {
  const fs1 = Tailor.parseJD(jdText("greenhouse-robinhood-8198142.json")).mustHaveSkills;
  assert.ok(!fs1.includes("Spring"), `must-haves invented "Spring" (a graduation season): ${fs1.join(", ")}`);
  assert.ok(!fs1.includes("Spark"), `must-haves invented "Spark" (from "spark innovation" boilerplate): ${fs1.join(", ")}`);
  const app = Tailor.parseJD(jdText("greenhouse-flatironhealth-8128706.json")).mustHaveSkills;
  assert.ok(!app.includes("Go"), `must-haves invented "Go" for an oncology APP posting: ${app.join(", ")}`);
});

test("FV-6: 123 tailor renders certification facts verbatim — credentials dominate in regulated fields (Spec 3 8B.4)", () => {
  const maya = persona("persona-medicine-nursing.json");
  const r1 = Tailor.tailorResume(maya.profile, jdText("greenhouse-oscar-8172223.json"), { jobId: "FV-6a", date: "2026-10-13" });
  assert.equal(r1.ok, true);
  assert.match(r1.rendered.text, /Certified Nursing Assistant \(CNA\)/, "CNA credential line missing from the tailored resume");
  assert.match(r1.rendered.text, /Illinois Nurse Aide Registry/, "credential issuer/registry missing — the exact credential fact never rendered");
  assert.match(r1.rendered.text, /Basic Life Support \(BLS\) Provider/, "BLS credential line missing from the tailored resume");
  const riley = persona("persona-law-prelaw.json");
  const r2 = Tailor.tailorResume(riley.profile, jdText("greenhouse-datadog-8202086.json"), { jobId: "FV-6b", date: "2026-10-13" });
  assert.equal(r2.ok, true);
  assert.match(r2.rendered.text, /Paralegal Studies Certificate \(in progress\)/, "in-progress certificate fact never rendered");
});

test("FV-7: eligibility pipeline must not return 'submit' for an RN-licensed role when the profile holds no RN license", () => {
  const { data, profile } = persona("persona-medicine-nursing.json");
  const jd = jdText("greenhouse-oscar-8172223.json");
  const snap = JSON.parse(fs.readFileSync(path.join(SNAPS, "greenhouse-oscar-8172223.json"), "utf8"));
  const [posting] = Jobs.normalizeGreenhouse({ jobs: [snap] }, "oscar");
  const parsed = Tailor.parseJD(jd);
  const must = parsed.mustHaveSkills;
  const proven = must.filter((s) => data.facts.some((f) => f.kind === "skill" && f.name === s && (f.evidence || []).length > 0));
  const elig = Apply3.eligibilityJudge(posting, withSkills(data, profile), {
    mustHaveSkills: must,
    mustHaveCoverage: must.length ? proven.length / must.length : 1,
  });
  const namesLicense = (elig.reasons || []).some((r) => /licen[cs]e|registered nurse|\bRN\b/i.test(r));
  assert.ok(elig.verdict !== "submit" || namesLicense,
    `nursing student with no RN license was judged eligible for an RN-licensed role, reasons: ${(elig.reasons || []).join("; ")}`);
});

test("FV-8: 121 fit skill matching uses word boundaries — 'Go' must not match inside other words on an accounting JD", () => {
  const { data, profile } = persona("test-persona.json");
  const jd = jdText("greenhouse-robinhood-8198153.json");
  const snap = JSON.parse(fs.readFileSync(path.join(SNAPS, "greenhouse-robinhood-8198153.json"), "utf8"));
  const [posting] = Jobs.normalizeGreenhouse({ jobs: [snap] }, "robinhood");
  const fit = Jobs.scoreFit(posting, withSkills(data, profile));
  assert.ok(!(fit.matched_skills || []).includes("Go"), `matched_skills claims Go on a crypto accounting JD: ${(fit.matched_skills || []).join(", ")}`);
});

test("FV-9: 123 medicine family is framed for healthcare EMPLOYMENT, not med-school admission", () => {
  assert.ok(!/med-school/i.test(Tailor.FAMILIES.medicine.label),
    `medicine family label frames the user as an applicant to medical school: "${Tailor.FAMILIES.medicine.label}"`);
});

test("FV-10: 123 skill lexicon sees healthcare/legal requirements — credential demands in a JD must surface as must-haves", () => {
  const urn = Tailor.parseJD(jdText("greenhouse-oscar-8172223.json")).mustHaveSkills;
  assert.ok(urn.some((s) => /nurs|licen[cs]e/i.test(s)), `RN-licensed posting produced no nursing/licensure must-have: [${urn.join(", ")}]`);
  const ma = Tailor.parseJD(jdText("greenhouse-oscar-8232510.json")).mustHaveSkills;
  assert.ok(ma.some((s) => /medical assistant|patient care/i.test(s)), `medical-assistant posting produced no clinical must-have: [${ma.join(", ")}]`);
});

test("FV-11: 123 bullet styles must not mangle a fact's polished bullets into broken template grammar", () => {
  const { profile } = persona("test-persona.json");
  const r = Tailor.tailorResume(profile, jdText("greenhouse-robinhood-8198142.json"), { jobId: "FV-11", date: "2026-10-13" });
  assert.equal(r.ok, true);
  assert.ok(!/^Accomplished [a-z]/m.test(r.rendered.text),
    `consulting X-by-Y-Z style produced ungrammatical bullets: ${(r.rendered.text.match(/^Accomplished [a-z].*$/m) || [""])[0]}`);
  assert.ok(!/resulting in [a-z]+ed \d/.test(r.rendered.text) || /resulting in (prepared|cut|ran)/.test(r.rendered.text) === false,
    "template 'resulting in' clause garbled the fact's result text");
});

/* ---------------- GUARDS (green on 2026-10-13 tree — must stay green) ---------------- */

test("FV-G1: truth audit holds in regulated fields — a tailored resume never upgrades a credential the persona does not hold", () => {
  const maya = persona("persona-medicine-nursing.json");
  const r = Tailor.tailorResume(maya.profile, jdText("greenhouse-oscar-8172223.json"), { jobId: "FV-G1", date: "2026-10-13" });
  assert.equal(r.ok, true);
  assert.ok(!/Registered Nurse/.test(r.rendered.text), "resume claims an RN credential the persona does not hold");
  const riley = persona("persona-law-prelaw.json");
  const r2 = Tailor.tailorResume(riley.profile, jdText("ashby-harvey-ec074cbf-8d48-4661-b26c-1fdfb01df783.json"), { jobId: "FV-G2", date: "2026-10-13" });
  assert.equal(r2.ok, true);
  assert.ok(!/Juris Doctor|\bJD\b/.test(r2.rendered.text.replace(/JD degree/g, "")), "resume implies a JD the persona does not hold");
});

test("FV-G2: render + parse-check strength holds across all four verticals (real postings, PDF+DOCX produced)", () => {
  const cases = [
    ["test-persona.json", "greenhouse-robinhood-8198142.json"],
    ["test-persona.json", "greenhouse-stripe-8128745.json"],
    ["persona-medicine-nursing.json", "greenhouse-oscar-8232510.json"],
    ["persona-law-prelaw.json", "greenhouse-datadog-8202086.json"],
  ];
  for (const [pf, jf] of cases) {
    const { profile } = persona(pf);
    const r = Tailor.tailorResume(profile, jdText(jf), { jobId: "FV-G3", date: "2026-10-13" });
    assert.equal(r.ok, true, `${jf}: tailor refused`);
    assert.equal(r.rendered.parseCheck.status, "PASS", `${jf}: parse-check ${r.rendered.parseCheck.status}`);
    assert.ok(r.version.artifacts.pdf && r.version.artifacts.docx, `${jf}: PDF/DOCX artifacts missing`);
  }
});
