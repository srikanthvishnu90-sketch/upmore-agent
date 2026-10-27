"use strict";
/* HELP + ALERTS EXPLAINER (live misroutes on v254, owner's own chat,
   2026-10-27) — the exact live strings, asserted on the FULL reply.

   (a) "how do job alerts work?" reached career_catchall verbatim:
       "I did not catch what to do with that one. Here is what I can
       do: ... Which role or company is it about, and what date does
       it turn on?" It is a how-does-it-work question about a real
       feature: it must reach the explainer path and explain what the
       code actually does — a watch saved on the record, postings
       matched and scored against it, and the delivery sentence the
       product itself uses (alertDeliveryLine): with no delivery flag
       on the ctx, that sentence says delivery isn't on yet and must
       NOT be replaced by a promise to text matches.
   (b) "/help" reached the 140 unmatched fallback verbatim:
       "I'm Trainee, a career agent: ... I may have missed what you
       meant, so what should we work on first?" A valid slash command
       (Telegram's parser and the channel layer forward it to the
       brain on purpose — WO-038) was treated as a miss and carried
       no command list. It must return the help surface: what Trainee
       does + the commands the code actually handles (/start, /stop,
       /help — telegram.ts's command grammar and channel.ts's
       COMMANDS; nothing invented).

   Controls: in-topic alert turns keep their standing owners —
   "pause my alerts" and "what alerts do I have" / "what are my
   alerts" stay career_watch_manage and are NOT swallowed by the
   explainer branch. Regressions: bare "help" keeps the previous
   package's dedicated capabilities reply, "/start" keeps the
   greeting.

   At base cdda28bb every (a) and (b) case fails; the controls and
   regressions pass.
   Check: node --test tests/career-textpath-help-alerts-20261027.test.cjs */
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
const FALLBACK_MISS = "I may have missed what you meant";

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

function assertAlertsExplainer(turn, what) {
  assert.equal(turn.intent, "career_alerts_explainer", `${what}: intent=${turn.intent}; reply: ${turn.reply.slice(0, 200)}`);
  assert.ok(!/did not catch/i.test(turn.reply), `${what}: catchall opening: ${turn.reply.slice(0, 160)}`);
  assert.ok(!turn.reply.includes(DATE_CLARIFIER), `${what}: date clarifier present`);
  assert.ok(!turn.reply.includes(FALLBACK_MISS), `${what}: fallback miss present`);
  // The mechanics the code actually has: a watch the user sets in
  // their own words, saved on their record, matched against it.
  assert.match(turn.reply, /watch/i, `${what}: no watch mechanics`);
  assert.match(turn.reply, /saved on your record/i, `${what}: does not say the watch is saved on the record`);
  assert.match(turn.reply, /matched/i, `${what}: does not say postings are matched against the watch`);
  // Honesty: no delivery flag on this ctx, so the explainer must
  // carry the product's own not-on-yet sentence and must NOT
  // promise delivered alert texts.
  assert.ok(turn.reply.includes("Alert delivery isn't on yet"), `${what}: missing the honest delivery line: ${turn.reply.slice(0, 300)}`);
  assert.ok(!/I will text you matches/i.test(turn.reply), `${what}: invented a delivery promise`);
}

test("(a) the exact live string reaches the alerts explainer", () => {
  const w = makeWorld();
  assertAlertsExplainer(w.say("u", "how do job alerts work?"), "how do job alerts work?");
});

test("(a) variants reach the alerts explainer", () => {
  for (const q of ["how do alerts work", "what are job alerts?"]) {
    const w = makeWorld();
    assertAlertsExplainer(w.say("u", q), q);
  }
});

test("(a) controls: in-topic alert turns keep their standing owners", () => {
  for (const q of ["pause my alerts", "what alerts do I have", "what are my alerts"]) {
    const w = makeWorld();
    const t = w.say("u", q);
    assert.equal(t.intent, "career_watch_manage", `${q}: intent=${t.intent} — the explainer must not swallow it`);
    assert.ok(t.reply.includes("You have no job watches on file."), `${q}: standing no-watch reply changed: ${t.reply.slice(0, 160)}`);
  }
});

function assertHelpSurface(turn, what) {
  assert.equal(turn.intent, "career_help", `${what}: intent=${turn.intent}; reply: ${turn.reply.slice(0, 200)}`);
  assert.ok(!turn.reply.includes(FALLBACK_MISS), `${what}: treated as a miss: ${turn.reply.slice(0, 200)}`);
  assert.ok(!/did not catch/i.test(turn.reply), `${what}: catchall opening`);
  assert.ok(turn.reply.includes(CAPABILITY_LINE), `${what}: no capability list: ${turn.reply.slice(0, 200)}`);
  for (const cmd of ["/start", "/stop", "/help"]) {
    assert.ok(turn.reply.includes(cmd), `${what}: command list missing ${cmd}: ${turn.reply.slice(0, 300)}`);
  }
  // Only commands the code handles may be listed: no invented ones.
  assert.ok(!/\/(settings|menu|jobs|apply|resume|status)\b/.test(turn.reply), `${what}: invented a command: ${turn.reply.slice(0, 300)}`);
}

test("(b) /help returns the help surface with the real command list", () => {
  const w = makeWorld();
  assertHelpSurface(w.say("u", "/help"), "/help");
});

test("(b) /help with a Telegram bot suffix returns the same surface", () => {
  const w = makeWorld();
  assertHelpSurface(w.say("u", "/help@TraineeCareerBot"), "/help@TraineeCareerBot");
});

test("regression: bare 'help' keeps the previous package's capabilities reply", () => {
  const w = makeWorld();
  const t = w.say("u", "help");
  assert.equal(t.intent, "honest_unavailable", `intent=${t.intent}`);
  assert.ok(t.reply.includes(CAPABILITY_LINE), `bare help lost the capability list: ${t.reply.slice(0, 200)}`);
});

test("regression: /start keeps the greeting, unchanged", () => {
  const w = makeWorld();
  const t = w.say("u", "/start");
  assert.equal(t.intent, "career_greeting", `intent=${t.intent}`);
  assert.match(t.reply, /I'm Trainee, your career agent/);
});
