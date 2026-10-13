"use strict";
// Gate-3 FAMILY-CONTRACTS lane — Quality Spec Pack v1.0 doc 03 contracts,
// made executable (scripts/career/gauntlet/doorstep-contracts.cjs), plus
// the Gate-3 gap census at module level and the three named-case chat
// replays (SC-286 / SC-287 / SC-277).
//
// CENSUS LAW: every census artifact below is produced by the owning
// product module's own functions on this build — nothing is hand-shaped
// to pass. A family graded GAP names the exact missing/invalid elements
// the validator found; the census assertions pin today's truth, so a
// future product fix turns the corresponding census assertion red and
// the fix commit updates it (that flip IS the Gate-3 re-run signal).
//
// NAMED-CASE REPLAYS (Part C) drive the real chat path through
// pilot-lib chatTurn (143 containment -> 120 -> 130 -> 142 -> 141,
// replies composed by 140), exactly like the R1 regression suite. At
// this build all three are RED — the defects live in files this lane
// may not edit (140 composer / 120 access / 142 router); the graded
// defects + exact patch specifications are in this lane's report.
// They stay red until the router/composer/access lane lands the specs.
//
// Check: node --test tests/career-quality-contracts.test.cjs
process.env.HARNESS_OUT_DIR = process.env.HARNESS_OUT_DIR || "/tmp/gc-contracts-harness";
process.env.GAUNTLET_OUT_DIR = process.env.GAUNTLET_OUT_DIR || "/tmp/gc-contracts-evidence";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const GAUNTLET = path.join(ROOT, "packages/career-data/fixtures/gauntlet");
const Contracts = require(path.join(ROOT, "scripts/career/gauntlet/doorstep-contracts.cjs"));

const D = require(path.join(ROOT, "packages/domain/141-career-doorstep.js"));
const Track = require(path.join(ROOT, "packages/domain/126-career-track.js"));
const Profile = require(path.join(ROOT, "packages/domain/122-career-profile.js"));
const Graph = require(path.join(ROOT, "packages/domain/135-career-graph.js"));
const Prep = require(path.join(ROOT, "packages/domain/127-career-prep.js"));
const Nego = require(path.join(ROOT, "packages/domain/128-career-negotiation.js"));
const OS = require(path.join(ROOT, "packages/domain/129-career-os.js"));
const Guidance = require(path.join(ROOT, "packages/domain/144-career-guidance.js"));
const Access = require(path.join(ROOT, "packages/domain/120-career-access.js"));

const loadProfile = (dir) => Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(GAUNTLET, "profiles", dir, "profile.json"), "utf8")));
const profile = loadProfile("p1-early-career-swe");
const NOW = "2026-10-13T12:00:00Z";

