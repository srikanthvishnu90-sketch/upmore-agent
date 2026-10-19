// Verify harvested board candidates against each provider's public postings feed (WO-017), under the directory's
// doctrine: a board is live only if a real fetch returned its postings JSON; one gibberish token per provider is probed
// first and its answer recorded, so a provider that answers anything with 200 (SmartRecruiters) is read as
// "unverifiable" at zero postings. GET only (Workday's public job search is a POST of an empty search), polite pacing,
// no login, nothing submitted. Writes one JSON line per candidate in the format build-board-directory.mjs reads.
//   node scripts/career/verify-board-candidates.cjs [--candidates file] [--out verdicts.jsonl] [--only provider] [--limit n]
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const UA = { "user-agent": "Trainee board directory check (job alerts; contact via github.com/srikanthvishnu90-sketch/upmore-agent)", accept: "application/json" };
const URLS = {
  greenhouse: (c) => ({ url: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c.token)}/jobs` }),
  lever: (c) => ({ url: `https://api.lever.co/v0/postings/${encodeURIComponent(c.token)}?mode=json` }),
  ashby: (c) => ({ url: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(c.token)}` }),
  smartrecruiters: (c) => ({ url: `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(c.token)}/postings?limit=1` }),
  workday: (c) => ({ url: `https://${c.token}.${c.wd}.myworkdayjobs.com/wday/cxs/${c.token}/${c.site}/jobs`, method: "POST",
    body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: "" }) }),
};

// -> { verdict: live|dead|unverifiable|error, postings, board_name }
function classify(provider, status, data) {
  if (status === 0) return { verdict: "error", postings: null };
  if (status === 404 || status === 410) return { verdict: "dead", postings: null };
  if (status === 429) return { verdict: "error", postings: null, rate_limited: true };
  if (status !== 200 || data === undefined) return { verdict: provider === "workday" && (status === 422 || status === 400) ? "dead" : "error", postings: null };
  if (provider === "greenhouse" || provider === "ashby") return data && Array.isArray(data.jobs) ? { verdict: "live", postings: data.jobs.length, board_name: data.name || null } : { verdict: "error", postings: null };
  if (provider === "lever") return Array.isArray(data) ? { verdict: "live", postings: data.length } : { verdict: "error", postings: null };
  if (provider === "smartrecruiters") {
    if (!data || !Array.isArray(data.content)) return { verdict: "error", postings: null };
    const total = Number(data.totalFound) || 0;
    return total > 0 ? { verdict: "live", postings: total } : { verdict: "unverifiable", postings: 0 };
  }
  if (provider === "workday") {
    const total = Number(data && data.total);
    return Number.isFinite(total) && Array.isArray(data.jobPostings) ? (total > 0 ? { verdict: "live", postings: total } : { verdict: "unverifiable", postings: 0 }) : { verdict: "error", postings: null };
  }
  return { verdict: "error", postings: null };
}

async function probe(c, fetchFn = fetch) {
  const req = URLS[c.provider](c);
  try {
    const res = await fetchFn(req.url, { method: req.method || "GET", headers: { ...UA, ...(req.body ? { "content-type": "application/json" } : {}) }, body: req.body, signal: AbortSignal.timeout(15000), redirect: "manual" });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
    return { status: res.status, ...classify(c.provider, res.status, data) };
  } catch (e) {
    return { status: 0, verdict: "error", postings: null, error: String(e && e.message || e).slice(0, 120) };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function verifyAll(candidates, o = {}) {
  const fetchFn = o.fetch || fetch, gap = o.gapMs ?? 500, workers = o.workers ?? 2, onResult = o.onResult || (() => {});
  const byProvider = {};
  for (const c of candidates) (byProvider[c.provider] ||= []).push(c);
  const calibration = {};
  const results = [];
  await Promise.all(Object.entries(byProvider).map(async ([provider, list]) => {
    const gib = { provider, token: "zzqx-not-a-board-7f3k", wd: list[0].wd, site: "zzqx_not_a_site" };
    const cal = await probe(gib, fetchFn);
    calibration[provider] = { http: cal.status, verdict: cal.verdict };
    let next = 0, stop = false;
    await Promise.all(Array.from({ length: workers }, async () => {
      while (!stop && next < list.length) {
        const c = list[next++];
        let r = await probe(c, fetchFn);
        if (r.rate_limited) { await sleep(30000); r = await probe(c, fetchFn); if (r.rate_limited) { stop = true; } }
        // A provider whose gibberish token reads "live" proves nothing for zero-posting boards.
        if (cal.verdict === "live" && r.verdict === "live" && !(r.postings > 0)) r.verdict = "unverifiable";
        const row = { provider, token: c.token, ...(c.wd ? { wd: c.wd, site: c.site } : {}), verdict: r.verdict, http: r.status, postings: r.postings,
          board_name: r.board_name || null, company_hint: c.company_hint, source: "wo017-harvest" };
        results.push(row); onResult(row);
        await sleep(gap);
      }
    }));
    if (stop) calibration[provider].stopped = "HTTP 429 twice: provider rate-limited this run";
  }));
  return { calibration, results };
}

if (require.main === module) {
  (async () => {
    const opt = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
    const file = opt("--candidates", path.join(__dirname, "../../packages/career-data/board-candidates.json"));
    const out = opt("--out", "board-verdicts.jsonl");
    let candidates = JSON.parse(fs.readFileSync(file, "utf8")).candidates;
    if (opt("--only")) candidates = candidates.filter((c) => c.provider === opt("--only"));
    if (opt("--limit")) candidates = candidates.slice(0, Number(opt("--limit")));
    const fd = fs.openSync(out, "w");
    const started = Date.now();
    const { calibration, results } = await verifyAll(candidates, { onResult: (r) => { fs.writeSync(fd, JSON.stringify(r) + "\n"); console.log("VERDICT " + JSON.stringify(r)); } });
    fs.writeSync(fd, JSON.stringify({ calibration, probes: results.length, at: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000) }) + "\n");
    fs.closeSync(fd);
    const tally = {};
    for (const r of results) tally[`${r.provider}:${r.verdict}`] = (tally[`${r.provider}:${r.verdict}`] || 0) + 1;
    console.log("CALIBRATION " + JSON.stringify(calibration));
    console.log("TALLY " + JSON.stringify(tally));
  })();
}
module.exports = { classify, probe, verifyAll };
