// SC-002 Find 500 bulge bracket bankers; draft the networking email; run the campaign in safe waves
"use strict";
const L = require("./_w01-lib.cjs"); const { M, H } = L;
(async () => {
  const s = H.session("SC-002", "outreach-500-bb-campaign-safe-waves");
  const user = L.USERS.alex, profile = L.PROFILES.alex;
  const TEXT = "Find 500 bulge bracket bankers; draft the networking email; run the campaign in safe waves";
  s.user(TEXT);
  const q = M.parseTarget("Find 500 bulge bracket investment bankers, come up with a good networking email, then email them", profile);
  s.tool("124.parseTargetSpec", q);
  const firms = L.FIRM_SETS.sets.bulge_bracket.firms.filter(f => f.status !== "historical").map(f => f.name);
  const records = L.generate(560, firms, (i, firm) => ({
    title: i % 4 === 3 ? "Associate" : "Analyst", seniority_band: i % 4 === 3 ? "associate" : "analyst",
    geography: ["New York", "Chicago", "San Francisco", "Houston"][i % 4], office: ["New York", "Chicago", "San Francisco", "Houston"][i % 4],
    schools: [["TEST University", "New York University", "University of Michigan", "Columbia University"][i % 4]],
    factKind: i % 3 === 0 ? "deal" : "path", deal: "a sponsor-backed carve-out",
  }), 2002);
  await L.verifyPool(records, L.fixtureVerifier());
  const supp = M.createSuppressionStore();
  const pool = M.buildList(records, q, { profile, suppression: supp, userId: "u-alex", nowMs: L.NOW });
  const card = M.listReviewCard(pool, q);
  s.tool("124.buildList", { yield: pool.yield, exclusions: pool.exclusions });
  s.card({ title: "Honest yield — 500 bulge bracket bankers", ...card });
  s.agent(`Honest yield before anything sends: found ${pool.yield.found} fixture records across the ${firms.length} active bulge-bracket firms. The decided per-firm cap (15 per firm per 30 days) means only ${pool.selected.length} can be contacted in this 30-day window — the other ${pool.reserve.length} sit in the reserve pool and promote automatically in later windows. Anyone who tells you they emailed 500 BB bankers this month blew through that cap. Drafting for the ${pool.selected.length} sendable now; reserve drafts are generated when each reserve block promotes.`);
  const { drafts, tiers, gatePass } = L.draftAll(pool.selected, user);
  s.tool("124.draftAndGate", { drafted: drafts.length, gate_pass: gatePass, tiers });
  L.sampleDrafts(s, drafts, 1, "SC-002");
  s.user("Approved — run it in safe waves");
  const campaign = M.createCampaign({ id: "sc002-campaign", userId: "u-alex", approved: true });
  const enq = M.enqueue(campaign, pool.selected.map((c, i) => ({ candidate: c, draft: drafts[i] })), { suppression: supp });
  const plan = M.planWave(campaign, { waveNumber: 1, seed: 7 });
  const safety = { channel: campaign.sending_channel, cap_day0: M.dailyCapForDay(0), cap_ceiling: M.CAPS.ceilingPerDay, user_can_raise: M.CAPS.userCanRaise, per_domain_per_day: M.CAPS.perDomainPerDay, per_firm_per_30d: M.CAPS.perFirmPer30Days, wave1_size: M.CAPS.wave1Size, bounce_breaker: M.CAPS.bounceBreakerRate, plan_days: plan.days, daily_caps: plan.daily_caps, deferred: plan.deferred.length };
  s.card({ title: "Safety plan — SC-002 campaign", ...safety });
  s.tool("124.planWave(wave 1)", plan);
  const transport = L.testTransport();
  const sentRes = await M.sendPending(campaign, { transport, suppression: supp, maxItems: plan.scheduled, nowIso: L.NOW_ISO });
  s.tool("124.sendPending via injected TEST transport (seed inbox only — no real person emailed)", sentRes);
  const metrics = M.campaignMetrics({ pool: pool.yield, campaign });
  s.tool("124.campaignMetrics", metrics);
  s.agent(`Wave 1 is out through the TEST seed inbox: ${sentRes.sent} sent, scheduled over ${plan.days} days at the decided ramp (starts ${M.dailyCapForDay(0)}/day, ceiling ${M.CAPS.ceilingPerDay}/day — I can't raise it and neither can you). The remaining queued items roll into wave 2 after the continue tap; the ${pool.reserve.length} reserve names promote in the next 30-day per-firm window. Breaker is armed at >3% bounces.`);
  s.verify("Campaign + transport state: queued, sent keys, inbox size, breaker", { enqueued: enq.filter(e => e.status === "queued").length, sent: sentRes.sent, inbox: transport.inbox.length, sentKeys: campaign.sentKeys.length, breaker_tripped: campaign.breaker.tripped, reserve: pool.reserve.length });
  const ok = sentRes.sent === plan.scheduled && transport.inbox.length === sentRes.sent && !campaign.breaker.tripped && pool.selected.length === 120;
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `500-name BB ask run honestly: ${pool.selected.length} sendable this 30-day window under the per-firm cap (rest in reserve), drafts gated, wave 1 (${sentRes.sent}) sent in safe capped waves via the TEST seed inbox. People were labeled TEST fixtures; the licensed people-data vendor key is the remaining real-world input.`, reason: ok ? undefined : "wave/cap state mismatch", unblock: ok ? undefined : "inspect plan + campaign state" });
})();
