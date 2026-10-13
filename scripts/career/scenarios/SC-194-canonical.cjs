"use strict"; const { H, P, persona, cirForPrep } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-194", "salary-deflection-canonical");
  await s.user("Deflection scripts for salary talk inside interviews — don't anchor me early");
  const r = P.salaryDeflectionScripts({ cir: cirForPrep("goldman-sachs-ibd") });
  await s.tool("127-career-prep.salaryDeflectionScripts(Goldman CIR)", r);
  await s.agent(`Deflection scripts for salary talk — the rule first: ${r.anchor_rule}\n\n${r.scripts.map((x)=>`When ${x.when}: "${x.text}"`).join("\n\n")}\n\nHonesty note on numbers: Goldman's CIR records NO firm-published pay figure (${r.note}), so none of these scripts cites one and I won't invent a band for you to quote. If an interviewer shares their band, use script 3 and let them anchor.`);
  s.verify("scripts carry no invented figure", { scripts: r.scripts.length, ranges: r.ranges.length, any_dollar_in_scripts: r.scripts.some((x)=>/\$\s?\d/.test(x.text)) });
  await s.finish({ status: "COMPLETE", outcome: "Three salary-deflection scripts delivered (early screen / pressed / band shared) under a do-not-anchor rule; Goldman CIR has no sourced figure, so no number was cited or invented." });
})();
