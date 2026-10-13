"use strict";
// Shared setup for W08 runners (SC-141..160). TEST data only; fixed clock = 126's SEED_NOW.
const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "..");
const G = require(path.join(ROOT, "packages/domain/135-career-graph.js"));
const S = require(path.join(ROOT, "packages/domain/136-career-season.js"));
const T = require(path.join(ROOT, "packages/domain/126-career-track.js"));
const O = require(path.join(ROOT, "packages/domain/124-career-outreach.js"));
const P = require(path.join(ROOT, "packages/domain/122-career-profile.js"));
const H = require(path.join(ROOT, "scripts/career/scenario-harness.cjs"));
const FX = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/test-graph-sources.json"), "utf8"));
const persona = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/test-persona.json"), "utf8"));
const NOW = Date.parse("2026-10-13T12:00:00Z");
function graph() { const g = G.createGraph(FX.user); G.importRecords(g, FX.linkedin_export, "linkedin-export"); return g; }
function graphAll() { const g = graph(); G.importRecords(g, FX.alumni_directory, "alumni-directory"); G.importRecords(g, FX.club_roster, "club-roster"); G.importRecords(g, FX.public_records, "public"); G.importRecords(g, FX.pasted_contacts, "pasted-contacts"); return g; }
function profile() { return P.profileFromData(persona); }
module.exports = { G, S, T, O, P, H, FX, NOW, graph, graphAll, profile, ROOT };
