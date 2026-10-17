"use strict";
// B-05 staged-size staging (Crew A, 2026-10-15): stages the career-only
// deploy tree by walking the static import graph from the career entry
// (agent-chat/index-career.ts, staged as agent-chat/index.ts) — the same
// method that produced the v222 artifact (8 files, 2,011,240 B). Vendored
// from the prune lane's stage-graph.cjs so the size discipline runs in CI
// (tests/career-staged-size.test.cjs) instead of being discovered as an
// HTTP 413 at the platform.
// Usage: node stage-career.cjs <stageDir> [--json]
// Prints: files, per-mode byte total (minified when esbuild is resolvable,
// raw otherwise — raw is always >= minified, so a raw pass is safe).
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..", "..");
const FN = path.join(ROOT, "supabase", "functions");
const ENTRY = "agent-chat/index-career.ts";
const STAGE = process.argv[2];
const JSON_OUT = process.argv.includes("--json");
if (!STAGE) { console.error("usage: node stage-career.cjs <stageDir> [--json]"); process.exit(2); }

function findEsbuild() {
  const candidates = [];
  if (process.env.ESBUILD_BIN) candidates.push(process.env.ESBUILD_BIN);
  const npxRoot = path.join(process.env.HOME || "", ".npm", "_npx");
  try {
    for (const d of fs.readdirSync(npxRoot)) candidates.push(path.join(npxRoot, d, "node_modules", "@esbuild", "linux-x64", "bin", "esbuild"));
  } catch { /* no npx cache */ }
  candidates.push("esbuild");
  for (const c of candidates) {
    try { execFileSync(c, ["--version"], { stdio: "pipe" }); return c; } catch { /* try next */ }
  }
  return null;
}
const ESBUILD = findEsbuild();

const IMPORT_RE = /(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g;
function importsOf(file) {
  const src = fs.readFileSync(file, "utf8");
  const out = [];
  let m;
  while ((m = IMPORT_RE.exec(src))) {
    const spec = m[1] || m[2];
    if (spec && (spec.startsWith("./") || spec.startsWith("../"))) out.push(spec);
  }
  return out;
}

const entrySrc = path.join(FN, ENTRY);
const CONTRACTS = path.join(ROOT, 'packages', 'career-contracts');
function stageKey(absolute) {
  const real=fs.realpathSync(absolute);
  for(const [base,prefix] of [[FN,''],[CONTRACTS,'_career_contracts/']]) {
    const rel=path.relative(base,real);
    if(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel))return prefix+rel.split(path.sep).join('/');
  }
  throw Error('Import outside approved career staging roots');
}
const staged = new Map();
const queue = [["agent-chat/index.ts", entrySrc]];
while (queue.length) {
  const [key, srcAbs] = queue.pop();
  if (staged.has(key)) continue;
  staged.set(key, srcAbs);
  for (const spec of importsOf(srcAbs)) {
    const targetAbs = path.resolve(path.dirname(srcAbs), spec);
    const relKey = stageKey(targetAbs);
    queue.push([relKey, targetAbs]);
  }
}

let total = 0;
const files = [];
for (const [key, srcAbs] of [...staged.entries()].sort()) {
  const dest = path.join(STAGE, key);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let content = Buffer.from(fs.readFileSync(srcAbs,'utf8').replace(IMPORT_RE,(match,a,b)=>{
    const spec=a||b;if(!spec||!spec.startsWith('.'))return match;
    const target=stageKey(path.resolve(path.dirname(srcAbs),spec));
    let relative=path.posix.relative(path.posix.dirname(key),target);if(!relative.startsWith('.'))relative='./'+relative;
    return match.replace(spec,relative);
  }));
  if (ESBUILD && key.endsWith(".js")) {
    const tmp = dest + ".raw.js";
    fs.writeFileSync(tmp, content);
    execFileSync(ESBUILD, [tmp, "--minify-whitespace", "--outfile=" + dest], { stdio: "pipe" });
    fs.unlinkSync(tmp);
    content = fs.readFileSync(dest);
  } else {
    fs.writeFileSync(dest, content);
  }
  total += content.length;
  files.push({ path: key, bytes: content.length });
}
const report = { entry: ENTRY, mode: ESBUILD ? "minified-whitespace (esbuild)" : "RAW (esbuild unavailable — total is an upper bound)", files: files.length, totalBytes: total, fileList: files };
if (JSON_OUT) console.log(JSON.stringify(report));
else { console.log(`files: ${files.length}`); console.log(`mode: ${report.mode}`); console.log(`STAGED TOTAL: ${total} bytes`); }
