// Career OS wave (SC-271..282, 284, 285) — fail-first replay tests.
// Baseline (fresh-300 records, grader-v2 rescore): every Career OS scenario
// routed to 142's generic capability_status deflection (or a sibling copy
// block) with NO real work product in the typed result: A4 (S1) on all,
// H-12 (S2) on most, SC-277 spoke the literal word "undefined", SC-275 and
// SC-276 delivered the IDENTICAL reply, SC-278 tripped H-7 on the word
// "logged", SC-282/284/285 tripped R-C5 (no source class + as-of).
// The fix: 130-career-onboarding (consulted BEFORE 142 in the chat chain)
// owns the Career OS front door and wires 129/134/135/136's REAL outputs
// through the typed result; 129 learns the feed's structured salary shape
// and drops the un-negated claim verb from the first-90 plan; 134 exports
// the listPaths() its consumer (142) already calls.
// A4 note: run-grand.cjs's completion table has NO branch for any Career OS
// intent (only discovery/tailor/packet/mock/outreach-draft/dead-board/
// pre-declared refusals/SC-300 register) — these tests assert the real
// work product + the reply-level classes (H-12/R-C5/H-7) are fixed; the
// A4 contract gap itself is briefed, never gamed.
"use strict";
process.env.GAUNTLET_OUT_DIR = require("node:fs").mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "wave-os-"));
process.env.GAUNTLET_TRIAL = "wave-os";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const L = require(path.join(root, "scripts/career/gauntlet/pilot-lib.cjs"));
const G = require(path.join(root, "scripts/career/gauntlet/grader-v2.cjs"));
const Contracts = require(path.join(root, "scripts/career/gauntlet/doorstep-contracts.cjs"));
const OS = require(path.join(root, "packages/domain/129-career-os.js"));
const Paths = require(path.join(root, "packages/domain/134-career-paths.js"));
const Onboarding = require(path.join(root, "packages/domain/130-career-onboarding.js"));

const ASKS = {
  "SC-271": "\"What am I worth now?\" — answered with evidence, and it updates over time",
  "SC-272": "Skill gap: the three skills between me and the next pay band, in learn order",
  "SC-273": "Passive watch: a perfect-fit role posts while I'm employed — I get pinged",
  "SC-274": "Network upkeep: my 12 warmest contacts — who's going cold",
  "SC-275": "Wins log: I text wins all semester; they land in my living resume",
  "SC-276": "Review packet: my promotion case built from the wins log",
  "SC-277": "Return-offer playbook for my internship summer",
  "SC-278": "First-90-days plan at the new job",
  "SC-279": "Quarterly check-in: my career goals versus reality, plan adjusted",
  "SC-280": "Market-shift alert: my role's pay band moved — shown with the data",
  "SC-281": "Skill-demand trend: what postings in my field started requiring this year",
  "SC-282": "Two-year re-route: from today's job to the dream role, steps and dates",
  "SC-284": "Mentor map: who in my network to deepen this year, and why them",
  "SC-285": "Annual career retro: outcomes versus plan; next year's targets",
};
function run(id) {
  const s = L.H.session(id, "wave-os");
  const profile = L.gauntletProfile("p1-early-career-swe");
  const r = L.chatTurn(s, ASKS[id], { profile });
  return r;
}
function recFor(id, delivered) {
  return { scenario_id: id, family: "Career Os", canonical_ask: ASKS[id], delivered_messages: delivered, final_state: { handler: "test", intent: "test" }, state: { events: [], doorstep: null } };
}
function assertReplyClean(id, r) {
  const text = (r.delivered || []).join("\n");
  assert.ok(r.result, id + ": a handler result exists");
  assert.ok(!/undefined/.test(text), id + ": reply never speaks 'undefined' — got: " + text.slice(0, 200));
  const rec = recFor(id, r.delivered);
  const h12 = G.checks.checkH12_oneNextStep(rec);
  assert.equal(h12.pass, true, id + ": H-12 (ends with one next action / single question) — " + h12.detail);
  const rc5 = G.checks.checkRC5_sourceAndDate(rec);
  assert.equal(rc5.pass, true, id + ": R-C5 (source class + as-of) — " + rc5.detail);
  const h7 = G.checkClaimToState(rec);
  assert.ok(h7.every((x) => x.pass), id + ": H-7 (no un-negated claim verb) — " + JSON.stringify(h7.filter((x) => !x.pass)));
  return text;
}

