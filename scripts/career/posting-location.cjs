// WO-053 data (architect, CI only): a posting's own location text, as its ATS's public API gives it and its page shows it
// (Greenhouse "Costa Mesa, California, United States; Fort Collins, Colorado, United States", Lever "Atlanta, GA", Ashby
// "San Francisco" and its other locations). Read, never inferred: a posting the API no longer lists keeps no location.
//   node scripts/career/posting-location.cjs <questions.json>... <out.json>
// backfills the captured samples (evals/apply/questions-ci*.json) by each posting's source_url, one GET per posting
// (Ashby: one per board), 2 s apart.
"use strict";
const fs = require("node:fs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { "user-agent": "Trainee posting locations (read-only; github.com/srikanthvishnu90-sketch/upmore-agent)", accept: "application/json" };
const text = (xs) => [...new Set(xs.map((x) => String(x || "").trim()).filter(Boolean))].join("; ");

// The location text of one posting, from the JSON its ATS's public API returns for it (a list entry or the posting).
function locationOf(family, p) {
  if (!p) return null;
  if (family === "greenhouse") return text([p.location && p.location.name]) || null;
  if (family === "lever") {
    const c = p.categories || {};
    return text(Array.isArray(c.allLocations) && c.allLocations.length ? c.allLocations : [c.location]) || null;
  }
  if (family === "ashby") return text([p.location, ...(p.secondaryLocations || []).map((x) => x && (x.location || x.locationName))]) || null;
  return null;
}

// Where the public API for one captured posting is, from its application page's URL.
function apiFor(family, sourceUrl) {
  const u = new URL(sourceUrl), seg = u.pathname.split("/").filter(Boolean);
  if (family === "greenhouse" && seg[1] === "jobs") return { url: `https://boards-api.greenhouse.io/v1/boards/${seg[0]}/jobs/${seg[2]}`, id: seg[2] };
  if (family === "lever") return { url: `https://api.lever.co/v0/postings/${seg[0]}/${seg[1]}?mode=json`, id: seg[1] };
  if (family === "ashby") return { url: `https://api.ashbyhq.com/posting-api/job-board/${seg[0]}`, id: seg[1], board: seg[0] };
  return null;
}

async function backfill(postings, fetchFn = fetch, gapMs = 2000) {
  const out = {}, boards = new Map();
  for (const p of postings) {
    const api = apiFor(p.family, p.source_url);
    if (!api) { out[p.id] = { location: null, status: "NO_API" }; continue; }
    try {
      let json;
      if (api.board && boards.has(api.board)) json = boards.get(api.board);
      else {
        await sleep(gapMs);
        const res = await fetchFn(api.url, { headers: UA, signal: AbortSignal.timeout(15000) });
        if (res.status !== 200) { out[p.id] = { location: null, status: "HTTP_" + res.status }; continue; }
        json = await res.json();
        if (api.board) boards.set(api.board, json);
      }
      const posting = api.board ? (json.jobs || []).find((j) => String(j.id) === api.id) : json;
      const location = locationOf(p.family, posting);
      out[p.id] = { location, status: posting ? (location ? "OK" : "NO_LOCATION") : "NOT_LISTED" };
    } catch (e) {
      out[p.id] = { location: null, status: "ERROR " + String(e && e.message || e).slice(0, 80) };
    }
    console.log("LOCATION " + JSON.stringify({ id: p.id, ...out[p.id] }));
  }
  return out;
}

if (require.main === module) {
  const args = process.argv.slice(2), outFile = args.pop();
  (async () => {
    const result = { version: 1, note: "Each posting's own location text from its ATS's public API, fetched after capture (WO-053). null: the API no longer lists the posting.", by_id: {} };
    for (const f of args) Object.assign(result.by_id, await backfill(JSON.parse(fs.readFileSync(f, "utf8")).postings));
    fs.writeFileSync(outFile, JSON.stringify(result, null, 1) + "\n");
    const all = Object.values(result.by_id);
    console.log(`LOCATIONS ${all.filter((x) => x.location).length} of ${all.length}`);
  })().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { locationOf, apiFor, backfill };
