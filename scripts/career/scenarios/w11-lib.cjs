"use strict";
// Shared loader for W11 scenario runners (SC-201..220): vendored engines 127/128 + W11 ext 145,
// real CIR JSON from pivot/career (all 30), TEST fixtures. CIRs route through X.adaptCir (BUG-141).
const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "..");
const H = require(path.join(ROOT, "scripts/career/scenario-harness.cjs"));
const P = require(path.join(ROOT, "packages/domain/127-career-prep.js"));
const N = require(path.join(ROOT, "packages/domain/128-career-negotiation.js"));
const X = require(path.join(ROOT, "packages/domain/145-career-w11-ext.js"));
const rawCir = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, `packages/career-data/cirs/${id}.json`), "utf8"));
const cir = (id) => X.adaptCir(rawCir(id));
const fixture = (name) => fs.readFileSync(path.join(ROOT, `packages/career-data/fixtures/${name}`), "utf8");
const fixtureJson = (name) => JSON.parse(fixture(name));
const persona = () => fixtureJson("test-persona.json");
const NOW = "2026-10-12T12:00:00Z";
const F10 = "F10 sibling evidence (old numbering, branch career/sc-f10 @ 7ef703a): ~/workspace/your_files/upmore-career-family-f10-negotiation-os.md";
module.exports = { H, P, N, X, cir, rawCir, fixture, fixtureJson, persona, NOW, ROOT, F10 };
