// Grand FRESH re-run — a NEW runner (precedent: run-rerun.cjs) that runs
// run-grand.cjs's exact logic against the CURRENT build, writing to a
// fresh evidence directory. The corrected baseline in
// upmore-career-gauntlet-300 is never overwritten: this runner points
// GAUNTLET_OUT_DIR at upmore-career-gauntlet-fresh-300, GAUNTLET_TRIAL
// stays "grand", and GAUNTLET_BUILD is the current HEAD short sha
// (computed live, so the stamp always names the build actually run).
// Usage: node run-grand-fresh.cjs [SC-001,SC-300,...]   (default: all 300)
// Implementation: read run-grand.cjs source, replace its three
// process.env assignment lines with parameterized ones, write the result
// to a temp file in this directory, and require it with process.argv set
// to the scenario list (run-grand reads process.argv[2]).
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "..", "..", "..");
const SRC = path.join(HERE, "run-grand.cjs");

const build = process.env.GAUNTLET_BUILD || execFileSync("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
const outDir = process.env.GAUNTLET_OUT_DIR || path.join(process.env.HOME, "workspace/your_files/upmore-career-gauntlet-fresh-300");
if (outDir.replace(/\/+$/, "").endsWith("upmore-career-gauntlet-300")) {
  console.error("REFUSING to write into the baseline directory upmore-career-gauntlet-300");
  process.exit(2);
}

let src = fs.readFileSync(SRC, "utf8");
const replacements = [
  ['process.env.GAUNTLET_TRIAL = "grand";', 'process.env.GAUNTLET_TRIAL = "grand";'],
  ['process.env.GAUNTLET_BUILD = "7be2759";', `process.env.GAUNTLET_BUILD = ${JSON.stringify(build)};`],
  ['process.env.GAUNTLET_OUT_DIR = require("path").join(process.env.HOME, "workspace/your_files/upmore-career-gauntlet-300");',
   `process.env.GAUNTLET_OUT_DIR = ${JSON.stringify(outDir)};`],
];
for (const [from, to] of replacements) {
  if (!src.includes(from)) { console.error("run-grand.cjs source drift: assignment line not found:", from); process.exit(2); }
  src = src.replace(from, to);
}

const tmp = path.join(HERE, ".run-grand-fresh.generated.cjs");
fs.writeFileSync(tmp, src);
process.on("exit", () => { try { fs.unlinkSync(tmp); } catch (e) { /* already gone */ } });
process.argv = [process.argv[0], tmp, ...process.argv.slice(2)];
console.log("run-grand-fresh: build=" + build, "trial=grand", "out=" + outDir, "scenarios=" + (process.argv[2] || "ALL"));
require(tmp);