// ------------------------------------------------- census artifacts
function artifactF1() {
  return D.emitOutreachDraft({ profile, now: NOW }, {
    scenario_id: "SC-001-generalized",
    recipient: {
      person_id: "G6-PERSON-1", full_name: "Jordan Lee (TEST)", work_email: "jordan.lee@examplebank.example.test",
      current_firm: "Example Bank (TEST)", title: "Analyst", relationship_to_user: "same school",
      schools: ["TEST University"],
      personalization_facts: [{ fact: "publishes a markets newsletter for students", source_url: "https://example.test/jordan-newsletter", strength: "strong" }],
    },
  });
}
function artifactF2() {
  const backendText = "Maya Rivera (TEST) — tailored for Backend Engineer, TEST Company\nPython, SQL, Flask, SQLite. StudyBoard scheduler. SWE Intern, TEST Systems Inc, Jun-Aug 2026.\nVERSION: BACKEND\n";
  return D.emitApplicationPacket({ profile, artifacts: [{ record: "backend application materials", name: "resume.pdf", version: "backend", content: backendText }] }, {
    scenario_id: "SC-111-generalized", company: "TEST Company", jobId: "G6-NONFIXTURE-1",
    jdText: "Backend Engineer at TEST Company. Requirements: Python and SQL required; Flask a plus. Build APIs and data export tooling.", version: "backend",
  });
}
function artifactF3() {
  const store = Track.seedTestLog();
  const sink = { writes: 0, write() { this.writes++; } };
  return D.emitTrackingLog({ profile, trackerStore: store, trackerSink: sink, now: NOW }, {
    scenario_id: "SC-138", company: "Ramp", stage: "Interview rounds",
    note: "I got an interview at Ramp", event_type: "manual_update",
  });
}
function artifactCalendar() {
  const cal = JSON.parse(fs.readFileSync(path.join(GAUNTLET, "calendar/gauntlet-calendar.json"), "utf8"));
  const inbox = JSON.parse(fs.readFileSync(path.join(GAUNTLET, "inbox/gauntlet-inbox.json"), "utf8"));
  const gt03 = inbox.threads.find((t) => t.thread_id === "GT-03");
  const sink = { creates: 0, createEvent() { this.creates++; } };
  return D.emitCalendarProposal({ profile, calendar: cal, calendarSink: sink, now: NOW }, {
    scenario_id: "SC-031", title: "Coffee chat — Helios Bank (TEST)",
    attendees: [{ name: "Priya Coordinator (TEST)", email: "scheduling@helios.example.test" }],
    slots: gt03.messages[0].offered_slots, durationMin: 30,
  });
}
function artifactF4() {
  const prof = { name: "Alex Testcase (TEST)", school: "TEST University", year: "junior", hometown: "Chicago, IL (TEST)", major: "Computer Science", clubs: ["TEST University Investing Club"], current_employer: "TEST Systems Inc" };
  const st = Graph.makeGraphStore();
  Graph.importGraph(st, [{ source: "linkedin_export", records: [
    { full_name: "Gone Person (TEST)", current_firm: "Datadog", at_company: false, departed_at: "2026-08", next_firm: "Elsewhere (TEST)" },
    { full_name: "Live Person (TEST)", current_firm: "Datadog", schools: ["TEST University"] },
    { full_name: "Second Alum (TEST)", current_firm: "Datadog", schools: ["TEST University"], geography: "New York, NY" },
  ] }]);
  return Graph.findPaths(st, "Datadog", prof);
}
function artifactF5() {
  const stripe = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/cirs/stripe.json"), "utf8"));
  return Prep.composeBrief({ cir: stripe, company: "Stripe", role: "SWE Intern" });
}
function artifactF6() {
  const offerA = fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/test-offer-a.txt"), "utf8");
  return Nego.parseOffer(offerA, { now: "2026-10-12T12:00:00Z" });
}
function artifactF7() {
  return Guidance.answerGuidance({ intent: "plan_paths", profile });
}
function artifactF8() {
  const store = OS.createStore();
  return OS.logWin(store, { text: "Shipped the scheduler", outcome: "adopted by team", date: "2026-10-01" });
}
function artifactF9() {
  return Access.connectedAccounts([{ provider: "google_career", email: "x@example.test", scopes: Access.CAREER_SCOPES, connected_at: "2026-10-12T00:00:00Z" }]);
}

const CENSUS = [
  { family: "F1", label: "141 emitOutreachDraft (SC-001 shape)", make: artifactF1 },
  { family: "F2", label: "141 emitApplicationPacket (SC-111 shape)", make: artifactF2 },
  { family: "F3", label: "141 emitTrackingLog (SC-138)", make: artifactF3 },
  { family: "calendar", label: "141 emitCalendarProposal (SC-031)", make: artifactCalendar },
  { family: "F4", label: "135 findPaths (Datadog, incl. departed contact)", make: artifactF4 },
  { family: "F5", label: "127 composeBrief (Stripe CIR)", make: artifactF5 },
  { family: "F6", label: "128 parseOffer (test-offer-a)", make: artifactF6 },
  { family: "F7", label: "144 answerGuidance plan_paths", make: artifactF7 },
  { family: "F8", label: "129 logWin", make: artifactF8 },
  { family: "F9", label: "120 connectedAccounts (career grant row)", make: artifactF9 },
];

// ------------------------------------------- Part A: validator controls
test("validator control (+): a complete synthetic F1 doorstep record validates", () => {
  // Validator-unit fixture only (not a census artifact): proves the F1
  // validator can return VALID, so census GAPs are product gaps.
  const rec = {
    list_record: { selected_count: 15, reserve_count: 45, excluded_count: 3 },
    drafts: [{ to: "a@example.test", subject: "TEST University question", body: ("Hi Sam — I saw your markets newsletter for students at TEST University. " + "Context line. ".repeat(4) + "Would you have 15 minutes on Tuesday at 4pm or Wednesday at 5pm? Thanks, Maya Rivera (TEST)").trim(), facts_used: [{ fact: "markets newsletter", source_url: "https://example.test/x" }] }],
    safety_plan_card: { daily_cap_start: 5, finish_date: "2026-11-02", stop_rules: ["bounce breaker"] },
    campaign: { status: "draft" }, sends: 0,
  };
  // body must land in 50-120 words; pad deterministically if short
  const words = rec.drafts[0].body.split(/\s+/).length;
  if (words < 50) rec.drafts[0].body += " " + Array(55 - words).fill("detail").join(" ");
  const v = Contracts.validate("F1", rec);
  assert.equal(v.valid, true, JSON.stringify({ missing: v.missing, invalid: v.invalid }));
});

