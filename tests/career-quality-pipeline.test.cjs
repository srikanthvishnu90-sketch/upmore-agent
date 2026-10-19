"use strict";
// PIPELINE STAGE ASSERTIONS lane (F1 grading) — proof for
// scripts/career/gauntlet/pipeline-assertions.cjs, the pipeline-STAGE
// layer over campaign run records (Operating Prompt Part 4, Stages 1-9;
// Quality Spec doc 03, F1 contract).
//
// PROOF BOTH WAYS (mutation style, like the grader suite):
//  - one crafted COMPLIANT pipeline record (synthetic TEST people, built
//    in 124/w03 fixture shapes) passes every stage assertion;
//  - one violating record per assertion fails with that named check
//    (each mutant asserts the named check id is among the failures);
//  - the real SC-042 run-1 record set (its 5-person sample, replayed
//    through 124 exactly as scripts/career/scenarios/SC-042.cjs built
//    it) is run through the assertions and its stage trips are pinned —
//    its personalization was already flagged unsourced in the ledger's
//    email-review master doc, and S5 must say so here too.
//
// Check: node --test tests/career-quality-pipeline.test.cjs
process.env.HARNESS_OUT_DIR = process.env.HARNESS_OUT_DIR || "/tmp/g-pipeline-harness";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const PA = require(path.join(root, "scripts/career/gauntlet/pipeline-assertions.cjs"));

const NOW = "2026-10-13T15:00:00Z";
const clone = (v) => JSON.parse(JSON.stringify(v));
const failsWith = (rec, id) => {
  const r = PA.assertPipeline(rec);
  assert.equal(r.ok, false, `expected overall FAIL for mutant ${id}`);
  assert.ok(r.failures.some((c) => c.id === id), `expected check ${id} to fail; failures were: ${r.failures.map((c) => c.id).join(", ") || "(none)"}`);
  return r;
};

