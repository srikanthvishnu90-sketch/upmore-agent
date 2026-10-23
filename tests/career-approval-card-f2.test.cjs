// F2 — THE APPROVAL CARD (BUILDER-PLAN-48H item F2, 2026-10-22).
// The review layer over the ported Lane B card stack (175): ONE card
// model, two renderers (web HTML + the channel card text), per-
// application approve / edit / reject, batch approve of the reviewed
// set, unverified answers visually loud, and the commit running
// through the EXISTING approval machinery (155's mint via 175's
// tapApprove) unchanged. 'Submit when complete' is built DISABLED.
//
// Done-bar checks proven here (node tier):
// (a) job, company, match reason and EVERY field answer on the card
//     (both renderers), from all three real input shapes (canonical,
//     trunk v1 message-card entry, trunk v2 cloud item);
// (b) approve / edit / reject per application + batch approve;
//     edit changes the answer that will be sent and re-marks its
//     verification state; the commit set partitions every application
//     exactly once, dropped ones with their reasons;
// (c) unverified / edited / check-flagged answers carry the loud
//     treatment in HTML (alert class + chip) and text (⚠ line);
// (d) web HTML and channel text render the SAME model (same field
//     set), and the channel actions carry the bridge binding shape
//     { action:"approve", version, eventId, runId, cardSha256 };
// (e) is the browser suite: tests/career-approval-card-f2-browser.test.cjs
// Commit path: tapReviewCommit delegates to 175's tapApprove (155's
// own mint) — and refuses by name (COMMIT_SET_INCOMPLETE) whenever
// the reviewed set is not the whole card, because the mint binds the
// exact card payload; a changed set needs a fresh prepared card
// (173's supersession doctrine), never a silent subset approval.
// TEST data only, labeled TEST. Flag OFF; nothing submits.
// Check: node --test tests/career-approval-card-f2.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const UI = require(path.join(root, "packages/domain/175-career-approval-ui.js"));
const Batch = require(path.join(root, "packages/domain/155-career-batch-apply.js"));
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));

const USER = "b2625909-d67f-41b2-8270-983d212c6052"; // the TEST user
const T0 = Date.UTC(2026, 9, 22, 22, 0, 0); // 2026-10-22 17:00 CDT
// Coordinator item 2 (2026-10-23): this fixture once mirrored a
// real staged batch record — a real person's name, a real school,
// a real employer with live posting URLs, the real run id and
// digests. Fixtures now carry WHOLLY SYNTHETIC data only: fictional
// person, school and employer, .invalid URLs, fictional digests.
const STAGED_SHA = "0123456789abcdef".repeat(4);
const SHA = "a".repeat(64);
// Provenance for a verified fixture answer: a confirmation event
// bound to the answer's own fact — the only thing that may ever
// render the VERIFIED chip (provenance-backed since 2026-10-23).
const prov = (id) => ({ source: "owner_confirmed", confirmation_event_id: `evt-synth-${id}`, fact_id: id });

