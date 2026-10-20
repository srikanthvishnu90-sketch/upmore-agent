/* LF-07 guard (BUG / FR — PENDING-ALLOCATION per MI-093) —
   HELD-DRAFT SUBJECT GARBLE. Live on v228 (fb1321a), gauntlet test
   user, reproduced byte-identical in THREE measurements (the v228
   deploy battery's P7; the 2026-10-18 custom battery's standing
   evidence; the 2026-10-19 part-2 re-run, Probe D t2 — records:
   docs/gauntlet/fb1321a.md, docs/gauntlet/fb1321a-custom-blocks.md;
   registry class LF-07):

   Probe D: "Help me network into healthcare consulting" builds a
   category plan on the universe the user named (healthcare
   consulting firms — LF-09 (ii) holds on this surface). The next
   turn, "draft the first email for me", produces the held sample
   draft with the subject:

     "Sophomore interested in the firms on the plan banking — 15 minutes?"

   Mechanism (142 sampleDraftText): the non-named-firm subject was
   composed as `Sophomore interested in ${setLabel} banking`, where
   setLabel was the plan's raw firm_set key de-underscored — or,
   when the plan carried no firm_set at all (a CATEGORY plan keeps
   its universe in target.proposed_default.label /
   target.universe_label, firm_set null), the noun-phrase fallback
   "the firms on the plan". A noun phrase spliced into the adjective
   slot in front of a hardcoded "banking" tail: the category word
   lands after "plan" with no conjunction, and "banking" is asserted
   of a healthcare-consulting plan. The same composition asserted
   "banking" of every non-named plan (an MBB consulting set read
   "mbb banking").

   The fix: the subject's interest phrase is the plan's own universe
   in its proper place — a named firm (unchanged), else the plan's
   category label, else the set's display label (the SET_LABELS the
   plan replies themselves speak), with the "banking" tail kept only
   for the investment-banking sets it describes, else the plain
   fallback noun phrase with no tail.

   This guard runs the DEPLOYED path — the real CareerHost with the
   real chain modules and production commit semantics — and asserts
   on the COMMITTED thread snapshot's plan draft (agent_flow_state
   in production) after every turn, never on the turn's in-memory
   ctx alone.
   Check: node --test tests/career-draft-subject.test.cjs */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW = Date.parse("2026-10-19T13:20:00.000Z");
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
// the account map IS the committed account record and the per-thread
// snapshot map IS the committed thread record (agent_flow_state) —
// assertions read both after each turn's commit.
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
  // The COMMITTED plan (and its held draft) of a thread — the
  // snapshot the host persisted for it, not any turn's live ctx.
  const committedPlan = (threadId) => {
    const snap = store.threads.get(threadId);
    return (snap && snap.stores && snap.stores.plan) || null;
  };
  const committedSubject = (threadId) => {
    const plan = committedPlan(threadId);
    if (!plan || !plan.draft || !plan.draft.text) return null;
    return plan.draft.text.split("\n")[0];
  };
  return { host, store, say, accountFacts, factOf, committedPlan, committedSubject };
}

// Same account state class as the live gauntlet account on which the
// defect was captured: target firm + level durable on the record.
function seedTargetFirm(w, u) {
  w.say(u, "seed", "I'm a sophomore studying economics, and I'm targeting Meridian Capital");
  const tf = w.factOf(u, "target_firm");
  assert.ok(tf && /Meridian Capital/.test(tf.value), `precondition: target_firm durable on the account record (have: ${JSON.stringify(w.accountFacts(u))})`);
}

