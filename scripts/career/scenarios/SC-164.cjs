<<<<<<< HEAD
"use strict"; const { H, P, persona } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-164", "story-bank-build");
  await s.user("help me build my story bank");
  const store = P.makePrepStore(); const mined = P.mineStories(persona.facts); mined.forEach((x) => P.captureStory(store, x));
  await s.tool("127-career-prep.mineStories", { facts_considered: persona.facts.length, stories_mined: mined.length, fact_ids: mined.map((x) => x.fact_id) });
  await s.agent(`Built from your actual profile facts — nothing invented. ${mined.length} STAR stories captured:\n\n${mined.map((x) => `• ${x.title}\n  S: ${x.situation.slice(0, 110)}…\n  A: ${x.action}\n  R: ${x.result} [metrics: ${x.metrics.join(", ") || "none recorded"}] [tags: ${x.tags.join(", ")}] (source fact ${x.fact_id})`).join("\n")}\n\nThese are stored in your story bank and get reused automatically: the question bank matches them to likely questions, and mocks score how well you tell them.`);
  await s.user("add one: I mentored two freshmen in the investing club until they placed in the pitch competition");
  const added = P.captureStory(store, { title: "Mentored freshmen to a pitch-competition placement", situation: "Two freshmen in the Investing Club had never built a model.", task: "Get them competition-ready.", action: "mentored two freshmen in the investing club through weekly model reviews", result: "they placed in the pitch competition", source: "user_capture" });
  await s.agent(`Captured as a STAR story (tags: ${added.tags.join(", ")}). Story bank now holds ${store.stories.length} stories.`);
  s.verify("story bank rows in store", { rows: store.stories.length, ids: store.stories.map((x) => x.story_id), teamwork_tagged: store.stories.filter((x) => x.tags.includes("teamwork")).length });
  await s.finish({ status: "COMPLETE", outcome: `Story bank built: ${mined.length} STAR stories mined from real profile facts plus 1 user-captured story, all tagged and stored for reuse across preps.`, reason: null, unblock: null });
=======
"use strict"; const { H, G, persona, profile, T } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-164", "revive-dormant-contact");
  await s.user("Revive a dormant contact from last season — honestly, with a real update");
  const st = G.makeGraphStore();
  G.importGraph(st, [{ source: "linkedin_export", records: [T("Daniel Ortiz", { current_firm: "Stripe", title: "Software Engineer", schools: ["TEST University"], work_email: "daniel@example.test" })] }]);
  G.logInteraction(st, { full_name: "Daniel Ortiz (TEST)", at: "2026-02-10T12:00:00Z", channel: "coffee_chat", topic: "breaking into product-minded engineering teams", summary: "Daniel advised leading with writing and shipped work.", outcome: "good_chat" });
  const mem = G.relationshipMemory(st, "Daniel Ortiz (TEST)");
  const fact = persona.facts.find((f) => f.id === "F-002");
  const noUpdate = G.dormantRevival(st.people[0], profile, { lastTopic: mem.last.topic });
  const draft = G.dormantRevival(st.people[0], profile, { lastTopic: mem.last.topic, realUpdate: { fact_id: fact.id, text: `since we spoke I shipped the dashboard work from my internship — ${fact.action}, which ${fact.result} (fact ${fact.id}).` }, goal: "a Stripe SWE internship" });
  await s.tool("135-career-graph.relationshipMemory", mem); await s.tool("135-career-graph.dormantRevival(no-update case)", noUpdate); await s.tool("135-career-graph.dormantRevival", draft);
  await s.agent(`Found him: last talked ${mem.last.at} — ${mem.summary}\n\nThe revival draft (held for your yes). It leads with a REAL update from your profile — your TEST Systems dashboard work, fact F-002 — and it names the silence honestly instead of pretending no time passed:\n\n${draft.draft.body}\n\nGuard in the tool record: without a real, fact-tagged update the rail refuses (real_update_required). No fabricated milestone, ever.`);
  s.verify("revival state", { last_interaction: mem.last.at, refused_without_update: noUpdate.ok === false, draft_ok: draft.ok, update_fact_id: draft.update_fact_id });
  await s.finish({ status: "COMPLETE", outcome: "Dormant contact (last chat 2026-02-10, topic on record) revived with a draft grounded in real profile fact F-002, held draft_only; the no-real-update variant is refused." });
>>>>>>> origin/career/sc-w09
})();
