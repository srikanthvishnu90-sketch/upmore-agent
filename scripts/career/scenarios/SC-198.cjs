"use strict"; const { H, N, fixture, NOW } = require("./f10-lib.cjs");
(async () => { const s = H.session("SC-198", "decline-gracefully");
  s.user("help me decline the other offer");
  const store = N.createStore(); N.storeOffer(store, N.parseOffer(fixture("test-offer-a.txt"), { now: NOW })); const b = N.storeOffer(store, N.parseOffer(fixture("test-offer-b.txt"), { now: NOW }));
  const d = N.declineDraft(b); store.drafts.push({ kind: "decline", offer_id: b.offer_id, status: "drafted_not_sent", at: NOW });
  s.tool("128.declineDraft", d);
  s.agent(`Warm decline drafted for the Notion offer — it thanks the team, frames the reason as fit, and leaves the door open. It's on the card; nothing sends without your yes, and your log now records the decline as drafted.`, { card: d.card });
  s.verify("decline checks all true (thanks/fit/door-open/no burn language); log updated with drafted decline", { checks: d.relationship_kept_checks, drafts: store.drafts });
  await s.finish({ status: "COMPLETE", outcome: "Decline drafted warmly on an approval card (not sent) and the log updated" }); })();
