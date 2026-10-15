"use strict";
// CLOCK-SOURCE GUARD (bug law: BUG-198 class / FR-383, MI-001).
// The turn clock reaches the domain modules as numeric epoch ms (the
// harness pins it; the production host passes a number). Any site that
// feeds it to Date.parse() gets NaN and silently falls back to the
// real wall clock, throws, or computes NaN verdicts — so the same
// build answered differently in the morning and the afternoon
// (SC-143 flipped exactly this way). This guard pins BOTH wall clocks
// and requires every verdict to be a function of the turn clock only:
// numeric-ms and ISO-string forms of the same instant must produce
// identical results, with no throw and no NaN in any verdict field.
// Remediation if this fails: find the site parsing a clock with
// Date.parse(...) on a possibly-numeric value and coerce type-safely
// (number passes through; string parses; absent/garbage -> default).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const RealDate = Date;
function pinWallClock(iso) {
  const fixed = RealDate.parse(iso);
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) { super(fixed); } else { super(...a); } }
    static now() { return fixed; }
  }
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  global.Date = FakeDate;
}
function unpinWallClock() { global.Date = RealDate; }

const L = require("../scripts/career/gauntlet/pilot-lib.cjs");
const Negotiation = require("../packages/domain/128-career-negotiation.js");
const CareerOS = require("../packages/domain/129-career-os.js");
const Graph = require("../packages/domain/135-career-graph.js");
const W11 = require("../packages/domain/145-career-w11-ext.js");

const TURN_NOW_ISO = "2026-10-13T12:00:00Z"; // pilot-lib STAGING_NOW
const TURN_NOW_MS = RealDate.parse(TURN_NOW_ISO);

const doc = fs.readFileSync(path.join(process.env.HOME, "workspace/your_files/upmore-career-300-scenarios.md"), "utf8");
const CANON = new Map();
for (const line of doc.split("\n")) { const m = line.match(/^(SC-\d{3})\s+(.+)$/); if (m && !CANON.has(m[1])) CANON.set(m[1], m[2].trim()); }
function turn(idOrAsk, extraCtx) {
  const ask = CANON.get(idOrAsk) || idOrAsk;
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = L.H.session("CLK-" + Math.random().toString(36).slice(2, 9), "grand");
  return L.chatTurn(s, ask, Object.assign({ profile }, extraCtx || {}));
}
const text = (r) => (r.delivered || []).join("\n");

// SC-143 through the chat path: 142 proposes slots FROM the turn
// clock (Outreach.proposeSlots takes nowOf(ctx)) and 141 judges them.
// The two clocks agreeing is the normal case; the defect was 141
// judging against the wall clock instead, which shifted the proposal
// a day whenever the suite ran after the slots' morning. The reply
// must be a function of the turn clock only.
test("BUG-198 class: SC-143's calendar verdicts are identical under morning and afternoon wall clocks", () => {
  pinWallClock("2026-10-15T21:35:00Z");
  let afternoon;
  try { afternoon = text(turn("SC-143")); } finally { unpinWallClock(); }
  pinWallClock("2026-10-15T12:00:00Z");
  let morning;
  try { morning = text(turn("SC-143")); } finally { unpinWallClock(); }
  assert.equal(afternoon, morning, "SC-143: the reply changed with the wall clock — a verdict is reading Date.now() instead of the turn clock");
  assert.ok(/Wednesday Oct 14 at 9:00 AM EDT/.test(afternoon), `SC-143: ${afternoon.slice(0, 300)}`);
});

// The BUG-198 behavior itself — a proposal never offers a time that
// has already passed — staged directly at the emitter: the offered
// slots (Wed Oct 14, 9/10/11 AM EDT, the ledger's record) are past
// at the turn clock (the record's delivery instant, Wed Oct 14
// 8:35 PM CT), so they must be re-proposed for the next day with the
// shift disclosed, identically under both wall clocks.
const Doorstep = require("../packages/domain/141-career-doorstep.js");
const SC143_TURN_NOW = RealDate.parse("2026-10-15T01:35:00Z");
const SC143_PAST_SLOTS = ["2026-10-14T13:00:00.000Z", "2026-10-14T14:00:00.000Z", "2026-10-14T15:00:00.000Z"]
  .map((start) => ({ start, timezone: "America/New_York", durationMin: 30 }));

