// APPROVAL CARD + ASK-WHEN-MISSING UI (175) — FRONTEND LANE B
// (owner direction 2026-10-21 16:32 CDT; correction 16:34 CDT: NO
// extension — the Messages card IS the cloud-worker's approval
// mechanism).
//
// The owner's named test, in five legs:
// 1. The TEST-profile card renders from the REAL staged batch record
//    (batch-1ada7107528f, cardSha256 0a67147c…) with the corrected
//    provenance basis: sponsorship + years of experience REAL
//    (owner-stated 2026-10-21 14:10 CDT), graduation month an
//    UNANSWERED-STOP, cover note + EEO TEST-INVENTED.
// 2. Tap -> approval record -> worker claim, on the staged record:
//    the claim succeeds against the tapped record; an untapped batch
//    refuses (CLAIM_NO_APPROVAL); a superseded payload refuses.
// 3. The same chain on a LIVE 155 run: the tap runs 155's own mint
//    (approvalRef batch:<run>:<hash>), the claim consumes it; a
//    tampered payload refuses (CLAIM_PAYLOAD_MISMATCH).
// 4. Ask cards from 172's queue on a SCRATCH copy of the TEST profile
//    missing sponsorship / years of experience / graduation month:
//    two_option / option_stepper / month_picker controls; taps route
//    through 172's intakeReply and store CONFIRMED facts with
//    owner_reply provenance; the scratch identity is separate and the
//    source profile is never mutated.
// 5. The re-prepare chain (173): all answered -> NEW card; a
//    correction supersedes it; the old card's tap and the old
//    record's claim are refused CARD_SUPERSEDED by name; the new
//    card taps and claims clean.
//
// TEST world only: TEST user + a distinct scratch identity, sandbox
// boards, flag OFF — approvals recorded here authorize nothing live;
// nothing submits, ever.
// Check: node --test tests/career-approval-ui.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const UI = require(path.join(root, "packages/domain/175-career-approval-ui.js"));
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));
const Ask = require(path.join(root, "packages/domain/172-career-missing-fact-ask.js"));
const Engine173 = require(path.join(root, "packages/domain/173-career-reprepare-card.js"));
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));

const USER = "b2625909-d67f-41b2-8270-983d212c6052"; // the TEST user
const SCRATCH_USER = "fe-b-scratch-2026-10-21@test"; // distinct scratch identity (leg 4/5)
const T0 = Date.UTC(2026, 9, 21, 21, 40, 0); // 2026-10-21 16:40 CDT
const STAGED_SHA = "0a67147cb950acfa85720c9de4de0ab1129294cf673b09c8b1db733cdbfff8e5";

// The corrected basis (approval-card-batch.txt / provenance-manifest
// AS CORRECTED through the owner's 14:10 CDT statements).
const BASIS_ANSWERS = [
  { label: "name", value: "TEST — Vishnu Srikanth", tag: "REAL" },
  { label: "email", value: "srikanthvishnu90@gmail.com", tag: "REAL" },
  { label: "phone", value: "+1 2246029341", tag: "REAL" },
  { label: "location", value: "Chicago, IL", tag: "REAL" },
  { label: "linkedin", value: "linkedin.com/in/vishnu-srikanth", tag: "REAL" },
  { label: "school", value: "DePaul University (Driehaus College of Business)", tag: "REAL" },
  { label: "degree", value: "Bachelor of Science in Computer Science and Finance", tag: "REAL" },
  { label: "graduation year", value: "2029", tag: "REAL" },
  { label: "GPA", value: "3.9 (CS 4.0)", tag: "REAL" },
  { label: "work authorized", value: "Yes", tag: "REAL" },
  { label: "sponsorship required", value: "No", tag: "REAL", note: "owner-stated 2:10 PM" },
  { label: "years of experience", value: "3", tag: "REAL", note: "owner-stated 2:10 PM" },
  { label: "located in US", value: "Yes", tag: "REAL" },
  { label: "resume file", value: "Vishnu_Srikanth_Resume.docx (his real resume, sha256 fcdfea90…)", tag: "REAL" },
  { label: "cover note / \"why this company\"", value: "TEST SAMPLE — SYNTHETIC TEXT, NOT A REAL STATEMENT (sample paragraph, marked in the text itself; doorstep drives only)", tag: "TEST-INVENTED" },
  { label: "EEO", value: "Decline to self-identify (product default — no EEO fact exists on this profile)", tag: "TEST-INVENTED" },
];
const STANDING_STOPS = [
  { key: "graduation_month", label: "Graduation MONTH (year only is known)" },
  { key: "date_of_birth", label: "Date of birth / age-18+ attestation facts" },
  { key: "placeholder_28", label: "The [28] placeholder item" },
  { key: "security_clearance", label: "Security clearance, relocation, start-date specifics" },
  { key: "certify_true", label: "certify_true attestation", note: "the TEST profile attests NOTHING — this card's approval is the attestation step, per batch" },
];

