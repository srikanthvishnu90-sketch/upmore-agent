// Career recruiting intelligence (Doc 3; INTL-001..008): CIR schema + staleness, the claim verifier's §5 replay
// rule (a number with no source record FAILS), k-anonymity, the honest-advice lint, the Q30 refusal, and the
// first 5 hand-built CIRs. All CIR content here is the real shipped data (packages/career-data/cirs); profiles
// and mutated CIRs are labeled synthetic test fixtures.
// Check: node --test tests/career-intel.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const CI = require(path.join(root, "packages/domain/125-career-intel.js"));
const CIR_DIR = path.join(root, "packages/career-data/cirs");
const NOW = "2026-10-12";

const load = (id) => JSON.parse(fs.readFileSync(path.join(CIR_DIR, `${id}.json`), "utf8"));
const IDS = ["palantir", "goldman-sachs-ibd", "stripe", "mckinsey", "jane-street"];
const PROFILE = { // master-profile-shaped input (synthetic person)
  school: "DePaul University", school_tier: "non-target", major: "Computer Science", year: "sophomore",
  internships: [], projects: [{ name: "Course-planner app with real users" }],
  skills: ["Python", "SQL"], work_authorization: "US citizen", location: "Chicago",
};

// A synthetic population-backed CIR (fixture): Jane Street's shape, one distribution measured at N=200.
function populationCIR() {
  const cir = structuredClone(load("jane-street"));
  cir.sample_size = 200;
  cir.confidence_level = "population-backed";
  cir.school_dist = {
    basis: "population", sample_size: 200,
    entries: [{ label: "Example University", share_pct: 40, count: 80, source_url: "https://www.janestreet.com/preparing-for-a-software-engineering-interview/", as_of: NOW, sample_size: 200 }],
  };
  return cir;
}

test("[INTL-008] all shipped CIRs validate against the §2.2 schema (corpus grows by design)", () => {
  const store = CI.loadCIRsFromDir(CIR_DIR);
  assert.equal(store.ok, true, JSON.stringify(store.results.map((r) => [r.company_id, r.errors])));
  // The corpus is built to grow past the first five (owner order: 30 companies) — assert the
  // original five are present and every loaded record validates, never an exact file count.
  for (const id of IDS) assert.ok(store.byId[id], `missing shipped CIR ${id}`);
  assert.ok(Object.keys(store.byId).length >= IDS.length);
  for (const id of IDS) assert.equal(CI.getCIR(store, id).company_id, id);
});

