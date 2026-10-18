/* PREP + KB ROUTING guard (PENDING-ALLOCATION — BUG/FR requested per
   MI-093) — prep must do the asked thing, entity discipline, and KB
   branch discipline. Live on v228 (fb1321a), 2026-10-18, Crew A custom
   battery Blocks 2/3 (report: docs/gauntlet/fb1321a-custom-blocks.md)
   + the daily battery's P4 (unchanged since v222):

   (1) PREP (Block 2: 2/7, LF-07): a case-question ask was served a
   framework CARD ("Your case: Clarify the objective — The prompt:
   restate the problem…") instead of a case; a mock ask ("Let's do a
   quick mock… Start with 'Why Deloitte?'") was served another bank
   card and no mock ever ran — so the user's mock answer next turn
   had no session to land in.
   (2) ENTITY (Block 2 t3/t4, LF-02): the critique turn's trailing
   words "looking at costs" were extracted as a COMPANY ("costs has
   no company file yet"), the critique never happened, and the
   spurious entity latched (lastIntelCompany) so the NEXT, unrelated
   behavioral ask got the byte-identical no-file answer.
   (3) KB BRANCH (Block 3 t2, LF-02): "what does it actually take to
   get hired as a data analyst? Give me the real numbers" was routed
   to networking LIST-BUILDING, silently anchored on the on-record
   target firm; the KB's role evidence (SQL 71%, n=65,263) exists in
   153/125 and is served by the intel branch's role shape — the turn
   never reached it.
   (4) P4: "so what's the status of my Deloitte application?" — in
   the thread that had just recorded the application AND its
   rejection — was answered from the Deloitte COMPANY FILE instead
   of the tracker record.

   This guard runs the DEPLOYED path (real CareerHost, production
   commit semantics, same world as the LF-08/LF-09 guards) with the
   battery's verbatim turns and asserts on replies + result intents.
   Check: node --test tests/career-prep-kb-routing.test.cjs */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW = Date.parse("2026-10-18T20:20:00.000Z");
const WHITELIST = ["paused", "preferred_locations", "erase", "stated_facts"];
const clone = (v) => JSON.parse(JSON.stringify(v));

function makeHost() {
  return CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
}
function makeWorld() {
  const host = makeHost();
  const store = { accounts: new Map(), threads: new Map(), watches: new Map() };
  let n = 0;
  const say = (userId, threadId, text, opts) => {
    const o = opts || {};
    n += 1;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: o.postings || [] });
    const out = host.runTurn(text, ctx);
    const snap = host.extractSnapshot(ctx);
    store.threads.set(threadId, snap);
    if (ctx._hostPatch) {
      for (const k of Object.keys(ctx._hostPatch)) assert.ok(WHITELIST.includes(k), `commit patch key "${k}" is outside the career_host_commit whitelist`);
      if (ctx._hostPatch.erase === true) store.accounts.set(userId, { paused: true });
      else { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    }
    const aws = snap.stores && snap.stores.alertWatchState;
    const wpk = `career:watch-profile:${userId}`;
    if (aws && aws[wpk]) store.watches.set(userId, { [wpk]: clone(aws[wpk]) });
    return { out, ctx, snap };
  };
  return { host, store, say };
}
// The live battery account's standing record (sophomore, economics,
// target firm Meridian Capital, Denver) — the B2/B3 blocks ran on it.
function seedAccount(w, u) {
  w.say(u, "seed", "I'm a sophomore studying economics, and I'm targeting Meridian Capital");
  w.say(u, "seed", "I'm based in Denver and I want data roles");
}

// The consulting bank's REAL case prompts (case types + official
// sample cases) — a case serve must come from this set, never from
// the structure-step or drill sections.
function casePromptSet() {
  const Prep = D("127-career-prep.js");
  const bank = Prep.questionBank({ sector: "consulting" });
  const set = new Set();
  for (const row of (bank && bank.questions) || []) {
    const sec = (row.source && row.source.section) || row.round || "";
    if (/Canonical case types|Official sample cases/i.test(sec)) set.add(row.q);
  }
  return set;
}

