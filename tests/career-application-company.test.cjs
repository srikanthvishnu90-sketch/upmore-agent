'use strict';
// WO-071: "I applied to the Account Executive role at Klaviyo yesterday" was recorded with the company "Klaviyo yesterday"
// by the deployed router (found by prompting the live brain, docs/architect/reports/2026-10-20-live-brain-tasks.md): the
// company stops at the first word that does not start like a name; the first word is kept as typed ("stripe").
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));

function say(texts) {
  const host = CareerHost.createCareerHost({ CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"), CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"), CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js") });
  let snap = null, n = 0, rows = [];
  for (const text of texts) {
    const ctx = host.createTurnCtx({ userId: "u-test", threadId: "t-test", now: Date.parse("2026-10-20T15:00:00Z") + (++n) * 60000, accountPersistence: true, snapshot: snap, account: {}, watchState: {}, postings: [] });
    host.runTurn(text, ctx);
    snap = host.extractSnapshot(ctx);
    rows = (ctx.trackStore && ctx.trackStore.rows) || [];
  }
  return rows.map((r) => [r.company, r.role]);
}

test("a reported application keeps the company's name and nothing after it", () => {
  assert.deepEqual(say(["I applied to the Account Executive role at Klaviyo yesterday"]), [["Klaviyo", "Account Executive"]]);
  assert.deepEqual(say(["I applied to the Data Analyst role at Goldman Sachs last week"]), [["Goldman Sachs", "Data Analyst"]]);
  assert.deepEqual(say(["I applied for the SWE internship at Jane Street on Monday"]), [["Jane Street", "SWE"]]);
});
