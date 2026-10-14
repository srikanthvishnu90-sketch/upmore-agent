"use strict";
// W5 A4-carriage guards (bug law: BUG-070..BUG-074). Each test drives
// the canonical ask through the integrated chat path (pilot-lib
// chatTurn: 120 -> 130 -> 142 -> 141) and asserts the TYPED RESULT
// carries the family product the completion contract reads — never
// reply text alone.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../scripts/career/gauntlet/pilot-lib.cjs");
const DC = require("../scripts/career/gauntlet/doorstep-contracts.cjs");

const doc = fs.readFileSync(path.join(process.env.HOME, "workspace/your_files/upmore-career-300-scenarios.md"), "utf8");
const CANON = new Map();
for (const line of doc.split("\n")) { const m = line.match(/^(SC-\d{3})\s+(.+)$/); if (m && !CANON.has(m[1])) CANON.set(m[1], m[2].trim()); }
function turn(id) {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = L.H.session(id, "grand");
  return L.chatTurn(s, CANON.get(id), { profile });
}
const validates = (fam, rec) => { try { const v = DC.validate(fam, rec); return !!(v && (v.ok || v.valid)); } catch { return false; } };

// ---- BUG-070 (A) apply rules branches carry their 132/Apply3 products
test("BUG-070 SC-073 salary branch carries 132's salary product + a packet doorstep", () => {
  const r = turn("SC-073"); const res = r.result || {};
  assert.ok(res.salary && res.salary.kind === "salary", `salary product missing: keys=${Object.keys(res)}`);
  assert.ok(res.doorstep && res.doorstep.gap === null, "packet doorstep record missing on a rules branch with a resolvable posting");
});
test("BUG-070 SC-064 link triage carries the triage verdicts", () => {
  const r = turn("SC-064"); const res = r.result || {};
  assert.ok(Array.isArray(res.triage) && res.triage.length >= 1, `triage missing: keys=${Object.keys(res)}`);
});
test("BUG-070 SC-078 autopilot carries 132's rule product (or its typed refusal)", () => {
  const r = turn("SC-078"); const res = r.result || {};
  assert.ok(res.rule && typeof res.rule === "object", `rule product missing: keys=${Object.keys(res)}`);
});
test("BUG-070 SC-080 cooldown carries the cooldown product or a typed blocker — never neither", () => {
  const r = turn("SC-080"); const res = r.result || {};
  assert.ok(res.cooldown || res.blocker, `cooldown/blocker missing: keys=${Object.keys(res)}`);
});
test("BUG-070 SC-107 deadline radar carries Apply3's radar product", () => {
  const r = turn("SC-107"); const res = r.result || {};
  assert.ok(res.radar != null || res.blocker, `radar/blocker missing: keys=${Object.keys(res)}`);
});
test("BUG-070 contract: run-grand A4 reads the application_packet doorstep shape", () => {
  const src = fs.readFileSync(path.join(__dirname, "../scripts/career/gauntlet/run-grand.cjs"), "utf8");
  assert.ok(/application_packet/.test(src), "run-grand completion chain has no application_packet branch");
});

// ---- BUG-071 (B) negotiation products ride under payload (F6 keys)
test("BUG-071 SC-208 counter scripts carry the offer record under payload", () => {
  const r = turn("SC-208"); const res = r.result || {};
  assert.ok(res.payload && typeof res.payload === "object" && "base_salary" in res.payload, `payload offer missing: keys=${Object.keys(res)}`);
  assert.ok(res.strategy && res.strategy.scripts && res.strategy.scripts.email, "strategy scripts missing");
});
test("BUG-071 SC-210 advice carries the benchmark product under payload", () => {
  const r = turn("SC-210"); const res = r.result || {};
  assert.ok(res.payload && typeof res.payload.text === "string" && res.payload.text.length > 10, `payload bench missing: keys=${Object.keys(res)}`);
});

// ---- BUG-072 (C) career OS turns carry an F8-valid record under payload
for (const [id, label] of [["SC-271", "market value"], ["SC-274", "upkeep"], ["SC-277", "playbook"], ["SC-279", "goals"]]) {
  test(`BUG-072 ${id} ${label} carries an F8-valid payload`, () => {
    const r = turn(id); const res = r.result || {};
    assert.ok(/^career_os/.test(res.intent || ""), `intent=${res.intent}`);
    assert.ok(res.payload && validates("F8", res.payload), `payload fails F8: ${JSON.stringify(res.payload).slice(0, 200)}`);
  });
}

