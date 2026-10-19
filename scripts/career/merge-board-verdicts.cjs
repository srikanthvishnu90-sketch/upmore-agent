// Merge verified candidates into the board directory (WO-017). Live boards on the four supported providers become
// watched ("live"); live Workday sites are recorded as "discovered_unsupported" with their data center and site until a
// Workday reader exists; dead, unverifiable and error verdicts add nothing. Existing entries are never removed or changed.
//   node scripts/career/merge-board-verdicts.cjs <board-verdicts.jsonl> [directory.json]
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const SUPPORTED = new Set(["greenhouse", "lever", "ashby", "smartrecruiters"]);

function merge(directory, lines, today) {
  const rows = lines.filter((l) => l.provider);
  const footer = lines.find((l) => l.calibration) || {};
  const have = new Set(directory.boards.map((b) => `${b.provider}:${String(b.board_token).toLowerCase()}${b.site ? ":" + String(b.site).toLowerCase() : ""}`));
  const added = [];
  for (const r of rows) {
    if (r.verdict !== "live" || !(r.postings > 0)) continue;
    const key = `${r.provider}:${String(r.token).toLowerCase()}${r.site ? ":" + String(r.site).toLowerCase() : ""}`;
    if (have.has(key)) continue;
    have.add(key);
    added.push({
      company: r.board_name || r.company_hint || r.token, provider: r.provider, board_token: r.token,
      ...(r.provider === "workday" ? { wd: r.wd, site: r.site } : {}),
      status: SUPPORTED.has(r.provider) ? "live" : "discovered_unsupported", postings_seen: r.postings, last_verified: today, source: "wo017-harvest",
    });
  }
  const tally = {};
  for (const r of rows) tally[`${r.provider}:${r.verdict}`] = (tally[`${r.provider}:${r.verdict}`] || 0) + 1;
  const boards = [...directory.boards, ...added].sort((a, b) => (b.postings_seen || 0) - (a.postings_seen || 0));
  const live = boards.filter((b) => b.status === "live").length;
  const meta = { ...directory.meta, live_supported: live, wo017: { date: today, probes: rows.length, calibration: footer.calibration || null, tally,
    added_live: added.filter((b) => b.status === "live").length, added_workday_recorded: added.filter((b) => b.provider === "workday").length,
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
