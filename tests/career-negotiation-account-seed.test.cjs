"use strict";
/* MI-123 RESIDUE (S1, MI-123 account-rebase lane; live on v229
 * ad53453, verified 2026-10-19 — record:
 * the deployed line's docs/gauntlet/ad53453.md).
 *
 * The v229 negotiation fix re-based the offer record only when the
 * new report's identity DIFFERED from the record it landed on. The
 * live gauntlet account's seeded prior offer names the SAME firm as
 * the battery's new report — the account slot entering Block 1 was
 * {firm: "Lincoln International", amount: 85000, deadline: "friday",
 * role: "summer analyst internship"}, inherited from an earlier
 * thread's negotiation — so the report MERGED into the seeded
 * record instead of re-basing it. The replies were right (they run
 * on the kind-separated figures), but every COMMITTED level kept
 * the stale annual figure the user never stated in that thread:
 *
 *   thread negotiation record: amount: 85000 (fromAccount: true)
 *   offer store:               base_salary: 85000
 *   account slot:              amount: 85000 (never nulled)
 *
 * and the residue had a live reader: a later fresh thread's draft
 * ask bound to the account's negotiation record and quoted
 * "$85,000 base at Lincoln International" (Probe D of the v229
 * verification — wrong thread, stale figure).
 *
 * This guard seeds the world EXACTLY as the live account stood —
 * the account slot above, with every fresh thread seeded from it by
 * the real host — then replays the battery's Block 1 verbatim and
 * a Probe-D-shaped draft continuation, asserting the COMMITTED
 * thread record, offer store AND account slot after the turns:
 * the amount/base salary is null (or the report's own figure) at
 * every level, and 85000 appears in NO committed record and NO
 * reply. Two continuation witnesses close the guard: a same-offer
 * detail statement still MERGES (it is not a new report), and a
 * firmless new report in a fresh thread never inherits the seeded
 * firm or amount (TN-1a).
 *
 * Runs the DEPLOYED path — the real CareerHost with the real chain
 * modules and production commit semantics (the LF-08 / LF-09 /
 * negotiation-capture guard pattern).
 *
 * Bug law: PENDING-ALLOCATION rows in docs/bug-ledger.md +
 * docs/career/forbidden-rules.md (BUG/FR requested from the
 * registry per MI-093; none self-allocated).
 * Check: node --test tests/career-negotiation-account-seed.test.cjs
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW = Date.parse("2026-10-19T19:00:00.000Z");
const WHITELIST = ["paused", "preferred_locations", "erase", "stated_facts"];
const clone = (v) => JSON.parse(JSON.stringify(v));

/* The battery transcript turns, verbatim (Block 1 of the custom
 * battery; the same strings as tests/career-negotiation-capture.test.cjs). */
const T1 = "Good news \u2014 Lincoln International just offered me a summer analyst internship: $52 an hour plus a $4,000 signing bonus. They want my answer by Friday.";
const T2 = "I've never negotiated anything before. What's my actual strategy here \u2014 what do I have leverage on, and what should I not touch?";
const T3 = "OK, draft the counter email for me. I want to ask for $56 an hour and keep the signing bonus as is. Just the draft \u2014 don't send anything.";
const T4 = "Hmm, $56 feels pushy. Make it $54 an hour instead, and add a request to start June 8 instead of June 1. Everything else stays.";
const T5 = "If they come back and say no to all of it, is the original offer still worth taking? Be honest with me.";
const T6 = "Quick check before I do anything: what's the deadline they gave me, what was the original offer, and what exactly is my final counter?";
const T7 = "Pull it together \u2014 give me the whole negotiation plan in one place so I can work from it.";
/* Probe D of the v229 verification, verbatim. */
const PD1 = "Help me network into healthcare consulting";
const PD2 = "draft the first email for me";

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
const U = "u-mi123-seeded-account";
/* The world EXACTLY as the live account stood entering the v229
 * verification's Block 1: the account's offer slot is a PRIOR
 * Lincoln International negotiation's record — SAME firm as the
 * new report, an annual amount the new report never states. */
