// MI-103 — Thiel Fellowship account-gated portal family (Crew B,
// D5-class + account wall). The Thiel application is a bespoke
// account-gated web app on thielfellowship.org (fellowship census
// 2026-10-15 §3): you register with an email + password, then complete
// the application in stages. Account creation is an OWNER-CREDENTIAL
// action — no drive may perform it, handle a password, or attempt a
// live login. This lane builds the seam for the IN-ACCOUNT application
// only:
//   - family `thiel` in 149 + 150 + the helper navigation gate, hosts
//     end-anchored to thielfellowship.org so lookalikes stay refused;
//   - a sandbox board whose field set is staged from the census §3
//     summary ONLY (name, date of birth, hometown, current location,
//     project/company name + URL, LinkedIn, previous projects, short
//     written answers about the project) — the live fields are read at
//     drive time by module 150; DOB and hometown are NOT in the fact
//     bank (census Phase 2), so a drive without confirmed values for
//     them waits honestly and never invents;
//   - the ACCOUNT WALL as a typed stop: an unauthenticated / login-wall
//     landing (the sandbox board's accountWallAt, or a live page
//     carrying a password field) stops ACCOUNT_WALL_OWNER_HANDOFF —
//     never a drive, never a fill, never a credential attempt; the
//     owner creates / signs into the account, then the drive resumes
//     in-account;
//   - free-text fields (previous projects, the short written answers
//     about the project) fill ONLY from the owner's own confirmed
//     draft, never invented; the project/company name is a screening
//     DECISION that fills only from a confirmed answer; attestations
//     are explicit-only; submit count is 0 at every doorstep.
// This suite is the permanent replay guard for the family.
// FAIL-FIRST: written before the family existed — every test red on
// release/career-v224 @ 3c11e838.
// Check: node --test tests/career-thiel-portal.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const Browser150 = (() => { try { return require(path.join(root, "packages/domain/150-career-portal-browser.js")); } catch (e) { return null; } })();

const USER = "user-alex-test";
const NOW = "2026-10-16T12:00:00Z";
const THIEL_URL = "https://thielfellowship.org/apply";
const OWNER_PROJECT = "OWNER-WRITTEN PROJECT TEXT (TEST fixture text — the applicant's own words, confirmed as a draft by the owner)";
const PROFILE = {
  name: "Alex Testcase (TEST)",
  email: "alex.testcase@example.test",
  phone: "+1 000 555 0100",
  location: "Chicago, IL",
  date_of_birth: "2007-01-15",
  hometown: "Testtown, IL (TEST)",
  linkedin: "https://www.linkedin.com/in/alex-testcase",
  website: "https://alex-testcase.example.test/project",
  answers: {
    project_or_company_name: { value: "Testcase Labs (TEST)", confirmed: true },
  },
};
const newLog = () => ({ records: [] });
function thielSession(opts = {}) {
  assert.equal(typeof Portal.createThielSandboxBoard, "function", "MI-103: createThielSandboxBoard must exist");
  const board = Portal.createThielSandboxBoard(opts.board || {});
  const session = Portal.createPortalSession({ userId: USER, board });
  return { board, session };
}
const thielPosting = (over = {}) => Object.assign({
  id: "THIEL-2027", canonicalKey: "thiel:thielfellowship:fellowship",
  company: "Thiel Fellowship", role: "Thiel Fellowship", url: THIEL_URL,
  status: "open", atsFamily: "thiel",
}, over);
const ATTEST = { attestations: { certify_true: { explicit: true, value: true } } };

test("MI-103 T1: thielfellowship.org hosts classify as the thiel family", () => {
  for (const url of [THIEL_URL, "https://thielfellowship.org/", "https://www.thielfellowship.org/apply", "https://thielfellowship.org/application"]) {
    const c = Portal.classifyTarget(url);
    assert.equal(c.allowed, true, url);
    assert.equal(c.atsFamily, "thiel", url);
    assert.equal(c.kind, "employer_ats", url);
  }
});

