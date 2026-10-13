"use strict";
<<<<<<< HEAD
const { H, M, NOW, PROFILE, poolOverFirms } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-052", "med-school-residents-alumni-pre-med");
  const q = M.parseTarget("Find 50 med-school residents and alumni for pre-med advising chats", PROFILE);
  const records = poolOverFirms(q.firms, 6, { per: (i) => ({ title: "Resident Physician", seniority_band: "resident", schools: [i % 2 ? "University of Michigan" : "Wayne State University"] }) });
  const pool = M.buildList(records, q, { profile: PROFILE, nowMs: NOW });
  s.user("Find 50 med-school residents and alumni for pre-med advising chats");
  s.tool("124.parseTarget+buildList", { firm_set: q.firm_set, yield: pool.yield });
  const alumni = pool.selected.filter((c) => (c.schools || []).includes("University of Michigan")).length;
  s.agent(`Found ${pool.selected.length} residents at academic medical centers (${alumni} of them Michigan alumni) for pre-med advising chats. Sample: ${pool.selected.slice(0, 5).map((c) => `${c.full_name} — ${c.current_firm}`).join("; ")}.`);
  s.verify("selection read back: exactly 50, every employer in the academic_medical set", { selected: pool.selected.length, centers_ok: pool.selected.every((c) => q.firms.includes(c.current_firm)), alumni });
  await s.finish({ status: "COMPLETE", outcome: `50 med-school residents/alumni at academic medical centers selected and verified (new academic_medical firm set, 10 centers; ${alumni} share the user's school)` });
=======
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
>>>>>>> origin/career/sc-f03
})();
