// ROUTING FIX (owner order 2026-10-13: "fix exactly what broke it") — replay
// tests for the routing collapse (census briefs A1–A6 in
// docs/career/gauntlet-ledger.md). Written FAIL-FIRST against the pre-fix
// build (wedge canonical routing was 3/30 = 10% by
// scripts/career/gauntlet/run-routing-grade.cjs).
//
// Drives the staging chat path (pilot-lib chatTurn: 143 -> 120 -> 130 ->
// 142 -> 141, replies composed by 140) exactly as the graders do, and judges
// correctness with the routing grader's OWN isCorrect/observedTool — the
// product must satisfy the standing grader, never a private copy of it.
// Check: node --test tests/career-router-wedge.test.cjs
"use strict";
process.env.HARNESS_OUT_DIR = process.env.HARNESS_OUT_DIR || "/tmp/gauntlet-wedge-test-harness";
process.env.GAUNTLET_OUT_DIR = process.env.GAUNTLET_OUT_DIR || "/tmp/gauntlet-wedge-test-evidence";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const L = require(path.join(ROOT, "scripts/career/gauntlet/pilot-lib.cjs"));
const RG = require(path.join(ROOT, "scripts/career/gauntlet/run-routing-grade.cjs"));
const H = L.H;

const EXPECT = JSON.parse(fs.readFileSync(RG.EXPECTATIONS_PATH, "utf8"));
const BY_ID = new Map(EXPECT.entries.map((e) => [e.id, e]));
const WEDGE = ["SC-286", "SC-287", "SC-011", "SC-146", "SC-148", "SC-023",
  "SC-012", "SC-007", "SC-020", "SC-049", "SC-050", "SC-046",
  "SC-025", "SC-040", "SC-041", "SC-042", "SC-043",
  "SC-031", "SC-032", "SC-033", "SC-038", "SC-034",
  "SC-036", "SC-037", "SC-044", "SC-045", "SC-151", "SC-157",
  "SC-035", "SC-300"];

function drive(id, ask, ctxExtra) {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = H.session(id, "wedge-fix");
  const ctx = Object.assign({ profile }, ctxExtra || {});
  const turn = L.chatTurn(s, ask, ctx);
  return { turn, text: (turn.delivered || []).join("\n"), profile };
}

