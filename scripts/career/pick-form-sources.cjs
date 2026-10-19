// WO-009b-2 helper (architect, CI only): choose real public postings to capture, 6 per supported ATS, from the board
// directory's live boards. One public postings-JSON GET per board, 2 s apart; the first posting of each board that
// answers becomes a source in the shape scripts/career/capture-form.cjs reads. Nothing here opens an application form.
//   node scripts/career/pick-form-sources.cjs <out sources.json> [per-family=6 | greenhouse=40,lever=30,ashby=30]
//     [--seed N] [--exclude questions.json]
// Without a seed the pick is the biggest boards and each one's first posting, so a re-run measures the same employers
// (it tests that the capture repeats, not that a number holds). With a seed it is a second, independent sample: boards
// in a seeded random order and a seeded random posting on each, skipping every employer in --exclude.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { "user-agent": "Trainee form fixtures (read-only; github.com/srikanthvishnu90-sketch/upmore-agent)", accept: "application/json" };

// Per family: where its postings list is, and how a posting becomes the public application page.
const FAMILY = {
  greenhouse: { list: (t) => `https://boards-api.greenhouse.io/v1/boards/${t}/jobs`, all: (j) => j.jobs || [],
    source: (t, p) => ({ url: `https://job-boards.greenhouse.io/${t}/jobs/${p.id}`, questions_url: `https://boards-api.greenhouse.io/v1/boards/${t}/jobs/${p.id}?questions=true` }) },
  lever: { list: (t, all) => `https://api.lever.co/v0/postings/${t}?mode=json&limit=${all ? 100 : 1}`, all: (j) => Array.isArray(j) ? j : [],
    source: (t, p) => ({ url: `https://jobs.lever.co/${t}/${p.id}/apply` }) },
  ashby: { list: (t) => `https://api.ashbyhq.com/posting-api/job-board/${t}`, all: (j) => j.jobs || [],
    source: (t, p) => ({ url: `https://jobs.ashbyhq.com/${t}/${p.id}/application` }) },
  smartrecruiters: { list: (t, all) => `https://api.smartrecruiters.com/v1/companies/${t}/postings?limit=${all ? 100 : 1}`, all: (j) => j.content || [],
    // The job page only describes the role; the application form is the "oneclick" page for the posting's uuid.
    source: (t, p) => ({ url: `https://jobs.smartrecruiters.com/oneclick-ui/company/${t}/publication/${p.uuid}?dcr_ci=${t}` }) },
};

// A small seeded generator (mulberry32), so a seeded sample is the same sample on every run.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(xs, rand) {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// perFamily: one number for every family, or { family: count } (families left out are skipped).
// opts.seed: a number for a seeded random sample (see the header); opts.exclude: company names to skip.
async function pick(directory, perFamily, fetchFn = fetch, gapMs = 2000, opts = {}) {
  const out = [];
  const seeded = Number.isInteger(opts.seed);
  const rand = seeded ? rng(opts.seed) : null;
  const excluded = new Set((opts.exclude || []).map((c) => String(c).toLowerCase()));
  for (const [family, f] of Object.entries(FAMILY)) {
    const want = typeof perFamily === "number" ? perFamily : (perFamily[family] || 0);
    if (!want) continue;
    // Boards with the most postings first (or in seeded random order); one per company name, so six forms are six
    // employers.
    const live = directory.boards.filter((b) => b.provider === family && b.status === "live" && b.postings_seen > 0);
    const boards = seeded ? shuffle(live, rand) : live.sort((a, b) => b.postings_seen - a.postings_seen);
    const companies = new Set(excluded);
    let got = 0;
    for (const b of boards) {
      if (got >= want) break;
      const company = String(b.company).toLowerCase();
      if (companies.has(company)) continue;
      await sleep(gapMs);
      try {
        const res = await fetchFn(f.list(encodeURIComponent(b.board_token), seeded), { headers: UA, signal: AbortSignal.timeout(15000) });
        if (res.status !== 200) continue;
        const jobs = f.all(await res.json());
        const p = seeded ? jobs[Math.floor(rand() * jobs.length)] : jobs[0];
        if (!p || !p.id || (family === "smartrecruiters" && !p.uuid)) continue;
        const id = `${family}-${String(b.board_token).toLowerCase().replace(/[^a-z0-9_-]/g, "-")}-${String(p.id).toLowerCase().replace(/[^a-z0-9_-]/g, "-")}`.slice(0, 160);
        out.push({ id, family, company: b.company, ...f.source(b.board_token, p) });
        companies.add(company);
        got++;
      } catch { /* a board that does not answer is skipped, never guessed */ }
    }
  }
  return out;
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2), flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : null; };
    const seed = flag("--seed"), excludeFile = flag("--exclude");
    const [outFile, per = "6"] = args;
    if (seed !== null && !/^\d+$/.test(seed)) throw new Error(`--seed must be a whole number, got ${seed}`);
    // --exclude reads the companies of an earlier pick (a sources.json) or capture (evals/apply/questions-ci.json), so
    // sample B shares no employer with it.
    const ex = excludeFile ? JSON.parse(fs.readFileSync(excludeFile, "utf8")) : [];
    const exclude = (Array.isArray(ex) ? ex : ex.postings).map((p) => p.company);
    const directory = JSON.parse(fs.readFileSync(path.join(__dirname, "../../packages/career-data/board-directory.json"), "utf8"));
    const counts = /=/.test(per) ? Object.fromEntries(per.split(",").map((kv) => { const [k, v] = kv.split("="); return [k, Number(v)]; })) : Number(per);
    const sources = await pick(directory, counts, fetch, 2000, { seed: seed === null ? undefined : Number(seed), exclude });
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(sources, null, 2) + "\n");
    const by = sources.reduce((m, s) => ((m[s.family] = (m[s.family] || 0) + 1), m), {});
    console.log(`SOURCES ${JSON.stringify(by)}`);
  })().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { pick, FAMILY };
