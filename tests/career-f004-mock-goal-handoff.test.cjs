"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const domain = (name) => require(path.join(root, "packages/domain", name));
const { CareerHost } = require(path.join(root, "supabase/functions/_shared/career_host.js"));
const clone = (x) => JSON.parse(JSON.stringify(x));
const NOW = Date.parse("2026-10-22T12:00:00Z");

function world(profile = true) {
  const host = CareerHost.createCareerHost({
    CareerAccess: domain("120-career-access.js"), CareerOnboarding: domain("130-career-onboarding.js"),
    CareerRouter: domain("142-career-router.js"), CareerDoorstep: domain("141-career-doorstep.js"),
    CareerReply: domain("140-career-reply.js"), CareerContainment: domain("143-career-containment.js"),
  });
  const threads = new Map(); let account = {}; let turns = 0;
  if (profile) threads.set("old", { v: 1, scope: { userId: "synthetic-f004" }, stores: {
    profile: { id: "synthetic-profile", basics: { name: "Invented Test Persona" }, preferences: {}, constraints: {}, facts: [] },
  } });
  function say(text, thread = "old") {
    const ctx = host.createTurnCtx({ userId: "synthetic-f004", threadId: thread,
      now: NOW + ++turns * 1000, accountPersistence: true,
      account: clone(account), snapshot: threads.get(thread) || null, postings: [] });
    const out = host.runTurn(text, ctx);
    threads.set(thread, host.extractSnapshot(ctx));
    for (const [key, value] of Object.entries(ctx._hostPatch || {})) {
      assert.ok(["paused", "preferred_locations", "erase", "stated_facts"].includes(key));
      account[key] = clone(value);
    }
    return { ctx, out };
  }
  function mock() {
    const r = say("start a mock interview for a Backend Engineer role at Fieldnote Software (fictional)");
    assert.equal(r.out.intent, "prep_mock_start"); return r;
  }
  const state = () => {
    const stores = threads.get("old")?.stores || {};
    return stores.trackStore?._careerThread?.prep?.prepMock || stores.profile?._careerRouterPrep;
  };
  const answers = () => state()?.store?.mocks?.find((m) => m.mock_id === state().mockId)?.answers || [];
  const goals = () => (account.stated_facts?.keyed || []).filter((f) => f.kind === "goal");
  return { say, mock, answers, goals };
}

for (const [text, expected, profile] of [
  ["I want a software engineering internship.", "a software engineering internship", true],
  ["I am aiming for a product design internship.", "a product design internship", false],
  ["I'm aiming for a healthcare operations role.", "a healthcare operations role", true],
]) test(`F004: a new own career target escapes a pending mock: ${text}`, () => {
  const w = world(profile); w.mock(); const before = clone(w.answers());
  const r = w.say(text);
  assert.equal(r.out.intent, "career_goal_record", "a goal change must not be rubric-scored as an interview answer");
  assert.deepEqual(w.answers(), before, "a task switch never appends a mock answer or score");
  assert.equal(w.goals().length, 1); assert.equal(w.goals()[0].value, expected);
  assert.equal(w.goals()[0].evidence, text.replace(/[.!]$/, ""));
  const recall = w.say("What's my career goal?", "fresh");
  assert.equal(recall.out.intent, "career_goal_recall"); assert.ok(recall.out.reply.includes(expected));
});

test("F004 control: the already-fixed explicit career goal keeps its early claim", () => {
  const w = world(); w.mock(); const before = clone(w.answers());
  const r = w.say("My career goal is a data analyst internship for summer 2027.");
  assert.equal(r.out.intent, "career_goal_record"); assert.deepEqual(w.answers(), before);
  assert.equal(w.goals()[0].value, "a data analyst internship for summer 2027");
});

test("F004 control: a labeled mock answer is session content even when it names a desired role", () => {
  const w = world(); w.mock();
  const r = w.say("My answer: I want a software engineering internship.");
  assert.match(r.out.intent, /^prep_mock/); assert.equal(w.answers().length, 1);
  assert.deepEqual(w.goals(), []);
});

test("F004 control: ordinary past-tense narrative is still scored in the pending mock", () => {
  const w = world(); w.mock();
  const r = w.say("I built the synthetic team's tracker and reduced its review time from ten minutes to five.");
  assert.match(r.out.intent, /^prep_mock/); assert.equal(w.answers().length, 1);
  assert.deepEqual(w.goals(), []);
});

test("F004 control: a multi-sentence labeled answer never changes the goal", () => {
  const w = world(); w.mock();
  const r = w.say("My answer: I built the synthetic tracker. I want a software engineering internship.");
  assert.match(r.out.intent, /^prep_mock/); assert.equal(w.answers().length, 1);
  assert.deepEqual(w.goals(), []);
});

test("F004 control: an instruction to find roles is not saved as a personal goal", () => {
  const w = world(); w.mock();
  const r = w.say("I want you to find software engineering internships.");
  assert.notEqual(r.out.intent, "career_goal_record"); assert.deepEqual(w.goals(), []);
});

for (const text of [
  "If I want a software engineering internship, what should I do?",
  "My friend said, \"I want a software engineering internship.\"",
  "I want a software engineering internship?",
]) test(`F004 control: a hypothetical, quote, or question writes no goal: ${text}`, () => {
  const w = world(); w.mock(); w.say(text); assert.deepEqual(w.goals(), []);
});

test("F004 control: an explicit new task remains discovery rather than becoming a goal record", () => {
  const w = world(); w.mock(); const before = clone(w.answers());
  const r = w.say("Find me software engineering internships.");
  assert.match(r.out.intent, /discovery/); assert.deepEqual(w.answers(), before); assert.deepEqual(w.goals(), []);
});