// ---- BUG-073 (D) prep/intel carriage
test("BUG-073 SC-177 question-bank ask reaches the question bank (not the failure-story branch)", () => {
  const r = turn("SC-177"); const res = r.result || {};
  assert.ok(res.bank || res.payload, `bank/payload missing: keys=${Object.keys(res)}`);
  assert.ok(!/failure story has to come/i.test(r.delivered.join(" ")), "ask was answered by the failure-story branch");
});
test("BUG-073 SC-185 case plan payload validates F5", () => {
  const r = turn("SC-185"); const res = r.result || {};
  assert.ok(res.payload && validates("F5", res.payload), `case plan payload fails F5: ${JSON.stringify(res.payload).slice(0, 200)}`);
});
test("BUG-073 SC-247 compare ask carries 125's comparison product under payload", () => {
  const r = turn("SC-247"); const res = r.result || {};
  assert.ok(res.payload && typeof res.payload === "object", `payload missing: keys=${Object.keys(res)}`);
});
test("BUG-073 SC-263 company-file build resolves the BCG file and carries it", () => {
  const r = turn("SC-263"); const res = r.result || {};
  assert.ok(res.payload && (res.payload.company_id === "bcg" || validates("F7", res.payload)), `BCG file not carried: intent=${res.intent} keys=${Object.keys(res)}`);
});

// ---- BUG-074 (E) source class + as-of survive composition (no jargon kill)
test("BUG-074 SC-206 negotiation advice reply names a source class and an as-of date", () => {
  const r = turn("SC-206"); const text = (r.delivered || []).join("\n");
  assert.ok(/company file|public posting|source/i.test(text), `no source class in reply: ${text.slice(0, 200)}`);
  assert.ok(/as of [A-Z][a-z]+ \d{4}|as of \d{4}-\d{2}-\d{2}/.test(text), `no as-of date in reply: ${text.slice(0, 300)}`);
});
test("BUG-074 128 benchmark text carries no bare CIR acronym (composer jargon kill)", () => {
  const N = require("../packages/domain/128-career-negotiation.js");
  const b = N.benchmark(null, {});
  assert.ok(!/\bCIR\b/.test(b.text), `benchmark text still carries CIR: ${b.text.slice(0, 120)}`);
});
test("BUG-074 SC-269 stale-file turn carries a typed record or blocker", () => {
  const r = turn("SC-269"); const res = r.result || {};
  assert.ok(res.payload || res.blocker || res.refresh, `record missing: keys=${Object.keys(res)}`);
});

// ------------------------------------------------------------------
// BUG-075 — the A4 element-validation seam read the wrong property:
// run-grand's validates() tested `v.ok`, but doorstep-contracts'
// validate() returns { valid: ... } — v.ok is always undefined, so
// every element-validated branch (F3/F4/F5/F6/F7/F8) was dead code
// and genuinely-carried records could never complete a turn.
// ------------------------------------------------------------------
test("BUG-075 contract reads the validator's actual verdict field (valid)", () => {
  const DC = require("../scripts/career/gauntlet/doorstep-contracts.cjs");
  const v = DC.validate("F8", { record_id: "x-2026-10-13", date: "2026-10-13", text: "a stored record" });
  assert.equal(v.valid, true, "the validator itself passes a genuine F8 record");
  assert.equal(v.ok, undefined, "the validator exposes no .ok — the seam must read .valid");
  const src = fs.readFileSync(path.join(__dirname, "../scripts/career/gauntlet/run-grand.cjs"), "utf8");
  assert.ok(/v\.valid === true/.test(src), "run-grand's validates() reads v.valid (BUG-075)");
});

test("BUG-073 SC-242 trend ask carries 144's cited record (the ok:false honest record is the answer)", () => {
  const r = turn("SC-242"); const res = r.result || {};
  assert.ok(res.payload, "SC-242: the guidance record rides under payload");
  const v = DC.validate("F7", res.payload);
  assert.ok(v.valid, `SC-242: payload validates F7 (missing: ${v.missing.join(",")})`);
});

