"use strict"; const { H, G, profile, T } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-169", "two-paths-one-company");
  await s.user("Two paths into one company — pick the stronger; don't burn both");
  const st = G.makeGraphStore();
  G.importGraph(st, [{ source: "linkedin_export", records: [
    T("Priya Nair", { current_firm: "Datadog", title: "Software Engineer", schools: ["TEST University"], clubs: ["TEST University Investing Club"], connection_degree: 1, work_email: "priya@example.test" }),
    T("Sam Ortiz", { current_firm: "Datadog", title: "Software Engineer", hometown: "Chicago, IL (TEST)", work_email: "sam@example.test" })] }]);
  const pick = G.pickStrongerPath(st, "Datadog", profile);
  await s.tool("135-career-graph.pickStrongerPath", pick);
  await s.agent(`One ask, through the stronger path only:\n\n✓ CHOSEN: ${pick.chosen.name} — warmth ${pick.chosen.score} (${pick.chosen.why.join(", ")})\n◌ HELD (not contacted): ${pick.held.map((h) => h.name + " — " + h.held_reason).join("; ")}\n\n${pick.rationale}\n\nIf Priya declines or goes quiet for two weeks, Sam's path is still unburned and we take it then.`);
  s.verify("pick state", { chosen: pick.chosen.name, held_count: pick.held.length, held_status: "not_contacted" });
  await s.finish({ status: "COMPLETE", outcome: "Stronger Datadog path chosen (Priya Nair, warmth 85: alumni+club+1st-degree) and the weaker path explicitly held un-contacted so both are never burned." });
})();
