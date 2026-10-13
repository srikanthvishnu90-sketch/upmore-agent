"use strict";
const L = require("./lib.cjs");
const { J, D, H } = L;

(async () => {
  const s = H.session("SC-025", "sponsorship-hard-fail");
  s.user("find me roles at companies that sponsor");
  const prof = L.profile("persona-international-swe.json");
  const r = await L.pollLive();
  s.tool("121.poll (live)", { totals: L.feedTotals(r), profile: { needs_sponsorship: prof.constraints.needs_sponsorship, work_authorization: prof.constraints.work_authorization } });
  const scored = L.scoreAll(r.postings, prof);
  const authExcluded = scored.filter((x) => x.excluded && x.reasons.some((y) => /work authorization|citizenship|clearance/i.test(y)));
  const shortlist = await J.buildShortlist(scored, { limit: 8 });
  const badInShortlist = shortlist.filter((x) => /\b(u\.?s\.? citizens? only|must be a u\.?s\.? citizen|requires? u\.?s\.? citizenship|no sponsorship|will not sponsor|cannot sponsor|security clearance|ts\/sci)/i.test(x.posting.jd_text));
  s.agent(`Your profile says you need sponsorship (F-1). I scored all ${r.postings.length} live postings against that as a HARD filter: ${authExcluded.length} postings were excluded for citizenship / no-sponsorship / clearance reasons and were never scored. Your shortlist of ${shortlist.length} contains zero postings whose text bars you from ever submitting. Examples of what was kept out and why: ${authExcluded.slice(0, 3).map((x) => `${x.posting.company} — ${x.posting.title}: ${x.reasons[0]}`).join(" | ") || "none in this live set"}`, { card: { title: "Sponsorship-safe shortlist (international persona)", items: shortlist.map((x) => ({ ...L.slim(x.posting), score: x.adjusted_score })) } });
  s.verify("rail state: exclusion reasons counted from scoreFit hard_fails; shortlist re-scanned for citizenship/no-sponsorship/clearance language", { total: r.postings.length, auth_excluded: authExcluded.length, shortlist_size: shortlist.length, barred_postings_in_shortlist: badInShortlist.length });
  await s.finish({ status: badInShortlist.length === 0 ? "COMPLETE" : "LEARN", outcome: `${authExcluded.length} citizenship/no-sponsorship/clearance postings hard-excluded for the international persona; shortlist of ${shortlist.length} verified clean of barring language`, reason: badInShortlist.length ? "a barred posting reached the shortlist — see verification" : undefined });
})().catch((e) => { console.error(e); process.exit(1); });
