// MI-100 — FormAssembly fellowship portal family (Crew B, D5-class).
// The FormAssembly platform (tfaforms — Emergent Ventures, Mercatus
// Center, form 5099527; census 2026-10-15 §12) was outside the 149/150
// seam: no FormAssembly-hosted form could be driven through the product
// at all. This suite is the permanent replay guard:
//   - the formassembly family is classified + drivable through 149's
//     pipeline to a VERIFIED doorstep (fields from confirmed facts only,
//     fills verified by readback via the pipeline's own gates, typed
//     stops);
//   - THE EV LAW: the form itself bans AI-written applications and tests
//     for them — the 1,500-word proposal is the owner's own writing.
//     The pipeline NEVER invents proposal text: with no owner-confirmed
//     draft the field stays an ask and the payload carries no proposal;
//     an unconfirmed/generated answer is never filled either. The only
//     text that may fill it is the owner's own confirmed draft.
//   - attestation is explicit-only; captcha = stop + handoff, never
//     solved; lookalike hosts still refused; no real submission ever
//     happens in this suite (sandbox board = local receipt sink,
//     labeled TEST; browser leg runs only against the localhost
//     fixture when Playwright is available).
// FAIL-FIRST: written before the family existed — every test red on
// release/career-v224 @ 3c11e838.
// Check: node --test tests/career-formassembly-portal.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const Browser150 = (() => { try { return require(path.join(root, "packages/domain/150-career-portal-browser.js")); } catch (e) { return null; } })();

const USER = "user-alex-test";
const NOW = "2026-10-16T12:00:00Z";
const EV_URL = "https://mercatus.tfaforms.net/5099527";
const OWNER_PROPOSAL = "OWNER-WRITTEN PROPOSAL (TEST fixture text — the applicant's own words, confirmed as a draft by the owner)";
const PROFILE = {
  name: "Alex Testcase (TEST)",
  email: "alex.testcase@example.test",
  phone: "+1 000 555 0100",
  location: "Chicago, IL",
  country: "United States",
  state_of_residence: "Illinois",
  linkedin: "https://www.linkedin.com/in/alex-testcase",
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: {},
};
const newLog = () => ({ records: [] });
function formassemblySession(opts = {}) {
  assert.equal(typeof Portal.createFormAssemblySandboxBoard, "function", "MI-100: createFormAssemblySandboxBoard must exist");
  const board = Portal.createFormAssemblySandboxBoard(opts.board || {});
  const session = Portal.createPortalSession({ userId: USER, board });
  return { board, session };
}
const evPosting = (over = {}) => Object.assign({
  id: "EV-5099527", canonicalKey: "formassembly:mercatus:emergent-ventures",
  company: "Emergent Ventures", role: "Emergent Ventures Fellowship", url: EV_URL,
  status: "open", atsFamily: "formassembly",
}, over);

// ---------- §6.3 classification: the family exists, the gate still holds ----------
test("MI-100 F1: FormAssembly hosts classify as the formassembly family", () => {
  for (const url of [EV_URL, "https://mercatus.tfaforms.com/5099527", "https://app.formassembly.com/forms/5099527"]) {
    const c = Portal.classifyTarget(url);
    assert.equal(c.allowed, true, url);
    assert.equal(c.atsFamily, "formassembly", url);
    assert.equal(c.kind, "employer_ats", url);
  }
});

test("MI-100 F1b: lookalike and unknown hosts are still refused", () => {
  for (const url of ["https://tfaforms.example.com/5099527", "https://nottfaforms.net/5099527", "https://tfaforms.net.evil.com/5099527", "https://formassembly.example.org/apply", "https://mercatus.tfaforms.net.evil.com/5099527"]) {
    const c = Portal.classifyTarget(url);
    assert.equal(c.allowed, false, url);
    assert.equal(c.code, "UNTESTED_ATS_HOST", url);
  }
  if (Browser150) {
    assert.equal(Browser150.hostAllowed(EV_URL).allowed, true);
    assert.equal(Browser150.hostAllowed(EV_URL).atsFamily, "formassembly");
    assert.equal(Browser150.hostAllowed("https://tfaforms.example.com/5099527").allowed, false);
    assert.equal(Browser150.finalUrlGate(EV_URL).allowed, true);
    assert.equal(Browser150.finalUrlGate(EV_URL).atsFamily, "formassembly");
  }
});

