"use strict";
const L = require("./_w02-lib.cjs");
const firms = Array.from({ length: 20 }, (_, i) => `Healthtech Co ${i + 1} (TEST)`);
L.listScenario("SC-026", "healthtech-swes-state-schools",
  "Find 90 SWEs at healthtech companies who went to state schools",
  { tag: "026", count: 90, firms, title: "Software Engineer", schools: ["University of Illinois (TEST state)", "University of Michigan (TEST state)", "Ohio State University (TEST state)", "University of Texas (TEST state)"] },
  (l) => [l.every((c) => c.title === "Software Engineer"), l.every((c) => /state/.test((c.schools || [])[0] || ""))],
  (p) => `Found 90 software engineers at healthtech companies who went to state schools (TEST fixture pool): ${p.selected.length} selected, ${p.reserve.length} reserve.`);
