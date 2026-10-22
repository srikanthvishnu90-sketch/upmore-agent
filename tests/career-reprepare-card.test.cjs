// RE-PREPARE + NEW APPROVAL CARD (173) — the answered-state watcher for
// the ask-the-user loop (owner ruling 2026-10-21 14:37 CDT).
//
// Claude's host wiring raises missing-fact questions via
// career_apply_cloud_ask while the worker holds the job; replies land
// through career_apply_question_answer_as. This suite proves Muse's
// piece against a faithful local fixture of that row lifecycle:
// once ALL of a job's questions are answered, the job is re-prepared
// through the executor's real composition (155 over 149/150, sandbox
// boards) and a NEW hash-bound approval card is issued — the old card
// recorded SUPERSEDED, its hash refused thereafter. Partial answers
// never re-prepare; a shared question completes each job independently;
// an answer landing mid-prepare discards the stale payload; a failed
// re-prepare is recorded named and held, never spun on.
//
// TEST world only: TEST-profile-shaped fixture, sandbox boards, flag
// OFF posture — the engine prepares and cards; nothing ever submits.
// Check: node --test tests/career-reprepare-card.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Engine = require(path.join(root, "packages/domain/173-career-reprepare-card.js"));
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));

const USER = "b2625909-d67f-41b2-8270-983d212c6052"; // the TEST user (test-profile-build)
const T0 = Date.UTC(2026, 9, 21, 19, 0, 0); // 2026-10-21 14:00 CDT

