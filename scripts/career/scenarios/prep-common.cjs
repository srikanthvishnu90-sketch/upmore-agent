"use strict";
const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "..");
const H = require("../scenario-harness.cjs");
const P = require(path.join(ROOT, "packages/domain/127-career-prep.js"));
const cirById = (id) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/cirs", id + ".json"), "utf8")); } catch { return null; } };
const persona = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/test-persona.json"), "utf8"));
function briefText(b) {
  if (b.status === "NO_CIR") return `Straight answer: I don't have a merged company intelligence record for ${b.company}, so I won't invent its process, bar or comp.\n\nWhat I CAN ground in: ${b.emphasis.length ? b.emphasis.map((e) => e.point).join("; ") : "nothing yet — no JD text supplied either"}.\n\nGaps: ${b.gaps.join(" ")}`;
  return `${b.company} — ${b.role || "role"} brief (grounded in its CIR, as of ${b.sources[0].as_of}):\n\nTHE BAR: ${b.bar}\n\nPROCESS STAGES:\n${b.stages.map((x, i) => `${i + 1}. ${x.name}${x.source && x.source.source_type ? ` [source: ${x.source.source_type}]` : ""}`).join("\n")}\n\nWHAT TO EMPHASIZE:\n${b.emphasis.map((e) => `- ${e.point}`).join("\n")}${b.redFlags && b.redFlags.length ? `\n\nRED FLAGS FROM THE CIR: ${b.redFlags.join(" | ")}` : ""}`;
}
module.exports = { H, P, cirById, persona, briefText, ROOT };
