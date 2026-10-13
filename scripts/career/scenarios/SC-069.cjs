"use strict";
const { T, H, NOW } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-069", "offer-deadline-tracking");
  const store = T.seedTestLog();
  s.user("(offer letter stored with an expiry)");
  const app = T.findByCompany(store, "Stripe");
  const o = T.offerCountdown(store, "Stripe", { now: NOW });
  s.tool("126-career-track.offerCountdown", o);
  s.agent(`Stripe offer expiry is tracked from the stored date: ${o.offer_deadline.slice(0, 10)} — ${o.days_left} days left. Alerts are set for 7, 3 and 1 days before it.`);
  s.verify("countdown derived only from the log row's offer_deadline vs the fixed clock", { stored_offer_deadline: app.offer_deadline, days_left: o.days_left, stage: app.stage });
  await s.finish({ status: "COMPLETE", outcome: "Stripe offer expiry (2026-10-20) tracked on the log row; countdown of 8 days computed from the stored date with pre-expiry alerts defined" });
})();
