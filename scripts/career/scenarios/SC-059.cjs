"use strict";
const { H, M, NOW, PROFILE, poolOverFirms, FIRM_SETS } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-059", "teachers-turned-product-people");
  const q = M.parseTarget("Find 100 teachers-turned-product people for a career switcher", PROFILE);
  const firms = FIRM_SETS.sets.faang_plus.firms.map((f) => f.name);
  const records = poolOverFirms(firms, 12, { per: (i) => ({ title: "Product Manager", prior_career: "teaching", personalization_facts: [{ fact: "taught high-school math for 4 years before moving into product (TEST fact)", source_url: "https://example.test/sw" + i, strength: "medium" }] }) });
  const pool = M.buildList(records, q, { profile: PROFILE, nowMs: NOW });
  s.user("Find 100 teachers-turned-product people for a career switcher");
  s.tool("124.parseTarget+buildList", { prior_career_filter: q.background_filters.prior_career, role_family: q.role_family, yield: pool.yield });
  s.agent(`Found ${pool.selected.length} teachers-turned-product people — the exact switch you're making, already done. Sample: ${pool.selected.slice(0, 5).map((c) => `${c.full_name} — ${c.title}, ${c.current_firm}`).join("; ")}.`);
  s.verify("selection read back: exactly 100, every person carries prior_career=teaching and a product title", { selected: pool.selected.length, trait_ok: pool.selected.every((c) => c.prior_career === "teaching"), product_ok: pool.selected.every((c) => /product/i.test(c.title)) });
  await s.finish({ status: "COMPLETE", outcome: `100 teachers-turned-product people selected and verified from buildList state (parser now captures the prior-career switcher filter)` });
})();
