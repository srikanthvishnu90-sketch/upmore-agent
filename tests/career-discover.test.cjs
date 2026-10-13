// F02 Discover extensions (131) + 121 regressions for BUG-002/BUG-003 found by SC-037/SC-034.
// Check: node --test tests/career-discover.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const J = require(path.join(__dirname, "..", "packages/domain/121-career-jobs.js"));
const D = require(path.join(__dirname, "..", "packages/domain/131-career-discover.js"));
const NOW = Date.parse("2026-10-12T12:00:00Z");

test("BUG-002 replay (SC-037): unproven skill never counts as a match or earns score", () => {
  const prof = { skills: [{ name: "Python", proven: true }, { name: "Rust", proven: false }], degree: "B.S. CS", level: "student", experience_years: 1, experience_text: "python dashboards", constraints: { work_authorization: "US citizen", locations: [] }, preferences: { role_families: ["SWE"], locations: [] } };
  const posting = { job_id: "x1", company: "Acme", title: "Software Engineering Intern", role_family: "SWE", seniority_band: "intern", location: "Remote", remote: "remote", url: "https://x/1", posted_at: "2026-10-10T00:00:00Z", jd_text: "Rust and Python internship.", source: "greenhouse", sources: ["greenhouse"], source_urls: ["https://x/1"], department: "Engineering", req_id: "1" };
  const r = J.scoreFit(posting, prof);
  assert.equal(r.excluded, false);
  assert.deepEqual(r.matched_skills, ["Python"]);
  assert.deepEqual(r.unproven_skills, ["Rust"]);
  assert.ok(r.gaps.some((g) => /not counted/.test(g) && /Rust/.test(g)), JSON.stringify(r.gaps));
  const provenOnly = J.scoreFit(Object.assign({}, posting, { jd_text: "Python internship." }), prof);
  assert.equal(r.score, provenOnly.score, "adding an unproven skill mention must not change the score");
});

test("BUG-003 replay (SC-034): canonical preferences.roles drive role_families for variant personas", () => {
  const nurse = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "packages/career-data/fixtures/persona-switcher-nurse.json"), "utf8"));
  const prof = J.profileFromPersona(nurse);
  assert.deepEqual(prof.preferences.role_families, ["Data/ML"], JSON.stringify(prof.preferences));
  const intl = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "packages/career-data/fixtures/persona-international-swe.json"), "utf8"));
  assert.deepEqual(J.profileFromPersona(intl).preferences.role_families, ["SWE"]);
  assert.equal(J.profileFromPersona(intl).constraints.needs_sponsorship, true);
  const canon = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "packages/career-data/fixtures/test-persona.json"), "utf8"));
  assert.deepEqual(J.profileFromPersona(canon).preferences.role_families.sort(), ["Finance", "SWE"]);
});

test("SC-027 ghostGuard: lower-odds postings are dropped with the plain-language reason kept", () => {
  const fresh = { job_id: "f1", company: "Acme", title: "SWE Intern", location: "New York, NY", remote: "onsite", posted_at: new Date(NOW - 2 * 86400000).toISOString(), jd_text: "Team: Core. Salary range $40/hr.", department: "Engineering" };
  const ghost = Object.assign({}, fresh, { job_id: "g1", title: "SWE Intern (repost)", posted_at: new Date(NOW - 94 * 86400000).toISOString(), jd_text: "A role.", department: "" });
  const scored = [{ posting: fresh, score: 50, excluded: false }, { posting: ghost, score: 80, excluded: false }];
  const { kept, dropped } = D.ghostGuard(scored, { now: NOW, repostCounts: { g1: 2 } });
  assert.equal(kept.length, 1); assert.equal(kept[0].posting.job_id, "f1");
  assert.equal(dropped.length, 1); assert.match(dropped[0].quality.summary, /open 94 days/); assert.match(dropped[0].quality.summary, /reposted 2 times/); assert.match(dropped[0].quality.summary, /lower odds$/);
});

test("SC-033 deadlineInfo: CIR closed window wins; age is only ever a labeled proxy", () => {
  const bcg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "packages/career-data/cirs/bcg.json"), "utf8"));
  const cirs = { "boston consulting group": bcg, "bcg": bcg };
  const info = D.deadlineInfo({ job_id: "b1", company: "BCG", posted_at: "2026-10-01T00:00:00Z" }, { now: NOW, cirs });
  assert.equal(info.signal, "closed_window"); assert.equal(info.recommend, false);
  const fresh = D.deadlineInfo({ job_id: "a1", company: "Acme", posted_at: new Date(NOW - 86400000).toISOString() }, { now: NOW, cirs: {} });
  assert.equal(fresh.signal, "fresh"); assert.match(fresh.detail, /least closing pressure/);
});

test("SC-038 companySize: known bands for starter companies, honest unknown otherwise", () => {
  assert.equal(D.companySize("Linear").band, "under_500");
  assert.equal(D.companySize("Stripe").band, "over_5000");
  const u = D.companySize("Some Obscure Co");
  assert.equal(u.known, false); assert.equal(u.band, "unknown");
  const split = D.sizeFilter([{ company: "Linear" }, { company: "Stripe" }, { company: "Obscure" }], {});
  assert.equal(split.under500.length, 1); assert.equal(split.notUnder.length, 1); assert.equal(split.unknown.length, 1);
});

test("SC-030 watch: added company polls at the starred cadence (15 min), others hourly", () => {
  const set0 = D.watchSet({ preferences: { starred_companies: ["Stripe", "Ramp"] } });
  assert.equal(D.cadenceFor("Stripe", set0), 15);
  assert.equal(D.cadenceFor("Coinbase", set0), 60);
  const set1 = D.addWatch(set0, "Ramp");
  assert.equal(D.cadenceFor("Ramp", set1), 15);
});

test("BUG-005 replay (SC-032): Greenhouse placeholder requisition_id must not collapse job_ids", () => {
  const gh = { name: "Stripe", jobs: [
    { id: 111, title: "Senior Brand Designer", location: { name: "US" }, absolute_url: "https://x/111", updated_at: "2026-10-10T00:00:00Z", requisition_id: "See Opening ID", departments: [{ name: "Design" }], content: "x" },
    { id: 222, title: "Software Engineering Intern", location: { name: "New York, NY" }, absolute_url: "https://x/222", updated_at: "2026-10-10T00:00:00Z", requisition_id: "See Opening ID", departments: [{ name: "Engineering" }], content: "y" },
    { id: 333, title: "Real Req Role", location: { name: "New York, NY" }, absolute_url: "https://x/333", updated_at: "2026-10-10T00:00:00Z", requisition_id: "REQ-9", departments: [{ name: "Engineering" }], content: "z" },
  ] };
  const ps = J.normalizeGreenhouse(gh, "stripe");
  assert.equal(new Set(ps.map((p) => p.job_id)).size, 3, JSON.stringify(ps.map((p) => p.job_id)));
  assert.equal(ps[2].job_id, "greenhouse:stripe:REQ-9", "a real requisition id still wins");
});
