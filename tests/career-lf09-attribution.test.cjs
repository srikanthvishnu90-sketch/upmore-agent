/* LF-09 guard (BUG-274 / BUG-275 / BUG-276; FR-429 / FR-430 / FR-431) — renumbered at v228 integration (lane provisionals were BUG-271/272/273, FR-426/427/428) —
   TARGET_FIRM_LEAKED_INTO_UNRELATED_STATE. Live on v227 (671f833),
   2026-10-17, gauntlet test user, found in the owed battery's DB
   verification (record: docs/gauntlet/671f833.md battery addendum;
   registry class LF-09):

   (i) P1 t1: "I got an offer from a fintech startup, 85k, they want an
   answer by Monday" — no company named — was answered "Offer on the
   record for Meridian Capital — the row now shows Offer", and the
   committed thread store held a tracker row app-meridian-capital-10,
   company "Meridian Capital", stage Offer, with a synthesized
   "applied (cold, resume ?)" event (source "inbox"). The user never
   applied to Meridian Capital and never named it in the thread;
   Meridian was the account's on-record target_firm (a PREFERENCE fact,
   durable since the LF-08 fix). Mechanism: handleTrackEventReport's
   company resolution fell back to stated_facts.target_firm when the
   report named no company and no row stood open, and the ingest call
   carried no user channel, so 126's assertion gate never ran and the
   write went through dressed as an inbox detection. On v225 the
   identical turn refused: "I will not guess a company onto it."

   (ii) P7: "Help me network into healthcare consulting" built the plan
   at Meridian Capital and dropped the disclosure — handleCampaignPlan's
   target_firm override replaced the ask's own category universe
   (proposed_default.kind "category", the universe the USER named).

   (iii) Geography: the durable geography flipped Denver -> Chicago
   mid-run, captured by the bare `in <CITY>` frame from a job-location
   mention ("looking at data analyst roles in Chicago", P6 t1) — a
   job's location is not the user's geography.

   This guard runs the DEPLOYED path — the real CareerHost with the
   real chain modules and production commit semantics — and asserts on
   the COMMITTED stores (the account record and the thread snapshot's
   trackStore, which is agent_flow_state in production) after every
   turn, never on the turn's in-memory ctx alone.
   Check: node --test tests/career-lf09-attribution.test.cjs */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const NOW = Date.parse("2026-10-17T18:10:00.000Z");
const WHITELIST = ["paused", "preferred_locations", "erase", "stated_facts"];
const clone = (v) => JSON.parse(JSON.stringify(v));

function makeHost() {
  return CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
}
// Same production-semantics world as tests/career-lf08-stated-fact-parity.test.cjs:
// the account map IS the committed account record (career_watch_kv
// 'career:account' in production) and the per-thread snapshot map IS the
// committed thread record (agent_flow_state) — assertions read both
// after each turn's commit.
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
  // The COMMITTED tracker rows of a thread — the snapshot the host
  // persisted for it, not any turn's live ctx.
  const committedRows = (threadId) => {
    const snap = store.threads.get(threadId);
    const ts = (snap && snap.stores && snap.stores.trackStore) || {};
    return Array.isArray(ts) ? ts : (ts.rows || []);
  };
  return { host, store, say, accountFacts, factOf, committedRows };
}

// Seed an account whose record durably holds target_firm Meridian
// Capital, exactly as the LF-08 journey left the live test account.
function seedTargetFirm(w, u) {
  w.say(u, "seed", "I'm a sophomore studying economics, and I'm targeting Meridian Capital");
  const tf = w.factOf(u, "target_firm");
  assert.ok(tf && /Meridian Capital/.test(tf.value), `precondition: target_firm durable on the account record (have: ${JSON.stringify(w.accountFacts(u))})`);
}

