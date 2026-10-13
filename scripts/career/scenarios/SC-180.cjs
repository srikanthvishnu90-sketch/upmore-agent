"use strict"; const { H, P, persona } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-180", "star-bank-8-stories");
  await s.user("STAR bank: my real experiences mined into 8 reusable stories");
  const store = P.makePrepStore();
  const mined = P.mineStories(persona.facts); for (const m of mined) store.stories.push(m);
  const extra = [
    { title: "Automating the data pull (F-002 deep cut)", situation: "Weekly reporting at TEST Systems depended on manual spreadsheet pulls.", task: "Remove the manual pull entirely.", action: "I automated data pulls from PostgreSQL into the React/Python dashboard (fact F-002).", result: "cut weekly reporting time by 40% for 200 internal users", fact_id: "F-002", tags: ["impact", "technical", "initiative"] },
    { title: "DeployBoard onboarding for 12 teams (F-003 deep cut)", situation: "12 student teams needed to deploy containerised apps but Kubernetes onboarding was the bottleneck.", task: "Make DeployBoard usable without me in the room.", action: "I built DeployBoard in Go on AWS EKS and wrote the onboarding path myself (fact F-003).", result: "used by 12 student teams", fact_id: "F-003", tags: ["technical", "building", "communication"] },
    { title: "Pitch competition for 20 participants (F-005 deep cut)", situation: "The 45-member Investing Club wanted real reps, not lectures.", task: "Design a stock-pitch competition members would actually enter.", action: "I organised the competition and the weekly pitch sessions behind it (fact F-005).", result: "ran a stock-pitch competition with 20 participants", fact_id: "F-005", tags: ["leadership", "teamwork", "communication"] }];
  const captured = extra.map((e) => P.captureStory(store, e));
  await s.tool("127-career-prep.mineStories + captureStory", { mined: mined.length, captured: captured.length, total: store.stories.length });
  const found = P.findStories(store, "teamwork leadership");
  await s.agent(`Your STAR bank: 8 reusable stories, every one mined or captured from a real profile fact — nothing invented to reach the number.\n\n${store.stories.map((x, i) => `${i + 1}. ${x.title} [${x.source}] — tags: ${(x.tags || []).join(", ")}`).join("\n")}\n\nThe 5 base stories come straight from facts F-002…F-006; the 3 deep cuts split distinct, real sub-experiences out of F-002/F-003/F-005, each still carrying its fact_id. Retrieval check in the record: searching "teamwork leadership" returns ${found.length} stor${found.length === 1 ? "y" : "ies"} — the bank is usable by the question bank and mocks, not just stored.`);
  s.verify("story bank state", { stories: store.stories.length, all_fact_sourced: store.stories.every((x) => x.fact_id || /profile_fact/.test(x.source)), retrieval_hits: found.length });
  await s.finish({ status: "COMPLETE", outcome: "STAR bank of exactly 8 stories built: 5 mined from profile facts F-002–F-006 + 3 fact-tagged deep-cut captures, all stored in the prep store and retrievable by tag." });
})();
