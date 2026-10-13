// SC-013 Find 200 associates at mega-fund PE firms who went to Big Ten schools
"use strict";
const L = require("./_w01-lib.cjs"); const { M, H } = L;
(async () => {
  const s = H.session("SC-013", "outreach-200-megafund-pe-big-ten");
  const user = L.USERS.jordanWharton, profile = L.PROFILES.jordanWharton;
  s.user("Find 200 associates at mega-fund PE firms who went to Big Ten schools");
  const q = M.parseTarget("Find 200 associates at mega-fund private equity firms who went to Big Ten schools", profile);
  s.tool("124.parseTargetSpec", q);
  // firm-sets.json's mega_fund_pe set has 5 firms (cap 75/window). The runner extends the universe with
  // additional large-cap PE firms as a LABELED fixture firm list so 200 is reachable under the per-firm cap.
  const fixtureExtraPE = ["Warburg Pincus", "Advent International", "Clayton, Dubilier & Rice", "Hellman & Friedman", "Silver Lake", "Vista Equity Partners", "Thoma Bravo", "General Atlantic", "TA Associates"];
  const firms = [].concat(L.FIRM_SETS.sets.mega_fund_pe.firms.map(f => f.name), fixtureExtraPE);
  s.tool("firm universe", { from_firm_sets_json: L.FIRM_SETS.sets.mega_fund_pe.firms.map(f => f.name), fixture_extension_labeled: fixtureExtraPE, total: firms.length });
  const BIG_TEN = ["University of Michigan", "Ohio State University", "Penn State University", "Indiana University", "University of Illinois", "University of Wisconsin", "University of Minnesota", "University of Iowa", "Purdue University", "Nebraska", "Rutgers University", "University of Maryland", "Michigan State University", "Northwestern University"];
  const records = L.generate(320, firms, (i, firm) => ({ title: "Associate", seniority_band: "associate", geography: ["New York", "Chicago", "Los Angeles"][i % 3], office: ["New York", "Chicago", "Los Angeles"][i % 3], schools: [i % 6 === 5 ? "Harvard University" : BIG_TEN[i % BIG_TEN.length]], factKind: "deal", deal: "a platform buyout" }), 1313);
  await L.verifyPool(records, L.fixtureVerifier());
  const sourced = records.filter(c => c.schools.some(x => BIG_TEN.includes(x)));
  s.tool("sourcing filter (Big Ten schools)", { in: records.length, out: sourced.length });
  const supp = M.createSuppressionStore();
  const pool = M.buildList(sourced, { count: 200, firms, role_family: "private_equity", seniority_band: "associate" }, { profile, suppression: supp, userId: "u-jordan", nowMs: L.NOW });
  const card = M.listReviewCard(pool, q);
  s.tool("124.buildList", { yield: pool.yield }); s.card({ title: "List review — 200 mega-fund PE associates, Big Ten", ...card });
  const { drafts, tiers, gatePass } = L.draftAll(pool.selected, user);
  s.tool("124.draftAndGate", { drafted: drafts.length, gate_pass: gatePass, tiers });
  L.sampleDrafts(s, drafts, 2, "SC-013");
  s.user("Approved — start the waves");
  const campaign = M.createCampaign({ id: "sc013-campaign", userId: "u-jordan", approved: true });
  M.enqueue(campaign, pool.selected.map((c, i) => ({ candidate: c, draft: drafts[i] })), { suppression: supp });
  const plan = M.planWave(campaign, { waveNumber: 1, seed: 13 });
  const transport = L.testTransport();
  const sentRes = await M.sendPending(campaign, { transport, suppression: supp, maxItems: plan.scheduled, nowIso: L.NOW_ISO });
  s.tool("124.sendPending (TEST transport)", { days: plan.days, ...sentRes });
  const allBigTen = pool.selected.every(c => c.schools.some(x => BIG_TEN.includes(x)));
  s.verify("200 selected, all Big Ten, all associates", { selected: pool.selected.length, all_big_ten: allBigTen, all_associates: pool.selected.every(c => c.seniority_band === "associate"), gate_pass: gatePass, sent_wave1: sentRes.sent });
  const ok = pool.selected.length === 200 && allBigTen && gatePass === 200 && sentRes.sent === plan.scheduled;
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `200 mega-fund PE associates from Big Ten schools selected and drafted (gate 200/200), wave 1 sent via TEST seed inbox. People were labeled TEST fixtures; 9 of the 14 firms are a labeled fixture extension beyond firm-sets.json's 5-firm mega-fund set.`, reason: ok ? undefined : "counts off", unblock: ok ? undefined : "inspect pool" });
})();