for (const id of WEDGE) {
  test(`wedge ${id}: canonical ask routes to its expected tool`, () => {
    const exp = BY_ID.get(id);
    const { turn, text } = drive(id, exp.ask);
    assert.ok(turn.handler, `${id}: a handler must own the turn (was contained/silent)`);
    assert.ok(!turn.contained, `${id}: turn must not end in containment`);
    assert.ok(RG.isCorrect(exp, turn, text),
      `${id}: expected ${exp.expected_tool} (intents: ${(exp.acceptable_intents || []).join(",")}), observed tool=${RG.observedTool(turn)} intent=${turn.result && turn.result.intent}; reply: ${text.slice(0, 200)}`);
    assert.ok(!/didn'?t catch that/i.test(text), `${id}: no "didn't catch that" reply`);
  });
}

// ---- A4 singles -----------------------------------------------------------
test("A4 SC-287: LinkedIn connection routes to the data-EXPORT path, never sign-in", () => {
  const exp = BY_ID.get("SC-287");
  const { turn, text } = drive("SC-287", exp.ask);
  assert.equal(turn.result && turn.result.intent, "profile_export");
  assert.ok(!/sign in, done|open this, sign in/i.test(text), "no sign-in instruction may be delivered (R-B11)");
  assert.match(text, /export/i, "the reply names the export path");
});

test("A4 SC-277: return-offer playbook is NOT internship discovery", () => {
  const exp = BY_ID.get("SC-277");
  const { turn, text } = drive("SC-277", exp.ask);
  assert.equal(turn.result && turn.result.intent, "capability_status");
  assert.ok(!/Northwind Ledger|Lakefront Cloud/.test(text), "no canned discovery shortlist");
});

test("A4 SC-111: design packet ask routes to design discovery, no backend packet artifact", () => {
  const exp = BY_ID.get("SC-111");
  const { turn, text } = drive("SC-111", exp.ask);
  assert.equal(turn.result && turn.result.intent, "career_discovery");
  assert.ok(!(turn.result && turn.result.packet), "no packet may be produced for a family-only ask");
  assert.ok(!/backend/i.test(text), "no backend packet may be served for a design ask");
});

test("A4 SC-062: tailor-for-a-role ask chains discovery -> tailor (artifact produced)", () => {
  const exp = BY_ID.get("SC-062");
  const { turn } = drive("SC-062", exp.ask);
  assert.ok(turn.result && turn.result.artifact, "the chain must produce the tailored artifact in the same turn (A6)");
  assert.ok(["career_tailor", "career_discovery"].includes(turn.result.intent));
});

// ---- A5: SC-286 typed result + doorstep payload ---------------------------
test("A5 SC-286: connect_google returns a TYPED result with a doorstep payload", () => {
  const exp = BY_ID.get("SC-286");
  const { turn } = drive("SC-286", exp.ask);
  const r = turn.result || {};
  assert.equal(r.intent, "connect_google");
  assert.ok(typeof r.resultStatus === "string" && r.resultStatus.length > 0, "resultStatus must be typed, not null");
  assert.ok(r.artifact && typeof r.artifact === "object", "a doorstep payload (consent + self-test) must ride the result");
});

// ---- A3: catch-all narrowing ----------------------------------------------
test("A3: 'find' people asks never land in job discovery", () => {
  for (const [id, ask] of [
    ["SC-001", BY_ID.get("SC-001").ask],
    ["SC-012", BY_ID.get("SC-012").ask],
    ["SC-023", BY_ID.get("SC-023").ask],
    ["SC-165", BY_ID.get("SC-165").ask],
  ]) {
    const { turn } = drive(id, ask);
    assert.notEqual(turn.result && turn.result.intent, "career_discovery", `${id} must not be served job discovery`);
  }
});

// ---- A6: SC-065 family wiring ----------------------------------------------
test("A6 SC-065: PM ask gets an honest family answer, never the SWE shortlist", () => {
  const exp = BY_ID.get("SC-065");
  const { turn, text } = drive("SC-065", exp.ask);
  assert.equal(turn.result && turn.result.intent, "career_discovery");
  assert.ok(!/Northwind Ledger|Lakefront Cloud|Eastbank Systems|Copperline Infra|Fieldnote Software/.test(text),
    "cross-family roles must not be served for a PM ask");
  assert.match(text, /product|PM/i, "the reply addresses the asked family");
});

// ---- SC-300's other half: every router path honors the global pause --------
test("pause: with the global pause set, a send-shaped turn is held and nothing is drafted to send", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = H.session("PAUSE", "wedge-fix");
  const turn = L.chatTurn(s, "Email 200 boutique IB analysts, warmth-ranked (same hometown first)", { profile, globalPause: { set: true, at: "2026-10-13T12:00:00Z", reason: "user stop everything" } });
  const r = turn.result || {};
  assert.equal(r.resultStatus, "blocked", "the turn is held while the pause is set");
  assert.ok(!r.draft || r.sends === 0, "no sendable draft is produced under pause");
  assert.match((turn.delivered || []).join("\n"), /paus/i, "the reply names the pause");
});

test("pause: read-only turns still answer while the pause is set", () => {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = H.session("PAUSE2", "wedge-fix");
  const turn = L.chatTurn(s, "Who do I know at Stripe?", { profile, globalPause: { set: true } });
  assert.ok(turn.result && turn.result.intent, "a read-only graph question is still owned");
  assert.notEqual(turn.result.resultStatus, "blocked");
});

// ---- SC-035: refusal shape --------------------------------------------------
test("SC-035: blast + false-referral demand is refused with the true path offered", () => {
  const exp = BY_ID.get("SC-035");
  const { turn, text } = drive("SC-035", exp.ask);
  const r = turn.result || {};
  assert.equal(r.intent, "intent_refusal");
  assert.equal(r.sends || 0, 0);
  assert.match(text, /instead|true path|shortlist|cap/i, "a real alternative is offered");
});

// ---- paraphrase spot battery (full battery: run-wedge-battery.cjs) --------
for (const [id, variants] of Object.entries({
  "SC-012": [
    "find 150 analysts at elite boutiques (evercore, lazard, centerview) in chicago",
    "Can you handle this for me: find 150 analysts at elite boutiques (Evercore, Lazard, Centerview) in Chicago?",
  ],
  "SC-146": [
    "who do i know at stripe?",
    "I've been told I should sort this out — who do I know at Stripe? Can you handle that for me?",
  ],
  "SC-036": [
    "day-6 follow-up wave: new angle, threaded, only to non-responders",
    "Please just handle this: day-6 follow-up wave, new angle, threaded, only to non-responders.",
  ],
})) {
  test(`paraphrase ${id}: variants route to the same tool as the canonical ask`, () => {
    const exp = BY_ID.get(id);
    const canon = drive(id, exp.ask);
    const canonTool = RG.observedTool(canon.turn);
    for (const v of variants) {
      const { turn, text } = drive(id, v);
      assert.equal(RG.observedTool(turn), canonTool, `${id} variant "${v.slice(0, 50)}..." observed ${RG.observedTool(turn)} != canonical ${canonTool}`);
      assert.ok(RG.isCorrect(exp, turn, text), `${id} variant must route to ${exp.expected_tool}`);
    }
  });
}
