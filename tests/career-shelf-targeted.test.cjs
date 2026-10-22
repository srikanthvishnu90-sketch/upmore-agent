"use strict";
// TARGETED SHELF READ (Throughput Package B, 2026-10-21; root
// failure MUSE-F-005): the queue feed's only shelf read was the
// recency-600 window, whose intern band measures 2 postings (both
// Operations) against 173 SWE+intern postings deeper on the shelf
// — a 50-posting intern queue starved at 0 no matter how often the
// window is re-pulled. This suite pins the fix's shape:
//   * the keyed read FETCHES candidates for every path 121's
//     seniorityBand can take to the named band (title tokens, the
//     seasonal convention, the intern JD-head fallback);
//   * the read NEVER decides membership: the unchanged 121
//     classifiers stamp every candidate, and a mid/senior posting
//     the text key over-fetches still classifies mid/senior — it
//     cannot enter an intern queue through this read;
//   * family keying fetches by title key and never relabels (a
//     fetched Data Engineer still classifies Data/ML);
//   * the merge dedupes by posting id with the base copy winning;
//   * failure posture mirrors career_pool: never throws, named
//     errors, no key -> no read;
//   * the starvation guard: on a mini-shelf shaped like F-005, a
//     window-only assembly starves and window+targeted assembles
//     the queue through the unchanged classifier filter.
// Check: node --test tests/career-shelf-targeted.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const { CareerPool } = require(path.join(ROOT, "supabase/functions/_shared/career_pool.js"));
const CareerJobs = require(path.join(ROOT, "packages/domain/121-career-jobs.js"));
const { createTargetedShelfRead, mergePostings } = require(path.join(ROOT, "workers/career-browser/career-shelf-targeted.cjs"));

const JOBS = { roleFamily: CareerJobs.roleFamily, seniorityBand: CareerJobs.seniorityBand, stripHtml: CareerJobs.stripHtml };
const recent = (days) => new Date(Date.now() - days * 864e5).toISOString();

let seq = 0;
function kbRow(over = {}) {
  seq += 1;
  return Object.assign({
    posting_key: `greenhouse:https://boards.greenhouse.io/acme/jobs/${1000 + seq}`,
    source: "greenhouse", board: "acme",
    company: "Acme", title: "Software Engineer",
    location: "Chicago, IL", url: "https://boards.greenhouse.io/acme/jobs/x",
    posted_at: recent(30), fetched_on: "2026-10-14", corpus_vintage: "2026-10-14",
    text_excerpt: "Build product in JavaScript and Python, write tests, ship with a mentor.",
  }, over);
}

// In-memory readRows over a fixture shelf, implementing the loader
// contract (order posted_at desc nulls last, array ilike filters).
function shelfReader(rows) {
  const sorted = [...rows].sort((a, b) => {
    const pa = a.posted_at ? Date.parse(a.posted_at) : null;
    const pb = b.posted_at ? Date.parse(b.posted_at) : null;
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return pb - pa;
  });
  const ilike = (value, pattern) => {
    const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
    return new RegExp("^" + esc + "$", "i").test(value == null ? "" : String(value));
  };
  return async (spec) => {
    let out = sorted;
    for (const f of spec.filters || []) if (f.op === "ilike") out = out.filter((r) => ilike(r[f.column], f.value));
    return out.slice(0, spec.limit || out.length).map((r) => ({ ...r }));
  };
}

const internQueue = (postings, family) => postings.filter((p) => p.seniority_band === "intern" && (!family || p.role_family === family));

test("band key: every classifier path to intern is fetched as a candidate", async () => {
  const rows = [
    kbRow({ title: "Software Engineering Intern" }),
    kbRow({ title: "Data Analyst Internship" }),
    kbRow({ title: "Software Engineering Co-op" }),
    kbRow({ title: "Summer Analyst" }),
    kbRow({ title: "Winter Associate" }),
    kbRow({ title: "Summer Business Analyst" }),
    // tokenless title; the band comes from the JD-head fallback only
    kbRow({ title: "Engineering Apprentice", text_excerpt: "This internship runs twelve weeks with a mentor." }),
  ];
  const shelf = createTargetedShelfRead({ readRows: shelfReader(rows), jobs: JOBS });
  const r = await shelf.loadKeyed({ band: "intern" });
  assert.equal(r.error, null);
  assert.equal(r.keyedBy, "band");
  assert.ok(r.reads >= 7, `expected >=7 keyed reads, got ${r.reads}`);
  const got = internQueue(r.postings);
  assert.equal(got.length, 7, `all 7 intern paths fetched and classified intern; got ${got.map((p) => p.title).join(" | ")}`);
});

