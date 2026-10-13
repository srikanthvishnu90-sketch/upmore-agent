"use strict";
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-044", "cover-letter-for-ramp");
  s.user("write my cover letter for Ramp");
  const postings = await L.feed("ashby", "ramp");
  const posting = postings.filter((p) => /engineer/i.test(p.title))[0];
  const cir = L.cirFromPosting("Ramp", posting);
  s.tool("121-career-jobs ashby/ramp feed + CIR fact source", { count: postings.length, chosen: { title: posting.title, url: posting.url }, cirFact: cir.facts[0], note: "packages/career-data/cirs/ has NO Ramp record (BUG-002); the company fact used is a verbatim sentence from Ramp's own live posting, sourced above — not invented." });
  const p = L.persona();
  const cl = L.Tailor.generateCoverLetter(p, posting.jd_text, cir, { role: posting.title });
  s.tool("123-career-tailor generateCoverLetter", { ok: cl.ok, wordCount: cl.wordCount, proofFactId: cl.proofFactId, banned: cl.banned, reason: cl.reason || null });
  if (!cl.ok) { s.agent(`I can't write that letter honestly yet: ${cl.reason}`); await s.finish({ status: "LEARN", outcome: "Cover letter refused by 123 (see reason).", reason: cl.reason, unblock: "Author a real Ramp CIR or fix the letter window in 123." }); return; }
  s.agent(cl.text, { card: { type: "cover_letter", title: `Cover letter — Ramp ${posting.title}`, wordCount: cl.wordCount, proofFactId: cl.proofFactId, companyFactSource: posting.url } });
  const banned = L.Tailor.bannedPhrasesIn(cl.text);
  const hasFact = cl.text.includes(cir.facts[0].text.slice(0, 60));
  const inWindow = cl.wordCount >= 150 && cl.wordCount <= 250;
  s.verify("letter is 150–250 words, contains the sourced Ramp company fact + one real proof point (proofFactId exists in profile), banned phrases absent", { inWindow, wordCount: cl.wordCount, hasFact, banned, proofFact: L.Profile.getFact(p, cl.proofFactId) && L.Profile.getFact(p, cl.proofFactId).title });
  await s.finish({ status: inWindow && hasFact && !banned.length ? "COMPLETE" : "LEARN", outcome: `Cover letter for Ramp (${cl.wordCount} words) grounded in a verbatim fact from Ramp's own posting + proof fact ${cl.proofFactId}.`, reason: inWindow && hasFact ? null : "window/fact check failed", unblock: inWindow && hasFact ? null : "See verification evidence." });
})();
