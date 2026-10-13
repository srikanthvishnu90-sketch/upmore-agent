// SC-243 "Should I go to grad school?" — ROI framework for my field.
"use strict";
const L = require("./_w13-lib.cjs");
const { CI, H } = L;
(async () => {
  const s = H.session("SC-243", "should-i-go-to-grad-school");
  s.user("Should I go to grad school?");
  const st = L.store();
  s.tool("corpus scan for earnings/outcome data", { cirs_loaded: Object.keys(st.byId).length, earnings_dataset_in_125: false, note: "CIRs record hiring screens and processes, not graduate earnings or program outcomes. There is no ROI dataset in the rail to compute from." });
  const reply = ["Here is the ROI framework, applied honestly — including where my own data runs out.",
    "The math has four terms. Cost one: tuition and fees, from the specific program, never a national average. Cost two: foregone earnings — the salary you do not earn while enrolled, usually the bigger number. Return one: the earnings change the credential actually causes in your field, which is field-specific to an extreme — in some fields the degree is the license to practice at all, in others (much of tech) the hiring records I hold screen on shipped evidence and treat the degree as neutral. Return two: option value — the doors that only open with the credential (research roles, licensed professions, some visa and teaching paths).",
    "The decision rule: grad school wins when the credential is either a hard gate for the exact role you want, or when the specific program's own published outcomes show its graduates landing the roles you want at a level your current path cannot reach on the same timeline. It loses when it is a deferral — two years and real debt to avoid a job search that a project, an internship ladder, or an adjacent role would have settled faster.",
    "What I cannot honestly do yet: run your field's numbers, because my records hold hiring screens, not earnings outcomes. Tell me the field and the specific programs, and the first step is pulling each program's own published outcome report — that document, not rankings, is the ROI evidence."].join("\n\n");
  s.agent(reply);
  const lint = CI.lintAdvice(reply);
  s.tool("lintAdvice", lint);
  s.verify(`Framework served and lint-clean (ok=${lint.ok}), with the data gap stated in the reply itself. But the scenario's outcome is an ROI answer for the user's field, and the rail holds no earnings/outcome dataset to compute it from — the corpus scan above is the proof.`, {});
  await s.finish({ status: "LEARN", outcome: "ROI framework served honestly; a field-specific ROI verdict cannot be computed from rail state.", reason: "No graduate-earnings or program-outcome dataset exists in the 125 corpus (CIRs hold hiring screens/processes only), and the canonical ask does not name a field or program.", unblock: "User names the field + candidate programs, and an outcome data source is ingested as sourced facts (programs' own published outcome reports or a public outcomes dataset); then rerun SC-243 for a computed answer." });
})();
