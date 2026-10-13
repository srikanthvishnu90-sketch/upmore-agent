// COS-001..008 (129-career-os): market value from sourced figures only, skill gaps grounded in
// postings with stated ranges, watch diffs over 121-shaped postings, network upkeep, wins log,
// review packet, return-offer playbook, goals check-in, career timeline from stored records.
// Check: node --test tests/career-os.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path"); const fs = require("node:fs");
const OS = require(path.join(__dirname, "..", "packages/domain/129-career-os.js"));
const N = require(path.join(__dirname, "..", "packages/domain/128-career-negotiation.js"));
const ROOT = path.join(__dirname, "..");
const cir = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, `packages/career-data/cirs/${id}.json`), "utf8"));
const persona = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/test-persona.json"), "utf8"));
const NOW = "2026-10-12T12:00:00Z";
const P = (id, company, title, jd, extra) => Object.assign({ job_id: id, company, title, role_family: "SWE", location: "San Francisco, CA", url: `https://example.test/${id}`, posted_at: "2026-10-11T00:00:00Z", jd_text: jd }, extra || {});

test("COS-001 market value: null when no sourced figure exists (honesty)", () => {
  const mv = OS.marketValue({ cirs: [cir("bain"), cir("kkr")], as_of: NOW });
  assert.equal(mv.estimate, null); assert.match(mv.statement, /No sourced compensation figure/);
});
test("COS-001 market value: built only from CIR figures + posting ranges, evidence listed", () => {
  const mv = OS.marketValue({ cirs: [cir("airbnb")], postings: [P("j1", "ExampleCo", "SWE", "Salary range $120,000 - $150,000. Python.")], as_of: NOW });
  assert.ok(mv.estimate.low <= 120000 && mv.estimate.high >= 255000); assert.ok(mv.evidence.length >= 3);
  for (const e of mv.evidence) assert.ok(e.source_type && (e.source_url || e.kind === "live_posting"));
});
test("COS-002 skill gap: only from higher-paying postings with stated ranges", () => {
  const postings = [P("a", "X", "SWE", "Range $200,000 - $240,000. Needs Rust and Kafka."), P("b", "Y", "SWE", "Range $210,000 - $250,000. Rust, Terraform."), P("c", "Z", "SWE", "No pay stated. Needs Rust.")];
  const g = OS.skillGap({ profileSkills: ["Python"], postings });
  assert.equal(g.basis.postings_with_stated_ranges, 2);
  assert.equal(g.gaps[0].skill, "Rust"); assert.equal(g.gaps[0].postings, 2);
});
test("COS-003 watch diff: only genuinely new matching postings ping", () => {
  const st = OS.createStore(); const w = OS.createWatch(st, { companies: ["Stripe"], role_families: ["SWE"] }, { now: NOW });
  const prior = [P("old", "Stripe", "SWE", "Python")]; const cur = [...prior, P("new", "Stripe", "SWE", "Python"), P("oth", "Other", "SWE", "Python")];
  const d = OS.watchDiff(w, prior, cur); assert.equal(d.hits.length, 1); assert.equal(d.hits[0].job_id, "new"); assert.match(d.ping, /Stripe/);
});
test("COS-003/196 comp band shift: detected from stated ranges only; no data -> no claim", () => {
  const prior = [P("1", "Stripe", "SWE", "Range $120,000 - $150,000")]; const cur = [P("2", "Stripe", "SWE", "Range $130,000 - $165,000")];
  const sh = OS.compBandShift("Stripe", prior, cur); assert.equal(sh.shift.direction, "up"); assert.equal(sh.shift.current.high, 165000);
  const none = OS.compBandShift("Stripe", [], cur); assert.equal(none.shift, null); assert.match(none.statement, /No market claim/);
});
test("COS-004 network upkeep: coldest warm contact first + restart draft on a card", () => {
  const st = OS.createStore({ relationships: [{ name: "Pat Warm", org: "Stripe", warmth: "warm", last_touch: "2026-06-01" }, { name: "Sam Recent", org: "Ramp", warmth: "warm", last_touch: "2026-10-01" }] });
  const r = OS.networkUpkeep(st, { now: NOW }); assert.equal(r.ranked[0].name, "Pat Warm"); assert.equal(r.coldest_warm.name, "Pat Warm");
  assert.match(r.restart_draft, /Pat/); assert.equal(r.card.sent, false);
});
test("COS-005/006 wins log -> review packet uses stored wins only", () => {
  const st = OS.createStore(); OS.logWin(st, { text: "I shipped the dashboard migration", outcome: "cut reporting time 40%", date: "2026-09-15" }, { now: NOW });
  const pk = OS.reviewPacket(st); assert.equal(pk.count, 1); assert.match(pk.packet_text, /dashboard migration/); assert.match(pk.packet_text, /2026-09-15/);
});
test("COS-007 return playbook + intern timeline are dated and CIR-grounded", () => {
  const pb = OS.returnOfferPlaybook({ cir: cir("snowflake") }); assert.equal(pb.company, "Snowflake Inc."); assert.equal(pb.first_90_days.length, 3);
  const tl = OS.internTimeline({ endDate: "2027-08-15" }); assert.equal(tl.milestones.length, 6); assert.ok(tl.milestones.every((m) => /20\d\d-\d\d-\d\d/.test(m.date)));
});
test("COS-008 goals check-in compares stated goals vs log reality", () => {
  const st = OS.createStore({ goals: [{ text: "Log 3 wins this quarter", target: 3, metric: "wins_logged" }] });
  OS.logWin(st, { text: "win one" }, { now: NOW });
  const ci = OS.goalsCheckin(st, { now: NOW }); assert.equal(ci.reality.wins_logged, 1); assert.equal(ci.stated_goals[0].measured, 1); assert.match(ci.stated_goals[0].status, /behind/);
});
test("COS-008 career timeline renders only stored records", () => {
  const st = OS.createStore(); N.storeOffer(st, N.parseOffer(fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/test-offer-a.txt"), "utf8"), { now: NOW }));
  OS.logWin(st, { text: "shipped X", date: "2026-10-01" }, { now: NOW });
  const tl = OS.careerTimeline(st, persona); assert.ok(tl.count >= 5); assert.ok(tl.events.some((e) => e.kind === "offer")); assert.ok(tl.events.every((e) => /stored record/.test(e.source)));
});
