// CHAT-SIDE BEGIN-CALLER, CLOUD DOOR (176) — F-030 (2026-10-22).
//
// F-030: module 176's only door was the extension's, whose begin
// (career_apply_extension_begin_own, 20261021120000) stamps the job
// row 'extension', already driving, with the beginner's lease. The
// cloud claim (career_apply_cloud_claim_at, 20261021080000) takes
// only rows still queued with source null and attempts 0 — so a
// chat-begun row was never claimed, and its stamp would have counted
// toward the family gate's hand tally. Migration
// 20261024140000_career_apply_agent_cloud_begin.sql adds the cloud
// door (career_apply_cloud_begin_agent_own): the same WO-102
// contract, then the row is only enqueued. This suite proves module
// 176's half of that door against a RECORDING STUB rpc — no live
// calls, nothing sends, the flag stays OFF in the flag leg.
//
// Groups:
// (a) the cloud payload: source 'cloud', the destination + the
//     engine's approval hash carried from the approved entry, and
//     the extension door's payload byte-unchanged without them.
// (b) the local mirror of the door's three checks (migration
//     20261024140000), with the DB's exact messages, refused before
//     the begin RPC.
// (c) begin -> claim: a stub that MODELS the database's predicates
//     (cited per predicate: the cloud begin's enqueue outcome and
//     career_apply_cloud_refusal's candidate rules) takes the row
//     module 176 began and claims it exactly once as 'cloud'; a row
//     begun through the extension door is never claimable by the
//     same model. The SQL leg of this chain is
//     tests/db/career_apply_agent_cloud_begin.test.sql.
// (d) flag OFF and DB refusals at the cloud door: verbatim, once.
//
// Check: node --test tests/career-agent-begin-cloud.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Begin = require(path.join(root, "packages/domain/176-career-agent-begin.js"));

const USER = "b2625909-d67f-41b2-8270-983d212c6052"; // the TEST user
const JOB_ID = "lever:testco:176c1";
const TEXT_ANSWER_ID = "11111111-2222-4333-8444-555555555555";
const RESUME_SHA = "f".repeat(64);
const MANIFEST_HASH = "a".repeat(64);
const ENGINE_APPROVAL = "e".repeat(64);
const DESTINATION = "https://jobs.lever.co/testco/176c1/apply";
const JOB_ROW_ID = "99999999-8888-4777-8666-555555555555";

// The approved entry for the cloud door: the extension-door fixture
// shape (BatchPosting) plus the two values the preparing engine
// resolved for this posting — the destination the person approved
// and the engine run's approval hash (approve-first.ts prepare()
// puts both in its payload; the entry carries them per posting).
function fixtureEntry(jobId, extra) {
  const answers = [
    { name: "email", label: "Email", value: "test@example.test", shown: "test@example.test", kind: "text", factId: "F-001", file: null },
    { name: "first_name", label: "First name", value: "Test", shown: "Test", kind: "text", factId: `text-answer:${TEXT_ANSWER_ID}`, file: null },
  ];
  const ledger = [
    { application_id: jobId, field_id: "email", question_hash: "q1", answer_hash: "h1", fact_refs: ["F-001"], source_refs: ["owner-stated"], confirmation_event_id: "evt-1", derivation_rule: "verbatim" },
    { application_id: jobId, field_id: "first_name", question_hash: "q2", answer_hash: "h2", fact_refs: [`text-answer:${TEXT_ANSWER_ID}`], source_refs: ["owner_reply"], confirmation_event_id: "evt-2", derivation_rule: "verbatim" },
  ];
  return Object.assign({
    jobId, company: "Test Co", url: DESTINATION,
    answers, blank: [], ledger, question_set_hash: "d".repeat(64),
    manifest_hash: MANIFEST_HASH, quarantine_version: "d007-v1",
    destination: DESTINATION, engineApproval: ENGINE_APPROVAL,
  }, extra || {});
}

// An entry that lacks a key omits it (a key holding undefined is not
// a value the canonical form — or the DB — admits).
function without(entry, key) { const e = Object.assign({}, entry); delete e[key]; return e; }

