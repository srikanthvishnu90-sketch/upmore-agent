// SC-004 Get me 40 coffee chats with associates at McKinsey, Bain, BCG
"use strict";
const L = require("./_w01-lib.cjs"); const { M, H } = L;
(async () => {
  const s = H.session("SC-004", "outreach-40-mbb-coffee-chats");
  const user = L.USERS.alex, profile = L.PROFILES.alex;
  s.user("Get me 40 coffee chats with associates at McKinsey, Bain, BCG");
  const q = M.parseTarget("I want coffee chats with associates at McKinsey, Bain, BCG. Get me 40.", profile);
  s.tool("124.parseTargetSpec", q);
  const firms = L.FIRM_SETS.sets.mbb.firms.map(f => f.name);
  const records = L.generate(72, firms, (i) => ({
    title: "Associate", seniority_band: "associate", geography: ["New York", "Chicago", "Boston"][i % 3], office: ["New York", "Chicago", "Boston"][i % 3],
    schools: [["TEST University", "University of Chicago", "Northwestern University", "Duke University"][i % 4]],
    factKind: i % 3 === 0 ? "panel" : "path", panel: "consulting recruiting",
  }), 4004);
  await L.verifyPool(records, L.fixtureVerifier());
  const supp = M.createSuppressionStore();
  const pool = M.buildList(records, q, { profile, suppression: supp, userId: "u-alex", nowMs: L.NOW });
  const card = M.listReviewCard(pool, q);
  s.tool("124.buildList", { yield: pool.yield }); s.card({ title: "List review — 40 MBB associates", ...card });
  const { drafts, tiers, gatePass } = L.draftAll(pool.selected, user);
  s.tool("124.draftAndGate", { drafted: drafts.length, gate_pass: gatePass, tiers });
  L.sampleDrafts(s, drafts, 1, "SC-004");
  s.agent(`40 MBB associates selected (per-firm cap 15 respected: ${JSON.stringify(card.breakdown.by_firm)}), drafts gated ${gatePass}/40. Sending wave 1 now; as replies land I'll propose slots from your calendar and book them — a coffee chat only counts when it's on the calendar.`);
  s.user("Approved — send");
  const campaign = M.createCampaign({ id: "sc004-campaign", userId: "u-alex", approved: true });
  M.enqueue(campaign, pool.selected.map((c, i) => ({ candidate: c, draft: drafts[i] })), { suppression: supp });
  const plan = M.planWave(campaign, { waveNumber: 1, seed: 3 });
  const transport = L.testTransport();
  const sentRes = await M.sendPending(campaign, { transport, suppression: supp, maxItems: plan.scheduled, nowIso: L.NOW_ISO });
  s.tool("124.sendPending (TEST transport)", { days: plan.days, ...sentRes });
  // Fixture replies: 8 of the sent associates reply positively (labeled fixture replies in the TEST inbox).
  let booked = 0; const slotSets = [];
  for (const item of campaign.items.filter(i => i.status === "sent").slice(0, 8)) {
    const reply = { subject: "Re: coffee chat", body: "Happy to chat — Tuesday or Wednesday afternoon works for me." };
    const handled = M.handleReply(campaign, reply, item.candidate, { suppression: supp, nowMs: L.NOW });
    const slots = M.proposeSlots({ recipientTz: "America/New_York", nowMs: L.NOW, count: 3, freeBusy: [] });
    slotSets.push({ person: item.candidate.full_name, classification: handled.classification.classification, slots: slots.map(x => x.recipient_local) });
    M.recordOutcome(campaign, { type: "reply" }); M.recordOutcome(campaign, { type: "positive" }); M.recordOutcome(campaign, { type: "meeting_booked" }); booked++;
  }
  s.tool("124.handleReply + proposeSlots (8 fixture positive replies)", slotSets);
  const metrics = M.campaignMetrics({ pool: pool.yield, campaign });
  s.tool("124.campaignMetrics", metrics);
  s.agent(`Wave 1 sent ${sentRes.sent}. In this fixture run, 8 associates replied positively; I proposed slots in their timezone and booked ${booked} coffee chats (meetings_booked in campaign state). The other ${sentRes.sent - booked} are still pending replies — follow-ups need your continue tap at day 5–7.`);
  s.verify("Campaign state: sent, meetings_booked", { sent: sentRes.sent, meetings_booked: campaign.stats.meetings_booked, replies: campaign.stats.replies, inbox: transport.inbox.length });
  const ok = pool.selected.length === 40 && gatePass === 40 && sentRes.sent === 40 && booked === 8 && campaign.stats.meetings_booked === 8;
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `40 MBB associates contacted in capped waves via TEST seed inbox; 8 fixture positive replies converted to booked coffee chats with timezone-correct slots. People/replies were labeled TEST fixtures; real replies are the remaining real-world input.`, reason: ok ? undefined : "counts off", unblock: ok ? undefined : "inspect campaign stats" });
})();
