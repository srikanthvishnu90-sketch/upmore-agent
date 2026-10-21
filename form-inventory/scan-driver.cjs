"use strict";
/* scan-driver.cjs — Lane G FORM INVENTORY live scan (2026-10-21).
   SCAN-ONLY pre-drive pass over real postings through the production
   assembly (executor-config: boardForFor over sync HTTP to the board
   service on :8471 + profileFor), exactly like the throughput lane's
   measure-drive.cjs — except it NEVER fills: the only board methods
   called are open / form / answers / close. fill, armForSubmit and
   submit are not referenced anywhere in this file. After each form
   read, answers() is read back: any non-empty observed value would
   prove the scan wrote something — the run record carries that
   readback per posting as the no-fill proof.

   For each posting: module 171 builds the inventory from the defs the
   board's form() returns (wire shape) and the coverage verdict against
   the gauntlet TEST profile pack (profileFor, action "prepare" — the
   pre-approval state, so attestations are empty by construction and
   attestation-required forms honestly show that stop).

   Usage: node scan-driver.cjs [nGreenhouse] [nLever]
   Writes form-inventory/runs/scan-<iso>.json and prints the card line. */
const fs = require("node:fs");
const path = require("node:path");
for (const line of fs.readFileSync("/home/hatch/worker-config/executor.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const WT = "/home/hatch/workspace/upmore-v2-candidate";
const cfg = require("/home/hatch/worker-config/executor-config.cjs");
const { CareerPool } = require(path.join(WT, "supabase/functions/_shared/career_pool.js"));
const Jobs = require(path.join(WT, "packages/domain/121-career-jobs.js"));
const { supabaseTransportFromEnv } = require(path.join(WT, "workers/career-browser/supabase-transport.cjs"));
const Inv171 = require(path.join(__dirname, "..", "packages/domain/171-career-form-inventory.js"));

const GAUNTLET = process.env.SCAN_USER || "2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3";
const N_GH = parseInt(process.argv[2] || "6", 10);
const N_LEVER = parseInt(process.argv[3] || "2", 10);
const now = () => Number(process.hrtime.bigint() / 1000000n);

function familyOf(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (/(^|\.)greenhouse\.io$/.test(h)) return "greenhouse";
    if (/(^|\.)lever\.co$/.test(h)) return "lever";
    return "other";
  } catch (_) { return "other"; }
}

(async () => {
  const transport = supabaseTransportFromEnv(process.env);
  const rows = await transport.readRows({
    table: "career_kb_postings", select: CareerPool.KB_POSTINGS_COLUMNS,
    order: { column: "posted_at", ascending: false, nullsFirst: false }, limit: 1000,
  });
  const postings = rows.map((r) => CareerPool.mapKbPosting(r, Jobs)).filter(Boolean);
  const byCompany = new Map();
  for (const p of postings) {
    const fam = familyOf(p.url);
    if (fam !== "greenhouse" && fam !== "lever") continue;
    const key = fam + ":" + p.company.toLowerCase();
    if (!byCompany.has(key)) byCompany.set(key, p);
  }
  const ghTargets = [...byCompany.values()].filter((p) => familyOf(p.url) === "greenhouse").slice(0, N_GH + 6);
  const leverTargets = [...byCompany.values()].filter((p) => familyOf(p.url) === "lever").slice(0, N_LEVER);
  console.log(JSON.stringify({ step: "targets", greenhouseCandidates: ghTargets.length, leverCandidates: leverTargets.length }));

  const pack = await cfg.profileFor(GAUNTLET, { action: "prepare", runId: "form-inventory-scan" });
  const factSet = { profile: pack.profile, attestations: pack.attestations || {} };
  console.log(JSON.stringify({ step: "profileFor ok", hasProfile: !!pack.profile, attestationKeys: Object.keys(pack.attestations || {}) }));

  const run = { started_at: new Date().toISOString(), user: GAUNTLET, scans: [], card_items: [] };
  async function scan(posting, family) {
    const rec = { company: posting.company, title: posting.title, url: posting.url, family, outcome: null };
    const a = now();
    let board = null;
    try { board = cfg.boardForFor(GAUNTLET)(posting); } catch (e) { rec.outcome = "board_for_threw"; rec.code = e && e.code; }
    if (!board) {
      rec.outcome = rec.outcome || "board_not_wired";
      rec.ms = now() - a;
      run.scans.push(rec);
      console.log(JSON.stringify({ step: "scan", company: rec.company, outcome: rec.outcome, code: rec.code || null }));
      return;
    }
    try {
      const opened = board.open();
      if (opened && opened.code) { rec.outcome = "open_refused"; rec.code = opened.code; rec.finalUrl = opened.finalUrl || null; }
      else if (opened && opened.captcha) { rec.outcome = "captcha_handoff"; }
      else {
        const formDef = board.form();
        const inventory = Inv171.inventoryFromSnapshot(formDef);
        const readback = board.answers();
        const readbackValues = Object.values(readback || {}).filter((v) => v !== undefined && v !== null && String(v).trim() !== "");
        rec.outcome = "scanned";
        rec.inventory = inventory;
        rec.readback = { keys: Object.keys(readback || {}).length, non_empty_values: readbackValues.length };
        rec.verdict = Inv171.coverageFor(inventory, factSet);
        run.card_items.push({ company: posting.company, title: posting.title, verdict: rec.verdict });
      }
    } catch (e) {
      rec.outcome = "scan_error"; rec.code = (e && e.code) || null; rec.message = String(e && e.message).slice(0, 200);
    }
    rec.ms = now() - a;
    try { board.close && board.close(); } catch (_) { /* best-effort */ }
    run.scans.push(rec);
    console.log(JSON.stringify({
      step: "scan", company: rec.company, title: rec.title, outcome: rec.outcome, code: rec.code || null,
      fields: rec.inventory ? rec.inventory.field_count : null,
      covered: rec.verdict ? rec.verdict.covered : null,
      stops: rec.verdict ? rec.verdict.stops.map((s) => s.label) : null, ms: rec.ms,
    }));
  }

  let ghScanned = 0;
  for (const p of ghTargets) {
    if (ghScanned >= N_GH) break;
    await scan(p, "greenhouse");
    const last = run.scans[run.scans.length - 1];
    if (last.outcome === "scanned") ghScanned += 1;
  }
  for (const p of leverTargets) await scan(p, "lever");

  run.card_line = Inv171.batchCoverageLine(run.card_items);
  run.finished_at = new Date().toISOString();
  fs.mkdirSync(path.join(__dirname, "runs"), { recursive: true });
  const outPath = path.join(__dirname, "runs", `scan-${run.started_at.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(outPath, JSON.stringify(run, null, 2));
  console.log(JSON.stringify({ step: "done", outPath, card_line: run.card_line }));
  setTimeout(() => process.exit(0), 250).unref();
  process.exit(0);
})().catch((e) => { console.error("SCAN_FAILED", e && e.code, e && e.message); process.exit(1); });
