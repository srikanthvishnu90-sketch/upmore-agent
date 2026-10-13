// SC-018 Build a list of 90 alumni of my high school working in tech
"use strict";
const L = require("./_w01-lib.cjs"); const { M, H } = L;
(async () => {
  const s = H.session("SC-018", "outreach-90-high-school-alumni-tech");
  const user = L.USERS.alex, profile = { school: "TEST University", high_school: "Hawthorn Woods TEST High School", current_employer: null };
  s.user("Build a list of 90 alumni of my high school working in tech");
  s.agent(`Your high school on file: ${profile.high_school}. Source note: there is no LinkedIn scraping — this list is built from your school's public alumni directory (fixture) plus your own export. Alumni-of-the-same-high-school is one of the warmest cold angles there is, and every draft will say so honestly.`);
  const techFirms = ["Google", "Meta", "Microsoft", "Stripe", "Datadog", "Palantir", "Ramp", "Plaid", "Netflix (TEST employer)", "Airbnb (TEST employer)"];
  const records = L.generate(130, techFirms, (i, firm) => ({ title: ["Software Engineer", "Product Manager", "Data Scientist", "Designer"][i % 4], seniority_band: "analyst", geography: ["New York", "San Francisco", "Chicago", "Seattle"][i % 4], office: ["New York", "San Francisco", "Chicago", "Seattle"][i % 4], schools: ["State University (TEST)"], high_school: i % 7 === 6 ? "Other TEST High School" : profile.high_school, factKind: "school", relationship_to_user: "same high school" }), 1818);
  await L.verifyPool(records, L.fixtureVerifier());
  const sourced = records.filter(c => c.high_school === profile.high_school);
  s.tool("sourcing filter (high-school alumni directory fixture)", { in: records.length, out: sourced.length });
  const supp = M.createSuppressionStore();
  const pool = M.buildList(sourced, { count: 90, firms: [] }, { profile, suppression: supp, userId: "u-alex", nowMs: L.NOW });
  const card = M.listReviewCard(pool, null);
  s.tool("124.buildList", { yield: pool.yield }); s.card({ title: "List — 90 high-school alumni in tech", ...card });
  const { drafts, tiers, gatePass } = L.draftAll(pool.selected, user);
  s.tool("124.draftAndGate", { drafted: drafts.length, gate_pass: gatePass, tiers });
  L.sampleDrafts(s, drafts, 2, "SC-018");
  s.verify("90 selected, all from the user's high school, all in tech", { selected: pool.selected.length, all_hs: pool.selected.every(c => c.high_school === profile.high_school), gate_pass: gatePass });
  const ok = pool.selected.length === 90 && gatePass === 90;
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `List of 90 alumni of the user's high school working in tech built and fully drafted (gate 90/90), ready for the approval card — the scenario asks for the list, so nothing was sent. Alumni were labeled TEST fixtures from a fixture alumni directory.`, reason: ok ? undefined : "counts off", unblock: ok ? undefined : "inspect pool" });
})();
