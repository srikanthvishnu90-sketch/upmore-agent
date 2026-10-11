#!/usr/bin/env node
// Depth runner: proves each sub-capability's test bites (docs/depth/<ID>.md, step 2 of the depth protocol).
//   node evals/depth/run.cjs PAY-001          baseline must be all green; then each planted defect in
//                                              evals/depth/<ID>.mutations.cjs is applied to a COPY of packages/domain,
//                                              the tagged test must fail (and only because of it), the copy is discarded.
// Output: a markdown table on stdout (pasted into the depth doc) and evals/depth/results/<ID>.json. Exit 1 on any gap.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..", "..");
const id = process.argv[2]; if (!id) { console.error("usage: node evals/depth/run.cjs <CAPABILITY-ID>"); process.exit(2); }
const testFile = path.join(root, "tests", `depth-${id}.test.cjs`), mutFile = path.join(__dirname, `${id}.mutations.cjs`), docFile = path.join(root, "docs/depth", `${id}.md`);
for (const f of [testFile, mutFile, docFile]) if (!fs.existsSync(f)) { console.error("missing " + path.relative(root, f)); process.exit(2); }
const mutations = require(mutFile);
const domainDir = path.join(root, "packages/domain");

function runTests(dir) {
  const r = spawnSync(process.execPath, ["--test", testFile], { cwd: root, encoding: "utf8", env: Object.assign({}, process.env, { UPMORE_DOMAIN_DIR: dir }) });
  const out = r.stdout + r.stderr, results = {};
  for (const m of out.matchAll(/^(not ok|ok) \d+ - \[(S\d\d|ADV)\]/gm)) results[m[2]] = m[1] === "ok";
  return { results, raw: out, status: r.status };
}
function sameOneTag(results, tag) { return Object.entries(results).filter(([k, ok]) => !ok).map(([k]) => k).filter(k => k !== tag); }

const baseline = runTests(domainDir);
const tags = Object.keys(baseline.results).filter(k => k !== "ADV").sort();
const rows = [], problems = [];
if (tags.length < 15) problems.push(`only ${tags.length} tagged sub-capability tests found; the protocol needs 15`);
for (const [tag, ok] of Object.entries(baseline.results)) if (!ok) problems.push(`baseline: ${tag} fails before any defect is planted`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-depth-"));
for (const m of mutations) {
  const dir = path.join(tmp, m.id); fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(domainDir)) fs.copyFileSync(path.join(domainDir, f), path.join(dir, f));
  let applied = true, note = "";
  for (const p of m.patches) { const file = path.join(dir, p.file); const src = fs.readFileSync(file, "utf8"); const n = src.split(p.find).length - 1; if (n !== 1) { applied = false; note = `patch for ${p.file} matches ${n} times`; break; } fs.writeFileSync(file, src.replace(p.find, p.replace)); }
  let bites = false, collateral = [];
  if (applied) { const r = runTests(dir); bites = r.results[m.sub] === false; collateral = sameOneTag(r.results, m.sub).filter(t => t !== "ADV"); if (bites && !m.also_breaks) { /* ok */ } }
  const status = !applied ? "patch did not apply" : bites ? "proven" : "NOT PROVEN: test passed with the defect in place";
  if (!applied || !bites) problems.push(`${m.sub} (${m.id}): ${status}${note ? " (" + note + ")" : ""}`);
  rows.push({ sub: m.sub, id: m.id, title: m.title, defect: m.defect, test: m.test, bites, applied, collateral, status });
}
fs.rmSync(tmp, { recursive: true, force: true });

const table = ["| # | Sub-capability | What it does | Its test | The break I proved | Status |", "| --- | --- | --- | --- | --- | --- |"].concat(rows.sort((a, b) => a.sub.localeCompare(b.sub)).map(r => `| ${r.sub} | ${r.title} | ${r.test} | \`${r.sub}\` in tests/depth-${id}.test.cjs | ${r.defect} | ${r.status}${r.collateral.length ? ` (also fails ${r.collateral.join(", ")})` : ""} |`)).join("\n");
const summary = { capability: id, run_at: new Date().toISOString(), baseline_all_green: Object.values(baseline.results).every(Boolean), sub_capabilities: tags.length, proven: rows.filter(r => r.bites).length, problems, rows };
fs.mkdirSync(path.join(__dirname, "results"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "results", `${id}.json`), JSON.stringify(summary, null, 1) + "\n");
console.log(table);
console.log(`\n${id}: ${tags.length} sub-capabilities, ${summary.proven}/${rows.length} defects proven to bite, baseline ${summary.baseline_all_green ? "green" : "RED"}${problems.length ? "\nPROBLEMS:\n- " + problems.join("\n- ") : ""}`);
// Paste the table into the depth doc between the markers, so the doc never carries a hand-written claim.
const doc = fs.readFileSync(docFile, "utf8");
const marked = doc.includes("RESULTS_TABLE") ? doc.replace("RESULTS_TABLE", "<!-- results:start -->\n" + table + "\n<!-- results:end -->") : doc.replace(/<!-- results:start -->[\s\S]*<!-- results:end -->/, "<!-- results:start -->\n" + table + "\n<!-- results:end -->");
fs.writeFileSync(docFile, marked);
process.exit(problems.length ? 1 : 0);