W.store.accounts.set(U, { paused: false, stated_facts: { facts: [], offer: { firm: "Lincoln International", amount: 85000, deadline: "friday", role: "summer analyst internship" }, updated_at: "2026-10-19T00:00:00.000Z" } });

const negOf = (snap) => { const ts = snap.stores && snap.stores.trackStore; return (ts && ts._careerThread && ts._careerThread.negotiation) || {}; };
const offerOf = (snap) => (snap.stores && snap.stores.offer) || {};
const NO_STALE = (reply) => !/85,?000/.test(reply);

/* The three committed levels, after any turn: no level may carry
 * the seeded 85000 — as a value, or anywhere in its record. */
const assertLevelsClean = (snap, label) => {
  const neg = negOf(snap);
  const offer = offerOf(snap);
  const acct = W.accountOffer(U);
  assert.ok(neg.amount == null, `${label}: the committed thread record carries no annual amount the report never stated (got ${neg.amount})`);
  assert.ok(!JSON.stringify(neg).includes("85000"), `${label}: 85000 appears nowhere in the committed thread record (record: ${JSON.stringify(neg)})`);
  assert.ok(offer.base_salary == null, `${label}: the committed offer store holds no base salary the report never stated (got ${offer.base_salary})`);
  assert.ok(!JSON.stringify(offer).includes("85000"), `${label}: 85000 appears nowhere in the committed offer store (store: ${JSON.stringify(offer)})`);
  assert.ok(acct && acct.amount == null, `${label}: the committed account slot carries no stale amount (got ${acct && acct.amount})`);
  assert.ok(!JSON.stringify(acct || {}).includes("85000"), `${label}: 85000 appears nowhere in the committed account slot (slot: ${JSON.stringify(acct)})`);
};

test("SEED-0 (precondition): the host seeds every fresh thread from the account slot — firm, stale amount and lineage", () => {
  const ctx = W.host.createTurnCtx({ userId: U, threadId: "seedcheck", now: NOW, accountPersistence: true, snapshot: null, account: clone(W.store.accounts.get(U) || {}), watchState: {}, postings: [] });
  assert.equal(ctx.negotiationThread && ctx.negotiationThread.firm, "Lincoln International", "the seed carries the prior offer's firm");
  assert.equal(ctx.negotiationThread && ctx.negotiationThread.amount, 85000, "the seed carries the prior offer's amount — the residue this guard exists to kill");
  assert.equal(ctx.negotiationThread && ctx.negotiationThread.fromAccount, true, "the seed is marked as account lineage, not this conversation's report");
  assert.equal(ctx.offer && ctx.offer.base_salary, 85000, "the offer store is seeded with the same stale figure");
});

test("SEED-1 (battery t1, same firm as the seed): the new report re-bases EVERY level — thread record, offer store, account slot", () => {
  const r = W.say(U, "neg", T1);
  const neg = negOf(r.snap);
  const offer = offerOf(r.snap);
  const acct = W.accountOffer(U);
  assert.ok(NO_STALE(r.reply), `the capture reply must never quote the seeded $85,000: ${r.reply}`);
  assert.ok(r.reply.includes("$52"), `the ack quotes the stated hourly rate: ${r.reply}`);
  assert.ok(r.reply.includes("$4,000") && /signing bonus/i.test(r.reply), `the ack names the signing bonus as a bonus: ${r.reply}`);
  assert.equal(neg.firm, "Lincoln International", "the thread record names the firm the user named");
  assert.equal(neg.hourly, 52, "the hourly rate is on the record AS an hourly rate");
  assert.equal(neg.signing, 4000, "the signing bonus is on the record AS a bonus");
  assert.ok(neg.amount == null, `the seeded annual amount is GONE from the thread record, not merged past (got ${neg.amount})`);
  assert.ok(!neg.fromAccount, "the record is this conversation's own report now — the account-seed lineage is cleared");
  assert.equal(neg.deadline, "friday", "the stated deadline is recorded");
  assert.ok(offer.base_salary == null, `the offer store holds no base salary for an hourly offer (got ${offer.base_salary})`);
  assert.equal(offer.hourly_rate, 52, "the offer store carries the hourly rate");
  assert.equal(offer.signing_bonus, 4000, "the offer store carries the signing bonus as a bonus");
  assert.equal(acct && acct.firm, "Lincoln International", "the account slot names the new report's firm");
  assert.ok(acct && acct.amount == null, `the account slot's stale amount is nulled by the report, not carried (got ${acct && acct.amount})`);
  assert.equal(acct && acct.deadline, "friday", "the account slot carries the report's deadline");
  assertLevelsClean(r.snap, "after t1");
});

