"use strict";
const L = require("./_w02-lib.cjs");
L.listScenario("SC-021", "google-startup-interns-first",
  "Find 55 people at Google who interned at startups first",
  { tag: "021", count: 55, firms: ["Google"], title: "Software Engineer", extra: () => ({ prior_firms: ["Seedling Labs (TEST startup)"] }) },
  (l) => [l.every((c) => c.current_firm === "Google"), l.every((c) => (c.prior_firms || []).join(" ").includes("startup"))],
  (p) => `Found 55 people at Google who interned at startups first (TEST fixture pool): ${p.selected.length} sendable now, ${p.reserve.length} held in reserve by the 15-per-firm-per-30-days send cap — the full 55-person list exists in the rail.`);
