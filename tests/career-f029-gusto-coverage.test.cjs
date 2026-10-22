// F-029 GUARD on the audit-table lineage (2026-10-22) — the Gusto
// (Greenhouse) Finance Intern (Summer 2027) form stopped
// UNCOVERED_QUESTION with 10 asks (witness drive batch-2891c869c36a,
// TEST profile, prepare-only, flag OFF). Classification of the ten:
// docs/apply/CLASSIFICATION-GUSTO-F029-2026-10-22.md (ported verbatim
// from 587233c7). Root-cause note for this port:
// docs/apply/ROOT-CAUSE-F029-2026-10-22.md.
//
// THE CLASSIFICATION (the data this guard pins):
//   - class (b) — non-fact TEST-sample material, recorded on the TEST
//     master ONLY, provenance {source:"test_sample"}, test_invented:
//     how-heard (question), about-yourself essay (free_text draft),
//     offer-deadlines (free_text draft), conferences (free_text draft).
//   - class (c) — the person's OWN facts; they stay UNANSWERED until
//     the person answers (module 172's ask). NO value for any of the
//     five exists in this file, by rule: ZIP code · relocate-to-New-
//     York · full-cohort availability · fixed-dates acknowledgment ·
//     first-generation professional identity.
//   - cover_letter — optional document-attach control, non-blocking.
//
// LINEAGE DIVERGENCE (measured on this base, cbcd0141, not assumed):
// this tree's module 149 has NO kind:"question" branch — the F-026
// FDSE-QUESTION-KIND branch exists only on the host lineage. Here a
// kind:"question" field falls through to the saved-answer attempt
// and then asks with reason "unknown_field_category", and a stored
// answers-store entry NEVER binds it, whatever its provenance. So on
// this lineage the safety invariant is stronger (no class-(c) field
// can be filled from the answers store at all), while the class-(b)
// how-heard sample cannot bind either — its ask stays named (never
// invented), and the strict "asks shrink to exactly the class-(c)
// five" only becomes reachable when the F-026 branch lands here.
// That strict form is pinned below as a TODO test, not silently
// weakened. The three class-(b) free_text drafts DO bind through
// 149's free_text branch, identically on both lineages.
//
// Fail-first record: the host-lineage guard (587233c7) run against
// this base scored 1 pass / 4 fail (witness reasons, class-(b)
// binding, unconfirmed reason, doorstep test) — the base lacked the
// classification, the guard, and the question branch. This file is
// the guard for THIS lineage's engine; it contains no class-(c)
// answer value and asserts no class-(c) fill, by the owner's rule.
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
// keys as the service produced them). Same fixture as 587233c7.
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

// The five class-(c) field_ids — the person's own answers, absent
// from every fixture below. Named here so the guard can assert they
// are always asked and never filled.
const CLASS_C_FIELD_IDS = ["question_69649385", "question_69847999", "question_69848000", "question_69848001", "1012"];
const HOW_HEARD_FIELD = "how_did_you_hear_about_this_opportunity_select_a";

// The TEST master's answers BEFORE the F-029 recording (the witness
// state): the canonical answers + the FDSE TEST samples + cover_note.
const ANSWERS_BEFORE = {
  work_authorization: { value: "Yes", confirmed: true },
  sponsorship: { value: "No", confirmed: true },
  cover_note: { value: "TEST SAMPLE — SYNTHETIC TEXT, NOT A REAL STATEMENT: cover note.", confirmed: true, draft: true, test_invented: true },
  language_skill_s_check_all_that_apply: { value: ["English (ENG)"], confirmed: true, draft: false, test_invented: true },
};

