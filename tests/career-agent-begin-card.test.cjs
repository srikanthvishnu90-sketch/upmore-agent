// CHAT-SIDE BEGIN-CALLER, CLOUD CARD COMPOSITION (176) — F-030 SEAM
// (2026-10-22). Root cause: docs/apply/ROOT-CAUSE-F030-SEAM-CARD-
// BINDING-2026-10-22.md.
//
// The agent cloud begin (20261024140000) enqueues a claim-shaped row
// the cloud claim can never take: career_apply_cloud_refusal's first
// check is the bridge's card binding (cloud_bound_refusal, 130000),
// and a chat-begun row has no cloud_bound_jobs row AND carries the
// agent_batch_hash the binding check forbids. Composition (A), the
// C9 decision on this line: the chat card mints the binding through
// the bridge's machinery; the claim enforces it. This suite proves
// module 176's new caller, beginCloudCardPostings, against RECORDING
// STUBS — no live calls, nothing sends, the flag stays OFF in the
// flag leg:
//
// (a) happy path: the contract + cloud-door mirrors pass, the engine-
//     prepared item is verified to bind to the approved entry, and the
//     card is shown with ONE career_apply_message_cloud_card_show_as
//     call carrying the exact items. The caller's own user-JWT rpc is
//     never used (no batch-approve store, no begin door), and NEITHER
//     stub ever sees career_apply_message_card_approve_own — the tap
//     is the person's own act, never the caller's.
// (b) gates: no approval record, flag OFF (the DB's words, before any
//     RPC), no thread, no cardRpc, no account stamp, no expiry.
// (c) binding refusals, each before the show call: a missing item, a
//     tampered item hash, an item for another posting, an item whose
//     field cites a fact its ledger row does not name first, a
//     quarantined entry fact (the DB's message), a missing engine
//     approval (the cloud door's message).
// (d) the show call's own failures: a service refusal surfaces
//     verbatim, once; a receipt whose hash does not recompute is a
//     mismatch, never a shown card.
//
// Check: node --test tests/career-agent-begin-card.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Begin = require(path.join(root, "packages/domain/176-career-agent-begin.js"));

const USER = "b2625909-d67f-41b2-8270-983d212c6052"; // the TEST user
const THREAD = "00000000-0000-4000-8000-00000000cba1";
const JOB_ID = "lever:testco:176card";
const TEXT_ANSWER_ID = "11111111-2222-4333-8444-555555555555";
const RESUME_SHA = "f".repeat(64);
const MANIFEST_HASH = "a".repeat(64);
const ENGINE_APPROVAL = "e".repeat(64);
const SCHEMA_HASH = "9".repeat(64);
const DESTINATION = "https://jobs.lever.co/testco/176card/apply";
const CARD_ID = "22222222-3333-4444-8555-666666666666";
const EXPIRES = "2026-10-23T05:30:00.000Z";

// The approved entry: the same BatchPosting shape the begin suites
// use, with the preparing engine's per-posting stamps.
function fixtureEntry(extra) {
  const answers = [
    { name: "email", label: "Email", value: "test@example.test", shown: "test@example.test", kind: "text", factId: "F-001", file: null },
    { name: "first_name", label: "First name", value: "Test", shown: "Test", kind: "text", factId: `text-answer:${TEXT_ANSWER_ID}`, file: null },
  ];
  const ledger = [
    { application_id: JOB_ID, field_id: "email", question_hash: "q1", answer_hash: "h1", fact_refs: ["F-001"], source_refs: ["owner-stated"], confirmation_event_id: "evt-1", derivation_rule: "verbatim" },
    { application_id: JOB_ID, field_id: "first_name", question_hash: "q2", answer_hash: "h2", fact_refs: [`text-answer:${TEXT_ANSWER_ID}`], source_refs: ["owner_reply"], confirmation_event_id: "evt-2", derivation_rule: "verbatim" },
  ];
  return Object.assign({
    jobId: JOB_ID, company: "Test Co", url: DESTINATION,
    answers, blank: [], ledger, question_set_hash: "d".repeat(64),
    manifest_hash: MANIFEST_HASH, quarantine_version: "d007-v1",
    destination: DESTINATION, engineApproval: ENGINE_APPROVAL,
  }, extra || {});
}

