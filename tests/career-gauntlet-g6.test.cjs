// Feature lane G6 — PER-FAMILY DOORSTEP PAYLOADS (141).
// Written FAIL-FIRST against e5b488b: on that build 141 emits commitment
// artifacts only for its fixture form/queue cases — emitTrackingLog,
// emitCalendarProposal, emitApplicationPacket and emitOutreachDraft do not
// exist, so every test below fails on the missing emitter.
//
// The contract under test comes from the hardened re-score (v2):
// run-grand-rescore.cjs DOORSTEP_REQUIRED —
//   outreach-send  => draft or queue state
//   application    => packet
//   tracking-write => log write
//   calendar       => proposal card
// and the doorstepGrade shape: a record doorstep block counts as PRESENT
// only when it carries { family, gap: null, driven_by: "agent" } — GAP
// otherwise. Each emitter therefore returns a doorstep record of exactly
// that shape, plus the doorstep proof pattern (step log + payload snapshot
// + payload hash), state AWAITING_COMMIT, and ZERO commitments fired:
// the write/invite/send targets the ctx provides are counting sinks and
// must stay at 0 — the emitter is armed, never fired.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const GAUNTLET = path.join(root, "packages/career-data/fixtures/gauntlet");

const Doorstep = require(path.join(root, "packages/domain/141-career-doorstep.js"));
const Track = require(path.join(root, "packages/domain/126-career-track.js"));
const Profile = require(path.join(root, "packages/domain/122-career-profile.js"));
const Rescore = require(path.join(root, "scripts/career/gauntlet/run-grand-rescore.cjs"));

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const loadProfile = (dir) => Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(GAUNTLET, "profiles", dir, "profile.json"), "utf8")));
const stable = (v) => JSON.stringify(v, Object.keys(v || {}).sort()); // not used for hash equality; emitters expose their own hash

function assertDoorstepRecord(r, family) {
  assert.ok(r, "an emitter result is returned");
  assert.ok(["awaiting_user", "prepared", "blocked"].includes(r.resultStatus), "typed resultStatus from the guard vocabulary, got: " + r.resultStatus);
  assert.ok(r.doorstep, "the result carries a doorstep record");
  assert.equal(r.doorstep.family, family, "doorstep family matches the grader's per-family requirement");
  assert.equal(r.doorstep.gap, null, "no gap: the artifact was produced");
  assert.equal(r.doorstep.driven_by, "agent", "driven by the agent through the doorstep seam");
  assert.equal(r.doorstep.state, "AWAITING_COMMIT", "stopped before commitment");
  assert.equal(r.doorstep.committed, false, "nothing committed");
  assert.ok(Array.isArray(r.doorstep.step_log) && r.doorstep.step_log.length >= 1, "proof: step log recorded");
  assert.ok(r.doorstep.payload, "proof: payload snapshot recorded on the doorstep record");
  assert.ok(r.payload, "the payload is on the result");
  assert.equal(r.payload_sha256, sha256(JSON.stringify(r.payload)), "payload hash matches the payload snapshot bytes");
  assert.equal(r.doorstep.payload_sha256, r.payload_sha256, "doorstep record carries the same payload hash");
  // The hardened grader itself: a record carrying this doorstep block
  // grades PRESENT, not GAP.
  const grade = Rescore.doorstepGrade({ doorstep: r.doorstep });
  assert.equal(grade.status, "PRESENT", "run-grand-rescore doorstepGrade reads this record as PRESENT");
  assert.equal(grade.family, family);
}

