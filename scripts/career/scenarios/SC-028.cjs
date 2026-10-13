"use strict";
const L = require("./_w02-lib.cjs"); const { H, M, PROFILE, USER } = L;
(async () => {
  const s = H.session("SC-028", "coffee-chats-strategy-analysts-fortune500");
  s.user("Get 30 coffee chats with strategy analysts at Fortune 500 companies");
  const q = M.parseTarget("Get 30 coffee chats with strategy analysts at Fortune 500 companies", PROFILE);
  s.tool("CareerOutreach.parseTarget", q);
  const firms = Array.from({ length: 15 }, (_, i) => `Fortune 500 Co ${i + 1} (TEST)`);
  const records = L.gen(30, { tag: "028", count: 30, firms, title: "Strategy Analyst", seniority: "analyst" });
  const pool = M.buildList(records, q, { profile: PROFILE });
  const camp = M.createCampaign({ id: "TEST-CAMP-028", userId: "TEST-USER", approved: true });
  const supp = M.createSuppressionStore();
  const entries = pool.selected.map((c) => { const d = M.draftAndGate(c, USER, {}); return { candidate: c, draft: d.draft, tier: d.draft.tier }; });
  const queued = M.enqueue(camp, entries, { suppression: supp }).filter((x) => x.status === "queued");
  const plan = M.scheduleCampaign(camp, { seed: 28 });
  s.tool("CareerOutreach.scheduleCampaign (W02 alias of planWave)", { scheduled: plan.scheduled, days: plan.days, daily_caps: plan.daily_caps });
  s.agent(`Built the 30-person strategy-analyst list at Fortune 500 companies (TEST fixture pool), drafted a gated personalized email for each, and scheduled the campaign under the daily caps: ${plan.scheduled} sends scheduled over ${plan.days} day(s). Coffee chats themselves land as replies come in — booking happens per positive reply (see SC-031).`, { card: { title: "Coffee-chat campaign — 30 strategy analysts", list: pool.selected.length, queued: queued.length, scheduled: plan.scheduled, days: plan.days } });
  const ok = pool.selected.length === 30 && queued.length === 30 && plan.scheduled === 30 && camp.items.every((i) => i.draft && i.draft.body.includes("stop"));
  s.verify("rail state: list=30, campaign queue=30 with gated drafts, scheduleCampaign scheduled all 30 under caps", { selected: pool.selected.length, queued: queued.length, scheduled: plan.scheduled, days: plan.days });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: `30 strategy analysts at Fortune 500 companies (TEST pool) listed, drafted and scheduled for coffee-chat outreach: 30 queued, ${plan.scheduled} scheduled over ${plan.days} day(s) under the caps.` }
    : { status: "LEARN", outcome: "Coffee-chat campaign did not verify.", reason: `selected=${pool.selected.length} queued=${queued.length} scheduled=${plan.scheduled}`, unblock: "Fix list/enqueue/schedule path and rerun SC-028." });
})().catch((e) => { console.error(e); process.exit(1); });
