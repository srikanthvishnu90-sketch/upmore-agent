// A subscription cancellation case, from the card to the proof (docs/depth/SUB-CASE.md): packages/domain/41-agent-subscription-case.js
// prepares the exact terms the person approves (plan, fee, what they lose and when, refund policy, channel) from fresh,
// server-owned provider evidence; takes one explicit approval from the signed-in owner for exactly those terms; calls a
// cancellation done only on the merchant's own effective record; counts a saving only when a billing date passes with
// complete coverage of the person's account and no charge, net of fees and what is still owed; and keeps refunds as cash
// received, never as savings. Execution stays disabled (no adapter). One test per sub-capability, tagged so
// evals/depth/run.cjs can prove its planted defect makes exactly this test fail. Every record and approval is MOCK.
// Check: node --test tests/depth-SUB-CASE.test.cjs && node evals/depth/run.cjs SUB-CASE
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const C = require(path.join(dir, "41-agent-subscription-case.js"));
const NOW = "2026-10-10T12:00:00Z", AFTER = "2026-10-14T12:00:00Z";

// A mock streaming plan: $15.00 a month from the app store, renews Oct 12, ends Oct 11, a $1.00 fee, $2.00 still owed.
async function fixture(change = {}, opts = {}) {
  const facts = Object.assign({ subscription_id: "mock-sub", provider_account_id: "mock-vendor-acct", merchant: "Mock Streaming", plan: "Monthly", purchase_channel: "app_store", renewal_on: "2026-10-12", effective_on: "2026-10-11", review_deadline_on: "2026-10-10", renewal_amount_cents: 1500, fee_cents: 100, remaining_contract_cents: 200, currency: "USD", interval_months: 1, access_loss: "End of paid period", refund_policy: "Not promised", billing_account_id: "mock-bank", issuer_provider_key: "mock-issuer", block_scope: "Merchant billing ID only", block_limitations: "Does not cancel the contract" }, change);
  const records = {}, approvals = {};
  async function add(id, kind, fields = {}, extra = {}) {
    const payload = kind === "subscription_snapshot" ? facts : Object.assign({ subscription_id: "mock-sub", provider_account_id: "mock-vendor-acct", currency: "USD" }, fields);
    records[id] = Object.assign({ id, kind, owner_id: "mock-owner", authority: "protected-provider", provider_key: "mock-vendor", external_reference: "receipt:" + id, observed_at: opts.observed_at || NOW, facts: payload, payload_hash: await C.hash(payload) }, extra);
    return id;
  }
  await add("source", "subscription_snapshot");
  const scope = { owner_id: "mock-owner", readEvidence: async id => records[id], readApproval: async id => approvals[id] };
  const p = await C.prepare(scope, "source", opts.action || "cancel_contract", opts.now || NOW);
  return { facts, records, approvals, scope, add, p, state: p.proposal ? C.create(p.proposal) : null };
}
const yes = (p, extra) => Object.assign({ id: "approval", owner_id: "mock-owner", actor: "authenticated-owner", status: "approved", proposal_hash: p.hash, terms: p.terms, expires_at: "2026-10-10T12:10:00Z" }, extra);
async function accepted(f) {
  await f.add("accepted", "cancellation_accepted", { effective_on: f.facts.effective_on, fee_cents: f.facts.fee_cents, fee_incurred_cents: f.facts.fee_cents, access_loss: f.facts.access_loss });
  return C.applyEvidence(f.scope, f.state, "accepted", NOW);
}
async function cancelled(f, at) {
  const s = await accepted(f);
  await f.add("effective", "cancellation_effective", { effective_on: f.facts.effective_on, fee_cents: f.facts.fee_cents, access_loss: f.facts.access_loss });
  return C.applyEvidence(f.scope, s, "effective", at || "2026-10-12T12:00:00Z");
}
const windowFacts = o => Object.assign({ billing_account_id: "mock-bank", coverage_complete: true, pending_unresolved: false, cycle_index: 0, billing_on: "2026-10-12", covered_through: "2026-10-13", charged_cents: 0, charges: [] }, o);