test("validator control: F9 halt record must reconcile (01 R-A4)", () => {
  const ok = Contracts.validate("F9", { intent: "queue_halt", sent_count: 1, in_flight_count: 2, halted_count: 4, queue_total: 7, pause_flag_set: true });
  assert.equal(ok.valid, true, JSON.stringify(ok));
  const bad = Contracts.validate("F9", { intent: "queue_halt", sent_count: 1, in_flight_count: 2, halted_count: 3, queue_total: 7, pause_flag_set: true });
  assert.equal(bad.valid, false);
  assert.ok(bad.invalid.some((i) => i.element === "halt_counts_reconcile"));
});

test("validator control: family aliases resolve; unknown family throws; non-record is GAP not crash", () => {
  assert.equal(Contracts.validate("application", artifactF2()).family, "F2");
  assert.equal(Contracts.validate("outreach-send", artifactF1()).family, "F1");
  assert.throws(() => Contracts.validate("F42", {}), /unknown family/);
  const v = Contracts.validate("F6", null);
  assert.equal(v.valid, false); assert.deepEqual(v.missing, ["record"]);
});

test("validator control: a submitted packet is invalid even if complete (03 F2 never)", () => {
  const rec = artifactF6();
  const v = Contracts.validate("F2", { posting_snapshot: { jd_text: "x" }, variant_id: "v1", audit_result: { ok: true, dropped_lines: [] }, filled_fields: [{ name: "x", t3: false }], attach_guard: { ok: true }, status: "ready_for_review", submitted: true });
  assert.equal(v.valid, false);
  assert.ok(v.invalid.some((i) => i.element === "nothing_committed_without_approval"));
  assert.ok(rec); // silence unused-var style checks; F6 artifact censused below
});

// ------------------------------------------- Part B: Gate-3 gap census
test("CENSUS: per-family VALID / GAP over the modules' own artifacts", () => {
  const rows = Contracts.census(CENSUS.map((c) => ({ family: c.family, label: c.label, record: c.make() })));
  for (const row of rows) {
    console.log(`CENSUS ${row.family} [${row.label}] => ${row.status}` +
      (row.missing.length ? ` missing=[${row.missing.join(", ")}]` : "") +
      (row.invalid.length ? ` invalid=[${row.invalid.map((i) => `${i.element}: expected ${i.expected}, observed ${i.observed}`).join("; ")}]` : ""));
  }
  const by = Object.fromEntries(rows.map((r) => [r.label, r]));

  const f1 = by["141 emitOutreachDraft (SC-001 shape)"];
  assert.equal(f1.status, "GAP");
  assert.deepEqual(f1.missing, ["list_record.selected_count", "list_record.reserve_count", "list_record.excluded_count", "draft.ask_15min_with_two_windows_or_whatever_works", "safety_plan_card", "campaign_in_draft_state"], JSON.stringify(f1));
  assert.ok(f1.invalid.some((i) => i.element === "draft.subject_under_60_chars" && /61 characters/.test(i.observed)), "124 draft subject is 61 chars vs the <60 rule: " + JSON.stringify(f1.invalid));
  assert.ok(f1.present.includes("drafts") && f1.present.includes("draft.personalization_fact_with_source"));

  const f2 = by["141 emitApplicationPacket (SC-111 shape)"];
  assert.equal(f2.status, "GAP");
  assert.deepEqual(f2.missing, ["posting_snapshot", "audit_result", "filled_fields", "t3_flags"], JSON.stringify(f2));
  assert.ok(f2.present.includes("variant_id") && f2.present.includes("attach_guard_result") && f2.present.includes("doorstep_envelope"));

  const f3 = by["141 emitTrackingLog (SC-138)"];
  assert.equal(f3.status, "GAP");
  assert.deepEqual(f3.missing, ["triggered_followups"], JSON.stringify(f3));
  assert.ok(f3.invalid.some((i) => i.element === "log_write.source" && i.observed === '"user-reported"'), "126/141 source vocabulary is 'user-reported'; 03 F3 enum is user_reported: " + JSON.stringify(f3.invalid));

  const cal = by["141 emitCalendarProposal (SC-031)"];
  assert.equal(cal.status, "VALID", JSON.stringify(cal));

  const f4 = by["135 findPaths (Datadog, incl. departed contact)"];
  assert.equal(f4.status, "GAP");
  assert.deepEqual(f4.missing, ["drafts_held_as_cards"], JSON.stringify(f4));
  assert.ok(f4.present.includes("shared_fact_per_person") && f4.present.includes("departed_contact_check") && f4.present.includes("warmth_rank_order"));

  const f5 = by["127 composeBrief (Stripe CIR)"];
  assert.equal(f5.status, "GAP");
  assert.deepEqual(f5.missing, ["stories_mapped_or_no_fit_statement"], JSON.stringify(f5));
  assert.ok(f5.present.includes("sources") && f5.present.includes("sources_as_of") && f5.present.includes("company_specific_content"));

  const f6 = by["128 parseOffer (test-offer-a)"];
  assert.equal(f6.status, "VALID", JSON.stringify(f6));

  const f7 = by["144 answerGuidance plan_paths"];
  assert.equal(f7.status, "GAP");
  assert.deepEqual(f7.missing, ["sources", "basis_as_of_date", "action_plan_3_to_5"], JSON.stringify(f7));
  assert.ok(f7.present.includes("bottom_line_first_sentence_under_30_words"));

  const f8 = by["129 logWin"];
  assert.equal(f8.status, "VALID", JSON.stringify(f8));

  const f9 = by["120 connectedAccounts (career grant row)"];
  assert.equal(f9.status, "GAP");
  assert.deepEqual(f9.missing, ["self_test_result.test_email_received", "self_test_result.test_event_created"], JSON.stringify(f9));
  assert.ok(f9.present.includes("connection_record"));
});

