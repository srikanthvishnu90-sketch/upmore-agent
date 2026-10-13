"use strict";
// Shared loader for F03 scenario runners: REAL modules + canonical persona.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..", "..");
const Profile = require(path.join(ROOT, "packages/domain/122-career-profile.js"));
const Tailor = require(path.join(ROOT, "packages/domain/123-career-tailor.js"));
const Jobs = require(path.join(ROOT, "packages/domain/121-career-jobs.js"));
const Apply = require(path.join(ROOT, "packages/domain/132-career-apply.js"));
const H = require(path.join(ROOT, "scripts/career/scenario-harness.cjs"));
const FIX = path.join(ROOT, "packages/career-data/fixtures");
const persona = () => Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(FIX, "test-persona.json"), "utf8")));
const personaRaw = () => JSON.parse(fs.readFileSync(path.join(FIX, "test-persona.json"), "utf8"));
const intlPersona = () => Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(FIX, "persona-international-swe.json"), "utf8")));
const scoringProfile = () => Jobs.profileFromPersona(personaRaw());
// A CIR-shaped input whose company fact is a verbatim sentence from the
// company's OWN live posting (fetched via 121) — labeled with its source URL.
// Used because packages/career-data/cirs/ has no Stripe/Ramp/Figma record
// (see BUG-002); the fact is never invented.
function cirFromPosting(company, posting) {
  const first = String(posting.jd_text || "").split(/(?<=[.!])\s+/).find((x) => x.toLowerCase().includes(company.toLowerCase().split(" ")[0]) && x.length > 40) || String(posting.jd_text || "").slice(0, 200);
  return { company, facts: [{ text: first.trim(), source: posting.url, sourceType: "company's own live posting via 121 feed" }], sourceUrl: posting.url };
}
async function feed(source, token) { const r = await Jobs.fetchFeed(Jobs.feeds[source](token), {}); if (r.status !== 200) throw new Error(`feed ${source}/${token} HTTP ${r.status}`); return r.postings; }
module.exports = { fs, path, ROOT, Profile, Tailor, Jobs, Apply, H, persona, personaRaw, intlPersona, scoringProfile, cirFromPosting, feed };
