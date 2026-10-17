/* LF-08 guard (BUG-270 / FR-425) — STATED_FACT_LOST_AFTER_CONFIRMED_CAPTURE.
   Live on v225 (5711b77), 2026-10-17, gauntlet test user: thread A stated
   "I'm a sophomore studying economics, and I'm targeting Meridian Capital";
   the reply confirmed the record ("Recorded — that is on your record now…
   you're targeting Meridian Capital"), yet no target_firm fact was EVER in
   the committed account record: module 142's bare `targeting <Name>`
   capture frame filed the firm name as GEOGRAPHY (the one proper-name
   geography frame with no FACT_CITIES gate, and no `targeting <Firm>`
   frame existed in the target_firm chain), so the next turn's legitimate
   geography statement ("I'm based in Denver…") silently overwrote the
   single-value slot and the firm was gone — thread B then truthfully
   denied the user had ever stated it. S1: a false claim about state,
   deploy rolled back.

   This guard runs the DEPLOYED path — the real CareerHost with the real
   chain modules and production commit semantics (per-thread snapshots,
   per-user account record, the career_host_commit whitelist as extended
   by migration 20261016120000) — and asserts on the COMMITTED ACCOUNT
   RECORD after every turn, not on the turn's in-memory ctx: the exact
   journey verbatim, then the general invariant for every capture kind
   142 can confirm in a reply (reply-claim ⇔ DB-truth parity under a
   later colliding statement and a thread change).
   Check: node --test tests/career-lf08-stated-fact-parity.test.cjs */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW = Date.parse("2026-10-17T15:31:00.000Z");
const WHITELIST = ["paused", "preferred_locations", "erase", "stated_facts"];
const clone = (v) => JSON.parse(JSON.stringify(v));

function makeHost() {
  return CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
}
// Same production-semantics world as tests/career-depth-memory.test.cjs:
// the account map IS the committed record (career_watch_kv 'career:account'
// in production) — assertions below read it after each turn's commit.
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
  const hasFact = (userId, kind, re) => accountFacts(userId).some((f) => f.kind === kind && re.test(f.value));
  return { host, store, say, accountFacts, hasFact };
}

// ---------- the exact LF-08 journey, verbatim ----------
test("LF-08: the live journey — a confirmed target firm survives the geography turn and the thread change", () => {
  const { say, accountFacts, hasFact } = makeWorld();
  const u = "u-lf08";
  // Thread A t1 (verbatim): the reply confirms the record.
  const t1 = say(u, "A", "I'm a sophomore studying economics, and I'm targeting Meridian Capital");
  assert.match(t1.out.reply, /Recorded/, "t1 confirms the capture");
  assert.match(t1.out.reply, /Meridian Capital/, "t1's confirmation names the firm");
  // DB assertion after t1's commit: the account record itself must hold
  // the firm UNDER ITS OWN KIND — a geography entry named "Meridian
  // Capital" is the misfile that lost it live.
  assert.ok(hasFact(u, "target_firm", /Meridian Capital/), `after t1 the committed record holds target_firm Meridian Capital (have: ${JSON.stringify(accountFacts(u))})`);
  assert.ok(hasFact(u, "year", /sophomore/), "year committed");
  assert.ok(hasFact(u, "majors", /economics/), "majors committed");
  assert.ok(!hasFact(u, "geography", /Meridian/), "the firm name is not filed as geography");
  // Thread A t2 (verbatim): a legitimate geography statement — it must
  // ADD Denver, never take the firm with it.
  say(u, "A", "I'm based in Denver and I want data roles");
  assert.ok(hasFact(u, "geography", /Denver/), `after t2 the committed record holds geography Denver (have: ${JSON.stringify(accountFacts(u))})`);
  assert.ok(hasFact(u, "target_firm", /Meridian Capital/), `after t2 the committed record STILL holds the target firm (have: ${JSON.stringify(accountFacts(u))})`);
  // Thread B t1 (verbatim): the read-back answers from the record.
  const b1 = say(u, "B", "what's my target firm?");
  assert.equal(b1.out.intent, "profile_recall");
  assert.match(b1.out.reply, /Meridian Capital/, "thread B recalls the firm the user stated in thread A");
  assert.ok(!/not on your record/.test(b1.out.reply), "never the false denial again");
  // Thread B t2: the plan is built on the firm too.
  const b2 = say(u, "B", "what should I do first?");
  assert.match(b2.out.reply, /Meridian Capital/, "the plan cites the stated firm");
});