// ------------------------------------------------------------ compliant
// 12 TEST people. found 12 -> employment-verified 11 -> valid 9 ->
// risky 1 -> excluded 6 (one per class) -> tiers A3/B2/C1 -> ready 4.
function compliantRecord() {
  const recent = (pid, domain) => [{ source_type: "firm_team_page", source_url: `https://${domain}/team/${pid}`, source_date: "2026-08-01", retrieved_at: "2026-10-13T08:00:00Z" }];
  const person = (person_id, name, firm, office, domain, extra) => Object.assign({
    person_id, name, firm, office, title: "Analyst", employment_status: "current", sources: recent(person_id, domain),
  }, extra || {});
  return {
    run_id: "TEST-RUN-1", now: NOW,
    user: { user_id: "u-test", current_employer: "Lazard", confirmed_fact_ids: ["UF-SCHOOL", "UF-YEAR", "UF-CLUB"] },
    stage_sequence: { interpretation: 1, sourcing: 2, email_verification: 3, exclusions: 4, personalization: 5, drafting: 6, qa: 7, report: 8, seed_test: 8, sends: 9 },
    interpretation: { count_N: 40, firm_count: 5, per_firm_cap_per_30d: 15, daily_cap_start: 12, daily_cap_max: 30,
      ramp_step: 5, ramp_every_days: 3, windows_30d: 1, days_required: 4, stated_at: "2026-10-13T07:00:00Z", sequence: 1 },
    sourced_people: [
      person("P1", "Ana Voss", "Evercore", "New York", "evercore.com"),
      person("P2", "Ben Reed", "Lazard", "New York", "lazard.com"),
      person("P3", "Cara Mendez", "Evercore", "New York", "evercore.com"),
      person("P4", "Dan Whitfield", "Moelis & Company", "New York", "moelis.com"),
      person("P5", "Ela Ford", "Lazard", "Chicago", "lazard.com"),
      person("P6", "Finn Iqbal", "Houlihan Lokey", "New York", "hl.com"),
      person("P7", "Gia Holt", "Jefferies", "New York", "jefferies.com"),
      person("P8", "Hal Sato", "Evercore", "New York", "evercore.com"),
      person("P9", "Ida Petrov", "Moelis & Company", "New York", "moelis.com"),
      person("P10", "Jay Brandt", "Jefferies", "New York", "jefferies.com"),
      person("P11", "Kim Mensah", "Evercore", "New York", "evercore.com", { employment_status: "employment_unverified",
        sources: [{ source_type: "firm_team_page", source_url: "https://evercore.com/team/P11", source_date: "2026-01-05", retrieved_at: "2026-10-13T08:00:00Z" }] }),
      person("P12", "Liv Fischer", "Lazard", "New York", "lazard.com", { sources: [
        { source_type: "firm_team_page", source_url: "https://lazard.com/team/P12", source_date: "2025-11-01", retrieved_at: "2026-10-13T08:00:00Z" },
        { source_type: "press_release", source_url: "https://prnewswire.com/releases/P12", source_date: "2025-12-01", retrieved_at: "2026-10-13T08:00:00Z" }] }),
    ],
    email_records: [
      { person_id: "P1", email: "ana.voss@evercore.com", status: "valid", source: "vendor", sendable: true },
      { person_id: "P2", email: "ben.reed@lazard.com", status: "valid", source: "vendor", sendable: true },
      { person_id: "P3", email: "cara.mendez@evercore.com", status: "valid", source: "vendor", sendable: true },
      { person_id: "P4", email: "dan.whitfield@moelis.com", status: "valid", source: "vendor", sendable: true },
      { person_id: "P5", email: "ela.ford@lazard.com", status: "valid", source: "vendor", sendable: true },
      { person_id: "P6", email: "finn.iqbal@hl.com", status: "valid", source: "vendor", sendable: true },
      { person_id: "P7", email: "gia.holt@jefferies.com", status: "valid", source: "vendor", sendable: true },
      { person_id: "P8", email: "hal.sato@evercore.com", status: "catch_all", source: "vendor", sendable: false },
      { person_id: "P9", email: "ida.petrov@moelis.com", status: "valid", source: "pattern", sendable: true },
      { person_id: "P10", email: "jay.brandt@jefferies.com", status: "invalid", source: "vendor", sendable: false },
      { person_id: "P11", email: "kim.mensah@evercore.com", status: "valid", source: "vendor", sendable: true },
      { person_id: "P12", email: "liv.fischer@lazard.com", status: "valid", source: "vendor", sendable: true },
    ],
    domain_patterns: [{ domain: "moelis.com", pattern: "first.last", verified_count: 2 }],
    exclusion_classes_run: ["sent_history", "suppression", "current_employer", "per_firm_cap", "employment_unverified", "not_sendable"],
    exclusions_log: [
      { person_id: "P3", class: "sent_history", reason: "emailed in the 2026-09-30 campaign", disposition: "excluded", sequence: 4 },
      { person_id: "P4", class: "suppression", reason: "on the suppression list", disposition: "excluded", sequence: 4 },
      { person_id: "P5", class: "current_employer", reason: "user's current employer", disposition: "excluded", sequence: 4 },
      { person_id: "P6", class: "per_firm_cap", reason: "over the 15-per-30-days per-firm cap", disposition: "reserve", sequence: 4 },
      { person_id: "P11", class: "employment_unverified", reason: "single source dated 2026-01-05, over 6 months old, no second source", disposition: "excluded", sequence: 4 },
      { person_id: "P10", class: "not_sendable", reason: "email status invalid", disposition: "excluded", sequence: 4 },
    ],
    personalization: [
      { person_id: "P1", fact_id: "PF-1", fact: "led the campus deal team (TEST fact)", tier: "A", provenance: "fetched_this_run", source_url: "https://evercore.com/team/P1", fetched_at: "2026-10-13T09:00:00Z", fact_date: "2026-09-15" },
      { person_id: "P2", fact_id: "PF-2", fact: "same school as the user (TEST fact)", tier: "A", provenance: "user_export", source_url: null, fact_date: "2026-05-01" },
      { person_id: "P7", fact_id: "PF-3", fact: "Jefferies opened a Chicago coverage group (TEST fact)", tier: "B", provenance: "fetched_this_run", source_url: "https://jefferies.com/news", fetched_at: "2026-10-13T09:05:00Z", fact_date: "2026-08-20" },
      { person_id: "P9", fact_id: "PF-4", fact: "Moelis advised on a carve-out (TEST fact)", tier: "B", provenance: "fetched_this_run", source_url: "https://moelis.com/deals", fetched_at: "2026-10-13T09:06:00Z", fact_date: "2026-10-01" },
      { person_id: "P8", fact_id: "PF-5", fact: "spoke at a campus panel (TEST fact)", tier: "A", provenance: "fetched_this_run", source_url: "https://evercore.com/team/P8", fetched_at: "2026-10-13T09:07:00Z", fact_date: "2026-09-01" },
      { person_id: "P12", fact_id: null, fact: null, tier: "C", provenance: "none", source_url: null },
    ],
    drafts: ["P1", "P2", "P7", "P9"].map((pid, i) => ({ person_id: pid, subject: `Question about your path (TEST ${pid})`, body: `TEST draft body for ${pid}`, fact_ids: [`PF-${[1, 2, 3, 4][i]}`], user_claim_fact_ids: ["UF-SCHOOL", "UF-CLUB"], sequence: 6 })),
    qa_log: ["P1", "P2", "P7", "P9"].map((pid) => ({ person_id: pid, pass: true, fact_refetched: true, name_firm_exact_match: true, failures: [] })),
    report: { found: 12, employment_verified: 11, valid: 9, risky: 1, trustworthy: 9,
      excluded_by_reason: { sent_history: 1, suppression: 1, current_employer: 1, per_firm_cap: 1, employment_unverified: 1, not_sendable: 1 },
      excluded_total: 6, tiers: { A: 3, B: 2, C: 1 }, tier_c_held_stated: true, ready: 4 },
    seed_test: { placement: "inbox", at: "2026-10-13T10:00:00Z", sequence: 8 },
    sends: ["P1", "P2", "P7", "P9"].map((pid, i) => ({ person_id: pid, claimed_status: "sent", provider_message_id: `gmail-TEST-${i + 1}`, sequence: 9 })),
    suppression_after: ["P4", "P2"],
    events: [
      { type: "opt_out", person_id: "P2", suppressed: true, removed_from_queues: true },
      { type: "stop_everything", counts: { sent: 4, unconfirmed: 1, halted: 1, queue_total: 6 } },
    ],
  };
}

