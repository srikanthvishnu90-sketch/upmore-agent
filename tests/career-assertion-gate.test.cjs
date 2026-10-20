'use strict';
// =====================================================================
// WO-095 — B-MEM-1: memory's write path has an assertion gate.
// Record: docs/architect/work-orders/WO-095-assertion-gate.md.
//
// DEFECT (verified on wo/090-port-live): module 142's captureStatedFacts
// runs on every turn's raw text and rejected only clauses ending in "?"
// or opening with a fixed question word, so an imperative ask passed as
// an assertion. A second writer, handleCampaignPlan, recorded an ask's
// named firm and geography as the user's target_firm / geography gated
// only by "not a question". Single-value kinds REPLACE on write, so a
// false write silently destroyed a true fact, and the account merge
// carried it into every later thread. Live (2026-10-20 battery account):
//   "Find 55 people at Google who interned at startups first"
//     -> target_firm = "Google"
//   "Find 75 data scientists at fintechs in SF who share my major"
//     -> geography = "SF" (and, before T3, majors = "at fintechs in SF
//        who share my")
// over the user's true facts. Also: "I do not require sponsorship" was
// stored as needsSponsorship = true, and "sorry, I meant Denver"
// replaced nothing.
//
// THE GUARD runs the deployed path (real CareerHost, real chain
// modules, production commit semantics) and asserts on the COMMITTED
// ACCOUNT RECORD after every turn:
//   - request turns (find / show / get me / help me / build / email /
//     draft / apply / list / search / send / network / tailor, ask
//     frames, "please …") write nothing and leave true facts intact;
//   - first-person declarative assertions still write;
//   - explicit corrections replace ("sorry, I meant Denver",
//     "change my major to …", "not X, Y"), and a correction after an
//     ASK writes nothing;
//   - negations are stored with their polarity;
//   - the T3 compound sentence still captures firm + keyed contact.
// Synthetic data only; no network, no database, no model.
// Check: node --test tests/career-assertion-gate.test.cjs
// =====================================================================
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.join(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW = Date.parse("2026-10-20T18:00:00.000Z");
const WHITELIST = ["paused", "preferred_locations", "erase", "stated_facts"];
const clone = (v) => JSON.parse(JSON.stringify(v));

function makeWorld() {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const store = { accounts: new Map(), threads: new Map() };
  let n = 0;
  const say = (userId, threadId, text, opts) => {
    const o = opts || {};
    n += 1;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(`${userId}/${threadId}`) || null, account: clone(store.accounts.get(userId) || {}), watchState: {}, postings: [], profile: o.profile });
    const out = host.runTurn(text, ctx);
    store.threads.set(`${userId}/${threadId}`, host.extractSnapshot(ctx));
    if (ctx._hostPatch) {
      for (const k of Object.keys(ctx._hostPatch)) assert.ok(WHITELIST.includes(k), `commit patch key "${k}" is outside the career_host_commit whitelist`);
      const a = store.accounts.get(userId) || {};
      for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]);
      store.accounts.set(userId, a);
    }
    return { out, ctx };
  };
  // The committed record: both carriages (SQL-shaped `facts` and the
  // sibling `keyed` list) are the one record.
  const accountFacts = (userId) => {
    const sf = (store.accounts.get(userId) || {}).stated_facts || {};
    return [...(Array.isArray(sf.facts) ? sf.facts : []), ...(Array.isArray(sf.keyed) ? sf.keyed : [])];
  };
  const valueOf = (userId, kind) => { const f = accountFacts(userId).find((x) => x.kind === kind && !x.key); return f ? f.value : undefined; };
  const brief = (userId) => JSON.stringify(accountFacts(userId).map((f) => `${f.kind}${f.key ? `[${f.key}]` : ""}=${f.value}`));
  return { say, accountFacts, valueOf, brief };
}

