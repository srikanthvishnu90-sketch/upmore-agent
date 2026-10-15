/* ASSIGNMENT LAYER e2e proof (Mega Task 2, assigning half).
   Drives module 152 with the TEST persona against a recorded slice of the
   REAL Window 2 watcher feed: every job_id the watcher's per-board snapshots
   held at the close of Window 2 (~/workspace/alertproof/run3/shard*-state.json,
   14,049 ids over 107 boards), joined to the posting payloads the corpus
   pulled from those same boards the same day
   (~/workspace/your_files/hired-research/corpus/postings.jsonl). The join
   yields 1,125 real postings with title/company/location/url/text — the
   slice this proof grades. The window's 19 genuine post-seed detections are
   NOT in the slice: the watcher logged their ids, never their payloads, and
   this proof does not invent payloads for them (named in the output).
   Output: ~/workspace/your_files/assign-proof/proof-assign.json + stdout.
   Run: node scripts/career/proof-assign.mjs */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const A = require("../../packages/domain/152-career-assign.js");
const W = require("../../packages/domain/151-career-alert-watch.js");
const J = require("../../packages/domain/121-career-jobs.js");

const RUN3 = "/home/hatch/workspace/alertproof/run3";
const CORPUS = "/home/hatch/workspace/your_files/hired-research/corpus/postings.jsonl";
const OUT = "/home/hatch/workspace/your_files/assign-proof";
fs.mkdirSync(OUT, { recursive: true });

// ---- build the feed slice ------------------------------------------------
const corpus = new Map();
for (const ln of fs.readFileSync(CORPUS, "utf8").split("\n")) {
  if (!ln.trim()) continue;
  const r = JSON.parse(ln);
  const m = /(\d{4,})/.exec(r.url || "");
  if (m) corpus.set(`${r.source}|${String(r.board).toLowerCase()}|${m[1]}`, r);
}
const feed = [];
let snapshotIds = 0;
for (const f of fs.readdirSync(RUN3).filter((x) => /^shard\d+-state\.json$/.test(x)).sort()) {
  const st = JSON.parse(fs.readFileSync(path.join(RUN3, f), "utf8"));
  for (const [k, snap] of Object.entries(st)) {
    if (!k.includes("snapshot:board:")) continue;
    const [src, token] = k.split("snapshot:board:")[1].split(/:(.*)/s).filter((_, i) => i < 2);
    for (const jid of snap.job_ids || []) {
      snapshotIds += 1;
      const r = corpus.get(`${src}|${token.toLowerCase()}|${jid.split(":").pop()}`);
      if (!r) continue;
      const jd = r.text || "";
      feed.push({
        job_id: `feed:${src}:${token}:${jid.split(":").pop()}`,
        company: r.company, title: r.title, location: r.location || "",
        remote: /remote/i.test(r.location || "") ? "remote" : /hybrid/i.test(r.location || "") ? "hybrid" : "onsite",
        url: r.url, posted_at: r.posted || null, jd_text: jd, source: src,
        role_family: J.roleFamily(r.title, jd), seniority_band: J.seniorityBand(r.title, jd),
      });
    }
  }
}
console.log(`feed slice: ${feed.length} real postings (of ${snapshotIds} watcher-held ids; the rest have no recorded payload)`);

// ---- TEST persona + watch profile -----------------------------------------
const persona = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../../packages/career-data/fixtures/test-persona.json"), "utf8"));
const scoring = J.profileFromPersona(persona);
const wp = A.createWatchProfile(persona.persona_id || "TEST-PERSONA-001", {
  scoring_profile: scoring,
  interests: [
    { interest_id: "int-ib-analyst", role: A.roleSpecFor({ soc: "13-2051", split: "Investment Banking Analyst" }),
      filters: { locations: ["Chicago"], remote_ok: true, bands: ["intern"], firms_include: [], firms_exclude: [] } },
    { interest_id: "int-swe-intern", role: A.roleSpecFor({ soc: "15-1252", split: "Software Engineering Intern / New-Grad" }),
      filters: { locations: ["Chicago", "New York"], remote_ok: true, bands: ["intern", "new_grad"], firms_include: [], firms_exclude: [] } },
  ],
});
const v = A.validateWatchProfile(wp);
if (!v.ok) throw new Error(v.errors.join("; "));

const store = W.createMemoryStore();
await A.saveWatchProfile(store, wp);
const now = Date.parse("2026-10-14T23:05:00.000Z"); // just after Window 2 closed
const res = await A.runAssignCycle({ postings: feed, watchProfile: wp, store, now, presentJobIds: new Set(feed.map((p) => p.job_id)) });

// ---- negative proof: an occupation with no postings in this feed ----------
const wpNeg = A.createWatchProfile("TEST-NEGATIVE", {
  scoring_profile: scoring,
  interests: [{ interest_id: "int-boilermakers", role: A.roleSpecFor({ soc: "47-2011", title: "Boilermakers" }),
    filters: { locations: ["Chicago"], remote_ok: true, bands: ["intern", "new_grad", "junior", "mid"], firms_include: [], firms_exclude: [] } }],
});
const resNeg = await A.runAssignCycle({ postings: feed, watchProfile: wpNeg, store: W.createMemoryStore(), now, presentJobIds: new Set(feed.map((p) => p.job_id)) });

// ---- near-miss + miss-hunt material ----------------------------------------
const ibRejected = res.rejected.filter((x) => x.interest_id === "int-ib-analyst");
const byId = new Map(feed.map((p) => [p.job_id, p]));
const ibNear = ibRejected
  .map((x) => ({ posting: byId.get(x.job_id), reasons: x.reasons }))
  .filter((x) => x.posting && /banking|m&a|merger|acquisition|private equity|equity research|analyst/i.test(x.posting.title));
const keywordScan = feed.filter((p) => /intern|analyst|banking|trading|financ/i.test(p.title))
  .map((p) => ({ company: p.company, title: p.title, location: p.location, band: p.seniority_band, job_id: p.job_id }));

const out = {
  generated_at: new Date().toISOString(),
  feed: { slice_postings: feed.length, watcher_held_ids: snapshotIds, genuine_post_seed_detections_not_in_slice: 19 },
  profile: { persona: persona.persona_id, interests: wp.interests.map((i) => ({ id: i.interest_id, role: i.role.title, soc: i.role.soc, filters: i.filters })) },
  reminders: res.reminders.map((r) => ({ ...r, speak: A.speakLine(r) })),
  suppressed: res.suppressed,
  no_match_summary: res.no_match_summary,
  ib_near_misses: ibNear.map((x) => ({ company: x.posting.company, title: x.posting.title, location: x.posting.location, band: x.posting.seniority_band, reasons: x.reasons })),
  negative_proof: { interest: "Boilermakers (47-2011)", reminders: resNeg.reminders.length, summary: resNeg.no_match_summary },
  keyword_scan_for_miss_check: keywordScan,
  queue_depth_after_cycle: res.queue_depth,
};
fs.writeFileSync(path.join(OUT, "proof-assign.json"), JSON.stringify(out, null, 1));
console.log(`reminders: ${res.reminders.length} | suppressed: ${res.suppressed.length} | queue depth: ${res.queue_depth}`);
for (const r of res.reminders) console.log("  REMIND:", A.speakLine(r));
console.log("no_match_summary:", JSON.stringify(res.no_match_summary));
console.log("IB near misses:", ibNear.length, "| negative proof reminders:", resNeg.reminders.length);
console.log("wrote", path.join(OUT, "proof-assign.json"));
