"use strict";
/* BENCH-60 harness — generic child pool (harness code, NOT product
   code). Runs a per-item node script over a JSON list with bounded
   concurrency and a per-child timeout; each child writes its own JSON
   result file; the pool aggregates them in list order.
   Usage: node pool-run.cjs <script> <list.json> <outDir> <concurrency> <timeoutMs> [extraArgs...]
   Items are {key, ...}; child argv: <script> <key> <outFile> [extraArgs...] */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const [script, listFile, outDir, concS, timeoutS, ...extra] = process.argv.slice(2);
const CONC = Math.max(1, parseInt(concS || "4", 10));
const TIMEOUT = Math.max(1000, parseInt(timeoutS || "150000", 10));
const items = JSON.parse(fs.readFileSync(listFile, "utf8"));
fs.mkdirSync(outDir, { recursive: true });
let idx = 0, active = 0, finished = 0;
const results = new Array(items.length).fill(null);
function launch() {
  while (active < CONC && idx < items.length) {
    const i = idx++; const item = items[i]; active++;
    const outFile = path.join(outDir, `item-${String(i).padStart(3, "0")}.json`);
    const child = spawn(process.execPath, [script, item.key, outFile, ...extra], { stdio: ["ignore", "ignore", "inherit"] });
    let killed = false;
    const timer = setTimeout(() => { killed = true; try { child.kill("SIGKILL"); } catch (_) {} }, TIMEOUT);
    child.on("exit", (code) => {
      clearTimeout(timer); active--; finished++;
      let r = null;
      try { r = JSON.parse(fs.readFileSync(outFile, "utf8")); } catch (_) {}
      results[i] = r || { key: item.key, ok: false, code: killed ? "POOL_TIMEOUT" : `NO_RESULT_EXIT_${code}` };
      if (finished % 10 === 0 || finished === items.length) console.log(`POOL ${finished}/${items.length}`);
      if (finished === items.length) { fs.writeFileSync(path.join(outDir, "pool-results.json"), JSON.stringify(results, null, 1)); console.log("POOL_DONE " + JSON.stringify({ total: items.length, ok: results.filter((r) => r && r.ok).length })); process.exit(0); }
      launch();
    });
  }
}
launch();
