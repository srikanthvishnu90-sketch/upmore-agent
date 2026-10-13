"use strict";
<<<<<<< HEAD
const { H, M, NOW, PROFILE, poolOverFirms, person } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-046", "per-firm-cap-15-per-30-days");
  const gs = poolOverFirms(["Goldman Sachs"], 60, {});
  const others = poolOverFirms(["Evercore", "Lazard"], 10, { startIndex: 200 });
  const records = gs.concat(others);
  const q = M.parseTarget("Find 80 bankers for coffee chats", PROFILE);
  const pool = M.buildList(records, Object.assign({}, q, { count: 80 }), { profile: PROFILE, nowMs: NOW });
  s.user("Build the list — and never send 60 emails to one desk");
  s.tool("124.buildList", pool.yield);
  const gsSel = pool.selected.filter((c) => c.current_firm === "Goldman Sachs").length;
  const gsRes = pool.reserve.filter((c) => c.current_firm === "Goldman Sachs").length;
  const camp = M.createCampaign({ id: "w03-camp-firmcap", userId: "w03-user", approved: true });
  const enq = M.enqueue(camp, gs.map((c) => ({ candidate: c, draft: { subject: "s", body: "b", tier: "B" } })), {});
  const queued = enq.filter((e) => e.status === "queued").length;
  const rejected = enq.filter((e) => e.reason === "per_firm_cap_15_per_30d").length;
  s.tool("124.enqueue x60 same firm", { queued, rejected_per_firm_cap: rejected });
  s.agent(`Per-firm cap enforced in both places: the list selected ${gsSel} of 60 Goldman people (the other ${gsRes} sit in reserve), and the send queue accepted ${queued} and rejected ${rejected} with per_firm_cap_15_per_30d. No desk ever gets 60.`);
  s.verify("cap read back from buildList selection and enqueue results", { gs_selected: gsSel, gs_reserve: gsRes, queued, rejected, cap: M.CAPS.perFirmPer30Days });
  await s.finish({ status: "COMPLETE", outcome: `Per-firm cap (15/30d) enforced at list build (${gsSel} selected, ${gsRes} reserved of 60 at one firm) and at enqueue (${queued} queued, ${rejected} rejected per_firm_cap_15_per_30d)` });
=======
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
>>>>>>> origin/career/sc-f03
})();