test("SC-271 market value: typed result IS 129's marketValue output, with sourced evidence from the feed's stated ranges", () => {
  const r = run("SC-271");
  assert.equal(r.result.intent, "career_os_market_value");
  assert.ok(r.result.market_value && Array.isArray(r.result.market_value.evidence), "typed result carries market_value with an evidence list");
  assert.ok(r.result.market_value.evidence.length >= 1, "the harness feed's postings state salary ranges, so evidence exists");
  assert.ok(r.result.market_value.estimate && r.result.market_value.estimate.median_midpoint > 0, "estimate computed from sourced figures only");
  assertReplyClean("SC-271", r);
});
test("SC-272 skill gap: typed result IS 129's skillGap output (gaps + learn order + basis)", () => {
  const r = run("SC-272");
  assert.equal(r.result.intent, "career_os_skill_gap");
  assert.ok(r.result.skill_gap && Array.isArray(r.result.skill_gap.gaps) && Array.isArray(r.result.skill_gap.learn_next_order), "skill_gap product present");
  assert.ok(r.result.skill_gap.basis && typeof r.result.skill_gap.basis.postings_with_stated_ranges === "number", "basis counts present");
  assertReplyClean("SC-272", r);
});
test("SC-273 passive watch: a real watch record is created (F8-valid stored record) and carried in the result", () => {
  const r = run("SC-273");
  assert.equal(r.result.intent, "career_os_watch");
  assert.ok(r.result.watch && r.result.watch.watch_id && r.result.watch.created_at && r.result.watch.criteria, "watch record present");
  const v = Contracts.validate("F8", r.result.watch);
  assert.equal(v.valid, true, "watch satisfies the F8 stored-record contract: " + JSON.stringify(v));
  assertReplyClean("SC-273", r);
});
test("SC-274 network upkeep: typed result IS 129's networkUpkeep output over the relationship record", () => {
  const r = run("SC-274");
  assert.equal(r.result.intent, "career_os_upkeep");
  assert.ok(r.result.upkeep && Array.isArray(r.result.upkeep.ranked), "upkeep ranking present (empty on an empty record — stated honestly)");
  assertReplyClean("SC-274", r);
});
test("SC-275 wins log vs SC-276 review packet: DIFFERENT work products and different replies", () => {
  const a = run("SC-275"), b = run("SC-276");
  assert.equal(a.result.intent, "career_os_wins_log");
  assert.equal(b.result.intent, "career_os_review_packet");
  assert.notEqual((a.delivered || []).join("\n"), (b.delivered || []).join("\n"), "replies differ");
  assert.ok(b.result.review_packet && typeof b.result.review_packet.count === "number", "packet built from the wins log");
  const v = Contracts.validate("F8", b.result.review_packet);
  assert.equal(v.valid, true, "review packet satisfies the F8 stored-record contract: " + JSON.stringify(v));
  assertReplyClean("SC-275", a);
  assertReplyClean("SC-276", b);
});
test("SC-277 return-offer playbook: real 129 playbook + intern timeline in the result; no 'undefined' anywhere", () => {
  const r = run("SC-277");
  assert.equal(r.result.intent, "career_os_playbook");
  assert.ok(r.result.playbook && Array.isArray(r.result.playbook.steps) && r.result.playbook.steps.length >= 3, "playbook steps present");
  assert.ok(r.result.timeline && Array.isArray(r.result.timeline.milestones), "intern timeline present");
  assertReplyClean("SC-277", r);
});
test("SC-278 first-90-days: plan carried in the result and H-7 clean (no un-negated 'logged')", () => {
  const r = run("SC-278");
  assert.equal(r.result.intent, "career_os_first90");
  assert.ok(Array.isArray(r.result.first_90_days) && r.result.first_90_days.length === 3, "the 90-day plan is the typed product");
  assertReplyClean("SC-278", r);
});
test("SC-279 goals check-in: typed result IS 129's goalsCheckin output (goals vs reality)", () => {
  const r = run("SC-279");
  assert.equal(r.result.intent, "career_os_goals");
  assert.ok(r.result.goals && r.result.goals.reality && Array.isArray(r.result.goals.stated_goals), "check-in product present");
  assertReplyClean("SC-279", r);
});
test("SC-280 market shift: market value + 129's compBandShift verdict in the result; no move claimed on one snapshot", () => {
  const r = run("SC-280");
  assert.equal(r.result.intent, "career_os_market_shift");
  assert.ok(r.result.band_shift && "shift" in r.result.band_shift, "band-shift computation present");
  assert.equal(r.result.band_shift.shift, null, "one snapshot on record -> no shift is claimed");
  assertReplyClean("SC-280", r);
});
test("SC-281 skill-demand: demand ranking from 129's skillGap over the feed, honestly framed as one snapshot", () => {
  const r = run("SC-281");
  assert.equal(r.result.intent, "career_os_skill_trend");
  assert.ok(r.result.skill_gap && Array.isArray(r.result.skill_gap.gaps), "demand product present");
  assertReplyClean("SC-281", r);
});
test("SC-282 two-year re-route: typed result IS 134's answerPath output (claims + sources), R-C5 clean", () => {
  const r = run("SC-282");
  assert.equal(r.result.intent, "career_os_path");
  assert.ok(r.result.path_answer && Array.isArray(r.result.path_answer.claims) && Array.isArray(r.result.path_answer.sources), "path answer with its claims ledger + sources");
  const v = Paths.verifyPathAnswer(r.result.path_answer);
  assert.equal(v.ok, true, "134's own claim verification + advice lint pass on the carried answer");
  assertReplyClean("SC-282", r);
});
test("SC-284 mentor map: typed result IS 135's mentorMap output over the user's graph", () => {
  const r = run("SC-284");
  assert.equal(r.result.intent, "career_os_mentor_map");
  assert.ok(Array.isArray(r.result.mentor_map), "mentor map present (empty graph -> empty map, stated honestly)");
  assert.equal(r.result.graph_people, 0, "the harness graph holds 0 people and the result says so");
  assertReplyClean("SC-284", r);
});
test("SC-285 annual retro: typed result IS 136's seasonRetro output over the season record, R-C5 clean", () => {
  const r = run("SC-285");
  assert.equal(r.result.intent, "career_os_retro");
  assert.ok(r.result.retro && typeof r.result.retro.total === "number" && Array.isArray(r.result.retro.next_season_plan), "retro product present");
  assertReplyClean("SC-285", r);
});

