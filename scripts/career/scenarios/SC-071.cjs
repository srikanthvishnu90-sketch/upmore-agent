"use strict";
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-071", "truth-audit-catches-unbacked-bullet");
  s.user("Here's a bullet from my old draft — add it to my tailored resume: 'Scaled our platform to 10 million users as tech lead'");
  const p = L.persona();
  const draftLine = { text: "Scaled our platform to 10 million users as tech lead", factIds: ["F-002"], type: "bullet" };
  const audit = L.Tailor.auditResume({ lines: [draftLine] }, p);
  s.tool("123-career-tailor auditResume (user-supplied bullet)", audit);
  const jd = "Software Engineer Intern. Required: Python, JavaScript, React, PostgreSQL.";
  const withBad = L.Tailor.tailorResume(p, jd, { extraLines: [draftLine] });
  const clean = L.Tailor.tailorResume(p, jd, {});
  s.tool("123-career-tailor tailor with vs without the bullet", { withBadRefused: withBad.refused === true, cleanOk: clean.ok });
  s.agent(`Dropped it — here is exactly what and why. The audit flagged your bullet on two counts:\n\n${audit.violations.map((v) => `• ${v.reason} (line: "${v.line}")`).join("\n")}\n\nYour real record (fact F-002) is a dashboard for 200 internal users that cut reporting time 40% — strong, and it is what the tailored resume says. "10 million users" and "tech lead" appear in no profile fact, so the bullet cannot ship. If the 10M figure is real work from somewhere else, tell me the role and I'll add it as a fact first, then it can be used. The clean tailored version (without the bullet) is ready and audit-clean.`);
  const ok = audit.ok === false && audit.violations.length >= 1 && withBad.refused === true && clean.ok === true && !clean.resume.lines.some((l) => /10 million/.test(l.text));
  s.verify("bullet caught by the audit with named reasons, the tailor gate refused the version containing it, and the clean version contains no trace of the claim", { violations: audit.violations.map((v) => v.reason), ok });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: "Unbacked bullet caught by the truth audit, dropped with the what-and-why shown; clean tailored resume produced without it.", reason: ok ? null : "audit did not catch or clean version tainted", unblock: ok ? null : "Fix auditResume in 123." });
})();