test("band filter unchanged: over-fetched mid/senior postings never enter the intern queue", async () => {
  const rows = [
    // fetched by the text key (excerpt mentions an internship) but senior by title
    kbRow({ title: "Senior Software Engineer", text_excerpt: "Mentor our internship program participants." }),
    // fetched by the text key (excerpt names the internship program) but a manager posting
    kbRow({ title: "Engineering Manager", text_excerpt: "Owns the internship program and its mentors." }),
    // fetched by the text key; plain mid title, intern token beyond the JD head the classifier reads
    kbRow({ title: "Platform Engineer", text_excerpt: "x".repeat(400) + " internship" }),
  ];
  const shelf = createTargetedShelfRead({ readRows: shelfReader(rows), jobs: JOBS });
  const r = await shelf.loadKeyed({ band: "intern" });
  assert.equal(r.error, null);
  assert.equal(r.postings.length, 3, "all three are fetched as candidates (keying over-fetches by design)");
  const bands = Object.fromEntries(r.postings.map((p) => [p.title, p.seniority_band]));
  assert.equal(bands["Senior Software Engineer"], "senior");
  assert.equal(bands["Engineering Manager"], "manager");
  assert.equal(bands["Platform Engineer"], "mid");
  assert.equal(internQueue(r.postings).length, 0, "none is admitted to an intern queue — 121's band decides, not the key");
});

test("family keying: fetches by title key and never relabels", async () => {
  const rows = [
    kbRow({ title: "Backend Engineer" }),
    kbRow({ title: "Data Engineer" }),
    kbRow({ title: "Paralegal" }),
  ];
  const shelf = createTargetedShelfRead({ readRows: shelfReader(rows), jobs: JOBS });
  const r = await shelf.loadKeyed({ family: "SWE" });
  assert.equal(r.error, null);
  assert.equal(r.keyedBy, "family");
  const byTitle = Object.fromEntries(r.postings.map((p) => [p.title, p.role_family]));
  assert.equal(byTitle["Backend Engineer"], "SWE");
  assert.equal(byTitle["Data Engineer"], "Data/ML", "fetched by the %engineer% key, classified by 121 — not relabeled SWE");
  assert.equal(byTitle["Paralegal"], undefined, "no SWE key fetches a paralegal title");
});

test("merge: dedupe by posting id, base copy wins, extras keep order", () => {
  const base = [{ id: "a", title: "base A" }, { id: "b", title: "base B" }];
  const extra = [{ id: "b", title: "extra B" }, { id: "c", title: "extra C" }, { id: "c", title: "extra C dup" }, { id: "d", title: "extra D" }];
  const merged = mergePostings(base, extra);
  assert.deepEqual(merged.map((p) => p.id), ["a", "b", "c", "d"]);
  assert.equal(merged[1].title, "base B");
});

test("postures: no key, unknown key, failing read — named errors, never a throw", async () => {
  const shelf = createTargetedShelfRead({ readRows: shelfReader([]), jobs: JOBS });
  assert.equal((await shelf.loadKeyed({})).error, "SHELF_TARGETED_KEY_REQUIRED");
  assert.equal((await shelf.loadKeyed({ band: "chief" })).error, "SHELF_TARGETED_KEY_UNKNOWN");
  assert.equal((await shelf.loadKeyed({ family: "Wizardry" })).error, "SHELF_TARGETED_KEY_UNKNOWN");
  const broken = createTargetedShelfRead({ readRows: async () => { throw new Error("boom"); }, jobs: JOBS });
  const r = await broken.loadKeyed({ band: "intern" });
  assert.equal(r.error, "KB_POOL_READ_FAILED");
  assert.deepEqual(r.postings, []);
});

test("starvation guard: window-only starves, window+targeted assembles through the unchanged filter", async () => {
  // Mini-shelf shaped like F-005: a recency head of mid/senior roles,
  // the intern postings deeper down.
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push(kbRow({ title: `Senior Software Engineer ${i}`, posted_at: recent(i + 1) }));
  for (let i = 0; i < 6; i++) rows.push(kbRow({ title: `Software Engineering Intern ${i}`, posted_at: recent(40 + i) }));
  const readRows = shelfReader(rows);
  const loader = CareerPool.createKbPoolLoader({ readRows, jobs: JOBS, limit: 10 });
  const pool = await loader.loadPool();
  assert.equal(internQueue(pool.postings, "SWE").length, 0, "window-only assembly starves (F-005 in miniature)");
  const shelf = createTargetedShelfRead({ readRows, jobs: JOBS });
  const keyed = await shelf.loadKeyed({ family: "SWE", band: "intern" });
  assert.equal(keyed.error, null);
  const merged = mergePostings(pool.postings, keyed.postings);
  assert.equal(internQueue(merged, "SWE").length, 6, "merged feed assembles the intern queue");
  assert.equal(merged.length, 16, "merge loses nothing the window carried");
});
