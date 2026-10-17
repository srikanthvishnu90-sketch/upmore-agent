"use strict";
// BUG-260 / MI-029 (Depth Lane D, 2026-10-16): the 151 watch gate killed
// postings whose job text names the watched occupation — Lane A counted 18
// (class gated_at_151). Mechanism, proven from the code: the scale path polls
// the board directory LIST-FIRST (feedsFromDirectory drops ?content=true "at
// ~1/100th the payload"), so a Greenhouse posting reaches the gate with
// jd_text "" — MI-095's JD-head evidence leg reads an empty string and can
// never fire, and a convention-form title ("Summer Analyst") whose body names
// the division is gated out even though the employer's own text establishes
// the occupation. The gate was correct; its evidence never arrived.
// Fix (151 runWatchCycle): a gate evidence pass — a NEW posting that fails
// the gate on the family/occupation leg with no JD text triggers ONE
// full-text fetch of that board (121's own content feed, through the same
// deadline-bounded seam) and is re-gated on the enriched record. The same
// gate decides; nothing is manufactured. Fail-first: on the pre-fix code the
// IB posting below is gated and alerts_emitted is 0.
// Check: node --test tests/career-mi029-gate-evidence.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const J = require(path.join(__dirname, "..", "packages/domain/121-career-jobs.js"));
const W = require(path.join(__dirname, "..", "packages/domain/151-career-alert-watch.js"));

const T0 = Date.parse("2026-10-16T12:00:00.000Z");
const IB_JD = "Our investment banking division hosts this summer analyst program. Work on live transactions and financial models. Applications close March 1, 2027.";
const PE_JD = "Our private equity division hosts this summer analyst program. Work on portfolio companies and diligence.";
const GENERIC_JD = "Support the operations team on process documentation and reporting.";

const PROFILE = {
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

// One board, two payload shapes: the directory's list-first payload carries
// NO content (jd_text ""); the content payload carries the employer's text.
function boardFetch(calls) {
  const job = (id, content) => {
    const j = {
      id, title: "Summer Analyst", location: { name: "New York, NY" },
      absolute_url: `https://example.test/apply/${id}`,
      first_published: new Date(T0).toISOString(),
      requisition_id: `REQ-${id}`, departments: [{ name: "Finance" }],
    };
    if (content != null) j.content = content;
    return j;
  };
  const listJobs = [job(101), job(102), job(103)];
  const contentById = { 101: IB_JD, 102: PE_JD, 103: GENERIC_JD };
  return async (url) => {
    calls.push(url);
    if (/content=true/.test(url)) {
      return { status: 200, json: async () => ({ name: "Acme Bank", jobs: listJobs.map((j) => job(j.id, contentById[j.id])) }) };
    }
    return { status: 200, json: async () => ({ name: "Acme Bank", jobs: listJobs }) };
  };
}

test("MI-029: a posting whose job text names the watched occupation alerts after the evidence pass", async () => {
  const feeds = W.feedsFromDirectory(
    [{ provider: "greenhouse", board_token: "acmebank", company: "Acme Bank", status: "live" }], {});
  assert.equal(feeds.length, 1);
  assert.doesNotMatch(feeds[0].url, /content=true/, "the directory feed is list-first (the production shape)");

  const calls = [];
  const fetchImpl = boardFetch(calls);
  const store = W.createMemoryStore();
  const alerts = [];
  const sink = async (r) => { alerts.push(r); };

  // Cycle 1 against the same list shape with an EMPTY board list is not
  // possible with this stub (it always returns the 3 jobs), so seed by
  // running cycle 1 and accepting its seed semantics, then cycle 2 sees the
  // same postings as NOT new... Instead: seed via a first cycle whose fetch
  // returns zero jobs, then swap to the full board.
  let empty = true;
  const seedFetch = async (url) => {
    if (empty) return { status: 200, json: async () => ({ name: "Acme Bank", jobs: [] }) };
    return fetchImpl(url);
  };
  await W.runWatchCycle({ feeds, fetch: seedFetch, profile: PROFILE, store, sink, now: T0 });
  empty = false;
  calls.length = 0;
  const r = await W.runWatchCycle({ feeds, fetch: seedFetch, profile: PROFILE, store, sink, now: T0 + 3600000 });

  assert.equal(r.alerts_emitted, 1, `exactly the IB posting alerts (gated: ${JSON.stringify(r.gated)})`);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].jd_text, /investment banking/i, "the alert carries the employer's own text (deadline extraction downstream depends on it)");
  assert.equal(alerts[0].occupation_match && alerts[0].occupation_match.basis, "jd_head");
  assert.equal(r.gate_evidence_recovered, 1, "the cycle reports the evidence recovery");
  const stillGated = (r.gated || []).map((g) => g.job_id);
  assert.equal(stillGated.length, 2, "the PE-named and generic postings stay gated — the false-alert rate does not move");
  const contentCalls = calls.filter((u) => /content=true/.test(u));
  assert.equal(contentCalls.length, 1, `one full-text fetch per board per cycle, not per posting (got ${contentCalls.length})`);
});

test("MI-029 precision: no evidence fetch when the polled record already carries text", async () => {
  // Poll the CONTENT feed directly (jd_text present): a gated posting must
  // stay gated with zero additional fetches.
  const feeds = [J.feeds.greenhouse("acmebank")];
  const calls = [];
  const fetchImpl = boardFetch(calls);
  const store = W.createMemoryStore();
  let empty = true;
  const seedFetch = async (url) => {
    if (empty) return { status: 200, json: async () => ({ name: "Acme Bank", jobs: [] }) };
    return fetchImpl(url);
  };
  await W.runWatchCycle({ feeds, fetch: seedFetch, profile: PROFILE, store, sink: async () => {}, now: T0 });
  empty = false;
  calls.length = 0;
  const r = await W.runWatchCycle({ feeds, fetch: seedFetch, profile: PROFILE, store, sink: async () => {}, now: T0 + 3600000 });
  assert.equal(r.alerts_emitted, 1, "the IB posting alerts directly off its own text");
  assert.equal(calls.filter((u) => /content=true/.test(u)).length, 1, "only the poll itself fetched content — no recovery fetch");
  assert.equal(r.gate_evidence_recovered || 0, 0);
});
