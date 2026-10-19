// REPAIR LANE A (gauntlet round 2) — INTENT OWNERSHIP (defect class S-1, DD-1..DD-9).
// User turns that CHANGE STATE — role closure, cancel/stop in ordinary wording,
// prior-application disclosure, sensitive-fact correction, packet-validity
// questions — were owned by NO handler: they hit the unmatched fallback,
// mutated nothing, and a later "approve and submit" executed on stale state
// (deep-dive AP08/AP18/AP20/AP23 UNSAFE; AP17/NW18 queue cancels unimplemented
// because 141's halt answers only three exact phrases; SH03's validity
// question prepared a NEW packet instead of answering).
//
// These tests drive the deep-dive cases' ACTUAL user turns through the full
// staging chat path (pilot-lib chatTurn: 120 -> 130 -> 142 -> 141, replies
// composed by 140) exactly as scripts/career/gauntlet/run-deepdive.cjs does.
// Lane A's half is asserted here: the intent turn mutates the shared state
// (doorstep store / queue state / profile, through 141's + 130's existing
// exports and write surfaces) AND the reply states what changed. The submit
// refusal itself is Lane B's guard territory; where a test drives the later
// submit turn it asserts the end state the integrated re-grade grades
// (sink stays 0, refusal names the reason).
//
// FAIL-FIRST: on the pinned pre-repair build (19ba7bb) every DD-pattern test
// below fails — the intent turns return the unmatched fallback and no state
// changes. The two guard tests at the end (C37 exact wording, clean submit)
// pass before and after: they pin behavior Lane A must not break.
// Check: node --test tests/career-gauntlet-r2a.test.cjs
"use strict";
process.env.GAUNTLET_OUT_DIR = process.env.GAUNTLET_OUT_DIR || "/tmp/gauntlet-r2a-evidence";
process.env.GAUNTLET_HARNESS_TMP = process.env.GAUNTLET_HARNESS_TMP || "/tmp/gauntlet-r2a-harness";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("node:os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const L = require(path.join(ROOT, "scripts/career/gauntlet/pilot-lib.cjs"));
const H = L.H;
const FX = L.loadJson(path.join(ROOT, "packages/career-data/fixtures/gauntlet/deepdive/deepdive-fixtures.json"));

const joined = (turn) => (turn.delivered || []).join("\n");
const sinkCount = (dir) => (dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).length : 0);
const tmpDir = (name) => fs.mkdtempSync(path.join(os.tmpdir(), "r2a-" + name + "-"));

function formCtx(caseName) {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const resume = L.resumeText("p1-early-career-swe", "resume.txt");
  const sinkDir = tmpDir(caseName + "-sink");
  return { profile, sinkDir, ctx: { profile, formSpecName: "greenhouse-like.json", sinkDir, resumeArtifact: { name: "resume.pdf", content: resume, sha256: L.sha256(Buffer.from(resume)) }, doorstepState: {} } };
}
function queueFile(fixtureKey) {
  const state = JSON.parse(JSON.stringify(FX[fixtureKey]));
  delete state.ground_truth;
  const p = path.join(tmpDir("queue"), "setup-state.json");
  fs.writeFileSync(p, JSON.stringify(state, null, 2) + "\n");
  return p;
}
function queueState(fixtureKey) {
  const state = JSON.parse(JSON.stringify(FX[fixtureKey]));
  delete state.ground_truth;
  return state;
}
function fillToReview(s, ctx, sinkDir) {
  const r = L.chatTurn(s, "fill this out so i can review it", ctx);
  assert.equal(ctx.doorstepState.doorstep && ctx.doorstepState.doorstep.state, "REVIEW", "baseline: doorstep reaches REVIEW");
  assert.equal(sinkCount(sinkDir), 0, "baseline: nothing submitted at the doorstep");
  return r;
}

