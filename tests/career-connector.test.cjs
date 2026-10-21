/* CONNECTOR v1 guards (Lane B, 2026-10-21).
   Spec: trainee-capability-targets §CONNECTOR; design:
   docs/connector/connector-v1-design.md. On the base tree
   (cea914fe) every people-matching ask ends in the honest stop
   (people_matching_stop, 142) and no connector records exist —
   these guards fail there. On the build they pass through the
   REAL career host with the composition-root deps installed
   (connectorAllowlist + connectorPool, the boardFor pattern):
   per-thread snapshots, per-user account records, the
   career_host_commit patch whitelist, and an in-memory pool over
   the account store implementing the design's pool interface.
   The adversary sequences are designed UP FRONT (the goal-frame
   round-2 lesson): interleaved threads, repeated yeses, a revoke
   landing mid-proposal, a decline — the state machine lives once
   in the pool, per-user records ride the account-authoritative
   stated-facts carriage, so no stale copy can re-fire an intro.
   Check: node --test tests/career-connector.test.cjs */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW = Date.parse("2026-10-21T12:00:00.000Z");
const WHITELIST = ["paused", "preferred_locations", "erase", "stated_facts"];
const clone = (v) => JSON.parse(JSON.stringify(v));

// ---- the in-memory pool (test tooling implementing the design's
// pool interface over the harness account store) ----
function makePool(store) {
  const proposals = new Map();
  let seq = 0;
  const factsOf = (userId) => {
    const rec = (store.accounts.get(userId) || {}).stated_facts || {};
    return [...(rec.facts || []), ...(rec.keyed || [])];
  };
  const keyedOf = (userId, kind, key) => {
    const f = factsOf(userId).find((x) => x.kind === kind && (x.key || "") === (key || ""));
    if (!f) return null;
    try { return JSON.parse(f.value); } catch { return null; }
  };
  return {
    getProfile(userId) { return keyedOf(userId, "connector_profile", "self"); },
    getConsent(userId) { return keyedOf(userId, "connector_consent", "pool"); },
    optedInProfiles(exceptUserId) {
      const out = [];
      for (const userId of store.accounts.keys()) {
        if (userId === exceptUserId) continue;
        const c = this.getConsent(userId);
        if (c && c.status === "opted_in") { const p = this.getProfile(userId); if (p) out.push({ userId, profile: p }); }
      }
      return out;
    },
    createProposal(p) { seq += 1; const rec = { id: `prop-${seq}`, ...p }; proposals.set(rec.id, rec); return rec; },
    proposal(id) { return proposals.get(id) || null; },
    updateProposal(id, patch) { const r = proposals.get(id); if (!r) return null; Object.assign(r, patch); return r; },
    openProposalFor(userId) {
      for (const r of proposals.values()) if ((r.aId === userId || r.bId === userId) && ["awaiting_a", "awaiting_b"].includes(r.state)) return r;
      return null;
    },
    proposalsFor(userId) { return [...proposals.values()].filter((r) => r.aId === userId || r.bId === userId); },
    recordIntro(userId, fact) {
      const a = store.accounts.get(userId) || {};
      const rec = a.stated_facts || { facts: [], keyed: [], offer: null, updated_at: null };
      rec.keyed = [...(rec.keyed || []).filter((f) => !(f.kind === "connector_intro" && f.key === fact.key)), fact];
      a.stated_facts = rec; store.accounts.set(userId, a);
    },
    setIntroBooking(id, booking) {
      for (const userId of store.accounts.keys()) {
        const rec = (store.accounts.get(userId) || {}).stated_facts; if (!rec) continue;
        for (const list of [rec.facts || [], rec.keyed || []]) for (const f of list) {
          if (f.kind === "connector_intro" && f.key === id) { try { const v = JSON.parse(f.value); v.booking = booking; f.value = JSON.stringify(v); } catch { /* keep */ } }
        }
      }
    },
  };
}

