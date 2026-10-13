// SC-247 "Compare my profile to the average Stripe hire" — table, gaps, plan.
"use strict";
const L = require("./_w13-lib.cjs");
const { CI, H } = L;
(async () => {
  const s = H.session("SC-247", "compare-me-vs-stripe");
  s.user("Compare my profile to the average Stripe hire");
  const cir = L.loadCIR("stripe");
  const cmp = CI.compareMe(cir, L.TEST_PERSONA_PROFILE);
  const plan = CI.planPath(cir, L.TEST_PERSONA_PROFILE, { now: L.NOW });
  s.tool("compareMe(stripe, TEST-PERSONA-001 profile)", cmp);
  const table = cmp.rows.map((r) => `| ${r.dimension} | ${r.user} | ${r.cohort} | ${r.status} |`).join("\n");
  const reply = ["One labeling note before the table: the Stripe record is curated-qualitative — Stripe publishes its screen, not a measured average hire — so the cohort column is the published screen and the revealed pattern from the record, not a fabricated average person. Comparing you to an invented average would be lying with extra steps.",
    "| Dimension | You (TEST persona) | Stripe cohort (from the CIR) | Status |\n|---|---|---|---|\n" + table,
    `Highest-leverage fix (${cmp.highest_leverage_fix.dimension}): ${cmp.highest_leverage_fix.fix}`,
    "THE PLAN:\n" + plan.milestones.map((m) => `- (${m.horizon}${m.by ? `, by ${m.by}` : ""}) ${m.action}`).join("\n")].join("\n\n");
  s.agent(reply);
  const lint = CI.lintAdvice(reply);
  s.tool("lintAdvice + planPath", { lintAdvice: lint, milestones: plan.milestones.length });
  const pass = lint.ok && cmp.rows.length === 6;
  s.verify(`Gap table is the real compareMe output over TEST-PERSONA-001 against the shipped Stripe CIR (6 rows recorded verbatim above); plan is the real planPath output; the curated-qualitative coverage limit is labeled in the reply itself; lintAdvice ok=${lint.ok}.`, { rows: cmp.rows.length });
  await s.finish(pass ? { status: "COMPLETE", outcome: "Compare-me table vs Stripe served with gaps, highest-leverage fix, and a dated plan — cohort honestly labeled as the published screen, not an invented average." } : { status: "LEARN", outcome: "SC-247 gates did not all pass.", reason: `lint=${lint.ok} rows=${cmp.rows.length}`, unblock: "Fix the failing gate and rerun." });
})();
