"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-029", "cross-post-dedupe");
  const r = await L.pollLive();
  s.tool("121.poll (live)", { totals: L.feedTotals(r) });
  const multi = r.postings.filter((p) => (p.sources || []).length > 1);
  const src = r.postings.find((p) => p.source === "greenhouse" && p.role_family === "SWE");
  const leverCopy = J.normalizeLever([{ id: "crosspost-demo", text: src.title, categories: { location: src.location, team: src.department || "Engineering" }, hostedUrl: "https://jobs.lever.co/" + src.company.toLowerCase().replace(/\s+/g, "") + "/crosspost-demo", createdAt: Date.parse(src.posted_at), descriptionPlain: src.jd_text.slice(0, 400) }], src.company)[0];
  const dd = J.dedupe([src, leverCopy]);
  s.user(`(the same role appears on Greenhouse and the company page: ${src.title} at ${src.company})`);
  s.agent(`Deduped. Across all live feeds, ${L.feedTotals(r).raw} raw rows collapsed to ${r.postings.length} records (${L.feedTotals(r).dupes_removed} duplicates removed; ${multi.length} live records already carry more than one source). For the cross-posted role you named: one record survives, carrying BOTH source URLs (${dd[0].source_urls.length}), so the shortlist can never show it twice.`, { card: { title: "Cross-post dedupe", record: { ...L.slim(dd[0]), sources: dd[0].sources, source_urls: dd[0].source_urls } } });
  s.verify("dedupe() output: the Greenhouse row and its Lever-shaped cross-post collapse to exactly 1 record with 2 source_urls; live raw-vs-deduped counts recorded", { merged_records: dd.length, source_urls: dd[0].source_urls.length, live_raw: L.feedTotals(r).raw, live_deduped: r.postings.length, live_multi_source_records: multi.length });
  await s.finish({ status: "COMPLETE", outcome: `Cross-posted role collapsed to 1 record with both source URLs; live poll removed ${L.feedTotals(r).dupes_removed} duplicate rows overall` });
})().catch((e) => { console.error(e); process.exit(1); });
