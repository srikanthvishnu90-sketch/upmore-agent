"use strict";
/* F7 (2026-10-25): the alert path's create claim must not eat an ask about the person's OWN applications. Diagnosis
   section 5's five regressions (CHANNEL-DOC-1, v240 probe j, v242, MI-013, resume-phrase-scope "both") are already green
   on the base (f83e42ab); probing the same class found two more shapes claimed as watch creates, at trunk 63a1233f and
   at the base alike: "let me know how my Stripe data analyst application is going" ("let me know" is a classic create)
   and "text me the status of my applications for the analyst roles" (a job noun after the delivery verb). Fail-first on
   the base: (1) red, both asks -> career_watch_create. The controls (create shapes with alert framing or a new-posting
   trigger, and the earlier stand-downs) are green before and after.
   Check: node --test tests/career-alert-claim-status-20261025.test.cjs */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const NOW = Date.parse("2026-10-25T15:00:00.000Z");

const host = CareerHost.createCareerHost({
  CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
  CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
  CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
});
let n = 0;
const turn = (text) => {
  n += 1;
  const ctx = host.createTurnCtx({ userId: `u-${n}`, threadId: `t-${n}`, now: NOW, accountPersistence: true, snapshot: null, account: {}, watchState: {}, postings: [] });
  return host.runTurn(text, ctx);
};

test("(1) an ask about the person's own applications is never claimed as a watch create", () => {
  for (const ask of [
    "let me know how my Stripe data analyst application is going",
    "text me the status of my applications for the analyst roles",
    "let me know where things stand with my applications for those roles",
    "message me an update on my job applications",
  ]) {
    const out = turn(ask);
    assert.notEqual(out.intent, "career_watch_create", `${ask} -> ${out.intent}: ${out.reply}`);
  }
  assert.equal(turn("text me the status of my applications for the analyst roles").intent, "tracking_status");
});

test("control: creates with alert framing or a new-posting trigger still claim, applications mentioned or not", () => {
  for (const ask of [
    "watch for data analyst roles in Chicago",
    "let me know when new analyst roles open up",
    "text me about new data analyst internships",
    "notify me about finance roles",
    "text me when something opens up",
    "set up an alert for product manager roles, I'm done with my applications for now",
  ]) {
    const out = turn(ask);
    assert.equal(out.intent, "career_watch_create", `${ask} -> ${out.intent}: ${out.reply}`);
  }
});

test("control: the section 5 shapes stay with their own families", () => {
  assert.equal(turn("Tailor my resume for the Product Manager role at Natera and send me the PDF as a file in this chat.").intent, "career_tailor");
  assert.notEqual(turn("find me data internships and also tell me what my tracker looks like").intent, "career_watch_create");
});
