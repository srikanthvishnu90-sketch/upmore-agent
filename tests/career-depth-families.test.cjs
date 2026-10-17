"use strict";
// DEPTH LANE B guards (MI-014 / MI-015 / MI-016 / MI-022, 2026-10-16).
// Fail-first replays of the genuine-phrasing failures this lane fixed:
// the negotiation, career-path, and prep-session families routed on
// exam dialect only, so plain-English multi-turn conversations fell
// to the generic fallback (measured on the fresh corpus at base
// f67db04: negotiation fallback 65.4%, career-OS 52.2%, prep 67.9%).
// Every conversation below is driven through the product chat path
// (120 -> 130 -> 142 -> 141) on the fixture profile; every assertion
// is on the DELIVERED text. The state-write discipline tests pin the
// floor: a question or a conditional records NO offer state, ever.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../scripts/career/gauntlet/pilot-lib.cjs");

const FALLBACK = /I didn't catch that/;
let seq = 0;
function convo(turns) {
  const profile = L.gauntletProfile("p1-early-career-swe");
  // Session slug "grand" is the harness's measurement world (the same
  // staging the corpus runner and the other guard suites use).
  const s = L.H.session("DF-" + (++seq) + "-" + Math.random().toString(36).slice(2, 7), "grand");
  const ctx = { profile };
  return turns.map((say) => {
    const r = L.chatTurn(s, say, ctx);
    return { say, handler: r.handler, intent: r.result && r.result.intent, reply: (r.delivered || []).join("\n"), profile };
  });
}
function noFallback(turn) {
  assert.ok(turn.handler, `no handler claimed: ${turn.say}`);
  assert.ok(!FALLBACK.test(turn.reply), `fell to fallback: ${turn.say}`);
}

// ---------- MI-014 negotiation: the P1 chain completes ----------
test("lane B negotiation: offer, push the deadline, draft — all three turns in-family", () => {
  const [t1, t2, t3] = convo([
    "Got an offer — SaaS company, $92k base, they want an answer by Friday",
    "Can I push it to Tuesday?",
    "Draft the extension email",
  ]);
  for (const t of [t1, t2, t3]) noFallback(t);
  assert.match(t1.reply, /92/);
  assert.match(t2.reply, /tuesday/i);
  assert.match(t3.reply, /Tuesday|extension/i);
});

test("lane B negotiation: two offers plus a signing statement, then a bare question gets the year-one math", () => {
  const turns = convo([
    "Two offers in hand — the community bank at 78k, and the insurer at 84k",
    "The insurer just added a $5k signing bonus",
    "So which one actually pays more in year one?",
  ]);
  for (const t of turns) noFallback(t);
  assert.match(turns[2].reply, /83|year one/i);
});

test("lane B negotiation: typo'd, rambling, emphasis-punctuated offer still opens the thread (M2)", () => {
  const [t1, t2, t3] = convo([
    "so uh i got an offer from a logistics company, 64k?? need to anser by friday i think",
    "thats low right? what would u counter",
    "wright the email pls, the short one",
  ]);
  for (const t of [t1, t2, t3]) noFallback(t);
  assert.match(t1.reply, /64/);
});

// ---------- MI-015 career OS: the path chain completes ----------
test("lane B career path: junior accountant to CFO — ladder, skills, CPA, next step", () => {
  const turns = convo([
    "I'm a junior accountant, I want to be a CFO one day — what should my next two moves be?",
    "Which skills do I build first?",
    "Honestly — does the CPA matter on this path or not really?",
    "What does the step after senior accountant look like?",
  ]);
  for (const t of turns) noFallback(t);
  assert.match(turns[0].reply, /CFO/);
  assert.match(turns[0].reply, /move|step|rung/i);
  assert.match(turns[2].reply, /CPA/);
  assert.match(turns[3].reply, /controller/i);
});

test("lane B career OS: the wins log persists across turns (log, then show)", () => {
  // KNOWN RED at delivery — BUG-253 (ledger): the wins LOG statement
  // is claimed by 130's SC-275 read-side branch (its gate matches
  // "log a win" and reports the count without logging), on a store
  // that does not survive 130's per-turn ctx either. 142's side is
  // fixed (the OS store rides the persisted track store; the show
  // branch reads it) — this replay turns green when the 130 owner
  // applies the same two moves. It stays in the suite as the
  // fail-first record of the seam defect.
  const [t1, t2, t3] = convo([
    "I'm an analyst — what's the ladder to associate actually made of?",
    "Log a win: I built the model the VP presented to the client",
    "Show me my wins log",
  ]);
  for (const t of [t1, t2, t3]) noFallback(t);
  assert.match(t3.reply, /model/i);
});

// ---------- MI-016 prep: sector routing + focus ----------
test("lane B prep: consulting session serves cases and honors the stated weakness", () => {
  const [t1, t2] = convo([
    "I have a consulting interview next week — help me practice cases",
    "harder one, and I'm weakest on profitability cases",
  ]);
  noFallback(t1);
  noFallback(t2);
  assert.match(t2.reply, /profit/i);
  assert.ok(!/Tell me about yourself/.test(t2.reply), "prep served the generic behavioral template into a case session");
});

test("lane B prep: law and medicine openers serve their own sector's bank", () => {
  const [law] = convo(["My law firm interview is next week — what do they ask?"]);
  noFallback(law);
  assert.match(law.reply, /law|firm|legal/i);
  const [med] = convo(["Med school MMI in three weeks, can we practise?"]);
  noFallback(med);
  assert.match(med.reply, /mmi|station|scenario|medical|medicine/i);
});

// ---------- MI-022: a prep thread never receives a wrong-domain template ----------
test("lane B MI-022 (GEN-0404 replay): a finance technical inside a Netflix SWE thread is answered as finance — and the thread returns to SWE", () => {
  const [t1, t2, t3] = convo([
    "I have a Netflix SWE interview Friday — prep me",
    "Walk me through the three financial statements",
    "Back to Netflix — give me a coding question",
  ]);
  for (const t of [t1, t2, t3]) noFallback(t);
  assert.match(t2.reply, /income statement/i);
  assert.match(t2.reply, /balance sheet/i);
  assert.ok(!/linked list|url shortener|hash map/i.test(t2.reply), "the SWE template leaked into the finance answer");
  assert.match(t3.reply, /coding|array|tree|string|design|algorithm/i);
  assert.ok(!/income statement|balance sheet|dcf/i.test(t3.reply), "the finance serve overwrote the SWE thread");
});

// ---------- The floor: state writes only from assertion ----------
test("lane B floor: a question or a conditional about an offer writes NO negotiation state", () => {
  for (const ask of ["Did I get an offer at 90k?", "What if I got an offer at 90k?"]) {
    const [t] = convo([ask]);
    const neg = (((t.profile || {})._careerTrackStore || {})._careerThread || {}).negotiation;
    assert.ok(!neg || !neg.amount, `a non-assertion wrote offer state: ${ask} -> ${JSON.stringify(neg)}`);
  }
});

test("lane B floor: an asserted offer DOES record (the write path itself is alive)", () => {
  const [t] = convo(["I got an offer at 90k from a startup, decide by Friday"]);
  const neg = (((t.profile || {})._careerTrackStore || {})._careerThread || {}).negotiation;
  assert.ok(neg && neg.amount, `an asserted offer recorded nothing: ${JSON.stringify(neg)}`);
});
