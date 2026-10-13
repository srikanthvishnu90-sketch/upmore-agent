"use strict";
const L = require("./_w02-lib.cjs"); const { H, M, USER } = L;
(async () => {
  const s = H.session("SC-038", "ooo-return-date-reschedule-not-a-reply");
  s.user("Out-of-office reply with a return date — reschedule next touch, don't count it as a reply");
  const supp = M.createSuppressionStore();
  const camp = M.createCampaign({ id: "TEST-CAMP-038", userId: "TEST-USER", approved: true });
  const person = { person_id: "TEST-W02-038", full_name: "Away Fixture (TEST)", current_firm: "Fixture Bank (TEST)", title: "Analyst", work_email: "away.fixture@fixturebank.test" };
  const sent = [];
  M.enqueue(camp, [{ candidate: person, draft: M.draftAndGate(person, USER, {}).draft }], { suppression: supp });
  await M.sendPending(camp, { transport: L.testTransport(sent), suppression: supp });
  const repliesBefore = camp.stats.replies;
  const reply = { subject: "Out of Office", body: "I am out of office on vacation with limited access to email. I will return on October 27, 2026." };
  s.tool("TEST fixture OOO reply", reply);
  const handled = M.handleReply(camp, reply, person, { suppression: supp, nowMs: Date.parse("2026-10-13T12:00:00Z") });
  s.tool("CareerOutreach.handleReply", handled);
  s.agent(`That's an out-of-office auto-reply, not a reply — I did not count it. They return 2026-10-27, so your next touch is rescheduled to ${handled.reschedule_followup_on} (the day after they return). Reply count for the campaign is unchanged at ${camp.stats.replies}.`, { card: { title: "OOO — next touch rescheduled", classification: "auto-reply-ooo", return_date: handled.classification.return_date, reschedule_followup_on: handled.reschedule_followup_on, replies_counted: camp.stats.replies } });
  const ok = handled.classification.classification === "auto-reply-ooo" && handled.classification.counts_as_reply === false && handled.classification.return_date === "2026-10-27" && handled.reschedule_followup_on === "2026-10-28" && camp.stats.replies === repliesBefore;
  s.verify("campaign stats + classification state: counts_as_reply=false, replies unchanged, reschedule = return date + 1 day", { repliesBefore, repliesAfter: camp.stats.replies, classification: handled.classification, actions: handled.actions });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "OOO reply classified auto-reply-ooo, not counted as a reply (campaign reply count unchanged), and the next touch rescheduled to 2026-10-28 — the day after the stated 2026-10-27 return." }
    : { status: "LEARN", outcome: "OOO handling did not verify.", reason: `handled=${JSON.stringify(handled)}`, unblock: "Fix classifyReply OOO date parsing / reply counting and rerun SC-038." });
})().catch((e) => { console.error(e); process.exit(1); });
