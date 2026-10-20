// MI-098 — Constellation fellowship portal family (Crew B, D5-class).
// The Constellation form platform (Anthropic Fellows' real application;
// census 2026-10-15 §1) was outside the 149/150 seam: the Greenhouse
// posting is only a pointer and submitting its shell alone is NOT an
// application. This suite is the permanent replay guard:
//   - the Constellation family is classified + drivable through 149's
//     pipeline to a VERIFIED doorstep (fields read at drive time, fills
//     verified by readback via the pipeline's own gates, typed stops);
//   - the Greenhouse pointer shell can never be doorsteped/submitted as
//     if it were the application (CONSTELLATION_FORM_REQUIRED);
//   - captcha = stop + handoff, never solved; unknown hosts still
//     refused; no real submission ever happens in this suite (sandbox
//     board = local receipt sink, labeled TEST; browser leg runs only
//     against the localhost fixture when Playwright is available).
// FAIL-FIRST: written before the family existed — every test red on
// release/career-v224 @ 3c11e838.
// Check: node --test tests/career-constellation-portal.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const Browser150 = (() => { try { return require(path.join(root, "packages/domain/150-career-portal-browser.js")); } catch (e) { return null; } })();

const USER = "user-alex-test";
const NOW = "2026-10-16T12:00:00Z";
const CONSTELLATION_URL = "https://constellation.jobs/anthropic-fellows/apply";
const POINTER_URL = "https://job-boards.greenhouse.io/anthropic/jobs/5183044008";
const PROFILE = {
  name: "Alex Testcase (TEST)",
  email: "alex.testcase@example.test",
  phone: "+1 000 555 0100",
  location: "Chicago, IL",
  country: "United States",
  linkedin: "https://www.linkedin.com/in/alex-testcase",
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: {
    work_authorization: { value: "Yes", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
  },
};
const newLog = () => ({ records: [] });
function constellationSession(opts = {}) {
  assert.equal(typeof Portal.createConstellationSandboxBoard, "function", "MI-098: createConstellationSandboxBoard must exist");
  const board = Portal.createConstellationSandboxBoard(opts.board || {});
  const session = Portal.createPortalSession({ userId: USER, board });
  return { board, session };
}
const fellowsPosting = (over = {}) => Object.assign({
  id: "FELLOW-ANTHROPIC-001", canonicalKey: "constellation:anthropic:anthropic-fellows",
  company: "Anthropic", role: "Anthropic Fellows Program", url: CONSTELLATION_URL,
  status: "open", atsFamily: "constellation",
}, over);

// ---------- §6.3 classification: the family exists, the gate still holds ----------
test("MI-098 C1: Constellation hosts classify as the constellation family", () => {
  for (const url of [CONSTELLATION_URL, "https://apply.constellation.com/fellows", "https://fellows.constellation.jobs/apply"]) {
    const c = Portal.classifyTarget(url);
    assert.equal(c.allowed, true, url);
    assert.equal(c.atsFamily, "constellation", url);
    assert.equal(c.kind, "employer_ats", url);
  }
});

test("MI-098 C1b: lookalike and unknown hosts are still refused", () => {
  for (const url of ["https://constellation.example.com/apply", "https://notconstellation.jobs/apply", "https://constellation-jobs.example.org/apply"]) {
    const c = Portal.classifyTarget(url);
    assert.equal(c.allowed, false, url);
    assert.equal(c.code, "UNTESTED_ATS_HOST", url);
  }
  if (Browser150) {
    assert.equal(Browser150.hostAllowed(CONSTELLATION_URL).allowed, true);
    assert.equal(Browser150.hostAllowed(CONSTELLATION_URL).atsFamily, "constellation");
    assert.equal(Browser150.hostAllowed("https://constellation.example.com/apply").allowed, false);
    assert.equal(Browser150.finalUrlGate(CONSTELLATION_URL).allowed, true);
    assert.equal(Browser150.finalUrlGate(CONSTELLATION_URL).atsFamily, "constellation");
  }
});

// ---------- the pointer law: the Greenhouse shell is NOT an application ----------
test("MI-098 C2: a Greenhouse pointer posting stops CONSTELLATION_FORM_REQUIRED and never opens the board", () => {
  assert.equal(typeof Portal.isConstellationPointer, "function", "MI-098: isConstellationPointer must exist");
  const pointer = {
    id: "GH-5183044008", canonicalKey: "greenhouse:anthropic:anthropic-fellows-program",
    company: "Anthropic", role: "Anthropic Fellows Program", url: POINTER_URL, status: "open",
    description: "Applications and interviews are managed by Constellation, our official recruiting partner. You will not be considered unless you complete the Constellation application form. Apply here by October 18.",
  };
  assert.equal(Portal.isConstellationPointer(pointer), true);
  const { board, session } = constellationSession();
  const r = Portal.runApply(session, { posting: pointer, profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CONSTELLATION_FORM_REQUIRED");
  assert.equal(board.calls.open, 0, "the pointer shell was never opened as an application");
  assert.equal(board.calls.submit, 0, "nothing was submitted");
});

test("MI-098 C2b: an ordinary Greenhouse posting is not a Constellation pointer", () => {
  const plain = { url: "https://boards.greenhouse.io/testsystems/jobs/001", description: "A normal engineering internship." };
  assert.equal(Portal.isConstellationPointer(plain), false);
  const flagged = { url: POINTER_URL, constellationFormUrl: CONSTELLATION_URL };
  assert.equal(Portal.isConstellationPointer(flagged), true, "an explicit constellationFormUrl marks the pointer");
});

// ---------- the doorstep: the family drives end-to-end on confirmed facts ----------
test("MI-098 C3: the Constellation drive reaches a verified doorstep; owner-only fields stay asks; zero submits", () => {
  const { board, session } = constellationSession();
  const r = Portal.runApply(session, { posting: fellowsPosting(), profile: PROFILE, log: newLog(), now: NOW,
    attestations: { certify_true: { explicit: true, value: true } } });
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.atFinalReview, true);
  const p = r.doorstep.payload;
  assert.equal(p.full_name, PROFILE.name);
  assert.equal(p.email, PROFILE.email);
  assert.equal(p.country, "United States");
  assert.equal(p.work_authorization, "Yes");
  assert.equal(p.sponsorship, "No");
  assert.equal(p.resume.sha256, PROFILE.resume.sha256);
  assert.ok(r.doorstep.payloadSha256 && /^[0-9a-f]{64}$/.test(r.doorstep.payloadSha256), "payload hash recorded");
  assert.equal(board.calls.submit, 0, "doorstep only — no submit without approval");
  // availability + research statement are owner-decision/essay fields:
  // present on the form, never invented — they ride as non-required asks.
  const askIds = (r.asks || []).map((a) => a.field_id);
  assert.ok(askIds.includes("availability"), "availability stays an owner ask");
  assert.ok(askIds.includes("research_statement"), "research statement stays an owner ask");
});

test("MI-098 C3b: without the explicit attestation the drive waits on the user (nothing invented)", () => {
  const { board, session } = constellationSession();
  const r = Portal.runApply(session, { posting: fellowsPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "awaiting_user");
  assert.ok((r.asks || []).some((a) => a.field_id === "certify_true" && a.reason === "attestation_requires_explicit_confirmation"));
  assert.equal(board.calls.submit, 0);
});

test("MI-098 C3c: a board/posting family mismatch is refused (constellation board, greenhouse posting)", () => {
  const { session } = constellationSession();
  const gh = { id: "GH-1", canonicalKey: "greenhouse:testsystems:intern", company: "TEST Systems",
    role: "Software Engineering Intern", url: "https://boards.greenhouse.io/testsystems/jobs/001", status: "open" };
  const r = Portal.runApply(session, { posting: gh, profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "BOARD_POSTING_MISMATCH");
});

test("MI-098 C4: captcha at open stops with CAPTCHA_HANDOFF and a handoff URL, never a solve", () => {
  const { board, session } = constellationSession({ board: { captchaAt: "open" } });
  const r = Portal.runApply(session, { posting: fellowsPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CAPTCHA_HANDOFF");
  assert.equal(r.handoffUrl, CONSTELLATION_URL);
  assert.equal(board.calls.submit, 0);
});

test("MI-098 C5: the Anthropic Fellows drive — pointer posting WITH its Constellation URL drives the Constellation form", () => {
  const { board, session } = constellationSession();
  const pointer = fellowsPosting({ url: POINTER_URL, constellationFormUrl: CONSTELLATION_URL,
    description: "You will not be considered unless you complete the Constellation application form." });
  const r = Portal.runApply(session, { posting: pointer, profile: PROFILE, log: newLog(), now: NOW,
    attestations: { certify_true: { explicit: true, value: true } } });
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.atFinalReview, true);
  assert.equal(board.calls.submit, 0);
});