function fixtureRecord() {
  const cardSha256 = "c".repeat(64);
  return {
    kind: "batch_approval_record", version: 1, runId: "batch-176card", userId: USER,
    cardSha256, approvalRef: `batch:batch-176card:${cardSha256}`,
    approvals: {}, attestationsSupplied: [], approvedByUser: true,
    approvedAt: "2026-10-22T05:30:00.000Z", via: "card_tap_155_mint",
  };
}

// The engine-prepared card item for the same application, in the
// bridge's dialect (the shape prepare.ts puts in p_items and
// cloud_validate admits). Built with module 176's own canonical hash,
// so the item's hash is the DB's hash by construction.
async function fixtureItem(mutate) {
  const payload = {
    version: 1, user_id: USER, job_id: JOB_ID, company: "Test Co", url: DESTINATION,
    fields: [
      { name: "email", label: "Email", value: "test@example.test", factId: "F-001",
        provenance: "owner stated this in chat", confirmation_event_id: "evt-1",
        source: { table: "answers", key: "email", value: "test@example.test" } },
      { name: "first_name", label: "First name", value: "Test", factId: `text-answer:${TEXT_ANSWER_ID}`,
        provenance: "owner answered this question", confirmation_event_id: "evt-2",
        source: { table: "answers", key: "full_name", value: "Test" } },
    ],
    destination: DESTINATION, resume_sha256: RESUME_SHA,
    page_field_names: ["email", "first_name"],
    engine_approval: ENGINE_APPROVAL, schema_hash: SCHEMA_HASH,
    privacy_epoch: 2, account_version: 3, expires_at: EXPIRES,
    quarantine_version: "d007-v1", manifest_hash: MANIFEST_HASH,
    replay_sources: [
      { table: "answers", key: "email", value: "test@example.test", factId: "F-001", event: "evt-1", provenance: "owner stated this in chat" },
      { table: "answers", key: "full_name", value: "Test", factId: `text-answer:${TEXT_ANSWER_ID}`, event: "evt-2", provenance: "owner answered this question" },
    ],
  };
  const readback = {
    answers: [
      { name: "email", label: "Email", value: "test@example.test", shown: "test@example.test", factId: "F-001", kind: "text" },
      { name: "first_name", label: "First name", value: "Test", shown: "Test", factId: `text-answer:${TEXT_ANSWER_ID}`, kind: "text" },
    ],
    resume_name: "resume.pdf", resume_sha256: RESUME_SHA, destination: DESTINATION,
    blank: [], employer_fields: ["email", "first_name"],
  };
  const item = { payload, readback, hash: await Begin.sha256Hex(Begin.canonicalApplyJson(payload)) };
  if (mutate) mutate(item);
  return item;
}

function fixtureInput(item, extra) {
  return Object.assign({
    record: fixtureRecord(), userId: USER, threadId: THREAD,
    entries: [fixtureEntry()], cardItems: { [JOB_ID]: item },
    account: { epoch: 2, version: 3 }, expiresAt: EXPIRES,
    answeredTextAnswerIds: [TEXT_ANSWER_ID], resume: { filename: "resume.pdf", sha256: RESUME_SHA },
  }, extra || {});
}

// Recording stubs. The card stub plays the service-role producer: it
// mints a version-2 card body over the items it was handed and hashes
// it with the module's canonical form, like the DB does.
function stubs(opts) {
  const o = opts || {};
  const userCalls = [], cardCalls = [];
  const rpc = async (name, args) => { userCalls.push({ name, args }); throw new Error("user rpc must not be called by the card composition"); };
  const cardRpc = async (name, args) => {
    cardCalls.push({ name, args });
    if (o.showError) throw new Error(o.showError);
    const body = {
      version: 2, kind: "career-message-approval", execution_mode: "cloud",
      card_id: CARD_ID, user_id: args.p_user, thread_id: args.p_thread,
      issued_at: 1760000000000, expires_at: 1760086400000, items: args.p_items,
    };
    const hash = o.badReceiptHash ? "0".repeat(64) : await Begin.sha256Hex(Begin.canonicalApplyJson(body));
    return { id: CARD_ID, payload: body, hash, state: "open", message_id: 4242 };
  };
  return { deps: { rpc, cardRpc }, userCalls, cardCalls };
}

