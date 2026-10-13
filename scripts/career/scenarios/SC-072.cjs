"use strict";
// Canonical SC-072 = sponsorship T3 confirm (fresh run under canonical ID).
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-072", "sponsorship-t3-confirm");
  s.user("The application is asking about sponsorship — handle it");
  const p = L.intlPersona();
  const first = L.Apply.confirmSensitive(p, "Will you now or in the future require sponsorship?");
  s.tool("132-career-apply confirmSensitive (before confirmation)", first);
  s.agent(`Stopped — this is a T3 (sensitive) answer and it is never used without your confirmation. ${first.prompt}`);
  const held = first.entered === false && first.savedAnswer === "Yes — F-1 OPT then H-1B.";
  s.user("confirmed — use my saved answer");
  const after = L.Apply.confirmSensitive(p, "Will you now or in the future require sponsorship?", { confirmed: true });
  s.tool("132-career-apply confirmSensitive (after confirmation)", after);
  s.agent(`Used exactly your saved answer: '${after.answer}' (confirmation state: ${after.confirmationState}).`);
  s.verify("saved T3 answer quoted verbatim and held (entered:false) until the user's confirmation; identical string entered after", { held, after });
  await s.finish({ status: held && after.entered ? "COMPLETE" : "LEARN", outcome: "Sponsorship T3 answer confirmed from the saved value before any use — never guessed, never silently reused.", reason: held ? null : "answer used before confirmation", unblock: held ? null : "Fix confirmSensitive in 132." });
})();
