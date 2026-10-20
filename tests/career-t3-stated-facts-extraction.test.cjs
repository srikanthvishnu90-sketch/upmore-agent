'use strict';
// =====================================================================
// FIX LANE T3 — stated-facts extraction quality (FACT-KEY-GARBLE-DUP).
// Evidence: ~/workspace/your_files/channel-tests/2026-10-20-telegram.md
// turns 2–3 + cross-check §4 (store read, live, tier 1).
//
// DEFECT 1 — the battery's turn-3 sentence, verbatim:
//   "Quick note — my target firm is Northwind Ledger and my recruiter
//    contact there is Dana. Please remember that."
// minted a SECOND recruiter_contact fact keyed "northwind ledger and":
// turnCompany() runs the 3-token company pattern over the WHOLE turn
// (case-insensitive), so the span swallowed the sentence's conjunction
// ("Northwind Ledger and") and cleanCo never stripped it. The firm
// correction in the same turn landed exactly once (cross-check §4) —
// the keying half is what failed. The lab never saw it: CB-0441's
// sentence carries "(fictional)" after the company, which blocks the
// third token and masks the swallow.
//
// DEFECT 2 — same store, same class: majors = "at fintechs in SF who
// share my", a 30-char truncated span minted by the bounded lazy
// "X major" frame from a sentence of the class "…at fintechs in SF
// who share my major" — a relative-clause fragment stored as a field
// of study and read back to the user ("you study at fintechs in SF
// who share my", turns 2–3).
//
// THE GUARD: replay the EXACT battery sentence and the fragment's
// sentence class against the real host. Fixed behavior: exactly one
// recruiter_contact fact keyed "northwind ledger"; no fact key ends
// in a bare conjunction; no fragment is stored as a majors fact;
// legitimate captures (internal conjunctions, real majors) still land.
// =====================================================================
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW = Date.parse("2026-10-20T15:00:00.000Z");
const WHITELIST = ["paused", "preferred_locations", "erase", "stated_facts"];
const clone = (v) => JSON.parse(JSON.stringify(v));

function makeHost(extra) {
  return CareerHost.createCareerHost(Object.assign({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  }, extra || {}));
}
function makeWorld(hostExtra) {
  const host = makeHost(hostExtra);
  const store = { accounts: new Map(), threads: new Map(), watches: new Map() };
  let n = 0;
  const say = (userId, threadId, text, opts) => {
    const o = opts || {};
    n += 1;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: o.postings || [], batchDeps: o.batchDeps || undefined, profile: o.profile });
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
const factsOf = (r) => ((r.ctx.statedFacts || {}).facts) || [];
const keyedOf = (r, kind) => factsOf(r).filter((f) => f.kind === kind);
const TURN3 = "Quick note — my target firm is Northwind Ledger and my recruiter contact there is Dana. Please remember that.";

// ---------------------------------------------------------------------
// DEFECT 1 — key garble + duplication
// ---------------------------------------------------------------------

test("T3-1: the exact battery turn-3 sentence keys the contact under 'northwind ledger', once", () => {
  const { say } = makeWorld();
  const r = say("u-t3-1", "t", TURN3);
  const contacts = keyedOf(r, "recruiter_contact");
  assert.equal(contacts.length, 1, `expected exactly one recruiter_contact fact, got: ${JSON.stringify(factsOf(r))}`);
  assert.equal(contacts[0].key, "northwind ledger", `garbled key: ${JSON.stringify(contacts[0])}`);
  assert.equal(contacts[0].value, "Dana");
  const firms = keyedOf(r, "target_firm");
  assert.equal(firms.length, 1, `target_firm must land exactly once: ${JSON.stringify(firms)}`);
  assert.equal(firms[0].value, "Northwind Ledger");
  for (const f of factsOf(r)) {
    assert.ok(!/\b(and|or)$/.test(f.key || ""), `fact key ends in a bare conjunction: ${JSON.stringify(f)}`);
  }
});

