"use strict";
const L = require("./_w02-lib.cjs");
L.listScenario("SC-027", "bain-capital-kkr-associates-alumni-directory",
  "Find 110 associates at Bain Capital / KKR from my school's alumni directory",
  { tag: "027", count: 110, firms: ["Bain Capital", "KKR"], title: "Associate", seniority: "associate", source: "TEST school alumni directory" },
  (l) => [l.every((c) => ["Bain Capital", "KKR"].includes(c.current_firm)), l.every((c) => c.seniority_band === "associate"), l.every((c) => (c.source_list || []).join(" ").includes("alumni directory"))],
  (p) => `Found 110 associates at Bain Capital / KKR from the school alumni directory (TEST fixture pool): ${p.selected.length} sendable now (15-per-firm cap), ${p.reserve.length} in reserve — the full 110-person list exists in the rail.`);
