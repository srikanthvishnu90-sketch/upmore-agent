// MI-028 PERMANENT GUARD (Crew B Cycle 2): a reminder must carry its TRUE
// fit basis. Error analysis on the full Lane A before-run (1,202 scenarios,
// 858 produced reminders) found only 50/858 reminders (5.8%) carried any fit
// line. Every one of the other 808 HAD a true, recorded basis — it died at
// three exact loss points:
//   L1 (152 matchInterest): roleMatch's term + jd_head evidence, locationOk's
//      via/want, and the watched band were computed as gates and discarded;
//      only the bare basis enum survived.
//   L2 (152 composeReminder): fit.lines came ONLY from proven-skill
//      derivation; verdict.match_basis was stored but never rendered.
//   L3 (151 runWatchCycle/composeAlert): the gate's occupation_match rode
//      the alert as data but never as a line; composeAlert's reason-based
//      lines (role family / starred) fire on neither for occupation-watching
//      profiles — 644 of the 808 profiles hold NO skills at all, so a
//      proven-skill line was structurally impossible for them.
// The fix: match-basis lines, labeled "match basis:", built only from basis
// the matcher actually verified (watched role term + title/jd_head evidence,
// watched location or accepted remote, watched band). Proven-skill lines
// keep their fact-cited form and their law: never invented, fact ID or none.
// This suite fails if any loss point reopens.
// Check: node --test tests/career-mi028-fit-basis.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const J = require(path.join(__dirname, "..", "packages/domain/121-career-jobs.js"));
const W = require(path.join(__dirname, "..", "packages/domain/151-career-alert-watch.js"));
const A = require(path.join(__dirname, "..", "packages/domain/152-career-assign.js"));

const NOW = Date.parse("2026-10-14T21:00:00.000Z");
const T0 = Date.parse("2026-10-14T12:00:00.000Z");

// A profile with NO proven skills at all (the modal Lane A shape). Persona is
// a student so 121's seniority hard filter does not (correctly) exclude the
// intern posting below — the subject here is fit lines, not exclusion.
const NO_SKILLS = {
  skills: [], facts: [{ kind: "education", text: "B.S. Computer Science + Finance, class of 2028" }],
  degree: "B.S. Computer Science + Finance, class of 2028", level: "student", experience_years: 0,
  experience_text: "summer analyst prep, financial modeling coursework",
  constraints: { work_authorization: "US citizen", needs_sponsorship: false, graduation_year: 2028, clearance: null, locations: ["Chicago"] },
  preferences: { role_families: [], locations: [], starred_companies: [] },
};

function ibWatchNoSkills(userId, bands) {
  return A.createWatchProfile(userId, {
    scoring_profile: NO_SKILLS,
    interests: [{
      interest_id: "int-ib",
      role: A.roleSpecFor({ soc: "13-2051", split: "Investment Banking Analyst" }),
      filters: { locations: ["Chicago"], remote_ok: true, bands: bands || [], firms_include: [], firms_exclude: [] },
    }],
  });
}

const posting = (over) => Object.assign({
  job_id: "greenhouse:testbank:1", company: "Test Bank", title: "Investment Banking Summer Analyst",
  role_family: "Finance", seniority_band: "intern", location: "Chicago, IL", remote: "onsite",
  url: "https://boards.greenhouse.io/testbank/jobs/1", posted_at: "2026-10-14T18:00:00.000Z",
  jd_text: "Investment banking summer analyst program in Chicago.",
  source: "greenhouse", req_id: "1",
}, over || {});

