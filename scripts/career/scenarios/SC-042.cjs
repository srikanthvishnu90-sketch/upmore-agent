"use strict";
<<<<<<< HEAD
const { H, M, USER, person } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-042", "draft-surgery-shorter-less-formal");
  const cands = [0, 1, 2, 3, 4].map((i) => person(300 + i, { current_firm: ["Evercore", "Lazard", "Moelis & Company", "Houlihan Lokey", "Jefferies"][i], personalization_facts: [{ fact: `spent a year at a search fund before joining ${["Evercore", "Lazard", "Moelis & Company", "Houlihan Lokey", "Jefferies"][i]} (TEST fact)`, source_url: "https://example.test/bio" + i, strength: "strong", topic: "your search-fund path" }] }));
  const before = cands.map((c) => M.draftAndGate(c, USER, {}));
  s.user("Draft the campaign emails — show me 5 samples");
  s.tool("124.draftAndGate x5 (default voice)", before.map((b) => ({ to: b.draft.to, words: b.draft.body.split(/\s+/).length, gate: b.gate.pass })));
  s.agent("Here are the 5 samples in the default voice:\n\n" + before.map((b, i) => `--- Sample ${i + 1} (${b.draft.body.split(/\s+/).length} words) ---\n${b.draft.body}`).join("\n\n"));
  s.user("shorter, less formal");
  const after = cands.map((c) => M.draftAndGate(c, USER, { concise: true, voice: { formality: 0.1, directness: 0.9 } }));
  s.tool("124.draftAndGate x5 (concise, formality 0.1)", after.map((b) => ({ to: b.draft.to, words: b.draft.body.split(/\s+/).length, gate: b.gate.pass, formality: b.draft.voice.formality })));
  s.agent("Re-rendered — shorter, less formal (experience line dropped, formality 0.1):\n\n" + after.map((b, i) => `--- Sample ${i + 1} (${b.draft.body.split(/\s+/).length} words, was ${before[i].draft.body.split(/\s+/).length}) ---\n${b.draft.body}`).join("\n\n"));
  s.verify("every re-rendered draft is strictly shorter than its original and still passes the quality gate", { pairs: after.map((b, i) => ({ before: before[i].draft.body.split(/\s+/).length, after: b.draft.body.split(/\s+/).length })), all_shorter: after.every((b, i) => b.draft.body.split(/\s+/).length < before[i].draft.body.split(/\s+/).length), all_gate_pass: after.every((b) => b.gate.pass) });
  await s.finish({ status: "COMPLETE", outcome: `All 5 sample emails re-rendered shorter + less formal (word counts ${after.map((b, i) => before[i].draft.body.split(/\s+/).length + "->" + b.draft.body.split(/\s+/).length).join(", ")}), every draft still gate-clean` });
=======
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
>>>>>>> origin/career/sc-f03
})();