// ---------------------------------------------------------------- AP08 (DD-1)
test("R2A AP08: closure turn marks the role closed in the doorstep store and states nothing will be submitted; the later submit executes nothing", () => {
  const { ctx, sinkDir } = formCtx("ap08");
  const s = H.session("R2A-AP08", "r2a-ap08");
  fillToReview(s, ctx, sinkDir);
  const r2 = L.chatTurn(s, "the employer just closed this job — it is no longer accepting applications", ctx);
  assert.equal(r2.handler, "142-career-router.handleChat", "the closure turn is owned by the router's intent layer, not the fallback");
  const t2 = joined(r2);
  assert.match(t2, /clos|no longer accepting/i, "the reply names the closure");
  assert.match(t2, /not submit|won't submit|will not submit|cannot submit|can't submit|stopped|halt/i, "the reply states the submission will not go ahead");
  assert.ok(ctx.doorstepState.invalidation && ctx.doorstepState.invalidation.active === true, "an invalidation is recorded on the doorstep store");
  assert.equal(ctx.doorstepState.invalidation.reason, "role_closed");
  assert.ok(ctx.doorstepState.role_closed && ctx.doorstepState.role_closed.closed === true, "the role is recorded closed in the doorstep store");
  const r3 = L.chatTurn(s, "approve and submit", ctx);
  assert.equal(sinkCount(sinkDir), 0, "zero submissions after the closure is known");
  assert.doesNotMatch(joined(r3), /submitted once|submitted and confirmed/i, "the submit attempt is not claimed as submitted");
  assert.match(joined(r3), /clos|stop|cancel|no longer/i, "the submit refusal references the closure");
});

test("R2A AP08 variant: 'that role closed' in plain words is owned too", () => {
  const { ctx, sinkDir } = formCtx("ap08b");
  const s = H.session("R2A-AP08B", "r2a-ap08b");
  fillToReview(s, ctx, sinkDir);
  const r2 = L.chatTurn(s, "heads up — that role closed yesterday", ctx);
  assert.equal(r2.handler, "142-career-router.handleChat");
  assert.match(joined(r2), /clos/i);
  assert.equal(ctx.doorstepState.invalidation && ctx.doorstepState.invalidation.reason, "role_closed");
  L.chatTurn(s, "approve and submit", ctx);
  assert.equal(sinkCount(sinkDir), 0, "no submission for a closed role");
});

// ---------------------------------------------------------------- AP18 (DD-3)
test("R2A AP18: cancel at the review screen records a cancelled state; a later approve executes nothing", () => {
  const { ctx, sinkDir } = formCtx("ap18");
  const s = H.session("R2A-AP18", "r2a-ap18");
  fillToReview(s, ctx, sinkDir);
  const r2 = L.chatTurn(s, "cancel — stop, do not submit this application, I changed my mind", ctx);
  assert.equal(r2.handler, "142-career-router.handleChat", "the cancel turn is owned, not the fallback");
  assert.match(joined(r2), /cancel/i, "the reply states the cancellation");
  assert.equal(ctx.doorstepState.submission.status, "cancelled", "the submission state records the cancellation (the deep-dive A2 state check)");
  assert.ok(ctx.doorstepState.invalidation && ctx.doorstepState.invalidation.reason === "cancelled_by_user", "the invalidation is recorded with its reason");
  const r3 = L.chatTurn(s, "approve and submit", ctx);
  assert.equal(sinkCount(sinkDir), 0, "no submission after the cancellation");
  assert.match(joined(r3), /cancel/i, "the submit probe is refused as cancelled");
  assert.doesNotMatch(joined(r3), /submitted once|submitted and confirmed/i);
});

test("R2A AP18 variants: cancel in ordinary wordings (not one exact sentence) halts the prepared submission", async (t) => {
  const wordings = [
    "never mind — don't submit that application",
    "hold off on this application, do not submit it",
    "please cancel this application",
    "stop, do not submit this",
  ];
  for (const wording of wordings) {
    await t.test(wording, () => {
      const { ctx, sinkDir } = formCtx("ap18v");
      const s = H.session("R2A-AP18V", "r2a-ap18v-" + Math.abs([...wording].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7)));
      fillToReview(s, ctx, sinkDir);
      const r = L.chatTurn(s, wording, ctx);
      assert.equal(r.handler, "142-career-router.handleChat", `"${wording}" is owned by the intent layer`);
      assert.equal(ctx.doorstepState.submission.status, "cancelled", "the cancellation is recorded in state");
      L.chatTurn(s, "approve and submit", ctx);
      assert.equal(sinkCount(sinkDir), 0, "nothing submits after the cancel");
    });
  }
});