// ---------- the canonical fixture: the staged TEST postings, per-app fields ----------
function stagedApps() {
  return [
    {
      id: "alderpoint|platform engineer internship commercial|chicago",
      jobTitle: "Platform Engineer, Internship - Commercial",
      company: "Alderpoint Labs", location: "Chicago, IL",
      url: "https://jobs.example.invalid/alderpoint-labs/3f8a1c2e-5b7d-4e90-a1c3-6d8f0b2e4a55",
      matchReason: "TEST match record: the profile targets software engineering internships in Chicago; the posting asks for data and JavaScript work the profile states.",
      payloadSha256: null,
      fields: [
        { name: "full_name", label: "Full name", value: "TEST — Rowan Ellery", factId: "F-001", provenance: prov("F-001"), verification: "verified" },
        { name: "email", label: "Email", value: "test-doorstep@upmore.test", factId: "F-002", provenance: prov("F-002"), verification: "verified" },
        { name: "school", label: "School", value: "Northgate University (Halloran College of Business)", factId: "F-005", provenance: prov("F-005"), verification: "verified" },
        { name: "graduation_year", label: "Graduation year", value: "2030", factId: "F-007", provenance: prov("F-007"), verification: "verified" },
        { name: "work_authorized", label: "Work authorized in the US", value: "Yes", factId: "F-008", provenance: prov("F-008"), verification: "verified" },
        { name: "sponsorship", label: "Sponsorship required", value: "No", factId: "F-009", provenance: prov("F-009"), verification: "verified" },
        { name: "eeo", label: "EEO self-identification", value: "Decline to self-identify", verification: "unverified" },
      ],
      blank: ["Cover letter (optional)"],
    },
    {
      id: "alderpoint|software engineer internship|new york",
      jobTitle: "Software Engineer, Internship",
      company: "Alderpoint Labs", location: "New York, NY",
      url: "https://jobs.example.invalid/alderpoint-labs/9c4d7e1a-2f5b-48c0-b6a9-1e3d5f7a9c02",
      matchReason: "TEST match record: software engineering internship matching the profile's stated skills; the location is outside the stated Chicago preference — shown for review.",
      payloadSha256: null,
      fields: [
        { name: "full_name", label: "Full name", value: "TEST — Rowan Ellery", factId: "F-001", provenance: prov("F-001"), verification: "verified" },
        { name: "email", label: "Email", value: "test-doorstep@upmore.test", factId: "F-002", provenance: prov("F-002"), verification: "verified" },
        { name: "years_experience", label: "Years of experience", value: "3", factId: "F-011", provenance: prov("F-011"), verification: "verified" },
        { name: "relocation", label: "Willing to relocate to New York", value: "Yes", verification: "unverified" },
        {
          name: "start_date", label: "Available start date", value: "May 2027", verification: "unverified",
          issues: ["Prepared from the school calendar, not stated by the owner — check before approving."],
        },
      ],
      blank: [],
    },
  ];
}
function stagedCard() {
  const built = UI.buildReviewCard({
    runId: "batch-f2fixture0001", cardSha256: STAGED_SHA, eventId: "evt-f2-staged",
    title: "Apply to 2 software engineering intern roles?",
    world: "TEST profile — staged batch (executor stored record, flag OFF)",
    applications: stagedApps(),
  });
  assert.equal(built.ok, true, JSON.stringify(built));
  return built.card;
}
const allFields = (card) => card.applications.flatMap((a) => a.fields.map((f) => ({ app: a, field: f })));

// ---------- (a) completeness: every field answer, both renderers ----------
test("(a) the card shows job, company, match reason and EVERY field answer — nothing behind a summary", () => {
  const card = stagedCard();
  const text = UI.renderReviewText(card);
  const html = UI.renderReviewHtml(card);
  for (const out of [text, html]) {
    assert.match(out, /Platform Engineer, Internship - Commercial/);
    assert.match(out, /Software Engineer, Internship/);
    assert.match(out, /Alderpoint Labs/);
    assert.match(out, /Chicago, IL/);
    assert.match(out, /New York, NY/);
    assert.match(out, /software engineering internships in Chicago/);
    assert.match(out, /outside the stated Chicago preference/);
    assert.match(out, /0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef/);
    for (const { field } of allFields(card)) {
      assert.ok(out.includes(field.label), `label on card: ${field.label}`);
      assert.ok(out.includes(String(field.value)), `value on card: ${field.label}=${field.value}`);
    }
    assert.match(out, /Cover letter \(optional\)/, "blank fields are named, not dropped");
  }
  // coverage is reported as covered/total, never reduced (plan rule 1)
  const cov = UI.reviewCoverage(card);
  assert.deepEqual(
    { v: cov.fieldsVerified, t: cov.fieldsTotal, u: cov.fieldsUnverified, e: cov.fieldsEdited },
    { v: 9, t: 12, u: 3, e: 0 },
  );
  assert.deepEqual(
    { r: cov.applicationsReviewed, n: cov.applicationsTotal },
    { r: 0, n: 2 },
  );
  assert.match(text, /Answers verified: 9\/12/);
  assert.match(html, /Answers verified: 9\/12/);
});

test("(a) a missing match reason is shown as missing — never invented", () => {
  const apps = stagedApps();
  delete apps[0].matchReason;
  const built = UI.buildReviewCard({ runId: "batch-x", cardSha256: SHA, applications: apps });
  assert.equal(built.ok, true);
  assert.equal(built.card.applications[0].matchReason, null);
  assert.match(UI.renderReviewText(built.card), /Match: not recorded/);
  assert.match(UI.renderReviewHtml(built.card), /Match reason: not recorded/);
});

