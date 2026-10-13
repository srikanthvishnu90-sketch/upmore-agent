"use strict"; const { G, H, FX } = require("./w08-common.cjs");
(async () => { const s = H.session("SC-148", "alumni-directory-thin-linkedin");
  s.user("Alumni-directory path when my LinkedIn is thin (40 connections)");
  const g = G.createGraph(FX.user); // thin LinkedIn: only Daniel imported (stand-in for a 40-connection export with no Stripe rows)
  G.importRecords(g, FX.linkedin_export.filter((r) => r.company === "Datadog"), "linkedin-export");
  const before = G.rankPaths(g, "Stripe").length;
  const imp = G.importRecords(g, FX.alumni_directory, "alumni-directory"); const after = G.rankPaths(g, "Stripe");
  s.tool("135.importRecords(alumni-directory)", { imp, before, after });
  s.agent(`Your LinkedIn alone had no Stripe path. From the alumni directory: ${after.map((p) => `${p.name} (${p.shared_fact})`).join("; ")}.`);
  s.verify("alumni-directory import created the Stripe path that the thin LinkedIn export lacked", { paths_before: before, paths_after: after.length, source: after[0] && after[0].sources });
  await s.finish({ status: "COMPLETE", outcome: "With a thin LinkedIn, the alumni directory supplied the Stripe warm path (Maya, TEST University)" }); })();