// Trimmed fixture of the REAL staged stored record
// (~/workspace/o5-batch/run-staged.json — career_batch_run/v1; jd
// text dropped, every binding field verbatim).
const STAGED_STORED = {
  version: "career_batch_run/v1",
  runId: "batch-1ada7107528f",
  userId: USER,
  status: "awaiting_approval",
  run: {
    id: "batch-1ada7107528f", userId: USER,
    familyText: "software engineering intern roles", requested: 3,
    status: "awaiting_approval", cardSha256: STAGED_SHA, approvalRef: null, approvals: {},
    selected: [
      "palantir|forward deployed software engineer internship commercial|chicago",
      "palantir|software engineer internship|new york",
    ],
    postings: {
      "palantir|forward deployed software engineer internship commercial|chicago": { location: "Chicago, IL" },
      "palantir|software engineer internship|new york": { location: "New York, NY" },
    },
    apps: {
      "palantir|forward deployed software engineer internship commercial|chicago": {
        postingKey: "palantir|forward deployed software engineer internship commercial|chicago",
        company: "palantir", role: "Forward Deployed Software Engineer, Internship - Commercial",
        url: "https://jobs.lever.co/palantir/d5486403-c050-4920-b2e0-91b69b61ebb2",
        stage: "awaiting_attestation", payloadSha256: null,
      },
      "palantir|software engineer internship|new york": {
        postingKey: "palantir|software engineer internship|new york",
        company: "palantir", role: "Software Engineer, Internship",
        url: "https://jobs.lever.co/palantir/7d69cf8a-06fd-4f05-bd84-27149db29c4d",
        stage: "awaiting_attestation", payloadSha256: null,
      },
    },
  },
};

