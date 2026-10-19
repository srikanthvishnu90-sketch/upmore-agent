// Merge verified candidates into the board directory (WO-017). Live boards on the four supported providers become
// watched ("live"); live Workday sites are recorded as "discovered_unsupported" with their data center and site until a
// Workday reader exists (one entry per tenant, its career sites listed); ATS vendors' own boards are skipped; dead, unverifiable and error verdicts add nothing. Existing entries are never removed or changed.
//   node scripts/career/merge-board-verdicts.cjs <board-verdicts.jsonl> [directory.json]
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const SUPPORTED = new Set(["greenhouse", "lever", "ashby", "smartrecruiters"]);

// An ATS vendor's own board or demo board is not an employer's (WO-006).
const VENDOR = new Set(["greenhouse:greenhouse", "lever:leverdemo", "ashby:ashby", "smartrecruiters:smartrecruiters"]);

function merge(directory, lines, today) {
  const rows = lines.filter((l) => l.provider);
  const footer = lines.find((l) => l.calibration) || {};
  // One entry per provider and token. A Workday tenant with several career sites is one entry listing its sites.
  const keyOf = (provider, token) => `${provider}:${String(token).toLowerCase()}`;
  const have = new Set(directory.boards.map((b) => keyOf(b.provider, b.board_token)));
  const added = [], workday = new Map();
  for (const r of rows) {
    if (r.verdict !== "live" || !(r.postings > 0)) continue;
    const key = keyOf(r.provider, r.token);
    if (have.has(key) || VENDOR.has(key)) continue;
    if (r.provider === "workday") {
      const w = workday.get(key);
      if (w) { if (!w.sites.includes(r.site)) { w.sites.push(r.site); w.postings_seen += r.postings; } continue; }
      const e = { company: r.board_name || r.company_hint || r.token, provider: "workday", board_token: r.token, wd: r.wd, sites: [r.site],
        status: "discovered_unsupported", postings_seen: r.postings, last_verified: today, source: "wo017-harvest" };
      workday.set(key, e); added.push(e);
      continue;
    }
    have.add(key);
    added.push({ company: r.board_name || r.company_hint || r.token, provider: r.provider, board_token: r.token,
      status: SUPPORTED.has(r.provider) ? "live" : "discovered_unsupported", postings_seen: r.postings, last_verified: today, source: "wo017-harvest" });
  }
  // The verifier's own tally covers every probe; a verdicts file cut down to live rows (rebuilt from a job log) keeps it.
  let tally = footer.tally;
  if (!tally) { tally = {}; for (const r of rows) tally[`${r.provider}:${r.verdict}`] = (tally[`${r.provider}:${r.verdict}`] || 0) + 1; }
  const boards = [...directory.boards, ...added].sort((a, b) => (b.postings_seen || 0) - (a.postings_seen || 0));
  const live = boards.filter((b) => b.status === "live").length;
  const meta = { ...directory.meta, live_supported: live, wo017: { date: today, probes: footer.probes || rows.length, ...(footer.run ? { run: footer.run } : {}), calibration: footer.calibration || null, tally,
    added_live: added.filter((b) => b.status === "live").length, added_workday_recorded: added.filter((b) => b.provider === "workday").length,
    vendor_boards_skipped: rows.filter((r) => VENDOR.has(keyOf(r.provider, r.token))).length,
    note: "Candidates harvested from public application links in community listing files (scripts/career/harvest-board-candidates.cjs), verified by a real postings-JSON fetch per board (scripts/career/verify-board-candidates.cjs) in CI; existing entries untouched." } };
  return { directory: { ...directory, meta, boards }, added };
}

if (require.main === module) {
  const [verdictsFile, dirFile = path.join(__dirname, "../../packages/career-data/board-directory.json")] = process.argv.slice(2);
  if (!verdictsFile) { console.error("usage: merge-board-verdicts.cjs <board-verdicts.jsonl> [directory.json]"); process.exit(2); }
  const lines = fs.readFileSync(verdictsFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l.replace(/^VERDICT /, "")));
  const { directory, added } = merge(JSON.parse(fs.readFileSync(dirFile, "utf8")), lines, new Date().toISOString().slice(0, 10));
  fs.writeFileSync(dirFile, JSON.stringify(directory, null, 1) + "\n");
  console.log(`added ${added.length}: ${added.filter((b) => b.status === "live").length} live, ${added.filter((b) => b.provider === "workday").length} Workday recorded; live now ${directory.meta.live_supported}`);
}
module.exports = { merge };
