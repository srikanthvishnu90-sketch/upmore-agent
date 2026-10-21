/* D-007 quarantine-bypass proofs (owner ruling 2026-10-21).
   One proof per drafter, same shape: seed a fact set containing a
   QUARANTINED fact carrying a unique marker; run the drafter; assert
   the marker appears NOWHERE in the output — with a positive control
   (cleared content DOES appear) so a drafter that simply refused
   everything cannot pass. Synthetic facts only.
   Fail-first record (pre-conversion, cea914fe): the 132 answer and
   employer-guard proofs and the 124 tier proof FAILED — see
   docs/career/trusted-fact-reader-2026-10-21.md. */
const test = require("node:test");
const assert = require("node:assert/strict");
const Profile = require("../packages/domain/122-career-profile.js");
const Trusted = require("../packages/domain/167-career-trusted-facts.js");
const Tailor = require("../packages/domain/123-career-tailor.js");
const Outreach = require("../packages/domain/124-career-outreach.js");
const Apply = require("../packages/domain/132-career-apply.js");
const Packets = require("../packages/domain/133-career-packets.js");
const Portal = require("../packages/domain/149-career-portal-apply.js");
const Prep = require("../packages/domain/127-career-prep.js");

const M = "ZXQMARKER";
const has = (o) => JSON.stringify(o === undefined ? null : o).includes(M);

function baseProfile(extra) {
  const p = Profile.createProfile({ basics: { name: "Test Person", location: "Chicago, IL" } });
  Profile.addFact(p, { kind: "experience", title: "Engineer at Alpha", org: "Alpha", text: "Built Python APIs at Alpha serving 400 users", bullets: ["Built Python APIs"], skills: ["Python"], start: "2024-01", end: "2025-01" });
  Profile.addFact(p, { kind: "education", title: "B.S. Computer Science", org: "State University", text: "B.S. Computer Science, State University" });
  for (const f of extra || []) Profile.addFact(p, f);
  return p;
}
const draftExp = () => ({ kind: "experience", title: `${M} Lead at ${M}Corp`, org: `${M}Corp`, text: `${M} led the ${M}SKILL programme at ${M}Corp with 9999 users`, bullets: [`${M} bullet`], skills: [`${M}SKILL`], needs_confirmation: true, start: "2023-01", end: "2026-01" });
const JD = `Software Engineer (TEST)\nRequired: Python, ${M}SKILL.\nYou will build APIs.`;
const CIR = { company: "TEST Systems Inc", facts: [{ text: "TEST Systems Inc launched a self-serve analytics product in March 2026 (TEST fact)." }] };

// ---------- the reader itself ----------
test("reader: quarantined facts are unreachable; no API surface includes them", () => {
  const p = baseProfile([draftExp(),
    { kind: "other", title: "draft-status only", text: `${M} statusdraft`, status: "draft" },
    { kind: "other", title: "held", text: `${M} heldfact`, status: "held" }]);
  const cleared = Trusted.trustedFacts(p);
  assert.ok(!has(cleared), "trustedFacts leaked a quarantined fact");
  assert.ok(cleared.some((f) => (f.text || "").includes("Python")), "positive control: confirmed fact present");
  assert.ok(!has(Trusted.trustedProfile(p)), "trustedProfile view leaked");
  const draft = p.facts.find((f) => (f.text || "").includes(M));
  assert.equal(Trusted.trustedFactById(p, draft.id), null, "quarantined fact readable by id");
  assert.equal(Trusted.isQuarantined({ needs_confirmation: false, status: "confirmed" }), false);
  assert.equal(Trusted.isQuarantined({ status: "draft" }), true);
  assert.equal(Trusted.isQuarantined({ needs_confirmation: true, status: "confirmed" }), true);
});

// ---------- (b) resume tailor ----------
test("proof/tailor: quarantined fact cannot reach a tailored resume", () => {
  const r = Tailor.tailorResume(baseProfile([draftExp()]), JD, CIR);
  assert.equal(r.ok, true, "positive control: tailor still produces a resume");
  assert.ok(!has(r), "marker leaked into tailorResume output");
  assert.ok(JSON.stringify(r).includes("Python"), "positive control: confirmed skill present");
});

