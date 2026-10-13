"use strict";
// Canonical SC-066 = Palantir FDSE referral stacking (re-run fresh under the
// canonical ID; same honest 124-dependency as F03's SC-058).
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-066", "palantir-fdse-referral-stacking");
  s.user("Apply to Palantir FDSE — with referral stacking checked first");
  const warmPaths = [
    { full_name: "Sam Rivera (TEST)", current_firm: "Palantir", title: "Forward Deployed Engineer (TEST)", relationship_to_user: "TEST University alumni (TEST)", source_list: ["linkedin-export (TEST)"] },
    { full_name: "Jo Park (TEST)", current_firm: "Stripe", relationship_to_user: "none (TEST)", source_list: ["linkedin-export (TEST)"] },
  ];
  const check = L.Apply.checkReferral("Palantir", warmPaths);
  s.tool("132-career-apply checkReferral (OUTR-shaped input; 124 not in this branch)", check);
  const log = L.Apply.createLog();
  const rec = L.Apply.buildAuditRecord(log, { company: "Palantir", role: "Forward Deployed Software Engineer (TEST posting)", timestamp: "2026-10-13T10:00:00Z", referral: { attached: false, who: null }, status: "held-48h-for-referral (TEST record)" });
  s.tool("132-career-apply held audit record", rec);
  s.agent(`Referral check ran BEFORE any application — warm path found: ${check.who} at Palantir (${warmPaths[0].relationship_to_user}).\n\n1. ${check.proposals[0]}.\n2. ${check.proposals[1]}.\n\nI recommend the 48-hour hold; the application is parked as a referral-track record (tracked separately from cold applications), and no outreach goes out until you approve the ask itself.`, { card: { type: "referral_stacking", title: "Palantir FDSE — referral first", check } });
  const ok = check.warmPathFound && check.trackedSeparately && /48 hours/.test(check.proposals[0]) && rec.status.includes("held");
  s.verify("warm path found before applying; §6 proposal pair present; application held (not submitted) and tracked separately", { ok, dependency: "124-career-outreach.js lives on origin/career/outr, not merged here — warm paths passed in OUTR shape" });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: "Palantir FDSE: referral stacking checked first, warm path found (TEST fixture), hold-48h proposed, application held and tracked separately.", reason: ok ? null : "referral seam failed", unblock: ok ? "Merge 124-career-outreach (career/outr) into pivot/career so warm paths come from the real OUTR pipeline instead of passed-in records." : "Fix checkReferral in 132." });
})();
