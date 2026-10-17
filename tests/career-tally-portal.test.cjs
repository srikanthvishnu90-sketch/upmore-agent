// MI-099 — Tally fellowship portal family (Crew B, D5-class).
// The Tally form platform (tally.so — a16z Academy Fellowship Stage 1;
// census 2026-10-15 §10) was outside the 149/150 seam: the seam drove
// Greenhouse/Lever/Ashby/SmartRecruiters only. This suite is the
// permanent replay guard:
//   - the Tally family is classified + drivable through 149's pipeline
//     to a VERIFIED doorstep (fields read at drive time, fills verified
//     by readback via the pipeline's own gates, typed stops);
//   - fields fill from confirmed facts only — the essay is the owner's
//     own writing (the program's AI policy: AI may not write it), the
//     short video and the high-school transcript are owner-supplied
//     artifacts; all three stay asks, never invented;
//   - captcha = stop + handoff, never solved; lookalike hosts still
//     refused; no real submission ever happens in this suite (sandbox
//     board = local receipt sink, labeled TEST; browser leg runs only
//     against the localhost fixture when Playwright is available).
// FAIL-FIRST: written before the family existed — every test red on
// release/career-v224 @ 3c11e838.
// Check: node --test tests/career-tally-portal.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const Browser150 = (() => { try { return require(path.join(root, "packages/domain/150-career-portal-browser.js")); } catch (e) { return null; } })();

const USER = "user-alex-test";
const NOW = "2026-10-16T12:00:00Z";
const TALLY_URL = "https://tally.so/r/a16z-academy-stage1";
const PROFILE = {
  name: "Alex Testcase (TEST)",
  email: "alex.testcase@example.test",
  phone: "+1 000 555 0100",
  location: "Chicago, IL",
  country: "United States",
  linkedin: "https://www.linkedin.com/in/alex-testcase",
  website: "https://alextestcase.example.test/portfolio",
  test_scores: "SAT 1560",
};
const newLog = () => ({ records: [] });
function tallySession(opts = {}) {
  assert.equal(typeof Portal.createTallySandboxBoard, "function", "MI-099: createTallySandboxBoard must exist");
  const board = Portal.createTallySandboxBoard(opts.board || {});
  const session = Portal.createPortalSession({ userId: USER, board });
  return { board, session };
}
const academyPosting = (over = {}) => Object.assign({
  id: "FELLOW-A16Z-001", canonicalKey: "tally:a16z-academy:academy-fellowship-founding-class",
  company: "a16z Academy", role: "Academy Fellowship (Founding Class)", url: TALLY_URL,
  status: "open", atsFamily: "tally",
}, over);

// ---------- §6.3 classification: the family exists, the gate still holds ----------
test("MI-099 T1: Tally hosts classify as the tally family", () => {
  for (const url of [TALLY_URL, "https://tally.so/r/some-form", "https://apply.tally.so/r/some-form"]) {
    const c = Portal.classifyTarget(url);
    assert.equal(c.allowed, true, url);
    assert.equal(c.atsFamily, "tally", url);
    assert.equal(c.kind, "employer_ats", url);
  }
});

test("MI-099 T1b: lookalike and unknown hosts are still refused", () => {
  for (const url of ["https://tally.so.example.com/r/x", "https://nottally.so/r/x", "https://tally-so.example.org/r/x", "https://tally.so.evil.com/r/x"]) {
    const c = Portal.classifyTarget(url);
    assert.equal(c.allowed, false, url);
    assert.equal(c.code, "UNTESTED_ATS_HOST", url);
  }
  if (Browser150) {
    assert.equal(Browser150.hostAllowed(TALLY_URL).allowed, true);
    assert.equal(Browser150.hostAllowed(TALLY_URL).atsFamily, "tally");
    assert.equal(Browser150.hostAllowed("https://tally.so.example.com/r/x").allowed, false);
    assert.equal(Browser150.finalUrlGate(TALLY_URL).allowed, true);
    assert.equal(Browser150.finalUrlGate(TALLY_URL).atsFamily, "tally");
  }
});

test("MI-099 T1c: module 150 binds a test-scores field to the confirmed test_scores fact", () => {
  assert.ok(Browser150, "module 150 must load");
  const { defs } = Browser150.classifyFields([
    { label: "Test scores (SAT/ACT, if any)", name: "test_scores", id: "test_scores", inputType: "text", tag: "input", selector: "#test_scores", required: false },
  ]);
  assert.equal(defs.length, 1);
  assert.equal(defs[0].kind, "standard");
  assert.equal(defs[0].profile_key, "test_scores");
});