test("SEED-2 (battery t2): the strategy runs on the stated figures, and no level regains the stale figure", () => {
  const r = W.say(U, "neg", T2);
  assert.ok(NO_STALE(r.reply), `no $85,000 in the strategy: ${r.reply}`);
  assert.ok(r.reply.includes("$52"), `the strategy names the stated hourly rate: ${r.reply}`);
  assertLevelsClean(r.snap, "after t2");
});

test("SEED-3 (battery t3): the counter draft is produced and the counter recorded — the offer's own figures untouched", () => {
  const r = W.say(U, "neg", T3);
  const neg = negOf(r.snap);
  assert.ok(!/recorded on the offer|offer updated/i.test(r.reply), `a draft ask is not an offer capture: ${r.reply}`);
  assert.ok(r.reply.includes("Subject:"), `the draft itself is delivered: ${r.reply}`);
  assert.ok(r.reply.includes("$56"), `the draft asks for the counter figure the user named: ${r.reply}`);
  assert.ok(NO_STALE(r.reply), `no $85,000 in the draft turn: ${r.reply}`);
  assert.ok(neg.counter && neg.counter.hourly === 56, `the named counter is on the record (got ${JSON.stringify(neg.counter)})`);
  assert.equal(neg.hourly, 52, "the original offer's figures survive the draft turn untouched");
  assert.equal(neg.signing, 4000, "the signing bonus survives the draft turn untouched");
  assertLevelsClean(r.snap, "after t3");
});