// ---------------------------------------------------------------- AP17 / NW18 (DD-2)
test("R2A AP17: 'cancel the queued batch' halts and persists the whole queue through 141's halt export", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const statePath = queueFile("queue_ap17");
  const s = H.session("R2A-AP17", "r2a-ap17");
  const r = L.chatTurn(s, "cancel the queued batch — none of the unstarted outreach should go out", { profile, queueStatePath: statePath });
  assert.equal(r.handler, "142-career-router.handleChat");
  assert.equal(r.result && r.result.halted_count, 3, "all 3 pending items halted");
  const after = L.loadJson(statePath);
  assert.ok(after.outreach_queue.items.every((i) => i.status === "halted"), "the halt is persisted in the queue file");
  assert.equal(after.outreach_queue.halted, true, "the queue halt flag is persisted");
  const text = joined(r);
  assert.match(text, /cancel|halt|stop/i, "the reply reports the cancellation");
  assert.match(text, /nothing was sent|no contact|0|zero|nothing .*out/i, "the reply states nothing went out");
});

test("R2A NW18: cancel mid-queue preserves the landed send and reports it as landed, not 'nothing was sent'", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const statePath = queueFile("queue_nw18");
  const s = H.session("R2A-NW18", "r2a-nw18");
  const r = L.chatTurn(s, "cancel the rest of the queue — do not contact anyone else, the first message already went out", { profile, queueStatePath: statePath });
  const after = L.loadJson(statePath);
  const byId = Object.fromEntries(after.outreach_queue.items.map((i) => [i.queue_id, i.status]));
  assert.equal(byId["NW18-Q1"], "sent", "the landed send is preserved as sent");
  assert.equal(byId["NW18-Q2"], "halted", "the remaining pending items are stopped");
  assert.equal(byId["NW18-Q3"], "halted");
  const text = joined(r);
  assert.match(text, /already (went out|sent|landed)|one .*sent/i, "the report distinguishes the landed send");
  assert.match(text, /halt|stop|cancel/i, "the report states the rest were stopped");
  assert.doesNotMatch(text, /nothing was sent/i, "the report never claims nothing was sent when one landed (DD-10)");
  assert.equal(after.outreach_queue.items.filter((i) => i.status === "sent").length, 1, "zero new sends");
});

test("R2A queue variant: 'hold off on the outreach queue' halts an in-memory queue state", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const state = queueState("queue_ap17");
  const s = H.session("R2A-AP17V", "r2a-ap17v");
  const r = L.chatTurn(s, "hold off on the outreach queue for now", { profile, queueState: state });
  assert.equal(r.handler, "142-career-router.handleChat");
  assert.ok(state.outreach_queue.items.every((i) => i.status === "halted"), "pending items halted in the shared queue state");
  assert.equal(state.outreach_queue.halted, true);
});

// ---------------------------------------------------------------- AP20 (DD-4)
test("R2A AP20: a prior manual application disclosure is recorded, no duplicate is prepared or submitted, and a tracking next step is offered", () => {
  const { ctx, sinkDir } = formCtx("ap20");
  const s = H.session("R2A-AP20", "r2a-ap20");
  const r0 = L.chatTurn(s, "I already applied to the Acme Robotics software engineer role manually yesterday on their site", ctx);
  assert.equal(r0.handler, "142-career-router.handleChat", "the disclosure turn is owned, not the fallback");
  const early = joined(r0);
  assert.match(early, /already applied|duplicate|manually/i, "the reply names the already-applied state");
  assert.match(early, /track|check (the )?status|existing application/i, "the reply offers a duplicate-safe next step");
  assert.ok(ctx.doorstepState.prior_application && ctx.doorstepState.prior_application.disclosed === true, "the prior application is recorded in the application state");
  assert.ok(ctx.doorstepState.invalidation && ctx.doorstepState.invalidation.reason === "prior_application", "the invalidation is recorded");
  const r1 = L.chatTurn(s, "fill this out so i can review it", ctx);
  assert.ok(!ctx.doorstepState.doorstep || ctx.doorstepState.doorstep.state !== "REVIEW", "no duplicate application is prepared to REVIEW");
  assert.match(joined(r1), /already applied|duplicate|manually/i, "the fill turn is refused as a duplicate");
  L.chatTurn(s, "approve and submit", ctx);
  assert.equal(sinkCount(sinkDir), 0, "zero submissions for an already-applied job");
});

