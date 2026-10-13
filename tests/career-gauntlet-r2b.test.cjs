// Repair lane R2B — EXECUTION GUARDS + TRUTHFUL STATUS (gauntlet deep-dive
// round 2, defects DD-1/DD-3/DD-4/DD-5/DD-6 + DD-10's false halt sentence).
// Written FAIL-FIRST against 19ba7bb: every reproduction below fails there for
// the real reason (a submission reaches the sink, or a status turn confirms
// from memory), and passes only when 141's seam refuses / re-reads.
//
// The seam contract under test (defined by this lane, consumed by Lane A):
//   doorstepState.job_status === "closed"        (or doorstepState.job_closed)
//   doorstepState.submission.status === "cancelled" (or approval_cancelled)
//   doorstepState.approval_invalidated === true  (+ invalidated_reason)
//   doorstepState.prior_applications = [{ job_id, company, role, source, ... }]
//   doorstepState.fact_version / fact_hash       (stamped at preparation)
//   profile.fact_version                         (130's counter, bumped on writes)
// State is set here as PLAIN FIELDS (exactly what Lane A's intent handlers
// will set through 141's recorder exports), so a pre-fix failure is the
// product executing on stale state — never a missing helper.
// Chat path = the pilot-lib staging order: 120 -> 130 -> 142 -> 141.
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
let Router = null;
try { Router = require(path.join(root, "packages/domain/142-career-router.js")); } catch (e) { Router = null; }
const Doorstep = require(path.join(root, "packages/domain/141-career-doorstep.js"));

function chatPath(text, ctx) {
  let r = Access.handleChat(text, ctx || {});
  if (r) return Object.assign({ handler: "120" }, r);
  r = Onboarding.handleChat(text, ctx || {});
  if (r) return Object.assign({ handler: "130" }, r);
  if (Router) { r = Router.handleChat(text, ctx || {}); if (r) return Object.assign({ handler: "142" }, r); }
  r = Doorstep.handleChat(text, ctx || {});
  if (r) return Object.assign({ handler: "141" }, r);
  return null;
}
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const loadProfile = (dir) => Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(GAUNTLET, "profiles", dir, "profile.json"), "utf8")));
const tmpSink = (name) => fs.mkdtempSync(path.join(os.tmpdir(), "r2b-" + name + "-"));
const sinkCount = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).length : 0;

function doorstepCtx(specName, sinkDir) {
  const profile = loadProfile("p1-early-career-swe");
  const resumeContent = fs.readFileSync(path.join(GAUNTLET, "profiles/p1-early-career-swe/resume.txt"), "utf8");
  return {
    profile, formSpecName: specName, sinkDir,
    resumeArtifact: { name: "resume.txt", content: resumeContent, sha256: sha256(resumeContent) },
    doorstepState: {},
  };
}
function fillToReview(ctx) {
  const r = chatPath("fill this out so i can review it", ctx);
  assert.ok(r && r.doorstep, "fill turn answered with a doorstep");
  assert.equal(r.doorstep.state, "REVIEW");
  return r;
}