test("(a) happy path: one show call with the verified items; no approve call anywhere; no user rpc", async () => {
  const item = await fixtureItem();
  const { deps, userCalls, cardCalls } = stubs();
  const out = await Begin.beginCloudCardPostings(fixtureInput(item), deps);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.cardId, CARD_ID);
  assert.equal(out.messageId, 4242);
  assert.equal(typeof out.hash, "string");
  assert.deepEqual(out.results, [{ jobId: JOB_ID, ok: true, shown: true }]);
  assert.equal(cardCalls.length, 1);
  assert.equal(cardCalls[0].name, "career_apply_message_cloud_card_show_as");
  assert.equal(cardCalls[0].args.p_user, USER);
  assert.equal(cardCalls[0].args.p_thread, THREAD);
  assert.deepEqual(cardCalls[0].args.p_items, [item]);
  assert.equal(userCalls.length, 0, "the composition never touches the user-JWT rpc (no approve store, no begin door)");
  assert.ok(!JSON.stringify(cardCalls).includes("career_apply_message_card_approve_own"),
    "the tap is the person's own act — the caller never calls approve_own");
});

test("(b) gates refuse before any RPC", async () => {
  const item = await fixtureItem();
  { // no record
    const { deps, cardCalls } = stubs();
    const out = await Begin.beginCloudCardPostings(fixtureInput(item, { record: null }), deps);
    assert.equal(out.code, "NO_APPROVAL_RECORD"); assert.equal(cardCalls.length, 0);
  }
  { // record not approved by the user
    const { deps, cardCalls } = stubs();
    const rec = fixtureRecord(); rec.approvedByUser = false;
    const out = await Begin.beginCloudCardPostings(fixtureInput(item, { record: rec }), deps);
    assert.equal(out.code, "NO_APPROVAL_RECORD"); assert.equal(cardCalls.length, 0);
  }
  { // flag OFF: the DB's words, before any RPC
    const { deps, userCalls, cardCalls } = stubs();
    const out = await Begin.beginCloudCardPostings(fixtureInput(item, { flagEnabled: false }), deps);
    assert.equal(out.code, "AGENT_SUBMIT_OFF"); assert.equal(out.message, "agent submit is off");
    assert.equal(cardCalls.length + userCalls.length, 0);
  }
  { // no thread
    const { deps, cardCalls } = stubs();
    const out = await Begin.beginCloudCardPostings(fixtureInput(item, { threadId: null }), deps);
    assert.equal(out.code, "NO_THREAD"); assert.equal(cardCalls.length, 0);
  }
  { // no cardRpc injected
    const item2 = await fixtureItem();
    const out = await Begin.beginCloudCardPostings(fixtureInput(item2), { rpc: async () => { throw new Error("unused"); } });
    assert.equal(out.code, "NO_CARD_RPC");
  }
  { // no account stamp / no expiry: parity with runBegin's gates
    const { deps, cardCalls } = stubs();
    const out = await Begin.beginCloudCardPostings(fixtureInput(item, { account: null }), deps);
    assert.equal(out.code, "NO_ACCOUNT_STAMP"); assert.equal(cardCalls.length, 0);
    const out2 = await Begin.beginCloudCardPostings(fixtureInput(item, { expiresAt: null }), deps);
    assert.equal(out2.code, "NO_EXPIRY"); assert.equal(cardCalls.length, 0);
  }
});

