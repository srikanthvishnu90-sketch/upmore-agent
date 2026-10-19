// WO-009b-6 data (architect, CI only): for each Greenhouse source, one GET of the board API's public questions for that
// posting (boards-api.greenhouse.io/v1/boards/{token}/jobs/{id}?questions=true), 2 s apart, saved as returned.
//   node scripts/career/capture-greenhouse-questions.cjs <sources.json> <out-dir>
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { "user-agent": "Trainee question coverage (read-only; github.com/srikanthvishnu90-sketch/upmore-agent)", accept: "application/json" };

async function captureAll(sources, outDir, fetchFn = fetch, gapMs = 2000) {
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const s of sources.filter((x) => x.family === "greenhouse" && x.questions_url)) {
    const u = new URL(s.questions_url);
    if (u.protocol !== "https:" || u.hostname !== "boards-api.greenhouse.io") throw new Error("GREENHOUSE_API_URL_REQUIRED");
    let status = 0, error = null;
    try {
      const res = await fetchFn(u.href, { headers: UA, signal: AbortSignal.timeout(15000) });
      status = res.status;
      if (status === 200) fs.writeFileSync(path.join(outDir, s.id + ".questions.json"), JSON.stringify(await res.json()) + "\n");
    } catch (e) { error = String(e && e.message || e).slice(0, 120); }
    results.push({ id: s.id, status, error });
    console.log("QUESTIONS " + JSON.stringify({ id: s.id, status, error }));
    await sleep(gapMs);
  }
  return results;
}

if (require.main === module) {
  const [sourcesFile, outDir] = process.argv.slice(2);
  captureAll(JSON.parse(fs.readFileSync(sourcesFile, "utf8")), outDir).catch((e) => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { captureAll };
