// F-029 (2026-10-22) — guards from the live Gusto stop
// (batch-2891c869c36a, TEST profile, prepare-only, flag OFF): the
// Greenhouse Finance Intern (Summer 2027) form stopped
// UNCOVERED_QUESTION with 10 asks. Classification note:
// docs/apply/CLASSIFICATION-GUSTO-F029-2026-10-22.md.
//
// THE DEFECT (distinct from F-026): not a classification defect —
// every control on this form already classifies and keys correctly
// (module 150, live scan 2026-10-22: 28 defs). The gap is ANSWER
// COVERAGE. Of the 10 asks:
//   - four are class (b) non-fact sample material (a how-heard
//     multi-select; three free_text drafts) that had no stored
//     TEST-sample answer on the TEST master;
//   - five are class (c) fact-shaped questions with no confirmed
//     fact (ZIP code, relocate-to-New-York, full-cohort availability,
//     the acknowledge-and-agree act, first-generation identity) —
//     they stay UNANSWERED by design; only the person's own answers
//     (module 172) can ever fill them;
//   - one (cover_letter) is a document-attach control, optional on
//     this form; its ask never blocks a doorstep.
//
// THE RULE THESE GUARDS PIN: with the four class-(b) TEST-sample
// answers stored on the profile (confirmed, test_invented), 149's
// EXISTING question / free_text branches fill them under their label
// keys and the ask set shrinks to exactly the class-(c) five plus the
// optional cover_letter; an UNCONFIRMED sample never fills; and once
// the person's own confirmed answers exist for the five, the same
// form reaches the doorstep. Red state = test 1 (the witnessed ten);
// the fix is the recorded TEST-master answers, proven live by the
// re-drive (the ask set on the real board shrinks the same way).
//
// Check: node --test tests/career-f029-gusto-coverage.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));

const USER = "user-f029-gusto";
const NOW = Date.UTC(2026, 9, 22, 5, 0, 0);
const POSTING = {
  canonicalKey: "gusto|finance intern summer 2027|new york",
  company: "gusto", title: "Finance Intern (Summer 2027)",
  url: "https://job-boards.greenhouse.io/gusto/jobs/8257115", status: "open", atsFamily: "greenhouse",
  location: "New York, NY - Hybrid",
  jd_text: "Finance intern on the Finance, BizOps & Strategy team. Financial reports, cost analysis, Excel.",
};

