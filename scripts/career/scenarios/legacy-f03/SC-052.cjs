"use strict";
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-052", "salary-question-never-invented");
  s.user("apply for me — the form is asking my salary expectation");
  const postings = await L.feed("greenhouse", "stripe");
  const withPay = postings.find((p) => /\$\s?\d/.test(p.jd_text) && /engineer/i.test(p.title));
  const snippet = withPay ? (withPay.jd_text.match(/.{0,60}\$\s?\d[^.]{0,60}/) || [])[0] : null;
  const marketRange = snippet ? { range: snippet.trim(), source: `Stripe's own live posting "${withPay.title}" (${withPay.url})` } : null;
  s.tool("121-career-jobs sourced pay range from a real Stripe posting", { posting: withPay && withPay.title, url: withPay && withPay.url, snippet });
  const r = L.Apply.confirmSensitive(L.persona(), "What is your salary expectation?", { marketRange });
  s.tool("132-career-apply salaryQuestion", r);
  s.agent(`${r.prompt}`);
  const ok = r.entered === false && r.proposedDefault.startsWith("Negotiable") && (!marketRange || r.prompt.includes("Stripe"));
  s.verify("no number was entered (entered=false, no userApprovedNumber anywhere); default is negotiable/open; the only range shown carries its source (the live posting)", { entered: r.entered, proposedDefault: r.proposedDefault, marketRange: r.marketRange });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: "Salary question: nothing invented or entered; user asked with a sourced range from Stripe's own posting and the negotiable/open default.", reason: ok ? null : "salary seam entered a number or hid its source", unblock: ok ? null : "Fix salaryQuestion in 132." });
})();