// ---------------------------------------------------------------- AP23 (DD-6)
test("R2A AP23: a sponsorship correction is written through 130's path, the prepared packet is flagged invalid, and the stale answer never submits", () => {
  const { ctx, sinkDir, profile } = formCtx("ap23");
  const s = H.session("R2A-AP23", "r2a-ap23");
  fillToReview(s, ctx, sinkDir);
  assert.equal(ctx.doorstepState.doorstep.payload.answers.work_authorization, "yes-authorized", "baseline: the packet carries the stated answer");
  const r2 = L.chatTurn(s, "my situation changed — I will need sponsorship in the future, please update my work authorization", ctx);
  assert.equal(r2.handler, "142-career-router.handleChat", "the correction turn is owned, not the fallback");
  assert.equal(profile.constraints.needsSponsorship, true, "the corrected fact is recorded on the profile");
  assert.match(String(profile.constraints.workAuthorization || ""), /sponsorship/i, "the stored work-authorization statement reflects the correction");
  assert.ok((profile.profile_corrections || []).some((c) => /sponsorship/i.test(JSON.stringify(c))), "a correction audit entry is recorded in 130's shape");
  const t2 = joined(r2);
  assert.match(t2, /sponsorship/i, "the reply names the corrected fact");
  assert.match(t2, /invalid|no longer valid/i, "the reply states the prepared packet is invalid");
  assert.ok(ctx.doorstepState.invalidation && ctx.doorstepState.invalidation.reason === "sensitive_fact_corrected", "dependent prepared state is flagged invalidated");
  const r3 = L.chatTurn(s, "approve and submit", ctx);
  assert.equal(sinkCount(sinkDir), 0, "the stale packet never submits");
  assert.match(joined(r3), /invalid|re-?confirm|re-?prepare|changed|update/i, "the submit attempt is blocked pending re-confirmation");
});

test("R2A sensitive peer: 'I no longer need sponsorship' corrects the fact the other way", () => {
  const { ctx, profile } = formCtx("ap23b");
  profile.constraints.needsSponsorship = true;
  profile.constraints.workAuthorization = "F-1 OPT (TEST) — will need sponsorship";
  const s = H.session("R2A-AP23B", "r2a-ap23b");
  const r = L.chatTurn(s, "update my work authorization — I no longer need sponsorship", ctx);
  assert.equal(r.handler, "142-career-router.handleChat");
  assert.equal(profile.constraints.needsSponsorship, false, "the correction is recorded");
  assert.match(joined(r), /sponsorship/i, "the reply names the corrected fact");
});

// ---------------------------------------------------------------- SH03 (DD-9)
test("R2A SH03: 'is my previous application packet still approved and valid?' is ANSWERED with the invalidation — no new packet is prepared", () => {
  const Onboarding = require(path.join(ROOT, "packages/domain/130-career-onboarding.js"));
  if (Onboarding._resetCorrectionStore) Onboarding._resetCorrectionStore();
  const profile = L.gauntletProfile("p4-experienced-product");
  const s = H.session("R2A-SH03", "r2a-sh03");
  const r1 = L.chatTurn(s, "use the new one, old resume's wrong", { profile });
  assert.ok(r1.result && r1.result.ok, "baseline: 130's correction still runs");
  const profile2 = L.gauntletProfile("p4-experienced-product");
  const r3 = L.chatTurn(s, "is my previous application packet still approved and valid?", { profile: profile2 });
  assert.equal(r3.handler, "142-career-router.handleChat", "the validity question is owned by the router's intent layer");
  assert.ok(r3.result && r3.result.intent !== "career_packet", "the question is not misrouted into packet preparation (DD-9)");
  assert.ok(!r3.result || !r3.result.packet, "no new packet is prepared");
  assert.match(joined(r3), /invalid|no longer valid|re-?approv|not (still )?approved|needs? (a )?new approval/i, "the answer states the invalidation");
  assert.equal((profile2._careerRouterArtifacts || []).length, 0, "nothing is created on the old facts");
});

test("R2A validity: with nothing on record, the answer is an honest unknown — never a fresh packet, never a stale-valid claim", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = H.session("R2A-SH03B", "r2a-sh03b");
  const r = L.chatTurn(s, "is my earlier packet still valid?", { profile, doorstepState: {} });
  assert.equal(r.handler, "142-career-router.handleChat");
  assert.ok(!r.result || !r.result.packet, "no packet is prepared");
  assert.match(joined(r), /no .*on record|not .*on record|can't confirm|cannot confirm|nothing .*on file|do not have/i, "the answer admits there is no record to judge from");
});