// TEST-profile-shaped portal profile (173's fixture shape).
const TEST_PROFILE = {
  name: "TEST — Vishnu Srikanth",
  email: "srikanthvishnu90@gmail.com",
  phone: "+1 2246029341",
  location: "Chicago, IL",
  resume: { filename: "Vishnu_Srikanth_Resume.docx", sha256: "fcdfea902c149d7efc72cb184389236a8358c2ee45864fe1b53d2bc229b411ee" },
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
const FDSE_POSTING = {
  id: "JOB-FE-A", job_id: "JOB-FE-A", canonicalKey: "lever:palantir:fdse-intern",
  company: "Palantir", title: "Forward Deployed Software Engineer, Internship - Commercial",
  role: "Forward Deployed Software Engineer, Internship - Commercial",
  url: "https://jobs.lever.co/palantir/2ad0ab10-34c3-410d-883b-8052864a95cd",
  status: "open", atsFamily: "lever", location: "Chicago, IL",
  jd_text: "Intern role. JavaScript, data, testing, agile team.",
};
function sandboxBoardFor(profileName) {
  return (posting) => {
    const base = Portal.createSandboxBoard({ accountName: profileName });
    return Object.assign({}, base, { atsFamily: posting.atsFamily });
  };
}

// ---------- leg 1: the staged TEST card renders ----------
test("leg 1 — staged TEST card: real hash, corrected tags, hash-bound action", () => {
  const built = UI.buildBatchCard({ run: STAGED_STORED, basisAnswers: BASIS_ANSWERS, standingStops: STANDING_STOPS, world: "staged TEST batch (executor stored record, flag OFF)" });
  assert.equal(built.ok, true);
  const card = built.card;
  assert.equal(card.runId, "batch-1ada7107528f");
  assert.equal(card.cardSha256, STAGED_SHA);
  assert.equal(card.postings.length, 2);
  assert.equal(card.actions.length, 1);
  assert.deepEqual(card.actions[0].binding, { run_id: "batch-1ada7107528f", card_sha256: STAGED_SHA });
  const byLabel = Object.fromEntries(card.answers.map((a) => [a.label, a]));
  assert.equal(byLabel["sponsorship required"].tag, "REAL");
  assert.match(byLabel["sponsorship required"].note, /owner-stated 2:10 PM/);
  assert.equal(byLabel["years of experience"].tag, "REAL");
  assert.equal(byLabel["cover note / \"why this company\""].tag, "TEST-INVENTED");
  assert.equal(byLabel["EEO"].tag, "TEST-INVENTED");
  assert.ok(card.stops.some((x) => x.key === "graduation_month"));
  assert.ok(card.stops.every((x) => x.tag === "UNANSWERED-STOP"));
  assert.deepEqual(card.attestationsSuppliedOnApproval, ["certify_true"]);
  // text + HTML renders carry the binding
  assert.match(card.text, /0a67147cb950acfa85720c9de4de0ab1129294cf673b09c8b1db733cdbfff8e5/);
  assert.match(card.text, /\[REAL\] sponsorship required: No \(owner-stated 2:10 PM\)/);
  const html = UI.renderCardHtml(card);
  assert.match(html, /data-card-sha256="0a67147cb950/);
  assert.match(html, /data-action="approve_batch"/);
  assert.match(html, /Approve 2 applications/);
});

// ---------- leg 2: staged tap -> record -> claim ----------
test("leg 2 — staged tap mints the record; claim succeeds; untapped + superseded refuse", () => {
  const { card } = UI.buildBatchCard({ run: STAGED_STORED, basisAnswers: BASIS_ANSWERS, standingStops: STANDING_STOPS });
  // untapped: no record at all
  assert.equal(UI.claimBatch(null, STAGED_STORED).code, "CLAIM_NO_APPROVAL");
  // the tap
  const tapped = UI.tapApprove(card, STAGED_STORED, { userId: USER, now: T0 });
  assert.equal(tapped.ok, true);
  const rec = tapped.record;
  assert.equal(rec.runId, "batch-1ada7107528f");
  assert.equal(rec.cardSha256, STAGED_SHA);
  assert.equal(rec.approvalRef, `batch:batch-1ada7107528f:${STAGED_SHA}`);
  assert.deepEqual(rec.attestationsSupplied, ["certify_true"]);
  assert.deepEqual(Object.keys(rec.approvals).sort(), STAGED_STORED.run.selected.slice().sort());
  // the batch state after the mint (what the worker holds)
  const approvedState = JSON.parse(JSON.stringify(STAGED_STORED));
  approvedState.run.status = "approved";
  approvedState.run.approvalRef = rec.approvalRef;
  approvedState.run.approvals = rec.approvals;
  const claim = UI.claimBatch(rec, approvedState, { now: T0 + 1000 });
  assert.equal(claim.ok, true);
  assert.equal(claim.claim.approvalRef, rec.approvalRef);
  assert.deepEqual(claim.claim.attestationsSupplied, ["certify_true"]);
  // superseded: the batch was re-prepared under a NEW hash — the old
  // record's claim dies by name, and a tap on the old card dies too
  const v2State = JSON.parse(JSON.stringify(approvedState));
  v2State.run.cardSha256 = "f".repeat(64);
  v2State.run.status = "awaiting_approval";
  v2State.run.approvalRef = null;
  assert.equal(UI.claimBatch(rec, v2State).code, "CARD_SUPERSEDED");
  const staleTap = UI.tapApprove(card, v2State, { userId: USER, now: T0 });
  assert.equal(staleTap.ok, false);
  assert.equal(staleTap.code, "CARD_SUPERSEDED");
  // a tap by the wrong user refuses
  assert.equal(UI.tapApprove(card, STAGED_STORED, { userId: "someone-else", now: T0 }).code, "CARD_USER_MISMATCH");
});

// ---------- leg 3: the live 155 mint ----------
test("leg 3 — live 155 run: tap runs 155's mint; claim consumes it; tamper refuses", () => {
  const run = Batch.createRun({ userId: USER, familyText: "software engineering intern roles", count: 1, now: T0 });
  Batch.prepareRun(run, {
    postings: [FDSE_POSTING], profile: TEST_PROFILE, profileMaster: MASTER,
    boardFor: sandboxBoardFor(TEST_PROFILE.name), attestations: ATTEST, log: { records: [] }, now: T0,
  });
  assert.equal(run.status, "awaiting_approval");
  assert.ok(run.cardSha256);
  const { card } = UI.buildBatchCard({ run, basisAnswers: BASIS_ANSWERS, standingStops: STANDING_STOPS });
  assert.equal(card.cardSha256, run.cardSha256);
  const tapped = UI.tapApprove(card, run, { liveRun: run, now: T0 + 5000 });
  assert.equal(tapped.ok, true);
  assert.equal(run.status, "approved"); // 155's mint ran on the run itself
  assert.equal(tapped.record.approvalRef, run.approvalRef);
  assert.equal(tapped.record.approvalRef, `batch:${run.id}:${run.cardSha256}`);
  assert.equal(tapped.record.via, "card_tap_155_mint");
  const claim = UI.claimBatch(tapped.record, run, { now: T0 + 6000 });
  assert.equal(claim.ok, true);
  assert.deepEqual(claim.claim.postingKeys, [FDSE_POSTING.canonicalKey]);
  // tampered payload under the same hash: refused
  const tampered = JSON.parse(JSON.stringify(tapped.record));
  tampered.approvals[FDSE_POSTING.canonicalKey] = "0".repeat(64);
  assert.equal(UI.claimBatch(tampered, run).code, "CLAIM_PAYLOAD_MISMATCH");
  // double-tap: the batch is no longer awaiting approval
  assert.equal(UI.tapApprove(card, run, { liveRun: run, now: T0 + 7000 }).code, "NO_RUN_AWAITING_APPROVAL");
});

// ---------- leg 4: ask cards on the scratch identity ----------
function scratchProfile() {
  return {
    basics: { name: "SCRATCH — TEST copy (FE-B)", email: "test-doorstep@upmore.test", location: "Chicago, IL" },
    facts: [
      { id: "SC-EDU", kind: "education", name: "Education", title: "Education", text: "DePaul University Driehaus, CS + Finance, 2025–2029", start: "2025", end: "2029", status: "confirmed", needs_confirmation: false },
      { id: "SC-EXP", kind: "experience", name: "Founder, Sporv AI", title: "Founder, Sporv AI", text: "Founder, Sporv AI (2025–present)", start: "2025", status: "confirmed", needs_confirmation: false },
      { id: "SC-WA", kind: "eligibility", name: "Work authorization", title: "Work authorization", answer_key: "work_authorization", value: "Yes", status: "confirmed", needs_confirmation: false },
      { id: "SC-CTY", kind: "profile", name: "Country", title: "Country", value: "United States", status: "confirmed", needs_confirmation: false },
    ],
  };
}
test("leg 4 — ask cards: three controls, taps store owner_reply facts, scratch untouched", () => {
  const scratch = scratchProfile();
  const before = JSON.stringify(scratch);
  const session = Ask.createSession(scratch, ["sponsorship", "years_of_experience", "graduation_month"], { context: { run_id: "fe-b-scratch" }, now: T0 });
  assert.deepEqual(session.queue.map((q) => q.field_key), ["sponsorship", "years_of_experience", "graduation_month"]);
  // the refused derivations are named, not silent
  const yoeMissing = session.queue[1];
  assert.ok(yoeMissing);
  // cards, one per field, controls per type
  const cards = {};
  let sess = session;
  const taps = [
    ["sponsorship", "two_option", "no", "No"],
    ["years_of_experience", "option_stepper", "n_3", 3],
    ["graduation_month", "month_picker", "m_05", "2029-05"],
  ];
  for (const [fieldKey, control, optionId, expect] of taps) {
    const q = sess.queue.find((x) => x.field_key === fieldKey);
    const year = fieldKey === "graduation_month" ? 2029 : undefined;
    const builtCard = UI.buildAskCard(q, { year });
    assert.equal(builtCard.ok, true);
    assert.equal(builtCard.card.control, control, `${fieldKey} control`);
    cards[fieldKey] = builtCard.card;
    const tapped = UI.tapAskCard(builtCard.card, sess, optionId, { now: T0 + 60_000 });
    assert.equal(tapped.ok, true, `${fieldKey} tap: ${JSON.stringify(tapped)}`);
    assert.equal(tapped.value, expect);
    assert.equal(tapped.fact.status, "confirmed");
    assert.equal(tapped.fact.provenance.source, "owner_reply");
    assert.equal(tapped.fact.provenance.question_id, q.question_id);
    assert.equal(tapped.fact.answer_key, fieldKey);
    sess = tapped.session;
    if (fieldKey !== "graduation_month") assert.equal(tapped.resume.signal, "fact_stored");
    else {
      assert.equal(tapped.resume.signal, "all_fields_covered"); // the re-prepare signal (173)
      assert.equal(tapped.fact.provenance.precision, "month"); // month precision only — no invented day
    }
  }
  // stored facts re-assess as covered, tagged REAL
  let prof = scratch;
  for (const f of sess.stored_facts) prof = Ask.applyStoredFact(prof, f);
  const after = Ask.assessCoverage(prof, ["sponsorship", "years_of_experience", "graduation_month"]);
  assert.equal(after.missing.length, 0);
  assert.deepEqual(after.covered.map((c) => c.field_key).sort(), ["graduation_month", "sponsorship", "years_of_experience"]);
  assert.ok(after.covered.every((c) => c.tag === "REAL"));
  // the month picker rendered 12 chips for the stated year; the
  // two-option card is exactly Yes/No; unknown options refuse by name
  assert.equal(cards.graduation_month.options.length, 12);
  assert.deepEqual(cards.sponsorship.options.map((o) => o.label), ["Yes", "No"]);
  assert.equal(UI.tapAskCard(cards.sponsorship, session, "maybe", { now: T0 }).code, "OPTION_NOT_ON_CARD");
  assert.match(UI.renderAskCardHtml(cards.graduation_month), /data-control="month_picker"/);
  // month picker with NO stated year: named fallback, never invented
  const noYear = UI.buildAskCard(session.queue[2], {});
  assert.equal(noYear.card.control, "text_reply");
  assert.match(noYear.card.picker_unavailable_reason, /no graduation year is stated/);
  // isolation: the scratch source profile was never mutated, and the
  // real TEST profile fixture carries its stated facts throughout
  assert.equal(JSON.stringify(scratch), before);
  assert.equal(TEST_PROFILE.answers.sponsorship.value, "No");
});

// ---------- leg 5: re-prepare -> NEW card -> supersession ----------
test("leg 5 — 173 chain: answered asks re-prepare to a NEW card; old tap + old claim refused by name", () => {
  const JOB = FDSE_POSTING.canonicalKey;
  const store = Engine173.createQuestionsStore();
  let clock = T0;
  const extraFields = [
    { field_id: "sponsorship", label: "Will you require sponsorship?", kind: "screening", question_key: "sponsorship", required: true },
    { field_id: "years_of_experience", label: "Years of experience", kind: "screening", question_key: "years_of_experience", required: true },
    { field_id: "graduation_month", label: "Graduation month", kind: "screening", question_key: "graduation_month", required: true },
  ];
  const boardFor = (posting) => {
    const base = Portal.createSandboxBoard({ accountName: TEST_PROFILE.name });
    const board = Object.assign({}, base, { atsFamily: posting.atsFamily });
    board.form = () => { const f = base.form(); f.fields = f.fields.concat(extraFields); return f; };
    return board;
  };
  // scratch answers: work auth + cover note only — the three fields
  // are genuinely missing until the asks are answered
  const scratchAnswersProfile = Object.assign({}, TEST_PROFILE, {
    answers: {
      work_authorization: { value: "Yes", confirmed: true },
      cover_note: TEST_PROFILE.answers.cover_note,
    },
  });
  const engine = Engine173.createReprepareEngine({
    store, userId: SCRATCH_USER, now: () => clock,
    postings: { [JOB]: FDSE_POSTING },
    baseProfile: scratchAnswersProfile, profileMaster: MASTER,
    basisAnswers: BASIS_ANSWERS, standingStops: STANDING_STOPS,
    boardFor, attestations: ATTEST, familyText: "software engineering intern roles",
    log: { records: [] },
  });
  const ask = (key, label, type) => store.cloudAsk({ user_id: SCRATCH_USER, key, label, type, kind: "missing_fact", job_ids: [JOB], now: clock });
  const qS = ask("sponsorship", "Sponsorship required", "yes_no");
  const qY = ask("years_of_experience", "Years of experience", "number");
  const qG = ask("graduation_month", "Graduation month", "month_year");
  // open questions: the watcher waits, no card
  let actions = engine.tick();
  assert.equal(actions[0].action, "waiting_open_questions");
  // the taps' answers land through the host seam (the same values leg
  // 4's cards stored: No / 3 / 2029-05)
  clock += 60_000;
  store.career_apply_question_answer_as(SCRATCH_USER, qS.id, "No", { now: clock, verbatim: "No" });
  store.career_apply_question_answer_as(SCRATCH_USER, qY.id, 3, { now: clock, verbatim: "3" });
  store.career_apply_question_answer_as(SCRATCH_USER, qG.id, "2029-05", { now: clock, verbatim: "May 2029" });
  actions = engine.tick();
  assert.equal(actions[0].action, "reprepared");
  const cardV1 = engine.cards[engine.jobs[JOB].currentCardId];
  assert.ok(cardV1);
  // the answered fields joined the basis as REAL with owner-reply
  // stamps, and graduation month LEFT the stops
  const gm = cardV1.basis.lines.find((l) => l.label === "Graduation month");
  assert.ok(gm && gm.tag === "REAL" && /owner reply/.test(gm.note));
  assert.ok(!cardV1.basis.stops.some((x) => x.key === "graduation_month"));
  assert.equal(engine.validateApproval(JOB, cardV1.cardSha256).ok, true);
  // the 175 card over the engine's run taps + claims clean
  const runV1 = JSON.parse(JSON.stringify(engine.jobs[JOB].lastRun));
  const builtV1 = UI.buildBatchCard({ run: runV1, basisAnswers: cardV1.basis.lines, standingStops: cardV1.basis.stops.map((x) => ({ key: x.key, label: x.label, note: x.note })) });
  assert.equal(builtV1.card.cardSha256, cardV1.cardSha256);
  const tapV1 = UI.tapApprove(builtV1.card, runV1, { liveRun: runV1, ledger: engine, jobId: JOB, now: clock });
  assert.equal(tapV1.ok, true);
  assert.equal(UI.claimBatch(tapV1.record, runV1, { ledger: engine, jobId: JOB, now: clock }).ok, true);
  // a CORRECTION (June, not May) re-prepares: card v2 supersedes v1
  clock += 60_000;
  store.career_apply_question_answer_as(SCRATCH_USER, qG.id, "2029-06", { now: clock, verbatim: "June 2029" });
  actions = engine.tick();
  assert.equal(actions[0].action, "reprepared");
  const cardV2 = engine.cards[engine.jobs[JOB].currentCardId];
  assert.ok(cardV2 && cardV2.cardId !== cardV1.cardId);
  assert.notEqual(cardV2.cardSha256, cardV1.cardSha256);
  assert.equal(engine.cards[cardV1.cardId].state, "superseded");
  assert.equal(engine.validateApproval(JOB, cardV1.cardSha256).code, "CARD_SUPERSEDED");
  // the old card's tap and the old record's claim: refused by name
  const runV2 = JSON.parse(JSON.stringify(engine.jobs[JOB].lastRun));
  const staleTap = UI.tapApprove(builtV1.card, runV2, { ledger: engine, jobId: JOB, now: clock });
  assert.equal(staleTap.ok, false);
  assert.equal(staleTap.code, "CARD_SUPERSEDED");
  const staleClaim = UI.claimBatch(tapV1.record, runV2, { ledger: engine, jobId: JOB, now: clock });
  assert.equal(staleClaim.ok, false);
  assert.equal(staleClaim.code, "CARD_SUPERSEDED");
  // the NEW card is the approval surface again: tap + claim clean
  const builtV2 = UI.buildBatchCard({ run: runV2, basisAnswers: cardV2.basis.lines, standingStops: [], supersedes: builtV1.card.cardSha256 });
  const tapV2 = UI.tapApprove(builtV2.card, runV2, { liveRun: runV2, ledger: engine, jobId: JOB, now: clock });
  assert.equal(tapV2.ok, true);
  assert.equal(UI.claimBatch(tapV2.record, runV2, { ledger: engine, jobId: JOB, now: clock }).ok, true);
});
