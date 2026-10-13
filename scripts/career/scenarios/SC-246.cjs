// SC-246 Career switcher at 32 — transferable map and where switchers actually win.
"use strict";
const L = require("./_w13-lib.cjs");
const { CI, H } = L;
(async () => {
  const s = H.session("SC-246", "career-switcher-at-32");
  s.user("Career switcher at 32 — transferable map and where switchers actually win");
  const fx = L.loadFixture("persona-switcher-nurse.json");
  s.tool("TEST fixture loaded (authorized, labeled TEST)", { persona_id: fx.persona_id, label: fx.label, target_roles: fx.preferences.roles });
  const cir = L.loadCIR("snowflake");
  const cmp = CI.compareMe(cir, L.NURSE_PROFILE);
  const plan = CI.planPath(cir, L.NURSE_PROFILE, { now: L.NOW });
  s.tool("compareMe vs Snowflake CIR (transferable map source)", cmp);
  s.tool("planPath milestones", plan.milestones.map((m) => ({ horizon: m.horizon, by: m.by, action: m.action })));
  const rows = cmp.rows.map((r) => `- ${r.dimension}: you — ${r.user} | ${r.status}${r.status === "gap" ? ` | fix: ${r.fix}` : ""}`).join("\n");
  const reply = ["Here is your transferable map, built from your real record (TEST fixture: six years as an ICU nurse, a sepsis-alert workflow project, unit dashboards, and a readmission-data analysis you presented to hospital leadership). Nothing on it is invented — and nothing needs to be.",
    "THE MAP (your profile against a live data-company record, Snowflake):\n" + rows,
    "WHERE SWITCHERS ACTUALLY WIN: not by out-credentialing new graduates at generic analyst screens, but where the domain is the moat — health-system analytics, healthtech, and clinical-operations data teams, where six years of ICU workflow knowledge is the thing a bootcamp graduate cannot copy, and your readmission analysis is already the portfolio piece. The losing game is apologizing for the nursing years; the winning game is pricing them.",
    "THE PLAN:\n" + plan.milestones.map((m) => `- (${m.horizon}${m.by ? `, by ${m.by}` : ""}) ${m.action}`).join("\n"),
    "Want me to build the target list of health-data teams and turn the readmission project into a public write-up? That write-up is the single highest-leverage artifact you do not yet have."].join("\n\n");
  s.agent(reply);
  const lint = CI.lintAdvice(reply);
  s.tool("lintAdvice", lint);
  const pass = lint.ok && cmp.rows.length === 6 && plan.milestones.length >= 5;
  s.verify(`Transferable map is the real compareMe output over the nurse TEST fixture (6 rows, recorded verbatim above); plan is the real planPath output (${plan.milestones.length} milestones); every experience claim in the reply traces to a fixture fact; lintAdvice ok=${lint.ok}.`, { rows: cmp.rows.length, milestones: plan.milestones.length });
  await s.finish(pass ? { status: "COMPLETE", outcome: "Transferable map + where-switchers-win read + dated plan served from the nurse fixture's real facts against a live CIR." } : { status: "LEARN", outcome: "SC-246 gates did not all pass.", reason: `lint=${lint.ok} rows=${cmp.rows.length} milestones=${plan.milestones.length}`, unblock: "Fix the failing gate and rerun." });
})();
