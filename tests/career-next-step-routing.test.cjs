/* W-NEXTSTEP guard (MI-012 / LF-01a NEXT_STEP_UNROUTED):
   the single largest live fallback class is the next-step follow-up —
   a turn whose whole meaning is "continue THIS thread" and which
   carries no fresh product nouns ("whats my next step then?",
   "ok and then?", "so what do I do next", "what now?"). The claim is
   the turn's DISCOURSE FUNCTION, not a phrase: the whole turn is a
   continuation ask, and the answer is composed from the thread's
   active work (tracked application, outreach plan, prep in motion,
   named target) — or, in a cold thread, the career-OS intake
   question that starts a plan. Never the generic fallback, never an
   invented plan over no facts, and the ask itself writes nothing.
   Every follow-up shape below fell to the generic fallback (or, after
   prep, was answered with the cold intake) on the pre-fix 142.
   Check: node --test tests/career-next-step-routing.test.cjs */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const Router = D("142-career-router.js");

const NOW = Date.parse("2026-10-15T15:00:00.000Z");
const isFallback = (res) => !res || res.intent === "career_fallback" || String((res && res.reply) || "").match(/^(I didn't catch that|I'm Trainee, a career agent: I find roles)/);

function makeHost() {
  return CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: Router, CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
}
function runConvo(texts) {
  const host = makeHost();
  let ctx = host.createTurnCtx({ userId: "nextstep-user", threadId: "nextstep-1", now: NOW, snapshot: null });
  const turns = [];
  texts.forEach((text, i) => {
    const res = host.runTurn(text, ctx);
    const snap = host.extractSnapshot(ctx);
    turns.push({ text, res, snap });
    ctx = host.createTurnCtx({ userId: "nextstep-user", threadId: "nextstep-1", now: NOW + (i + 1) * 60000, snapshot: snap });
  });
  return turns;
}
const rowsOf = (snap) => (((snap.stores || {}).trackStore || {}).rows) || [];
const factsOf = (snap) => {
  const a = (((snap.stores || {}).statedFacts || {}).facts) || [];
  const ts = ((snap.stores || {}).trackStore || {});
  const b = (((ts._careerThread || {}).facts || {}).facts) || [];
  return a.length ? a : b;
};

// The follow-up family: explicit next-step asks AND the elliptical
// forms whose only content is the continuation itself.
const SHAPES = [
  "whats my next step then?",
  "ok and then?",
  "so what do I do next",
  "what now?",
  "so what's next?",
  "and then what?",
  "what should I do next?",
];

// The diagnosis grid: the same shapes across five thread states.
const CELLS = {
  cold: [],
  tracked: ["track this: I applied to Helios Health yesterday"],
  outreach: ["I want to network into Northbeam in Boston, that's the one I care about"],
  prep: ["prep me for my interview — hit me with a DCF question"],
  named_target: [
    "I want to network into Northbeam in Boston, that's the one I care about",
    "junior, econ major btw",
  ],
};

for (const [cell, seed] of Object.entries(CELLS)) {
  test(`grid cell ${cell}: every next-step follow-up shape is answered, none on the generic fallback`, () => {
    for (const shape of SHAPES) {
      const turns = runConvo([...seed, shape]);
      const last = turns[turns.length - 1];
      assert.ok(!isFallback(last.res), `cell ${cell}, shape ${JSON.stringify(shape)} fell to fallback: ${last.res && last.res.reply}`);
      assert.ok(last.res && last.res.reply && last.res.reply.length > 40, `cell ${cell}, shape ${JSON.stringify(shape)} got a thin reply`);
    }
  });
}

test("tracked cell: the next move is read from the tracker row — the company and its stage", () => {
  for (const shape of SHAPES) {
    const turns = runConvo([...CELLS.tracked, shape]);
    const last = turns[turns.length - 1];
    assert.match(last.res.reply, /Helios Health/, `shape ${JSON.stringify(shape)} did not answer from the tracked application: ${last.res.reply.slice(0, 200)}`);
  }
});

test("outreach + named-target cells: the next move is the standing plan's approval step, naming the target", () => {
  for (const cell of ["outreach", "named_target"]) {
    for (const shape of SHAPES) {
      const turns = runConvo([...CELLS[cell], shape]);
      const last = turns[turns.length - 1];
      assert.match(last.res.reply, /Northbeam/, `cell ${cell}, shape ${JSON.stringify(shape)} did not answer from the plan: ${last.res.reply.slice(0, 200)}`);
      assert.match(last.res.reply, /approve|approval/i, `cell ${cell}, shape ${JSON.stringify(shape)} lost the plan's gate: ${last.res.reply.slice(0, 200)}`);
    }
  }
});

