"use strict";
/* handcheck.cjs — Lane G field-by-field inventory accuracy check.
   Opens ONE real posting by two independent paths:
     (A) in-process module 150 (the candidate tree's own copy — the
         same code the worker runs) via createBrowserBoard. Its
         lastObservation carries the RAW discover fields, so path A's
         inventory is built from the raw snapshot shape: control types
         and select/radio option texts included.
     (B) the board service on :8471 (production path): form() defs ->
         defs-shape inventory (control "unknown" on the wire).
   The two inventories are diffed field-by-field on (label, required,
   source kind, profile/question key). Agreement means the inventory
   module + classifier chain reproduce, from the wire defs alone, the
   same question list the raw DOM observation produces. Path A's raw
   inventory (with controls/options) is saved for the manual read.
   Scan-only: open / form / answers / close on both paths; no fill
   method is referenced. Usage: node handcheck.cjs <url> */
const fs = require("node:fs");
const path = require("node:path");
for (const line of fs.readFileSync("/home/hatch/worker-config/executor.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
process.env.UPMORE_CHROMIUM_PATH = process.env.UPMORE_CHROMIUM_PATH || "/home/hatch/worker-config/chromium-egress-wrapper.sh";
process.env.UPMORE_CHROMIUM_SANDBOX = process.env.UPMORE_CHROMIUM_SANDBOX || "off";

const WT = "/home/hatch/workspace/upmore-v2-candidate";
const Browser150 = require(path.join(WT, "packages/domain/150-career-portal-browser.js"));
const cfg = require("/home/hatch/worker-config/executor-config.cjs");
const Inv171 = require(path.join(__dirname, "..", "packages/domain/171-career-form-inventory.js"));
const GAUNTLET = "2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3";
const url = process.argv[2];
if (!url) { console.error("usage: node handcheck.cjs <posting-url>"); process.exit(2); }

(async () => {
  // ---- path B: production board service (defs over the wire) ----
  const svcBoard = cfg.boardForFor(GAUNTLET)({ url });
  if (!svcBoard) { console.error("SERVICE_BOARD_NOT_WIRED"); process.exit(1); }
  const svcOpened = svcBoard.open();
  if (svcOpened && svcOpened.code) { console.error("SERVICE_OPEN_REFUSED", svcOpened.code); process.exit(1); }
  const svcForm = svcBoard.form();
  const svcAnswers = svcBoard.answers();
  svcBoard.close();
  const invB = Inv171.inventoryFromSnapshot(svcForm);

  // ---- path A: in-process 150 (raw discover fields) ----
  const board = Browser150.createBrowserBoard({ url, userId: GAUNTLET });
  const opened = board.open();
  if (opened && opened.code) { console.error("INPROCESS_OPEN_REFUSED", opened.code); process.exit(1); }
  board.form();
  const answersA = board.answers();
  const obs = board.lastObservation || null;
  board.close();
  if (!obs || !Array.isArray(obs.fields)) { console.error("NO_RAW_OBSERVATION"); process.exit(1); }
  const invA = Inv171.inventoryFromSnapshot({ fields: obs.fields });

  const key = (f) => `${f.label}||${f.required}||${f.source_kind}||${f.profile_key || f.question_key || ""}`;
  const setA = new Map(invA.fields.map((f) => [key(f), f]));
  const setB = new Map(invB.fields.map((f) => [key(f), f]));
  const onlyA = [...setA.keys()].filter((k) => !setB.has(k));
  const onlyB = [...setB.keys()].filter((k) => !setA.has(k));
  const report = {
    url, checked_at: new Date().toISOString(),
    pathA_raw: { fields: invA.field_count, answers_keys: Object.keys(answersA || {}).length, non_empty_answers: Object.values(answersA || {}).filter((v) => v != null && String(v).trim() !== "").length },
    pathB_service: { fields: invB.field_count, answers_keys: Object.keys(svcAnswers || {}).length, non_empty_answers: Object.values(svcAnswers || {}).filter((v) => v != null && String(v).trim() !== "").length },
    agree: onlyA.length === 0 && onlyB.length === 0,
    only_inprocess_raw: onlyA, only_service_defs: onlyB,
    raw_inventory: invA.fields,
    defs_inventory: invB.fields,
  };
  const outPath = path.join(__dirname, "runs", `handcheck-${Date.now()}.json`);
  fs.mkdirSync(path.join(__dirname, "runs"), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ agree: report.agree, aFields: invA.field_count, bFields: invB.field_count, onlyA, onlyB, outPath }, null, 2));
  try { Browser150.shutdownAll(); } catch (_) { /* best-effort */ }
  setTimeout(() => process.exit(0), 250).unref();
  process.exit(0);
})().catch((e) => { console.error("HANDCHECK_FAILED", e && e.code, e && e.message); process.exit(1); });