function makeWorld(opts) {
  const o = opts || {};
  const store = { accounts: new Map(), threads: new Map(), watches: new Map() };
  const pool = makePool(store);
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
    connectorAllowlist: o.allowlist === undefined ? ["u-ana", "u-ben", "u-eve"] : o.allowlist,
    connectorPool: o.pool === null ? undefined : pool,
  });
  let n = 0;
  const say = (userId, threadId, text, sopts) => {
    n += 1;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: (sopts || {}).postings || [] });
    const out = host.runTurn(text, ctx);
    store.threads.set(threadId, host.extractSnapshot(ctx));
    if (ctx._hostPatch) {
      for (const k of Object.keys(ctx._hostPatch)) assert.ok(WHITELIST.includes(k), `commit patch key "${k}" is outside the career_host_commit whitelist`);
      if (ctx._hostPatch.erase === true) store.accounts.set(userId, { paused: true });
      else { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    }
    return { out, ctx };
  };
  return { host, store, pool, say };
}

// ---- record readers (the committed account record, folded) ----
const acctFacts = (store, u) => { const r = (store.accounts.get(u) || {}).stated_facts || {}; return [...(r.facts || []), ...(r.keyed || [])]; };
const acctKeyed = (store, u, kind, key) => { const f = acctFacts(store, u).find((x) => x.kind === kind && (x.key || "") === (key || "")); if (!f) return null; try { return JSON.parse(f.value); } catch { return null; } };
const introFacts = (store, u) => acctFacts(store, u).filter((f) => f.kind === "connector_intro");

// ---- TEST personas + turns ----
const ANA = "u-ana", BEN = "u-ben", EVE = "u-eve", MAX = "u-max";
const ANA_CAPTURE = "Opt me into matching — my name is Ana. I need intros to alumni working in investment banking, and I can offer interview prep and resume reviews.";
const BEN_CAPTURE = "My name is Ben. I need interview prep for banking superdays, and I can offer alumni perspective from inside investment banking.";
const EVE_CAPTURE = "My name is Eve. I need resume reviews from someone in banking, and I can offer mock interviews for consulting cases.";
function optIn(w, u, thread, capture) {
  const r1 = w.say(u, thread, capture);
  const r2 = w.say(u, thread, "Yes — opt me in.");
  return [r1, r2];
}

test("non-allowlisted user: the honest stop answers, byte-identical, and nothing is recorded", () => {
  const w = makeWorld();
  const r = w.say(MAX, "t1", "find me a mentor");
  assert.equal(r.out.intent, "people_matching_stop", `the stop keeps its owner for non-allowlisted users — got ${r.out.intent}`);
  assert.ok(r.out.reply.includes("I can't match or introduce you to people — that capability is not wired into this product."), "the stop text is the deployed text, unchanged");
  assert.deepEqual(acctFacts(w.store, MAX).filter((f) => f.kind.startsWith("connector_")), [], "no connector records are written for a non-allowlisted user");
  assert.equal(w.pool.proposalsFor(MAX).length, 0);
});

test("allowlisted but no pool installed: one honest not-wired reply, no records, no fake flow", () => {
  const w = makeWorld({ pool: null });
  const r = w.say(ANA, "t1", "find me a mentor");
  assert.equal(r.out.intent, "connector_not_wired", `got ${r.out.intent}`);
  assert.ok(!/meet Priya|introducing/i.test(r.out.reply), "no person is invented");
  assert.deepEqual(acctFacts(w.store, ANA).filter((f) => f.kind.startsWith("connector_")), [], "nothing is recorded when the pool is not wired");
});

test("a needs/offers statement alone records the profile but NO consent (assertion discipline)", () => {
  const w = makeWorld();
  const r = w.say(ANA, "t1", "My name is Ana. I need intros to alumni working in investment banking, and I can offer interview prep and resume reviews.");
  assert.equal(r.out.intent, "connector_profile_record", `got ${r.out.intent}`);
  const prof = acctKeyed(w.store, ANA, "connector_profile", "self");
  assert.ok(prof && prof.needs.includes("investment banking") && prof.offers.includes("interview prep"), "the profile is on the account record");
  assert.equal(acctKeyed(w.store, ANA, "connector_consent", "pool"), null, "no consent record exists without the explicit opt-in act");
  assert.deepEqual(w.pool.optedInProfiles(BEN), [], "a profile without consent is never in the pool");
});

