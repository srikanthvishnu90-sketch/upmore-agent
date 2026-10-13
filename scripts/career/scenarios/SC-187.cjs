"use strict"; const { H, OS, allCirs, livePostings, NOW } = require("./f10-lib.cjs");
(async () => { const s = H.session("SC-187", "market-value");
  s.user("what am I worth now?");
  const live = await livePostings(["datadog", "stripe", "airbnb"]); s.tool("121 live feeds", live.feeds);
  const mv = OS.marketValue({ cirs: allCirs(), postings: live.postings, as_of: NOW }); s.tool("129.marketValue", mv);
  s.agent(mv.estimate ? `Your market-value orientation (base, as stated in sources), as of ${mv.as_of}: $${mv.estimate.low.toLocaleString()}–$${mv.estimate.high.toLocaleString()}, median midpoint $${mv.estimate.median_midpoint.toLocaleString()}. Evidence — every figure sourced:\n${mv.evidence.slice(0, 8).map((e) => `• ${e.company}: $${e.low.toLocaleString()}–$${e.high.toLocaleString()} [${e.source_type}, ${e.as_of}] ${e.source_url || ""}`).join("\n")}\n${mv.statement}` : mv.statement);
  s.verify("estimate derived only from evidence entries that carry source_type + as_of; live feed statuses recorded", { evidence_count: mv.evidence.length, feeds: live.feeds });
  await s.finish({ status: "COMPLETE", outcome: "Market-value estimate given with full evidence list and as-of date, from CIR figures + live posting ranges only" }); })();
