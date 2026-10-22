// P1 TEXT YES — the core half (node). A texted "yes" over a messaging
// channel arrives at the core as the structured career_batch approve the
// button tap sends (tests/edge/channel-text-yes.test.ts drives that half
// through the Telegram/WhatsApp adapters). This suite proves what the core
// does with it, end to end on sandbox boards (no real portal, nothing sent):
//   - a 10-application prepared batch is approved by ONE approve request and
//     all 10 submit; every per-application approval and every outcome is on
//     the run record (events) and every submission in the cap ledger;
//   - "yes but not 2" (exclude: [the card's 2nd posting key]) submits 9 and
//     never drives the left-out application;
//   - a stale card (hash moved), a key not on the card, or "all left out"
//     queues and submits nothing;
//   - a payload whose field readback is unverified cannot submit (149's
//     observation / hash gate), even under an approval.
// Check: node --test tests/career-text-yes-approval.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const { createBatchExecutor } = require(path.join(root, "workers/career-browser/batch-executor.cjs"));

const USER = "00000000-0000-4000-8000-0000000000a1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const THREAD = "00000000-0000-4000-8000-0000000000c3";
const NOW = Date.UTC(2026, 9, 22, 17, 0, 0);
const clone = (v) => JSON.parse(JSON.stringify(v));