test("BUG-198 class: past slots at the turn clock are re-proposed for the next day, disclosed, wall-clock invariant", () => {
  const emit = () => Doorstep.emitCalendarProposal(
    { now: SC143_TURN_NOW, timezone: "America/New_York" },
    { title: "Interview", slots: SC143_PAST_SLOTS, timezone: "America/New_York" });
  pinWallClock("2026-10-15T21:35:00Z");
  let afternoon;
  try { afternoon = emit(); } finally { unpinWallClock(); }
  pinWallClock("2026-10-15T12:00:00Z");
  let morning;
  try { morning = emit(); } finally { unpinWallClock(); }
  assert.equal(afternoon.reply, morning.reply, "emitCalendarProposal: the reply changed with the wall clock");
  assert.deepEqual(afternoon.payload.slot_evaluations, morning.payload.slot_evaluations, "emitCalendarProposal: slot verdicts changed with the wall clock");
  assert.ok(/proposes the same times tomorrow/.test(afternoon.reply), `emitCalendarProposal: ${afternoon.reply.slice(0, 300)}`);
  assert.ok(!/— that time has already passed/.test(afternoon.reply), "emitCalendarProposal: a past slot is still being offered");
  assert.equal(afternoon.payload.slots_shifted_next_day, true, "emitCalendarProposal: the shift is not recorded on the payload");
  assert.equal(afternoon.payload.card.start, "2026-10-15T13:00:00.000Z", "emitCalendarProposal: the proposed slot is not the next day's");
});

test("BUG-198 class: negotiation deadlinePlan accepts the numeric turn clock (no throw, no NaN)", () => {
  const offers = [{ company: "Acme", expiry_date: "2026-10-20" }, { company: "Beta", expiry_date: "2026-10-25" }];
  const byMs = Negotiation.deadlinePlan(offers, { now: TURN_NOW_MS });
  const byIso = Negotiation.deadlinePlan(offers, { now: TURN_NOW_ISO });
  assert.deepEqual(byMs, byIso, "deadlinePlan: numeric-ms and ISO forms of the turn clock disagree");
  assert.equal(byMs.deadlines[0].days_left, 7);
  assert.ok(Number.isFinite(byMs.deadlines[0].days_left), "deadlinePlan: days_left is not finite");
});

test("BUG-198 class: career-OS networkUpkeep accepts the numeric turn clock (no throw, no NaN)", () => {
  const store = CareerOS.createStore();
  store.relationships = [{ name: "Jamie Lee", org: "Acme", warmth: "warm", last_touch: "2026-10-01", channel: "email" }];
  const byMs = CareerOS.networkUpkeep(store, { now: TURN_NOW_MS });
  const byIso = CareerOS.networkUpkeep(store, { now: TURN_NOW_ISO });
  assert.deepEqual(byMs, byIso, "networkUpkeep: numeric-ms and ISO forms of the turn clock disagree");
  assert.equal(byMs.ranked[0].days_since, 12);
  assert.equal(byMs.as_of, "2026-10-13T12:00:00.000Z");
});

test("BUG-198 class: exploding-offer pressurePlan computes finite hours from the numeric turn clock", () => {
  const byMs = W11.pressurePlan({ company: "Acme", expiry_date: "2026-10-15" }, { now: TURN_NOW_MS });
  const byIso = W11.pressurePlan({ company: "Acme", expiry_date: "2026-10-15" }, { now: TURN_NOW_ISO });
  assert.equal(byMs.hours_left_at_plan, byIso.hours_left_at_plan, "pressurePlan: numeric-ms and ISO forms of the turn clock disagree");
  assert.equal(byMs.hours_left_at_plan, 36);
});

test("BUG-198 class: graph keepWarm sees due entries under the numeric turn clock", () => {
  const store = {
    people: [{ full_name: "Jamie Lee", current_firm: "Acme" }],
    interactions: [{ full_name: "Jamie Lee", at: "2026-08-14T12:00:00Z", outcome: "good_chat", topic: "markets" }],
  };
  const byMs = Graph.keepWarm(store, { now: TURN_NOW_MS });
  const byIso = Graph.keepWarm(store, { now: TURN_NOW_ISO });
  assert.deepEqual(byMs, byIso, "keepWarm: numeric-ms and ISO forms of the turn clock disagree");
  assert.equal(byMs.length, 1, "keepWarm: the 60-day good chat is due and must surface");
  assert.equal(byMs[0].days_since, 60);
});

test("BUG-198 class: the outreach draft path still gates a draft end to end (142 call-site smoke)", () => {
  const r = turn("SC-040");
  assert.ok(r && r.result, "SC-040: no result through the chat path");
  assert.ok(text(r).length > 0, "SC-040: empty reply through the chat path");
});
