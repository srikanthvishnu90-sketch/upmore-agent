// Guard for BUG-219 / FR-376 (role lens) + BUG-220 / FR-377 (the
// product reads its own career knowledge library).
//   BUG-219: "how does it compare to Snowflake for PM?" was answered
//     with the Snowflake file's SWE entry bar ("coding-first bar…").
//     A company-intel answer must serve the ASKED role's bar — and
//     when the file carries no bar for that role, say so honestly
//     instead of serving another role's bar as if it answered.
//   BUG-220: grep career_kb_ across product code returned ZERO — the
//     861-role library (career_kb_* tables) had no reader. Module 153
//     is the read seam (injected live rows later; embedded aggregates
//     generated from the same library files by default), and 125's
//     intel answers draw on it, citing stats WITH their n.
// Check: node --test tests/career-intel-kb.test.cjs
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const CI = require(path.join(root, "packages/domain/125-career-intel.js"));
const KB = require(path.join(root, "packages/domain/153-career-kb.js"));
const AGG = JSON.parse(fs.readFileSync(path.join(root, "packages/career-data/kb-aggregates.json"), "utf8"));

const loadCir = (id) => JSON.parse(fs.readFileSync(path.join(root, "packages/career-data/cirs", `${id}.json`), "utf8"));
const NOW = "2026-10-12";

// CIR-shaped fixture: the real Snowflake file (SWE cohort, coding-first
// bar) + a distinct per-role PM bar, the shape probe P5 hit.
function snowflakeWithPmBar() {
  const cir = structuredClone(loadCir("snowflake"));
  cir.role_bars = [{
    role: "product manager",
    bar: {
      statement: "PM-BAR-FIXTURE: product-sense and metrics bar — candidates defend a product decision with data, run a metrics deep-dive, and show roadmap judgment.",
      source_url: "https://careers.snowflake.com/us/en/generalsoftwareengineeringprogram",
      as_of: NOW, kind: "qualitative",
    },
  }];
  return cir;
}

test("[FR-376] Snowflake-for-PM serves the PM bar, never the SWE bar", () => {
  const cir = snowflakeWithPmBar();
  assert.equal(CI.validateCIR(cir, { now: NOW }).ok, true, "fixture with role_bars must validate");
  const lens = CI.barForRole(cir, "PM");
  assert.equal(lens.status, "role-bar");
  assert.match(lens.text, /PM-BAR-FIXTURE/);
  assert.doesNotMatch(lens.text, /Coding-first/);
  const ans = CI.answerRoleIntel(cir, "how does it compare to Snowflake for PM?");
  assert.equal(ans.lens_status, "role-bar");
  assert.match(ans.text, /PM-BAR-FIXTURE/);
  assert.doesNotMatch(ans.text, /Coding-first/);
});

test("[FR-376] no PM bar in the file → honest no-bar statement, never the SWE bar", () => {
  const cir = loadCir("snowflake"); // shipped shape: SWE cohort only, no role_bars
  const lens = CI.barForRole(cir, "PM");
  assert.equal(lens.status, "no-role-bar");
  assert.equal(lens.bar, null);
  assert.match(lens.text, /no product management bar/i);
  assert.doesNotMatch(lens.text, /Coding-first/);
  const ans = CI.answerRoleIntel(cir, "how does it compare to Snowflake for PM?");
  assert.doesNotMatch(ans.text, /Coding-first/);
  assert.match(ans.text, /no product management bar/i);
  // …and through the thesis path: the bottom line carries the honest
  // statement instead of the SWE bar.
  const th = CI.composeThesis(cir, { skills: [], internships: [], projects: [] }, { now: NOW, role: "PM" });
  assert.match(th.sections.bottom_line, /no product management bar/i);
  assert.doesNotMatch(th.sections.bottom_line, /Coding-first/);
  // The asked-for-cohort case still serves the cohort bar.
  assert.equal(CI.barForRole(cir, "software engineering").status, "cohort-bar");
  assert.match(CI.barForRole(cir, "software engineering").text, /Coding-first/);
});

