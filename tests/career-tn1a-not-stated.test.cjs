// TN-1a — company-less detected job events (owner ruling, 2026-10-14).
//
// The conflict (BUG-2026-10-14-TN1A-CONFLICT / FR-199): the five canonical
// asks SC-122/123/124/126/127 name NO company; 141's emitTrackingLog
// refused company-less log writes (typed missing_company) and 126's
// ingest dropped company-less signals — so a detected job event for an
// unnamed company got NO tracking record at all.
//
// THE RULING (owner, 2026-10-14 ~18:33 CDT, delegated in his words):
// "just make up an answer for the tracking rule, as long as ur able to
// get every single job reporting." Ruled semantics: a tracking/reporting
// write is NEVER refused for a missing company. Every detected job gets
// its tracking record; when the source names no company, the record
// carries the company as explicitly not-stated (company: null with a
// company_not_stated marker) — never invented, never guessed.
//
// THE SCOPE LINE (encoded here as tests): the lift applies ONLY to
// tracking/reporting writes of detected job events (an inbox-detected
// signal class, or an event carried in from 126 with the not-stated
// marker). Writes that ATTRIBUTE an action to a company — a submission
// record, an application packet, an unmarked manual stage move — still
// refuse without one. Marketing noise still creates no record.
//
// Check: node --test tests/career-tn1a-not-stated.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const Doorstep = require(path.join(root, "packages/domain/141-career-doorstep.js"));
const Track = require(path.join(root, "packages/domain/126-career-track.js"));
const Profile = require(path.join(root, "packages/domain/122-career-profile.js"));

const GAUNTLET = path.join(root, "packages/career-data/fixtures/gauntlet");
const loadProfile = (dir) => Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(GAUNTLET, "profiles", dir, "profile.json"), "utf8")));
const NOW = "2026-10-14T12:00:00Z";

function doorstepCtx(store) {
  return { profile: loadProfile("p1-early-career-swe"), trackerStore: store, trackStore: store, now: NOW, resumeArtifact: { name: "resume.pdf", sha256: "a".repeat(64) } };
}

// ---------------------------------------------------------------- 141: lift
const SIGNAL_CASES = [
  ["confirmation", "Confirmed"],
  ["rejection", "Rejected"],
  ["oa_invite", "OA/assessment"],
  ["interview_invite", "Interview rounds"],
  ["offer", "Offer"],
];
for (const [eventType, stage] of SIGNAL_CASES) {
  test(`TN-1a 141: company-less inbox ${eventType} report is NOT refused — record carries company not-stated`, () => {
    const store = Track.createMemoryStore([]);
    const r = Doorstep.emitTrackingLog(doorstepCtx(store), {
      stage, event_type: eventType, source: "inbox",
      role: "Software Engineer Intern", note: `${eventType} email landed`,
      applied_at: "2026-10-10T12:00:00Z",
    });
    assert.notEqual(r.resultStatus, "blocked", `${eventType}: a detected-event report must not be refused for a missing company`);
    assert.ok(r.doorstep, `${eventType}: the turn carries the typed doorstep record`);
    assert.equal(r.doorstep.gap, null, `${eventType}: doorstep gap null (agent-drove)`);
    const p = r.payload;
    assert.equal(p.kind, "tracker_log_write", `${eventType}: payload is the log write`);
    assert.equal(p.company, null, `${eventType}: company is null — explicitly not stated, never invented`);
    assert.equal(p.company_not_stated, true, `${eventType}: payload carries the not-stated marker`);
    assert.equal(p.event && p.event.type, eventType, `${eventType}: payload event type is the 126 class`);
    assert.equal(p.event && p.event.source, "inbox", `${eventType}: payload event source is inbox`);
    assert.equal(p.stage, stage, `${eventType}: payload stage speaks 126's vocabulary`);
    const row = p.would_write && p.would_write.row;
    assert.ok(row, `${eventType}: the would-write carries the exact row`);
    assert.equal(row.company, null, `${eventType}: row company is null`);
    assert.equal(row.company_not_stated, true, `${eventType}: row carries the not-stated marker`);
    assert.equal(row.role, "Software Engineer Intern", `${eventType}: the job title is carried on the record`);
    assert.equal(row.stage, stage, `${eventType}: row stage is the detected stage`);
    assert.ok(row.events.some((e) => e.type === eventType && e.source === "inbox"), `${eventType}: the signal event rides the row with its source`);
    assert.equal(store.rows.length, 0, `${eventType}: doorstep is armed, not fired — the store is untouched`);
    assert.ok(!/null/.test(r.reply || ""), `${eventType}: the spoken reply never renders the word "null"`);
  });
}