test("SEED-4 (battery t4): the plain-words revision updates exactly the revised fields", () => {
  const r = W.say(U, "neg", T4);
  const neg = negOf(r.snap);
  assert.ok(!/didn'?t catch that/i.test(r.reply), `a revision is never silently dropped to the fallback: ${r.reply}`);
  assert.ok(r.reply.includes("$54"), `the revision is acknowledged in the user's units: ${r.reply}`);
  assert.ok(neg.counter && neg.counter.hourly === 54, `the counter figure is revised on the record (got ${JSON.stringify(neg.counter)})`);
  assert.ok(neg.counter && String(neg.counter.start || "").includes("June 8"), `the added start-date request is recorded (got ${JSON.stringify(neg.counter)})`);
  assert.equal(neg.hourly, 52, "the original offer is not revised by a counter revision");
  assertLevelsClean(r.snap, "after t4");
});

test("SEED-5 (battery t5): the worth-taking judgment runs on the stated figures", () => {
  const r = W.say(U, "neg", T5);
  assert.ok(NO_STALE(r.reply), `no $85,000 in the judgment: ${r.reply}`);
  assert.ok(r.reply.includes("$52"), `the judgment names the stated hourly rate: ${r.reply}`);
  assertLevelsClean(r.snap, "after t5");
});

test("SEED-6 (battery t6): recall answers deadline, original offer and final counter from the record — all three", () => {
  const r = W.say(U, "neg", T6);
  assert.ok(NO_STALE(r.reply), `no $85,000 in the recall: ${r.reply}`);
  assert.ok(/friday/i.test(r.reply), `the deadline is answered from the record: ${r.reply}`);
  assert.ok(r.reply.includes("$52") && r.reply.includes("$4,000"), `the original offer is answered as stated: ${r.reply}`);
  assert.ok(r.reply.includes("$54") && r.reply.includes("June 8"), `the final counter is answered as recorded: ${r.reply}`);
  assertLevelsClean(r.snap, "after t6");
});

test("SEED-7 (battery t7): the one-place plan runs on the stated figures; the account slot ends as the report's own record", () => {
  const r = W.say(U, "neg", T7);
  const acct = W.accountOffer(U);
  assert.ok(NO_STALE(r.reply), `no $85,000 in the plan: ${r.reply}`);
  assert.ok(r.reply.includes("$52"), `the plan names the stated hourly rate: ${r.reply}`);
  assertLevelsClean(r.snap, "after t7");
  assert.deepEqual(
    { firm: acct && acct.firm, amount: acct && acct.amount != null ? acct.amount : null, deadline: acct && acct.deadline, role: acct && acct.role },
    { firm: "Lincoln International", amount: null, deadline: "friday", role: "summer analyst internship" },
    `the account slot after Block 1 is the NEW report's record — same firm, the report's own fields, no inherited amount (slot: ${JSON.stringify(acct)})`
  );
});

test("SEED-8 (Probe D shape): a draft ask in a FRESH thread never quotes the stale figure — the account record it reads is clean", () => {
  W.say(U, "probe-d", PD1);
  const r = W.say(U, "probe-d", PD2);
  assert.ok(r.reply.includes("Subject:"), `a draft is served on the continuation turn: ${r.reply}`);
  assert.ok(NO_STALE(r.reply), `the draft continuation must never quote the prior offer's $85,000 (the live Probe D failure): ${r.reply}`);
  const offer = offerOf(r.snap);
  assert.ok(!JSON.stringify(offer).includes("85000"), `the fresh thread's committed offer store carries no seeded stale figure (store: ${JSON.stringify(offer)})`);
  const acct = W.accountOffer(U);
  assert.ok(acct && acct.amount == null, `the account slot stays clean through the continuation (got ${acct && acct.amount})`);
});

test("SEED-9 (continuation witness): a same-offer DETAIL statement merges — it is not a new report and re-bases nothing", () => {
  const r = W.say(U, "neg", "Correction on the same offer: signing bonus of $4,500 instead.");
  const neg = negOf(r.snap);
  const offer = offerOf(r.snap);
  assert.ok(NO_STALE(r.reply), `no $85,000 in the detail turn: ${r.reply}`);
  assert.equal(neg.signing, 4500, `the detail updates the field it states (got ${neg.signing})`);
  assert.equal(neg.hourly, 52, "the fields the detail does not mention survive the merge — the offer was NOT re-based");
  assert.equal(neg.firm, "Lincoln International", "the standing offer's firm survives a detail statement");
  assert.ok(neg.counter && neg.counter.hourly === 54, "the recorded counter survives a detail statement");
  assert.equal(offer.signing_bonus, 4500, "the offer store takes the corrected bonus");
  assertLevelsClean(r.snap, "after the detail turn");
});

test("SEED-10 (firmless witness): a new report naming NO firm never inherits the seeded firm or amount", () => {
  const r = W.say(U, "neg2", "I got an offer \u2014 $60 an hour plus a $5,000 signing bonus. They want my answer by Monday.");
  const neg = negOf(r.snap);
  const offer = offerOf(r.snap);
  const acct = W.accountOffer(U);
  assert.ok(NO_STALE(r.reply), `no $85,000 in the firmless report's reply: ${r.reply}`);
  assert.ok(neg.firm == null, `an unnamed report records no firm — the seeded Lincoln is never inherited onto it (got ${neg.firm})`);
  assert.ok(neg.amount == null, `no annual amount rides into the firmless report's record (got ${neg.amount})`);
  assert.equal(neg.hourly, 60, "the report's own hourly rate is recorded");
  assert.equal(neg.signing, 5000, "the report's own signing bonus is recorded");
  assert.equal(neg.deadline, "monday", "the report's own deadline is recorded");
  assert.ok(offer.base_salary == null, `the offer store holds no base salary (got ${offer.base_salary})`);
  assert.ok(!offer.company, `the offer store names no company the report never named (got ${offer.company})`);
  assert.ok(acct && acct.firm == null, `the account slot follows the report — no firm stands that this report did not name (got ${acct && acct.firm})`);
  assert.ok(acct && acct.amount == null, `the account slot carries no amount (got ${acct && acct.amount})`);
  assert.equal(acct && acct.deadline, "monday", "the account slot carries the report's deadline");
});
