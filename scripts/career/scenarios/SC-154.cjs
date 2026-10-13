"use strict"; const { G, H, graph } = require("./w08-common.cjs");
(async () => { const s = H.session("SC-154", "second-degree-map");
  s.user("Second-degree map: friends of my first-degree people at the target");
  const m = G.secondDegreeMap(graph(), "Stripe"); s.tool("135.secondDegreeMap(Stripe)", m);
  s.agent(`Second-degree at Stripe: ${m.map((p) => p.path).join("; ")}. The intro runs through your first-degree connection — that's the ask to make.`);
  s.verify("map contains only degree-2 people, each with a named first-degree bridge", { count: m.length, bridges: m.map((p) => p.via) });
  await s.finish({ status: "COMPLETE", outcome: "Second-degree map for Stripe shows the full You → Maya → Sam path with the bridge named" }); })();
