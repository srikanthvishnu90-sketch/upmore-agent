"use strict";
const { T, H, NOW } = require("./f04-common.cjs");
(async () => {
  const s = H.session("SC-075", "digest-quiet-hours");
  s.user("(digest due at 11pm)");
  const at23 = new Date(2026, 9, 12, 23, 0, 0);
  const digest = T.planDelivery({ kind: "digest" }, at23);
  const critical = T.planDelivery({ kind: "interview_invite" }, at23);
  const deadlineSoon = T.planDelivery({ kind: "deadline", days_away: 1 }, at23);
  s.tool("126-career-track.planDelivery", { digest, critical, deadlineSoon });
  s.agent(`It's 11pm — quiet hours (22:00–07:00). Your digest is batched to ${digest.deliver_at.slice(0, 16).replace("T", " ")} local. Status-critical items (an interview invite, a deadline inside 2 days) would still fire immediately.`);
  s.verify("delivery plan from the quiet-hours rule: low-priority batched to 07:00, critical immediate", { digest_batched: digest.batched, digest_deliver_hour: new Date(digest.deliver_at).getHours(), critical_immediate: critical.immediate, deadline_immediate: deadlineSoon.immediate });
  await s.finish({ status: "COMPLETE", outcome: "11pm digest batched to 07:00 under the quiet-hours rule while interview/offer/near-deadline items still fire immediately" });
})();