// ---------- (i) the exact LF-09 journey, verbatim ----------
test("LF-09 (i): an unnamed offer report never binds to the on-record target firm — the offer lands company-not-stated (TN-1a)", () => {
  const w = makeWorld();
  const u = "u-lf09-p1";
  seedTargetFirm(w, u);
  // P1 t1 verbatim, in a NEW thread whose tracker holds no rows.
  const r = w.say(u, "p1", "I got an offer from a fintech startup, 85k, they want an answer by Monday");
  const rows = w.committedRows("p1");
  // No row, and no event on any row, names a company the user did not name.
  for (const row of rows) {
    assert.ok(!/Meridian/i.test(row.company || ""), `no tracker row may carry the on-record target firm (row: ${JSON.stringify(row)})`);
    for (const ev of row.events || []) assert.ok(!/Meridian/i.test(ev.detail || ""), `no event may name the target firm (event: ${JSON.stringify(ev)})`);
  }
  // The offer IS recorded — company not stated, per TN-1a.
  assert.equal(rows.length, 1, `exactly the not-stated offer row stands (rows: ${JSON.stringify(rows.map((x) => x.company))})`);
  const row = rows[0];
  assert.equal(row.company, null, "the row's company is null — recorded as not stated, never filled from the record");
  assert.equal(row.company_not_stated, true, "the row carries the TN-1a not-stated marker");
  assert.equal(row.stage, "Offer", "the asserted event moved the not-stated row to Offer");
  // Provenance: a chat report is a user report. No event may dress the
  // write as an inbox detection, and the offer event's evidence is the
  // user's own words.
  for (const ev of row.events || []) assert.notEqual(ev.source, "inbox", `a chat-reported event never carries inbox provenance (event: ${JSON.stringify(ev)})`);
  const offerEv = (row.events || []).find((e) => e.type === "offer");
  assert.ok(offerEv, "the offer event is on the row");
  assert.ok(/fintech startup/i.test(offerEv.evidence || ""), `the offer event's evidence is the user's own clause (evidence: ${JSON.stringify(offerEv.evidence)})`);
  const appliedEv = (row.events || []).find((e) => e.type === "applied");
  if (appliedEv) assert.ok(/not stated/i.test(appliedEv.detail || ""), `a row-birth event on a not-stated row says so (detail: ${JSON.stringify(appliedEv.detail)})`);
  // The reply makes no false claim: v225's refusal shape, not the
  // fabricated attribution headline.
  assert.ok(!/on the record for Meridian/i.test(r.out.reply), `the reply never attributes the offer to the target firm (reply: ${r.out.reply})`);
  assert.match(r.out.reply, /will not guess a company onto it/);
});

// ---------- (i) controls: the user's own naming still binds ----------
test("LF-09 (i) control: an offer naming its company in the user's own words binds to that company", () => {
  const w = makeWorld();
  const u = "u-lf09-named";
  seedTargetFirm(w, u);
  w.say(u, "t", "an offer just came in from Atlas Freight");
  const rows = w.committedRows("t");
  const row = rows.find((x) => /Atlas Freight/.test(x.company || ""));
  assert.ok(row, `the user-named company gets its row (rows: ${JSON.stringify(rows.map((x) => x.company))})`);
  assert.equal(row.stage, "Offer");
  assert.ok(!rows.some((x) => /Meridian/i.test(x.company || "")), "the target firm gets no row from a report naming another company");
});

test("LF-09 (i) control: naming the target firm IN the report is the user's assertion and binds", () => {
  const w = makeWorld();
  const u = "u-lf09-named-tf";
  seedTargetFirm(w, u);
  const r = w.say(u, "t", "I got an offer from Meridian Capital, 85k");
  const rows = w.committedRows("t");
  const row = rows.find((x) => /Meridian Capital/.test(x.company || ""));
  assert.ok(row, `a report naming the firm binds to it (rows: ${JSON.stringify(rows.map((x) => x.company))})`);
  assert.equal(row.stage, "Offer");
  assert.match(r.out.reply, /Offer on the record for Meridian Capital/);
});

