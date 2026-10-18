"use strict";
/* MI-123 (S1, Crew B — negotiation offer-capture; live on v228,
 * custom battery Block 1, 0/7; graded report:
 * upmore-crewa/docs/gauntlet/fb1321a-custom-blocks.md).
 *
 * The battery's user stated, in one turn: Lincoln International,
 * $52 an hour plus a $4,000 signing bonus, an answer by Friday. The
 * committed record instead held base_salary 85000 — the PRIOR offer
 * slot's amount, stale-carried into the new offer — stated_figure
 * "$4,000" (the bonus captured as the headline figure; the $52/hr
 * recorded nowhere), and updated_from_user_words set to a LATER
 * draft request's text (a draft ask consumed as an offer capture).
 * Every later turn then advised, judged and "recalled" on the wrong
 * numbers, and a plain-words revision fell to the generic fallback.
 * The same capture mechanism ate a prep mock-feedback turn (Block 2
 * t7): "the scale of the client base is a draw" matched the
 * offer-detail "base is" frame and the feedback ask was answered
 * with an offer-capture ack.
 *
 * This guard runs the DEPLOYED path — the real CareerHost with the
 * real chain modules and production commit semantics (the LF-08 /
 * LF-09 guard pattern) — and asserts the COMMITTED state per turn:
 * the account record and the thread snapshot's stores, never a
 * turn's in-memory ctx alone. The account starts with the battery's
 * precondition: a prior, unnamed offer's amount (85000) already
 * sits in the account's offer slot. The battery's seven negotiation
 * turns replay verbatim on one thread; the prep block's turns
 * replay on a second thread of the same account and only the t7
 * shape is asserted (its answer quality is the prep lane's bar —
 * the capture-hijack kill is this lane's).
 *
 * Bug law: PENDING-ALLOCATION rows in docs/bug-ledger.md +
 * docs/career/forbidden-rules.md (BUG/FR requested from the
 * registry per MI-093; none self-allocated).
 * Check: node --test tests/career-negotiation-capture.test.cjs
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW = Date.parse("2026-10-18T20:20:00.000Z");
const WHITELIST = ["paused", "preferred_locations", "erase", "stated_facts"];
const clone = (v) => JSON.parse(JSON.stringify(v));

/* The battery transcript turns, verbatim. */
const T1 = "Good news \u2014 Lincoln International just offered me a summer analyst internship: $52 an hour plus a $4,000 signing bonus. They want my answer by Friday.";
const T2 = "I've never negotiated anything before. What's my actual strategy here \u2014 what do I have leverage on, and what should I not touch?";
const T3 = "OK, draft the counter email for me. I want to ask for $56 an hour and keep the signing bonus as is. Just the draft \u2014 don't send anything.";
const T4 = "Hmm, $56 feels pushy. Make it $54 an hour instead, and add a request to start June 8 instead of June 1. Everything else stays.";
const T5 = "If they come back and say no to all of it, is the original offer still worth taking? Be honest with me.";
const T6 = "Quick check before I do anything: what's the deadline they gave me, what was the original offer, and what exactly is my final counter?";
const T7 = "Pull it together \u2014 give me the whole negotiation plan in one place so I can work from it.";
const P1 = "I have a first-round interview at Deloitte next week for a consulting internship. Help me prep \u2014 where do I start?";
const P2 = "Give me a realistic practice case question, the kind Deloitte actually asks.";
const P3 = "My approach: I'd clarify the objective first, then segment revenue by service line and geography to find where the drop is concentrated, and separate volume from price before looking at costs. How's that \u2014 critique it properly.";
const P4 = "What behavioral questions should I expect, and what do they actually want to hear?";
const P5 = "What should I know about Deloitte specifically that I can work into my answers? Not generic consulting stuff \u2014 Deloitte.";
const P6 = "Let's do a quick mock. Ask me one question at a time. Start with 'Why Deloitte?'";
const P7 = "Because it's not one national pipeline \u2014 I like that hiring sits with the service lines, so I'd be staffed on real client work in a specific practice instead of a generalist pool. And the scale of the client base is a draw. \u2026How was that answer?";

