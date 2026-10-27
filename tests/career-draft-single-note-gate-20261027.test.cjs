"use strict";
/* ITEM B, router part (2026-10-27) — the A3 people-ask gate reads
   "draft + recruiters" as a campaign plan, and the plan never
   drafts. A SINGLE-NOTE draft shape — draft + note/message/email
   + a singular, unnamed recipient ("a recruiter") — is not a
   sourcing campaign: the gate must stand down so the turn can
   reach the networking/draft path.

   Controls pin the other side: plural recipients and counted
   sourcing asks ("find me 10 recruiters at banks", "draft notes
   to recruiters") still belong to the plan.
   Check: node --test tests/career-draft-single-note-gate-20261027.test.cjs */
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

const SINGLE_NOTE_DRAFTS = [
  "draft a note to a recruiter",
  "can you draft a message to a recruiter?",
  "draft an email to a recruiter",
];

for (const q of SINGLE_NOTE_DRAFTS) {
  test(`single-note draft stands the campaign-plan gate down: ${JSON.stringify(q)}`, () => {
    const t = sayOnce(q);
    assert.notEqual(t.intent, "outreach_clarification", `the plan claimed a single-note draft: ${t.reply.slice(0, 160)}`);
    assert.ok(!/Building the list now/.test(t.reply), `the plan's list-building reply answered a draft ask: ${t.reply.slice(0, 160)}`);
  });
}

test("control: a counted sourcing ask still belongs to the plan", () => {
  const t = sayOnce("find me 10 recruiters at banks");
  assert.equal(t.intent, "outreach_clarification", `intent: ${t.intent}`);
  assert.match(t.reply, /Building the list now/, `the plan should own a sourcing ask: ${t.reply.slice(0, 160)}`);
});

test("control: plural-recipient drafts still belong to the plan", () => {
  const t = sayOnce("draft notes to recruiters");
  assert.equal(t.intent, "outreach_clarification", `intent: ${t.intent}`);
  assert.match(t.reply, /Building the list now/, `the plan should own a plural draft ask: ${t.reply.slice(0, 160)}`);
});
