// DECLINE-VOCAB lane (owner's WORD, 2026-10-21) — module 149's EEO-decline
// acceptance, aligned to ONE meaning class.
//
// Measured defect (DROPDOWN-MEASURE lane @ cc2932c9, tools/dropdown-measure):
// of 24 verified EEO-decline fills the board rendered the decline answer
// correctly every time, but 149's observation gate accepted only 5 — boards
// render "I don't wish to answer" (x19), "Decline To Self Identify" (x4),
// "I prefer not to say" (x1), and 149's inline decline regex lacked the
// "wish" forms, so ANSWER_OBSERVATION_MISMATCH blocked 6 of 8 production
// drives with every fill correct.
//
// The fix evaluates the decline MEANING CLASS (WO-020 shape: ordered named
// pattern rules over normalized text) from one home — module 149's exported
// EEO_DECLINE_MEANING data + isEeoDeclineText predicate — semantically
// identical to the on-page matcher's class (scripts/career/
// portal-browser-helper.cjs, isDeclineText, D8/BUG-067). The gate's job is
// unchanged: only decline-intent vs decline-rendering is reconciled; every
// other comparison is byte-for-byte what it was.
//
// FAIL-FIRST: written before the fix. On base cea914fe the corpus test
// fails on exactly the 19 "wish" renderings and the predicate tests fail
// (no export). Check: node --test tests/career-decline-vocab.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));

// The recorded corpus: dropdown-measure results/run-*/records.jsonl,
// every verified decline fill (fillOk, observed present), intended always
// the §6.1 default "Decline to self-identify" (149's EEO_DECLINE).
const CORPUS = [
  { company: "affirm", field_id: "question_32949668003", observed: "I prefer not to say" },
  { company: "cultureamp", field_id: "gender", observed: "Decline To Self Identify" },
  { company: "cultureamp", field_id: "hispanic_ethnicity", observed: "Decline To Self Identify" },
  { company: "grafanalabs", field_id: "4000713004", observed: "I don't wish to answer" },
  { company: "grafanalabs", field_id: "4000714004", observed: "I don't wish to answer" },
  { company: "grafanalabs", field_id: "4000715004", observed: "I don't wish to answer" },
  { company: "greenhouse", field_id: "29666", observed: "I don't wish to answer" },
  { company: "greenhouse", field_id: "29669", observed: "I don't wish to answer" },
  { company: "greenhouse", field_id: "29670", observed: "I don't wish to answer" },
  { company: "gusto", field_id: "605", observed: "I don't wish to answer" },
  { company: "gusto", field_id: "606", observed: "I don't wish to answer" },
  { company: "gusto", field_id: "607", observed: "I don't wish to answer" },
  { company: "gusto", field_id: "609", observed: "I don't wish to answer" },
  { company: "gusto", field_id: "610", observed: "I don't wish to answer" },
  { company: "intercom", field_id: "gender", observed: "Decline To Self Identify" },
  { company: "intercom", field_id: "hispanic_ethnicity", observed: "Decline To Self Identify" },
  { company: "intercom", field_id: "veteran_status", observed: "I don't wish to answer" },
  { company: "robinhood", field_id: "1258", observed: "I don't wish to answer" },
  { company: "robinhood", field_id: "1261", observed: "I don't wish to answer" },
  { company: "robinhood", field_id: "1465", observed: "I don't wish to answer" },
  { company: "twilio", field_id: "75375", observed: "I don't wish to answer" },
  { company: "twilio", field_id: "75376", observed: "I don't wish to answer" },
  { company: "twilio", field_id: "75377", observed: "I don't wish to answer" },
  { company: "twilio", field_id: "75378", observed: "I don't wish to answer" },
];

// A board that behaves like a real widget board: fill() receives the
// value 149 wants; the widget picks the board's own option, and the
// readback (answers()) returns THAT option's rendered label.
function renderingBoard(render, extraFields) {
  const values = {};
  return {
    kind: "browser", browserDriver: true, sandbox: false,
    open() { return {}; },
    form() { return { fields: [{ field_id: "eeo_q", kind: "eeo", required: true }].concat(extraFields || []) }; },
    fill(id, value) { values[id] = render(value, id); },
    answers() { return { ...values }; },
    atReview() { return { atFinalReview: true }; },
  };
}
const POSTING = { url: "http://localhost/form", canonicalKey: "decline-vocab-test" };
function runWith(board, profile) {
  const session = Portal.createPortalSession({ userId: "test", board });
  return Portal.runApply(session, { posting: POSTING, profile: profile || {} });
}

// ---------- the corpus: every recorded correct decline fill is accepted ----------
test("corpus: all 24 recorded decline renderings pass 149's observation gate", () => {
  const rejected = [];
  for (const rec of CORPUS) {
    const out = runWith(renderingBoard(() => rec.observed));
    if (out.resultStatus !== "prepared") rejected.push(`${rec.company}/${rec.field_id} "${rec.observed}" -> ${out.code || out.resultStatus}`);
  }
  assert.deepEqual(rejected, [], "no recorded correct decline fill may be rejected");
});

// ---------- negative controls: the gate's job is intact ----------
test("negative: a non-decline EEO choice rendered as a different value still blocks", () => {
  const out = runWith(renderingBoard(() => "Male"), { eeoChoice: "Female" });
  assert.equal(out.resultStatus, "blocked");
  assert.equal(out.code, "ANSWER_OBSERVATION_MISMATCH");
});

test("negative: a non-decline EEO choice rendered as itself still passes (acceptance untouched)", () => {
  const out = runWith(renderingBoard((v) => v), { eeoChoice: "Female" });
  assert.equal(out.resultStatus, "prepared");
});

