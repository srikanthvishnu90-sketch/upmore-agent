// CHAT-SIDE BEGIN-CALLER (176) — night plan chunk 40% (2026-10-22).
//
// The begin RPC (career_apply_extension_begin_agent_own, WO-101 as
// redefined by the WO-102 contract, migration 20261024100000) had
// exactly one client caller in the world: the Chrome extension. This
// suite proves the chat-side caller module 176 against a RECORDING
// STUB rpc — no live calls, nothing sends, nothing submits, the flag
// stays OFF in every leg.
//
// Groups:
// (a) the payload builder + the local mirror of the contract's six
//     checks (mirrored from supabase/migrations/
//     20261024100000_career_apply_agent_contract.sql on the wo line,
//     cited per check in 176's source), with negative controls: each
//     tamper is refused locally with the DB's exact message.
// (b) flag OFF (host-supplied flagEnabled:false) -> the caller
//     refuses 'agent submit is off' BEFORE any RPC (zero recorded
//     calls).
// (c) DB refusals (stub throws) -> surfaced verbatim, classified,
//     attempted exactly once, never retried.
// (d) the happy path: one approve_own call storing every entry under
//     its canonical batch hash, then one begin per posting with the
//     exact payload + its canonical hash; the job id/lease surface.
// (e) beginFromClaim: the entry from 175's claim gate output — a
//     claim whose ref is not the deterministic mint is refused
//     before any RPC.
// (f) pins: QUARANTINE_VERSION / DERIVATION_RULES against the
//     migration's constants (literal pin here; a text cross-check
//     runs when the migration file is present in the tree), the
//     canonical JSON form, and a SHA-256 test vector.
//
// Check: node --test tests/career-agent-begin.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Begin = require(path.join(root, "packages/domain/176-career-agent-begin.js"));

const USER = "b2625909-d67f-41b2-8270-983d212c6052"; // the TEST user
const JOB_ID = "greenhouse:test-co:176-1";
const JOB_ID_2 = "greenhouse:test-co:176-2";
const TEXT_ANSWER_ID = "11111111-2222-4333-8444-555555555555";
const RESUME_SHA = "f".repeat(64);
const MANIFEST_HASH = "a".repeat(64);
const JOB_ROW_ID = "99999999-8888-4777-8666-555555555555";
const LEASE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

// A BatchPosting entry in the exact shape TraineeCore.batchPlan
// produces (extension/lib/trainee-core.js, wo line) — the shape
// career_apply_batch_approve_own stores and the contract reads.
function fixtureEntry(jobId) {
  const answers = [
    { name: "email", label: "Email", value: "test@example.test", shown: "test@example.test", kind: "text", factId: "F-001", file: null },
    { name: "first_name", label: "First name", value: "Test", shown: "Test", kind: "text", factId: `text-answer:${TEXT_ANSWER_ID}`, file: null },
    { name: "resume", label: "Resume", value: "resume.pdf", shown: "resume.pdf", kind: "file", factId: "approved-local-resume:TEST", file: RESUME_SHA },
  ];
  const ledger = [
    { application_id: jobId, field_id: "email", question_hash: "q1", answer_hash: "h1", fact_refs: ["F-001"], source_refs: ["owner-stated"], confirmation_event_id: "evt-1", derivation_rule: "verbatim" },
    { application_id: jobId, field_id: "first_name", question_hash: "q2", answer_hash: "h2", fact_refs: [`text-answer:${TEXT_ANSWER_ID}`], source_refs: ["owner_reply"], confirmation_event_id: "evt-2", derivation_rule: "verbatim" },
    { application_id: jobId, field_id: "resume", question_hash: "q3", answer_hash: "h3", fact_refs: ["approved-local-resume:TEST"], source_refs: ["owner-stated"], confirmation_event_id: "evt-3", derivation_rule: "attachment" },
  ];
  return {
    jobId, company: "Test Co", url: "https://jobs.example.test/posting/1",
    answers, blank: [], ledger, question_set_hash: "e".repeat(64),
    manifest_hash: MANIFEST_HASH, quarantine_version: "d007-v1",
  };
}

function fixtureRecord() {
  const cardSha256 = "c".repeat(64);
  return {
    kind: "batch_approval_record", version: 1, runId: "batch-176test", userId: USER,
    cardSha256, approvalRef: `batch:batch-176test:${cardSha256}`,
    approvals: { k1: "d".repeat(64) }, attestationsSupplied: ["certify_true"],
    approvedByUser: true, approvedAt: "2026-10-22T05:00:00.000Z", via: "card_tap_155_mint",
  };
}

