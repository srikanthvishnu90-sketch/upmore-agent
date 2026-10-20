// MI-104 — bespoke program-site fellowship portal families (Crew B,
// D5-class). TWO genuinely different program sites were outside the
// 149/150 seam, so this item builds TWO families under one branch:
//   - eightvc        — the 8VC Fellowship form on 8vc.com (Webflow;
//                      census 2026-10-15 §8: undergraduate engineers at
//                      8VC portfolio startups, Engineering + Design
//                      pathways, rolling until late January)
//   - kleinerperkins — the Kleiner Perkins Fellows application at
//                      fellows.kleinerperkins.com (census 2026-10-15 §7:
//                      summer engineering internships in KP portfolio
//                      companies; top criterion = a product/project
//                      launched from scratch; deadline Jan 31, 2027,
//                      11:59pm PST)
// Neither site's exact field list is published (both censuses record
// "read at drive time"), so each sandbox board's field set is staged
// from its census summary only — identity/contact/education/resume
// fill from confirmed facts; the pathway choice (8VC) and every
// free-text/essay field (project write-ups, leadership, why-8VC) are
// owner asks, never invented; attestations are explicit-only.
// This suite is the permanent replay guard for both families:
// classification incl. lookalike refusals at both gates, a verified
// doorstep per site graded on the payload end state, the free-text
// draft law per site, attestation waits, cross-family mismatch,
// captcha = stop + handoff. No real submission ever happens here
// (sandbox boards = local receipt sinks, labeled TEST).
// FAIL-FIRST: written before either family existed — every test red
// on release/career-v224 @ 3c11e838.
// Check: node --test tests/career-bespoke-sites-portal.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const Browser150 = (() => { try { return require(path.join(root, "packages/domain/150-career-portal-browser.js")); } catch (e) { return null; } })();

const USER = "user-alex-test";
const NOW = "2026-10-16T12:00:00Z";
const EIGHTVC_URL = "https://www.8vc.com/fellowships";
const KP_URL = "https://fellows.kleinerperkins.com/apply";
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
function eightvcSession(opts = {}) {
  assert.equal(typeof Portal.createEightVcSandboxBoard, "function", "MI-104: createEightVcSandboxBoard must exist");
  const board = Portal.createEightVcSandboxBoard(opts.board || {});
  const session = Portal.createPortalSession({ userId: USER, board });
  return { board, session };
}
function kpSession(opts = {}) {
  assert.equal(typeof Portal.createKleinerPerkinsSandboxBoard, "function", "MI-104: createKleinerPerkinsSandboxBoard must exist");
  const board = Portal.createKleinerPerkinsSandboxBoard(opts.board || {});
  const session = Portal.createPortalSession({ userId: USER, board });
  return { board, session };
}
const eightvcPosting = (over = {}) => Object.assign({
  id: "8VC-2027", canonicalKey: "eightvc:8vc:fellowship-2027",
  company: "8VC", role: "8VC Fellowship — Engineering", url: EIGHTVC_URL,
  status: "open", atsFamily: "eightvc",
}, over);
const kpPosting = (over = {}) => Object.assign({
  id: "KP-2027", canonicalKey: "kleinerperkins:fellows:engineering-2027",
  company: "Kleiner Perkins", role: "Kleiner Perkins Fellows — Engineering", url: KP_URL,
  status: "open", atsFamily: "kleinerperkins",
}, over);
const ATTEST = { attestations: { certify_true: { explicit: true, value: true } } };

// ================= 8VC (eightvc family) =================

test("MI-104 E1: 8vc.com hosts classify as the eightvc family", () => {
  for (const url of [EIGHTVC_URL, "https://8vc.com/fellowships", "https://www.8vc.com/fellowships/apply"]) {
    const c = Portal.classifyTarget(url);
    assert.equal(c.allowed, true, url);
    assert.equal(c.atsFamily, "eightvc", url);
    assert.equal(c.kind, "employer_ats", url);
  }
});

