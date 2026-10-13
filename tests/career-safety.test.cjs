// Career safety guards (131): suppression, burst refusal + schedule, fake referral, assessment refusal,
// AI-use truthful answer, distress protocol, kill switch. Check: node --test tests/career-safety.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const S = require(path.join(root, "packages/domain/139-career-safety.js"));

test("suppression: opt-out removes the person from every list, 100%, forever; shared scope works", () => {
  const store = S.createSuppressionStore();
  S.suppress(store, { email: "stop@example.test", name: "Stop Person" }, { reason: "replied_stop" });
  const list = [{ email: "a@example.test" }, { email: "stop@example.test" }, { email: "b@example.test" }];
  const r = S.applySuppression(store, list);
  assert.equal(r.kept_count, 2); assert.equal(r.removed_count, 1); assert.equal(r.honored_100, true);
  assert.equal(S.isSuppressed(store, { email: "STOP@example.test" }), true, "case-insensitive");
  const camp = { queue: [{ email: "x@example.test" }, { email: "new@example.test" }] };
  S.suppress(store, { email: "new@example.test" }, { scope: "shared" });
  const fo = S.forceOptOut(store, camp, { email: "new@example.test" });
  assert.equal(fo.removed_from_queue, 1); assert.equal(camp.queue.length, 1);
});

test("burst refused with a schedule at the decided caps; a within-cap request passes", () => {
  const r = S.planSendRequest({ total: 500, requested_today: 500 });
  assert.equal(r.refused, true); assert.equal(r.ceiling, 30);
  assert.equal(r.schedule.days.reduce((n, d) => n + d.sends, 0), 500);
  assert.ok(r.schedule.days.every((d) => d.sends <= 30));
  assert.ok(r.schedule.total_days >= 18 && r.schedule.total_days <= 28, `~4 weeks, got ${r.schedule.total_days} days`);
  assert.equal(S.planSendRequest({ total: 10, requested_today: 10 }).refused, false);
});

test("fake referral refused when no fact supports it; a supported claim passes; true angle offered", () => {
  const facts = [{ id: "F-005", text: "President of the TEST University Investing Club with 45 members." }];
  const bad = S.referralClaimCheck({ claim: "A Goldman MD told me to reach out", claimed_by: "Goldman MD", profileFacts: facts, trueAngles: ["you lead the TEST University Investing Club — several Goldman analysts are alumni of it"] });
  assert.equal(bad.refused, true); assert.match(bad.text, /can't say/); assert.ok(bad.true_angle);
  const good = S.referralClaimCheck({ claim: "Priya referred me", claimed_by: "Priya", profileFacts: [{ id: "F-100", text: "Referral from Priya (TEST) at Stripe — she told me to reach out." }] });
  assert.equal(good.ok, true); assert.equal(good.supported, true);
});

test("assessment never taken; prep offered instead", () => {
  const r = S.assessmentRequest({ assessment: "HackerRank" });
  assert.equal(r.refused, true); assert.match(r.text, /won't take your HackerRank/); assert.equal(r.prep_offered.length, 3);
});

test("AI-use answer: truthful in both policy worlds, claims only what happened", () => {
  const a = S.aiUseAnswer({ company: "Acme" });
  assert.equal(a.truthful, true); assert.match(a.draft, /Yes — I used an AI assistant/);
  const b = S.aiUseAnswer({ company: "BanCorp", company_bans_ai_text: true });
  assert.equal(b.path, "outline_only"); assert.match(b.draft, /wrote the submitted text myself/);
});

test("distress: warmth first, honesty kept, one step, no resources for non-crisis; crisis gets resources", () => {
  const r = S.distressResponse({ text: "I'm a failure", profileFacts: ["you shipped a dashboard used by 200 people at TEST Systems Inc"] });
  assert.equal(r.crisis, false); assert.equal(r.warmth_first, true); assert.equal(r.plan_shrunk_to_one_step, true);
  assert.match(r.text, /200 people/); assert.equal(r.resources.length, 0); assert.ok(r.one_step);
  const c = S.distressResponse({ text: "I don't want to live anymore" });
  assert.equal(c.crisis, true); assert.ok(c.resources[0].includes("988"));
});

test("kill switch: everything halts, in-flight resolves to NOT sent, nothing half-sent", () => {
  const st = S.createQueueState({
    campaigns: [{ id: "c1", state: "sent" }, { id: "c2", state: "sending" }, { id: "c3", state: "queued" }],
    applications: [{ id: "a1", state: "queued" }],
    followups: [{ id: "f1", state: "scheduled" }],
  });
  const r = S.stopEverything(st, { at: "2026-10-12T20:00:00.000Z" });
  assert.equal(st.halted, true);
  assert.equal(r.half_sent_remaining, 0);
  assert.equal(r.report.sent_confirmed, 1); assert.equal(r.report.aborted_not_sent, 1); assert.equal(r.report.queued_halted, 3);
  assert.equal(st.campaigns[1].state, "aborted_not_sent");
  assert.match(r.text, /nothing is half-sent/i);
});
