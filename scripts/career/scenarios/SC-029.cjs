"use strict";
const L = require("./_w02-lib.cjs");
const firms = Array.from({ length: 20 }, (_, i) => `${i % 2 ? "Insurtech" : "Fintech"} Co ${i + 1} (TEST)`);
L.listScenario("SC-029", "ux-researchers-fintech-insurtech",
  "Find 65 UX researchers across fintech and insurtech",
  { tag: "029", count: 65, firms, title: "UX Researcher", extra: (i) => ({ industry: i % 2 ? "insurtech" : "fintech" }) },
  (l) => [l.every((c) => c.title === "UX Researcher"), l.some((c) => c.industry === "fintech") && l.some((c) => c.industry === "insurtech")],
  (p) => `Found 65 UX researchers across fintech and insurtech (TEST fixture pool): ${p.selected.length} selected, ${p.reserve.length} reserve.`);
