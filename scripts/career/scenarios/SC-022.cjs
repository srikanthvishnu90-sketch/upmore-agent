"use strict";
const L = require("./_w02-lib.cjs");
L.listScenario("SC-022", "restructuring-associates-hl-jefferies-rothschild",
  "Find 130 associates at Houlihan Lokey, Jefferies, Rothschild for restructuring chats",
  { tag: "022", count: 130, firms: ["Houlihan Lokey", "Jefferies", "Rothschild & Co"], title: "Associate", seniority: "associate", extra: () => ({ group: "Restructuring" }) },
  (l) => [l.every((c) => ["Houlihan Lokey", "Jefferies", "Rothschild & Co"].includes(c.current_firm)), l.every((c) => c.seniority_band === "associate"), l.every((c) => c.group === "Restructuring")],
  (p) => `Found 130 restructuring associates across Houlihan Lokey, Jefferies and Rothschild (TEST fixture pool): ${p.selected.length} selected, ${p.reserve.length} reserve.`);
