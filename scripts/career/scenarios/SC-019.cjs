// SC-019 Find 40 product designers at consumer startups in LA
"use strict";
const L = require("./_w01-lib.cjs"); const { M, H } = L;
(async () => {
  const s = H.session("SC-019", "outreach-40-designers-consumer-la");
  const user = L.USERS.alex, profile = L.PROFILES.alex;
  s.user("Find 40 product designers at consumer startups in LA");
  const q = M.parseTarget("Find 40 product designers at consumer startups in Los Angeles", profile);
  s.tool("124.parseTargetSpec", q);
  const startups = Array.from({ length: 22 }, (_, i) => ["Sunset", "Marigold", "Pacific", "Juniper", "Cactus", "Lumen", "Marina", "Olive", "Palms", "Quince", "Rodeo"][i % 11] + [" Social", " Shopping"][Math.floor(i / 11) % 2] + " (TEST consumer startup)");
  const records = L.generate(70, startups, (i) => ({ title: i % 4 === 3 ? "Senior Product Designer" : "Product Designer", seniority_band: "analyst", geography: "Los Angeles", office: "Los Angeles", schools: [["TEST University", "UCLA", "USC", "ArtCenter (TEST)"][i % 4]], sector: "consumer", factKind: "build", built: "a consumer onboarding flow" }), 1919);
  await L.verifyPool(records, L.fixtureVerifier());
  const supp = M.createSuppressionStore();
  const pool = M.buildList(records, { count: 40, firms: [] }, { profile, suppression: supp, userId: "u-alex", nowMs: L.NOW });
  const card = M.listReviewCard(pool, q);
  s.tool("124.buildList", { yield: pool.yield }); s.card({ title: "List review — 40 product designers, consumer, LA", ...card });
  const { drafts, tiers, gatePass } = L.draftAll(pool.selected, user);
  s.tool("124.draftAndGate", { drafted: drafts.length, gate_pass: gatePass, tiers });
  L.sampleDrafts(s, drafts, 2, "SC-019");
  s.verify("40 selected, all LA consumer-startup designers", { selected: pool.selected.length, all_la: pool.selected.every(c => c.office === "Los Angeles"), all_designers: pool.selected.every(c => /Designer/.test(c.title)), gate_pass: gatePass });
  const ok = pool.selected.length === 40 && gatePass === 40;
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `40 product designers at LA consumer startups found and drafted (gate 40/40), list ready on the review card. People/startups were labeled TEST fixtures.`, reason: ok ? undefined : "counts off", unblock: ok ? undefined : "inspect pool" });
})();
