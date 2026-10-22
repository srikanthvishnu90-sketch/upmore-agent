"use strict";
/* Test helper (BUG-QA-2026-10-21-01 cold-start guard): runs the REAL board
   service in its OWN process with the DEFAULT factory (module 150 boards
   over the real helper + Chromium) — no factory override — so a test can
   prove a cold service's FIRST session open works.
   Prints "PORT <n>" once listening.
   Usage: node tests/helpers/board-service-cold-open.cjs <secret> */
const path = require("node:path");
const root = path.resolve(__dirname, "..", "..");
const { startBoardService } = require(path.join(root, "workers/career-browser/board-service.cjs"));

const secret = process.argv[2] || "test-board-secret";
const { server } = startBoardService({
  port: 0, secret,
  familyVerdicts: { greenhouse: true, lever: true, ashby: true, local: true },
  sweepMs: 0,
});
server.on("listening", () => { console.log(`PORT ${server.address().port}`); });
