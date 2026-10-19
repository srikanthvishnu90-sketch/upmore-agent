// WO-009b-2 helper (architect, CI only): choose real public postings to capture, 6 per supported ATS, from the board
// directory's live boards. One public postings-JSON GET per board, 2 s apart; the first posting of each board that
// answers becomes a source in the shape scripts/career/capture-form.cjs reads. Nothing here opens an application form.
//   node scripts/career/pick-form-sources.cjs <out sources.json> [per-family=6]
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { "user-agent": "Trainee form fixtures (read-only; github.com/srikanthvishnu90-sketch/upmore-agent)", accept: "application/json" };

// Per family: where its postings list is, and how a posting becomes the public application page.
const FAMILY = {
  greenhouse: { list: (t) => `https://boards-api.greenhouse.io/v1/boards/${t}/jobs`, first: (j) => j.jobs && j.jobs[0],
    source: (t, p) => ({ url: `https://job-boards.greenhouse.io/${t}/jobs/${p.id}`, questions_url: `https://boards-api.greenhouse.io/v1/boards/${t}/jobs/${p.id}?questions=true` }) },
  lever: { list: (t) => `https://api.lever.co/v0/postings/${t}?mode=json&limit=1`, first: (j) => Array.isArray(j) && j[0],
    source: (t, p) => ({ url: `https://jobs.lever.co/${t}/${p.id}/apply` }) },
  ashby: { list: (t) => `https://api.ashbyhq.com/posting-api/job-board/${t}`, first: (j) => j.jobs && j.jobs[0],
    source: (t, p) => ({ url: `https://jobs.ashbyhq.com/${t}/${p.id}/application` }) },
  smartrecruiters: { list: (t) => `https://api.smartrecruiters.com/v1/companies/${t}/postings?limit=1`, first: (j) => j.content && j.content[0],
    source: (t, p) => ({ url: `https://jobs.smartrecruiters.com/${t}/${p.id}` }) },
};

async function pick(directory, perFamily, fetchFn = fetch, gapMs = 2000) {
  const out = [];
  for (const [family, f] of Object.entries(FAMILY)) {
    // Boards with the most postings first; one per company name, so six forms are six employers.
    const boards = directory.boards.filter((b) => b.provider === family && b.status === "live" && b.postings_seen > 0)
      .sort((a, b) => b.postings_seen - a.postings_seen);
    const companies = new Set();
    let got = 0;
    for (const b of boards) {
      if (got >= perFamily) break;
      const company = String(b.company).toLowerCase();
      if (companies.has(company)) continue;
      await sleep(gapMs);
      try {
        const res = await fetchFn(f.list(encodeURIComponent(b.board_token)), { headers: UA, signal: AbortSignal.timeout(15000) });
        if (res.status !== 200) continue;
        const p = f.first(await res.json());
        if (!p || !p.id) continue;
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
    const [outFile, per = "6"] = process.argv.slice(2);
    const directory = JSON.parse(fs.readFileSync(path.join(__dirname, "../../packages/career-data/board-directory.json"), "utf8"));
    const sources = await pick(directory, Number(per));
    fs.writeFileSync(outFile, JSON.stringify(sources, null, 2) + "\n");
    const by = sources.reduce((m, s) => ((m[s.family] = (m[s.family] || 0) + 1), m), {});
    console.log(`SOURCES ${JSON.stringify(by)}`);
  })().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { pick, FAMILY };