// The live form's defs, verbatim from the scan-only inventory of
// 2026-10-22 (board service, module 150 classification; labels and
// keys as the service produced them).
const GUSTO_DEFS = [
  { field_id: "full_name", kind: "standard", required: true, label: "Full name", profile_key: "name" },
  { field_id: "preferred_name", kind: "standard", required: false, label: "Preferred First Name", profile_key: "preferred_name" },
  { field_id: "email", kind: "standard", required: true, label: "Email", profile_key: "email" },
  { field_id: "country", kind: "standard", required: true, label: "Country", profile_key: "country" },
  { field_id: "phone", kind: "standard", required: true, label: "Phone", profile_key: "phone" },
  { field_id: "candidate_location", kind: "standard", required: true, label: "Location (City)", profile_key: "location" },
  { field_id: "resume", kind: "standard", required: false, label: "Attach", profile_key: "resume" },
  { field_id: "cover_letter", kind: "unknown", required: false, label: "Attach" },
  { field_id: "question_69649385", kind: "question", required: true, label: "Zip Code / Postal Code (Non-U.S. based candidates, please enter \"00000\")", question_key: "zip_code_postal_code_non_u_s_based_candi" },
  { field_id: "question_69649386", kind: "standard", required: false, label: "LinkedIn Profile", profile_key: "linkedin" },
  { field_id: "how_did_you_hear_about_this_opportunity_select_a", kind: "question", required: true, label: "How did you hear about this opportunity? (select all that apply)", question_key: "how_did_you_hear_about_this_opportunity_" },
  { field_id: "question_69649388", kind: "screening", required: true, label: "Are you legally authorized to work in the country where you are applying?", question_key: "work_authorization" },
  { field_id: "question_69649389", kind: "screening", required: true, label: "Will you now or in the future require visa sponsorship for employment?", question_key: "sponsorship" },
  { field_id: "question_69649390", kind: "standard", required: true, label: "Have you ever, or are you currently working at Gusto or Symmetry in any capacity (ie: employee or contingent worker)?", profile_key: "location" },
  { field_id: "question_69847997", kind: "free_text", required: true, label: "Tell us a little bit about yourself and why you think you would be a good fit at Gusto.", question_key: "tell_us_a_little_bit_about_yourself_and_" },
  { field_id: "question_69847998", kind: "standard", required: true, label: "When do you graduate?", profile_key: "education_graduation_year" },
  { field_id: "question_69847999", kind: "question", required: true, label: "Are you willing to relocate to New York for the duration of this internship?", question_key: "are_you_willing_to_relocate_to_new_york_" },
  { field_id: "question_69848000", kind: "question", required: true, label: "This internship is from May 17, 2027 to August 6, 2027 (12 weeks). Are you available for the full duration of this cohort?", question_key: "this_internship_is_from_may_17_2027_to_a" },
  { field_id: "question_69848001", kind: "question", required: true, label: "To help make sure everyone has the same experience, we are not able to adjust the internship start or end dates. Are you able to acknowledge and agree to this requirement?", question_key: "to_help_make_sure_everyone_has_the_same_" },
  { field_id: "question_69848002", kind: "free_text", required: true, label: "Do you have any upcoming offer deadlines or recruiting timelines we should be aware of?", question_key: "do_you_have_any_upcoming_offer_deadlines" },
  { field_id: "question_69848003", kind: "free_text", required: true, label: "As Gusto grows, we are always aiming to expand our recruitment presence at conferences, gatherings, or other partnerships. Please let us know of any you're planning to take part in or have taken part in to help inform our team about future recruitment opportunities.", question_key: "as_gusto_grows_we_are_always_aiming_to_e" },
  { field_id: "605", kind: "eeo", required: true, label: "How would you describe your gender identity (please select one)?", question_key: "how_would_you_describe_your_gend" },
  { field_id: "606", kind: "eeo", required: true, label: "I identify as transgender (please select one):", question_key: "i_identify_as_transgender_please" },
  { field_id: "607", kind: "eeo", required: true, label: "I identify my sexual orientation as (please select one):", question_key: "i_identify_my_sexual_orientation" },
  { field_id: "608", kind: "eeo", required: true, label: "I identify my race/ethnicity as (mark all that apply):", question_key: "i_identify_my_race_ethnicity_as_" },
  { field_id: "609", kind: "eeo", required: true, label: "Veteran Status (please select one):", question_key: "veteran_status_please_select_one" },
  { field_id: "610", kind: "eeo", required: true, label: "I have a disability (please select one):", question_key: "i_have_a_disability_please_selec" },
  { field_id: "1012", kind: "question", required: true, label: "I identify as a first-generation professional (please select one):", question_key: "i_identify_as_a_first_generation_profess" },
];

// The TEST master's answers BEFORE the F-029 recording (the witness
// state): the canonical answers + the FDSE TEST samples + cover_note.
const ANSWERS_BEFORE = {
  work_authorization: { value: "Yes", confirmed: true },
  sponsorship: { value: "No", confirmed: true },
  cover_note: { value: "TEST SAMPLE — SYNTHETIC TEXT, NOT A REAL STATEMENT: cover note.", confirmed: true, draft: true, test_invented: true },
  language_skill_s_check_all_that_apply: { value: ["English (ENG)"], confirmed: true, draft: false, test_invented: true },
};