// ---------------------------------------------------------- tracking: SC-138
// v2 GAP scenario SC-138 (Track & Follow-Up): 'Manual update by chat:
// "I got an interview at Ramp" — logged, prep triggered' — doorstep family
// tracking-write, requires a log write artifact. The Ramp row is 126's own
// seed row (stage Confirmed); the emitter must build the exact would-write
// (a manual_update move to "Interview rounds") and NOT write it.
test("SC-138 tracking: emitTrackingLog builds the Ramp manual-update log write and fires nothing", () => {
  assert.equal(typeof Doorstep.emitTrackingLog, "function", "emitTrackingLog exists (absent on e5b488b)");
  const store = Track.seedTestLog();
  const before = JSON.parse(JSON.stringify(store.rows));
  const sink = { writes: 0, write() { this.writes++; }, addApplication() { this.writes++; }, moveStage() { this.writes++; } };
  const ctx = {
    profile: loadProfile("p1-early-career-swe"),
    trackerStore: store, trackerSink: sink, trackStore: store,
    now: "2026-10-13T12:00:00Z",
    resumeArtifact: { name: "resume.pdf", sha256: "a".repeat(64) },
  };
  const r = Doorstep.emitTrackingLog(ctx, {
    scenario_id: "SC-138",
    company: "Ramp", stage: "Interview rounds",
    note: "I got an interview at Ramp",
    event_type: "manual_update",
  });
  assertDoorstepRecord(r, "tracking-write");
  assert.equal(r.resultStatus, "awaiting_user");
  // Payload = the exact tracker log write, in 126's row/event shape.
  const p = r.payload;
  assert.equal(p.company, "Ramp");
  assert.equal(p.application.company, "Ramp");
  assert.equal(p.status, "Interview rounds");
  assert.ok(Track.STAGES.includes(p.status), "the status is a real 126 stage");
  assert.equal(p.note, "I got an interview at Ramp");
  assert.equal(p.operation, "move_stage", "Ramp already has a log row, so the write is a stage move");
  assert.equal(p.app_id, "TEST-app-ramp", "bound to the existing Ramp application row");
  assert.equal(p.event.type, "manual_update");
  assert.equal(p.event.source, "user_reported", "spec 03 F3 enum (inbox|user_reported|portal): 141 maps 126's store vocabulary to the spec enum at emission — assertion updated per 05 Part 4 with this reason cited");
  assert.equal(p.event.stage_after, "Interview rounds");
  assert.ok(p.would_write, "a would-write snapshot is recorded");
  assert.equal(p.would_write.event.detail.includes("I got an interview at Ramp"), true, "the note rides in the would-write event");
  // Zero commitments: sink untouched, store byte-identical.
  assert.equal(sink.writes, 0, "the tracker sink/write target was never invoked");
  assert.deepEqual(store.rows, before, "the real tracker store is unchanged — armed, not fired");
});

test("SC-122 tracking: emitTrackingLog builds an add-application log write for a company with no row yet", () => {
  const store = Track.createMemoryStore([]);
  const sink = { writes: 0, write() { this.writes++; } };
  const ctx = { profile: loadProfile("p1-early-career-swe"), trackerStore: store, trackerSink: sink, now: "2026-10-13T12:00:00Z" };
  const r = Doorstep.emitTrackingLog(ctx, {
    scenario_id: "SC-122", company: "Helios Bank (TEST)", role: "Software Engineer, Early Careers",
    stage: "Confirmed", note: "Confirmation email landed for Helios",
    event_type: "confirmation", source: "inbox", applied_at: "2026-10-10T12:00:00Z", resume_version: "swe-v2",
  });
  assertDoorstepRecord(r, "tracking-write");
  assert.equal(r.payload.operation, "add_application");
  const row = r.payload.would_write.row;
  // 126 addApplication row shape, field for field.
  for (const k of ["app_id", "company", "role", "role_family", "url", "applied_at", "resume_version", "source", "referred_by", "fit_bucket", "stage", "offer_deadline", "assessment_deadline", "cooldown_until", "events"]) {
    assert.ok(k in row, "would-write row carries the 126 field " + k);
  }
  assert.equal(row.company, "Helios Bank (TEST)");
  assert.equal(row.stage, "Confirmed");
  assert.equal(row.events[0].type, "applied", "126's addApplication seeds the applied event first");
  assert.equal(row.events[row.events.length - 1].type, "confirmation", "the signal event is appended in 126's event shape");
  assert.equal(r.payload.event.type, "confirmation");
  assert.equal(sink.writes, 0);
  assert.equal(store.rows.length, 0, "nothing was added to the tracker");
});

