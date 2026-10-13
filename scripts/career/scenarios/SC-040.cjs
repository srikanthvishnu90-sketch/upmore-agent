"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-040", "refresh-on-demand");
  const store = L.memStore();
  const p1 = await L.pollLive(store);
  s.user("check again right now — anything new?");
  const p2 = await L.pollLive(store);
  s.tool("121.poll immediate re-poll (live)", { totals_poll1: L.feedTotals(p1), totals_poll2: L.feedTotals(p2), new_vs_snapshot: p2.new_postings.length, feeds: L.feedSummary(p2) });
  s.agent(`Re-polled all ${p2.feeds.length} boards just now. Against the snapshot from moments ago (${p1.postings.length} postings), the diff is ${p2.new_postings.length} new postings${p2.new_postings.length ? ": " + p2.new_postings.map((p) => `${p.title} at ${p.company}`).join("; ") : ""}. That number comes from the rail's diff against its own snapshot — not from my memory of the last answer.`, { card: { title: "Refresh diff", baseline: p1.postings.length, current: p2.postings.length, new: p2.new_postings.map(L.slim) } });
  s.verify("diffNew count taken from the second poll's own snapshot comparison", { baseline: p1.postings.length, current: p2.postings.length, new_count: p2.new_postings.length });
  await s.finish({ status: "COMPLETE", outcome: `Immediate live re-poll diffed against the rail snapshot: ${p2.new_postings.length} new postings (${p1.postings.length} baseline → ${p2.postings.length} current)` });
})().catch((e) => { console.error(e); process.exit(1); });
