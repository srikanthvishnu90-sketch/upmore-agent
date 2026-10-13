<<<<<<< HEAD
"use strict"; const { H, P } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-167", "debrief-and-thank-you");
  await s.user("my Snowflake interview just ended. It went well — the quota-service design chat was the best part. I stumbled on the team-matching question and they asked how their panel process works");
  const store = P.makePrepStore();
  const d = P.captureDebrief(store, { company: "Snowflake", role: "SWE Intern", interviewer: "Sam Rivera (TEST)", wentWell: ["the quota-service design discussion"], stumbled: ["the team-matching question"], questionsAsked: ["how team matching works at Snowflake"], followUpBy: "today" });
  await s.tool("127-career-prep.captureDebrief", d);
  const t = P.thankYouDraft({ company: "Snowflake", interviewer: "Sam Rivera (TEST)", debrief: d, senderName: "Alex Testcase (TEST)" });
  await s.agent(`Debrief captured: went well — ${d.went_well.join("; ")}; stumbled — ${d.stumbled.join("; ")}; noted for your next mock: team-matching questions.\n\nThank-you draft is on the card below — same day, references the quota-service discussion specifically, and it's a DRAFT: it sends only when you approve it.`, { card: { title: "Thank-you draft — Sam Rivera (TEST), Snowflake", ...t } });
  s.verify("debrief stored + draft status", { debriefs: store.debriefs.length, draft_status: t.status, body_references_specific: /quota-service/.test(t.body) });
  await s.finish({ status: "COMPLETE", outcome: "Debrief captured into the prep store the same day and a specific (non-generic) thank-you draft produced on a card, held as draft_only pending user approval.", reason: null, unblock: null });
=======
"use strict"; const { H, G, persona, profile, T } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-167", "family-friend-path");
  await s.user("Family-friend path from my pasted contacts — extra care in tone, my yes");
  const st = G.makeGraphStore();
  const imp = G.importGraph(st, [{ source: "pasted_contacts", records: [T("Uncle Ravi Menon", { current_firm: "Ramp", title: "Engineering Manager", is_family_friend: true, work_email: "ravi@example.test" })] }]);
  await s.tool("135-career-graph.importGraph(pasted contacts)", imp);
  const blurb = G.forwardableBlurb(profile, persona.facts).blurb;
  const ask = G.draftReferralAsk(st.people[0], profile, { hadGoodChat: true, role: "Software Engineering Intern", blurb });
  await s.tool("135-career-graph.draftReferralAsk(kind=family_friend)", ask);
  await s.agent(`From your pasted contacts: Ravi Menon at Ramp, flagged family friend. Because of that, the draft is built differently — family warmth first, an explicit no-pressure out, and it does not send without your yes (it's a card draft, and the tone note is in the record):\n\n${ask.draft.body}\n\nTone note from the rail: ${ask.tone_note}`, { card: { title: "Approval card — family-friend referral ask (Ramp)", requires_approval: true, tone: "extra_care" } });
  s.verify("family-friend ask state", { kind: ask.kind, tone_note_present: !!ask.tone_note, status: ask.status });
  await s.finish({ status: "COMPLETE", outcome: "Family-friend path imported from pasted contacts; referral ask drafted with the extra-care register (explicit no-pressure out) and held on an approval card — nothing sent." });
>>>>>>> origin/career/sc-w09
})();
