// Gauntlet repair R2 — universal containment regression tests.
// Defect (pilot baseline, ba708c1): the staging chat path has NO containment.
//   * C38 leg i: a corrupt profile makes 130's handler throw TypeError;
//     no recovery bubble, no product-written failure record — silence.
//   * U12 (all legs) + 25 other pilot turns: both handleChat entry points
//     return null (or a result with no reply) and nothing is delivered —
//     27 oracle `empty-reply` hard fails across the pilot.
//   * 140-career-reply HAS fallback("error"/"unmatched"/"empty") — nothing
//     in the path calls it. That unwired safety net is the bug.
// Contract asserted here (post-repair):
//   * ANY throw / null return / empty result from the turn dispatch produces
//     (a) a human fallback bubble composed through 140's fallback API as-is
//         (exact canned text — the fallback invents nothing), oracle-clean;
//     (b) a durable failure record written by the product path itself:
//         structured JSON {timestamp, session/case context, boundary,
//         error class} — no message, no stack, no raw user data.
//   * A valid reply passes through untouched and writes NO record.
//   * Fall-through semantics are preserved: handler 1 returning null is NOT
//     a failure — containment sits at the TURN entry, after all routes.
// Run: node --test tests/career-gauntlet-r2.test.cjs
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Isolated evidence roots BEFORE loading pilot-lib (it binds env at load).
const TMPROOT = fs.mkdtempSync(path.join(os.tmpdir(), "g-r2-test-"));
process.env.GAUNTLET_OUT_DIR = path.join(TMPROOT, "evidence");
process.env.HARNESS_OUT_DIR = path.join(TMPROOT, "harness");
process.env.GAUNTLET_HARNESS_TMP = process.env.HARNESS_OUT_DIR;

const ROOT = path.join(__dirname, "..");
const CareerReply = require(path.join(ROOT, "packages/domain/140-career-reply.js"));
const Oracle = require(path.join(ROOT, "scripts/career/reply-oracle.cjs"));
const CareerAccess = require(path.join(ROOT, "packages/domain/120-career-access.js"));
const CareerOnboarding = require(path.join(ROOT, "packages/domain/130-career-onboarding.js"));

let Containment = null;
try { Containment = require(path.join(ROOT, "packages/domain/143-career-containment.js")); } catch (e) { Containment = null; }
const L = require(path.join(ROOT, "scripts/career/gauntlet/pilot-lib.cjs"));

const ERROR_FALLBACK = "Something went wrong on my end. Nothing was changed — try again in a moment and I will pick it back up.";
const FIXED_NOW = () => new Date("2026-10-13T15:00:00.000Z");

function makeContainment(extra) {
  assert.ok(Containment, "143-career-containment.js must exist (pre-repair build: it does not — the defect)");
  const written = [];
  const c = Containment.createContainment(Object.assign({
    composer: CareerReply,
    now: FIXED_NOW,
    sink: (rec) => written.push(rec),
  }, extra || {}));
  return { c, written };
}

test("R2 baseline probe: raw domain modules still throw / return null unwrapped (wrapper is additive, modules untouched)", () => {
  assert.throws(
    () => CareerOnboarding.handleChat("what do you have stored about me?", { profile: { facts: "corrupt-string-not-an-array" } }),
    TypeError,
  );
  assert.equal(CareerAccess.handleChat("find me roles at Goldman Sachs", {}), null);
  assert.equal(CareerOnboarding.handleChat("find me roles at Goldman Sachs", {}), null);
});

test("R2 C38 leg i (unit): a throwing handler turn is contained — fallback bubble + failure record, no silence", () => {
  const { c, written } = makeContainment();
  const out = c.runTurn(() => { throw new TypeError("boom (p.facts || []).map is not a function — raw-user-data-must-not-leak-12345"); }, { caseId: "C38", sessionId: "unit-c38" });
  assert.equal(out.contained, true);
  assert.equal(out.boundary, "throw");
  assert.equal(out.errorClass, "TypeError");
  // (a) human fallback bubble, exactly 140's canned error text — invents nothing.
  assert.equal(out.replyText, ERROR_FALLBACK);
  assert.equal(out.replyText, CareerReply.fallback("error"));
  assert.equal(CareerReply.lint(out.replyText).ok, true);
  assert.equal(Oracle.checkText(out.replyText).pass, true, JSON.stringify(Oracle.checkText(out.replyText)));
  // (b) durable failure record written by the product path (via the sink).
  assert.equal(written.length, 1);
  const rec = written[0];
  assert.equal(rec.kind, "career_containment_failure");
  assert.equal(rec.timestamp, "2026-10-13T15:00:00.000Z");
  assert.equal(rec.case_id, "C38");
  assert.equal(rec.session_id, "unit-c38");
  assert.equal(rec.boundary, "throw");
  assert.equal(rec.error_class, "TypeError");
  assert.equal(rec.fallback_kind, "error");
  assert.equal(rec.fallback_delivered, true);
  // No secrets / raw user data / message / stack in the record, ever.
  const raw = JSON.stringify(rec);
  assert.ok(!raw.includes("raw-user-data-must-not-leak-12345"), "record must not carry the error message");
  assert.ok(!/stack/i.test(raw), "record must not carry a stack");
  assert.ok(!("message" in rec) && !("stack" in rec) && !("text" in rec) && !("turn_text" in rec));
  assert.equal(out.failureRecord, rec);
});