// ---------- the doorstep: the family drives end-to-end on confirmed facts ----------
test("MI-100 F2: the Emergent Ventures drive reaches a verified doorstep; owner-only fields stay asks; zero submits", () => {
  const { board, session } = formassemblySession();
  const r = Portal.runApply(session, { posting: evPosting(), profile: PROFILE, log: newLog(), now: NOW,
    attestations: { certify_true: { explicit: true, value: true } } });
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.atFinalReview, true);
  const p = r.doorstep.payload;
  assert.equal(p.full_name, PROFILE.name);
  assert.equal(p.email, PROFILE.email);
  assert.equal(p.country, "United States");
  assert.equal(p.state_of_residence, "Illinois");
  assert.equal(p.resume.sha256, PROFILE.resume.sha256);
  assert.ok(r.doorstep.payloadSha256 && /^[0-9a-f]{64}$/.test(r.doorstep.payloadSha256), "payload hash recorded");
  assert.equal(board.calls.submit, 0, "doorstep only — no submit without approval");
  // The proposal + region + funding area are owner-decision / owner-
  // writing fields: present on the form, never invented — they ride
  // as non-required asks and the payload carries NONE of them.
  const askIds = (r.asks || []).map((a) => a.field_id);
  assert.ok(askIds.includes("proposal"), "the 1,500-word proposal stays an owner ask");
  assert.ok(askIds.includes("region_affected"), "region affected stays an owner ask");
  assert.ok(askIds.includes("funding_area"), "funding area stays an owner ask");
  assert.equal(p.proposal, undefined, "no proposal text was invented into the payload");
  assert.equal(p.region_affected, undefined);
  assert.equal(p.funding_area, undefined);
});

test("MI-100 F2b: a confirmed-but-not-owner-draft proposal answer is NEVER filled (EV bans AI-written applications)", () => {
  const { board, session } = formassemblySession();
  const profile = Object.assign({}, PROFILE, { answers: {
    proposal: { value: "GENERATED TEXT THAT MUST NEVER FILL THE EV PROPOSAL", confirmed: true },
  } });
  const r = Portal.runApply(session, { posting: evPosting(), profile, log: newLog(), now: NOW,
    attestations: { certify_true: { explicit: true, value: true } } });
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.payload.proposal, undefined, "a non-draft answer never becomes proposal text");
  assert.ok((r.asks || []).some((a) => a.field_id === "proposal" && a.reason === "needs_user_draft_confirmation"));
  assert.equal(board.calls.submit, 0);
});

test("MI-100 F2c: the owner's OWN confirmed draft is the only proposal text that may fill the field", () => {
  const { board, session } = formassemblySession();
  const profile = Object.assign({}, PROFILE, { answers: {
    proposal: { value: OWNER_PROPOSAL, confirmed: true, draft: true },
  } });
  const r = Portal.runApply(session, { posting: evPosting(), profile, log: newLog(), now: NOW,
    attestations: { certify_true: { explicit: true, value: true } } });
  assert.equal(r.resultStatus, "prepared", JSON.stringify(r.stepLog || []));
  assert.equal(r.doorstep.payload.proposal, OWNER_PROPOSAL, "the owner's own words ride verbatim — organized, never rewritten or invented");
  assert.equal(board.calls.submit, 0);
});

test("MI-100 F3: without the explicit attestation the drive waits on the user (nothing invented)", () => {
  const { board, session } = formassemblySession();
  const r = Portal.runApply(session, { posting: evPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "awaiting_user");
  assert.ok((r.asks || []).some((a) => a.field_id === "certify_true" && a.reason === "attestation_requires_explicit_confirmation"));
  assert.equal(board.calls.submit, 0);
});

test("MI-100 F3b: a board/posting family mismatch is refused (formassembly board, greenhouse posting)", () => {
  const { session } = formassemblySession();
  const gh = { id: "GH-1", canonicalKey: "greenhouse:testsystems:intern", company: "TEST Systems",
    role: "Software Engineering Intern", url: "https://boards.greenhouse.io/testsystems/jobs/001", status: "open" };
  const r = Portal.runApply(session, { posting: gh, profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "BOARD_POSTING_MISMATCH");
});

test("MI-100 F4: captcha at open stops with CAPTCHA_HANDOFF and a handoff URL, never a solve", () => {
  const { board, session } = formassemblySession({ board: { captchaAt: "open" } });
  const r = Portal.runApply(session, { posting: evPosting(), profile: PROFILE, log: newLog(), now: NOW });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CAPTCHA_HANDOFF");
  assert.equal(r.handoffUrl, EV_URL);
  assert.equal(board.calls.submit, 0);
});

test("MI-100 F4b: captcha at review stops with CAPTCHA_HANDOFF, never a solve", () => {
  const { board, session } = formassemblySession({ board: { captchaAt: "review" } });
  const r = Portal.runApply(session, { posting: evPosting(), profile: PROFILE, log: newLog(), now: NOW,
    attestations: { certify_true: { explicit: true, value: true } } });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "CAPTCHA_HANDOFF");
  assert.equal(r.handoffUrl, EV_URL);
  assert.equal(board.calls.submit, 0);
});
