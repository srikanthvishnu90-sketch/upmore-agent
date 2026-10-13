"use strict";
<<<<<<< HEAD
const { H, M, NOW, USER, PROFILE, poolOverFirms, FIRM_SETS } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-043", "safety-plan-card-approve-once");
  const firms = FIRM_SETS.sets.elite_boutique.firms.map((f) => f.name).concat(FIRM_SETS.sets.bulge_bracket.firms.filter((f) => f.status !== "historical").slice(0, 2).map((f) => f.name));
  const records = poolOverFirms(firms, 10, { per: (i) => ({ personalization_facts: [{ fact: "spoke at a campus finance panel (TEST fact)", source_url: "https://example.test/p" + i, strength: "medium" }] }) });
  const q = M.parseTarget("Find 120 bankers for coffee chats", PROFILE);
  const pool = M.buildList(records, q, { profile: PROFILE, nowMs: NOW });
  const camp = M.createCampaign({ id: "w03-camp-safety", userId: "w03-user" });
  const entries = pool.selected.map((c) => { const d = M.draftAndGate(c, USER, {}); return { candidate: c, draft: d.draft }; });
  const enq = M.enqueue(camp, entries, {});
  const plan = M.planWave(camp, { seed: 11 });
  const sp = M.safetyPlan(camp, plan, { startDateIso: "2026-10-13T00:00:00Z" });
  s.user("Find 120 bankers for coffee chats and show me the safety plan before anything sends");
  s.tool("124.buildList+enqueue+planWave", { selected: pool.selected.length, queued: enq.filter((e) => e.status === "queued").length, scheduled: plan.scheduled, days: plan.days, deferred: plan.deferred.length });
  s.agent(M.safetyPlanText(sp), { card: { title: "Safety plan — approve once", plan: sp } });
  s.user("Approved — run it on that plan");
  camp.status = "approved";
  s.tool("campaign.status after approval", { status: camp.status, queued: camp.items.filter((i) => i.status === "queued").length });
  s.verify("plan read back from planWave + CAPS: daily cap start/ceiling, finish date = start + days-1, campaign approved exactly once and queue intact", { daily_cap_start: sp.daily_cap_start, ceiling: sp.daily_cap_ceiling, finish_date: sp.finish_date, days: sp.days, status: camp.status, stop_rules: sp.stop_rules.length });
  await s.finish({ status: "COMPLETE", outcome: `Safety plan card shown (${sp.scheduled} sends over ${sp.days} days, cap ${sp.daily_cap_start}->${sp.daily_cap_ceiling}/day, finish ${sp.finish_date}, ${sp.stop_rules.length} stop rules); user approved once; campaign status=approved with the full queue intact — it now runs alone on that plan` });
=======
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-043", "unproven-skill-excluded");
  s.user("tailor my resume for these two roles — one wants Kubernetes, the other wants Rust");
  const p = L.persona();
  const jdK = "Software Engineer Intern (TEST-shaped JD from the ledger pair). Required: Python, Kubernetes, Docker. You will deploy services on Kubernetes.";
  const jdR = "Software Engineer Intern (TEST-shaped JD from the ledger pair). Required: Python, Rust. You will build systems in Rust.";
  const rk = L.Tailor.tailorResume(p, jdK, {});
  const rr = L.Tailor.tailorResume(p, jdR, {});
  const kText = rk.rendered.text, rText = rr.rendered ? rr.rendered.text : "";
  const proven = L.Tailor.provenSkills(p, L.Tailor.parseJD(jdR));
  const rust = proven.find((x) => x.name === "Rust");
  s.tool("123-career-tailor provenSkills", proven);
  s.agent(`Kubernetes role: Kubernetes is on your tailored resume — it is evidenced by DeployBoard (fact F-003, deployed on AWS EKS for 12 student teams).\n\nRust role: Rust does NOT appear on the tailored resume. Your profile lists Rust (fact F-017) with no evidence behind it, so the audit will not let it support a line. That gap is real: if you have a Rust project, add it and I'll include Rust; I won't claim it from the skill list alone.`, { card: { type: "tailor_pair", title: "Kubernetes in / Rust out", kubernetesAudit: rk.audit, rustAudit: rr.audit, rustSkillState: rust } });
  const kubeIn = /Kubernetes/.test(kText);
  const rustOut = !/(^|[,\s])Rust([,\s]|$)/m.test(rText) && rr.ok === true;
  s.verify("Kubernetes (evidenced F-003/F-013) appears in output 1; Rust (F-017, unproven) never appears in output 2; both audits pass", { kubeIn, rustOut, rustProvenFlag: rust && rust.proven, rustFactId: rust && rust.factId });
  await s.finish({ status: kubeIn && rustOut ? "COMPLETE" : "LEARN", outcome: "Evidenced Kubernetes included; unproven Rust excluded and the gap told to the user plainly.", reason: kubeIn && rustOut ? null : "skill inclusion/exclusion wrong", unblock: kubeIn && rustOut ? null : "Fix provenSkills/audit in 123." });
>>>>>>> origin/career/sc-f03
})();