test("MI-104 E1b: 8VC lookalike and unknown hosts are still refused", () => {
  for (const url of ["https://8vc.example.com/fellowships", "https://not8vc.com/fellowships", "https://8vc.com.evil.com/fellowships", "https://www.8vc.com.evil.com/fellowships"]) {
    const c = Portal.classifyTarget(url);
    assert.equal(c.allowed, false, url);
    assert.equal(c.code, "UNTESTED_ATS_HOST", url);
  }
  if (Browser150) {
    assert.equal(Browser150.hostAllowed(EIGHTVC_URL).allowed, true);
    assert.equal(Browser150.hostAllowed(EIGHTVC_URL).atsFamily, "eightvc");
    assert.equal(Browser150.hostAllowed("https://8vc.example.com/fellowships").allowed, false);
    assert.equal(Browser150.finalUrlGate(EIGHTVC_URL).allowed, true);
    assert.equal(Browser150.finalUrlGate(EIGHTVC_URL).atsFamily, "eightvc");
  }
});

test("MI-104 E2: the 8VC drive reaches a verified doorstep; pathway + essay fields stay asks; zero submits", () => {
  const { board, session } = eightvcSession();
  const r = Portal.runApply(session, Object.assign({ posting: eightvcPosting(), profile: PROFILE, log: newLog(), now: NOW }, ATTEST));
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
  assert.ok(askIds.includes("pathway"), "the Engineering/Design pathway choice stays an owner ask");
  assert.ok(askIds.includes("project_description"), "the project write-up stays an owner ask");
  assert.ok(askIds.includes("why_8vc_fellowship"), "the why-8VC essay stays an owner ask");
  assert.equal(p.pathway, undefined, "no pathway was invented into the payload");
  assert.equal(p.project_description, undefined, "no project text was invented into the payload");
  assert.equal(p.why_8vc_fellowship, undefined, "no essay text was invented into the payload");
});

