"use strict";
/* measure-drive.cjs — THROUGHPUT LANE M3 (2026-10-21).
   One real DOORSTEP drive through the exact production assembly:
   /home/hatch/worker-config/executor-config.cjs (transport + sources
   + J9 board provider over sync HTTP to the live board service on
   :8471) -> module 149 runApply, STOPPED at the doorstep.
   armForSubmit/submit are NEVER called. The gauntlet TEST identity
   and its stored TEST profile are the driver, per the established
   doorstep pattern. Every board call is timed individually.
   Usage: node measure-drive.cjs <boardToken> <titleSubstring> [tag] */
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
const Portal = require(path.join(WT, "packages/domain/149-career-portal-apply.js"));
const { supabaseTransportFromEnv } = require(path.join(WT, "workers/career-browser/supabase-transport.cjs"));

const GAUNTLET = "2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3";
const boardToken = process.argv[2];
const titleSub = (process.argv[3] || "").toLowerCase();
const tag = process.argv[4] || "solo";
const now = () => Number(process.hrtime.bigint() / 1000000n);

(async () => {
  const transport = supabaseTransportFromEnv(process.env);
  const rows = await transport.readRows({
    table: "career_kb_postings", select: CareerPool.KB_POSTINGS_COLUMNS,
    filters: { board: { eq: boardToken } },
    order: { column: "posted_at", ascending: false, nullsFirst: false }, limit: 1000,
  });
  const postings = rows.map((r) => CareerPool.mapKbPosting(r, Jobs)).filter(Boolean);
  const posting = postings.find((p) => p.title.toLowerCase().includes(titleSub)) || postings[0];
  if (!posting) { console.error("NO_POSTING"); process.exit(1); }
  console.log(JSON.stringify({ tag, step: "target", company: posting.company, title: posting.title, url: posting.url }));

  const pack = await cfg.profileFor(GAUNTLET, { action: "prepare", runId: "throughput-measure" });
  console.log(JSON.stringify({ tag, step: "profileFor ok", hasProfile: !!pack.profile }));

  const rawBoard = cfg.boardForFor(GAUNTLET)(posting);
  const calls = [];
  const board = {};
  for (const k of Object.keys(rawBoard)) {
    const v = rawBoard[k];
    if (typeof v !== "function") { board[k] = v; continue; }
    board[k] = (...args) => {
      const a = now();
      try { const r = v(...args); calls.push({ method: k, ms: now() - a }); return r; }
      catch (e) { calls.push({ method: k, ms: now() - a, code: e && e.code }); throw e; }
    };
  }
  const session = Portal.createPortalSession({ userId: GAUNTLET, board });
  const a = now();
  let res = null; let err = null;
  try {
    res = Portal.runApply(session, { posting, profile: pack.profile, log: { records: [] }, userId: GAUNTLET, now: Date.now(), attestations: pack.attestations || {} });
  } catch (e) { err = { code: e && e.code, message: String(e && e.message).slice(0, 200) }; }
  const totalMs = now() - a;
  const byMethod = {};
  for (const c of calls) { byMethod[c.method] = byMethod[c.method] || { n: 0, ms: 0 }; byMethod[c.method].n += 1; byMethod[c.method].ms += c.ms; }
  console.log(JSON.stringify({
    tag, step: "drive complete", totalMs, boardCalls: calls.length, byMethod,
    resultStatus: res && res.resultStatus, code: res && res.code,
    filledCount: res && res.filled ? Object.keys(res.filled).length : null,
    stops: res && res.stops ? res.stops.map((s) => s.code || s.reason || "?").slice(0, 6) : undefined,
    err,
  }));
  try { board.close && board.close(); } catch (_) { /* best-effort */ }
  // the sync transport holds a worker thread; exit explicitly
  setTimeout(() => process.exit(0), 250).unref();
  process.exit(0);
})().catch((e) => { console.error("DRIVE_FAILED", e && e.code, e && e.message); process.exit(1); });
