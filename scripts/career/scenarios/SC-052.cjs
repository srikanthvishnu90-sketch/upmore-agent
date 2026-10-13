"use strict";
const { H, M, NOW, PROFILE, poolOverFirms } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-052", "med-school-residents-alumni-pre-med");
  const q = M.parseTarget("Find 50 med-school residents and alumni for pre-med advising chats", PROFILE);
  const records = poolOverFirms(q.firms, 6, { per: (i) => ({ title: "Resident Physician", seniority_band: "resident", schools: [i % 2 ? "University of Michigan" : "Wayne State University"] }) });
  const pool = M.buildList(records, q, { profile: PROFILE, nowMs: NOW });
  s.user("Find 50 med-school residents and alumni for pre-med advising chats");
  s.tool("124.parseTarget+buildList", { firm_set: q.firm_set, yield: pool.yield });
  const alumni = pool.selected.filter((c) => (c.schools || []).includes("University of Michigan")).length;
  s.agent(`Found ${pool.selected.length} residents at academic medical centers (${alumni} of them Michigan alumni) for pre-med advising chats. Sample: ${pool.selected.slice(0, 5).map((c) => `${c.full_name} — ${c.current_firm}`).join("; ")}.`);
  s.verify("selection read back: exactly 50, every employer in the academic_medical set", { selected: pool.selected.length, centers_ok: pool.selected.every((c) => q.firms.includes(c.current_firm)), alumni });
  await s.finish({ status: "COMPLETE", outcome: `50 med-school residents/alumni at academic medical centers selected and verified (new academic_medical firm set, 10 centers; ${alumni} share the user's school)` });
})();
