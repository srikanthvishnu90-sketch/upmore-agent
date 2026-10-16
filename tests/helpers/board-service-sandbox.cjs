"use strict";
/* Test helper (career-board-provider wire proof): runs the REAL board
   service in its OWN process, sandbox factory at the service's factory
   seam, and prints "PORT <n>" once listening. The separate process is
   the point: the synchronous HTTP transport blocks the calling thread
   on Atomics.wait by design, so its server must live on another event
   loop — the production topology, reproduced faithfully.
   Usage: node tests/helpers/board-service-sandbox.cjs <secret> */
const path = require("node:path");
const root = path.resolve(__dirname, "..", "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const { startBoardService } = require(path.join(root, "workers/career-browser/board-service.cjs"));

const secret = process.argv[2] || "test-board-secret";
function boardFactory(opts) {
  const url = (opts && opts.url) || "";
  const fam = /lever\.co/.test(url) ? "lever" : /ashbyhq\.com/.test(url) ? "ashby" : "greenhouse";
  // The loop suites' fixture-market variants, keyed by URL the same
  // way the in-process factories key them: testco11 stages a captcha
  // at open, testco7's form carries one extra required question.
  let base;
  if (/testco11/.test(url)) base = Portal.createSandboxBoard({ captchaAt: "open" });
  else base = Portal.createSandboxBoard({});
  const board = Object.assign({}, base, { atsFamily: fam });
  if (/testco7/.test(url)) {
    const origForm = board.form;
    board.form = () => { const f = origForm(); f.fields = f.fields.concat([{ field_id: "start_date", label: "Earliest start date", kind: "screening", question_key: "start_date", required: true }]); return f; };
  }
  return board;
}
const { server } = startBoardService({
  port: 0, secret, boardFactory, sweepMs: 0,
  familyVerdicts: { greenhouse: true, lever: true, ashby: true },
});
server.on("listening", () => process.stdout.write(`PORT ${server.address().port}\n`));