test("(a) the trunk payload shapes normalize: v1 entry (ledger = verification) and v2 cloud item (confirmation event = verification)", () => {
  const entry = {
    version: 1, kind: "agent-batch", jobId: "synthetic-job", company: "Invented Workshop",
    url: "https://example.test/jobs/synthetic",
    answers: [
      { name: "motivation", label: "Why this role?", value: "I enjoy careful work.", shown: "I enjoy careful work.", kind: "text", factId: "F-001", file: null },
      { name: "nickname", label: "Nickname", value: "V", shown: "V", kind: "text", factId: "F-002", file: null },
    ],
    blank: ["Optional website"],
    ledger: [
      { application_id: "synthetic-job", field_id: "motivation", question_hash: SHA, answer_hash: SHA, fact_refs: ["F-001"], source_refs: ["own synthetic statement"], confirmation_event_id: "synthetic-confirmation-1", derivation_rule: "verbatim" },
    ],
    question_set_hash: SHA, manifest_hash: SHA, quarantine_version: "d007-v1",
  };
  const v2item = {
    payload: {
      version: 1, user_id: USER, job_id: "synthetic-job-2", company: "Invented Cloud Co",
      url: "https://example.test/jobs/2", destination: "https://example.test/jobs/2",
      fields: [
        { name: "email", label: "Email", value: "a@b.test", factId: "F-010", confirmation_event_id: "ev-9" },
        { name: "phone", label: "Phone", value: "+1 555 0100", factId: "F-011" },
      ],
      resume_sha256: SHA, page_field_names: ["email", "phone"], engine_approval: SHA,
      privacy_epoch: 1, account_version: 1, expires_at: "2026-10-23T22:00:00.000Z",
    },
    readback: {
      answers: [
        { name: "email", label: "Email", value: "a@b.test", shown: "a@b.test", factId: "F-010" },
        { name: "phone", label: "Phone", value: "+1 555 0100", shown: "+1 555 0100", factId: "F-011" },
      ],
      resume_name: "Synthetic Resume.pdf", resume_sha256: SHA, destination: "https://example.test/jobs/2",
      blank: [], employer_fields: ["email", "phone"],
    },
    hash: SHA,
  };
  const built = UI.buildReviewCard({
    runId: "batch-shapes", cardSha256: SHA,
    applications: [
      { entry, hash: SHA },
      { item: v2item },
    ],
    appMeta: {
      "synthetic-job": { jobTitle: "Synthetic Role", matchReason: "TEST match record for the v1 shape." },
      "synthetic-job-2": { jobTitle: "Synthetic Cloud Role", matchReason: "TEST match record for the v2 shape." },
    },
  });
  assert.equal(built.ok, true, JSON.stringify(built));
  const [a1, a2] = built.card.applications;
  assert.equal(a1.fields.find((f) => f.name === "motivation").verification, "verified", "ledger row + confirmation event + matching factId");
  assert.equal(a1.fields.find((f) => f.name === "nickname").verification, "unverified", "no ledger row — unverified, never assumed");
  assert.deepEqual(a1.blank, ["Optional website"]);
  assert.equal(a2.fields.find((f) => f.name === "email").verification, "verified", "confirmation_event_id on the prepared field");
  assert.equal(a2.fields.find((f) => f.name === "phone").verification, "unverified");
  assert.equal(a2.jobTitle, "Synthetic Cloud Role");
});

// ---------- (b) per-application review actions ----------
test("(b) approve, reject (reason required and recorded), and batch approve per application", () => {
  let card = stagedCard();
  const [a, b] = card.applications.map((x) => x.id);
  // reject without a reason is refused by name — a dropped item always has its reason (plan rule 2)
  const noReason = UI.reviewReject(card, b, "  ");
  assert.equal(noReason.ok, false);
  assert.equal(noReason.code, "REJECT_REASON_REQUIRED");
  let r = UI.reviewApprove(card, a);
  assert.equal(r.ok, true); card = r.card;
  assert.equal(card.applications[0].state, "approved");
  r = UI.reviewReject(card, b, "New York is outside my location preference");
  assert.equal(r.ok, true); card = r.card;
  assert.equal(card.applications[1].state, "rejected");
  assert.equal(card.applications[1].rejectReason, "New York is outside my location preference");
  // a rejected application cannot be approved over its rejection
  assert.equal(UI.reviewApprove(card, b).code, "APP_REJECTED");
  // unknown application refuses by name
  assert.equal(UI.reviewApprove(card, "nope").code, "APP_NOT_ON_CARD");
  // batch approve on a fresh card: every pending application, rejected untouched
  let fresh = stagedCard();
  r = UI.approveAllPending(fresh);
  assert.equal(r.ok, true); fresh = r.card;
  assert.deepEqual(fresh.applications.map((x) => x.state), ["approved", "approved"]);
  assert.equal(UI.reviewCoverage(fresh).applicationsReviewed, 2);
});

