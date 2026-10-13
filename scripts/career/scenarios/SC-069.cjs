"use strict";
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-069", "bucket-38-new-grad-roles");
  s.user("Bucket 38 new-grad roles into Reach / Match / Safety with a one-line reason each");
  const all = await L.feedMany(L.WIDE_FEEDS);
  const scoring = L.scoringProfile();
  const ng = all.filter((p) => /intern|new grad|early career|university/i.test(p.title));
  const rows = ng.slice(0, 60).map((p) => { const f = L.Jobs.scoreFit(p, scoring); return f.excluded ? { company: p.company, role: p.title, bucket: "Excluded", reason: f.hard_fails[0] } : { company: p.company, role: p.title, bucket: f.bucket, reason: `fit ${f.score} vs bar ${f.bar} — ${f.reasons[0] || f.gaps[0] || "scored"}` }; });
  const thirty8 = rows.slice(0, 38);
  s.tool("121-career-jobs + scoreFit bucketing", { newGradPool: ng.length, rows: thirty8 });
  const counts = thirty8.reduce((a, r) => { a[r.bucket] = (a[r.bucket] || 0) + 1; return a; }, {});
  s.agent(`38 new-grad roles bucketed — one line each (hard-filter exclusions are shown as their own line, never silently dropped or force-bucketed):\n\n${thirty8.map((r, i) => `${i + 1}. [${r.bucket}] ${r.company} — ${r.role}: ${r.reason}`).join("\n")}`, { card: { type: "buckets", title: "38 new-grad roles bucketed", counts, rows: thirty8 } });
  const ok = thirty8.length === 38 && thirty8.every((r) => r.bucket && r.reason && r.reason.length > 3);
  s.verify("38 rows, each with a bucket and a one-line reason taken from the rail's own scoreFit output (reasons/hard_fails verbatim)", { counts, ok });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `38 new-grad roles bucketed with one-line reasons: ${JSON.stringify(counts)}.`, reason: ok ? null : `only ${thirty8.length} new-grad roles available across the wide feeds`, unblock: ok ? null : "More boards in the poll set." });
})();