// ---------- the doorstep: the family drives end-to-end on confirmed facts ----------
test("MI-099 T2: the Tally drive reaches a verified doorstep; owner-only fields stay asks; zero submits", () => {
  const { board, session } = tallySession();
  const r = Portal.runApply(session, { posting: academyPosting(), profile: PROFILE, log: newLog(), now: NOW,
    attestations: { certify_true: { explicit: true, value: true } } });
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.atFinalReview, true);
  const p = r.doorstep.payload;
  assert.equal(p.full_name, PROFILE.name);
  assert.equal(p.email, PROFILE.email);
  assert.equal(p.country, "United States");
  assert.equal(p.portfolio, PROFILE.website);
  assert.equal(p.test_scores, "SAT 1560");
  assert.ok(r.doorstep.payloadSha256 && /^[0-9a-f]{64}$/.test(r.doorstep.payloadSha256), "payload hash recorded");
  assert.equal(board.calls.submit, 0, "doorstep only — no submit without approval");
  // The essay (owner's own writing under the program's AI policy), the
  // short video and the transcript (owner-supplied artifacts) are
  // present on the form, never invented — they ride as asks and never
  // enter the would-submit payload.
  const askIds = (r.asks || []).map((a) => a.field_id);
  assert.ok(askIds.includes("essay"), "essay stays an owner ask");
  assert.ok(askIds.includes("video_link"), "video link stays an owner ask");
  assert.ok(askIds.includes("transcript"), "transcript stays an owner ask");
  assert.equal(p.essay, undefined, "no essay text was invented");
  assert.equal(p.video_link, undefined, "no video link was invented");
  assert.equal(p.transcript, undefined, "no transcript was invented");
});

test("MI-099 T2b: without the explicit attestation the drive waits on the user (nothing invented)", () => {
  const { board, session } = tallySession();
  const r = Portal.runApply(session, { posting: academyPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "awaiting_user");
  assert.ok((r.asks || []).some((a) => a.field_id === "certify_true" && a.reason === "attestation_requires_explicit_confirmation"));
  assert.equal(board.calls.submit, 0);
});

test("MI-099 T2c: without a confirmed portfolio fact the drive waits — the link is never invented", () => {
  const { board, session } = tallySession();
  const noSite = Object.assign({}, PROFILE); delete noSite.website;
  const r = Portal.runApply(session, { posting: academyPosting(), profile: noSite, log: newLog(), now: NOW,
    attestations: { certify_true: { explicit: true, value: true } } });
  assert.equal(r.resultStatus, "awaiting_user");
  assert.ok((r.asks || []).some((a) => a.field_id === "portfolio" && a.reason === "no_confirmed_fact"));
  assert.equal(board.calls.submit, 0);
});

test("MI-099 T3: a board/posting family mismatch is refused (tally board, greenhouse posting)", () => {
  const { session } = tallySession();
  const gh = { id: "GH-1", canonicalKey: "greenhouse:testsystems:intern", company: "TEST Systems",
    role: "Software Engineering Intern", url: "https://boards.greenhouse.io/testsystems/jobs/001", status: "open" };
  const r = Portal.runApply(session, { posting: gh, profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "BOARD_POSTING_MISMATCH");
});

test("MI-099 T4: captcha at open stops with CAPTCHA_HANDOFF and a handoff URL, never a solve", () => {
  const { board, session } = tallySession({ board: { captchaAt: "open" } });
  const r = Portal.runApply(session, { posting: academyPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CAPTCHA_HANDOFF");
  assert.equal(r.handoffUrl, TALLY_URL);
  assert.equal(board.calls.submit, 0);
});

test("MI-099 T5: the a16z Academy drive — the Stage 1 Tally posting reaches the doorstep in fixture form", () => {
  const { board, session } = tallySession();
  const posting = academyPosting({ description: "Stage 1: contact information, a link to a personal portfolio website, an essay, a short video, test scores if any, and a high-school transcript. Early deadline November 5, 2026." });
  const r = Portal.runApply(session, { posting, profile: PROFILE, log: newLog(), now: NOW,
    attestations: { certify_true: { explicit: true, value: true } } });
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.atFinalReview, true);
  assert.equal(r.doorstep.payload.portfolio, PROFILE.website);
  assert.equal(board.calls.submit, 0);
});
