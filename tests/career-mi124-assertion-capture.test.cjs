/* MI-124 guard (BUG-PENDING-ALLOCATION / FR-PENDING-ALLOCATION —
   numbers requested from the Crew A registry per MI-093, NOT
   self-allocated) — CAPTURE_FABRICATION_IN_STATED_FACTS (registry
   class LF-10). Live on v231 (97818ba) 2026-10-20 and reproduced on
   v247 (c9fc28f9) 2026-10-21, gauntlet test user, DB-verified
   (records: live failure registry, daily runs 2026-10-20/21):

   The stated-facts capture path filed facts from turns that assert
   nothing about the user. A list-building ask — "Find 55 people at
   Google who interned at startups first" — was committed as
   target_firm "Google" (evidence: the ask itself) by
   handleCampaignPlan's plan-ask write; its sibling — "Find 75 data
   scientists at fintechs in SF who share my major" — was committed
   as geography "SF" the same way, while captureStatedFacts filed the
   relative-clause fragment "at fintechs in SF who share my" as the
   user's majors and a bare fragment "study groups" as majors
   "groups" (fresh write 2026-10-21T00:17:38Z, ~12 h after MI-124 was
   filed). The good facts (Meridian Capital / Denver / economics)
   were overwritten in their single-value slots; later turns quoted
   the fabricated record back as the user's own facts.

   Mechanism: (a) a people-search request is a search specification,
   not a self-assertion — the firms/cities in it are where the PEOPLE
   are — yet handleCampaignPlan persisted the parsed target into the
   durable record, and captureStatedFacts' per-clause gate
   (clauseIsAssertion) passes imperatives; (b) the majors frames
   harvested sentence fragments: the bare "study" frame (first person
   optional) fired on the noun phrase "study groups", and the
   "X major" frame captured a relative-clause tail verbatim.

   MI-124's done-test, asserted here on the COMMITTED account record
   through the real CareerHost (the LF-08/LF-09 production-semantics
   world): the two Find shapes and the bare fragment write ZERO
   stated facts; they never overwrite asserted facts; genuine
   assertions still capture exactly the asserted value; the campaign
   plan itself still runs on the parsed ask (the plan is the ask's
   working state — only the durable profile write is gated).
   Check: node --test tests/career-mi124-assertion-capture.test.cjs */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW = Date.parse("2026-10-21T18:10:00.000Z");
const WHITELIST = ["paused", "preferred_locations", "erase", "stated_facts"];
const clone = (v) => JSON.parse(JSON.stringify(v));

function makeHost() {
  return CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
}
// Same production-semantics world as tests/career-lf09-attribution.test.cjs:
// the account map IS the committed account record (career_watch_kv
// 'career:account' in production) — assertions read it after each
// turn's commit, never the turn's in-memory ctx alone.
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
      for (const k of Object.keys(ctx._hostPatch)) assert.ok(WHITELIST.includes(k), `commit patch key "${k}" is outside the career_host_commit whitelist — the database would reject this commit`);
      if (ctx._hostPatch.erase === true) store.accounts.set(userId, { paused: true });
      else { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    }
    const aws = snap.stores && snap.stores.alertWatchState;
    const wpk = `career:watch-profile:${userId}`;
    if (aws && aws[wpk]) store.watches.set(userId, { [wpk]: clone(aws[wpk]) });
    return { out, ctx, snap };
  };
  const accountFacts = (userId) => {
    const a = store.accounts.get(userId) || {};
    return (a.stated_facts && Array.isArray(a.stated_facts.facts)) ? a.stated_facts.facts : [];
  };
  const factOf = (userId, kind) => accountFacts(userId).find((f) => f.kind === kind) || null;
  return { host, store, say, accountFacts, factOf };
}

const FIND_55 = "Find 55 people at Google who interned at startups first";
const FIND_75 = "Find 75 data scientists at fintechs in SF who share my major";

// ---------- MI-124 done-test shapes: ZERO stated facts ----------
test("MI-124 (1): 'Find 55 people at Google…' writes ZERO stated facts (DB-asserted)", () => {
  const w = makeWorld();
  const u = "u-mi124-find55";
  w.say(u, "t", FIND_55);
  assert.deepEqual(w.accountFacts(u), [], `a people-search ask asserts nothing about the user — the committed record must stay empty (have: ${JSON.stringify(w.accountFacts(u))})`);
});

test("MI-124 (2): 'Find 75 data scientists at fintechs in SF who share my major' writes ZERO stated facts (DB-asserted)", () => {
  const w = makeWorld();
  const u = "u-mi124-find75";
  w.say(u, "t", FIND_75);
  assert.deepEqual(w.accountFacts(u), [], `neither the ask's geography nor the relative-clause fragment before "major" may be filed (have: ${JSON.stringify(w.accountFacts(u))})`);
});

