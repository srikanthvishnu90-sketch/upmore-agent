"use strict";
const { H, M } = require("./w03-common.cjs");
const { seedCampaign } = require("./w03-campaign.cjs");
(async () => {
  const s = H.session("SC-044", "daily-digest-during-campaign");
  const { camp, fx, sentResult } = await seedCampaign();
  s.user("How's the campaign doing today?");
  s.tool("seed replay: sendPending + recordOutcome/handleReply over fixture events", { sent: sentResult.sent, fixture_sent: fx.sent_count, fixture_bounces: fx.bounce_person_indexes.length, fixture_replies: fx.replies.length });
  const d = M.dailyDigest(camp, {});
  s.tool("124.dailyDigest", d);
  s.agent(d.text, { card: { title: "Daily digest", digest: d } });
  s.verify("digest numbers read back from campaign state after replaying the fixture events through the real rail", { wave_sent: camp.wave.sent, wave_bounces: camp.wave.bounces, stats: camp.stats, digest_matches: d.sent === camp.wave.sent && d.bounced === camp.wave.bounces && d.replies === camp.stats.replies && d.positive === camp.stats.positive && d.meetings_pending === camp.stats.meetings_booked - camp.stats.meetings_held });
  await s.finish({ status: "COMPLETE", outcome: `Daily digest computed from replayed campaign state: ${d.sent} sent, ${d.bounced} bounced, ${d.replies} replies, ${d.positive} positive, ${d.meetings_pending} meetings pending — every number matches the campaign's own counters` });
})();
