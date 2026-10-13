"use strict"; const { H, P, persona, cirForPrep } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-198", "day-of-checklist-canonical");
  await s.user("Day-of checklist for my Goldman superday: logistics, links, tech check, materials");
  const c = P.dayOfChecklist({ company: "Goldman Sachs", cir: cirForPrep("goldman-sachs-ibd"), when: "Friday 09:00 CT (TEST)", link: "https://example.test/goldman-superday (TEST link)", location: "Video call (TEST)", materials: ["Resume, one page (TEST copy)", "Two primary STAR stories, one line each: Example Capital model (F-006) + Investing Club pitch competition (F-005)", "Questions-to-ask list from SC-195 prep", "Pen + paper for interviewer names"] });
  await s.tool("127-career-prep.dayOfChecklist(Goldman, TEST logistics)", c);
  await s.agent(`Day-of checklist for Friday 09:00 CT (TEST) — Goldman superday (final stage on the CIR record):\n\nLOGISTICS:\n${c.groups.logistics.map((x)=>`- ${x}`).join("\n")}\n\nLINKS:\n${c.groups.links.map((x)=>`- ${x}`).join("\n")}\n\nTECH CHECK:\n${c.groups.tech_check.map((x)=>`- ${x}`).join("\n")}\n\nMATERIALS:\n${c.groups.materials.map((x)=>`- ${x}`).join("\n")}\n\nMissing inputs: ${c.missing.length ? c.missing.join(", ") : "none — when, link and materials were all supplied (TEST-labeled)"}.`);
  s.verify("checklist state", { missing: c.missing, groups: Object.keys(c.groups), logistics: c.groups.logistics.length, tech: c.groups.tech_check.length, materials: c.groups.materials.length });
  await s.finish({ status: "COMPLETE", outcome: "Day-of superday checklist delivered across logistics, links, tech check and materials, grounded in the supplied TEST logistics/link and Goldman's CIR final stage; no inputs missing or invented." });
})();