test("[S01] only fresh, server-owned evidence of the person's own account counts: a client upload or a 3-day-old snapshot makes no card", async () => {
  const f = await fixture();
  assert.equal(f.p.state, "ready_for_review");
  f.records.source.authority = "client-upload";
  await assert.rejects(() => C.prepare(f.scope, "source", "cancel_contract", NOW), /unverified_evidence/);
  const g = await fixture();
  g.records.source.owner_id = "someone-else";
  await assert.rejects(() => C.prepare(g.scope, "source", "cancel_contract", NOW), /unverified_evidence/);
  const stale = await fixture({}, { observed_at: "2026-10-07T11:00:00Z" });
  assert.equal(stale.p.state, "needs_evidence");
  assert.deepEqual(stale.p.missing, ["fresh_source"]);
});

test("[S02] billing dates stay anchored to the renewal day: Jan 31 renews Feb 29 then Mar 31, and a window is read on that date", async () => {
  assert.deepEqual([1, 2, 3].map(i => C.cycleDate("2024-01-31", 1, i)), ["2024-02-29", "2024-03-31", "2024-04-30"]);
  assert.equal(C.cycleDate("2024-02-29", 12, 1), "2025-02-28");
  const f = await fixture({ renewal_on: "2026-10-31", effective_on: "2026-10-30" });
  const s = await cancelled(f, "2026-10-31T12:00:00Z");
  await f.add("w1", "billing_window", windowFacts({ cycle_index: 1, billing_on: "2026-11-30", covered_through: "2026-12-01" }));
  const r = await C.applyEvidence(f.scope, s, "w1", "2026-12-02T12:00:00Z");
  assert.deepEqual(Object.keys(r.billing_windows), ["2026-11-30"]);
  assert.equal(r.deadline_on, "2026-12-31");
});

test("[S03] the card shows every term the person is agreeing to: without what they lose and when, there is no card", async () => {
  for (const [patch, missing] of [[{ access_loss: null }, "access_loss"], [{ refund_policy: null }, "refund_policy"], [{ fee_cents: null }, "fee_cents"], [{ purchase_channel: "unknown" }, "purchase_channel"]]) {
    const f = await fixture(patch);
    assert.equal(f.p.state, "needs_evidence", missing);
    assert.equal(f.p.proposal, null);
    assert.deepEqual(f.p.missing, [missing]);
  }
  assert.equal((await fixture()).p.proposal.terms.access_loss, "End of paid period");
});

test("[S04] the review window: a card can be made on the last review day, never after it", async () => {
  assert.equal((await fixture({ review_deadline_on: "2026-10-10" })).p.state, "ready_for_review");
  const late = await fixture({ review_deadline_on: "2026-10-09" });
  assert.equal(late.p.state, "needs_evidence");
  assert.deepEqual(late.p.missing, ["review_deadline_passed"]);
});

test("[S05] a yes is short-lived: the card lasts 15 minutes (or to the end of the review day), and an expired approval does nothing", async () => {
  const f = await fixture({ review_deadline_on: "2026-10-11" });
  assert.equal(f.p.proposal.expires_at, "2026-10-10T12:15:00.000Z");
  const g = await fixture({ review_deadline_on: "2026-10-10" }, { now: "2026-10-10T23:50:00Z" });
  assert.equal(g.p.proposal.expires_at, "2026-10-10T23:59:59.000Z");
  f.approvals.approval = yes(f.p.proposal, { expires_at: "2026-10-10T11:59:00Z" });
  await assert.rejects(() => C.authorize(f.scope, f.state, "approval", NOW), /approval_expired/);
});

test("[S06] one explicit yes from the signed-in owner, for exactly these terms: a model, another person or a changed fee is not a yes", async () => {
  const f = await fixture(), p = f.p.proposal;
  f.approvals.approval = yes(p);
  const ok = await C.authorize(f.scope, f.state, "approval", NOW);
  assert.equal(ok.approval_ref, "approval");
  assert.equal(ok.execution, "disabled_no_adapter");
  for (const patch of [{ actor: "model" }, { owner_id: "someone-else" }, { status: "pending" }, { terms: Object.assign({}, p.terms, { fee_cents: 101 }) }]) {
    f.approvals.approval = yes(p, patch);
    await assert.rejects(() => C.authorize(f.scope, f.state, "approval", NOW), /approval_mismatch/, JSON.stringify(patch));
  }
});

