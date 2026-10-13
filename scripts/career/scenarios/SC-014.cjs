// SC-014 Find 75 data scientists at fintechs in SF who share my major
"use strict";
const L = require("./_w01-lib.cjs"); const { M, H } = L;
(async () => {
  const s = H.session("SC-014", "outreach-75-data-scientists-fintech-sf-major");
  const user = L.USERS.alex, profile = L.PROFILES.alex; // persona major: Computer Science (B.S. CS, TEST University)
  s.user("Find 75 data scientists at fintechs in SF who share my major");
  s.agent(`Your major on file is Computer Science — "share my major" = CS graduates. Building: data scientists, fintech, San Francisco, CS.`);
  const q = M.parseTarget("Find 75 data scientists at fintechs in San Francisco", profile);
  s.tool("124.parseTargetSpec", { parsed: q, user_major_from_profile: "Computer Science" });
  const fintechs = ["Stripe", "Plaid", "Ramp", "Brex (TEST fintech)", "Mercury (TEST fintech)", "Chime (TEST fintech)", "SoFi", "Affirm (TEST fintech)", "Block (TEST fintech)", "Coinbase (TEST fintech)"];
  const records = L.generate(120, fintechs, (i, firm) => ({ title: "Data Scientist", seniority_band: "analyst", geography: "San Francisco", office: "San Francisco", schools: [["TEST University", "Stanford University", "UC Berkeley", "MIT"][i % 4]], major: i % 5 === 4 ? "Economics" : "Computer Science", factKind: "major" }), 1414);
  await L.verifyPool(records, L.fixtureVerifier());
  const sourced = records.filter(c => c.major === "Computer Science");
  s.tool("sourcing filter (major = Computer Science)", { in: records.length, out: sourced.length });
  const supp = M.createSuppressionStore();
  const pool = M.buildList(sourced, { count: 75, firms: fintechs, role_family: "data_science" }, { profile, suppression: supp, userId: "u-alex", nowMs: L.NOW });
  const card = M.listReviewCard(pool, q);
  s.tool("124.buildList", { yield: pool.yield }); s.card({ title: "List review — 75 data scientists, fintech SF, CS majors", ...card });
  const { drafts, tiers, gatePass } = L.draftAll(pool.selected, user);
  s.tool("124.draftAndGate", { drafted: drafts.length, gate_pass: gatePass, tiers });
  L.sampleDrafts(s, drafts, 2, "SC-014");
  s.user("Approved");
  const campaign = M.createCampaign({ id: "sc014-campaign", userId: "u-alex", approved: true });
  M.enqueue(campaign, pool.selected.map((c, i) => ({ candidate: c, draft: drafts[i] })), { suppression: supp });
  const plan = M.planWave(campaign, { waveNumber: 1, seed: 14 });
  const transport = L.testTransport();
  const sentRes = await M.sendPending(campaign, { transport, suppression: supp, maxItems: plan.scheduled, nowIso: L.NOW_ISO });
  s.tool("124.sendPending (TEST transport)", { days: plan.days, ...sentRes });
  s.verify("75 selected, all CS majors, all SF fintech", { selected: pool.selected.length, all_cs: pool.selected.every(c => c.major === "Computer Science"), all_sf: pool.selected.every(c => c.office === "San Francisco"), gate_pass: gatePass, sent_wave1: sentRes.sent });
  const ok = pool.selected.length === 75 && gatePass === 75 && sentRes.sent === plan.scheduled;
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `75 data scientists at SF fintechs sharing the user's CS major selected, drafted (gate 75/75) and wave-1 sent via TEST seed inbox. People were labeled TEST fixtures; several fintech firm names are labeled fixture entries beyond firm-sets.json.`, reason: ok ? undefined : "counts off", unblock: ok ? undefined : "inspect pool" });
})();
