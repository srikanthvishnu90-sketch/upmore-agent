// W6 guard — BUG-080 (generic closer) + BUG-081..BUG-086 (composer-table
// rows 19-41 in 141, still open at 6c0ab5e).
//
// BUG-080: the H-12 delivery seam (142's ensureNextStepText + pilot-lib's
// ensureEnding, landed as composer §1a/§1b) appends the GENERIC closer
// "Tell me what you'd like to do next." whenever the last sentence carries
// no H-12 token — even when the reply already ends with a specific next
// step (a question, or a task-specific imperative). The reply-judge
// re-pass found the generic line in 143/278 final replies and rowed it as
// a defect in 39; it single-handedly flipped SC-209 PASS -> FAIL.
//
// The rule this file pins (composer level, module 140):
//   - a reply ends with the HANDLER'S specific next step when one exists;
//   - the generic closer may be appended ONLY when the reply carries no
//     next step at all (the H-12 guarantee survives for bare endings);
//   - the generic line is never appended after a reply that already ends
//     with a question or a task-specific imperative;
//   - a generic closer already stamped over a specific ending is REMOVED.
//
// Rows: each 141 row test drives the REAL 141 function, pushes its reply
// through the real delivery pipeline (140 composeText) and grades it with
// grader-v2's own checks (the composer table's method). Rows the audit
// found already fixed at 6c0ab5e (21, 22, 32, 33, 42; 140 rows 55/56/58)
// are pinned as regression controls; row 57 is the flagged deliberate
// exclusion and is pinned byte-identical instead of "fixed".
"use strict";
process.env.HARNESS_OUT_DIR = process.env.HARNESS_OUT_DIR || "/tmp/w6-closer-harness";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const Reply = require(path.join(ROOT, "packages/domain/140-career-reply.js"));
const Doorstep = require(path.join(ROOT, "packages/domain/141-career-doorstep.js"));
const Profile = require(path.join(ROOT, "packages/domain/122-career-profile.js"));
const Grader = require(path.join(ROOT, "scripts/career/gauntlet/grader-v2.cjs"));
const L = require(path.join(ROOT, "scripts/career/gauntlet/pilot-lib.cjs"));

const GENERIC = "Tell me what you'd like to do next.";
const GAUNTLET = path.join(ROOT, "packages/career-data/fixtures/gauntlet");
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const loadProfile = (dir) => Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(GAUNTLET, "profiles", dir, "profile.json"), "utf8")));
const tmpDir = (name) => fs.mkdtempSync(path.join(os.tmpdir(), "w6-" + name + "-"));

// The composer table's method: string -> 140 composeText -> grader-v2 checks.
function grade(text, events) {
  const bubbles = Reply.composeText(text);
  const rec = { delivered_messages: bubbles, state: { events: events || [] }, family: "Apply" };
  const one = (r) => (Array.isArray(r) ? r : [r]);
  return {
    bubbles,
    H12: one(Grader.checks.checkH12_oneNextStep(rec))[0].pass,
    H7: one(Grader.checkClaimToState(rec))[0].pass,
    REFUSAL: one(Grader.checks.checkRefusalAlternative(rec))[0].pass,
    last: bubbles[bubbles.length - 1] || "",
  };
}
function assertRow(reply, events, named) {
  assert.equal(typeof reply, "string", "reply delivered");
  assert.ok(reply.length > 0, "reply non-empty");
  const g = grade(reply, events);
  for (const c of named) assert.ok(g[c], `${c} must pass for: ${reply} (last bubble: ${g.last})`);
  return g;
}

// ------------------------------------------------------------ BUG-080 unit
test("BUG-080: composer exports the ending rule (ensureNextStep / endsWithNextStep / GENERIC_CLOSER)", () => {
  assert.equal(Reply.GENERIC_CLOSER, GENERIC);
  assert.equal(typeof Reply.ensureNextStep, "function");
  assert.equal(typeof Reply.endsWithNextStep, "function");
});

