"use strict";
/* ITEM A (live msg 19436, 2026-10-27) — fail-first.

   "Can you help me prepare for a first round interview?" names no
   company, no posting, and no role family. At base it returns a
   "brief" whose first fact is the prep module's internal gap note
   ("No company file on file for this company — process stages,
   hiring bar and comp are not claimed.", 127's NO_CIR gaps[0],
   pushed verbatim by briefFacts) and whose likely questions are
   one inline dot-joined fact ("a · b · c").

   Pins:
   - a company-less, family-less prep ask gets a CLARIFIER: it
     asks which company/role, and speaks no brief at all;
   - the NO_CIR gap text is never a spoken fact, including when a
     company IS named but has no file (the spoken form is the
     human "on record" sentence, not the internal note);
   - likely questions never render as one " · "-joined fact.
   Check: node --test tests/career-prep-companyless-20261027.test.cjs */
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
const GAP_TEXT = "No company file on file for";

function sayOnce(text, profile) {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const ctx = host.createTurnCtx({ userId: "u", threadId: "t-u", now: NOW, accountPersistence: true, snapshot: null, account: {}, watchState: {}, postings: POSTINGS, profile: profile ? clone(profile) : undefined });
  const out = host.runTurn(text, ctx);
  return { intent: out ? out.intent : null, reply: String((out && out.reply) || ""), status: out ? out.resultStatus : null };
}

test("the exact live ask: company-less prep asks which company/role — no brief, no gap text", () => {
  const t = sayOnce("Can you help me prepare for a first round interview?");
  assert.ok(!t.reply.includes(GAP_TEXT), `the internal gap note is spoken: ${t.reply}`);
  assert.ok(!/Your interview brief/.test(t.reply), `a brief is served for an unnamed target: ${t.reply}`);
  assert.match(t.reply, /which company/i, `the reply must ask which company: ${t.reply}`);
  assert.match(t.reply, /role/i, `the reply must ask which role: ${t.reply}`);
  assert.equal(t.status, "awaiting_user", `a clarifier waits for the user: ${t.status}`);
});

test("a named company with no file is answered by the intel path, never with the gap note", () => {
  // Zylith Dynamics has no company file; the router's intel path
  // already says so in human words. The internal note must appear
  // in NO prep-shaped reply.
  const t = sayOnce("Can you help me prepare for my interview at Zylith Dynamics?");
  assert.ok(!t.reply.includes(GAP_TEXT), `the internal gap note is spoken: ${t.reply}`);
});

test("role-family brief: likely questions never render as one dot-joined fact", () => {
  // The family escape's own question list rode the same " · " join
  // at base ("Likely questions: Reverse a linked list … · Tell me
  // about a bug … · Sketch a URL shortener …").
  const t = sayOnce("help me prepare for a software engineering interview");
  assert.equal(t.intent, "prep_brief", `intent: ${t.intent}`);
  assert.ok(!/Likely questions:[^]*·/.test(t.reply), `questions are dot-joined inline: ${t.reply}`);
  assert.ok(!t.reply.includes(GAP_TEXT), `the internal gap note is spoken: ${t.reply}`);
  assert.match(t.reply, /Reverse a linked list/, `the family's questions are still served: ${t.reply}`);
});
