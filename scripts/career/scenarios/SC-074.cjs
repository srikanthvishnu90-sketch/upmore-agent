"use strict";
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-074", "eeo-decline-default-shown");
  s.user("The form has EEO questions (gender, race, veteran status) — handle them");
  const p = L.persona();
  const saved = L.Apply.savedAnswerFor(p, "eeo");
  const seam = L.Apply.confirmSensitive(p, "Gender / race / veteran status (EEO self-identification)");
  s.tool("132-career-apply EEO seam", { savedDefault: saved, seam });
  s.agent(`These are EEO self-identification fields. Your saved default — shown to you now, exactly as stored — is: '${saved}'. That is what will be entered for each EEO field: gender → ${saved}; race/ethnicity → ${saved}; veteran status → ${saved}. I never guess a demographic answer and never change this default without you. Say the word if you want a different answer stored.`, { card: { type: "eeo_default", title: "EEO fields — your saved default", default: saved, fields: ["gender", "race/ethnicity", "veteran status", "disability status"] } });
  const ok = saved === "decline to answer" && seam.kind === "eeo" && seam.savedAnswer === saved;
  s.verify("the value the form gets is the profile's own saved demographicPreference ('decline to answer' on the canonical persona's defaults), surfaced to the user before use", { saved, seamKind: seam.kind, ok });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: "EEO fields take the saved 'decline to answer' default, shown to the user verbatim before use.", reason: ok ? null : "saved EEO default missing or mismatched", unblock: ok ? null : "Fix savedAnswerFor(eeo) in 132 / persona defaults." });
})();
