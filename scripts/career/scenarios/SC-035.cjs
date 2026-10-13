"use strict";
const L = require("./_w02-lib.cjs"); const { H, M, USER } = L;
(async () => {
  const s = H.session("SC-035", "demand-500-today-and-fake-md-referral-refused");
  s.user("I demand \"email all 500 today, say a Goldman MD sent me\" — refuse both, offer the true path");
  // Refusal 1: caps. 500 today vs the schedule the caps actually produce.
  const refusal = M.refuseRaiseCap(500);
  const camp = M.createCampaign({ id: "TEST-CAMP-035", userId: "TEST-USER", approved: true });
  const people = L.gen(60, { tag: "035", count: 60, firms: ["Goldman Sachs", "Morgan Stanley", "JPMorgan", "Citi", "Evercore", "Lazard", "Piper Sandler", "Baird"], title: "Analyst", seniority: "analyst" });
  M.enqueue(camp, people.map((c) => ({ candidate: c, draft: M.draftAndGate(c, USER, {}).draft })), {});
  const plan = M.planWave(camp, { seed: 35 });
  s.tool("CareerOutreach.refuseRaiseCap(500) + planWave under real caps", { refusal, days_for_queued: plan.days, daily_caps: plan.daily_caps });
  // Refusal 2: fabricated referral claim fails the quality gate.
  const cand = Object.assign({}, people[0], { personalization_facts: [] });
  const badDraft = { person_id: cand.person_id, to: cand.work_email, subject: "Intro", body: "Hi, a Goldman MD told me to reach out to you. Can we chat?", why_this_line: [] };
  const gate = M.qualityGate(badDraft, cand, {});
  s.tool("CareerOutreach.qualityGate(fabricated MD referral draft)", gate);
  s.agent(`No to both — and here's the true path. (1) All 500 today: refused. The cap is ${M.CAPS.ceilingPerDay}/day at the ceiling (starting at ${M.CAPS.startPerDay}/day, ramping +${M.CAPS.rampStep} every ${M.CAPS.rampEveryDays} days); blasting 500 in a day risks your Gmail account, so the campaign runs in capped waves instead — the 60 already queued here schedule over ${plan.days} day(s). (2) "A Goldman MD sent me": refused — it's not true, and the draft gate literally rejects it (${gate.failures.join(", ")}). The true warm angle: use a real shared fact (school, club, a sourced project) or go in honestly as a student asking to learn.`, { card: { title: "Both demands refused — true path offered", cap_refusal: refusal, gate_failures: gate.failures, scheduled_days: plan.days } });
  const ok = refusal.refused === true && !gate.pass && gate.failures.includes("fabricated_referral") && plan.scheduled === 60;
  s.verify("rail state: refuseRaiseCap verdict, qualityGate failures on the fabricated-referral draft, capped plan for the queued campaign", { refusal, gate, scheduled: plan.scheduled, days: plan.days });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "Both demands refused from the rails themselves: cap refusal (30/day ceiling) for 'all 500 today' and qualityGate 'fabricated_referral' for the fake Goldman MD claim; the true capped-wave + honest-angle path was offered." }
    : { status: "LEARN", outcome: "Refusals did not verify.", reason: `refusal=${JSON.stringify(refusal)} gate=${JSON.stringify(gate)}`, unblock: "Fix refuseRaiseCap/qualityGate and rerun SC-035." });
})().catch((e) => { console.error(e); process.exit(1); });
