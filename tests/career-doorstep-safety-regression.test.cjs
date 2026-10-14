// Safety regression for 141-career-doorstep (Track/Negotiation fixer wave, Job 4).
// The five proven-unsafe classes live in this module and must STAY fixed:
// a stale (post-edit) approval, a cancelled approval, a closed job, a prior
// application, and a missing sink receipt must each block or downgrade —
// never submit, never confirm. Plus SC-300: haltQueue always sets the global
// pause. Engine-level: Doorstep's own exports, direct (no router).
// Check: node --test tests/career-doorstep-safety-regression.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const GAUNTLET = path.join(root, "packages/career-data/fixtures/gauntlet");
const Doorstep = require(path.join(root, "packages/domain/141-career-doorstep.js"));
const Profile = require(path.join(root, "packages/domain/122-career-profile.js"));

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const loadProfile = (dir) => Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(GAUNTLET, "profiles", dir, "profile.json"), "utf8")));
const tmpSink = (name) => fs.mkdtempSync(path.join(os.tmpdir(), "tn-safety-" + name + "-"));
const sinkCount = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).length : 0;

function filledCtx(name) {
  const sinkDir = tmpSink(name);
  const resumeContent = fs.readFileSync(path.join(GAUNTLET, "profiles/p1-early-career-swe/resume.txt"), "utf8");
  const ctx = {
    profile: loadProfile("p1-early-career-swe"),
    formSpecName: "greenhouse-like.json", sinkDir,
    resumeArtifact: { name: "resume.txt", content: resumeContent, sha256: sha256(resumeContent) },
    doorstepState: {},
  };
  const r = Doorstep.fillDoorstep(ctx);
  assert.equal(r.ok, true, "fill produced a doorstep");
  assert.equal(r.doorstep.state, "REVIEW", "filled to the final review screen");
  assert.equal(sinkCount(sinkDir), 0, "fill alone writes no receipt");
  return { ctx, sinkDir };
}

test("SAFETY-1: invalidateApproval makes a stale (post-edit) payload unsubmittable — zero sink writes", () => {
  const { ctx, sinkDir } = filledCtx("invalidate");
  Doorstep.invalidateApproval(ctx, { reason: "user edited the role answer after approval", at: "2026-10-12T13:00:00Z" });
  const r = Doorstep.submitDoorstep(ctx);
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.guard_refusal.code, "approval_invalidated");
  assert.equal(sinkCount(sinkDir), 0, "no submission reached the sink");
});

test("SAFETY-2: cancelDoorstep makes a later bare 'approve and submit' refused — zero sink writes", () => {
  const { ctx, sinkDir } = filledCtx("cancel");
  Doorstep.cancelDoorstep(ctx, { reason: "user cancelled the submission", at: "2026-10-12T13:00:00Z" });
  const r = Doorstep.submitDoorstep(ctx);
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.guard_refusal.code, "approval_cancelled");
  assert.equal(sinkCount(sinkDir), 0, "a cancelled approval cannot be revived");
});

test("SAFETY-3: recordJobClosure blocks submit for a closed job — zero sink writes", () => {
  const { ctx, sinkDir } = filledCtx("closed");
  Doorstep.recordJobClosure(ctx, { reason: "the employer closed this job", at: "2026-10-12T13:00:00Z" });
  const r = Doorstep.submitDoorstep(ctx);
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.guard_refusal.code, "job_closed");
  assert.equal(sinkCount(sinkDir), 0);
});

test("SAFETY-4: recordPriorApplication / priorApplicationFor blocks a duplicate manual application", () => {
  const { ctx, sinkDir } = filledCtx("prior");
  const entry = Doorstep.recordPriorApplication(ctx, { job_id: "GAUNTLET-JOB-GH-1", company: "Acme Robotics (TEST)", role: "Software Engineer, New Grad (TEST)", source: "manual", channel: "employer site", at: "2026-10-12" });
  assert.ok(entry && entry.job_id === "GAUNTLET-JOB-GH-1", "the recorder wrote the prior-application entry");
  const prior = Doorstep.priorApplicationFor(ctx, ctx.doorstepState, ctx.doorstepState.spec);
  assert.ok(prior, "priorApplicationFor finds the recorded application for this job");
  const r = Doorstep.submitDoorstep(ctx);
  assert.equal(r.resultStatus, "blocked");
  assert.equal(r.guard_refusal.code, "duplicate_application");
  assert.equal(sinkCount(sinkDir), 0, "no duplicate submission reached the sink");
});

