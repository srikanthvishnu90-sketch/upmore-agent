"use strict";
// MI-095 (Crew B, W-WATCH): 151's watch gate established occupation identity
// from the title string alone. A convention-form title whose JD names the
// division/occupation — the witness is Lane A seed LA-0043: title
// "Summer Analyst", JD "Our investment banking division hosts this summer
// analyst program…" — matched no watched occupation ("Investment Banking
// Analyst", terms ["investment banking"]) and the reminder was gated at the
// 151 watch gate, even though the posting's role_family is Finance, its band
// is intern, and 152's own roleMatch already accepts exactly this JD-head
// evidence. The gate now establishes occupation identity from title + JD
// evidence, under the precision law that keeps Lane A's false-alert rate at
// 0: only a MULTIWORD occupation term, matched on word boundaries in the
// JD's opening (the same 500-char head 152 reads), counts as JD evidence —
// finance words merely co-occurring in the JD never match. Every match
// decision is auditable: the gate returns the basis/term/evidence and the
// alert record carries it.
// Check: node --test tests/career-watch-occupation-match.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const J = require(path.join(__dirname, "..", "packages/domain/121-career-jobs.js"));
const W = require(path.join(__dirname, "..", "packages/domain/151-career-alert-watch.js"));

const T0 = Date.parse("2026-10-14T12:00:00.000Z");
const LA0043_JD = "Our investment banking division hosts this summer analyst program. Work on live transactions and financial models.";

// The LA-0043 scenario posting, verbatim (Lane A corpus, RULING-2 correction).
const LA0043_POSTING = {
  job_id: "greenhouse:meridian-bank:S43-1142", company: "Meridian Bank",
  title: "Summer Analyst", role_family: "Finance", seniority_band: "intern",
  location: "New York, NY", remote: "onsite",
  url: "https://example.test/apply/c3be8b3d", posted_at: "2026-10-13T15:00:00.000Z",
  jd_text: LA0043_JD, source: "greenhouse",
};
// The harness's 151 profile bridge for LA-0043 (run.cjs profile151For): the
// scenario's scoring_profile plus alert_bands from the interest's bands and
// watched_occupations from the interest's role terms. The scenario's
// scoring_profile watches NO role families (role_families: []).
const LA0043_PROFILE = {
  skills: [{ name: "Excel", proven: true, fact_id: "TF-121" }],
  facts: [{ kind: "education", text: "B.S. Finance, graduating 2028 (in progress)", start: "2024-08", end: "2028-05" }],
  degree: "", level: "student", experience_years: 0,
  experience_text: "finance club excel financial modeling", residence: "",
  constraints: { work_authorization: "US citizen", needs_sponsorship: false, graduation_year: 2028, clearance: null, locations: [] },
  preferences: {
    role_families: [], locations: [], starred_companies: [], excluded_companies: [], remote_ok: true,
    alert_bands: ["intern"],
    watched_occupations: [{ occupation: "Investment Banking Analyst", terms: ["investment banking"] }],
  },
};
const gate43 = (posting) => W.gatePosting(posting, LA0043_PROFILE, J.scoreFit(posting, LA0043_PROFILE), []);

test("MI-095 witness LA-0043: JD naming the division establishes the watched occupation", () => {
  const g = gate43(LA0043_POSTING);
  assert.equal(g.pass, true, `the LA-0043 posting must pass the watch gate (got: ${g.reasons.join("; ")})`);
  assert.equal(g.occupation_match, "Investment Banking Analyst");
  assert.ok(g.occupation_match_detail, "the match decision must be auditable");
  assert.equal(g.occupation_match_detail.occupation, "Investment Banking Analyst");
  assert.equal(g.occupation_match_detail.basis, "jd_head");
  assert.equal(g.occupation_match_detail.term, "investment banking");
  assert.match(g.occupation_match_detail.evidence, /investment banking/i);
});

test("MI-095: a title that names the occupation still matches on the title basis", () => {
  const p = Object.assign({}, LA0043_POSTING, { title: "Investment Banking Analyst Intern", jd_text: "Work on live transactions and financial models." });
  const g = gate43(p);
  assert.equal(g.pass, true, `got: ${g.reasons.join("; ")}`);
  assert.equal(g.occupation_match_detail.basis, "title");
  assert.equal(g.occupation_match_detail.term, "investment banking");
});

test("MI-095 precision: finance words merely co-occurring in the JD do NOT match", () => {
  // "investment" and "banking" both appear, as does "financial models" — but
  // the occupation phrase itself is never named. Anything-goes matching
  // would alert here; the product's false-alert rate is 0 and stays 0.
  const p = Object.assign({}, LA0043_POSTING, {
    jd_text: "Support the team on investment analysis and financial models for banking clients. Prepare presentations and track markets.",
  });
  const g = gate43(p);
  assert.equal(g.pass, false, "co-occurring finance words must not establish the occupation");
  assert.equal(g.occupation_match, null);
  assert.ok(g.reasons.some((r) => /watched occupation/.test(r)), JSON.stringify(g.reasons));
});

