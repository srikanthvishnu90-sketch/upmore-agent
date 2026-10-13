"use strict";
const L = require("./_w02-lib.cjs");
const firms = Array.from({ length: 20 }, (_, i) => `Chicago Seed Startup ${i + 1} (TEST)`);
L.listScenario("SC-024", "chicago-seed-founders-hiring-engineers",
  "Find 45 seed-stage founders in Chicago hiring engineers",
  { tag: "024", count: 45, firms, title: "Founder", geography: "Chicago", extra: () => ({ hiring_engineers: true, stage: "seed" }) },
  (l) => [l.every((c) => c.title === "Founder" && c.geography === "Chicago"), l.every((c) => c.hiring_engineers === true && c.stage === "seed")],
  (p) => `Found 45 seed-stage founders in Chicago who are hiring engineers (TEST fixture pool): ${p.selected.length} selected, ${p.reserve.length} reserve.`);
