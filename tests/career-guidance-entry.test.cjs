"use strict";
// BUG-211 / FR-369 (MI-047, Crew A, 2026-10-15): the flagship guidance
// ask cold-starts to the contained fallback because two hand-kept
// phrase lists diverge — the router's guidance dispatch gate and
// 142's guidanceIntentFor. The gate now admits whatever the intent
// matcher recognizes, and plan_paths carries the entry shapes
// (break into / where do I start). The intent matcher is the single
// source of guidance shapes at the gate; this guard pins the entry
// phrasings, the previously working shapes, and the boundary.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../scripts/career/gauntlet/pilot-lib.cjs");

const FALLBACK = /I didn't catch that/;
function coldReply(ask) {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = L.H.session("GE-" + Math.random().toString(36).slice(2, 9), "grand");
  const r = L.chatTurn(s, ask, { profile });
  return { handler: r.handler, reply: (r.delivered || []).join("\n") };
}

for (const ask of [
  "I want to break into investment banking — where do I start?",
  "how do I break into investment banking?",
  "what's the path into investment banking?",
  "where do I start if I want to work in investment banking?",
]) {
  test(`BUG-211: guidance entry ask routes to the guidance engine — ${ask}`, () => {
    const { handler, reply } = coldReply(ask);
    assert.equal(handler, "142-career-router.handleChat");
    assert.ok(!FALLBACK.test(reply), `must not land on the contained fallback: ${reply.slice(0, 160)}`);
    assert.ok(/path|plan|step|start/i.test(reply), `reply should read as guidance: ${reply.slice(0, 200)}`);
  });
}

test("BUG-211: the previously working shape still routes (no regression)", () => {
  const { reply } = coldReply("how do i get into investment banking?");
  assert.ok(!FALLBACK.test(reply));
  assert.match(reply, /Two plausible paths/);
});

test("BUG-211: the widened gate does not capture non-guidance asks", () => {
  const { reply } = coldReply("can you book me a flight to Chicago for tomorrow?");
  assert.ok(!/Two plausible paths/.test(reply), `a flight ask must not receive the guidance answer: ${reply.slice(0, 160)}`);
});

test("BUG-211: an ask another handler owns keeps its owner (the admission runs last in dispatch)", () => {
  // SC-113's text matches plan_paths' quant...path shape, but its
  // owner is handleWeakProfile — the admission must not intercept it.
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = L.H.session("GE-113", "grand");
  const r = L.chatTurn(s, "Weak-profile honesty: quant firms, no math background — refuse to submit; 12-month path + adjacent roles now", { profile });
  assert.equal(r.result && r.result.payload && r.result.payload.kind, "weak_profile_plan", `SC-113 must keep its owner: ${JSON.stringify(r.result && r.result.payload).slice(0, 160)}`);
});