test("L1+L2: no-skills profile — reminder carries match-basis lines (role term, watched location, watched band), zero invented skill lines", async () => {
  const store = W.createMemoryStore();
  const res = await A.runAssignCycle({ postings: [posting()], watchProfile: ibWatchNoSkills("u-m1", ["intern"]), store, now: NOW });
  assert.equal(res.reminders.length, 1);
  const r = res.reminders[0];
  const lines = r.fit.lines;
  assert.ok(lines.length >= 3, `expected role+location+band match-basis lines, got ${JSON.stringify(lines)}`);
  assert.ok(lines.some((l) => /^match basis: watched role term "investment banking" matches this posting's title/.test(l)), lines.join(" | "));
  assert.ok(lines.some((l) => /^match basis: posting location "Chicago, IL" matches watched location "Chicago"/.test(l)), lines.join(" | "));
  assert.ok(lines.some((l) => /^match basis: seniority band "intern" is one this interest watches/.test(l)), lines.join(" | "));
  // and NOT a single proven-skill claim: the profile holds no skills.
  assert.ok(!lines.some((l) => /proven skill/.test(l)), lines.join(" | "));
  assert.deepEqual(r.fit.matched_fact_ids, []);
  assert.ok(r.match_detail && r.match_detail.term === "investment banking" && r.match_detail.location_want === "Chicago");
});

test("L1: band line appears ONLY when the interest actually watches bands", async () => {
  const store = W.createMemoryStore();
  const res = await A.runAssignCycle({ postings: [posting()], watchProfile: ibWatchNoSkills("u-m2", []), store, now: NOW });
  assert.equal(res.reminders.length, 1);
  const lines = res.reminders[0].fit.lines;
  assert.ok(lines.some((l) => /watched role term/.test(l)), lines.join(" | "));
  assert.ok(!lines.some((l) => /seniority band/.test(l)), `no band basis may be claimed for an interest with no band filter: ${lines.join(" | ")}`);
});

test("L1: jd_head match — the basis line QUOTES the posting's own opening text as evidence", async () => {
  const store = W.createMemoryStore();
  const jdHead = posting({
    job_id: "greenhouse:testbank:jd1", title: "Summer Analyst",
    jd_text: "Our investment banking division hosts this summer analyst program in Chicago. You will build models and support live deals.",
  });
  const res = await A.runAssignCycle({ postings: [jdHead], watchProfile: ibWatchNoSkills("u-m3", ["intern"]), store, now: NOW });
  assert.equal(res.reminders.length, 1, JSON.stringify(res.rejected));
  const lines = res.reminders[0].fit.lines;
  const roleLine = lines.find((l) => /watched role term/.test(l));
  assert.ok(roleLine, lines.join(" | "));
  assert.ok(/opening text/.test(roleLine), roleLine);
  assert.ok(roleLine.includes("investment banking division hosts this summer analyst"), `evidence must be the posting's own words: ${roleLine}`);
  assert.equal(res.reminders[0].match_basis, "jd_head");
});

test("L1: remote match basis is labeled remote, not dressed up as a location match", async () => {
  const store = W.createMemoryStore();
  const remote = posting({ job_id: "greenhouse:testbank:r1", location: "Remote - US", remote: "remote" });
  const res = await A.runAssignCycle({ postings: [remote], watchProfile: ibWatchNoSkills("u-m4", []), store, now: NOW });
  assert.equal(res.reminders.length, 1);
  const lines = res.reminders[0].fit.lines;
  assert.ok(lines.some((l) => /match basis: this posting is remote and this interest accepts remote/.test(l)), lines.join(" | "));
  assert.ok(!lines.some((l) => /matches watched location/.test(l)), lines.join(" | "));
});

test("L3 (alert-fed end to end): 151 alert carries the occupation match-basis line; 152 reminder inherits it and adds its own basis without duplicating the role line", async () => {
  const profile151 = {
    skills: [], degree: "B.S. Computer Science, class of 2029", level: "student", experience_years: 1,
    experience_text: "built payment services",
    constraints: { work_authorization: "US citizen", needs_sponsorship: false, graduation_year: 2029, clearance: null, locations: ["Chicago"] },
    preferences: { role_families: [], locations: ["Chicago"], starred_companies: [],
      watched_occupations: [{ occupation: "Software Engineering Intern / New-Grad", terms: ["software engineer"] }] },
  };
  const board = { name: "Acme Corp", jobs: [] };
  const fetchImpl = async () => ({ status: 200, ok: true, json: async () => board });
  const store = W.createMemoryStore();
  const sink = [];
  const feeds = [J.feeds.greenhouse("acme")];
  await W.runWatchCycle({ feeds, fetch: fetchImpl, profile: profile151, store, sink: (r) => sink.push(r), now: T0 });
  board.jobs = [{ id: 1, title: "Software Engineer Intern", location: { name: "Chicago, IL" },
    absolute_url: "https://boards.greenhouse.io/acme/jobs/1", first_published: new Date(T0 - 3600000).toISOString(),
    requisition_id: "REQ-1", departments: [{ name: "Engineering" }], content: "Join our platform team in Chicago." }];
  const after = await W.runWatchCycle({ feeds, fetch: fetchImpl, profile: profile151, store, sink: (r) => sink.push(r), now: T0 + 60000 });
  assert.equal(after.alerts.length, 1);
  const alert = after.alerts[0];
  assert.ok(alert.fit_lines.some((l) => /^match basis: watched occupation /.test(l) && l.includes('"software engineer"')),
    `alert fit_lines must carry the occupation match basis; got ${JSON.stringify(alert.fit_lines)}`);

  const wp = A.createWatchProfile("u-m5", {
    scoring_profile: profile151,
    interests: [{ interest_id: "int-1", role: A.roleSpecFor({ split: "Software Engineering Intern / New-Grad" }),
      filters: { locations: ["Chicago"], remote_ok: true, bands: ["intern"], firms_include: [], firms_exclude: [] } }],
  });
  const store2 = W.createMemoryStore();
  const res = await A.runAssignCycle({ alerts: [alert], watchProfile: wp, store: store2, now: T0 + 60000, presentJobIds: new Set([alert.job_id]) });
  assert.equal(res.reminders.length, 1);
  const lines = res.reminders[0].fit.lines;
  assert.ok(lines.length >= 2, lines.join(" | "));
  const roleLines = lines.filter((l) => /^match basis:/.test(l) && l.includes('"software engineer"'));
  assert.equal(roleLines.length, 1, `the same role basis must be stated once, not twice: ${lines.join(" | ")}`);
  assert.ok(lines.some((l) => /matches watched location "Chicago"/.test(l)), lines.join(" | "));
  assert.ok(lines.some((l) => /seniority band "intern"/.test(l)), lines.join(" | "));
  assert.ok(!lines.some((l) => /proven skill/.test(l)), lines.join(" | "));
});

test("truthfulness: a skills-holding profile whose skills do NOT match gets match-basis lines only — every proven-skill line cites a fact that exists", async () => {
  const store = W.createMemoryStore();
  const wp = A.createWatchProfile("u-m6", {
    scoring_profile: {
      skills: [{ name: "Rust", proven: true, fact_id: "F-099" }],
      degree: "B.S. Computer Science + Finance, class of 2028", level: "student", experience_years: 0,
      experience_text: "summer analyst prep",
      constraints: { work_authorization: "US citizen", needs_sponsorship: false, graduation_year: 2028, clearance: null, locations: ["Chicago"] },
      preferences: { role_families: ["Finance"], locations: ["Chicago"], starred_companies: [] },
    },
    interests: [{ interest_id: "int-ib", role: A.roleSpecFor({ soc: "13-2051", split: "Investment Banking Analyst" }),
      filters: { locations: ["Chicago"], remote_ok: true, bands: ["intern"], firms_include: [], firms_exclude: [] } }],
  });
  const res = await A.runAssignCycle({ postings: [posting()], watchProfile: wp, store, now: NOW });
  assert.equal(res.reminders.length, 1);
  const lines = res.reminders[0].fit.lines;
  assert.ok(lines.length >= 1 && lines.some((l) => /^match basis:/.test(l)), `match-basis lines must appear: ${lines.join(" | ")}`);
  assert.ok(!lines.some((l) => /proven skill/.test(l)), `no proven-skill line may be invented for a non-matching skill: ${lines.join(" | ")}`);
  assert.deepEqual(res.reminders[0].fit.matched_fact_ids, []);
  // and when a skill DOES match, its line still cites the real fact id, first.
  const jdExcel = posting({ job_id: "greenhouse:testbank:e1", jd_text: "Investment banking summer analyst program in Chicago. Financial modeling in Excel." });
  const wp2 = A.createWatchProfile("u-m7", {
    scoring_profile: {
      skills: [{ name: "Excel", proven: true, fact_id: "F-012" }],
      degree: "B.S. Computer Science + Finance, class of 2028", level: "student", experience_years: 0,
      experience_text: "financial modeling coursework, Excel",
      constraints: { work_authorization: "US citizen", needs_sponsorship: false, graduation_year: 2028, clearance: null, locations: ["Chicago"] },
      preferences: { role_families: ["Finance"], locations: ["Chicago"], starred_companies: [] },
    },
    interests: wp.interests,
  });
  const res2 = await A.runAssignCycle({ postings: [jdExcel], watchProfile: wp2, store, now: NOW });
  assert.equal(res2.reminders.length, 1);
  assert.ok(res2.reminders[0].fit.lines[0].includes("proven skill Excel (fact F-012)"), res2.reminders[0].fit.lines.join(" | "));
  assert.ok(res2.reminders[0].fit.lines.some((l) => /^match basis:/.test(l)), res2.reminders[0].fit.lines.join(" | "));
});

test("negative: no match -> no lines are minted (matchBasisLines of an unmatched verdict is empty)", async () => {
  const wp = ibWatchNoSkills("u-m8", ["intern"]);
  const verdict = A.matchInterest(posting({ title: "Boilermaker", jd_text: "Boilermaker work in Chicago." }), wp.interests[0], NO_SKILLS);
  assert.equal(verdict.matched, false);
  assert.equal(verdict.match_detail, null);
  assert.deepEqual(A.matchBasisLines(posting(), wp.interests[0], verdict), []);
});
