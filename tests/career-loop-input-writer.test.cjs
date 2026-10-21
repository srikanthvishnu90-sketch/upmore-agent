// LOOP TASK 1 — THE WRITER (LOOP-INPUT-NO-WRITER) guard.
//
// The live record (loop lane, 2026-10-20, run batch-fnv1a-118b9d):
// a user seeded their profile through the product chat (15/15 facts
// confirmed) and asked "apply to 15 software engineering intern
// roles"; every selected application stopped UNCOVERED_QUESTION with
// the same 8 asks — full_name, email, phone, resume,
// work_authorization, sponsorship, cover_note, certify_true — because
// NO product code wrote the executor's profile inputs from the
// stored bank, and the worker's master scan returned the stated-facts
// bridge profile instead of the profile of record. Zero doorsteps.
//
// This guard replays that journey against the real stages —
// production-sources.profileFor (master resolution + module 149's
// portalInputsFromBank derivation) -> batch-executor -> module 155
// prepare -> card -> approve intent -> attestation completion ->
// execute -> SBX confirmations — and pins:
//   * the 8 asks shrink to ZERO required asks for the fixture
//     persona (identity from basics, screening answers from the
//     confirmed bank + constraints seam, cover note from the stored
//     confirmed draft, resume from the record); certify_true alone
//     waits on the card, because the approval tap is the attestation
//     act and it derives ONLY under a committed approve intent;
//   * selection is the NAMED family's shelf (121's classifiers on
//     both sides) — SWE interns only, never the pool's first pages;
//   * a second persona (Maya) derives HER answers from HER facts —
//     the derivation is keyed to the user's own stored state, with
//     no fixture-persona literals anywhere in the code path;
//   * nothing is invented: a bank with no eligibility source leaves
//     work_authorization / sponsorship as named asks, forever;
//   * 122's resume ingest writes the header contact block into
//     profile basics (fill-nulls only), so a chat-seeded user's
//     identity exists on the record the executor reads.
// Check: node --test tests/career-loop-input-writer.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const Profile = require(path.join(root, "packages/domain/122-career-profile.js"));
const { createBatchExecutor } = require(path.join(root, "workers/career-browser/batch-executor.cjs"));
const { createProductionSources } = require(path.join(root, "workers/career-browser/production-sources.cjs"));

const USER = "user-loop-writer";
const NOW = Date.UTC(2026, 9, 20, 17, 0, 0);
const clone = (v) => JSON.parse(JSON.stringify(v));

// The fixture persona's bank in the shape the product actually
// stores it (122 facts carry status / needs_confirmation), plus the
// resume of record the tailor leg writes and the confirmed cover
// note draft the writing path stores — the record's own contents.
function alexBank() {
  const bank = clone(require(path.join(root, "packages/career-data/fixtures/test-persona.json")));
  for (const f of bank.facts) { f.status = f.needs_confirmation ? "draft" : "confirmed"; }
  bank.resume = { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) };
  bank.answers = { cover_note: { value: "I am excited to apply for the intern role.", confirmed: true, draft: true } };
  return bank;
}
// A second persona: different identity, different facts — her
// eligibility lives in FACTS (not constraints), she needs
// sponsorship, and her residence is Austin. If any Alex literal or
// Alex answer leaked into the derivation, her pack would show it.
function mayaBank() {
  return {
    basics: { name: "Maya Chen (TEST)", email: "maya.chen@example.test", phone: "+1 512-555-0147 (TEST)", location: "Austin, TX (TEST)", links: {} },
    constraints: { workAuthorization: null, needsSponsorship: null, relocation: false, graduationDate: "2027-05", startDate: null, securityClearance: null },
    defaults: {},
    facts: [
      { id: "M-001", kind: "eligibility", name: "Work authorization", value: "Yes", status: "confirmed", needs_confirmation: false },
      { id: "M-002", kind: "eligibility", name: "Sponsorship", value: "Yes", status: "confirmed", needs_confirmation: false },
      { id: "M-003", kind: "education", title: "B.S. Computer Science", text: "B.S. Computer Science, State University (TEST)", org: "State University (TEST)", start: "2023-08", end: "2027-05", status: "confirmed", needs_confirmation: false },
    ],
    resume: { filename: "maya-chen-resume.pdf", sha256: "b".repeat(64) },
  };
}
// The stated-facts bridge profile that crowds the freshest snapshots
// on a busy account — thin basics, no constraints, NOT the record.
const BRIDGE = {
  _fromStatedFacts: true,
  basics: { name: null, email: null, phone: null, location: "SF", links: {} },
  constraints: { workAuthorization: null, needsSponsorship: null },
  facts: [{ kind: "other", text: "stated-facts scaffold", status: "confirmed" }],
};