// ---- unit level: the module defects under the chat-level failures ----
test("129 postingRange reads the feed's structured salary (the range as stated by the posting itself)", () => {
  const p = { company: "X", title: "SWE", salary: { min: 92000, max: 118000, currency: "USD", period: "year", raw: "$92,000-$118,000 USD per year" } };
  const r = OS.postingRange(p);
  assert.ok(r && r.low === 92000 && r.high === 118000, "structured range read");
  const hourly = OS.postingRange({ salary: { min: 38, max: 48, period: "hour" } });
  assert.ok(hourly && hourly.low === 38 * 2080, "hourly structured range annualized like the jd-text path");
  const mv = OS.marketValue({ postings: [p], as_of: "2026-10-13" });
  assert.ok(mv.estimate && mv.evidence.length === 1, "market value evidence exists on the real feed shape");
});
test("129 first-90-days plan carries no un-negated claim verb (H-7 shape)", () => {
  const pb = OS.returnOfferPlaybook({});
  for (const line of pb.first_90_days) assert.doesNotMatch(line, /\blogged\b/, "no 'logged' claim in: " + line);
});
test("134 exports listPaths (the API its chat consumer already calls) and every listed path answers verifiably", () => {
  assert.equal(typeof Paths.listPaths, "function", "listPaths exists");
  const all = Paths.listPaths();
  assert.ok(all.length >= 5 && all.every((p) => p.id && p.title), "path summaries carry id + title");
  for (const p of all) assert.ok(Paths.getPath(p.id), "getPath resolves " + p.id);
});
test("130 does not shadow non-OS asks (discovery / tailor / refusal shapes still fall through)", () => {
  const ctx = { profile: { basics: { name: "T" }, facts: [], preferences: {} }, postings: [] };
  assert.equal(Onboarding.handleChat("find me software engineering internships in Austin", ctx), null);
  assert.equal(Onboarding.handleChat("tailor my resume for this posting", ctx), null);
  assert.equal(Onboarding.handleChat("send all 500 today", ctx), null);
});
