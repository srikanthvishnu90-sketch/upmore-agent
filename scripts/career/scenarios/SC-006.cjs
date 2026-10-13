// SC-006 Reach out to everyone I know at Palantir, then second-degree people
"use strict";
const L = require("./_w01-lib.cjs"); const { M, H } = L;
(async () => {
  const s = H.session("SC-006", "outreach-palantir-first-and-second-degree");
  const user = L.USERS.alex, profile = L.PROFILES.alex;
  s.user("Reach out to everyone I know at Palantir, then second-degree people");
  s.agent(`Two waves, in order: first everyone in your own LinkedIn export who is at Palantir (your data, uploaded by you — I never scrape LinkedIn), then second-degree people (friends of those connections) once wave 1 is out.`);
  // TEST fixture: the user's own LinkedIn-export-shaped rows.
  const exportRows = [];
  for (let i = 0; i < 14; i++) exportRows.push(L.person({ current_firm: "Palantir", title: i % 3 === 0 ? "Forward Deployed Engineer" : "Software Engineer", seniority_band: "analyst", geography: ["New York", "Denver", "Washington DC"][i % 3], office: ["New York", "Denver", "Washington DC"][i % 3], schools: [i % 4 === 0 ? "TEST University" : "State University (TEST)"], relationship_to_user: "1st-degree connection (LinkedIn export)", factKind: "build", built: "a data pipeline for a government client", source_list: ["linkedin-export-fixture"] }));
  for (let i = 0; i < 9; i++) exportRows.push(L.person({ current_firm: ["Stripe", "Google", "Datadog"][i % 3], title: "Software Engineer", geography: "New York", relationship_to_user: "1st-degree connection (LinkedIn export)", source_list: ["linkedin-export-fixture"] }));
  const secondDegree = [];
  for (let i = 0; i < 11; i++) secondDegree.push(L.person({ current_firm: "Palantir", title: "Software Engineer", seniority_band: "analyst", geography: "New York", schools: ["TEST University"], relationship_to_user: "2nd-degree via " + exportRows[i % exportRows.length].full_name, factKind: "school", source_list: ["linkedin-export-fixture", "second-degree-fixture"] }));
  s.tool("user-owned LinkedIn export (TEST fixture) parsed", { export_rows: exportRows.length, palantir_first_degree: exportRows.filter(c => c.current_firm === "Palantir").length, second_degree_at_palantir: secondDegree.length });
  const warm = M.warmPaths(exportRows, "Palantir", profile);
  s.tool("124.warmPaths", warm);
  await L.verifyPool([...exportRows, ...secondDegree], L.fixtureVerifier());
  const supp = M.createSuppressionStore();
  const q1 = { count: 14, firms: ["Palantir"], role_family: "software_engineering" };
  const pool1 = M.buildList(exportRows.filter(c => c.current_firm === "Palantir"), q1, { profile, suppression: supp, userId: "u-alex", nowMs: L.NOW, includeOwnEmployer: true });
  // Palantir per-firm cap 15: all 14 fit this window for wave 1 (first degree). Second degree goes in a later window as its own wave.
  const d1 = L.draftAll(pool1.selected, user);
  s.tool("124.buildList+draft wave1 (first degree)", { selected: pool1.selected.length, gate_pass: d1.gatePass, tiers: d1.tiers });
  L.sampleDrafts(s, d1.drafts, 1, "SC-006 wave 1 (1st degree)");
  const campaign = M.createCampaign({ id: "sc006-campaign", userId: "u-alex", approved: true });
  M.enqueue(campaign, pool1.selected.map((c, i) => ({ candidate: c, draft: d1.drafts[i] })), { suppression: supp });
  const transport = L.testTransport();
  const plan1 = M.planWave(campaign, { waveNumber: 1, seed: 6 });
  const sent1 = await M.sendPending(campaign, { transport, suppression: supp, maxItems: plan1.scheduled, nowIso: L.NOW_ISO });
  s.tool("124.sendPending wave1 (TEST transport)", sent1);
  s.agent(`Wave 1 (everyone you know at Palantir) is out: ${sent1.sent} sent. Now the second-degree wave — each draft names the mutual connection only where the export actually shows one (no invented intros).`);
  const d2 = L.draftAll(secondDegree, user);
  s.tool("124.draft wave2 (second degree)", { drafted: d2.drafts.length, gate_pass: d2.gatePass, tiers: d2.tiers });
  L.sampleDrafts(s, d2.drafts, 1, "SC-006 wave 2 (2nd degree)");
  // Second degree exceeds the Palantir per-firm 30-day window together with wave 1 (14+11 > 15): enqueue shows the cap doing its job.
  const enq2 = M.enqueue(campaign, secondDegree.map((c, i) => ({ candidate: c, draft: d2.drafts[i] })), { suppression: supp });
  const queued2 = enq2.filter(e => e.status === "queued").length, capped2 = enq2.filter(e => e.reason === "per_firm_cap_15_per_30d").length;
  s.tool("124.enqueue wave2 (per-firm cap check)", { queued: queued2, rejected_per_firm_cap: capped2 });
  const plan2 = M.planWave(campaign, { waveNumber: 2, seed: 8 });
  const sent2 = await M.sendPending(campaign, { transport, suppression: supp, maxItems: plan2.scheduled, nowIso: L.NOW_ISO });
  s.tool("124.sendPending wave2 (TEST transport)", sent2);
  s.agent(`Second-degree: ${queued2} fit under the Palantir per-firm cap alongside wave 1 and were sent; ${capped2} are held for the next 30-day window — the cap is a decided rule, not a suggestion. Order held: first-degree fully before second-degree.`);
  s.verify("Order + cap from campaign state", { wave1_sent: sent1.sent, wave2_sent: sent2.sent, held_for_next_window: capped2, inbox: transport.inbox.length, per_firm_window: campaign.firmWindow.filter(f => f.firm === "palantir").length });
  const ok = sent1.sent === 14 && queued2 === 1 && capped2 === 10 && transport.inbox.length === 15;
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `Palantir outreach ran in the asked order: all 14 first-degree (user's own export fixture) sent first, then second-degree — 1 more fit the per-firm 30-day cap, 10 held for the next window, all proven from campaign state. People were labeled TEST fixtures from a fixture LinkedIn export.`, reason: ok ? undefined : "order/cap counts off", unblock: ok ? undefined : "inspect enqueue results" });
})();
