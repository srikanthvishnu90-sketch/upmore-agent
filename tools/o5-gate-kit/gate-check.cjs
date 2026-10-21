"use strict";
// O5 M0 DEPLOY GATE — re-verify any candidate commit for the agent-chat deploy
// in minutes. Built 2026-10-21 after the 50fea733 deploy STOPPED at this gate:
// that tree carried the v247 privacy fix but NOT the v248 goal frame, and its
// career_host mergeStatedFacts still let a stale thread copy override the
// account record (the judge's round-1 FAIL shape).
//
// Usage:
//   node tools/o5-gate-kit/gate-check.cjs <commit-sha> [options]
// Options:
//   --repo <path>        repo/worktree of upmore-agent (default: this repo)
//   --runs-dir <path>    where stages are built (default ~/workspace/gate-kit-runs)
//   --stage-graph <path> staging recipe (default ~/workspace/prune-lane/stage-graph.cjs)
//   --ref-stage <path>   reference stage to diff against (default ~/workspace/stage-cea914fe)
//   --keep-worktree      do not remove the detached worktree after staging
//
// Exit code: 0 = GATE PASS, 1 = GATE FAIL, 2 = gate itself could not run.
//
// THE CHECKS (run on the STAGED bundle — what would actually deploy):
//   1. CORRECTION_STORE occurrences in router_core.career.js + career_host.js == 0
//      (v247 privacy fix: the process-global correction store must stay gone)
//   2. correctionKey occurrences == 0 (same fix, its key helper)
//   3. career_goal_record occurrences >= 1 (v248 goal-frame capture intent)
//   4. career_goal_recall occurrences >= 1 (v248 goal-frame recall intent)
//   5. career_host mergeStatedFacts thread pass is APPEND-ONLY (see below)
//   Plus a byte diff of the whole stage against the v248 reference stage.
//
// HOW CHECK 5 DETECTS THE threadWins ANTI-PATTERN:
//   In BOTH the broken and fixed hosts, the helper is defined as
//     pushKeyed=(f,threadWins)=>{ ... if(threadWins) out[i]=cloneJson(f) ... }
//   so the mere presence of `threadWins` or of `out[i]=` inside the helper body
//   proves nothing. The bug lives at the CALL SITES in the thread-facts pass:
//     BROKEN (50fea733): the thread pass calls pushKeyed(f,true) — a thread copy
//       of a keyed fact REPLACES the account's — and its
//       ACCOUNT_SINGLE_FACT_KINDS branch replaces an existing entry by index
//       (out[i]=cloneJson(f)) instead of only appending absent kinds.
//     FIXED (cea914fe): the thread pass calls pushKeyed(f,false) exactly like
//       the account pass, and its single-kind branch only appends a kind the
//       account set does not already hold (guarded by !out.some(...)).
//   The detector therefore slices the mergeStatedFacts function body out of the
//   staged career_host.js (from "function mergeStatedFacts(" to the following
//   "const STATED_FACT_SQL_KINDS"), then slices the thread pass (from
//   "for(const f of Array.isArray(threadFacts)" to the end of the function)
//   and requires ALL of:
//     a. the whole function contains ZERO occurrences of "pushKeyed(f,true)"
//     b. the thread pass contains "pushKeyed(f,false)"
//     c. the thread pass contains NO indexed replacement /out\[[^\]]+\]\s*=/
//        (the helper body's own out[i]= sits in the ACCOUNT-side slice of the
//        function text — the helper is defined before both passes — so it is
//        never inside the thread-pass slice)

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const SHA_IN = process.argv[2];
if (!SHA_IN || SHA_IN.startsWith("--")) {
  console.error("usage: node gate-check.cjs <commit-sha> [--repo <path>] [--runs-dir <path>] [--stage-graph <path>] [--ref-stage <path>] [--keep-worktree]");
  process.exit(2);
}
const REPO = path.resolve(arg("--repo", path.resolve(__dirname, "..", "..")));
const RUNS = path.resolve(arg("--runs-dir", path.join(process.env.HOME, "workspace", "gate-kit-runs")));
const STAGE_GRAPH = arg("--stage-graph", path.join(process.env.HOME, "workspace", "prune-lane", "stage-graph.cjs"));
const REF_STAGE = arg("--ref-stage", path.join(process.env.HOME, "workspace", "stage-cea914fe"));
const KEEP_WT = process.argv.includes("--keep-worktree");

function git(args, opts) {
  return execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8", ...opts }).trim();
}
function countOccurrences(text, token) {
  if (!text) return 0;
  return text.split(token).length - 1;
}
function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}
function walk(dir, base, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const rel = base ? base + "/" + name : name;
    if (fs.statSync(p).isDirectory()) walk(p, rel, out);
    else out.set(rel.split(path.sep).join("/"), p);
  }
  return out;
}

let full;
try {
  full = git(["rev-parse", SHA_IN + "^{commit}"]);
} catch {
  console.error(`gate could not run: unknown commit ${SHA_IN} in ${REPO}`);
  process.exit(2);
}
const short = full.slice(0, 8);
const wt = path.join(RUNS, short + "-wt");
const stageDir = path.join(RUNS, short);
fs.mkdirSync(RUNS, { recursive: true });
if (fs.existsSync(wt)) { try { git(["worktree", "remove", "--force", wt]); } catch { /* stale dir; rm below handles it */ } }
fs.rmSync(wt, { recursive: true, force: true });
fs.rmSync(stageDir, { recursive: true, force: true });

