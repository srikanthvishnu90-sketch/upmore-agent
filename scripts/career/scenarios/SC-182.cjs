"use strict"; const { H, N, cir } = require("./f10-lib.cjs");
(async () => { const s = H.session("SC-182", "comp-benchmark");
  s.user("what's this role worth?");
  const b = N.benchmark(cir("airbnb"), { role: "Software Engineer, New Grad" }); s.tool("128.benchmark(airbnb CIR)", b);
  s.agent(`From Airbnb's CIR comp notes only — every figure sourced and dated:\n${b.figures.map((f) => `• $${f.low.toLocaleString()}–$${f.high.toLocaleString()} — ${f.figure_text} [${f.source_type}, as of ${f.as_of}: ${f.source_url}]`).join("\n")}\nAnecdotal sources would be labeled as such; none of these are anecdotal. ${b.disclaimer}`);
  const none = N.benchmark(cir("bain")); s.tool("128.benchmark(bain CIR — no published figure)", none);
  s.agent(`For contrast: Bain's CIR publishes no Associate Consultant figure, so for Bain I claim no number at all: "${none.statement}"`);
  s.verify("benchmark figures all carry source_url+source_type+as_of; no-figure CIR returns zero figures", { figures: b.figures.length, bain_figures: none.figures.length });
  await s.finish({ status: "COMPLETE", outcome: "Benchmark composed solely from CIR comp notes with labeled sources; no-figure company honestly returns no number" }); })();
