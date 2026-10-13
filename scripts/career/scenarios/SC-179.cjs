<<<<<<< HEAD
"use strict"; const { H, P, cirById } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-179", "salary-talk-prep-sourced");
  await s.user("they'll ask my expectations in the screen — it's the Duolingo Thrive screen. What do I say?");
  const sp = P.salaryPrep({ cir: cirById("duolingo") });
  await s.tool("127-career-prep.salaryPrep (NEGO-002 seam)", sp);
  await s.agent(`Only sourced numbers — every figure below is copied from Duolingo's CIR comp notes with its source label, nothing estimated:\n\n${sp.ranges.map((r) => `• ${r.text} [label: ${r.label}; source type: ${r.source_type}]`).join("\n")}\n\nScript for the screen:\n${sp.script}\n\nIf they push for a number first, anchor on the published intern band above and keep it about the band, not a personal price. Note for contrast: for Bain, the CIR explicitly records NO published figure — there I'd have told you we have no sourced number at all rather than invent one.`);
  s.verify("salary prep state", { status: sp.status, ranges: sp.ranges.map((r) => ({ label: r.label, source_type: r.source_type })) });
  await s.finish({ status: "COMPLETE", outcome: "Salary-talk prep delivered with the range copied from the Duolingo CIR comp notes, labeled by source type, plus a deflection/anchoring script; the no-figure case (Bain CIR) is handled by explicit non-invention.", reason: null, unblock: null });
=======
"use strict"; const { H, P, persona, cirForPrep } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-179", "voice-mock");
  await s.user("Voice mock: same loop by voice, scored the same way");
  const avail = P.voiceMockAvailability();
  await s.tool("127-career-prep.voiceMockAvailability", avail);
  const store = P.makePrepStore();
  const bank = P.questionBank({ company: "Stripe", cir: cirForPrep("stripe"), stories: P.mineStories(persona.facts) });
  const mock = P.startMock(store, { bank, count: 2 });
  const answers = [
    "First, the situation: at TEST Systems I owned a manual spreadsheet report. My task was to automate it. So I built a React and Python dashboard pulling from PostgreSQL, specifically for 200 internal users. In the end the result was a 40% cut in weekly reporting time, measured against the old workflow over a month.",
    "First, the context: I led the TEST University Investing Club of 45 members. Then I organised a stock-pitch competition with 20 participants, because members wanted real reps. The result: 20 participants pitched and 45 members got a repeatable format we still use each semester."];
  for (const a of answers) { await s.user(a); P.answerMock(store, mock.mock_id, a); }
  const sum = P.mockSummary(store, mock.mock_id);
  await s.tool("127-career-prep.mockSummary(text fallback)", sum);
  await s.agent(`Straight answer first: ${avail.reason} I won't fake a voice capability that isn't wired.\n\nWhat I CAN do — and just did — is the same loop by text (${avail.fallback}): same Stripe question bank, same rubric, scores stored the same way. Your 2-question run: average total ${sum.average_scores.total}/15, fix first: ${sum.fix_first}. When a voice rail is wired for prep, this exact bank and rubric carry over unchanged.`);
  s.verify("voice honesty + text mock state", { voice_available: avail.available, mock_status: store.mocks[0].status, answered: sum.answered });
  await s.finish({ status: "COMPLETE", outcome: "Voice mock honestly reported as not wired (no fake capability), and the full text-mock fallback ran end-to-end with stored scores — the exact path the task defines as COMPLETE for SC-179." });
>>>>>>> origin/career/sc-w09
})();
