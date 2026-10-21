"use strict";
/* career-queue-feed.test.cjs — guard for the throughput lane's
   targeted queue feed (workers/career-browser/queue-feed.cjs).
   Fail-first shape: against the production feed (window-only) the
   benchmark case assembles 0 eligible; the targeted feed must
   assemble the requested count from beyond the window, deduped,
   with its scan cost stated in stats. Fake transport only. */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createQueueFeed } = require(path.join(__dirname, "..", "workers", "career-browser", "queue-feed.cjs"));
const Jobs = require(path.join(__dirname, "..", "packages", "domain", "121-career-jobs.js"));

// A synthetic shelf: newest-first rows. The freshest 8 (the
// "window") hold no SWE-intern greenhouse rows; board "deepboard"
// holds 6 of them below the window.
function row(board, title, daysAgo, source) {
  return {
    posting_key: `${source || "greenhouse"}:${board}:${title}`,
    source: source || "greenhouse", board, company: board.toUpperCase(),
    title, location: "Remote", url: `https://boards.greenhouse.io/${board}/jobs/${title.replace(/\W+/g, "-")}`,
    posted_at: new Date(Date.now() - daysAgo * 864e5).toISOString(),
    fetched_on: "2026-10-15", corpus_vintage: "test",
    text_excerpt: `${title} — join our team.`,
  };
}
const SHELF = [
  row("freshco", "Senior Software Engineer", 0),
  row("freshco", "Staff Product Manager", 1),
  row("freshco", "Engineering Manager", 2),
  row("otherco", "Senior Data Scientist", 3),
  row("otherco", "Director of Engineering", 4),
  row("otherco", "Principal Designer", 5),
  row("otherco", "Senior Accountant", 6),
  row("otherco", "VP of Sales", 7),
  // below the window: the eligible supply
  ...[0, 1, 2, 3, 4, 5].map((i) => row("deepboard", `Software Engineering Intern ${i}`, 10 + i)),
  row("deepboard", "Senior Software Engineer", 20),
];
const WINDOW = 8;

function fakeReadRows(spec) {
  let rows = SHELF.slice();
  if (spec.filters && spec.filters.board) rows = rows.filter((r) => r.board === spec.filters.board.eq);
  rows.sort((a, b) => String(b.posted_at).localeCompare(String(a.posted_at)));
  return Promise.resolve(rows.slice(0, spec.limit || rows.length));
}

test("window alone holds zero eligible for the benchmark shape (the F-005 defect, reproduced in miniature)", async () => {
  const feed = createQueueFeed({ readRows: fakeReadRows, jobs: Jobs, boardsFor: async () => ["deepboard"], windowLimit: WINDOW });
  const { postings, stats } = await feed.postingsForTargeted("u1", "software engineering intern roles", 5);
  assert.equal(stats.windowEligible, 0);
  assert.ok(postings.length >= WINDOW);
});

test("targeted top-up assembles the requested count from beyond the window", async () => {
  const feed = createQueueFeed({ readRows: fakeReadRows, jobs: Jobs, boardsFor: async () => ["deepboard"], windowLimit: WINDOW });
  const { postings, stats } = await feed.postingsForTargeted("u1", "software engineering intern roles", 5);
  const fams = Jobs.askRoleFamilies("software engineering intern roles");
  const eligible = postings.filter((p) => p.source === "greenhouse" && fams.includes(p.role_family) && p.seniority_band === "intern");
  assert.ok(eligible.length >= 5, `expected >=5 eligible, got ${eligible.length}`);
  assert.equal(stats.boardsRead, 1);
  assert.ok(stats.targetedEligible >= 5);
});

test("no duplicates by posting identity, and window-sufficient asks never touch the boards", async () => {
  const feed = createQueueFeed({ readRows: fakeReadRows, jobs: Jobs, boardsFor: async () => ["deepboard"], windowLimit: WINDOW });
  const a = await feed.postingsForTargeted("u1", "senior software engineer roles", 2);
  const keys = a.postings.map((p) => `${(p.company || "").toLowerCase()}::${(p.title || "").toLowerCase()}::${(p.url || "").toLowerCase()}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(a.stats.boardsRead, 0);
});

test("a failed window read stops named, never silently empty", async () => {
  const feed = createQueueFeed({ readRows: async () => { throw new Error("db down"); }, jobs: Jobs, boardsFor: async () => [] });
  await assert.rejects(
    () => feed.postingsForTargeted("u1", "software engineering intern roles", 5),
    (e) => e && e.code === "BATCH_DISCOVERY_READ_FAILED",
  );
});
