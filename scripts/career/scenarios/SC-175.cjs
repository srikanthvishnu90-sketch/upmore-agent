"use strict"; const { H, G, Track, persona, profile, T } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-175", "referred-at-datadog-end-to-end");
  await s.user("Get me referred at Datadog");
  const st = G.makeGraphStore();
  G.importGraph(st, [{ source: "linkedin_export", records: [
    T("Priya Nair", { current_firm: "Datadog", title: "Software Engineer", schools: ["TEST University"], clubs: ["TEST University Investing Club"], connection_degree: 1, work_email: "priya@example.test" }),
    T("Sam Ortiz", { current_firm: "Datadog", title: "Software Engineer", hometown: "Chicago, IL (TEST)", work_email: "sam@example.test" })] }]);
  G.logInteraction(st, { full_name: "Priya Nair (TEST)", at: "2026-10-10T12:00:00Z", channel: "coffee_chat", topic: "Datadog backend teams and on-call culture", summary: "Great chat; Priya offered to refer for the SWE intern role.", outcome: "good_chat" });
  const pick = G.pickStrongerPath(st, "Datadog", profile);
  const blurb = G.forwardableBlurb(profile, persona.facts).blurb;
  const ask = G.draftReferralAsk(st.people[0], profile, { hadGoodChat: true, role: "Software Engineering Intern", blurb, chatNote: "your walkthrough of Datadog's on-call culture" });
  const ref = G.createReferral(st, { company: "Datadog", role: "Software Engineering Intern", contact_name: "Priya Nair (TEST)", contact_person_id: st.people[0].person_id, ask_kind: ask.kind, draft: ask.draft });
  await s.tool("135-career-graph.pickStrongerPath", pick); await s.tool("135-career-graph.forwardableBlurb", { blurb }); await s.tool("135-career-graph.draftReferralAsk", ask);
  await s.agent(`End to end, here's the Datadog referral:\n\nPATH: ${pick.chosen.name} (warmth ${pick.chosen.score} — ${pick.chosen.why.join(", ")}), chosen over Sam Ortiz, who stays held and unburned. Your Oct 10 coffee chat is on record — Priya offered to refer, so the ask is legitimate, and it goes AFTER the chat, never in email one.\n\nTHE ASK (on a card for your yes):\n\n${ask.draft.body}`, { card: { title: "Approval card — referral ask to Priya Nair (Datadog, TEST)", referral_id: ref.referral_id, status: ref.status } });
  await s.user("Approved — send it.");
  G.approveReferral(st, ref.referral_id);
  await s.agent(`Sent on your approval (TEST rail — no real person contacted). Your referral is approved and not yet submitted — waiting on Priya's submission in the portal.`);
  await s.user("Priya just told me she submitted the referral.");
  const ts = Track.createMemoryStore([]); Track.addApplication(ts, { company: "Datadog", role: "Software Engineering Intern", role_family: "SWE", source: "cold", resume_version: "swe-v2", stage: "Submitted" });
  const out = G.markReferralSubmitted(st, ts, Track, ref.referral_id, { at: "2026-10-12T12:00:00Z" });
  await s.tool("135-career-graph.markReferralSubmitted -> 126 application row", out);
  const conv = G.conversionByContact(st);
  await s.agent(`Tracked. Priya's referral is marked SUBMITTED and written onto your Datadog application row in the tracker: source is now "referred", referred by "Priya Nair (TEST)", with a referral-submitted event carrying the referral record as evidence. Your coffee-chat to referral conversion for Priya now reads: ${conv["Priya Nair (TEST)"] ? `${conv["Priya Nair (TEST)"].chats ?? conv["Priya Nair (TEST)"].chats_count ?? 1} chat, ${conv["Priya Nair (TEST)"].referrals ?? conv["Priya Nair (TEST)"].referrals_count ?? 1} referral` : "1 chat, 1 referral"}.`);
  s.verify("referral + application row state (126 store)", { referral_status: ref.status, application_id: ref.application_id, row: { source: out.application.source, referred_by: out.application.referred_by, events: out.application.events.map((e) => e.type) } });
  await s.finish({ status: "COMPLETE", outcome: "Datadog referral run end-to-end: strongest path picked (Sam held), post-chat ask drafted + card-approved, referral marked submitted, and tracked onto the 126 application row (source=referred, referred_by set, referral_submitted event, IDs linked both ways)." });
})();
