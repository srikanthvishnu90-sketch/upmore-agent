"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-103", "ats-parser-mangled-dates");
  s.user("ATS parser mangled my dates — re-enter my fields manually");
  const persona = L.persona("test-persona.json");
  const truth = { "experience.0.start": "2025-06", "experience.0.end": "2025-08", "education.0.end": "2028-05" };
  const portalFields = [
    { field: "experience.0.start", value: "2025-13" },
    { field: "experience.0.end", value: "2025-08" },
    { field: "education.0.end", value: "2028-06" },
  ];
  const anomalies = A3.detectDateAnomalies(portalFields, truth);
  s.tool("132.detectDateAnomalies (portal view vs profile truth)", { portalFields, truth, anomalies });
  s.agent(`The portal's parser mangled 2 of your 3 dates. Caught and corrected from your profile facts (the source of truth): ${anomalies.map((a) => `${a.field}: portal showed ${a.portal_value} → re-entered as ${a.corrected_value} (${a.issues.join("; ")})`).join(" | ")}. The clean field (experience end 2025-08) was left untouched. A permanent replay test for this exact mangle — swapped month 13 and a drifted graduation date — is in tests/career-apply3.test.cjs and passes.`, { card: { title: "Date repair — re-entry payload", corrections: anomalies } });
  s.verify("anomalies computed by 132 against the persona's real fact dates (F-002 Jun–Aug 2025; F-001 graduating May 2028)", { anomalies_found: anomalies.length, corrected: anomalies.map((a) => a.corrected_value) });
  await s.finish({ status: anomalies.length === 2 ? "COMPLETE" : "LEARN", outcome: "2 mangled portal dates detected (impossible month 13 from a day/month swap; graduation drifted a month) and corrected from profile facts; replay test written and green" });
})().catch((e) => { console.error(e); process.exit(1); });