test("MI-103 T1b: Thiel lookalike and unknown hosts are still refused at both gates", () => {
  for (const url of ["https://thielfellowship.example.com/apply", "https://notthielfellowship.org/apply", "https://thielfellowship.org.evil.com/apply", "https://www.thielfellowship.org.evil.com/apply"]) {
    const c = Portal.classifyTarget(url);
    assert.equal(c.allowed, false, url);
    assert.equal(c.code, "UNTESTED_ATS_HOST", url);
  }
  if (Browser150) {
    assert.equal(Browser150.hostAllowed(THIEL_URL).allowed, true);
    assert.equal(Browser150.hostAllowed(THIEL_URL).atsFamily, "thiel");
    assert.equal(Browser150.hostAllowed("https://thielfellowship.org.evil.com/apply").allowed, false);
    assert.equal(Browser150.finalUrlGate(THIEL_URL).allowed, true);
    assert.equal(Browser150.finalUrlGate(THIEL_URL).atsFamily, "thiel");
  }
});

test("MI-103 T2: the in-account Thiel drive reaches a verified doorstep; written-answer fields stay asks; zero submits", () => {
  const { board, session } = thielSession();
  const r = Portal.runApply(session, Object.assign({ posting: thielPosting(), profile: PROFILE, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.atFinalReview, true);
  const p = r.doorstep.payload;
  assert.equal(p.full_name, PROFILE.name);
  assert.equal(p.email, PROFILE.email);
  assert.equal(p.date_of_birth, PROFILE.date_of_birth);
  assert.equal(p.hometown, PROFILE.hometown);
  assert.equal(p.current_location, PROFILE.location);
  assert.equal(p.project_or_company_name, "Testcase Labs (TEST)");
  assert.equal(p.project_url, PROFILE.website);
  assert.equal(p.linkedin, PROFILE.linkedin);
  assert.ok(r.doorstep.payloadSha256 && /^[0-9a-f]{64}$/.test(r.doorstep.payloadSha256), "payload hash recorded");
  assert.equal(board.calls.submit, 0, "doorstep only — no submit without approval");
  const askIds = (r.asks || []).map((a) => a.field_id);
  assert.ok(askIds.includes("previous_projects"), "previous projects stay an owner ask");
  assert.ok(askIds.includes("project_description"), "the project write-up stays an owner ask");
  assert.ok(askIds.includes("project_progress"), "the project-progress answer stays an owner ask");
  assert.equal(p.previous_projects, undefined, "no previous-project text was invented into the payload");
  assert.equal(p.project_description, undefined, "no project text was invented into the payload");
  assert.equal(p.project_progress, undefined, "no progress text was invented into the payload");
});

test("MI-103 T2b: a confirmed-but-not-owner-draft project answer is NEVER filled on the Thiel form", () => {
  const { board, session } = thielSession();
  const profile = Object.assign({}, PROFILE, { answers: Object.assign({}, PROFILE.answers, {
    project_description: { value: "GENERATED TEXT THAT MUST NEVER FILL THE THIEL PROJECT FIELD", confirmed: true },
  }) });
  const r = Portal.runApply(session, Object.assign({ posting: thielPosting(), profile, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.payload.project_description, undefined, "a non-draft answer never becomes project text");
  assert.ok((r.asks || []).some((a) => a.field_id === "project_description" && a.reason === "needs_user_draft_confirmation"));
  assert.equal(board.calls.submit, 0);
});

test("MI-103 T2c: the owner's OWN confirmed draft is the only project text that may fill the Thiel field", () => {
  const { board, session } = thielSession();
  const profile = Object.assign({}, PROFILE, { answers: Object.assign({}, PROFILE.answers, {
    project_description: { value: OWNER_PROJECT, confirmed: true, draft: true },
  }) });
  const r = Portal.runApply(session, Object.assign({ posting: thielPosting(), profile, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.payload.project_description, OWNER_PROJECT, "the owner's own words ride verbatim — never rewritten or invented");
  assert.equal(board.calls.submit, 0);
});

test("MI-103 T3: without a confirmed date of birth the Thiel drive waits on the user (DOB is not in the fact bank — never invented)", () => {
  const { board, session } = thielSession();
  const profile = Object.assign({}, PROFILE);
  delete profile.date_of_birth;
  const r = Portal.runApply(session, Object.assign({ posting: thielPosting(), profile, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "awaiting_user");
  assert.ok((r.asks || []).some((a) => a.field_id === "date_of_birth" && a.reason === "no_confirmed_fact"));
  assert.equal(board.calls.submit, 0);
});

test("MI-103 T3b: without the explicit attestation the Thiel drive waits on the user (nothing invented)", () => {
  const { board, session } = thielSession();
  const r = Portal.runApply(session, { posting: thielPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "awaiting_user");
  assert.ok((r.asks || []).some((a) => a.field_id === "certify_true" && a.reason === "attestation_requires_explicit_confirmation"));
  assert.equal(board.calls.submit, 0);
});

test("MI-103 T4: board/posting family mismatches are refused both ways (thiel board vs Greenhouse posting; Greenhouse board vs Thiel posting)", () => {
  const a = thielSession();
  const gh = { id: "GH-1", canonicalKey: "greenhouse:testsystems:intern", company: "TEST Systems",
    role: "Software Engineering Intern", url: "https://boards.greenhouse.io/testsystems/jobs/001", status: "open" };
  const r1 = Portal.runApply(a.session, { posting: gh, profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r1.resultStatus, "blocked");
  assert.equal(r1.code, "BOARD_POSTING_MISMATCH");
  const board2 = Portal.createSandboxBoard({});
  const session2 = Portal.createPortalSession({ userId: USER, board: board2 });
  const r2 = Portal.runApply(session2, { posting: thielPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r2.resultStatus, "blocked");
  assert.equal(r2.code, "BOARD_POSTING_MISMATCH");
});

test("MI-103 T5: an unauthenticated (account-wall) landing at open is a typed ACCOUNT_WALL_OWNER_HANDOFF stop — no form read, no fill, no credential attempt", () => {
  const { board, session } = thielSession({ board: { accountWallAt: "open" } });
  const r = Portal.runApply(session, Object.assign({ posting: thielPosting(), profile: PROFILE, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "ACCOUNT_WALL_OWNER_HANDOFF");
  assert.equal(r.handoffUrl, THIEL_URL);
  assert.match(String(r.reason || ""), /owner/i, "the stop names the owner as the actor for the account step");
  assert.equal(board.calls.fill, 0, "nothing was filled on a login wall");
  assert.equal(board.calls.submit, 0);
});

test("MI-103 T5b: an account wall surfacing at review is the same typed stop, never a drive", () => {
  const { board, session } = thielSession({ board: { accountWallAt: "review" } });
  const r = Portal.runApply(session, Object.assign({ posting: thielPosting(), profile: PROFILE, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "ACCOUNT_WALL_OWNER_HANDOFF");
  assert.equal(r.handoffUrl, THIEL_URL);
  assert.equal(board.calls.submit, 0);
});

test("MI-103 T6: captcha at open on the Thiel form stops with CAPTCHA_HANDOFF and a handoff URL, never a solve", () => {
  const { board, session } = thielSession({ board: { captchaAt: "open" } });
  const r = Portal.runApply(session, { posting: thielPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CAPTCHA_HANDOFF");
  assert.equal(r.handoffUrl, THIEL_URL);
  assert.equal(board.calls.submit, 0);
});

test("MI-103 T6b: captcha at review on the Thiel form stops with CAPTCHA_HANDOFF, never a solve", () => {
  const { board, session } = thielSession({ board: { captchaAt: "review" } });
  const r = Portal.runApply(session, Object.assign({ posting: thielPosting(), profile: PROFILE, log: newLog(), now: NOW }, ATTEST));
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CAPTCHA_HANDOFF");
  assert.equal(r.handoffUrl, THIEL_URL);
  assert.equal(board.calls.submit, 0);
});
