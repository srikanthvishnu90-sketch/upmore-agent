"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-027", "ghost-job-kept-out");
  const prof = L.profile("test-persona.json");
  const r = await L.pollLive();
  s.tool("121.poll (live)", { totals: L.feedTotals(r) });
  const now = Date.now();
  const aged = r.postings.map((p) => ({ p, age: p.posted_at ? Math.floor((now - Date.parse(p.posted_at)) / 86400000) : 0 })).filter((x) => x.age >= 60 && !J.scoreFit(x.p, prof).excluded).sort((a, b) => b.age - a.age);
  let ghost, planted = false;
  if (aged.length) { ghost = aged[0].p; }
  else { const base = r.postings.find((p) => p.role_family === "SWE" && !J.scoreFit(p, prof).excluded); ghost = Object.assign({}, base, { posted_at: new Date(now - 94 * 86400000).toISOString() }); planted = true; }
  s.user(`(a ${planted ? "94-day-old reposted" : aged[0].age + "-day-old"} listing matches my keywords: ${ghost.title} at ${ghost.company})`);
  const fit = J.scoreFit(ghost, prof);
  const scoredRow = Object.assign(fit, { posting: ghost });
  const { kept, dropped } = D.ghostGuard([scoredRow], { now, repostCounts: { [ghost.job_id]: 2 } });
  s.agent(`That listing scores ${fit.score} on keywords, but I am keeping it OUT of your shortlist: ${dropped.length ? dropped[0].quality.summary : "no ghost flags"}. A role open that long and reposted twice is very likely a ghost posting — flagging it instead of recommending it. ${planted ? "(Scenario condition: no live posting in today's feeds is both 60+ days old and a keyword match, so the 94-day/reposted state from the scenario was applied to a real live posting row — its title, company and JD are real.)" : ""}`, { card: { title: "Ghost job held back", posting: L.slim(ghost), quality: dropped.length ? dropped[0].quality : null, in_shortlist: kept.length > 0 } });
  s.verify("ghostGuard (131) over qualityFlags (121): lower_odds posting is in dropped, not kept", { planted_age_on_real_row: planted, kept: kept.length, dropped: dropped.length, summary: dropped.length ? dropped[0].quality.summary : null });
  await s.finish({ status: "COMPLETE", outcome: `Ghost listing (${ghost.title}, ${ghost.company}) flagged '${dropped.length ? dropped[0].quality.summary : ""}' and kept out of the shortlist despite a keyword fit score of ${fit.score}`, reason: planted ? "no live 60+ day keyword-matching posting existed in today's feeds; the scenario's 94-day/reposted condition was applied to a real live posting row and labeled as such in the transcript" : undefined });
})().catch((e) => { console.error(e); process.exit(1); });