// ------------------------------------------------------------------
// BUG-076 — the discovery A4 branch's ask-side word check accepted
// only plural forms (roles|jobs|internships|positions); canonical
// asks phrased with the singular ("every new-grad SWE role posted…",
// SC-063/106/117/119) carried a genuine 5-role shortlist the branch
// could never read. SC-111 is NOT affected (its shortlist is 0).
// ------------------------------------------------------------------
test("BUG-076 contract discovery branch reads singular role/job ask forms", () => {
  const src = fs.readFileSync(path.join(__dirname, "../scripts/career/gauntlet/run-grand.cjs"), "utf8");
  assert.ok(/\(roles\?\|jobs\?\|internships\?\|positions\?\)/.test(src), "discovery ask check accepts singular + plural forms (BUG-076)");
  const r = turn("SC-063"); const res = r.result || {};
  assert.ok(Array.isArray(res.shortlist) && res.shortlist.length >= 1, "SC-063: the shortlist element is genuinely present");
});

// ------------------------------------------------------------------
// BUG-077 — four tailor sub-branches answered in prose only and
// returned no artifact at all, although each has a real 123 product:
// the truth audit (auditResume), the bans-AI outline (coverOutline),
// the diff review, and per-firm impact/fit tailoring (which pre-empted
// the company/discovery tailor chains that DO produce artifacts).
// ------------------------------------------------------------------
test("BUG-077 SC-071 truth-audit branch carries the audit artifact", () => {
  const r = turn("SC-071"); const res = r.result || {};
  assert.ok(res.artifact && res.artifact.kind === "truth_audit", `SC-071: audit artifact missing: keys=${Object.keys(res)}`);
});
test("BUG-077 SC-076 bans-AI branch delivers the outline artifact (prepared)", () => {
  const r = turn("SC-076"); const res = r.result || {};
  assert.ok(res.artifact && res.artifact.kind === "cover_outline", `SC-076: outline artifact missing: keys=${Object.keys(res)}`);
  assert.equal(res.resultStatus, "prepared");
});
test("BUG-077 SC-089 per-firm impact-bullets ask chains to a real tailored artifact", () => {
  const r = turn("SC-089"); const res = r.result || {};
  assert.ok(res.artifact && typeof res.artifact === "object", `SC-089: artifact missing: keys=${Object.keys(res)}`);
});
test("BUG-077 SC-097 diff review carries the quoted changes as the review artifact", () => {
  const r = turn("SC-097"); const res = r.result || {};
  assert.ok(res.artifact && res.artifact.kind === "resume_diff_review" && Array.isArray(res.artifact.changes) && res.artifact.changes.length >= 2, `SC-097: diff artifact missing: keys=${Object.keys(res)}`);
});

// ------------------------------------------------------------------
// BUG-078 — no A4 branch read the prior-application turn: SC-079's
// typed result carries 126/142's prior_application record
// (disclosed:true, the manual application logged, duplicate apply
// suppressed) at completed, and the chain had no element branch
// for the intent at all.
// ------------------------------------------------------------------
test("BUG-078 contract carries an element branch for the prior-application record", () => {
  const src = fs.readFileSync(path.join(__dirname, "../scripts/career/gauntlet/run-grand.cjs"), "utf8");
  assert.ok(/intent_prior_application/.test(src) && /prior_application\.disclosed === true/.test(src), "A4 reads the disclosed prior-application record (BUG-078)");
  const r = turn("SC-079"); const res = r.result || {};
  assert.ok(res.prior_application && res.prior_application.disclosed === true, "SC-079: the disclosed record is genuinely present");
});

// ------------------------------------------------------------------
// BUG-079 — handleApplyRules' link-triage branch only triggered on
// "apply to these N links" phrasing, so a "Triage 30 pasted links"
// ask (SC-114) fell through to discovery, whose regex claims the
// word triage — the turn shipped a shortlist instead of 132's
// triage verdicts + the packet doorstep.
// ------------------------------------------------------------------
test("BUG-079 SC-114 triage ask reaches the apply-rules triage branch", () => {
  const r = turn("SC-114"); const res = r.result || {};
  assert.equal(res.intent, "doorstep_status", `SC-114: intent was ${res.intent}`);
  assert.ok(Array.isArray(res.triage) && res.triage.length >= 1, "SC-114: triage verdicts carried");
});
