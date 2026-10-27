"use strict";
/* T6 DEPLOY GATE (2026-10-27) — the draft-note turn, at the ROUTER
   ENTRY (the CareerHost chat entry, the textpath/chatpath harness
   level), for the EXACT live string:
     "Draft a short note to a recruiter asking about next steps.
      Do not send it."

   The live order, verified in handler-career.ts: FEATURE 10's
   networkingTurn runs BEFORE the router, so with the draft-note
   branch merged (57ac95f2) the composed live reply is
   networking's which-recruiter clarification (proven by
   tests/architect/f10-networking-draft-note.test.ts: the matches
   named, held for approval, nothing sent, no model call). This
   file proves the router's half of the same deploy:

   - The exact string at router entry is NOT the campaign plan:
     its "do not send it" tail is owned by handleSendAttempt,
     which answers the send state honestly ("Nothing was sent").
     It never reaches the A3 gate in a fresh thread — the A3
     stand-down is not what this string needs (the handler-first
     networking claim is), and this test pins that honestly
     instead of crediting the stand-down for it.
   - The shapes the networking parse still misses (its role list
     is recruiter / hiring manager only — banker, analyst,
     founder, trader, lawyer, consultant all parse null and DO
     reach the router) must not be stolen by the A3 gate either:
     the stand-down (89fa1f9a) is what those shapes need, and
     this is its case at the entry level.
   - Controls: counted/plural sourcing shapes still get the plan.

   Check: node --test tests/career-draft-note-router-entry-20261027.test.cjs */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW = Date.parse("2026-10-27T16:00:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));
const POSTINGS = JSON.parse(fs.readFileSync(path.join(ROOT, "evals/career/conversations.json"), "utf8")).postings;
const LIVE = "Draft a short note to a recruiter asking about next steps. Do not send it.";
const PLAN_SIGNATURE = /Building the list now/;

function sayOnce(text) {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const ctx = host.createTurnCtx({ userId: "u", threadId: "t-u", now: NOW, accountPersistence: true, snapshot: null, account: {}, watchState: {}, postings: POSTINGS });
  const out = host.runTurn(text, ctx);
  return { intent: out ? out.intent : null, reply: String((out && out.reply) || "") };
}

test("the exact live string at router entry is not the campaign plan", () => {
  const t = sayOnce(LIVE);
  assert.ok(!PLAN_SIGNATURE.test(t.reply), `the campaign plan answered the draft-note ask: ${t.reply.slice(0, 200)}`);
  assert.ok(!/Approve the plan/.test(t.reply), `plan-approval language on a draft ask: ${t.reply.slice(0, 200)}`);
  // What the router honestly does with it: the do-not-send tail is
  // a send-state question, answered with the send state — nothing
  // was sent, and no plan is offered for approval in a fresh thread.
  assert.match(t.reply, /Nothing was sent/, `expected the honest send-state answer: ${t.reply.slice(0, 200)}`);
  // (The nothing-sent property itself is pinned where it is
  // composed: the f10 test asserts the outreach store stays empty
  // and no model call happens for this string.)
});

const PARSE_MISS_DRAFTS = [
  "draft a note to a banker",
  "draft a message to an analyst",
  "draft a note to a founder",
  "draft an email to a trader",
  "draft a note to a lawyer",
  "draft a note to a consultant",
];

for (const q of PARSE_MISS_DRAFTS) {
  test(`networking-parse-miss draft shape is not stolen by the A3 gate: ${JSON.stringify(q)}`, () => {
    const t = sayOnce(q);
    assert.ok(!PLAN_SIGNATURE.test(t.reply), `the campaign plan answered a single-note draft: ${t.reply.slice(0, 200)}`);
    assert.notEqual(t.intent, "outreach_clarification", `the plan's intent claimed it: ${t.intent}`);
  });
}

test("control: the plan still owns counted sourcing at router entry", () => {
  const t = sayOnce("find me 10 recruiters at banks");
  assert.ok(PLAN_SIGNATURE.test(t.reply), `a sourcing ask should get the plan: ${t.reply.slice(0, 160)}`);
});
