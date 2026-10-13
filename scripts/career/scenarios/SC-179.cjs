"use strict"; const { H, P, cirById } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-179", "salary-talk-prep-sourced");
  await s.user("they'll ask my expectations in the screen — it's the Duolingo Thrive screen. What do I say?");
  const sp = P.salaryPrep({ cir: cirById("duolingo") });
  await s.tool("127-career-prep.salaryPrep (NEGO-002 seam)", sp);
  await s.agent(`Only sourced numbers — every figure below is copied from Duolingo's CIR comp notes with its source label, nothing estimated:\n\n${sp.ranges.map((r) => `• ${r.text} [label: ${r.label}; source type: ${r.source_type}]`).join("\n")}\n\nScript for the screen:\n${sp.script}\n\nIf they push for a number first, anchor on the published intern band above and keep it about the band, not a personal price. Note for contrast: for Bain, the CIR explicitly records NO published figure — there I'd have told you we have no sourced number at all rather than invent one.`);
  s.verify("salary prep state", { status: sp.status, ranges: sp.ranges.map((r) => ({ label: r.label, source_type: r.source_type })) });
  await s.finish({ status: "COMPLETE", outcome: "Salary-talk prep delivered with the range copied from the Duolingo CIR comp notes, labeled by source type, plus a deflection/anchoring script; the no-figure case (Bain CIR) is handled by explicit non-invention.", reason: null, unblock: null });
})();
