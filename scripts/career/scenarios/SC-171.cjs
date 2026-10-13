<<<<<<< HEAD
"use strict"; const { H, P, persona } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-171", "teamwork-gap-fix");
  await s.user("my 'teamwork' answers are weak");
  const store = P.makePrepStore(); P.mineStories(persona.facts).forEach((x) => P.captureStory(store, x));
  const found = P.findStories(store, "teamwork leadership team members users");
  await s.tool("127-career-prep.findStories", { query: "teamwork", hits: found.map((x) => ({ title: x.title, fact_id: x.fact_id, tags: x.tags })) });
  const best = found[0];
  await s.agent(`Found the real teamwork fact in your own record — your story bank has it: "${best.title}" (${best.fact_id ? "profile fact " + best.fact_id : best.source}).\n\nSTAR draft built from it:\nS: ${best.situation.slice(0, 160)}\nT: ${best.task}\nA: ${best.action}\nR: ${best.result} (metrics on file: ${best.metrics.join(", ") || "add one"})\n\nYour answers felt weak because you were telling it as a list of tasks. The fix is the metric + the people: name who you worked with and what changed for them. Let's practice it right now — answer "Tell me about a time you worked with a team" using this story, and I'll score it.`);
  await s.user("In the Investing Club I lead 45 members. The task was a stock-pitch competition. I organised weekly sessions, coached 20 participants on their models, and specifically gave each one feedback before they presented. The result was 20 participants pitching and the club's biggest competition that year.");
  const sc = P.scoreAnswer("In the Investing Club I lead 45 members. The task was a stock-pitch competition. I organised weekly sessions, coached 20 participants on their models, and specifically gave each one feedback before they presented. The result was 20 participants pitching and the club's biggest competition that year.");
  await s.tool("127-career-prep.scoreAnswer", sc);
  await s.agent(`Scored: structure ${sc.scores.structure}/5, evidence ${sc.scores.evidence}/5, specificity ${sc.scores.specificity}/5 (total ${sc.scores.total}/15). ${sc.feedback.join(" ")} This story is now your primary teamwork answer — it's tagged in the bank and will be matched automatically in future question banks.`);
  s.verify("mined teamwork story + practice score stored in conversation state", { story: best.title, fact_id: best.fact_id, scores: sc.scores });
  await s.finish({ status: "COMPLETE", outcome: "Story-bank mining found the persona's real teamwork fact (Investing Club leadership, 45 members / 20 participants), built a STAR draft from it, and the user practiced it with rubric scoring.", reason: null, unblock: null });
=======
"use strict"; const { H, G, profile, T } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-171", "current-employer-contact-excluded");
  await s.user("Contact sits at my current employer — excluded by default, and I hear why");
  const st = G.makeGraphStore();
  G.importGraph(st, [{ source: "linkedin_export", records: [
    T("Inside Person", { current_firm: "TEST Systems Inc", title: "Engineering Manager", schools: ["TEST University"], connection_degree: 1, work_email: "inside@example.test" }),
    T("Priya Nair", { current_firm: "Datadog", title: "Software Engineer", schools: ["TEST University"], work_email: "priya@example.test" })] }]);
  const res = G.findPaths(st, "TEST Systems Inc", profile);
  await s.tool("135-career-graph.findPaths(current employer)", res);
  await s.agent(`Excluded — and here's why you heard about it instead of it happening silently: ${res.excluded[0].exclusion.detail}\n\nThis is a default, not a wall: if you genuinely want to use this contact (for example, an internal transfer conversation), say so knowingly and I'll put the ask on a card with this warning attached. I will never route a job-search ask through a current-employer contact on my own.`);
  s.verify("exclusion state", { paths_at_current_employer: res.paths.length, excluded_reason: res.excluded[0].exclusion.reason });
  await s.finish({ status: "COMPLETE", outcome: "Current-employer contact (TEST Systems Inc = persona's internship employer) excluded from paths by default, with the reason surfaced to the user and a knowing-override path stated." });
>>>>>>> origin/career/sc-w09
})();