// ---------- (1)+(2) Block 2: the Deloitte prep thread, verbatim ----------
test("B2: case ask poses a real case; critique is critiqued (no 'costs' company); behavioral answered; mock runs with the named opener", () => {
  const w = makeWorld();
  const u = "u-prep-b2";
  seedAccount(w, u);
  const T = "b2";
  w.say(u, T, "I have a first-round interview at Deloitte next week for a consulting internship. Help me prep — where do I start?");

  // t2 — a case-question ask must POSE a case from the researched bank.
  const t2 = w.say(u, T, "Give me a realistic practice case question, the kind Deloitte actually asks.");
  assert.ok(!/Clarify the objective/.test(t2.out.reply.split("\n")[0]), `the case headline is not a framework step (reply: ${t2.out.reply.slice(0, 200)})`);
  const t2q = t2.out.result && t2.out.result.question;
  assert.ok(t2q && t2q.q, `a question is served (out: ${JSON.stringify(Object.keys(t2.out))})`);
  const cases = casePromptSet();
  assert.ok(cases.size >= 5, `precondition: the bank carries real case prompts (have ${cases.size})`);
  assert.ok(cases.has(t2q.q), `the served question is a real case prompt from the bank, not a structure step or drill (served: ${JSON.stringify(t2q.q)})`);

  // t3 — the critique ask: the trailing "costs" is a common noun in
  // the user's own analysis, never a company; the critique happens.
  const t3 = w.say(u, T, "My approach: I'd clarify the objective first, then segment revenue by service line and geography to find where the drop is concentrated, and separate volume from price before looking at costs. How's that — critique it properly.");
  assert.ok(!/has no company file yet/.test(t3.out.reply), `no spurious company is minted from "costs" (reply: ${t3.out.reply.slice(0, 200)})`);
  assert.notEqual(t3.out.intent, "company_intel", `the critique turn is not claimed by the intel branch (intent: ${t3.out.intent})`);
  assert.match(t3.out.reply, /structure|volume|price|cost|weak|strength|rubric|score|segment/i, `the reply engages the approach itself (reply: ${t3.out.reply.slice(0, 300)})`);

  // t4 — the behavioral ask: answered as behavioral prep; any latched
  // entity from t3 is cleared by the topic change.
  const t4 = w.say(u, T, "What behavioral questions should I expect, and what do they actually want to hear?");
  assert.ok(!/has no company file yet/.test(t4.out.reply), `the behavioral ask is not answered with a company-file miss (reply: ${t4.out.reply.slice(0, 200)})`);
  assert.notEqual(t4.out.reply, t3.out.reply, "the behavioral answer is not a byte-identical repeat of the previous turn");
  assert.match(t4.out.reply, /behavioral|Tell me about a time|story|stories|STAR/i, `behavioral content is served (reply: ${t4.out.reply.slice(0, 300)})`);

  // t6 — the mock ask must RUN the mock, posing the user-named opener.
  const t6 = w.say(u, T, "Let's do a quick mock. Ask me one question at a time. Start with 'Why Deloitte?'");
  assert.equal(t6.out.intent, "prep_mock_start", `the mock starts (intent: ${t6.out.intent}; reply: ${t6.out.reply.slice(0, 200)})`);
  assert.ok(!/^Your case:/.test(t6.out.reply), "the mock start is not a bank card serve");
  const posed = (t6.out.result && t6.out.result.mock && t6.out.result.mock.question) || "";
  assert.match(posed, /Why Deloitte\?/, `the posed first question is the one the user named (posed: ${JSON.stringify(posed)})`);
  assert.match(t6.out.reply, /Why Deloitte\?/, "the reply poses the named question to the user");

  // t7 — the mock ANSWER lands in the live mock and gets feedback
  // (on v228 this turn had no session to land in and was eaten by an
  // unrelated capture; with the mock running, the answer is graded).
  const t7 = w.say(u, T, "Because it's not one national pipeline — I like that hiring sits with the service lines, so I'd be staffed on real client work in a specific practice instead of a generalist pool. And the scale of the client base is a draw. …How was that answer?");
  assert.match(t7.out.intent || "", /^prep_mock/, `the answer turn is handled by the mock (intent: ${t7.out.intent}; reply: ${t7.out.reply.slice(0, 200)})`);
  assert.ok(!/Offer updated/.test(t7.out.reply), "the mock answer is not consumed as an offer update");
});