function fixtureRecord() {
  const cardSha256 = "c".repeat(64);
  return {
    kind: "batch_approval_record", version: 1, runId: "batch-176cloud", userId: USER,
    cardSha256, approvalRef: `batch:batch-176cloud:${cardSha256}`,
    approvals: {}, attestationsSupplied: [], approvedByUser: true,
    approvedAt: "2026-10-22T05:30:00.000Z", via: "card_tap_155_mint",
  };
}

function baseInput(entries, extra) {
  return Object.assign({
    record: fixtureRecord(),
    entries,
    userId: USER,
    door: "cloud",
    account: { epoch: 3, version: 7 },
    expiresAt: "2027-01-01T00:00:00.000Z",
    answeredTextAnswerIds: [TEXT_ANSWER_ID],
    resume: { filename: "resume.pdf", sha256: RESUME_SHA },
    flagEnabled: null,
  }, extra || {});
}

function stubRpc(behavior) {
  const calls = [];
  const rpc = async (name, args) => {
    calls.push({ name, args });
    if (behavior) return behavior(name, args, calls);
    if (name === "career_apply_batch_approve_own") return args.p_items.length;
    if (name === "career_apply_cloud_begin_agent_own") return { id: JOB_ROW_ID, payload_hash: "b".repeat(64) };
    throw new Error(`unexpected rpc ${name}`);
  };
  return { rpc, calls };
}

const cloudPayloadFor = (entry, extra) => Begin.buildBeginPayload(Object.assign({
  entry, userId: USER, door: "cloud", family: "lever",
  account: { epoch: 3, version: 7 }, expiresAt: "2027-01-01T00:00:00.000Z",
  resume: { filename: "resume.pdf", sha256: RESUME_SHA },
}, extra || {}));

// ---------------- (a) the cloud payload ----------------

test("a: the cloud payload names its door and carries the claim's two shapes from the entry", () => {
  const entry = fixtureEntry(JOB_ID);
  const p = cloudPayloadFor(entry);
  assert.equal(p.source, "cloud");
  assert.equal(p.destination, DESTINATION);
  assert.equal(p.engine_approval, ENGINE_APPROVAL);
  // everything else is the approved entry's, as on the extension door
  assert.equal(p.job_id, JOB_ID);
  assert.equal(p.manifest_hash, MANIFEST_HASH);
  assert.deepEqual(p.fields.map((f) => f.name), entry.answers.map((a) => a.name));
  assert.ok(p.fields.every((f) => f.source === "trainee"));
});

test("a: call-level destination/engineApproval are the fallback; the entry's win", () => {
  const bare = without(without(fixtureEntry(JOB_ID), "destination"), "engineApproval");
  const p = cloudPayloadFor(bare, { destination: "https://jobs.lever.co/other/9/apply", engineApproval: "9".repeat(64) });
  assert.equal(p.destination, "https://jobs.lever.co/other/9/apply");
  assert.equal(p.engine_approval, "9".repeat(64));
  const withEntry = cloudPayloadFor(fixtureEntry(JOB_ID), { destination: "https://jobs.lever.co/other/9/apply" });
  assert.equal(withEntry.destination, DESTINATION);
  assert.equal(withEntry.engine_approval, ENGINE_APPROVAL);
});

test("a: the extension door's payload is unchanged — no cloud keys, source 'extension'", () => {
  const entry = fixtureEntry(JOB_ID);
  const p = Begin.buildBeginPayload({
    entry, userId: USER, family: "lever",
    account: { epoch: 3, version: 7 }, expiresAt: "2027-01-01T00:00:00.000Z",
    resume: { filename: "resume.pdf", sha256: RESUME_SHA },
  });
  assert.equal(p.source, "extension");
  assert.ok(!("destination" in p));
  assert.ok(!("engine_approval" in p));
});

// ---------------- (b) the door mirror ----------------

test("b: a well-formed cloud payload passes the door mirror and the contract mirror", () => {
  const entry = fixtureEntry(JOB_ID);
  const p = cloudPayloadFor(entry);
  assert.deepEqual(Begin.checkCloudDoor(p), { ok: true });
  assert.deepEqual(Begin.checkContract(entry, p, { answeredTextAnswerIds: [TEXT_ANSWER_ID] }), { ok: true });
});

