// FDSE-QUESTION-KIND (2026-10-21) — guards from the live FDSE stops
// (root-cause note: docs/apply/ROOT-CAUSE-FDSE-UNCOVERED-QUESTIONS-2026-10-21.md;
// ledger MUSE-F-026 proposed).
//
// THE DEFECT: module 150's classifier had no category for a board
// question that matches no canonical rule — a native select, a
// radio/checkbox group, or a plain text input fell to kind "unknown",
// and module 149's fill loop turns "unknown" into an ask with reason
// unknown_field_category. The def carries no question_key, so NO stored
// answer can ever bind to it (the input writer keys stored answers by
// question_key; 172 records stated answers by the same keys). On the
// live FDSE form, 4 of 16 required fields sat in that class (spoken-
// language skills checkbox group, how-did-you-hear select, summer-2026
// select, AI-notetaker consent radio group) and the batch stopped
// UNCOVERED_QUESTION in every window, clean or not.
//
// THE RULE THESE GUARDS PIN: a question control that matches no
// canonical rule classifies as kind "question" with question_key =
// slug(label) truncated to 40 (the keying free_text already uses);
// 149 fills it from a confirmed stored answer under that key (the
// screening contract) and otherwise asks no_confirmed_fact /
// answer_unconfirmed. Canonical classifications never move; file
// inputs and single checkboxes keep their existing verdicts.
//
// Check: node --test tests/career-question-kind.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const BrowserBoard = require(path.join(root, "packages/domain/150-career-portal-browser.js"));

// The documented key rule, reimplemented independently: slug =
// lowercase, non-alphanumeric runs to "_", trim "_", cap 48; the
// question key is that slug truncated to 40 (free_text's keying).
const slug40 = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48).slice(0, 40);

// ---------- raw-field fixtures (the helper's discovery shape) ----------
let dom = 0;
const raw = (over) => Object.assign({
  domIndex: dom++, selector: null, tag: "input", inputType: "text", name: "", id: "",
  label: "", groupLabel: "", cls: "", required: false, disabled: false, readOnly: false,
}, over);

const LANGUAGE_GROUP = "Language Skill(s) (Check all that apply)";
const HEARD_GROUP = "Please tell us how you heard about this internship opportunity.";
const SUMMER_GROUP = "Where are you spending summer 2026?";
const NOTETAKER_GROUP = "As part of our interview process, we may use AI notetakers to transcribe conversations for accuracy and efficiency. Please see our candidate privacy policy for more information on how we process your data. Your decision to opt in or out of this tooling will not impact your candidacy.";
const ESSAY_GROUP = "We have two Software Engineer roles at Palantir for New Grads. Please confirm that you are interested in the Forward Deployed Software Engineer Role as opposed to Software Engineer.";

function fdseRawFields() {
  dom = 0;
  return [
    raw({ inputType: "text", name: "name", label: "Full name", required: true }),
    raw({ inputType: "checkbox", name: "language_skills", label: "English (ENG)", groupLabel: LANGUAGE_GROUP + " ✱", required: true }),
    raw({ inputType: "checkbox", name: "language_skills", label: "Spanish (SPA)", groupLabel: LANGUAGE_GROUP + " ✱", required: true }),
    raw({ inputType: "checkbox", name: "language_skills", label: "Hindi (HIN)", groupLabel: LANGUAGE_GROUP + " ✱", required: true }),
    raw({ tag: "select", inputType: "select", name: "source", label: "", groupLabel: HEARD_GROUP + " ✱", required: true,
      options: [{ value: "", label: "Please select one..." }, { value: "u", label: "University Job Board" }, { value: "l", label: "LinkedIn" }] }),
    raw({ tag: "select", inputType: "select", name: "summer", label: "", groupLabel: SUMMER_GROUP + " ✱", required: true,
      options: [{ value: "", label: "Select..." }, { value: "o", label: "Other" }] }),
    raw({ inputType: "radio", name: "notetaker", label: "Yes, I consent", groupLabel: NOTETAKER_GROUP + " ✱", required: true }),
    raw({ inputType: "radio", name: "notetaker", label: "No, I do not consent", groupLabel: NOTETAKER_GROUP + " ✱", required: true }),
    raw({ inputType: "radio", name: "auth", label: "Yes", groupLabel: "Are you legally authorized to work in the country for which you are applying? ✱", required: true }),
    raw({ inputType: "radio", name: "auth", label: "No", groupLabel: "Are you legally authorized to work in the country for which you are applying? ✱", required: true }),
    raw({ tag: "textarea", inputType: "textarea", name: "essay", label: "", groupLabel: ESSAY_GROUP + " ✱", required: true }),
    raw({ inputType: "file", name: "resume", label: "Resume/CV ✱ ATTACH RESUME/CV" }),
    raw({ inputType: "file", name: "cover", label: "Cover Letter" }),
    raw({ inputType: "checkbox", name: "future_roles", label: "Notify me about similar roles" }),
    raw({ inputType: "text", name: "cards_x_field", label: "Type your response" }),
    raw({ inputType: "text", name: "major", label: "What is your major? Please choose the closest response, and the one closest to your current course of study if you are in a joint program." }),
    raw({ inputType: "text", name: "hs", label: "High School Name", required: true }),
  ];
}

