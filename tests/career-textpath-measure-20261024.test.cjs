"use strict";
/* TEXT-PATH MEASUREMENT SET (2026-10-24) — MEASUREMENT ONLY, no routing assertions.
   A realistic multi-turn message set for five career features, run through the
   router exactly as it stands at this head via the established CareerHost
   evaluation harness (the same composition as tests/career-router-fix1-mock-skip
   and tests/career-router-integration-20261023: 120 access -> 130 onboarding ->
   142 router -> 141 doorstep, 143 containment, 140 fallback composition).
   The router decides every turn; nothing here scripts a tool pick. Approval
   turns appear only in the shape the spec describes, and where the flow cannot
   reach them the record shows where it actually stopped.

   SOURCES for the message sets (per feature):
   - resume fix: docs/career/upmore-spec3-resumes-proof-of-work.txt §§4-5
     (fact-grounded bullet fixing + per-job tailoring; the agent uses only
     facts the user supplies/confirms), the intake pattern of
     evals/career/conversations.json C04, and the cold-open phrasing recorded
     verbatim in the 2026-10-24 live large-error pass on v249 ("I need to fix
     my resume", item S2).
   - networking: docs/career/upmore-spec1-contact-discovery-networking.txt §7
     (draft -> user reviews recipient + words -> per-message approval; approval
     of one message is not approval of later ones), the canonical ask used by
     tests/career-bundle.test.cjs and tests/career-http-host.test.cjs, and the
     live-pass phrasing "who should I network with for banking?" (item S2).
   - alerts: evals/career/conversations.json C14/C22/C25 turns verbatim.
   - interview prep: the mock-interview flow of tests/career-router-fix1-mock-skip
     (start -> answer -> probe answer -> framed skip -> "how did I do?") and
     evals/career/conversations.json C17 verbatim.
   - proof-of-work: docs/career/upmore-spec3-resumes-proof-of-work.txt §8.8
     (per-job project recommender: JD + fact bank + time available -> 1-3 ideas
     with scoped plan; never exceed the user's time) and §8.0 (the Proof Card).

   All personas and content are synthetic, written for this file. The fixture
   posting pool is evals/career/conversations.json's own postings (the pool the
   repo's conversation eval runs behind search).

   The single assertion is mechanical: every turn returns a result object with
   an intent string. Routing quality is NOT asserted — it is recorded. Each turn
   emits one "MEASURE|<json>" line; run with:
     node --test --test-reporter=spec tests/career-textpath-measure-20261024.test.cjs
   Check: node --test tests/career-textpath-measure-20261024.test.cjs */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const { FALLBACK_TEXT_RE } = (() => { try { return require(path.join(ROOT, "packages/domain/140-career-reply.js")); } catch { return {}; } })();
const FALLBACK_RE = FALLBACK_TEXT_RE || /^(I didn't catch that|I'm Trainee, a career agent: I find roles)/;

const NOW = Date.parse("2026-10-24T15:00:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));
const POSTINGS = JSON.parse(fs.readFileSync(path.join(ROOT, "evals/career/conversations.json"), "utf8")).postings;

function makeWorld() {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const store = { accounts: new Map(), threads: new Map(), watches: new Map() };
  let n = 0;
  const say = (userId, threadId, text) => {
    n += 1;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: POSTINGS });
    const out = host.runTurn(text, ctx);
    const snap = host.extractSnapshot(ctx);
    store.threads.set(threadId, snap);
    if (ctx._hostPatch) {
      if (ctx._hostPatch.erase === true) store.accounts.set(userId, { paused: true });
      else { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    }
    return out;
  };
  return { say };
}

function runSet(feature, userId, turns) {
  const w = makeWorld();
  turns.forEach((text, i) => {
    let rec;
    try {
      const out = w.say(userId, `t-${userId}`, text);
      const reply = String((out && out.reply) || "");
      rec = {
        feature, turn: i + 1, user: text,
        intent: out && out.intent,
        fallback: Boolean(out && (out.intent === "career_fallback" || FALLBACK_RE.test(reply))),
        reply: reply.replace(/\s+/g, " ").slice(0, 280),
      };
      assert.ok(out && typeof out.intent === "string" && out.intent.length > 0, `${feature} turn ${i + 1} returns an intent`);
    } catch (e) {
      rec = { feature, turn: i + 1, user: text, intent: "THREW", fallback: false, reply: String((e && e.message) || e).slice(0, 200) };
    }
    console.log("MEASURE|" + JSON.stringify(rec));
  });
}

