// SC-005 Email every founder in the latest YC batch who is hiring a first SWE
"use strict";
const L = require("./_w01-lib.cjs"); const { M, H } = L;
(async () => {
  const s = H.session("SC-005", "outreach-yc-founders-hiring-first-swe");
  const user = Object.assign({}, L.USERS.alex, { experience: "building DeployBoard, a Go deployment helper used by 12 student teams, and a reporting dashboard used by 200 users" });
  const profile = L.PROFILES.alex;
  s.user("Email every founder in the latest YC batch who is hiring a first SWE");
  const q = M.parseTarget("Email every founder in the latest YC batch who is hiring a first SWE", profile);
  s.tool("124.parseTargetSpec", q);
  const startups = Array.from({ length: 48 }, (_, i) => ["Loopwire", "Castline", "Fernhill", "Metricly", "Osmo", "Parable", "Quill", "Ridge", "Sonder", "Tally", "Umbra", "Vantage"][i % 12] + [" AI", " Health", " Fintech", " DevTools"][Math.floor(i / 12) % 4] + " (TEST startup)");
  const records = L.generate(48, startups, (i) => ({
    title: "Founder", seniority_band: "founder", geography: "San Francisco", office: "San Francisco",
    schools: [["Stanford University", "MIT", "TEST University", "UC Berkeley"][i % 4]],
    batch: "YC latest batch (TEST fixture batch)", hiring_first_swe: i % 5 !== 4, factKind: "build", built: "the first version of their product solo",
  }), 5005);
  await L.verifyPool(records, L.fixtureVerifier());
  const sourced = records.filter(c => c.hiring_first_swe === true);
  s.tool("sourcing filter (latest YC batch fixture + hiring_first_swe, public YC directory seam)", { batch_records: records.length, hiring_first_swe: sourced.length, not_hiring: records.length - sourced.length });
  const supp = M.createSuppressionStore();
  const pool = M.buildList(sourced, Object.assign({}, q, { count: sourced.length, firms: [] }), { profile, suppression: supp, userId: "u-alex", nowMs: L.NOW });
  s.tool("124.buildList", { yield: pool.yield, exclusions: pool.exclusions });
  s.agent(`The latest-batch fixture set has ${records.length} founders; ${sourced.length} are hiring a first SWE. Every draft leads with a specific thing you built (DeployBoard — from your real profile facts), not a generic "I'm passionate about startups" line. ${pool.selected.length} are sendable now.`);
  const { drafts, tiers, gatePass } = L.draftAll(pool.selected, user);
  s.tool("124.draftAndGate", { drafted: drafts.length, gate_pass: gatePass, tiers });
  L.sampleDrafts(s, drafts, 2, "SC-005");
  s.user("Approved — email them");
  const campaign = M.createCampaign({ id: "sc005-campaign", userId: "u-alex", approved: true });
  M.enqueue(campaign, pool.selected.map((c, i) => ({ candidate: c, draft: drafts[i] })), { suppression: supp });
  const plan = M.planWave(campaign, { waveNumber: 1, seed: 5 });
  const transport = L.testTransport();
  const sentRes = await M.sendPending(campaign, { transport, suppression: supp, maxItems: plan.scheduled, nowIso: L.NOW_ISO });
  s.tool("124.sendPending (TEST transport)", { days: plan.days, daily_caps: plan.daily_caps, ...sentRes });
  s.verify("Every hiring-first-SWE founder in the fixture batch was drafted + wave-1 sent", { hiring: sourced.length, selected: pool.selected.length, gate_pass: gatePass, sent_wave1: sentRes.sent, inbox: transport.inbox.length, leads_with_build: drafts.every(d => /DeployBoard|dashboard/.test(d.body)) });
  const ok = pool.selected.length === sourced.length && gatePass === drafts.length && sentRes.sent === plan.scheduled && drafts.every(d => /DeployBoard|dashboard/.test(d.body));
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `All ${sourced.length} founders in the fixture batch who are hiring a first SWE were drafted (each leading with the user's real built thing) and wave 1 sent via TEST seed inbox. Founders/batch were labeled TEST fixtures; the real YC directory pull is the remaining real-world input.`, reason: ok ? undefined : "counts off", unblock: ok ? undefined : "inspect pool" });
})();