// TEST-profile-shaped base (~/workspace/test-profile-build basis):
// REAL = owner-stated; the cover note is the one TEST-INVENTED sample.
const TEST_PROFILE = {
  name: "TEST — Vishnu Srikanth",
  email: "srikanthvishnu90@gmail.com",
  phone: "+1 2246029341",
  location: "Chicago, IL",
  resume: { filename: "Vishnu_Srikanth_Resume.docx", sha256: "fcdfea90" + "0".repeat(56) },
  answers: {
    work_authorization: { value: "Yes", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
    cover_note: { value: "TEST SAMPLE — SYNTHETIC TEXT, NOT A REAL STATEMENT: I build software for youth sports.", confirmed: true, draft: true, test_invented: true },
  },
};
const MASTER = {
  basics: { name: "TEST — Vishnu Srikanth", email: "srikanthvishnu90@gmail.com" },
  facts: [
    { id: "TP-010", kind: "skill", text: "Python, TypeScript, React", confirmed: true, status: "confirmed" },
    { id: "TP-002", kind: "experience", text: "Founder, Sporv AI (2025–present)", confirmed: true, status: "confirmed" },
    { id: "TP-001", kind: "education", text: "DePaul University Driehaus, CS + Finance, 2025–2029", confirmed: true, status: "confirmed" },
  ],
};
const ATTEST = { certify_true: { value: true, explicit: true } };

const BASIS_ANSWERS = [
  { label: "name", value: "TEST — Vishnu Srikanth", tag: "REAL" },
  { label: "email", value: "srikanthvishnu90@gmail.com", tag: "REAL" },
  { label: "phone", value: "+1 2246029341", tag: "REAL" },
  { label: "location", value: "Chicago, IL", tag: "REAL" },
  { label: "school", value: "DePaul University (Driehaus College of Business)", tag: "REAL" },
  { label: "graduation year", value: "2029", tag: "REAL" },
  { label: "work authorized", value: "Yes", tag: "REAL" },
  { label: "sponsorship required", value: "No", tag: "REAL", note: "owner-stated 2:10 PM" },
  { label: "years of experience", value: "3", tag: "REAL", note: "owner-stated 2:10 PM" },
  { label: "resume file", value: "Vishnu_Srikanth_Resume.docx (his real resume)", tag: "REAL" },
  { label: "cover note / \"why this company\"", value: "TEST SAMPLE — SYNTHETIC TEXT, NOT A REAL STATEMENT", tag: "TEST-INVENTED" },
  { label: "EEO", value: "Decline to self-identify (product default)", tag: "TEST-INVENTED" },
];
const STANDING_STOPS = [
  { key: "graduation_month", label: "Graduation MONTH (year only is known)" },
  { key: "date_of_birth", label: "Date of birth / age-18+ attestation facts" },
  { key: "placeholder_28", label: "The [28] placeholder item" },
  { key: "security_clearance", label: "Security clearance specifics" },
  { key: "relocation", label: "Relocation specifics" },
  { key: "start_date", label: "Start-date specifics" },
  { key: "certify_true", label: "certify_true attestation", note: "this card's approval is the attestation step, per batch" },
];

const JOB_A = "lever:palantir:forward-deployed-software-engineer-intern";
const JOB_B = "lever:testco-b:data-analyst-intern";
function posting(jobId, over = {}) {
  const isA = jobId === JOB_A;
  return Object.assign({
    id: isA ? "JOB-RP-A" : "JOB-RP-B",
    job_id: isA ? "JOB-RP-A" : "JOB-RP-B",
    canonicalKey: jobId,
    company: isA ? "Palantir" : "TestCo B",
    title: isA ? "Forward Deployed Software Engineer, Internship" : "Data Analyst Intern",
    role: isA ? "Forward Deployed Software Engineer, Internship" : "Data Analyst Intern",
    url: isA ? "https://jobs.lever.co/palantir/2ad0ab10-34c3-410d-883b-8052864a95cd" : "https://jobs.lever.co/testcob/data-analyst-intern",
    status: "open", atsFamily: "lever", location: "New York, NY",
    jd_text: "Intern role. JavaScript, data, testing, agile team.",
  }, over);
}

const START_FIELD = { field_id: "start_date", label: "Earliest start date", kind: "screening", question_key: "start_date", required: true };
const RELOC_FIELD = { field_id: "relocation", label: "Willing to relocate?", kind: "screening", question_key: "relocation", required: true };
const CLEAR_FIELD = { field_id: "security_clearance", label: "Security clearance level", kind: "screening", question_key: "security_clearance", required: true };

// boardFor factory: extra fields per job from a mutable map the test
// controls (the "form version"); an optional hook runs INSIDE the
// prepare (the sanctioned seam for staging mid-prepare events).
function makeWorld(opts = {}) {
  let clock = T0;
  const store = Engine.createQuestionsStore();
  const formFields = opts.formFields || {}; // jobId -> [extra fields]
  const world = { store, formFields, clock: () => clock, advance: (ms) => { clock += ms; }, hook: null, throwBoard: false };
  const boardFor = (p, ctx) => {
    if (world.hook) world.hook(p, ctx);
    if (world.throwBoard) throw new Error("worker unreachable (staged)");
    // §11(F): the board account must be the applicant — the same
    // wiring bench-50 and the TEST-profile proof use for their personas
    const base = Portal.createSandboxBoard({ accountName: TEST_PROFILE.name });
    const board = Object.assign({}, base, { atsFamily: p.atsFamily });
    const extra = formFields[ctx.jobId] || [];
    if (extra.length) {
      board.form = () => { const f = base.form(); f.fields = f.fields.concat(extra); return f; };
    }
    return board;
  };
  world.engine = Engine.createReprepareEngine({
    store, userId: USER, now: world.clock,
    postings: { [JOB_A]: posting(JOB_A), [JOB_B]: posting(JOB_B) },
    baseProfile: TEST_PROFILE, profileMaster: MASTER,
    basisAnswers: BASIS_ANSWERS, standingStops: STANDING_STOPS,
    boardFor, attestations: ATTEST, familyText: "software engineering intern",
    log: { records: [] },
  });
  world.ask = (over) => store.cloudAsk(Object.assign({ user_id: USER, now: clock }, over));
  world.answer = (qid, value, verbatim) => { world.advance(60_000); return store.career_apply_question_answer_as(USER, qid, value, { now: clock, verbatim }); };
  return world;
}
const cardsOf = (w, jobId) => Object.values(w.engine.cards).filter((c) => c.jobId === jobId);

// ---------------- the store fixture: shapes + provenance ----------------
test("store: open_as is per-person and open-only; answer_as stamps owner_reply provenance; corrections replace", () => {
  const s = Engine.createQuestionsStore();
  const q1 = s.cloudAsk({ user_id: "u1", key: "start_date", label: "Earliest start date", type: "date", options: [], company: "Palantir", job_ids: ["J1"], now: 1000 });
  s.cloudAsk({ user_id: "u2", key: "relocation", label: "Relocate?", job_ids: ["J1"], now: 1000 });
  assert.equal(q1.state, "open");
  assert.deepEqual(s.career_apply_questions_open_as("u1").map((r) => r.id), [q1.id]);
  const a = s.career_apply_question_answer_as("u1", q1.id, "June 1, 2027", { now: 2000, verbatim: "June 1, 2027 works" });
  assert.equal(a.ok, true);
  assert.equal(a.row.state, "answered");
  assert.deepEqual(a.row.answer.provenance, { source: "owner_reply", question_id: q1.id, asked_at: 1000, answered_at: 2000 });
  assert.equal(a.row.answer.verbatim, "June 1, 2027 works");
  assert.equal(s.career_apply_questions_open_as("u1").length, 0, "answered rows leave the open read");
  // per-person binding: another user cannot answer u1's question
  assert.equal(s.career_apply_question_answer_as("u2", q1.id, "x", { now: 3000 }).code, "QUESTION_NOT_FOUND");
  assert.equal(s.career_apply_question_answer_as("u1", "caq_9999", "x", { now: 3000 }).code, "QUESTION_NOT_FOUND");
  // a correction replaces value + verbatim (and moves the fingerprint)
  const fp1 = Engine.fingerprintAnswers(s.rowsForJob("u1", "J1"));
  const c = s.career_apply_question_answer_as("u1", q1.id, "June 15, 2027", { now: 4000, verbatim: "actually June 15" });
  assert.equal(c.row.answer.value, "June 15, 2027");
  assert.notEqual(Engine.fingerprintAnswers(s.rowsForJob("u1", "J1")), fp1);
  // a failed ask is a record, and it can never be answered into existence
  const qf = s.cloudAsk({ user_id: "u1", key: "start_date", label: "Earliest start date", job_ids: ["J2"], now: 1000, fail: true, fail_reason: "channel_unreachable" });
  assert.equal(qf.state, "failed");
  assert.equal(s.career_apply_question_answer_as("u1", qf.id, "x", { now: 5000 }).code, "QUESTION_ASK_FAILED");
});

// ---------------- partial answers never re-prepare ----------------
test("partial answers: no re-prepare, no card, the job waits named", () => {
  const w = makeWorld({ formFields: { [JOB_A]: [START_FIELD, RELOC_FIELD] } });
  const q1 = w.ask({ key: "start_date", label: "Earliest start date", type: "date", company: "Palantir", job_ids: [JOB_A] });
  w.ask({ key: "relocation", label: "Willing to relocate?", type: "yes_no", options: ["Yes", "No"], company: "Palantir", job_ids: [JOB_A] });
  w.answer(q1.id, "June 1, 2027");
  const res = w.engine.tick();
  assert.equal(res.find((r) => r.jobId === JOB_A).action, "waiting_open_questions");
  assert.equal(w.engine.jobState(JOB_A).prepareCount, 0);
  assert.equal(cardsOf(w, JOB_A).length, 0);
  assert.equal(w.engine.jobState(JOB_A).status, "awaiting_answers");
});

// ---------------- all answered: exactly one re-prepare + card ----------------
test("all answered: exactly one re-prepare and one card; duplicate ticks are no-ops", () => {
  const w = makeWorld({ formFields: { [JOB_A]: [START_FIELD, RELOC_FIELD] } });
  const q1 = w.ask({ key: "start_date", label: "Earliest start date", type: "date", company: "Palantir", job_ids: [JOB_A] });
  const q2 = w.ask({ key: "relocation", label: "Willing to relocate?", type: "yes_no", options: ["Yes", "No"], company: "Palantir", job_ids: [JOB_A] });
  w.answer(q1.id, "June 1, 2027");
  w.answer(q2.id, "Yes");
  const r1 = w.engine.tick();
  assert.equal(r1.find((r) => r.jobId === JOB_A).action, "reprepared");
  assert.equal(w.engine.jobState(JOB_A).prepareCount, 1);
  const cards = cardsOf(w, JOB_A);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].state, "current");
  assert.ok(cards[0].payloadSha256 && cards[0].cardSha256);
  // the card basis carries both answers as REAL, stamped owner reply,
  // and the two answered keys leave the stop list
  const text = cards[0].text;
  assert.match(text, /\[REAL\] Earliest start date: June 1, 2027 \(owner reply — question start_date \(caq_\d+\), answered 2026-10-21T19:0\d:00\.000Z\)/);
  assert.match(text, /\[REAL\] Willing to relocate\?: Yes \(owner reply — question relocation/);
  assert.doesNotMatch(text, /Start-date specifics/);
  assert.doesNotMatch(text, /Relocation specifics/);
  assert.match(text, /Graduation MONTH/, "unanswered items stay named stops");
  assert.match(text, /\[TEST-INVENTED\] cover note/);
  // duplicate ticks change nothing
  assert.equal(w.engine.tick().find((r) => r.jobId === JOB_A).action, "already_current");
  assert.equal(w.engine.tick().find((r) => r.jobId === JOB_A).action, "already_current");
  assert.equal(w.engine.jobState(JOB_A).prepareCount, 1);
  assert.equal(cardsOf(w, JOB_A).length, 1);
  // the prepared run sits at the card — prepared, never executed
  assert.equal(w.engine.jobState(JOB_A).lastRun.status, "awaiting_approval");
});