test("b-neg: the three door refusals carry the DB's exact messages", () => {
  const entry = fixtureEntry(JOB_ID);
  const noDest = cloudPayloadFor(without(fixtureEntry(JOB_ID), "destination"));
  assert.equal(Begin.checkCloudDoor(noDest).message, "agent cloud: destination");
  const badDest = cloudPayloadFor(entry);
  badDest.destination = "the person's own Submit button";
  assert.equal(Begin.checkCloudDoor(badDest).message, "agent cloud: destination");
  const noEng = cloudPayloadFor(without(fixtureEntry(JOB_ID), "engineApproval"));
  assert.equal(Begin.checkCloudDoor(noEng).message, "agent cloud: engine approval");
  const extPayload = Begin.buildBeginPayload({ entry, userId: USER, account: { epoch: 3, version: 7 }, expiresAt: "2027-01-01T00:00:00.000Z" });
  assert.equal(Begin.checkCloudDoor(extPayload).message, "agent cloud: source");
});

test("b: a posting missing its destination is refused locally — the cloud begin RPC is never called", async () => {
  const entry = without(fixtureEntry(JOB_ID), "destination");
  const { rpc, calls } = stubRpc();
  const r = await Begin.beginApprovedPostings(baseInput([entry]), { rpc });
  assert.equal(r.ok, false);
  assert.equal(r.results[0].code, "AGENT_CLOUD_REFUSED");
  assert.equal(r.results[0].message, "agent cloud: destination");
  assert.equal(calls.filter((c) => c.name === "career_apply_cloud_begin_agent_own").length, 0);
  assert.equal(calls.filter((c) => c.name === "career_apply_extension_begin_agent_own").length, 0);
});

// ---------------- (d) flag + DB refusals at the cloud door ----------------

test("d: flagEnabled false on the cloud door -> AGENT_SUBMIT_OFF, zero rpc calls", async () => {
  const { rpc, calls } = stubRpc();
  const r = await Begin.beginApprovedPostings(baseInput([fixtureEntry(JOB_ID)], { flagEnabled: false }), { rpc });
  assert.equal(r.ok, false);
  assert.equal(r.code, "AGENT_SUBMIT_OFF");
  assert.equal(calls.length, 0);
});

test("d: a DB door refusal surfaces verbatim, classified, attempted exactly once", async () => {
  const { rpc, calls } = stubRpc((name) => {
    if (name === "career_apply_batch_approve_own") return 1;
    throw new Error("agent cloud: engine approval");
  });
  const r = await Begin.beginApprovedPostings(baseInput([fixtureEntry(JOB_ID)]), { rpc });
  assert.equal(r.results[0].ok, false);
  assert.equal(r.results[0].code, "AGENT_CLOUD_REFUSED");
  assert.equal(r.results[0].message, "agent cloud: engine approval");
  assert.equal(calls.filter((c) => c.name === "career_apply_cloud_begin_agent_own").length, 1);
});

test("d: happy path — one cloud begin per posting, its payload + hashes, no lease returned", async () => {
  const entry = fixtureEntry(JOB_ID);
  const { rpc, calls } = stubRpc();
  const r = await Begin.beginApprovedPostings(baseInput([entry]), { rpc });
  assert.equal(r.ok, true);
  assert.deepEqual(calls.map((c) => c.name), ["career_apply_batch_approve_own", "career_apply_cloud_begin_agent_own"]);
  const args = calls[1].args;
  assert.equal(args.p_payload.source, "cloud");
  assert.equal(args.p_payload.destination, DESTINATION);
  assert.equal(args.p_payload.engine_approval, ENGINE_APPROVAL);
  assert.equal(args.p_approval, await Begin.sha256Hex(Begin.canonicalApplyJson(args.p_payload)));
  assert.equal(args.p_batch_hash, await Begin.batchHashOf(entry));
  assert.equal(r.results[0].id, JOB_ROW_ID);
  assert.equal(r.results[0].lease, null); // nothing is claimed at begin; the claim issues the lease
});