// ---------- (c) cover letter (123's generateCoverLetter) ----------
test("proof/cover: quarantined fact cannot reach a cover letter", () => {
  const p = baseProfile([draftExp()]);
  // Long confirmed experience text so the letter can reach its word window from cleared facts alone.
  Profile.addFact(p, { kind: "experience", title: "Analyst at Beta", org: "Beta", text: "Analyzed Python data pipelines at Beta for two years, building weekly reporting for forty stakeholders, automating the ingest checks, documenting every model assumption, and presenting findings to the operating team each month with measured accuracy improvements across three consecutive quarters of production use", skills: ["Python"], start: "2022-01", end: "2024-01" });
  const r = Tailor.generateCoverLetter(p, JD, CIR);
  assert.ok(!has(r), "marker leaked into cover letter result");
  if (r.ok) assert.ok(r.text.includes("Python"), "positive control: letter built from confirmed facts");
});

// ---------- (a) essay drafter (133 medEssayPacket) ----------
test("proof/essay: quarantined fact cannot reach an essay packet", () => {
  const r = Packets.medEssayPacket(baseProfile([draftExp()]), ["Personal statement"]);
  assert.equal(r.ok, true, "positive control: packet builds from confirmed facts");
  assert.ok(!has(r), "marker leaked into essay packet");
  assert.ok(JSON.stringify(r).includes("Python"), "positive control: confirmed fact point present");
});

// ---------- (d) outreach drafter (124 drafting side, not the send sink) ----------
test("proof/outreach: unsourced + unverified facts cannot draft or elevate tier", () => {
  const tierCand = { person_id: "p0", full_name: "Pat Tester", current_firm: "Beta Bank", title: "Analyst", work_email: "pat@beta.test",
    personalization_facts: [
      { fact: `${M} unsourced claim`, strength: "strong" },
      { fact: `${M} referred the user`, kind: "referral", source_url: "https://example.test/x", verified: false },
    ] };
  assert.notEqual(Outreach.determineTier(tierCand, {}), "A", "unsourced/unverified facts elevated the tier");
  const cand = { person_id: "p1", full_name: "Pat Tester", current_firm: "Beta Bank", title: "Analyst", work_email: "pat@beta.test",
    personalization_facts: [
      { fact: `${M} unsourced claim`, strength: "strong" },
      { fact: `${M} referred the user`, kind: "referral", source_url: "https://example.test/x", verified: false },
      { fact: "spoke on the alumni panel about diligence", source_url: "https://example.test/panel", strength: "strong" },
    ] };
  const d = Outreach.draftFor(cand, { name: "Test Person", school: "State University" }, {});
  assert.ok(!has({ body: d.body, subject: d.subject, facts_used: d.facts_used }), "marker leaked into outreach draft");
  assert.ok((d.body || "").includes("alumni panel"), "positive control: sourced fact drafted");
});

// ---------- (e) application answers (132 saved answers + employer guard) ----------
test("proof/answers: quarantined fact cannot flip a saved answer or block as employer", () => {
  const p = baseProfile([{ kind: "other", title: "Visa", text: `${M} F-1 OPT then H-1B`, needs_confirmation: true }]);
  p.constraints.needsSponsorship = true;
  assert.equal(Apply.savedSponsorshipAnswer(p), "Yes — I will require sponsorship.", "quarantined text flipped the sponsorship answer");
  const g = Apply.checkCurrentEmployer(baseProfile([draftExp()]), `${M}Corp`);
  assert.equal(g.blocked, false, "quarantined fact blocked an application as current employer");
});

// ---------- (f) portal answer derivation (149) regression guard ----------
test("proof/portal-answers: quarantined bank facts derive no answers", () => {
  const bank = { basics: { name: "Test Person" }, facts: [
    { id: "F-1", kind: "profile", name: "Country", value: `${M}LAND`, status: "confirmed", needs_confirmation: true },
    { id: "F-2", kind: "eligibility", name: "Work authorization", value: "Yes", status: "draft", needs_confirmation: false },
    { id: "F-3", kind: "eligibility", name: "Sponsorship required", value: "No", status: "confirmed", needs_confirmation: false },
  ] };
  const r = Portal.deriveAnswers(bank, new Date("2026-10-21T00:00:00Z"));
  assert.ok(!has(r), "marker leaked into derived answers");
  assert.equal(r.answers.work_authorization, undefined, "draft-status fact derived an answer");
  assert.equal(r.answers.sponsorship && r.answers.sponsorship.value, "No", "positive control: confirmed fact still derives");
});

// ---------- (g) prep story drafting (127 failureStoryFromFacts) ----------
test("proof/prep: a quarantined setback fact cannot become a prep story", () => {
  const p = baseProfile([{ kind: "experience", title: `${M} failure`, org: "X", text: `${M} failure: the launch broke and the release was delayed`, needs_confirmation: true }]);
  const r = Prep.failureStoryFromFacts(p);
  assert.equal(r.ok, false, "quarantined fact was drafted into a failure story");
  assert.ok(!has(r), "marker leaked into prep story");
});