test("T3-2: morning plant + battery turn 3 — still ONE recruiter_contact under the clean key", () => {
  const { say } = makeWorld();
  say("u-t3-2", "t", "My recruiter contact at Northwind Ledger is Dana.");
  const r = say("u-t3-2", "t", TURN3);
  const contacts = keyedOf(r, "recruiter_contact");
  assert.equal(contacts.length, 1, `the compound restatement duplicated the contact: ${JSON.stringify(factsOf(r))}`);
  assert.equal(contacts[0].key, "northwind ledger");
  assert.equal(contacts[0].value, "Dana");
});

test("T3-3: one-token company before a conjunction — key is the company, not 'gusto and my'", () => {
  const { say } = makeWorld();
  const r = say("u-t3-3", "t", "my target firm is Gusto and my recruiter contact there is Dana");
  const contacts = keyedOf(r, "recruiter_contact");
  assert.equal(contacts.length, 1, `expected one recruiter_contact fact: ${JSON.stringify(factsOf(r))}`);
  assert.equal(contacts[0].key, "gusto", `garbled key: ${JSON.stringify(contacts[0])}`);
});

test("T3-4: a hiring manager named in the same compound shape keys under the clean company", () => {
  const { say } = makeWorld();
  const r = say("u-t3-4", "t", "my target firm is Northwind Ledger and the hiring manager is Priya Shah");
  const hms = keyedOf(r, "hiring_manager");
  assert.equal(hms.length, 1, `expected one hiring_manager fact: ${JSON.stringify(factsOf(r))}`);
  assert.equal(hms[0].key, "northwind ledger", `garbled key: ${JSON.stringify(hms[0])}`);
  assert.equal(hms[0].value, "Priya Shah");
});

test("T3-5 (control): an internal conjunction in a company name is preserved", () => {
  const { say } = makeWorld();
  const r = say("u-t3-5", "t", "my target firm is Johnson and Johnson and my recruiter contact there is Dana");
  const contacts = keyedOf(r, "recruiter_contact");
  assert.equal(contacts.length, 1, `expected one recruiter_contact fact: ${JSON.stringify(factsOf(r))}`);
  assert.equal(contacts[0].key, "johnson and johnson", `internal conjunction must survive: ${JSON.stringify(contacts[0])}`);
});

// ---------------------------------------------------------------------
// DEFECT 2 — fragment spans stored as majors
// ---------------------------------------------------------------------

test("T3-6: the fragment's sentence class mints NO majors fact ('…at fintechs in SF who share my major')", () => {
  const { say } = makeWorld();
  const r = say("u-t3-6", "t", "I want to connect with students at fintechs in SF who share my major.");
  const majors = keyedOf(r, "majors");
  assert.equal(majors.length, 0, `a relative-clause fragment was stored as a major: ${JSON.stringify(factsOf(r))}`);
});

test("T3-7: fragment class, second surface ('meet analysts at … who share my major')", () => {
  const { say } = makeWorld();
  const r = say("u-t3-7", "t", "I'm hoping to meet analysts at fintechs in SF who share my major this summer.");
  const majors = keyedOf(r, "majors");
  assert.equal(majors.length, 0, `a relative-clause fragment was stored as a major: ${JSON.stringify(factsOf(r))}`);
});

test("T3-8 (controls): real majors statements still capture, in every frame", () => {
  let r = makeWorld().say("u-t3-8a", "t", "I'm a sophomore studying finance and computer science");
  assert.ok(keyedOf(r, "majors").some((f) => /finance/.test(f.value)), `study frame lost: ${JSON.stringify(factsOf(r))}`);
  r = makeWorld().say("u-t3-8b", "t", "my majors are finance and economics");
  assert.ok(keyedOf(r, "majors").some((f) => /finance/.test(f.value)), `my-majors frame lost: ${JSON.stringify(factsOf(r))}`);
  r = makeWorld().say("u-t3-8c", "t", "finance and computer science are my majors");
  assert.ok(keyedOf(r, "majors").some((f) => /finance/.test(f.value)), `inverted frame lost: ${JSON.stringify(factsOf(r))}`);
  r = makeWorld().say("u-t3-8d", "t", "I'm a finance major");
  assert.ok(keyedOf(r, "majors").some((f) => /finance/.test(f.value)), `'X major' frame lost: ${JSON.stringify(factsOf(r))}`);
});
