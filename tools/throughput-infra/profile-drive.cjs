"use strict";
/* profile-drive.cjs — TP-INFRA deliverable 1 (2026-10-21).
   ONE real DOORSTEP drive through the exact production assembly
   (pattern: throughput lane's measure-drive.cjs, branch
   muse/2026-10-21-throughput) — executor-config.cjs (production
   sources + J9 board provider over sync HTTP to the live board
   service on :8471) -> module 149 runApply, STOPPED at the doorstep.
   armForSubmit/submit are NEVER called. The gauntlet TEST identity
   drives, per the standing doorstep-probe pattern.

   What this adds over measure-drive: every board call is recorded
   with epoch start/end (the analyzer's windows), fill calls record
   the field id + value LENGTH only (never the value), the form
   definition's field metadata (inputType/widget) is captured from
   board.form()'s return, and a separate sampler process
   (sample-host.cjs) records host CPU by process class + loopback
   bytes for the whole drive.

   Usage: node profile-drive.cjs <boardToken> <titleSubstring> <resultsDir> */
const fs = require("node:fs");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");
for (const line of fs.readFileSync("/home/hatch/worker-config/executor.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const WT = "/home/hatch/workspace/upmore-v2-candidate";
const cfg = require("/home/hatch/worker-config/executor-config.cjs");
const { CareerPool } = require(path.join(WT, "supabase/functions/_shared/career_pool.js"));
const Jobs = require(path.join(WT, "packages/domain/121-career-jobs.js"));
const Portal = require(path.join(WT, "packages/domain/149-career-portal-apply.js"));
const { supabaseTransportFromEnv } = require(path.join(WT, "workers/career-browser/supabase-transport.cjs"));

const GAUNTLET = "2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3";
const boardToken = process.argv[2];
const titleSub = (process.argv[3] || "").toLowerCase();
const resultsDir = process.argv[4];
if (!resultsDir) { console.error("usage: profile-drive.cjs <board> <titleSubstring> <resultsDir>"); process.exit(1); }
fs.mkdirSync(resultsDir, { recursive: true });

const boardPid = Number(execFileSync("systemctl", ["show", "-p", "MainPID", "--value", "upmore-career-board.service"]).toString().trim());
const relayPid = Number(execFileSync("systemctl", ["show", "-p", "MainPID", "--value", "upmore-egress-relay.service"]).toString().trim());
const samplesPath = path.join(resultsDir, "samples.jsonl");
const sampler = spawn(process.execPath, [path.join(__dirname, "sample-host.cjs"), samplesPath, String(boardPid), String(relayPid), String(process.pid), "100"], { stdio: "inherit" });
const stopSampler = () => { try { sampler.kill("SIGTERM"); } catch (_) { /* already gone */ } };
process.on("exit", stopSampler);

const now = () => Number(process.hrtime.bigint() / 1000000n);

(async () => {
  const transport = supabaseTransportFromEnv(process.env);
  const rows = await transport.readRows({
    table: "career_kb_postings", select: CareerPool.KB_POSTINGS_COLUMNS,
    filters: { board: { eq: boardToken } },
    order: { column: "posted_at", ascending: false, nullsFirst: false }, limit: 1000,
  });
  const postings = rows.map((r) => CareerPool.mapKbPosting(r, Jobs)).filter(Boolean);
  const posting = postings.find((p) => p.title.toLowerCase().includes(titleSub));
  if (!posting) { console.error("NO_TITLE_MATCH among", postings.length, "postings on board", boardToken); process.exit(2); }

  const pack = await cfg.profileFor(GAUNTLET, { action: "prepare", runId: "tp-infra-profile" });
  const rawBoard = cfg.boardForFor(GAUNTLET)(posting);
  if (!rawBoard) {
    fs.writeFileSync(path.join(resultsDir, "summary.json"), JSON.stringify({ resultStatus: "blocked", code: "BOARD_NOT_WIRED" }, null, 2));
    console.log("BOARD_NOT_WIRED"); process.exit(0);
  }
  const calls = [];
  let formFields = null;
  const board = {};
  for (const k of Object.keys(rawBoard)) {
    const v = rawBoard[k];
    if (typeof v !== "function") { board[k] = v; continue; }
    board[k] = (...args) => {
      const t0 = Date.now(); const a = now();
      try {
        const r = v(...args);
        const rec = { method: k, t0, t1: Date.now(), ms: now() - a };
        if (k === "fill") {
          rec.fieldId = args[0];
          rec.valueLen = args[1] == null ? 0 : String(args[1]).length;
          if (r && typeof r === "object") rec.ret = { filled: r.filled, verified: r.verified, attempts: r.attempts, reason: r.reason };
        }
        if (k === "form" && r && typeof r === "object") {
          const fields = r.fields || r.defs || null;
          if (Array.isArray(fields)) {
            formFields = fields.map((f) => ({ field_id: f.field_id || f.id || null, inputType: f.inputType || f.input_type || f.kind || null, widget: f.widget || f.widgetType || null, label: f.label || null }));
            rec.formFieldSamples = fields.slice(0, 3);
          }
          rec.fieldCount = Array.isArray(fields) ? fields.length : undefined;
        }
        calls.push(rec);
        return r;
      } catch (e) {
        calls.push({ method: k, t0, t1: Date.now(), ms: now() - a, code: e && e.code });
        throw e;
      }
    };
  }
  const session = Portal.createPortalSession({ userId: GAUNTLET, board });
  const log = { records: [] };
  const a = now();
  let res = null; let err = null;
  try {
    res = Portal.runApply(session, { posting, profile: pack.profile, log, userId: GAUNTLET, now: Date.now(), attestations: pack.attestations || {} });
  } catch (e) { err = { code: e && e.code, message: String(e && e.message).slice(0, 200) }; }
  const totalMs = now() - a;
  try { board.close && board.close(); } catch (_) { /* best-effort */ }
  stopSampler();

  const summary = {
    lane: "TP-INFRA per-fill profile", when: new Date().toISOString(),
    target: { company: posting.company, title: posting.title, url: posting.url },
    boardPid, relayPid, totalMs, err,
    resultStatus: res && res.resultStatus, code: res && res.code,
    filledCount: res && res.filled ? Object.keys(res.filled).length : null,
    stops: res && res.stops ? res.stops.map((s) => s.code || s.reason || "?").slice(0, 6) : undefined,
    formFields,
    boardCalls: calls.length,
  };
  fs.writeFileSync(path.join(resultsDir, "calls.json"), JSON.stringify(calls, null, 2));
  fs.writeFileSync(path.join(resultsDir, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(resultsDir, "run-log.json"), JSON.stringify((log.records || []).map((r) => ({ step: r.step || r.type || r.event || "?", field_id: r.field_id, reason: r.reason, source: r.source })).slice(0, 200), null, 2));
  console.log(JSON.stringify(summary));
  setTimeout(() => process.exit(0), 250).unref();
  process.exit(0);
})().catch((e) => { stopSampler(); console.error("DRIVE_FAILED", e && e.code, e && e.message); process.exit(1); });