test("TN-1a 141: a 126-shaped company-less record (application + event carrying the marker) rides through", () => {
  const rowIn = {
    app_id: "app-not-stated-t1", company: null, company_not_stated: true,
    role: "Data Intern", role_family: "", url: "", applied_at: "2026-10-09T12:00:00Z",
    resume_version: "", source: "cold", referred_by: null, fit_bucket: null,
    stage: "Submitted", offer_deadline: null, assessment_deadline: null, cooldown_until: null,
    events: [{ type: "applied", at: "2026-10-09T12:00:00Z", source: "inbox", detail: "record opened from a detected inbox event", evidence: null }],
  };
  const store = Track.createMemoryStore([rowIn]);
  const r = Doorstep.emitTrackingLog(doorstepCtx(store), {
    application: rowIn,
    event: { type: "offer", source: "inbox", at: NOW, detail: "offer detected in inbox message m-9", stage_after: "Offer" },
  });
  assert.notEqual(r.resultStatus, "blocked", "a marker-carrying 126 record must not be refused");
  assert.equal(r.payload.company, null);
  assert.equal(r.payload.company_not_stated, true);
  assert.equal(r.payload.operation, "move_stage", "the write binds to the existing not-stated row by app_id");
  assert.equal(r.payload.app_id, "app-not-stated-t1");
  assert.equal(r.payload.stage, "Offer");
});

test("TN-1a 141: a company-less detected event never hijacks an existing named row", () => {
  const store = Track.seedTestLog();
  const before = JSON.parse(JSON.stringify(store.rows));
  const r = Doorstep.emitTrackingLog(doorstepCtx(store), {
    stage: "Confirmed", event_type: "confirmation", source: "inbox", note: "Confirmation email lands",
  });
  assert.equal(r.payload.operation, "add_application", "no company named → a new not-stated record, never a move on someone else's row");
  assert.equal(r.payload.company, null);
  assert.deepEqual(store.rows, before, "the seeded rows are untouched");
});

// ------------------------------------------------------- 141: refusal stands
test("TN-1a 141: action-attribution writes still refuse without a company", () => {
  const ctx = doorstepCtx(Track.createMemoryStore([]));
  // (a) a submission record: "we applied" attributed to no company.
  const sub = Doorstep.emitTrackingLog(ctx, { stage: "Submitted", event_type: "applied", note: "submitted the application" });
  assert.equal(sub.resultStatus, "blocked", "a submission record with no company still refuses");
  assert.equal(sub.guard_refusal.code, "missing_company");
  assert.equal(sub.payload, null);
  // (b) an unmarked manual stage move (the g6 guard's shape): no detected
  // event behind it, no company to move.
  const manual = Doorstep.emitTrackingLog(ctx, { stage: "Confirmed", note: "no company named" });
  assert.equal(manual.resultStatus, "blocked", "an unmarked company-less write still refuses");
  assert.equal(manual.guard_refusal.code, "missing_company");
  // (c) a manual_update event type with no company and no detected-event marker.
  const mv = Doorstep.emitTrackingLog(ctx, { stage: "Interview rounds", event_type: "manual_update", note: "I got an interview" });
  assert.equal(mv.resultStatus, "blocked", "a manual stage move for an unnamed application still refuses");
  assert.equal(mv.guard_refusal.code, "missing_company");
  // (d) the application packet (a submission product) still refuses.
  const pkt = Doorstep.emitApplicationPacket(ctx, { jdText: "a job description with no company named" });
  assert.equal(pkt.resultStatus, "blocked", "the packet emitter still refuses without a company");
  assert.equal(pkt.guard_refusal.code, "missing_company");
});

test("TN-1a 141: a NAMED-company inbox event is unchanged — no not-stated marker anywhere", () => {
  const store = Track.createMemoryStore([]);
  const r = Doorstep.emitTrackingLog(doorstepCtx(store), {
    company: "Helios Bank (TEST)", role: "Software Engineer, Early Careers",
    stage: "Confirmed", event_type: "confirmation", source: "inbox",
    note: "Confirmation email landed for Helios", applied_at: "2026-10-10T12:00:00Z",
  });
  assert.notEqual(r.resultStatus, "blocked");
  assert.equal(r.payload.company, "Helios Bank (TEST)");
  assert.ok(!("company_not_stated" in r.payload), "named writes carry no not-stated marker");
  assert.ok(!("company_not_stated" in r.payload.would_write.row), "named rows carry no not-stated marker");
});

