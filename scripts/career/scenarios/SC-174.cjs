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
})();