function snapshotRows(master) {
  return [
    { state: { career: { stores: { profile: clone(BRIDGE) } } }, updated_at: "2026-10-20T19:00:00Z" },
    { state: { career: { stores: { profile: master } } }, updated_at: "2026-10-20T16:00:00Z" },
  ];
}
function sourcesFor(master) {
  const transport = {
    readRows: async (spec) => (spec.table === "agent_flow_state" ? snapshotRows(master) : []),
    call: async () => { throw new Error("the writer guard uses no RPC transport"); },
  };
  return createProductionSources({ transport });
}

function posting(over) {
  return Object.assign({
    id: "JOB-W-1", job_id: "JOB-W-1", canonicalKey: "greenhouse:acme:software-engineering-intern",
    company: "Acme", role: "Software Engineering Intern", title: "Software Engineering Intern",
    url: "https://boards.greenhouse.io/acme/jobs/1", status: "open", atsFamily: "greenhouse",
    location: "Chicago, IL", posted_at: "2026-10-10",
    jd_text: "Software engineering intern role. JavaScript, testing, code review.",
  }, over);
}
const MARKET = [
  posting({}),
  posting({ id: "JOB-W-2", job_id: "JOB-W-2", canonicalKey: "greenhouse:beta:software-engineering-intern", company: "Beta", url: "https://boards.greenhouse.io/beta/jobs/2" }),
  posting({ id: "JOB-W-3", job_id: "JOB-W-3", canonicalKey: "greenhouse:gamma:software-engineering-intern", company: "Gamma", url: "https://boards.greenhouse.io/gamma/jobs/3" }),
  posting({ id: "JOB-W-4", job_id: "JOB-W-4", canonicalKey: "greenhouse:delta:product-manager-intern", company: "Delta", role: "Product Manager Intern", title: "Product Manager Intern", url: "https://boards.greenhouse.io/delta/jobs/4", jd_text: "Product manager intern role. Roadmaps, discovery." }),
  posting({ id: "JOB-W-5", job_id: "JOB-W-5", canonicalKey: "greenhouse:epsilon:senior-software-engineer", company: "Epsilon", role: "Senior Software Engineer", title: "Senior Software Engineer", url: "https://boards.greenhouse.io/epsilon/jobs/5", jd_text: "Senior software engineer role. Own services end to end." }),
  posting({ id: "JOB-W-6", job_id: "JOB-W-6", canonicalKey: "greenhouse:zeta:finance-intern", company: "Zeta", role: "Finance Intern", title: "Finance Intern", url: "https://boards.greenhouse.io/zeta/jobs/6", jd_text: "Finance intern role. Models, valuations." }),
];
const boardForFor = () => (p) => Object.assign({}, Portal.createSandboxBoard({}), { atsFamily: p.atsFamily });

function memStore() {
  const intents = [], runs = new Map(), ledgers = new Map();
  return {
    intents, runs, ledgers,
    async pending() { return intents.filter((i) => i.state === "queued").map((i) => ({ userId: i.userId, intentId: i.intentId, binding: i.binding, request: i.request })); },
    async claim({ intentId }) { const i = intents.find((x) => x.intentId === intentId); if (!i || i.state !== "queued") return null; i.state = "claimed"; return { claimed: true, leaseToken: `lease-${intentId}` }; },
    async finish({ intentId, state, result }) { const i = intents.find((x) => x.intentId === intentId); i.state = state; i.result = result; },
    async saveRun(record) { runs.set(record.runId, clone(record)); },
    async readRun({ runId }) { const r = runs.get(runId); return r ? clone(r) : null; },
    async ledgerFor(userId) { return { records: clone(ledgers.get(userId) || []) }; },
    async saveLedger(userId, records) { ledgers.set(userId, clone(records)); },
  };
}
function executorFor(store, sources) {
  return createBatchExecutor({
    store,
    postingsFor: async () => clone(MARKET),
    profileFor: sources.profileFor,
    boardForFor,
    now: () => NOW,
  });
}
function queuePrepare(store, run) {
  store.intents.push({ userId: USER, intentId: "intent-prepare-1", state: "queued",
    binding: { action: "prepare", run_id: run.id, family_text: run.familyText },
    request: { run: Batch.serializeRun(run) } });
}

