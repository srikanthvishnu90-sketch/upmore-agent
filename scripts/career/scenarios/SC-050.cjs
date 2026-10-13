"use strict";
const { H, M, NOW, PROFILE, poolOverFirms, FIRM_SETS } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-050", "tier-mix-report-hold-tier-c");
  const allFirms = [].concat(FIRM_SETS.sets.bulge_bracket.firms.filter((f) => f.status !== "historical"), FIRM_SETS.sets.elite_boutique.firms, FIRM_SETS.sets.middle_market.firms, FIRM_SETS.sets.mega_fund_pe.firms, FIRM_SETS.sets.big4.firms, FIRM_SETS.sets.mbb.firms, FIRM_SETS.sets.quant.firms, FIRM_SETS.sets.faang_plus.firms, FIRM_SETS.sets.big_law.firms).map((f) => f.name);
  const firms = [...new Set(allFirms)].slice(0, 50);
  const records = poolOverFirms(firms, 10, { per: (i) => { if (i < 142) return { personalization_facts: [{ fact: "led a campus investing panel (TEST fact)", source_url: "https://example.test/t" + i, strength: "strong" }] }; if (i < 372) return {}; return { schools: ["Ohio State University"], geography: "", office: "", relationship_to_user: "none" }; } });
  const q = M.parseTarget("Find 500 people for the campaign and show me the tier mix", PROFILE);
  const pool = M.buildList(records, Object.assign({}, q, { count: 500 }), { profile: PROFILE, nowMs: NOW });
  const mix = M.tierMix(pool.selected, PROFILE);
  s.user("Show me the tier mix for the 500 before we send anything");
  s.tool("124.tierMix over buildList selection", mix);
  s.agent(mix.text + " Tier C drafts would be generic — no sourced fact behind them. Hold Tier C back and send only A + B?", { card: { title: "Tier mix — hold Tier C?", A: mix.A, B: mix.B, C: mix.C, total: mix.total, question: "Hold Tier C back?" } });
  s.verify("tier counts computed by determineTier over the actual selected list", { A: mix.A, B: mix.B, C: mix.C, total: mix.total, selected: pool.selected.length, sum_matches: mix.A + mix.B + mix.C === pool.selected.length });
  await s.finish({ status: "COMPLETE", outcome: `Tier mix reported from determineTier over the real selection: ${mix.A} A / ${mix.B} B / ${mix.C} C of ${mix.total}, and the hold-Tier-C question was put to the user on the card before any send` });
})();
