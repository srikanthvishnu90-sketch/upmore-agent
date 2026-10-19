"use strict";
/* PROBE D DRAFT-BINDING (LF-02 class; PROBE D DRAFT-BINDING lane,
 * 2026-10-19, branch fix/probe-d-draft-binding; live on v229
 * ad53453 AND v230 6bc96af — records:
 * ~/workspace/upmore-crewa/docs/gauntlet/ad53453.md +
 * docs/gauntlet/6bc96af.md; transcripts
 * ~/workspace/crewa-live/custom-blocks-v229-part2-20261019-183601.json
 * + custom-blocks-v230-20261019-221115.json).
 *
 * The custom battery's Probe D, verbatim:
 *   t1 "Help me network into healthcare consulting"  → a campaign
 *      plan is composed FOR THIS THREAD (healthcare consulting
 *      firms, the universe the user named).
 *   t2 "draft the first email for me"                → the product
 *      served the ACCOUNT's held counter-offer draft — "The
 *      counter email, written out… Subject: summer analyst
 *      internship — Lincoln International" — and composed NO
 *      networking draft at all. On v229 the served draft also
 *      quoted the stale "$85,000 base at Lincoln International"
 *      (that consequence died with the MI-123 residue fix, live
 *      v230); the wrong-source BINDING is unchanged on v230, and
 *      because the flow never reaches the plan's draft composer,
 *      the shipped subject fix was unprovable on this surface.
 *
 * Mechanism (142 + career_host): the host seeds EVERY fresh
 * thread's ctx from the account record — ctx.negotiationThread
 * {firm, amount, deadline, role, fromAccount: true} and ctx.offer
 * {company, base_salary} — whenever the account carries a
 * committed negotiation record. In the drafting dispatch block,
 * handleCounterDraftAsk runs BEFORE handleDraftContinuation, and
 * its only context gate asked whether ANY negotiation context
 * exists on ctx — firm/amount/deadline on the thread record, or
 * company/base/hourly on the offer store. The account seed alone
 * satisfies that gate, so a generic draft ask ("draft the first
 * email for me" — draft verb + "email", no counter/extension
 * naming) in ANY thread of an account that has ever negotiated is
 * claimed by the counter-draft branch and delegated to
 * handleNegotiation, which serves the counter email. The thread's
 * own live artifact — the campaign plan composed one turn
 * earlier, whose draft continuation owns exactly this ask's
 * vocabulary ("the first email") — never gets the turn.
 *
 * The distinguishing signal: WHAT THE ASK NAMES, and WHAT THIS
 * THREAD IS BUILDING. An ask that names the counter or the
 * extension is the negotiation's, in any thread — the user said
 * which draft. A generic first-email ask belongs to the artifact
 * this conversation is building: when a campaign plan stands on
 * THIS thread, the plan's draft continuation owns it, and the
 * account merely HAVING a negotiation record must not claim it.
 * In a thread with no plan, the counter branch behaves exactly
 * as before (the account seed remains a legitimate ground for a
 * draft ask the thread gives no other home).
 *
 * This guard seeds the world EXACTLY as the live gauntlet
 * account stood entering the v230 verification (its stated
 * facts + the pre-Block-1 offer slot, stale 85000 included),
 * replays Block 1's capture + counter turns (which re-base the
 * account to the post-v230 shape), then the Probe D journey
 * verbatim, asserting the SERVED draft and the COMMITTED records
 * — and closes with the controls: the counter draft still serves
 * in its own negotiation thread, an explicit counter ask still
 * serves cross-thread on the account seed alone, and an explicit
 * counter ask inside the plan thread still wins over the plan.
 *
 * Runs the DEPLOYED path — the real CareerHost with the real
 * chain modules and production commit semantics (the LF-08 /
 * LF-09 / negotiation-capture / account-seed guard pattern).
 *
 * Bug law: PENDING-ALLOCATION rows in docs/bug-ledger.md +
 * docs/career/forbidden-rules.md (BUG/FR requested from the
 * registry per MI-093; none self-allocated).
 * Check: node --test tests/career-probe-d-draft-binding.test.cjs
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW = Date.parse("2026-10-19T22:00:00.000Z");
const WHITELIST = ["paused", "preferred_locations", "erase", "stated_facts"];
const clone = (v) => JSON.parse(JSON.stringify(v));

/* Verbatim turns. T1/T3: Block 1 of the custom battery (the same
 * strings as tests/career-negotiation-capture.test.cjs). PD1/PD2:
 * Probe D of the v229/v230 verifications, verbatim. */