test("explicit opt-in records consent, reads back, and survives into a fresh thread", () => {
  const w = makeWorld();
  optIn(w, ANA, "t1", ANA_CAPTURE);
  const c = acctKeyed(w.store, ANA, "connector_consent", "pool");
  assert.ok(c && c.status === "opted_in" && typeof c.at === "string", "the consent record is committed with its timestamp");
  assert.equal(w.pool.optedInProfiles(BEN).map((x) => x.userId).join(","), ANA, "the pool lists exactly the opted-in user");
  const r = w.say(ANA, "t2-fresh", "am I opted in?");
  assert.equal(r.out.intent, "connector_status", `got ${r.out.intent}`);
  assert.match(r.out.reply, /opted in/i, "the fresh thread reads the account record, not a thread cache");
});

test("revoke rewrites consent, leaves the pool, and reads back revoked", () => {
  const w = makeWorld();
  optIn(w, ANA, "t1", ANA_CAPTURE);
  const r = w.say(ANA, "t1", "opt me out — revoke my consent");
  assert.equal(r.out.intent, "connector_revoke", `got ${r.out.intent}`);
  const c = acctKeyed(w.store, ANA, "connector_consent", "pool");
  assert.ok(c && c.status === "revoked", "the record itself now says revoked");
  assert.deepEqual(w.pool.optedInProfiles(BEN), [], "a revoked user is never listed");
  const r2 = w.say(ANA, "t9", "am I opted in?");
  assert.match(r2.out.reply, /not (currently )?opted in|revoked/i, "the read-back tells the truth after revoke");
});

test("no match is proposed to or from a non-opted-in profile", () => {
  const w = makeWorld();
  optIn(w, ANA, "ta", ANA_CAPTURE);
  w.say(BEN, "tb", BEN_CAPTURE); // profile only, NO opt-in
  const r = w.say(ANA, "ta", "find me a match");
  assert.equal(r.out.intent, "connector_match_none", `got ${r.out.intent} — ${r.out.reply}`);
  assert.equal(w.pool.proposalsFor(ANA).length, 0, "no proposal exists");
});

test("full flow: proposal is identity-free, one yes never fires, both yeses fire the intro exactly once with the 72h marker", () => {
  const w = makeWorld();
  optIn(w, ANA, "ta", ANA_CAPTURE);
  optIn(w, BEN, "tb", BEN_CAPTURE);
  // A asks -> proposal presented to A, identity-free, why cites facts verbatim.
  const rp = w.say(ANA, "ta", "find me a match");
  assert.equal(rp.out.intent, "connector_match_proposal", `got ${rp.out.intent} — ${rp.out.reply}`);
  assert.ok(!/\bBen\b/.test(rp.out.reply), "A sees no identity before both yeses");
  assert.ok(rp.out.reply.includes("alumni perspective from inside investment banking"), "the why cites the other side's offer verbatim");
  assert.ok(rp.out.reply.includes("intros to alumni working in investment banking"), "the why cites A's own need verbatim");
  const prop = w.pool.openProposalFor(ANA);
  assert.ok(prop && prop.state === "awaiting_a" && prop.bId === BEN, "the proposal sits in the pool awaiting A");
  // A's yes alone must NOT fire anything.
  const ry = w.say(ANA, "ta", "yes to the match");
  assert.equal(ry.out.intent, "connector_match_decision", `got ${ry.out.intent}`);
  assert.equal(w.pool.proposal(prop.id).state, "awaiting_b");
  assert.deepEqual(introFacts(w.store, ANA), [], "no intro on A's record after one yes");
  assert.deepEqual(introFacts(w.store, BEN), [], "no intro on B's record after one yes");
  // B's next connector turn surfaces the proposal — identity-free for B too.
  const rb = w.say(BEN, "tb", "any matches for me?");
  assert.equal(rb.out.intent, "connector_match_proposal", `got ${rb.out.intent} — ${rb.out.reply}`);
  assert.ok(!/\bAna\b/.test(rb.out.reply), "B never sees A's identity before B's yes");
  // B yes -> the intro fires, once, onto BOTH records, with the 72h marker.
  const ri = w.say(BEN, "tb", "yes — introduce us");
  assert.equal(ri.out.intent, "connector_intro", `got ${ri.out.intent} — ${ri.out.reply}`);
  assert.ok(ri.out.reply.includes("Ana") && ri.out.reply.includes("Ben"), "the intro names both sides, now that both have said yes");
  assert.equal(w.pool.proposal(prop.id).state, "intro_sent");
  for (const u of [ANA, BEN]) {
    const intros = introFacts(w.store, u);
    assert.equal(intros.length, 1, `exactly one intro record on ${u}'s account`);
    const v = JSON.parse(intros[0].value);
    assert.equal(v.followUpDueAt && (Date.parse(v.followUpDueAt) - Date.parse(v.at)), 72 * 3600 * 1000, "the follow-up marker is intro time + 72h");
    assert.equal(v.booking, "offered", "booking starts as an offer, never a claimed artifact");
  }
});

