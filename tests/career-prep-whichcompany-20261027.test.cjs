"use strict";
/* T3 follow-up (live retest of v254/v255, 2026-10-27) — fail-first.

   "Can you help me prepare for a first round interview?" names no
   company. c6c13132 made the EMPTY-record case ask which company —
   but the live record is not empty: the thread snapshot carries a
   staged posting (ctx.posting, a whitelisted state key) and the
   stated facts hold companies of their own. In handlePrepExtras'
   composeBrief fallthrough a staged posting silently became THE
   company: the clarifier's !posting condition never fired and a
   full brief for the posting's company was served — the company
   presumed, never asked. The same presumption-by-omission applied
   to the stated-fact companies: never named as options either.

   Pins:
   - with companies on record (stated facts, keyed facts, a staged
     posting), a company-less prep ask ASKS which company and
     NAMES the record's companies as the options — no brief, no
     likely questions, no NO_CIR gap text, and the garbled legacy
     key ("northwind ledger and") never renders as an option;
   - with no record at all, the c6c13132 clarifier stands verbatim;
   - a named company still briefs directly (no options question);
   - a role-family ask still gets its family brief.
   Check: node --test tests/career-prep-whichcompany-20261027.test.cjs */
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
const ASK = "Can you help me prepare for a first round interview?";

// The live record's shape (the TEST-fixture profile + the stated
// facts the gauntlet sediment left on the account), trimmed to the
// company-bearing rows.
const PROFILE = {
  id: "profile-test",
  isTestFixture: true,
  basics: { name: null },
  facts: [
    { id: "f1", kind: "education", title: "TEST University - B.S. Computer Science", text: "TEST University - B.S. Computer Science, GPA 3.7, graduating May 2028", status: "confirmed" },
    { id: "f2", kind: "experience", title: "Software Engineering Intern, TEST Systems Inc", text: "Software Engineering Intern, TEST Systems Inc, June 2025 - August 2025", action: "Built a reporting pipeline", result: "Cut report time", status: "confirmed" },
    { id: "f3", kind: "experience", title: "Finance Intern, Example Capital (TEST)", text: "Finance Intern, Example Capital (TEST), June 2024 - August 2024", action: "Built a three-statement model", result: "Model adopted by the team", status: "confirmed" },
  ],
};
const STATED = {
  facts: [
    { kind: "target_firm", value: "Northwind Ledger", evidence: "my target firm is Northwind Ledger" },
    { key: "northwind ledger", kind: "recruiter_contact", value: "Dana", evidence: "recruiter contact at Northwind Ledger is Dana" },
    { key: "northwind ledger and", kind: "recruiter_contact", value: "Dana", evidence: "recruiter contact there is Dana" },
    { key: "ironstack payments", kind: "recruiter_contact", value: "Diego Alvarez", evidence: "recruiter contact there is Diego Alvarez" },
    { key: "waypoint onboarding", kind: "interview_day", value: "Monday", evidence: "interview at Waypoint Onboarding (fictional) is on Monday" },
  ],
};
const POSTING = POSTINGS.find((p) => p && p.company === "Northwind Health") || POSTINGS[0];

function sayOnce(text, stores) {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const snapshot = stores ? { scope: { userId: "u" }, stores: clone(stores) } : null;
  const ctx = host.createTurnCtx({ userId: "u", threadId: "t-u", now: NOW, accountPersistence: true, snapshot, account: {}, watchState: {}, postings: POSTINGS });
  const out = host.runTurn(text, ctx);
  return { intent: out ? out.intent : null, reply: String((out && out.reply) || ""), status: out ? out.resultStatus : null };
}

const FULL = { profile: PROFILE, statedFacts: STATED, posting: POSTING };

test("live shape: a staged posting on the record must not be presumed — the ask names the record's companies as options", () => {
  const t = sayOnce(ASK, FULL);
  assert.equal(t.intent, "prep_brief", `intent: ${t.intent}`);
  assert.equal(t.status, "awaiting_user", `a which-company question waits for the user: ${t.status} — ${t.reply}`);
  assert.match(t.reply, /which company/i, `the reply must ask which company: ${t.reply}`);
  // The record's companies are the options — from the record's own data.
  assert.match(t.reply, /Northwind Ledger/, `the stated target firm is an option: ${t.reply}`);
  assert.match(t.reply, /Waypoint Onboarding/, `the interview-day company is an option, case restored from the record: ${t.reply}`);
  assert.match(t.reply, /ironstack payments/i, `the keyed contact company is an option: ${t.reply}`);
  assert.match(t.reply, /Northwind Health/, `the staged posting's company is an option, not the presumed answer: ${t.reply}`);
  // The garbled legacy key never renders as a company option.
  assert.ok(!/ledger and\b/i.test(t.reply), `the garbled key renders as an option: ${t.reply}`);
  // And no brief is served underneath the question.
  assert.ok(!/Your interview brief/.test(t.reply), `a brief is served for an unnamed target: ${t.reply}`);
  assert.ok(!/Likely first questions/.test(t.reply), `brief questions ride the reply: ${t.reply}`);
  assert.ok(!t.reply.includes(GAP_TEXT), `the internal gap note is spoken: ${t.reply}`);
});

test("stated-fact companies alone (no staged posting) are also named as options", () => {
  const t = sayOnce(ASK, { profile: PROFILE, statedFacts: STATED });
  assert.equal(t.status, "awaiting_user", `status: ${t.status} — ${t.reply}`);
  assert.match(t.reply, /which company/i, `the reply must ask which company: ${t.reply}`);
  assert.match(t.reply, /Northwind Ledger/, `the stated target firm is an option: ${t.reply}`);
  assert.match(t.reply, /Waypoint Onboarding/, `the interview-day company is an option: ${t.reply}`);
  assert.ok(!/Your interview brief/.test(t.reply), `a brief is served: ${t.reply}`);
  assert.ok(!t.reply.includes(GAP_TEXT), `the internal gap note is spoken: ${t.reply}`);
});

test("no record at all: the existing clarifier stands verbatim", () => {
  const t = sayOnce(ASK, null);
  assert.equal(t.status, "awaiting_user", `status: ${t.status}`);
  assert.match(t.reply, /Which company and which role is the interview for\?/, `the c6c13132 clarifier stands: ${t.reply}`);
  assert.ok(!/Your interview brief/.test(t.reply), `a brief is served: ${t.reply}`);
});

test("control: a named company still briefs directly — no options question", () => {
  const t = sayOnce("Can you help me prepare for my interview at Zylith Dynamics?", FULL);
  assert.ok(!/ironstack/i.test(t.reply), `the options list is served for a named company: ${t.reply}`);
  assert.ok(!/which company is the interview for/i.test(t.reply), `a which-company question is asked despite the naming: ${t.reply}`);
  assert.ok(!t.reply.includes(GAP_TEXT), `the internal gap note is spoken: ${t.reply}`);
});

test("control: a role-family ask still gets its family brief, record or not", () => {
  const t = sayOnce("help me prepare for a software engineering interview", FULL);
  assert.equal(t.intent, "prep_brief", `intent: ${t.intent}`);
  assert.match(t.reply, /Reverse a linked list/, `the family's questions are still served: ${t.reply}`);
  assert.ok(!/which company is the interview for/i.test(t.reply), `a which-company question replaces the family brief: ${t.reply}`);
  assert.ok(!t.reply.includes(GAP_TEXT), `the internal gap note is spoken: ${t.reply}`);
});