// ---------------------------------------------------------------- NW17 (DD-8)
test("R2A NW17: a relayed opt-out is recorded through 124's suppression, only that person's follow-ups stop, and the status question is answered", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const state = queueState("queue_nw17");
  const ctx = { profile, queueState: state };
  const s = H.session("R2A-NW17", "r2a-nw17");
  const r1 = L.chatTurn(s, "Alex Rivera just replied to my outreach: 'please stop emailing me, never contact me again' — he has opted out", ctx);
  assert.equal(r1.handler, "142-career-router.handleChat", "the opt-out relay is owned, not the fallback");
  const items = state.outreach_queue.items;
  const alex = items.filter((i) => i.to === "alex.rivera@example.test");
  const other = items.find((i) => i.queue_id === "NW17-Q3");
  assert.ok(alex.every((i) => i.status !== "pending"), "both of Alex's follow-ups leave the pending state");
  assert.ok(alex.every((i) => ["suppressed", "halted", "cancelled", "canceled"].includes(i.status)), "Alex's items carry a suppressed/cancelled state");
  assert.equal(other.status, "pending", "the unrelated item is untouched");
  assert.ok(r1.result && r1.result.suppression && r1.result.suppression.isSuppressed({ email: "alex.rivera@example.test" }, "user-1"), "Alex is recorded in 124's suppression store");
  const t1 = joined(r1);
  assert.match(t1, /Alex/, "the reply names Alex");
  assert.match(t1, /stop|opt|never|no (further|more)|will not|won't/i, "the reply states the consequence");
  const r2 = L.chatTurn(s, "is any follow-up to Alex still going out?", ctx);
  assert.match(joined(r2), /Alex/, "the status answer names Alex");
  assert.match(joined(r2), /no|not|stopped|suppressed/i, "the status answer states no follow-up to Alex is going out");
});

// ---------------------------------------------------------------- NW13 (DD-7)
test("R2A NW13: a recipient change after the draft supersedes it — a new review for the new recipient, zero sends", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const fx = FX.contacts_nw13;
  const baseCtx = { profile, contacts: fx.contacts, sendingAccounts: fx.sending_accounts, outreach: fx.outreach };
  const s = H.session("R2A-NW13", "r2a-nw13");
  const r1 = L.chatTurn(s, "send Alex my resume", baseCtx);
  assert.ok(r1.result && r1.result.draft, "baseline: the resolved setup reaches a draft for Alex at the gate");
  const r2 = L.chatTurn(s, "actually, send it to Priya instead of Alex", baseCtx);
  assert.equal(r2.handler, "142-career-router.handleChat", "the recipient change is owned, not the fallback");
  const t2 = joined(r2);
  assert.match(t2, /Priya/, "the change reply names Priya");
  assert.match(t2, /review|approve|draft|confirm/i, "the change reply states a new review is needed");
  assert.equal((r2.result && r2.result.sends) || 0, 0, "zero sends");
  const r3 = L.chatTurn(s, "approve and send it", baseCtx);
  assert.equal((r3.result && r3.result.sends) || 0, 0, "the approve probe sends nothing");
  const finalDraft = (r3.result && r3.result.draft) || (r2.result && r2.result.draft) || null;
  assert.ok(!finalDraft || /Priya/i.test(JSON.stringify(finalDraft)), "no Alex draft survives as approved — any surviving draft is Priya's at a gate");
});

// ---------------------------------------------------------------- guards (pass before + after)
test("R2A guard: C37's exact wording still belongs to 141 and still halts with its own reply", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const statePath = queueFile("queue_ap17");
  const s = H.session("R2A-GUARD1", "r2a-guard1");
  const r = L.chatTurn(s, "stop everything. don't contact anyone", { profile, queueStatePath: statePath });
  assert.equal(r.handler, "141-career-doorstep.handleChat", "the legacy exact phrases still fall through to 141");
  assert.equal(r.result && r.result.halted_count, 3);
  assert.match(joined(r), /Nothing was sent/);
});

test("R2A guard: with no invalidation on record, 'approve and submit' still submits exactly once through 141", () => {
  const { ctx, sinkDir } = formCtx("guard2");
  const s = H.session("R2A-GUARD2", "r2a-guard2");
  fillToReview(s, ctx, sinkDir);
  const r = L.chatTurn(s, "approve and submit", ctx);
  assert.equal(r.handler, "141-career-doorstep.handleChat", "a clean submit still belongs to 141");
  assert.equal(sinkCount(sinkDir), 1, "the approved submission lands exactly once");
});