// ---------------- a shared question completes jobs independently ----------------
test("shared question: answering it completes job A while job B still waits; B completes on its own last answer", () => {
  const w = makeWorld({ formFields: { [JOB_A]: [START_FIELD], [JOB_B]: [START_FIELD, RELOC_FIELD] } });
  const shared = w.ask({ key: "start_date", label: "Earliest start date", type: "date", company: null, job_ids: [JOB_A, JOB_B] });
  const bOnly = w.ask({ key: "relocation", label: "Willing to relocate?", type: "yes_no", options: ["Yes", "No"], company: "TestCo B", job_ids: [JOB_B] });
  w.answer(shared.id, "June 1, 2027");
  const r1 = w.engine.tick();
  assert.equal(r1.find((r) => r.jobId === JOB_A).action, "reprepared");
  assert.equal(r1.find((r) => r.jobId === JOB_B).action, "waiting_open_questions");
  assert.equal(cardsOf(w, JOB_A).length, 1);
  assert.equal(cardsOf(w, JOB_B).length, 0);
  w.answer(bOnly.id, "No");
  const r2 = w.engine.tick();
  assert.equal(r2.find((r) => r.jobId === JOB_B).action, "reprepared");
  assert.equal(cardsOf(w, JOB_B).length, 1);
  assert.notEqual(cardsOf(w, JOB_A)[0].cardId, cardsOf(w, JOB_B)[0].cardId);
  assert.equal(cardsOf(w, JOB_A)[0].supersedes, null, "independent jobs never supersede each other");
});