// ---------- (ii) an asked universe is never replaced by the record ----------
test("LF-09 (ii): a category universe named in the ask survives the on-record target firm, with its disclosure", () => {
  const w = makeWorld();
  const u = "u-lf09-p7";
  seedTargetFirm(w, u);
  // P7 t1 verbatim, new thread.
  const r = w.say(u, "p7", "Help me network into healthcare consulting");
  assert.match(r.out.reply, /The universe is the one you named — healthcare consulting firms/, `the asked universe is spoken as the user's own, with the disclosure (reply: ${r.out.reply})`);
  assert.ok(!/at Meridian Capital/.test(r.out.reply), `the plan is never silently re-scoped to the on-record firm (reply: ${r.out.reply})`);
  const target = (r.ctx.plan && r.ctx.plan.target) || {};
  assert.ok(!(Array.isArray(target.firms) && target.firms.length === 1 && /Meridian/i.test(target.firms[0])), `the persisted plan target is not the target firm (target: ${JSON.stringify(target.firms)})`);
  assert.equal(target.proposed_default && target.proposed_default.kind, "category", "the plan keeps the ask's category proposal");
});

test("LF-09 (ii) control: a bare networking ask naming NO universe still anchors to the on-record firm (probe (b))", () => {
  const w = makeWorld();
  const u = "u-lf09-probeb";
  seedTargetFirm(w, u);
  // Probe (b) verbatim.
  const r = w.say(u, "pb", "I am a sophomore who wants to network into investment banking. Help me find people to reach out to and draft my first outreach.");
  assert.match(r.out.reply, /Meridian Capital/, `the universe-less ask anchors to the on-record firm — legitimate memory use (reply: ${r.out.reply})`);
});

// ---------- (iii) geography: only the user's own location writes ----------
test("LF-09 (iii): a job-location mention never writes the user's geography (the P6 flip)", () => {
  const w = makeWorld();
  const u = "u-lf09-geo";
  w.say(u, "a", "I'm based in Denver and I want data roles");
  assert.equal((w.factOf(u, "geography") || {}).value, "Denver", "precondition: the basing statement wrote Denver");
  // P6 t1 verbatim (the live flip turn), in a new thread.
  w.say(u, "b", "I'm a senior in college in Ohio, GPA 3.4, looking at data analyst roles in Chicago — and track my application to Lincoln");
  const geo = w.factOf(u, "geography");
  assert.ok(geo && /Denver/.test(geo.value), `the durable geography survives a job-location mention (have: ${JSON.stringify(geo)})`);
});

test("LF-09 (iii): a sector named as a target never occupies the geography slot", () => {
  const w = makeWorld();
  const u = "u-lf09-sector";
  w.say(u, "a", "I'm based in Denver and I want data roles");
  w.say(u, "a", "I'm targeting fintech firms this cycle");
  const geo = w.factOf(u, "geography");
  assert.ok(geo && /Denver/.test(geo.value), `a sector target leaves the geography record standing (have: ${JSON.stringify(geo)})`);
});

test("LF-09 (iii) controls: the user's own location/basing statements write geography", () => {
  const w = makeWorld();
  // The LF-08 journey shape.
  let r = w.say("u-geo-1", "t-geo-1", "I'm based in Denver and I want data roles");
  assert.ok(w.accountFacts("u-geo-1").some((f) => f.kind === "geography" && /Denver/.test(f.value)), "\"I'm based in Denver\" writes Denver");
  // The Lane A corpus m1 shape: a self-description list, no \"I\".
  r = w.say("u-geo-2", "t-geo-2", "junior here — economics major, based in Denver btw");
  assert.ok(w.accountFacts("u-geo-2").some((f) => f.kind === "geography" && /Denver/.test(f.value)), "\"based in Denver\" in a self-description writes Denver");
  // The canonical own-basing statement.
  r = w.say("u-geo-3", "t-geo-3", "I live in Chicago now");
  assert.ok(w.accountFacts("u-geo-3").some((f) => f.kind === "geography" && /Chicago/.test(f.value)), "\"I live in Chicago\" writes Chicago");
  // And a bare job-location mention on a fresh record writes nothing.
  r = w.say("u-geo-4", "t-geo-4", "looking at data analyst roles in Chicago");
  assert.ok(!w.accountFacts("u-geo-4").some((f) => f.kind === "geography"), `a job-location mention alone writes no geography (have: ${JSON.stringify(w.accountFacts("u-geo-4"))})`);
});
