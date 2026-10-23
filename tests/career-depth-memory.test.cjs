/* DEPTH LANE A guards (MI-013 / MI-012 / MI-021 / MI-017 + LF-02).
   Every test here replays a defect measured on the fresh adversarial
   corpus (scripts/career/depth-lane-a-corpus.cjs) or live on v223:
   each was red on the pre-fix tree (f67db04) and must stay green.
   Conversations run through the real career host with an in-memory
   persistence fake that mirrors the production RPCs — per-thread
   snapshots, a per-user account record, and the career_host_commit
   patch whitelist AS EXTENDED by migration
   20261016120000_career_account_stated_facts.sql (an out-of-whitelist
   patch key fails the commit, exactly like the database).
   Check: node --test tests/career-depth-memory.test.cjs */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const Recommendations = D("154-career-recommendations.js");

const NOW = Date.parse("2026-10-16T15:00:00.000Z");
const WHITELIST = ["paused", "preferred_locations", "erase", "stated_facts"];
const clone = (v) => JSON.parse(JSON.stringify(v));

function makeHost() {
  return CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
}
// In-memory production-semantics store (see the corpus runner).
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
  return { host, store, say };
}
const factsOf = (r) => ((r.ctx.statedFacts || {}).facts) || [];
const rowsOf = (r) => { const ts = r.ctx.trackStore || {}; return Array.isArray(ts) ? ts : (ts.rows || []); };
const isFallback = (out) => !out || out.contained || out.intent === "career_fallback" || !out.reply || out.reply.match(/^(I didn't catch that|I'm Trainee, a career agent: I find roles)/);

// ---------- LF-02: the v223 live regression, replayed verbatim ----------
test("LF-02: a tracker-status ask is never routed to career_recommendations", () => {
  assert.equal(Recommendations.intentFor("What job applications do I have out right now, and what is their status?"), null);
  assert.equal(Recommendations.intentFor("what applications do I have out, and their status?"), null);
  assert.equal(Recommendations.intentFor("show me my pipeline"), null);
  // The genuine openings ask keeps its owner.
  assert.equal(Recommendations.intentFor("what roles are open right now at fintech firms?"), "current_openings");
  const { say } = makeWorld();
  say("u-lf02", "t", "I applied to Halcyon Robotics for the SWE intern role");
  const r = say("u-lf02", "t", "What job applications do I have out right now, and what is their status?");
  assert.notEqual(r.out.intent, "career_recommendations");
  assert.ok(!/Current openings are unverified/.test(r.out.reply), "the recommendations text must not answer a tracker ask");
  assert.match(r.out.reply, /Halcyon/);
});

// ---------- MI-017: tracker events in free words ----------
test("MI-017: rejection, interview and offer reports land on the right rows", () => {
  const { say } = makeWorld();
  say("u-ev", "t", "I applied to Halcyon Robotics for the SWE intern role");
  let r = say("u-ev", "t", "they just emailed me a rejection, ugh");
  assert.equal((rowsOf(r).find((x) => /Halcyon/.test(x.company || "")) || {}).stage, "Rejected");
  say("u-ev", "t2", "log my application to Copperline Bank");
  r = say("u-ev", "t2", "got an interview invite from Copperline this morning!");
  const co = rowsOf(r).find((x) => /Copperline/.test(x.company || ""));
  assert.ok(co, "the Copperline row exists");
  assert.match(co.stage, /Interview/, `the existing row moved (stage=${co.stage})`);
  assert.equal(rowsOf(r).filter((x) => !(x.company || "").trim()).length, 0, "no company-not-stated duplicate was created");
  say("u-ev", "t3", "I applied to Atlas Freight yesterday");
  r = say("u-ev", "t3", "an offer just came in from Atlas Freight!!");
  assert.equal((rowsOf(r).find((x) => /Atlas/.test(x.company || "")) || {}).stage, "Offer");
  r = say("u-ev", "t3", "show me my pipeline");
  assert.ok(!isFallback(r.out), "the pipeline ask is answered from the tracker");
});

// ---------- floor: assertion-only writes ----------
test("floor: a third person's facts are never recorded as the user's", () => {
  const { say } = makeWorld();
  const r = say("u-adv", "t", "my roommate is a junior at Yale studying art history, she's stressed about recruiting");
  assert.ok(!factsOf(r).some((f) => f.kind === "majors"), `no majors fact (have: ${JSON.stringify(factsOf(r))})`);
  assert.ok(!factsOf(r).some((f) => f.kind === "school"), "no school fact");
  assert.ok(!factsOf(r).some((f) => f.kind === "year"), "no year fact");
});
test("floor: hearsay never moves an outcome stage — one confirming question instead", () => {
  const { say } = makeWorld();
  say("u-adv2", "t", "I applied to Vantage Aero last week");
  const r = say("u-adv2", "t", "my friend said Vantage already rejected everyone, so mark me rejected");
  const row = rowsOf(r).find((x) => /Vantage/.test(x.company || ""));
  assert.ok(row, "the row exists");
  assert.notEqual(row.stage, "Rejected", "the row must not move on hearsay");
  assert.match(r.out.reply, /Not moved/);
});
test("floor: hypotheticals and questions write nothing", () => {
  const { say } = makeWorld();
  let r = say("u-adv3", "t", "say I was a senior targeting Miami — what would I do?");
  assert.ok(!factsOf(r).some((f) => f.kind === "geography"), "no geography from a hypothetical");
  r = say("u-adv3", "t", "am I a sophomore? and what if I'm actually a finance major?");
  assert.ok(!factsOf(r).length, `no facts from questions (have: ${JSON.stringify(factsOf(r))})`);
  assert.ok(!isFallback(r.out), "the self-check question is answered from the record");
});

