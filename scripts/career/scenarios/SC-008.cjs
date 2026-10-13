// SC-008 Junior at Wharton: network into BB M&A (2023-25 analysts and first-year associates)
"use strict";
const L = require("./_w01-lib.cjs"); const { M, H } = L;
(async () => {
  const s = H.session("SC-008", "outreach-wharton-junior-bb-ma");
  const user = L.USERS.jordanWharton, profile = L.PROFILES.jordanWharton;
  s.user("Junior at Wharton: network into BB M&A (2023–25 analysts and first-year associates)");
  const q = M.parseTarget("network into bulge bracket M&A, 2023-25 analysts and first-year associates", profile);
  s.tool("124.parseTargetSpec", q);
  const firms = L.FIRM_SETS.sets.bulge_bracket.firms.filter(f => f.status !== "historical").map(f => f.name);
  const records = L.generate(240, firms, (i) => ({
    title: i % 2 ? "Associate" : "Analyst", seniority_band: i % 2 ? "associate" : "analyst", grad_year: i % 2 ? 2023 : [2024, 2025][i % 2],
    group: "M&A", geography: "New York", office: "New York",
    schools: [i % 3 === 0 ? "Wharton School, University of Pennsylvania" : ["New York University", "Columbia University", "University of Michigan"][i % 3]],
    prior_firms: i % 5 === 0 ? ["boutique bank (TEST)"] : [], factKind: i % 4 === 0 ? "deal" : "school", deal: "a cross-border M&A deal",
    relationship_to_user: i % 3 === 0 ? "same school" : "none",
  }), 8008);
  await L.verifyPool(records, L.fixtureVerifier());
  const inWindow = records.filter(c => [2023, 2024, 2025].includes(c.grad_year) && c.group === "M&A");
  s.tool("sourcing filter (BB M&A group + 2023-25 cohorts)", { in: records.length, out: inWindow.length });
  const supp = M.createSuppressionStore();
  // 160 target: 8 active BB firms x 15 cap = 120 max this window; ask is a networking program, take the full window.
  const pool = M.buildList(inWindow, Object.assign({}, q, { count: 160, firms }), { profile, suppression: supp, userId: "u-jordan", nowMs: L.NOW });
  const card = M.listReviewCard(pool, q);
  s.tool("124.buildList", { yield: pool.yield }); s.card({ title: "List review — BB M&A 2023-25, Wharton alumni first", ...card });
  const top20 = pool.selected.slice(0, 20);
  const topAlumni = top20.filter(c => c.schools.includes(profile.school)).length;
  s.agent(`Prioritization, as asked: Wharton alumni and prior-firm overlaps float to the top (${topAlumni} of the top 20 are Wharton). Per-firm cap gives ${pool.selected.length} this 30-day window across the 8 active BBs; the rest are reserve. One sequencing rule I will hold: referral asks go in email two, after a real chat — never in the first cold email. The quality gate enforces it (unverified referral claims are dropped from drafts).`);
  const { drafts, tiers, gatePass } = L.draftAll(pool.selected, user);
  s.tool("124.draftAndGate", { drafted: drafts.length, gate_pass: gatePass, tiers, referral_claims_in_drafts: drafts.filter(d => /told me to reach out|referred me/.test(d.body)).length });
  L.sampleDrafts(s, drafts, 2, "SC-008");
  s.user("Approved");
  const campaign = M.createCampaign({ id: "sc008-campaign", userId: "u-jordan", approved: true });
  M.enqueue(campaign, pool.selected.map((c, i) => ({ candidate: c, draft: drafts[i] })), { suppression: supp });
  const plan = M.planWave(campaign, { waveNumber: 1, seed: 8 });
  const transport = L.testTransport();
  const sentRes = await M.sendPending(campaign, { transport, suppression: supp, maxItems: plan.scheduled, nowIso: L.NOW_ISO });
  s.tool("124.sendPending (TEST transport)", { days: plan.days, ...sentRes });
  s.verify("Cohort + prioritization + no-referral-in-email-1 from rail state", { selected: pool.selected.length, all_cohorts_2023_25: pool.selected.every(c => [2023, 2024, 2025].includes(c.grad_year)), top20_wharton: topAlumni, gate_pass: gatePass, sent_wave1: sentRes.sent });
  const ok = pool.selected.length === 120 && gatePass === 120 && sentRes.sent === plan.scheduled && topAlumni >= 10;
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `BB M&A networking program built for a Wharton junior: 120 sendable this window (8 BBs x per-firm cap), Wharton alumni prioritized to the top, 120 gated drafts with zero referral claims in email one, wave 1 sent via TEST seed inbox. People were labeled TEST fixtures; the vendor key is the remaining real-world input.`, reason: ok ? undefined : "counts off", unblock: ok ? undefined : "inspect pool" });
})();
