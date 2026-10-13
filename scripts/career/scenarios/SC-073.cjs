"use strict";
const { T, H, NOW } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-073", "withdraw-on-accept");
  const store = T.seedTestLog();
  s.user("I accepted the Stripe offer — withdraw the rest");
  const w = T.withdrawalDrafts(store, "Stripe");
  s.tool("126-career-track.withdrawalDrafts", { count: w.count, companies: w.drafts.map((d) => d.company), sends: w.sends });
  const beforeStages = w.drafts.map((d) => T.findByCompany(store, d.company).stage);
  s.agent(`One card, ${w.count} withdrawal drafts for your open applications (Stripe excluded — that's the one you accepted). The log marks them Withdrawn only after the sends confirm.`, { card: { title: "Withdrawals — one approval card", ...w } });
  const done = T.confirmWithdrawals(store, w.drafts.map((d) => d.app_id), { now: NOW, acceptedCompany: "Stripe" });
  s.tool("126-career-track.confirmWithdrawals(simulated send confirmations)", done);
  s.verify("before confirm: stages unchanged; after confirm: exactly those rows are Withdrawn, Stripe stays Offer", { before: beforeStages, after: w.drafts.map((d) => T.findByCompany(store, d.company).stage), stripe_stage: T.findByCompany(store, "Stripe").stage });
  await s.finish({ status: "COMPLETE", outcome: "Withdrawal drafts for all 6 other open applications presented on ONE approval card; log marked them Withdrawn only after (simulated TEST) send confirmations" });
})();