test("one open proposal at a time — for the asker and for the proposed side alike", () => {
  const w = makeWorld();
  optIn(w, ANA, "ta", ANA_CAPTURE); optIn(w, BEN, "tb", BEN_CAPTURE); optIn(w, EVE, "te", EVE_CAPTURE);
  w.say(ANA, "ta", "find me a match");
  const before = w.pool.proposalsFor(ANA).length + w.pool.proposalsFor(BEN).length + w.pool.proposalsFor(EVE).length;
  const r = w.say(ANA, "ta", "find me a match");
  assert.notEqual(r.out.intent, "connector_match_proposal", "no second proposal is presented while one is open");
  // The proposal reaches the proposed side only once the asker has
  // said yes (double opt-in sequencing); then B's own match ask
  // surfaces the pending proposal instead of dealing a new one.
  w.say(ANA, "ta", "yes to the match");
  const r2 = w.say(BEN, "tb", "find me a match");
  assert.equal(r2.out.intent, "connector_match_proposal", "the proposed side is shown the pending proposal, not dealt a new one");
  const after = w.pool.proposalsFor(ANA).length + w.pool.proposalsFor(BEN).length + w.pool.proposalsFor(EVE).length;
  assert.equal(after, before, "the pool still holds exactly one proposal");
});

test("exactly-once under adversarial repetition: stale threads and repeated yeses can never re-fire the intro", () => {
  const w = makeWorld();
  optIn(w, ANA, "ta-old", ANA_CAPTURE);
  optIn(w, BEN, "tb", BEN_CAPTURE);
  w.say(ANA, "ta-old", "find me a match");
  w.say(ANA, "ta-old", "yes to the match");
  w.say(BEN, "tb", "yes — introduce us");
  assert.equal(introFacts(w.store, ANA).length, 1);
  // B says yes again, in a fresh thread: terminal state stands down.
  const rb = w.say(BEN, "tb2", "yes to the match");
  assert.notEqual(rb.out.intent, "connector_intro", "a repeated yes never re-fires");
  // A returns to her OLD thread (its cache predates B's yes) and says yes:
  // the account record + pool state are authoritative — no re-fire, and
  // what she is shown is the intro that already happened.
  const ra = w.say(ANA, "ta-old", "yes to the match");
  assert.notEqual(ra.out.intent, "connector_intro", "a stale-thread yes never re-fires the intro");
  assert.equal(introFacts(w.store, ANA).length, 1, "still exactly one intro on A's record");
  assert.equal(introFacts(w.store, BEN).length, 1, "still exactly one intro on B's record");
  assert.match(ra.out.reply, /Ana[\s\S]*Ben|intro/i, "the returning side is shown the intro on record");
});

