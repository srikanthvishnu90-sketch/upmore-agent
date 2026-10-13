"use strict";
const { H, M, USER } = require("./w03-common.cjs");
const { seedCampaign } = require("./w03-campaign.cjs");
(async () => {
  const s = H.session("SC-045", "campaign-close-out-angles-thank-yous-next");
  const { camp, replyLog, notes } = await seedCampaign();
  s.user("Campaign's done — close it out: which angles worked, thank-you drafts, what next?");
  const co = M.closeOut(camp, { replyLog, notes, user: USER });
  s.tool("124.closeOut", { angles: co.angles, best_angle: co.best_angle, thank_you_drafts: co.thank_you_drafts.map((d) => ({ person_id: d.person_id, ok: d.ok })), metrics: { sent: co.metrics.sent, replies: co.metrics.replies, positive: co.metrics.positive } });
  s.agent(`Close-out:\nAngles by reply rate: ${co.angles.map((a) => `${a.angle} — ${a.replies}/${a.sent} replies (${a.reply_pct}%)`).join("; ")}. Best angle: ${co.best_angle}.\nThank-you drafts ready: ${co.thank_you_drafts.filter((d) => d.ok).length} (each cites the real note from the chat; none sends without your yes).\nWhat to do next:\n- ${co.next_steps.join("\n- ")}`, { card: { title: "Campaign close-out", best_angle: co.best_angle, angles: co.angles, thank_you_drafts: co.thank_you_drafts, next_steps: co.next_steps } });
  s.verify("angle table computed from the campaign's own items (draft structures) + replayed reply log; thank-you drafts built by thankYouDraft only where a real note exists", { angles_sum_sent: co.angles.reduce((a, x) => a + x.sent, 0), sent_items: camp.items.filter((i) => i.status === "sent" || i.status === "bounced").length, drafts_ok: co.thank_you_drafts.filter((d) => d.ok).length, notes_available: Object.keys(notes).length });
  await s.finish({ status: "COMPLETE", outcome: `Close-out delivered from campaign state: angle reply-rate table (best: ${co.best_angle}), ${co.thank_you_drafts.filter((d) => d.ok).length} thank-you drafts from real notes, and ${co.next_steps.length} next steps` });
})();