test("R2 U12 (unit): a null-route turn is contained — unmatched fallback + failure record", () => {
  const { c, written } = makeContainment();
  const out = c.runTurn(() => null, { caseId: "U12", sessionId: "unit-u12" });
  assert.equal(out.contained, true);
  assert.equal(out.boundary, "null_result");
  assert.equal(out.errorClass, null);
  assert.equal(out.replyText, CareerReply.fallback("unmatched"));
  assert.equal(CareerReply.lint(out.replyText).ok, true);
  assert.equal(Oracle.checkText(out.replyText).pass, true);
  assert.equal(written.length, 1);
  assert.equal(written[0].boundary, "null_result");
  assert.equal(written[0].fallback_kind, "unmatched");
});

test("R2: empty results are contained — {}, empty/whitespace reply, empty string, empty bubbles", () => {
  const { c, written } = makeContainment();
  for (const bad of [{}, { intent: "x", reply: "" }, { reply: "   " }, "", { bubbles: [] }, { bubbles: ["", " "] }]) {
    const out = c.runTurn(() => bad, { caseId: "R2", sessionId: "unit-empty" });
    assert.equal(out.contained, true, JSON.stringify(bad));
    assert.equal(out.boundary, "empty_result", JSON.stringify(bad));
    assert.equal(out.replyText, CareerReply.fallback("empty"), JSON.stringify(bad));
    assert.equal(Oracle.checkText(out.replyText).pass, true);
  }
  assert.equal(written.length, 6);
  assert.ok(written.every((r) => r.boundary === "empty_result" && r.fallback_kind === "empty"));
});

test("R2: a valid reply passes through untouched and writes no record; handler fall-through is not a failure", () => {
  const { c, written } = makeContainment();
  const good = { intent: "connected_accounts", reply: "Gmail: connected as someone@example.com (read + send)" };
  const out = c.runTurn(() => good, { caseId: "R2", sessionId: "unit-good" });
  assert.equal(out.contained, false);
  assert.equal(out.result, good);
  assert.equal(out.replyText, good.reply);
  assert.equal(out.failureRecord, null);
  // Route-agnostic fall-through: first route null, second route answers.
  const out2 = c.runTurn(() => { const a = null; return a || { reply: "Second route answered." }; }, { caseId: "R2", sessionId: "unit-good" });
  assert.equal(out2.contained, false);
  assert.equal(out2.replyText, "Second route answered.");
  assert.equal(written.length, 0);
});

test("R2: if the composer's fallback itself is unusable, a lint-clean last-resort bubble is still delivered", () => {
  const { c } = makeContainment({ composer: { fallback: () => "", lint: () => ({ ok: false, violations: ["x"] }) } });
  const out = c.runTurn(() => null, { caseId: "R2", sessionId: "unit-resort" });
  assert.equal(out.contained, true);
  assert.ok(out.replyText && out.replyText.trim().length > 0, "a bubble must still be delivered");
  assert.equal(CareerReply.lint(out.replyText).ok, true);
  assert.equal(Oracle.checkText(out.replyText).pass, true);
});