/* One world, one account, two threads — the battery's shape. The
 * account map IS the committed account record (career_watch_kv
 * 'career:account' in production); the per-thread snapshot map IS
 * the committed thread record (agent_flow_state). */
function makeWorld() {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const store = { accounts: new Map(), threads: new Map(), watches: new Map() };
  let n = 0;
  const say = (userId, threadId, text) => {
    n += 1;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: [] });
    const out = host.runTurn(text, ctx);
    const snap = host.extractSnapshot(ctx);
    store.threads.set(threadId, snap);
    if (ctx._hostPatch) {
      for (const k of Object.keys(ctx._hostPatch)) assert.ok(WHITELIST.includes(k), `commit patch key "${k}" is outside the career_host_commit whitelist — the database would reject this commit`);
      if (ctx._hostPatch.erase === true) store.accounts.set(userId, { paused: true });
      else { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    }
    return { out, ctx, snap, reply: String((out && out.reply) || "") };
  };
  const accountOffer = (userId) => {
    const a = store.accounts.get(userId) || {};
    return (a.stated_facts && a.stated_facts.offer) || null;
  };
  return { host, store, say, accountOffer };
}

const W = makeWorld();
const U = "u-mi123-battery";
/* The battery's precondition: a PRIOR offer (unnamed, $85,000)
 * already occupies the account's offer slot. */
W.store.accounts.set(U, { paused: false, stated_facts: { facts: [], offer: { firm: null, amount: 85000, deadline: null, role: null }, updated_at: "2026-10-18T00:00:00.000Z" } });

const negOf = (snap) => { const ts = snap.stores && snap.stores.trackStore; return (ts && ts._careerThread && ts._careerThread.negotiation) || {}; };
const offerOf = (snap) => (snap.stores && snap.stores.offer) || {};
const NO_STALE = (reply) => !/85,?000/.test(reply);

test("NEG-1 (battery t1): the new named offer is recorded in its own figures — hourly as hourly, bonus as bonus, nothing carried from the prior offer", () => {
  const r = W.say(U, "neg", T1);
  const neg = negOf(r.snap);
  const offer = offerOf(r.snap);
  const acct = W.accountOffer(U);
  assert.ok(NO_STALE(r.reply), `the capture reply must never quote the prior offer's $85,000: ${r.reply}`);
  assert.ok(r.reply.includes("$52"), `the ack quotes the stated hourly rate: ${r.reply}`);
  assert.ok(r.reply.includes("$4,000") && /signing bonus/i.test(r.reply), `the ack names the signing bonus as a bonus: ${r.reply}`);
  assert.equal(neg.firm, "Lincoln International", "the thread record names the firm the user named");
  assert.equal(neg.hourly, 52, "the hourly rate is on the record AS an hourly rate");
  assert.equal(neg.signing, 4000, "the signing bonus is on the record AS a bonus");
  assert.ok(neg.amount == null, `no annual amount the user never stated may sit on the new offer's record (got ${neg.amount})`);
  assert.equal(neg.deadline, "friday", "the stated deadline is recorded");
  assert.ok(offer.base_salary == null, `the offer store holds no base salary for an hourly offer (got ${offer.base_salary})`);
  assert.equal(offer.hourly_rate, 52, "the offer store carries the hourly rate");
  assert.equal(offer.signing_bonus, 4000, "the offer store carries the signing bonus as a bonus");
  assert.ok(!JSON.stringify(offer).includes("85000"), "the prior offer's amount is nowhere in the committed offer store");
  assert.equal(acct && acct.firm, "Lincoln International", "the account offer slot now names the new offer's firm");
  assert.ok(!acct || acct.amount == null, `the account offer slot carries no stale amount (got ${acct && acct.amount})`);
});

test("NEG-2 (battery t2): the strategy runs on the stated figures, never the stale ones", () => {
  const r = W.say(U, "neg", T2);
  assert.ok(NO_STALE(r.reply), `no $85,000 in the strategy: ${r.reply}`);
  assert.ok(r.reply.includes("$52"), `the strategy names the stated hourly rate: ${r.reply}`);
});