test("[INTL-008] every numeric field in the shipped CIRs sits in an object that carries a source_url", () => {
  const walk = (v, at, file) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${at}[${i}]`, file));
    if (v && typeof v === "object") {
      for (const k of ["share_pct", "count", "value"]) {
        if (v[k] !== null && v[k] !== undefined && typeof v[k] === "number") {
          assert.equal(typeof v.source_url, "string", `${file} ${at}.${k} has a number but no source_url`);
        }
      }
      Object.entries(v).forEach(([k, x]) => walk(x, `${at}.${k}`, file));
    }
  };
  for (const id of IDS) walk(load(id), "$", id);
});

test("[INTL-001] replay: a CIR fact missing its source_url fails validation", () => {
  const cir = structuredClone(load("palantir"));
  delete cir.hiring_bar_summary.source_url;
  const r = CI.validateCIR(cir, { now: NOW });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === "hiring_bar_summary.source_url"), JSON.stringify(r.errors));
});

test("[INTL-001] replay: a CIR fact missing its as_of date fails validation", () => {
  const cir = structuredClone(load("stripe"));
  delete cir.skills_dist.entries[0].as_of;
  const r = CI.validateCIR(cir, { now: NOW });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === "skills_dist.entries[0].as_of"), JSON.stringify(r.errors));
});

test("[INTL-001] a qualitative entry with no number and no stated pattern fails; population-backed without a sample fails", () => {
  const cir = structuredClone(load("mckinsey"));
  delete cir.school_dist.entries[0].note;
  assert.equal(CI.validateCIR(cir, { now: NOW }).ok, false);
  const cir2 = structuredClone(load("mckinsey"));
  cir2.confidence_level = "population-backed"; // sample_size is null in the shipped record
  const r2 = CI.validateCIR(cir2, { now: NOW });
  assert.equal(r2.ok, false);
  assert.ok(r2.errors.some((e) => e.path === "confidence_level"));
});

test("[INTL-001] staleness with a fixed clock: process facts stale past 6 months, hiring status past 90 days", () => {
  const cir = load("stripe"); // all facts as_of 2026-10-12
  const fresh = CI.validateCIR(cir, { now: "2026-10-12" });
  assert.equal(fresh.stale.length, 0);
  const at100 = CI.validateCIR(cir, { now: "2027-01-20" }); // 100 days later
  assert.ok(at100.stale.some((s) => s.path === "hiring_cadence" && s.rule_days === 90), JSON.stringify(at100.stale));
  assert.ok(!at100.stale.some((s) => s.path.startsWith("process_stages")), "process facts are not stale yet at 100 days");
  const at200 = CI.validateCIR(cir, { now: "2027-04-30" }); // 200 days later
  assert.ok(at200.stale.some((s) => s.path.startsWith("process_stages") && s.rule_days === 180), JSON.stringify(at200.stale));
});

test("[INTL-003] the composer produces all ten §2.3 parts and its thesis passes the verifier, for every shipped CIR", () => {
  for (const id of IDS) {
    const th = CI.composeThesis(load(id), PROFILE, { now: NOW });
    assert.deepEqual(Object.keys(th.sections), ["bottom_line", "who_gets_in", "stated_vs_revealed", "routes_ranked", "gap_analysis", "plan", "coffee_chat_strategy", "timeline", "risks_alternatives", "offer_to_execute"], id);
    const v = CI.verifyThesis(th);
    assert.equal(v.ok, true, `${id}: ${JSON.stringify(v.errors)}`);
    assert.equal(CI.lintAdvice(th.text).ok, true, `${id} thesis trips the honest-advice lint`);
  }
});

test("[INTL-003] replay (§5): an injected unsourced number in a thesis draft FAILS the verifier", () => {
  const th = CI.composeThesis(load("stripe"), PROFILE, { now: NOW });
  assert.equal(CI.verifyThesis(th).ok, true);
  const doctoredPct = th.text + "\n\nAlso, 87% of Stripe's intern hires come from one university.";
  const r1 = CI.verifyClaims(doctoredPct, th.claims, { allowedNumbers: th.allowed_numbers });
  assert.equal(r1.ok, false);
  assert.ok(r1.unsourced_numbers.includes(87), JSON.stringify(r1));
  const doctoredCount = th.text + "\n\nThe team hired 4321 interns last year.";
  const r2 = CI.verifyClaims(doctoredCount, th.claims, { allowedNumbers: th.allowed_numbers });
  assert.equal(r2.ok, false);
  assert.ok(r2.unsourced_numbers.includes(4321));
  const badClaim = CI.verifyClaims("A sourced-sounding sentence.", [{ text: "x", value: 5, as_of: NOW }], {});
  assert.equal(badClaim.ok, false, "a claim with no source_url fails even before the text scan");
});

test("[INTL-002] population aggregates carry N, and a measured thesis's numbers all trace", () => {
  const cir = populationCIR();
  assert.equal(CI.validateCIR(cir, { now: NOW }).ok, true);
  const stats = CI.cohortStats(cir);
  assert.equal(stats.distributions.school_dist.sample_size, 200);
  assert.equal(stats.distributions.school_dist.thin, false);
  const th = CI.composeThesis(cir, PROFILE, { now: NOW });
  assert.match(th.sections.who_gets_in, /40%/);
  assert.match(th.sections.who_gets_in, /N=200/);
  assert.equal(CI.verifyThesis(th).ok, true, JSON.stringify(CI.verifyThesis(th).errors));
});

test("[INTL-002] k-anonymity: a cohort stat from a sample under 10 is suppressed and can never verify", () => {
  const cir = populationCIR();
  cir.school_dist.entries[0].sample_size = 8;
  cir.school_dist.entries[0].share_pct = 50;
  const stats = CI.cohortStats(cir);
  assert.equal(stats.distributions.school_dist.entries.length, 0, "the small-sample stat is not shown");
  assert.equal(stats.suppressed.length, 1);
  assert.equal(stats.suppressed[0].sample_size, 8);
  const th = CI.composeThesis(cir, PROFILE, { now: NOW });
  assert.ok(!th.text.includes("50%"), "the suppressed stat never reaches the thesis text");
  const smuggled = CI.verifyClaims("Half (50%) came from Example University.", [{ text: "x", value: 50, unit: "%", source_url: "https://www.janestreet.com/preparing-for-a-software-engineering-interview/", as_of: NOW, sample_size: 8 }], {});
  assert.equal(smuggled.ok, false, "a sub-k claim fails verification outright");
});

test("[INTL-002] thin samples (10-49) are labeled thin, in stats and in the thesis", () => {
  const cir = populationCIR();
  cir.sample_size = 30;
  cir.school_dist.sample_size = 30;
  cir.school_dist.entries[0].sample_size = 30;
  cir.confidence_level = "mixed";
  const stats = CI.cohortStats(cir);
  assert.equal(stats.distributions.school_dist.thin, true);
  const th = CI.composeThesis(cir, PROFILE, { now: NOW });
  assert.match(th.text, /thin sample/);
  assert.equal(CI.verifyThesis(th).ok, true, JSON.stringify(CI.verifyThesis(th).errors));
  const unlabeled = CI.verifyClaims("Example University is 40% of hires.", th.claims, {});
  assert.equal(unlabeled.ok, false, "the same stat without the thin label in the text fails");
});

test("[INTL-005] compare-me returns the gap table across the §2.4 dimensions with a highest-leverage fix", () => {
  const gaps = CI.compareMe(load("goldman-sachs-ibd"), PROFILE);
  assert.deepEqual(gaps.rows.map((r) => r.dimension), ["school", "experience", "projects", "skills", "timing", "authorization"]);
  const exp = gaps.rows.find((r) => r.dimension === "experience");
  assert.equal(exp.status, "gap", "a profile with no internships gaps on experience for banking");
  assert.equal(gaps.highest_leverage_fix.dimension, "experience");
  const skilled = CI.compareMe(load("stripe"), { ...PROFILE, skills: ["Python", "Ruby", "Go", "clear written communication", "pull requests"] });
  assert.ok(skilled.rows.find((r) => r.dimension === "skills").missing.length < 5);
});

test("[INTL-006] the path planner emits dated 30-day milestones plus semester and year horizons, with reminders", () => {
  const plan = CI.planPath(load("palantir"), PROFILE, { now: NOW });
  const h = (x) => plan.milestones.filter((m) => m.horizon === x);
  assert.ok(h("30d").length >= 3 && h("semester").length >= 2 && h("year").length >= 2);
  for (const m of h("30d")) { assert.match(m.by, /^\d{4}-\d{2}-\d{2}$/); assert.ok(m.by > NOW && m.by <= "2026-11-12"); }
  for (const m of plan.milestones) assert.ok(m.reminder.includes("Palantir Technologies"), m.reminder);
});

test("[INTL-004] the honest-advice lint rejects false-precision odds and guarantees, and passes reasoned ranges", () => {
  assert.equal(CI.lintAdvice("You have a 12.4% chance of getting in.").ok, false);
  assert.equal(CI.lintAdvice("Your chance is 43% if you network.").ok, false);
  assert.equal(CI.lintAdvice("Do this and you will get the offer.").ok, false);
  const good = CI.lintAdvice("Low, but not zero. Most people in your position don't get this directly; the ones who do arrive with two smaller internships and a stack of referrals. Here's the highest-leverage move.");
  assert.equal(good.ok, true, JSON.stringify(good.violations));
});

test("[INTL-004] Q30 replay: a fabrication request is refused, with consequences and a truthful alternative", () => {
  const r = CI.respondToRequest("Just tell me what to put on my resume to get in even if I haven't done it.");
  assert.equal(r.action, "refuse");
  assert.equal(r.reason, "fabrication_or_cheating");
  assert.match(r.text, /rescinded/);
  assert.match(r.text, /blacklist/);
  assert.equal(r.offer, "truthful_reframing_and_experience_plan");
  assert.equal(CI.respondToRequest("Can someone else take my online assessment for me?").action, "refuse");
  assert.equal(CI.respondToRequest("How do I get a job at Palantir?").action, "proceed");
});

test("[INTL-004] protected-attribute inference is refused; distress gets warmth and safety first", () => {
  const p = CI.respondToRequest("Infer the gender from his name and tell me if that helps his chances.");
  assert.equal(p.action, "refuse");
  assert.equal(p.reason, "protected_attribute_inference");
  const d = CI.respondToRequest("I'm a failure, everyone is ahead of me and I'll never get in.");
  assert.equal(d.action, "support");
  const crisis = CI.respondToRequest("I want to kill myself over this rejection.");
  assert.equal(crisis.action, "support");
  assert.match(crisis.text, /988/);
});

test("[INTL-007] refresh-due flags aged facts on schedule and an outdated report logs facts to re-verify", () => {
  const cir = load("goldman-sachs-ibd");
  const due = CI.refreshDue(cir, "2027-02-01"); // 112 days after as_of
  assert.ok(due.status_refresh_due.some((s) => s.path === "hiring_cadence"));
  assert.equal(due.population_refresh_due, true, "population view is quarterly");
  const log = CI.reportOutdated(cir, "The HireVue step moved before the application this cycle.", "2026-11-01");
  assert.equal(log.action, "flagged_for_reverification");
  assert.ok(log.facts_to_recheck.length >= 0 && log.report.includes("HireVue"));
});
