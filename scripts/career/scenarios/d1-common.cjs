"use strict";
// Shared setup for Finisher D1 runners (SC-121..140, Track & Follow-Up). TEST data only; fixed clock = 126's SEED_NOW.
const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "..");
const T = require(path.join(ROOT, "packages/domain/126-career-track.js"));
const P = require(path.join(ROOT, "packages/domain/127-career-prep.js"));
const H = require(path.join(ROOT, "scripts/career/scenario-harness.cjs"));
const INBOX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/inbox-test.json"), "utf8")).messages;
const msg = (id) => INBOX.find((m) => m.id === id);
const cir = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/cirs", name), "utf8"));
const NOW = T.SEED_NOW;
module.exports = { T, P, H, INBOX, msg, cir, NOW, ROOT };
