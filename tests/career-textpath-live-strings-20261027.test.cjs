"use strict";
/* LIVE STRINGS (coordinator review of 97bab2bf, 2026-10-27) — the
   exact strings a person actually typed, asserted on the FULL reply.

   1. Capabilities asks must be answered DIRECTLY with the
      capability list — a reply that opens "I did not catch what to
      do with that one" is a failure opening, whatever its closing
      question is. Holds fresh AND continued (post-benefits):
        "Hi, what can you help me with right now?"
        "what can you help me with" / "what can you do" / "help"
   2. "asdf qwerty zxcv" is not a case topic: it must get a plain
      not-understood reply with a short option list, and must NOT
      be asked for a role/company or a date — in a continued thread
      no less than a fresh one. Standing context from an old topic
      does not make keyboard mash a case follow-up.

   At 97bab2bf every case here fails in the continued context (the
   catch-all's "did not catch" headline + date clarifier). At
   5e5646a0 the two "help me with" shapes pass (the capabilities
   branch recognizes them); bare "help" and the gibberish case are
   the remaining reds this file was written for.
   Check: node --test tests/career-textpath-live-strings-20261027.test.cjs */
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
const CAPABILITY_LINE = "Here is what I can do: find and screen roles against your record";
const DATE_CLARIFIER = "Which role or company is it about, and what date does it turn on?";

function makeWorld() {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const store = { accounts: new Map(), threads: new Map(), watches: new Map() };
  let n = 0;
  const say = (userId, text) => {
    n += 1;
    const threadId = `t-${userId}`;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: POSTINGS });
    const out = host.runTurn(text, ctx);
    store.threads.set(threadId, host.extractSnapshot(ctx));
    if (ctx._hostPatch) {
      const a = store.accounts.get(userId) || {};
      for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]);
      store.accounts.set(userId, a);
    }
    return { intent: out ? out.intent : null, reply: String((out && out.reply) || "") };
  };
  return { say };
}

function assertDirectCapabilities(turn, what) {
  assert.ok(!/did not catch/i.test(turn.reply), `${what}: opens as a failure: ${turn.reply.slice(0, 120)}`);
  assert.ok(!turn.reply.includes(DATE_CLARIFIER), `${what}: date clarifier present: ${turn.reply.slice(0, 200)}`);
  assert.ok(
    turn.reply.includes(CAPABILITY_LINE) || /I find roles that fit you/.test(turn.reply),
    `${what}: no direct capability answer: ${turn.reply.slice(0, 200)}`,
  );
}

const CAPABILITY_INPUTS = [
  "Hi, what can you help me with right now?",
  "what can you help me with",
  "what can you do",
  "help",
];

test("capabilities asks are answered directly — FRESH context", () => {
  for (const q of CAPABILITY_INPUTS) {
    const w = makeWorld();
    assertDirectCapabilities(w.say("u", q), `fresh ${JSON.stringify(q)}`);
  }
});

test("capabilities asks are answered directly — CONTINUED context (post-benefits)", () => {
  for (const q of CAPABILITY_INPUTS) {
    const w = makeWorld();
    const t1 = w.say("u", "how do unemployment benefits work?");
    assert.equal(t1.intent, "career_catchall", `setup: ${t1.intent}`);
    assertDirectCapabilities(w.say("u", q), `continued ${JSON.stringify(q)}`);
  }
});

test("bare 'help' gets the dedicated capabilities reply, not a hedge", () => {
  const w = makeWorld();
  const t = w.say("u", "help");
  assert.ok(t.reply.includes(CAPABILITY_LINE), `expected the capability list itself: ${t.reply.slice(0, 200)}`);
});

function assertNotUnderstood(turn, what) {
  assert.ok(!turn.reply.includes("Which role or company"), `${what}: assumes a role/company: ${turn.reply.slice(0, 200)}`);
  assert.ok(!/what date/i.test(turn.reply), `${what}: assumes a date: ${turn.reply.slice(0, 200)}`);
  assert.ok(!/did not catch what to do/i.test(turn.reply), `${what}: catch-all failure opening: ${turn.reply.slice(0, 200)}`);
  assert.match(turn.reply, /did not understand|didn't understand|missed what you meant|not sure what you mean/i,
    `${what}: not a plain not-understood reply: ${turn.reply.slice(0, 200)}`);
  assert.match(turn.reply, /find roles/i, `${what}: no short option list: ${turn.reply.slice(0, 200)}`);
}

test("keyboard mash gets a plain not-understood reply — FRESH context", () => {
  const w = makeWorld();
  assertNotUnderstood(w.say("u", "asdf qwerty zxcv"), "fresh gibberish");
});

test("keyboard mash gets a plain not-understood reply — CONTINUED context (post-benefits)", () => {
  const w = makeWorld();
  w.say("u", "how do unemployment benefits work?");
  assertNotUnderstood(w.say("u", "asdf qwerty zxcv"), "continued gibberish");
});
