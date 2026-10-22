"use strict";
/* Test helper (BUG-QA-2026-10-21-01): runs the REAL board service in its
   OWN process with a stub board whose open() throws a DRIVER_ERROR with a
   distinctive message — so a test can prove what survives the wire to a
   provider client in another process. Prints "PORT <n>".
   Usage: node tests/helpers/board-service-throwing.cjs <secret> */
const path = require("node:path");
const root = path.resolve(__dirname, "..", "..");
const { startBoardService } = require(path.join(root, "workers/career-browser/board-service.cjs"));

const secret = process.argv[2] || "test-board-secret";
const MSG = "cold open exploded: proxy handshake reset (probe-bug01)";
const boardFactory = () => ({
  kind: "browser", browserDriver: true, sandbox: false, atsFamily: "greenhouse",
  host: "boards.greenhouse.io", contextId: "stub-bug01",
  open() { throw Object.assign(new Error(MSG), { code: "DRIVER_ERROR" }); },
  form() { return { fields: [] }; }, fill() {}, answers() { return {}; },
  atReview() { return { ok: true }; }, submit() {}, close() {},
});
const { server } = startBoardService({ port: 0, secret, boardFactory, familyVerdicts: { greenhouse: true }, sweepMs: 0 });
server.on("listening", () => { console.log(`PORT ${server.address().port}`); });
