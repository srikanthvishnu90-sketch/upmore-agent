/* SIX-SECTOR GAP-CLOSE — fail-first guards (bug law).
   Companion to tests/career-four-vertical.test.cjs. Every DEFECT test here was
   RED on the tree of 2026-10-13 (HEAD 351eef2) against REAL fetched postings
   (fixtures/gauntlet/jobs/public-snapshots) and TEST personas, in the two
   sectors the four-vertical battery did not cover: CONSULTING and REAL ESTATE.
   They pin the defect, not one specific fix: if a fix legitimately renames a
   family, update the expected value in the same commit and say so in
   docs/bug-ledger.md. GUARD tests at the bottom were GREEN when written and
   must stay green.
   Integrator briefs: ~/workspace/your_files/integrator-packs/six-sector-briefs.md */
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

const CONSULTING = ["greenhouse-capco-8152961.json", "greenhouse-capco-8275106.json", "ashby-pariveda-a7757a29-e7ee-452f-95f4-7576b8f6ee87.json"];
const REAL_ESTATE = ["greenhouse-northmarq-5431885008.json", "greenhouse-northmarq-5414561008.json", "greenhouse-orchard-7018933002.json"];

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
function snap(file) { return JSON.parse(fs.readFileSync(path.join(SNAPS, file), "utf8")); }
function jdText(file) {
  const s = snap(file);
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
function postingFor(file, board) {
  const s = snap(file);
  if (file.startsWith("ashby-")) { const [p] = Jobs.normalizeAshby({ jobs: [s] }, board); return p; }
  const [p] = Jobs.normalizeGreenhouse({ jobs: [s] }, board);
  return p;
}
function eligibility(file, board, personaFile, locations) {
  const { data, profile } = persona(personaFile);
  const prof = withSkills(data, profile);
  if (locations) prof.preferences = Object.assign({}, prof.preferences, { locations });
  const posting = postingFor(file, board);
  const parsed = Tailor.parseJD(jdText(file));
  const proven = parsed.mustHaveSkills.filter((sk) => data.facts.some((f) => f.kind === "skill" && f.name === sk && (f.evidence || []).length > 0));
  return Apply3.eligibilityJudge(posting, prof, {
    mustHaveSkills: parsed.mustHaveSkills,
    mustHaveCoverage: parsed.mustHaveSkills.length ? proven.length / parsed.mustHaveSkills.length : 1,
  });
}

/* ---------------- DEFECTS (red on 2026-10-13 tree) ---------------- */

test("SS-1: 121 roleFamily has a Real Estate family — RE titles must not classify as Finance/Other", () => {
  for (const t of ["Real Estate Analyst", "Acquisitions Analyst", "Licensed Real Estate Agent", "Asset Management Analyst", "Real Estate Intern"]) {
    assert.equal(Jobs.roleFamily(t, ""), "Real Estate", `title "${t}" classified ${Jobs.roleFamily(t, "")}`);
  }
});

test("SS-2: 123 parseJD has a real_estate family — real-estate JDs must not get IB/finance conventions", () => {
  for (const f of REAL_ESTATE) {
    const fam = Tailor.parseJD(jdText(f)).family;
    assert.equal(fam, "real_estate", `${f}: family=${fam}`);
  }
});

test("SS-3: 123 skill extraction sees real-estate requirements — Argus is named in the Northmarq JD and must be extracted", () => {
  const parsed = Tailor.parseJD(jdText("greenhouse-northmarq-5431885008.json"));
  const all = [...parsed.mustHaveSkills, ...parsed.niceToHaveSkills];
  assert.ok(all.includes("Argus"), `JD names "ARGUS" as a plus and underwriting/NOI/DSC/IRR as the work; extracted must=[${parsed.mustHaveSkills.join(", ")}] nice=[${parsed.niceToHaveSkills.join(", ")}]`);
});

test("SS-4: eligibility must not return 'submit' for a license-required role when the profile holds no license (Orchard, FV-7 class)", () => {
  const elig = eligibility("greenhouse-orchard-7018933002.json", "orchard", "persona-real-estate.json", ["Dallas, Texas"]);
  const namesLicense = (elig.reasons || []).some((r) => /licen[cs]e/i.test(r));
  assert.ok(elig.verdict !== "submit" || namesLicense,
    `unlicensed TEST persona was judged eligible for a role requiring "an active and unrestricted Texas real estate license", reasons: ${(elig.reasons || []).join("; ")}`);
});

test("SS-5: eligibility must not wave through a stated years-of-experience requirement (Capco BA: 'Minimum 5 years of experience as a Business Analyst')", () => {
  const elig = eligibility("greenhouse-capco-8275106.json", "capco", "test-persona.json", ["Canada - Toronto"]);
  const namesExperience = (elig.reasons || []).some((r) => /year|experience/i.test(r));
  assert.ok(elig.verdict !== "submit" || namesExperience,
    `student persona with zero BA experience was judged eligible for a 5-years-required BA role, reasons: ${(elig.reasons || []).join("; ")}`);
});

test("SS-6: 121 roleFamily classifies real consulting postings as Consulting", () => {
  for (const f of CONSULTING) {
    const s = snap(f);
    const fam = Jobs.roleFamily(s.title, jdText(f));
    assert.equal(fam, "Consulting", `${f} ("${s.title}"): classified ${fam}`);
  }
});

test("SS-7: 123 detectFamily classifies real consulting JDs as consulting", () => {
  for (const f of CONSULTING) {
    const fam = Tailor.parseJD(jdText(f)).family;
    assert.equal(fam, "consulting", `${f}: family=${fam}`);
  }
});

test("SS-8: 123 parseJD must-haves are requirements, not prose — no Java/Angular (sample-projects team stack) or Spring (graduation season) invented from the Capco intern JD", () => {
  const must = Tailor.parseJD(jdText("greenhouse-capco-8152961.json")).mustHaveSkills;
  for (const invented of ["Spring", "Java", "Angular"]) {
    assert.ok(!must.includes(invented), `must-haves invented "${invented}": [${must.join(", ")}]`);
  }
});

test("SS-9: 123 parseJD extracts at least one must-have from JDs with explicit requirements sections (Capco BA, Pariveda, Orchard)", () => {
  for (const f of ["greenhouse-capco-8275106.json", "ashby-pariveda-a7757a29-e7ee-452f-95f4-7576b8f6ee87.json", "greenhouse-orchard-7018933002.json"]) {
    const must = Tailor.parseJD(jdText(f)).mustHaveSkills;
    assert.ok(must.length > 0, `${f}: zero must-haves extracted from an explicit requirements section`);
  }
});

test("SS-10: 121 scoreFit must not depend on the caller pre-attaching profile.skills — same user + same posting, same matched skills", () => {
  const { data, profile } = persona("persona-real-estate.json");
  const posting = postingFor("greenhouse-northmarq-5431885008.json", "northmarq");
  const bare = Jobs.scoreFit(posting, profile);
  const attached = Jobs.scoreFit(posting, withSkills(data, profile));
  assert.deepEqual(bare.matched_skills || [], attached.matched_skills || [],
    `scoreFit matched [] for the bare profile but ${JSON.stringify(attached.matched_skills)} for the skills-attached profile — the verdict depends on caller input shape`);
});

test("SS-11: tailored documents must actually differ across different JDs — the three real-estate packets were byte-identical", () => {
  const { profile } = persona("persona-real-estate.json");
  const a = Tailor.tailorResume(profile, jdText("greenhouse-northmarq-5431885008.json"), { jobId: "SS-11a", date: "2026-10-13" });
  const b = Tailor.tailorResume(profile, jdText("greenhouse-orchard-7018933002.json"), { jobId: "SS-11b", date: "2026-10-13" });
  assert.equal(a.ok, true); assert.equal(b.ok, true);
  assert.notEqual(a.rendered.text, b.rendered.text,
    "an investment-analyst packet and a licensed-agent packet rendered byte-identical text — tailoring selected the same facts and the JD signal changed nothing");
});

test("SS-12: 123 consulting bullet style must not mangle polished bullets (FV-11, consulting instance — Pariveda)", () => {
  const { profile } = persona("test-persona.json");
  const r = Tailor.tailorResume(profile, jdText("ashby-pariveda-a7757a29-e7ee-452f-95f4-7576b8f6ee87.json"), { jobId: "SS-12", date: "2026-10-13" });
  assert.equal(r.ok, true);
  assert.ok(!/^Accomplished [a-z]/m.test(r.rendered.text),
    `consulting X-by-Y-Z style produced ungrammatical bullets: ${(r.rendered.text.match(/^Accomplished [a-z].*$/m) || [""])[0]}`);
});

test("SS-13: 121 fit matching uses word boundaries — 'Go' must not appear in matched_skills for the Capco BA JD, which contains no standalone 'Go' (FV-8 class, second instance)", () => {
  const { data, profile } = persona("test-persona.json");
  const prof = withSkills(data, profile);
  // The measured conditions: with the persona's real (Chicago/NY) preferences the
  // posting is location-excluded before matching runs; neutralizing location to
  // the posting's city exposes the matcher, which claimed "Go" (score 6) on a JD
  // with zero word-occurrences of "Go".
  prof.preferences = Object.assign({}, prof.preferences, { locations: ["Canada - Toronto"] });
  const posting = postingFor("greenhouse-capco-8275106.json", "capco");
  const fit = Jobs.scoreFit(posting, prof);
  assert.ok(!(fit.matched_skills || []).includes("Go"), `matched_skills claims Go on a wealth-management BA JD: ${(fit.matched_skills || []).join(", ")}`);
});

/* ---------------- GUARDS (green on 2026-10-13 tree — must stay green) ---------------- */

test("SS-G1: truth audit never invents — no tailored document upgrades a credential or claims a license the persona does not hold", () => {
  const cases = [
    ["test-persona.json", CONSULTING[0]], ["test-persona.json", CONSULTING[1]], ["test-persona.json", CONSULTING[2]],
    ["persona-real-estate.json", REAL_ESTATE[0]], ["persona-real-estate.json", REAL_ESTATE[1]], ["persona-real-estate.json", REAL_ESTATE[2]],
  ];
  for (const [pf, jf] of cases) {
    const { profile } = persona(pf);
    const r = Tailor.tailorResume(profile, jdText(jf), { jobId: "SS-G1", date: "2026-10-13" });
    assert.equal(r.ok, true, `${jf}: tailor refused`);
    assert.equal((r.violations || []).length, 0, `${jf}: truth-audit violations ${JSON.stringify(r.violations)}`);
  }
  const { profile } = persona("persona-real-estate.json");
  const r = Tailor.tailorResume(profile, jdText("greenhouse-orchard-7018933002.json"), { jobId: "SS-G1b", date: "2026-10-13" });
  assert.ok(!/Texas real estate license/i.test(r.rendered.text), "resume implies a Texas real estate license the persona does not hold");
});

test("SS-G2: render + parse-check strength holds in both new sectors (real postings, PDF+DOCX produced)", () => {
  const cases = [
    ["test-persona.json", CONSULTING[0]], ["test-persona.json", CONSULTING[1]], ["test-persona.json", CONSULTING[2]],
    ["persona-real-estate.json", REAL_ESTATE[0]], ["persona-real-estate.json", REAL_ESTATE[1]], ["persona-real-estate.json", REAL_ESTATE[2]],
  ];
  for (const [pf, jf] of cases) {
    const { profile } = persona(pf);
    const r = Tailor.tailorResume(profile, jdText(jf), { jobId: "SS-G2", date: "2026-10-13" });
    assert.equal(r.ok, true, `${jf}: tailor refused`);
    assert.equal(r.rendered.parseCheck.status, "PASS", `${jf}: parse-check ${r.rendered.parseCheck.status}`);
    assert.ok(r.version.artifacts.pdf && r.version.artifacts.docx, `${jf}: PDF/DOCX artifacts missing`);
  }
});
