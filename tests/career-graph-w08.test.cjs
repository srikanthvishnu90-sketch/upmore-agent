"use strict";
const test = require("node:test"); const assert = require("node:assert");
const G = require("../packages/domain/138-career-graphcore.js");
const P = require("../packages/domain/122-career-profile.js");
const S = require("../packages/domain/136-career-season.js");
const T = require("../packages/domain/126-career-track.js");
const fs = require("fs"); const path = require("path");
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, "../packages/career-data/fixtures/test-graph-sources.json"), "utf8"));
const persona = JSON.parse(fs.readFileSync(path.join(__dirname, "../packages/career-data/fixtures/test-persona.json"), "utf8"));
function graph() { const g = G.createGraph(FX.user); G.importRecords(g, FX.linkedin_export, "linkedin-export"); return g; }

test("SC-147 warmth order alumni>club>major>hometown>cold, shared fact each", () => {
  const r = G.rankPaths(graph(), "Stripe");
  const tiers = ["Maya Alumni (TEST)", "Ben Clubmate (TEST)", "Cara Major (TEST)", "Dan Hometown (TEST)", "Eli Cold (TEST)"];
  assert.deepEqual(r.map((x) => x.name).filter((n) => tiers.includes(n)), tiers); // canonical order among the five tier exemplars
  assert.equal(r.find((x) => x.name === "Maya Alumni (TEST)").warmth_tier, "alumni"); assert.match(r[0].shared_fact, /TEST University/);
  assert.equal(r.find((x) => x.name === "Eli Cold (TEST)").warmth_tier, "cold");
});
test("identity merge: same person in 3 sources = 1 record (T-03 seam)", () => {
  const g = graph(); const before = g.people.length;
  G.importRecords(g, FX.alumni_directory, "alumni"); G.importRecords(g, FX.public_records, "public");
  const maya = g.people.filter((p) => p.name === "Maya Alumni (TEST)");
  assert.equal(maya.length, 1); assert.ok(maya[0].sources.length >= 3, maya[0].sources.join(","));
  assert.ok(g.people.length >= before);
});
test("LinkedIn CSV via 122 parser imports", () => {
  const g = G.createGraph(FX.user); const csv = fs.readFileSync(path.join(__dirname, "../packages/career-data/fixtures/test-linkedin-connections.csv"), "utf8");
  const r = G.importLinkedInCsv(g, csv, P); assert.equal(r.parse_errors.length, 0); assert.ok(r.total >= 3);
});
test("second-degree map shows the full path", () => {
  const m = G.secondDegreeMap(graph(), "Stripe"); assert.equal(m.length, 1); assert.match(m[0].path, /You → Maya Alumni \(TEST\) → Sam Second/);
});
test("SC-151 referral ask blocked before a held chat", () => {
  const g = graph(); assert.equal(G.planReferralAsk(g, "Daniel Warm (TEST)", {}).blocked, true);
  G.recordInteraction(g, "Daniel Warm (TEST)", { kind: "coffee_chat", at: "2026-09-01T12:00:00Z", summary: "Talked Datadog infra" });
  assert.equal(G.planReferralAsk(g, "Daniel Warm (TEST)", { company: "Datadog", role: "SWE Intern" }).ok, true);
});
test("SC-152 referral links onto the application row", () => {
  const g = graph(); const store = T.seedTestLog();
  G.recordReferralSignal(g, "Daniel Warm (TEST)", { company: "Datadog", at: "2026-10-12T12:00:00Z" });
  const r = G.linkReferralToApplication(g, store, "Daniel Warm (TEST)", "Datadog");
  assert.equal(r.ok, true); const app = T.findByCompany(store, "Datadog"); assert.equal(app.source, "referred"); assert.equal(app.referred_by, "Daniel Warm (TEST)");
});
test("SC-155 conversion tracked per contact", () => {
  const g = graph(); G.recordInteraction(g, "Daniel Warm (TEST)", { kind: "coffee_chat", at: "2026-09-01T12:00:00Z" });
  G.recordReferralSignal(g, "Daniel Warm (TEST)", { company: "Datadog" });
  const c = G.conversionTracking(g); assert.equal(c.converted_to_referral, 1); assert.equal(c.conversion_pct, 100);
});
test("SC-156 relationship memory returns last talk + topic", () => {
  const g = graph(); G.recordInteraction(g, "Daniel Warm (TEST)", { kind: "coffee_chat", at: "2026-09-01T12:00:00Z", summary: "Talked Datadog infra and on-call" });
  const m = G.relationshipMemory(g, "Daniel Warm (TEST)"); assert.equal(m.last_summary, "Talked Datadog infra and on-call"); assert.equal(m.chats, 1);
});
test("SC-157 keep-warm fires at >=6 weeks only for warm stages", () => {
  const g = graph(); G.recordInteraction(g, "Daniel Warm (TEST)", { kind: "coffee_chat", at: "2026-09-01T12:00:00Z" });
  const sug = G.keepWarmSuggestions(g, { now: Date.parse("2026-10-13T12:00:00Z") }); assert.equal(sug.length, 1); assert.ok(sug[0].days_since >= 42);
});
test("SC-160 new-hire radar flags recent joiner at target", () => {
  const g = graph(); const prev = { people: [{ name: "Nina Newhire (TEST)", company: "TEST Systems Inc" }] };
  const r = G.newHireRadar(g, prev, { now: Date.parse("2026-10-13T12:00:00Z"), targetCompanies: ["Stripe"] });
  assert.equal(r.length, 1); assert.equal(r[0].warmth_tier, "alumni");
});
test("SC-150/162 forwardable blurb is 3 lines from profile facts only", () => {
  const prof = P.profileFromData(persona); const b = G.forwardableBlurb(graph(), prof);
  assert.equal(b.ok, true); assert.equal(b.lines.length, 3);
  const intro = G.draftIntroRequest(graph(), "Daniel Warm (TEST)", "Maya Alumni (TEST)", b.blurb);
  assert.equal(intro.ok, true); assert.equal(intro.sends, false);
});
test("SC-141 season dashboard counts by week vs plan", () => {
  const d = S.seasonDashboard(T.seedTestLog(), { targetApplications: 20 });
  assert.equal(d.total_applications, 12); assert.equal(d.plan_pct, 60); assert.ok(d.by_week.length >= 4);
});
test("SC-142 comp draft refuses an unapproved number, carries an approved one verbatim", () => {
  assert.equal(S.draftCompExpectation({ company: "Stripe" }).status, "ASK");
  const ok = S.draftCompExpectation({ company: "Stripe", approvedRange: ["$28/hr", "$32/hr"], marketRange: "$25–35/hr" });
  assert.equal(ok.ok, true); assert.match(ok.draft.body, /\$28\/hr–\$32\/hr/); assert.equal(ok.sends, false);
});
test("SC-144 assessment score logged + prep adjusted", () => {
  const store = T.seedTestLog(); const r = S.logAssessmentScore(store, "Hudson River Trading", { score: 82, max: 100, at: "2026-10-12T12:00:00Z" });
  assert.equal(r.ok, true); assert.equal(r.pct, 82); assert.match(r.next_round_prep_adjustment, /interview rounds/);
  assert.equal(T.findByCompany(store, "Hudson River Trading").assessment.score, 82);
});
test("SC-145 retro: conversion computed honestly from the log (rejected != advanced)", () => {
  const r = S.seasonRetro(T.seedTestLog());
  assert.equal(r.referred.rejected, 0); assert.equal(r.referred.offers, 1); assert.equal(r.total, 12);
  assert.match(r.what_converted, /[Rr]eferred/); assert.match(r.what_didnt, /fin-v1/);
});
test("SC-153 public-source lookup is public-only", () => {
  const g = graph(); G.importRecords(g, FX.public_records, "public");
  const r = G.publicSourceLookup(g, "Stripe"); assert.ok(r.length >= 1); assert.match(r[0].note, /no LinkedIn scraping/);
});
test("SC-159 sweep covers all companies, best path each", () => {
  const sw = G.topWarmPathSweep(graph(), ["Stripe", "Datadog", "Ramp"]); assert.equal(sw.length, 3); assert.equal(sw[0].best.name, "Maya Alumni (TEST)");
});
test("SC-158 update touch uses a confirmed profile fact, approval-gated", () => {
  const prof = P.profileFromData(persona); const r = G.draftUpdateTouch(graph(), "Daniel Warm (TEST)", prof, {});
  assert.equal(r.ok, true); assert.equal(r.sends, false); assert.ok(r.fact_id);
});
