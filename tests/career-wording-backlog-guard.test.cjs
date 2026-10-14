"use strict";
// Wording-backlog guards (bug law: BUG-124..BUG-132, Outreach lane).
// The capstone judge (build e107f58) measured wording at 103/278: the
// deterministic products largely passed while the SPOKEN replies
// under-spoke their records. Each test below drives canonical asks
// through the integrated chat path (pilot-lib chatTurn:
// 120 -> 130 -> 142 -> 141) and asserts the reply speaks the ask's
// own substance. A fix that re-cans the text fails on grounding.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../scripts/career/gauntlet/pilot-lib.cjs");
const Outreach = require("../packages/domain/124-career-outreach.js");

const doc = fs.readFileSync(path.join(process.env.HOME, "workspace/your_files/upmore-career-300-scenarios.md"), "utf8");
const CANON = new Map();
for (const line of doc.split("\n")) { const m = line.match(/^(SC-\d{3})\s+(.+)$/); if (m && !CANON.has(m[1])) CANON.set(m[1], m[2].trim()); }

function turn(idOrAsk, profileName) {
  const ask = CANON.get(idOrAsk) || idOrAsk;
  const profile = L.gauntletProfile(profileName || "p1-early-career-swe");
  const s = L.H.session("WB-" + Math.random().toString(36).slice(2, 9), "grand");
  return L.chatTurn(s, ask, { profile });
}
const text = (r) => (r.delivered || []).join("\n");

// ---- BUG-125: the plan stance is building-now, never "Say go" deferral ----
test("BUG-125: plan replies open building-now and never defer with 'Say go'", () => {
  for (const id of ["SC-004", "SC-013", "SC-014", "SC-015", "SC-016", "SC-020", "SC-026", "SC-027", "SC-030", "SC-055", "SC-059"]) {
    const t = text(turn(id));
    assert.ok(t.startsWith("Building the list now:"), `${id}: plan reply must open building-now, got: ${t.slice(0, 80)}`);
    assert.ok(!/Say go and I build/.test(t), `${id}: 'Say go' deferral is back: ${t.slice(0, 120)}`);
  }
});

// ---- BUG-125/127: every parsed facet is spoken (no if/else single-filter) ----
test("BUG-127: plan replies speak every filter the ask carries", () => {
  const cases = [
    ["SC-015", [/seed-stage/i, /first PM/i]],                       // stage AND first-hire
    ["SC-055", [/Series A/i, /GitHub/i]],                           // stage AND github
    ["SC-014", [/data scientists/i, /fintechs/i, /SF/, /major/i]],  // role phrase, sector, geo, major
    ["SC-030", [/bulge bracket/i, /last 2 years/i]],                // set AND fresh cohort
    ["SC-016", [/quant traders/i, /competition-math/i]],            // role phrase AND background
    ["SC-020", [/boutique/i, /hometown/i]],                         // set AND warmth ranking
    ["SC-026", [/healthtech/i, /state-school/i]],                   // universe AND school screen
    ["SC-023", [/finance-club/i, /banks/i]],                        // club AND destination
    ["SC-021", [/interned at a startup first/i]],
    ["SC-024", [/hiring engineers/i]],
    ["SC-058", [/deal/i, /personalized/i]],
    ["SC-022", [/restructuring/i, /restructuring chat/i, /Houlihan/]],
    ["SC-059", [/teachers-turned product people/i, /career switch/i]],
    ["SC-004", [/associates/i, /coffee chat/i]],                    // role phrase AND purpose
    ["SC-010", [/PE associates and principals/i, /peer to peer/i]],
    ["SC-060", [/10 dream companies/i, /[Ww]arm paths rank/i]],
  ];
  for (const [id, res] of cases) {
    const t = text(turn(id));
    for (const re of res) assert.ok(re.test(t), `${id}: reply must speak ${re} — got: ${t.slice(0, 200)}`);
  }
});

// ---- BUG-124: prose lookalikes never extract as firms ----
test("BUG-124: 'competition-math' never yields MATH Venture Partners", () => {
  const q = Outreach.parseTarget(CANON.get("SC-016"), {});
  assert.ok(!q.firms.includes("MATH Venture Partners"), `firms: ${q.firms}`);
  assert.equal(q.firm_set, "quant");
  const t = text(turn("SC-016"));
  assert.ok(!/MATH Venture Partners/.test(t), "reply names the ungrounded firm");
  assert.ok(/Jane Street/.test(t), "reply names the quant set");
});

// ---- BUG-126: a shadow phrase is the user's firm, verbatim ----
test("BUG-126: 'Bain Capital' is never rewritten to Bain & Company", () => {
  const q = Outreach.parseTarget(CANON.get("SC-027"), {});
  assert.ok(q.firms.includes("Bain Capital"), `firms: ${q.firms}`);
  assert.ok(!q.firms.includes("Bain & Company"), `firms: ${q.firms}`);
  assert.ok(q.firms.includes("KKR"), `firms: ${q.firms}`);
  const t = text(turn("SC-027"));
  assert.ok(/Bain Capital/.test(t) && !/Bain & Company/.test(t), `reply: ${t.slice(0, 160)}`);
  assert.ok(/associates/i.test(t) && !/110 consultants/.test(t), "role phrase is the ask's 'associates'");
});

