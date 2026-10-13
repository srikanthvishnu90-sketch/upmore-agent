"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-119", "ghost-job-label-before-applying");
  s.user("(about to apply) — role open 94 days and reposted twice");
  const prof = L.profile("test-persona.json");
  const r = await L.pollLive();
  s.tool("121.poll (live)", { totals: L.feedTotals(r) });
  const now = Date.now();
  const base = r.postings.find((p) => p.role_family === "SWE" && !J.scoreFit(p, prof).excluded);
  const ghost = Object.assign({}, base, { posted_at: new Date(now - 94 * 86400000).toISOString() });
  const order = [];
  const fit = J.scoreFit(ghost, prof); order.push("fit_scored");
  const { kept, dropped } = D.ghostGuard([Object.assign(fit, { posting: ghost })], { now, repostCounts: { [ghost.job_id]: 2 } }); order.push("ghost_label_checked");
  const packetCreated = kept.length > 0; if (packetCreated) order.push("packet_created");
  s.agent(`STOP — before you spend an application on ${ghost.title} at ${ghost.company}: ${dropped.length ? dropped[0].quality.summary : ""}. That label was checked AFTER fit scoring but BEFORE any application packet was built (pipeline order recorded: ${order.join(" → ")}), and no packet exists for this role. A 94-day-old, twice-reposted listing is where applications go to disappear; the fit score (${fit.score}) does not change that. (Scenario condition applied to a real live posting row: its age was set to the scenario's 94 days and its repost count to 2 — title, company and JD are the real feed row.)`, { card: { title: "Ghost label — application not spent", posting: L.slim(ghost), quality: dropped.length ? dropped[0].quality : null, packet_created: packetCreated, pipeline_order: order } });
  s.verify("ghostGuard dropped the role; packet_created is false in the recorded pipeline order", { dropped: dropped.length, packet_created: packetCreated, order });
  await s.finish({ status: dropped.length === 1 && !packetCreated ? "COMPLETE" : "LEARN", outcome: "Ghost label ('open 94 days, reposted 2 times — lower odds') stated before any application work; no packet built for the role" });
})().catch((e) => { console.error(e); process.exit(1); });
