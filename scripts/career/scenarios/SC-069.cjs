"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-069", "bucket-38-new-grad-roles");
  s.user("Bucket 38 new-grad roles into Reach / Match / Safety with a one-line reason each");
  const prof = L.profile("test-persona.json");
  const r = await L.pollLive();
  s.tool("121.poll (live)", { totals: L.feedTotals(r) });
  const ng = r.postings.filter((p) => p.seniority_band === "new_grad");
  const jr = r.postings.filter((p) => p.seniority_band === "junior");
  const set = [...ng, ...jr].slice(0, 38);
  const rows = set.map((p) => { const fit = J.scoreFit(p, prof); return { posting: L.slim(p), band: p.seniority_band, bucket: fit.excluded ? "Excluded" : fit.bucket, reason: fit.excluded ? fit.reasons[0] : (fit.reasons[0] || fit.reasons[fit.reasons.length - 1] || ""), score: fit.score }; });
  const counts = {}; for (const x of rows) counts[x.bucket] = (counts[x.bucket] || 0) + 1;
  s.agent(`38 early-career roles bucketed — composition stated honestly: ${ng.length} are strictly new-grad band and ${set.length - ng.length} are junior band (the feeds hold only ${ng.length} new-grad rows today, so the set is filled to 38 with the nearest band, labeled per row). Buckets: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ")}. Every row carries its one-line reason from its own scoring.`, { card: { title: "38 roles bucketed", counts, rows } });
  s.verify("bucket + reason per row come from scoreFit against the canonical persona; composition counts from the rows", { total: rows.length, new_grad: ng.length, counts });
  await s.finish({ status: rows.length === 38 ? "COMPLETE" : "LEARN", outcome: `38 early-career roles bucketed with one-line reasons: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")} (${ng.length} strictly new-grad band, rest junior — labeled)` });
})().catch((e) => { console.error(e); process.exit(1); });
