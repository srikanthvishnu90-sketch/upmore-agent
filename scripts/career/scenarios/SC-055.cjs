"use strict";
const { H, M, NOW, PROFILE, poolOverFirms } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-055", "ai-ml-engineers-series-a-github");
  const q = M.parseTarget("Find 95 AI/ML engineers at Series A startups who publish on GitHub", PROFILE);
  const startups = Array.from({ length: 20 }, (_, k) => `TestML Startup ${k + 1} (TEST)`);
  const records = poolOverFirms(startups, 6, { per: (i) => ({ title: "AI/ML Engineer", startup_stage: "A", publishes_on_github: true, public_links: ["https://github.com/example-test-" + i + " (TEST)"], personalization_facts: [{ fact: "publishes ML tooling on GitHub (TEST fact)", source_url: "https://example.test/g" + i, strength: "medium" }] }) });
  const pool = M.buildList(records, q, { profile: PROFILE, nowMs: NOW });
  s.user("Find 95 AI/ML engineers at Series A startups who publish on GitHub");
  s.tool("124.parseTarget+buildList", { role_family: q.role_family, stage: q.background_filters.startup_stage, github_filter: q.background_filters.publishes_on_github, yield: pool.yield });
  s.agent(`Found ${pool.selected.length} AI/ML engineers at Series A startups who publish on GitHub. Sample: ${pool.selected.slice(0, 5).map((c) => `${c.full_name} — ${c.current_firm}`).join("; ")}.`);
  s.verify("selection read back: exactly 95, every person carries the GitHub-publishing trait and Series A stage in the sourced pool", { selected: pool.selected.length, github_ok: pool.selected.every((c) => c.publishes_on_github === true), stage_ok: pool.selected.every((c) => c.startup_stage === "A") });
  await s.finish({ status: "COMPLETE", outcome: `95 AI/ML engineers at Series A startups who publish on GitHub selected and verified from buildList state (parser now captures the Series A stage + GitHub filters)` });
})();
