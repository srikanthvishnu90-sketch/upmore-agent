// Repair lane R3 — chat action seams (C03 profile write, C15 packet binding,
// C17/C18/C20 doorstep form seam, C37 queue halt). Written BEFORE the repair:
// every test here fails on the pre-repair build (ba708c1 / 8ef1364) because the
// chat path returns null for every one of these user turns.
// Chat path under test = the product order (120 access -> 130 onboarding ->
// 141 doorstep hook), the hook being the registration R3 ships for the
// coordinator to wire. C03 additionally asserts 130 alone handles its turn,
// since the profile write path lives in 130 by lane ownership.
// Fixtures only; form writes go only to tmp receipt sinks; no real sends.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const GAUNTLET = path.join(root, "packages/career-data/fixtures/gauntlet");

const Access = require(path.join(root, "packages/domain/120-career-access.js"));
const Onboarding = require(path.join(root, "packages/domain/130-career-onboarding.js"));
const Profile = require(path.join(root, "packages/domain/122-career-profile.js"));
let Doorstep = null;
try { Doorstep = require(path.join(root, "packages/domain/141-career-doorstep.js")); } catch (e) { Doorstep = null; }

function chatPath(text, ctx) {
  let r = Access.handleChat(text, ctx || {});
  if (r) return Object.assign({ handler: "120" }, r);
  r = Onboarding.handleChat(text, ctx || {});
  if (r) return Object.assign({ handler: "130" }, r);
  if (Doorstep && typeof Doorstep.handleChat === "function") {
    r = Doorstep.handleChat(text, ctx || {});
    if (r) return Object.assign({ handler: "141" }, r);
  }
  return null;
}
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const loadProfile = (dir) => Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(GAUNTLET, "profiles", dir, "profile.json"), "utf8")));
const tmpSink = (name) => fs.mkdtempSync(path.join(os.tmpdir(), "r3-" + name + "-"));
const sinkCount = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).length : 0;

function doorstepCtx(specName, sinkDir) {
  const profile = loadProfile("p1-early-career-swe");
  const resumeContent = fs.readFileSync(path.join(GAUNTLET, "profiles/p1-early-career-swe/resume.txt"), "utf8");
  return {
    profile,
    formSpecName: specName,
    sinkDir,
    resumeArtifact: { name: "resume.txt", content: resumeContent, sha256: sha256(resumeContent) },
    doorstepState: {},
  };
}

// ------------------------------------------------------------------ C03
test("C03: 'use the new one' via chat updates the profile with precedence + audit, rebuilds dependents, and post-restart recall answers 2014", () => {
  if (Onboarding._resetCorrectionStore) Onboarding._resetCorrectionStore();
  const profile = loadProfile("p4-experienced-product");
  // Pilot-shaped ctx: profile only (the pilot runner passes exactly this).
  const turn1 = Onboarding.handleChat("use the new one, old resume's wrong", { profile });
  assert.ok(turn1, "130 must answer the correction turn, not return null");
  assert.equal(turn1.intent, "profile_correction");
  assert.equal(turn1.resultStatus, "completed");
  assert.equal(profile.constraints.graduationDate, "2014", "graduation date resolves to the NEW resume's value");
  const audit = profile.profile_corrections || profile._correction_audit || [];
  assert.ok(audit.length >= 1, "an audit entry for the correction is kept on the profile");
  assert.match(JSON.stringify(audit), /resume-new/, "audit names the winning source");
  const f1 = profile.facts.find((f) => f.id === "P4-F-001");
  const f2 = profile.facts.find((f) => f.id === "P4-F-002");
  assert.equal(f1.needs_confirmation, false, "graduation conflict confirmed by the user's instruction");
  assert.equal(f2.needs_confirmation, false, "employment-dates conflict confirmed by the user's instruction");
  assert.match(String(f2.text || "") + String(f2.title || ""), /2016/, "employment fact carries the NEW range");
  const rebuilt = profile.dependent_state || profile._dependent_rebuild || {};
  assert.equal(rebuilt.rebuilt, true, "dependent eligibility/materials state is rebuilt on the new facts");

  // Simulated restart: a FRESH load of the fixture profile (pilot semantics).
  const profile2 = loadProfile("p4-experienced-product");
  const turn2 = chatPath("what's my graduation year?", { profile: profile2 });
  assert.ok(turn2 && turn2.reply, "post-restart recall must reply");
  assert.match(turn2.reply, /2014/, "post-restart answer comes from the NEW facts");
  assert.doesNotMatch(turn2.reply, /do not have your graduation date/i);
});