test("classify: unmapped question controls become kind 'question' keyed by label slug", () => {
  const { defs, bindings } = BrowserBoard.classifyFields(fdseRawFields());
  const byLabel = (l) => defs.find((d) => d.label === l);
  const lang = byLabel(LANGUAGE_GROUP);
  assert.ok(lang, "language group def exists");
  assert.equal(lang.kind, "question");
  assert.equal(lang.question_key, "language_skill_s_check_all_that_apply");
  assert.equal(lang.required, true);
  assert.equal(bindings[lang.field_id].inputType, "checkbox_group");
  assert.deepEqual(bindings[lang.field_id].options.map((o) => o.label), ["English (ENG)", "Spanish (SPA)", "Hindi (HIN)"]);

  const heard = byLabel(HEARD_GROUP);
  assert.ok(heard, "how-heard def exists");
  assert.equal(heard.kind, "question");
  assert.equal(heard.question_key, slug40(HEARD_GROUP));
  assert.equal(bindings[heard.field_id].inputType, "select");

  const summer = byLabel(SUMMER_GROUP);
  assert.ok(summer, "summer def exists");
  assert.equal(summer.kind, "question");
  assert.equal(summer.question_key, "where_are_you_spending_summer_2026");

  const note = defs.find((d) => d.kind === "question" && (d.label || "").startsWith("As part of our interview process"));
  assert.ok(note, "notetaker group def exists as a question");
  assert.equal(note.question_key, slug40(NOTETAKER_GROUP));
  assert.equal(bindings[note.field_id].inputType, "radio_group");

  const free = byLabel("Type your response");
  assert.ok(free, "unmapped text input def exists");
  assert.equal(free.kind, "question");
  assert.equal(free.question_key, "type_your_response");
});

test("classify: canonical kinds never move (regression set)", () => {
  const { defs } = BrowserBoard.classifyFields(fdseRawFields());
  const byLabel = (l) => defs.find((d) => d.label === l);
  assert.equal(byLabel("Full name").kind, "standard");
  assert.equal(byLabel("Full name").profile_key, "name");
  const auth = defs.find((d) => d.question_key === "work_authorization");
  assert.ok(auth, "work-authorization group still canonical");
  assert.equal(auth.kind, "screening");
  const essay = defs.find((d) => (d.label || "").startsWith("We have two Software Engineer roles"));
  assert.ok(essay, "essay def exists");
  assert.equal(essay.kind, "free_text");
  assert.equal(essay.question_key, slug40(ESSAY_GROUP));
  const resume = defs.find((d) => d.profile_key === "resume");
  assert.ok(resume, "resume file still standard/resume");
  assert.equal(resume.kind, "standard");
  const cover = defs.find((d) => d.label === "Cover Letter");
  assert.ok(cover, "cover-letter file def exists");
  assert.equal(cover.kind, "unknown", "a non-resume file input stays unknown");
  const single = byLabel("Notify me about similar roles");
  assert.ok(single, "single checkbox def exists");
  assert.equal(single.kind, "unknown", "a lone checkbox is not a label-keyed question");
  const major = defs.find((d) => (d.label || "").startsWith("What is your major?"));
  assert.ok(major, "major def exists");
  assert.equal(major.kind, "standard");
  assert.equal(major.profile_key, "education_discipline");
  assert.equal(byLabel("High School Name").profile_key, "education_school");
});

test("classify: the D4 education-block contextual bind still promotes an unbound year field", () => {
  // D4 (BUG-062) refines a bare "Start date year" label by its
  // sibling education context. The question class is the generic
  // fallback for unbound fields; the contextual bind is stronger and
  // must win over it, clearing the question key it replaces.
  dom = 0;
  const block = BrowserBoard.classifyFields([
    raw({ inputType: "text", name: "school", label: "School" }),
    raw({ inputType: "text", name: "sy", label: "Start date year" }),
    raw({ inputType: "text", name: "ey", label: "End date year" }),
  ]).defs;
  assert.equal(block[1].kind, "standard");
  assert.equal(block[1].profile_key, "education_start_date");
  assert.equal(block[1].question_key, undefined);
  assert.equal(block[2].kind, "standard");
  assert.equal(block[2].profile_key, "education_end_date");
  // Without the education context the same label stays a question —
  // an ask under its own key, never the education date (D4/D7).
  dom = 0;
  const bare = BrowserBoard.classifyFields([raw({ inputType: "text", name: "sy", label: "Start date year" })]).defs[0];
  assert.equal(bare.kind, "question");
  assert.notEqual(bare.profile_key, "education_start_date");
});

