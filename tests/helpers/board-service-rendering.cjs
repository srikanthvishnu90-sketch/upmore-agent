"use strict";
/* Test helper (FR-395 rendered-values proof): runs the REAL board
   service in its OWN process with a factory board that renders like a
   real widget board (module 150's contract): filling the country field
   with the confirmed fact "United States" makes the widget render its
   single-value form "+1", and the readback (answers) shows the
   RENDERING, not the profile text. RENDER_MODE selects the widget's
   behavior:
     consistent (default) — rendered "+1", readback "+1"
     drift                — rendered "+1", readback "+44" (the board
                            disagrees with its own rendering: real
                            drift, which the hatch must NOT rescue)
   Prints "PORT <n>" once listening.
   Usage: node tests/helpers/board-service-rendering.cjs <secret> */
const path = require("node:path");
const root = path.resolve(__dirname, "..", "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));
const { startBoardService } = require(path.join(root, "workers/career-browser/board-service.cjs"));

const secret = process.argv[2] || "test-board-secret";
const MODE = process.env.RENDER_MODE || "consistent";
const COUNTRY_FIELD = { field_id: "country", label: "Country", kind: "standard", profile_key: "country", required: false };

function boardFactory() {
  const base = Portal.createSandboxBoard({});
  const rendered = {};
  const board = Object.assign({}, base, { atsFamily: "greenhouse" });
  // NB: the getter must be defined, not assigned — Object.assign would
  // evaluate it once and freeze the (then-empty) snapshot.
  Object.defineProperty(board, "renderedValues", { enumerable: true, get: () => Object.assign({}, rendered) });
  board.form = () => {
    const f = base.form();
    f.fields = f.fields.concat([Object.assign({}, COUNTRY_FIELD)]);
    return f;
  };
  board.fill = (fieldId, value) => {
    const r = base.fill(fieldId, value);
    if (fieldId === "country") rendered[fieldId] = "+1";
    return r;
  };
  board.answers = () => {
    const a = base.answers();
    if (rendered.country) a.country = MODE === "drift" ? "+44" : rendered.country;
    return a;
  };
  return board;
}

const { server } = startBoardService({
  port: 0, secret, boardFactory,
  familyVerdicts: { greenhouse: true, lever: true, ashby: true }, sweepMs: 0,
});
server.on("listening", () => { console.log(`PORT ${server.address().port}`); });