// The four class-(b) answers recorded on the TEST master by the
// F-029 fix (provenance {source:"test_sample"}, test_invented). The
// recorded texts are proven by the module-168 audit in the recording
// script and the live re-drive on the host lineage; this guard pins
// the BINDING and the provenance shape, not the prose.
const ANSWERS_CLASS_B = {
  how_did_you_hear_about_this_opportunity_: { value: ["LinkedIn"], confirmed: true, draft: false, test_invented: true, provenance: { source: "test_sample" } },
  tell_us_a_little_bit_about_yourself_and_: { value: "TEST SAMPLE — SYNTHETIC TEXT, NOT A REAL STATEMENT. (fit essay draft)", confirmed: true, draft: true, test_invented: true, provenance: { source: "test_sample" } },
  do_you_have_any_upcoming_offer_deadlines: { value: "TEST SAMPLE — SYNTHETIC TEXT, NOT A REAL STATEMENT. (deadlines draft; asserts none)", confirmed: true, draft: true, test_invented: true, provenance: { source: "test_sample" } },
  as_gusto_grows_we_are_always_aiming_to_e: { value: "TEST SAMPLE — SYNTHETIC TEXT, NOT A REAL STATEMENT. (conferences draft; names none)", confirmed: true, draft: true, test_invented: true, provenance: { source: "test_sample" } },
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
const fillIds = (board) => board.fills.map((f) => f.field_id);
const noClassCFilled = (board) => assert.deepEqual(fillIds(board).filter((id) => CLASS_C_FIELD_IDS.includes(id)), []);

// The witnessed ten, in THIS lineage's reason vocabulary (measured
// on base cbcd0141): kind:"question" and kind:"unknown" fields ask
// "unknown_field_category" here; on the host lineage the question
// fields ask "no_confirmed_fact" (F-026 branch). Field set identical.
const WITNESSED_TEN = {
  cover_letter: "unknown_field_category",
  question_69649385: "unknown_field_category",
  how_did_you_hear_about_this_opportunity_select_a: "unknown_field_category",
  question_69847997: "needs_user_draft_confirmation",
  question_69847999: "unknown_field_category",
  question_69848000: "unknown_field_category",
  question_69848001: "unknown_field_category",
  question_69848002: "needs_user_draft_confirmation",
  question_69848003: "needs_user_draft_confirmation",
  "1012": "unknown_field_category",
};

test("witness state: the ask set is exactly the F-029 ten, and no class-(c) field is filled", () => {
  const { res, board } = prepare(profileWith(ANSWERS_BEFORE));
  assert.equal(res.resultStatus, "awaiting_user");
  assert.deepEqual(askMap(res), WITNESSED_TEN);
  noClassCFilled(board);
});

test("(a) with only class-(b) answers stored: the three drafts fill, ALL five class-(c) fields are named as asks, and none of them is filled", () => {
  const answers = Object.assign({}, ANSWERS_BEFORE, ANSWERS_CLASS_B);
  const { res, board } = prepare(profileWith(answers));
  assert.equal(res.resultStatus, "awaiting_user");
  const asks = askMap(res);
  // Every class-(c) field is named — no fewer.
  for (const id of CLASS_C_FIELD_IDS) assert.equal(asks[id], "unknown_field_category", id + " must be asked");
  // And none is filled — the stop is the product working as designed.
  noClassCFilled(board);
  // The three class-(b) free_text drafts bind their stored values.
  const filled = Object.fromEntries(board.fills.map((f) => [f.field_id, f.value]));
  assert.equal(filled.question_69847997, ANSWERS_CLASS_B.tell_us_a_little_bit_about_yourself_and_.value);
  assert.equal(filled.question_69848002, ANSWERS_CLASS_B.do_you_have_any_upcoming_offer_deadlines.value);
  assert.equal(filled.question_69848003, ANSWERS_CLASS_B.as_gusto_grows_we_are_always_aiming_to_e.value);
  // The complete ask set on this lineage: the class-(c) five, the
  // class-(b) how-heard (named because the F-026 question branch is
  // absent here — its stored TEST sample cannot bind, and is never
  // invented either), and the optional cover_letter attach.
  assert.deepEqual(asks, {
    cover_letter: "unknown_field_category",
    question_69649385: "unknown_field_category",
    how_did_you_hear_about_this_opportunity_select_a: "unknown_field_category",
    question_69847999: "unknown_field_category",
    question_69848000: "unknown_field_category",
    question_69848001: "unknown_field_category",
    "1012": "unknown_field_category",
  });
});

test("(b) a missing class-(b) answer is named as an ask, never invented", () => {
  // Essay (free_text class-(b)) removed: it reappears as an ask with
  // the draft-confirmation reason and is not filled.
  const noEssay = Object.assign({}, ANSWERS_BEFORE, ANSWERS_CLASS_B);
  delete noEssay.tell_us_a_little_bit_about_yourself_and_;
  const r1 = prepare(profileWith(noEssay));
  assert.equal(askMap(r1.res).question_69847997, "needs_user_draft_confirmation");
  assert.ok(!fillIds(r1.board).includes("question_69847997"));
  noClassCFilled(r1.board);
  // How-heard (question class-(b)) removed: named as an ask, unfilled.
  const noHeard = Object.assign({}, ANSWERS_BEFORE, ANSWERS_CLASS_B);
  delete noHeard.how_did_you_hear_about_this_opportunity_;
  const r2 = prepare(profileWith(noHeard));
  assert.equal(askMap(r2.res)[HOW_HEARD_FIELD], "unknown_field_category");
  assert.ok(!fillIds(r2.board).includes(HOW_HEARD_FIELD));
  noClassCFilled(r2.board);
});

test("an unconfirmed TEST sample never fills", () => {
  const answers = Object.assign({}, ANSWERS_BEFORE, ANSWERS_CLASS_B, {
    how_did_you_hear_about_this_opportunity_: { value: ["LinkedIn"], confirmed: false, draft: false, test_invented: true, provenance: { source: "test_sample" } },
  });
  const { res, board } = prepare(profileWith(answers));
  assert.equal(askMap(res)[HOW_HEARD_FIELD], "unknown_field_category");
  assert.ok(!fillIds(board).includes(HOW_HEARD_FIELD));
  noClassCFilled(board);
});

test("a draft answer without draft:true never fills a free_text field", () => {
  const answers = Object.assign({}, ANSWERS_BEFORE, ANSWERS_CLASS_B, {
    tell_us_a_little_bit_about_yourself_and_: { value: "TEST SAMPLE — not a confirmed draft.", confirmed: true, draft: false, test_invented: true, provenance: { source: "test_sample" } },
  });
  const { res, board } = prepare(profileWith(answers));
  assert.equal(askMap(res).question_69847997, "needs_user_draft_confirmation");
  assert.ok(!fillIds(board).includes("question_69847997"));
  noClassCFilled(board);
});

test("(c) no default, sample, or fixture value ever reaches a class-(c) field — in any provenance state", () => {
  // The guard's own rule forbids writing the person's answers, so
  // this test never places a value in a class-(c) field: it places
  // entries under the class-(c) QUESTION KEYS in the three states a
  // wrong door could take — unconfirmed, confirmed-but-test_invented
  // (a sample), and confirmed plain — each carrying a placeholder
  // marker as its value payload, and asserts the engine on THIS
  // lineage binds none of them (there is no question branch here;
  // every class-(c) key's stored entry is ignored, the fields stay
  // asked). If any future change makes one of these bind, this test
  // goes red before a value can reach a real form unnoticed.
  const classCKeys = [
    "zip_code_postal_code_non_u_s_based_candi",
    "are_you_willing_to_relocate_to_new_york_",
    "this_internship_is_from_may_17_2027_to_a",
    "to_help_make_sure_everyone_has_the_same_",
    "i_identify_as_a_first_generation_profess",
  ];
  const states = [
    { confirmed: false },
    { confirmed: true, test_invented: true, provenance: { source: "test_sample" } },
    { confirmed: true },
  ];
  for (const st of states) {
    const injected = {};
    for (const k of classCKeys) injected[k] = Object.assign({ value: "GUARD-MARKER-NOT-AN-ANSWER" }, st);
    const answers = Object.assign({}, ANSWERS_BEFORE, ANSWERS_CLASS_B, injected);
    const { res, board } = prepare(profileWith(answers));
    for (const id of CLASS_C_FIELD_IDS) assert.ok(id in askMap(res), id + " must stay asked");
    noClassCFilled(board);
    assert.ok(!board.fills.some((f) => f.value === "GUARD-MARKER-NOT-AN-ANSWER"), "marker value must never be filled anywhere");
  }
});

test("(a-strict) the required ask set shrinks to EXACTLY the class-(c) five once the F-026 question branch lands on this lineage", { todo: "BLOCKED on the F-026 question-kind branch (host lineage only today): the stored class-(b) how-heard sample cannot bind on this tree, so its ask is also named. This test executes and fails as TODO until that port lands; it is the strict form of assertion (a), kept visible rather than weakened." }, () => {
  const answers = Object.assign({}, ANSWERS_BEFORE, ANSWERS_CLASS_B);
  const { res } = prepare(profileWith(answers));
  const requiredAsks = (res.asks || []).filter((a) => {
    const fd = GUSTO_DEFS.find((x) => x.field_id === a.field_id);
    return fd && fd.required;
  }).map((a) => a.field_id).sort();
  assert.deepEqual(requiredAsks, CLASS_C_FIELD_IDS.slice().sort());
});
