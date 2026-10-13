"use strict";
const L = require("./_w02-lib.cjs"); const { H, M, USER } = L;
(async () => {
  const s = H.session("SC-033", "reply-stop-suppress-forever");
  s.user("Reply handling: \"please stop emailing me\" — suppress forever, report the campaign count");
  const supp = M.createSuppressionStore();
  const camp = M.createCampaign({ id: "TEST-CAMP-033", userId: "TEST-USER", approved: true });
  const stopper = { person_id: "TEST-W02-033", full_name: "Stopper Fixture (TEST)", current_firm: "Fixture Bank (TEST)", title: "Analyst", work_email: "stopper.fixture@fixturebank.test" };
  const other = { person_id: "TEST-W02-033B", full_name: "Other Fixture (TEST)", current_firm: "Fixture Bank (TEST)", title: "Analyst", work_email: "other.fixture@fixturebank.test" };
  const sent = [];
  for (const c of [stopper, other]) { const d = M.draftAndGate(c, USER, {}); M.enqueue(camp, [{ candidate: c, draft: d.draft }], { suppression: supp }); }
  await M.sendPending(camp, { transport: L.testTransport(sent), suppression: supp });
  const sentToStopperBefore = sent.filter((m) => m.to === stopper.work_email).length;
  const reply = { subject: "Re: coffee chat", body: "Please stop emailing me." };
  s.tool("TEST fixture reply inbox", reply);
  const handled = M.handleReply(camp, reply, stopper, { suppression: supp });
  s.tool("CareerOutreach.handleReply", handled);
  const campaignCount = camp.items.filter((i) => i.status === "sent").length;
  const suppressedShared = supp.isSuppressed({ email: stopper.work_email, person_id: stopper.person_id }, "SOME-OTHER-USER");
  const suppressedOwn = supp.isSuppressed({ email: stopper.work_email, person_id: stopper.person_id }, camp.userId);
  // Prove forever: try to re-enqueue them into a fresh campaign — must reject as suppressed.
  const camp2 = M.createCampaign({ id: "TEST-CAMP-033-FUTURE", userId: "TEST-USER", approved: true });
  const re = M.enqueue(camp2, [{ candidate: stopper, draft: M.draftAndGate(stopper, USER, {}).draft }], { suppression: supp });
  s.agent(`Done — suppressed forever, on your list and the shared opt-out list. Campaign count: this campaign had sent ${campaignCount} emails total; ${sentToStopperBefore} of them went to this person, and they will never be emailed again (a re-enqueue attempt into a future campaign was rejected as suppressed).`, { card: { title: "Suppressed forever", campaign_sent_count: campaignCount, sent_to_this_person: sentToStopperBefore, reenqueue_result: re[0].status + ":" + (re[0].reason || "") } });
  const ok = handled.classification.classification === "hard-stop" && suppressedShared && suppressedOwn && re[0].status === "rejected" && re[0].reason === "suppressed";
  s.verify("suppression store state (shared + per-user), future-campaign enqueue rejection, campaign sent count from items[]", { suppressedShared, suppressedOwn, reenqueue: re, campaignCount, sentToStopperBefore, store: supp.toJSON() });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: `Hard-stop reply suppressed the recipient in both per-user and shared stores (verified); future re-enqueue rejected as 'suppressed'; campaign count reported: ${campaignCount} sent total, ${sentToStopperBefore} to this person.` }
    : { status: "LEARN", outcome: "Suppression did not verify.", reason: `handled=${JSON.stringify(handled.classification)} shared=${suppressedShared} own=${suppressedOwn} re=${JSON.stringify(re)}`, unblock: "Fix handleReply/suppression scope and rerun SC-033." });
})().catch((e) => { console.error(e); process.exit(1); });
