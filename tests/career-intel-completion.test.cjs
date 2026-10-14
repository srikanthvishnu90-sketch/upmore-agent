// Career Intelligence completion — the R-C5 floor and the
// policy/flag records, through the real chat path. REPLAYS for
// BUG-115/116 (residual lane, 2026-10-14):
//   BUG-115 — advice answers failed R-C5 (a named source class AND
//     an as-of date on every Intelligence/Negotiation answer) even
//     though the dated grounding line existed in BOTH handlers:
//     handleIntelGuidance SHADOWED its dated sourceLine whenever
//     the guidance record's first source lacked its own as_of (the
//     reply then carried "Source: <a profile fact>" and no date),
//     and handleNegotiation's counter-scripts branch never pushed
//     its benchSentence (the dated source-class line) at all. The
//     grounding line now rides as its own fact in both.
//   BUG-116 — the stale-file and advice-flag turns carried only a
//     typed blocker when no company was named (payload undefined),
//     so no completion branch could fire; SC-270's outcome sentence
//     also named a bare claim verb ("the advice withdrawn", H-7)
//     for a conditional future step. Both turns now carry their
//     policy/flag record as payload + artifact, and the sentence
//     speaks without a claim verb.
// Check: node --test tests/career-intel-completion.test.cjs
"use strict";
process.env.HARNESS_OUT_DIR = process.env.HARNESS_OUT_DIR || "/tmp/gauntlet-intel-test-harness";
process.env.GAUNTLET_OUT_DIR = process.env.GAUNTLET_OUT_DIR || "/tmp/gauntlet-intel-test-evidence";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const L = require(path.join(ROOT, "scripts/career/gauntlet/pilot-lib.cjs"));
const H = L.H;

// grader-v2's R-C5 predicates, verbatim.
const HAS_SOURCE = /\b(BLS|Bureau of Labor|company file|public posting|population|dataset|your (own )?(log|record|sent history)|H-1B filing|as of|source)\b/i;
const HAS_DATE = /\b(20\d{2}|as of [A-Z][a-z]+ \d|Oct|Sep|Nov|Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug)\b/;

function drive(id, ask) {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = H.session(id, "intel-fix");
  const turn = L.chatTurn(s, ask, { profile });
  return { r: turn.result || {}, text: (turn.delivered || []).join("\n") };
}

const RC5_ASKS = {
  "SC-222": "\"What does IB recruiting actually require?\" — the real ladder, no sugarcoating",
  "SC-224": "\"Is a 3.4 GPA fatal for IB?\" — cutoffs checked firm by firm on my list",
  "SC-226": "\"Do search-fund internships actually help for BB?\" — answered from the pattern evidence",
  "SC-229": "\"Is the SWE market bad right now?\" — current data; known vs anecdotal kept separate",
  "SC-230": "Jane Street / Citadel quant path — competition signals, honest rarity",
  "SC-231": "Quant researcher vs trader — which fits me; day-to-day truth",
  "SC-232": "PM straight out of college — APM reality + the build-something plan",
  "SC-233": "MBB path — screens, case norms, this year's dates pulled live",
  "SC-234": "Big Law path — ABA employment data, debt stated honestly",
  "SC-235": "Pre-med path — prereqs, MCAT, clinical ladder, verified timeline",
  "SC-236": "PE from undergrad — the bank-first truth, stated plainly",
  "SC-237": "VC seats — how few exist and what routes are real",
  "SC-238": "Data science entry — master's reality vs applied roles",
  "SC-239": "Startup entry — the build-or-sell proof route",
  "SC-240": "Government / intel path — clearance timelines and citizenship rules, honestly",
  "SC-243": "\"Should I go to grad school?\" — ROI framework for my field",
  "SC-244": "\"Which major should I pick?\" — answered from population data at my target companies",
  "SC-245": "International student realism — sponsors identified from H-1B filing data; cap-exempt options",
  "SC-246": "Career switcher at 32 — transferable map and where switchers actually win",
};

for (const [id, ask] of Object.entries(RC5_ASKS)) {
  test(`${id}: advice answer carries a source class AND an as-of date (BUG-115)`, () => {
    const { text } = drive(id, ask);
    assert.ok(HAS_SOURCE.test(text), `${id}: source class present`);
    assert.ok(HAS_DATE.test(text), `${id}: as-of date present — reply: ${text.slice(0, 200)}`);
  });
}

test("SC-208: counter scripts carry the dated source-class line (BUG-115)", () => {
  const { text } = drive("SC-208", "Counter scripts: word-for-word email and call versions; nothing sends without my yes");
  assert.ok(HAS_SOURCE.test(text) && HAS_DATE.test(text), "R-C5 floor met on the scripts branch");
  assert.match(text, /checked as of 20\d{2}-\d{2}-\d{2}/);
});

test("SC-247: the profile comparison carries its record as the artifact (BUG-114)", () => {
  const { r } = drive("SC-247", "\"Compare my profile to the average Stripe hire\" — table, gaps, plan");
  assert.equal(r.intent, "company_intel");
  assert.ok(r.payload && r.artifact, "comparison record rides as payload + artifact (the doorstep)");
});

test("SC-269: the stale-file policy is the typed record (BUG-116)", () => {
  const { r } = drive("SC-269", "A company file goes stale (hiring status over 90 days) — re-verified or labeled stale");
  assert.equal(r.payload && r.payload.kind, "file_refresh");
  assert.equal(r.payload.stale_after_days, 90);
  assert.ok(r.artifact);
});

test("SC-270: the advice flag record + no bare claim verb (BUG-116)", () => {
  const { r, text } = drive("SC-270", "I report a piece of advice as wrong or outdated — the file is fixed and an eval is added");
  assert.equal(r.payload && r.payload.kind, "advice_report");
  assert.equal(r.payload.status, "flagged_for_reverification");
  assert.ok(!/\bwithdrawn\b/i.test(text), "H-7: the conditional outcome names no claim verb");
});