test("MI-124 (3): a find-ask carrying a level phrase writes ZERO stated facts", () => {
  const w = makeWorld();
  const u = "u-mi124-findlvl";
  w.say(u, "t", "Find analysts and first years at Google");
  assert.deepEqual(w.accountFacts(u), [], `the level frame must not harvest a preference from a search specification (have: ${JSON.stringify(w.accountFacts(u))})`);
});

test("MI-124 (4): the bare fragment 'study groups' writes ZERO facts — a noun phrase is not a major", () => {
  const w = makeWorld();
  const u = "u-mi124-frag";
  w.say(u, "t", "study groups");
  assert.deepEqual(w.accountFacts(u), [], `(have: ${JSON.stringify(w.accountFacts(u))})`);
  const w2 = makeWorld();
  const u2 = "u-mi124-frag2";
  w2.say(u2, "t", "I joined a couple of study groups this semester");
  assert.ok(!w2.factOf(u2, "majors"), `no majors fact may come out of "study groups" (have: ${JSON.stringify(w2.accountFacts(u2))})`);
});

// ---------- the plan still runs on the ask; only the durable write is gated ----------
test("MI-124 (5): the campaign plan still composes from the Find ask's own target", () => {
  const w = makeWorld();
  const u = "u-mi124-plan";
  const r = w.say(u, "t", FIND_55);
  const plan = r.ctx.plan || (r.out && r.out.target) || null;
  assert.ok(plan, "the turn still produces its campaign plan / parsed target");
  const firms = plan.firms || (plan.target && plan.target.firms) || [];
  assert.ok(firms.some((f) => /Google/.test(f)), `the plan runs on the ask's named firm (plan: ${JSON.stringify(plan).slice(0, 300)})`);
  assert.deepEqual(w.accountFacts(u), [], "…while the durable record stays empty");
});

// ---------- genuine assertions still capture exactly ----------
test("MI-124 (6): genuine assertions still capture exactly the asserted value", () => {
  const w = makeWorld();
  const u = "u-mi124-assert";
  w.say(u, "t1", "I'm targeting Meridian Capital");
  assert.equal((w.factOf(u, "target_firm") || {}).value, "Meridian Capital");
  w.say(u, "t2", "I study economics");
  assert.equal((w.factOf(u, "majors") || {}).value, "economics");
  w.say(u, "t3", "my target firm is Northwind Ledger");
  assert.equal((w.factOf(u, "target_firm") || {}).value, "Northwind Ledger");
  const w2 = makeWorld();
  const u2 = "u-mi124-assert2";
  w2.say(u2, "t", "I'm a sophomore studying economics, and I'm targeting Meridian Capital");
  assert.equal((w2.factOf(u2, "year") || {}).value, "sophomore");
  assert.equal((w2.factOf(u2, "majors") || {}).value, "economics");
  assert.equal((w2.factOf(u2, "target_firm") || {}).value, "Meridian Capital");
  const w3 = makeWorld();
  const u3 = "u-mi124-assert3";
  w3.say(u3, "t", "finance and computer science are my majors");
  assert.equal((w3.factOf(u3, "majors") || {}).value, "finance and computer science");
  w3.say(u3, "t2", "I'm based in Denver");
  assert.equal((w3.factOf(u3, "geography") || {}).value, "Denver");
});

// ---------- the actual harm: asserted facts are never overwritten by asks ----------
test("MI-124 (7): search asks and fragments never overwrite asserted facts; read-back quotes only the asserted record", () => {
  const w = makeWorld();
  const u = "u-mi124-keep";
  w.say(u, "seed", "I'm a sophomore studying economics, and I'm targeting Meridian Capital");
  w.say(u, "seed", "I'm based in Denver");
  // The attack turns land on a fresh thread, exactly as the live traffic did.
  w.say(u, "atk", FIND_55);
  w.say(u, "atk", FIND_75);
  w.say(u, "atk", "study groups");
  assert.equal((w.factOf(u, "target_firm") || {}).value, "Meridian Capital", `target_firm must survive (have: ${JSON.stringify(w.accountFacts(u))})`);
  assert.equal((w.factOf(u, "geography") || {}).value, "Denver", `geography must survive (have: ${JSON.stringify(w.accountFacts(u))})`);
  assert.equal((w.factOf(u, "majors") || {}).value, "economics", `majors must survive (have: ${JSON.stringify(w.accountFacts(u))})`);
  assert.equal((w.factOf(u, "year") || {}).value, "sophomore");
  assert.equal(w.accountFacts(u).length, 4, `no fact added, none replaced (have: ${JSON.stringify(w.accountFacts(u))})`);
  const rb = w.say(u, "rb", "so what's my target firm?");
  assert.ok(/Meridian Capital/.test(rb.out.reply || ""), `read-back quotes the asserted record (reply: ${(rb.out.reply || "").slice(0, 200)})`);
  assert.ok(!/Google/.test(rb.out.reply || ""), "read-back never quotes the fabricated firm");
});