test("tracking guards: missing company and an unknown stage are blocked, with no payload fired", () => {
  const sink = { writes: 0, write() { this.writes++; } };
  const ctx = { profile: loadProfile("p1-early-career-swe"), trackerSink: sink, now: "2026-10-13T12:00:00Z" };
  const noCo = Doorstep.emitTrackingLog(ctx, { stage: "Confirmed", note: "no company named" });
  assert.equal(noCo.resultStatus, "blocked");
  assert.ok(noCo.guard_refusal && noCo.guard_refusal.code, "blocked carries the guard vocabulary");
  assert.equal(noCo.payload, null);
  const badStage = Doorstep.emitTrackingLog(ctx, { company: "Ramp", stage: "Super Happy Fun Stage", note: "x" });
  assert.equal(badStage.resultStatus, "blocked");
  assert.equal(badStage.guard_refusal.code, "unknown_stage");
  assert.equal(sink.writes, 0);
});

// ---------------------------------------------------------- calendar: SC-031 + F3 C29
// v2 GAP scenario SC-031: 'banker offers Tue or Wed 5pm ET — propose from
// my calendar, card, book it' — doorstep family calendar, requires a
// proposal card. Ground truth is the F3 calendar fixture + GT-03's three
// offered slots (C29): A conflicts with busy hold GEVT-03, B is free,
// C falls inside quiet hours. Conflicts are REPORTED, never silently
// resolved: asking for slot A alone returns slot A with its conflict.
function calendarCtx() {
  const cal = JSON.parse(fs.readFileSync(path.join(GAUNTLET, "calendar/gauntlet-calendar.json"), "utf8"));
  const inbox = JSON.parse(fs.readFileSync(path.join(GAUNTLET, "inbox/gauntlet-inbox.json"), "utf8"));
  const gt03 = inbox.threads.find((t) => t.thread_id === "GT-03");
  const sink = { creates: 0, createEvent() { this.creates++; return { id: "should-never-exist" }; } };
  return { cal, slots: gt03.messages[0].offered_slots, sink };
}

test("SC-031/C29 calendar: emitCalendarProposal evaluates GT-03 slots against the F3 ground truth — A conflict, B free, C quiet hours", () => {
  assert.equal(typeof Doorstep.emitCalendarProposal, "function", "emitCalendarProposal exists (absent on e5b488b)");
  const { cal, slots, sink } = calendarCtx();
  const ctx = { profile: loadProfile("p1-early-career-swe"), calendar: cal, calendarSink: sink, now: "2026-10-13T12:00:00Z" };
  const r = Doorstep.emitCalendarProposal(ctx, {
    scenario_id: "SC-031",
    title: "Coffee chat — Helios Bank (TEST)",
    attendees: [{ name: "Priya Coordinator (TEST)", email: "scheduling@helios.example.test" }],
    slots, durationMin: 30,
  });
  assertDoorstepRecord(r, "calendar");
  const card = r.payload.card;
  assert.ok(card, "the payload carries a proposal card");
  assert.equal(card.title, "Coffee chat — Helios Bank (TEST)");
  assert.deepEqual(card.attendees.map((a) => a.email), ["scheduling@helios.example.test"]);
  const ev = Object.fromEntries(r.payload.slot_evaluations.map((s) => [s.slot_id, s]));
  assert.equal(ev.A.conflict, true, "slot A conflicts");
  assert.ok(ev.A.conflicts.some((c) => c.event_id === "GEVT-03" && c.kind === "overlap"), "slot A's conflict names the busy hold GEVT-03");
  assert.equal(ev.B.conflict, false, "slot B is free (F3 ground truth C29: Slot B only)");
  assert.equal(ev.C.conflict, true, "slot C conflicts");
  assert.ok(ev.C.conflicts.some((c) => c.kind === "quiet_hours"), "slot C's conflict is quiet hours");
  assert.equal(r.payload.proposed.slot_id, "B", "the proposed slot is the free one, with every evaluation reported alongside");
  assert.equal(r.payload.conflict, false, "the proposed slot itself carries no conflict");
  assert.equal(sink.creates, 0, "no calendar invite was created");
});