// ---------------- (c) begin -> claim, modeled on the DB's predicates ----------------
//
// The stub below MODELS the database: the cloud begin stores the row
// exactly as migration 20261024140000's enqueue leaves it (queued,
// source null, attempts 0, approval_hash = payload_hash,
// agent_batch_hash stamped); the claim applies
// career_apply_cloud_refusal's candidate predicates as written in
// 20261021080000 (state/attempts/source/approval binding, the
// payload's engine_approval + destination shapes), with the gate,
// the opt-in and the kill switch supplied as open. The extension
// begin is modeled as 20261021120000 leaves its row (driving,
// 'extension', the beginner's lease). The real predicates are proven
// against Postgres by tests/db/career_apply_agent_cloud_begin.test.sql
// and tests/db/career_apply_cloud.test.sql; this leg proves module
// 176's output satisfies them.

function modelDb() {
  const jobs = [];
  const rpc = async (name, args) => {
    if (name === "career_apply_batch_approve_own") return args.p_items.length;
    if (name === "career_apply_cloud_begin_agent_own" || name === "career_apply_extension_begin_agent_own") {
      const hash = await Begin.sha256Hex(Begin.canonicalApplyJson(args.p_payload));
      if (args.p_approval !== hash) throw new Error("invalid or stale application approval");
      const row = {
        id: `row-${jobs.length + 1}`, job_id: args.p_payload.job_id, payload: args.p_payload,
        payload_hash: hash, approval_hash: hash, agent_batch_hash: args.p_batch_hash,
        state: "queued", source: null, attempts: 0, lease_token: null,
      };
      if (name === "career_apply_extension_begin_agent_own") {
        // 20261021120000, line 19: the extension's begin claims the row for its beginner.
        row.state = "driving"; row.source = "extension"; row.attempts = 1; row.lease_token = "ext-lease";
        jobs.push(row);
        return { id: row.id, lease: row.lease_token, payload_hash: hash };
      }
      jobs.push(row);
      return { id: row.id, payload_hash: hash }; // 20261024140000: no lease at begin
    }
    throw new Error(`unexpected rpc ${name}`);
  };
  // career_apply_cloud_claim_at + _refusal (20261021080000), the
  // candidate predicates only; gate/opt-in/switch supplied open.
  const claim = () => {
    const out = [];
    for (const j of jobs) {
      if (j.state !== "queued" || j.attempts !== 0 || j.source !== null || j.approval_hash !== j.payload_hash) continue;
      if (!/^[0-9a-f]{64}$/.test(j.payload.engine_approval || "")) continue; // refusal: 'not_approved'
      if (!/^https:\/\//.test(j.payload.destination || "")) continue; // refusal: 'person_submits'
      j.state = "driving"; j.attempts = 1; j.source = "cloud"; j.lease_token = "cloud-lease";
      out.push(j);
    }
    return out;
  };
  return { rpc, claim, jobs };
}

test("c: begin -> claim — the row module 176 began is claimed once, as 'cloud', never twice", async () => {
  const db = modelDb();
  const entry = fixtureEntry(JOB_ID);
  const r = await Begin.beginApprovedPostings(baseInput([entry]), { rpc: db.rpc });
  assert.equal(r.ok, true);
  assert.equal(db.jobs.length, 1);
  assert.equal(db.jobs[0].state, "queued"); // the begin did not claim it
  assert.equal(db.jobs[0].source, null);
  const claimed = db.claim();
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].job_id, JOB_ID);
  assert.equal(claimed[0].source, "cloud"); // stamped by the claim, not the begin
  assert.equal(claimed[0].agent_batch_hash, await Begin.batchHashOf(entry));
  assert.deepEqual(db.claim(), []); // a claimed job is not claimed again
});

test("c: a row begun through the extension door is never taken by the cloud claim model", async () => {
  const db = modelDb();
  const entry = fixtureEntry(JOB_ID);
  const r = await Begin.beginApprovedPostings(baseInput([entry], { door: "extension" }), { rpc: db.rpc });
  assert.equal(r.ok, true);
  assert.equal(db.jobs[0].state, "driving");
  assert.equal(db.jobs[0].source, "extension");
  assert.deepEqual(db.claim(), []); // state, attempts and source all exclude it — as designed
});
