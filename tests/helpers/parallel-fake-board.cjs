"use strict";
/* parallel-fake-board.cjs — a fake module-150 board factory for the
   parallel-drives guards (tests/career-parallel-drives.test.cjs).
   Exported as a MODULE PATH target: board-service shards require it
   via boardFactoryModule (functions cannot cross worker threads).
   Each board keeps its own fill state — cross-talk between boards
   is exactly what the guards check. fill("slow", v) sleeps 250ms
   with Atomics.wait (the same blocking shape module 150's helper
   bridge has), fill("boom", v) throws a coded board error. */
let serial = 0;
const { threadId } = require("node:worker_threads");

function createFakeBoard(opts) {
  serial += 1;
  // board identity is thread-qualified: each shard thread loads its
  // own copy of this module, so a bare counter would repeat per shard
  const mine = `${threadId}:${serial}`;
  const fills = {};
  let closed = false;
  const coded = (code, message) => Object.assign(new Error(message), { code });
  return {
    atsFamily: (opts && opts.atsFamily) || "greenhouse",
    host: "boards.greenhouse.io",
    kind: "browser",
    browserDriver: true,
    renderedValues: {},
    open() { return { ok: true, captcha: null }; },
    form() { return { fields: [{ id: "name" }, { id: "slow" }, { id: "slow6" }, { id: "boom" }] }; },
    fill(fieldId, value) {
      if (closed) throw coded("BOARD_CLOSED", "the board is closed");
      if (fieldId === "boom") throw coded("BOARD_FILL_FAILED", "the fake board refuses this field");
      if (fieldId === "slow") Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      if (fieldId === "slow6") Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 6000);
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