// ---------- 149 fill behavior over a contract board ----------
const POSTING = {
  canonicalKey: "lever:testco:fdse-intern",
  company: "TestCo", title: "Forward Deployed Software Engineer, Internship - Commercial",
  url: "https://jobs.lever.co/testco/d5486403", status: "open", atsFamily: "lever",
};
const QDEFS = [
  { field_id: "name", label: "Full name", kind: "standard", profile_key: "name", required: true },
  { field_id: "language_skill_s_check_all_that_apply", label: LANGUAGE_GROUP, kind: "question", question_key: "language_skill_s_check_all_that_apply", required: true },
  { field_id: "please_tell_us_how_you_heard", label: HEARD_GROUP, kind: "question", question_key: slug40(HEARD_GROUP), required: true },
  { field_id: "two_roles_essay", label: ESSAY_GROUP, kind: "free_text", question_key: slug40(ESSAY_GROUP), required: true },
];
function fakeBoard(defs) {
  const state = { answers: {} };
  return {
    kind: "sandbox", sandbox: true, atsFamily: "lever", host: "jobs.lever.co",
    state,
    open() { return { ok: true, captcha: null }; },
    form() { return { fields: defs.map((d) => Object.assign({}, d)), captchaAt: null }; },
    fill(fieldId, value) { state.answers[fieldId] = value; return value; },
    answers() { return Object.assign({}, state.answers); },
    atReview() { return { ok: true, captcha: null, atFinalReview: true }; },
  };
}
const BASE_PROFILE = {
  name: "TEST — Alex Testcase", email: "alex@example.test", location: "Chicago, IL",
  resume: { filename: "alex.pdf", sha256: "b".repeat(64) },
  answers: {},
};

test("149: unanswered question fields ask no_confirmed_fact — never unknown_field_category", () => {
  const board = fakeBoard(QDEFS);
  const session = Portal.createPortalSession({ userId: "u-q1", board });
  const res = Portal.runApply(session, { posting: POSTING, profile: BASE_PROFILE, log: { records: [] }, userId: "u-q1", now: Date.now(), attestations: {} });
  assert.equal(res.resultStatus, "awaiting_user");
  const reasons = Object.fromEntries((res.asks || []).map((a) => [a.field_id, a.reason]));
  assert.equal(reasons.language_skill_s_check_all_that_apply, "no_confirmed_fact");
  assert.equal(reasons.please_tell_us_how_you_heard, "no_confirmed_fact");
  assert.equal(reasons.two_roles_essay, "needs_user_draft_confirmation");
  assert.ok(!(res.asks || []).some((a) => a.reason === "unknown_field_category"), "no ask is unanswerable-by-construction");
});

test("149: confirmed stored answers fill question fields and the run reaches the doorstep", () => {
  const profile = Object.assign({}, BASE_PROFILE, {
    answers: {
      language_skill_s_check_all_that_apply: { value: ["English (ENG)"], confirmed: true, provenance: { source: "test_sample" } },
      [slug40(HEARD_GROUP)]: { value: "University Job Board", confirmed: true, provenance: { source: "test_sample" } },
      [slug40(ESSAY_GROUP)]: { value: "TEST SAMPLE — I confirm interest in the Forward Deployed role.", confirmed: true, draft: true },
    },
  });
  const board = fakeBoard(QDEFS);
  const session = Portal.createPortalSession({ userId: "u-q2", board });
  const res = Portal.runApply(session, { posting: POSTING, profile, log: { records: [] }, userId: "u-q2", now: Date.now(), attestations: {} });
  assert.equal(res.resultStatus, "prepared");
  assert.ok(res.doorstep && res.doorstep.payloadSha256, "doorstep payload exists");
  assert.deepEqual(board.state.answers.language_skill_s_check_all_that_apply, ["English (ENG)"]);
  assert.equal(board.state.answers.please_tell_us_how_you_heard, "University Job Board");
  const fillStep = (res.stepLog || []).find((s) => s.action === "fill" && s.field_id === "language_skill_s_check_all_that_apply");
  assert.ok(fillStep, "fill step logged for the question field");
  assert.equal(fillStep.source, "user_confirmed_answer");
  assert.equal(fillStep.question_key, "language_skill_s_check_all_that_apply");
});

test("149: an UNCONFIRMED stored answer never fills a question field", () => {
  const profile = Object.assign({}, BASE_PROFILE, {
    answers: {
      language_skill_s_check_all_that_apply: { value: ["English (ENG)"], confirmed: false },
      [slug40(HEARD_GROUP)]: { value: "University Job Board", confirmed: true },
      [slug40(ESSAY_GROUP)]: { value: "TEST SAMPLE draft.", confirmed: true, draft: true },
    },
  });
  const board = fakeBoard(QDEFS);
  const session = Portal.createPortalSession({ userId: "u-q3", board });
  const res = Portal.runApply(session, { posting: POSTING, profile, log: { records: [] }, userId: "u-q3", now: Date.now(), attestations: {} });
  assert.equal(res.resultStatus, "awaiting_user");
  const ask = (res.asks || []).find((a) => a.field_id === "language_skill_s_check_all_that_apply");
  assert.ok(ask, "language field asks");
  assert.equal(ask.reason, "answer_unconfirmed");
  assert.equal(board.state.answers.language_skill_s_check_all_that_apply, undefined);
});
