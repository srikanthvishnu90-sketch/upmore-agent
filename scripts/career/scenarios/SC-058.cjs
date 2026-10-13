"use strict";
const { H, M, NOW, USER, PROFILE, poolOverFirms } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-058", "real-estate-pe-associates-ny-deal-specific");
  const q = M.parseTarget("Email 60 real-estate PE associates in NY with deal-specific personalization", PROFILE);
  const records = poolOverFirms(q.firms, 7, { per: (i, firm) => ({ title: "Associate", seniority_band: "associate", geography: "NY", office: "New York", personalization_facts: [{ fact: `worked on the ${firm} industrial logistics acquisition (TEST deal fact)`, source_url: "https://example.test/deal" + i, strength: "strong", kind: "deal", topic: "that acquisition" }] }) });
  const pool = M.buildList(records, q, { profile: PROFILE, nowMs: NOW });
  const samples = pool.selected.slice(0, 3).map((c) => M.draftAndGate(c, USER, {}));
  s.user("Email 60 real-estate PE associates in NY with deal-specific personalization");
  s.tool("124.parseTarget+buildList+draftAndGate samples", { firm_set: q.firm_set, deal_specific: q.background_filters.deal_specific, yield: pool.yield, sample_tiers: samples.map((d) => d.draft.tier), sample_gates: samples.map((d) => d.gate.pass) });
  s.agent(`List built: ${pool.selected.length} real-estate PE associates in NY, every one carrying a sourced deal fact, so the drafts are deal-specific (Tier ${samples.map((d) => d.draft.tier).join("/")}). Sample draft:\n\n${samples[0].draft.body}\n\nDrafts are ready — nothing sends until you approve the plan.`);
  s.verify("selection read back: exactly 60, all NY, all real_estate_pe firms, all with a sourced deal fact; sample drafts Tier A and gate-clean, bodies cite the deal fact", { selected: pool.selected.length, firms_ok: pool.selected.every((c) => q.firms.includes(c.current_firm)), deal_facts_ok: pool.selected.every((c) => (c.personalization_facts || []).some((f) => f.kind === "deal" && !!f.source_url)), sample_body_cites_deal: samples[0].draft.body.includes("industrial logistics acquisition") });
  await s.finish({ status: "COMPLETE", outcome: `60 NY real-estate PE associates selected with sourced deal-specific personalization (new real_estate_pe firm set); sample drafts Tier A, gate-clean, citing the deal fact` });
})();
