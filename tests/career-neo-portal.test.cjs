// MI-102 — Neo Bubble fellowship portal family (Crew B, D5-class).
// Neo's bespoke portal (portal.neo.com/residency, a Bubble app) was
// outside the 149/150 seam, and its form content does not render in a
// text fetch — even the Winter 2027 cycle's field list and deadline
// are uncaptured (fellowship census 2026-10-15 §5). This suite is the
// permanent replay guard:
//   - the neo family is classified host-precisely (neo.com end-
//     anchored, so lookalikes stay UNTESTED_ATS_HOST) at both the 149
//     and 150 gates and is drivable through 149's pipeline to a
//     VERIFIED doorstep;
//   - the sandbox board's field set is staged from the census summary
//     ONLY (§5: Winter 2027, up to 20 startups + student teams, 3
//     months at Neo's SF workspace with a 2-week bootcamp, startups
//     $750K uncapped SAFE, students $40K grants each) — identity/
//     contact/education/resume + work-authorization/sponsorship fill
//     from confirmed facts only; the startup-vs-student applicant
//     track is the applicant's own choice and fills only from a
//     confirmed answer; every free-text field fills ONLY from the
//     owner's own confirmed draft, never invented; the live portal's
//     fields are read at drive time by module 150;
//   - captcha = stop + handoff, never solved; attestations are
//     explicit-only; no real submission ever happens in this suite
//     (sandbox board = local receipt sink, labeled TEST).
// FAIL-FIRST: written before the family existed — every test red on
// release/career-v224 @ 3c11e838.
// Check: node --test tests/career-neo-portal.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const Browser150 = (() => { try { return require(path.join(root, "packages/domain/150-career-portal-browser.js")); } catch (e) { return null; } })();

