"use strict";
/* reprepare-card-demo.cjs — produces the lane's card artifacts by
   driving module 173 through the supersession scenario end to end
   (TEST profile, sandbox board, no submits):
     1. the job is prepared and carded (card v1, payload H1);
     2. the worker raises a start-date question via cloud_ask;
     3. the owner answers through career_apply_question_answer_as;
     4. the watcher re-prepares and issues card v2 — v1 SUPERSEDED,
        both hashes recorded; validateApproval refuses the v1 hash.
   Outputs (docs/career/reprepare-card-2026-10-21/): card-v1.txt,
   card-v2.txt, run-record.json. Run: node scripts/career/reprepare-card-demo.cjs */
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const Engine = require(path.join(root, "packages/domain/173-career-reprepare-card.js"));
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));

const USER = "b2625909-d67f-41b2-8270-983d212c6052"; // the TEST user
const JOB = "lever:palantir:forward-deployed-software-engineer-intern";
let clock = Date.UTC(2026, 9, 21, 19, 0, 0);

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
const POSTING = {
  id: "JOB-RP-A", job_id: "JOB-RP-A", canonicalKey: JOB,
  company: "Palantir", title: "Forward Deployed Software Engineer, Internship", role: "Forward Deployed Software Engineer, Internship",
  url: "https://jobs.lever.co/palantir/2ad0ab10-34c3-410d-883b-8052864a95cd",
  status: "open", atsFamily: "lever", location: "New York, NY",
  jd_text: "Intern role. JavaScript, data, testing, agile team.",
};
const START_FIELD = { field_id: "start_date", label: "Earliest start date", kind: "screening", question_key: "start_date", required: true };

const store = Engine.createQuestionsStore();
let formFields = [];
const engine = Engine.createReprepareEngine({
  store, userId: USER, now: () => clock,
  postings: { [JOB]: POSTING },
  baseProfile: TEST_PROFILE, profileMaster: MASTER,
  basisAnswers: BASIS_ANSWERS, standingStops: STANDING_STOPS,
  boardFor: (p) => {
    const base = Portal.createSandboxBoard({ accountName: TEST_PROFILE.name });
    const board = Object.assign({}, base, { atsFamily: p.atsFamily });
    if (formFields.length) board.form = () => { const f = base.form(); f.fields = f.fields.concat(formFields); return f; };
    return board;
  },
  attestations: { certify_true: { value: true, explicit: true } },
  familyText: "software engineering intern",
  log: { records: [] },
});

const record = { scenario: "supersession", user: USER, job: JOB, steps: [] };
const init = engine.initialPrepare(JOB);
record.steps.push({ step: "initial_prepare", ok: init.ok, cardId: init.card.cardId, payloadSha256: init.card.payloadSha256, cardSha256: init.card.cardSha256 });

formFields = [START_FIELD]; // the form now carries the required field
const q = store.cloudAsk({ user_id: USER, key: "start_date", label: "Earliest start date", type: "date", options: [], company: "Palantir", job_ids: [JOB], now: clock });
record.steps.push({ step: "cloud_ask", questionId: q.id, key: q.key, state: q.state });
record.steps.push({ step: "tick_while_open", actions: engine.tick() });
clock += 60_000;
const ans = store.career_apply_question_answer_as(USER, q.id, "June 1, 2027", { now: clock, verbatim: "June 1, 2027" });
record.steps.push({ step: "answer_as", ok: ans.ok, provenance: ans.row.answer.provenance });
const tick2 = engine.tick();
record.steps.push({ step: "tick_after_answer", actions: tick2 });
record.steps.push({ step: "tick_duplicate", actions: engine.tick() });

const cards = Object.values(engine.cards).filter((c) => c.jobId === JOB);
const v1 = cards.find((c) => c.state === "superseded");
const v2 = cards.find((c) => c.state === "current");
record.validation = {
  oldHash: engine.validateApproval(JOB, v1.cardSha256),
  newHash: engine.validateApproval(JOB, v2.cardSha256),
};
record.jobLedger = engine.jobState(JOB);

const outDir = path.join(root, "docs/career/reprepare-card-2026-10-21");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "card-v1.txt"), v1.text + "\n");
fs.writeFileSync(path.join(outDir, "card-v2.txt"), v2.text + "\n");
fs.writeFileSync(path.join(outDir, "run-record.json"), JSON.stringify(record, null, 2) + "\n");
console.log(`wrote card-v1.txt (payload ${v1.payloadSha256.slice(0, 12)}…), card-v2.txt (payload ${v2.payloadSha256.slice(0, 12)}…), run-record.json`);
console.log(`validateApproval(v1) -> ${record.validation.oldHash.code}; validateApproval(v2) -> ok=${record.validation.newHash.ok}`);
