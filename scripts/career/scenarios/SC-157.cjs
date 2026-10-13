"use strict"; const { G, H, NOW, graph } = require("./w08-common.cjs");
(async () => { const s = H.session("SC-157", "keep-warm-six-weeks");
  s.user("Keep-warm: six weeks since a good chat — an update touch suggested with a real reason");
  const g = graph(); G.recordInteraction(g, "Daniel Warm (TEST)", { kind: "coffee_chat", at: "2026-09-01T12:00:00Z", summary: "Good chat: Datadog infra" });
  const sug = G.keepWarmSuggestions(g, { now: NOW }); s.tool("135.keepWarmSuggestions", sug);
  s.agent(`One keep-warm suggestion: ${sug[0].name} at ${sug[0].company} — ${sug[0].reason} Suggested, not sent; the draft comes with your update (SC-158 pattern).`);
  s.verify("suggestion fired only because days_since >= 42 and stage was warm-track (chatted)", { days_since: sug[0] && sug[0].days_since, count: sug.length });
  await s.finish({ status: "COMPLETE", outcome: "Keep-warm suggestion raised for Daniel at 42 days with the real reason stated; nothing auto-sent" }); })();