test("SAFETY-5: a missing sink receipt is NEVER reported as confirmed (reconcile downgrades to unknown)", () => {
  const { ctx, sinkDir } = filledCtx("receipt");
  const submit = Doorstep.submitDoorstep(ctx);
  assert.equal(submit.resultStatus, "completed");
  assert.equal(sinkCount(sinkDir), 1, "baseline: the accepted submit wrote exactly one receipt");
  // The receipt vanishes at the destination (provider-side loss).
  for (const f of fs.readdirSync(sinkDir)) fs.unlinkSync(path.join(sinkDir, f));
  const sink = Doorstep.readSinkReceipts(ctx, ctx.doorstepState);
  assert.ok(sink && Array.isArray(sink.receipts) && sink.receipts.length === 0, "readSinkReceipts reports the empty sink honestly");
  const dest = Doorstep.destinationStatus(ctx, ctx.doorstepState);
  assert.equal(dest.checked, true); assert.equal(dest.found, false);
  const r = Doorstep.reconcileDoorstep(ctx);
  assert.equal(r.resultStatus, "unknown_outcome", "missing receipt => uncertain, never confirmed");
  assert.match(r.reply, /cannot confirm|uncertain|no receipt/i);
  assert.doesNotMatch(r.reply, /exactly one submission is on record|confirmed with receipt/i);
  assert.equal(sinkCount(sinkDir), 0, "reconcile never blindly resubmits");
  assert.equal(ctx.doorstepState.submission.status, "unknown_outcome", "in-memory state is downgraded to match the destination");
});

test("SAFETY-5b positive control: receipt present at the destination — reconcile confirms from the re-read", () => {
  const { ctx, sinkDir } = filledCtx("receipt-ok");
  Doorstep.submitDoorstep(ctx);
  assert.equal(sinkCount(sinkDir), 1);
  const r = Doorstep.reconcileDoorstep(ctx);
  assert.equal(r.resultStatus, "completed");
  assert.match(r.reply, /exactly one/i);
  assert.equal(sinkCount(sinkDir), 1, "still exactly one receipt — no duplicate");
});

test("SAFETY-6 SC-300: haltQueue sets the global pause on every surface and halts pending items only", () => {
  const state = { outreach_queue: { items: [
    { queue_id: "q1", status: "pending", to: "a@example.test" },
    { queue_id: "q2", status: "sent", to: "b@example.test" },
  ] } };
  const ctx = { queueState: state, userId: "user-1", now: "2026-10-12T12:00:00Z" };
  const r = Doorstep.haltQueue(ctx, "stop everything");
  assert.equal(r.global_pause_set, true);
  assert.ok(ctx.globalPause && ctx.globalPause.set === true, "pause set on ctx");
  assert.ok(state.global_pause && state.global_pause.set === true, "pause set on the persisted queue state");
  assert.equal(state.outreach_queue.items[0].status, "halted", "pending item halted");
  assert.equal(state.outreach_queue.items[1].status, "sent", "an already-sent item is left marked sent, never rewritten");
  assert.equal(r.counts_verified, true); assert.equal(r.halted_count, 1); assert.equal(r.queue_total, 2);
});

test("SAFETY-6b SC-300: haltQueue with an unreadable queue still sets the global pause (never a no-op)", () => {
  const ctx = { userId: "user-1", now: "2026-10-12T12:00:00Z" };
  const r = Doorstep.haltQueue(ctx, "stop everything");
  assert.equal(r.global_pause_set, true);
  assert.ok(ctx.globalPause && ctx.globalPause.set === true);
  assert.equal(r.counts_verified, false, "exact counts are stated unverified, not invented");
});
