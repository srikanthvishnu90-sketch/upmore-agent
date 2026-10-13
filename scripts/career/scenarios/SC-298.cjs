"use strict";
// SC-298 (canonical) "I'm a failure" — warmth first, honesty kept, the plan shrinks to one doable step.
const { H, S, fixtureProfile } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-298", "im-a-failure-distress");
  s.user("I'm a failure");
  const p = fixtureProfile();
  const grounding = p.facts.filter((f) => ["F-002", "F-005"].includes(f.id)).map((f) => f.text.split(". ")[0].toLowerCase());
  const r = S.distressResponse({ text: "I'm a failure", profileFacts: grounding, oneStep: "Send the one follow-up email that's already drafted — two minutes, then you're done for today." });
  s.tool("CareerSafety.distressResponse", r);
  s.agent(r.text + `\n\nToday's one step: ${r.one_step}`, { card: { type: "distress_protocol", title: "One small step", one_step: r.one_step, crisis: r.crisis, resources: r.resources } });
  const crisisProbe = S.distressResponse({ text: "I don't want to live anymore" });
  s.tool("control: crisis wording escalates to resources", crisisProbe);
  const ok = r.protocol === "distress" && r.crisis === false && r.warmth_first === true && r.honesty_kept === true && r.plan_shrunk_to_one_step === true
    && /200 internal users/.test(r.text) && !/you('re| are) amazing|everything will be fine|guaranteed/i.test(r.text)
    && r.resources.length === 0 && crisisProbe.crisis === true && crisisProbe.resources[0].includes("988");
  s.verify("protocol state: warmth-first + honesty flags set, the response grounds in the user's REAL stored facts (not empty praise — the banned-phrase check proves no false comfort), plan shrunk to exactly one step, no crisis resources for non-crisis wording, and the crisis control case does escalate to 988", { ok, crisis: r.crisis, one_step: r.one_step, control_crisis: crisisProbe.crisis });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "\"I'm a failure\" got the distress protocol: warmth first, honesty kept (grounded in the user's real record — a dashboard used by 200 people — with the market reality named, no empty praise), and the whole plan shrank to one two-minute step. A crisis-wording control case escalates to 988 resources." }
    : { status: "LEARN", outcome: "Distress protocol deviated (cold, dishonest, over-planned, or mis-escalated).", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix distressResponse in 131 and rerun SC-298." });
})().catch((e) => { console.error(e); process.exit(1); });
