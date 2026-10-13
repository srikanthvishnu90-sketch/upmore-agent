// Feature lane G2 — DOORSTEP FILL SURFACING (APD-1, gauntlet deep-dive AP13).
// Written FAIL-FIRST against b7d9f83: on that build 141's fill loop skips the
// review step (`if (step.kind === "review") continue`), so the Lever-like
// form's late material field (export_control_declaration) is flagged by 141's
// own dry validation yet never surfaced as an ask at fill; the user meets it
// only by attempting to submit, and learns it as the raw code
// LATE_MATERIAL_QUESTION in the reply (AP13 record, trial-1:
// asks_at_fill=[], delivered submit reply "...(LATE_MATERIAL_QUESTION)...").
//
// The contract under test (one state machine in 141 only):
//   fill -> collect EVERY dry-validation blocker (late-material questions,
//   hidden defaults, missing required fields) -> surface each as a
//   plain-language ask -> resume (user supplies the answer through the
//   user-supplied fact channel / a corrected profile) -> REVIEW only when
//   blockers are cleared, or explicitly STOPPED on a sensitive hidden
//   default (the preserved C18 shape). A submit attempt with open blockers
//   refuses, naming the blockers in plain words, with an honest typed
//   result_status and NO internal code in any reply.
//
// Chat path = the AP runner's staging order: 120 -> 130 -> 142 -> 141.
// Fixtures only; form writes go only to tmp receipt sinks; no real submits.
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
const Router = require(path.join(root, "packages/domain/142-career-router.js"));
const Doorstep = require(path.join(root, "packages/domain/141-career-doorstep.js"));
const Oracle = require(path.join(root, "scripts/career/reply-oracle.cjs"));

function chatPath(text, ctx) {
  let r = Access.handleChat(text, ctx || {});
  if (r) return Object.assign({ handler: "120" }, r);
  r = Onboarding.handleChat(text, ctx || {});
  if (r) return Object.assign({ handler: "130" }, r);
  r = Router.handleChat(text, ctx || {});
  if (r) return Object.assign({ handler: "142" }, r);
  r = Doorstep.handleChat(text, ctx || {});
  if (r) return Object.assign({ handler: "141" }, r);
  return null;
}
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const loadProfile = (dir) => Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(GAUNTLET, "profiles", dir, "profile.json"), "utf8")));
const tmpSink = (name) => fs.mkdtempSync(path.join(os.tmpdir(), "g2-" + name + "-"));
const sinkCount = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).length : 0;

// Every user-visible reply in this lane must pass the reply oracle AND carry
// no internal code of any shape: no SNAKE_CAPS driver/guard code, no
// snake_case field id. Structured codes live on result objects, never prose.
function assertPlain(reply, resultStatus) {
  assert.equal(typeof reply, "string", "a reply is delivered");
  const oracle = Oracle.checkText(reply, { resultStatus });
  assert.deepEqual(oracle.failures, [], "reply passes the reply oracle (jargon/code patterns): " + reply);
  assert.doesNotMatch(reply, /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/, "no SNAKE_CAPS internal code in the reply: " + reply);
  assert.doesNotMatch(reply, /LATE_MATERIAL_QUESTION|UNRESOLVED_HIDDEN_DEFAULT|MISSING_REQUIRED/, "no driver stop code in the reply: " + reply);
  assert.doesNotMatch(reply, /\b[a-z]+(?:_[a-z]+)+\b/, "no snake_case field id in the reply: " + reply);
}

// AP13's exact pilot-lib formCtx shape (run-deepdive-ap.cjs formCtx):
// P1 profile, resumeArtifact named resume.pdf over the P1 resume text.
function ap13Ctx(sinkDir) {
  const profile = loadProfile("p1-early-career-swe");
  const resumeContent = fs.readFileSync(path.join(GAUNTLET, "profiles/p1-early-career-swe/resume.txt"), "utf8");
  return {
    profile, formSpecName: "lever-like.json", sinkDir,
    resumeArtifact: { name: "resume.pdf", content: resumeContent, sha256: sha256(resumeContent) },
    doorstepState: {},
  };
}
function formCtx(specName, sinkDir, profile) {
  const p = profile || loadProfile("p1-early-career-swe");
  const resumeContent = fs.readFileSync(path.join(GAUNTLET, "profiles/p1-early-career-swe/resume.txt"), "utf8");
  return {
    profile: p, formSpecName: specName, sinkDir,
    resumeArtifact: { name: "resume.txt", content: resumeContent, sha256: sha256(resumeContent) },
    doorstepState: {},
  };
}