// The user's TRUE facts, stated in their own words (LF-08's verbatim
// opener + a basing statement).
function seedTrueFacts(w, u) {
  w.say(u, "A", "I'm a sophomore studying economics, and I'm targeting Meridian Capital");
  w.say(u, "A", "I'm based in Denver");
  assert.equal(w.valueOf(u, "target_firm"), "Meridian Capital", `seed: target firm (have ${w.brief(u)})`);
  assert.equal(w.valueOf(u, "majors"), "economics", `seed: majors (have ${w.brief(u)})`);
  assert.equal(w.valueOf(u, "geography"), "Denver", `seed: geography (have ${w.brief(u)})`);
}
const TRUE = { target_firm: "Meridian Capital", majors: "economics", geography: "Denver", year: "sophomore" };
function assertTrueFactsIntact(w, u, after) {
  for (const [kind, value] of Object.entries(TRUE)) {
    assert.equal(w.valueOf(u, kind), value, `after ${JSON.stringify(after)} the committed ${kind} is still ${value} (have ${w.brief(u)})`);
  }
}

// ---------------------------------------------------------------------
// 1. The MI-124 journey, verbatim asks
// ---------------------------------------------------------------------
const MI124_ASKS = [
  "Find 55 people at Google who interned at startups first",
  "Find 75 data scientists at fintechs in SF who share my major",
];

test("B-MEM-1: the MI-124 asks write nothing — the true facts survive in the committed record", () => {
  const w = makeWorld();
  const u = "u-mi124";
  seedTrueFacts(w, u);
  for (const ask of MI124_ASKS) {
    w.say(u, "A", ask);
    assertTrueFactsIntact(w, u, ask);
  }
  const facts = w.accountFacts(u);
  assert.ok(!facts.some((f) => /\bGoogle\b/.test(f.value)), `no fact names Google (have ${w.brief(u)})`);
  assert.ok(!facts.some((f) => f.kind === "geography" && /^SF$/i.test(f.value)), `SF is not the user's geography (have ${w.brief(u)})`);
  assert.ok(!facts.some((f) => /who share my|at fintechs/i.test(f.value)), `no request fragment is stored (have ${w.brief(u)})`);
  for (const f of facts) assert.ok(!/^Find\b/i.test(f.evidence || ""), `no fact's evidence is a request (${f.kind}=${f.value} from "${f.evidence}")`);
});

test("B-MEM-1: the false fact never reaches a later thread — thread B recalls the TRUE target firm", () => {
  const w = makeWorld();
  const u = "u-mi124-b";
  seedTrueFacts(w, u);
  for (const ask of MI124_ASKS) w.say(u, "A", ask);
  const b = w.say(u, "B", "what's my target firm?");
  assert.match(b.out.reply, /Meridian Capital/, "thread B recalls the firm the user stated");
  assert.ok(!/Google/.test(b.out.reply), "thread B never recalls the ask's firm as the user's");
});

// ---------------------------------------------------------------------
// 2. The gate: request shapes write nothing
// ---------------------------------------------------------------------
const REQUESTS = [
  "Find 55 people at Google who interned at startups first",
  "Find 75 data scientists at fintechs in SF who share my major",
  "Get me 40 bankers at Lazard in New York",
  "Help me network into Goldman Sachs",
  "network into Goldman Sachs",
  "Show me analyst roles in Chicago",
  "Build a list of 50 product managers at Stripe in Seattle",
  "Search for internships in Boston",
  "List 25 associates at KKR, in Houston, who studied finance",
  "I want you to find 30 people at Citadel in Chicago",
  "Please email 20 alumni at Jane Street",
  "Draft an email to recruiters at Evercore in New York",
  "Send 10 emails to people at Moelis in Austin",
  "I'd like to find 20 analysts at Evercore in Boston",
];
for (const ask of REQUESTS) {
  test(`gate: the request "${ask}" writes no fact and replaces nothing`, () => {
    const w = makeWorld();
    const u = `u-gate-${ask.slice(0, 24).replace(/\W+/g, "-")}`;
    seedTrueFacts(w, u);
    const before = clone(w.accountFacts(u).map((f) => [f.kind, f.key || "", f.value]));
    w.say(u, "A", ask);
    const after = w.accountFacts(u).map((f) => [f.kind, f.key || "", f.value]);
    assert.deepEqual(after, before, `the committed record is unchanged by a request (have ${w.brief(u)})`);
  });
}

