"use strict";
const L = require("./_w02-lib.cjs");
L.listScenario("SC-023", "finance-club-alumni-at-banks",
  "Find 80 people from my school's finance club now working at banks",
  { tag: "023", count: 80, firms: ["Goldman Sachs", "Morgan Stanley", "JPMorgan", "Citi", "Evercore", "Lazard", "Piper Sandler", "William Blair", "Baird", "Stifel", "Jefferies", "Houlihan Lokey"], title: "Analyst", seniority: "analyst", relationship: "same school finance club alum" },
  (l) => [l.every((c) => (c.schools || []).includes("TEST University")), l.every((c) => /finance club/.test(c.relationship_to_user))],
  (p) => `Found 80 TEST University finance-club alumni now at banks (TEST fixture pool): ${p.selected.length} selected, ${p.reserve.length} reserve.`);
