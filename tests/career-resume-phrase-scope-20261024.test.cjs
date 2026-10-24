"use strict";
/* RESUME-PHRASE SCOPE (coordinator probe at 66fbd21e, 2026-10-24):
   "ok turn them back on" landed on profile_correction ("Confirmed —
   your record stands exactly as read back...") both with NOTHING
   standing and right after "stop my job alerts" — the record-
   affirmation path claimed a state-change phrase. Required:
   - after stop-alerts: the alerts resume, watches intact;
   - nothing standing: a "nothing is paused" answer + next step,
     NEVER a record confirmation for this phrase;
   - after "pause everything": the global pause lifts (control —
     landed with the UNPAUSE vocabulary fix);
   - BOTH standing (global pause + alert stop): the phrase is
     ambiguous — the agent asks which scope, then the scoped answer
     ("both") lifts both.
   The state model CAN hold both at once: the global pause lives on
   the queue state, the alert stop on the watch profile's opt_out —
   separate stores, both read by the ownership layer.
   Check: node --test tests/career-resume-phrase-scope-20261024.test.cjs */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
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
  const say = (userId, text) => {
    n += 1;
    const threadId = `t-${userId}`;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: POSTINGS });
    const out = host.runTurn(text, ctx);
    store.threads.set(threadId, host.extractSnapshot(ctx));
    if (ctx._hostPatch) {
      if (ctx._hostPatch.erase === true) store.accounts.set(userId, { paused: true });
      else { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    }
    return out;
  };
  return { say };
}
function watchStanding(w, U) {
  w.say(U, "i'm a cs senior at ut austin, graduating may 2027");
  const c = w.say(U, "watch for product manager roles in denver");
  assert.equal(c.intent, "career_watch_create", c.reply);
}

test("(b) after 'stop my job alerts', 'ok turn them back on' resumes the ALERTS — watches intact, no record confirmation", () => {
  const w = makeWorld(); const U = "scope-alerts";
  watchStanding(w, U);
  const stop = w.say(U, "stop my job alerts");
  assert.equal(stop.intent, "career_watch_manage", stop.reply);
  const t = w.say(U, "ok turn them back on");
  assert.equal(t.intent, "career_watch_manage", t.reply);
  assert.match(String(t.reply), /back on|resumed/i, t.reply);
  assert.doesNotMatch(String(t.reply), /record stands/i, t.reply);
  const list = w.say(U, "what alerts do i have?");
  assert.match(String(list.reply), /product manager/i, list.reply);
  assert.doesNotMatch(String(list.reply), /PAUSED/, list.reply);
});

test("(a) with NOTHING standing (right after a record read-back), the phrase gets the not-paused answer — never a record confirmation", () => {
  const w = makeWorld(); const U = "scope-none";
  w.say(U, "i'm a senior studying computer science"); // a read-back stands in this thread — the affirmation trap
  const t = w.say(U, "ok turn them back on");
  assert.notEqual(t.intent, "profile_correction", t.reply);
  assert.equal(t.intent, "pause_status", t.reply);
  assert.match(String(t.reply), /nothing is paused|no .*pause|not .*paused/i, t.reply);
  assert.doesNotMatch(String(t.reply), /record stands/i, t.reply);
});

test("(global control) after 'pause everything', the phrase lifts the global pause", () => {
  const w = makeWorld(); const U = "scope-global";
  w.say(U, "pause everything for now");
  const t = w.say(U, "ok turn them back on");
  assert.equal(t.intent, "queue_resume", t.reply);
  assert.match(String(t.reply), /lifted/i, t.reply);
});

test("(both) global pause AND alert stop standing: the phrase asks WHICH scope; 'both' lifts both", () => {
  const w = makeWorld(); const U = "scope-both";
  watchStanding(w, U);
  w.say(U, "stop my job alerts");
  w.say(U, "pause everything for now");
  const t = w.say(U, "ok turn them back on");
  assert.equal(t.resultStatus, "awaiting_user", t.reply);
  assert.match(String(t.reply), /which/i, t.reply);
  assert.match(String(t.reply), /pause/i, t.reply);
  assert.match(String(t.reply), /alert/i, t.reply);
  assert.doesNotMatch(String(t.reply), /record stands/i, t.reply);
  const both = w.say(U, "both");
  assert.match(String(both.reply), /lift|back on|resumed/i, both.reply);
  const inspect = w.say(U, "is everything still paused?");
  assert.match(String(inspect.reply), /nothing is paused|no .*pause/i, inspect.reply);
  const list = w.say(U, "what alerts do i have?");
  assert.doesNotMatch(String(list.reply), /PAUSED/, list.reply);
});