test("BUG-080 SC-209 shape: a specific in-character imperative ending gets NO generic append", () => {
  const sc209 = "Tell me more — what would make this an easy yes for you? Roleplay: I am playing the recruiter — answer as you would on the real call, and the round is scored when it closes.";
  assert.equal(Reply.ensureNextStep(sc209), sc209);
  assert.ok(Reply.endsWithNextStep(sc209));
});

test("BUG-080 SC-209 as delivered: a generic closer stamped over the specific ending is stripped", () => {
  const delivered = "Tell me more — what would make this an easy yes for you? Roleplay: I am playing the recruiter — answer as you would on the real call, and the round is scored when it closes. " + GENERIC;
  const fixed = Reply.ensureNextStep(delivered);
  assert.ok(!fixed.includes(GENERIC), fixed);
  assert.ok(fixed.endsWith("when it closes."), fixed);
});

test("BUG-080 bare ending: the H-12 guarantee still appends a next step (generic only as last resort)", () => {
  const bare = "Your packet is ready for review. Nothing has been submitted.";
  const out = Reply.ensureNextStep(bare);
  assert.ok(out.endsWith(GENERIC), out);
  assert.ok(grade(out, []).H12, "the guaranteed ending passes H-12 through the real pipeline");
});

test("BUG-080 bare ending + handler-supplied step: the handler's specific step wins over the generic", () => {
  const bare = "Submitted once to the local test sink and recorded with receipt rcpt-1. That was the one approved submission for this review.";
  const out = Reply.ensureNextStep(bare, { nextStep: "Want me to watch this one for status changes?" });
  assert.ok(out.endsWith("Want me to watch this one for status changes?"), out);
  assert.ok(!out.includes(GENERIC), out);
});

test("BUG-080 question / token endings are never stamped over", () => {
  const q = "The form is ready. Want me to fill it out first?";
  assert.equal(Reply.ensureNextStep(q), q);
  const tok = "Nothing is prepared yet. Tell me which version to use and I will prepare the packet with that one.";
  assert.equal(Reply.ensureNextStep(tok), tok);
  const card = "The wave is staged for your approval. [Yes]";
  assert.equal(Reply.ensureNextStep(card), card);
});

test("BUG-080 sweep: >=10 repass-row shapes ending in a specific step get no generic append", () => {
  const shapes = [
    // SC-209 (Negotiation) — in-character imperative clause
    "Tell me more — what would make this an easy yes for you? Roleplay: I am playing the recruiter — answer as you would on the real call, and the round is scored when it closes.",
    // SC-300 (Access & Safety) — token ending from the final reply
    "Stopped everything I can reach: the global pause is now set for your account, which blocks every send path this product controls. Next step — tell me when the queue state is reloaded and I will reconcile the exact counts against it.",
    // SC-122 replacement — specific question
    "This update came from the confirmation email itself. Want me to show the company, role, and date this confirmation belongs to?",
    // SC-126 replacement — specific question
    "Assessment logged — deadline: Friday, October 16, 2026, 5:00 PM ET. Want the prep pack for this assessment now?",
    // SC-127 replacement — specific question
    "Offer logged — it expires on Friday, October 23, 2026. Want the offer terms — base, bonus, expiry — laid out now?",
    // SC-063 replacement — sentence-initial imperative
    "Review these matches and I will prepare each packet, stopping at its doorstep for your approval.",
    // SC-079 replacement — imperative after a label
    "Next: say \"track it\" and I will follow this existing application and report its status.",
    // SC-121 replacement — tell-me token
    "One next step only: tell me about any application you have already sent and I will log it first.",
    // SC-134 replacement — tell-me token
    "Your offer expires Friday — Tell me the company and the Friday deadline and I will start the daily escalation.",
    // SC-116 replacement — sentence-initial imperative
    "Log or import the 34 applications and I will run the autopsy on those rows and build the plan from the worst split.",
    // SC-071 replacement — tell-me token
    "Tell me which version to audit and I will list the dropped bullet and why it was dropped.",
    // SC-036 replacement shape — wave presented for approval (approve token in last sentence)
    "Here is the day-6 wave for your approval, with its exact count of non-responders shown at the top — approve it and it is ready at the gate.",
  ];
  assert.ok(shapes.length >= 10);
  for (const s of shapes) {
    assert.equal(Reply.ensureNextStep(s), s, `no generic stamp over: ${s}`);
    assert.ok(!Reply.ensureNextStep(s).includes(GENERIC), s);
  }
});

