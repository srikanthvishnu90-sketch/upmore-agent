// MI-101 — Google Forms fellowship portal family (Crew B, D5-class).
// The Google Forms platform (docs.google.com/forms — the Z Fellows
// application, census 2026-10-15 §13) was outside the 149/150 seam:
// no Google Forms application could be driven through the product at
// all. This suite is the permanent replay guard:
//   - the googleforms family is classified PATH-PRECISELY (only
//     docs.google.com URLs under /forms/ — a Docs/Sheets/Drive URL on
//     the same host is NOT a form and stays refused) and drivable
//     through 149's pipeline to a VERIFIED doorstep;
//   - the Z Fellows packet assembles from confirmed facts + the
//     owner's approved short answers ONLY: FACT fields fill from
//     confirmed facts, the two screening answers (technical /
//     previously applied) and the company-or-project DECISION fill
//     only from confirmed answers, and every short-answer/essay field
//     is free_text — it fills ONLY from the owner's own confirmed
//     draft, never from an unconfirmed or non-draft answer;
//   - Birthday is a required FACT that is NOT in the fact bank
//     (census §13, Phase 2): without it the drive waits on the user;
//   - captcha = stop + handoff, never solved; lookalike hosts and
//     non-form Google URLs still refused; no real submission ever
//     happens in this suite (sandbox board = local receipt sink,
//     labeled TEST; browser leg runs only against the localhost
//     fixture when Playwright is available).
// FAIL-FIRST: written before the family existed — every test red on
// release/career-v224 @ 3c11e838.
// Check: node --test tests/career-googleforms-portal.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const Browser150 = (() => { try { return require(path.join(root, "packages/domain/150-career-portal-browser.js")); } catch (e) { return null; } })();

const USER = "user-alex-test";
const NOW = "2026-10-16T12:00:00Z";
const Z_URL = "https://docs.google.com/forms/d/e/TEST-ZFELLOWS/viewform";
const REQUIRED_DRAFT_KEYS = ["school_or_work", "achievements", "project_description", "problem", "expertise",
  "past_work", "nerdiest_thing", "what_drives_you", "nontraditional_upbringing", "risk_or_challenge", "cofounder_pick"];
const OPTIONAL_DRAFT_KEYS = ["competitors", "need_help", "intro_video"];
const draftAnswers = () => Object.fromEntries(REQUIRED_DRAFT_KEYS.map((k) => [k,
  { value: `OWNER DRAFT for ${k} (TEST fixture text — the applicant's own words, confirmed as a draft)`, confirmed: true, draft: true }]));
const PROFILE = {
  name: "Alex Testcase (TEST)",
  email: "alex.testcase@example.test",
  phone: "+1 000 555 0100",
  location: "Chicago, IL",
  website: "https://alex-testcase.example.test",
  date_of_birth: "2000-01-01",
  answers: Object.assign({
    company_or_project: { value: "TEST Project (TEST)", confirmed: true },
    is_technical: { value: "Yes", confirmed: true },
    previously_applied: { value: "No", confirmed: true },
  }, draftAnswers()),
};
const newLog = () => ({ records: [] });
function googleFormsSession(opts = {}) {
  assert.equal(typeof Portal.createGoogleFormsSandboxBoard, "function", "MI-101: createGoogleFormsSandboxBoard must exist");
  const board = Portal.createGoogleFormsSandboxBoard(opts.board || {});
  const session = Portal.createPortalSession({ userId: USER, board });
  return { board, session };
}
const zPosting = (over = {}) => Object.assign({
  id: "ZF-GF-001", canonicalKey: "googleforms:zfellows:2026-cohorts",
  company: "Z Fellows", role: "Z Fellows — 2026 cohorts", url: Z_URL,
  status: "open", atsFamily: "googleforms",
}, over);

// ---------- §6.3 classification: path-precise, the gate still holds ----------
test("MI-101 F1: Google Forms URLs classify as the googleforms family", () => {
  for (const url of [Z_URL, "https://docs.google.com/forms/d/TEST-ZFELLOWS/viewform", "https://docs.google.com/forms/d/e/TEST-ZFELLOWS/viewform?usp=sf_link"]) {
    const c = Portal.classifyTarget(url);
    assert.equal(c.allowed, true, url);
    assert.equal(c.atsFamily, "googleforms", url);
    assert.equal(c.kind, "employer_ats", url);
  }
});

test("MI-101 F1b: non-form Google URLs and lookalike hosts are still refused", () => {
  for (const url of [
    "https://docs.google.com/document/d/TEST/edit",           // a Doc is not a form
    "https://docs.google.com/spreadsheets/d/TEST/edit",        // a Sheet is not a form
    "https://docs.google.com/forms",                           // no form path segment
    "https://www.google.com/forms/d/e/TEST/viewform",          // wrong host
    "https://docs.google.com.evil.com/forms/d/e/TEST/viewform", // lookalike registrable domain
    "https://evil-docs.google.com/forms/d/e/TEST/viewform",    // subdomain of google.com, not docs.google.com
    "https://docs.google.example.com/forms/d/e/TEST/viewform",
  ]) {
    const c = Portal.classifyTarget(url);
    assert.equal(c.allowed, false, url);
    assert.equal(c.code, "UNTESTED_ATS_HOST", url);
  }
  if (Browser150) {
    assert.equal(Browser150.hostAllowed(Z_URL).allowed, true);
    assert.equal(Browser150.hostAllowed(Z_URL).atsFamily, "googleforms");
    assert.equal(Browser150.hostAllowed("https://docs.google.com/document/d/TEST/edit").allowed, false);
    assert.equal(Browser150.hostAllowed("https://docs.google.com.evil.com/forms/d/e/TEST/viewform").allowed, false);
    assert.equal(Browser150.finalUrlGate(Z_URL).allowed, true);
    assert.equal(Browser150.finalUrlGate(Z_URL).atsFamily, "googleforms");
    assert.equal(Browser150.finalUrlGate("https://docs.google.com/spreadsheets/d/TEST/edit").allowed, false);
  }
});

