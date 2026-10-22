"use strict";
// Synthetic board contract only. No actual employer options, browser, network,
// approval or submit. Exercise prepareRound through the public runApply seam.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Portal = require("../packages/domain/149-career-portal-apply.js");
const POSTING = { id: "F023-TEST", canonicalKey: "lever:fixture:f023", company: "TEST Systems", role: "Intern", url: "https://jobs.lever.co/fixture/f023", atsFamily: "lever", status: "open" };
const cases = [
  { name: "standard major", kind: "standard", profile_key: "education_discipline", value: "Computer Science", source: "profile" },
  { name: "confirmed screening", kind: "screening", value: "Yes", source: "user_confirmed_answer" },
  { name: "confirmed draft", kind: "free_text", value: "I am applying to TEST Systems.", source: "user_confirmed_draft" },
  { name: "draft on exact card", kind: "free_text", value: "I am applying to TEST Systems.", source: "draft_on_card" },
  { name: "saved exact question", kind: "custom", value: "Chicago", source: "saved_answer" },
  { name: "default EEO decline", kind: "eeo", value: "Decline to self-identify", source: "eeo_default_decline" },
  { name: "user EEO choice", kind: "eeo", value: "Decline to self-identify", source: "user_eeo_choice" },
  { name: "explicit attestation", kind: "attestation", value: true, source: "user_explicit_attestation" },
];
function fixture(c, opts = {}) {
  const field = { field_id: "target", label: "Which confirmed response", kind: c.kind, profile_key: c.profile_key, question_key: "target", required: opts.required !== false };
  const profile = { name: "Alex Testcase (TEST)", resume: { filename: "test.pdf", sha256: "a".repeat(64) }, education: { discipline: c.value }, answers: {} };
  if (c.kind === "screening") profile.answers.target = { value: c.value, confirmed: true };
  if (c.kind === "free_text") profile.answers.target = { value: c.value, draft: true, confirmed: c.source === "user_confirmed_draft", onCard: c.source === "draft_on_card" };
  if (c.source === "user_eeo_choice") profile.eeoChoice = c.value;
  if (c.source === "saved_answer") profile.savedAnswers = [{ question: "which confirmed response", value: c.value, quarantine_version: "d007-v1", factId: "TEST-FACT", confirmation_event_id: "TEST-CONFIRMATION", manifest_hash: "b".repeat(64) }];
  const board = Portal.createSandboxBoard();
  board.atsFamily = "lever";
  const fill = board.fill.bind(board);
  const failures = opts.stale ? [{ field_id: "target", reason: "stale_diagnostic" }] : [];
  board.form = () => ({ fields: [{ field_id: "anchor", kind: "standard", profile_key: "name", required: true, label: "Name" }, field] });
  if (opts.diagnostics !== false) Object.defineProperty(board, "fillFailures", { get: () => failures.slice() });
  const attempts = [];
  board.fill = (id, value) => {
    attempts.push(id);
    if (id === "target" || opts.refuseAll) {
      if (opts.error) throw opts.error;
      if (opts.refuse) {
        if (opts.diagnostics !== false && !opts.stale) failures.push({ field_id: id, reason: "option_not_found", wanted: value });
        return opts.verdict;
      }
    }
    return fill(id, value);
  };
  const session = Portal.createPortalSession({ userId: "F023-TEST-USER", board });
  const run = () => {
    const r = Portal.runApply(session, { posting: POSTING, profile, cardApproval: c.source === "draft_on_card", attestations: c.kind === "attestation" ? { target: { value: c.value, explicit: true } } : {}, log: { records: [] } });
    assert.equal(board.calls.submit, 0, "preparation never submits");
    return r;
  };
  return { board, session, run, attempts };
}
for (const c of cases) {
  for (const verdict of [undefined, null]) test(`F023 ${c.name}: ${String(verdict)} fill verdict asks instead of claiming success`, () => {
    const f = fixture(c, { refuse: true, verdict }); const r = f.run();
    assert.equal(r.resultStatus, "awaiting_user");
    assert.deepEqual(r.asks.filter(a => a.field_id === "target"), [{ field_id: "target", reason: "fill_refused" }]);
    assert.equal(f.board.answers().target, undefined);
    assert.equal(f.session.doorstep, null);
    assert.equal(r.stepLog.some(s => s.action === "fill" && s.field_id === "target"), false);
    const refusal = r.stepLog.find(s => s.action === "fill_refused" && s.field_id === "target");
    assert.equal(refusal.source, c.source); assert.equal(refusal.reason, "option_not_found");
    assert.equal(f.attempts.filter(id => id === "target").length, 1, "no retry of an unaccepted value");
    if (c.source === "saved_answer") assert.deepEqual(refusal.fact_refs, ["TEST-FACT"]);
  });
  test(`F023 ${c.name}: accepted value still reaches review`, () => {
    const f = fixture(c); const r = f.run();
    assert.equal(r.resultStatus, "prepared"); assert.deepEqual(f.board.answers().target, c.value);
    assert.equal(r.stepLog.find(s => s.action === "fill" && s.field_id === "target").source, c.source);
    assert.equal(r.asks.length, 0);
  });
}
test("F023 optional refusal stays visible without blocking accepted required fields", () => {
  const f = fixture(cases[0], { refuse: true, verdict: null, required: false }); const r = f.run();
  assert.equal(r.resultStatus, "prepared");
  assert.deepEqual(r.asks, [{ field_id: "target", reason: "fill_refused" }]);
  assert.equal("target" in r.doorstep.payload, false);
  assert.equal(r.stepLog.some(s => s.action === "doorstep_repair"), false);
});
test("F023 a bridge without diagnostics records an honest fallback reason", () => {
  const r = fixture(cases[0], { refuse: true, verdict: null, diagnostics: false }).run();
  assert.equal(r.resultStatus, "awaiting_user");
  assert.equal(r.stepLog.find(s => s.action === "fill_refused").reason, "fill_returned_no_value");
});
test("F023 a previous failure is not attributed to the current attempt", () => {
  const r = fixture(cases[0], { refuse: true, verdict: null, stale: true }).run();
  assert.equal(r.stepLog.find(s => s.action === "fill_refused").reason, "fill_returned_no_value");
});
test("F023 all refused required fields ask even when no value was observed", () => {
  const r = fixture(cases[0], { refuse: true, verdict: undefined, refuseAll: true }).run();
  assert.equal(r.resultStatus, "awaiting_user"); assert.equal(r.asks.length, 2);
  assert.ok(r.asks.every(a => a.reason === "fill_refused"));
});
for (const value of [false, 0]) test(`F023 successful falsy value ${value} remains a filled answer`, () => {
  const c = { ...cases[1], value }; const f = fixture(c); const r = f.run();
  assert.equal(r.resultStatus, "prepared"); assert.equal(r.doorstep.payload.target, value);
});
test("F023 thrown resume or driver errors retain the existing throw contract", () => {
  const error = Object.assign(new Error("Synthetic driver error"), { code: "RESUME_SHA_MISMATCH" });
  const f = fixture(cases[0], { error }); assert.throws(f.run, e => e === error);
  assert.equal(f.board.calls.submit, 0);
});
