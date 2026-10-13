"use strict";
// SC-016 Sensitive answer saved once — work authorization shown verbatim for confirmation; the
// confirmed value is what the audit record carries; nothing guessed when nothing is stored.
const { H, A, O, Profile, fixtureProfile } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-016", "sensitive-answer-saved-once");
  s.user("(application asks work authorization)");
  const p = fixtureProfile();
  const prompt = O.sensitiveAnswerPrompt(p, "work_authorization");
  s.tool("CareerOnboarding.sensitiveAnswerPrompt", prompt);
  s.agent(prompt.text, { card: { type: "sensitive_confirm", title: "Confirm saved answer: work authorization", value: prompt.value, requires_confirmation: true } });
  s.user("yes, use it");
  const confirmed = O.confirmSensitive(p, "work_authorization", { confirmed: true });
  s.tool("CareerOnboarding.confirmSensitive(confirmed)", confirmed);
  const entry = A.auditEntry(confirmed.audit);
  s.tool("CareerAccess.auditEntry(confirmed record)", entry);
  s.agent(confirmed.text);
  const unconfirmed = O.confirmSensitive(p, "work_authorization", { confirmed: false });
  const blank = O.sensitiveAnswerPrompt(Profile.createProfile({}), "work_authorization");
  s.tool("guards: no-confirm path + empty-profile path", { unconfirmed, blank });
  const ok = prompt.ok === true && prompt.value === "US citizen (TEST)" && prompt.text === "US citizen (TEST) — use it?" && prompt.guessed === false
    && confirmed.ok === true && entry.ok === true && entry.entry.what.includes('"US citizen (TEST)"')
    && unconfirmed.ok === false && unconfirmed.code === "not_confirmed"
    && blank.ok === false && blank.guessed === false && /will not guess/.test(blank.text);
  s.verify("the saved T3 answer was shown verbatim ('US citizen (TEST) — use it?'), only the user-confirmed path produced an audit record, and that record carries the confirmed value exactly; with nothing stored, the rail refuses to guess", { ok, audit_entry: entry.entry, blank_code: blank.code });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "The application’s work-authorization question was answered only after the saved value was shown verbatim (‘US citizen (TEST) — use it?’) and confirmed; the audit record carries exactly that confirmed value, and an empty profile gets a refusal to guess, not an invention." }
    : { status: "LEARN", outcome: "Sensitive-answer confirm flow did not hold the verbatim/no-guess standard.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix sensitiveAnswerPrompt/confirmSensitive in 130 and rerun SC-016." });
})().catch((e) => { console.error(e); process.exit(1); });
