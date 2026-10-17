// GO-LIVE FLIP (2026-10-13): the agent-chat HTTP handler must serve the
// CAREER dispatch end to end. The production host seam lives in
// supabase/functions/_shared/career_host.js — a dependency-injected host
// (chain modules in, turn out) so the exact code the Deno handler runs is
// exercised here against the real domain modules.
// FAIL-FIRST: written against no module — every test red until
// career_host.js exists and behaves; handler.ts wiring is proven by the
// live probes recorded in the flip report, this suite proves the host.
// Check: node --test tests/career-http-host.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
const D = (n) => require(path.join(root, "packages/domain", n));

const { CareerHost } = require(path.join(root, "supabase/functions/_shared/career_host.js"));
const CareerProfile = D("122-career-profile.js");

const DEPS = {
  CareerAccess: D("120-career-access.js"),
  CareerOnboarding: D("130-career-onboarding.js"),
  CareerRouter: D("142-career-router.js"),
  CareerDoorstep: D("141-career-doorstep.js"),
  CareerReply: D("140-career-reply.js"),
  CareerContainment: D("143-career-containment.js"),
};
const host = CareerHost.createCareerHost(DEPS);
const USER = "flip-test-user";
const FINANCE_MARKERS = ["connected bank", "Connect one in the app", "Name the subscription", "cancel_subscription", "bank or card"];

function fixtureProfile() {
  const data = JSON.parse(fs.readFileSync(path.join(root, "packages/career-data/fixtures/gauntlet/profiles/p1-early-career-swe/profile.json"), "utf8"));
  return CareerProfile.profileFromData(data);
}
function freshCtx(snapshot, extra) {
  return host.createTurnCtx(Object.assign({ userId: USER, threadId: "flip-thread", now: Date.now(), snapshot: snapshot || null }, extra || {}));
}

test("host creates and a networking ask is answered by the career path", () => {
  const ctx = freshCtx(null);
  const out = host.runTurn("I am a sophomore who wants to network into investment banking. Help me find people to reach out to and draft my first outreach.", ctx);
  assert.equal(typeof out.reply, "string");
  assert.ok(out.reply.length > 40, "reply is substantive");
  assert.equal(out.intent, "outreach_clarification");
  for (const m of FINANCE_MARKERS) assert.ok(!out.reply.includes(m), `no finance marker: ${m}`);
});

test("apply ask with an empty live pool fabricates no roles", () => {
  const ctx = freshCtx(null, { profile: fixtureProfile() });
  const out = host.runTurn("Find me internships I can apply to this week.", ctx);
  // BUG-266 PIN MOVED DELIBERATELY (2026-10-17, iterate/named-gaps
  // lane; see the BUG-266 ledger row + FR-421): this shape pinned
  // career_discovery through the v224 line because an integration
  // merge does not rewrite a pin for a framing gain — the lane
  // change that owns the reroute moves it openly. The ask is now
  // served by the internship-banded route. The property this test
  // exists for — an empty pool fabricates no roles — is unchanged
  // and asserted identically below.
  assert.equal(out.intent, "career_internship_discovery");
  const shortlist = (out.result && out.result.shortlist) || [];
  assert.equal(shortlist.length, 0, "empty pool -> empty shortlist, nothing invented");
  for (const m of FINANCE_MARKERS) assert.ok(!out.reply.includes(m), `no finance marker: ${m}`);
});

test("tracking ask gets a career answer, never the finance product", () => {
  const ctx = freshCtx(null);
  const out = host.runTurn("What job applications do I have out right now, and what is their status?", ctx);
  assert.equal(typeof out.reply, "string");
  assert.ok(out.reply.length >= 10);
  for (const m of FINANCE_MARKERS) assert.ok(!out.reply.includes(m), `no finance marker: ${m}`);
});

test("kill switch halts, and the halt survives a snapshot round-trip into a fresh ctx", () => {
  const ctx = freshCtx(null);
  const out = host.runTurn("Stop everything. Pause all my outreach right now.", ctx);
  assert.equal(out.intent, "queue_halt");
  assert.equal(out.resultStatus, "completed");
  assert.ok(ctx.globalPause && ctx.globalPause.set === true, "global pause set on ctx");
  const snap = host.extractSnapshot(ctx);
  const revived = JSON.parse(JSON.stringify(snap)); // must be JSON-safe (it rides a jsonb column)
  const ctx2 = freshCtx(revived);
  const out2 = host.runTurn("Go ahead and send my outreach emails now.", ctx2);
  // Combine repair (2026-10-15): 7f2b11d re-pinned this router-pause case to
  // the host blanket gate's career_paused; that gate was a Codex defect (it
  // made router pauses un-inspectable and un-liftable). Restored to the
  // afc460e contract: 142's action-only hold answers paused_hold/blocked.
  // The account-control career_paused contract stays pinned by the
  // persistence suites.
  assert.equal(out2.intent, "paused_hold");
  assert.equal(out2.resultStatus, "blocked");
});

test("a finance ask is NOT served as the finance product", () => {
  const ctx = freshCtx(null);
  const out = host.runTurn("How much did I spend on food last month?", ctx);
  assert.equal(typeof out.reply, "string");
  assert.ok(out.reply.length >= 10);
  for (const m of FINANCE_MARKERS) assert.ok(!out.reply.includes(m), `no finance marker: ${m}`);
});

test("garbage input never throws and still returns a reply", () => {
  const ctx = freshCtx(null);
  for (const g of ["", "💥💥💥", "asdf qwer zzzz"]) {
    const out = host.runTurn(g, ctx);
    assert.equal(typeof out.reply, "string");
    assert.ok(out.reply.length > 0, "contained fallback speaks");
  }
});