test("MI-104 E2b: a confirmed-but-not-owner-draft project answer is NEVER filled on the 8VC form", () => {
  const { board, session } = eightvcSession();
  const profile = Object.assign({}, PROFILE, { answers: Object.assign({}, PROFILE.answers, {
    project_description: { value: "GENERATED TEXT THAT MUST NEVER FILL THE 8VC PROJECT FIELD", confirmed: true },
  }) });
  const r = Portal.runApply(session, Object.assign({ posting: eightvcPosting(), profile, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.payload.project_description, undefined, "a non-draft answer never becomes project text");
  assert.ok((r.asks || []).some((a) => a.field_id === "project_description" && a.reason === "needs_user_draft_confirmation"));
  assert.equal(board.calls.submit, 0);
});

test("MI-104 E2c: the owner's OWN confirmed draft is the only project text that may fill the 8VC field", () => {
  const { board, session } = eightvcSession();
  const profile = Object.assign({}, PROFILE, { answers: Object.assign({}, PROFILE.answers, {
    project_description: { value: OWNER_PROJECT, confirmed: true, draft: true },
  }) });
  const r = Portal.runApply(session, Object.assign({ posting: eightvcPosting(), profile, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.payload.project_description, OWNER_PROJECT, "the owner's own words ride verbatim — never rewritten or invented");
  assert.equal(board.calls.submit, 0);
});

test("MI-104 E3: without the explicit attestation the 8VC drive waits on the user (nothing invented)", () => {
  const { board, session } = eightvcSession();
  const r = Portal.runApply(session, { posting: eightvcPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "awaiting_user");
  assert.ok((r.asks || []).some((a) => a.field_id === "certify_true" && a.reason === "attestation_requires_explicit_confirmation"));
  assert.equal(board.calls.submit, 0);
});

test("MI-104 E3b: board/posting family mismatches are refused both ways (eightvc board, KP + Greenhouse postings)", () => {
  const a = eightvcSession();
  const r1 = Portal.runApply(a.session, { posting: kpPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r1.resultStatus, "blocked");
  assert.equal(r1.code, "BOARD_POSTING_MISMATCH");
  const b = eightvcSession();
  const gh = { id: "GH-1", canonicalKey: "greenhouse:testsystems:intern", company: "TEST Systems",
    role: "Software Engineering Intern", url: "https://boards.greenhouse.io/testsystems/jobs/001", status: "open" };
  const r2 = Portal.runApply(b.session, { posting: gh, profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r2.resultStatus, "blocked");
  assert.equal(r2.code, "BOARD_POSTING_MISMATCH");
});

test("MI-104 E4: captcha at open on the 8VC form stops with CAPTCHA_HANDOFF and a handoff URL, never a solve", () => {
  const { board, session } = eightvcSession({ board: { captchaAt: "open" } });
  const r = Portal.runApply(session, { posting: eightvcPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CAPTCHA_HANDOFF");
  assert.equal(r.handoffUrl, EIGHTVC_URL);
  assert.equal(board.calls.submit, 0);
});

test("MI-104 E4b: captcha at review on the 8VC form stops with CAPTCHA_HANDOFF, never a solve", () => {
  const { board, session } = eightvcSession({ board: { captchaAt: "review" } });
  const r = Portal.runApply(session, Object.assign({ posting: eightvcPosting(), profile: PROFILE, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CAPTCHA_HANDOFF");
  assert.equal(r.handoffUrl, EIGHTVC_URL);
  assert.equal(board.calls.submit, 0);
});

// ================= Kleiner Perkins (kleinerperkins family) =================

test("MI-104 K1: kleinerperkins.com hosts classify as the kleinerperkins family", () => {
  for (const url of [KP_URL, "https://fellows.kleinerperkins.com/", "https://www.kleinerperkins.com/fellows"]) {
    const c = Portal.classifyTarget(url);
    assert.equal(c.allowed, true, url);
    assert.equal(c.atsFamily, "kleinerperkins", url);
    assert.equal(c.kind, "employer_ats", url);
  }
});

test("MI-104 K1b: Kleiner Perkins lookalike and unknown hosts are still refused", () => {
  for (const url of ["https://kleinerperkins.example.com/apply", "https://notkleinerperkins.com/apply", "https://kleinerperkins.com.evil.com/apply", "https://fellows.kleinerperkins.com.evil.com/apply"]) {
    const c = Portal.classifyTarget(url);
    assert.equal(c.allowed, false, url);
    assert.equal(c.code, "UNTESTED_ATS_HOST", url);
  }
  if (Browser150) {
    assert.equal(Browser150.hostAllowed(KP_URL).allowed, true);
    assert.equal(Browser150.hostAllowed(KP_URL).atsFamily, "kleinerperkins");
    assert.equal(Browser150.hostAllowed("https://kleinerperkins.example.com/apply").allowed, false);
    assert.equal(Browser150.finalUrlGate(KP_URL).allowed, true);
    assert.equal(Browser150.finalUrlGate(KP_URL).atsFamily, "kleinerperkins");
  }
});

test("MI-104 K2: the Kleiner Perkins drive reaches a verified doorstep; project + leadership essays stay asks; zero submits", () => {
  const { board, session } = kpSession();
  const r = Portal.runApply(session, Object.assign({ posting: kpPosting(), profile: PROFILE, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.atFinalReview, true);
  const p = r.doorstep.payload;
  assert.equal(p.full_name, PROFILE.name);
  assert.equal(p.email, PROFILE.email);
  assert.equal(p.country, "United States");
  assert.equal(p.school, "Test University (TEST)");
  assert.equal(p.degree, "Bachelors in Computer Science (TEST)");
  assert.equal(p.discipline, "Computer Science");
  assert.equal(p.graduation_year, "2029");
  assert.equal(p.work_authorization, "Yes");
  assert.equal(p.sponsorship, "No");
  assert.equal(p.resume.sha256, PROFILE.resume.sha256);
  assert.ok(r.doorstep.payloadSha256 && /^[0-9a-f]{64}$/.test(r.doorstep.payloadSha256), "payload hash recorded");
  assert.equal(board.calls.submit, 0, "doorstep only — no submit without approval");
  const askIds = (r.asks || []).map((a) => a.field_id);
  assert.ok(askIds.includes("project_you_launched_from_scratch"), "the launched-project write-up (KP's top criterion) stays an owner ask");
  assert.ok(askIds.includes("campus_leadership_and_roles"), "the campus-leadership write-up stays an owner ask");
  assert.equal(p.project_you_launched_from_scratch, undefined, "no project text was invented into the payload");
  assert.equal(p.campus_leadership_and_roles, undefined, "no leadership text was invented into the payload");
});

test("MI-104 K2b: a confirmed-but-not-owner-draft project answer is NEVER filled on the KP form", () => {
  const { board, session } = kpSession();
  const profile = Object.assign({}, PROFILE, { answers: Object.assign({}, PROFILE.answers, {
    project_you_launched_from_scratch: { value: "GENERATED TEXT THAT MUST NEVER FILL THE KP PROJECT FIELD", confirmed: true },
  }) });
  const r = Portal.runApply(session, Object.assign({ posting: kpPosting(), profile, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.payload.project_you_launched_from_scratch, undefined, "a non-draft answer never becomes project text");
  assert.ok((r.asks || []).some((a) => a.field_id === "project_you_launched_from_scratch" && a.reason === "needs_user_draft_confirmation"));
  assert.equal(board.calls.submit, 0);
});

test("MI-104 K2c: the owner's OWN confirmed draft is the only project text that may fill the KP field", () => {
  const { board, session } = kpSession();
  const profile = Object.assign({}, PROFILE, { answers: Object.assign({}, PROFILE.answers, {
    project_you_launched_from_scratch: { value: OWNER_PROJECT, confirmed: true, draft: true },
  }) });
  const r = Portal.runApply(session, Object.assign({ posting: kpPosting(), profile, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.payload.project_you_launched_from_scratch, OWNER_PROJECT, "the owner's own words ride verbatim — never rewritten or invented");
  assert.equal(board.calls.submit, 0);
});

test("MI-104 K3: without the explicit attestation the KP drive waits on the user (nothing invented)", () => {
  const { board, session } = kpSession();
  const r = Portal.runApply(session, { posting: kpPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "awaiting_user");
  assert.ok((r.asks || []).some((a) => a.field_id === "certify_true" && a.reason === "attestation_requires_explicit_confirmation"));
  assert.equal(board.calls.submit, 0);
});

test("MI-104 K3b: a board/posting family mismatch is refused (kleinerperkins board, eightvc posting)", () => {
  const { session } = kpSession();
  const r = Portal.runApply(session, { posting: eightvcPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "BOARD_POSTING_MISMATCH");
});

test("MI-104 K4: captcha at open on the KP form stops with CAPTCHA_HANDOFF and a handoff URL, never a solve", () => {
  const { board, session } = kpSession({ board: { captchaAt: "open" } });
  const r = Portal.runApply(session, { posting: kpPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CAPTCHA_HANDOFF");
  assert.equal(r.handoffUrl, KP_URL);
  assert.equal(board.calls.submit, 0);
});

test("MI-104 K4b: captcha at review on the KP form stops with CAPTCHA_HANDOFF, never a solve", () => {
  const { board, session } = kpSession({ board: { captchaAt: "review" } });
  const r = Portal.runApply(session, Object.assign({ posting: kpPosting(), profile: PROFILE, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CAPTCHA_HANDOFF");
  assert.equal(r.handoffUrl, KP_URL);
  assert.equal(board.calls.submit, 0);
});