// ------------------------------------------------------------------ C17
test("C17: chat fills the Greenhouse-like replica to REVIEW, not submitted, with step log + payload snapshot + sink-armed dry validation", () => {
  assert.ok(Doorstep, "141-career-doorstep.js must exist");
  const sinkDir = tmpSink("c17");
  const ctx = doorstepCtx("greenhouse-like.json", sinkDir);
  const r = chatPath("fill this out so i can review it", ctx);
  assert.ok(r, "the fill turn must be answered");
  assert.equal(r.intent, "doorstep_fill");
  assert.equal(r.resultStatus, "prepared");
  const d = r.doorstep;
  assert.ok(d, "result carries the doorstep proof chain");
  assert.equal(d.state, "REVIEW", "stops ON the final review screen");
  assert.equal(d.submitted, false);
  assert.equal(sinkCount(sinkDir), 0, "nothing submitted at the doorstep");
  assert.match(r.reply, /not submitted/i, "reply states it is not submitted");
  // Every filled field is stepped with a value source.
  const filledFields = d.step_log.filter((s) => s.action === "fill").map((s) => s.field);
  for (const f of ["full_name", "email", "work_authorization", "start_date", "graduation_date", "resume_upload"]) {
    assert.ok(filledFields.includes(f), "step log records a fill for " + f);
    const step = d.step_log.find((s) => s.field === f);
    assert.ok(step.value_source && step.value_source !== "guessed", f + " carries a value source");
  }
  // Values come from the profile in ctx (P1 gauntlet profile).
  assert.equal(d.payload.answers.full_name, ctx.profile.basics.name);
  assert.equal(d.payload.answers.graduation_date, "2027-05");
  assert.equal(d.payload.answers.work_authorization, "yes-authorized");
  assert.equal(d.payload.resume_sha256, ctx.resumeArtifact.sha256, "payload snapshot binds the resume artifact by sha256");
  assert.equal(d.payload.payload_sha256, sha256(JSON.stringify(d.payload.answers)), "payload snapshot hash matches its answers");
  // Unknown / user-authored answers are asks, never guessed.
  assert.ok(d.asks.some((a) => a.field === "why_company"), "why_company is surfaced as an ask");
  assert.equal(d.payload.answers.why_company, undefined, "why_company is not invented");
  // Sink-armed verification: driver dry-validate of the exact payload, no submission.
  assert.equal(d.sink_armed, true, "dry validation passes on the exact payload");
  assert.equal(d.dry_validate.ok, true);
  assert.deepEqual(d.dry_validate.missing, []);
});

test("C17 seam: a profile with no phone surfaces phone as an ask instead of guessing it", () => {
  assert.ok(Doorstep, "141-career-doorstep.js must exist");
  const sinkDir = tmpSink("c17b");
  const ctx = doorstepCtx("greenhouse-like.json", sinkDir);
  ctx.profile.basics.phone = null;
  const r = chatPath("fill this out so i can review it", ctx);
  assert.ok(r && r.doorstep);
  assert.ok(r.doorstep.asks.some((a) => a.field === "phone"), "unknown phone becomes an ask");
  assert.equal(r.doorstep.payload.answers.phone, undefined);
});

