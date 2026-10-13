// SC-007 Freshman at a non-target: email 300 analysts at middle-market and boutique banks
"use strict";
const L = require("./_w01-lib.cjs"); const { M, H } = L;
(async () => {
  const s = H.session("SC-007", "outreach-nontarget-freshman-300-mm-boutique");
  const user = L.USERS.samFreshman, profile = L.PROFILES.samFreshman;
  s.user("Freshman at a non-target: email 300 analysts at middle-market and boutique banks");
  const q = M.parseTarget("email 300 analysts at middle-market banks and elite boutique banks", profile);
  s.tool("124.parseTargetSpec", q);
  s.agent(`Honest read first, because it changes who we email: as a freshman at a non-target with no finance internship yet, cold-emailing 300 random analysts gets you near-zero replies. What actually works at your stage: analysts 1–3 years out, ideally from similar (non-target/state) schools, at middle-market and boutique shops — they remember being you. I built the 300 that way: recent analysts first, similar-school alumni ranked on top. A realistic reply range for this list is 5–12%, and the wins compound — every good chat is a warm path for sophomore recruiting.`);
  const firms = [].concat(L.FIRM_SETS.sets.middle_market.firms, L.FIRM_SETS.sets.elite_boutique.firms).filter(f => f.status !== "historical").map(f => f.name);
  const records = L.generate(350, firms, (i, firm) => ({
    title: "Analyst", seniority_band: "analyst", grad_year: [2023, 2024, 2025][i % 3],
    geography: ["Chicago", "New York", "Minneapolis", "Charlotte"][i % 4], office: ["Chicago", "New York", "Minneapolis", "Charlotte"][i % 4],
    schools: [i % 3 === 0 ? "large state university (TEST)" : ["Ohio State University", "Indiana University", "University of Iowa"][i % 3]],
    factKind: i % 3 === 0 ? "school" : "path", relationship_to_user: i % 3 === 0 ? "same school" : "none",
  }), 7007);
  await L.verifyPool(records, L.fixtureVerifier());
  const supp = M.createSuppressionStore();
  const pool = M.buildList(records, Object.assign({}, q, { count: 300, firms }), { profile, suppression: supp, userId: "u-sam", nowMs: L.NOW });
  const card = M.listReviewCard(pool, q);
  s.tool("124.buildList", { yield: pool.yield }); s.card({ title: "List review — 300 MM/boutique analysts, recent + similar-school first", ...card });
  const identified = [...pool.selected, ...pool.reserve].slice(0, 300);
  const { drafts, tiers, gatePass, retried } = L.draftAll(identified, user);
  s.tool("124.draftAndGate (all 300 identified)", { drafted: drafts.length, gate_pass: gatePass, tiers, retried_after_duplicate_gate: retried, this_window: pool.selected.length, reserve: identified.length - pool.selected.length });
  s.agent(`Cap note, honestly: 17 boutique/middle-market firms x the 15-per-firm cap = ${pool.selected.length} contactable this 30-day window; the other ${identified.length - pool.selected.length} are drafted and held in reserve for the next window. All 300 are identified and drafted today.`);
  L.sampleDrafts(s, drafts, 2, "SC-007");
  s.user("Approved — send in waves");
  const campaign = M.createCampaign({ id: "sc007-campaign", userId: "u-sam", approved: true });
  M.enqueue(campaign, pool.selected.map((c, i) => ({ candidate: c, draft: drafts[i] })), { suppression: supp });
  const plan = M.planWave(campaign, { waveNumber: 1, seed: 7 });
  const transport = L.testTransport();
  const sentRes = await M.sendPending(campaign, { transport, suppression: supp, maxItems: plan.scheduled, nowIso: L.NOW_ISO });
  s.tool("124.sendPending (TEST transport)", { days: plan.days, ...sentRes });
  const similarSchool = identified.filter(c => c.schools.includes(profile.school)).length;
  s.verify("Freshman-honest targeting from pool state", { identified: identified.length, selected_this_window: pool.selected.length, recent_grads_2023_25: identified.filter(c => [2023, 2024, 2025].includes(c.grad_year)).length, similar_school: similarSchool, gate_pass: gatePass, sent_wave1: sentRes.sent });
  const ok = identified.length === 300 && pool.selected.length === 255 && gatePass === 300 && sentRes.sent === plan.scheduled && similarSchool > 50;
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `300 MM/boutique analysts identified with the honest freshman re-cut (2023–25 analysts, similar-school ranked first) and 300 gated drafts; 255 contactable this 30-day window under the per-firm cap (45 drafted in reserve), wave 1 sent via TEST seed inbox. People were labeled TEST fixtures; real names at scale need the licensed vendor key.`, reason: ok ? undefined : "counts off", unblock: ok ? undefined : "inspect pool" });
})();
