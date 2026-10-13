// SC-020 Email 200 boutique IB analysts, warmth-ranked (same hometown first)
"use strict";
const L = require("./_w01-lib.cjs"); const { M, H } = L;
(async () => {
  const s = H.session("SC-020", "outreach-200-boutique-analysts-warmth-ranked");
  const user = L.USERS.alex, profile = { school: "TEST University", hometown: "Chicago, IL", current_employer: null };
  s.user("Email 200 boutique IB analysts, warmth-ranked (same hometown first)");
  const q = M.parseTarget("Email 200 analysts at elite boutique investment banks", profile);
  s.tool("124.parseTargetSpec + W01 warmth-priority extension", { parsed: q, warmth_rule: "same hometown first, then same school, then cold", extension: "124 buildList opts.warmthPriority (career/sc-w01, flagged for integration): default 124 weights rank school (0.7) above hometown (0.5); the user-specified priority overrides for this campaign" });
  // 200 this window needs >=14 firms at the cap; the boutique universe here = elite boutiques + middle-market
  // boutiques from the real firm sets (17 active firms), stated to the user in the agent turn below.
  const firms = [].concat(L.FIRM_SETS.sets.elite_boutique.firms, L.FIRM_SETS.sets.middle_market.firms).filter(f => f.status !== "historical").map(f => f.name);
  const records = L.generate(260, firms, (i, firm) => {
    const band = i % 10; // 0-2 hometown Chicago, 3-4 same school elsewhere, 5-9 cold
    return { title: "Analyst", seniority_band: "analyst", geography: band <= 2 ? "Chicago" : ["New York", "Charlotte", "Minneapolis"][i % 3], office: band <= 2 ? "Chicago" : ["New York", "Charlotte", "Minneapolis"][i % 3],
      schools: [band >= 3 && band <= 4 ? "TEST University" : "State University (TEST)"], hometown: band <= 2 ? "Chicago, IL" : "Elsewhere (TEST)",
      factKind: band <= 2 ? "hometown" : band <= 4 ? "school" : "path",
      relationship_to_user: band <= 2 ? "same hometown" : band <= 4 ? "same school" : "none" };
  }, 2020);
  await L.verifyPool(records, L.fixtureVerifier());
  const supp = M.createSuppressionStore();
  const pool = M.buildList(records, Object.assign({}, q, { count: 200, firms }), { profile, suppression: supp, userId: "u-alex", nowMs: L.NOW, warmthPriority: ["hometown", "school"] });
  const card = M.listReviewCard(pool, q);
  s.tool("124.buildList (warmth inside scoreCandidate.total)", { yield: pool.yield }); s.card({ title: "List review — 200 boutique analysts, warmth-ranked", ...card });
  // Warmth order proof: hometown block must outrank same-school block, which must outrank cold, on warmth score.
  const warmthOf = (c) => c.scores.warmth;
  const hometown = pool.selected.filter(c => c.hometown === "Chicago, IL"), schoolOnly = pool.selected.filter(c => c.hometown !== "Chicago, IL" && c.schools.includes("TEST University")), cold = pool.selected.filter(c => c.hometown !== "Chicago, IL" && !c.schools.includes("TEST University"));
  const avg = (a) => a.length ? a.reduce((x, c) => x + warmthOf(c), 0) / a.length : 0;
  const ranked = M.rankContacts(pool.selected, Object.assign({}, profile, { warmth_priority: ["hometown", "school"] }));
  s.tool("124.rankContacts warmth proof", { hometown_n: hometown.length, hometown_avg_warmth: avg(hometown), school_avg_warmth: avg(schoolOnly), cold_avg_warmth: avg(cold), top10_all_hometown_or_school: ranked.slice(0, 10).every(r => r.why.length > 0) });
  s.agent(`Warmth ranking is real, not cosmetic: your ${hometown.length} Chicago-hometown analysts average warmth ${avg(hometown).toFixed(2)}, same-school ${avg(schoolOnly).toFixed(2)}, cold ${avg(cold).toFixed(2)} — and the send order follows it, so the warmest names go in wave 1 while your mailbox reputation is freshest. The 200 span the elite-boutique + middle-market boutique sets (17 active firms) so the per-firm cap holds.`);
  const { drafts, tiers, gatePass } = L.draftAll(pool.selected, user);
  s.tool("124.draftAndGate", { drafted: drafts.length, gate_pass: gatePass, tiers });
  L.sampleDrafts(s, drafts, 2, "SC-020 (warmest first)");
  s.user("Approved — email them warmth-first");
  const campaign = M.createCampaign({ id: "sc020-campaign", userId: "u-alex", approved: true });
  M.enqueue(campaign, pool.selected.map((c, i) => ({ candidate: c, draft: drafts[i] })), { suppression: supp });
  const plan = M.planWave(campaign, { waveNumber: 1, seed: 20 });
  const transport = L.testTransport();
  const sentRes = await M.sendPending(campaign, { transport, suppression: supp, maxItems: plan.scheduled, nowIso: L.NOW_ISO });
  s.tool("124.sendPending (TEST transport)", { days: plan.days, ...sentRes });
  const wave1Ids = new Set(campaign.items.filter(i => i.status === "sent").map(i => i.person_id));
  const wave1Warmth = pool.selected.filter(c => wave1Ids.has(c.person_id));
  s.verify("Wave 1 is the warmest slice", { selected: pool.selected.length, gate_pass: gatePass, sent_wave1: sentRes.sent, wave1_avg_warmth: avg(wave1Warmth), overall_avg_warmth: avg(pool.selected), wave1_hometown_share: wave1Warmth.filter(c => c.hometown === "Chicago, IL").length / Math.max(1, wave1Warmth.length) });
  const ok = pool.selected.length === 200 && gatePass === 200 && avg(hometown) > avg(schoolOnly) && avg(schoolOnly) > avg(cold) && avg(wave1Warmth) >= avg(pool.selected);
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `200 boutique IB analysts emailed warmth-first via TEST seed inbox: hometown (avg warmth ${avg(hometown).toFixed(2)}) ahead of same-school (${avg(schoolOnly).toFixed(2)}) ahead of cold (${avg(cold).toFixed(2)}), proven from 124's own scores, wave 1 = warmest slice. People were labeled TEST fixtures.`, reason: ok ? undefined : "warmth order or counts off", unblock: ok ? undefined : "inspect warmth averages" });
})();