test("calendar conflicts are reported, never silently resolved: slot A alone comes back as slot A with its conflict", () => {
  const { cal, slots, sink } = calendarCtx();
  const ctx = { profile: loadProfile("p1-early-career-swe"), calendar: cal, calendarSink: sink, now: "2026-10-13T12:00:00Z" };
  const onlyA = slots.filter((s) => s.slot_id === "A");
  const r = Doorstep.emitCalendarProposal(ctx, { title: "Interview — Helios Bank (TEST)", attendees: ["scheduling@helios.example.test"], slots: onlyA, durationMin: 30 });
  assertDoorstepRecord(r, "calendar");
  assert.equal(r.payload.proposed.slot_id, "A", "the requested slot is NOT silently swapped for a free one");
  assert.equal(r.payload.conflict, true, "the conflict is flagged on the payload");
  assert.ok(r.payload.conflicts.some((c) => c.event_id === "GEVT-03"), "the conflicting facts are in the payload");
  assert.equal(sink.creates, 0);
});

test("C30 calendar: an ambiguous fall-back local time is flagged, never pinned to one offset", () => {
  const { cal, sink } = calendarCtx();
  const ctx = { profile: loadProfile("p1-early-career-swe"), calendar: cal, calendarSink: sink, now: "2026-10-13T12:00:00Z" };
  const inv = cal.changed_invite;
  const r = Doorstep.emitCalendarProposal(ctx, {
    scenario_id: "SC-143",
    title: inv.title,
    attendees: ["scheduling@helios.example.test"],
    slots: [{ slot_id: "moved", start_local_ambiguous: inv.update.proposed.start_local_ambiguous, end_local: inv.update.proposed.end_local, timezone: "America/Chicago" }],
    durationMin: 45,
  });
  assertDoorstepRecord(r, "calendar");
  assert.equal(r.payload.conflict, true);
  assert.ok(r.payload.conflicts.some((c) => c.kind === "ambiguous_local_time"), "the fall-back ambiguity is reported as a conflict");
  assert.equal(r.payload.proposed.utc, null, "no UTC instant was invented for the ambiguous local time");
  assert.equal(sink.creates, 0);
});

// ---------------------------------------------------------- apply: generalized packet (SC-111 shape, non-fixture spec)
// prepPacket on e5b488b resolves ONLY the chat-text fixture shape (a
// "<version>" word + ctx.packet pin + ctx.artifacts). emitApplicationPacket
// accepts a posting spec directly — a company/jobId/jdText that appear in
// no fixture — and still stops at AWAITING_COMMIT with a packet artifact.
test("apply generalized: emitApplicationPacket accepts a posting spec beyond the fixture ids", () => {
  assert.equal(typeof Doorstep.emitApplicationPacket, "function", "emitApplicationPacket exists (absent on e5b488b)");
  const profile = loadProfile("p1-early-career-swe");
  const backendText = "Maya Rivera (TEST) — tailored for Backend Engineer, TEST Company\nPython, SQL, Flask, SQLite. StudyBoard scheduler. SWE Intern, TEST Systems Inc, Jun-Aug 2026.\nVERSION: BACKEND\n";
  const sink = { writes: 0, write() { this.writes++; } };
  const ctx = {
    profile, sink, submitSink: sink,
    artifacts: [{ record: "backend application materials", name: "resume.pdf", version: "backend", content: backendText }],
  };
  const r = Doorstep.emitApplicationPacket(ctx, {
    scenario_id: "SC-111-generalized",
    company: "TEST Company", jobId: "G6-NONFIXTURE-1",
    jdText: "Backend Engineer at TEST Company. Requirements: Python and SQL required; Flask a plus. Build APIs and data export tooling.",
    version: "backend",
  });
  assertDoorstepRecord(r, "application");
  assert.equal(r.resultStatus, "awaiting_user");
  assert.ok(r.packet && r.packet.ok, "133 assemblePacket produced the packet for the non-fixture posting");
  assert.equal(r.payload.company, "TEST Company");
  assert.equal(r.payload.job_id, "G6-NONFIXTURE-1");
  assert.equal(r.payload.binding.version, "backend");
  assert.equal(r.payload.binding.sha256, sha256(backendText), "the versioned resume is bound by content hash");
  assert.equal(r.payload.submitted, false);
  assert.equal(sink.writes, 0, "no submission sink was touched");
  // Fixture behavior is byte-compatible: the original chat entry point
  // still preps the same packet through prepPacket.
  const ctx2 = {
    profile,
    artifacts: [{ record: "backend application materials", name: "resume.pdf", version: "backend", content: backendText }],
    packet: { company: "TEST Company", jobId: "GJ-BACKEND-1", jdText: "Backend Engineer at TEST Company. Requirements: Python and SQL required; Flask a plus. Build APIs and data export tooling." },
  };
  const legacy = Doorstep.prepPacket("prep the backend application using the backend version", ctx2);
  assert.equal(legacy.resultStatus, "prepared");
  assert.equal(legacy.binding.sha256, sha256(backendText));
});

