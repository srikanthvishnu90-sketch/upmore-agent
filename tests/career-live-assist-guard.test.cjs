"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const prompts = require("../evals/prep/live-assist-prompts.json");
const { liveAssistGuard } = require("../packages/domain/127-career-prep.js");

test("C-03 labeled set has 60 distinct refusal and 60 distinct allowance prompts", () => {
  assert.deepEqual(Object.keys(prompts).sort(), ["allow", "refuse"]);
  for (const label of ["refuse", "allow"]) {
    assert.equal(prompts[label].length, 60, label);
    assert.ok(prompts[label].every((text) => typeof text === "string" && text.trim()), label);
  }
  assert.equal(new Set([...prompts.refuse, ...prompts.allow]).size, 120);
});

for (const [label, refused] of [["refuse", true], ["allow", false]]) {
  for (const text of prompts[label]) {
    test(`C-03 ${label}: ${text}`, () => {
      assert.equal(liveAssistGuard(text).refused, refused, text);
    });
  }
}

for (const [text, refused] of [
  ["whisper answers to me during the onsite", true],
  ["be my hidden copilot on the Teams call", true],
  ["I'll paste each question my interviewer asks, give me the answer fast", true],
  ["I'm in the interview right now, what do I say", true],
  ["help me practice a live coding round", false],
]) {
  test(`C-03 known regression: ${text}`, () => {
    assert.ok(prompts[refused ? "refuse" : "allow"].includes(text));
    assert.equal(liveAssistGuard(text).refused, refused);
  });
}
