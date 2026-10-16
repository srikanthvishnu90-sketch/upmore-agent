"use strict";
// Mutations are isolated source copies; the checkout and frozen expectations
// are never edited. Each defect must fail its owning assertion, not just load.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const original = fs.readFileSync(path.join(root, "packages/domain/154-career-recommendations.js"), "utf8");
const mutations = [
  ["C2-01", '(!f.status || f.status === "confirmed")', 'true'],
  ["C2-02", 'text: facts.length ? `Your confirmed record contains', 'text: true ? `Your record — a CS degree in progress, Python, and a built project — evidences the researcher toolkit directly. Your confirmed record contains'],
  ["C2-03", 'fact_id: factId(f)', 'fact_id: "WRONG-CITATION"'],
  ["C2-04", 'return selected.map((r) => ({ ...r, signals: r.signals.slice(), skills: r.skills.slice(), status:', 'return selected.map((r) => ({ ...r, signals: r.signals.slice(), skills: r.skills.slice(), id: "software-engineering", status:'],
  ["C2-05", 'status: ids.length ? "evidence_present"', 'status: true ? "evidence_present"'],
  ["C2-06", 'level: ["required", "preferred"].includes(r.level) ? r.level : "unknown"', 'level: "preferred"'],
  ["C2-07", '? c.requirementLevel : "unknown"', '? c.requirementLevel : "preferred"'],
  ["C2-08", 'let locations = unique(list(ctx.locations || prefs.locations).map(str).filter(Boolean));', 'let locations = p.basics && p.basics.location ? [p.basics.location] : [];'],
  ["C2-09", 'if (scope.remoteOnly && mode !== "remote")', 'if (false && scope.remoteOnly && mode !== "remote")'],
  ["C2-10", 'if (fixture) reason = "fixture_or_unverified_source";', 'if (false) reason = "fixture_or_unverified_source";'],
  ["C2-11", 'age > 24 * 60 * 60 * 1000', 'age > 365 * 24 * 60 * 60 * 1000'],
  ["C2-12", 'gaps: requirementGaps(ctx.profile, row)', 'gaps: []'],
  ["C2-13", 'if ((ctx.needsIncome || cons.needsIncome) && row.paid !== true)', 'if (false && (ctx.needsIncome || cons.needsIncome) && row.paid !== true)'],
  ["C2-14", 'return { ...result, profile, confirmationRequired: true', 'for (const f of profile.facts) { f.needs_confirmation = false; f.status = "confirmed"; } return { ...result, profile, confirmationRequired: true'],
  ["C2-15", 'if (/\\b(apply|submit|send|email|watch|watches|watching|alerts?|pause|stop|delete)\\b/.test(t)) return null;', 'if (false) return null;'],
];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "capability2-mutations-"));
try {
  const rows = [];
  for (const [id, before, after] of mutations) {
    if (!original.includes(before)) throw new Error(id + " mutation anchor missing");
    const file = path.join(dir, id + ".cjs");
    const code = original.replace(before, after).replace('require("./122-career-profile.js")', `require(${JSON.stringify(path.join(root, "packages/domain/122-career-profile.js"))})`);
    fs.writeFileSync(file, code);
    const env = { ...process.env, CAPABILITY2_MODULE: file }; delete env.CAPABILITY2_EVIDENCE_DIR;
    const run = spawnSync(process.execPath, ["--test", "--test-name-pattern=" + id + ":", "tests/capability2-grounding.test.cjs"], { cwd: root, encoding: "utf8", env });
    const log = run.stdout + run.stderr;
    const caught = run.status !== 0 && /AssertionError/.test(log) && !/SyntaxError|MODULE_NOT_FOUND|ReferenceError/.test(log);
    rows.push({ id, caught, exit_code: run.status, log });
    console.log(`${id}: ${caught ? "CAUGHT" : "MISSED"}`);
  }
  if (process.env.CAPABILITY2_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.CAPABILITY2_EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.CAPABILITY2_EVIDENCE_DIR, "mutations.json"), JSON.stringify(rows, null, 2) + "\n");
  }
  console.log(`${rows.filter((r) => r.caught).length}/${rows.length} planted defects caught by their targeted assertions`);
  if (rows.some((r) => !r.caught)) process.exitCode = 1;
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
