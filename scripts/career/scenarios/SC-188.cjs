"use strict"; const { H, OS, J, persona, livePostings, allCirs } = require("./f10-lib.cjs");
(async () => { const s = H.session("SC-188", "skill-gap");
  s.user("what should I learn next?");
  const prof = J.profileFromPersona(persona()); const live = await livePostings(["datadog", "stripe", "ramp"]); s.tool("121 live feeds", live.feeds);
  const g = OS.skillGap({ profileSkills: prof.skills.map((x) => x.name), postings: live.postings, cirs: allCirs() }); s.tool("129.skillGap", g);
  s.agent(g.gaps.length ? `Learn-next order, grounded in the ${g.basis.higher_paying_postings_considered} higher-paying live postings (of ${g.basis.postings_with_stated_ranges} with stated ranges):\n${g.gaps.slice(0, 6).map((x, i) => `${i + 1}. ${x.skill} — named in ${x.postings} of them (e.g. ${x.examples[0]})`).join("\n")}\n${g.statement}` : g.statement);
  s.verify("gaps computed only from live postings with stated ranges; profile skills excluded", { basis: g.basis, top: g.gaps.slice(0, 3) });
  await s.finish({ status: "COMPLETE", outcome: "Skill gaps vs higher-paying live roles named with a learn-next order, grounded in feed data" }); })();
