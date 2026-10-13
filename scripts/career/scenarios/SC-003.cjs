// SC-003 Find 100 PMs at Series B-D startups in NYC who went to my school; message them
"use strict";
const L = require("./_w01-lib.cjs"); const { M, H } = L;
(async () => {
  const s = H.session("SC-003", "outreach-100-pms-series-bd-nyc-school");
  const user = L.USERS.alex, profile = L.PROFILES.alex;
  s.user("Find 100 PMs at Series B–D startups in NYC who went to my school; message them");
  const q = M.parseTarget("Find 100 PMs at Series B-D startups in NYC who went to my school and message them", profile);
  s.tool("124.parseTargetSpec", q);
  const startups = Array.from({ length: 30 }, (_, i) => ["Nimbus", "Ferrous", "Halcyon", "Pivotly", "Kernel", "Atlas", "Beacon", "Cobalt", "Drift", "Ember"][i % 10] + [" Health", " Pay", " Labs", " AI", " Systems"][Math.floor(i / 10) % 5] + " (TEST startup)");
  const records = L.generate(150, startups, (i, firm) => ({
    title: i % 5 === 4 ? "Senior Product Manager" : "Product Manager", seniority_band: "associate",
    geography: "NYC", office: "New York",
    schools: [i < 118 ? "TEST University" : ["New York University", "Columbia University", "Rutgers University"][i % 3]],
    startup_stage: ["B", "C", "D", "B", "C"][i % 5], factKind: "build", built: "an onboarding flow that lifted activation",
    relationship_to_user: i < 118 ? "same school" : "none",
  }), 3003);
  await L.verifyPool(records, L.fixtureVerifier());
  // Sourcing seam: hard filters the spec demands (stage + school) applied before 124's hygiene/scoring pipeline.
  const sourced = records.filter(c => ["B", "C", "D"].includes(c.startup_stage) && c.schools.includes(profile.school));
  s.tool("sourcing filter (stage B-D + school, public-source seam over TEST fixtures)", { in: records.length, out: sourced.length, stages: [...new Set(sourced.map(c => c.startup_stage))] });
  const supp = M.createSuppressionStore();
  const pool = M.buildList(sourced, Object.assign({}, q, { count: 100 }), { profile, suppression: supp, userId: "u-alex", nowMs: L.NOW });
  const card = M.listReviewCard(pool, q);
  s.tool("124.buildList", { yield: pool.yield, exclusions: pool.exclusions });
  s.card({ title: "List review — 100 PMs, Series B-D, NYC, your school", ...card });
  const allSchool = pool.selected.every(c => c.schools.includes(profile.school));
  const allStage = pool.selected.every(c => ["B", "C", "D"].includes(c.startup_stage));
  s.agent(`Found ${pool.selected.length} PMs who match all three filters — Series B–D, NYC, ${profile.school}. ${L.tierLine(L.draftAll(pool.selected, user).tiers)} — drafting and sending wave 1 through the TEST seed inbox (production sends ride your Gmail only after your approval).`);
  const { drafts, tiers, gatePass } = L.draftAll(pool.selected, user);
  L.sampleDrafts(s, drafts, 2, "SC-003");
  const campaign = M.createCampaign({ id: "sc003-campaign", userId: "u-alex", approved: true });
  M.enqueue(campaign, pool.selected.map((c, i) => ({ candidate: c, draft: drafts[i] })), { suppression: supp });
  const plan = M.planWave(campaign, { waveNumber: 1, seed: 11 });
  const transport = L.testTransport();
  const sentRes = await M.sendPending(campaign, { transport, suppression: supp, maxItems: plan.scheduled, nowIso: L.NOW_ISO });
  s.tool("124.sendPending (TEST transport)", { plan_days: plan.days, ...sentRes });
  s.verify("Selected all match school+stage; wave 1 in TEST inbox", { selected: pool.selected.length, all_school: allSchool, all_stage: allStage, gate_pass: gatePass, sent: sentRes.sent, inbox: transport.inbox.length });
  const ok = pool.selected.length === 100 && allSchool && allStage && gatePass === 100 && sentRes.sent === plan.scheduled;
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `100 PMs at Series B–D NYC startups from the user's school selected, drafted (gate 100/100) and wave 1 messaged via TEST seed inbox. People and startups were labeled TEST fixtures; real people at scale need the licensed vendor key.`, reason: ok ? undefined : "filter/draft/send counts off", unblock: ok ? undefined : "inspect sourced pool" });
})();
