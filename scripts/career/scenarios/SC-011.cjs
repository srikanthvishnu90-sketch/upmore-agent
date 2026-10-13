// SC-011 I upload a spreadsheet of 200 names: verify, dedupe, draft, ask before enriching
"use strict";
const fs = require("fs");
const L = require("./_w01-lib.cjs"); const { M, H } = L;
(async () => {
  const s = H.session("SC-011", "outreach-upload-200-spreadsheet");
  const user = L.USERS.alex, profile = L.PROFILES.alex;
  s.user("I upload a spreadsheet of 200 names: verify, dedupe, draft, ask before enriching");
  // TEST fixture spreadsheet (labeled): 200 rows with planted duplicates, bad addresses, no-email rows.
  const firms = ["Evercore", "Lazard", "Goldman Sachs", "Baird", "William Blair", "Jefferies", "Houlihan Lokey", "Piper Sandler"];
  const base = L.generate(178, firms, (i) => ({ title: "Analyst", seniority_band: "analyst", geography: "New York", office: "New York", schools: ["TEST University"], factKind: "path" }), 1111);
  const rows = base.map(c => [c.full_name, c.current_firm, c.title, c.work_email, c.schools[0]]);
  for (let i = 0; i < 10; i++) rows.push([base[i].full_name, base[i].current_firm, base[i].title, base[i].work_email, base[i].schools[0]]); // exact dupes
  for (let i = 0; i < 4; i++) rows.push([base[20 + i].full_name, base[20 + i].current_firm, base[20 + i].title, "", base[20 + i].schools[0]]); // same identity, second source w/o email (merges)
  for (let i = 0; i < 4; i++) rows.push(["Bad Domain " + i + " (TEST)", "Evercore", "Analyst", "bad" + i + "@nomx.test", "TEST University"]); // no-MX -> invalid
  for (let i = 0; i < 4; i++) rows.push(["No Email " + i + " (TEST)", "Lazard", "Analyst", "", "TEST University"]);
  const csv = "name,firm,title,email,school\n" + rows.map(r => r.join(",")).join("\n");
  fs.writeFileSync("/tmp/sc011-upload-fixture.csv", csv);
  s.tool("uploaded spreadsheet received (TEST fixture, /tmp/sc011-upload-fixture.csv)", { rows: rows.length, columns: ["name", "firm", "title", "email", "school"] });
  const records = rows.map((r, i) => L.person({ full_name: r[0], current_firm: r[1], title: r[2], work_email: r[3] || null, schools: [r[4]], geography: "New York", office: "New York", factKind: "path", source_list: ["uploaded-spreadsheet-fixture"] }));
  const vres = await L.verifyPool(records.filter(c => c.work_email), L.fixtureVerifier(["nomx.test"]));
  s.tool("124.createVerifier verify pass over uploaded emails", vres);
  const supp = M.createSuppressionStore();
  const pool = M.buildList(records, { count: 500, firms: [] }, { profile, suppression: supp, userId: "u-alex", nowMs: L.NOW });
  s.tool("124.buildList (resolveCandidates dedupe inside)", { yield: pool.yield, exclusions: pool.exclusions, review_bucket: pool.review.map(r => ({ name: r.full_name, reason: r.review_reason })) });
  s.agent(`Verified and deduped your 200 rows: ${pool.yield.resolved} unique people after merging duplicates, ${pool.review.length} ambiguous rows parked in the review bucket (never sent), ${vres.invalid} invalid addresses dropped, ${pool.exclusions.no_email} rows have no email at all. ${pool.yield.sendable} are sendable. Before I draft: ${pool.selected.filter(c => !c.personalization_facts.length).length} of the first-window names have no personalization fact in the sheet. Enriching (finding a real fact per person from public sources) costs time and a vendor lookup per name — do you want me to enrich those, or draft Tier B/C for them as-is? I will not enrich without your yes.`);
  s.card({ title: "Enrichment — asking first (nothing enriched yet)", enrichment_run: false, missing_fact_people: pool.selected.filter(c => !c.personalization_facts.length).length, options: ["Enrich them", "Draft as-is"] });
  s.user("Draft as-is — no enrichment");
  s.tool("enrichment decision recorded", { enrichment_run: false, user_decision: "draft_as_is" });
  const identified = [...pool.selected, ...pool.reserve];
  const { drafts, tiers, gatePass, retried } = L.draftAll(identified, user);
  s.tool("124.draftAndGate (all sendable)", { drafted: drafts.length, gate_pass: gatePass, tiers, retried_after_duplicate_gate: retried });
  L.sampleDrafts(s, drafts, 2, "SC-011");
  s.verify("Dedupe + verify + no-enrichment proven from rail state", { uploaded_rows: 200, resolved_unique: pool.yield.resolved, review_bucket: pool.review.length, invalid_dropped: vres.invalid, sendable: pool.yield.sendable, enrichment_run: false, gate_pass: gatePass });
  const ok = pool.yield.resolved < 200 && vres.invalid === 4 && gatePass === drafts.length && drafts.length === pool.yield.sendable;
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `Spreadsheet of 200 fixture rows verified (4 invalid dropped), deduped to ${pool.yield.resolved} unique people (review bucket: ${pool.review.length}), all sendable drafted and gated — and enrichment was ASKED about and NOT run after the user declined. All people were labeled TEST fixtures from the fixture spreadsheet.`, reason: ok ? undefined : "dedupe/verify counts off", unblock: ok ? undefined : "inspect yield" });
})();
