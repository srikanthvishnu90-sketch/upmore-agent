"use strict";
// Shared setup for F04 Track scenario runners (SC-061..SC-080). TEST data only.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "..");
const T = require(path.join(ROOT, "packages/domain/126-career-track.js"));
const H = require(path.join(ROOT, "scripts/career/scenario-harness.cjs"));
const INBOX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/inbox-test.json"), "utf8")).messages;
const HRT = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/cirs/hudson-river-trading.json"), "utf8"));
const NOTION_CIR = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/cirs/notion.json"), "utf8"));
const NOW = T.SEED_NOW; // fixed clock: 2026-10-12T12:00:00Z — every day count below is deterministic
const msg = (id) => INBOX.find((m) => m.id === id);
module.exports = { T, H, INBOX, HRT, NOTION_CIR, NOW, msg, ROOT };
