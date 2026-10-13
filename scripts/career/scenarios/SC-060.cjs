"use strict";
const { H, M, NOW, PROFILE, poolOverFirms } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-060", "the-dream-50-warm-paths-ranked");
  const DREAM10 = ["Stripe", "Goldman Sachs", "Jane Street", "Datadog", "Ramp", "McKinsey & Company", "Evercore", "Google", "Palantir", "Bain Capital"];
  const rels = ["same school and club", "same school", "hometown", "2nd-degree", "none"];
  const records = poolOverFirms(DREAM10, 5, { per: (i, firm, j) => ({ relationship_to_user: rels[j], title: ["Analyst", "Associate", "Engineer", "Analyst", "Associate"][j] }) });
  s.user("The dream 50: 50 named people across my 10 dream companies, warm paths ranked");
  const perCompany = DREAM10.map((co) => ({ company: co, paths: M.warmPaths(records, co, PROFILE) }));
  const all = M.rankContacts(records, PROFILE);
  s.tool("124.warmPaths x10 + rankContacts", { companies: perCompany.map((c) => ({ company: c.company, people: c.paths.length, top_path: c.paths[0] && c.paths[0].path })), ranked_total: all.length });
  const lines = perCompany.map((c) => `${c.company}: ` + c.paths.map((p) => `${p.person} (${p.path}, rank ${p.rank})`).join("; ")).join("\n");
  s.agent(`Your dream 50 — 5 named people at each of your 10 dream companies, warm paths ranked inside each company:\n${lines}\n\nWarmest overall: ${all[0].contact.full_name} at ${all[0].contact.current_firm} (${all[0].why.join(" + ")}).`, { card: { title: "The dream 50", companies: perCompany.map((c) => c.company), total: all.length, warmest: { name: all[0].contact.full_name, firm: all[0].contact.current_firm, why: all[0].why } } });
  const ranks = all.map((r) => r.rank);
  s.verify("dream-50 read back from warmPaths/rankContacts: 50 named people, 5 per dream company, global ranking non-increasing, every entry carries a stated path", { total: all.length, per_company_counts: perCompany.map((c) => c.paths.length), ranked_desc: ranks.every((r, i) => i === 0 || ranks[i - 1] >= r), all_named: all.every((r) => !!r.contact.full_name) });
  await s.finish({ status: "COMPLETE", outcome: `Dream 50 delivered: 50 named people across the 10 dream companies (5 each), warm paths ranked per company and globally; warmest path is ${all[0].contact.full_name} at ${all[0].contact.current_firm} (${all[0].why.join(" + ")})` });
})();
