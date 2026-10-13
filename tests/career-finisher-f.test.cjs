// Finisher Lane F replay tests for FIN-E-001/004/005/006/007/010/012/013.
// Written BEFORE the fixes: each test pins a defect from docs/finisher-bugs-e.md.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Harness = require(path.join(root, "scripts/career/scenario-harness.cjs"));
const O = require(path.join(root, "packages/domain/130-career-onboarding.js"));
const Apply = require(path.join(root, "packages/domain/132-career-apply.js"));
const Track = require(path.join(root, "packages/domain/126-career-track.js"));
const Intel = require(path.join(root, "packages/domain/125-career-intel.js"));
const Prep = require(path.join(root, "packages/domain/127-career-prep.js"));
const Packets = require(path.join(root, "packages/domain/133-career-packets.js"));
const Apply3 = require(path.join(root, "packages/domain/132-career-apply3.js"));
const Season = require(path.join(root, "packages/domain/136-career-season.js"));

const BANNED = /\bCIR\b|§|\bT[1-4]\b|approved_not_sent|[a-z]+_[a-z]+|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b(?:ref|app|VAR)-[a-z0-9-]*\d[a-z0-9-]*\b/i;

test("FIN-E-001/012/010 replay: harness cards render as labeled rows, one action, readable CSS, no raw JSON", () => {
  assert.equal(typeof Harness.renderCardHtml, "function", "harness must export renderCardHtml");
  const html = Harness.renderCardHtml({ type: "batch_approval", title: "Apply to these roles?", items: [{ company: "Stripe", role: "Engineer", fit: null }], note: "Nothing submits before your yes." });
  assert.doesNotMatch(html, /<pre>/);
  assert.doesNotMatch(html, /\{\s*"/);
  assert.match(html, /Company:<\/span> Stripe/);
  assert.match(html, /Fit:<\/span> no fit score yet/);
  assert.equal((html.match(/Action:/g) || []).length, 1, "exactly one primary action line");
  const css = Harness.CARD_CSS || fs.readFileSync(path.join(root, "scripts/career/scenario-harness.cjs"), "utf8");
  assert.doesNotMatch(css, /#0a84ff/, "user bubble color below 4.5:1 must be gone");
  assert.match(css, /font-size:1[34]px/, "card text at least 13px");
});

test("FIN-E-004 replay: honest status contains zero finance-domain tokens", () => {
  const registry = JSON.parse(fs.readFileSync(path.join(root, "packages/capabilities/registry.json"), "utf8"));
  const r = O.capabilityStatus({ registryCaps: registry.capabilities, careerRows: [{ id: "ACCS-001", status: "built", note: "code built" }, { id: "ACCS-004", status: "blocked", note: "owner-gated browser rail" }] });
  assert.doesNotMatch(r.text, /PAY-|payment_service|finance capabilities|rent|payment engine/i);
  assert.equal(r.blocked_count, 1, "only the career blocked row counts");
  assert.equal(r.built.registry_tested, 0, "finance registry rows are not career rows");
  assert.ok(r.blocked.every((b) => /^ACCS-/.test(b.id)));
});

test("FIN-E-005 replay: batchCard dedupes, normalizes names, trims titles, words missing fit", () => {
  const card = Apply.batchCard([
    { company: " stripe ", role: "  Security Engineer, Cloud ", fit: null, resumeVersion: "v1" },
    { company: "Stripe", role: "Security Engineer, Cloud", fit: null, resumeVersion: "v2" },
    { company: "datadog", role: "Sales Engineer", fit: 65, resumeVersion: "v3" },
  ]);
  assert.equal(card.items.length, 2);
  assert.equal(card.items[0].company, "Stripe");
  assert.equal(card.items[0].role, "Security Engineer, Cloud");
  assert.equal(card.items[1].company, "Datadog");
  assert.match(card.items[0].fit_label, /no fit score yet/);
  assert.match(card.summary, /no fit score yet/);
  assert.doesNotMatch(card.summary, /with fit/);
});

test("FIN-E-013 replay: weeklyDigest next actions never list the same follow-up twice", () => {
  const store = Track.seedTestLog();
  const d = Track.weeklyDigest(store, { now: Track.SEED_NOW });
  const palantir = d.next_actions.filter((x) => /palantir/i.test(x));
  assert.equal(palantir.length, 1, `Palantir follow-up duplicated: ${JSON.stringify(d.next_actions)}`);
  const seen = new Set(); for (const a of d.next_actions) { const k = a.toLowerCase().replace(/[^a-z ]/g, ""); assert.ok(!seen.has(k), `duplicate action ${a}`); seen.add(k); }
});

test("FIN-E-006/007 replay: user prose from 125/127/130/132/133/136 carries no internal vocabulary", () => {
  // 125 thesis over a real company file
  const cir = JSON.parse(fs.readFileSync(path.join(root, "packages/career-data/cirs/palantir.json"), "utf8"));
  const thesis = Intel.composeThesis(cir, { school: "TEST University", year: "sophomore", skills: [], internships: [], projects: [] }, { now: "2026-10-13" });
  assert.doesNotMatch(thesis.text, /\bCIR\b|§|curated-qualitative|sample N=not available/);
  // 127 prose notes
  const bare = Prep.caseSession({ company: "McKinsey" });
  assert.doesNotMatch(bare.practice_norms_label, /\bCIR\b/);
  const noCir = Prep.composeBrief({ company: "Nowhere" });
  assert.doesNotMatch(noCir.gaps.join(" "), /\bCIR\b/);
  assert.doesNotMatch(Prep.salaryPrep({ company: "Nowhere" }).note, /\bCIR\b/);
  // 130 sensitive prompt + 132 sensitive prompt: no tier codes
  assert.doesNotMatch(O.sensitiveAnswerPrompt({ constraints: { workAuthorization: "US citizen" } }, "work_authorization").text, /\bT3\b/);
  // 132 batch/sensitive prose
  const prof = { constraints: { workAuthorization: "US citizen", needsSponsorship: false }, facts: [], defaults: {} };
  assert.doesNotMatch(Apply.confirmSensitive(prof, "Do you need sponsorship?").prompt, /\bT3\b|\(T3\)/);
  // 133 gap callout
  assert.doesNotMatch(Packets.gapCallout({ facts: [] }, { company_name: "Stripe" }, null).text, /\bCIR\b/);
  // 132-apply3 radar state wording
  const radar = Apply3.deadlineRadar([{ company_name: "Stripe", entry_routes: [{ route: "intern", status: "open", facts: [{ claim: "no dated close" }] }] }], { now: Date.parse("2026-10-13T00:00:00Z") });
  assert.doesNotMatch(JSON.stringify(radar), /\bCIR\b/);
  // 136 comp draft unblock wording
  assert.doesNotMatch(Season.draftCompExpectation({ company: "Stripe" }).unblock, /\bT3\b/);
  assert.notEqual(Season.draftCompExpectation({ company: "Stripe", approvedRange: ["$28/hr", "$32/hr"] }).card.tier, "T3");
});

test("FIN-E-006 replay: prose lint catches banned tokens and passes clean prose", () => {
  const lint = require(path.join(root, "scripts/career/prose-lint.cjs"));
  assert.ok(lint.scanText("waiting on your T3 yes, see the CIR (§3.2)").length >= 3);
  assert.deepEqual(lint.scanText("Your company file is ready — this one needs your explicit yes."), []);
});
