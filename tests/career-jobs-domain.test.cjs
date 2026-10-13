// DISC-006 domain leg (SC-065, census class (c) MISSING/WEAK ENGINE, Lane A):
// discovery results must follow the ASK's role family/domain. Before this fix,
// 121's shortlist engine had no ask-family concept at all: buildShortlist ranked
// purely by fit score, so a PM ask over a pool whose best skill matches were SWE
// roles returned those SWE roles — the canned five-role list SC-065 was served.
// Contract proven here:
//   - a family ask returns ONLY that family's roles (never cross-domain padding)
//   - a family ask with no matching roles in the pool returns an honest empty
//     result carrying the true reason + exactly one next step
//   - an SWE ask still returns SWE roles (control)
//   - an ask with no family keeps the legacy unfiltered behavior
// Check: node --test tests/career-jobs-domain.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const J = require(path.join(__dirname, "..", "packages/domain/121-career-jobs.js"));

const PROFILE = {
  skills: [{ name: "Python", proven: true }, { name: "SQL", proven: true }],
  degree: "B.S. Computer Science", level: "student", experience_years: 1,
  experience_text: "built dashboards in Python and SQL",
  constraints: { work_authorization: "US citizen", needs_sponsorship: false, graduation_year: null, clearance: null, locations: [] },
  preferences: { role_families: [], locations: [], starred_companies: [] },
};

function posting(id, title, company, jd) {
  return {
    job_id: id, company, title,
    role_family: J.roleFamily(title, jd), seniority_band: J.seniorityBand(title, jd),
    location: "Chicago, IL", remote: "hybrid", url: `https://example.test/${id}`,
    posted_at: "2026-10-10T00:00:00.000Z", jd_text: jd, source: "test", sources: ["test"], source_urls: [],
    department: "", req_id: id,
  };
}
const SWE1 = posting("t-swe-1", "New Grad Software Engineer", "Acme Ledger", "Build services in Python and SQL.");
const SWE2 = posting("t-swe-2", "Software Engineering Intern — Summer 2027", "Acme Cloud", "Ship features in Python and SQL.");
const PM1 = posting("t-pm-1", "Product Manager Intern — Summer 2027", "Acme Product", "Roadmaps, user interviews and SQL dashboards.");
const DATA1 = posting("t-data-1", "Data Analyst Intern — Summer 2027", "Acme Analytics", "SQL dashboards and Python analysis for product teams.");
const MIXED = [SWE1, SWE2, PM1, DATA1];
const SWE_ONLY = [SWE1, SWE2];

const scored = (pool) => pool.map((p) => Object.assign(J.scoreFit(p, PROFILE), { posting: p }));
const familiesOf = (rows) => rows.map((r) => (r.posting || r).role_family);

test("ask families parse from the ask text (abbreviations included)", () => {
  assert.deepEqual(J.askRoleFamilies("Find 20 PM internships for summer; tailor; apply only where I have a real shot"), ["PM"]);
  assert.deepEqual(J.askRoleFamilies("find product manager internships"), ["PM"]);
  assert.deepEqual(J.askRoleFamilies("find software engineering internships for summer"), ["SWE"]);
  assert.deepEqual(J.askRoleFamilies("find SWE roles"), ["SWE"]);
  assert.deepEqual(J.askRoleFamilies("find data analyst roles"), ["Data/ML"]);
  assert.deepEqual(J.askRoleFamilies("find investment banking analyst roles"), ["Finance"]);
  assert.deepEqual(J.askRoleFamilies("find me roles for summer"), []);
  assert.deepEqual(J.askRoleFamilies(""), []);
});

test("PM/product ask returns PM roles only — zero SWE roles in output", async () => {
  const r = await J.shortlistForAsk(scored(MIXED), "Find 20 PM internships for summer", { limit: 5 });
  assert.equal(r.status, "ok");
  assert.deepEqual(r.requested_families, ["PM"]);
  assert.ok(r.shortlist.length >= 1, "PM role in the pool must be served");
  assert.ok(familiesOf(r.shortlist).every((f) => f === "PM"), JSON.stringify(familiesOf(r.shortlist)));
  assert.ok(!familiesOf(r.shortlist).includes("SWE"));
});