// The four class-(b) answers the F-029 fix records on the TEST
// master (shaped values here; the recorded texts are proven by the
// module-168 audit in the recording script and by the live drive's
// readback — this guard pins the BINDING, not the prose).
const ANSWERS_CLASS_B = {
  how_did_you_hear_about_this_opportunity_: { value: ["LinkedIn"], confirmed: true, draft: false, test_invented: true, provenance: { source: "test_sample" } },
  tell_us_a_little_bit_about_yourself_and_: { value: "TEST SAMPLE — SYNTHETIC TEXT, NOT A REAL STATEMENT. (fit essay draft)", confirmed: true, draft: true, test_invented: true, provenance: { source: "test_sample" } },
  do_you_have_any_upcoming_offer_deadlines: { value: "TEST SAMPLE — SYNTHETIC TEXT, NOT A REAL STATEMENT. (deadlines draft; asserts none)", confirmed: true, draft: true, test_invented: true, provenance: { source: "test_sample" } },
  as_gusto_grows_we_are_always_aiming_to_e: { value: "TEST SAMPLE — SYNTHETIC TEXT, NOT A REAL STATEMENT. (conferences draft; names none)", confirmed: true, draft: true, test_invented: true, provenance: { source: "test_sample" } },
};

// The person's OWN answers to the five class-(c) questions, as module
// 172 would record them after the person replies (confirmed, NOT
// test_invented). Values here are the fixture's, standing in for the
// user's reply — the guard proves the doorstep is reachable once the
// person answers; it does not choose the answers.
const ANSWERS_CLASS_C_BY_USER = {
  zip_code_postal_code_non_u_s_based_candi: { value: "00000", confirmed: true },
  are_you_willing_to_relocate_to_new_york_: { value: "Yes", confirmed: true },
  this_internship_is_from_may_17_2027_to_a: { value: "Yes", confirmed: true },
  to_help_make_sure_everyone_has_the_same_: { value: "Yes", confirmed: true },
  i_identify_as_a_first_generation_profess: { value: "No", confirmed: true },
};

function profileWith(answers) {
  return {
    name: "TEST — Vishnu Srikanth",
    preferred_name: "TEST",
    email: "srikanthvishnu90@gmail.com",
    phone: "+1 2246029341",
    location: "Chicago, IL",
    country: "United States",
    linkedin: "linkedin.com/in/vishnu-srikanth",
    resume: { filename: "Vishnu_Srikanth_Resume.docx", sha256: "fcdfea902c149d7efc72cb184389236a8358c2ee45864fe1b53d2bc229b411ee" },
    education: { graduation_year: "2029" },
    answers: JSON.parse(JSON.stringify(answers)),
  };
}

function gustoBoard() {
  const back = {};
  const fills = [];
  return {
    sandbox: true, kind: "sandbox", atsFamily: "greenhouse", host: "job-boards.greenhouse.io",
    fills,
    open: () => ({}),
    form: () => ({ fields: GUSTO_DEFS.map((f) => Object.assign({}, f)) }),
    fill: (fid, v) => { fills.push({ field_id: fid, value: v }); back[fid] = v; return v; },
    answers: () => Object.assign({}, back),
    atReview: () => ({ atFinalReview: true }),
  };
}

function prepare(profile) {
  const board = gustoBoard();
  const session = Portal.createPortalSession({ userId: USER, board });
  const res = Portal.runApply(session, { posting: POSTING, profile, log: { records: [] }, userId: USER, now: NOW, attestations: {} });
  return { res, board };
}

const askMap = (res) => Object.fromEntries((res.asks || []).map((a) => [a.field_id, a.reason]));