test("(b) edit changes the answer that will be sent and re-marks its verification honestly", () => {
  let card = stagedCard();
  const [a] = card.applications.map((x) => x.id);
  card = UI.reviewApprove(card, a).card;
  assert.equal(card.applications[0].state, "approved");
  const r = UI.editReviewField(card, a, "graduation_year", "2031", { now: T0 });
  assert.equal(r.ok, true, JSON.stringify(r));
  card = r.card;
  const f = card.applications[0].fields.find((x) => x.name === "graduation_year");
  assert.equal(f.value, "2031", "the edited value is the value the commit set will send");
  assert.equal(f.shown, "2031");
  assert.equal(f.verification, "edited");
  assert.equal(f.originalValue, "2030", "the original is kept on the record");
  assert.equal(card.applications[0].state, "pending", "approval was of the old answers — the application returns to review");
  assert.equal(card.applications[0].edited, true);
  const cov = UI.reviewCoverage(card);
  assert.equal(cov.fieldsVerified, 8, "an edited answer no longer counts as verified");
  assert.equal(cov.fieldsEdited, 1);
  // the commit set sends the EDITED value
  const set = UI.reviewCommitSet(card);
  const held = set.heldBack.find((x) => x.id === a);
  assert.ok(held && /edited/.test(held.reason), "the edited application is held back with its reason");
  // unknown field refuses by name
  assert.equal(UI.editReviewField(card, a, "nope", "x").code, "FIELD_NOT_ON_CARD");
});

test("(b) the commit set partitions every application exactly once, each with its reason", () => {
  let card = stagedCard();
  const [a, b] = card.applications.map((x) => x.id);
  card = UI.reviewApprove(card, a).card;
  card = UI.reviewReject(card, b, "Not relocating").card;
  const set = UI.reviewCommitSet(card);
  assert.deepEqual(set.approved.map((x) => x.id), [a]);
  assert.deepEqual(set.dropped, [{ id: b, reason: "Not relocating" }]);
  assert.deepEqual(set.heldBack, []);
  const every = [...set.approved.map((x) => x.id), ...set.dropped.map((x) => x.id), ...set.heldBack.map((x) => x.id)];
  assert.deepEqual(every.slice().sort(), [a, b].sort(), "no application disappears, none appears twice");
  // the approved application's exact fields ride along — these are what will be sent
  const sent = Object.fromEntries(set.approved[0].fields.map((f) => [f.name, f.value]));
  assert.equal(sent.school, "Northgate University (Halloran College of Business)");
  assert.deepEqual(set.binding, { runId: "batch-f2fixture0001", cardSha256: STAGED_SHA });
  // a still-pending application is held back with its reason
  const set2 = UI.reviewCommitSet(stagedCard());
  assert.equal(set2.heldBack.length, 2);
  assert.ok(set2.heldBack.every((x) => /not yet reviewed/.test(x.reason)));
});