test("PM ask over an SWE-only pool: honest empty, true reason, one next step — never padded", async () => {
  const r = await J.shortlistForAsk(scored(SWE_ONLY), "Find 20 PM internships for summer", { limit: 5 });
  assert.equal(r.status, "no_matching_roles");
  assert.equal(r.shortlist.length, 0);
  assert.equal(r.matched_size, 0);
  assert.equal(r.pool_size, 2);
  assert.match(r.reason, /PM/);
  assert.match(r.reason, /2/); // the true pool size is the reason's fact
  assert.ok(typeof r.next_step === "string" && r.next_step.length > 10, "exactly one next step is carried");
  // buildShortlist with the same ask agrees: empty, with the filter metadata attached
  const raw = await J.buildShortlist(scored(SWE_ONLY), { limit: 5, askText: "Find 20 PM internships for summer" });
  assert.equal(raw.length, 0);
  assert.equal(raw.family_filter.matched_size, 0);
  assert.deepEqual(raw.family_filter.requested, ["PM"]);
});

test("data ask returns data roles only — no SWE padding", async () => {
  const r = await J.shortlistForAsk(scored(MIXED), "Find data analyst internships for summer", { limit: 5 });
  assert.equal(r.status, "ok");
  assert.deepEqual(r.requested_families, ["Data/ML"]);
  assert.ok(r.shortlist.length >= 1);
  assert.ok(familiesOf(r.shortlist).every((f) => f === "Data/ML"), JSON.stringify(familiesOf(r.shortlist)));
});

test("SWE ask still returns SWE roles (control case)", async () => {
  const r = await J.shortlistForAsk(scored(MIXED), "Find software engineering internships for summer", { limit: 5 });
  assert.equal(r.status, "ok");
  assert.deepEqual(r.requested_families, ["SWE"]);
  assert.ok(r.shortlist.length >= 1);
  assert.ok(familiesOf(r.shortlist).every((f) => f === "SWE"), JSON.stringify(familiesOf(r.shortlist)));
});

test("ask with no role family keeps legacy unfiltered behavior", async () => {
  const r = await J.shortlistForAsk(scored(MIXED), "Find me roles for summer", { limit: 5 });
  assert.equal(r.status, "no_family_in_ask");
  assert.ok(r.shortlist.length >= 1);
  const raw = await J.buildShortlist(scored(MIXED), { limit: 5 });
  assert.ok(raw.length >= 1);
  assert.equal(raw.family_filter, undefined);
});

test("scoreFit opt-in ask-family exclusion: cross-family posting is excluded with the reason, same-family is not", () => {
  const cross = J.scoreFit(SWE1, PROFILE, null, { askFamilies: ["PM"] });
  assert.equal(cross.excluded, true);
  assert.ok(cross.reasons.some((x) => /role family/i.test(x) && /PM/.test(x)), JSON.stringify(cross.reasons));
  const same = J.scoreFit(PM1, PROFILE, null, { askFamilies: ["PM"] });
  assert.equal(same.excluded, false, JSON.stringify(same.reasons));
  const legacy = J.scoreFit(SWE1, PROFILE); // no opts: unchanged behavior
  assert.equal(legacy.excluded, false, JSON.stringify(legacy.reasons));
});

// The SC-065 fixture pool itself (the exact corpus the gauntlet chat path
// serves): it contains ZERO PM postings, so the only honest PM answer from
// this pool is the empty result — and an SWE ask over the same pool must
// still serve SWE roles.
test("SC-065 regression on the real gauntlet corpus: PM ask -> honest zero; SWE ask -> SWE roles", async () => {
  const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "packages/career-data/fixtures/gauntlet/jobs/scored-corpus.json"), "utf8")).postings;
  const adapted = corpus.map((cp) => {
    const jd = `${cp.title} at ${cp.company}. Requirements: ${(cp.requirements || []).join("; ")}.`;
    return {
      job_id: cp.id, company: cp.company, title: cp.title,
      role_family: J.roleFamily(cp.title, jd), seniority_band: J.seniorityBand(cp.title, jd),
      location: cp.location || "", remote: /remote/i.test(cp.remote_terms || "") ? "remote" : /hybrid/i.test(cp.remote_terms || "") ? "hybrid" : "onsite",
      url: "", posted_at: null, jd_text: jd, source: "corpus", sources: ["corpus"], source_urls: [], department: "", req_id: cp.id,
    };
  });
  assert.equal(adapted.filter((p) => p.role_family === "PM").length, 0, "pool fact: the fixture corpus carries no PM postings");
  const pm = await J.shortlistForAsk(scored(adapted), "Find 20 PM internships for summer; tailor; apply only where I have a real shot", { limit: 20 });
  assert.equal(pm.status, "no_matching_roles");
  assert.equal(pm.shortlist.length, 0);
  assert.match(pm.reason, /PM/);
  const swe = await J.shortlistForAsk(scored(adapted), "Find software engineering internships for summer", { limit: 5 });
  assert.equal(swe.status, "ok");
  assert.ok(swe.shortlist.length >= 1);
  assert.ok(familiesOf(swe.shortlist).every((f) => f === "SWE"), JSON.stringify(familiesOf(swe.shortlist)));
});