// ---------------------------------------------------------------- 126: ingest
test("TN-1a 126: ingest consumes a company-less offer end to end (title/source/date carried)", () => {
  const store = Track.createMemoryStore([]);
  const msg = {
    id: "m-offer-1", from: "talent@example.test", title: "Software Engineer Intern",
    subject: "Your offer letter", at: "2026-10-14T09:30:00Z",
    body: "We are pleased to offer you the Software Engineer Intern position. Please respond by October 21, 2026.",
  };
  const out = Track.ingestMessage(store, msg, { now: Date.parse(msg.at) });
  assert.equal(out.classification.class, "offer");
  assert.equal(out.classification.company, null, "the message names no company — classified honestly");
  assert.equal(out.linked, true, "the detected event is consumed, not dropped");
  assert.equal(out.moved, true, "the stage moved on the new record");
  assert.equal(out.stage_after, "Offer");
  assert.equal(out.company_not_stated, true, "the ingest result carries the marker");
  assert.equal(store.rows.length, 1, "exactly one tracking record was created");
  const row = store.rows[0];
  assert.equal(row.company, null, "row company is null — not stated, never invented");
  assert.equal(row.company_not_stated, true, "row carries the not-stated marker");
  assert.equal(row.role, "Software Engineer Intern", "the job title is carried from the message");
  assert.equal(row.stage, "Offer");
  assert.ok(row.events.some((e) => e.type === "offer" && e.source === "inbox" && e.at === "2026-10-14T09:30:00.000Z"), "the signal event rides the row with source + date");
  assert.ok(out.offer_intake && out.offer_intake.started, "offer intake started on the not-stated record");
  assert.ok(out.alert && !/null/.test(out.alert.text), "the alert text never renders the word \"null\"");
  // End to end: the store's own readers consume the company-less row.
  const sum = Track.statusSummary(store, { now: Date.parse(msg.at) });
  assert.equal(sum.total, 1, "statusSummary counts the not-stated record");
  assert.equal(sum.applications[0].company, null);
  assert.equal(Track.findByCompany(store, "Example Capital"), null, "a not-stated row is never matched to a named company");
});

test("TN-1a 126: every company-less detected job gets its OWN record", () => {
  const store = Track.createMemoryStore([]);
  const iv = { id: "m-iv-1", from: "recruiting@example.test", title: "Data Analyst", subject: "Interview invitation", at: "2026-10-13T10:00:00Z", body: "We would like to schedule a call with our team about the Data Analyst role." };
  const rj = { id: "m-rj-1", from: "talent@example.test", title: "Product Intern", subject: "Update on your application", at: "2026-10-14T08:00:00Z", body: "Unfortunately, we decided to move forward with other candidates." };
  const o1 = Track.ingestMessage(store, iv, { now: Date.parse(iv.at) });
  const o2 = Track.ingestMessage(store, rj, { now: Date.parse(rj.at) });
  assert.equal(o1.stage_after, "Interview rounds");
  assert.equal(o2.stage_after, "Rejected");
  assert.equal(store.rows.length, 2, "two detected jobs → two records, never merged into one unnamed blob");
  assert.deepEqual(store.rows.map((r) => r.role).sort(), ["Data Analyst", "Product Intern"]);
  assert.ok(store.rows.every((r) => r.company === null && r.company_not_stated === true));
  assert.ok(o2.pattern_note, "the rejection on a not-stated record still produces its pattern note");
});

test("TN-1a 126: marketing noise with no company still creates NO record", () => {
  const store = Track.createMemoryStore([]);
  const noise = { id: "m-n-1", from: "digest@jobs.example.test", subject: "Your weekly job alert digest", at: "2026-10-14T07:00:00Z", body: "Jobs you might like this week — unsubscribe anytime." };
  const out = Track.ingestMessage(store, noise, { now: Date.parse(noise.at) });
  assert.equal(out.linked, false);
  assert.equal(store.rows.length, 0, "noise never moves a stage and never opens a record");
});

test("TN-1a 126: addApplication honors the marker only when it is explicit", () => {
  const store = Track.createMemoryStore([]);
  const marked = Track.addApplication(store, { company: null, company_not_stated: true, role: "QA Intern", source: "inbox", event_source: "inbox" }, { now: Date.parse(NOW) });
  assert.equal(marked.company, null);
  assert.equal(marked.company_not_stated, true);
  assert.ok(/^app-not-stated-/.test(marked.app_id), "not-stated rows get a not-stated app_id, never a company-derived one");
  const legacy = Track.addApplication(store, { company: "Acme (TEST)", role: "SWE Intern" }, { now: Date.parse(NOW) });
  assert.equal(legacy.company, "Acme (TEST)");
  assert.ok(!("company_not_stated" in legacy), "named rows carry no marker");
});
