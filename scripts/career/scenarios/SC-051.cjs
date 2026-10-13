"use strict";
<<<<<<< HEAD
const { H, M, NOW, PROFILE, poolOverFirms } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-051", "big-law-lawyers-from-my-school");
  const q = M.parseTarget("Find 35 lawyers at Big Law firms from my school for exploratory chats", PROFILE);
  const records = poolOverFirms(q.firms, 4, { per: (i) => ({ title: "Associate", seniority_band: "associate" }) });
  records.push(poolOverFirms(q.firms.slice(0, 1), 1, { startIndex: 900, per: () => ({ geography: "London", office: "London", country: "GB" }) })[0]);
  const pool = M.buildList(records, q, { profile: PROFILE, nowMs: NOW });
  s.user("Find 35 lawyers at Big Law firms from my school for exploratory chats");
  s.tool("124.parseTarget+buildList", { firm_set: q.firm_set, firms: q.firms.length, yield: pool.yield });
  s.agent(`Found ${pool.selected.length} Michigan lawyers at Big Law firms for exploratory chats. Sample: ${pool.selected.slice(0, 5).map((c) => `${c.full_name} — ${c.title}, ${c.current_firm}`).join("; ")}. (${pool.exclusions.eu_uk} EU/UK record excluded by the v1 rule.)`);
  s.verify("selection read back: exactly 35, every firm in the big_law set, every person from the user's school", { selected: pool.selected.length, firms_ok: pool.selected.every((c) => q.firms.includes(c.current_firm)), school_ok: pool.selected.every((c) => (c.schools || []).includes("University of Michigan")) });
  await s.finish({ status: "COMPLETE", outcome: `35 lawyers at Big Law firms from the user's school selected and verified from buildList state (new big_law firm set, 12 firms)` });
=======
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-051", "sensitive-sponsorship-confirm");
  s.user("apply for me — the form is asking: will you require sponsorship?");
  const p = L.intlPersona();
  const first = L.Apply.confirmSensitive(p, "Will you now or in the future require sponsorship?");
  s.tool("132-career-apply confirmSensitive (before confirmation)", first);
  s.agent(`This one matters legally, so I stopped before entering anything. ${first.prompt}`);
  const notEntered = first.entered === false && first.savedAnswer === "Yes — F-1 OPT then H-1B.";
  s.user("yes, use it");
  const after = L.Apply.confirmSensitive(p, "Will you now or in the future require sponsorship?", { confirmed: true });
  s.tool("132-career-apply confirmSensitive (after user yes)", after);
  s.agent(`Entered exactly your saved answer: '${after.answer}' — confirmation state recorded as ${after.confirmationState}. Nothing else on the form was guessed.`);
  s.verify("before the yes: entered=false and the saved answer quoted verbatim from the international persona's constraints/F-001 fact; after the yes: entered=true with the identical string", { notEntered, afterEntered: after.entered, afterAnswer: after.answer, verbatim: after.answer === "Yes — F-1 OPT then H-1B." });
  await s.finish({ status: notEntered && after.entered ? "COMPLETE" : "LEARN", outcome: "Sponsorship question stopped the flow; saved answer 'Yes — F-1 OPT then H-1B.' confirmed verbatim before entry (APPE-005).", reason: notEntered ? null : "answer entered or misquoted before confirmation", unblock: notEntered ? null : "Fix confirmSensitive in 132." });
>>>>>>> origin/career/sc-f03
})();
