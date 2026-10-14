"use strict";
// FAIL-FIRST seam tests — captcha handoff (SC-082) + module-120 typed-result
// contract (SC-286 class). Spec: ~/workspace/your_files/integrator-packs/captcha-120-pack.md
//
// SC-082's canonical ask drives the ACCS-006 ticket lifecycle through the
// chat path: a captcha stop mints a single-use handoff ticket and returns a
// TYPED doorstep payload (the ticket, the tap link, the resume contract) —
// not bare words; the user's return validates the ticket exactly once; a
// replayed token is refused. Zero sends, zero submits, at every step.
// The chat dispatch below mirrors the established integration idiom
// (120 -> 130 -> 142 -> 141) from tests/career-gauntlet-r2-integration.test.cjs.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const GAUNTLET = path.join(root, "packages/career-data/fixtures/gauntlet");

const Access = require(path.join(root, "packages/domain/120-career-access.js"));
const Onboarding = require(path.join(root, "packages/domain/130-career-onboarding.js"));
const Profile = require(path.join(root, "packages/domain/122-career-profile.js"));
const Router = require(path.join(root, "packages/domain/142-career-router.js"));
const Doorstep = require(path.join(root, "packages/domain/141-career-doorstep.js"));

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

const NOW = Date.parse("2026-10-13T05:00:00Z"); // canonical SC-082 clock
const ASK_082 = "CAPTCHA appears mid-application — hand me the tap, resume when done";
// The host contract (pack §1): a 149/150 captcha stop forwarded onto ctx,
// with the canonical scenario's own TEST values (SC-082.cjs).
const STOP_CTX = {
  source: "portal", challenge: "captcha",
  screenshot_ref: "TEST-screenshot-ref/captcha-1", run_id: "TEST-RUN-082",
  posting_url: "https://job-boards.greenhouse.io/TEST/jobs/082", at: "open",
};
const baseCtx = () => ({ profile: loadProfile("p1-early-career-swe"), now: NOW });

function stopTurn() {
  return chatPath(ASK_082, Object.assign(baseCtx(), { captchaStop: Object.assign({}, STOP_CTX) }));
}

test("SC-082 stop turn: typed doorstep payload with the ACCS-006 ticket and handoff link", () => {
  const r = stopTurn();
  assert.ok(r, "the chat path answers the captcha ask");
  assert.equal(r.handler, "120");
  assert.equal(r.intent, "captcha_handoff");
  assert.equal(r.resultStatus, "awaiting_user");
  assert.equal(r.sends, 0);
  assert.equal(r.submits, 0);
  assert.ok(!r.submission, "no submission object on a handoff turn");
  const p = r.artifact || r.payload;
  assert.ok(p, "the result carries a doorstep payload (artifact/payload) — words alone are the defect");
  assert.equal(r.artifact, r.payload, "120 convention: artifact and payload are the same object");
  assert.equal(p.kind, "captcha_handoff_doorstep");
  assert.equal(p.committed, false);
  assert.equal(p.submits, 0);
  assert.ok(p.ticket, "payload carries the minted ACCS-006 ticket");
  assert.equal(p.ticket.source, "portal");
  assert.equal(p.ticket.challenge, "captcha");
  assert.equal(p.ticket.screenshot_ref, STOP_CTX.screenshot_ref);
  assert.equal(p.ticket.run_id, "TEST-RUN-082");
  assert.equal(p.ticket.status, "awaiting_user");
  assert.equal(p.ticket.expires_at, "2026-10-13T05:30:00.000Z", "ticket carries the 30-minute HANDOFF_TTL expiry");
  assert.ok(p.handoff, "payload carries the handoff link contract");
  assert.equal(p.handoff.url, STOP_CTX.posting_url, "the user taps the real page (149's handoffUrl, unified per pack M2)");
  assert.equal(p.handoff.expires_at, p.ticket.expires_at);
  assert.equal(p.resume.mode, "single_use_token");
  assert.equal(p.resume.run_id, "TEST-RUN-082");
  assert.deepEqual(r.card, { title: "Your tap needed — CAPTCHA", source: "portal", challenge: "captcha", expires_at: p.ticket.expires_at },
    "the card matches the canonical scenario's card shape");
  assert.ok(!String(r.reply).includes(p.ticket.resume_token), "the resume token never appears in reply text (pack M5)");
  assert.ok(!JSON.stringify(r.card).includes(p.ticket.resume_token), "the resume token never appears in the card (pack M5)");
});