function baseInput(entries, extra) {
  return Object.assign({
    record: fixtureRecord(),
    entries,
    userId: USER,
    account: { epoch: 3, version: 7 },
    expiresAt: "2027-01-01T00:00:00.000Z",
    answeredTextAnswerIds: [TEXT_ANSWER_ID],
    familyByJobId: { [JOB_ID]: "greenhouse", [JOB_ID_2]: "greenhouse" },
    resume: { filename: "resume.pdf", sha256: RESUME_SHA },
    flagEnabled: null,
  }, extra || {});
}

// A recording stub for the host's user-JWT rpc client
// (client.rpc(name, args) — the career_persistence.js shape).
function stubRpc(behavior) {
  const calls = [];
  const rpc = async (name, args) => {
    calls.push({ name, args });
    if (behavior) return behavior(name, args, calls);
    if (name === "career_apply_batch_approve_own") return args.p_items.length;
    if (name === "career_apply_extension_begin_agent_own") return { id: JOB_ROW_ID, lease: LEASE, payload_hash: "b".repeat(64) };
    throw new Error(`unexpected rpc ${name}`);
  };
  return { rpc, calls };
}

const payloadFor = (entry) => Begin.buildBeginPayload({
  entry, userId: USER, family: "greenhouse",
  account: { epoch: 3, version: 7 }, expiresAt: "2027-01-01T00:00:00.000Z",
  resume: { filename: "resume.pdf", sha256: RESUME_SHA },
});
const checkOk = (entry, payload, ids) => Begin.checkContract(entry, payload, { answeredTextAnswerIds: ids || [TEXT_ANSWER_ID] });

// ---------------- (f) pins ----------------

test("pins: quarantine version + derivation rules mirror the migration", async () => {
  assert.equal(Begin.QUARANTINE_VERSION, "d007-v1");
  assert.deepEqual(Begin.DERIVATION_RULES, ["verbatim", "option-exact", "option-yes-no", "checkbox-yes-no", "attachment"]);
  const mig = path.join(root, "supabase/migrations/20261024100000_career_apply_agent_contract.sql");
  if (fs.existsSync(mig)) {
    const text = fs.readFileSync(mig, "utf8");
    assert.match(text, new RegExp(`qv constant text := '${Begin.QUARANTINE_VERSION}'`));
    for (const r of Begin.DERIVATION_RULES) assert.ok(text.includes(`'${r}'`), `rule ${r} in migration`);
  }
});

