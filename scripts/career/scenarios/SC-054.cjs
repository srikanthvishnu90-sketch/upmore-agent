"use strict";
const { H, M, NOW, PROFILE, poolOverFirms } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-054", "civil-engineers-infrastructure-midwest");
  const q = M.parseTarget("Find 70 civil engineers at infrastructure firms in the Midwest", PROFILE);
  const offices = ["Chicago", "Kansas City", "Minneapolis", "St. Louis"];
  const records = poolOverFirms(q.firms, 8, { per: (i) => ({ title: "Civil Engineer", geography: "Midwest", office: offices[i % 4] }) });
  const pool = M.buildList(records, q, { profile: PROFILE, nowMs: NOW });
  s.user("Find 70 civil engineers at infrastructure firms in the Midwest");
  s.tool("124.parseTarget+buildList", { firm_set: q.firm_set, geography: q.geography, role_family: q.role_family, yield: pool.yield });
  s.agent(`Found ${pool.selected.length} civil engineers at infrastructure firms across the Midwest. Sample: ${pool.selected.slice(0, 5).map((c) => `${c.full_name} — ${c.current_firm}, ${c.office}`).join("; ")}.`);
  s.verify("selection read back: exactly 70, every firm in the infrastructure_eng set, every person Midwest", { selected: pool.selected.length, firms_ok: pool.selected.every((c) => q.firms.includes(c.current_firm)), midwest_ok: pool.selected.every((c) => c.geography === "Midwest") });
  await s.finish({ status: "COMPLETE", outcome: `70 civil engineers at Midwest infrastructure firms selected and verified (new infrastructure_eng firm set, 10 firms)` });
})();
