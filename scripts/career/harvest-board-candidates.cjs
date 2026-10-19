// Harvest employer job boards from public application links (WO-017). Community-maintained listing files (for example
// SimplifyJobs' New-Grad-Positions and Summer internship lists, MIT-licensed, updated daily) link straight to employers'
// own application pages; the board token is in each URL. This reads those files, keeps the (provider, token) pairs we do
// not already watch, and writes them as candidates to verify. Nothing here touches a job site.
//   node scripts/career/harvest-board-candidates.cjs <listings.json>... [--out packages/career-data/board-candidates.json]
"use strict";
const fs = require("node:fs");
const path = require("node:path");

// One pattern per provider, matched on the listing's application URL. Workday tenants are kept with their data center
// (wdN) and career site, which its public job search needs; Workday has no reader yet, so its candidates are recorded,
// never watched.
const PATTERNS = [
  ["greenhouse", /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?!embed\b)([A-Za-z0-9_-]+)/i],
  ["greenhouse", /greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([A-Za-z0-9_-]+)/i],
  ["lever", /jobs\.(?:eu\.)?lever\.co\/([A-Za-z0-9_.-]+)/i],
  ["ashby", /jobs\.ashbyhq\.com\/([A-Za-z0-9_.%-]+)/i],
  ["smartrecruiters", /(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/i],
  ["workday", /([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/i],
];
const NOT_A_BOARD = new Set(["greenhouse:v1", "greenhouse:embed", "lever:v0", "ashby:api"]);

function parseUrl(url) {
  for (const [provider, re] of PATTERNS) {
    const m = re.exec(String(url || ""));
    if (!m) continue;
    if (provider === "workday") return { provider, token: m[1].toLowerCase(), wd: m[2].toLowerCase(), site: m[3] };
    const token = decodeURIComponent(m[1]).replace(/\.$/, "");
    if (NOT_A_BOARD.has(`${provider}:${token.toLowerCase()}`)) return null;
    return { provider, token };
  }
  return null;
}

function harvest(files, directory) {
  const have = new Set((directory.boards || []).map((b) => `${b.provider}:${String(b.board_token).toLowerCase()}`));
  const found = new Map();
  for (const f of files) {
    const listings = JSON.parse(fs.readFileSync(f, "utf8"));
    for (const x of listings) {
      const p = parseUrl(x.url);
      if (!p) continue;
      const key = p.provider === "workday" ? `workday:${p.token}:${p.site.toLowerCase()}` : `${p.provider}:${p.token.toLowerCase()}`;
      if (p.provider !== "workday" && have.has(key)) continue;
      const updated = Number(x.date_updated || x.date_posted || 0);
      const c = found.get(key) || { ...p, companies: new Set(), listings: 0, active_listings: 0, last_listing_at: 0, sources: new Set() };
      c.companies.add(String(x.company_name || "").trim());
      c.listings += 1;
      if (x.active) c.active_listings += 1;
      c.last_listing_at = Math.max(c.last_listing_at, updated);
      c.sources.add(path.basename(path.dirname(path.dirname(path.dirname(f)))) || f);
      found.set(key, c);
    }
  }
  return [...found.values()]
    .map((c) => ({ provider: c.provider, token: c.token, ...(c.provider === "workday" ? { wd: c.wd, site: c.site } : {}),
      company_hint: [...c.companies].filter(Boolean).sort()[0] || c.token, listings: c.listings, active_listings: c.active_listings,
      last_listing: c.last_listing_at ? new Date(c.last_listing_at * 1000).toISOString().slice(0, 10) : null, sources: [...c.sources].sort() }))
    .sort((a, b) => a.provider.localeCompare(b.provider) || b.listings - a.listings || a.token.localeCompare(b.token));
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args.splice(outIdx, 2)[1] : path.join(__dirname, "../../packages/career-data/board-candidates.json");
  if (!args.length) { console.error("usage: harvest-board-candidates.cjs <listings.json>... [--out file]"); process.exit(2); }
  const directory = JSON.parse(fs.readFileSync(path.join(__dirname, "../../packages/career-data/board-directory.json"), "utf8"));
  const candidates = harvest(args, directory);
  const byProvider = candidates.reduce((m, c) => ((m[c.provider] = (m[c.provider] || 0) + 1), m), {});
  fs.writeFileSync(out, JSON.stringify({ meta: { harvested_at: new Date().toISOString().slice(0, 10), from: "public application links in community listing files (SimplifyJobs New-Grad-Positions and Summer2026-Internships, .github/scripts/listings.json)", note: "candidates only: a board is watched after verify-board-candidates.cjs reads its postings JSON", by_provider: byProvider }, candidates }, null, 1) + "\n");
  console.log(`${candidates.length} candidates`, byProvider);
}
module.exports = { parseUrl, harvest };
