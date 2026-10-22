"use strict";
// Synthetic, local integration: stored owned profile -> production adapter -> module149 prepare.
// No browser, provider, submit, live store, or real user data.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Portal = require("../packages/domain/149-career-portal-apply.js");
const Browser = require("../packages/domain/150-career-portal-browser.js");
const { createProductionSources } = require("../workers/career-browser/production-sources.cjs");
const OWNER = "synthetic-f007-owner";
const COMPANY = "Synthetic F007 Employer";
const QUESTION = "Are you willing to relocate for this role?";
const ESSAY = "Why do you want to work at Synthetic F007 Employer?";
const NOW = Date.parse("2026-10-22T12:00:00Z");
const fact = (over = {}) => ({ id: "F-SYN-101", kind: "application_answer", status: "confirmed", user_id: OWNER,
  question: QUESTION, value: "Yes", provenance: "owner stated in chat (synthetic TEST fixture)",
  confirmation_event_id: "evt-synthetic-f007", ...over });

async function prepare(facts, question = QUESTION, company = COMPANY) {
  const reads = [];
  const sources = createProductionSources({ now: () => NOW, transport: { async readRows(spec) {
    reads.push(spec);
    assert.equal(spec.table, "agent_flow_state");
    assert.deepEqual(spec.filters, { user_id: { eq: OWNER } });
    return [{ state: { career: { stores: { profile: { basics: {}, facts } } } } }];
  } } });
  const { profile } = await sources.profileFor(OWNER);
  const { defs } = Browser.classifyFields([{ name: "synthetic-question", id: "synthetic-question", label: question,
    inputType: question === ESSAY ? "textarea" : "text", tag: "input", cls: "", selector: "#synthetic-question", required: true }]);
  assert.equal(defs.length, 1);
  const board = Portal.createSandboxBoard({ accountName: null });
  board.form = () => ({ fields: defs });
  const result = Portal.runApply(Portal.createPortalSession({ userId: OWNER, board }), {
    now: NOW, posting: { canonicalKey: "synthetic:f007:1", company, title: "Synthetic Role",
      url: "https://boards.greenhouse.io/synthetic/jobs/f007", status: "open" },
    profile, log: { records: [] },
  });
  assert.equal(reads.length, 1);
  assert.equal(board.calls.submit, 0);
  return { result, board, profile, fieldId: defs[0].field_id };
}

test("F007 current base: confirmed own stored short answer reaches preparation with its provenance ledger", async () => {
  const { result, board, profile, fieldId } = await prepare([fact()]);
  assert.equal(board.answers()[fieldId], "Yes");
  assert.equal(result.resultStatus, "prepared");
  const source = profile.savedAnswers.find(x => x.factId === "F-SYN-101");
  assert.equal(source.provenance, fact().provenance);
  assert.equal(source.confirmation_event_id, fact().confirmation_event_id);
  assert.match(source.manifest_hash, /^[0-9a-f]{64}$/);
  const ledger = result.stepLog.find(x => x.action === "fill" && x.field_id === fieldId);
  assert.deepEqual([ledger.source, ledger.fact_refs, ledger.confirmation_event_id, ledger.quarantine_version],
    ["saved_answer", ["F-SYN-101"], "evt-synthetic-f007", "d007-v1"]);
  assert.equal(ledger.manifest_hash, source.manifest_hash);
});

test("F007 current base: own long answer fills only its exact employer and question", async () => {
  const answer = fact({ id: "F-SYN-102", kind: "application_text", question: ESSAY, company: COMPANY,
    value: "I want to work on the synthetic team's stated project." });
  const own = await prepare([answer], ESSAY);
  assert.equal(own.board.answers()[own.fieldId], answer.value);
  assert.equal(own.result.resultStatus, "prepared");
  for (const [question, company] of [[ESSAY, "Different Synthetic Employer"], ["What project are you proud of?", COMPANY]]) {
    const other = await prepare([answer], question, company);
    assert.equal(other.board.answers()[other.fieldId], undefined);
    assert.ok(other.result.asks.some(x => x.field_id === other.fieldId));
  }
});

for (const [name, changes] of [
  ["foreign owner", { user_id: "synthetic-other-owner" }],
  ["quarantined bank ID", { id: "F-033" }],
  ["unconfirmed", { status: "draft" }],
  ["needs confirmation", { needs_confirmation: true }],
  ["missing provenance", { provenance: undefined }],
  ["missing confirmation event", { confirmation_event_id: undefined }],
  ["delegated answer-all", { provenance: "owner-delegated answer-all directive" }],
  ["derived from quarantined bank ID", { derived_from: ["F-033"] }],
]) test(`F007 current base: ${name} stays an ask with no filled answer`, async () => {
  const { result, board, profile, fieldId } = await prepare([fact(changes)]);
  assert.equal(profile.savedAnswers, undefined);
  assert.equal(board.answers()[fieldId], undefined);
  assert.ok(result.asks.some(x => x.field_id === fieldId));
  assert.equal(result.resultStatus, "awaiting_user");
});

test("F007 current base: contradictory own saved answers stay an ask", async () => {
  const { result, board, fieldId } = await prepare([fact(), fact({ id: "F-SYN-103", value: "No" })]);
  assert.equal(board.answers()[fieldId], undefined);
  assert.ok(result.asks.some(x => x.field_id === fieldId));
});
