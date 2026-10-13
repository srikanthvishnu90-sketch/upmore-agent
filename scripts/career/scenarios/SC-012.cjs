// SC-012 Find 150 analysts at elite boutiques (Evercore, Lazard, Centerview) in Chicago
"use strict";
const L = require("./_w01-lib.cjs"); const { M, H } = L;
(async () => {
  const s = H.session("SC-012", "outreach-150-elite-boutique-chicago");
  const user = L.USERS.alex, profile = L.PROFILES.alex;
  s.user("Find 150 analysts at elite boutiques (Evercore, Lazard, Centerview) in Chicago");
  const q = M.parseTarget("Find 150 analysts at elite boutique banks in Chicago", profile);
  s.tool("124.parseTargetSpec", q);
  s.agent(`Straight math first: the three firms you named cap at 15 each per 30 days = 45 this window. The full elite-boutique set in the real firm file has 10 firms — at Chicago offices that reaches exactly 150 this window. Building it set-wide; the three you named are all in.`);
  s.user("Yes — the full elite boutique set, Chicago");
  const firms = L.FIRM_SETS.sets.elite_boutique.firms.filter(f => f.status !== "historical").map(f => f.name);
  const records = L.generate(190, firms, (i) => ({ title: "Analyst", seniority_band: "analyst", geography: "Chicago", office: "Chicago", schools: [["TEST University", "University of Chicago", "Northwestern University", "University of Illinois"][i % 4]], factKind: i % 3 === 0 ? "deal" : "path", deal: "a middle-market sell-side" }), 1212);
  await L.verifyPool(records, L.fixtureVerifier());
  const supp = M.createSuppressionStore();
  const pool = M.buildList(records, Object.assign({}, q, { firms }), { profile, suppression: supp, userId: "u-alex", nowMs: L.NOW });
  const card = M.listReviewCard(pool, q);
  s.tool("124.buildList", { yield: pool.yield }); s.card({ title: "List review — 150 elite-boutique analysts, Chicago", ...card });
  const { drafts, tiers, gatePass } = L.draftAll(pool.selected, user);
  s.tool("124.draftAndGate", { drafted: drafts.length, gate_pass: gatePass, tiers });
  L.sampleDrafts(s, drafts, 2, "SC-012");
  const named = ["Evercore", "Lazard", "Centerview Partners"].map(n => card.breakdown.by_firm[n] || 0);
  s.verify("150 selected, all Chicago, named firms present at cap", { selected: pool.selected.length, all_chicago: pool.selected.every(c => c.office === "Chicago"), named_firm_counts: named, gate_pass: gatePass });
  const ok = pool.selected.length === 150 && gatePass === 150 && named.every(n => n === 15);
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `150 elite-boutique analysts in Chicago selected across the real 10-firm elite-boutique set (Evercore, Lazard, Centerview each at the 15 cap) with 150 gated drafts. People were labeled TEST fixtures; real names need the licensed vendor key.`, reason: ok ? undefined : "counts off", unblock: ok ? undefined : "inspect pool" });
})();