// ------------------------------------------------------------------ AP13
test("AP13 (APD-1): the late material declaration is surfaced as a plain ask AT FILL, before any submit turn", () => {
  const sinkDir = tmpSink("ap13");
  const ctx = ap13Ctx(sinkDir);
  const fill = chatPath("fill this out so i can review it", ctx);
  assert.ok(fill && fill.doorstep, "the fill turn is answered with a doorstep");
  const d = fill.doorstep;

  // Detection in state is unchanged (AP13-A1, pre-existing): dry validation
  // flags the declaration as late material / missing on the exact payload.
  assert.equal(d.dry_validate.ok, false);
  assert.ok(d.dry_validate.late_material_unacknowledged.includes("export_control_declaration"), "dry validation still flags the late field");
  assert.ok(d.dry_validate.missing.includes("export_control_declaration"));

  // AP13-A2, the defect: the fill itself surfaces it as an ask.
  assert.ok(d.asks.some((a) => a.field === "export_control_declaration"), "asks at fill include export_control_declaration, got: " + JSON.stringify(d.asks.map((a) => a.field)));
  assert.ok(Array.isArray(d.blockers), "the doorstep carries its collected blockers");
  assert.ok(d.blockers.some((b) => b.field === "export_control_declaration"), "blockers include the late declaration");
  assert.match(fill.reply, /export control|declaration/i, "the fill reply names the declaration as still needed, in plain words");
  assertPlain(fill.reply, fill.resultStatus);

  // The state machine has NOT reached the review screen: blockers are open.
  assert.notEqual(d.state, "REVIEW", "REVIEW is reached only when blockers are cleared (or explicitly stopped-on)");
  assert.equal(d.sink_armed, false, "the sink is not armed while a blocker is open");
  assert.equal(fill.resultStatus, "awaiting_user", "the fill's typed status is honest: waiting on the user, not 'prepared'");
  assert.equal(d.payload.answers.export_control_declaration, undefined, "the legal declaration is never answered on the user's behalf");
  assert.equal(sinkCount(sinkDir), 0, "nothing submitted at fill");
});

test("AP13 (APD-1): 'approve and submit' with the declaration still open refuses in plain words — no code, no receipt", () => {
  const sinkDir = tmpSink("ap13-submit");
  const ctx = ap13Ctx(sinkDir);
  chatPath("fill this out so i can review it", ctx);
  const submit = chatPath("approve and submit", ctx);
  assert.ok(submit, "the submit turn is answered");
  assert.equal(sinkCount(sinkDir), 0, "sink receipts stay 0 while the late field is unresolved (AP13-A3)");
  assert.equal(submit.resultStatus, "awaiting_user", "the refusal is typed honestly (waiting on the user's own answer)");
  assert.equal(submit.stop_code, "LATE_MATERIAL_QUESTION", "the structured stop code survives on the result object — it is only the reply that must not carry it");
  assert.match(submit.reply, /stop/i, "the submit reply states a stop (AP13-A4)");
  assert.match(submit.reply, /nothing was submitted/i, "the submit reply states nothing was submitted (AP13-A4)");
  assert.match(submit.reply, /export control|declaration/i, "the refusal names the blocker in plain words, not as a code");
  assertPlain(submit.reply, submit.resultStatus);
  assert.notEqual(ctx.doorstepState.submission.status, "submitted_accepted", "no submission is recorded");
});

test("AP13 resume: when the user supplies their own declaration answer, a re-fill clears the blocker and reaches REVIEW; the approved submit then lands exactly once", () => {
  const sinkDir = tmpSink("ap13-resume");
  const ctx = ap13Ctx(sinkDir);
  const blocked = chatPath("fill this out so i can review it", ctx);
  assert.notEqual(blocked.doorstep.state, "REVIEW", "baseline: blocked before the answer");
  // The user's own answer, through the user-supplied fact channel 141's
  // resolver already reads for other fields (ctx.formFacts) — never a guess.
  ctx.formFacts = { export_control_declaration: true };
  const resumed = chatPath("fill this out so i can review it", ctx);
  assert.ok(resumed && resumed.doorstep, "the resume fill is answered");
  assert.equal(resumed.doorstep.state, "REVIEW", "blockers cleared: the flow now reaches the final review screen");
  assert.equal(resumed.resultStatus, "prepared");
  assert.equal(resumed.doorstep.dry_validate.ok, true, "dry validation passes on the completed payload");
  assert.deepEqual(resumed.doorstep.blockers, [], "no blockers remain");
  assert.equal(resumed.doorstep.sink_armed, true);
  assertPlain(resumed.reply, resumed.resultStatus);

  const submit = chatPath("approve and submit", ctx);
  assert.equal(submit.resultStatus, "completed");
  assert.equal(sinkCount(sinkDir), 1, "exactly one receipt after the blocker was resolved and approved");
  assertPlain(submit.reply, submit.resultStatus);
});

