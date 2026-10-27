"use strict";
/* ITEM C (live msg 19434, 2026-10-27) — record read-back RENDERING.
   The stored data is under a contamination hold: this item is
   render-only. No data is changed, here or in the fix.

   Two rendering defects in handleRecordRecall / factLine:
   1. The recall joins ALL facts with "; " into one fact; the
      composer breaks only on sentences, so a whole record renders
      as one block ("you're a sophomore; you study …; your
      recruiter contact at …").
   2. factLine splices the stored key verbatim: a legacy row keyed
      "northwind ledger and" (captured before the capture-side
      garble fix) renders "your recruiter contact at northwind
      ledger and is Dana" — trailing conjunction spoken, and the
      company in stored lowercase even though the record itself
      carries "Northwind Ledger" (a sibling fact's value).

   Pins:
   - each fact renders as its own line/sentence in the recall —
     no "; " splice of fact lines;
   - a stored key's trailing conjunction is stripped at render;
   - display case is restored from the record itself (the fact's
     own evidence, or a peer fact's value/evidence) when the
     record carries it;
   - when the record carries no cased form, the key renders as
     stored (stripped only) — case is never invented.
   Check: node --test tests/career-record-recall-render-20261027.test.cjs */
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

// The legacy record, as held: a clean year and major, the garbled
// recruiter row (key "northwind ledger and", evidence from the
// "there" capture branch — it does not carry the company), the
// same-turn target-firm fact whose VALUE carries the cased name,
// and a hiring-manager row whose cased form exists nowhere.
const LEGACY_FACTS = [
  { kind: "year", value: "sophomore", evidence: "I'm a sophomore" },
  { kind: "majors", value: "computer science", evidence: "I study computer science" },
  { kind: "target_firm", value: "Northwind Ledger", evidence: "my target firm is Northwind Ledger and my recruiter contact there is Dana" },
  { kind: "recruiter_contact", key: "northwind ledger and", value: "Dana", evidence: "recruiter contact there is Dana" },
  { kind: "hiring_manager", key: "zylith and", value: "Priya", evidence: "the hiring manager is Priya" },
];

function recall(facts) {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const ctx = host.createTurnCtx({ userId: "u", threadId: "t-u", now: NOW, accountPersistence: true, snapshot: null, account: {}, watchState: {}, postings: POSTINGS });
  ctx.statedFacts = { facts: clone(facts) };
  const out = host.runTurn("what do you have on record?", ctx);
  return { intent: out ? out.intent : null, reply: String((out && out.reply) || "") };
}

test("the recall renders one fact per line — no '; ' splice of the whole record", () => {
  const t = recall(LEGACY_FACTS);
  assert.equal(t.intent, "career_guidance", `intent: ${t.intent}`);
  assert.ok(!/sophomore;/.test(t.reply), `facts are spliced into one block: ${t.reply}`);
  assert.ok(!/computer science;/.test(t.reply), `facts are spliced into one block: ${t.reply}`);
  assert.match(t.reply, /you're a sophomore\./, `the year renders as its own sentence: ${t.reply}`);
  assert.match(t.reply, /you study computer science\./, `the major renders as its own sentence: ${t.reply}`);
});

test("a stored key's trailing conjunction is stripped at render", () => {
  const t = recall(LEGACY_FACTS);
  assert.ok(!/ledger and is Dana/.test(t.reply), `the garbled key is spoken verbatim: ${t.reply}`);
  assert.ok(!/zylith and is Priya/.test(t.reply), `the garbled key is spoken verbatim: ${t.reply}`);
});

test("display case is restored from the record itself when the record carries it", () => {
  const t = recall(LEGACY_FACTS);
  assert.match(t.reply, /your recruiter contact at Northwind Ledger is Dana/, `the cased name on the record is not used: ${t.reply}`);
});

test("case the record does not carry is not invented", () => {
  const t = recall(LEGACY_FACTS);
  assert.match(t.reply, /the hiring manager at zylith is Priya/, `expected the stripped, uncased key: ${t.reply}`);
  assert.ok(!/Zylith/.test(t.reply), `case was invented for a name the record holds only lowercase: ${t.reply}`);
});