test("apply generalized: an ambiguous version request is awaiting_user, not a guess", () => {
  const profile = loadProfile("p1-early-career-swe");
  const ctx = {
    profile,
    artifacts: [
      { record: "a", name: "resume.pdf", version: "backend", content: "one" },
      { record: "b", name: "resume.pdf", version: "backend", content: "two" },
    ],
  };
  const r = Doorstep.emitApplicationPacket(ctx, { company: "TEST Company", jobId: "G6-AMB-1", jdText: "Backend Engineer. Python and SQL required.", version: "backend" });
  assert.equal(r.resultStatus, "awaiting_user", "two same-version artifacts cannot be pinned to one — the user is asked");
  assert.equal(r.payload, null, "no packet payload is armed on ambiguity");
});

// ---------------------------------------------------------- outreach: generalized draft (SC-001 shape, non-fixture recipient)
// The outreach doorstep artifact is a draft or queue state. The recipient
// below appears in no fixture list; the emitter builds the draft through
// 124 (called, never edited) and arms a queue state — sends stay 0.
test("outreach generalized: emitOutreachDraft drafts for a recipient spec beyond the fixture ids and arms queue state", () => {
  assert.equal(typeof Doorstep.emitOutreachDraft, "function", "emitOutreachDraft exists (absent on e5b488b)");
  const transport = { sends: 0, send() { this.sends++; } };
  const ctx = { profile: loadProfile("p1-early-career-swe"), transport, now: "2026-10-13T12:00:00Z" };
  const r = Doorstep.emitOutreachDraft(ctx, {
    scenario_id: "SC-001-generalized",
    recipient: {
      person_id: "G6-PERSON-1", full_name: "Jordan Lee (TEST)", work_email: "jordan.lee@examplebank.example.test",
      current_firm: "Example Bank (TEST)", title: "Analyst", relationship_to_user: "same school",
      schools: ["TEST University"],
      personalization_facts: [{ fact: "publishes a markets newsletter for students", source_url: "https://example.test/jordan-newsletter", strength: "strong" }],
    },
  });
  assertDoorstepRecord(r, "outreach-send");
  assert.equal(r.resultStatus, "awaiting_user");
  const d = r.payload.draft;
  assert.ok(d && d.body, "the payload carries the draft artifact (124's draft shape)");
  assert.equal(d.to, "jordan.lee@examplebank.example.test");
  assert.ok(d.subject && d.body.includes("Jordan"), "the draft is addressed to the spec recipient");
  assert.equal(r.payload.queue_state.status, "awaiting_approval", "the queue state artifact is armed at the approval gate");
  assert.equal(r.payload.queue_state.items.length, 1);
  assert.equal(r.payload.queue_state.items[0].status, "awaiting_approval");
  assert.equal(r.payload.sends, 0);
  assert.equal(transport.sends, 0, "nothing was sent");
});

test("outreach guards: a recipient with no email is blocked, and an explicit draft spec still produces an artifact", () => {
  const ctx = { profile: loadProfile("p1-early-career-swe"), now: "2026-10-13T12:00:00Z" };
  const noEmail = Doorstep.emitOutreachDraft(ctx, { recipient: { full_name: "No Email (TEST)", current_firm: "Example Bank (TEST)", title: "Analyst" } });
  assert.equal(noEmail.resultStatus, "blocked");
  assert.ok(noEmail.guard_refusal && noEmail.guard_refusal.code);
  const explicit = Doorstep.emitOutreachDraft(ctx, {
    draft: { to: "sam.rivera@example.test", subject: "Coffee chat — TEST University question", body: "Hi Sam,\n\nWould you have 15 minutes next week?\n\nThanks,\nMaya Rivera (TEST)" },
  });
  assertDoorstepRecord(explicit, "outreach-send");
  assert.equal(explicit.payload.draft.to, "sam.rivera@example.test");
  assert.equal(explicit.payload.sends, 0);
});
