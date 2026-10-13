"use strict";
// SC-293 (canonical) Forced opt-out mid-campaign — suppression honored 100%, proven, severity-1.
const { H, S } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-293", "forced-opt-out-mid-campaign");
  s.user("(mid-campaign: a recipient replies 'please stop' — forced opt-out)");
  const store = S.createSuppressionStore();
  const campaign = { id: "camp-test-1", queue: [
    { name: "Ann A (TEST)", email: "ann@example.test" },
    { name: "Stop Person (TEST)", email: "stop@example.test" },
    { name: "Bob B (TEST)", email: "bob@example.test" },
    { name: "Stop Person (TEST)", email: "stop@example.test" },
  ], sent: [{ name: "Early E (TEST)", email: "early@example.test" }] };
  s.tool("campaign before opt-out", { queue: campaign.queue.map((q) => q.email), sent: campaign.sent.map((q) => q.email) });
  const fo = S.forceOptOut(store, campaign, { name: "Stop Person (TEST)", email: "stop@example.test" }, { reason: "replied_stop", at: "2026-10-12T18:30:00.000Z", scope: "shared" });
  s.tool("CareerSafety.forceOptOut", fo);
  s.agent(`Done — Stop Person is suppressed everywhere (per-user + shared list), and removed from the campaign queue (${fo.removed_from_queue} queued entr${fo.removed_from_queue === 1 ? "y" : "ies"}). The one email already sent before their reply is history and can't be unsent; nothing further will ever go to them.`);
  // Proof pass: run suppression over the remaining queue AND a brand-new campaign list containing them.
  const proof1 = S.applySuppression(store, campaign.queue);
  const proof2 = S.applySuppression(store, [{ email: "stop@example.test" }, { email: "new@example.test" }]);
  s.tool("proof: applySuppression(remaining queue) + applySuppression(future list)", { proof1, proof2 });
  const ok = fo.removed_from_queue === 2 && campaign.queue.length === 2
    && S.isSuppressed(store, { email: "STOP@example.test" }) === true
    && proof1.kept_count === 2 && proof1.removed_count === 0 && proof1.honored_100 === true
    && proof2.removed_count === 1 && proof2.kept_count === 1 && store.records[0].scope === "shared";
  s.verify("suppression state: BOTH queued entries for the opted-out person were removed mid-campaign, the shared suppression record exists, and two independent proof passes (remaining queue + a future list) keep them out 100%", { ok, queue_now: campaign.queue.map((q) => q.email), records: store.records });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "Forced opt-out honored 100%: the recipient's reply-stop suppressed them on the shared list and removed both of their queued entries mid-campaign; proof passes over the remaining queue and a future list keep them out entirely." }
    : { status: "LEARN", outcome: "Suppression did not hold 100% — severity-1 class failure.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix forceOptOut/applySuppression in 131 immediately (severity-1) and rerun SC-293." });
})().catch((e) => { console.error(e); process.exit(1); });
