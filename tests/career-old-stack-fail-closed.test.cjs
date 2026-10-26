"use strict";
// Backend gap map G3 (owner priority, 2026-10-23): the old batch stack (155 -> 149 -> module 150's browser board) must
// reach no real employer site. Before this gate, a board opened on a real Greenhouse posting could be armed by 149's
// approval gate (an exact "Approve batch <id>" plus a matching card hash) and then click the site's own Submit. The gate
// is by construction in module 150: only a local test page (localhost / 127.0.0.1) can ever be armed or clicked; a real
// host is refused before any browser command, and nothing (no option, flag or setting) turns it back on. Real
// submissions go through the D-014 queue and its own gates. No browser is launched by these tests.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Board = require("../packages/domain/150-career-portal-browser.js");

const APPROVAL = { approvedByUser: true, approvalRef: "batch-approval-ref-1", payload: { fields: [] }, canonicalKey: "k" };
const REAL = [
  "https://boards.greenhouse.io/acme/jobs/123",
  "https://job-boards.greenhouse.io/acme/jobs/123",
  "https://jobs.lever.co/acme/abc",
  "https://jobs.ashbyhq.com/acme/abc",
  "https://jobs.smartrecruiters.com/acme/123",
];

for (const url of REAL) {
  test(`fail-closed: a board on a real employer page cannot be armed by the approval gate (${new URL(url).host})`, () => {
    const board = Board.createBrowserBoard({ url, userId: "u-1" });
    const r = board.armForSubmit(APPROVAL);
    assert.equal(r.armed, false, JSON.stringify(r));
    assert.equal(r.reason, "OLD_STACK_REAL_SUBMIT_CLOSED");
  });
}

test("fail-closed: a real-host board created pre-armed (the test lane's option) is not armed", () => {
  const board = Board.createBrowserBoard({ url: REAL[0], userId: "u-1", submitArmed: true, approvalRef: "x" });
  assert.equal(board.armForSubmit({}).armed, false);
  assert.throws(() => board.submit(), (e) => e.code === "OLD_STACK_REAL_SUBMIT_CLOSED");
});

test("fail-closed: submit on a real-host board refuses before any browser command", () => {
  const board = Board.createBrowserBoard({ url: REAL[0], userId: "u-1" });
  board.armForSubmit(APPROVAL);
  assert.throws(() => board.submit(), (e) => e.code === "OLD_STACK_REAL_SUBMIT_CLOSED");
  assert.equal(board.calls.submit, 0);
  assert.equal(board.driverLog.some((l) => l.action === "submit_armed"), false);
});

test("control: a local test page can still be armed by the approval gate (test lanes keep working)", () => {
  const board = Board.createBrowserBoard({ url: "http://127.0.0.1:8472/apply/1", userId: "u-1" });
  const r = board.armForSubmit(APPROVAL);
  assert.equal(r.armed, true, JSON.stringify(r));
});

test("control: an arming request without the user's approval is still refused on a local page", () => {
  const board = Board.createBrowserBoard({ url: "http://localhost:8472/apply/1", userId: "u-1" });
  assert.equal(board.armForSubmit({ approvedByUser: false, approvalRef: "x" }).armed, false);
});

test("control: localhost (149's 'sandbox' label) is a local test page too", () => {
  const board = Board.createBrowserBoard({ url: "http://localhost:4123/form", userId: "u-1" });
  assert.equal(board.armForSubmit(APPROVAL).armed, true);
});

test("fail-closed: a look-alike host is not local", () => {
  for (const url of ["https://localhost.evil.example/apply", "https://127.0.0.1.nip.io/apply"]) {
    const board = Board.createBrowserBoard({ url, userId: "u-1" });
    assert.equal(board.armForSubmit(APPROVAL).armed, false, url);
  }
});