test("gate: questions still write nothing", () => {
  const w = makeWorld();
  const u = "u-gate-q";
  seedTrueFacts(w, u);
  for (const q of ["Should I change my major to finance?", "Am I targeting Goldman Sachs?", "Will I need sponsorship?", "what if I lived in Chicago?"]) {
    w.say(u, "A", q);
    assertTrueFactsIntact(w, u, q);
  }
  assert.ok(!w.accountFacts(u).some((f) => f.kind === "sponsorship"), `a sponsorship question records no sponsorship fact (have ${w.brief(u)})`);
});

// ---------------------------------------------------------------------
// 3. True first-person assertions still write
// ---------------------------------------------------------------------
const ASSERTIONS = [
  { say: "My target firm is Meridian Capital.", kind: "target_firm", value: "Meridian Capital" },
  { say: "I'm targeting Halcyon Robotics", kind: "target_firm", value: "Halcyon Robotics" },
  { say: "I study economics", kind: "majors", value: "economics" },
  { say: "I live in Denver", kind: "geography", value: "Denver" },
  { say: "Please remember that I live in Chicago", kind: "geography", value: "Chicago" },
  { say: "I do not need sponsorship", kind: "sponsorship", value: "does not need sponsorship" },
  // A first-person GOAL statement is the user's own target (the bare
  // imperative "network into …" above is the request).
  { say: "I want to network into Northbeam in Boston, that's the one I care about", kind: "target_firm", value: "Northbeam" },
];
for (const c of ASSERTIONS) {
  test(`assertion: "${c.say}" writes ${c.kind}=${c.value}`, () => {
    const w = makeWorld();
    const u = `u-assert-${c.kind}-${c.value.slice(0, 8)}`;
    w.say(u, "A", c.say);
    assert.equal(w.valueOf(u, c.kind), c.value, `committed ${c.kind} (have ${w.brief(u)})`);
  });
}

test("assertion: a first-person clause riding a request still counts — the request's own parameters do not", () => {
  const w = makeWorld();
  const u = "u-assert-ride";
  w.say(u, "A", "Find me banks in Chicago, I'm a junior");
  assert.equal(w.valueOf(u, "year"), "junior", `the user's own clause is recorded (have ${w.brief(u)})`);
  assert.equal(w.valueOf(u, "geography"), undefined, `the ask's city is not the user's geography (have ${w.brief(u)})`);
});

// ---------------------------------------------------------------------
// 4. Polarity
// ---------------------------------------------------------------------
const POLARITY = [
  { say: "I do not require sponsorship", kind: "sponsorship", value: "does not need sponsorship", needs: false },
  { say: "I don't need sponsorship", kind: "sponsorship", value: "does not need sponsorship", needs: false },
  { say: "I no longer require sponsorship", kind: "sponsorship", value: "does not need sponsorship", needs: false },
  { say: "I will need sponsorship", kind: "sponsorship", value: "needs sponsorship", needs: true },
  { say: "I'm not a US citizen", kind: "citizenship", value: "not a US citizen" },
  { say: "I'm a US citizen", kind: "citizenship", value: "US citizen" },
];
for (const c of POLARITY) {
  test(`polarity: "${c.say}" is stored as ${c.kind}=${c.value}`, () => {
    const w = makeWorld();
    const u = `u-pol-${c.say.replace(/\W+/g, "-").slice(0, 24)}`;
    const profile = { basics: { name: "Synthetic User" }, preferences: {}, constraints: { workAuthorization: c.needs === false ? "I will need sponsorship" : "No sponsorship needed", needsSponsorship: c.needs === false }, facts: [] };
    const r = w.say(u, "A", c.say, { profile });
    assert.equal(w.valueOf(u, c.kind), c.value, `committed ${c.kind} (have ${w.brief(u)})`);
    if (typeof c.needs === "boolean") {
      assert.equal(r.ctx.profile.constraints.needsSponsorship, c.needs, `the profile's needs-sponsorship flag is ${c.needs}`);
      if (r.out.correction) assert.equal(r.out.correction.needsSponsorship, c.needs, "the correction record carries the same polarity");
    }
  });
}

