"use strict";
// Canonical SC-073 = salary guardian (fresh run under canonical ID).
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-073", "salary-expectation-guardian");
  s.user("The form wants my salary expectation — fill it in");
  const postings = await L.feed("greenhouse", "stripe");
  const withPay = postings.find((p) => /\$\s?\d/.test(p.jd_text) && /engineer/i.test(p.title));
  const snippet = withPay ? (withPay.jd_text.match(/.{0,60}\$\s?\d[^.]{0,60}/) || [])[0] : null;
  const marketRange = snippet ? { range: snippet.trim(), source: `Stripe's own live posting "${withPay.title}" (${withPay.url})` } : null;
  s.tool("121-career-jobs sourced range", { snippet, source: marketRange && marketRange.source });
  const r = L.Apply.confirmSensitive(L.persona(), "What is your salary expectation?", { marketRange });
  s.tool("132-career-apply salaryQuestion", r);
  s.agent(`I won't fill in a number you didn't approve — that field can anchor or knock you out. ${r.prompt}`);
  const ok = r.entered === false && /^Negotiable/.test(r.proposedDefault) && (!marketRange || /Stripe/.test(r.prompt));
  s.verify("guardian state: entered=false, no approved number existed, default is negotiable/open, and the only range shown carries its source", { ok, entered: r.entered });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: "Salary field guarded: no unapproved number entered; sourced market range offered with the negotiable default.", reason: ok ? null : "guardian entered or hid source", unblock: ok ? null : "Fix salaryQuestion in 132." });
})();
