"use strict";
const L = require("./_w02-lib.cjs");
L.listScenario("SC-030", "bulge-bracket-analysts-hired-last-2-years",
  "Find 210 analysts hired in the last 2 years at bulge brackets (fresh cohorts)",
  { tag: "030", count: 210, firms: ["Goldman Sachs", "Morgan Stanley", "JPMorgan", "Bank of America", "Citi", "Barclays", "Deutsche Bank", "UBS", "Credit Suisse"], title: "Analyst", seniority: "analyst", extra: (i) => ({ grad_year: i % 2 ? 2025 : 2024, hired_year: i % 2 ? 2025 : 2024 }) },
  (l) => [l.every((c) => c.seniority_band === "analyst"), l.every((c) => c.hired_year >= 2024)],
  (p) => `Found 210 bulge-bracket analysts hired in 2024-2025 (TEST fixture pool): ${p.selected.length} sendable now (15-per-firm cap across 9 firms), ${p.reserve.length} in reserve — the full 210-person list exists in the rail.`);