// ---------- the doorstep: facts + approved short answers only ----------
test("MI-101 F2: the Z Fellows drive reaches a verified doorstep from confirmed facts + approved answers only; zero submits", () => {
  const { board, session } = googleFormsSession();
  const r = Portal.runApply(session, { posting: zPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.atFinalReview, true);
  const p = r.doorstep.payload;
  assert.equal(p.full_name, PROFILE.name);
  assert.equal(p.email, PROFILE.email);
  assert.equal(p.phone, PROFILE.phone);
  assert.equal(p.date_of_birth, "2000-01-01");
  assert.equal(p.location, "Chicago, IL");
  assert.equal(p.website, PROFILE.website);
  assert.equal(p.company_or_project, "TEST Project (TEST)");
  assert.equal(p.is_technical, "Yes");
  assert.equal(p.previously_applied, "No");
  for (const k of REQUIRED_DRAFT_KEYS) assert.equal(p[k], PROFILE.answers[k].value, k);
  assert.ok(r.doorstep.payloadSha256 && /^[0-9a-f]{64}$/.test(r.doorstep.payloadSha256), "payload hash recorded");
  assert.equal(board.calls.submit, 0, "doorstep only — no submit without approval");
  // The optional short answers carry no owner draft in this packet:
  // they ride as asks and the payload carries NONE of them.
  const askIds = (r.asks || []).map((a) => a.field_id);
  for (const k of OPTIONAL_DRAFT_KEYS) {
    assert.ok(askIds.includes(k), `${k} stays an owner ask`);
    assert.equal(p[k], undefined, `no ${k} text was invented into the payload`);
  }
});

test("MI-101 F2b: a confirmed-but-not-draft short answer is NEVER filled (essays are the owner's own words)", () => {
  const { board, session } = googleFormsSession();
  const profile = Object.assign({}, PROFILE, { answers: Object.assign({}, PROFILE.answers, {
    project_description: { value: "GENERATED TEXT THAT MUST NEVER FILL THE Z FELLOWS ESSAY", confirmed: true },
  }) });
  const r = Portal.runApply(session, { posting: zPosting(), profile, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "awaiting_user", "a required essay without an owner draft waits on the user");
  assert.ok((r.asks || []).some((a) => a.field_id === "project_description" && a.reason === "needs_user_draft_confirmation"));
  assert.equal(board.answers().project_description, undefined, "a non-draft answer never reaches the board");
  assert.equal(board.calls.submit, 0);
});

test("MI-101 F2c: the owner's OWN confirmed drafts are the only short-answer text that fills (verbatim)", () => {
  const { board, session } = googleFormsSession();
  const r = Portal.runApply(session, { posting: zPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  for (const k of REQUIRED_DRAFT_KEYS) {
    assert.equal(r.doorstep.payload[k], PROFILE.answers[k].value, `${k} rides verbatim — organized, never rewritten or invented`);
  }
  assert.equal(board.calls.submit, 0);
});

test("MI-101 F3: without Birthday (not in the fact bank) or the company decision the drive waits on the user", () => {
  const { board, session } = googleFormsSession();
  const profile = Object.assign({}, PROFILE, { date_of_birth: undefined, answers: Object.assign({}, PROFILE.answers) });
  delete profile.answers.company_or_project;
  const r = Portal.runApply(session, { posting: zPosting(), profile, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "awaiting_user");
  assert.ok((r.asks || []).some((a) => a.field_id === "date_of_birth" && a.reason === "no_confirmed_fact"), "Birthday stays an honest ask — never invented");
  assert.ok((r.asks || []).some((a) => a.field_id === "company_or_project"), "the Trainee-vs-Sporv choice is the owner's decision, never a guess");
  assert.equal(board.calls.submit, 0);
});

test("MI-101 F3b: a board/posting family mismatch is refused (googleforms board, greenhouse posting)", () => {
  const { session } = googleFormsSession();
  const gh = { id: "GH-1", canonicalKey: "greenhouse:testsystems:intern", company: "TEST Systems",
    role: "Software Engineering Intern", url: "https://boards.greenhouse.io/testsystems/jobs/001", status: "open" };
  const r = Portal.runApply(session, { posting: gh, profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "BOARD_POSTING_MISMATCH");
});

test("MI-101 F4: captcha at open stops with CAPTCHA_HANDOFF and a handoff URL, never a solve", () => {
  const { board, session } = googleFormsSession({ board: { captchaAt: "open" } });
  const r = Portal.runApply(session, { posting: zPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CAPTCHA_HANDOFF");
  assert.equal(r.handoffUrl, Z_URL);
  assert.equal(board.calls.submit, 0);
});

test("MI-101 F4b: captcha at review stops with CAPTCHA_HANDOFF, never a solve", () => {
  const { board, session } = googleFormsSession({ board: { captchaAt: "review" } });
  const r = Portal.runApply(session, { posting: zPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CAPTCHA_HANDOFF");
  assert.equal(r.handoffUrl, Z_URL);
  assert.equal(board.calls.submit, 0);
});