const WITNESSED_TEN = {
  cover_letter: "unknown_field_category",
  question_69649385: "no_confirmed_fact",
  how_did_you_hear_about_this_opportunity_select_a: "no_confirmed_fact",
  question_69847997: "needs_user_draft_confirmation",
  question_69847999: "no_confirmed_fact",
  question_69848000: "no_confirmed_fact",
  question_69848001: "no_confirmed_fact",
  question_69848002: "needs_user_draft_confirmation",
  question_69848003: "needs_user_draft_confirmation",
  "1012": "no_confirmed_fact",
};

test("witness state: the ask set is exactly the F-029 ten, with the witnessed reasons", () => {
  const { res } = prepare(profileWith(ANSWERS_BEFORE));
  assert.equal(res.resultStatus, "awaiting_user");
  assert.deepEqual(askMap(res), WITNESSED_TEN);
});

test("after the class-(b) recording: the four fill from stored TEST answers; asks shrink to the class-(c) five + cover_letter", () => {
  const answers = Object.assign({}, ANSWERS_BEFORE, ANSWERS_CLASS_B);
  const { res, board } = prepare(profileWith(answers));
  assert.equal(res.resultStatus, "awaiting_user");
  assert.deepEqual(askMap(res), {
    cover_letter: "unknown_field_category",
    question_69649385: "no_confirmed_fact",
    question_69847999: "no_confirmed_fact",
    question_69848000: "no_confirmed_fact",
    question_69848001: "no_confirmed_fact",
    "1012": "no_confirmed_fact",
  });
  const filled = Object.fromEntries(board.fills.map((f) => [f.field_id, f.value]));
  assert.deepEqual(filled.how_did_you_hear_about_this_opportunity_select_a, ["LinkedIn"]);
  assert.equal(filled.question_69847997, ANSWERS_CLASS_B.tell_us_a_little_bit_about_yourself_and_.value);
  assert.equal(filled.question_69848002, ANSWERS_CLASS_B.do_you_have_any_upcoming_offer_deadlines.value);
  assert.equal(filled.question_69848003, ANSWERS_CLASS_B.as_gusto_grows_we_are_always_aiming_to_e.value);
});

test("an unconfirmed TEST sample never fills: the how-heard ask stays, as answer_unconfirmed", () => {
  const answers = Object.assign({}, ANSWERS_BEFORE, ANSWERS_CLASS_B, {
    how_did_you_hear_about_this_opportunity_: { value: ["LinkedIn"], confirmed: false, draft: false, test_invented: true, provenance: { source: "test_sample" } },
  });
  const { res, board } = prepare(profileWith(answers));
  assert.equal(askMap(res).how_did_you_hear_about_this_opportunity_select_a, "answer_unconfirmed");
  assert.ok(!board.fills.some((f) => f.field_id === "how_did_you_hear_about_this_opportunity_select_a"));
});

test("a draft answer without draft:true never fills a free_text field", () => {
  const answers = Object.assign({}, ANSWERS_BEFORE, ANSWERS_CLASS_B, {
    tell_us_a_little_bit_about_yourself_and_: { value: "TEST SAMPLE — not a confirmed draft.", confirmed: true, draft: false, test_invented: true, provenance: { source: "test_sample" } },
  });
  const { res, board } = prepare(profileWith(answers));
  assert.equal(askMap(res).question_69847997, "needs_user_draft_confirmation");
  assert.ok(!board.fills.some((f) => f.field_id === "question_69847997"));
});

test("once the person answers the five class-(c) questions, the same form reaches the doorstep", () => {
  const answers = Object.assign({}, ANSWERS_BEFORE, ANSWERS_CLASS_B, ANSWERS_CLASS_C_BY_USER);
  const { res } = prepare(profileWith(answers));
  assert.notEqual(res.resultStatus, "awaiting_user");
  // The only remaining ask is the optional cover_letter attach,
  // which never blocks a doorstep.
  const requiredAsks = (res.asks || []).filter((a) => {
    const fd = GUSTO_DEFS.find((x) => x.field_id === a.field_id);
    return fd && fd.required;
  });
  assert.deepEqual(requiredAsks, []);
});
