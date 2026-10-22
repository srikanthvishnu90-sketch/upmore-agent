"use strict";
/* BENCH-60 harness — pre-flight ONE candidate (harness code, NOT
   product code). A posting counts as DRIVEABLE for the bench when the
   production board provider can create a session for it, open()
   succeeds with no captcha, and form() returns at least one field —
   the exact first steps module 149's drive performs. No fills, no
   submit; the session is closed immediately.
   Usage: node preflight-one.cjs <posting_key> <out_file> */
const fs = require("node:fs");
const path = require("node:path");
for (const line of fs.readFileSync("/home/hatch/worker-config/executor.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const WT = "/home/hatch/workspace/upmore-v2-candidate";
const TEST_USER = "b2625909-d67f-41b2-8270-983d212c6052";
const KEY = process.argv[2];
const OUT = process.argv[3];
if (!KEY || !OUT) { console.error("usage: preflight-one.cjs <key> <out>"); process.exit(2); }
const done = (o) => { fs.writeFileSync(OUT, JSON.stringify(o)); process.exit(0); };
(async () => {
  const t0 = Date.now();
  const { supabaseTransportFromEnv } = require(path.join(WT, "workers/career-browser/supabase-transport.cjs"));
  const transport = supabaseTransportFromEnv(process.env);
  const { CareerPool } = require(path.join(WT, "supabase/functions/_shared/career_pool.js"));
  const Jobs = require(path.join(WT, "packages/domain/121-career-jobs.js"));
  const rows = await transport.readRows({ table: CareerPool.KB_POSTINGS_TABLE, select: CareerPool.KB_POSTINGS_COLUMNS, filters: { posting_key: { eq: KEY } }, limit: 1 });
  const posting = rows && rows[0] ? CareerPool.mapKbPosting(rows[0], Jobs) : null;
  if (!posting) return done({ key: KEY, ok: false, code: "POSTING_NOT_FOUND", ms: Date.now() - t0 });
  const operatorCfg = require("/home/hatch/worker-config/executor-config.cjs");
  let board = null;
  try {
    board = operatorCfg.boardForFor(TEST_USER)(posting);
    if (!board) {
      // createCareerBoardFor swallows the provider's coded refusal into
      // null (bridge design). Probe the create seam raw to name it.
      const http = require("node:http");
      const cfg = require("/home/hatch/worker-config/board-config.cjs");
      const probe = await new Promise((resolve) => {
        const req = http.request({ host: "127.0.0.1", port: 8471, path: "/board-sessions", method: "POST", headers: { "content-type": "application/json", "x-upmore-board-secret": cfg.secret }, agent: false, timeout: 30000 }, (res) => {
          const c = []; res.on("data", (d) => c.push(d));
          res.on("end", () => { let b = null; try { b = JSON.parse(Buffer.concat(c).toString("utf8")); } catch (_) {} resolve({ status: res.statusCode, body: b }); });
        });
        req.on("timeout", () => { req.destroy(); resolve({ status: "timeout" }); });
        req.on("error", (e) => resolve({ status: "ERR:" + e.code }));
        req.end(JSON.stringify({ userId: TEST_USER, url: posting.url }));
      });
      if (probe.status === 201 && probe.body && probe.body.sessionId) {
        await new Promise((resolve) => {
          const req = http.request({ host: "127.0.0.1", port: 8471, path: `/board-sessions/${probe.body.sessionId}/close`, method: "POST", headers: { "content-type": "application/json", "x-upmore-board-secret": cfg.secret }, agent: false, timeout: 10000 }, (res) => { res.resume(); res.on("end", resolve); });
          req.on("error", resolve); req.end(JSON.stringify({ userId: TEST_USER }));
        });
        return done({ key: KEY, company: posting.company, title: posting.title || posting.role, ok: false, code: "WRAPPER_NULL_BUT_CREATE_OK", note: "raw create answered 201 while the bridged boardFor returned null in this process", ms: Date.now() - t0 });
      }
      return done({ key: KEY, company: posting.company, title: posting.title || posting.role, ok: false, code: "CREATE_REFUSED", httpStatus: probe.status, serviceError: probe.body && probe.body.error, serviceReason: probe.body && probe.body.reason, ms: Date.now() - t0 });
    }
    const opened = board.open();
    if (!opened || opened.ok !== true) return done({ key: KEY, company: posting.company, title: posting.title || posting.role, ok: false, code: "OPEN_NOT_OK", captcha: (opened && opened.captcha) || null, ms: Date.now() - t0 });
    if (opened.captcha) return done({ key: KEY, company: posting.company, title: posting.title || posting.role, ok: false, code: "CAPTCHA_AT_OPEN", captcha: opened.captcha, ms: Date.now() - t0 });
    const form = board.form();
    const fields = form && Array.isArray(form.fields) ? form.fields.length : 0;
    return done({ key: KEY, company: posting.company, title: posting.title || posting.role, ok: fields > 0, code: fields > 0 ? "DRIVEABLE" : "EMPTY_FORM", fields, ms: Date.now() - t0 });
  } catch (e) {
    return done({ key: KEY, company: posting.company, title: posting.title || posting.role, ok: false, code: (e && e.code) || "ERROR", message: String(e && e.message).slice(0, 160), ms: Date.now() - t0 });
  } finally {
    try { if (board) board.close(); } catch (_) {}
  }
})().catch((e) => done({ key: KEY, ok: false, code: (e && e.code) || "ERROR", message: String(e && e.message).slice(0, 160), ms: null }));