// ------------------------------------------- Part C: named-case replays
// RED at this build by design (see header). Each test separates the RAW
// handler reply from the DELIVERED bubble so the failing layer is named
// by the evidence itself.
const L = require(path.join(ROOT, "scripts/career/gauntlet/pilot-lib.cjs"));
const joined = (turn) => (turn.delivered || []).join("\n");

test("SC-286 replay: the secure connect link must survive into the delivered reply (03 F9 star)", () => {
  const s = L.H.session("SC-286", "contracts-sc286");
  const turn = L.chatTurn(s, "connect my Google", { profile, secureLinkFor: (src) => `https://secure.example/connect/${src}` });
  assert.equal(turn.handler, "120-career-access.handleChat");
  // Diagnosis separator: 120's RAW reply carries the link today...
  assert.match(turn.result.reply, /https:\/\/secure\.example\/connect\/google_career/, "raw 120 reply carries the link");
  // ...so any loss is downstream (140 composer). The contract grades the DELIVERED reply.
  assert.match(joined(turn), /https:\/\/secure\.example\/connect\/google_career/,
    "DEFECT (140-career-reply): delivered bubble lost the connect link that 120's raw reply carries");
});

test("SC-287 replay: LinkedIn is export-only — any sign-in instruction fails (01 R-B11, S0)", () => {
  const s = L.H.session("SC-287", "contracts-sc287");
  const turn = L.chatTurn(s, "Connect LinkedIn the zero-risk way: here's my data export", { profile, secureLinkFor: (src) => `https://secure.example/connect/${src}` });
  const raw = (turn.result && turn.result.reply) || "";
  const all = raw + "\n" + joined(turn);
  assert.doesNotMatch(all, /sign in/i, "DEFECT (120-career-access): reply instructs LinkedIn sign-in; the locked path is the user's data export");
  assert.match(all, /export/i, "the reply must route to the data-export path");
  assert.notEqual(turn.result && turn.result.method, "cloud_browser_user_sign_in", "the connect method must not be browser sign-in");
});

test("SC-277 replay: a return-offer playbook ask reaches the playbook, never a job list (03 F8 never, S1)", () => {
  const s = L.H.session("SC-277", "contracts-sc277");
  const turn = L.chatTurn(s, "Return-offer playbook for my internship summer", { profile });
  const text = joined(turn);
  assert.match(text, /playbook/i, "DEFECT (142-career-router): the delivered reply is not a playbook");
  assert.doesNotMatch(text, /Northwind Ledger|Lakefront Cloud|Eastbank Systems|Copperline Infra|Fieldnote Software/, "the canned discovery shortlist must not answer a playbook ask");
  assert.notEqual(turn.result && turn.result.intent, "career_internship_discovery");
  assert.notEqual(turn.result && turn.result.intent, "career_discovery");
});
