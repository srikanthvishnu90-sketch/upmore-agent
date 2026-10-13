"use strict";
<<<<<<< HEAD
const { H, M, NOW, USER, PROFILE, poolOverFirms } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-053", "marketing-associates-cpg-chicago");
  const q = M.parseTarget("Email 85 marketing associates at CPG companies in Chicago", PROFILE);
  const records = poolOverFirms(q.firms, 10, { per: (i) => ({ title: "Marketing Associate", seniority_band: "associate", geography: "Chicago", office: "Chicago", personalization_facts: [{ fact: "works on a consumer brand team (TEST fact)", source_url: "https://example.test/c" + i, strength: "medium" }] }) });
  const pool = M.buildList(records, q, { profile: PROFILE, nowMs: NOW });
  const camp = M.createCampaign({ id: "w03-camp-cpg", userId: "w03-user" });
  const entries = pool.selected.map((c) => { const d = M.draftAndGate(c, USER, {}); return { candidate: c, draft: d.draft }; });
  const enq = M.enqueue(camp, entries, {});
  s.user("Email 85 marketing associates at CPG companies in Chicago");
  s.tool("124.parseTarget+buildList+enqueue(draft campaign)", { firm_set: q.firm_set, yield: pool.yield, queued: enq.filter((e) => e.status === "queued").length, campaign_status: camp.status });
  s.agent(`List built and drafted: ${pool.selected.length} marketing associates at CPG companies in Chicago, ${enq.filter((e) => e.status === "queued").length} drafts queued. Nothing has sent — the campaign is still a draft until you approve the safety plan. Sample: ${pool.selected.slice(0, 4).map((c) => `${c.full_name} — ${c.current_firm}`).join("; ")}.`);
  s.verify("selection read back: exactly 85, all Chicago, all CPG firms; campaign still draft (zero sends)", { selected: pool.selected.length, chicago_ok: pool.selected.every((c) => c.geography === "Chicago"), firms_ok: pool.selected.every((c) => q.firms.includes(c.current_firm)), campaign_status: camp.status, sent: camp.wave.sent });
  await s.finish({ status: "COMPLETE", outcome: `85 CPG marketing associates in Chicago selected, drafted and queued in a DRAFT campaign (new cpg firm set) — zero sent, approval still owed before any send` });
=======
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-053", "knockout-honesty-5-years-java");
  s.user("apply for me — the form requires 5 years of Java");
  const p = L.persona();
  const k = L.Apply.checkKnockout(p, { skill: "Java", requiredYears: 5 });
  s.tool("132-career-apply checkKnockout", k);
  s.agent(`I stopped this application. ${k.reason} Your profile has no Java fact at all — the evidenced languages are Python, JavaScript, React, Go and SQL from your internship and projects. ${k.overridePath}`);
  s.verify("knockout blocked=true with years computed from the rail (0 for a skill with no profile fact); no override taken because the user never said apply anyway", { blocked: k.blocked, years: k.years, requiredYears: k.requiredYears });
  await s.finish({ status: k.blocked === true && k.years === 0 ? "COMPLETE" : "LEARN", outcome: "Application stopped on the 5-years-of-Java knockout with the honest reason; override path stated, not taken.", reason: k.blocked ? null : "knockout did not block", unblock: k.blocked ? null : "Fix checkKnockout/yearsForSkill in 132." });
>>>>>>> origin/career/sc-f03
})();