test("compliant pipeline record passes every stage assertion", () => {
  const r = PA.assertPipeline(compliantRecord());
  assert.deepEqual(r.failures, [], `failures: ${JSON.stringify(r.failures, null, 1)}`);
  assert.equal(r.ok, true);
  assert.ok(r.checks.length >= 20, `expected >=20 checks, got ${r.checks.length}`);
});

test("helpers: employment rule (fresh single source OR two independent) and ramp simulation", () => {
  const nowMs = Date.parse(NOW);
  assert.equal(PA.employmentProven({ sources: [{ source_url: "https://a.test/x", source_date: "2026-09-01" }] }, nowMs), true);
  assert.equal(PA.employmentProven({ sources: [{ source_url: "https://a.test/x", source_date: "2025-01-01" }] }, nowMs), false);
  assert.equal(PA.employmentProven({ sources: [{ source_url: "https://a.test/x", source_date: "2025-01-01" }, { source_url: "https://a.test/y", source_date: "2025-02-01" }] }, nowMs), false, "same domain twice is not independent");
  assert.equal(PA.employmentProven({ sources: [{ source_url: "https://a.test/x", source_date: "2025-01-01" }, { source_url: "https://b.test/y", source_date: "2025-02-01" }] }, nowMs), true);
  assert.equal(PA.simulateDays(40, 12, 5, 3, 30), 4, "12+12+12+17 >= 40 on day 4");
  assert.equal(PA.simulateDays(30, 12, 5, 3, 30), 3);
});