test("[S07] blocking the card is not cancelling: the contract stays active and no saving is projected", async () => {
  const f = await fixture();
  await f.add("block", "issuer_block", { issuer_provider_key: "mock-issuer", active: true }, { provider_key: "mock-issuer" });
  const s = await C.applyEvidence(f.scope, f.state, "block", NOW);
  assert.deepEqual([s.block_state, s.contract_state, s.request_state], ["active", "active", "not_requested"]);
  const b = await fixture({}, { action: "block_charges" });
  assert.equal(C.summary(b.scope, b.state, NOW).projected_annual_net_savings_cents, null);
  assert.match(C.summary(b.scope, b.state, NOW).caveat, /a block does not terminate a contract/);
});

test("[S08] if the merchant's terms change after the yes, the old yes does not carry over", async () => {
  const f = await fixture(), p = f.p.proposal;
  f.approvals.approval = yes(p, { expires_at: p.expires_at });
  f.records.source.facts.fee_cents = 999;
  f.records.source.payload_hash = await C.hash(f.records.source.facts);
  await assert.rejects(() => C.authorize(f.scope, f.state, "approval", NOW), /source_terms_changed/);
});

test("[S09] a request is not a cancellation: the contract stays active after the request and is only pending after the merchant accepts", async () => {
  const f = await fixture();
  await f.add("request", "cancellation_request", { response_deadline_on: "2026-10-11" });
  let s = await C.applyEvidence(f.scope, f.state, "request", NOW);
  assert.deepEqual([s.request_state, s.contract_state, s.deadline_on], ["requested", "active", "2026-10-11"]);
  assert.equal(C.summary(f.scope, s, NOW).verified_net_savings_cents, null);
  s = await accepted(Object.assign({}, f, { state: s }));
  assert.deepEqual([s.request_state, s.contract_state, s.deadline_on], ["accepted", "termination_pending", "2026-10-11"]);
});

test("[S10] done only on the merchant's effective record, after it accepted and on or after the date", async () => {
  const f = await fixture();
  await f.add("effective", "cancellation_effective", { effective_on: f.facts.effective_on, fee_cents: 100, access_loss: f.facts.access_loss });
  await assert.rejects(() => C.applyEvidence(f.scope, f.state, "effective", "2026-10-12T12:00:00Z"), /accepted_effective_cancellation_required/);
  const s = await accepted(f);
  await assert.rejects(() => C.applyEvidence(f.scope, s, "effective", "2026-10-10T12:00:00Z"), /accepted_effective_cancellation_required/, "before the effective date");
  const done = await C.applyEvidence(f.scope, s, "effective", "2026-10-12T12:00:00Z");
  assert.deepEqual([done.contract_state, done.monitoring_state, done.deadline_on], ["terminated", "awaiting_next_billing", "2026-10-12"]);
});

test("[S11] the merchant accepting on other terms (a later end date) cannot mark the case accepted", async () => {
  const f = await fixture();
  await f.add("later", "cancellation_accepted", { effective_on: "2026-10-15", fee_cents: 100, fee_incurred_cents: 100, access_loss: f.facts.access_loss });
  await assert.rejects(() => C.applyEvidence(f.scope, f.state, "later", NOW), /cancellation_terms_changed/);
});

test("[S12] a charge is called avoided only with complete coverage of the person's account and nothing pending", async () => {
  const f = await fixture(), s = await cancelled(f);
  for (const patch of [{ coverage_complete: false }, { pending_unresolved: true }, { billing_account_id: "another-account" }]) {
    await f.add("w", "billing_window", windowFacts(patch));
    await assert.rejects(() => C.applyEvidence(f.scope, s, "w", AFTER), /complete_billing_coverage_required/, JSON.stringify(patch));
  }
});

