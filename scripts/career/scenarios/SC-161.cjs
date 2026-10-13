<<<<<<< HEAD
"use strict"; const { H, P, cirById, briefText } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-161", "stripe-brief-no-cir");
  await s.user("prep me for my Stripe interview");
  const cir = cirById("stripe"); await s.tool("127-career-prep.findCir", { company: "Stripe", cir_found: !!cir, merged_cirs_on_file: 15 });
  const brief = P.composeBrief({ company: "Stripe", cir, role: "Software Engineering Intern" });
  await s.agent(briefText(brief), { card: { title: "Interview brief — Stripe", status: brief.status, gaps: brief.gaps } });
  await s.user("so you don't actually know their stages or bar?");
  await s.agent("Correct — not from a sourced record. Stripe is one of your target companies, but no Stripe CIR has been merged into packages/career-data/cirs yet (the 15 on file are Airbnb, Anduril, Bain, BCG, Citadel Securities, D. E. Shaw, Deloitte, Duolingo, Hudson River Trading, KKR, Millennium, Notion, Point72, Snowflake, Two Sigma). I can prep you from the actual JD text if you paste it, and your story bank and mock engine work regardless — but a grounded Stripe brief needs that CIR merged first.");
  s.verify("brief status in module state", { status: brief.status, bar: brief.bar, stages: brief.stages });
  await s.finish({ status: "LEARN", outcome: "Agent refused to invent a Stripe brief: no Stripe CIR is merged, so stages/bar/comp were honestly reported as unknown, with JD-based prep offered instead.", reason: "packages/career-data/cirs on pivot/career has 15 CIRs and Stripe is not one of them; the ledger expectation (brief from CIR + JD) cannot be met without it.", unblock: "Merge a Stripe CIR (same pattern as the cir-b1..b5 batches) into packages/career-data/cirs/stripe.json, or supply the Stripe JD text for a JD-grounded brief." });
=======
"use strict"; const { H, G, persona, cirById } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-161", "referral-bonus-intel");
  await s.user("Referral-bonus intel: which targets pay them (engineers answer those asks more)");
  const targets = persona.preferences.targetCompanies.filter((c) => !/TEST|Example/.test(c));
  const cirs = targets.map((c) => cirById(c.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")) || cirById(c.toLowerCase().replace(/\s+/g, "-"))).filter(Boolean);
  const all = []; for (const id of ["stripe", "goldman-sachs-ibd", "jane-street", "datadog", "ramp"]) { const c = cirById(id); if (c) all.push(c); }
  const intel = G.referralBonusIntel(all, ["Stripe", "Goldman Sachs", "Jane Street", "Datadog", "Ramp"]);
  await s.tool("135-career-graph.referralBonusIntel", intel);
  await s.agent(`Here's the honest intel table — and the headline matters: ${intel.headline}\n\n${intel.rows.map((r) => `• ${r.company}: bonus amount ${r.bonus_amount == null ? "NOT SOURCED in its CIR" : "$" + r.bonus_amount} (status ${r.bonus_status}). Referral weight (from the CIR): ${r.referral_weight || "no note on file"}`).join("\n")}\n\nSo I won't tell you "Datadog pays $X per referral" — no CIR in the merged corpus carries a bonus amount, and inventing one is how bad intel starts. The usable, sourced read: referrals route you into the process but the artifacts carry the decision — which is why practitioner/engineer asks (someone who can speak to your actual work) are the ones worth spending, per each CIR's referral-weight note. Logged as BUG-122: no CIR carries a referral_bonus field; adding one per company (with a source) is what turns this table from weight-notes into amounts.`);
  s.verify("intel rows from CIR state", { rows: intel.rows.map((r) => ({ company: r.company, bonus_status: r.bonus_status, has_weight_note: !!r.referral_weight })), sourced_bonus_count: intel.sourced_bonus_count });
  await s.finish({ status: "COMPLETE", outcome: "Referral intel delivered for all 5 targets from their CIRs: referral-WEIGHT note sourced per company; bonus AMOUNTS reported as not-sourced (no CIR carries one) instead of invented.", reason: "Bonus amounts do not exist in any merged CIR (BUG-122) — the intel outcome is the sourced weight table + the explicit gap, not a fabricated dollar figure.", unblock: "To report amounts: add a sourced referral_bonus field to each CIR (125 schema) — referralBonusIntel picks it up automatically (bonus_status SOURCED)." });
>>>>>>> origin/career/sc-w09
})();