test("MI-095 precision: the occupation phrase deep in the JD body does NOT match", () => {
  // Only the JD opening is identity evidence (the head 152 also reads). A
  // division named in boilerplate far down the posting — e.g. "you will
  // collaborate with our investment banking division" in a support role —
  // must not turn that posting into an IB posting.
  const filler = "General support work for the office team. ".repeat(20); // >500 chars of head
  const p = Object.assign({}, LA0043_POSTING, {
    title: "Office Support Analyst",
    jd_text: `${filler}You will collaborate with our investment banking division on events.`,
  });
  const g = gate43(p);
  assert.equal(g.pass, false, "a term beyond the JD head must not establish the occupation");
  assert.equal(g.occupation_match, null);
});

test("MI-095 precision: a single-word term in the JD does NOT match (multiword terms only)", () => {
  const trades = {
    preferences: {
      alert_bands: ["mid"],
      watched_occupations: [{ occupation: "Electricians", terms: ["electrician"] }],
    },
  };
  const p = {
    job_id: "x1", company: "BuildCo", title: "Maintenance Technician", role_family: "Other",
    seniority_band: "mid", location: "New York, NY", source: "greenhouse",
    jd_text: "Work alongside our electrician on commercial build-outs: conduit, panels, lighting.",
  };
  const g = W.gatePosting(p, trades, null, []);
  assert.equal(g.pass, false, "a single-word term appearing in the JD body is co-occurrence, not identity");
  assert.equal(g.occupation_match, null);
  // …while the same single-word term in the TITLE keeps matching (BUG-095's leg).
  const titled = Object.assign({}, p, { title: "Journeyman Electrician", jd_text: "Commercial build-outs." });
  const g2 = W.gatePosting(titled, trades, null, []);
  assert.equal(g2.pass, true, `got: ${g2.reasons.join("; ")}`);
  assert.equal(g2.occupation_match_detail.basis, "title");
});

test("MI-095 precision: a JD naming a DIFFERENT occupation does not match", () => {
  const p = Object.assign({}, LA0043_POSTING, {
    jd_text: "Our private equity division hosts this summer analyst program. Work on portfolio companies and financial models.",
  });
  const g = gate43(p);
  assert.equal(g.pass, false);
  assert.equal(g.occupation_match, null);
});

test("MI-095: the alert record carries why it matched (auditable end to end)", async () => {
  // Cycle-level plumbing on a posting 121 rebuilds identically on this
  // branch: the title names the occupation, so the basis is "title". (The
  // jd_head basis is pinned at gate level above; the LA-0043 cycle itself
  // additionally needs Crew A's 121 seasonal-analyst band, MI-094/BUG-229,
  // which is not on this branch — see the lane report.)
  const profile = JSON.parse(JSON.stringify(LA0043_PROFILE));
  profile.preferences.alert_bands = ["intern"];
  const boards = { name: "Meridian Bank", jobs: [] };
  const fetchImpl = async () => ({ status: 200, json: async () => boards });
  const feeds = [J.feeds.greenhouse("meridian-bank")];
  const store = W.createMemoryStore();
  const alerts = [];
  const sink = async (r) => { alerts.push(r); };
  const job = (id, title, jd) => ({
    id, title, location: { name: "New York, NY" },
    absolute_url: `https://example.test/apply/${id}`, first_published: new Date(T0).toISOString(),
    requisition_id: `REQ-${id}`, departments: [{ name: "Finance" }], content: jd,
  });
  boards.jobs = [job(1, "Office Coordinator", "General office support role.")];
  await W.runWatchCycle({ feeds, fetch: fetchImpl, profile, store, sink, now: T0 });
  boards.jobs = [boards.jobs[0], job(2, "Investment Banking Analyst Intern", "Work on live transactions.")];
  const r = await W.runWatchCycle({ feeds, fetch: fetchImpl, profile, store, sink, now: T0 + 60000 });
  assert.equal(r.alerts_emitted, 1, `expected exactly one alert (gated: ${JSON.stringify(r.gated)})`);
  assert.equal(alerts.length, 1);
  assert.ok(alerts[0].occupation_match, "the alert record must carry the match decision");
  assert.equal(alerts[0].occupation_match.occupation, "Investment Banking Analyst");
  assert.equal(alerts[0].occupation_match.basis, "title");
  assert.equal(alerts[0].occupation_match.term, "investment banking");
});