const USER = "user-alex-test";
const NOW = "2026-10-17T12:00:00Z";
const NEO_URL = "https://portal.neo.com/residency";
const OWNER_PROJECT = "OWNER-WRITTEN PROJECT TEXT (TEST fixture text — the applicant's own words, confirmed as a draft by the owner)";
const PROFILE = {
  name: "Alex Testcase (TEST)",
  email: "alex.testcase@example.test",
  phone: "+1 000 555 0100",
  location: "Chicago, IL",
  country: "United States",
  linkedin: "https://www.linkedin.com/in/alex-testcase",
  website: "https://alex-testcase.example.test",
  education: { school: "Test University (TEST)", degree: "Bachelors in Computer Science (TEST)", discipline: "Computer Science", graduation_year: "2029" },
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: {
    work_authorization: { value: "Yes", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
  },
};
const newLog = () => ({ records: [] });
function neoSession(opts = {}) {
  assert.equal(typeof Portal.createNeoSandboxBoard, "function", "MI-102: createNeoSandboxBoard must exist");
  const board = Portal.createNeoSandboxBoard(opts.board || {});
  const session = Portal.createPortalSession({ userId: USER, board });
  return { board, session };
}
const neoPosting = (over = {}) => Object.assign({
  id: "NEO-W27", canonicalKey: "neo:neo:residency-winter-2027",
  company: "Neo", role: "Neo Residency — Winter 2027", url: NEO_URL,
  status: "open", atsFamily: "neo",
}, over);
const ATTEST = { attestations: { certify_true: { explicit: true, value: true } } };

test("MI-102 N1: neo.com hosts classify as the neo family", () => {
  for (const url of [NEO_URL, "https://neo.com/residency", "https://www.neo.com/residency"]) {
    const c = Portal.classifyTarget(url);
    assert.equal(c.allowed, true, url);
    assert.equal(c.atsFamily, "neo", url);
    assert.equal(c.kind, "employer_ats", url);
  }
});

test("MI-102 N1b: Neo lookalike and unknown hosts are still refused", () => {
  for (const url of ["https://neo.example.com/residency", "https://notneo.com/residency", "https://neo.com.evil.com/residency", "https://portal.neo.com.evil.com/residency"]) {
    const c = Portal.classifyTarget(url);
    assert.equal(c.allowed, false, url);
    assert.equal(c.code, "UNTESTED_ATS_HOST", url);
  }
  if (Browser150) {
    assert.equal(Browser150.hostAllowed(NEO_URL).allowed, true);
    assert.equal(Browser150.hostAllowed(NEO_URL).atsFamily, "neo");
    assert.equal(Browser150.hostAllowed("https://neo.example.com/residency").allowed, false);
    assert.equal(Browser150.finalUrlGate(NEO_URL).allowed, true);
    assert.equal(Browser150.finalUrlGate(NEO_URL).atsFamily, "neo");
  }
});

test("MI-102 N2: the Neo drive reaches a verified doorstep; track + essay fields stay asks; zero submits", () => {
  const { board, session } = neoSession();
  const r = Portal.runApply(session, Object.assign({ posting: neoPosting(), profile: PROFILE, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.atFinalReview, true);
  const p = r.doorstep.payload;
  assert.equal(p.full_name, PROFILE.name);
  assert.equal(p.email, PROFILE.email);
  assert.equal(p.country, "United States");
  assert.equal(p.school, "Test University (TEST)");
  assert.equal(p.graduation_year, "2029");
  assert.equal(p.work_authorization, "Yes");
  assert.equal(p.sponsorship, "No");
  assert.equal(p.resume.sha256, PROFILE.resume.sha256);
  assert.ok(r.doorstep.payloadSha256 && /^[0-9a-f]{64}$/.test(r.doorstep.payloadSha256), "payload hash recorded");
  assert.equal(board.calls.submit, 0, "doorstep only — no submit without approval");
  const askIds = (r.asks || []).map((a) => a.field_id);
  assert.ok(askIds.includes("applicant_track"), "the startup-vs-student track choice stays an owner ask");
  assert.ok(askIds.includes("startup_or_project_description"), "the project write-up stays an owner ask");
  assert.ok(askIds.includes("why_neo_residency"), "the why-Neo field stays an owner ask");
  assert.equal(p.applicant_track, undefined, "no track was invented into the payload");
  assert.equal(p.startup_or_project_description, undefined, "no project text was invented into the payload");
  assert.equal(p.why_neo_residency, undefined, "no essay text was invented into the payload");
});

test("MI-102 N2b: a confirmed-but-not-owner-draft project answer is NEVER filled on the Neo form", () => {
  const { board, session } = neoSession();
  const profile = Object.assign({}, PROFILE, { answers: Object.assign({}, PROFILE.answers, {
    startup_or_project_description: { value: "GENERATED TEXT THAT MUST NEVER FILL THE NEO PROJECT FIELD", confirmed: true },
  }) });
  const r = Portal.runApply(session, Object.assign({ posting: neoPosting(), profile, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.payload.startup_or_project_description, undefined, "a non-draft answer never becomes project text");
  assert.ok((r.asks || []).some((a) => a.field_id === "startup_or_project_description" && a.reason === "needs_user_draft_confirmation"));
  assert.equal(board.calls.submit, 0);
});

test("MI-102 N2c: the owner's OWN confirmed draft is the only project text that may fill the Neo field", () => {
  const { board, session } = neoSession();
  const profile = Object.assign({}, PROFILE, { answers: Object.assign({}, PROFILE.answers, {
    startup_or_project_description: { value: OWNER_PROJECT, confirmed: true, draft: true },
  }) });
  const r = Portal.runApply(session, Object.assign({ posting: neoPosting(), profile, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.payload.startup_or_project_description, OWNER_PROJECT, "the owner's own words ride verbatim — never rewritten or invented");
  assert.equal(board.calls.submit, 0);
});

test("MI-102 N3: without the explicit attestation the Neo drive waits on the user (nothing invented)", () => {
  const { board, session } = neoSession();
  const r = Portal.runApply(session, { posting: neoPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "awaiting_user");
  assert.ok((r.asks || []).some((a) => a.field_id === "certify_true" && a.reason === "attestation_requires_explicit_confirmation"));
  assert.equal(board.calls.submit, 0);
});

test("MI-102 N3b: a board/posting family mismatch is refused (neo board, greenhouse posting)", () => {
  const { session } = neoSession();
  const gh = { id: "GH-1", canonicalKey: "greenhouse:testsystems:intern", company: "TEST Systems",
    role: "Software Engineering Intern", url: "https://boards.greenhouse.io/testsystems/jobs/001", status: "open" };
  const r = Portal.runApply(session, { posting: gh, profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "BOARD_POSTING_MISMATCH");
});

test("MI-102 N4: captcha at open stops with CAPTCHA_HANDOFF and a handoff URL, never a solve", () => {
  const { board, session } = neoSession({ board: { captchaAt: "open" } });
  const r = Portal.runApply(session, { posting: neoPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CAPTCHA_HANDOFF");
  assert.equal(r.handoffUrl, NEO_URL);
  assert.equal(board.calls.submit, 0);
});

test("MI-102 N4b: captcha at review stops with CAPTCHA_HANDOFF, never a solve", () => {
  const { board, session } = neoSession({ board: { captchaAt: "review" } });
  const r = Portal.runApply(session, Object.assign({ posting: neoPosting(), profile: PROFILE, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CAPTCHA_HANDOFF");
  assert.equal(r.handoffUrl, NEO_URL);
  assert.equal(board.calls.submit, 0);
});
