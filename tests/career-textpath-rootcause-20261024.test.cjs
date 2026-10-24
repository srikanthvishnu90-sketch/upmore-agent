"use strict";
/* ROOT-CAUSE FIXES (coordinator steer 2026-10-24 13:36) — fail-first.
   The blind file v1 (tests/heldout-blind-v1-conversations.json) scored
   served 10/45 at 6c069f43: follow-up turns collapsed to the generic
   banner because standing frames (plan, tracker, comparison, brief,
   refusal, pending offer) were not carried into short replies, and
   whole capability areas (erase, reminders, headline help) had no
   honest owner. These tests name the required behavior per item:
   (1) context carry-over, (2) affirmation capture, (3) erase path,
   (4) hold instructions, (5) third-party disclosure, (6) honest
   can't-do for unrecognized actions. Same world/recorder discipline
   as the measurement suites.
   Check: node --test tests/career-textpath-rootcause-20261024.test.cjs */
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
  const say = (userId, text) => {
    n += 1;
    const threadId = `t-${userId}`;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: POSTINGS });
    const out = host.runTurn(text, ctx);
    const snap = host.extractSnapshot(ctx);
    store.threads.set(threadId, snap);
    if (ctx._hostPatch) {
      if (ctx._hostPatch.erase === true) store.accounts.set(userId, { paused: true });
      else { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    }
    const reply = String((out && out.reply) || "");
    const intent = out ? out.intent : null;
    const fb = !intent || FALLBACK_RE.test(reply);
    return { intent, reply, fallback: fb, status: out ? out.resultStatus : null };
  };
  return { say };
}

const run = (uid, turns) => { const w = makeWorld(); return turns.map((t) => w.say(uid, t)); };

// ---------- (1) context carry-over ----------

test("item1 C2: the standing path plan answers its own follow-ups", () => {
  const [t1, t2, t3] = run("rc-c2", ["im switching from teaching to product mgmt", "what do i do first", "i have zero pm experience tho"]);
  assert.equal(t1.intent, "path_plan");
  assert.equal(t2.fallback, false, `T2 fell back: ${t2.reply.slice(0, 120)}`);
  assert.match(t2.reply, /first|move one|step one/i);
  assert.equal(t3.fallback, false, `T3 fell back: ${t3.reply.slice(0, 120)}`);
});

test("item1 C7: tracker follow-ups answer from the tracker, never the OS plan", () => {
  const [, t2, t3] = run("rc-c7", ["whats my status with all my applications", "which ones need me", "anything stuck"]);
  assert.equal(t2.fallback, false, `T2 fell back: ${t2.reply.slice(0, 120)}`);
  assert.notEqual(t3.intent, "career_os_plan");
  assert.equal(t3.fallback, false, `T3 fell back: ${t3.reply.slice(0, 120)}`);
});

test("item1 C9: supplied offer figures run the standing comparison; the verdict binds to them", () => {
  const [, t2, t3] = run("rc-c9", ["compare these two offers for me", "the first one is 90k remote the second is 105k onsite in nyc", "which is better for me"]);
  assert.equal(t2.fallback, false, `T2 fell back: ${t2.reply.slice(0, 120)}`);
  assert.match(t2.reply, /90/);
  assert.match(t2.reply, /105/);
  assert.equal(t3.fallback, false, `T3 fell back: ${t3.reply.slice(0, 120)}`);
});

test("item1 C13: elliptical and verification follow-ups bind to the tracker answer", () => {
  const [, t2, t3] = run("rc-c13", ["how many applications have i sent this week", "and last week", "are you sure"]);
  assert.equal(t2.fallback, false, `T2 fell back: ${t2.reply.slice(0, 120)}`);
  assert.equal(t3.fallback, false, `T3 fell back: ${t3.reply.slice(0, 120)}`);
});

