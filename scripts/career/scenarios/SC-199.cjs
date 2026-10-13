"use strict"; const { H, N, fixture, NOW } = require("./f10-lib.cjs");
(async () => { const s = H.session("SC-199", "two-deadlines-collide");
  s.user("both offers expire Friday");
  const store = N.createStore(); N.storeOffer(store, N.parseOffer(fixture("test-offer-a.txt"), { now: NOW })); N.storeOffer(store, N.parseOffer(fixture("test-offer-b.txt"), { now: NOW }));
  const plan = N.deadlinePlan(store.offers, { now: "2026-10-12" }); s.tool("128.deadlinePlan", plan);
  s.agent(`Both stored offers really do expire on the same day — ${plan.deadlines[0].expiry_date} (${plan.deadlines[0].days_left} days from today). Here's the sequence, with nothing implicit:\n${plan.steps.join("\n")}\nStep 1's extension draft and the counter are both card-gated — I send nothing without your yes.`);
  s.verify("collision detected from the two stored expiry dates (both 2026-10-30); sequence names the real date", { deadlines: plan.deadlines, collision: plan.collision });
  await s.finish({ status: "COMPLETE", outcome: "Colliding deadlines sequenced explicitly (extension → counter → decide → warm decline) from the real stored dates" }); })();