// ------------------------------------------------------------------ C18
test("C18: chat fill of the Ashby-like replica STOPS on the unresolved sensitive hidden default", () => {
  assert.ok(Doorstep, "141-career-doorstep.js must exist");
  const sinkDir = tmpSink("c18");
  const ctx = doorstepCtx("ashby-like.json", sinkDir);
  const r = chatPath("just use my profile", ctx);
  assert.ok(r, "the fill turn must be answered");
  assert.equal(r.doorstep.stop_code, "UNRESOLVED_HIDDEN_DEFAULT", "the product itself stops on the hidden default");
  assert.equal(r.resultStatus, "awaiting_user");
  assert.equal(r.doorstep.submitted, false);
  assert.equal(sinkCount(sinkDir), 0);
  // The reversed EEO gender field is answered EXPLICITLY from the stored
  // decline-to-answer preference — the hidden 'male' default never stands.
  assert.equal(r.doorstep.payload.answers.eeo_gender_reversed, "decline-to-answer");
  // The hidden pre-checked consent is never answered for the user: it is an ask.
  assert.ok(r.doorstep.asks.some((a) => a.field === "background_check_consent"), "consent is surfaced as an ask");
  assert.equal(r.doorstep.payload.answers.background_check_consent, undefined, "consent is never guessed");
  // The terminal step of the step log IS the stop.
  const last = r.doorstep.step_log[r.doorstep.step_log.length - 1];
  assert.equal(last.action, "stop");
  assert.equal(last.code, "UNRESOLVED_HIDDEN_DEFAULT");
  assert.match(r.reply, /stopped/i, "reply says the flow stopped");
});

// ------------------------------------------------------------------ C20
test("C20: doorstep -> approve-and-submit -> timeout reported unknown -> 'did it go through?' reconciles BEFORE any retry, exactly one receipt", () => {
  assert.ok(Doorstep, "141-career-doorstep.js must exist");
  const sinkDir = tmpSink("c20");
  const ctx = doorstepCtx("workday-like.json", sinkDir);
  const fill = chatPath("fill this out so i can review it", ctx);
  assert.ok(fill && fill.doorstep, "fill turn answered with a doorstep");
  assert.equal(fill.doorstep.state, "REVIEW");

  const submit = chatPath("approve and submit", ctx);
  assert.ok(submit, "the approve-and-submit turn must be answered");
  assert.equal(submit.resultStatus, "unknown_outcome", "the sink timeout is reported honestly as unknown");
  assert.doesNotMatch(submit.reply, /submitted successfully|has been submitted/i, "no false completion claim after a timeout");
  assert.equal(sinkCount(sinkDir), 1, "the sink holds exactly one receipt after the timed-out submit");

  const dup = chatPath("approve and submit", ctx);
  assert.ok(dup, "a repeat approve turn is answered, not silently re-executed");
  assert.equal(sinkCount(sinkDir), 1, "a repeat approve cannot create a second submission while the outcome is unknown");

  const status = chatPath("did it go through?", ctx);
  assert.ok(status, "the status question must be answered");
  assert.equal(status.doorstep.submission.status, "confirmed_after_reconcile");
  assert.equal(status.doorstep.submission.reconciled_before_retry, true, "reconcile ran before any retry");
  assert.equal(status.doorstep.submission.retries, 0, "no retry was needed or taken");
  assert.equal(sinkCount(sinkDir), 1, "still exactly one receipt — zero duplicates");
  assert.match(status.reply, /exactly one|one submission/i, "reply confirms exactly one submission");
});