test("item1 C3: the rejection thread serves the feedback ask and the polite draft", () => {
  const [, t2, t3] = run("rc-c3", ["they rejected me :(", "can i ask why", "write something polite"]);
  assert.equal(t2.fallback, false, `T2 fell back: ${t2.reply.slice(0, 120)}`);
  assert.equal(t3.fallback, false, `T3 fell back: ${t3.reply.slice(0, 120)}`);
  assert.match(t3.reply, /held|approval/i);
});

test("item1 C8: the standing prep brief answers prep follow-ups", () => {
  const [, t2, t3] = run("rc-c8", ["i have an interview thursday at 2", "how should i prep", "what if they ask about my gap year"]);
  assert.equal(t2.fallback, false, `T2 fell back: ${t2.reply.slice(0, 120)}`);
  assert.equal(t3.fallback, false, `T3 fell back: ${t3.reply.slice(0, 120)}`);
});

test("item1 C4: a sponsorship question is eligibility's, and the OPT thread stays in it", () => {
  const [t1, t2, t3] = run("rc-c4", ["do i need sponsorship for this role?", "im on opt", "when does that run out"]);
  assert.equal(t1.intent, "eligibility_check", `T1 intent: ${t1.intent}`);
  assert.notEqual(t2.intent, "company_intel");
  assert.equal(t2.fallback, false, `T2 fell back: ${t2.reply.slice(0, 120)}`);
  assert.match(t2.reply, /OPT/);
  assert.equal(t3.fallback, false, `T3 fell back: ${t3.reply.slice(0, 120)}`);
});

test("item1 clarify: a selection shape with two selectable frames standing asks which", () => {
  const w = makeWorld();
  const uid = "rc-clarify";
  w.say(uid, "find data analyst internships in chicago");
  w.say(uid, "compare these two offers for me");
  const t3 = w.say(uid, "use the second one");
  assert.equal(t3.fallback, false, `clarify fell back: ${t3.reply.slice(0, 120)}`);
  assert.match(t3.reply, /which/i);
  assert.match(t3.reply, /search|results|roles/i);
  assert.match(t3.reply, /offer/i);
});

// ---------- (2) affirmation capture ----------

test("item2: a bare yes after a fresher frame served never record-confirms", () => {
  const w = makeWorld();
  const uid = "rc-affirm";
  w.say(uid, "I'm a sophomore at DePaul studying finance and computer science");
  w.say(uid, "whats my status with all my applications");
  const t3 = w.say(uid, "yes that's right");
  assert.ok(!(t3.intent === "profile_correction" && /stands exactly as read back/.test(t3.reply)), `record-confirm captured the yes: ${t3.reply.slice(0, 120)}`);
});

test("item2 C15: 'ok thanks that helped' gets a plain close, not the banner or a record confirm", () => {
  const [, , t3] = run("rc-c15", ["whats a good salary ask for a junior analyst", "and if they say its too high", "ok thanks that helped"]);
  assert.equal(t3.fallback, false, `T3 fell back: ${t3.reply.slice(0, 120)}`);
  assert.doesNotMatch(t3.reply, /stands exactly as read back/);
});

// ---------- (3) erase path ----------

test("item3 C14: erase opens a named confirmation; only the yes to THAT question executes; 'is it gone' answers from state", () => {
  const w = makeWorld();
  const uid = "rc-c14";
  w.say(uid, "I'm a sophomore at DePaul studying finance and computer science");
  const t1 = w.say(uid, "delete everything you know about me");
  assert.notEqual(t1.intent, "career_profile_erased", "erase executed without its confirmation");
  assert.match(t1.reply, /profile|facts|record|watches/i);
  const probe = w.say(uid, "what do you know about me");
  assert.match(probe.reply, /DePaul|finance/i, "record must still stand before the confirming yes");
  const t2 = w.say(uid, "yes im sure");
  assert.equal(t2.intent, "career_profile_erased", `confirming yes intent: ${t2.intent}`);
  const t3 = w.say(uid, "is it gone");
  assert.equal(t3.fallback, false, `T3 fell back: ${t3.reply.slice(0, 120)}`);
  assert.match(t3.reply, /gone|removed|erased|deleted/i);
});

