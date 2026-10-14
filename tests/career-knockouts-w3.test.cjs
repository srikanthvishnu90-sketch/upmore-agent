/* W3 (SAFETY KNOCKOUTS + BOARD REGISTRY) — fail-first guards written by the
   121/123 owner lane, 2026-10-14. The FV/SS suites pin the headline instances
   (Oscar RN license, Orchard RE license, Capco 5-years); these guards pin the
   remaining brief instances the FV/SS guards do NOT cover: Harvey's JD +
   law-firm years (FV-7 brief), Oscar's Medical Assistant Certification
   (FV-7 brief — a CNA is a DIFFERENT credential), Northmarq's degree +
   full-time years (SS-5 brief), Pariveda's 3+ years (SS-5 brief), plus a
   positive control (a candidate who DOES hold the credential must not be
   blocked) and the W7/G3 board-registry gap. All were RED before the fix. */
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
function eligibility(file, board, personaFile, extraFacts) {
  const { data, profile } = persona(personaFile);
  if (extraFacts) for (const f of extraFacts) Profile.addFact(profile, f);
  const prof = withSkills(data, profile);
  const posting = postingFor(file, board);
  prof.preferences = Object.assign({}, prof.preferences, { locations: [posting.location] });
  const parsed = Tailor.parseJD(jdText(file));
  const proven = parsed.mustHaveSkills.filter((sk) => data.facts.some((f) => f.kind === "skill" && f.name === sk && (f.evidence || []).length > 0));
  return Apply3.eligibilityJudge(posting, prof, {
    mustHaveSkills: parsed.mustHaveSkills,
    mustHaveCoverage: parsed.mustHaveSkills.length ? proven.length / parsed.mustHaveSkills.length : 1,
  });
}

/* ---------------- SAFETY KNOCKOUTS (BUG-050) ---------------- */

test("W3-K1: eligibility must not return 'submit' for a JD-required role for a pre-law undergraduate (Harvey, FV-7 brief instance)", () => {
  const elig = eligibility("ashby-harvey-ec074cbf-8d48-4661-b26c-1fdfb01df783.json", "harvey", "persona-law-prelaw.json");
  const namesGap = (elig.reasons || []).some((r) => /juris doctor|\bJD\b|degree|years? of experience/i.test(r));
  assert.ok(elig.verdict !== "submit" || namesGap,
    `pre-law undergraduate was judged eligible for a JD-required role, reasons: ${(elig.reasons || []).join("; ")}`);
});

test("W3-K2: eligibility must not return 'submit' for a Medical-Assistant-Certification role when the profile holds a CNA — a different credential (FV-7 brief instance)", () => {
  const elig = eligibility("greenhouse-oscar-8232510.json", "oscar", "persona-medicine-nursing.json");
  const namesGap = (elig.reasons || []).some((r) => /medical assistant|certification/i.test(r));
  assert.ok(elig.verdict !== "submit" || namesGap,
    `CNA holder was judged eligible for a Medical Assistant Certification role with no named gap, reasons: ${(elig.reasons || []).join("; ")}`);
});

test("W3-K3: eligibility must not return 'submit' when the posting requires a conferred degree + full-time years and the profile is a student with internships only (Northmarq, SS-5 brief instance)", () => {
  const elig = eligibility("greenhouse-northmarq-5431885008.json", "northmarq", "persona-real-estate.json");
  const namesGap = (elig.reasons || []).some((r) => /degree|years? of experience/i.test(r));
  assert.ok(elig.verdict !== "submit" || namesGap,
    `May-2027 student was judged eligible for a degree-required, 1-3-years-full-time role, reasons: ${(elig.reasons || []).join("; ")}`);
});

test("W3-K4: eligibility must not return 'submit' for a 3+ years consulting-experience role for a student persona (Pariveda, SS-5 brief instance)", () => {
  const elig = eligibility("ashby-pariveda-a7757a29-e7ee-452f-95f4-7576b8f6ee87.json", "pariveda", "test-persona.json");
  const namesGap = (elig.reasons || []).some((r) => /years? of experience|experience/i.test(r));
  assert.ok(elig.verdict !== "submit" || namesGap,
    `student persona was judged eligible for a 3+ years experience role, reasons: ${(elig.reasons || []).join("; ")}`);
});

test("W3-K5: positive control — a profile that DOES hold the required RN license is not knockout-blocked on the RN posting", () => {
  const { data, profile } = persona("persona-medicine-nursing.json");
  Profile.addFact(profile, { kind: "certification", title: "Registered Nurse (RN) — Illinois RN License", text: "Active, unrestricted Illinois Registered Nurse (RN) license, issued by the state board (TEST fixture credential)." });
  const prof = withSkills(data, profile);
  const posting = postingFor("greenhouse-oscar-8172223.json", "oscar");
  const fit = Jobs.scoreFit(posting, prof);
  const licenseReasons = (fit.reasons || []).filter((r) => /licen[cs]e/i.test(r));
  assert.deepEqual(licenseReasons, [], `licensed RN was still license-blocked: ${licenseReasons.join("; ")}`);
});

test("W3-K6: positive control — an intern posting with no knockouts does not exclude the student persona (no over-blocking)", () => {
  const { data, profile } = persona("test-persona.json");
  const prof = withSkills(data, profile);
  const posting = postingFor("greenhouse-capco-8152961.json", "capco");
  prof.preferences = Object.assign({}, prof.preferences, { locations: [posting.location] });
  const fit = Jobs.scoreFit(posting, prof);
  assert.equal(fit.excluded, false, `intern posting excluded the student persona: ${(fit.reasons || []).join("; ")}`);
});

/* ---------------- BOARD REGISTRY (BUG-059, W7 gap G3) ---------------- */

test("W3-R1: BOARD_REGISTRY carries the six boards verified live 2026-10-13/14 (Gusto, Gemini, Virtu, Scale AI, Notion, Old Mission Capital)", () => {
  const want = [
    ["Gusto", "greenhouse", "gusto"],
    ["Gemini", "greenhouse", "gemini"],
    ["Virtu Financial", "greenhouse", "virtu"],
    ["Scale AI", "greenhouse", "scaleai"],
    ["Notion", "ashby", "notion"],
    ["Old Mission Capital", "greenhouse", "oldmissioncapital"],
  ];
  for (const [company, provider, board] of want) {
    const entry = Jobs.BOARD_REGISTRY.find((b) => b.company === company);
    assert.ok(entry, `BOARD_REGISTRY has no entry for ${company}`);
    assert.equal(entry.status, "live", `${company}: status=${entry.status}`);
    assert.equal(entry.provider, provider, `${company}: provider=${entry.provider}`);
    assert.equal(entry.board, board, `${company}: board=${entry.board}`);
  }
  const feedBoards = Jobs.boardFeeds().map((f) => f.board);
  for (const [, , board] of want) assert.ok(feedBoards.includes(board), `boardFeeds() does not include ${board}`);
});