// ------------------------------------------------------------ mutants
test("S1 mutant: days_required understates the ramp -> S1.cap_math_reconciles FAILs", () => {
  const m = compliantRecord(); m.interpretation.days_required = 3;
  failsWith(m, "S1.cap_math_reconciles");
});
test("S1 mutant: no daily-cap start stated -> S1.daily_cap_ramp_stated FAILs", () => {
  const m = compliantRecord(); delete m.interpretation.daily_cap_start;
  failsWith(m, "S1.daily_cap_ramp_stated");
});
test("S1 mutant: per-firm cap bent to 20 -> S1.per_firm_cap_is_15_per_30d FAILs (S0)", () => {
  const m = compliantRecord(); m.interpretation.per_firm_cap_per_30d = 20;
  const r = failsWith(m, "S1.per_firm_cap_is_15_per_30d");
  assert.equal(r.failures.find((c) => c.id === "S1.per_firm_cap_is_15_per_30d").severity, "S0");
});
test("S2 mutant: stale single source marked current, not excluded -> S2.employment_currency FAILs", () => {
  const m = compliantRecord();
  m.sourced_people.push({ person_id: "P13", name: "Moe Novak", firm: "Jefferies", office: "New York", title: "Analyst", employment_status: "current",
    sources: [{ source_type: "firm_team_page", source_url: "https://jefferies.com/team/P13", source_date: "2025-01-01", retrieved_at: "2026-10-13T08:00:00Z" }] });
  failsWith(m, "S2.employment_currency");
});
test("S2 mutant: duplicate name+firm+office record survives -> S2.dedupe_name_firm_office FAILs", () => {
  const m = compliantRecord();
  const dup = clone(m.sourced_people[0]); dup.person_id = "P1-DUP"; m.sourced_people.push(dup);
  failsWith(m, "S2.dedupe_name_firm_office");
});
test("S3 mutant: pattern confirmed by only 1 verified address -> S3.pattern_needs_two_verified_at_domain FAILs", () => {
  const m = compliantRecord(); m.domain_patterns[0].verified_count = 1;
  failsWith(m, "S3.pattern_needs_two_verified_at_domain");
});
test("S3 mutant: catch_all flagged sendable -> S3.sendable_is_valid_only FAILs", () => {
  const m = compliantRecord(); m.email_records.find((e) => e.person_id === "P8").sendable = true;
  failsWith(m, "S3.sendable_is_valid_only");
});
test("S3 mutant: 2 catch_all in a batch of 10 -> S3.catchall_at_most_10pct_of_batch FAILs", () => {
  const m = compliantRecord(); m.email_records.find((e) => e.person_id === "P7").status = "catch_all";
  failsWith(m, "S3.catchall_at_most_10pct_of_batch");
});
test("S3 mutant: trustworthy number padded with the risky address -> S3.trustworthy_excludes_risky FAILs", () => {
  const m = compliantRecord(); m.report.trustworthy = 10;
  failsWith(m, "S3.trustworthy_excludes_risky");
});
test("S4 mutant: suppression class never ran -> S4.all_exclusion_classes_run FAILs", () => {
  const m = compliantRecord(); m.exclusion_classes_run = m.exclusion_classes_run.filter((c) => c !== "suppression");
  failsWith(m, "S4.all_exclusion_classes_run");
});
test("S4 mutant: drafting sequenced before exclusions -> S4.exclusions_before_drafting FAILs", () => {
  const m = compliantRecord(); for (const d of m.drafts) d.sequence = 3;
  failsWith(m, "S4.exclusions_before_drafting");
});
test("S4 mutant: draft for a sent-history person -> S4.no_draft_for_excluded FAILs at S1", () => {
  const m = compliantRecord(); m.drafts.push({ person_id: "P3", subject: "x", body: "y", fact_ids: [], user_claim_fact_ids: [], sequence: 6 });
  const r = failsWith(m, "S4.no_draft_for_excluded");
  assert.equal(r.failures.find((c) => c.id === "S4.no_draft_for_excluded").severity, "S1");
});
test("S4 mutant: draft for a SUPPRESSED person -> S4.no_draft_for_excluded FAILs at S0", () => {
  const m = compliantRecord(); m.drafts.push({ person_id: "P4", subject: "x", body: "y", fact_ids: [], user_claim_fact_ids: [], sequence: 6 });
  const r = failsWith(m, "S4.no_draft_for_excluded");
  assert.equal(r.failures.find((c) => c.id === "S4.no_draft_for_excluded").severity, "S0");
});
test("S5 mutant: fact inferred from the person's title -> S5.no_inferred_facts FAILs", () => {
  const m = compliantRecord(); m.personalization.find((f) => f.person_id === "P1").provenance = "inference_title";
  failsWith(m, "S5.no_inferred_facts");
});
test("S5 mutant: fact dated over 12 months ago -> S5.fact_fetched_this_run_or_user_export_and_fresh FAILs", () => {
  const m = compliantRecord(); m.personalization.find((f) => f.person_id === "P7").fact_date = "2024-01-01";
  failsWith(m, "S5.fact_fetched_this_run_or_user_export_and_fresh");
});
test("S5 mutant: Tier C held but the hold is not stated in the report -> S5.tier_c_held_and_stated FAILs", () => {
  const m = compliantRecord(); m.report.tier_c_held_stated = false;
  failsWith(m, "S5.tier_c_held_and_stated");
});
test("S7 mutant: a drafted person has no QA entry -> S7.qa_log_per_drafted_person FAILs", () => {
  const m = compliantRecord(); m.qa_log = m.qa_log.filter((q) => q.person_id !== "P9");
  failsWith(m, "S7.qa_log_per_drafted_person");
});
test("S7 mutant: draft claims an unconfirmed user fact ID -> S7.user_claims_map_to_confirmed_fact_ids FAILs at S0", () => {
  const m = compliantRecord(); m.drafts[0].user_claim_fact_ids = ["UF-SCHOOL", "UF-INVENTED-GPA"];
  const r = failsWith(m, "S7.user_claims_map_to_confirmed_fact_ids");
  assert.equal(r.failures.find((c) => c.id === "S7.user_claims_map_to_confirmed_fact_ids").severity, "S0");
});
test("S7 mutant: QA failure left drafted instead of moved to reserve -> S7.qa_failures_move_to_reserve FAILs", () => {
  const m = compliantRecord(); const q = m.qa_log.find((x) => x.person_id === "P9"); q.pass = false; q.failures = ["fact_not_on_page"];
  failsWith(m, "S7.qa_failures_move_to_reserve");
});
test("S8 mutant: ready number off by one -> S8.report_reconciles_exactly FAILs", () => {
  const m = compliantRecord(); m.report.ready = 5;
  failsWith(m, "S8.report_reconciles_exactly");
});
test("S9 mutant: seed placement landed in spam but wave 1 sent -> S9.seed_placement_blocks_wave1 FAILs", () => {
  const m = compliantRecord(); m.seed_test.placement = "spam";
  failsWith(m, "S9.seed_placement_blocks_wave1");
});
test("S9 mutant: 'sent' claimed with no provider message ID -> S9.sent_claims_have_provider_message_ids FAILs at S0", () => {
  const m = compliantRecord(); m.sends[0].provider_message_id = null;
  const r = failsWith(m, "S9.sent_claims_have_provider_message_ids");
  assert.equal(r.failures.find((c) => c.id === "S9.sent_claims_have_provider_message_ids").severity, "S0");
});
test("S9 mutant: opt-out recorded but the person was not suppressed -> S9.optout_suppresses_and_removes_from_queues FAILs at S0", () => {
  const m = compliantRecord(); m.events[0].suppressed = false;
  const r = failsWith(m, "S9.optout_suppresses_and_removes_from_queues");
  assert.equal(r.failures.find((c) => c.id === "S9.optout_suppresses_and_removes_from_queues").severity, "S0");
});
test("S9 mutant: stop-everything counts do not add up -> S9.stop_everything_counts_reconcile FAILs", () => {
  const m = compliantRecord(); m.events[1].counts.halted = 3;
  failsWith(m, "S9.stop_everything_counts_reconcile");
});

