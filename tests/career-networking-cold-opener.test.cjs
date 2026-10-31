"use strict";
/* NETWORKING COLD OPENER (2026-10-30, live finding): "who can I network with at Google?" was answered "Building the list
 * now: analyst at Google in San Francisco" (role and city lifted from old facts) and a long policy paragraph. Now: one
 * short natural paragraph, where names can come from, ONE next step, nothing lifted from old facts, nothing sent.
 * Also pins the per-firm cap wording to the code (no send cap; a list pass keeps 15 names per firm, the rest in reserve).
 * Check: node --test tests/career-networking-cold-opener.test.cjs */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const host = CareerHost.createCareerHost({ CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"), CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"), CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js") });
const NOW = Date.parse("2026-10-30T22:00:00Z");
const OLD = [
  { kind: "level", value: "analyst", evidence: "I'm an analyst", at: "2026-09-01T00:00:00Z" },
  { kind: "geography", value: "San Francisco", evidence: "in SF", at: "2026-09-01T00:00:00Z" },
  { kind: "target_firm", value: "Meridian Capital", evidence: "targeting Meridian Capital", at: "2026-09-01T00:00:00Z" },
];
let n = 0;
function turn(text, facts) {
  n += 1;
  const ctx = host.createTurnCtx({ userId: "u-cold", threadId: "t" + n, now: NOW, accountPersistence: true, snapshot: null, account: { paused: false, stated_facts: { facts: facts || [], updated_at: "2026-09-01T00:00:00Z" } }, watchState: {}, postings: [] });
  return host.runTurn(text, ctx);
}

// [phrasing, expected target in the reply (firm or field) or null]
const FIRMS = [
  ["who can I network with at Google?", "Google"], ["who should I network with at Stripe", "Stripe"], ["who can I reach out to at Goldman Sachs?", "Goldman Sachs"],
  ["who could I connect with at McKinsey", "McKinsey"], ["who do I network with at Pfizer", "Pfizer"], ["who would I reach out to at the Mayo Clinic", "Mayo Clinic"],
  ["who can I network with at Netflix?", "Netflix"], ["who should I connect with at Cravath", "Cravath"], ["who can I network with at Deloitte", "Deloitte"],
  ["who can I reach out to at NASA", "NASA"], ["who can I connect with at Tesla", "Tesla"], ["who can I network with at Spotify?", "Spotify"],
  ["who should I reach out to at Jane Street", "Jane Street"], ["who can I network with at Teach For America", "Teach For America"], ["who can I network with at Nike", "Nike"],
  ["who can I network with at Airbnb", "Airbnb"], ["who can I network with at Moderna", "Moderna"], ["I want to network at Amazon", "Amazon"],
  ["I want to network with people at Microsoft", "Microsoft"], ["I want to reach people at Adobe", "Adobe"], ["help me network at Salesforce", "Salesforce"],
  ["can you help me network into Google", "Google"], ["find people to network with at Apple", "Apple"], ["find me contacts at Oracle", "Oracle"],
  ["build me a networking list at Intel", "Intel"], ["Hey, who can I network with at Meta?", "Meta"],
];
const FIELDS = [
  ["who should I network with for banking?", "banking"], ["who should I network with for consulting", "consulting"], ["who can I network with in biotech", "biotech"],
  ["who can I network with in marketing", "marketing"], ["who can I network with in law", "law"], ["who can I network with for product management?", "product management"],
  ["who can I network with in healthcare", "healthcare"], ["who can I network with in civil engineering", "civil engineering"], ["who can I network with in journalism", "journalism"],
  ["who can I connect with for a design job", "design"],
];
const NONE = ["who can I network with", "who should I be networking with?", "who can I reach out to?"];

function checkShort(reply, q) {
  assert.ok(reply.length < 520, `short, not a policy paragraph (${reply.length}): ${q}\n${reply}`);
  assert.ok(!/Building the list now/i.test(reply), `no plan headline: ${q}`);
  assert.ok(!/\b(analyst|San Francisco|SF|Denver|Meridian|\b40\b)\b/.test(reply), `nothing lifted from old facts: ${q}\n${reply}`);
  assert.ok(!/per-firm|daily|ramp|\d+ a day|volume limit|hard filter|Gmail's own/i.test(reply), `no policy paragraph: ${q}`);
  assert.ok(/paste/i.test(reply) && /LinkedIn export/i.test(reply), `one clear next step (paste names / export): ${q}`);
  assert.ok(/guessed address/.test(reply) && /approval/.test(reply) && /source/.test(reply), `source, no guessed address, approval: ${q}`);
  assert.equal((reply.match(/\?/g) || []).length <= 1, true, `at most one question: ${q}`);
}

for (const [q, target] of [...FIRMS.map(([q, t]) => [q, `at ${t}`]), ...FIELDS.map(([q, t]) => [q, `in ${t}`]), ...NONE.map((q) => [q, null])]) {
  test(`cold opener: ${q}`, () => {
    for (const facts of [OLD, []]) {
      const o = turn(q, facts);
      assert.equal(o.intent, "outreach_clarification", q);
      assert.ok(!o.sends, "nothing sent");
      checkShort(String(o.reply), q);
      if (target) assert.ok(String(o.reply).includes(target), `${q} names ${target}: ${o.reply}`);
      assert.ok(!o.committed && o.resultStatus !== "sent", "nothing committed");
    }
  });
}

test("an ask that carries its own count, role, place or year still gets the plan, and old facts do not leak into it", () => {
  for (const q of ["find 40 analysts at Google", "who can I network with at Google in SF", "find 25 engineers at Stripe", "who can I network with at Google as a sophomore"]) {
    const o = turn(q, OLD);
    assert.ok(/Building the list now/.test(o.reply), q + ": " + o.reply);
    assert.ok(!/San Francisco|Denver/.test(o.reply) || /SF|San Francisco/.test(q), `old city not assumed: ${q}: ${o.reply}`);
  }
  const o = turn("find 40 analysts at Google", OLD);
  assert.ok(!/San Francisco/.test(o.reply), o.reply);
});

test("a fact stated this sitting still rides into a plan; one from an old sitting does not", () => {
  const fresh = [{ kind: "geography", value: "Chicago", evidence: "in Chicago", at: new Date(NOW - 600000).toISOString() }];
  assert.ok(/Chicago/.test(turn("find 40 analysts at Google", fresh).reply));
  const stale = [{ kind: "geography", value: "Chicago", evidence: "in Chicago", at: "2026-08-01T00:00:00Z" }];
  assert.ok(!/Chicago/.test(turn("find 40 analysts at Google", stale).reply));
});

test("per-firm cap wording matches the code: no send cap, a 15-name list pass", () => {
  // The 15-per-firm list pass itself is pinned by tests/career-outreach.test.cjs (OUTE-002/004); the send rail has no firm limit.
  const src = require("node:fs").readFileSync(path.join(ROOT, "packages/domain/124-career-outreach.js"), "utf8");
  assert.ok(/perFirmPer30Days: 15/.test(src) && /firmCount\[fk\] \|\| 0\) >= CAPS\.perFirmPer30Days\) \{ reserve\.push/.test(src), "list pass: 15 per firm, rest to reserve");
  assert.ok(!/firm/i.test(require("node:fs").readFileSync(path.join(ROOT, "supabase/functions/_shared/career_send_rail.ts"), "utf8").split("\n").filter((l) => /cap|limit/i.test(l) && !/^\/\//.test(l)).join("\n")), "send rail has no firm limit");
  for (const q of ["is there a per-firm cap?", "what's the per-firm cap"]) {
    const o = turn(q, []);
    assert.ok(/no per-firm cap on sending/i.test(o.reply), o.reply);
    assert.ok(/at most 15 names at one firm/.test(o.reply) && /reserve/.test(o.reply), o.reply);
  }
  const g = D("135-career-graph.js");
  assert.ok(!/15 sends to one firm/.test(require("node:fs").readFileSync(path.join(ROOT, "packages/domain/135-career-graph.js"), "utf8")));
  assert.ok(g);
});
