// REAL-FEED PROOF (STAGING path, public feeds, no deploy) for DISC-003..006 + DISC-008.
// Runs packages/domain/121-career-jobs.js's real fetch path (global fetch, nothing injected)
// against REAL public ATS boards from Doc 2 Appendix B.2. Tries several known board tokens per
// ATS (SWE + Finance weighted, owner ruling 2026-10-12) and keeps whichever respond; a 404 is
// recorded in the evidence, never hidden. Then polls a SECOND time against the same snapshot
// store to prove new-posting detection returns an empty new-set on unchanged feeds.
// Fit scoring is exercised against the synthetic TEST persona fixture
// (packages/career-data/fixtures/test-persona.json) — labeled TEST, not a real person.
// Run: node scripts/career/proof-jobs.mjs   Writes: docs/career/evidence/jobs-feeds.json
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const J = require(path.join(root, "packages/domain/121-career-jobs.js"));

const CANDIDATES = [
  // Greenhouse — SWE/fintech first
  J.feeds.greenhouse("stripe"), J.feeds.greenhouse("robinhood"), J.feeds.greenhouse("airbnb"),
  J.feeds.greenhouse("datadog"), J.feeds.greenhouse("coinbase"), J.feeds.greenhouse("figma"),
  J.feeds.greenhouse("janestreet"), J.feeds.greenhouse("goldmansachs"),
  // Lever
  J.feeds.lever("leverdemo"), J.feeds.lever("netflix"), J.feeds.lever("ramp"),
  // Ashby
  J.feeds.ashby("ashby"), J.feeds.ashby("ramp"), J.feeds.ashby("openai"), J.feeds.ashby("linear"),
  // SmartRecruiters
  J.feeds.smartrecruiters("Square"), J.feeds.smartrecruiters("BoschGroup"), J.feeds.smartrecruiters("Visa"),
];

const kv = new Map();
const store = { get: (k) => kv.get(k) || null, set: (k, v) => kv.set(k, v) };
const fetched_at = new Date().toISOString();

const first = await J.poll(CANDIDATES, { store, now: Date.now() });
const second = await J.poll(CANDIDATES, { store, now: Date.now() });

const persona = JSON.parse(fs.readFileSync(path.join(root, "packages/career-data/fixtures/test-persona.json"), "utf8"));
const profile = J.profileFromPersona(persona);
const scored = first.postings.map((p) => Object.assign(J.scoreFit(p, profile), { posting: p }));
const shortlist = await J.buildShortlist(scored, { limit: 5, feedbackStore: [] });
const families = {};
for (const p of first.postings) families[p.role_family] = (families[p.role_family] || 0) + 1;
const flagged = first.postings.map((p) => ({ p, q: J.qualityFlags(p, { now: Date.now(), repost_count: (first.snapshot.history[p.job_id] || {}).repost_count || 0 }) })).filter((x) => x.q.flags.length);

const sample = (p) => ({ job_id: p.job_id, company: p.company, title: p.title, role_family: p.role_family, seniority_band: p.seniority_band, location: p.location, remote: p.remote, url: p.url, posted_at: p.posted_at, source: p.source, jd_text: (p.jd_text || "").slice(0, 300) + ((p.jd_text || "").length > 300 ? "…[truncated for evidence]" : "") });

const evidence = {
  label: "STAGING-path proof — real public ATS feeds, no deploy, no login (Doc 2 App. A.2/B.2)",
  generated_at: fetched_at,
  profile_used: { persona_id: persona.persona_id, kind: "TEST synthetic persona fixture (packages/career-data/fixtures/test-persona.json) — NOT a real person", profile },
  feeds: first.feeds.map((f) => ({ source: f.source, company_token: f.company_token, url: f.url, http_status: f.status, postings_count: f.postings.length, fetched_at, error: f.error || null, samples: f.postings.slice(0, 2).map(sample) })),
  totals: {
    feeds_tried: CANDIDATES.length,
    feeds_responded_200: first.feeds.filter((f) => f.status === 200).length,
    postings_raw: first.feeds.reduce((n, f) => n + f.postings.length, 0),
    postings_after_dedupe: first.postings.length,
    role_families: families,
  },
  new_posting_detection: {
    first_poll_new: first.new_postings.length,
    second_poll_new_on_unchanged_feeds: second.new_postings.length,
    pass: second.new_postings.length === 0,
  },
  fit_scoring_TEST_persona: {
    scored: scored.filter((x) => !x.excluded).length,
    excluded_hard_filter: scored.filter((x) => x.excluded).length,
    buckets: scored.reduce((a, x) => { if (x.bucket) a[x.bucket] = (a[x.bucket] || 0) + 1; return a; }, {}),
    exclusion_reasons_sample: scored.filter((x) => x.excluded).slice(0, 5).map((x) => ({ job_id: x.job_id, reasons: x.reasons })),
    shortlist_top5: shortlist.map((x) => ({ title: x.posting.title, company: x.posting.company, score: x.score, adjusted_score: x.adjusted_score, bucket: x.bucket, reasons: x.reasons.slice(0, 3) })),
  },
  ghost_flags: { flagged_count: flagged.length, examples: flagged.slice(0, 5).map((x) => ({ title: x.p.title, company: x.p.company, summary: x.q.summary })) },
};
const out = path.join(root, "docs/career/evidence/jobs-feeds.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ totals: evidence.totals, detection: evidence.new_posting_detection, buckets: evidence.fit_scoring_TEST_persona.buckets, scored: evidence.fit_scoring_TEST_persona.scored, excluded: evidence.fit_scoring_TEST_persona.excluded_hard_filter, flagged: evidence.ghost_flags.flagged_count }, null, 2));
for (const f of evidence.feeds) console.log(`${f.source}/${f.company_token}: HTTP ${f.http_status} postings=${f.postings_count}${f.error ? " (" + f.error + ")" : ""}`);
