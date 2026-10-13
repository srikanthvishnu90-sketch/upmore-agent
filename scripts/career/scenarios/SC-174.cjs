<<<<<<< HEAD
"use strict"; const { H, P, cirById } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-174", "voice-mock-honest-fallback");
  await s.user("do a voice mock");
  const v = P.voiceMockAvailability(); await s.tool("127-career-prep.voiceMockAvailability", v);
  const store = P.makePrepStore(); const bank = P.questionBank({ cir: cirById("duolingo") });
  const m = P.startMock(store, { bank, count: 2 });
  await s.agent(`Plain answer: ${v.reason} I won't fake a voice call. ${v.fallback}\n\nStarting the text mock now (Duolingo CIR bank). Question 1: ${m.questions[0].q}`);
  const a1 = "The situation was a manual spreadsheet workflow at TEST Systems Inc. First I built a React and Python dashboard for 200 internal users, specifically automating PostgreSQL pulls. The result was reporting time cut by 40% that summer because we tracked the baseline.";
  await s.user(a1); const r1 = P.answerMock(store, m.mock_id, a1);
  await s.agent(`Scored ${r1.graded.scores.total}/15 (structure ${r1.graded.scores.structure}, evidence ${r1.graded.scores.evidence}, specificity ${r1.graded.scores.specificity}). Next: ${r1.next_question}`);
  const a2 = "DeployBoard: I built a Go tool that deploys apps on Kubernetes, used by 12 student teams on AWS EKS. The hard part was debugging rollouts the week before demos; the result was 12 teams shipping without manual kubectl work that semester.";
  await s.user(a2); const r2 = P.answerMock(store, m.mock_id, a2); const sum = P.mockSummary(store, m.mock_id);
  await s.agent(`Done — text mock complete and stored (average total ${sum.average_scores.total}/15, fix first: ${sum.fix_first}). When a voice rail is wired for prep, the same bank and rubric carry over; until then this is the honest version of a voice mock.`);
  s.verify("voice unavailable + text mock completed in store", { voice: v, mock_status: store.mocks[0].status, answered: sum.answered });
  await s.finish({ status: "COMPLETE", outcome: "Agent stated plainly that no voice rail is wired for prep (no fake capability) and ran the full text mock end-to-end with stored scores instead.", reason: null, unblock: null });
=======
"use strict"; const { H, G, O, profile, user, T } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-174", "same-person-three-sources-merge");
  await s.user("Same person found in three sources — merged to one record, never double-sent");
  const st = G.makeGraphStore();
  const imp = G.importGraph(st, [
    { source: "linkedin_export", records: [T("Priya Nair", { current_firm: "Datadog", work_email: "priya@example.test" })] },
    { source: "alumni_directory", records: [T("Priya Nair", { current_firm: "Datadog", schools: ["TEST University"] })] },
    { source: "club_roster", records: [T("Priya Nair", { current_firm: "Datadog", title: "Software Engineer", clubs: ["TEST University Investing Club"] })] }]);
  await s.tool("135-career-graph.importGraph(3 sources)", imp);
  const camp = O.createCampaign({ id: "camp-w09-174", userId: "u-test", approved: true });
  const person = st.people[0];
  const enq = O.enqueue(camp, [{ candidate: Object.assign({}, person, { email_confidence: 0.9, email_verification: "verified" }), draft: { subject: "TEST", body: "TEST", tier: "A" } }]);
  await s.tool("124-career-outreach.enqueue(merged person)", { queued: enq.filter((e) => e.status === "queued").length, items_in_campaign: camp.items.length });
  await s.agent(`Merged. Priya Nair arrived from three sources — LinkedIn export, alumni directory, club roster — and is ONE record in your graph (input 3 → people ${imp.people}, merges ${imp.merges.length}), carrying all three sources, her alumni fact, her club, and her title.\n\nAnd the double-send proof is in the campaign record: enqueuing the merged person produces exactly ${camp.items.length} campaign item with one idempotency key. There is no second Priya to email.`);
  s.verify("merged identity + single campaign item", { people: imp.people, merges: imp.merges.length, sources: person.source_list, campaign_items: camp.items.length });
  await s.finish({ status: "COMPLETE", outcome: "Same person from 3 sources merged to one graph record (sources unioned, richest fields kept); campaign enqueue yields exactly one item/idempotency key — double-send impossible." });
>>>>>>> origin/career/sc-w09
})();
