"use strict";
// W02 extension tests for 124-career-outreach (career/sc-w02): scheduleCampaign, monitorHealth,
// reconcileBounceDomains, runFollowUps, bookFromReply, seed test, learnVoice.
const test = require("node:test"); const assert = require("node:assert");
const M = require("../packages/domain/124-career-outreach");
const U = { name: "Alex Testcase", school: "TEST University", year: "junior" };
function cand(i, extra) { return Object.assign({ person_id: `T-${i}`, full_name: `Person ${i} (TEST)`, current_firm: `Firm ${i} (TEST)`, title: "Analyst", work_email: `person${i}@firm${i}.test`, email_confidence: 0.9, email_verification: "verified", schools: ["TEST University"] }, extra || {}); }
function sentCampaign(n) { const c = M.createCampaign({ id: "T-C", userId: "u1", approved: true }); const supp = M.createSuppressionStore(); M.enqueue(c, Array.from({ length: n }, (_, i) => ({ candidate: cand(i), draft: M.draftAndGate(cand(i), U, {}).draft })), { suppression: supp }); return { c, supp }; }

test("W02 scheduleCampaign is planWave under the caps", async () => {
  const { c } = sentCampaign(30); const plan = M.scheduleCampaign(c, { seed: 3 });
  assert.equal(plan.scheduled, 30); assert.ok(plan.days >= 1);
});
test("W02 bookFromReply books the first free offered slot into the injected calendar's records", async () => {
  const cal = { freeBusy: [{ start: "2026-10-14T21:00:00.000Z", end: "2026-10-14T21:30:00.000Z" }], events: [], createEvent(ev) { const e = Object.assign({ id: "E1" }, ev); cal.events.push(e); return e; } };
  const r = M.bookFromReply({ body: "Tuesday or Wednesday at 5pm ET works" }, cand(1), { calendar: cal, nowMs: Date.parse("2026-10-13T12:00:00Z") });
  assert.equal(r.ok, true); assert.equal(cal.events.length, 1);
  assert.equal(cal.events[0].start, "2026-10-20T21:00:00.000Z"); // Wed Oct 14 busy -> Tue Oct 20 5pm ET
  const noCal = M.bookFromReply({ body: "Tuesday at 5pm ET" }, cand(1), {});
  assert.match(noCal.reason, /NOT_WIRED/);
});
test("W02 reconcileBounceDomains names the dominant pattern; monitorHealth trips at 6%", async () => {
  const { c, supp } = sentCampaign(0);
  const people = [];
  for (let i = 0; i < 100; i++) people.push(cand(i, { work_email: i < 30 ? `p${i}@fixturebank.test` : `person${i}@firm${i}.test`, current_firm: i < 30 ? "Fixture Bank (TEST)" : `Firm ${i} (TEST)`, email_pattern: i < 30 ? "firstlast" : "first.last" }));
  people.forEach((p, i) => { p.current_firm = i < 30 ? `Fixture Bank Desk ${i} (TEST)` : p.current_firm; });
  M.enqueue(c, people.map((p) => ({ candidate: p, draft: M.draftAndGate(p, U, {}).draft })), { suppression: supp });
  const bounceIdx = new Set([2, 7, 12, 17, 22, 27]);
  c.items.slice(0, 100).forEach((item, idx) => { if (bounceIdx.has(idx)) M.recordOutcome(c, { type: "bounce", item, suppression: supp }); else { item.status = "sent"; M.recordOutcome(c, { type: "sent" }); } });
  const h = M.monitorHealth(c); assert.equal(h.breaker_tripped, true); assert.equal(h.bounce_pct, 6);
  const d = M.reconcileBounceDomains(c); assert.equal(d.dominant_pattern, "firstlast"); assert.equal(d.dominant_pattern_share_pct, 100);
});
test("W02 runFollowUps: tap required, responders excluded, final closes forever", async () => {
  const { c, supp } = sentCampaign(3);
  await M.sendPending(c, { suppression: supp, transport: { send: async () => ({ messageId: "m" }) } });
  assert.equal(M.runFollowUps(c, { touch: 1 }).ok, false);
  const r1 = M.runFollowUps(c, { touch: 1, continueTap: true, responders: ["T-0"], suppression: supp });
  assert.equal(r1.followups.length, 2); assert.ok(r1.followups.every((f) => f.draft.threaded));
  await M.sendPending(c, { suppression: supp, transport: { send: async () => ({ messageId: "m" }) } });
  const fin = M.runFollowUps(c, { touch: 2, continueTap: true, final: true, suppression: supp });
  assert.equal(fin.followups.length, 2); assert.equal(c.followups_closed, true);
  assert.equal(M.runFollowUps(c, { touch: 3, continueTap: true }).ok, false);
});
test("W02 seed test gate: blocks missing/spam, passes all-inbox", async () => {
  const st = M.createSeedTest(); assert.equal(M.seedGate(st).ok, false);
  M.setSeedResults(st, [{ provider: "gmail", placement: "inbox" }, { provider: "outlook", placement: "inbox" }, { provider: "yahoo", placement: "inbox" }]);
  assert.equal(M.seedGate(st).ok, true);
  const bad = M.createSeedTest(); M.setSeedResults(bad, [{ provider: "gmail", placement: "spam" }, { provider: "outlook", placement: "inbox" }, { provider: "yahoo", placement: "inbox" }]);
  assert.equal(M.seedGate(bad).ok, false);
});
test("W02 learnVoice profiles short/direct fixture voice from 8 samples", async () => {
  const samples = Array.from({ length: 8 }, (_, i) => `Hi Pat,\n\nI'm Alex, a junior at TEST University. I'm writing about topic ${i}. It's a short note and I'll keep it brief.\n\nWould 15 minutes work next week?\n\nThanks,\nAlex`);
  const v = M.learnVoice(samples);
  assert.equal(v.sample_count, 8); assert.ok(v.avg_sentence_words <= 16); assert.ok(v.voice.directness >= 0.8); assert.equal(v.greeting_style, "Hi Pat");
});