// ------------------------------------------------------- every blocker kind
test("missing required field (AP21 shape): the start date is collected as a blocker ask at fill and the submit refusal names it plainly", () => {
  const sinkDir = tmpSink("missing");
  const profile = loadProfile("p1-early-career-swe");
  delete profile.constraints.startDate; // the AP21 case setup, on the clone only
  const ctx = formCtx("greenhouse-like.json", sinkDir, profile);
  const fill = chatPath("fill this out so i can review it", ctx);
  assert.ok(fill && fill.doorstep);
  assert.ok(fill.doorstep.asks.some((a) => a.field === "start_date"), "start date is an ask at fill");
  assert.ok(fill.doorstep.blockers.some((b) => b.field === "start_date"), "start date is a collected blocker");
  assert.match(fill.reply, /start date/i, "the fill reply names the start date in plain words");
  assert.notEqual(fill.doorstep.state, "REVIEW", "a missing required field means no review screen yet");
  assert.equal(fill.doorstep.sink_armed, false);
  assert.equal(fill.resultStatus, "awaiting_user");
  assertPlain(fill.reply, fill.resultStatus);

  const submit = chatPath("approve and submit", ctx);
  assert.equal(sinkCount(sinkDir), 0, "an incomplete form never reaches the sink");
  assert.equal(submit.resultStatus, "awaiting_user");
  assert.match(submit.reply, /nothing was submitted/i);
  assert.match(submit.reply, /start date/i, "the refusal names the missing field in plain words");
  assertPlain(submit.reply, submit.resultStatus);

  // Resume: the user supplies the missing fact on their profile; re-fill clears it.
  profile.constraints.startDate = "2027-06";
  const resumed = chatPath("fill this out so i can review it", ctx);
  assert.equal(resumed.doorstep.state, "REVIEW", "with the missing fact supplied, the flow reaches review");
  assert.equal(resumed.doorstep.dry_validate.ok, true);
});

test("hidden default (C18 shape, preserved): the Ashby fill still STOPs on the sensitive hidden default, names it plainly, and a submit attempt refuses the same way", () => {
  const sinkDir = tmpSink("hidden");
  const ctx = formCtx("ashby-like.json", sinkDir);
  const fill = chatPath("just use my profile", ctx);
  assert.ok(fill && fill.doorstep, "the fill turn is answered");
  // Preserved round-2 / C18 structured shape: the stop code lives on the
  // doorstep object, the state is STOPPED, the typed status is awaiting_user.
  assert.equal(fill.doorstep.state, "STOPPED");
  assert.equal(fill.doorstep.stop_code, "UNRESOLVED_HIDDEN_DEFAULT", "the structured stop code is not regressed");
  assert.equal(fill.resultStatus, "awaiting_user");
  assert.ok(fill.doorstep.blockers.some((b) => b.field === "background_check_consent"), "the hidden default is a collected blocker");
  assert.match(fill.reply, /stopped/i, "the reply says the flow stopped");
  assert.match(fill.reply, /background check consent/i, "the reply names the hidden-default field in plain words");
  assertPlain(fill.reply, fill.resultStatus);
  assert.equal(sinkCount(sinkDir), 0);

  const submit = chatPath("approve and submit", ctx);
  assert.ok(submit, "the submit turn is answered");
  assert.equal(sinkCount(sinkDir), 0, "nothing submits past an unresolved hidden default");
  assert.equal(submit.resultStatus, "awaiting_user");
  assert.match(submit.reply, /nothing was submitted/i);
  assert.match(submit.reply, /background check consent/i, "the refusal names the blocker in plain words");
  assertPlain(submit.reply, submit.resultStatus);
});

// ------------------------------------------------------------- clean control
test("clean control (C17 shape, preserved): a form with no dry-validation blockers still reaches REVIEW as 'prepared' and submits exactly once on approval", () => {
  const sinkDir = tmpSink("clean");
  const ctx = formCtx("greenhouse-like.json", sinkDir);
  const fill = chatPath("fill this out so i can review it", ctx);
  assert.ok(fill && fill.doorstep);
  assert.equal(fill.doorstep.state, "REVIEW");
  assert.equal(fill.resultStatus, "prepared");
  assert.deepEqual(fill.doorstep.blockers, [], "optional asks (e.g. the user's own-words answer) are not blockers");
  assert.equal(fill.doorstep.sink_armed, true);
  assertPlain(fill.reply, fill.resultStatus);
  const submit = chatPath("approve and submit", ctx);
  assert.equal(submit.resultStatus, "completed");
  assert.equal(sinkCount(sinkDir), 1, "the unblocked path is unchanged");
  assertPlain(submit.reply, submit.resultStatus);
});