test("negative: the decline default rendered as a substantive answer still blocks", () => {
  const out = runWith(renderingBoard(() => "Female"));
  assert.equal(out.resultStatus, "blocked");
  assert.equal(out.code, "ANSWER_OBSERVATION_MISMATCH");
});

test("negative: decline intent on a field with no decline rendering still blocks", () => {
  // The board's option set carries no decline option; the readback is a
  // substantive ethnicity answer, not a decline rendering of any kind.
  const out = runWith(renderingBoard(() => "Hispanic or Latino"));
  assert.equal(out.resultStatus, "blocked");
  assert.equal(out.code, "ANSWER_OBSERVATION_MISMATCH");
});

test("negative: a non-EEO confirmed answer is untouched — same value passes, different blocks", () => {
  const fields = [{ field_id: "wa", kind: "screening", question_key: "work_authorization", required: true }];
  const profile = { answers: { work_authorization: { value: "Yes", confirmed: true } } };
  const okOut = runWith(renderingBoard((v, id) => (id === "wa" ? "Yes" : "I don't wish to answer"), fields), profile);
  assert.equal(okOut.resultStatus, "prepared");
  const badOut = runWith(renderingBoard((v, id) => (id === "wa" ? "No" : "I don't wish to answer"), fields), profile);
  assert.equal(badOut.resultStatus, "blocked");
  assert.equal(badOut.code, "ANSWER_OBSERVATION_MISMATCH");
  assert.equal(badOut.field_id, "wa");
});

test("the user's own decline choice is the same meaning: a board's wish-form rendering passes", () => {
  const out = runWith(renderingBoard(() => "I don't wish to answer"), { eeoChoice: "Decline to self-identify" });
  assert.equal(out.resultStatus, "prepared");
});

test("FR-395 renderedValues path is unchanged (board-verified rendering still governs)", () => {
  const board = renderingBoard(() => "I don't wish to answer");
  board.renderedValues = { eeo_q: "I don't wish to answer" };
  const out = runWith(board);
  assert.equal(out.resultStatus, "prepared");
});

// ---------- the meaning class itself ----------
test("class data: EEO_DECLINE_MEANING is ordered named rules, each naming why it matches", () => {
  assert.ok(Array.isArray(Portal.EEO_DECLINE_MEANING), "the class is exported data");
  const names = Portal.EEO_DECLINE_MEANING.map((r) => r.name);
  assert.equal(new Set(names).size, names.length, "rule names are unique");
  for (const r of Portal.EEO_DECLINE_MEANING) {
    assert.equal(typeof r.name, "string");
    assert.doesNotThrow(() => new RegExp(r.pattern), `rule ${r.name} compiles`);
  }
  assert.equal(typeof Portal.isEeoDeclineText, "function");
  assert.equal(typeof Portal.eeoDeclineMatch, "function");
  // eeoDeclineMatch names the rule that fired (WO-020: each rule names why)
  assert.equal(Portal.eeoDeclineMatch("I don't wish to answer"), "wish_not");
  assert.equal(Portal.eeoDeclineMatch("Female"), null);
});

test("class membership: the measured renderings and their meaning equivalents", () => {
  for (const s of [
    "Decline to self-identify", "Decline To Self Identify", "Decline",
    "I don't wish to answer", "I do not wish to answer", "Do not wish to disclose",
    "I don’t wish to answer", "I DONT WISH TO ANSWER",
    "I prefer not to say", "Prefer not to answer", "Prefer not to disclose",
    "I prefer not to answer.", "No answer",
  ]) assert.equal(Portal.isEeoDeclineText(s), true, s);
});

test("class membership: substantive answers and other meanings are NOT decline-class", () => {
  for (const s of [
    "Female", "Male", "Yes", "No", "White", "Black or African American",
    "Hispanic or Latino", "I am a veteran", "Not applicable", "N/A",
    "I will answer", "Two or more races", "",
  ]) assert.equal(Portal.isEeoDeclineText(s), false, JSON.stringify(s));
});

test("alignment: the on-page matcher IS this class (helper D8/BUG-067; unified 2026-10-22)", () => {
  // This was a tripwire against a frozen copy of the helper's regex, to fire when the two homes drifted. They did
  // (F-024 taught the helper "I do not want to answer"; the frozen copy expected that NOT to be a decline). The helper
  // now builds its matcher from Portal.EEO_DECLINE_SOURCE, so there is one home; tests/career-decline-one-class.test.cjs
  // checks the helper source and the answer-option matcher against it.
  const re = new RegExp(Portal.EEO_DECLINE_SOURCE);
  const norm = (s) => String(s || "").toLowerCase().replace(/[’‘]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const probes = [
    "Decline to self-identify", "Decline To Self Identify", "I don't wish to answer",
    "I prefer not to say", "Prefer not to answer", "Do not wish to disclose",
    "I do not wish to answer", "No answer", "Decline", "decline to answer",
    "Female", "Male", "Yes", "No", "Not applicable", "N/A", "I will answer",
    "Hispanic or Latino", "I am not a veteran", "Prefer to answer", "Wish to answer",
    "I don't want to answer", "I do not want to answer", "Refuse to answer", "Two or more races", "White",
  ];
  for (const p of probes) assert.equal(Portal.isEeoDeclineText(p), re.test(norm(p)), `probe ${JSON.stringify(p)}`);
  assert.equal(Portal.isEeoDeclineText("I don't want to answer"), true);
  assert.equal(Portal.isEeoDeclineText("I do not want to answer"), true);
  assert.equal(Portal.isEeoDeclineText("I am not a veteran"), false);
});
