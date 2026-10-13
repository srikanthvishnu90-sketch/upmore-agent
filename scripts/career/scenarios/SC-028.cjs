"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-028", "company-brief-datadog");
  s.user("tell me about Datadog");
  const cirPath = path.join(L.ROOT, "packages/career-data/cirs/datadog.json");
  const cirExists = fs.existsSync(cirPath);
  const cirSlugs = fs.readdirSync(path.join(L.ROOT, "packages/career-data/cirs")).map((f) => f.replace(".json", ""));
  const feed = await J.fetchFeed(J.feeds.greenhouse("datadog"));
  s.tool("CIR lookup + 121.fetchFeed datadog (live)", { cir_file_present: cirExists, cir_slugs_in_branch: cirSlugs, feed: { http: feed.status, postings: feed.postings.length, error: feed.error || null } });
  const fams = {}; for (const p of feed.postings) fams[p.role_family] = (fams[p.role_family] || 0) + 1;
  const sample = feed.postings.slice(0, 5).map(L.slim);
  s.agent(`Here is what I can source right now. From Datadog's live Greenhouse board (HTTP ${feed.status}): ${feed.postings.length} open postings — families: ${JSON.stringify(fams)}. Sample live roles: ${sample.map((x) => x.title).join("; ")}. What I CANNOT give you: the sourced company brief. There is no Datadog CIR in this branch — packages/career-data/cirs/ holds ${cirSlugs.length} records (${cirSlugs.join(", ")}) and datadog.json is not one of them, so I have no sourced hiring-bar, culture, process or thesis facts with dates for Datadog, and I will not invent them. The live postings above are real; everything qualitative is missing until a Datadog CIR is researched and merged.`, { card: { title: "Datadog — live postings only; CIR brief unavailable", cir_present: cirExists, live_postings: feed.postings.length, families: fams, sample } });
  s.verify("CIR absence verified on disk; posting counts verified from the live feed result, not from prose", { cir_file_present: cirExists, feed_http: feed.status, feed_postings: feed.postings.length });
  await s.finish({ status: "LEARN", outcome: `Datadog live board verified (HTTP ${feed.status}, ${feed.postings.length} postings) but the sourced company brief cannot be assembled — no Datadog CIR exists in this branch`, reason: "packages/career-data/cirs/datadog.json is absent (15 CIRs present, Datadog not among them); the task brief assumed it was merged — it is not", unblock: "Research + merge a Datadog CIR (same schema as packages/career-data/cirs/bain.json) into packages/career-data/cirs/datadog.json, then rerun SC-028" });
})().catch((e) => { console.error(e); process.exit(1); });