test("NEG-3 (battery t3): a draft ask produces the counter draft and records the counter — it is not consumed as an offer update", () => {
  const r = W.say(U, "neg", T3);
  const neg = negOf(r.snap);
  const offer = offerOf(r.snap);
  assert.ok(!/recorded on the offer|offer updated/i.test(r.reply), `a draft ask is not an offer capture: ${r.reply}`);
  assert.ok(r.reply.includes("Subject:"), `the draft itself is delivered: ${r.reply}`);
  assert.ok(r.reply.includes("$56"), `the draft asks for the counter figure the user named: ${r.reply}`);
  assert.ok(neg.counter && neg.counter.hourly === 56, `the named counter is on the record (got ${JSON.stringify(neg.counter)})`);
  assert.ok(offer.updated_from_user_words !== T3, "the draft request's words are never written onto the offer record");
  assert.equal(neg.hourly, 52, "the original offer's figures survive the draft turn untouched");
  assert.equal(neg.signing, 4000, "the signing bonus survives the draft turn untouched");
});

test("NEG-4 (battery t4): a plain-words revision updates exactly the revised fields — never the generic fallback", () => {
  const r = W.say(U, "neg", T4);
  const neg = negOf(r.snap);
  assert.ok(!/didn'?t catch that/i.test(r.reply), `a revision is never silently dropped to the fallback: ${r.reply}`);
  assert.ok(r.reply.includes("$54"), `the revision is acknowledged in the user's units: ${r.reply}`);
  assert.ok(neg.counter && neg.counter.hourly === 54, `the counter figure is revised on the record (got ${JSON.stringify(neg.counter)})`);
  assert.ok(neg.counter && String(neg.counter.start || "").includes("June 8"), `the added start-date request is recorded (got ${JSON.stringify(neg.counter)})`);
  assert.equal(neg.hourly, 52, "the original offer is not revised by a counter revision");
  assert.equal(neg.signing, 4000, "the signing bonus is kept, as the user said");
});

test("NEG-5 (battery t5): the worth-taking judgment runs on the stated figures", () => {
  const r = W.say(U, "neg", T5);
  assert.ok(NO_STALE(r.reply), `no $85,000 in the judgment: ${r.reply}`);
  assert.ok(r.reply.includes("$52"), `the judgment names the stated hourly rate: ${r.reply}`);
});

test("NEG-6 (battery t6): recall answers deadline, original offer and final counter from the record — all three", () => {
  const r = W.say(U, "neg", T6);
  assert.ok(NO_STALE(r.reply), `no $85,000 in the recall: ${r.reply}`);
  assert.ok(/friday/i.test(r.reply), `the deadline is answered from the record: ${r.reply}`);
  assert.ok(r.reply.includes("$52") && r.reply.includes("$4,000"), `the original offer is answered as stated: ${r.reply}`);
  assert.ok(r.reply.includes("$54") && r.reply.includes("June 8"), `the final counter is answered as recorded: ${r.reply}`);
});

test("NEG-7 (battery t7): the one-place plan still runs on the stated figures", () => {
  const r = W.say(U, "neg", T7);
  assert.ok(NO_STALE(r.reply), `no $85,000 in the plan: ${r.reply}`);
  assert.ok(r.reply.includes("$52"), `the plan names the stated hourly rate: ${r.reply}`);
});

test("NEG-8 (prep t7 shape): a mock-feedback turn is never consumed as an offer capture and writes no offer state", () => {
  W.say(U, "prep-neg", P1);
  W.say(U, "prep-neg", P2);
  W.say(U, "prep-neg", P3);
  W.say(U, "prep-neg", P4);
  W.say(U, "prep-neg", P5);
  const pre = W.say(U, "prep-neg", P6);
  const offerBefore = JSON.stringify(offerOf(pre.snap));
  const accountBefore = JSON.stringify(W.accountOffer(U));
  const r = W.say(U, "prep-neg", P7);
  assert.ok(!/recorded on the offer|offer updated/i.test(r.reply), `a feedback ask is not an offer capture: ${r.reply}`);
  assert.equal(JSON.stringify(offerOf(r.snap)), offerBefore, "the turn writes nothing onto the offer store");
  assert.equal(JSON.stringify(W.accountOffer(U)), accountBefore, "the turn writes nothing onto the account offer slot");
});