// ------------------------------------------------------------ SC-042 real record
// The 5-person sample set from run-1 evidence, rebuilt here
// EXACTLY as scripts/career/scenarios/SC-042.cjs built it: w03-common
// person(300+i) fixtures at the same five firms, one TEST personalization
// fact each, drafted through the real 124 draftAndGate. SC-042 only ever
// ran the drafting step — no interpretation, sourcing, verification,
// exclusions, QA, report, seed or send stage records exist for it — and
// its personalization was already flagged unsourced in the ledger's
// email-review master doc (one shared line, source URLs with no fetch
// date or provenance). The assertions must trip on exactly those stages.
test("SC-042 real record: the drafting-only run trips S1, S4, S5, S7 and S8 (and passes what it genuinely satisfies)", () => {
  const { person, M, USER } = require(path.join(root, "scripts/career/scenarios/w03-common.cjs"));
  const firms = ["Evercore", "Lazard", "Moelis & Company", "Houlihan Lokey", "Jefferies"];
  const cands = [0, 1, 2, 3, 4].map((i) => person(300 + i, { current_firm: firms[i],
    personalization_facts: [{ fact: `spent a year at a search fund before joining ${firms[i]} (TEST fact)`, source_url: "https://example.test/bio" + i, strength: "strong", topic: "your search-fund path" }] }));
  const gated = cands.map((c) => M.draftAndGate(c, USER, {}));
  assert.ok(gated.every((g) => g.draft && g.gate.pass), "fixture sanity: SC-042's own gate passed all 5 drafts");
  const rec = {
    run_id: "SC-042-run-1", now: NOW,
    user: { user_id: "u-test", confirmed_fact_ids: [] },
    sourced_people: cands.map((c) => ({ person_id: c.person_id, name: c.full_name, firm: c.current_firm, office: c.office, title: c.title,
      employment_status: "current",
      sources: [{ source_type: "w03-test-fixture", source_url: null, source_date: c.last_verified_at, retrieved_at: c.last_verified_at }] })),
    email_records: cands.map((c) => ({ person_id: c.person_id, email: c.work_email, status: "valid", source: "vendor", sendable: true })),
    personalization: cands.map((c, i) => ({ person_id: c.person_id, fact_id: null, fact: c.personalization_facts[0].fact,
      tier: gated[i].draft.tier, provenance: "unprovenanced_source_url_only", source_url: c.personalization_facts[0].source_url })),
    drafts: gated.map((g, i) => ({ person_id: cands[i].person_id, subject: g.draft.subject, body: g.draft.body, fact_ids: [] })),
  };
  const r = PA.assertPipeline(rec);
  assert.equal(r.ok, false);
  const tripped = new Set(r.failures.map((c) => c.id));
  for (const id of ["S1.interpretation_exists_before_sourcing", "S1.per_firm_cap_is_15_per_30d", "S1.daily_cap_ramp_stated", "S1.cap_math_reconciles",
    "S4.all_exclusion_classes_run", "S5.fact_fetched_this_run_or_user_export_and_fresh",
    "S7.qa_log_per_drafted_person", "S7.user_claims_map_to_confirmed_fact_ids", "S8.report_reconciles_exactly"]) {
    assert.ok(tripped.has(id), `expected SC-042 to trip ${id}; tripped: ${[...tripped].join(", ")}`);
  }
  // What SC-042 genuinely satisfies must NOT trip: its fixture records are
  // employment-fresh (last_verified_at 2026-10-01), deduped, valid-email.
  for (const id of ["S2.employment_currency", "S2.dedupe_name_firm_office", "S3.sendable_is_valid_only", "S3.catchall_at_most_10pct_of_batch", "S5.no_inferred_facts"]) {
    assert.ok(!tripped.has(id), `SC-042 should pass ${id}; tripped: ${[...tripped].join(", ")}`);
  }
});
