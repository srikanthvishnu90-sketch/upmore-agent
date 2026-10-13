<<<<<<< HEAD
"use strict"; const { H, P, cirById } = require("./prep-common.cjs");
(async () => { const s = H.session("SC-162", "datadog-question-bank-no-cir");
  await s.user("what will they ask me at Datadog?");
  const cir = cirById("datadog"); await s.tool("127-career-prep.findCir", { company: "Datadog", cir_found_on_this_branch: !!cir, note: "datadog.json exists on origin/career/cir-b1 but is NOT merged into pivot/career" });
  const store = P.makePrepStore(); P.mineStories(require("./prep-common.cjs").persona.facts).forEach((x) => P.captureStory(store, x));
  const bank = P.questionBank({ company: "Datadog", cir, stories: store.stories });
  await s.agent(`I won't fake a Datadog question bank: there is no merged Datadog CIR on this branch, so no question below is labeled as Datadog-sourced. What I can give you today is the generic behavioral bank, each matched to your best story where one exists:\n\n${bank.questions.map((q, i) => `${i + 1}. ${q.q}${q.matched_story ? `  → your story: ${q.matched_story.title}` : "  → no matched story yet"}`).join("\n")}\n\nA Datadog-grounded bank (their actual round types, tagged to the CIR) unblocks the moment the Datadog CIR from the cir-b1 batch is merged.`, { card: { title: "Question bank — Datadog", cir_grounded: bank.cir_grounded, questions: bank.questions.length } });
  s.verify("bank state", { cir_grounded: bank.cir_grounded, cir_tagged_questions: bank.questions.filter((q) => q.source.type.startsWith("CIR")).length, total: bank.questions.length });
  await s.finish({ status: "LEARN", outcome: "Generic bank delivered with story matches, but zero Datadog-grounded questions: the Datadog CIR is not merged on this branch, and no question was falsely CIR-tagged.", reason: "datadog.json exists only on origin/career/cir-b1; pivot/career (this branch's base) carries 15 CIRs without Datadog.", unblock: "Merge origin/career/cir-b1's packages/career-data/cirs/datadog.json (and ramp.json) into pivot/career; the bank then grounds automatically via questionBank({cir})." });
=======
"use strict"; const { H, G, O, persona, profile, user, T } = require("./w09-common.cjs");
(async () => { const s = H.session("SC-162", "forwardable-blurb");
  await s.user("Forwardable blurb: three lines about me, built only from my real profile");
  const b = G.forwardableBlurb(profile, persona.facts);
  await s.tool("135-career-graph.forwardableBlurb", b);
  const mutual = T("Maya Chen", { current_firm: "Datadog", work_email: "maya@example.test" });
  const target = T("Priya Nair", { current_firm: "Datadog", title: "Software Engineer" });
  const intro = O.draftIntroRequest(mutual, target, user, b.blurb);
  await s.tool("124-career-outreach.draftIntroRequest", intro);
  await s.agent(`Your forwardable blurb — three lines, every line built from a real profile fact (fact IDs in the tool record, nothing added):\n\n${b.lines.map((l, i) => `${i + 1}. ${l.text}`).join("\n")}\n\nAnd here's the proof it's forwardable: the intro-request draft to Maya carries it verbatim — she can forward it as-is.\n\n${intro.draft.body}`);
  s.verify("blurb lines carry fact_ids and intro embeds the blurb verbatim", { lines: b.lines.length, fact_ids: b.lines.map((l) => l.fact_id), intro_ok: intro.ok, embeds: intro.draft.body.includes(b.blurb) });
  await s.finish({ status: "COMPLETE", outcome: "Three-line forwardable blurb built only from real persona facts (F-001/F-002/F-005), each line fact-tagged, and embedded verbatim in a 124 intro-request draft." });
>>>>>>> origin/career/sc-w09
})();
