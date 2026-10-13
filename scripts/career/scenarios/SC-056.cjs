"use strict";
const { H, M, NOW, USER, PROFILE, poolOverFirms } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-056", "venture-analysts-midwest-funds-coffee-chats");
  const q = M.parseTarget("Get 25 coffee chats with venture analysts at Midwest funds", PROFILE);
  const records = poolOverFirms(q.firms, 4, { per: (i) => ({ title: "Venture Analyst", seniority_band: "analyst", geography: "Midwest", office: ["Chicago", "Columbus", "Minneapolis"][i % 3], personalization_facts: [{ fact: "writes about Midwest startup ecosystems (TEST fact)", source_url: "https://example.test/v" + i, strength: "medium" }] }) });
  const pool = M.buildList(records, q, { profile: PROFILE, nowMs: NOW });
  const drafts = pool.selected.slice(0, 3).map((c) => M.draftAndGate(c, USER, {}));
  s.user("Get 25 coffee chats with venture analysts at Midwest funds");
  s.tool("124.parseTarget+buildList", { firm_set: q.firm_set, yield: pool.yield });
  s.agent(`Found ${pool.selected.length} venture analysts at Midwest funds and drafted the coffee-chat asks (3 samples gate-checked: ${drafts.map((d) => d.gate.pass).join(", ")}). Sample people: ${pool.selected.slice(0, 5).map((c) => `${c.full_name} — ${c.current_firm}`).join("; ")}.`);
  s.verify("selection read back: exactly 25, every firm in the venture_midwest set; sample drafts pass the quality gate", { selected: pool.selected.length, firms_ok: pool.selected.every((c) => q.firms.includes(c.current_firm)), sample_gates: drafts.map((d) => d.gate.pass) });
  await s.finish({ status: "COMPLETE", outcome: `25 venture analysts at Midwest funds selected and verified (new venture_midwest firm set, 10 funds); coffee-chat drafts gate-checked on samples` });
})();
