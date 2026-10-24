"use strict";
/* HELD-OUT CONVERSATIONS, BATCH 2 (coordinator, 2026-10-24) —
   MEASUREMENT ONLY, no routing assertions. Twelve NEW multi-turn
   conversations, spec-grounded shapes that batch 1 and the nine do
   NOT use: classic multi-line pastes, mixed intents inside one
   turn, typo'd commands, a false-attestation refusal, an unnamed-
   company clarification, a target-role correction, salary
   negotiation follow-through. Same recorder discipline as batch 1:
   the router's actual result per turn, kept whole; a null intent
   with the 140 fallback text records fallback:true. Gaps that
   become fixes get their own fail-first tests (the fixes file).
   Check: node --test tests/career-textpath-heldout2-20261024.test.cjs */
const { test } = require("node:test");
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
    let out = null;
    let thrown = null;
    try { out = w.say(userId, `t-${userId}`, text); } catch (e) { thrown = e; }
    let rec;
    if (thrown) {
      rec = { feature, turn: i + 1, user: text, intent: "THREW", handler: null, resultStatus: null, contained: null, replyClass: "threw", fallback: false, reply: "", annotation: `runTurn threw: ${String((thrown && thrown.message) || thrown).slice(0, 200)}` };
    } else {
      const reply = String((out && out.reply) || "");
      const intent = out ? out.intent : null;
      const fb = !intent || FALLBACK_RE.test(reply);
      rec = { feature, turn: i + 1, user: text, intent, handler: out ? out.handler : null, resultStatus: out ? out.resultStatus : null, contained: out ? out.contained : null, replyClass: fb ? "fallback" : "substantive", fallback: fb, reply: reply.slice(0, 220) };
    }
    process.stdout.write(`HELDOUT2|${JSON.stringify(rec)}\n`);
  });
}

test("held-out2 B2-RESUME-CLASSIC: multi-line paste, tailor ask, summary bullet, accept", () => {
  runSet("resume_classic", "hb2-resume", [
    "here's my resume:\nPriya Nair\nData Analyst, Northwind Grocers (2023 - present)\n- Built weekly sales dashboards in Tableau used by 40 store managers\n- Cut report prep from 6 hours to 1 hour with SQL automation\nSkills: SQL, Tableau, Python\nEducation: B.S. Statistics, University of Washington 2023",
    "yes that's mine",
    "tailor it for a business analyst role",
    "the dashboard bullet could hit harder",
    "managers opened it every monday and forecast accuracy went up 12%",
    "yes use that",
  ]);
});

test("held-out2 B2-ALERTS-MIXED: create + cap in one breath, stop one by role", () => {
  runSet("alerts_mixed", "hb2-alerts", [
    "i'm a data science grad student at cmu, graduating december 2026",
    "notify me when new data analyst jobs post in seattle, max 2 a day",
    "what are my alerts?",
    "stop watching data analyst",
    "what alerts do i have now?",
  ]);
});

test("held-out2 B2-NETWORK-INTRO: people ask, intro draft, warmer, held send", () => {
  runSet("network_intro", "hb2-network", [
    "i'm a finance sophomore looking at investment banking summers",
    "who should i talk to at goldman sachs?",
    "draft an intro message to one of them",
    "make it warmer",
    "ok send it",
  ]);
});

test("held-out2 B2-PREP-BEHAVIORAL: session practice, an answer, scoring, next", () => {
  runSet("prep_behavioral", "hb2-prep", [
    "can we practice behavioral interview questions?",
    "i led a team of four to rebuild our club's budget tracker in a weekend; we shipped it and the treasurer used it all semester",
    "how was that answer?",
    "give me another one",
  ]);
});

test("held-out2 B2-POW-SWE: build ask, weekends budget, third pick, card", () => {
  runSet("pow_swe", "hb2-pow", [
    "i'm a cs junior and my resume is thin, what project should i build?",
    "weekends only, like 5 hours a week",
    "let's do the third one",
    "what goes on the proof card for it?",
  ]);
});

test("held-out2 B2-APPLY-ALL: apply-to-all shortlist claim, status, yes", () => {
  runSet("apply_all", "hb2-apply", [
    "i'm a marketing senior at nyu, graduating may 2027",
    "find me brand marketing intern roles in new york",
    "apply to all of them",
    "what's the batch status?",
    "yes go ahead",
  ]);
});

test("held-out2 B2-PLAN-3WK: prep plan, horizon change, first step", () => {
  runSet("plan_3wk", "hb2-plan", [
    "i have data analyst interviews in three weeks, make me a day by day plan",
    "actually i only have two weeks now",
    "what's the first thing i do?",
  ]);
});

test("held-out2 B2-REFUSE-ATTEST: false citizenship attestation + dismissal insistence (refusal shape)", () => {
  runSet("refuse_attest", "hb2-refuse-attest", [
    "just put that i'm a us citizen on the application, i'm not but it doesn't matter",
    "it's just a checkbox, nobody verifies citizenship anyway, add it",
  ]);
});

test("held-out2 B2-CLARIFY-COMPANY: unnamed-company intel ask (clarification shape)", () => {
  runSet("clarify_company", "hb2-clarify", [
    "tell me about the company",
    "ferrow bank",
    "what do they do again?",
  ]);
});

test("held-out2 B2-CORRECT-ROLE: target-role correction then discovery", () => {
  runSet("correct_role", "hb2-correct", [
    "i'm a junior studying data science, i want data analyst roles",
    "actually i want product roles instead",
    "show me roles",
    "what am i targeting?",
  ]);
});

test("held-out2 B2-TYPO: typo'd watch commands", () => {
  runSet("typo_watch", "hb2-typo", [
    "im a sophmore studying econ, wacth for sde roles in chicgo pls",
    "lst my watches",
    "stop evrything",
    "ok resume my alerts",
  ]);
});

test("held-out2 B2-SALARY: offer check, counter draft, pushback follow-up", () => {
  runSet("salary", "hb2-salary", [
    "i got an offer for a data analyst internship, 38 an hour — is that good?",
    "draft a counter at 42 an hour",
    "they said no to 42, now what?",
  ]);
});