// ---------- reply-claim ⇔ DB-truth parity, every confirmable kind ----------
// For each kind: state it in its natural frame (co-stated with year +
// majors), assert the committed record matches everything the turn's
// ctx presented as on record, then apply LF-08's collision pressure —
// a later statement of a DIFFERENT single-value kind (Denver geography;
// a year statement for the geography case) and a thread change — and
// assert the fact is still in the committed record and seeded into
// the new thread.
const PRESSURE_GEO = "I'm based in Denver and I want data roles";
const CASES = [
  { kind: "year", say: "I'm a sophomore studying economics, and I'm a junior", re: /junior/, pressure: PRESSURE_GEO },
  { kind: "majors", say: "I'm a sophomore, and I study economics", re: /economics/, pressure: PRESSURE_GEO },
  { kind: "target_firm", say: "I'm a sophomore studying economics, and I'm targeting Meridian Capital", re: /Meridian Capital/, pressure: PRESSURE_GEO },
  { kind: "target_firm", say: "I'm a sophomore studying economics, and my target firm is Halcyon Robotics", re: /Halcyon Robotics/, pressure: PRESSURE_GEO },
  { kind: "geography", say: "I'm a sophomore studying economics, and I'm targeting Chicago firms", re: /Chicago/, pressure: "I'm a junior" },
  { kind: "school", say: "I'm a sophomore studying economics, and I go to Northeastern University", re: /Northeastern/, pressure: PRESSURE_GEO },
  { kind: "experience", say: "I'm a sophomore studying economics, and last summer I interned at Vantage Aero", re: /Vantage Aero/, pressure: PRESSURE_GEO },
  { kind: "level", say: "I'm a sophomore studying economics, and analysts only for me", re: /analysts/, pressure: PRESSURE_GEO },
  { kind: "excluded_level", say: "I'm a sophomore studying economics, and associates are too senior", re: /associates/, pressure: PRESSURE_GEO },
  { kind: "tone", say: "I'm a sophomore studying economics, and make the tone casual", re: /casual/, pressure: PRESSURE_GEO },
];
for (const c of CASES) {
  test(`parity: ${c.kind} stated (${c.say.slice(0, 44)}…) is in the committed record and survives pressure + thread change`, () => {
    const { say, accountFacts, hasFact } = makeWorld();
    const u = `u-parity-${c.kind}-${c.re.source.slice(0, 8)}`;
    const r1 = say(u, "A", c.say);
    // The commit must carry EVERY fact the turn holds as on record —
    // the echo's claim set and the persisted set are the same set.
    const ctxFacts = ((r1.ctx.statedFacts || {}).facts) || [];
    const committed = accountFacts(u);
    for (const f of ctxFacts) assert.ok(committed.some((x) => x.kind === f.kind && x.value === f.value), `commit carries ${f.kind}=${f.value} (committed: ${JSON.stringify(committed)})`);
    assert.ok(hasFact(u, c.kind, c.re), `the stated ${c.kind} is committed (have: ${JSON.stringify(committed)})`);
    say(u, "A", c.pressure);
    assert.ok(hasFact(u, c.kind, c.re), `after the colliding statement the committed record STILL holds ${c.kind} (have: ${JSON.stringify(accountFacts(u))})`);
    const r3 = say(u, "B", "what should I do first?");
    const seeded = ((r3.ctx.statedFacts || {}).facts) || [];
    assert.ok(seeded.some((f) => f.kind === c.kind && c.re.test(f.value)), `a new thread is seeded with ${c.kind} (have: ${JSON.stringify(seeded)})`);
  });
}

// ---------- the city gate is preserved; questions still write nothing ----------
test("LF-08 controls: 'targeting <city>' stays geography, and a question about targeting records nothing", () => {
  const { say, hasFact, accountFacts } = makeWorld();
  say("u-ctl1", "A1", "I'm targeting New York firms for next summer");
  assert.ok(hasFact("u-ctl1", "geography", /New York/), "city + firms stays geography");
  assert.ok(!hasFact("u-ctl1", "target_firm", /New York/), "no firm is minted from a city");
  say("u-ctl2", "A2", "I'm a sophomore targeting Chicago");
  assert.ok(hasFact("u-ctl2", "geography", /Chicago/), "a bare stated city after 'targeting' stays geography");
  assert.ok(!hasFact("u-ctl2", "target_firm", /Chicago/), "no firm is minted from the bare city either");
  const r = say("u-ctl3", "A3", "what if I'm targeting Meridian Capital next year?");
  assert.ok(!accountFacts("u-ctl3").some((f) => /Meridian/.test(f.value)), `a hypothetical question records nothing (have: ${JSON.stringify(accountFacts("u-ctl3"))})`);
  assert.ok(r.out, "the turn is still answered");
});