test("R2 C38 leg i (integrated, staging turn entry): corrupt profile turn delivers the error fallback and writes a durable record file", () => {
  const s = L.H.session("C38R2", "r2-c38-leg-i");
  const turn = L.chatTurn(s, "what do you have stored about me?", { profile: { facts: "corrupt-string-not-an-array" } });
  assert.equal(turn.contained, true, "chatTurn must report containment");
  assert.equal(turn.boundary, "throw");
  assert.deepEqual(turn.delivered, [ERROR_FALLBACK]);
  const oracle = Oracle.checkMessages(s.messages);
  assert.equal(oracle.pass, true, JSON.stringify(oracle.failures));
  assert.ok(!oracle.failures.some((f) => f.rule === "empty-reply"));
  // Durable record: product-written JSONL in the case evidence dir.
  const file = path.join(process.env.GAUNTLET_OUT_DIR, "C38R2", "trial-1", "containment-failures.jsonl");
  assert.ok(fs.existsSync(file), "failure record file must exist at " + file);
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").map((x) => JSON.parse(x));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].boundary, "throw");
  assert.equal(lines[0].error_class, "TypeError");
  assert.equal(lines[0].case_id, "C38R2");
  assert.equal(lines[0].fallback_kind, "error");
});

test("R2 U12 (integrated, staging turn entry): no leg is silent; legs no route answers are contained with records (coordinator integration update: R1's router now answers legs 1-3 substantively — the invariant is no-silence, asserted per leg)", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = L.H.session("U12R2", "r2-u12");
  const turns = [
    "tailor my resume to this",
    "find me roles at Goldman Sachs",
    "send my resume from my Gmail",
    "here's my fixed resume, use this one",
  ];
  const results = turns.map((t) => L.chatTurn(s, t, { profile }));
  for (const [i, turn] of results.entries()) {
    assert.ok(turn.delivered.length >= 1 && turn.delivered.every((d) => d && d.trim().length > 0), `leg ${i + 1} delivered no bubble`);
  }
  // Legs 1-3 are answered by the R1 router on the integrated chain (not contained).
  for (const i of [0, 1, 2]) assert.equal(results[i].contained, false, `leg ${i + 1}`);
  // Leg 4 (resume re-upload) still has no ingest route: the ROUTER itself returns
  // 140's unmatched fallback as a normal result (142's design), so the turn is not
  // contained and no failure record is written — the user still gets a bubble, and
  // the recovery still cannot complete (no ingest route exists; R2 claims only the
  // end of the silence, and containment records are proven by the C38/delivery tests).
  assert.equal(results[3].handler, "142-career-router.handleChat");
  assert.equal(results[3].contained, false);
  assert.deepEqual(results[3].delivered, [CareerReply.fallback("unmatched")]);
  const oracle = Oracle.checkMessages(s.messages);
  assert.equal(oracle.pass, true, JSON.stringify(oracle.failures));
});

test("R2 C37 spot-check (integrated): the stop turn receives an honest bubble — R-A4 update (SC-300 kill-switch fix): with no queue state in ctx, 141 sets the global pause anyway and says the exact counts are unverified, never a no-op (the real halt with queue state is R3's own test; the pause/count contract is tests/career-killswitch-ra4.test.cjs)", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = L.H.session("C37R2", "r2-c37");
  const turn = L.chatTurn(s, "stop everything. don't contact anyone", { profile });
  assert.equal(turn.handler, "141-career-doorstep.handleChat");
  assert.deepEqual(turn.delivered, ["Stopped everything: the global pause is now set for your account, so no outreach can start or continue from any queue. I could not read the queue's own records in this session, so how many already went out and how many were waiting is unverified. Next step: reload the queue state and I will reconcile the exact counts against it."]);
  assert.equal(turn.result.global_pause_set, true);
  assert.equal(turn.result.counts_verified, false);
  assert.equal(turn.result.resultStatus, "completed");
  const oracle = Oracle.checkMessages(s.messages);
  assert.ok(!oracle.failures.some((f) => f.rule === "empty-reply"), JSON.stringify(oracle.failures));
});

test("R2 delivery seam (integrated): a throw at the harness delivery step is contained, recorded, and the fallback is delivered instead", () => {
  const s = L.H.session("DELIVR2", "r2-delivery");
  const realAgent = s.agent.bind(s);
  let calls = 0;
  s.agent = (text, opts) => { calls++; if (calls === 1) throw new Error("harness delivery boom"); return realAgent(text, opts); };
  const profile = L.gauntletProfile("p1-early-career-swe");
  // A turn 120 actually answers, so the primary bubble exists and delivery is what fails.
  const turn = L.chatTurn(s, "what accounts do I have connected?", { profile, statusRecords: [] });
  assert.equal(turn.deliveryContained, true);
  assert.deepEqual(turn.delivered, [ERROR_FALLBACK]);
  const file = path.join(process.env.GAUNTLET_OUT_DIR, "DELIVR2", "trial-1", "containment-failures.jsonl");
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").map((x) => JSON.parse(x));
  assert.ok(lines.some((r) => r.boundary === "delivery" && r.error_class === "Error"), JSON.stringify(lines));
});