test("item3 control: a generic yes with no erase pending erases nothing", () => {
  const w = makeWorld();
  const uid = "rc-c14ctl";
  w.say(uid, "I'm a sophomore at DePaul studying finance and computer science");
  w.say(uid, "yes");
  const probe = w.say(uid, "what do you know about me");
  assert.match(probe.reply, /DePaul|finance/i);
});

// ---------- (4) hold instructions + (1) held-stop wording ----------

test("item4 C5: wording help after the honest stop is served; 'dont send anything yet' is recorded as a hold", () => {
  const [, t2, t3] = run("rc-c5", ["can u find me someone at stripe who can refer me", "ok what do i say to them", "dont send anything yet"]);
  assert.equal(t2.fallback, false, `T2 fell back: ${t2.reply.slice(0, 120)}`);
  assert.match(t2.reply, /draft|opener|held/i);
  assert.equal(t3.fallback, false, `T3 fell back: ${t3.reply.slice(0, 120)}`);
  assert.match(t3.reply, /hold|not send|won't send|nothing (is|will be) sent/i);
});

// ---------- (5) third-party disclosure ----------

test("item5 C11: a boss-disclosure ask clarifies who/what/scope; the retraction binds; capabilities are listed", () => {
  const [t1, t2, t3] = run("rc-c11", ["can you tell my boss im looking", "lol no dont", "ok what can you actually do for me"]);
  assert.equal(t1.fallback, false, `T1 fell back: ${t1.reply.slice(0, 120)}`);
  assert.match(t1.reply, /who|what|scope/i);
  assert.match(t1.reply, /nothing is sent|not sent|without your approval|no message (is|will be) sent/i);
  assert.equal(t2.fallback, false, `T2 fell back: ${t2.reply.slice(0, 120)}`);
  assert.equal(t3.fallback, false, `T3 fell back: ${t3.reply.slice(0, 120)}`);
  assert.match(t3.reply, /watch|alert/i);
  assert.match(t3.reply, /track/i);
});

// ---------- (6) honest can't-do ----------

test("item6 C6: a reminder request is an honest can't-do, and its correction and cancel bind to it", () => {
  const [t1, t2, t3] = run("rc-c6", ["remind me to follow up with northbeam on friday", "actually make it monday", "cancel that"]);
  assert.notEqual(t1.intent, "conversation_recall");
  assert.equal(t1.fallback, false, `T1 fell back: ${t1.reply.slice(0, 120)}`);
  assert.match(t1.reply, /can't do that yet|can not do that yet|cannot do that yet/i);
  assert.equal(t2.fallback, false, `T2 fell back: ${t2.reply.slice(0, 120)}`);
  assert.equal(t3.fallback, false, `T3 fell back: ${t3.reply.slice(0, 120)}`);
});

test("item6 C12: headline help is an honest can't-do; its follow-ups bind to the declined frame", () => {
  const [t1, t2, t3] = run("rc-c12", ["my linkedin headline is boring", "give me 3", "use the second one"]);
  assert.equal(t1.fallback, false, `T1 fell back: ${t1.reply.slice(0, 120)}`);
  assert.match(t1.reply, /can't do that yet|can not do that yet|cannot do that yet/i);
  assert.equal(t2.fallback, false, `T2 fell back: ${t2.reply.slice(0, 120)}`);
  assert.equal(t3.fallback, false, `T3 fell back: ${t3.reply.slice(0, 120)}`);
});

test("item6 C15: a salary ask with no standing offer is served as an anchor answer, and pushback binds to it", () => {
  const [t1, t2] = run("rc-c15b", ["whats a good salary ask for a junior analyst", "and if they say its too high"]);
  assert.equal(t1.fallback, false, `T1 fell back: ${t1.reply.slice(0, 120)}`);
  assert.equal(t2.fallback, false, `T2 fell back: ${t2.reply.slice(0, 120)}`);
});
