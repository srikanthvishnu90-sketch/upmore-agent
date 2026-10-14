// Build the product-data board directory from a discovery run's results.
//   node scripts/career/build-board-directory.mjs <discovery.jsonl> [out.json]
// Rules (the registry doctrine, unchanged since 2026-10-13): an entry is "live"
// ONLY if the discovery run's real fetch returned that board's postings JSON.
// Providers module 121 cannot normalize yet (workable/breezy/recruitee) are
// recorded as "discovered_unsupported" — real boards, honestly not watchable
// until their normalizer lands; they never enter feedsFromDirectory's live set.
import fs from "node:fs";

const inPath = process.argv[2];
const outPath = process.argv[3] || new URL("../../packages/career-data/board-directory.json", import.meta.url).pathname;
if (!inPath) { console.error("usage: build-board-directory.mjs <discovery.jsonl> [out.json]"); process.exit(2); }

const SUPPORTED = new Set(["greenhouse", "lever", "ashby", "smartrecruiters"]);
const lines = fs.readFileSync(inPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const header = lines.find((l) => l.calibration) || {};
const probes = lines.filter((l) => l.provider);
const today = new Date().toISOString().slice(0, 10);

const byKey = new Map();
for (const p of probes) {
  if (p.verdict !== "live") continue;
  // Subdomain-widget providers (breezy/workable/recruitee) answer 200 with an
  // empty list for boards that may be parked or slug-squatted demos — the
  // SmartRecruiters doctrine applies: zero postings proves nothing.
  if (["breezy", "workable", "recruitee"].includes(p.provider) && !(p.postings > 0)) continue;
  const key = `${p.provider}:${String(p.token).toLowerCase()}`;
  if (byKey.has(key)) continue;
  byKey.set(key, {
    company: p.board_name || p.company_hint || p.token,
    provider: p.provider,
    board_token: p.token,
    status: SUPPORTED.has(p.provider) ? "live" : "discovered_unsupported",
    postings_seen: p.postings,
    last_verified: today,
    source: p.source,
  });
}
const boards = [...byKey.values()].sort((a, b) => (b.postings_seen || 0) - (a.postings_seen || 0));
const stats = {};
for (const p of probes) {
  const k = `${p.provider}:${p.verdict}`;
  stats[k] = (stats[k] || 0) + 1;
}
const directory = {
  meta: {
    generated_at: new Date().toISOString(),
    generator: "scripts/career/board-discovery.py + build-board-directory.mjs",
    doctrine: "an entry is live only if a real fetch in the discovery run returned the board's postings JSON; calibration probes (one gibberish token per provider) were run first and their signatures recorded here",
    calibration: header.calibration || null,
    probes: probes.length,
    probe_stats: stats,
    live_supported: boards.filter((b) => b.status === "live").length,
    live_unsupported: boards.filter((b) => b.status === "discovered_unsupported").length,
    total_postings_seen: boards.reduce((a, b) => a + (b.postings_seen || 0), 0),
  },
  boards,
};
fs.mkdirSync(new URL(".", "file://" + outPath).pathname, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(directory, null, 1) + "\n");
console.log(JSON.stringify(directory.meta, null, 1));
