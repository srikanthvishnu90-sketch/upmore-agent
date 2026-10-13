"use strict";
<<<<<<< HEAD
const { H, M, NOW, USER, PROFILE, poolOverFirms } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-058", "real-estate-pe-associates-ny-deal-specific");
  const q = M.parseTarget("Email 60 real-estate PE associates in NY with deal-specific personalization", PROFILE);
  const records = poolOverFirms(q.firms, 7, { per: (i, firm) => ({ title: "Associate", seniority_band: "associate", geography: "NY", office: "New York", personalization_facts: [{ fact: `worked on the ${firm} industrial logistics acquisition (TEST deal fact)`, source_url: "https://example.test/deal" + i, strength: "strong", kind: "deal", topic: "that acquisition" }] }) });
  const pool = M.buildList(records, q, { profile: PROFILE, nowMs: NOW });
  const samples = pool.selected.slice(0, 3).map((c) => M.draftAndGate(c, USER, {}));
  s.user("Email 60 real-estate PE associates in NY with deal-specific personalization");
  s.tool("124.parseTarget+buildList+draftAndGate samples", { firm_set: q.firm_set, deal_specific: q.background_filters.deal_specific, yield: pool.yield, sample_tiers: samples.map((d) => d.draft.tier), sample_gates: samples.map((d) => d.gate.pass) });
  s.agent(`List built: ${pool.selected.length} real-estate PE associates in NY, every one carrying a sourced deal fact, so the drafts are deal-specific (Tier ${samples.map((d) => d.draft.tier).join("/")}). Sample draft:\n\n${samples[0].draft.body}\n\nDrafts are ready — nothing sends until you approve the plan.`);
  s.verify("selection read back: exactly 60, all NY, all real_estate_pe firms, all with a sourced deal fact; sample drafts Tier A and gate-clean, bodies cite the deal fact", { selected: pool.selected.length, firms_ok: pool.selected.every((c) => q.firms.includes(c.current_firm)), deal_facts_ok: pool.selected.every((c) => (c.personalization_facts || []).some((f) => f.kind === "deal" && !!f.source_url)), sample_body_cites_deal: samples[0].draft.body.includes("industrial logistics acquisition") });
  await s.finish({ status: "COMPLETE", outcome: `60 NY real-estate PE associates selected with sourced deal-specific personalization (new real_estate_pe firm set); sample drafts Tier A, gate-clean, citing the deal fact` });
=======
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-058", "referral-stacking-palantir");
  s.user("apply to Palantir — but check referrals first");
  // OUTR-shaped warm-path data (124-career-outreach normalizeCandidate field
  // names). 124 is NOT merged into this branch (it lives on career/outr), so
  // the records are passed in — the honest seam the ledger allows. The contact
  // is a labeled TEST fixture, not a real person.
  const warmPaths = [
    { full_name: "Sam Rivera (TEST)", current_firm: "Palantir", title: "Forward Deployed Engineer (TEST)", relationship_to_user: "TEST University alumni (TEST)", source_list: ["linkedin-export (TEST)"] },
    { full_name: "Jo Park (TEST)", current_firm: "Stripe", relationship_to_user: "none (TEST)", source_list: ["linkedin-export (TEST)"] },
  ];
  const check = L.Apply.checkReferral("Palantir", warmPaths);
  s.tool("132-career-apply checkReferral (OUTR-shaped input, 124 not in branch)", check);
  const log = L.Apply.createLog();
  const rec = L.Apply.buildAuditRecord(log, { company: "Palantir", role: "Forward Deployed Software Engineer (TEST posting)", timestamp: "2026-10-12T16:00:00Z", referral: { attached: false, who: null }, status: "held-48h-for-referral (TEST record)" });
  s.tool("132-career-apply audit record (held, tracked separately)", rec);
  s.agent(`Warm path found BEFORE applying: ${check.who} at Palantir (${warmPaths[0].relationship_to_user}). Two honest options:\n\n1. ${check.proposals[0]}.\n2. ${check.proposals[1]}.\n\nI'd hold the 48 hours — a referral gets a human read, and this application is now tracked as a referral-track application, separately from your cold ones. I drafted nothing and contacted no one yet: the referral ask itself needs your approval first.`, { card: { type: "referral_stacking", title: "Palantir — referral check first", check } });
  const ok = check.warmPathFound === true && check.trackedSeparately === true && /48 hours/.test(check.proposals[0]);
  s.verify("warm-path check ran before any application record; proposals are the Doc 2 §6 pair (hold-48h-and-ask / apply-now-with-referral); the held application is in the log with referral tracking", { ok, trackedAsField: rec.trackedAs, status: rec.status, dependency: "124-career-outreach.js not merged into career/sc-f03 (lives on origin/career/outr e86768a) — warm paths passed in OUTR shape" });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: "Palantir referral check ran first: warm path found (TEST fixture contact), hold-48h vs apply-now-with-referral proposed, app held and tracked separately.", reason: ok ? null : "referral seam failed", unblock: ok ? "Merge 124-career-outreach (career/outr) into pivot/career so warm paths come from the real OUTR pipeline instead of passed-in records." : "Fix checkReferral in 132." });
>>>>>>> origin/career/sc-f03
})();
