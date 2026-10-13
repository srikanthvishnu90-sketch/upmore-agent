// SC-009 Get 100 engineers at Stripe, Ramp, Plaid, Datadog who went to CMU or are from my hometown
"use strict";
const L = require("./_w01-lib.cjs"); const { M, H } = L;
(async () => {
  const s = H.session("SC-009", "outreach-100-engineers-cmu-hometown");
  const user = Object.assign({}, L.USERS.alex, { school: "Carnegie Mellon University" });
  const profile = { school: "Carnegie Mellon University", hometown: "Pittsburgh, PA", current_employer: null };
  s.user("Get 100 engineers at Stripe, Ramp, Plaid, Datadog who went to CMU or are from my hometown");
  const q = M.parseTarget("Get 100 engineers at Stripe, Ramp, Plaid, Datadog who went to CMU or are from my hometown", profile);
  s.tool("124.parseTargetSpec", { parsed: q, profile_hometown: profile.hometown });
  const firms = ["Stripe", "Ramp", "Plaid", "Datadog"];
  const records = L.generate(150, firms, (i) => {
    const cmu = i % 5 !== 4; const hometown = i % 5 === 3;
    return { title: "Software Engineer", seniority_band: "analyst", geography: ["New York", "San Francisco", "Pittsburgh"][i % 3], office: ["New York", "San Francisco", "Pittsburgh"][i % 3],
      schools: [cmu ? "Carnegie Mellon University" : "State University (TEST)"], hometown: hometown ? "Pittsburgh, PA" : "Elsewhere (TEST)",
      factKind: hometown ? "hometown" : "build", built: "a payments API used by thousands of merchants",
      relationship_to_user: hometown ? "same hometown" : cmu ? "same school" : "none" };
  }, 9009);
  await L.verifyPool(records, L.fixtureVerifier());
  const sourced = records.filter(c => c.schools.includes("Carnegie Mellon University") || c.hometown === "Pittsburgh, PA");
  s.tool("sourcing filter (CMU OR hometown Pittsburgh)", { in: records.length, out: sourced.length, cmu: sourced.filter(c => c.schools.includes("Carnegie Mellon University")).length, hometown_only: sourced.filter(c => !c.schools.includes("Carnegie Mellon University") && c.hometown === "Pittsburgh, PA").length });
  const supp = M.createSuppressionStore();
  const pool = M.buildList(sourced, { count: 100, firms, role_family: "software_engineering" }, { profile, suppression: supp, userId: "u-alex", nowMs: L.NOW });
  const card = M.listReviewCard(pool, q);
  s.tool("124.buildList", { yield: pool.yield }); s.card({ title: "List review — 100 engineers, CMU or Pittsburgh", ...card });
  const identified = [...pool.selected, ...pool.reserve].slice(0, 100);
  const { drafts, tiers, gatePass } = L.draftAll(identified, user);
  s.tool("124.draftAndGate (all 100 identified, selected + reserve)", { drafted: drafts.length, gate_pass: gatePass, tiers, selected_this_window: pool.selected.length, reserve_next_window: pool.reserve.length });
  s.agent(`All 100 are identified and drafted. One decided cap to be straight about: only 4 firms are in scope, and the per-firm cap is 15 per 30 days — so 60 send this window and 40 are drafted-and-held in reserve for the next window. I won't blow the cap to hit a round number.`);
  L.sampleDrafts(s, drafts, 2, "SC-009");
  s.user("Approved — message them");
  const campaign = M.createCampaign({ id: "sc009-campaign", userId: "u-alex", approved: true });
  M.enqueue(campaign, pool.selected.map((c, i) => ({ candidate: c, draft: drafts[i] })), { suppression: supp });
  const plan = M.planWave(campaign, { waveNumber: 1, seed: 9 });
  const transport = L.testTransport();
  const sentRes = await M.sendPending(campaign, { transport, suppression: supp, maxItems: plan.scheduled, nowIso: L.NOW_ISO });
  s.tool("124.sendPending (TEST transport)", { days: plan.days, ...sentRes });
  const allMatch = pool.selected.every(c => c.schools.includes("Carnegie Mellon University") || c.hometown === "Pittsburgh, PA");
  s.verify("Every selected engineer matches CMU-or-hometown", { selected: pool.selected.length, all_match: allMatch, by_firm: card.breakdown.by_firm, gate_pass: gatePass, sent_wave1: sentRes.sent });
  const ok = identified.length === 100 && pool.selected.length === 60 && allMatch && gatePass === 100 && sentRes.sent === plan.scheduled;
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `100 engineers at Stripe/Ramp/Plaid/Datadog matching CMU-or-hometown identified and drafted (gate 100/100); 60 sendable this 30-day window under the decided per-firm cap, 40 drafted in reserve for the next window; wave 1 messaged via TEST seed inbox. People were labeled TEST fixtures; the vendor key is the remaining real-world input.`, reason: ok ? undefined : "counts off", unblock: ok ? undefined : "inspect pool" });
})();