test("polarity: a later answer REPLACES the earlier one (single-value kind), never sits beside it", () => {
  const w = makeWorld();
  const u = "u-pol-replace";
  w.say(u, "A", "I will need sponsorship");
  w.say(u, "B", "I do not require sponsorship");
  w.say(u, "C", "what should I do first?");
  const spons = w.accountFacts(u).filter((f) => f.kind === "sponsorship");
  assert.deepEqual(spons.map((f) => f.value), ["does not need sponsorship"], `exactly the newer answer stands (have ${w.brief(u)})`);
  // Back in the thread that holds the old answer: one answer, never a
  // contradiction of both (the account merge treats the kind as
  // single-value).
  w.say(u, "A", "what should I do first?");
  assert.equal(w.accountFacts(u).filter((f) => f.kind === "sponsorship").length, 1, `one sponsorship fact (have ${w.brief(u)})`);
});

// ---------------------------------------------------------------------
// 5. Corrections
// ---------------------------------------------------------------------
test("correction: \"sorry, I meant Denver\" replaces the geography the previous turn recorded", () => {
  const w = makeWorld();
  const u = "u-corr-meant";
  w.say(u, "A", "I'm a sophomore studying economics");
  w.say(u, "A", "I live in Boston");
  assert.equal(w.valueOf(u, "geography"), "Boston");
  w.say(u, "A", "sorry, I meant Denver");
  assert.equal(w.valueOf(u, "geography"), "Denver", `the correction replaced the city (have ${w.brief(u)})`);
  assert.equal(w.accountFacts(u).filter((f) => f.kind === "geography").length, 1, "one geography fact, never two");
  assert.equal(w.valueOf(u, "majors"), "economics", "other kinds untouched");
  const b = w.say(u, "B", "what should I do first?");
  assert.ok(!/\bBoston\b/.test(b.out.reply), "the corrected-from city never resurfaces in a later thread");
});

test("correction: after an ASK, \"sorry, I meant Chicago\" re-aims the ask and writes no fact", () => {
  const w = makeWorld();
  const u = "u-corr-ask";
  seedTrueFacts(w, u);
  w.say(u, "A", "Find 40 bankers in Boston");
  w.say(u, "A", "sorry, I meant Chicago");
  assertTrueFactsIntact(w, u, "sorry, I meant Chicago (after an ask)");
});

test("correction: \"change my major to applied math\" and \"not Denver, Seattle\" replace their kinds", () => {
  const w = makeWorld();
  const u = "u-corr-named";
  seedTrueFacts(w, u);
  w.say(u, "A", "change my major to applied math");
  assert.equal(w.valueOf(u, "majors"), "applied math", `named correction (have ${w.brief(u)})`);
  w.say(u, "A", "not Denver, Seattle");
  assert.equal(w.valueOf(u, "geography"), "Seattle", `not-X-Y correction (have ${w.brief(u)})`);
  w.say(u, "A", "actually, Halcyon Robotics, not Meridian Capital");
  assert.equal(w.valueOf(u, "target_firm"), "Halcyon Robotics", `X-not-Y correction (have ${w.brief(u)})`);
  assert.equal(w.valueOf(u, "year"), "sophomore", "untouched kinds stay");
});

// ---------------------------------------------------------------------
// 6. The T3 compound sentence still captures both facts
// ---------------------------------------------------------------------
test("compound: \"my target firm is Northwind Ledger and my recruiter contact there is Dana\" captures both", () => {
  const w = makeWorld();
  const u = "u-compound";
  w.say(u, "A", "Quick note — my target firm is Northwind Ledger and my recruiter contact there is Dana. Please remember that.");
  assert.equal(w.valueOf(u, "target_firm"), "Northwind Ledger", `target firm (have ${w.brief(u)})`);
  const contacts = w.accountFacts(u).filter((f) => f.kind === "recruiter_contact");
  assert.equal(contacts.length, 1, `exactly one contact fact (have ${w.brief(u)})`);
  assert.equal(contacts[0].key, "northwind ledger");
  assert.equal(contacts[0].value, "Dana");
});

// ---------------------------------------------------------------------
// 7. Gate portability: the suite carries no machine-local paths
// ---------------------------------------------------------------------
test("portability: this suite names no machine-local path", () => {
  const src = fs.readFileSync(__filename, "utf8");
  const banned = ["your" + "_files", "/work" + "space/"];
  for (const b of banned) assert.ok(!src.includes(b), `the suite must not contain ${b}`);
});