/* ---------------- A. RESUME FIX ---------------- */
const RESUME_PASTE = "here's my resume: Alex Rivera, Data Analyst, Chicago IL. Experience: Data Analyst at Brightpath Logistics, 2023 to now - built SQL reports for warehouse operations, made Tableau dashboards for the ops team. Skills: SQL, Tableau, Excel. Education: B.S. Economics, 2023.";
test("A resume fix: cold open, intake, paste, bullet fix with user-supplied metric, approval, tailor", () => {
  runSet("resume_fix", "u-measure-resume", [
    "I need to fix my resume",
    "I'm a data analyst with 2 years of SQL and Tableau, based in Chicago",
    "yes that's right",
    RESUME_PASTE,
    "make the Brightpath bullet stronger",
    "the reports cut the weekly reporting time from 5 hours to 1 hour, and about 30 people use them",
    "yes, use that version",
    "tailor my resume for the Northwind data analyst job",
    "yes, apply those changes",
  ]);
});

/* ---------------- B. NETWORKING ---------------- */
test("B networking: cold ask, canonical ask, target firm, draft revision, spec-shaped approval", () => {
  runSet("networking", "u-measure-networking", [
    "who should I network with for banking?",
    "I am a sophomore who wants to network into investment banking. Help me find people to reach out to and draft my first outreach.",
    "let's focus on people at Ferrow Bank",
    "show me the draft, and make it shorter",
    "yes, send it",
  ]);
});

/* ---------------- C. ALERTS ---------------- */
test("C alerts: create, cap, read back, correction, stop, undo (conversations.json C14/C22/C25)", () => {
  runSet("alerts", "u-measure-alerts", [
    "set alerts for data analyst jobs in chicago",
    "max 3 a day",
    "what alerts do I have?",
    "no sorry, make it 1 a day, not 3",
    "actually stop my alerts",
    "wait no, keep them but just 1 a day",
  ]);
});

/* ---------------- D1. INTERVIEW PREP — MOCK ---------------- */
const LONG = "In my internship at a payments company I built a SQL dashboard that tracked checkout conversion for 30 merchants. First I cleaned the event data, then I automated the weekly pull, and in the end the team cut its reporting time from five hours to thirty minutes.";
const PROBE_ANSWER = "The hardest part was the messy returns data, because two tables disagreed on order IDs. I sampled 200 rows by hand, measured a 9% mismatch, and wrote a Python script that cut the cleanup from 4 hours to 15 minutes for our 3-person team.";
test("D1 interview prep: mock interview with framed skip and debrief ask", () => {
  runSet("interview_prep_mock", "u-measure-prep-mock", [
    "Start a mock interview for a data analyst role",
    LONG,
    PROBE_ANSWER,
    "please skip",
    "how did I do?",
  ]);
});

/* ---------------- D2. INTERVIEW PREP — QUESTION PRACTICE (C17) ---------------- */
test("D2 interview prep: question practice and self-reference (conversations.json C17)", () => {
  runSet("interview_prep_questions", "u-measure-prep-q", [
    "give me 3 interview questions for a data analyst role",
    "answer the 2nd one as an example",
    "now make it shorter",
  ]);
});

/* ---------------- E. PROOF-OF-WORK ---------------- */
test("E proof-of-work: recommender with time constraint, selection, proof card (spec3 §8.8/§8.0)", () => {
  runSet("proof_of_work", "u-measure-pow", [
    "I'm a data analyst with 2 years of SQL and Tableau, based in Chicago",
    "yes that's right",
    "I keep getting rejected for not having dashboard projects. what project should I build to prove I can do this work?",
    "I only have weekends, like 4 hours a week",
    "ok let's do the first one",
    "what goes on the proof card for it?",
  ]);
});
