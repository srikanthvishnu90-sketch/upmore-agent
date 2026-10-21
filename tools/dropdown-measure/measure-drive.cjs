"use strict";
/* measure-drive.cjs — DROPDOWN-MEASURE lane (2026-10-21).
   ONE doorstep drive through the exact production assembly (pattern:
   throughput-infra's profile-drive.cjs) — executor-config.cjs
   (production sources + J9 board provider over sync HTTP to the live
   board service on :8471) -> module 149 runApply with the gauntlet
   TEST profile, STOPPED at the doorstep. armForSubmit/submit are
   NEVER called.

   What this adds for the dropdown evidence base:
   - every board.fill is timed; for fields the DOM census classifies
     as dropdowns (native-select / react-select / radio), the intended
     value is recorded verbatim (dropdown answers are option texts,
     not personal data); all other fills record value LENGTH only.
   - board.answers() snapshots are captured (149's internal readback
     AND a final one after runApply returns).
   - PHASE B: dropdown fields runApply did not fill (or filled into a
     stop) are probe-filled directly through the same board session,
     one at a time, each timed, each followed by a readback. Probe
     values come ONLY from: the profile's own facts, a real option
     label from the census (native selects), or 149's own EEO decline
     default. Nothing is invented; nothing submits.

   Usage: node measure-drive.cjs <postingUrl> <censusJson> <resultsDir> */
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
const EEO_DECLINE = "Decline to self-identify";
const postingUrl = process.argv[2];
const censusPath = process.argv[3];
const resultsDir = process.argv[4];
if (!postingUrl || !resultsDir) { console.error("usage: measure-drive.cjs <postingUrl> <censusJson> <resultsDir>"); process.exit(1); }
fs.mkdirSync(resultsDir, { recursive: true });

const normLabel = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").replace(/[\s*:*]+$/, "").trim();
const census = censusPath && fs.existsSync(censusPath) ? JSON.parse(fs.readFileSync(censusPath, "utf8")) : { fields: [] };
const censusByLabel = new Map();
for (const f of census.fields || []) {
  if (!f.label) continue;
  const k = normLabel(f.label);
  if (!censusByLabel.has(k)) censusByLabel.set(k, f);
}
const now = () => Number(process.hrtime.bigint() / 1000000n);

function factOf(profile, names) {
  for (const n of names) {
    const v = n.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), profile);
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

