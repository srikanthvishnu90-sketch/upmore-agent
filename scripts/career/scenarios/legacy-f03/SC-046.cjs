"use strict";
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-046", "why-this-company-figma");
  s.user("why do I want to work at Figma?");
  const postings = await L.feed("greenhouse", "figma");
  const posting = postings[0];
  const cir = L.cirFromPosting("Figma", posting);
  s.tool("121-career-jobs greenhouse/figma feed + CIR fact source", { count: postings.length, cirFact: cir.facts[0], note: "No Figma CIR in packages/career-data/cirs/ (BUG-002); fact is a verbatim sentence from Figma's own live posting." });
  const p = L.persona();
  const bank = L.Tailor.buildAnswerBank(p, posting.jd_text, cir, {});
  s.tool("123-career-tailor buildAnswerBank", bank);
  const why = bank.entries.find((e) => e.theme === "why_us");
  s.agent(why.text, { card: { type: "answer_bank", title: "Answer bank — why Figma", entries: bank.entries } });
  const grounded = !!why && why.text.includes("Figma") && why.factIds.length >= 1 && why.cirFacts.length >= 1 && why.rewrittenForCompany === true;
  const factReal = grounded && !!L.Profile.getFact(p, why.factIds[0]);
  s.verify("why_us entry grounded in a Figma CIR fact + a real persona fact ID; company parts marked rewritten-for-company (not boilerplate)", { grounded, factReal, whyFactIds: why && why.factIds, cirFacts: why && why.cirFacts });
  await s.finish({ status: grounded && factReal ? "COMPLETE" : "LEARN", outcome: "Why-Figma answer-bank entry grounded in Figma's own posting fact + persona fact, company-specific.", reason: grounded ? null : "answer bank not grounded", unblock: grounded ? null : "Fix buildAnswerBank in 123 / author a Figma CIR." });
})();