// ---------- MI-013: cross-thread recall through the account ----------
test("MI-013: facts stated in one thread are applied in a new thread", () => {
  const { say, store } = makeWorld();
  say("u-xt", "a", "I'm a junior studying data science, and I'm targeting Seattle firms");
  const acct = store.accounts.get("u-xt") || {};
  assert.ok(acct.stated_facts && (acct.stated_facts.facts || []).some((f) => f.kind === "geography" && /Seattle/.test(f.value)), "the account carries the stated facts");
  const r = say("u-xt", "b", "what should I do first?");
  assert.ok(!isFallback(r.out));
  assert.match(r.out.reply, /Seattle|data science|junior/i);
});
test("MI-013: a correction in one thread is the fact a new thread recalls", () => {
  const { say } = makeWorld();
  say("u-xt3", "a", "I'm targeting Boston firms this cycle");
  say("u-xt3", "a", "actually make it Chicago not Boston");
  const r = say("u-xt3", "b", "quick reminder — where's my search focused?");
  assert.match(r.out.reply, /Chicago/);
  assert.ok(!/focused on Boston|targeting Boston/.test(r.out.reply));
});
test("MI-013: an offer stated in one thread is recap-able in a new thread", () => {
  const { say } = makeWorld();
  say("u-xt4", "a", "Lumen Grid offered me a data internship at $31 an hour, I have until Friday to decide");
  const r = say("u-xt4", "b", "recap my offer situation");
  assert.ok(!isFallback(r.out));
  assert.match(r.out.reply, /Lumen/);
});

// ---------- MI-013: multi-intent parts composed in the turn ----------
test("MI-013: a find + tracker-status message delivers BOTH parts in one reply", () => {
  const POOL = [{ id: "fx-1", title: "Data Analytics Intern", company: "Lumen Grid", location: "Seattle, WA", remote_terms: "hybrid", requirements: ["SQL", "Python", "data science coursework"], salary: "$30/hr", deadline: "2026-11-02", tradeoff: "" }];
  const { say } = makeWorld();
  const r = say("u-mi", "t", "find me data internships and also tell me what my tracker looks like", { postings: POOL });
  assert.match(r.out.reply, /tracker/i, "the tracker part is answered");
  assert.match(r.out.reply, /Lumen|Data Analytics/, "the find part is composed into the same reply, not just queued");
});

// ---------- MI-021: corrections replace, in facts and on rows ----------
test("MI-021: a corrected firm name replaces the target fact", () => {
  const { say } = makeWorld();
  say("u-cr", "t", "I want to network into Vantage Aero");
  let r = say("u-cr", "t", "not Vantage — I meant Halcyon Robotics");
  assert.ok(factsOf(r).some((f) => f.kind === "target_firm" && /Halcyon/.test(f.value)), `target is Halcyon (have: ${JSON.stringify(factsOf(r))})`);
  r = say("u-cr", "t", "ok build the plan for them");
  assert.match(r.out.reply, /Halcyon/);
});
test("MI-021: a corrected company renames the tracker row (comma shape)", () => {
  const { say } = makeWorld();
  say("u-cr2", "t", "log my application to Beacon Tutoring");
  const r = say("u-cr2", "t", "wait — it was Brightpath Health, not Beacon");
  assert.ok(rowsOf(r).some((x) => /Brightpath/.test(x.company || "")), `row renamed (rows: ${rowsOf(r).map((x) => x.company).join(", ")})`);
});

// ---------- MI-012 / LF-01a: continuations over active work ----------
test("LF-01a: 'so what's the move after that?' continues the active prep work", () => {
  const { say } = makeWorld();
  say("u-ct", "t", "give me a practice case question");
  const r = say("u-ct", "t", "so what's the move after that?");
  assert.ok(!isFallback(r.out), `answered from the active work (intent=${r.out.intent})`);
});
test("LF-01a: the tracker attention follow-up ranks the standing rows", () => {
  const { say } = makeWorld();
  say("u-ct3", "t", "I applied to Copperline Bank last week");
  say("u-ct3", "t", "what's the status of everything?");
  const r = say("u-ct3", "t", "and which of those needs my attention first?");
  assert.ok(!isFallback(r.out));
  assert.match(r.out.reply, /Copperline/);
});