const T1 = "Good news \u2014 Lincoln International just offered me a summer analyst internship: $52 an hour plus a $4,000 signing bonus. They want my answer by Friday.";
const T3 = "OK, draft the counter email for me. I want to ask for $56 an hour and keep the signing bonus as is. Just the draft \u2014 don't send anything.";
const PD1 = "Help me network into healthcare consulting";
const PD2 = "draft the first email for me";
const FIXED_SUBJECT = "Subject: Sophomore interested in healthcare consulting firms \u2014 15 minutes?";

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
    const aws = snap.stores && snap.stores.alertWatchState;
    const wpk = `career:watch-profile:${userId}`;
    if (aws && aws[wpk]) store.watches.set(userId, { [wpk]: clone(aws[wpk]) });
    return { out, ctx, snap, reply: String((out && out.reply) || "") };
  };
  const accountOffer = (userId) => {
    const a = store.accounts.get(userId) || {};
    return (a.stated_facts && a.stated_facts.offer) || null;
  };
  const committedPlan = (threadId) => {
    const snap = store.threads.get(threadId);
    return (snap && snap.stores && snap.stores.plan) || null;
  };
  const negOf = (snap) => { const ts = snap.stores && snap.stores.trackStore; return (ts && ts._careerThread && ts._careerThread.negotiation) || {}; };
  return { host, store, say, accountOffer, committedPlan, negOf };
}

const W = makeWorld();
const U = "u-probed-binding";
/* The world EXACTLY as the live gauntlet account stood entering
 * the v230 verification (crewa-live transcript, db.account_before):
 * the four durable stated facts, and the account offer slot still
 * carrying the PRIOR negotiation's annual figure — Block 1's first
 * turn is what re-bases it to the post-v230 shape. */
W.store.accounts.set(U, {
  paused: false,
  stated_facts: {
    facts: [
      { kind: "year", value: "sophomore", evidence: "I am a sophomore", at: "2026-10-18T20:16:30.987Z" },
      { kind: "geography", value: "Denver", evidence: "in Denver", at: "2026-10-18T20:14:30.135Z" },
      { kind: "majors", value: "economics", evidence: "studying economics", at: "2026-10-17T15:34:07.269Z" },
      { kind: "target_firm", value: "Meridian Capital", evidence: "targeting Meridian Capital", at: "2026-10-17T16:01:55.936Z" },
    ],
    offer: { firm: "Lincoln International", amount: 85000, deadline: "friday", role: "summer analyst internship" },
    updated_at: "2026-10-19T00:00:00.000Z",
  },
});

test("BIND-0 (precondition): the host seeds every fresh thread from the account's negotiation record — the binding's raw material", () => {
  const ctx = W.host.createTurnCtx({ userId: U, threadId: "seedcheck", now: NOW, accountPersistence: true, snapshot: null, account: clone(W.store.accounts.get(U) || {}), watchState: {}, postings: [] });
  assert.equal(ctx.negotiationThread && ctx.negotiationThread.firm, "Lincoln International", "the seed carries the account's negotiation firm into a thread that never mentioned it");
  assert.equal(ctx.negotiationThread && ctx.negotiationThread.fromAccount, true, "the seeded record is marked as account lineage");
  assert.equal(ctx.offer && ctx.offer.company, "Lincoln International", "the offer store is seeded from the same account record");
});

test("BIND-1 (battery t1): the new report re-bases the account to the post-v230 shape — the seed Probe D will inherit", () => {
  const r = W.say(U, "neg", T1);
  const acct = W.accountOffer(U);
  assert.ok(r.reply.includes("$52"), `the ack quotes the stated hourly rate: ${r.reply}`);
  assert.ok(!/85,?000/.test(r.reply), `no stale figure in the capture reply: ${r.reply}`);
  assert.equal(acct && acct.firm, "Lincoln International", "the account slot names the report's firm");
  assert.ok(acct && acct.amount == null, `the account slot's stale amount is nulled by the report (got ${acct && acct.amount}) — this is the post-v230 committed shape Probe D inherits`);
  assert.equal(acct && acct.deadline, "friday", "the account slot carries the report's deadline");
});

test("BIND-2 (battery t3, control part 1): in the NEGOTIATION thread the counter draft serves and the counter is recorded", () => {
  const r = W.say(U, "neg", T3);
  const neg = W.negOf(r.snap);
  assert.equal(r.out.intent, "negotiation_draft", `the counter-draft ask in its own thread is a negotiation draft (got ${r.out.intent})`);
  assert.ok(r.reply.includes("Subject:"), `the draft itself is delivered: ${r.reply}`);
  assert.ok(r.reply.includes("$56"), `the draft asks for the counter figure the user named: ${r.reply}`);
  assert.ok(neg.counter && neg.counter.hourly === 56, `the named counter is on the record (got ${JSON.stringify(neg.counter)})`);
});