// ---- BUG-128: a population ask never hears the default count as its size ----
test("BUG-128: population asks are answered as populations, not the default 40", () => {
  const t5 = text(turn("SC-005"));
  assert.ok(/every founder in the latest YC batch/i.test(t5), `SC-005: ${t5.slice(0, 120)}`);
  assert.ok(!/\b40\b/.test(t5), `SC-005 must not state 40 anywhere: ${t5}`);
  const t6 = text(turn("SC-006"));
  assert.ok(/everyone you know at Palantir first/i.test(t6) && /second-degree/i.test(t6), `SC-006 sequence: ${t6.slice(0, 160)}`);
  assert.ok(!/\b40\b/.test(t6), `SC-006 must not state 40 anywhere: ${t6}`);
});

// ---- BUG-129: firm-less asks are proposed their own universe ----
test("BUG-129: no bulge-bracket proposal serves a non-banking ask", () => {
  const t10 = text(turn("SC-010"));
  assert.ok(/Blackstone/.test(t10) && !/bulge bracket/i.test(t10), `SC-010 proposes the PE set: ${t10.slice(0, 200)}`);
  for (const id of ["SC-026", "SC-028", "SC-029", "SC-059", "SC-060"]) {
    const t = text(turn(id));
    assert.ok(!/bulge bracket|Goldman Sachs/.test(t), `${id}: bulge proposal is back: ${t.slice(0, 160)}`);
  }
  const t28 = text(turn("SC-028"));
  assert.ok(/strategy analysts/i.test(t28) && /Fortune 500/.test(t28), `SC-028: ${t28.slice(0, 160)}`);
  const t29 = text(turn("SC-029"));
  assert.ok(/UX researchers/i.test(t29) && /fintech and insurtech/i.test(t29), `SC-029: ${t29.slice(0, 160)}`);
});

// ---- BUG-130: a decision the user already gave is never re-asked ----
test("BUG-130: SC-025 states the Tier C hold as settled", () => {
  const t = text(turn("SC-025"));
  assert.ok(/held at zero, exactly as you set it/i.test(t), `SC-025: ${t.slice(0, 120)}`);
  assert.ok(!/Hold Tier C back, or release it/.test(t), "the decided question is re-asked");
});

// ---- BUG-131: carried shapes speak their records ----
test("BUG-131: voice ask keeps its own sample count; reserve speaks its split; safety plan states the cap", () => {
  const t40 = text(turn("SC-040"));
  assert.ok(/the 8 sent emails you mentioned/.test(t40), `SC-040: ${t40.slice(-140)}`);
  const t48 = text(turn("SC-048"));
  assert.ok(/40 next names in rank order, behind the 500 selected/.test(t48), `SC-048: ${t48.slice(0, 140)}`);
  const t43 = text(turn("SC-043"));
  assert.ok(/daily cap starts at 12/i.test(t43), `SC-043 states the daily cap: ${t43.slice(0, 200)}`);
  const t46 = text(turn("SC-046"));
  assert.ok(/checked twice — once when the list is built and again when emails are queued/.test(t46), `SC-046: ${t46.slice(0, 120)}`);
  assert.ok(!/enforced in code/.test(t46), "SC-046 jargon is back");
  const t47 = text(turn("SC-047"));
  assert.ok(!/by construction/.test(t47), "SC-047 jargon is back");
  const t39 = text(turn("SC-039"));
  assert.ok(/seed run is staged for the current draft set now/.test(t39), `SC-039: ${t39.slice(-160)}`);
  const t33 = text(turn("SC-033"));
  assert.ok(/1 person suppressed/.test(t33), `SC-033 states the number: ${t33.slice(0, 200)}`);
  const t42 = text(turn("SC-042"));
  assert.ok(/re-rendered samples sit at the top of your review doc/.test(t42), `SC-042: ${t42.slice(-160)}`);
  const t45 = text(turn("SC-045"));
  assert.ok(!/Open the campaign record and I will run/.test(t45), "SC-045 defers to an unloaded record");
});

// ---- BUG-132: a calendar proposal names its offered times ----
test("BUG-132: SC-031 names both offered times with absolute dates", () => {
  const t = text(turn("SC-031"));
  assert.ok(/(Tuesday|Wednesday) [A-Z][a-z]+ \d+ at 5:00 PM/.test(t), `SC-031: ${t.slice(0, 240)}`);
  assert.ok(!/Tell me what you'd like to do next/.test(t), "generic closer is back");
});

// ---- plan replies stay pairwise distinct across the family ----
test("BUG-125: no two plan replies in the family are byte-identical", () => {
  const ids = ["SC-004", "SC-005", "SC-006", "SC-010", "SC-012", "SC-013", "SC-014", "SC-015", "SC-016", "SC-017", "SC-018", "SC-019", "SC-020", "SC-021", "SC-022", "SC-023", "SC-024", "SC-026", "SC-027", "SC-028", "SC-029", "SC-030", "SC-055", "SC-056", "SC-058", "SC-059", "SC-060"];
  const seen = new Map();
  for (const id of ids) {
    const t = text(turn(id));
    for (const [other, ot] of seen) assert.notEqual(t, ot, `${id} and ${other} delivered byte-identical replies`);
    seen.set(id, t);
  }
});
