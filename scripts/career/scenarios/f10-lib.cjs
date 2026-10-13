"use strict";
// Shared loader for F10 scenario runners: real domain modules + real CIR JSON + TEST fixtures.
const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "..");
const H = require(path.join(ROOT, "scripts/career/scenario-harness.cjs"));
const N = require(path.join(ROOT, "packages/domain/128-career-negotiation.js"));
const OS = require(path.join(ROOT, "packages/domain/129-career-os.js"));
const J = require(path.join(ROOT, "packages/domain/121-career-jobs.js"));
const cir = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, `packages/career-data/cirs/${id}.json`), "utf8"));
const allCirs = () => fs.readdirSync(path.join(ROOT, "packages/career-data/cirs")).filter((f) => f.endsWith(".json")).map((f) => cir(f.replace(/\.json$/, "")));
const fixture = (name) => fs.readFileSync(path.join(ROOT, `packages/career-data/fixtures/${name}`), "utf8");
const persona = () => JSON.parse(fixture("test-persona.json"));
const NOW = "2026-10-12T12:00:00Z";
async function livePostings(tokens) {
  // Live public ATS feeds via 121 (no login). Returns { postings, feeds } — callers record feed status verbatim.
  const feeds = tokens.map((t) => J.feeds.greenhouse(t));
  const out = { postings: [], feeds: [] };
  for (const f of feeds) { const r = await J.fetchFeed(f, { fetch }); out.feeds.push({ source: r.source, company: r.company_token, status: r.status, count: r.postings.length, error: r.error || null }); out.postings.push(...r.postings); }
  out.postings = J.dedupe(out.postings); return out;
}
module.exports = { H, N, OS, J, cir, allCirs, fixture, persona, NOW, livePostings, ROOT };