test("BIND-3 (Probe D t1): the plan is composed on the thread's own record — the artifact the next turn's draft belongs to", () => {
  W.say(U, "probe-d", PD1);
  const plan = W.committedPlan("probe-d");
  assert.ok(plan, "precondition: the plan persisted on the committed thread record");
  assert.equal(plan.kind, "campaign_plan", "the thread's live artifact is a campaign plan");
  assert.equal(plan.firm_set, null, "a category plan carries no firm_set — its universe is the category label");
  assert.equal(plan.target.proposed_default.label, "healthcare consulting firms", "the plan's universe is the one the user named");
});

test("BIND-4 (Probe D t2 — THE BUG): a generic draft ask in a PLAN thread serves the PLAN's networking draft, never the account's counter draft", () => {
  const r = W.say(U, "probe-d", PD2);
  assert.equal(r.out.intent, "outreach_draft", `the first-email ask on a plan thread is the plan's draft continuation (got ${r.out.intent}: ${r.reply.slice(0, 200)})`);
  assert.ok(r.reply.includes(FIXED_SUBJECT), `the served draft carries the plan's own subject, as fixed (reply: ${r.reply.slice(0, 400)})`);
  const plan = W.committedPlan("probe-d");
  assert.ok(plan && plan.draft, "the draft is held on the committed plan");
  assert.equal(plan.draft.status, "held_sample", "the plan draft is held as a sample");
  assert.equal(plan.draft.sends, 0, "a held sample sends nothing");
  assert.equal(plan.draft.text.split("\n")[0], FIXED_SUBJECT, `the COMMITTED draft's subject is the plan's universe (got ${plan.draft.text.split("\n")[0]})`);
  for (const bad of [/counter/i, /Lincoln International/, /\$52\b/, /85,?000/, /signing bonus/i, /summer analyst internship/i]) {
    assert.ok(!bad.test(r.reply), `no negotiation content in a plan thread's draft reply — ${bad} must not appear (reply: ${r.reply.slice(0, 400)})`);
  }
  const neg = W.negOf(r.snap);
  assert.ok(!neg.counter, `the plan thread's draft turn wrote NO counter onto its seeded negotiation record (got ${JSON.stringify(neg.counter)})`);
  assert.ok(neg.topic !== "counter", "the plan thread's negotiation seed was not claimed as a counter topic");
});

test("BIND-5 (control part 2): back in the NEGOTIATION thread, the counter draft still serves — on the recorded counter", () => {
  const r = W.say(U, "neg", "draft the counter email for me");
  assert.equal(r.out.intent, "negotiation_draft", `the counter ask in the negotiation thread stays a negotiation draft (got ${r.out.intent})`);
  assert.ok(r.reply.includes("Lincoln International"), `the counter draft runs on the thread's own offer: ${r.reply.slice(0, 300)}`);
  assert.ok(r.reply.includes("$56"), `the counter draft asks the recorded counter figure: ${r.reply.slice(0, 400)}`);
  assert.ok(!r.reply.includes("healthcare consulting"), "the negotiation thread never serves the plan's draft");
});

test("BIND-6 (explicit cross-thread control): an ask NAMING the counter serves it in a fresh thread, on the account seed alone", () => {
  const r = W.say(U, "neg-x", "draft the counter email for the Lincoln offer");
  assert.equal(r.out.intent, "negotiation_draft", `an explicit counter ask is the negotiation's in any thread (got ${r.out.intent})`);
  assert.ok(r.reply.includes("Lincoln International"), `the explicit continuation runs on the account's record: ${r.reply.slice(0, 300)}`);
});

test("BIND-7 (explicit ask inside the plan thread): naming the counter wins over the plan — the fix re-homes only the UNNAMED ask", () => {
  const r = W.say(U, "probe-d", "now draft the counter email for the Lincoln offer");
  assert.equal(r.out.intent, "negotiation_draft", `the named counter ask is served by the negotiation even on a plan thread (got ${r.out.intent})`);
  assert.ok(r.reply.includes("Lincoln International"), `the named counter draft runs on the offer record: ${r.reply.slice(0, 300)}`);
  assert.ok(!r.reply.includes(FIXED_SUBJECT), "the named counter ask never serves the plan's draft");
});