// ---------------- supersession: the new card kills the old hash ----------------
test("supersession: re-prepare issues a NEW card; the old hash is refused by name; both hashes recorded both ways", () => {
  const w = makeWorld(); // board v1: the standard form only
  const init = w.engine.initialPrepare(JOB_A);
  assert.equal(init.ok, true);
  const c1 = init.card;
  assert.equal(c1.supersedes, null);
  // the worker, still holding the job, meets a required start-date
  // field and raises the question; the board's form now carries it
  w.formFields[JOB_A] = [START_FIELD];
  const q = w.ask({ key: "start_date", label: "Earliest start date", type: "date", company: "Palantir", job_ids: [JOB_A] });
  assert.equal(w.engine.tick().find((r) => r.jobId === JOB_A).action, "waiting_open_questions");
  w.answer(q.id, "June 1, 2027");
  const r = w.engine.tick();
  assert.equal(r.find((x) => x.jobId === JOB_A).action, "reprepared");
  const cards = cardsOf(w, JOB_A);
  assert.equal(cards.length, 2);
  const c2 = cards.find((c) => c.state === "current");
  const old = cards.find((c) => c.state === "superseded");
  assert.equal(old.cardId, c1.cardId);
  assert.equal(c2.supersedes, c1.cardId);
  assert.equal(c2.supersedesPayloadSha256, c1.payloadSha256);
  assert.equal(old.supersededBy, c2.cardId);
  assert.equal(old.supersededByPayloadSha256, c2.payloadSha256);
  assert.notEqual(c2.payloadSha256, c1.payloadSha256, "the answered fact changed the exact payload");
  assert.notEqual(c2.cardSha256, c1.cardSha256);
  // approvals: the old hash is refused BY NAME; the new one validates
  const vOld = w.engine.validateApproval(JOB_A, c1.cardSha256);
  assert.equal(vOld.ok, false);
  assert.equal(vOld.code, "CARD_SUPERSEDED");
  assert.equal(vOld.supersededBy, c2.cardId);
  const vNew = w.engine.validateApproval(JOB_A, c2.cardSha256);
  assert.equal(vNew.ok, true);
  assert.equal(vNew.payloadSha256, c2.payloadSha256);
  assert.equal(w.engine.validateApproval(JOB_A, "deadbeef").code, "CARD_HASH_NOT_RECOGNIZED");
  // card text: v2 carries the new REAL line; v1 did not; v1 lists the stop
  assert.match(c2.text, /SUPERSEDES/);
  assert.match(c2.text, /\[REAL\] Earliest start date: June 1, 2027 \(owner reply — question start_date/);
  assert.doesNotMatch(c1.text, /Earliest start date: June 1, 2027/);
  assert.match(c1.text, /Start-date specifics/);
});

// ---------------- 155-level: the approval binds the NEW payload only ----------------
test("155 binding: approveRun on the re-prepared run mints approvals over the NEW payload hash; a payload-swapped old run is refused", () => {
  const w = makeWorld();
  const init = w.engine.initialPrepare(JOB_A);
  const oldRunJson = JSON.stringify(w.engine.jobState(JOB_A).lastRun);
  const oldCard = init.card;
  w.formFields[JOB_A] = [START_FIELD];
  const q = w.ask({ key: "start_date", label: "Earliest start date", type: "date", company: "Palantir", job_ids: [JOB_A] });
  w.answer(q.id, "June 1, 2027");
  w.engine.tick();
  const newRun = Batch.restoreRun(JSON.parse(JSON.stringify(w.engine.jobState(JOB_A).lastRun)));
  const ok = Batch.approveRun(newRun, { approvedByUser: true });
  assert.equal(ok.ok, true);
  assert.equal(newRun.approvals[JOB_A], cardsOf(w, JOB_A).find((c) => c.state === "current").payloadSha256);
  // the old run with its payload pointer swapped to the new hash:
  // 155's own set-hash re-verification refuses it — the approval can
  // never be silently re-pointed at a changed payload
  const tampered = Batch.restoreRun(JSON.parse(oldRunJson));
  tampered.apps[JOB_A].payloadSha256 = cardsOf(w, JOB_A).find((c) => c.state === "current").payloadSha256;
  const refused = Batch.approveRun(tampered, { approvedByUser: true });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, "APPROVAL_SET_CHANGED");
  assert.notEqual(oldCard.payloadSha256, cardsOf(w, JOB_A).find((c) => c.state === "current").payloadSha256);
});