test("BUG-080 pilot seam (SC-209 end-to-end): chatTurn delivers the roleplay reply with NO generic closer", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = L.H.session("SC-209", "w6-sc209");
  const turn = L.chatTurn(s, "Roleplay: the agent plays the recruiter; scored practice call", { profile });
  assert.equal(turn.handler, "142-career-router.handleChat");
  const text = (turn.delivered || []).join("\n");
  assert.ok(!text.includes(GENERIC), text);
  assert.ok(text.endsWith("when it closes."), text);
});

// ------------------------------------------------- 141 rows (BUG-081..086)
function formCtx(specName, sinkDir, profile) {
  const p = profile || loadProfile("p1-early-career-swe");
  const resumeContent = fs.readFileSync(path.join(GAUNTLET, "profiles/p1-early-career-swe/resume.txt"), "utf8");
  return { profile: p, formSpecName: specName, sinkDir, resumeArtifact: { name: "resume.txt", content: resumeContent, sha256: sha256(resumeContent) }, doorstepState: {} };
}
function sinkWith(receipts) {
  const dir = tmpDir("sink");
  for (const r of receipts) fs.writeFileSync(path.join(dir, r.receipt_id + ".json"), JSON.stringify(r));
  return dir;
}

test("BUG-081 row 19: fillReply STOPPED ends with the tell-me closing (H-12)", () => {
  const ctx = formCtx("ashby-like.json", tmpDir("r19"));
  const fill = Doorstep.handleChat("just use my profile", ctx);
  assert.ok(fill && fill.doorstep && fill.doorstep.state === "STOPPED", "STOPPED shape reached");
  assert.ok(fill.reply.endsWith("Tell me how you want that answer set and I will take the form to its review screen."), fill.reply);
  assertRow(fill.reply, [], ["H12"]);
});

test("BUG-081 row 20: submitDoorstep with no prepared form ends with a question (H-12)", () => {
  const r = Doorstep.submitDoorstep({});
  assert.ok(r.reply.endsWith("Want me to fill the form out first?"), r.reply);
  assertRow(r.reply, [], ["H12"]);
});

test("BUG-082 rows 21/22 (already fixed at 6c0ab5e — regression pin): duplicate refusals pass H-7 + H-12", () => {
  const unk = Doorstep.submitDoorstep({ doorstepState: { session: {}, submission: { status: "unknown_outcome" }, doorstep: {} } });
  assertRow(unk.reply, [], ["H7", "H12"]);
  const rec = Doorstep.submitDoorstep({ doorstepState: { session: { reconcile: () => ({ found: true, receipt: { receipt_id: "rcpt-1" } }) }, submission: { status: "submitted_accepted", receipt_id: "rcpt-1" }, doorstep: {} } });
  assertRow(rec.reply, [], ["H7", "H12"]);
});

test("BUG-081 row 23: submitDoorstep off the review screen ends with the approve closing (H-12)", () => {
  const r = Doorstep.submitDoorstep({ doorstepState: { session: {}, submission: { status: "not_submitted" }, doorstep: { state: "AWAITING_ANSWERS", blockers: [] } } });
  assert.ok(r.reply.endsWith("Answer the open asks and I will prepare it again — approve the new review when it is ready."), r.reply);
  assertRow(r.reply, [], ["H12"]);
});

