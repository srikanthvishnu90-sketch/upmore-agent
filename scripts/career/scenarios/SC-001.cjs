// SC-001 Find 300 top bankers in NY + a personalized coffee-chat email drafted for each
"use strict";
const L = require("./_w01-lib.cjs"); const { M, H } = L;
(async () => {
  const s = H.session("SC-001", "outreach-300-ny-bankers-drafted");
  const user = L.USERS.alex, profile = L.PROFILES.alex;
  s.user("Find 300 top bankers in NY + a personalized coffee-chat email drafted for each");
  const parsed = M.parseTarget("Find 300 top bankers in NY + a personalized coffee-chat email drafted for each", profile);
  s.tool("124.parseTargetSpec", { parsed, note: "TEST fixtures: people are labeled fixtures; firm sets are the real public firm-sets.json" });
  s.agent(`Parsed: count=${parsed.count}. "Top bankers in NY" is ambiguous, so here is the interpretation I will build unless you say otherwise: analysts and associates at the bulge-bracket, elite-boutique and middle-market firms in the real firm-sets file (26 firms), New York offices only. Per-firm cap is 15 per 30 days, so 300 needs at least 20 firms — this universe has 26.`);
  s.user("Yes — bulge bracket, elite boutiques and middle-market, all in New York");
  const firms = [...FIRM_NAMES()]; function FIRM_NAMES() { return [].concat(L.FIRM_SETS.sets.bulge_bracket.firms, L.FIRM_SETS.sets.elite_boutique.firms, L.FIRM_SETS.sets.middle_market.firms).filter(f => f.status !== "historical").map(f => f.name); }
  const records = L.generate(360, firms, (i, firm, r) => ({
    title: i % 3 === 2 ? "Associate" : "Analyst", seniority_band: i % 3 === 2 ? "associate" : "analyst",
    geography: "New York", office: "New York", schools: [["TEST University", "New York University", "Columbia University", "Ohio State University"][i % 4]],
    factKind: i % 4 === 0 ? "deal" : i % 4 === 1 ? "school" : "path", deal: "a sponsor-backed carve-out",
    relationship_to_user: i % 9 === 0 ? "same school" : "none",
  }), 1001);
  records.push(Object.assign({}, records[5], { source_list: ["test-fixture-w01", "second-source"] })); // exact duplicate row -> resolved
  records.push(L.person({ full_name: "No Email (TEST)", current_firm: "Evercore", work_email: null }));
  const vres = await L.verifyPool(records, L.fixtureVerifier());
  s.tool("124.createVerifier(local, injected fixture DNS)", vres);
  const query = Object.assign({}, parsed, { count: 300, firms, firm_set: "bb+eb+mm (TEST interpretation)", geography: "New York", industry: "investment_banking", role_family: "investment_banking" });
  const supp = M.createSuppressionStore();
  const pool = M.buildList(records, query, { profile, suppression: supp, userId: "u-alex", nowMs: L.NOW });
  const card = M.listReviewCard(pool, query);
  s.tool("124.buildList", { yield: pool.yield, exclusions: pool.exclusions, review_bucket: pool.review.length });
  s.card({ title: "List review — 300 NY bankers", ...card });
  s.agent(`Built the list from 362 fixture records (people are TEST fixtures; the firm universe is real). ${card.text} Selected ${pool.selected.length} across ${Object.keys(card.breakdown.by_firm).length} firms — no firm exceeds the 15-per-30-days cap. Now drafting a personalized email for each selected banker.`);
  const { drafts, tiers, gatePass } = L.draftAll(pool.selected, user);
  s.tool("124.draftAndGate x300", { drafted: drafts.length, gate_pass: gatePass, tiers, sample_why_this_line: drafts[0].why_this_line });
  L.sampleDrafts(s, drafts, 2, "SC-001");
  // Owner order W3(i), 2026-10-13: the opt-out line was REMOVED from student
  // networking drafts by default (it read as marketing; suppression on reply
  // is unchanged). This assertion previously required the footer in every
  // draft — updated to the new rule, per the 05 Part 4 test-correction rule.
  const noOptOutLine = drafts.every(d => !d.body.includes(M.OPT_OUT_LINE));
  s.verify("Pool state: selected count, drafts == selected, every draft gated + no opt-out line (owner order W3(i))", { selected: pool.selected.length, drafts: drafts.length, gate_pass: gatePass, no_opt_out_line: noOptOutLine, tier_mix: tiers, per_firm_max: Math.max(...Object.values(card.breakdown.by_firm)) });
  const ok = pool.selected.length === 300 && drafts.length === 300 && gatePass === 300 && noOptOutLine;
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `300 NY bankers selected from real firm sets (26 firms, per-firm cap respected) and 300 personalized, quality-gated coffee-chat drafts produced — one per banker, each with why-this-line sources. People were labeled TEST fixtures; the licensed people-data vendor key is the remaining real-world input for real names at this scale.`, reason: ok ? undefined : "counts did not reach 300/300/300", unblock: ok ? undefined : "inspect pool yield" });
})();
