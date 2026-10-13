"use strict";
// Shared live-feed plumbing for the F02 Discover scenario runners.
// Every runner drives the REAL 121 module against the REAL public ATS feeds
// (the same 18 candidate boards as scripts/career/proof-jobs.mjs). No mocks.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..", "..");
const J = require(path.join(ROOT, "packages/domain/121-career-jobs.js"));
const D = require(path.join(ROOT, "packages/domain/131-career-discover.js"));
const H = require("../scenario-harness.cjs");
const T = require(path.join(ROOT, "packages/domain/123-career-tailor.js"));
const P = require(path.join(ROOT, "packages/domain/122-career-profile.js"));
const A3 = require(path.join(ROOT, "packages/domain/132-career-apply3.js"));
function personaProfile(file) { return P.profileFromData(persona(file)); }
function cir(slug) { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/cirs", slug + ".json"), "utf8")); } catch (e) { return null; } }
function cirForTailor(slug) { const c = cir(slug); if (!c) return null; const facts = []; for (const sec of ["path_patterns", "skills_dist", "major_dist"]) for (const e of (c[sec] && c[sec].facts) || []) facts.push({ text: e.claim }); if (c.thesis_text) facts.push({ text: String(c.thesis_text).split("\n")[0] }); return { company: c.company_name, facts }; }

const CANDIDATES = [
  J.feeds.greenhouse("stripe"), J.feeds.greenhouse("robinhood"), J.feeds.greenhouse("airbnb"),
  J.feeds.greenhouse("datadog"), J.feeds.greenhouse("coinbase"), J.feeds.greenhouse("figma"),
  J.feeds.greenhouse("janestreet"), J.feeds.greenhouse("goldmansachs"),
  J.feeds.lever("leverdemo"), J.feeds.lever("netflix"), J.feeds.lever("ramp"),
  J.feeds.ashby("ashby"), J.feeds.ashby("ramp"), J.feeds.ashby("openai"), J.feeds.ashby("linear"),
  J.feeds.smartrecruiters("Square"), J.feeds.smartrecruiters("BoschGroup"), J.feeds.smartrecruiters("Visa"),
];
function memStore() { const kv = new Map(); return { get: (k) => kv.get(k) || null, set: (k, v) => kv.set(k, v) }; }
function persona(file) { return JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures", file), "utf8")); }
function profile(file) { return J.profileFromPersona(persona(file)); }
async function pollLive(store, feeds) { return J.poll(feeds || CANDIDATES, { store: store || memStore() }); }
function feedSummary(result) {
  return result.feeds.map((f) => ({ feed: `${f.source}/${f.company_token}`, http: f.status, postings: f.postings.length, error: f.error || null }));
}
function feedTotals(result) {
  const raw = result.feeds.reduce((n, f) => n + f.postings.length, 0);
  return { feeds_tried: result.feeds.length, feeds_200: result.feeds.filter((f) => f.status === 200).length, raw, deduped: result.postings.length, dupes_removed: raw - result.postings.length };
}
const slim = (p) => ({ company: p.company, title: p.title, family: p.role_family, band: p.seniority_band, location: p.location, source: p.source, posted_at: p.posted_at, url: p.url });
function scoreAll(postings, prof) { return postings.map((p) => Object.assign(J.scoreFit(p, prof), { posting: p })); }
module.exports = { ROOT, J, D, H, T, P, A3, personaProfile, cir, cirForTailor, CANDIDATES, memStore, persona, profile, pollLive, feedSummary, feedTotals, slim, scoreAll };
