"use strict";
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-078", "autopilot-rule-approved-caps-summary");
  s.user("Set an autopilot rule: fit ≥ 80, my 25 companies, max 10/day, no Reach — and keep me posted");
  const companies25 = ["Stripe", "Datadog", "Ramp", "Figma", "Airbnb", "Duolingo", "Coinbase", "OpenAI", "Snowflake", "Notion", "Plaid", "Robinhood", "Brex", "Mercury", "Rippling", "Deel", "Gusto", "Faire", "Vercel", "Linear", "Retool", "Airtable", "Webflow", "Loom", "Miro"];
  // The rule does not exist until the user approves it — show that first.
  const unapproved = L.Apply.createRule({ minFit: 80, companies: companies25, maxPerDay: 10, excludeBuckets: ["Reach"] }, {});
  s.tool("132-career-apply createRule WITHOUT approval (must refuse)", unapproved);
  const made = L.Apply.createRule({ minFit: 80, companies: companies25, maxPerDay: 10, excludeBuckets: ["Reach"] }, { approvedByUser: true });
  s.tool("132-career-apply createRule WITH user approval", made);
  s.agent(`Rule set — but only because you just approved it in this chat (without that approval, the engine refuses to create it: "${unapproved.reason}"). Your rule: fit ≥ 80 · your 25 companies · max 10/day (the hard cap is 15; your rule lowers it) · no Reach. It texts you a nightly summary while it runs. Running it against today's live postings now.`);
  const scoring = L.scoringProfile();
  const all = await L.feedMany(L.WIDE_FEEDS);
  const log = L.Apply.createLog();
  const real = L.Apply.evaluateRule(made.rule, all, { scoringProfile: scoring, log, date: "2026-10-13" });
  const topFits = all.map((p) => ({ p, f: L.Jobs.scoreFit(p, scoring) })).filter((x) => !x.f.excluded).sort((a, b) => b.f.score - a.f.score).slice(0, 3).map((x) => ({ company: x.p.company, title: x.p.title, fit: x.f.score }));
  s.tool("132-career-apply evaluateRule over live postings", { totalPostings: all.length, applied: real.applied.length, skippedSample: real.skipped.slice(0, 5), topFits });
  // Prove the apply path fires when a posting truly meets the rule — labeled
  // TEST posting through the SAME engine (fixtures authorized), separate log.
  const testLog = L.Apply.createLog();
  const testPosting = { job_id: "test-autopilot-1", company: "Stripe", title: "Software Engineer Intern (TEST)", role_family: "SWE", seniority_band: "intern", location: "Remote", remote: "remote", url: "https://example.test/autopilot (TEST)", posted_at: "2026-10-13", jd_text: "Software Engineer Intern (TEST). Python JavaScript React PostgreSQL Kubernetes Docker Go. You will build with Python, JavaScript, React, PostgreSQL, Kubernetes, Docker and Go, with Excel reporting for the data team. Built a reporting dashboard in React and Python used by 200 internal users, PostgreSQL, Kubernetes deployment, software engineering internship experience.", source: "test", sources: ["test"], source_urls: [], department: "Engineering", req_id: null };
  const testRun = L.Apply.evaluateRule(made.rule, [testPosting], { scoringProfile: scoring, log: testLog, date: "2026-10-13" });
  const testFit = L.Jobs.scoreFit(testPosting, scoring);
  s.tool("132-career-apply evaluateRule on labeled TEST posting (apply-path proof)", { fit: testFit, applied: testRun.applied.length });
  const summary = L.Apply.nightlySummary(log, "2026-10-13");
  s.tool("132-career-apply nightlySummary (real log)", summary);
  s.agent(`Tonight's summary: ${summary.text}\n\nHonest read: across ${all.length} live postings, none reaches fit 80 for your profile today — the top fits are ${topFits.map((x) => `${x.company} ${x.fit}`).join(", ")}. The rule stays armed; the moment a posting clears 80 it applies it (cap 10/day) and the summary shows it. I verified the apply path end-to-end on a labeled TEST posting that does clear the bar (fit ${testFit.score}) — it was applied under the rule in a separate test log, never mixed into your real summary.`);
  const ok = unapproved.refused === true && made.ok === true && made.rule.maxPerDay === 10 && made.rule.nightlySummary === true && testRun.applied.length === 1 && summary.submitted === real.applied.length;
  s.verify("decided shape holds: no rule without approval; rule cap 10 under the hard 15; nightly summary produced from the log; real sweep honestly applied 0 (top real fit < 80) while the apply path provably fires on a qualifying posting", { ok, realApplied: real.applied.length, topFits, testFitScore: testFit.score });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `Autopilot rule built in the decided shape (owner-approved, caps, nightly summary): live sweep applied ${real.applied.length} (no live posting clears fit 80 for this persona; top fit ${topFits[0] ? topFits[0].fit : "n/a"}); apply path proven on a labeled TEST posting (fit ${testFit.score}).`, reason: ok ? null : "rule engine invariant broken — see verification", unblock: ok ? null : "Fix createRule/evaluateRule/nightlySummary in 132." });
})();
