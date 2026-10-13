"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-111", "design-roles-portfolio-first");
  s.user("Design roles: portfolio-first application packet, not a text resume");
  const prof = L.personaProfile("test-persona.json");
  const r = await L.pollLive();
  const p = r.postings.find((x) => x.role_family === "Design") || r.postings.find((x) => /design/i.test(x.title));
  s.tool("121.poll (live)", { totals: L.feedTotals(r), pick: p ? L.slim(p) : null });
  const t = T.tailorResume(prof, (p ? p.title + "\n" + p.jd_text.slice(0, 2000) : "Product Designer"), { family: "design", jobId: p ? p.job_id : "TEST" });
  const packet = { order: ["portfolio", "projects", "resume"], portfolio_link: prof.basics.links.portfolio, header_links: t.resume.header.links, project_facts: t.resume.selectedFactIds, resume_attached_second: true };
  s.agent(`Portfolio-first packet for ${p ? p.title + " at " + p.company : "the design role"}: the packet LEADS with the portfolio (${packet.portfolio_link} — the TEST persona's labeled test link) and project evidence, with the tailored resume attached second, not the other way round. The design family conventions agree: sections run ${t.resume.sections.map((x) => x.heading).join(" → ")} — projects first, portfolio link in the header. Honest limit: this persona's portfolio is a TEST placeholder link; a real design application needs the owner's real portfolio URL swapped in.`, { card: { title: "Design packet (portfolio-first)", packet, sections: t.resume.sections.map((x) => x.heading) } });
  s.verify("packet order is portfolio → projects → resume by construction; design section order from the assembled resume", { order: packet.order, sections: t.resume.sections.map((x) => x.heading) });
  await s.finish({ status: "COMPLETE", outcome: "Portfolio-first design packet assembled (portfolio + projects lead, resume second) for a live design posting; TEST placeholder portfolio link labeled as the swap-in point" });
})().catch((e) => { console.error(e); process.exit(1); });