test("BUG-081 row 24 (both sites): blocker refusal + driver stop end with the approve closing (H-12)", () => {
  const blocked = Doorstep.submitDoorstep({ doorstepState: { session: {}, submission: { status: "not_submitted" }, doorstep: { state: "REVIEW", blockers: [{ field: "work_authorization", kinds: ["missing_required"] }] } } });
  assert.ok(blocked.reply.endsWith("Answer those and I will prepare it again — approve the new review when it is ready."), blocked.reply);
  assertRow(blocked.reply, [], ["H12"]);
  const stopped = Doorstep.submitDoorstep({ doorstepState: { session: { submit: () => ({ outcome: "stopped", code: "MISSING_REQUIRED", fields: ["work_authorization"] }) }, submission: { status: "not_submitted" }, doorstep: { state: "REVIEW", blockers: [] } } });
  assert.ok(stopped.reply.endsWith("Answer those and I will prepare it again — approve the new review when it is ready."), stopped.reply);
  assertRow(stopped.reply, [], ["H12"]);
});

test("BUG-083 row 25: reconcile not-submitted ends with the approve closing (H-12)", () => {
  const r = Doorstep.reconcileDoorstep({ doorstepState: { submission: { status: "not_submitted" } } });
  assert.ok(r.reply.endsWith("It is still waiting on its review screen — approve it there and it goes."), r.reply);
  assertRow(r.reply, [], ["H12"]);
});

test("BUG-083 row 26: reconcile cancelled appends the tell-me closing (H-12)", () => {
  const r = Doorstep.reconcileDoorstep({ doorstepState: { submission: { status: "cancelled" } } });
  assert.ok(r.reply.endsWith("unless you ask me to prepare it fresh — tell me and I will."), r.reply);
  assertRow(r.reply, [], ["H12"]);
});

test("BUG-083 row 27: reconcile invalidated ends with the tell-me re-prepare closing (H-12)", () => {
  const r = Doorstep.reconcileDoorstep({ doorstepState: { submission: { status: "invalidated" } } });
  assert.ok(r.reply.endsWith("It has to be re-prepared on the current facts first — tell me and I will re-prepare it for a fresh approval."), r.reply);
  assertRow(r.reply, [], ["H12"]);
});

test("BUG-083 rows 28/29: reconcile receipt-found appends the timeline question — H-12 + REFUSAL pass in BOTH receipt-id configurations", () => {
  for (const rid of ["rcpt-1", "rcpt_1"]) {
    const dir = sinkWith([{ receipt_id: rid }]);
    const wasUnknown = Doorstep.reconcileDoorstep({ sinkDir: dir, doorstepState: { submission: { status: "unknown_outcome", receipt_id: rid, retries: 0 }, doorstep: {} } });
    assert.ok(wasUnknown.reply.endsWith("Want the full timeline for this application?"), wasUnknown.reply);
    assertRow(wasUnknown.reply, [], ["H12", "REFUSAL"]);
    const known = Doorstep.reconcileDoorstep({ sinkDir: dir, doorstepState: { submission: { status: "submitted_accepted", receipt_id: rid }, doorstep: {} } });
    assert.ok(known.reply.endsWith("Want the full timeline for this application?"), known.reply);
    assertRow(known.reply, [], ["H12", "REFUSAL"]);
  }
});

test("BUG-083 row 30: reconcile multiple receipts appends the tell-me timeline closing (H-12)", () => {
  const dir = sinkWith([{ receipt_id: "rcpt-1" }, { receipt_id: "rcpt-2" }]);
  const r = Doorstep.reconcileDoorstep({ sinkDir: dir, doorstepState: { submission: { status: "submitted_accepted", receipt_id: "rcpt-1" }, doorstep: {} } });
  assert.ok(r.reply.endsWith("Tell me if you want the full timeline for this application."), r.reply);
  assertRow(r.reply, [], ["H12"]);
});