// ---------- (3) Block 3: KB branch discipline, verbatim ----------
test("B3: a hiring-bar question is KB intel with the library's numbers — never list-building, never record-anchored", () => {
  const w = makeWorld();
  const u = "u-kb-b3";
  seedAccount(w, u);
  const T = "b3";
  const t1 = w.say(u, T, "What do you have on Snowflake?");
  assert.equal(t1.out.intent, "company_intel", "control: the Snowflake file ask is intel");
  assert.match(t1.out.reply, /Snowflake/);

  const t2 = w.say(u, T, "Forget companies for a sec — what does it actually take to get hired as a data analyst? Give me the real numbers from your research if you have them.");
  assert.ok(!/Building the list now/.test(t2.out.reply), `the role-evidence ask never becomes a list build (reply: ${t2.out.reply.slice(0, 250)})`);
  assert.equal(t2.out.intent, "company_intel", `the turn is claimed by the intel/KB branch (intent: ${t2.out.intent})`);
  const t2res = t2.out.result || {};
  assert.ok(t2res.payload && t2res.payload.kind === "role_kb_stats", `the KB role-stats product is served (payload: ${JSON.stringify(t2res.payload)})`);
  assert.match(t2.out.reply, /SQL/, "the library's top skill is in the answer");
  assert.match(t2.out.reply, /71%/, "the library's figure is quoted");
  assert.match(t2.out.reply, /65,263/, "the figure carries its n");
  assert.ok(!/Meridian/.test(t2.out.reply), `the answer never anchors to the on-record target firm the user did not name (reply: ${t2.out.reply.slice(0, 250)})`);

  // Control: the honest named gap still works after the fix.
  const t3 = w.say(u, T, "And what do you have on Databricks?");
  assert.match(t3.out.reply, /Databricks has no company file yet/, "control: an unfiled company still gets the honest gap");
});

// ---------- (4) P4: tracker status reads the tracker, not the file ----------
test("P4: a status ask about a company-named application reads the TRACKER (the recorded rejection), not the company file", () => {
  const w = makeWorld();
  const u = "u-p4";
  seedAccount(w, u);
  const T = "p4";
  w.say(u, T, "I applied to Deloitte yesterday");
  const t2 = w.say(u, T, "they just emailed me a rejection, ugh");
  assert.match(t2.out.reply, /Rejection on the record for Deloitte/, `precondition: the rejection is recorded (reply: ${t2.out.reply.slice(0, 160)})`);
  const t3 = w.say(u, T, "so what's the status of my Deloitte application?");
  assert.ok(!/The Deloitte Consulting file/.test(t3.out.reply), `the status answer is not the company file (reply: ${t3.out.reply.slice(0, 250)})`);
  assert.match(t3.out.reply, /Reject/i, `the status is spoken from the record — the row shows Rejected (reply: ${t3.out.reply.slice(0, 300)})`);
  assert.match(t3.out.intent || "", /track|status|doorstep/, `the turn is owned by a tracking route (intent: ${t3.out.intent})`);
});

// ---------- (2) controls: genuine company asks still resolve ----------
test("entity controls: a real company named in a company frame still resolves; common nouns never do", () => {
  const w = makeWorld();
  const u = "u-entity-ctl";
  seedAccount(w, u);
  const r = w.say(u, "e1", "What do you have on Snowflake?");
  assert.equal(r.out.intent, "company_intel");
  assert.match(r.out.reply, /Snowflake/);
  const r2 = w.say(u, "e2", "I keep looking at costs and my budget is a mess");
  assert.ok(!/has no company file yet/.test(r2.out.reply), `a common noun after "at" never becomes a company (reply: ${r2.out.reply.slice(0, 200)})`);
});