test("prep cell: the next move stays on the prep in motion — never the cold intake question", () => {
  for (const shape of SHAPES) {
    const turns = runConvo([...CELLS.prep, shape]);
    const last = turns[turns.length - 1];
    assert.ok(!/field and the season/i.test(last.res.reply), `shape ${JSON.stringify(shape)} was answered as a cold thread despite prep in motion: ${last.res.reply.slice(0, 200)}`);
    assert.match(last.res.reply, /prep|question|interview|DCF/i, `shape ${JSON.stringify(shape)} did not answer from the prep work: ${last.res.reply.slice(0, 200)}`);
  }
});

test("cold cell: the answer is the one intake question that starts a plan — no invented plan over no facts", () => {
  for (const shape of SHAPES) {
    const turns = runConvo([shape]);
    const last = turns[turns.length - 1];
    assert.ok(!isFallback(last.res), `cold shape ${JSON.stringify(shape)} fell to fallback`);
    assert.match(last.res.reply, /internship or full-time|field and the season/i, `cold shape ${JSON.stringify(shape)} did not ask the intake question: ${last.res.reply.slice(0, 200)}`);
    assert.ok(!/Move one/i.test(last.res.reply), `cold shape ${JSON.stringify(shape)} invented a plan over no facts`);
    assert.equal(rowsOf(last.snap).length, 0, "a cold next-step ask wrote a tracker row");
    assert.equal(factsOf(last.snap).length, 0, "a cold next-step ask wrote thread facts");
  }
});

test("a next-step ask writes nothing: tracker rows, thread facts, and pause state are unchanged by the ask", () => {
  for (const cell of ["tracked", "outreach", "named_target"]) {
    const seedTurns = runConvo(CELLS[cell]);
    const before = seedTurns[seedTurns.length - 1].snap;
    for (const shape of SHAPES) {
      const turns = runConvo([...CELLS[cell], shape]);
      const last = turns[turns.length - 1];
      assert.equal(rowsOf(last.snap).length, rowsOf(before).length, `cell ${cell}, shape ${JSON.stringify(shape)} changed the tracker`);
      assert.equal(factsOf(last.snap).length, factsOf(before).length, `cell ${cell}, shape ${JSON.stringify(shape)} changed the thread facts`);
      assert.ok(!(((last.snap.stores || {}).globalPause || {}).set === true), `cell ${cell}, shape ${JSON.stringify(shape)} set a pause`);
    }
  }
});

test("claim order: more specific routes keep their turns in the same threads", () => {
  // Tracker status is a specific route, not a next-step follow-up.
  const tracked = runConvo([...CELLS.tracked, "what's its status"]);
  assert.equal(tracked[tracked.length - 1].res.intent, "tracking_status");
  // Follow-up timing on a plan thread is the wave route's turn.
  const plan = runConvo([
    "I am a sophomore who wants to network into investment banking. Help me find people to reach out to and draft my first outreach.",
    "when do the follow-ups go out after the first emails?",
  ]);
  assert.match(plan[plan.length - 1].res.reply, /day[ -]?6/i);
  // A prep ask itself still routes to prep, not to the continuation claim.
  const prep = runConvo(["prep me for my interview — hit me with a DCF question"]);
  assert.equal(prep[0].res.intent, "prep_brief");
  // A multi-intent continuation still pops the held queue part.
  const multi = runConvo([
    "two asks — hunt down data internships for next summer, and put together a networking plan for fintech firms",
    "kick off with the opening one",
  ]);
  assert.ok(!isFallback(multi[1].res), "queue continuation was stolen by the next-step claim");
});

test("paused thread: a next-step follow-up names the standing pause instead of an unpaused move", () => {
  const turns = runConvo([
    "stop everything, pause all my outreach right now",
    "what now?",
  ]);
  const last = turns[turns.length - 1];
  assert.ok(!isFallback(last.res), `paused next-step fell to fallback: ${last.res && last.res.reply}`);
  assert.match(last.res.reply, /paus/i, `paused next-step did not name the pause: ${last.res.reply.slice(0, 200)}`);
});