test("BUG-083 row 31: reconcile sink-unreadable ends with the tell-me retry closing (H-12)", () => {
  const r = Doorstep.reconcileDoorstep({ doorstepState: { submission: { status: "unknown_outcome", receipt_id: "rcpt-1" }, doorstep: {} } });
  assert.ok(r.reply.endsWith("I have not resubmitted anything — tell me to try again and I will reconcile the sink before any retry."), r.reply);
  assertRow(r.reply, [], ["H12"]);
});

test("BUG-084 rows 32/33 (already fixed at 6c0ab5e — regression pin): counted halt replies pass H-7 + H-12", () => {
  const mk = (items) => ({ queueState: { outreach_queue: { items } }, now: "2026-10-14T00:00:00.000Z" });
  const one = Doorstep.haltQueue(mk([{ queue_id: "q1", status: "sent", to: "a@x.test" }, { queue_id: "q2", status: "pending", to: "b@x.test" }]), "stop everything");
  assertRow(one.reply, [{ type: "queue_halt_attempt" }], ["H7", "H12"]);
  const zero = Doorstep.haltQueue(mk([{ queue_id: "q2", status: "pending", to: "b@x.test" }]), "stop everything");
  assertRow(zero.reply, [{ type: "queue_halt_attempt" }], ["H7", "H12"]);
});

