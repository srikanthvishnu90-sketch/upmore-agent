// Prose lint (FIN-E-006/007): scans agent prose in conversation renders for
// internal vocabulary that must never reach a user: CIR, spec-section refs (§),
// tier codes (T1-T4 as words), status codes (approved_not_sent and other
// snake_case tokens), and raw IDs / UUIDs / variant ids.
// Usage: node scripts/career/prose-lint.cjs [file.messages.json ...]
//   With no args, scans every *.messages.json in the conversations out dir.
//   Exit 1 when any violation is found in the files given explicitly;
//   with no args it reports counts only (legacy renders predate the fix).
"use strict";
const fs = require("fs");
const path = require("path");
const RULES = [
  { id: "cir", re: /\bCIRs?\b/g, why: "internal record name — say 'company file'" },
  { id: "section-ref", re: /§\S*/g, why: "spec-section reference" },
  { id: "tier-code", re: /\bT[1-4]\b/g, why: "tier code — say it in plain words" },
  { id: "snake_case", re: /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, why: "snake_case / status code in prose" },
  { id: "uuid", re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, why: "raw UUID" },
  { id: "raw-id", re: /\b(?:ref|app|VAR|variant)-[A-Za-z0-9][A-Za-z0-9-]*\d[A-Za-z0-9-]*\b/g, why: "raw internal ID" },
];
function scanText(text) {
  text = String(text || "").replace(/https?:\/\/\S+/g, "(link)");
  const out = [];
  for (const r of RULES) { const m = text.match(r.re); if (m) for (const hit of m) out.push({ rule: r.id, token: hit, why: r.why }); }
  return out;
}
function scanRecord(rec) {
  const out = [];
  for (const m of (rec && rec.messages) || []) if (m.role === "agent" && m.text) for (const v of scanText(m.text)) out.push({ seq: m.seq, ...v });
  return out;
}
function scanFile(file) { return scanRecord(JSON.parse(fs.readFileSync(file, "utf8"))); }
if (require.main === module) {
  const args = process.argv.slice(2);
  const OUT_DIR = path.join(process.env.HOME, "workspace/your_files/upmore-career-conversations");
  const files = args.length ? args : fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".messages.json")).map((f) => path.join(OUT_DIR, f));
  let total = 0; const byRule = {};
  for (const f of files) { const v = scanFile(f); if (v.length) { total += v.length; for (const x of v) byRule[x.rule] = (byRule[x.rule] || 0) + 1; console.log(`${path.basename(f)}: ${v.length} — ${v.slice(0, 5).map((x) => `${x.rule}:${x.token}`).join(", ")}`); } }
  console.log(`prose-lint: ${files.length} file(s), ${total} violation(s) ${JSON.stringify(byRule)}`);
  if (args.length && total) process.exit(1);
}
module.exports = { scanText, scanRecord, scanFile, RULES };
