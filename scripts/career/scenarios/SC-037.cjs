"use strict";
const L = require("./_w02-lib.cjs"); const { H, M, USER } = L;
(async () => {
  const s = H.session("SC-037", "day15-final-followup-gracious-close-stop-forever");
  s.user("Day-15 final follow-up: gracious close, then stop forever");
  const supp = M.createSuppressionStore();
  const camp = M.createCampaign({ id: "TEST-CAMP-037", userId: "TEST-USER", approved: true });
  const people = L.gen(4, { tag: "037", count: 4, firms: ["Evercore", "Lazard", "Citi", "Baird"], title: "Analyst", seniority: "analyst" });
  const sent = [];
  M.enqueue(camp, people.map((c) => ({ candidate: c, draft: M.draftAndGate(c, USER, {}).draft })), { suppression: supp });
  await M.sendPending(camp, { transport: L.testTransport(sent), suppression: supp });
  const fu1 = M.runFollowUps(camp, { touch: 1, continueTap: true, suppression: supp });
  await M.sendPending(camp, { transport: L.testTransport(sent), suppression: supp });
  const final = M.runFollowUps(camp, { touch: 2, continueTap: true, final: true, suppression: supp });
  s.tool("CareerOutreach.runFollowUps day-15 final (W02 extension)", { ok: final.ok, final: final.final, followups: final.followups.map((f) => ({ to: f.email, touch: f.touch, body: f.draft.body })), stopped_forever: final.stopped_forever });
  const after = M.runFollowUps(camp, { touch: 3, continueTap: true, suppression: supp });
  s.tool("CareerOutreach.runFollowUps after final (must refuse: closed forever)", after);
  s.agent(`Final follow-ups sent as a gracious close ("I'll close the loop — no need to reply") to the ${final.followups.length} remaining non-responders. Then it stops forever: the campaign's follow-ups are closed in the rail, and a further follow-up attempt was refused (${after.reason || "per-person cap"}).`, { card: { title: "Day-15 final close — stopped forever", final_followups: final.followups.length, stopped_forever: final.stopped_forever, after_final_attempt: after } });
  const ok = fu1.followups.length === 4 && final.ok && final.followups.length === 4 && final.followups.every((f) => f.touch === 2 && /close the loop/i.test(f.draft.body)) && camp.followups_closed === true && after.ok === false;
  s.verify("campaign state: followups_closed=true after final wave; touch-3 attempt refused; final bodies are the gracious close", { followups_closed: camp.followups_closed, closed_persons: camp.closed_persons, after });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: `Day-15 final wave queued 4 gracious-close follow-ups (touch 2, the per-person max), then follow-ups closed forever in campaign state — a touch-3 attempt was refused.` }
    : { status: "LEARN", outcome: "Final follow-up did not verify.", reason: `fu1=${fu1.followups.length} final=${JSON.stringify(final).slice(0, 300)} after=${JSON.stringify(after)}`, unblock: "Fix runFollowUps final/close logic and rerun SC-037." });
})().catch((e) => { console.error(e); process.exit(1); });