test("(c) binding refusals land before the show call", async () => {
  { // missing item
    const { deps, cardCalls } = stubs();
    const out = await Begin.beginCloudCardPostings(fixtureInput(null, { cardItems: {} }), deps);
    assert.equal(out.ok, false);
    assert.equal(out.results[0].code, "CARD_ITEM_MISSING");
    assert.equal(cardCalls.length, 0);
  }
  { // tampered item hash
    const item = await fixtureItem((it) => { it.hash = "0".repeat(64); });
    const { deps, cardCalls } = stubs();
    const out = await Begin.beginCloudCardPostings(fixtureInput(item), deps);
    assert.equal(out.results[0].code, "CARD_ITEM_MISMATCH"); assert.equal(cardCalls.length, 0);
  }
  { // item for another posting
    const item = await fixtureItem((it) => { it.payload.job_id = "lever:testco:other"; });
    item.hash = await Begin.sha256Hex(Begin.canonicalApplyJson(item.payload));
    const { deps, cardCalls } = stubs();
    const out = await Begin.beginCloudCardPostings(fixtureInput(item), deps);
    assert.equal(out.results[0].code, "CARD_ITEM_MISMATCH"); assert.equal(cardCalls.length, 0);
  }
  { // a field citing a fact its ledger row does not name first
    const item = await fixtureItem((it) => { it.payload.fields[0].factId = "F-999"; it.readback.answers[0].factId = "F-999"; });
    item.hash = await Begin.sha256Hex(Begin.canonicalApplyJson(item.payload));
    const { deps, cardCalls } = stubs();
    const out = await Begin.beginCloudCardPostings(fixtureInput(item), deps);
    assert.equal(out.results[0].code, "CARD_ITEM_MISMATCH"); assert.equal(cardCalls.length, 0);
  }
  { // a field value that is not the approved answer
    const item = await fixtureItem((it) => { it.payload.fields[0].value = "other@example.test"; it.readback.answers[0].value = "other@example.test"; });
    item.hash = await Begin.sha256Hex(Begin.canonicalApplyJson(item.payload));
    const { deps, cardCalls } = stubs();
    const out = await Begin.beginCloudCardPostings(fixtureInput(item), deps);
    assert.equal(out.results[0].code, "CARD_ITEM_MISMATCH"); assert.equal(cardCalls.length, 0);
  }
  { // quarantined entry fact: the contract mirror, the DB's words
    const { deps, cardCalls } = stubs();
    const entry = fixtureEntry();
    entry.answers[0].factId = "F-030"; entry.ledger[0].fact_refs = ["F-030"];
    const out = await Begin.beginCloudCardPostings(fixtureInput(await fixtureItem(), { entries: [entry] }), deps);
    assert.equal(out.results[0].code, "AGENT_CONTRACT_REFUSED");
    assert.equal(out.results[0].message, "agent contract: quarantined fact");
    assert.equal(cardCalls.length, 0);
  }
  { // no engine approval on the entry: the cloud door's mirror
    const { deps, cardCalls } = stubs();
    const entry = fixtureEntry(); delete entry.engineApproval;
    const out = await Begin.beginCloudCardPostings(fixtureInput(await fixtureItem(), { entries: [entry] }), deps);
    assert.equal(out.results[0].code, "AGENT_CLOUD_REFUSED");
    assert.equal(out.results[0].message, "agent cloud: engine approval");
    assert.equal(cardCalls.length, 0);
  }
});

test("(d) the show call's failures are named, verbatim, once", async () => {
  { // service refusal surfaces verbatim
    const { deps, cardCalls } = stubs({ showError: "cloud card disabled" });
    const out = await Begin.beginCloudCardPostings(fixtureInput(await fixtureItem()), deps);
    assert.equal(out.ok, false);
    assert.equal(out.code, "CARD_SHOW_REFUSED");
    assert.equal(out.message, "cloud card disabled");
    assert.equal(cardCalls.length, 1, "a refused show is never retried");
  }
  { // a receipt whose hash does not recompute is not a shown card
    const { deps } = stubs({ badReceiptHash: true });
    const out = await Begin.beginCloudCardPostings(fixtureInput(await fixtureItem()), deps);
    assert.equal(out.ok, false);
    assert.equal(out.code, "CARD_RECEIPT_MISMATCH");
  }
});
