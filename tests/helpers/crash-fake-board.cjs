"use strict";
/* crash-fake-board.cjs — a fake module-150 board factory for the
   bench-60 fix guards (tests/career-bench60-fixes.test.cjs). Exported
   as a MODULE PATH target: board-service shards require it via
   boardFactoryModule (functions cannot cross worker threads).
   fill("crashme", v) throws the measured bench crash signature
   (DRIVER_ERROR, "Target crashed"); fill("boom", v) throws an
   ordinary live-board refusal (BOARD_FILL_FAILED) that must never
   reap; fill("gone", v) throws DRIVER_TIMEOUT (150 killed the
   helper — the page died with it). */
let serial = 0;
const { threadId } = require("node:worker_threads");
const coded = (code, message) => Object.assign(new Error(message), { code });

function createFakeBoard(opts) {
  serial += 1;
  const mine = `${threadId}:${serial}`;
  const fills = {};
  let closed = false;
  return {
    atsFamily: (opts && opts.atsFamily) || "greenhouse",
    host: "boards.greenhouse.io",
    kind: "browser",
    browserDriver: true,
    renderedValues: {},
    open() { return { ok: true, captcha: null }; },
    form() { return { fields: [{ id: "name" }, { id: "crashme" }, { id: "boom" }, { id: "gone" }] }; },
    fill(fieldId, value) {
      if (closed) throw coded("BOARD_CLOSED", "the board is closed");
      if (fieldId === "crashme") throw coded("DRIVER_ERROR", "elementHandle.evaluate: Target crashed");
      if (fieldId === "boom") throw coded("BOARD_FILL_FAILED", "the fake board refuses this field");
      if (fieldId === "gone") throw coded("DRIVER_TIMEOUT", "browser helper did not answer 'fill' in 60000ms; helper terminated");
      fills[fieldId] = value;
      return { ok: true };
    },
    answers() { return Object.assign({ __board: mine }, fills); },
    atReview() { return { ok: true, captcha: null }; },
    submit() { throw coded("SUBMIT_NOT_IN_TEST", "the fake board never submits"); },
    submissionState() { return { state: "not_submitted" }; },
    close() { closed = true; },
  };
}

module.exports = createFakeBoard;
module.exports.createBoard = createFakeBoard;
