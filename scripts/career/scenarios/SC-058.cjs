"use strict";
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
})();
