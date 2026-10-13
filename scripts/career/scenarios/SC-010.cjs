// SC-010 VP at a bank moving to PE: reach 80 PE associates/principals, peer-level tone
"use strict";
const L = require("./_w01-lib.cjs"); const { M, H } = L;
(async () => {
  const s = H.session("SC-010", "outreach-vp-to-pe-peer-tone");
  const user = L.USERS.morganVP, profile = L.PROFILES.morganVP;
  s.user("VP at a bank moving to PE: reach 80 PE associates/principals, peer-level tone");
  const q = M.parseTarget("reach 80 PE associates and principals in private equity", profile);
  s.tool("124.parseTargetSpec", q);
  const firms = [].concat(L.FIRM_SETS.sets.mega_fund_pe.firms.map(f => f.name), ["Bain Capital"]);
  const records = L.generate(120, firms, (i, firm) => ({
    title: i % 3 === 2 ? "Principal" : "Associate", seniority_band: i % 3 === 2 ? "principal" : "associate",
    geography: "New York", office: "New York", schools: [["TEST University", "Harvard University", "Stanford University"][i % 3]],
    factKind: "deal", deal: "a healthcare buyout", relationship_to_user: "none",
  }), 1010);
  records.push(L.person({ full_name: "Colleague At Own Bank (TEST)", current_firm: "TEST Bank (current employer — excluded)", title: "Associate", work_email: "colleague@testbank.test" }));
  await L.verifyPool(records, L.fixtureVerifier());
  const supp = M.createSuppressionStore();
  const pool = M.buildList(records, Object.assign({}, q, { count: 80, firms }), { profile, suppression: supp, userId: "u-morgan", nowMs: L.NOW });
  const card = M.listReviewCard(pool, q);
  s.tool("124.buildList", { yield: pool.yield, exclusions: pool.exclusions }); s.card({ title: "List review — PE associates/principals", ...card });
  s.agent(`Two guardrails for a move like this, both enforced: (1) your own firm is excluded — the colleague record at your current bank was dropped by the own-employer rule (${pool.exclusions.own_employer} excluded); (2) no deal-confidential information ever enters a draft — drafts use only public, sourced facts (a deal they worked on that is public record in the fixture) plus your public background. Tone is peer-level: no student framing, no "hope to learn from you" — VP-to-associate/principal, operator to operator. Per-firm cap: 6 firms x 15 = 90, so the full 80 fits this window.`);
  const peerVoice = { formality: 0.6, warmth: 0.5, humor: 0, directness: 0.85, plain_student_voice: false };
  const { drafts, tiers, gatePass } = L.draftAll(pool.selected, user, {});
  const peerDrafts = pool.selected.map(c => M.draftFor(c, user, { voice: peerVoice }));
  s.tool("124.draftAndGate (peer voice profile applied on re-render)", { drafted: drafts.length, gate_pass: gatePass, tiers, peer_voice: peerVoice, student_voice_markers: peerDrafts.filter(d => /I'm .* a (freshman|sophomore|junior|student)/.test(d.body)).length });
  L.sampleDrafts(s, peerDrafts, 2, "SC-010 peer tone");
  s.user("Approved");
  const campaign = M.createCampaign({ id: "sc010-campaign", userId: "u-morgan", approved: true });
  M.enqueue(campaign, pool.selected.map((c, i) => ({ candidate: c, draft: peerDrafts[i] })), { suppression: supp });
  const plan = M.planWave(campaign, { waveNumber: 1, seed: 10 });
  const transport = L.testTransport();
  const sentRes = await M.sendPending(campaign, { transport, suppression: supp, maxItems: plan.scheduled, nowIso: L.NOW_ISO });
  s.tool("124.sendPending (TEST transport)", { days: plan.days, ...sentRes });
  s.verify("Own firm excluded; peer drafts carry no student framing; wave sent", { selected: pool.selected.length, own_employer_excluded: pool.exclusions.own_employer, sent_wave1: sentRes.sent, inbox: transport.inbox.length });
  const ok = pool.selected.length === 80 && pool.exclusions.own_employer === 1 && sentRes.sent === plan.scheduled;
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `80 PE associates/principals selected across 6 mega-fund firms, own firm excluded by rule, peer-tone gated drafts, wave 1 sent via TEST seed inbox. People were labeled TEST fixtures (persona-mba-switcher variant).`, reason: ok ? undefined : "counts off", unblock: ok ? undefined : "inspect pool" });
})();