// ---------- the composition: the 8 asks, answered from the record ----------
test("writer: the fixture persona's portal inputs cover the live record's 8 asks — and certify_true waits for the approval act", async () => {
  const sources = sourcesFor(alexBank());
  // prepare context: no approval act exists, so no attestation may derive
  const prep = await sources.profileFor(USER, { action: "prepare", runId: "batch-any" });
  assert.equal(prep.profile.name, "Alex Testcase (TEST)", "full_name from the record's basics — the REAL master, not the fresher bridge profile");
  assert.equal(prep.profile.email, "alex.testcase@example.test", "email from basics");
  assert.equal(prep.profile.phone, "+1 555-0100 (TEST)", "phone from basics");
  assert.deepEqual(prep.profile.resume, { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) }, "resume from the record");
  assert.equal(prep.profile.answers.work_authorization.value, "Yes", "work_authorization from the constraints the sensitive-correction path wrote");
  assert.equal(prep.profile.answers.sponsorship.value, "No", "sponsorship from needsSponsorship=false");
  assert.equal(prep.profile.answers.cover_note.confirmed, true, "cover_note from the stored confirmed draft");
  assert.equal(prep.profile.answers.cover_note.draft, true);
  assert.deepEqual(prep.attestations, {}, "prepare derives NO attestation — never silently");
  // approve context: the committed approval act is the attestation act
  const appr = await sources.profileFor(USER, { action: "approve", runId: "batch-r1", cardSha256: "cardhash-1" });
  assert.deepEqual(appr.attestations.certify_true, { value: true, explicit: true, source: "batch_approval", runId: "batch-r1", cardSha256: "cardhash-1" },
    "certify_true derives only under the approve intent, bound to its run and card");
});

test("writer: a second persona derives her own answers from her own facts (no fixture literals in the path)", async () => {
  const sources = sourcesFor(mayaBank());
  const pack = await sources.profileFor("user-maya", { action: "prepare" });
  assert.equal(pack.profile.name, "Maya Chen (TEST)");
  assert.equal(pack.profile.answers.work_authorization.value, "Yes");
  assert.equal(pack.profile.answers.work_authorization.factId, "M-001", "work_authorization traced to HER eligibility fact");
  assert.equal(pack.profile.answers.sponsorship.value, "Yes", "sponsorship from HER fact — the opposite of the fixture persona's constraint answer");
  assert.equal(pack.profile.answers.sponsorship.factId, "M-002");
  assert.equal(pack.profile.answers.located_in_us.value, "Yes", "located_in_us from her Austin residence");
  assert.deepEqual(pack.attestations, {});
});

test("writer: nothing is invented — a bank with no eligibility source leaves the questions as named asks", async () => {
  const bank = alexBank();
  bank.constraints = { workAuthorization: null, needsSponsorship: null };
  const sources = sourcesFor(bank);
  const pack = await sources.profileFor(USER, { action: "prepare" });
  assert.equal(pack.profile.answers.work_authorization, undefined);
  assert.equal(pack.profile.answers.sponsorship, undefined);
  // and the drive says so, by name, instead of filling anything
  const store = memStore();
  const executor = executorFor(store, sources);
  const run = Batch.createRun({ userId: USER, familyText: "software engineering intern", count: 3, now: NOW });
  run.status = "queued_prepare";
  queuePrepare(store, run);
  const [res] = await executor.runBatchPending();
  assert.equal(res.runStatus, "completed", "no card exists when real questions are uncovered — the run completes as stops, honestly");
  const saved = store.runs.get(run.id);
  const stopped = Object.values(saved.run.apps).filter((a) => a.stage === "stopped");
  assert.equal(stopped.length, 3);
  for (const app of stopped) {
    assert.equal(app.stop.code, "UNCOVERED_QUESTION");
    const fields = app.stop.asks.map((a) => a.field_id);
    assert.ok(fields.includes("work_authorization") && fields.includes("sponsorship"), `the asks name the missing facts: ${fields}`);
    assert.ok(!fields.includes("full_name") && !fields.includes("resume"), "identity and resume ARE covered by the record");
  }
});