// ------------------------------------------------------------------ C37
test("C37: 'stop everything' via chat halts the queue, PERSISTS across restart, and duplicate/out-of-order events revive nothing", () => {
  assert.ok(Doorstep, "141-career-doorstep.js must exist");
  const dir = tmpSink("c37");
  const statePath = path.join(dir, "setup-state.json");
  const setup = JSON.parse(fs.readFileSync(path.join(root, "scripts/career/gauntlet/cases/fixtures/c37-setup.json"), "utf8"));
  fs.writeFileSync(statePath, JSON.stringify(setup, null, 2) + "\n");
  const ctx = { profile: loadProfile("p1-early-career-swe"), queueStatePath: statePath };
  const r = chatPath("stop everything. don't contact anyone", ctx);
  assert.ok(r, "the stop turn must be answered");
  assert.equal(r.intent, "queue_halt");
  assert.equal(r.resultStatus, "completed");
  assert.match(r.reply, /3/, "reply states how many items were stopped");
  assert.match(r.reply, /nothing (was|has been) sent|no sends|nothing irreversible/i, "reply states accurately that nothing irreversible exists");

  // Restart: re-read the persisted state from disk in a fresh load.
  const after = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.equal(after.outreach_queue.halted, true, "the halt itself is persisted");
  assert.ok(after.outreach_queue.items.every((i) => i.status === "halted"), "every pending item is halted in the persisted state");

  // Duplicate (GT-07 shape: same event_id twice) + out-of-order (GT-08 shape:
  // an older confirmation arriving late) events cannot revive anything.
  const ev1 = Doorstep.applyQueueEvent(after, { event_id: "GT-07-evt-1", type: "delivery_confirmation", queue_id: "C37-Q1", sent_at: "2026-10-12T09:00:00Z" });
  assert.equal(ev1.applied, false, "an event against a halted item is not applied");
  const ev1dup = Doorstep.applyQueueEvent(after, { event_id: "GT-07-evt-1", type: "delivery_confirmation", queue_id: "C37-Q1", sent_at: "2026-10-12T09:00:00Z" });
  assert.equal(ev1dup.deduped, true, "the duplicate delivery is deduped by event_id");
  const ev2 = Doorstep.applyQueueEvent(after, { event_id: "GT-08-evt-1", type: "status_update", queue_id: "C37-Q2", status: "pending", sent_at: "2026-10-10T09:00:00Z" });
  assert.equal(ev2.applied, false, "an out-of-order older event cannot rewind a halted item to pending");
  assert.ok(after.outreach_queue.items.every((i) => i.status === "halted"), "queue stays halted after both events");
  assert.equal(after.outreach_queue.items.filter((i) => i.status === "pending").length, 0);
});

// ------------------------------------------------------------------ C15
test("C15: packet prep via chat binds the BACKEND resume.pdf by content hash (133 called, not edited)", () => {
  assert.ok(Doorstep, "141-career-doorstep.js must exist");
  const profile = loadProfile("p1-early-career-swe");
  const backendText = "Maya Rivera (TEST) — tailored for Backend Engineer, TEST Company\nPython, SQL, Flask, SQLite. StudyBoard scheduler. SWE Intern, TEST Systems Inc, Jun-Aug 2026.\nVERSION: BACKEND\n";
  const dataText = "Maya Rivera (TEST) — tailored for Data Engineer, TEST Company\nPython, SQL, ETL fundamentals. StudyBoard scheduler. SWE Intern, TEST Systems Inc, Jun-Aug 2026.\nVERSION: DATA\n";
  const ctx = {
    profile,
    artifacts: [
      { record: "backend application materials", name: "resume.pdf", version: "backend", content: backendText },
      { record: "data application materials", name: "resume.pdf", version: "data", content: dataText },
    ],
    packet: { company: "TEST Company", jobId: "GJ-BACKEND-1", jdText: "Backend Engineer at TEST Company. Requirements: Python and SQL required; Flask a plus. Build APIs and data export tooling." },
  };
  const r = chatPath("prep the backend application using the backend version", ctx);
  assert.ok(r, "the packet-prep turn must be answered");
  assert.equal(r.intent, "packet_prep");
  assert.equal(r.resultStatus, "prepared");
  assert.ok(r.packet && r.packet.ok, "133 assemblePacket produced a packet");
  assert.equal(r.binding.version, "backend");
  assert.equal(r.binding.name, "resume.pdf");
  assert.equal(r.binding.sha256, sha256(backendText), "the bound artifact is the BACKEND one, proven by content hash");
  assert.notEqual(r.binding.sha256, sha256(dataText), "the same-named DATA artifact is not bound");
  assert.equal(r.review.company, "TEST Company", "review surface shows the correct job");
  assert.equal(r.review.bound_sha256, sha256(backendText), "review surface shows the bound document identity");
});