// ---------- (b) the commit runs the existing mint, unchanged ----------
const TEST_PROFILE = {
  name: "TEST — Rowan Ellery", email: "test-doorstep@upmore.test", phone: "+1 555 0100",
  location: "Chicago, IL",
  resume: { filename: "Rowan_Ellery_Resume.docx", sha256: "fedcba9876543210".repeat(4) },
  answers: {
    work_authorization: { value: "Yes", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
  },
};
const MASTER = {
  basics: { name: "TEST — Rowan Ellery", email: "test-doorstep@upmore.test" },
  facts: [
    { id: "TP-001", kind: "education", text: "Northgate University Halloran, CS + Finance, 2026–2030", confirmed: true, status: "confirmed" },
  ],
};
const FDSE_POSTING = {
  id: "JOB-F2-A", job_id: "JOB-F2-A", canonicalKey: "lever:alderpoint:platform-intern",
  company: "Alderpoint Labs", title: "Platform Engineer, Internship - Commercial",
  role: "Platform Engineer, Internship - Commercial",
  // This URL is an ENGINE input, not display data: 149's
  // classifyTarget gates on the host class (§6.3) — a .invalid host
  // is UNTESTED_ATS_HOST and the run completes without ever
  // stopping for approval, which is not the behavior under test.
  // A .test host is the engine's registered sandbox class and is
  // exactly as synthetic (RFC 2606) as .invalid.
  url: "https://jobs.example.test/alderpoint-labs/2ad0ab10-34c3-410d-883b-8052864a95cd",
  status: "open", atsFamily: "lever", location: "Chicago, IL",
  jd_text: "Intern role. JavaScript, data, testing, agile team.",
};
function liveRun() {
  const run = Batch.createRun({ userId: USER, familyText: "software engineering intern roles", count: 1, now: T0 });
  Batch.prepareRun(run, {
    postings: [FDSE_POSTING], profile: TEST_PROFILE, profileMaster: MASTER,
    boardFor: (posting) => Object.assign({}, Portal.createSandboxBoard({ accountName: TEST_PROFILE.name }), { atsFamily: posting.atsFamily }),
    attestations: { certify_true: { value: true, explicit: true } }, log: { records: [] }, now: T0,
  });
  assert.equal(run.status, "awaiting_approval");
  return run;
}
function liveCard(run) {
  const built = UI.buildReviewCard({
    runId: run.id, cardSha256: run.cardSha256, title: "Apply to 1 role?",
    applications: [{
      id: FDSE_POSTING.canonicalKey, jobTitle: FDSE_POSTING.role, company: "Alderpoint Labs", location: "Chicago, IL",
      url: FDSE_POSTING.url, matchReason: "TEST match record for the live-mint leg.",
      fields: [{ name: "full_name", label: "Full name", value: "TEST — Rowan Ellery", factId: "F-001", provenance: prov("F-001"), verification: "verified" }],
      blank: [],
    }],
  });
  assert.equal(built.ok, true, JSON.stringify(built));
  return built.card;
}
test("(b) commit of the fully reviewed card runs 155's own mint via the existing tap — nothing reimplemented", () => {
  const run = liveRun();
  let card = liveCard(run);
  card = UI.reviewApprove(card, FDSE_POSTING.canonicalKey).card;
  const res = UI.tapReviewCommit(card, run, { liveRun: run, userId: USER, now: T0 + 1000 });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(run.status, "approved", "155's mint ran on the run itself");
  assert.equal(res.record.approvalRef, `batch:${run.id}:${run.cardSha256}`);
  assert.deepEqual(res.record.attestationsSupplied, ["certify_true"]);
});

test("(b) a changed reviewed set never reaches the mint: incomplete commits refuse by name, run untouched", () => {
  const run = liveRun();
  let card = liveCard(run);
  card = UI.reviewReject(card, FDSE_POSTING.canonicalKey, "Not this round").card;
  const res = UI.tapReviewCommit(card, run, { liveRun: run, userId: USER, now: T0 + 1000 });
  assert.equal(res.ok, false);
  assert.equal(res.code, "COMMIT_SET_INCOMPLETE");
  assert.equal(res.partition.dropped[0].reason, "Not this round");
  assert.equal(run.status, "awaiting_approval", "the mint never ran — a subset is never silently approved");
  assert.equal(run.approvalRef, null);
  // edited set: same refusal, held-back reason names the fresh-card rule
  const run2 = liveRun();
  let card2 = liveCard(run2);
  card2 = UI.editReviewField(card2, FDSE_POSTING.canonicalKey, "full_name", "TEST — R. Ellery", { now: T0 }).card;
  card2 = UI.reviewApprove(card2, FDSE_POSTING.canonicalKey).card;
  const res2 = UI.tapReviewCommit(card2, run2, { liveRun: run2, userId: USER, now: T0 + 1000 });
  assert.equal(res2.ok, false);
  assert.equal(res2.code, "COMMIT_SET_INCOMPLETE");
  assert.match(res2.partition.heldBack[0].reason, /fresh prepared card/);
  assert.equal(run2.status, "awaiting_approval");
});

// ---------- (c) loud treatment ----------
test("(c) unverified, edited and check-flagged answers are loud in HTML and text; verified answers are not", () => {
  let card = stagedCard();
  const html = UI.renderReviewHtml(card);
  const text = UI.renderReviewText(card);
  // unverified EEO + relocation: alert class, chip, ⚠ line
  assert.match(html, /f2-field--alert[^>]*data-field="eeo"|data-field="eeo"[^>]*f2-field--alert/);
  assert.match(html, /f2-chip--alert">⚠ UNVERIFIED<\/span>/);
  assert.match(text, /⚠ UNVERIFIED — EEO self-identification: Decline to self-identify/);
  assert.match(text, /⚠ UNVERIFIED — Willing to relocate to New York: Yes/);
  // the check-flagged start date carries its issue verbatim, loudly
  assert.match(html, /f2-issue">Prepared from the school calendar, not stated by the owner/);
  assert.match(text, /⚠ CHECK — Available start date: May 2027 — Prepared from the school calendar/);
  // a verified answer renders plainly: its line has no ⚠ and its row no alert class
  const schoolLine = text.split("\n").find((l) => l.includes("School: Northgate"));
  assert.ok(schoolLine && !schoolLine.includes("⚠"));
  // an edited answer is loud too, with the original kept visible
  card = UI.editReviewField(card, card.applications[0].id, "graduation_year", "2031", { now: T0 }).card;
  const html2 = UI.renderReviewHtml(card);
  assert.match(html2, /f2-chip--alert">⚠ EDITED<\/span>/);
  assert.match(html2, /Was: 2030/);
  assert.match(UI.renderReviewText(card), /⚠ EDITED \(UNVERIFIED\) — Graduation year: 2031 \(was: 2030\)/);
});

// ---------- (d) one model, two renderers + the channel binding ----------
test("(d) web and channel render the same model; channel actions carry the bridge binding", () => {
  const card = stagedCard();
  const text = UI.renderReviewText(card);
  const html = UI.renderReviewHtml(card);
  for (const { field } of allFields(card)) {
    assert.ok(text.includes(String(field.value)) && html.includes(String(field.value)), `both renderers carry ${field.name}`);
  }
  assert.deepEqual(UI.reviewChannelActions(card), [
    { action: "approve", version: 1, eventId: "evt-f2-staged", runId: "batch-f2fixture0001", cardSha256: STAGED_SHA },
  ]);
  // the channel footer speaks the bridge's reply forms (WO-022 card format)
  assert.match(text, /Reply "yes" to approve the reviewed set exactly as shown, "yes but not N" to leave one out, or "no"/);
});

// ---------- 'Submit when complete': built disabled ----------
test("submit-when-complete is present, visibly OFF, and wired to nothing", () => {
  const card = stagedCard();
  assert.deepEqual(card.submitWhenComplete.enabled, false);
  const html = UI.renderReviewHtml(card);
  assert.match(html, /Submit when complete/);
  assert.match(html, /data-f2-action="submit-when-complete"[^>]*disabled|disabled[^>]*data-f2-action="submit-when-complete"/);
  assert.match(UI.renderReviewText(card), /\[ \] Submit when complete — OFF \(disabled\)/);
  // the model exposes no submit operation at all
  assert.equal(typeof UI.submitReviewCard, "undefined");
  assert.equal(typeof UI.submitWhenComplete, "undefined");
});

// ---------- (f) the commit outcome surface (coordinator item 1, 2026-10-23) ----------
test("(f) recording renders per-application outcomes: recorded vs held back with its reason, both renderers", () => {
  let card = stagedCard();
  const [a, b] = card.applications.map((x) => x.id);
  card = UI.editReviewField(card, b, "relocation", "No", { now: T0 }).card;
  card = UI.approveAllPending(card).card;
  const set = UI.reviewCommitSet(card);
  assert.deepEqual(set.heldBack.map((x) => x.id), [b], "the partition itself was always honest");
  assert.equal(typeof UI.recordCommitOutcome, "function", "the model carries the recording outcome");
  const out = UI.recordCommitOutcome(card, set).card;
  assert.equal(out.applications.find((x) => x.id === a).outcome.status, "recorded");
  assert.deepEqual(out.applications.find((x) => x.id === b).outcome, {
    status: "held_back", reason: "edited answers need a fresh prepared card before this application can be approved for sending",
  });
  const text = UI.renderReviewText(out);
  const html = UI.renderReviewHtml(out);
  assert.match(text, /Review: approved — approval recorded/);
  assert.match(text, /Review: held back — NOT recorded: edited answers need a fresh prepared card/);
  assert.match(html, /data-outcome="held_back"/);
  assert.match(html, /Held back — NOT recorded: edited answers need a fresh prepared card/);
  assert.match(html, /data-outcome="recorded"/);
  // an outcome describes the set as it stood at recording time: any
  // further review action clears it rather than leaving a stale claim
  const touched = UI.editReviewField(out, a, "full_name", "TEST — R. Ellery", { now: T0 }).card;
  assert.ok(touched.applications.every((x) => x.outcome == null), "a later edit clears every recorded outcome");
});

// ---------- (g) VERIFIED is provenance-backed (coordinator item 2, 2026-10-23) ----------
test("(g) an answer with absent or unverifiable provenance cannot render VERIFIED — even a true value, even claiming verified", () => {
  const mk = (field) => {
    const built = UI.buildReviewCard({
      runId: "r-prov", cardSha256: SHA,
      applications: [{ id: "app-prov", company: "Provenance Fixture Co", jobTitle: "Provenance Role", fields: [field], blank: [] }],
    });
    assert.equal(built.ok, true, JSON.stringify(built));
    return built.card;
  };
  // claimed verified, NO provenance at all: the claim is not evidence
  const claimed = mk({ name: "graduation_year", label: "Graduation year", value: "2030", verification: "verified" });
  assert.equal(claimed.applications[0].fields[0].verification, "unverified", "no provenance => unverified, however the value reads");
  assert.match(UI.renderReviewHtml(claimed), /⚠ UNVERIFIED/);
  assert.match(UI.renderReviewText(claimed), /⚠ UNVERIFIED — Graduation year: 2030/);
  // provenance bound to a DIFFERENT fact than the answer's own
  const mismatched = mk({
    name: "graduation_year", label: "Graduation year", value: "2030", factId: "F-100",
    provenance: { source: "owner_confirmed", confirmation_event_id: "evt-x", fact_id: "F-999" },
  });
  assert.equal(mismatched.applications[0].fields[0].verification, "unverified", "an event for another fact verifies nothing here");
  // provenance with NO confirmation event: an assumption is not evidence
  const assumed = mk({
    name: "graduation_year", label: "Graduation year", value: "2030", factId: "F-100",
    provenance: { source: "assumption", fact_id: "F-100" },
  });
  assert.equal(assumed.applications[0].fields[0].verification, "unverified", "assumption-sourced facts never render verified");
  // verifiable provenance: a confirmation event bound to the answer's own fact
  const backed = mk({
    name: "graduation_year", label: "Graduation year", value: "2030", factId: "F-100",
    provenance: { source: "owner_confirmed", confirmation_event_id: "evt-100", fact_id: "F-100" },
  });
  assert.equal(backed.applications[0].fields[0].verification, "verified");
  assert.equal(backed.applications[0].fields[0].provenance.confirmationEventId, "evt-100", "the provenance rides the record, normalized");
  assert.equal(backed.applications[0].fields[0].provenance.factRef, "F-100");
});

// ---------- model hygiene ----------
test("the model refuses unbindable or empty cards by name and never mutates its input", () => {
  assert.equal(UI.buildReviewCard({ applications: stagedApps() }).code, "NO_BINDING");
  assert.equal(UI.buildReviewCard({ runId: "r", cardSha256: SHA, applications: [] }).code, "NO_APPLICATIONS");
  const apps = stagedApps();
  const snapshot = JSON.stringify(apps);
  const built = UI.buildReviewCard({ runId: "r", cardSha256: SHA, applications: apps });
  assert.equal(built.ok, true);
  UI.reviewApprove(built.card, apps[0].id);
  assert.equal(JSON.stringify(apps), snapshot, "inputs are never mutated");
  assert.equal(built.card.applications[0].state, "pending", "ops return new cards; the built card is unchanged");
});