(async () => {
  const transport = supabaseTransportFromEnv(process.env);
  const rows = await transport.readRows({
    table: "career_kb_postings", select: CareerPool.KB_POSTINGS_COLUMNS,
    order: { column: "posted_at", ascending: false, nullsFirst: false }, limit: 1000,
  });
  const postings = rows.map((r) => CareerPool.mapKbPosting(r, Jobs)).filter(Boolean);
  const jobId = (postingUrl.match(/jobs\/(\d+)/) || [])[1];
  let posting = postings.find((p) => p.url === postingUrl) || (jobId ? postings.find((p) => p.url.includes(jobId)) : null);
  if (!posting) {
    // Fall back to a server-side token filter (the recency window is
    // capped at 1,000 rows; older boards fall out of it).
    const token = new URL(postingUrl).pathname.split("/").filter(Boolean)[0];
    const rows2 = await transport.readRows({
      table: "career_kb_postings", select: CareerPool.KB_POSTINGS_COLUMNS,
      filters: { board: { eq: token } },
      order: { column: "posted_at", ascending: false, nullsFirst: false }, limit: 100,
    });
    const postings2 = rows2.map((r) => CareerPool.mapKbPosting(r, Jobs)).filter(Boolean);
    posting = postings2.find((p) => p.url === postingUrl) || (jobId ? postings2.find((p) => p.url.includes(jobId)) : null);
  }
  if (!posting) { console.error("POSTING_NOT_ON_SHELF", postingUrl); process.exit(2); }

  const pack = await cfg.profileFor(GAUNTLET, { action: "prepare", runId: "dropdown-measure" });
  const profile = pack.profile || {};
  const rawBoard = cfg.boardForFor(GAUNTLET)(posting);
  if (!rawBoard) { console.error("BOARD_NOT_WIRED"); process.exit(0); }

  const calls = [];
  const fills = [];           // every fill: {fieldId, ms, ok, err, intended?}
  let defsById = new Map();   // field_id -> def (from latest form())
  let lastInternalAnswers = null;
  let inRunApply = false;
  const board = {};
  for (const k of Object.keys(rawBoard)) {
    const v = rawBoard[k];
    if (typeof v !== "function") { board[k] = v; continue; }
    board[k] = (...args) => {
      const a = now();
      try {
        const r = v(...args);
        const ms = now() - a;
        calls.push({ method: k, ms, ok: true });
        if (k === "form" && r && Array.isArray(r.fields)) {
          defsById = new Map(r.fields.map((d) => [d.field_id, d]));
        }
        if (k === "answers" && r && typeof r === "object" && inRunApply) lastInternalAnswers = r;
        if (k === "fill") {
          const fieldId = args[0];
          const def = defsById.get(fieldId);
          const cen = def ? censusByLabel.get(normLabel(def.label)) : null;
          const isDropdown = !!(cen && ["native-select", "react-select", "radio"].includes(cen.widget));
          fills.push({
            fieldId, ms, ok: r !== null && r !== undefined, phase: inRunApply ? "runApply" : "probe",
            valueLen: args[1] == null ? 0 : String(typeof args[1] === "object" ? JSON.stringify(args[1]) : args[1]).length,
            intended: isDropdown && typeof args[1] === "string" ? args[1] : undefined,
          });
        }
        return r;
      } catch (e) {
        const ms = now() - a;
        calls.push({ method: k, ms, ok: false, code: e && e.code });
        if (k === "fill") fills.push({ fieldId: args[0], ms, ok: false, phase: inRunApply ? "runApply" : "probe", err: (e && e.code) || "ERROR" });
        throw e;
      }
    };
  }

  const session = Portal.createPortalSession({ userId: GAUNTLET, board });
  const log = { records: [] };
  inRunApply = true;
  let res = null, err = null;
  const a0 = now();
  try {
    res = Portal.runApply(session, { posting, profile, log, userId: GAUNTLET, now: Date.now(), attestations: pack.attestations || {} });
  } catch (e) { err = { code: e && e.code, message: String(e && e.message).slice(0, 200) }; }
  const runApplyMs = now() - a0;
  inRunApply = false;

  // Final readback (post-runApply state of the same board session).
  let finalAnswers = null;
  try { finalAnswers = board.answers(); } catch (e) { finalAnswers = { __error: (e && e.code) || "ERROR" }; }

  // ---- Phase B: probe fills for dropdown fields runApply left unmeasured ----
  const probeFacts = {
    country: factOf(profile, ["country", "basics.country", "profile.country"]),
    location: factOf(profile, ["location", "basics.location", "city"]),
    school: factOf(profile, ["education.school", "school", "education.institution", "university"]),
  };
  const filledOk = new Set(fills.filter((f) => f.phase === "runApply" && f.ok).map((f) => f.fieldId));
  const probes = [];
  for (const def of defsById.values()) {
    const cen = censusByLabel.get(normLabel(def.label));
    if (!cen || !["native-select", "react-select", "radio"].includes(cen.widget)) continue;
    if (filledOk.has(def.field_id) && finalAnswers && finalAnswers[def.field_id] !== undefined) continue;
    let value = null, valueSource = null;
    const confirmedAnswer = def.question_key && profile.answers && profile.answers[def.question_key] && profile.answers[def.question_key].confirmed === true
      ? profile.answers[def.question_key].value : undefined;
    if (confirmedAnswer !== undefined && typeof confirmedAnswer === "string") {
      value = confirmedAnswer; valueSource = "profile_confirmed_answer";
    } else if (def.kind === "eeo" || /gender|ethnic|race|veteran|disabilit|sexual|transgender|nationality|hispanic|orientation/i.test(def.label || "")) {
      value = EEO_DECLINE; valueSource = "eeo_decline_default";
    } else if (cen.widget === "native-select") {
      const opts = (cen.options || []).filter((o) => o.label && o.label.trim() && !/^(select|choose|please select)/i.test(o.label.trim()));
      if (probeFacts.country && /country/i.test(def.label || "")) { value = probeFacts.country; valueSource = "profile_fact"; }
      else if (opts.length) { value = opts[0].label.trim(); valueSource = "census_first_option"; }
    } else if (cen.widget === "react-select") {
      if (/country/i.test(def.label || "") && probeFacts.country) { value = probeFacts.country; valueSource = "profile_fact"; }
      else if (/school|university|college|institution/i.test(def.label || "") && probeFacts.school) { value = probeFacts.school; valueSource = "profile_fact"; }
      else if (/location|city/i.test(def.label || "") && probeFacts.location) { value = probeFacts.location; valueSource = "profile_fact"; }
    }
    if (!value) { probes.push({ fieldId: def.field_id, label: def.label, skipped: "no_probe_value" }); continue; }
    const before = fills.length;
    let fillErr = null;
    try { board.fill(def.field_id, value); } catch (e) { fillErr = (e && e.code) || "ERROR"; }
    const rec = fills[fills.length - 1];
    if (rec && fills.length > before) { rec.intended = value; rec.valueSource = valueSource; }
    let observed = null;
    try { const ans = board.answers(); observed = ans && ans[def.field_id] !== undefined ? ans[def.field_id] : null; } catch (e) { /* recorded below */ }
    probes.push({ fieldId: def.field_id, label: def.label, value, valueSource, fillErr, observed });
    if (finalAnswers && observed !== null) finalAnswers[def.field_id] = observed;
  }

  try { board.close && board.close(); } catch (_) { /* best-effort */ }

  // ---- Emit per-interaction records ----
  const records = [];
  for (const f of fills) {
    const def = defsById.get(f.fieldId);
    if (!def) continue;
    const cen = censusByLabel.get(normLabel(def.label));
    if (!cen || !["native-select", "react-select", "radio"].includes(cen.widget)) continue;
    records.push({
      company: posting.company, title: posting.title, url: posting.url,
      field_id: f.fieldId, label: def.label, kind: def.kind, required: !!def.required,
      widgetType: cen.widget, phase: f.phase,
      intended: f.intended !== undefined ? f.intended : null,
      fillOk: f.ok, fillErr: f.err || null, ms: f.ms,
      observedInternal: lastInternalAnswers && lastInternalAnswers[f.fieldId] !== undefined ? lastInternalAnswers[f.fieldId] : null,
      observedFinal: finalAnswers && finalAnswers[f.fieldId] !== undefined ? finalAnswers[f.fieldId] : null,
      censusOptions: cen.widget === "native-select" ? (cen.options || []).map((o) => o.label) : null,
    });
  }
  fs.writeFileSync(path.join(resultsDir, "records.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : ""));
  fs.writeFileSync(path.join(resultsDir, "calls.json"), JSON.stringify(calls, null, 2));
  fs.writeFileSync(path.join(resultsDir, "run-log.json"), JSON.stringify((log.records || []).map((r) => ({ step: r.step || r.type || r.event || "?", field_id: r.field_id, reason: r.reason, source: r.source })).slice(0, 200), null, 2));
  const summary = {
    lane: "DROPDOWN-MEASURE", when: new Date().toISOString(),
    target: { company: posting.company, title: posting.title, url: posting.url },
    profileKeys: Object.keys(profile), probeFactsFound: Object.fromEntries(Object.entries(probeFacts).map(([k, v]) => [k, v !== null])),
    runApplyMs, runApply: res ? { resultStatus: res.resultStatus, code: res.code, field_id: res.field_id || null, filledKeys: res.filled ? Object.keys(res.filled) : null, stops: res.stops ? res.stops.slice(0, 6) : null } : null,
    runApplyErr: err,
    defsSeen: defsById.size, dropdownRecords: records.length,
    probes: probes.map((p) => ({ fieldId: p.fieldId, skipped: p.skipped || null, valueSource: p.valueSource || null })),
    boardCalls: calls.length,
  };
  fs.writeFileSync(path.join(resultsDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
  process.exit(0);
})().catch((e) => { console.error("DRIVE_FAILED", e && e.code, e && e.message); process.exit(1); });