console.log(`staging ${full} via stage-graph.cjs ...`);
git(["worktree", "add", "--detach", wt, full], { stdio: "pipe" });
try {
  execFileSync("node", [STAGE_GRAPH, wt, "agent-chat/index-career.ts", stageDir, "all-js"], { stdio: "pipe" });
} finally {
  if (!KEEP_WT) { try { git(["worktree", "remove", "--force", wt]); } catch { /* leave for inspection */ } }
}

const routerPath = path.join(stageDir, "_shared", "router_core.career.js");
const hostPath = path.join(stageDir, "_shared", "career_host.js");
const router = fs.existsSync(routerPath) ? fs.readFileSync(routerPath, "utf8") : "";
const host = fs.existsSync(hostPath) ? fs.readFileSync(hostPath, "utf8") : "";

const checks = [];
function check(id, ok, detail) { checks.push({ id, ok, detail }); }

const csR = countOccurrences(router, "CORRECTION_STORE"), csH = countOccurrences(host, "CORRECTION_STORE");
check("CORRECTION_STORE_ABSENT", csR + csH === 0, `occurrences router=${csR} host=${csH} (required total 0)`);
const ckR = countOccurrences(router, "correctionKey"), ckH = countOccurrences(host, "correctionKey");
check("CORRECTION_KEY_ABSENT", ckR + ckH === 0, `occurrences router=${ckR} host=${ckH} (required total 0)`);
const grR = countOccurrences(router, "career_goal_record"), grH = countOccurrences(host, "career_goal_record");
check("GOAL_RECORD_PRESENT", grR + grH >= 1, `occurrences router=${grR} host=${grH} (required >= 1)`);
const gcR = countOccurrences(router, "career_goal_recall"), gcH = countOccurrences(host, "career_goal_recall");
check("GOAL_RECALL_PRESENT", gcR + gcH >= 1, `occurrences router=${gcR} host=${gcH} (required >= 1)`);

// Check 5: append-only thread pass in mergeStatedFacts (method in header).
let mergeDetail;
const fnStart = host.indexOf("function mergeStatedFacts(");
const fnEnd = fnStart >= 0 ? host.indexOf("const STATED_FACT_SQL_KINDS", fnStart) : -1;
if (fnStart < 0 || fnEnd < 0) {
  mergeDetail = "mergeStatedFacts not found in expected shape in staged career_host.js";
  check("HOST_MERGE_APPEND_ONLY", false, mergeDetail);
} else {
  const fnBody = host.slice(fnStart, fnEnd);
  const threadAt = fnBody.indexOf("for(const f of Array.isArray(threadFacts)");
  const threadPass = threadAt >= 0 ? fnBody.slice(threadAt) : "";
  const trueCalls = countOccurrences(fnBody, "pushKeyed(f,true)");
  const threadFalse = threadPass.includes("pushKeyed(f,false)");
  const indexedReplace = /out\[[^\]]+\]\s*=/.test(threadPass);
  const ok = trueCalls === 0 && threadFalse && !indexedReplace && threadAt >= 0;
  mergeDetail = `pushKeyed(f,true) in function=${trueCalls} (required 0); thread pass calls pushKeyed(f,false)=${threadFalse}; thread pass indexed replacement out[i]= present=${indexedReplace} (required false)`;
  check("HOST_MERGE_APPEND_ONLY", ok, mergeDetail);
}

// Stage diff vs the v248 reference stage.
const candFiles = walk(stageDir, "", new Map());
const refFiles = fs.existsSync(REF_STAGE) ? walk(REF_STAGE, "", new Map()) : new Map();
let totalBytes = 0;
for (const p of candFiles.values()) totalBytes += fs.statSync(p).size;
const differing = [], onlyCand = [], onlyRef = [];
let identical = 0;
for (const [rel, p] of candFiles) {
  if (!refFiles.has(rel)) onlyCand.push(rel);
  else if (sha256File(p) !== sha256File(refFiles.get(rel))) differing.push(rel);
  else identical++;
}
for (const rel of refFiles.keys()) if (!candFiles.has(rel)) onlyRef.push(rel);

const failures = checks.filter((c) => !c.ok).map((c) => c.id);
const named = [];
if (failures.includes("GOAL_RECORD_PRESENT") || failures.includes("GOAL_RECALL_PRESENT")) named.push("GOAL_FRAME_MISSING");
if (failures.includes("HOST_MERGE_APPEND_ONLY")) named.push("HOST_MERGE_THREAD_WINS");
if (failures.includes("CORRECTION_STORE_ABSENT") || failures.includes("CORRECTION_KEY_ABSENT")) named.push("PRIVACY_FIX_REGRESSED");
const pass = failures.length === 0;

console.log("");
console.log("================ O5 GATE VERDICT ================");
console.log(`target:  ${full}`);
console.log(`stage:   ${stageDir} (${candFiles.size} files, ${totalBytes} B)`);
for (const c of checks) console.log(`[${c.ok ? "PASS" : "FAIL"}] ${c.id}: ${c.detail}`);
console.log(`stage diff vs ${REF_STAGE}: identical=${identical} differing=${differing.length} only-in-candidate=${onlyCand.length} only-in-reference=${onlyRef.length}`);
if (differing.length) console.log(`  differing: ${differing.join(", ")}`);
if (onlyCand.length) console.log(`  only-in-candidate (${onlyCand.length}): ${onlyCand.slice(0, 12).join(", ")}${onlyCand.length > 12 ? ", ..." : ""}`);
if (onlyRef.length) console.log(`  only-in-reference: ${onlyRef.join(", ")}`);
console.log(pass ? "GATE: PASS" : `GATE: FAIL (${named.join(", ")})`);
console.log("=================================================");
process.exit(pass ? 0 : 1);
