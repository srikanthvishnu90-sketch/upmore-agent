// SC-W01 extension tests (career/sc-w01, 2026-10-13): user-specified warmth priority in 124.
// Extension flagged for integration: buildList opts.warmthPriority / profile.warmth_priority.
// Check: node --test tests/career-sc-w01.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const M = require(path.join(__dirname, "..", "packages/domain/124-career-outreach.js"));
const NOW = Date.parse("2026-10-12T15:00:00Z");
function cand(o) {
  return Object.assign({ person_id: "p1", full_name: "Pat Example", current_firm: "Evercore", title: "Analyst", seniority_band: "analyst",
    geography: "New York", office: "New York", country: "US", schools: [], work_email: "pat@evercore.com",
    email_confidence: 0.9, email_verification: "verified", last_verified_at: "2026-10-01T00:00:00Z",
    personalization_facts: [], relationship_to_user: "none" }, o || {});
}
const PROFILE = { school: "TEST University", hometown: "Chicago, IL" };
const hometown = () => cand({ person_id: "ph", full_name: "Home Town", relationship_to_user: "same hometown", hometown: "Chicago, IL", geography: "Chicago", office: "Chicago" });
const school = () => cand({ person_id: "ps", full_name: "School Mate", relationship_to_user: "same school", schools: ["TEST University"] });

test("W01-EXT default (no warmth priority): same-school warmth stays above hometown, as shipped", () => {
  const hs = M.scoreCandidate(hometown(), {}, PROFILE, NOW), ss = M.scoreCandidate(school(), {}, PROFILE, NOW);
  assert.equal(hs.warmth, 0.5); assert.equal(ss.warmth, 0.7);
});

test("W01-EXT warmth_priority ['hometown','school']: hometown outranks school in score + buildList order", () => {
  const q = { count: 2, firms: ["Evercore"], warmth_priority: ["hometown", "school"] };
  const hs = M.scoreCandidate(hometown(), q, PROFILE, NOW), ss = M.scoreCandidate(school(), q, PROFILE, NOW);
  assert.ok(hs.warmth > ss.warmth, `${hs.warmth} > ${ss.warmth}`);
  const pool = M.buildList([school(), hometown()], { count: 2, firms: ["Evercore"] }, { profile: PROFILE, userId: "u1", nowMs: NOW, warmthPriority: ["hometown", "school"] });
  assert.equal(pool.selected[0].person_id, "ph");
});

test("W01-EXT rankContacts honors profile.warmth_priority (hometown first)", () => {
  const rows = M.rankContacts([school(), hometown()], Object.assign({}, PROFILE, { warmth_priority: ["hometown", "school"] }));
  assert.equal(rows[0].contact.person_id, "ph");
  const def = M.rankContacts([school(), hometown()], PROFILE);
  assert.equal(def[0].contact.person_id, "ps");
});
