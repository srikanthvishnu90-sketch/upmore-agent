"use strict";
/* Finisher lane C: unit tests for the SC-242/243/244 dataset parsers + dataset integrity.
   Run: node --test tests/career-evidence-fin-c.test.cjs */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const X = require(path.join(ROOT, "scripts/career/datasets/extract-posting-signals.cjs"));
const DS = path.join(ROOT, "packages/career-data/datasets");

test("extractor: requirement-context major counts", () => {
  const s = X.signalsFor("Requirements: a bachelor's degree in computer science or a related field, or equivalent experience.");
  assert.equal(s.bachelor_required_or_preferred, true);
  assert.equal(s.specific_majors_named, true);
  assert.equal(s.cs_or_related_field, true);
  assert.equal(s.no_degree_or_equivalent_experience, true);
});

test("FIN-C-001 replay: boilerplate major words do not count", () => {
  const s = X.signalsFor("About us: we are building the future of finance for modern finance teams. You will ship product with a world-class team.");
  assert.equal(s.specific_majors_named, false);
  assert.equal(s.any_degree_signal, false);
});

test("extractor: aggregate counts postings once per signal", () => {
  const agg = X.aggregatePostings([
    { company: "acme", title: "Eng", jd_text: "degree degree degree in mathematics, bachelor's required" },
    { company: "acme", title: "PM", jd_text: "no education language here" },
  ]);
  assert.equal(agg.totals.postings, 2);
  assert.equal(agg.companies[0].signals.specific_majors_named, 1);
  assert.equal(agg.companies[0].signals.bachelor_required_or_preferred, 1);
});

test("BLS dataset: sourced, bounded, persona occupations present", () => {
  const bls = JSON.parse(fs.readFileSync(path.join(DS, "bls-labor-data.json"), "utf8"));
  assert.equal(bls.retrieved_at, "2026-10-13");
  const occ = Object.fromEntries(bls.occupations.map((o) => [o.occupation, o]));
  for (const name of ["Software developers", "Financial analysts", "Management analysts"]) {
    assert.ok(occ[name].growth_pct_2024_34_group > 0, name);
    assert.ok(occ[name].median_annual_wage_usd_may2024 > 0, name);
    assert.match(occ[name].source_url, /^https:\/\/www\.bls\.gov\//);
  }
  const rows = Object.fromEntries(bls.earnings_by_educational_attainment_2024.rows.map((r) => [r.attainment, r]));
  assert.ok(rows["Master's degree"].median_weekly_earnings_usd > rows["Bachelor's degree"].median_weekly_earnings_usd);
  assert.ok(bls.known_limits.length >= 2);
});

test("134 evidence functions pass verifyClaims + lintAdvice (FIN-C-002 replay)", () => {
  const CI = require(path.join(ROOT, "packages/domain/125-career-intel.js"));
  const CP = require(path.join(ROOT, "packages/domain/134-career-paths.js"));
  const bls = JSON.parse(fs.readFileSync(path.join(DS, "bls-labor-data.json"), "utf8"));
  for (const fn of ["aiJobOutlookRead", "gradSchoolROIRead"]) {
    const ans = CP[fn](bls, { now: "2026-10-13" });
    const v = CI.verifyClaims(ans.text, ans.claims, { allowedNumbers: ans.allowed_numbers || [] });
    assert.ok(v.ok, `${fn} verifyClaims: ${JSON.stringify(v.errors)}`);
    assert.ok(CI.lintAdvice(ans.text).ok, `${fn} lintAdvice: ${JSON.stringify(CI.lintAdvice(ans.text).violations)}`);
  }
  const postings = JSON.parse(fs.readFileSync(path.join(DS, "posting-degree-signals.json"), "utf8"));
  const lca = JSON.parse(fs.readFileSync(path.join(DS, "dol-lca-fy2025q4-cir-companies.json"), "utf8"));
  const ans = CP.majorPopulationRead(postings, lca, { now: "2026-10-13" });
  const v = CI.verifyClaims(ans.text, ans.claims, { allowedNumbers: ans.allowed_numbers || [] });
  assert.ok(v.ok, `majorPopulationRead verifyClaims: ${JSON.stringify(v.errors)}`);
  assert.ok(CI.lintAdvice(ans.text).ok, `majorPopulationRead lintAdvice: ${JSON.stringify(CI.lintAdvice(ans.text).violations)}`);
});

test("LCA dataset: aggregate only, CIR companies, wage stats sane", () => {
  const lca = JSON.parse(fs.readFileSync(path.join(DS, "dol-lca-fy2025q4-cir-companies.json"), "utf8"));
  assert.ok(lca.rows_scanned > 100000);
  assert.ok(lca.companies.length >= 25, `expected >=25 CIR companies with filings, got ${lca.companies.length}`);
  for (const c of lca.companies) {
    assert.ok(c.lca_cases > 0);
    assert.ok(!("raw_rows" in c), "aggregate only — no raw rows ship");
    if (c.wage_annualized_usd) assert.ok(c.wage_annualized_usd.median > 30000 && c.wage_annualized_usd.median < 600000);
  }
});

test("posting dataset: aggregate from real posting text, coverage labeled", () => {
  const p = JSON.parse(fs.readFileSync(path.join(DS, "posting-degree-signals.json"), "utf8"));
  assert.ok(p.totals.postings > 2000);
  assert.ok(p.totals.companies >= 8);
  assert.ok(p.totals.signals.specific_majors_named < p.totals.postings, "boilerplate fix: majors-named must be a minority signal");
  assert.match(p.coverage, /population of postings, not of hires/i);
});