// ---------- the journey: prepare -> card -> approve -> confirmations ----------
test("writer journey: seed-shaped bank -> prepare (family shelf, attestation pending) -> approve act -> SBX confirmations", async () => {
  const sources = sourcesFor(alexBank());
  const store = memStore();
  const executor = executorFor(store, sources);
  const run = Batch.createRun({ userId: USER, familyText: "software engineering intern", count: 3, now: NOW });
  run.status = "queued_prepare";
  queuePrepare(store, run);

  const [prep] = await executor.runBatchPending();
  assert.equal(prep.status, "completed", JSON.stringify(prep));
  assert.equal(prep.runStatus, "awaiting_approval");
  assert.equal(prep.doorstep, 0, "nothing sits at a doorstep before the user's certification — the card comes first");
  const saved = store.runs.get(run.id);
  assert.equal(saved.run.familyFound, 3, "the shelf is the named family: 3 SWE-intern postings of the 6 on the shared pool");
  assert.equal(saved.summary.attestationPending, 3, "all three applications wait on the card for exactly one thing: the certification");
  assert.deepEqual(saved.summary.stops, [], "zero UNCOVERED stops — the record's 8 asks are covered");
  const companies = saved.run.selected.map((k) => saved.run.apps[k].company).sort();
  assert.deepEqual(companies, ["Acme", "Beta", "Gamma"], "the selection is the SWE interns — not the PM intern, not the senior role, not the finance intern");
  for (const k of saved.run.selected) {
    assert.equal(saved.run.apps[k].stage, "awaiting_attestation");
    assert.deepEqual(saved.run.apps[k].pendingAttestations, ["certify_true"]);
    assert.equal(saved.run.apps[k].carded, true);
  }
  assert.ok(saved.run.cardSha256, "the card carries its set hash");
  assert.equal(saved.run.card.count, 3);

  store.intents.push({ userId: USER, intentId: "intent-approve-1", state: "queued",
    binding: { action: "approve", run_id: run.id, card_sha256: saved.run.cardSha256 }, request: null });
  const [appr] = await executor.runBatchPending();
  assert.equal(appr.status, "completed", JSON.stringify(appr));
  assert.equal(appr.submitted, 3, "the approval act completes the attestations and all three submit");
  const final = store.runs.get(run.id);
  assert.equal(final.run.status, "completed");
  for (const k of final.run.selected) {
    assert.equal(final.run.apps[k].stage, "submitted");
    assert.match(final.run.apps[k].confirmationId, /^SBX-\d{4}$/, "the confirmation is the board's own id");
    assert.equal(final.run.apps[k].attestedFromCardSha256, saved.run.cardSha256, "each completion is stamped with the card the user approved");
  }
  assert.equal((store.ledgers.get(USER) || []).filter((r) => r.status === "submitted").length, 3, "the cap ledger holds the three submissions");
});

test("writer journey: a yes for a different card submits nothing", async () => {
  const sources = sourcesFor(alexBank());
  const store = memStore();
  const executor = executorFor(store, sources);
  const run = Batch.createRun({ userId: USER, familyText: "software engineering intern", count: 3, now: NOW });
  run.status = "queued_prepare";
  queuePrepare(store, run);
  await executor.runBatchPending();
  store.intents.push({ userId: USER, intentId: "intent-approve-x", state: "queued",
    binding: { action: "approve", run_id: run.id, card_sha256: "f".repeat(64) }, request: null });
  const [appr] = await executor.runBatchPending();
  assert.equal(appr.status, "blocked");
  assert.equal(appr.blocked, "APPROVAL_SET_CHANGED");
  assert.equal((store.ledgers.get(USER) || []).length, 0, "nothing submitted under a mismatched card");
});

test("writer: a stored explicit attestation on the record passes through — doorsteps form at prepare", async () => {
  const bank = alexBank();
  bank.attestations = { certify_true: { value: true, explicit: true } };
  const sources = sourcesFor(bank);
  const pack = await sources.profileFor(USER, { action: "prepare" });
  assert.deepEqual(pack.attestations.certify_true, { value: true, explicit: true }, "the user's own stored act, verbatim — not derived, not altered");
  const store = memStore();
  const executor = executorFor(store, sources);
  const run = Batch.createRun({ userId: USER, familyText: "software engineering intern", count: 3, now: NOW });
  run.status = "queued_prepare";
  queuePrepare(store, run);
  const [prep] = await executor.runBatchPending();
  assert.equal(prep.runStatus, "awaiting_approval");
  assert.equal(prep.doorstep, 3, "with the attestation on the record, prepare reaches doorsteps directly");
});

// ---------- 122: the resume header is the identity writer ----------
test("writer: the resume ingest lands the header contact block in basics (fill-nulls only)", () => {
  const text = fs.readFileSync(path.join(root, "packages/career-data/fixtures/test-resume.txt"), "utf8");
  const prof = Profile.createProfile({});
  const r = Profile.ingestResume(prof, text, { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(prof.basics.name, "Alex Testcase (TEST)");
  assert.equal(prof.basics.email, "alex.testcase@example.test");
  assert.equal(prof.basics.phone, "+1 555-0100");
  assert.equal(prof.basics.location, "Chicago, IL (TEST)");
  assert.equal(prof.basics.links.github, "https://github.com/example-testcase");
  const prof2 = Profile.createProfile({});
  prof2.basics.name = "A Standing Name";
  Profile.ingestResume(prof2, text, { now: NOW });
  assert.equal(prof2.basics.name, "A Standing Name", "a standing value is never overwritten by an ingest");
});
