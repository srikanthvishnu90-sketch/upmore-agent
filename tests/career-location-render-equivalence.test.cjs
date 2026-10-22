// F-028 (2026-10-22) — location benign-render equivalence at 149's
// observation gate. Root-cause note:
// docs/apply/ROOT-CAUSE-LOCATION-RENDER-2026-10-22.md.
//
// Live witness (batch-29ea020da986): every FDSE field filled and read
// back, phone gate passed, then the run stopped —
//   { code: "ANSWER_OBSERVATION_MISMATCH", field_id: "location",
//     expected: "Chicago, IL", observed: "Chicago, IL, USA" }
// The location control is a places pick: the driver selects the
// board's own suggestion for the confirmed fact, and the board's
// canonical form of that place appends the country. A scalar fill, so
// the FR-395 renderedValues hatch never fires, and the exact compare
// stops a correct fill. The fix extends F-027's per-key equivalence
// (compare ONLY, keyed by the field's profile_key): for "location",
// one trailing country suffix from the named LOCATION_COUNTRY_SUFFIXES
// set is stripped from BOTH sides and the remaining place text must
// match exactly. The payload is never altered. A different city, the
// same city in a different state, a longer different place that merely
// starts with the expected text, or the same suffix-shaped difference
// on any OTHER profile key is still drift and still stops.
//
// Check: node --test tests/career-location-render-equivalence.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));

const USER = "user-location-render-a";
const NOW = Date.UTC(2026, 9, 22, 5, 30, 0);
const POSTING = {
  canonicalKey: "lever:testco:forward-deployed-software-engineer-internship",
  company: "TestCo", title: "Forward Deployed Software Engineer, Internship",
  url: "https://jobs.lever.co/testco/abc", status: "open", atsFamily: "lever",
  location: "Chicago, IL",
  jd_text: "Forward deployed software engineering intern role. TypeScript, testing.",
};
const ATTEST = { certify_true: { value: true, explicit: true } };

function profile(location, extra) {
  return Object.assign({
    name: "Alex Testcase (TEST)",
    email: "alex.testcase@example.test",
    phone: "+1 2246029341",
    location,
    country: "United States",
    resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
    answers: {
      work_authorization: { value: "Yes — authorized to work in the US", confirmed: true },
      sponsorship: { value: "No", confirmed: true },
      cover_note: { value: "I am excited to apply for the intern role.", confirmed: true, draft: true },
    },
  }, extra || {});
}

// A sandbox board whose location readback is forced to `readback` —
// the board-side canonicalization, exactly the live shape: the fill
// carries the confirmed fact, answers() reports the board's form.
function locationBoard(readback) {
  const base = Portal.createSandboxBoard({});
  const board = Object.assign({}, base, { atsFamily: "lever" });
  board.answers = () => {
    const a = base.answers();
    a.location = readback;
    return a;
  };
  return board;
}

function prepare(board, prof) {
  const session = Portal.createPortalSession({ userId: USER, board });
  return Portal.runApply(session, { posting: POSTING, profile: prof, log: { records: [] }, userId: USER, now: NOW, attestations: ATTEST });
}

test("the live shape: board-appended country suffix is a benign render, not drift", () => {
  const res = prepare(locationBoard("Chicago, IL, USA"), profile("Chicago, IL"));
  assert.equal(res.resultStatus, "prepared",
    `a correct location fill the board renders with a country suffix must reach the doorstep: ${JSON.stringify(res.stepLog || res).slice(0, 400)}`);
  const eq = (res.stepLog || []).find((s) => s.action === "answer_observation_equivalent" && s.field_id === "location");
  assert.ok(eq, "the acceptance is recorded as a location-equivalence acceptance in the run record");
  assert.equal(eq.equivalence, "location_country_suffix");
  assert.equal(eq.expected, "Chicago, IL");
  assert.equal(eq.observed, "Chicago, IL, USA");
});

test("the long-form country suffix is the same benign render", () => {
  const res = prepare(locationBoard("Chicago, IL, United States"), profile("Chicago, IL"));
  assert.equal(res.resultStatus, "prepared",
    `the spelled-out country suffix must not stop the run: ${JSON.stringify(res.stepLog || res).slice(0, 400)}`);
});

test("symmetric: the profile carrying the suffix and the board not rendering it is still the same place", () => {
  const res = prepare(locationBoard("Chicago, IL"), profile("Chicago, IL, USA"));
  assert.equal(res.resultStatus, "prepared",
    `a profile fact in country-suffixed form must match the board's short form: ${JSON.stringify(res.stepLog || res).slice(0, 400)}`);
});

test("negative control: a different city still stops, values on the record", () => {
  const res = prepare(locationBoard("Evanston, IL, USA"), profile("Chicago, IL"));
  assert.equal(res.resultStatus, "blocked");
  assert.equal(res.code, "ANSWER_OBSERVATION_MISMATCH");
  assert.equal(res.field_id, "location");
  assert.equal(res.expected, "Chicago, IL");
  assert.equal(res.observed, "Evanston, IL, USA");
});

test("negative control: the same city name in a different state is drift, not a benign render", () => {
  const res = prepare(locationBoard("Springfield, MO, USA"), profile("Springfield, IL"));
  assert.equal(res.resultStatus, "blocked");
  assert.equal(res.code, "ANSWER_OBSERVATION_MISMATCH");
  assert.equal(res.field_id, "location");
});

test("negative control: a different place that merely starts with the expected text still stops", () => {
  const res = prepare(locationBoard("Chicago Heights, IL, USA"), profile("Chicago, IL"));
  assert.equal(res.resultStatus, "blocked");
  assert.equal(res.code, "ANSWER_OBSERVATION_MISMATCH");
  assert.equal(res.field_id, "location");
});

test("keying control: the suffix equivalence does not leak to other profile keys", () => {
  const field = { field_id: "base_office", label: "Base office", kind: "standard", profile_key: "base_office", required: false };
  const base = Portal.createSandboxBoard({});
  const board = Object.assign({}, base, { atsFamily: "lever" });
  board.form = () => {
    const f = base.form();
    f.fields = f.fields.concat([Object.assign({}, field)]);
    return f;
  };
  board.answers = () => {
    const a = base.answers();
    a.base_office = "Chicago, IL, USA"; // suffix-equal to the filled value under LOCATION rules only
    return a;
  };
  const res = prepare(board, profile("Chicago, IL", { base_office: "Chicago, IL" }));
  assert.equal(res.resultStatus, "blocked", "a non-location key with a country-suffix difference must still stop");
  assert.equal(res.code, "ANSWER_OBSERVATION_MISMATCH");
  assert.equal(res.field_id, "base_office");
});
