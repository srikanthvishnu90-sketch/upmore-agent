"use strict";
// Re-run the unchanged synthetic tests against exact historical sources, without changing a checkout.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const root = path.resolve(__dirname, "../../..");
const ref = process.argv[2];
const output = process.argv[3];
if (!ref || !output) throw new Error("usage: node reproduce.cjs <git-ref> <output-directory>");
const sha = data => crypto.createHash("sha256").update(data).digest("hex");
const commit = cp.execFileSync("git", ["rev-parse", ref], { cwd: root, encoding: "utf8" }).trim();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "f007-pinned-repro-"));
const files = ["packages/domain/149-career-portal-apply.js", "packages/domain/150-career-portal-browser.js",
  "packages/domain/121-career-jobs.js", "workers/career-browser/production-sources.cjs",
  "supabase/functions/_shared/career_pool.js", "extension/lib/trainee-core.js"];
const tests = ["tests/career-portal-answer-map.test.cjs", "tests/career-f007-saved-answer-consumption.test.cjs"];
const report = { commit, sources: {}, tests: {}, results: [], synthetic_only: true, paid_cost: 0 };
fs.mkdirSync(output, { recursive: true });
try {
  for (const file of files) {
    const bytes = cp.execFileSync("git", ["show", `${commit}:${file}`], { cwd: root, maxBuffer: 8 * 1024 * 1024 });
    const target = path.join(temp, file);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
    report.sources[file] = sha(bytes);
  }
  for (const test of tests) {
    const bytes = fs.readFileSync(path.join(root, test));
    const target = path.join(temp, test);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
    report.tests[test] = sha(bytes);
    const run = cp.spawnSync(process.execPath, ["--test", "--test-reporter=tap", test],
      { cwd: temp, encoding: "utf8", env: { ...process.env, UPMORE_FACT_BANK: "" } });
    const log = run.stdout + run.stderr;
    const filename = path.basename(test) + ".log.gz";
    fs.writeFileSync(path.join(output, filename), zlib.gzipSync(log));
    report.results.push({ test, exit_code: run.status, log: filename,
      raw_log_sha256: sha(log),
      pass: Number(log.match(/^# pass (\d+)$/m)?.[1]), fail: Number(log.match(/^# fail (\d+)$/m)?.[1]),
      skipped: Number(log.match(/^# skipped (\d+)$/m)?.[1]) });
  }
  fs.writeFileSync(path.join(output, "source-evidence.json"), JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report.results) + "\n");
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
