// HOST TOOLING (not product chat code, no deploy): the scaled live proof runner.
// Runs module 151's adaptive watch over the verified board directory
// (packages/career-data/board-directory.json), sharded across processes the way
// a real host would shard: each shard owns its boards, its store file, and its
// records file — no shared state, no cross-process races.
//
//   node scripts/career/alert-watch-scaled-runner.mjs \
//     --directory packages/career-data/board-directory.json \
//     --shard 0 --shards 8 --state /tmp/proof/shard0.json \
//     --out /tmp/proof/shard0.jsonl --duration-min 45 [--tick-sec 60]
//
// Records (JSONL): {kind:"cycle", ...} per adaptive cycle, {kind:"alert", ...}
// per delivered alert, and a final {kind:"audit", ...} per board: the board's
// snapshot history keys + last_polled_at + a fresh audit fetch's (job_id,
// posted_at) list — the inputs the miss reconciliation is computed from.
// The profile is the same MOCK demo profile as alert-watch-runner.mjs (the
// deployed host injects the real per-user profile). Nothing is sent anywhere.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const W = require("../../packages/domain/151-career-alert-watch.js");
const J = require("../../packages/domain/121-career-jobs.js");

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const directoryPath = path.resolve(opt("--directory", "packages/career-data/board-directory.json"));
const shardIdx = Number(opt("--shard", "0"));
const shardCount = Number(opt("--shards", "1"));
const statePath = path.resolve(opt("--state", `/tmp/alertproof/shard${shardIdx}-state.json`));
const outPath = path.resolve(opt("--out", `/tmp/alertproof/shard${shardIdx}.jsonl`));
const durationMin = Number(opt("--duration-min", "45"));
const tickSec = Number(opt("--tick-sec", "60"));
const dueAll = args.includes("--due-all"); // proof mode: every board due every tick (cadence math itself is unit-guarded)

const directory = JSON.parse(fs.readFileSync(directoryPath, "utf8"));
const allFeeds = W.feedsFromDirectory(directory.boards);
const feeds = allFeeds.filter((_, i) => i % shardCount === shardIdx);

const store = {
  get: (k) => { try { const all = JSON.parse(fs.readFileSync(statePath, "utf8")); return all[k] ?? null; } catch { return null; } },
  set: (k, v) => {
    let all = {}; try { all = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch { /* first run */ }
    all[k] = v; fs.writeFileSync(statePath, JSON.stringify(all));
  },
};
const emit = (obj) => fs.appendFileSync(outPath, JSON.stringify(obj) + "\n");
const sink = async (record) => { emit(Object.assign({ kind: "alert" }, record)); };

const PROFILE = { // MOCK — host injects the real per-user profile (same demo as alert-watch-runner.mjs)
  skills: [{ name: "Python", proven: true, fact_id: "F-010" }, { name: "React", proven: true, fact_id: "F-011" }],
  degree: "B.S. Computer Science + Finance, class of 2029", level: "student", experience_years: 1,
  experience_text: "built Python data pipelines and a React dashboard for finance analysts",
  constraints: { work_authorization: "US citizen", needs_sponsorship: false, graduation_year: 2029, clearance: null, locations: ["New York", "Chicago"] },
  preferences: { role_families: ["Finance", "SWE", "Data/ML"], locations: ["New York", "Chicago"], starred_companies: [] },
};
const fetchImpl = (url) => fetch(url, { headers: { accept: "application/json" } });

const startedAt = Date.now();
emit({ kind: "shard_start", at: new Date(startedAt).toISOString(), shard: shardIdx, shards: shardCount, boards: feeds.map((f) => W.boardIdOf(f)) });

let cycles = 0;
while (Date.now() - startedAt < durationMin * 60000) {
  const tickStart = Date.now();
  try {
    const res = await W.runAdaptiveCycle({ feeds, fetch: fetchImpl, profile: PROFILE, store, sink, now: tickStart, ...(dueAll ? { dueBoardIds: feeds.map((f) => W.boardIdOf(f)) } : {}) });
    cycles += 1;
    const newSeen = Object.values(res.boards).reduce((a, b) => a + (b.new_seen || 0), 0);
    const removed = Object.values(res.boards).reduce((a, b) => a + (b.removed || 0), 0);
    emit({ kind: "cycle", at: res.at, cycle: cycles, boards_polled: res.boards_polled, boards_skipped_not_due: res.boards_skipped_not_due.length,
      new_seen: newSeen, removed, alerts_delivered: res.alerts_delivered,
      suppressed: { reposts: res.suppressed.reposts.length, recovered_absorbed: res.suppressed.recovered_absorbed.length, cross_board_duplicates: res.suppressed.cross_board_duplicates.length },
      errors: res.errors.length, duration_ms: Date.now() - tickStart, boards: res.boards });
  } catch (e) {
    emit({ kind: "cycle_error", at: new Date().toISOString(), error: String(e && e.message || e) });
  }
  const wait = tickSec * 1000 - (Date.now() - tickStart);
  if (wait > 0 && Date.now() - startedAt < durationMin * 60000) await new Promise((r) => setTimeout(r, wait));
}

// Final audit: per board, the snapshot's full history (every job_id ever seen)
// + a fresh audit fetch — the reconciliation inputs.
const stateDoc = (() => { try { return JSON.parse(fs.readFileSync(statePath, "utf8")); } catch { return {}; } })();
for (const feed of feeds) {
  const snap = stateDoc[W.boardSnapshotKey(feed)] || {};
  const boardState = ((stateDoc[W.DEFAULT_STATE_KEY] || {}).boards || {})[W.boardIdOf(feed)] || {};
  let audit = null;
  try {
    const r = await J.fetchFeed(feed, { fetch: fetchImpl });
    audit = { status: r.status, error: r.error || null, postings: (r.postings || []).map((p) => ({ job_id: p.job_id, posted_at: p.posted_at })) };
  } catch (e) { audit = { status: 0, error: String(e && e.message || e), postings: [] }; }
  emit({ kind: "audit", board: W.boardIdOf(feed), company: feed.company, provider: feed.provider,
    history: Object.entries(snap.history || {}).map(([job_id, h]) => ({ job_id, first_seen: h.first_seen, present: !!h.present, repost_count: h.repost_count || 0 })),
    first_attempt_at: boardState.first_attempt_at || null,
    last_polled_at: boardState.last_polled_at || null, audit });
}
emit({ kind: "shard_end", at: new Date().toISOString(), cycles });
console.log(`shard ${shardIdx}: ${feeds.length} boards, ${cycles} cycles, done`);
