// F-027 (2026-10-22) — phone benign-render equivalence at 149's
// observation gate. Root-cause note:
// docs/apply/ROOT-CAUSE-PHONE-RENDER-2026-10-21.md.
//
// Live witness (batch-8ef4497b16db): every FDSE field filled and read
// back, then the run stopped —
//   { code: "ANSWER_OBSERVATION_MISMATCH", field_id: "phone",
//     expected: "+1 2246029341", observed: "2246029341" }
// Lever's phone mask normalizes the fill to the US national form (the
// "+1" country prefix is dropped by the board, not by us). A phone
// input is a SCALAR fill, so the FR-395 renderedValues hatch (widget
// fills only) never fires, and the gate's exact compare stops a
// correct fill. The fix: per-key value equivalence AT THE COMPARE
// ONLY, keyed by the field's profile_key ("phone") — digit sequences
// are compared with a single leading country "1" tolerated. The
// payload/fill value is never altered. A genuinely different number
// (last digit changed, or a different country prefix) is still drift
// and still stops; a digit-shaped difference on any OTHER profile key
// still stops (the equivalence must not leak across keys).
//
// Check: node --test tests/career-phone-render-equivalence.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));

const USER = "user-phone-render-a";
const NOW = Date.UTC(2026, 9, 22, 5, 0, 0);
const POSTING = {
  canonicalKey: "lever:testco:forward-deployed-software-engineer-internship",
  company: "TestCo", title: "Forward Deployed Software Engineer, Internship",
  url: "https://jobs.lever.co/testco/abc", status: "open", atsFamily: "lever",
  location: "Chicago, IL",
  jd_text: "Forward deployed software engineering intern role. TypeScript, testing.",
};
const ATTEST = { certify_true: { value: true, explicit: true } };

function profile(phone, extra) {
  return Object.assign({
    name: "Alex Testcase (TEST)",
    email: "alex.testcase@example.test",
    phone,
    location: "Chicago, IL",
    country: "United States",
    resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
    answers: {
      work_authorization: { value: "Yes — authorized to work in the US", confirmed: true },
      sponsorship: { value: "No", confirmed: true },
      cover_note: { value: "I am excited to apply for the intern role.", confirmed: true, draft: true },
    },
  }, extra || {});
}

// A sandbox board whose phone readback is forced to `readback` — the
// board-side mask normalization, exactly the live shape: the fill
// carries the confirmed fact, answers() reports the board's form.
function phoneBoard(readback, extraFields) {
  const base = Portal.createSandboxBoard({});
  const board = Object.assign({}, base, { atsFamily: "lever" });
  if (extraFields) {
    board.form = () => {
      const f = base.form();
      f.fields = f.fields.concat(extraFields);
      return f;
    };
  }
  board.answers = () => {
    const a = base.answers();
    a.phone = readback;
    return a;
  };
  return board;
}

function prepare(board, prof) {
  const session = Portal.createPortalSession({ userId: USER, board });
  return Portal.runApply(session, { posting: POSTING, profile: prof, log: { records: [] }, userId: USER, now: NOW, attestations: ATTEST });
}

test("the live shape: mask-dropped +1 is a benign render, not drift", () => {
  const res = prepare(phoneBoard("2246029341"), profile("+1 2246029341"));
  assert.equal(res.resultStatus, "prepared",
    `a correct phone fill the board renders in national form must reach the doorstep: ${JSON.stringify(res.stepLog || res).slice(0, 400)}`);
  const eq = (res.stepLog || []).find((s) => s.action === "answer_observation_equivalent" && s.field_id === "phone");
  assert.ok(eq, "the acceptance is recorded as a phone-equivalence acceptance in the run record");
  assert.equal(eq.equivalence, "phone_digits");
});

test("formatting variants of the same number are equivalent (digit sequence, not a literal patch)", () => {
  const res = prepare(phoneBoard("224-602-9341"), profile("+1 (224) 602-9341"));
  assert.equal(res.resultStatus, "prepared",
    `punctuation/spacing differences in the same number must not stop the run: ${JSON.stringify(res.stepLog || res).slice(0, 400)}`);
});

test("negative control: a genuinely different number still stops, values on the record", () => {
  const res = prepare(phoneBoard("2246029342"), profile("+1 2246029341"));
  assert.equal(res.resultStatus, "blocked");
  assert.equal(res.code, "ANSWER_OBSERVATION_MISMATCH");
  assert.equal(res.field_id, "phone");
  assert.equal(res.expected, "+1 2246029341");
  assert.equal(res.observed, "2246029342");
});

test("negative control: a different country prefix is drift, not a benign render", () => {
  const res = prepare(phoneBoard("+44 2246029341"), profile("+1 2246029341"));
  assert.equal(res.resultStatus, "blocked");
  assert.equal(res.code, "ANSWER_OBSERVATION_MISMATCH");
  assert.equal(res.field_id, "phone");
});

test("keying control: the digit equivalence does not leak to other profile keys", () => {
  const field = { field_id: "candidate_ref", label: "Candidate reference", kind: "standard", profile_key: "candidate_ref", required: false };
  const base = Portal.createSandboxBoard({});
  const board = Object.assign({}, base, { atsFamily: "lever" });
  board.form = () => {
    const f = base.form();
    f.fields = f.fields.concat([Object.assign({}, field)]);
    return f;
  };
  board.answers = () => {
    const a = base.answers();
    a.candidate_ref = "2246029341"; // digit-equal to the filled value under PHONE rules only
    return a;
  };
  const res = prepare(board, profile("+1 2246029341", { candidate_ref: "12246029341" }));
  assert.equal(res.resultStatus, "blocked", "a non-phone key with a digit-shaped difference must still stop");
  assert.equal(res.code, "ANSWER_OBSERVATION_MISMATCH");
  assert.equal(res.field_id, "candidate_ref");
});
