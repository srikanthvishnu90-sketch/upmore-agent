"use strict";
// WO-096 in the portal driver (packages/domain/149): a Greenhouse-shaped SANDBOX form whose review waits for the code
// its system emailed. For a drive the person approved on its card, runApplyWithEmailCode reads the code (a stand-in
// reader here; the worker passes career_email_code.ts fetchVerificationCode) and types it; the drive reaches the doorstep
// and the submit goes only through the approval's payload binding. The code is never an answer, never in the payload,
// its hash, the step log, the application log or any console line. Synthetic data only.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Portal = require(path.join(__dirname, "..", "packages/domain/149-career-portal-apply.js"));

const CODE = "Gh7kQ2mB";
const NOW = Date.UTC(2026, 9, 20, 22, 0, 0);
const PROFILE = {
  name: "Alex Testcase (TEST)",
  email: "alex.testcase@example.test",
  phone: "+1 000 555 0100",
  location: "Chicago, IL",
  resume: { filename: "alex-testcase-resume.pdf", sha256: "a".repeat(64) },
  answers: {
    work_authorization: { value: "Yes", confirmed: true },
    sponsorship: { value: "No", confirmed: true },
  },
};
const ATTEST = { certify_true: { value: true, explicit: true } };
const POSTING = {
  canonicalKey: "greenhouse:testco96:intern", company: "TestCo 96", title: "Intern",
  url: "https://boards.greenhouse.io/testco96/jobs/1", status: "open", atsFamily: "greenhouse",
};
// A stand-in code like career_email_code.ts EmailCode: it prints hidden, reveal() gives the characters.
const secret = (v) => ({ reveal: () => v, toJSON: () => "[emailed code]", toString: () => "[emailed code]" });

function drive({ approved = true, reader, expect = CODE }) {
  const board = Portal.createSandboxBoard({ codeStep: { ats: "greenhouse", expect } });
  const session = Portal.createPortalSession({ userId: "TEST-USER-096", board });
  const log = { records: [] };
  const reads = [];
  const input = { posting: POSTING, profile: PROFILE, log, now: new Date(NOW).toISOString(), attestations: ATTEST,
    ...(approved ? { approval: { approvedByUser: true, approvalRef: "TEST-BATCH-1" } } : {}) };
  const lines = [];
  const saved = { log: console.log, error: console.error, warn: console.warn };
  console.log = console.error = console.warn = (...a) => lines.push(a.map(String).join(" "));
  return Portal.runApplyWithEmailCode(session, input, reader && (async (i) => (reads.push(i), reader(i))))
    .finally(() => Object.assign(console, saved))
    .then((out) => ({ out, board, session, log, reads, lines }));
}
function noCode(r) {
  for (const s of [JSON.stringify(r.out), JSON.stringify(r.log), JSON.stringify(r.session.doorstep), JSON.stringify(r.session.submission), ...r.lines]) {
    assert.ok(!String(s).includes(CODE), "the code is in a record: " + String(s).slice(0, 200));
  }
}

test("an approved drive: the emailed code is read, typed, and the doorstep and its approved submit follow", async () => {
  const r = await drive({ reader: async () => ({ status: "found", code: secret(CODE) }) });
  assert.equal(r.out.resultStatus, "completed", JSON.stringify(r.out));
  assert.equal(r.board.codeAccepted, true, "the code was typed into the page's code step");
  assert.equal(r.board.calls.submit, 1);
  assert.deepEqual(r.reads, [{ userId: "TEST-USER-096", ats: "greenhouse", sinceMs: NOW }], "read once, for this system, from when the page asked");
  const steps = r.out.stepLog.map((s) => s.action);
  const at = (a) => steps.indexOf(a);
  assert.ok(at("email_code_stop") < at("email_code_read") && at("email_code_read") < at("email_code_filled") &&
    at("email_code_filled") < at("doorstep_reached") && at("doorstep_reached") < at("approval_bound"), steps.join(" "));
  assert.ok(!("code" in r.session.doorstep.payload) && !Object.values(r.session.doorstep.payload).includes(CODE), "the code is not an answer");
  assert.equal(r.session.emailCode, null, "the session keeps no code");
  noCode(r);
});

test("a drive without the person's approval never reads mail and never submits", async () => {
  const r = await drive({ approved: false, reader: async () => ({ status: "found", code: secret(CODE) }) });
  assert.equal(r.out.code, "EMAIL_CODE_REQUIRED");
  assert.equal(r.out.codeStatus, "not_approved");
  assert.match(r.out.stop, /Approve the application on its card first/);
  assert.equal(r.reads.length, 0);
  assert.equal(r.board.calls.submit, 0);
});

test("not connected, two codes, or a code the page refused: a named stop, nothing submitted", async () => {
  const none = await drive({ reader: async () => ({ status: "no_google_connection" }) });
  assert.equal(none.out.code, "EMAIL_CODE_REQUIRED");
  assert.equal(none.out.stop, "Connect Google so I can read the code Greenhouse emails you, or type the code on the page yourself.");
  assert.equal(none.board.calls.submit, 0);
  const noReader = await drive({});
  assert.equal(noReader.out.stop, "Connect Google so I can read the code Greenhouse emails you, or type the code on the page yourself.");
  const two = await drive({ reader: async () => ({ status: "ambiguous" }) });
  assert.match(two.out.stop, /didn't guess/);
  assert.equal(two.board.calls.submit, 0);
  const wrong = await drive({ reader: async () => ({ status: "found", code: secret("Wr0ngC0d") }), expect: CODE });
  assert.equal(wrong.out.code, "EMAIL_CODE_REQUIRED");
  assert.equal(wrong.out.codeStatus, "rejected");
  assert.equal(wrong.board.calls.submit, 0);
  for (const r of [none, two, wrong]) noCode(r);
  assert.ok(!JSON.stringify(wrong.out).includes("Wr0ngC0d"));
});

test("a form with no code step is unchanged: prepared at the doorstep, no read", async () => {
  const board = Portal.createSandboxBoard({});
  const session = Portal.createPortalSession({ userId: "TEST-USER-096", board });
  let reads = 0;
  const out = await Portal.runApplyWithEmailCode(session, { posting: POSTING, profile: PROFILE, log: { records: [] }, now: new Date(NOW).toISOString(), attestations: ATTEST },
    async () => (reads++, { status: "found", code: secret(CODE) }));
  assert.equal(out.resultStatus, "prepared", JSON.stringify(out));
  assert.equal(reads, 0);
});