const PROFILE = {
  name: "Alex Testcase (TEST)", email: "alex.testcase@example.test", phone: "+1 000 555 0100", location: "Chicago, IL",
  country: "United States",
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: {
    work_authorization: { value: "Yes — authorized to work in the US", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
    cover_note: { value: "I am excited to apply for the intern role.", confirmed: true, draft: true },
  },
};
const MASTER = {
  basics: { name: "Alex Testcase (TEST)", email: "alex.testcase@example.test" },
  facts: [
    { id: "F-T-001", kind: "skill", text: "JavaScript and Node.js development", confirmed: true },
    { id: "F-T-003", kind: "education", text: "Computer Science student", confirmed: true },
  ],
};
// 10 postings over three ATS families (149's per-vendor cap is 5 a day).
const FAMS = [
  { atsFamily: "greenhouse", urlFor: (co, n) => `https://boards.greenhouse.io/${co}/jobs/${n}` },
  { atsFamily: "lever", urlFor: (co, n) => `https://jobs.lever.co/${co}/${n}` },
  { atsFamily: "ashby", urlFor: (co, n) => `https://jobs.ashbyhq.com/${co}/${n}` },
];
function posting(n) {
  const fam = FAMS[n % 3], co = `textyes${n}`;
  return {
    id: `JOB-Y-${n}`, job_id: `JOB-Y-${n}`, canonicalKey: `${fam.atsFamily}:${co}:software-engineering-intern`,
    company: `TextYes ${n}`, role: "Software Engineering Intern", title: "Software Engineering Intern",
    url: fam.urlFor(co, n), status: "open", atsFamily: fam.atsFamily, location: "Chicago, IL", posted_at: "2026-10-20",
    jd_text: "Software engineering intern role at a test company. JavaScript, testing, code review.",
  };
}
const MARKET = Array.from({ length: 10 }, (_, i) => posting(i + 1));

const COUNTRY_FIELD = { field_id: "country", label: "Country", kind: "standard", profile_key: "country", required: false };

// Boards: sandbox boards recording every submit() — the unintended-submit
// counter. `drift` names postings whose `country` readback differs from the
// confirmed fact once `drift.on` flips (after the card was shown): the field
// as the board now reports it is no longer the verified, approved value.
function boardFactory(opts = {}) {
  const submits = []; // canonicalKey per accepted submit() call
  const opened = [];
  const drift = opts.drift || null;
  const boardForFor = () => (p) => {
    opened.push(p.canonicalKey);
    const base = Portal.createSandboxBoard({});
    const board = Object.assign({}, base, { atsFamily: p.atsFamily });
    board.form = () => { const f = base.form(); f.fields = f.fields.concat([Object.assign({}, COUNTRY_FIELD)]); return f; };
    board.answers = () => { const a = base.answers(); if (drift && drift.on && drift.keys.includes(p.canonicalKey)) a.country = "Canada"; return a; };
    board.submit = () => { submits.push(p.canonicalKey); return base.submit(); };
    return board;
  };
  return { submits, opened, boardForFor };
}

// The executor's store, in memory (the delegation suite's harness shape).
function memStore() {
  const db = { intents: new Map(), state: new Map(), runs: new Map(), ledgers: new Map() };
  return {
    db,
    async pending() {
      return [...db.intents.values()].filter((i) => (db.state.get(i.intentId) || {}).state === undefined);
    },
    async claim({ intentId }) { if (db.state.has(intentId)) return null; db.state.set(intentId, { state: "claimed" }); return { claimed: true }; },
    async finish({ intentId, state, result }) { db.state.set(intentId, { state, result }); },
    async saveRun(record) { db.runs.set(record.runId, clone(record)); },
    async readRun({ userId, runId }) { const r = db.runs.get(runId); return r && r.userId === userId ? clone(r) : null; },
    async ledgerFor(userId) { if (!db.ledgers.has(userId)) db.ledgers.set(userId, { records: [] }); return db.ledgers.get(userId); },
    async saveLedger(userId, records) { db.ledgers.set(userId, { records }); },
  };
}

async function loadBridge() { return import(path.join(root, "supabase/functions/_shared/career_task_bridge.js")); }

function executorFor(store, boards) {
  return createBatchExecutor({
    store, postingsFor: async () => clone(MARKET),
    profileFor: async () => ({ profile: PROFILE, profileMaster: MASTER }),
    boardForFor: boards.boardForFor, now: () => NOW,
  });
}

// Prepare a 10-application batch through the executor (worker side), as
// the ask turn's prepare intent would.
async function prepared(store, boards) {
  const run = Batch.createRun({ userId: USER, familyText: "software engineering intern", count: 10, now: NOW });
  run.status = "queued_prepare";
  store.db.intents.set("prep-1", { userId: USER, intentId: "prep-1", binding: { action: "prepare", run_id: run.id, family_text: run.familyText }, request: { run } });
  const res = await executorFor(store, boards).runBatchPending();
  assert.equal(res[0].status, "completed", JSON.stringify(res));
  const record = store.db.runs.get(run.id);
  assert.equal(record.status, "awaiting_approval");
  return record;
}

// The core's chat-side approve: normalize the structured request exactly as
// handler-career does, plan it against the stored run, and hand the
// committed intent to the executor's store (what career_batch_turn_commit_v1
// + career_batch_pending_v1 do in production).
async function approveTurn(store, B, record, request, userId = USER) {
  const req = B.normalizeCareerBatchRequest(request);
  const persistence = { readBatchRun: async ({ userId: u, runId }) => store.readRun({ userId: u, runId }) };
  const plan = await B.planCareerBatchIntent({
    batchRequest: req, message: `Approve batch ${req.runId}`, userId, threadId: THREAD, turnKey: "tk-" + request.eventId,
    requestHash: "f".repeat(64), ctx: { workerCapabilities: null }, accountVersion: 1, account: { epoch: 0 }, persistence,
  });
  if (plan.intent) {
    const binding = clone(plan.intent);
    store.db.intents.set(plan.intent.intent_id, { userId, intentId: plan.intent.intent_id, binding, request: null });
  }
  return plan;
}

const eventsOf = (run, type) => run.events.filter((e) => e.type === type);

test("one approve request (a texted yes) approves a 10-application card; all 10 submit; each approval and outcome is logged", async () => {
  const B = await loadBridge();
  const store = memStore(), boards = boardFactory();
  const record = await prepared(store, boards);
  const items = B.batchCardItems(record.run);
  assert.equal(items.length, 10, "the card carries all 10 applications");
  assert.equal(boards.submits.length, 0, "prepare never submits");

  const plan = await approveTurn(store, B, record, { action: "approve", eventId: "tgtx-0001", runId: record.runId, cardSha256: record.run.cardSha256 });
  assert.equal(plan.out.resultStatus, "queued");
  assert.equal(plan.intent.card_sha256, record.run.cardSha256, "the intent is bound to the card's hash");
  assert.equal(plan.intent.exclude_keys, undefined, "a plain yes carries no exclusion field (byte-identical to the tap)");

  const res = await executorFor(store, boards).runBatchPending();
  const ap = res.find((r) => r.action === "approve");
  assert.equal(ap.status, "completed", JSON.stringify(ap));
  assert.equal(ap.submitted, 10);
  const run = store.db.runs.get(record.runId).run;
  assert.equal(run.status, "completed");
  assert.equal(eventsOf(run, "app_approved").length, 10, "one approval event per application");
  for (const e of eventsOf(run, "app_approved")) assert.equal(e.payloadSha256, run.apps[e.postingKey].payloadSha256, "each approval names its exact payload hash");
  assert.equal(eventsOf(run, "approved").length, 1);
  assert.equal(eventsOf(run, "submitted").length, 10, "one outcome event per application");
  assert.equal(new Set(boards.submits).size, 10);
  assert.equal(boards.submits.length, 10, "exactly 10 submit() calls — 0 unintended");
  assert.equal(store.db.ledgers.get(USER).records.filter((r) => r.status === "submitted").length, 10, "every submission is in the cap ledger");
  assert.match(run.approvalRef, /^batch:batch-[^:]+:[^:]+$/, "a whole-card yes mints the whole-card ref");
});

test("\"yes but not 2\": the 2nd card application is left off — 9 submit, the 2nd is never driven, both are on the record", async () => {
  const B = await loadBridge();
  const store = memStore(), boards = boardFactory();
  const record = await prepared(store, boards);
  const items = B.batchCardItems(record.run);
  const second = items[1].postingKey;
  const openedAtPrepare = boards.opened.length;

  const plan = await approveTurn(store, B, record, { action: "approve", eventId: "tgtx-0002", runId: record.runId, cardSha256: record.run.cardSha256, exclude: [second] });
  assert.equal(plan.out.resultStatus, "queued");
  assert.deepEqual(plan.intent.exclude_keys, [second]);
  assert.match(plan.out.reply, /You left 1 out; it will not be sent\./);

  const res = await executorFor(store, boards).runBatchPending();
  const ap = res.find((r) => r.action === "approve");
  assert.equal(ap.status, "completed", JSON.stringify(ap));
  assert.equal(ap.submitted, 9);
  const run = store.db.runs.get(record.runId).run;
  assert.equal(run.apps[second].stage, "excluded_by_user");
  assert.equal(run.approvals[second], undefined, "no approval exists for the left-out application");
  assert.deepEqual(eventsOf(run, "app_excluded").map((e) => e.postingKey), [second]);
  assert.equal(eventsOf(run, "app_approved").length, 9);
  assert.ok(!boards.submits.includes(second), "the left-out application never submits");
  assert.ok(!boards.opened.slice(openedAtPrepare).includes(second), "the left-out application is never even opened at execute");
  assert.equal(boards.submits.length, 9);
  assert.match(run.approvalRef, /:x-/, "a partial yes mints a ref distinct from the whole-card ref");
  assert.match(Batch.speakSummary(run).join("\n"), /left out by your yes — not sent/);
});

test("a stale card is refused: a yes bound to a moved hash queues nothing and submits nothing", async () => {
  const B = await loadBridge();
  const store = memStore(), boards = boardFactory();
  const record = await prepared(store, boards);
  const stale = "0".repeat(64);
  const plan = await approveTurn(store, B, record, { action: "approve", eventId: "tgtx-0003", runId: record.runId, cardSha256: stale });
  assert.equal(plan.intent, null);
  assert.equal(plan.out.resultStatus, "blocked");
  // A forged intent that bypassed the chat check still stops at the worker.
  store.db.intents.set("forged", { userId: USER, intentId: "forged", binding: { action: "approve", run_id: record.runId, card_sha256: stale }, request: null });
  const res = await executorFor(store, boards).runBatchPending();
  assert.equal(res.find((r) => r.intentId === "forged").blocked, "APPROVAL_SET_CHANGED");
  assert.equal(boards.submits.length, 0, "0 submits");
  assert.equal(store.db.runs.get(record.runId).status, "awaiting_approval", "the card stays waiting for a correct yes");
});

test("another user's yes cannot approve this card: the owner-scoped read finds no run", async () => {
  const B = await loadBridge();
  const store = memStore(), boards = boardFactory();
  const record = await prepared(store, boards);
  const plan = await approveTurn(store, B, record, { action: "approve", eventId: "tgtx-0004", runId: record.runId, cardSha256: record.run.cardSha256 }, OTHER);
  assert.equal(plan.intent, null);
  assert.equal(plan.out.resultStatus, "awaiting_user");
  store.db.intents.set("foreign", { userId: OTHER, intentId: "foreign", binding: { action: "approve", run_id: record.runId, card_sha256: record.run.cardSha256 }, request: null });
  const res = await executorFor(store, boards).runBatchPending();
  assert.equal(res.find((r) => r.intentId === "foreign").blocked, "BATCH_RUN_NOT_FOUND");
  assert.equal(boards.submits.length, 0);
});

test("exclusions must name this card's applications, leave at least one, and are strictly shaped", async () => {
  const B = await loadBridge();
  const store = memStore(), boards = boardFactory();
  const record = await prepared(store, boards);
  const keys = B.batchCardItems(record.run).map((i) => i.postingKey);
  const base = { action: "approve", runId: record.runId, cardSha256: record.run.cardSha256 };
  let plan = await approveTurn(store, B, record, { ...base, eventId: "x1", exclude: ["greenhouse:not-on-card:role"] });
  assert.equal(plan.intent, null, "a key not on the card refuses");
  plan = await approveTurn(store, B, record, { ...base, eventId: "x2", exclude: keys });
  assert.equal(plan.intent, null, "leaving all out refuses");
  assert.throws(() => B.normalizeCareerBatchRequest({ ...base, eventId: "x3", exclude: [keys[0], keys[0]] }), /invalid_career_task/, "duplicates refuse");
  assert.throws(() => B.normalizeCareerBatchRequest({ ...base, eventId: "x4", exclude: "2" }), /invalid_career_task/, "a non-array refuses");
  assert.throws(() => B.normalizeCareerBatchRequest({ action: "status", runId: record.runId, exclude: [] }), /invalid_career_task/, "status takes no exclusion");
  assert.equal(B.normalizeCareerBatchRequest({ ...base, eventId: "x5", exclude: [] }).exclude, undefined, "an empty exclusion is the whole card");
  // 155 holds the same rule for a forged intent that reaches the worker.
  const run = Batch.restoreRun(clone(record.run));
  assert.equal(Batch.approveRun(run, { approvedByUser: true, exclude: ["nope"] }).code, "APPROVAL_EXCLUDE_INVALID");
  assert.equal(Batch.approveRun(run, { approvedByUser: true, exclude: keys }).code, "APPROVAL_EXCLUDE_ALL");
  assert.equal(run.status, "awaiting_approval", "a refused exclusion approves nothing");
  assert.equal(boards.submits.length, 0);
});

test("a payload with an unverified field cannot submit under an approval (the observation/hash gate)", async () => {
  const B = await loadBridge();
  const drifting = MARKET[3].canonicalKey;
  const drift = { on: false, keys: [drifting] };
  const store = memStore(), boards = boardFactory({ drift });
  const record = await prepared(store, boards);
  drift.on = true; // after the card: the board now reports a value nobody verified or approved
  assert.ok(B.batchCardItems(record.run).some((i) => i.postingKey === drifting), "the drifting application was on the card");
  await approveTurn(store, B, record, { action: "approve", eventId: "tgtx-0005", runId: record.runId, cardSha256: record.run.cardSha256 });
  const res = await executorFor(store, boards).runBatchPending();
  const ap = res.find((r) => r.action === "approve");
  assert.equal(ap.submitted, 9);
  const run = store.db.runs.get(record.runId).run;
  assert.equal(run.apps[drifting].stage, "stopped");
  assert.ok(["APPROVAL_PAYLOAD_MISMATCH", "ANSWER_OBSERVATION_MISMATCH"].includes(run.apps[drifting].stop.code), run.apps[drifting].stop.code);
  assert.ok(!boards.submits.includes(drifting), "the unverified payload never reached submit()");
  assert.equal(eventsOf(run, "stopped").length, 1, "the stop is logged as an outcome");
  assert.equal(run.status, "completed_with_stops");
});
