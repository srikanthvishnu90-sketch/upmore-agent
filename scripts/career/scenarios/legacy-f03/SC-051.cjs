"use strict";
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-051", "sensitive-sponsorship-confirm");
  s.user("apply for me — the form is asking: will you require sponsorship?");
  const p = L.intlPersona();
  const first = L.Apply.confirmSensitive(p, "Will you now or in the future require sponsorship?");
  s.tool("132-career-apply confirmSensitive (before confirmation)", first);
  s.agent(first.prompt);
  const notEntered = first.entered === false && first.savedAnswer === "Yes — F-1 OPT then H-1B.";
  s.user("yes, use it");
  const after = L.Apply.confirmSensitive(p, "Will you now or in the future require sponsorship?", { confirmed: true });
  s.tool("132-career-apply confirmSensitive (after user yes)", after);
  s.agent(`Entered exactly your saved answer: '${after.answer}' — your confirmation is recorded. Nothing else on the form was guessed.`);
  s.verify("before the yes: entered=false and the saved answer quoted verbatim from the international persona's constraints/F-001 fact; after the yes: entered=true with the identical string", { notEntered, afterEntered: after.entered, afterAnswer: after.answer, verbatim: after.answer === "Yes — F-1 OPT then H-1B." });
  await s.finish({ status: notEntered && after.entered ? "COMPLETE" : "LEARN", outcome: "Sponsorship question stopped the flow; saved answer 'Yes — F-1 OPT then H-1B.' confirmed verbatim before entry (APPE-005).", reason: notEntered ? null : "answer entered or misquoted before confirmation", unblock: notEntered ? null : "Fix confirmSensitive in 132." });
})();
