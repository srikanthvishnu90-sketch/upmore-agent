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
  s.tool("company file lookup + 121.fetchFeed datadog (live)", { cir_file_present: cirExists, cir_slugs_in_branch: cirSlugs, feed: { http: feed.status, postings: feed.postings.length, error: feed.error || null } });
  const fams = {}; for (const p of feed.postings) fams[p.role_family] = (fams[p.role_family] || 0) + 1;
  const sample = feed.postings.slice(0, 5).map(L.slim);
  const Prep = require(path.join(L.ROOT, "packages/domain/127-career-prep.js"));
  const cirObj = cirExists ? JSON.parse(fs.readFileSync(cirPath, "utf8")) : null;
  const brief = cirObj ? Prep.composeBrief({ company: "Datadog", cir: cirObj, role: "Software Engineering Intern" }) : null;
  const famList = Object.entries(fams).map(([k, v]) => `${k}: ${v}`).join(", ");
  if (brief && brief.status === "OK") {
    s.agent(`Here is what I can source right now. From Datadog's live Greenhouse board (HTTP ${feed.status}): ${feed.postings.length} open postings — families: ${famList}. Sample live roles: ${sample.map((x) => x.title).join("; ")}.\n\nAnd the sourced company brief, grounded in Datadog's company file (as of ${brief.sources[0] ? brief.sources[0].as_of : "on file"}):\n\nTHE BAR: ${brief.bar || "no hiring-bar summary in the file — not claimed"}\n\nPROCESS STAGES:\n${brief.stages.map((x, i) => `${i + 1}. ${x.name}`).join("\n")}`, { card: { type: "company_brief", title: "Datadog — live postings + sourced company brief", live_postings: feed.postings.length, families: fams, sample_roles: sample.map((x) => x.title) } });
  } else {
    s.agent(`Here is what I can source right now. From Datadog's live Greenhouse board (HTTP ${feed.status}): ${feed.postings.length} open postings — families: ${famList}. Sample live roles: ${sample.map((x) => x.title).join("; ")}. What I cannot give you yet: the sourced company brief — no Datadog company file is on file, so I have no sourced hiring-bar, culture or process facts for Datadog, and I will not invent them.`, { card: { type: "company_brief", title: "Datadog — live postings only; company brief unavailable", live_postings: feed.postings.length, families: fams, sample_roles: sample.map((x) => x.title) } });
  }
  s.verify("company file presence verified on disk; posting counts verified from the live feed result, not from prose; brief grounded when the file exists", { cir_file_present: cirExists, feed_http: feed.status, feed_postings: feed.postings.length, brief_status: brief && brief.status });
  await s.finish(brief && brief.status === "OK" ? { status: "COMPLETE", outcome: `Datadog live board verified (HTTP ${feed.status}, ${feed.postings.length} postings) and the sourced company brief delivered from Datadog's company file.` } : { status: "LEARN", outcome: `Datadog live board verified (HTTP ${feed.status}, ${feed.postings.length} postings) but the sourced company brief cannot be assembled — no Datadog company file on file`, reason: "Datadog company file absent", unblock: "Research + add a Datadog company file, then rerun SC-028" });
})().catch((e) => { console.error(e); process.exit(1); });
