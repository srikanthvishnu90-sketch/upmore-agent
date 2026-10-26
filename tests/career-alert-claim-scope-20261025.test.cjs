"use strict";
/* STEP 3 F0 (2026-10-25): the ONE alert path's claim must not eat other families, and "pause everything" is the
   global halt even while an alert frame stands. Fail-first on the merged base 5a729907 (three red):
     (1) CB-0495 verbatim, a tailor-and-deliver ask that mentions a "role", is the tailor's, never a watch create;
     (2) a find + tracker-status message is answered by those families, never claimed as a watch create;
     (3) after "stop my job alerts", "pause everything for now" sets the GLOBAL pause (the alert frame does not
         turn it into an alert pause), and "ok turn them back on" with both standing asks which scope.
   Root cause: alertIntentOf claims a create on any delivery verb ("send me", "tell me") composed with any job noun
   anywhere in the turn, and claims a pause on the alert frame alone. Trunk 63a1233f routed (1) to career_tailor and
   (2) to tracking_status; the scope suite (4da1f5af) pinned (3).
   Check: node --test tests/career-alert-claim-scope-20261025.test.cjs */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const NOW = Date.parse("2026-10-25T15:00:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));

function makeWorld() {
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const store = { accounts: new Map(), threads: new Map() };
  let n = 0;
  const say = (userId, text, postings) => {
    n += 1;
    const threadId = `t-${userId}`;
    const ctx = host.createTurnCtx({ userId, threadId, now: NOW + n * 60000, accountPersistence: true, snapshot: store.threads.get(threadId) || null, account: clone(store.accounts.get(userId) || {}), watchState: {}, postings: postings || [] });
    const out = host.runTurn(text, ctx);
    store.threads.set(threadId, host.extractSnapshot(ctx));
    if (ctx._hostPatch) { const a = store.accounts.get(userId) || {}; for (const k of Object.keys(ctx._hostPatch)) a[k] = clone(ctx._hostPatch[k]); store.accounts.set(userId, a); }
    return { out, ctx };
  };
  return { say };
}

const CB0495 = "Tailor my resume for the Product Manager role at Natera and send me the PDF as a file in this chat.";
const POOL = [{ id: "fx-1", job_id: "fx-1", title: "Data Analytics Intern", company: "Lumen Grid", location: "Seattle, WA", remote_terms: "hybrid", requirements: ["SQL", "Python"], salary: "$30/hr", url: "https://jobs.example.test/fx-1", status: "open", posted_at: "2026-10-20", jd_text: "Data analytics intern." }];

test("(1) CB-0495: tailor + 'send me the PDF' is the tailor's turn, never a watch create", () => {
  const w = makeWorld();
  const { out } = w.say("u-cb", CB0495);
  assert.notEqual(out.intent, "career_watch_create", out.reply);
  assert.equal(out.intent, "career_tailor", out.reply);
});

test("(2) a find + tracker-status message is never claimed as a watch create", () => {
  const w = makeWorld();
  const { out } = w.say("u-mi", "find me data internships and also tell me what my tracker looks like", POOL);
  assert.notEqual(out.intent, "career_watch_create", out.reply);
  assert.match(String(out.reply), /tracker/i, out.reply);
});

test("(3) 'pause everything' after an alert stop is the global halt; 'turn them back on' with both standing asks which", () => {
  const w = makeWorld(); const U = "u-scope";
  w.say(U, "i'm a cs senior at ut austin, graduating may 2027");
  const c = w.say(U, "watch for product manager roles in denver");
  assert.equal(c.out.intent, "career_watch_create", c.out.reply);
  const stop = w.say(U, "stop my job alerts");
  assert.equal(stop.out.intent, "career_watch_manage", stop.out.reply);
  const pause = w.say(U, "pause everything for now");
  assert.equal(pause.out.intent, "queue_halt", `pause everything is the global halt, not an alert pause: ${pause.out.intent} ${pause.out.reply}`);
  assert.ok(pause.ctx.globalPause && pause.ctx.globalPause.set === true, "the global pause is set");
  const t = w.say(U, "ok turn them back on");
  assert.equal(t.out.resultStatus, "awaiting_user", t.out.reply);
  assert.match(String(t.out.reply), /which/i, t.out.reply);
});

test("control: alert creates with the job object after the delivery verb, or a trigger, still claim", () => {
  const w = makeWorld();
  for (const ask of ["text me the minute a ux research role opens up", "ping me about accounting openings", "notify me about finance roles", "text me about new data analyst internships", "text me when something opens up", "watch for data analyst roles in Chicago"]) {
    const { out } = w.say(`u-${ask.length}`, ask);
    assert.equal(out.intent, "career_watch_create", `${ask} -> ${out.intent}: ${out.reply}`);
  }
});
