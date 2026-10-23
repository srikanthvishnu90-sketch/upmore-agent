// Guard for BUG-257 / FR-415 (Depth Lane C) — the router half of
// BUG-219/BUG-220 and live failure LF-05.
//
// BUG-219/220 built the capability in modules 125/153 (role lens +
// knowledge-library citations) and their unit tests pinned it there —
// but the ROUTER never called it, so on the deployed path:
//   LF-05  "What do you have on Databricks?" matched no company
//          extraction frame in handleIntel's no-file branch and got
//          the generic fallback, although the honest no-file answer
//          existed in the build (live registry, v223 canary).
//   MI-019 "how does it compare to Snowflake for PM?" was served the
//          Snowflake file's SWE summary verbatim (LF-02) — 125's
//          answerRoleIntel had no caller in 142.
//   MI-020 Role-evidence asks with no company ("what does it take
//          for data analyst") fell to the fallback or to a
//          work-sample answer; the 861-role library had no serving
//          path in chat at all.
// Fail-first evidence: the local CareerHost probe of 2026-10-16 on
// commit 7803775 scored 0/10 of these asks with a library citation;
// P5 turn 1 was the generic fallback and turn 2 the SWE summary.
// These tests drive the DEPLOYED path (CareerHost -> 142 handleIntel)
// so the wiring itself is what is pinned, not the modules.
// Check: node --test tests/career-intel-router-wiring.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

function makeHost() {
  return CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
}
const NOW = Date.parse("2026-10-16T15:00:00.000Z");
function ask(host, text, prior) {
  let ctx = host.createTurnCtx({ userId: "probe-user", threadId: "guard-intel", now: NOW, snapshot: null });
  let res = null;
  for (const t of prior || []) {
    res = host.runTurn(t, ctx);
    const snap = host.extractSnapshot(ctx);
    ctx = host.createTurnCtx({ userId: "probe-user", threadId: "guard-intel", now: NOW + 60000, snapshot: snap });
  }
  res = host.runTurn(text, ctx);
  return res;
}
const isFallback = (res) => !res || res.intent === "career_fallback" || String((res && res.reply) || "").match(/^(I didn't catch that|I'm Trainee, a career agent: I find roles)/);

test("LF-05: 'What do you have on Databricks?' gets the honest no-file answer, not the fallback", () => {
  const host = makeHost();
  const res = ask(host, "What do you have on Databricks?");
  assert.ok(!isFallback(res), `reply was the generic fallback: ${res && res.reply}`);
  assert.equal(res.intent, "company_intel");
  assert.match(res.reply, /Databricks has no company file yet/);
});

test("LF-05 lowercase frame: 'what do you have on databricks' also reaches the no-file answer", () => {
  const host = makeHost();
  const res = ask(host, "what do you have on databricks");
  assert.ok(!isFallback(res), `reply was the generic fallback: ${res && res.reply}`);
  assert.match(res.reply, /no company file/i);
});

test("MI-019/LF-02: the P5 follow-up 'how does it compare to Snowflake for PM?' serves the PM lens, never the SWE bar", () => {
  const host = makeHost();
  const res = ask(host, "how does it compare to Snowflake for PM?", ["What do you have on Databricks?"]);
  assert.ok(!isFallback(res));
  assert.equal(res.intent, "company_intel");
  assert.doesNotMatch(res.reply, /Coding-first bar/);
  assert.match(res.reply, /no product management bar/);
  assert.match(res.reply, /\(n=\d/); // library statistics cited with their n
});

test("MI-019: 'what's the hiring bar for PM at Snowflake?' — honest no-PM-bar + PM library stats", () => {
  const host = makeHost();
  const res = ask(host, "what's the hiring bar for PM at Snowflake?");
  assert.doesNotMatch(res.reply, /Coding-first bar/);
  assert.match(res.reply, /no product management bar/);
  assert.match(res.reply, /\(n=540\)/); // PM experience mix, from the library
});

test("MI-019: a data-analyst ask at a SWE-cohort firm gets the DA lens and DA stats, not the SWE bar", () => {
  const host = makeHost();
  const res = ask(host, "how do people get hired at Snowflake for data analyst roles?");
  assert.doesNotMatch(res.reply, /Coding-first bar/);
  assert.match(res.reply, /no data analyst bar/);
  assert.match(res.reply, /SQL — in 71% of postings \(n=65,263\)/);
});

test("MI-020: a company-less role ask is answered from the library with n", () => {
  const host = makeHost();
  const res = ask(host, "what does it take for data analyst");
  assert.ok(!isFallback(res), `reply was the generic fallback: ${res && res.reply}`);
  assert.match(res.reply, /From the career knowledge library \(Data Analyst\)/);
  assert.match(res.reply, /\(n=65,263\)/);
});

test("MI-020: inflected role names still resolve ('welders')", () => {
  const host = makeHost();
  const res = ask(host, "tell me about welders — what skills do their postings name?");
  assert.ok(!isFallback(res));
  assert.match(res.reply, /Welders, Cutters, Solderers, and Brazers/);
  assert.match(res.reply, /\(n=11\)/);
});

test("MI-020: a no-file company asked about for a role answers BOTH halves (no file + the role's library stats)", () => {
  const host = makeHost();
  const res = ask(host, "what does it take to be a product manager at Databricks?");
  assert.match(res.reply, /Databricks has no company file yet/);
  assert.match(res.reply, /\(n=540\)/);
});

test("MI-020: an unknown role gets the honest no-data answer — no borrowed stats, no percentage, no fallback", () => {
  const host = makeHost();
  const res = ask(host, "what does it take for underwater basket weaving chief");
  assert.ok(!isFallback(res), `reply was the generic fallback: ${res && res.reply}`);
  assert.match(res.reply, /not in the career knowledge library/);
  assert.doesNotMatch(res.reply, /% of postings/);
});

test("anti-regression: a plain file ask still serves the file's own summary", () => {
  const host = makeHost();
  const res = ask(host, "tell me about Snowflake");
  assert.equal(res.intent, "company_intel");
  assert.match(res.reply, /Coding-first bar/);
});

test("anti-regression: a cohort-role ask still serves the cohort summary", () => {
  const host = makeHost();
  const res = ask(host, "what's the hiring bar for software engineering at Snowflake?");
  assert.equal(res.intent, "company_intel");
  assert.match(res.reply, /Coding-first bar/);
});
