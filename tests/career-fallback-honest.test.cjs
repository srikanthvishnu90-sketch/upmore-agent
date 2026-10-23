"use strict";
// 2026-10-23 (router eval, 12 of 30 candidate replies were the generic fallback): the unmatched fallback never says the
// banned "I didn't catch that"; it says what Trainee is and asks one question. isFallbackText keeps every test's
// fallback detection exactly as strong after the wording change (it matches the old and the new text).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Reply = require(path.join(__dirname, "../packages/domain/140-career-reply.js"));

test("FH-1 the unmatched fallback never uses the banned phrase and introduces a career agent", () => {
  const t = Reply.fallback("unmatched");
  assert.doesNotMatch(t, /didn'?t catch that/i);
  assert.match(t, /career agent/i);
});

test("FH-2 it ends with exactly one question and passes the composer's own lint", () => {
  const t = Reply.fallback("unmatched");
  assert.equal((t.match(/\?/g) || []).length, 1, t);
  assert.ok(t.trim().endsWith("?"), t);
  assert.ok(Reply.lint(t).ok, JSON.stringify(Reply.lint(t)));
});

test("FH-3 isFallbackText matches the new and the old unmatched text, and not an ordinary reply", () => {
  assert.equal(Reply.isFallbackText(Reply.fallback("unmatched")), true);
  assert.equal(Reply.isFallbackText("I didn't catch that. Try naming the job."), true);
  assert.equal(Reply.isFallbackText("Here are 3 roles that match."), false);
});