// ---------- the Probe D journey, verbatim ----------
test("LF-07: a category plan's held draft subject names the plan's own category — no spliced fallback, no foreign field", () => {
  const w = makeWorld();
  const u = "u-draftsubj-probed";
  seedTargetFirm(w, u);
  // Probe D t1 verbatim (new thread): the plan is the category the
  // user named (LF-09 (ii) — the on-record firm must not replace it).
  w.say(u, "p7", "Help me network into healthcare consulting");
  const plan = w.committedPlan("p7");
  assert.ok(plan, "precondition: the plan persisted on the committed thread record");
  assert.equal(plan.firm_set, null, "precondition: a category plan carries no firm_set — its universe is the category label");
  assert.equal(plan.target.proposed_default.kind, "category");
  assert.equal(plan.target.proposed_default.label, "healthcare consulting firms");
  // Probe D t2 verbatim.
  const r = w.say(u, "p7", "draft the first email for me");
  const held = w.committedPlan("p7");
  assert.ok(held && held.draft, "the draft is held on the committed plan");
  assert.equal(held.draft.status, "held_sample", "the draft is held as a sample");
  assert.equal(held.draft.sends, 0, "a held sample sends nothing");
  assert.equal(w.committedSubject("p7"), "Subject: Sophomore interested in healthcare consulting firms — 15 minutes?", `the committed subject names the plan's own category, grammatically (have: ${w.committedSubject("p7")})`);
  assert.ok(!/the firms on the plan/.test(held.draft.text), `the spliced fallback phrase appears nowhere in the held draft (draft: ${held.draft.text.split("\n")[0]})`);
  assert.ok(!/banking/.test(held.draft.text.split("\n")[0]), "a healthcare-consulting plan's subject never asserts banking");
  assert.match(r.out.reply, /Subject: Sophomore interested in healthcare consulting firms — 15 minutes\?/, `the reply serves the same subject the record holds (reply: ${r.out.reply})`);
  // The show-again turn re-serves the COMMITTED draft — the fixed
  // subject is what stands on the record, not a first-render accident.
  const r3 = w.say(u, "p7", "show me the draft");
  assert.match(r3.out.reply, /Subject: Sophomore interested in healthcare consulting firms — 15 minutes\?/, `the held draft read back carries the fixed subject (reply: ${r3.out.reply})`);
  assert.equal(w.committedSubject("p7"), "Subject: Sophomore interested in healthcare consulting firms — 15 minutes?");
});

// ---------- second witness: the hardcoded field tail on a set plan ----------
test("LF-07: a consulting set plan's subject names the set — never another field's name", () => {
  const w = makeWorld();
  const u = "u-draftsubj-mbb";
  // A firm-less consulting ask is proposed the MBB set (BUG-216).
  w.say(u, "t", "Help me network into consulting");
  const plan = w.committedPlan("t");
  assert.ok(plan && plan.firm_set === "mbb", `precondition: the consulting proposal is the MBB set (plan: ${JSON.stringify(plan && plan.firm_set)})`);
  w.say(u, "t", "draft the first email for me");
  assert.equal(w.committedSubject("t"), "Subject: Sophomore interested in MBB — 15 minutes?", `the subject speaks the set's own display label with no foreign field appended (have: ${w.committedSubject("t")})`);
});

// ---------- controls: the shapes that were already right stay byte-identical ----------
test("LF-07 control: a named-firm plan's subject is unchanged", () => {
  const w = makeWorld();
  const u = "u-draftsubj-named";
  seedTargetFirm(w, u);
  // Probe (b) verbatim: a universe-less ask anchors to the on-record
  // firm, so the plan is a named-firm plan.
  w.say(u, "pb", "I am a sophomore who wants to network into investment banking. Help me find people to reach out to and draft my first outreach.");
  const plan = w.committedPlan("pb");
  assert.ok(plan && plan.firms_named && plan.firms[0] === "Meridian Capital", `precondition: the plan is the named-firm plan (plan firms: ${JSON.stringify(plan && plan.firms)})`);
  w.say(u, "pb", "draft the first email for me");
  assert.equal(w.committedSubject("pb"), "Subject: Sophomore interested in Meridian Capital — 15 minutes?", `the named-firm subject is byte-identical to the pre-fix shape (have: ${w.committedSubject("pb")})`);
});

test("LF-07 control: an investment-banking set plan's subject keeps its field word", () => {
  const w = makeWorld();
  const u = "u-draftsubj-bb";
  // A firm-less investment-banking ask is proposed the bulge-bracket
  // set; its subject was the one non-named shape already grammatical.
  w.say(u, "t", "I want to network into investment banking");
  const plan = w.committedPlan("t");
  assert.ok(plan && plan.firm_set === "bulge_bracket", `precondition: the IB proposal is the bulge-bracket set (plan: ${JSON.stringify(plan && plan.firm_set)})`);
  w.say(u, "t", "draft the first email for me");
  assert.equal(w.committedSubject("t"), "Subject: Sophomore interested in bulge bracket banking — 15 minutes?", `the IB set subject is byte-identical to the pre-fix shape (have: ${w.committedSubject("t")})`);
});