test("[FR-377] role-stats questions cite a number AND its n, from the embedded aggregates (3 roles, 3 sectors)", () => {
  const asks = [
    { q: "what does it take for data analyst", key: "data-analyst" },
    { q: "software engineer", key: "software-engineer" },
    { q: "welder", key: "welders-cutters-solderers-brazers" },
  ];
  const sectors = new Set();
  for (const { q, key } of asks) {
    const st = KB.roleStats(q);
    assert.equal(st.found, true, `${q} must resolve in the library`);
    assert.equal(st.role.key, key);
    sectors.add(st.role.sector);
    assert.ok(st.skills.length > 0, `${key} must carry evidenced skills`);
    // The citation must be the embedded file's own figure: take the
    // row's top skill and require its exact pct + n in the text.
    const row = AGG.roles.find((r) => r.key === key);
    const top = row.skills[0];
    const text = KB.formatRoleStats(st);
    assert.match(text, /% of postings \(n=[\d,]+\)/, `${key} citation must carry % AND n`);
    assert.ok(text.includes(`${top.pct}%`), `${key}: cited pct must be the file's (${top.pct})`);
    assert.ok(text.includes(`n=${Number(top.n).toLocaleString("en-US")}`), `${key}: cited n must be the file's (${top.n})`);
  }
  assert.ok(sectors.size >= 3, `expected 3 distinct sectors, got ${[...sectors]}`);
});

test("[FR-377] the composed intel answer draws on the KB for a role question", () => {
  const cir = loadCir("snowflake");
  const ans = CI.answerRoleIntel(cir, "what does it take for data analyst");
  assert.ok(ans.kb && ans.kb.found, "intel answer must carry KB stats");
  assert.match(ans.text, /% of postings \(n=[\d,]+\)/);
});

test("[FR-377] injected source overrides and extends the embedded data (the live-rows seam)", () => {
  const injected = [
    { key: "data-analyst", title: "Data Analyst", headline: "INJECTED-HEADLINE", skills: [{ skill: "InjectedSkill", pct: 99, n: 7, basis: "test-injected" }] },
    { key: "chief-orb-weaver", title: "Chief Orb Weaver", headline: "Weaves orbs.", skills: [{ skill: "Orb Weaving", pct: 88, n: 12, basis: "test-injected" }] },
  ];
  const over = KB.roleStats("data analyst", { kbSource: injected });
  assert.equal(over.headline, "INJECTED-HEADLINE");
  assert.equal(over.skills[0].skill, "InjectedSkill");
  const ext = KB.roleStats("chief orb weaver", { kbSource: injected });
  assert.equal(ext.found, true, "injected rows extend the library with new roles");
  const stillEmbedded = KB.roleStats("welder", { kbSource: injected });
  assert.equal(stillEmbedded.found, true, "embedded roles remain reachable alongside injected rows");
  // Raw career_kb_* row shapes (knowledge-db.md) adapt through fromDbRows.
  const adapted = KB.roleStats("widget wrangler", {
    kbSource: {
      roles: [{ role_key: "split:widget-wrangler", title: "Widget Wrangler", soc_code: "51-0000", brief: "Wranglers wrangle widgets daily. They also file reports." }],
      roleSkills: [{ role_key: "split:widget-wrangler", exact_skills: "Widgetry in 50% of postings (n=200 postings analyzed).", postings_basis_n: 200 }],
    },
  });
  assert.equal(adapted.found, true);
  assert.match(KB.formatRoleStats(adapted), /50% of postings \(n=200\)/);
});

test("[FR-377] unknown role → honest no-data answer, never another role's stats", () => {
  const st = KB.roleStats("underwater basket weaving chief");
  assert.equal(st.found, false);
  const text = KB.formatRoleStats(st);
  assert.match(text, /no data/i);
  assert.doesNotMatch(text, /%/, "no percentage may be quoted for an unknown role");
  const ans = CI.answerRoleIntel(loadCir("snowflake"), "what does it take for underwater basket weaving chief");
  assert.doesNotMatch(ans.text, /% of postings/, "the composed answer must not borrow stats either");
});
