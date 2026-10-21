"use strict";
// Synthetic-only trust-boundary controls. The board is an in-memory sink, never a browser.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Profile = require("../packages/domain/122-career-profile.js");
const Apply = require("../packages/domain/149-career-portal-apply.js");
const Tailor = require("../packages/domain/123-career-tailor.js");
const NOW = "2026-10-21T16:00:00Z";
const OWNER = "SYNTHETIC-TRUST-OWNER";
const POSTING = { canonicalKey: "greenhouse:synthetic-trust:123", company: "Synthetic Employer", title: "TEST role", url: "https://boards.greenhouse.io/synthetic-trust/jobs/123", status: "open", atsFamily: "greenhouse" };
function board(fields = [{ field_id: "authorization", label: "Are you authorized to work?", kind: "screening", question_key: "work_authorization", required: true }]) {
  const held = {}, calls = { open: 0, fill: 0, arm: 0, submit: 0 };
  return { kind: "browser", browserDriver: true, sandbox: false, atsFamily: "greenhouse", host: "boards.greenhouse.io", calls,
    open() { calls.open++; return { ok: true, captcha: null }; }, form() { return { fields }; },
    fill(id, value) { calls.fill++; held[id] = value; return value; }, answers() { return { ...held }; },
    atReview() { return { atFinalReview: true, captcha: null }; },
    armForSubmit() { calls.arm++; return { armed: true }; },
    submit() { calls.submit++; return { outcome: "accepted", confirmationId: "SYNTHETIC-LOCAL-RECEIPT" }; },
    submissionState() { return { submitted: false, confirmationId: null }; } };
}

test("trust control: an unknown required answer waits for the person without arming", () => {
  const b = board(), session = Apply.createPortalSession({ userId: OWNER, board: b });
  const r = Apply.runApply(session, { posting: POSTING, profile: { answers: {} }, log: { records: [] }, now: NOW });
  assert.equal(r.resultStatus, "awaiting_user");
  assert.equal(b.calls.arm + b.calls.submit, 0);
});

test("trust control: exact source text and its real cited fact ID pass the literal audit", () => {
  const p = Profile.createProfile({ facts: [{ id: "SYN-LITERAL", kind: "experience", text: "Worked alongside a project team.", source: "user", status: "confirmed", needs_confirmation: false }] });
  const before = JSON.stringify(p);
  const audit = Tailor.auditResume([{ text: p.facts[0].text, factIds: [p.facts[0].id] }], p);
  assert.equal(audit.ok, true);
  assert.equal(JSON.stringify(p), before, "the read-only audit changed the fact bank");
});

test("trust control: another run user is rejected before the destination is opened", () => {
  const b = board(), session = Apply.createPortalSession({ userId: OWNER, board: b });
  const r = Apply.runApply(session, { userId: "SYNTHETIC-OTHER-OWNER", posting: POSTING, profile: { answers: {} }, log: { records: [] }, now: NOW });
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.code, "SESSION_USER_MISMATCH");
  assert.deepEqual(b.calls, { open: 0, fill: 0, arm: 0, submit: 0 });
});