test("[S13] the saving is net: $15.00 avoided less the $1.00 fee and the $2.00 still owed is $12.00; the year's projection is $177.00", async () => {
  const f = await fixture(), s = await cancelled(f);
  await f.add("w", "billing_window", windowFacts());
  const r = await C.applyEvidence(f.scope, s, "w", AFTER), sum = C.summary(f.scope, r, AFTER);
  assert.deepEqual([sum.verified_avoided_charges_cents, sum.verified_net_savings_cents, sum.projected_annual_net_savings_cents, sum.actual_fees_cents], [1500, 1200, 17700, 100]);
});

test("[S14] a charge after the cancellation reopens the case and counts nothing as avoided", async () => {
  const f = await fixture(), s = await cancelled(f);
  await f.add("charged", "billing_window", windowFacts({ charged_cents: 1500, charges: [{ transaction_id: "mock-charge", amount_cents: 1500 }] }));
  const r = await C.applyEvidence(f.scope, s, "charged", AFTER), sum = C.summary(f.scope, r, AFTER);
  assert.deepEqual([r.contract_state, r.monitoring_state], ["continued_charge", "reopened"]);
  assert.deepEqual([sum.verified_avoided_charges_cents, sum.verified_net_savings_cents], [0, -300]);
});

test("[S15] refunds are cash received, linked to the charge and never more than it, and never counted as savings", async () => {
  const f = await fixture(), s = await cancelled(f);
  await f.add("charged", "billing_window", windowFacts({ charged_cents: 1500, charges: [{ transaction_id: "mock-charge", amount_cents: 1500 }] }));
  let r = await C.applyEvidence(f.scope, s, "charged", AFTER);
  for (const [id, amt] of [["r1", 500], ["r2", 1000]]) { await f.add(id, "refund_received", { billing_account_id: "mock-bank", transaction_id: id, original_charge_id: "mock-charge", status: "posted", amount_cents: amt }); r = await C.applyEvidence(f.scope, r, id, AFTER); }
  const sum = C.summary(f.scope, r, AFTER);
  assert.deepEqual([sum.refund_cash_received_cents, sum.verified_avoided_charges_cents], [1500, 0]);
  await f.add("over", "refund_received", { billing_account_id: "mock-bank", transaction_id: "over", original_charge_id: "mock-charge", status: "posted", amount_cents: 1 });
  await assert.rejects(() => C.applyEvidence(f.scope, r, "over", AFTER), /refund_exceeds_charge/);
  await f.add("pending", "refund_received", { billing_account_id: "mock-bank", transaction_id: "p1", original_charge_id: "mock-charge", status: "pending", amount_cents: 1 });
  await assert.rejects(() => C.applyEvidence(f.scope, r, "pending", AFTER), /refund_identity_required/);
});

test("[ADV] forged, replayed and future records change nothing; nothing ever executes without an adapter", async () => {
  const f = await fixture();
  for (const patch of [{ payload_hash: "forged" }, { observed_at: "2027-01-01T00:00:00Z" }]) {
    const g = await fixture(); Object.assign(g.records.source, patch);
    await assert.rejects(() => C.prepare(g.scope, "source", "cancel_contract", NOW));
  }
  // An approval the client hands in is not read: only the protected store's.
  const noStore = Object.assign({}, f.scope, { readApproval: undefined });
  await assert.rejects(() => C.authorize(noStore, f.state, "approval", NOW), /protected_approval_store_required/);
  await f.add("block", "issuer_block", { issuer_provider_key: "mock-issuer", active: true }, { provider_key: "mock-issuer" });
  const s = await C.applyEvidence(f.scope, f.state, "block", NOW);
  f.records.block.kind = "cancellation_accepted";
  await assert.rejects(() => C.applyEvidence(f.scope, s, "block", NOW), /event_replay_conflict/);
  assert.equal(C.summary(f.scope, s, NOW).execution, "disabled_no_adapter");
  assert.equal(f.p.execution, "disabled_no_adapter");
});
