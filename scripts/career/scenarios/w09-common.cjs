"use strict";
const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "..");
const H = require("../scenario-harness.cjs");
const G = require(path.join(ROOT, "packages/domain/135-career-graph.js"));
const O = require(path.join(ROOT, "packages/domain/124-career-outreach.js"));
const P = require(path.join(ROOT, "packages/domain/127-career-prep.js"));
const Track = require(path.join(ROOT, "packages/domain/126-career-track.js"));
const persona = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/test-persona.json"), "utf8"));
const cirById = (id) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/cirs", id + ".json"), "utf8")); } catch { return null; } };
const cirForPrep = (id) => G.adaptCirForPrep(cirById(id));
// Canonical TEST profile built ONLY from the persona fixture (Alex Testcase, class of 2028).
const profile = { name: "Alex Testcase (TEST)", school: "TEST University", year: "junior", year_label: "'28",
  hometown: "Chicago, IL (TEST)", major: "Computer Science", clubs: ["TEST University Investing Club"], current_employer: "TEST Systems Inc" };
const user = { name: profile.name, school: profile.school, year: profile.year, year_label: profile.year_label, experience: "a SWE intern at TEST Systems Inc (TEST)" };
const T = (name, o) => Object.assign({ full_name: name + " (TEST)", label: "TEST" }, o || {});
module.exports = { H, G, O, P, Track, persona, profile, user, cirById, cirForPrep, T, ROOT };
