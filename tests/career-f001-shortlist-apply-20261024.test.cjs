"use strict";
/* F-001 GAP 2 (coordinator work order, 2026-10-24): the apply claim
   that REFERENCES the served shortlist surfaces zero postings.
   =====================================================================
   MUSE-F-001 (docs/apply/AUDIT-INITIAL-WRONGS-2026-10-22): "Discovery/
   batch replies name no roles and carry no links — the apply claim
   reply surfaces zero postings." At this head the discovery reply
   itself and the family batch reply DO surface roles with their
   links (142's roleSentence; 155's speakSummary selection lines).
   What still surfaces NOTHING is the apply claim a user actually
   makes after being shown the list — "apply to the top 3 for me",
   "apply to the first one": 155's parseApplyAsk requires a family
   noun ("apply to 3 data analyst roles"), the named-role seam
   requires a named target, and no seam retains the served shortlist
   for an ordinal to bind to — so both shapes fall to the generic
   fallback, zero roles named, zero links carried, no run created.

   REQUIRED: the ordinal/top-N claim binds to the shortlist the
   discovery just served, runs the same batch seam over exactly
   those postings, and the reply names each selected role with its
   own link (from the run's records, never invented). Nothing
   submits: the run stops wherever the batch machinery stops it.
   A cold ordinal claim with no discovery standing must NOT
   fabricate a run or a link.

   Method: the repo's CareerHost composition, measurement-harness
   shape; postings are the eval corpus's synthetic board.
   Check: node --test tests/career-f001-shortlist-apply-20261024.test.cjs
*/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

const FALLBACK_RE = /^(I didn't catch that|I'm Trainee, a career agent: I find roles)/;
const NOW = Date.parse("2026-10-24T15:00:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));
const POSTINGS = JSON.parse(fs.readFileSync(path.join(ROOT, "evals/career/conversations.json"), "utf8")).postings;

function makeWorld() {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const store = { accounts: new Map(), threads: new Map(), watches: new Map() };
  let n = 0;
  const say = (userId, text) => {
    n += 1;
    const threadId = `t-${userId}`;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: clone(store.watches.get(userId) || {}), postings: POSTINGS });
    const out = host.runTurn(text, ctx);
    store.threads.set(threadId, host.extractSnapshot(ctx));
    if (ctx._hostPatch) {
      if (ctx._hostPatch.erase === true) store.accounts.set(userId, { paused: true });
      else { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    }
    const reply = String((out && out.reply) || "");
    return { text, intent: (out && out.intent) ?? null, fallback: Boolean(!out || out.intent == null || out.intent === "career_fallback" || FALLBACK_RE.test(reply)), reply, result: out && out.result };
  };
  return { say };
}

const INTAKE = "I'm a data analyst with 2 years of SQL and Tableau, based in Chicago";
const FIRST_URL = "https://jobs.example.test/northwind/101";
const SECOND_URL = "https://jobs.example.test/brightpath/201";
const THIRD_URL = "https://jobs.example.test/northwind/104";

test("F-001: 'apply to the top 3 for me' after a discovery runs the batch seam over the served shortlist and the reply names each role with its link", () => {
  const w = makeWorld();
  w.say("u-f001-top", INTAKE);
  const disc = w.say("u-f001-top", "find me data analyst jobs in Chicago");
  assert.equal(disc.intent, "career_discovery", disc.reply);
  assert.ok(disc.reply.includes(FIRST_URL), "setup: the discovery itself surfaces the first role's link");
  const claim = w.say("u-f001-top", "apply to the top 3 for me");
  assert.equal(claim.fallback, false, `REQUIRED: the top-N apply claim is served, not the generic fallback: ${claim.reply}`);
  assert.equal(claim.intent, "career_batch_apply", `REQUIRED: the claim runs the batch seam, got ${claim.intent}`);
  for (const url of [FIRST_URL, SECOND_URL, THIRD_URL]) {
    assert.ok(claim.reply.includes(url), `REQUIRED: the apply reply carries the selected role's own link (${url}): ${claim.reply}`);
  }
  assert.match(claim.reply, /Northwind Health/, "the reply names the selected companies");
  assert.equal(claim.result && claim.result.sends, 0, "nothing sends from a claim");
});

test("F-001: 'apply to the first one' after a discovery binds to the first served role only", () => {
  const w = makeWorld();
  w.say("u-f001-first", INTAKE);
  w.say("u-f001-first", "find me data analyst jobs in Chicago");
  const claim = w.say("u-f001-first", "apply to the first one");
  assert.equal(claim.fallback, false, `REQUIRED: the ordinal apply claim is served, not the generic fallback: ${claim.reply}`);
  assert.equal(claim.intent, "career_batch_apply", `REQUIRED: the claim runs the batch seam, got ${claim.intent}`);
  assert.ok(claim.reply.includes(FIRST_URL), `REQUIRED: the reply carries the first role's link: ${claim.reply}`);
  assert.ok(!claim.reply.includes(SECOND_URL), "the second role is not in a first-one run");
});

test("F-001 control: a cold 'apply to the first one' with no discovery standing fabricates no run and no link", () => {
  const w = makeWorld();
  w.say("u-f001-cold", INTAKE);
  const claim = w.say("u-f001-cold", "apply to the first one");
  assert.notEqual(claim.intent, "career_batch_apply", "no shortlist stands, so no batch run may be created");
  assert.ok(!claim.reply.includes("jobs.example.test"), `no posting link may be invented: ${claim.reply}`);
});