test("SC-082 stop turn: 141-shaped doorstep record (family application, gap null, hash-bound)", () => {
  const r = stopTurn();
  const d = r.doorstep;
  assert.ok(d, "the result carries a doorstep record (grader-v2 reads rec.doorstep)");
  assert.equal(d.family, "application", "doorstep family is the blocked run's family, not 'access' (pack M7)");
  assert.equal(d.driven_by, "agent");
  assert.equal(d.gap, null, "gap is null only because a real ticket was minted");
  assert.equal(d.state, "AWAITING_COMMIT");
  assert.equal(d.committed, false);
  const p = r.artifact || r.payload;
  assert.equal(d.payload, p);
  assert.equal(d.payload_sha256, sha256(JSON.stringify(p)), "payload hash recomputes over the payload");
  assert.deepEqual(d.proof.payload_snapshot, p);
  assert.equal(d.proof.payload_sha256, d.payload_sha256);
  assert.ok(Array.isArray(d.step_log) && d.step_log.length >= 3, "doorstep proof carries the step log");
});

test("SC-082 bare ask (no stop recorded): typed and honest — no ticket claimed, gap marked", () => {
  const r = chatPath(ASK_082, baseCtx());
  assert.ok(r, "the chat path answers the bare captcha ask");
  assert.equal(r.intent, "captcha_handoff");
  assert.equal(r.resultStatus, "awaiting_user");
  assert.equal(r.sends, 0);
  const p = r.artifact || r.payload;
  assert.ok(p, "even the bare ask returns the typed payload shape");
  assert.equal(p.kind, "captcha_handoff_doorstep");
  assert.equal(p.ticket, null, "no ticket is claimed when no run actually stopped");
  assert.ok(r.doorstep && typeof r.doorstep.gap === "string" && r.doorstep.gap.length > 0,
    "the doorstep record marks the gap instead of claiming a driven artifact");
});

test("SC-082 resume turn: the ticket validates exactly once and the run resumes", () => {
  const stop = stopTurn();
  const p = stop.artifact || stop.payload;
  assert.ok(p && p.ticket, "precondition: the stop turn minted a ticket");
  const r = chatPath("[TEST tap] I finished the CAPTCHA step",
    Object.assign(baseCtx(), { pendingHandoff: p.ticket, resumeToken: p.ticket.resume_token, now: NOW + 5 * 60 * 1000 }));
  assert.ok(r, "the chat path answers the resume turn");
  assert.equal(r.intent, "captcha_handoff");
  assert.equal(r.resultStatus, "completed", "the handoff leg completes — never spoken as the application being submitted");
  assert.equal(r.sends, 0);
  assert.equal(r.submits, 0);
  assert.ok(!r.submission, "resuming a handoff submits nothing");
  const rp = r.artifact || r.payload;
  assert.ok(rp, "the resume turn carries its typed payload");
  assert.equal(rp.kind, "captcha_handoff_resumed");
  assert.equal(rp.run_id, "TEST-RUN-082", "the SAME run resumes");
  assert.equal(rp.ticket_status, "resumed");
});

test("SC-082 replay: a reused resume token is refused (already_used) with zero side effects", () => {
  const stop = stopTurn();
  const p = stop.artifact || stop.payload;
  assert.ok(p && p.ticket, "precondition: the stop turn minted a ticket");
  const resumedTicket = Object.assign({}, p.ticket, { status: "resumed", resumed_at: "2026-10-13T05:05:00.000Z", resume_token: p.ticket.resume_token });
  const r = chatPath("[TEST tap] I finished the CAPTCHA step",
    Object.assign(baseCtx(), { pendingHandoff: resumedTicket, resumeToken: p.ticket.resume_token, now: NOW + 6 * 60 * 1000 }));
  assert.ok(r, "the chat path answers the replayed resume turn");
  assert.equal(r.intent, "captcha_handoff");
  assert.equal(r.resultStatus, "blocked");
  assert.ok(r.guard_refusal, "the refusal uses the 141 emitterBlocked shape");
  assert.equal(r.guard_refusal.code, "already_used");
  assert.equal(r.payload, null);
  assert.equal(r.sends, 0);
  assert.equal(r.submits, 0);
  assert.ok(!r.submission, "a refused replay submits nothing");
});

test("SC-286 pin: connect_google returns the typed doorstep payload (landed fix — must not regress)", () => {
  const r = chatPath("Connect Gmail and Calendar with one consent tap", baseCtx());
  assert.ok(r, "the chat path answers the connect ask");
  assert.equal(r.handler, "120");
  assert.equal(r.intent, "connect_google");
  assert.equal(r.resultStatus, "awaiting_user");
  assert.equal(r.sends, 0);
  const p = r.artifact || r.payload;
  assert.ok(p, "the result carries the doorstep payload (the census defect was its absence)");
  assert.equal(r.artifact, r.payload);
  assert.equal(p.kind, "connect_google_doorstep");
  assert.equal(p.edge_action, "start_career");
  assert.equal(p.requires_user_tap, true);
  assert.equal(p.committed, false, "the connect turn never claims the connection happened");
  assert.ok(Array.isArray(p.scopes) && p.scopes.length === 4, "the four career scopes ride in the payload");
  assert.ok(p.self_test && p.self_test.test_email && p.self_test.test_event, "the self-test plan rides in the payload");
});