test("BUG-085 row 34: prepPacket refused ends with the tell-me rebuild closing (source-string pipeline check)", () => {
  // prepPacket's refusal branch cannot be driven without a packet the 133
  // assembler refuses (its refusal requires a truth-audit failure deep in
  // 133/123); the composer table's own method is used instead: the reply
  // template is read from 141's source, rendered, and graded.
  const src = fs.readFileSync(path.join(ROOT, "packages/domain/141-career-doorstep.js"), "utf8");
  const m = src.match(/packet itself was refused[\s\S]{0,220}?rebuild it[^`"]*/);
  assert.ok(m, "refused-packet reply template located in 141 source");
  assert.ok(/tell me when it is fixed and I will rebuild it\./.test(m[0]), m[0]);
  const rendered = "I bound the backend version by its content hash, but the packet itself was refused (truth audit), so nothing is prepared. Fix that first — tell me when it is fixed and I will rebuild it.";
  assertRow(rendered, [], ["H12"]);
});

test("BUG-085 row 35: prepPacket success ends with the approve closing (H-12)", () => {
  const profile = loadProfile("p1-early-career-swe");
  const backendText = "Maya Rivera (TEST) — tailored for Backend Engineer, TEST Company\nPython, SQL, Flask, SQLite. StudyBoard scheduler. SWE Intern, TEST Systems Inc, Jun-Aug 2026.\nVERSION: BACKEND\n";
  const ctx = { profile, artifacts: [{ record: "backend application materials", name: "resume.pdf", version: "backend", content: backendText }], packet: { company: "TEST Company", jobId: "GJ-BACKEND-1", jdText: "Backend Engineer at TEST Company. Requirements: Python and SQL required; Flask a plus. Build APIs and data export tooling." } };
  const r = Doorstep.prepPacket("prep the backend application using the backend version", ctx);
  assert.equal(r.resultStatus, "prepared");
  assert.ok(r.reply.endsWith("It is ready for your review — nothing has been submitted, and nothing goes anywhere until you approve it."), r.reply);
  assertRow(r.reply, [], ["H12"]);
});

test("BUG-086 row 36: guard approval_invalidated ends with the tell-me re-prepare closing (H-12)", () => {
  const g = Doorstep.checkSubmitGuards({}, { approval_invalidated: true, submission: { status: "not_submitted" } });
  assert.ok(g && g.code === "approval_invalidated");
  assert.ok(g.reply.endsWith("Tell me to re-prepare it on the current facts and I will bring you the new review to confirm."), g.reply);
  assertRow(g.reply, [], ["H12"]);
});

test("BUG-086 row 37: guard job_closed ends with the tell-me fresh-application closing (H-12)", () => {
  const g = Doorstep.checkSubmitGuards({}, { job_status: "closed", submission: { status: "not_submitted" } });
  assert.ok(g && g.code === "job_closed");
  assert.ok(g.reply.endsWith("If the employer reopens it — or you pick another role — tell me and I will prepare a fresh application for your review."), g.reply);
  assertRow(g.reply, [], ["H12"]);
});

test("BUG-086 row 38: guard duplicate_application ends with the tell-me track closing (H-12)", () => {
  const g = Doorstep.checkSubmitGuards({}, { doorstep: { company: "Stripe", role: "SWE", job_id: "J1" }, prior_applications: [{ job_id: "J1", company: "Stripe", role: "SWE", source: "prior application on record" }], submission: { status: "not_submitted" } });
  assert.ok(g && g.code === "duplicate_application");
  assert.ok(g.reply.endsWith("I can track the existing application and check its status instead — tell me to track it and I will."), g.reply);
  assertRow(g.reply, [], ["H12"]);
});

test("BUG-086 row 39: guard stale facts ends with the tell-me re-prepare closing (H-7 + H-12)", () => {
  const profile = loadProfile("p1-early-career-swe");
  const g = Doorstep.checkSubmitGuards({ profile }, { fact_hash: "deadbeef", submission: { status: "not_submitted" } });
  assert.ok(g && g.code === "stale_packet_facts", JSON.stringify(g));
  assert.ok(g.reply.endsWith("You have to confirm the current answers again and the packet must be re-prepared before anything submits — tell me when you are ready and I will re-prepare it."), g.reply);
  assertRow(g.reply, [], ["H7", "H12"]);
});

test("BUG-086 row 40: fillDoorstep duplicate refusal ends with the tell-me track closing (H-12)", () => {
  const ctx = formCtx("greenhouse-like.json", tmpDir("r40"));
  ctx.doorstepState.prior_applications = [{ job_id: "GAUNTLET-JOB-GH-1", source: "manual application (disclosed by the user)", channel: "employer site", at: "2026-10-01" }];
  const r = Doorstep.fillDoorstep(ctx);
  assert.equal(r.ok, false);
  assert.ok(r.reply.endsWith("I can track the existing application and check its status instead — tell me to track it and I will."), r.reply);
  assertRow(r.reply, [], ["H12"]);
});

test("BUG-085 row 41 (H-12 half): submit accepted appends the watch question in both receipt-id configurations", () => {
  for (const rid of ["rcpt-1", "rcpt_1"]) {
    const r = Doorstep.submitDoorstep({ doorstepState: { session: { submit: () => ({ outcome: "accepted", receipt: { receipt_id: rid } }) }, submission: { status: "not_submitted" }, doorstep: { state: "REVIEW", blockers: [] } } });
    assert.ok(r.reply.endsWith("Want me to watch this one for status changes?"), r.reply);
    assertRow(r.reply, [{ type: "submit" }], ["H12"]);
  }
});

test("BUG-084 row 42 (already fixed at 6c0ab5e — regression pin): submit timeout passes H-7 with its submit event + H-12", () => {
  const r = Doorstep.submitDoorstep({ doorstepState: { session: { submit: () => ({ outcome: "timeout", receipt: { receipt_id: "rcpt-1" }, receiptWritten: true }) }, submission: { status: "not_submitted" }, doorstep: { state: "REVIEW", blockers: [] } } });
  assertRow(r.reply, [{ type: "submit" }], ["H7", "H12"]);
});

// ------------------------------------------------------------ 140 fallbacks
test("140 rows 55/56/58 (already fixed at 6c0ab5e — regression pin): fallbacks pass H-12 through the pipeline", () => {
  for (const kind of ["error", "empty", "timeout"]) assertRow(Reply.fallback(kind), [], ["H12"]);
});

test("140 row 57 (FLAGGED deliberate exclusion — pinned, NOT fixed): unmatched fallback stays byte-identical", () => {
  assert.equal(Reply.fallback("unmatched"), "I'm Trainee, a career agent: I find roles, prepare and track your applications, and get you ready for interviews. I may have missed what you meant, so what should we work on first?");
});
