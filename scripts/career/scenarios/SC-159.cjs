"use strict"; const { G, H, graphAll } = require("./w08-common.cjs");
(async () => { const s = H.session("SC-159", "top-10-warm-path-sweep");
  s.user("Warm-path sweep across my top 10 target companies in one pass");
  const targets = ["Stripe", "Datadog", "Ramp", "Goldman Sachs", "Plaid", "Palantir", "Jane Street", "McKinsey", "Notion", "Airbnb"];
  const sw = G.topWarmPathSweep(graphAll(), targets); s.tool("135.topWarmPathSweep(top 10)", sw);
  s.agent(`One pass, 10 companies: ${sw.map((x) => `${x.company}: ${x.paths_found ? `best = ${x.best.name} (${x.best.warmth_tier})` : "no path yet"}`).join("; ")}.`);
  const withPaths = sw.filter((x) => x.paths_found > 0).length;
  s.verify("sweep returned one entry per target company; honest zero-path entries included, not hidden", { companies: sw.length, with_paths: withPaths, zero_path: sw.length - withPaths });
  await s.finish({ status: "COMPLETE", outcome: `Top-10 warm-path sweep in one pass: ${withPaths} companies with a ranked best path, ${sw.length - withPaths} honestly reported as no-path` }); })();