// ---------------- mid-prepare: a correction discards the stale payload ----------------
test("mid-prepare correction: the in-flight prepare is discarded as STALE, no card; the next tick cards the corrected value", () => {
  const w = makeWorld({ formFields: { [JOB_A]: [START_FIELD] } });
  const q = w.ask({ key: "start_date", label: "Earliest start date", type: "date", company: "Palantir", job_ids: [JOB_A] });
  w.answer(q.id, "June 1, 2027");
  let fired = false;
  w.hook = (p, ctx) => {
    if (fired || ctx.jobId !== JOB_A) return;
    fired = true; // the owner's correction lands WHILE the prepare runs
    w.store.career_apply_question_answer_as(USER, q.id, "June 15, 2027", { now: w.clock(), verbatim: "actually June 15, 2027" });
  };
  const r1 = w.engine.tick();
  assert.equal(r1.find((r) => r.jobId === JOB_A).action, "REPREPARE_STALE_NEW_ANSWER");
  assert.equal(cardsOf(w, JOB_A).length, 0, "no card is issued from a stale payload");
  assert.equal(w.engine.jobState(JOB_A).prepareCount, 1);
  assert.ok(w.engine.jobState(JOB_A).events.some((e) => e.type === "REPREPARE_STALE_NEW_ANSWER"));
  w.hook = null;
  const r2 = w.engine.tick();
  assert.equal(r2.find((r) => r.jobId === JOB_A).action, "reprepared");
  assert.equal(w.engine.jobState(JOB_A).prepareCount, 2);
  const card = cardsOf(w, JOB_A)[0];
  assert.match(card.text, /\[REAL\] Earliest start date: June 15, 2027 \(owner reply/);
  assert.doesNotMatch(card.text, /June 1, 2027/);
});

// ---------------- a new question after carding re-arms the loop ----------------
test("re-arm: a second question opening for a carded job waits, then re-prepares and supersedes again", () => {
  const w = makeWorld({ formFields: { [JOB_A]: [START_FIELD] } });
  const q1 = w.ask({ key: "start_date", label: "Earliest start date", type: "date", company: "Palantir", job_ids: [JOB_A] });
  w.answer(q1.id, "June 1, 2027");
  w.engine.tick();
  const c1 = cardsOf(w, JOB_A).find((c) => c.state === "current");
  assert.ok(c1);
  // a second question opens for the already-carded job
  w.formFields[JOB_A] = [START_FIELD, RELOC_FIELD];
  const q2 = w.ask({ key: "relocation", label: "Willing to relocate?", type: "yes_no", options: ["Yes", "No"], company: "Palantir", job_ids: [JOB_A] });
  const rWait = w.engine.tick();
  assert.equal(rWait.find((r) => r.jobId === JOB_A).action, "waiting_open_questions");
  assert.equal(w.engine.jobState(JOB_A).status, "carded_awaiting_answers");
  assert.equal(w.engine.jobState(JOB_A).prepareCount, 1, "no re-prepare while the new question is open");
  w.answer(q2.id, "Yes");
  const r2 = w.engine.tick();
  assert.equal(r2.find((r) => r.jobId === JOB_A).action, "reprepared");
  const cards = cardsOf(w, JOB_A);
  assert.equal(cards.length, 2);
  const c2 = cards.find((c) => c.state === "current");
  assert.equal(c2.supersedes, c1.cardId);
  assert.equal(w.engine.validateApproval(JOB_A, c1.cardSha256).code, "CARD_SUPERSEDED");
  assert.equal(w.engine.validateApproval(JOB_A, c2.cardSha256).ok, true);
});

// ---------------- failed re-prepare: recorded named, held, re-armed by change ----------------
test("failed re-prepare: recorded named and HELD for that answered set; a correction re-arms it", () => {
  const w = makeWorld({ formFields: { [JOB_A]: [START_FIELD] } });
  const q = w.ask({ key: "start_date", label: "Earliest start date", type: "date", company: "Palantir", job_ids: [JOB_A] });
  w.answer(q.id, "June 1, 2027");
  w.throwBoard = true;
  const r1 = w.engine.tick();
  // Port reconciliation (2026-10-22, F2 lane): on the Lane B lineage 155 let
  // the board factory's throw propagate and 173 recorded REPREPARE_ERROR with
  // the thrown message in the reason. Trunk's 155 catches a code-less factory
  // throw in boardOrStop and names the stop BOARD_NOT_WIRED instead — so 173
  // records REPREPARE_STOPPED_BOARD_NOT_WIRED with trunk's reason. (Noted for
  // the architect, not fixed here: the staged throw's own message is lost on
  // trunk; a CODED refusal keeps its code as workerRefusal evidence.) Same
  // contract asserted below: recorded, named, held for the answered set,
  // re-armed by correction.
  assert.equal(r1.find((r) => r.jobId === JOB_A).action, "REPREPARE_STOPPED_BOARD_NOT_WIRED");
  const st = w.engine.jobState(JOB_A);
  assert.equal(st.status, "failed");
  assert.equal(st.failures.length, 1);
  assert.equal(st.failures[0].code, "REPREPARE_STOPPED_BOARD_NOT_WIRED");
  assert.match(st.failures[0].reason, /no board adapter is wired for this posting's family/);
  assert.equal(cardsOf(w, JOB_A).length, 0);
  // the same answered set is NOT retried — no silent spin
  assert.equal(w.engine.tick().find((r) => r.jobId === JOB_A).action, "failed_fingerprint_held");
  assert.equal(st.prepareCount, 1);
  // a correction changes the set -> re-armed; with the board healed it cards
  w.throwBoard = false;
  w.answer(q.id, "July 1, 2027", "make it July 1, 2027");
  const r3 = w.engine.tick();
  assert.equal(r3.find((r) => r.jobId === JOB_A).action, "reprepared");
  assert.equal(st.prepareCount, 2);
  assert.match(cardsOf(w, JOB_A)[0].text, /July 1, 2027/);
});

test("stopped re-prepare: a still-uncovered required field records REPREPARE_STOPPED_UNCOVERED_QUESTION with its asks", () => {
  const w = makeWorld({ formFields: { [JOB_A]: [START_FIELD, CLEAR_FIELD] } });
  const q = w.ask({ key: "start_date", label: "Earliest start date", type: "date", company: "Palantir", job_ids: [JOB_A] });
  w.answer(q.id, "June 1, 2027");
  const r = w.engine.tick();
  assert.equal(r.find((x) => x.jobId === JOB_A).action, "REPREPARE_STOPPED_UNCOVERED_QUESTION");
  const st = w.engine.jobState(JOB_A);
  assert.equal(st.failures[0].code, "REPREPARE_STOPPED_UNCOVERED_QUESTION");
  assert.ok(JSON.stringify(st.failures[0].asks).includes("security_clearance"), "the stop names the field it waits on");
  assert.equal(cardsOf(w, JOB_A).length, 0);
});

// ---------------- failed asks: recorded, named, never satisfying ----------------
test("failed ask: the job reports ask_failed; the failed row never counts as answered", () => {
  const w = makeWorld({ formFields: { [JOB_A]: [START_FIELD] } });
  w.ask({ key: "start_date", label: "Earliest start date", type: "date", company: "Palantir", job_ids: [JOB_A], fail: true, fail_reason: "channel_unreachable" });
  const r = w.engine.tick();
  assert.equal(r.find((x) => x.jobId === JOB_A).action, "ask_failed_named");
  const st = w.engine.jobState(JOB_A);
  assert.equal(st.status, "ask_failed");
  assert.equal(st.failedAsks.length, 1);
  assert.equal(st.failedAsks[0].reason, "channel_unreachable");
  assert.equal(st.prepareCount, 0);
  assert.equal(cardsOf(w, JOB_A).length, 0);
});