test("pins: canonical JSON + sha256 test vector", async () => {
  assert.equal(Begin.canonicalApplyJson({ b: 1, a: "x" }), '{"a":"x","b":1}');
  assert.equal(Begin.canonicalApplyJson({ z: [3, { b: null, a: true }] }), '{"z":[3,{"a":true,"b":null}]}');
  // FIPS 180-4 example: SHA-256("abc")
  assert.equal(await Begin.sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

// ---------------- (a) builder + contract mirror ----------------

test("a: payload is built from the entry's answers, one source", () => {
  const entry = fixtureEntry(JOB_ID);
  const p = payloadFor(entry);
  assert.equal(p.version, 1);
  assert.equal(p.source, "extension"); // begin_own's own requirement (20261021120000) — named in 176's header
  assert.equal(p.user_id, USER);
  assert.equal(p.job_id, JOB_ID);
  assert.equal(p.company, "Test Co");
  assert.equal(p.url, entry.url);
  assert.equal(p.family, "greenhouse");
  assert.equal(p.manifest_hash, MANIFEST_HASH);
  assert.equal(p.quarantine_version, "d007-v1");
  assert.equal(p.privacy_epoch, 3);
  assert.equal(p.account_version, 7);
  assert.equal(p.resume_sha256, RESUME_SHA);
  assert.deepEqual(p.fields.map((f) => f.name), entry.answers.map((a) => a.name));
  for (const f of p.fields) {
    assert.equal(f.source, "trainee");
    const a = entry.answers.find((x) => x.name === f.name);
    assert.equal(f.factId, a.factId);
    assert.equal(f.value, a.value);
  }
});

test("a: a well-formed entry + payload passes all six checks", () => {
  const entry = fixtureEntry(JOB_ID);
  assert.deepEqual(checkOk(entry, payloadFor(entry)), { ok: true });
});

test("a-neg: quarantine version (entry) -> 'agent contract: quarantine version'", () => {
  const entry = fixtureEntry(JOB_ID);
  entry.quarantine_version = "d006-v9";
  const r = checkOk(entry, payloadFor(entry));
  assert.equal(r.ok, false);
  assert.equal(r.message, "agent contract: quarantine version");
});

test("a-neg: manifest — entry hash not 64 hex -> 'agent contract: manifest'", () => {
  const entry = fixtureEntry(JOB_ID);
  entry.manifest_hash = "not-a-hash";
  const r = checkOk(entry, payloadFor(entry));
  assert.equal(r.ok, false);
  assert.equal(r.message, "agent contract: manifest");
});

test("a-neg: manifest — payload tampered after build -> 'agent contract: manifest'", () => {
  const entry = fixtureEntry(JOB_ID);
  const p = payloadFor(entry);
  p.manifest_hash = "0".repeat(64);
  assert.equal(checkOk(entry, p).message, "agent contract: manifest");
  const p2 = payloadFor(entry);
  p2.quarantine_version = "d006-v9";
  assert.equal(checkOk(entry, p2).message, "agent contract: manifest");
});

test("a-neg: ledger — a missing row -> 'agent contract: ledger'", () => {
  const entry = fixtureEntry(JOB_ID);
  entry.ledger = entry.ledger.filter((l) => l.field_id !== "email");
  assert.equal(checkOk(entry, payloadFor(entry)).message, "agent contract: ledger");
});

test("a-neg: ledger — an extra row for a field nobody answered -> 'agent contract: ledger'", () => {
  const entry = fixtureEntry(JOB_ID);
  entry.ledger.push({ application_id: JOB_ID, field_id: "ghost", question_hash: "q", answer_hash: "h", fact_refs: ["F-002"], source_refs: ["owner-stated"], confirmation_event_id: "evt-9", derivation_rule: "verbatim" });
  assert.equal(checkOk(entry, payloadFor(entry)).message, "agent contract: ledger");
});

test("a-neg: ledger — bad derivation rule / empty fact_refs / wrong posting -> 'agent contract: ledger'", () => {
  const e1 = fixtureEntry(JOB_ID);
  e1.ledger[0].derivation_rule = "guessed";
  assert.equal(checkOk(e1, payloadFor(e1)).message, "agent contract: ledger");
  const e2 = fixtureEntry(JOB_ID);
  e2.ledger[0].fact_refs = [];
  assert.equal(checkOk(e2, payloadFor(e2)).message, "agent contract: ledger");
  const e3 = fixtureEntry(JOB_ID);
  e3.ledger[0].application_id = "someone-elses-posting";
  assert.equal(checkOk(e3, payloadFor(e3)).message, "agent contract: ledger");
  const e4 = fixtureEntry(JOB_ID);
  e4.ledger[0].confirmation_event_id = "  ";
  assert.equal(checkOk(e4, payloadFor(e4)).message, "agent contract: ledger");
});

test("a-neg: quarantined fact — F-027..F-079 ref, answer factId, delegation source", () => {
  const e1 = fixtureEntry(JOB_ID);
  e1.ledger[0].fact_refs = ["F-027"];
  assert.equal(checkOk(e1, payloadFor(e1)).message, "agent contract: quarantined fact");
  const e2 = fixtureEntry(JOB_ID);
  e2.answers[0].factId = "F-050";
  e2.ledger[0].fact_refs = ["F-050"];
  assert.equal(checkOk(e2, payloadFor(e2)).message, "agent contract: quarantined fact");
  const e3 = fixtureEntry(JOB_ID);
  e3.ledger[0].source_refs = ["owner-delegated"];
  assert.equal(checkOk(e3, payloadFor(e3)).message, "agent contract: quarantined fact");
  // boundary: F-026 and F-080 are outside the quarantined range
  const e4 = fixtureEntry(JOB_ID);
  e4.ledger[0].fact_refs = ["F-026"];
  e4.answers[0].factId = "F-026";
  assert.deepEqual(checkOk(e4, payloadFor(e4)), { ok: true });
});

test("a-neg: payload — a field that was never approved -> 'agent contract: payload not the approved answers'", () => {
  const entry = fixtureEntry(JOB_ID);
  const p = payloadFor(entry);
  p.fields.push({ name: "sneaky", label: "Sneaky", value: "x", source: "trainee", factId: "F-001", detail: "" });
  assert.equal(checkOk(entry, p).message, "agent contract: payload not the approved answers");
});

test("a-neg: payload — a non-trainee field source / a swapped factId / a dropped field", () => {
  const entry = fixtureEntry(JOB_ID);
  const p1 = payloadFor(entry);
  p1.fields[0].source = "page";
  assert.equal(checkOk(entry, p1).message, "agent contract: payload not the approved answers");
  const p2 = payloadFor(entry);
  p2.fields[0].factId = "F-002";
  assert.equal(checkOk(entry, p2).message, "agent contract: payload not the approved answers");
  const p3 = payloadFor(entry);
  p3.fields = p3.fields.slice(1);
  assert.equal(checkOk(entry, p3).message, "agent contract: payload not the approved answers");
});

test("a-neg: withdrawn answer — the text-answer is no longer answered -> 'agent contract: withdrawn answer'", () => {
  const entry = fixtureEntry(JOB_ID);
  const r = checkOk(entry, payloadFor(entry), []);
  assert.equal(r.ok, false);
  assert.equal(r.message, "agent contract: withdrawn answer");
  const e2 = fixtureEntry(JOB_ID);
  e2.ledger[1].fact_refs = ["text-answer:not-a-uuid"];
  e2.answers[1].factId = "text-answer:not-a-uuid";
  assert.equal(checkOk(e2, payloadFor(e2)).message, "agent contract: withdrawn answer");
});

// ---------------- (b) flag OFF refuses before any RPC ----------------

test("b: flagEnabled false -> AGENT_SUBMIT_OFF, zero rpc calls", async () => {
  const { rpc, calls } = stubRpc();
  const r = await Begin.beginApprovedPostings(baseInput([fixtureEntry(JOB_ID)], { flagEnabled: false }), { rpc });
  assert.equal(r.ok, false);
  assert.equal(r.code, "AGENT_SUBMIT_OFF");
  assert.equal(r.message, "agent submit is off");
  assert.equal(calls.length, 0);
});

// ---------------- (c) DB refusals surfaced verbatim, never retried ----------------

test("c: DB contract refusal surfaces verbatim, begin attempted exactly once", async () => {
  const { rpc, calls } = stubRpc((name) => {
    if (name === "career_apply_batch_approve_own") return 1;
    throw new Error("agent contract: manifest");
  });
  const r = await Begin.beginApprovedPostings(baseInput([fixtureEntry(JOB_ID)]), { rpc });
  assert.equal(r.ok, false);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].ok, false);
  assert.equal(r.results[0].code, "AGENT_CONTRACT_REFUSED");
  assert.equal(r.results[0].message, "agent contract: manifest");
  assert.equal(calls.filter((c) => c.name === "career_apply_extension_begin_agent_own").length, 1);
});

test("c: DB 'agent submit is off' (flag unknown to the caller) is classified distinctly", async () => {
  const { rpc } = stubRpc((name) => {
    if (name === "career_apply_batch_approve_own") return 1;
    throw new Error("agent submit is off");
  });
  const r = await Begin.beginApprovedPostings(baseInput([fixtureEntry(JOB_ID)]), { rpc });
  assert.equal(r.results[0].code, "AGENT_SUBMIT_OFF");
  assert.equal(r.results[0].message, "agent submit is off");
});

test("c: no live approval at begin -> NO_LIVE_APPROVAL, verbatim", async () => {
  const { rpc } = stubRpc((name) => {
    if (name === "career_apply_batch_approve_own") return 1;
    throw new Error("no live batch approval for this posting");
  });
  const r = await Begin.beginApprovedPostings(baseInput([fixtureEntry(JOB_ID)]), { rpc });
  assert.equal(r.results[0].code, "NO_LIVE_APPROVAL");
  assert.equal(r.results[0].message, "no live batch approval for this posting");
});

test("c: the approval store itself refusing stops everything, verbatim, no begin attempted", async () => {
  const { rpc, calls } = stubRpc(() => { throw new Error("invalid or stale batch approval"); });
  const r = await Begin.beginApprovedPostings(baseInput([fixtureEntry(JOB_ID)]), { rpc });
  assert.equal(r.ok, false);
  assert.equal(r.code, "APPROVAL_STORE_REFUSED");
  assert.equal(r.message, "invalid or stale batch approval");
  assert.equal(calls.filter((c) => c.name === "career_apply_extension_begin_agent_own").length, 0);
});

test("c: no approval record -> refused before any RPC", async () => {
  const { rpc, calls } = stubRpc();
  const r = await Begin.beginApprovedPostings(baseInput([fixtureEntry(JOB_ID)], { record: null }), { rpc });
  assert.equal(r.ok, false);
  assert.equal(r.code, "NO_APPROVAL_RECORD");
  assert.equal(calls.length, 0);
});

// ---------------- (d) happy path ----------------

test("d: happy path — approvals stored under the DB's own hash, then one begin per posting", async () => {
  const e1 = fixtureEntry(JOB_ID);
  const e2 = fixtureEntry(JOB_ID_2);
  const { rpc, calls } = stubRpc();
  const r = await Begin.beginApprovedPostings(baseInput([e1, e2]), { rpc });
  assert.equal(r.ok, true);
  assert.equal(r.approvalsStored, 2);
  assert.deepEqual(calls.map((c) => c.name), [
    "career_apply_batch_approve_own",
    "career_apply_extension_begin_agent_own",
    "career_apply_extension_begin_agent_own",
  ]);
  // the stored items carry the {version:1, kind:"agent-batch", ...entry} shape + its canonical hash
  const items = calls[0].args.p_items;
  assert.equal(items.length, 2);
  assert.equal(items[0].entry.version, 1);
  assert.equal(items[0].entry.kind, "agent-batch");
  assert.equal(items[0].entry.jobId, JOB_ID);
  assert.equal(items[0].hash, await Begin.batchHashOf(e1));
  assert.match(items[0].hash, /^[0-9a-f]{64}$/);
  // each begin: the payload, its canonical hash as the approval, the batch hash
  for (const [i, e] of [e1, e2].entries()) {
    const args = calls[1 + i].args;
    assert.equal(args.p_payload.job_id, e.jobId);
    assert.equal(args.p_batch_hash, await Begin.batchHashOf(e));
    assert.equal(args.p_approval, await Begin.sha256Hex(Begin.canonicalApplyJson(args.p_payload)));
    assert.deepEqual(args.p_payload, payloadFor(e));
  }
  assert.deepEqual(r.results.map((x) => x.id), [JOB_ROW_ID, JOB_ROW_ID]);
  assert.equal(r.results[0].lease, LEASE);
  assert.equal(r.results[0].payloadHash, "b".repeat(64));
});

test("d: one posting locally refused does not begin, the other still does", async () => {
  const e1 = fixtureEntry(JOB_ID);
  const e2 = fixtureEntry(JOB_ID_2);
  e2.ledger[0].fact_refs = ["F-030"]; // quarantined range
  e2.answers[0].factId = "F-030";
  const { rpc, calls } = stubRpc();
  const r = await Begin.beginApprovedPostings(baseInput([e1, e2]), { rpc });
  assert.equal(r.ok, false);
  assert.equal(r.results[0].ok, true);
  assert.equal(r.results[1].ok, false);
  assert.equal(r.results[1].code, "AGENT_CONTRACT_REFUSED");
  assert.equal(r.results[1].message, "agent contract: quarantined fact");
  assert.equal(calls.filter((c) => c.name === "career_apply_extension_begin_agent_own").length, 1);
});

test("d: batchHashOf changes when an approved answer changes", async () => {
  const e1 = fixtureEntry(JOB_ID);
  const h1 = await Begin.batchHashOf(e1);
  e1.answers[0].value = "other@example.test";
  const h2 = await Begin.batchHashOf(e1);
  assert.notEqual(h1, h2);
});

// ---------------- (e) beginFromClaim ----------------

test("e: beginFromClaim refuses a claim whose ref is not the deterministic mint — before any RPC", async () => {
  const { rpc, calls } = stubRpc();
  const claim = { runId: "batch-176test", userId: USER, cardSha256: "c".repeat(64), approvalRef: "batch:forged:ref", postingKeys: ["k1"], attestationsSupplied: ["certify_true"], claimedAt: "2026-10-22T05:01:00.000Z" };
  const r = await Begin.beginFromClaim(claim, baseInput([fixtureEntry(JOB_ID)]), { rpc });
  assert.equal(r.ok, false);
  assert.equal(r.code, "CLAIM_REF_MISMATCH");
  assert.equal(calls.length, 0);
});

test("e: beginFromClaim on a surviving claim begins", async () => {
  const { rpc, calls } = stubRpc();
  const claim = { runId: "batch-176test", userId: USER, cardSha256: "c".repeat(64), approvalRef: `batch:batch-176test:${"c".repeat(64)}`, postingKeys: ["k1"], attestationsSupplied: ["certify_true"], claimedAt: "2026-10-22T05:01:00.000Z" };
  const r = await Begin.beginFromClaim(claim, baseInput([fixtureEntry(JOB_ID)]), { rpc });
  assert.equal(r.ok, true);
  assert.equal(calls.filter((c) => c.name === "career_apply_extension_begin_agent_own").length, 1);
});
