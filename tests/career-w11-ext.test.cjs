"use strict";
// W11 ext (145-career-w11-ext): BUG-141 adapter + SC-201..205/212..220 gap functions.
// Check: node --test tests/career-w11-ext.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"); const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const X = require(path.join(ROOT, "packages/domain/145-career-w11-ext.js"));
const P = require(path.join(ROOT, "packages/domain/127-career-prep.js"));
const N = require(path.join(ROOT, "packages/domain/128-career-negotiation.js"));
const cir = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, `packages/career-data/cirs/${id}.json`), "utf8"));
const fixture = (n) => fs.readFileSync(path.join(ROOT, `packages/career-data/fixtures/${n}`), "utf8");
const NOW = "2026-10-12T12:00:00Z";
const offerA = () => N.parseOffer(fixture("test-offer-a.txt"), { now: NOW });
const offerB = () => N.parseOffer(fixture("test-offer-b.txt"), { now: NOW });

test("BUG-141 adapter: pivot CIRs (dict screening_signals) compose via 127", () => {
  // Integration note (pivot/career): on W11's vendored 127 this threw "map is not a function";
  // main's 127 carries the BUG-202 canonical-schema patch (normalizeCir accepts dict
  // screening_signals), so the raw CIR now composes directly and the adapter is a
  // harmless pass-through. This test pins the FIXED behavior: no throw, real stages out.
  const raw = P.composeBrief({ cir: cir("snowflake") });
  assert.equal(raw.status, "OK"); assert.ok(raw.stages.length >= 3);
  const b = P.composeBrief({ cir: X.adaptCir(cir("snowflake")), role: "SWE Intern" });
  assert.equal(b.status, "OK"); assert.ok(b.stages.length >= 3);
  const sp = P.salaryPrep({ cir: X.adaptCir(cir("bain")) });
  assert.equal(sp.status, "NO_SOURCED_FIGURE");
});

test("SC-201 researchTalkPrep: arc from supplied record only; gaps named", () => {
  const fx = JSON.parse(fixture("test-research-talk.json"));
  const r = X.researchTalkPrep({ talk: fx.talk });
  assert.equal(r.gaps.length, 0); assert.match(r.narrative_arc[3].say, /18 points/);
  const g = X.researchTalkPrep({ talk: { title: "T" } });
  assert.ok(g.gaps.includes("result")); assert.match(g.narrative_arc[3].say, /GAP/);
});

test("SC-202 teachingDemoPrep: blocks sum near lesson length; no institution claimed", () => {
  const fx = JSON.parse(fixture("test-research-talk.json"));
  const t = X.teachingDemoPrep({ lesson: fx.lesson });
  assert.ok(Math.abs(t.total_block_minutes - 20) <= 2, String(t.total_block_minutes));
  assert.equal(t.cir_grounded, false); assert.match(t.honesty, /No CIR/);
});

test("SC-205 barRaiserPrep: no CIR claimed; hardest questions present", () => {
  const b = X.barRaiserPrep({ stories: [1, 2] });
  assert.equal(b.cir_grounded, false); assert.ok(b.hardest_questions.length >= 5); assert.equal(b.stories_supplied, 2);
});

test("SC-212 belowFloor: gap math vs floor; above-range honesty", () => {
  const r = X.belowFloorAnalysis(offerA(), N.benchmark(cir("airbnb")), { floor: 190000 });
  assert.equal(r.status, "BELOW_FLOOR"); assert.equal(r.annualized_total, 165200); assert.equal(r.gap_to_floor, 24800);
  assert.match(r.honesty, /ABOVE the sourced top/);
  const ok = X.belowFloorAnalysis(offerA(), N.benchmark(cir("airbnb")), { floor: 160000 });
  assert.equal(ok.status, "AT_OR_ABOVE_FLOOR");
  assert.equal(X.belowFloorAnalysis(offerA(), null, {}).status, "NEEDS_FLOOR");
});

test("SC-213 equityScenarios: letter-valued grant gets hypothetical scenarios; options stay unvalued", () => {
  const v = X.equityScenarios(offerA());
  assert.equal(v.status, "VALUED_BY_LETTER"); assert.equal(v.scenarios.find((x) => x.label.includes("holds")).total_if_fully_vested, 80000);
  assert.ok(v.scenarios.every((x) => /NOT a prediction/.test(x.note)));
  const u = X.equityScenarios(offerB());
  assert.equal(u.status, "UNVALUED"); assert.equal(u.scenarios.length, 0); assert.ok(u.questions_for_recruiter.length >= 4);
});

test("SC-214 signingBonusPivot: ask closes the named gap; card gated, not sent", () => {
  const p = X.signingBonusPivot(offerA(), { gap: 10000 });
  assert.equal(p.new_signing_total, 25000); assert.equal(p.card.sent, false); assert.equal(p.card.requires_approval, true);
  assert.match(p.scripts.email, /25,000/);
});

test("SC-215 returnOfferConversion: sourced figure cited WITH its level context (BUG-142 guard)", () => {
  const d = N.parseOffer(fixture("test-offer-d-return.txt"), { now: NOW });
  const r = X.returnOfferConversion(d, N.benchmark(cir("snowflake")), { outcomes: ["Shipped the quota-service prototype"] });
  assert.ok(r.ask_before_signing.length >= 5); assert.equal(r.card.sent, false);
  // Snowflake's only sourced CIR figure is a SENIOR range — the play must quote its own words
  // and warn it is not the anchor for a new-grad return offer, never present it as level-matched.
  assert.match(r.conversion_play[1], /Senior Software Engineer/);
  assert.match(r.conversion_play[1], /NOT your anchor/);
});

test("SC-216 compExpectationAnswer: sourced range quoted; no-figure CIR gets fallback, no number", () => {
  const ok = X.compExpectationAnswer(N.benchmark(cir("airbnb")));
  assert.equal(ok.status, "OK"); assert.match(ok.wording, /128,000/); assert.equal(ok.card.sent, false);
  const nf = X.compExpectationAnswer(N.benchmark(cir("bain")));
  assert.equal(nf.status, "NO_SOURCED_FIGURE"); assert.equal(nf.wording, null); assert.ok(!/\$\d/.test(nf.fallback));
});

test("SC-217 pressurePlan: hours computed from stored expiry; sequence is same-day", () => {
  const c = N.parseOffer(fixture("test-offer-c-exploding.txt"), { now: NOW });
  const p = X.pressurePlan(c, { now: NOW });
  assert.equal(p.expiry_date, "2026-10-14"); assert.ok(p.hours_left_at_plan > 0 && p.hours_left_at_plan <= 60);
  assert.ok(p.same_day_sequence.length >= 5); assert.ok(p.do_not.length >= 3);
});

test("SC-218 leverageScript: refuses without a real competing offer; uses stored facts when real", () => {
  const no = X.leverageScript(offerA(), null);
  assert.equal(no.status, "REFUSED_NO_REAL_COMPETING_OFFER"); assert.equal(no.script, null);
  const ok = X.leverageScript(offerA(), offerB());
  assert.equal(ok.status, "OK"); assert.match(ok.script, /Notion/); assert.match(ok.script, /2026-10-30/); assert.equal(ok.card.sent, false);
});

test("SC-220 referralOut: tax/legal triggers refer out unanswered; ordinary questions do not", () => {
  const r = X.referralOut("If I exercise my options early, what happens with AMT, and is the non-compete enforceable?");
  assert.equal(r.referred, true); assert.equal(r.answered, false); assert.equal(r.refer_to.length, 2);
  assert.equal(X.referralOut("How should I open the counter call?").referred, false);
});