// ------------------------------------------------------------------ AP22 (DD-5 / S-2)
test("AP22: status re-reads the destination — receipt removed after an accepted submit, status is UNCERTAIN, never a confirmation", () => {
  const sinkDir = tmpSink("ap22");
  const ctx = doorstepCtx("greenhouse-like.json", sinkDir);
  fillToReview(ctx);
  const submit = chatPath("approve and submit", ctx);
  assert.equal(submit.resultStatus, "completed");
  assert.equal(sinkCount(sinkDir), 1, "baseline: the accepted submit wrote exactly one receipt");
  // Grader-side fault injection (as in the deep-dive): the provider receipt
  // is removed from the destination before the status check.
  for (const f of fs.readdirSync(sinkDir)) fs.unlinkSync(path.join(sinkDir, f));
  assert.equal(sinkCount(sinkDir), 0);

  const status = chatPath("did it go through?", ctx);
  assert.ok(status, "the status turn must be answered");
  assert.equal(status.resultStatus, "unknown_outcome", "with no receipt at the destination the outcome is spoken as unknown, not completed");
  assert.match(status.reply, /uncertain|unknown|cannot confirm|can't confirm|could not confirm|no receipt/i, "reply says plainly that it cannot confirm");
  assert.doesNotMatch(status.reply, /exactly one submission is on record|confirmed with receipt/i, "no confirmation claim while the receipt is absent");
  assert.equal(sinkCount(sinkDir), 0, "the status check never blindly resubmits");
  const sub = ctx.doorstepState.submission;
  assert.notEqual(sub.status, "submitted_accepted", "in-memory state is downgraded to match the destination, not trusted");
});

test("AP22 positive control: receipt still at the destination — the same status path confirms from the re-read", () => {
  const sinkDir = tmpSink("ap22-ok");
  const ctx = doorstepCtx("greenhouse-like.json", sinkDir);
  fillToReview(ctx);
  chatPath("approve and submit", ctx);
  assert.equal(sinkCount(sinkDir), 1);
  const status = chatPath("did it go through?", ctx);
  assert.ok(status);
  assert.equal(status.resultStatus, "completed");
  assert.match(status.reply, /exactly one/i, "confirmation is spoken only because the re-read found the receipt");
  assert.equal(sinkCount(sinkDir), 1, "still exactly one receipt");
});

// ------------------------------------------------------------------ AP20 (DD-4)
test("AP20: a recorded manual-apply disclosure refuses the submit as a duplicate — zero sink writes", () => {
  const sinkDir = tmpSink("ap20");
  const ctx = doorstepCtx("greenhouse-like.json", sinkDir);
  fillToReview(ctx);
  // The disclosure, recorded in state (Lane A's handler records it through
  // 141's exports; the field is what the guard reads).
  ctx.doorstepState.prior_applications = [
    { job_id: "GAUNTLET-JOB-GH-1", company: "Acme Robotics (TEST)", role: "Software Engineer, New Grad (TEST)", source: "manual", channel: "employer site", at: "2026-10-12" },
  ];
  const submit = chatPath("approve and submit", ctx);
  assert.ok(submit, "the submit turn must be answered");
  assert.equal(sinkCount(sinkDir), 0, "no duplicate submission reaches the sink");
  assert.equal(submit.resultStatus, "blocked", "the refusal is typed honestly, not 'completed'");
  assert.ok(submit.guard_refusal, "the result carries the structured refusal");
  assert.equal(submit.guard_refusal.code, "duplicate_application");
  assert.match(submit.reply, /already|duplicate/i, "reply names the duplicate");
  assert.match(submit.reply, /track|check (the )?status|existing application/i, "reply offers the duplicate-safe next step");
  assert.doesNotMatch(submit.reply, /submitted once|submitted and confirmed/i, "no submission is claimed");
});

test("AP20: a disclosure on record before the fill stops the duplicate at preparation too", () => {
  const sinkDir = tmpSink("ap20-pre");
  const ctx = doorstepCtx("greenhouse-like.json", sinkDir);
  ctx.priorApplications = [
    { job_id: "GAUNTLET-JOB-GH-1", company: "Acme Robotics (TEST)", source: "manual", channel: "employer site", at: "2026-10-12" },
  ];
  const fill = chatPath("fill this out so i can review it", ctx);
  assert.ok(fill, "the fill turn must be answered");
  assert.equal(fill.resultStatus, "blocked", "no duplicate application is prepared");
  assert.ok(!fill.doorstep || fill.doorstep.state !== "REVIEW", "no doorstep reaches REVIEW for an already-applied job");
  assert.match(fill.reply, /already|duplicate/i);
  const submit = chatPath("approve and submit", ctx);
  assert.equal(sinkCount(sinkDir), 0, "zero submissions, end to end");
});

// ------------------------------------------------------------------ AP23 (DD-6 / S-3)
test("AP23: a fact correction through 130's write path after packet prep refuses the submit as stale", () => {
  const sinkDir = tmpSink("ap23");
  const ctx = doorstepCtx("greenhouse-like.json", sinkDir);
  const fill = fillToReview(ctx);
  assert.equal(fill.doorstep.payload.answers.work_authorization, "yes-authorized", "baseline: packet carries the pre-edit answer");
  const boundVersion = ctx.doorstepState.fact_version;
  // The user's correction, through 130's own write path (the onboarding
  // answer path is 130's profile writer): sponsorship need flips to true.
  ctx.profile._onboarding_pending = "visa";
  const ans = Onboarding.answerCurrent(ctx.profile, "I will need sponsorship in the future");
  assert.ok(ans && ans.answered === "visa", "130 recorded the correction");
  assert.equal(ctx.profile.constraints.needsSponsorship, true, "the corrected fact is on the profile");
  assert.ok(Number.isFinite(ctx.profile.fact_version), "130's write path maintains the fact version");
  assert.notEqual(ctx.profile.fact_version, boundVersion, "the correction moved the fact version past the packet's bound version");

  const submit = chatPath("approve and submit", ctx);
  assert.ok(submit, "the submit turn must be answered");
  assert.equal(sinkCount(sinkDir), 0, "nothing submits on the stale packet");
  assert.equal(submit.resultStatus, "blocked");
  assert.ok(submit.guard_refusal);
  assert.equal(submit.guard_refusal.code, "stale_packet_facts");
  assert.match(submit.reply, /invalid|re-?confirm|re-?prepare|changed|stale/i, "reply says the packet is invalidated and what re-does it");
  assert.doesNotMatch(submit.reply, /submitted once|submitted and confirmed/i);
});

test("AP23 (hash leg): a direct constraints edit with no version bump is still caught by the bound fact hash", () => {
  const sinkDir = tmpSink("ap23-hash");
  const ctx = doorstepCtx("greenhouse-like.json", sinkDir);
  fillToReview(ctx);
  // A correction that reaches the profile without 130's counter (e.g. a
  // host-side write) must still invalidate the prepared packet.
  ctx.profile.constraints.needsSponsorship = true;
  const submit = chatPath("approve and submit", ctx);
  assert.ok(submit);
  assert.equal(sinkCount(sinkDir), 0, "the stale sensitive answer never reaches the sink");
  assert.equal(submit.guard_refusal && submit.guard_refusal.code, "stale_packet_facts");
});

// ------------------------------------------------------------------ AP08 (DD-1) / AP18 (DD-3): state present, bare approve turn
test("AP08: role closed in state — a bare 'approve and submit' is refused at execution time, zero sink writes", () => {
  const sinkDir = tmpSink("ap08");
  const ctx = doorstepCtx("greenhouse-like.json", sinkDir);
  fillToReview(ctx);
  ctx.doorstepState.job_status = "closed";
  ctx.doorstepState.job_closed_reason = "employer closed the job — no longer accepting applications";
  const submit = chatPath("approve and submit", ctx);
  assert.ok(submit, "the submit turn must be answered");
  assert.equal(sinkCount(sinkDir), 0, "no submission after the closure");
  assert.equal(submit.resultStatus, "blocked");
  assert.equal(submit.guard_refusal && submit.guard_refusal.code, "job_closed");
  assert.match(submit.reply, /clos|no longer/i, "the refusal names the closure");
  assert.doesNotMatch(submit.reply, /submitted once|submitted and confirmed/i);
});

test("AP18: approval cancelled in state — a bare 'approve and submit' cannot revive it, zero sink writes", () => {
  const sinkDir = tmpSink("ap18");
  const ctx = doorstepCtx("greenhouse-like.json", sinkDir);
  fillToReview(ctx);
  ctx.doorstepState.submission.status = "cancelled";
  ctx.doorstepState.submission.cancel_reason = "user cancelled at the final submit";
  const submit = chatPath("approve and submit", ctx);
  assert.ok(submit, "the submit turn must be answered");
  assert.equal(sinkCount(sinkDir), 0, "a cancelled submission is never executed");
  assert.equal(submit.resultStatus, "blocked");
  assert.equal(submit.guard_refusal && submit.guard_refusal.code, "approval_cancelled");
  assert.match(submit.reply, /cancel/i, "the refusal names the cancellation");
  assert.doesNotMatch(submit.reply, /submitted once|submitted and confirmed/i);
});

test("invalidated approval in state — submit refused as invalidated, zero sink writes", () => {
  const sinkDir = tmpSink("inv");
  const ctx = doorstepCtx("greenhouse-like.json", sinkDir);
  fillToReview(ctx);
  ctx.doorstepState.approval_invalidated = true;
  ctx.doorstepState.invalidated_reason = "a dependent fact changed; the packet must be re-prepared";
  const submit = chatPath("approve and submit", ctx);
  assert.ok(submit);
  assert.equal(sinkCount(sinkDir), 0);
  assert.equal(submit.guard_refusal && submit.guard_refusal.code, "approval_invalidated");
  assert.match(submit.reply, /invalid|re-?prepare|re-?confirm/i);
});

// ------------------------------------------------------------------ binding stamps (S-3 surface for Lane A + re-grade)
test("binding: fill stamps the doorstep + packet prep stamps its binding with the profile fact version/hash", () => {
  const sinkDir = tmpSink("bind");
  const ctx = doorstepCtx("greenhouse-like.json", sinkDir);
  const fill = fillToReview(ctx);
  assert.ok(Number.isFinite(fill.doorstep.fact_version), "doorstep carries the bound fact version");
  assert.match(String(fill.doorstep.fact_hash || ""), /^[0-9a-f]{64}$/, "doorstep carries the bound fact hash");
  assert.equal(ctx.doorstepState.fact_version, fill.doorstep.fact_version);
  assert.equal(ctx.doorstepState.fact_hash, fill.doorstep.fact_hash);
  const binding = Doorstep.factBinding(ctx.profile);
  assert.equal(binding.fact_version, fill.doorstep.fact_version, "factBinding(profile) reproduces the stamp while facts are unchanged");
  assert.equal(binding.fact_hash, fill.doorstep.fact_hash);

  const profile = loadProfile("p1-early-career-swe");
  const backendText = "Maya Rivera (TEST) — tailored for Backend Engineer, TEST Company\nPython, SQL, Flask, SQLite. StudyBoard scheduler. SWE Intern, TEST Systems Inc, Jun-Aug 2026.\nVERSION: BACKEND\n";
  const pctx = {
    profile,
    artifacts: [{ record: "backend application materials", name: "resume.pdf", version: "backend", content: backendText }],
    packet: { company: "TEST Company", jobId: "GJ-BACKEND-1", jdText: "Backend Engineer at TEST Company. Requirements: Python and SQL required; Flask a plus. Build APIs and data export tooling." },
  };
  const prep = chatPath("prep the backend application using the backend version", pctx);
  assert.ok(prep && prep.binding, "packet prep answered with a binding");
  assert.ok(Number.isFinite(prep.binding.fact_version), "packet binding carries the fact version");
  assert.match(String(prep.binding.fact_hash || ""), /^[0-9a-f]{64}$/, "packet binding carries the fact hash");
});

// ------------------------------------------------------------------ recorder exports (Lane A's mutation surface)
test("recorders: Lane A's state mutations exist as 141 exports and the guards honor what they write", () => {
  for (const fn of ["recordJobClosure", "cancelDoorstep", "invalidateApproval", "recordPriorApplication"]) {
    assert.equal(typeof Doorstep[fn], "function", fn + " is exported for Lane A");
  }
  const sinkDir = tmpSink("rec");
  const ctx = doorstepCtx("greenhouse-like.json", sinkDir);
  fillToReview(ctx);
  Doorstep.recordPriorApplication(ctx, { job_id: "GAUNTLET-JOB-GH-1", source: "manual", channel: "employer site" });
  assert.equal(ctx.doorstepState.prior_applications.length, 1);
  assert.equal(ctx.doorstepState.prior_applications[0].job_id, "GAUNTLET-JOB-GH-1");
  const submit = chatPath("approve and submit", ctx);
  assert.equal(sinkCount(sinkDir), 0);
  assert.equal(submit.guard_refusal && submit.guard_refusal.code, "duplicate_application");

  const sink2 = tmpSink("rec2");
  const ctx2 = doorstepCtx("greenhouse-like.json", sink2);
  fillToReview(ctx2);
  Doorstep.cancelDoorstep(ctx2, { reason: "user cancelled" });
  assert.equal(ctx2.doorstepState.submission.status, "cancelled", "the cancellation is recorded in submission state (AP18-A2's field)");
  const submit2 = chatPath("approve and submit", ctx2);
  assert.equal(sinkCount(sink2), 0);
  assert.equal(submit2.guard_refusal && submit2.guard_refusal.code, "approval_cancelled");

  const sink3 = tmpSink("rec3");
  const ctx3 = doorstepCtx("greenhouse-like.json", sink3);
  fillToReview(ctx3);
  Doorstep.recordJobClosure(ctx3, { reason: "employer closed the job" });
  assert.equal(ctx3.doorstepState.job_status, "closed");
  const submit3 = chatPath("approve and submit", ctx3);
  assert.equal(sinkCount(sink3), 0);
  assert.equal(submit3.guard_refusal && submit3.guard_refusal.code, "job_closed");
});

// ------------------------------------------------------------------ DD-10: the halt sentence must be true
test("DD-10: halt reply never claims 'nothing was sent' when an item already went out", () => {
  const queueState = {
    outreach_queue: {
      halted: false,
      items: [
        { queue_id: "R2B-Q1", to: "landed@example.test", status: "sent" },
        { queue_id: "R2B-Q2", to: "pending@example.test", status: "pending" },
      ],
    },
  };
  const r = Doorstep.handleChat("stop everything", { queueState });
  assert.ok(r, "the halt turn must be answered");
  assert.equal(r.halted_count, 1, "only the pending item is halted");
  assert.doesNotMatch(r.reply, /nothing was sent/i, "one item DID go out — the reply must not deny it");
  assert.match(r.reply, /already (gone out|sent|been sent)/i, "the reply reports the landed send honestly");
  assert.equal(queueState.outreach_queue.items[1].status, "halted");
  assert.equal(queueState.outreach_queue.items[0].status, "sent", "the landed send is preserved, not rewritten");
});
