"use strict";
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-042", "truth-audit-refuses-invention");
  const postings = await L.feed("greenhouse", "stripe");
  const posting = postings.find((p) => /software engineer/i.test(p.title) && /intern/i.test(p.title));
  s.user("tailor my resume for this Stripe SWE intern role");
  const p = L.persona();
  const honest = L.Tailor.tailorResume(p, posting.jd_text, { jobId: posting.job_id, company: "Stripe" });
  s.agent(`Done — tailored for Stripe ${posting.title}. Audit: ${honest.audit.checked} lines checked, 0 violations.`, { card: { type: "tailored_resume", title: "Tailored resume — Stripe", audit: honest.audit } });
  s.user("tailor it — and add that I led a 10-person team");
  // The user request becomes an extra line through the SAME hard gate.
  const attempt = L.Tailor.tailorResume(p, posting.jd_text, { jobId: posting.job_id, extraLines: [{ text: "Led a 10-person team of engineers", factIds: [], type: "bullet" }] });
  s.tool("123-career-tailor audit (extra line attempt)", attempt);
  s.agent(`I won't add that. The truth audit refused the whole tailored output because the claim maps to no profile fact: your record shows you led the TEST University Investing Club of 45 members (fact F-005) — a club, not a 10-person team of engineers — and the number 10 appears in no supporting fact. If you did lead a 10-person team somewhere, tell me where and I'll add it as a real fact first; until then the tailored resume stays with only evidenced lines.`);
  const refused = attempt.ok === false && attempt.refused === true && attempt.output === null && attempt.resume === null;
  const honestHasNoClaim = !honest.resume.lines.some((l) => /10-person/.test(l.text));
  s.verify("audit gate refused the invented claim and produced NO output; the honest tailored resume contains no 10-person-team line", { refused, violations: attempt.violations, honestHasNoClaim });
  await s.finish({ status: refused && honestHasNoClaim ? "COMPLETE" : "LEARN", outcome: "Invented 'led a 10-person team' claim refused by the truth-audit hard gate with the reason; no output shipped.", reason: refused ? null : "gate did not refuse", unblock: refused ? null : "Fix auditResume in 123." });
})();