test("a decline ends the proposal, reveals nothing, and frees both sides", () => {
  const w = makeWorld();
  optIn(w, ANA, "ta", ANA_CAPTURE); optIn(w, EVE, "te", EVE_CAPTURE);
  w.say(ANA, "ta", "find me a match");
  const prop = w.pool.openProposalFor(ANA);
  assert.ok(prop && prop.bId === EVE, "the only fit in this pool is Eve");
  w.say(ANA, "ta", "yes to the match");
  const rd = w.say(EVE, "te", "no thanks — pass on the match");
  assert.equal(rd.out.intent, "connector_match_decision", `got ${rd.out.intent}`);
  assert.equal(w.pool.proposal(prop.id).state, "declined_b");
  const rs = w.say(ANA, "ta", "what's my match status?");
  assert.ok(!/\bEve\b/.test(rs.out.reply), "a decline never reveals who passed");
  assert.deepEqual(introFacts(w.store, ANA), [], "no intro was recorded");
  assert.equal(w.pool.openProposalFor(ANA), null, "both sides are free again");
});

test("a revoke landing mid-proposal closes it — the pending yes can never fire an intro", () => {
  const w = makeWorld();
  optIn(w, ANA, "ta", ANA_CAPTURE); optIn(w, BEN, "tb", BEN_CAPTURE);
  w.say(ANA, "ta", "find me a match");
  const prop = w.pool.openProposalFor(ANA);
  w.say(ANA, "ta", "yes to the match");
  w.say(BEN, "tb", "opt me out — revoke my consent");
  assert.equal(w.pool.proposal(prop.id).state, "closed_revoked", "the revoke closes the open proposal in the pool");
  const ry = w.say(BEN, "tb", "yes — introduce us");
  assert.notEqual(ry.out.intent, "connector_intro", "a revoked side's yes fires nothing");
  assert.deepEqual(introFacts(w.store, ANA), [], "no intro on A's record");
  assert.deepEqual(introFacts(w.store, BEN), [], "no intro on B's record");
});

test("booking acceptance is recorded on both records — and no calendar artifact is ever claimed", () => {
  const w = makeWorld();
  optIn(w, ANA, "ta", ANA_CAPTURE); optIn(w, BEN, "tb", BEN_CAPTURE);
  w.say(ANA, "ta", "find me a match");
  w.say(ANA, "ta", "yes to the match");
  w.say(BEN, "tb", "yes — introduce us");
  const r = w.say(ANA, "ta", "book the call");
  assert.equal(r.out.intent, "connector_booking_accept", `got ${r.out.intent} — ${r.out.reply}`);
  for (const u of [ANA, BEN]) {
    const v = JSON.parse(introFacts(w.store, u)[0].value);
    assert.equal(v.booking, "accepted", `booking acceptance is recorded on ${u}'s record`);
  }
  assert.ok(/Google/.test(r.out.reply), "the reply names the real booking seam (in-product Google connect)");
  assert.ok(!/calendar event (was |has been )?created|invite (was |has been )?sent|booked for/i.test(r.out.reply), "no calendar artifact is claimed");
});

test("the intro check-in reads the user's own record back (follow-up state included)", () => {
  const w = makeWorld();
  optIn(w, ANA, "ta", ANA_CAPTURE); optIn(w, BEN, "tb", BEN_CAPTURE);
  w.say(ANA, "ta", "find me a match");
  w.say(ANA, "ta", "yes to the match");
  w.say(BEN, "tb", "yes — introduce us");
  const r = w.say(ANA, "ta2", "check in on my intro");
  assert.equal(r.out.intent, "connector_status", `got ${r.out.intent} — ${r.out.reply}`);
  assert.ok(r.out.reply.includes("Ben"), "the check-in names the intro from A's own record");
  assert.match(r.out.reply, /72-hour|follow-up/i, "the follow-up marker is part of the read-back");
});

test("claim discipline: the connector never swallows other families, for allowlisted users either", () => {
  const w = makeWorld();
  const r1 = w.say(ANA, "t1", "My career goal is a data analyst internship for summer 2027.");
  assert.equal(r1.out.intent, "career_goal_record", "the goal frame keeps its owner");
  const r2 = w.say(ANA, "t1", "find data analyst internships in Chicago");
  assert.match(r2.out.intent || "", /discovery|internship/, "discovery keeps its owner");
  const r3 = w.say(ANA, "t1", "give me the email of a banker at Goldman");
  assert.notEqual(r3.out.intent, "connector_status", "contact hand-out asks are never the connector's to answer");
  assert.equal(acctKeyed(w.store, ANA, "connector_consent", "pool"), null, "none of these turns touched the connector records");
});
