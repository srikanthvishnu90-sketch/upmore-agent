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
const Doorstep = require("../packages/domain/141-career-doorstep.js");

// SERIAL-1511: the 300-scenario document is private and lives outside the repository. Without it every test here is
// SKIPPED-UNVERIFIED (a skip, never a pass), and the gap is listed for F6 (docs/architect/reports/OUTREACH-CEILINGS-2026-10-26.md,
// "Benchmark gaps"). The path is never copied into CI.
const DOC_PATH = path.join(process.env.HOME || "", "workspace/your_files/upmore-career-300-scenarios.md");
const doc = fs.existsSync(DOC_PATH) ? fs.readFileSync(DOC_PATH, "utf8") : null;
const SKIP = doc === null ? "SKIPPED-UNVERIFIED: the private 300-scenario document is not on this machine; nothing here was checked" : false;
const nodeTest = test;
const test_ = (name, fn) => nodeTest(name, { skip: SKIP }, fn);
const CANON = new Map();
for (const line of (doc || "").split("\n")) { const m = line.match(/^(SC-\d{3})\s+(.+)$/); if (m && !CANON.has(m[1])) CANON.set(m[1], m[2].trim()); }

function turn(idOrAsk, profileName) {
  const ask = CANON.get(idOrAsk) || idOrAsk;
  const profile = L.gauntletProfile(profileName || "p1-early-career-swe");
  const s = L.H.session("WB-" + Math.random().toString(36).slice(2, 9), "grand");
  return L.chatTurn(s, ask, { profile });
}
const text = (r) => (r.delivered || []).join("\n");

// ---- BUG-125: the plan stance is building-now, never "Say go" deferral ----
test_("BUG-125: plan replies open building-now and never defer with 'Say go'", () => {
  for (const id of ["SC-004", "SC-013", "SC-014", "SC-015", "SC-016", "SC-020", "SC-026", "SC-027", "SC-030", "SC-055", "SC-059"]) {
    const t = text(turn(id));
    assert.ok(t.startsWith("Building the list now:"), `${id}: plan reply must open building-now, got: ${t.slice(0, 80)}`);
    assert.ok(!/Say go and I build/.test(t), `${id}: 'Say go' deferral is back: ${t.slice(0, 120)}`);
  }
});

// ---- BUG-125/127: every parsed facet is spoken (no if/else single-filter) ----
test_("BUG-127: plan replies speak every filter the ask carries", () => {
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
test_("BUG-124: 'competition-math' never yields MATH Venture Partners", () => {
  const q = Outreach.parseTarget(CANON.get("SC-016"), {});
  assert.ok(!q.firms.includes("MATH Venture Partners"), `firms: ${q.firms}`);
  assert.equal(q.firm_set, "quant");
  const t = text(turn("SC-016"));
  assert.ok(!/MATH Venture Partners/.test(t), "reply names the ungrounded firm");
  assert.ok(/Jane Street/.test(t), "reply names the quant set");
});

// ---- BUG-126: a shadow phrase is the user's firm, verbatim ----
test_("BUG-126: 'Bain Capital' is never rewritten to Bain & Company", () => {
  const q = Outreach.parseTarget(CANON.get("SC-027"), {});
  assert.ok(q.firms.includes("Bain Capital"), `firms: ${q.firms}`);
  assert.ok(!q.firms.includes("Bain & Company"), `firms: ${q.firms}`);
  assert.ok(q.firms.includes("KKR"), `firms: ${q.firms}`);
  const t = text(turn("SC-027"));
  assert.ok(/Bain Capital/.test(t) && !/Bain & Company/.test(t), `reply: ${t.slice(0, 160)}`);
  assert.ok(/associates/i.test(t) && !/110 consultants/.test(t), "role phrase is the ask's 'associates'");
});

// ---- BUG-128: a population ask never hears the default count as its size ----
test_("BUG-128: population asks are answered as populations, not the default 40", () => {
  const t5 = text(turn("SC-005"));
  assert.ok(/every founder in the latest YC batch/i.test(t5), `SC-005: ${t5.slice(0, 120)}`);
  assert.ok(!/\b40\b/.test(t5), `SC-005 must not state 40 anywhere: ${t5}`);
  const t6 = text(turn("SC-006"));
  assert.ok(/everyone you know at Palantir first/i.test(t6) && /second-degree/i.test(t6), `SC-006 sequence: ${t6.slice(0, 160)}`);
  assert.ok(!/\b40\b/.test(t6), `SC-006 must not state 40 anywhere: ${t6}`);
});

// ---- BUG-129: firm-less asks are proposed their own universe ----
test_("BUG-129: no bulge-bracket proposal serves a non-banking ask", () => {
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
test_("BUG-130: SC-025 states the Tier C hold as settled", () => {
  const t = text(turn("SC-025"));
  assert.ok(/held at zero, exactly as you set it/i.test(t), `SC-025: ${t.slice(0, 120)}`);
  assert.ok(!/Hold Tier C back, or release it/.test(t), "the decided question is re-asked");
});

// ---- BUG-131: carried shapes speak their records ----
test_("BUG-131: voice ask keeps its own sample count; reserve speaks its split; safety plan states the cap", () => {
  const t40 = text(turn("SC-040"));
  assert.ok(/the 8 emails you mentioned/.test(t40), `SC-040: ${t40.slice(-140)}`);
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
  assert.ok(/1 person added to the never-contact list/.test(t33), `SC-033 states the number: ${t33.slice(0, 200)}`);
  const t42 = text(turn("SC-042"));
  assert.ok(/re-rendered samples sit at the top of your review doc/.test(t42), `SC-042: ${t42.slice(-160)}`);
  const t45 = text(turn("SC-045"));
  assert.ok(!/Open the campaign record and I will run/.test(t45), "SC-045 defers to an unloaded record");
});

// ---- BUG-132: a calendar proposal names its offered times ----
test_("BUG-132: SC-031 names both offered times with absolute dates", () => {
  const t = text(turn("SC-031"));
  assert.ok(/(Tuesday|Wednesday) [A-Z][a-z]+ \d+ at 5:00 PM/.test(t), `SC-031: ${t.slice(0, 240)}`);
  assert.ok(!/Tell me what you'd like to do next/.test(t), "generic closer is back");
});

// ---- plan replies stay pairwise distinct across the family ----
test_("BUG-125: no two plan replies in the family are byte-identical", () => {
  const ids = ["SC-004", "SC-005", "SC-006", "SC-010", "SC-012", "SC-013", "SC-014", "SC-015", "SC-016", "SC-017", "SC-018", "SC-019", "SC-020", "SC-021", "SC-022", "SC-023", "SC-024", "SC-026", "SC-027", "SC-028", "SC-029", "SC-030", "SC-055", "SC-056", "SC-058", "SC-059", "SC-060"];
  const seen = new Map();
  for (const id of ids) {
    const t = text(turn(id));
    for (const [other, ot] of seen) assert.notEqual(t, ot, `${id} and ${other} delivered byte-identical replies`);
    seen.set(id, t);
  }
});

// ================= PREP (BUG-133..BUG-136) =================

// ---- BUG-133: a prep-set headline claims a company match only when
// a company file grounds it; track sets name their track; a quant
// ask leads with the quant drills; a PM set exists ----
test_("BUG-133: prep sets speak their true track and grounding", () => {
  const t183 = text(turn("SC-183"));
  assert.ok(/Your SWE coding prep set\./.test(t183), `SC-183: ${t183.slice(0, 90)}`);
  assert.ok(!/matched to how this round actually runs/.test(t183), "SC-183: ungrounded match claim");
  assert.ok(/track's standard set/.test(t183), "SC-183: honest grounding line");
  const t186 = text(turn("SC-186"));
  assert.ok(/Your quant prep set\./.test(t186), `SC-186: ${t186.slice(0, 80)}`);
  assert.ok(/two heads in a row/.test(t186) && /make a market/.test(t186), "SC-186: quant drills lead");
  assert.ok(!/three financial statements/.test(t186.split("Gaps are named")[0].slice(0, 400)) || t186.indexOf("two heads") < t186.indexOf("three financial"), "SC-186: quant before banking");
  const t187 = text(turn("SC-187"));
  assert.ok(/Your finance technicals prep set\./.test(t187) && /Gaps get named from your answers/.test(t187), `SC-187: ${t187.slice(0, 120)}`);
  const t188 = text(turn("SC-188"));
  assert.ok(/Your PM prep set\./.test(t188) && /thing you shipped/.test(t188) && /improve it/.test(t188), `SC-188: ${t188.slice(0, 120)}`);
});

// ---- BUG-134: story matching is spoken from the record; an empty
// STAR bank is answered as an empty bank ----
test_("BUG-134: question bank and STAR bank speak their true match state", () => {
  const t177 = text(turn("SC-177"));
  assert.ok(/story match stated per question/.test(t177), `SC-177: ${t177.slice(0, 90)}`);
  assert.ok(/No story is matched to any question yet/.test(t177), "SC-177: empty match stated");
  assert.ok(!/your best story matched to each/.test(t177), "SC-177: no promised match");
  const t180 = text(turn("SC-180"));
  assert.ok(/^Your STAR bank is empty/.test(t180), `SC-180: ${t180.slice(0, 90)}`);
  assert.ok(/the 8 reusable stories you asked for do not exist/.test(t180), "SC-180: the ask's count carried honestly");
  assert.ok(!/Likely first questions/.test(t180), "SC-180: no canned brief questions");
});

// ---- BUG-135: producer replies speak their own records, once ----
test_("BUG-135: producer replies speak their records with per-shape next steps", () => {
  const t184 = text(turn("SC-184"));
  assert.ok(/Work these prompts/.test(t184) && /The framework, in order/.test(t184), `SC-184: ${t184.slice(0, 160)}`);
  const t194 = text(turn("SC-194"));
  assert.ok(/say: I'm focused on the role/.test(t194) && /Do not anchor early/.test(t194), `SC-194: ${t194.slice(0, 200)}`);
  const t197 = text(turn("SC-197"));
  for (const w of ["Situation", "Task", "Action", "Result"]) assert.ok(t197.includes(w), `SC-197 missing ${w}`);
  assert.ok(!/<one line/.test(t197), "SC-197: raw scaffold template leaked");
  const t198 = text(turn("SC-198"));
  assert.ok(!/\(TEST/.test(t198), "SC-198: fixture label in prose");
  assert.ok(/Camera, mic and speaker test/.test(t198), "SC-198: checklist enumerated past logistics");
  const t199 = text(turn("SC-199"));
  assert.ok(/No debrief is captured yet/.test(t199) && !/Your interview brief/.test(t199), `SC-199: ${t199.slice(0, 120)}`);
  const t178 = text(turn("SC-178"));
  assert.ok(t178.trimEnd().endsWith("Tell me about yourself and why this role."), `SC-178 must end on the question: ${t178.slice(-120)}`);
  assert.ok(!/Tell me what you'd like to do next/.test(t178), "SC-178: generic closer");
  // the doubled grounding filler is gone family-wide
  for (const id of ["SC-184", "SC-189", "SC-191", "SC-192", "SC-193", "SC-200", "SC-201"]) {
    const t = text(turn(id));
    const n = (t.match(/nothing rehearsed that you cannot defend/g) || []).length;
    assert.ok(n <= 1, `${id}: grounding filler appears ${n} times`);
    assert.ok(!/Want to run the first piece as a timed drill\?/.test(t), `${id}: shared drill closer survived`);
  }
});

// ---- BUG-136: briefs and coffee chats speak their records ----
test_("BUG-136: brief replies speak bar, loop, and story state; coffee chats speak their points", () => {
  const t176 = text(turn("SC-176"));
  assert.ok(/Your night-before brief for Stripe\./.test(t176) && /The bar at Stripe:/.test(t176) && /The loop, from the company file:/.test(t176), `SC-176: ${t176.slice(0, 200)}`);
  const t190 = text(turn("SC-190"));
  assert.ok(/Questions to ask them/.test(t190) && /Palantir/.test(t190), `SC-190: ${t190.slice(0, 200)}`);
  const t182 = text(turn("SC-182"));
  assert.ok(/Questions to ask them/.test(t182) && /No company file is on record for this chat/.test(t182), `SC-182: ${t182.slice(0, 200)}`);
  const t203 = text(turn("SC-203"));
  assert.ok(/The portfolio walkthrough, project by project\./.test(t203) && /Each project runs in this order/.test(t203), `SC-203: ${t203.slice(0, 160)}`);
  const t200 = text(turn("SC-200"));
  assert.ok(/Your superday plan\./.test(t200) && /No company file is on record for this round/.test(t200) && /prep stops at 9:00 PM/.test(t200), `SC-200: ${t200.slice(0, 200)}`);
  const t195 = text(turn("SC-195"));
  assert.ok(!/matched to this panel/.test(t195) && /No team or company file was supplied/.test(t195), `SC-195: ${t195.slice(0, 200)}`);
});

// ================= TRACK (BUG-137..BUG-140) =================

// ---- BUG-137: stage announcements speak the event, its true
// source, and the company state the record carries ----
test_("BUG-137: announcements name the event, its source, and its next step", () => {
  const t122 = text(turn("SC-122"));
  assert.ok(/Confirmation on the record/.test(t122) && /came from the confirmation email itself/.test(t122), `SC-122: ${t122.slice(0, 160)}`);
  assert.ok(/carried as company not stated/.test(t122), "SC-122: TN-1a state spoken");
  assert.ok(!/Want the detail behind the new stage\?/.test(t122), "SC-122: detail-tease closer gone");
  const t138 = text(turn("SC-138"));
  assert.ok(/Interview at Ramp — on the record/.test(t138), `SC-138: ${t138.slice(0, 120)}`);
  assert.ok(/from your message just now, not from an email/.test(t138), "SC-138: chat provenance told truly");
  assert.ok(!/came from the email itself/.test(t138), "SC-138: false email provenance gone");
  const t126 = text(turn("SC-126"));
  assert.ok(/Assessment on the record/.test(t126) && /prep pack for this assessment now\?/.test(t126), `SC-126: ${t126.slice(0, 160)}`);
  const t127 = text(turn("SC-127"));
  assert.ok(/Offer on the record/.test(t127) && /offer terms — base, bonus, expiry — laid out now\?/.test(t127), `SC-127: ${t127.slice(0, 160)}`);
  const t123 = text(turn("SC-123"));
  assert.ok(/Rejection on the record/.test(t123) && /came from the rejection email itself/.test(t123) && /full what-to-tighten note now\?/.test(t123), `SC-123: ${t123.slice(0, 160)}`);
});

// ---- BUG-138: an empty tracker answers in the shape of the ask ----
test_("BUG-138: empty-tracker replies take the ask's shape", () => {
  const t134 = text(turn("SC-134"));
  assert.ok(/Your offer expires Friday, [A-Z][a-z]+ \d+ — I will flag it daily until you decide/.test(t134), `SC-134: ${t134.slice(0, 120)}`);
  const t139 = text(turn("SC-139"));
  assert.ok(/labeled ghosted/.test(t139) && /one follow-up/.test(t139), `SC-139: ${t139.slice(0, 140)}`);
  const t140 = text(turn("SC-140"));
  assert.ok(/The quiet-hours rule is ready/.test(t140) && /fold into the morning digest during your quiet hours/.test(t140), `SC-140: ${t140.slice(0, 120)}`);
  const t121 = text(turn("SC-121"));
  assert.ok(/Tell me about any application already out under your own name, and I will log it first\./.test(t121), `SC-121: ${t121.slice(-120)}`);
  assert.ok(!/Find a role and I will start the tracker with it\./.test(t121), "SC-121: generic closer gone");
});

// ---- BUG-139: drafts are shown or their missing input is named —
// never described as if they existed ----
test_("BUG-139: nudge, thank-you, and classification speak their true state", () => {
  const t129 = text(turn("SC-129"));
  assert.ok(/The thank-you is not drafted yet/.test(t129), `SC-129: ${t129.slice(0, 120)}`);
  assert.ok(!/drafted from your note/.test(t129), "SC-129: no note claimed that the record does not hold");
  const t125 = text(turn("SC-125"));
  assert.ok(/sounds positive but has not confirmed anything/.test(t125), `SC-125: ${t125.slice(0, 200)}`);
  assert.ok(!/positive ready/.test(t125), "SC-125: label fragment gone");
  const t128 = text(turn("SC-128"));
  assert.ok(/needs the application it belongs to/.test(t128), `SC-128: ${t128.slice(0, 140)}`);
  assert.ok(!/references the exact role and date from the tracker/.test(t128), "SC-128: undescribed-draft claim gone");
});

// ---- BUG-140: digests, funnel, season, and briefs speak their
// records' numbers ----
test_("BUG-140: track summaries speak their records", () => {
  const t131 = text(turn("SC-131"));
  assert.ok(/Applications out 0, replies in 0, interviews 0/.test(t131), `SC-131: ${t131.slice(0, 160)}`);
  const t133 = text(turn("SC-133"));
  assert.ok(!/wearing a suit/.test(t133) && /referral and cold rates can be compared honestly/.test(t133), `SC-133: ${t133.slice(0, 200)}`);
  const t141 = text(turn("SC-141"));
  assert.ok(/0 applications across 0 active weeks/.test(t141) && !/week\(s\)/.test(t141), `SC-141: ${t141.slice(0, 160)}`);
  const t144 = text(turn("SC-144"));
  assert.ok(/ready to log — give me the number and the company/.test(t144), `SC-144: ${t144.slice(0, 140)}`);
  const t145 = text(turn("SC-145"));
  assert.ok(/The retro in numbers: 0 applications/.test(t145), `SC-145: ${t145.slice(0, 160)}`);
  const t135 = text(turn("SC-135"));
  assert.ok(/Your interview brief for Thursday at 2:00 PM\./.test(t135) && /(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}/.test(t135), `SC-135: ${t135.slice(0, 200)}`);
  const t136 = text(turn("SC-136"));
  assert.ok(/Your prep order for both interviews\./.test(t136), `SC-136: ${t136.slice(0, 120)}`);
  const t137 = text(turn("SC-137"));
  assert.ok(!/Something went wrong/.test(t137) && /no other live applications to withdraw/.test(t137), `SC-137: ${t137.slice(0, 140)}`);
});

// ================= OUTREACH PASS 2 (BUG-187..BUG-191) =================
// The wordingfix judge's new rows: closers that contradicted the
// building-now headline, cap timelines that did not reconcile,
// parse-level facet drops, a question credited as a decision, and
// deliverables deferred instead of computed in the reply.

// ---- BUG-187: no approval-gated build closers; peer tone at the user's level ----
test_("BUG-187: proposed-set and category plans build now; the peer tone speaks peer to peer", () => {
  for (const id of ["SC-010", "SC-028", "SC-029", "SC-060"]) {
    const t = text(turn(id));
    assert.ok(!/Approve the (category|proposed set) and I build/.test(t), `${id}: approval-gated build closer is back: ${t.slice(-200)}`);
    assert.ok(/build runs on the proposed set now|with the build running on it now|Building the list now/.test(t), `${id}: building-now closer missing: ${t.slice(-200)}`);
  }
  const t10 = text(turn("SC-010"));
  assert.ok(!/associate to associate/.test(t10) && /lateral move between equals/.test(t10), `SC-010 tone: ${t10.slice(0, 200)}`);
});

// ---- BUG-188: the timeline reconciles with the per-firm cap ----
test_("BUG-188: closed/named firm sets get window arithmetic, not a ramp-only timeline", () => {
  const cases = [["SC-012", /4 monthly windows/], ["SC-017", /5 monthly windows/], ["SC-022", /3 monthly windows/], ["SC-027", /4 monthly windows/], ["SC-030", /2 monthly windows/]];
  for (const [id, re] of cases) {
    const t = text(turn(id));
    assert.ok(re.test(t), `${id}: expected ${re} — got: ${t.slice(0, 260)}`);
    assert.ok(!/first emails take at least \d+ days of sending/.test(t), `${id}: ramp-only timeline survives: ${t.slice(0, 260)}`);
  }
});

// ---- BUG-189: parse facets — years are not counts, listed firms all named, sets and phrases un-narrowed ----
test_("BUG-189: cohort years never parse as a headcount; every listed firm is named; the school capture stops at the school", () => {
  const t8 = text(turn("SC-008"));
  assert.ok(!/2023 associates|2,?023 first emails/.test(t8), `SC-008: year-as-count is back: ${t8.slice(0, 200)}`);
  assert.ok(/2023–25 classes/.test(t8) && /M&A/.test(t8) && /\(Wharton\)/.test(t8), `SC-008 facets: ${t8.slice(0, 260)}`);
  const t9 = text(turn("SC-009"));
  assert.ok(/Stripe, Ramp, Plaid, Datadog/.test(t9), `SC-009 firms: ${t9.slice(0, 160)}`);
  assert.ok(/\(CMU\)/.test(t9) && !/CMU or are from my hometown/.test(t9), `SC-009 school splice: ${t9.slice(0, 200)}`);
  const t7 = text(turn("SC-007"));
  assert.ok(/middle-market and boutique set/.test(t7) && /freshman at a non-target/.test(t7), `SC-007: ${t7.slice(0, 200)}`);
  const t55 = text(turn("SC-055"));
  assert.ok(/95 AI\/ML engineers/.test(t55), `SC-055: ${t55.slice(0, 120)}`);
  const t21 = text(turn("SC-021"));
  assert.ok(/only people at Google who interned at a startup first/.test(t21), `SC-021: ${t21.slice(0, 200)}`);
});

// ---- BUG-190: a question is not a decision; the safety card states its cap once and dates its ramp ----
test_("BUG-190: SC-050 asks the Tier C question it was told to ask; SC-043's cap reads one way with dated finish arithmetic", () => {
  const t50 = text(turn("SC-050"));
  assert.ok(!/exactly as you set it/.test(t50), `SC-050: question credited as a decision: ${t50.slice(0, 160)}`);
  assert.ok(/Hold Tier C back, or release it/.test(t50) && /372 Tier A and B/.test(t50), `SC-050: ${t50.slice(0, 260)}`);
  const t43 = text(turn("SC-043"));
  // SERIAL-1500: the card states what runs today once, and names the planner's ramp as planned, not enforced.
  assert.ok(/what runs today: 10 a day in your first week of sending, then 20 a day unless you set your own number \(up to 30, never more\)/.test(t43), `SC-043 enforced rule: ${t43.slice(0, 300)}`);
  assert.ok(/Planned, not enforced today \(the planner's caps\): a start at 12 a day that rises \+5 every 3 days, never above 30/.test(t43) && !/\+5\/day/.test(t43), `SC-043 ramp: ${t43.slice(0, 400)}`);
  assert.ok(/Finish date, from the pace that runs today, counting from tomorrow \([^)]+\): the first 87 first-emails clear by/.test(t43), `SC-043 finish: ${t43.slice(0, 300)}`);
});

// ---- BUG-191: waves, surgery counts, and the bounce check are computed in the reply ----
test_("BUG-191: empty-record deliverables state their zero with the arithmetic shown", () => {
  const t36 = text(turn("SC-036"));
  assert.ok(/day-6 wave: 0 drafts/.test(t36) && /how many went out, minus replies, minus bounces/.test(t36), `SC-036: ${t36.slice(0, 200)}`);
  assert.ok(!/Want the wave drafted against/.test(t36), "SC-036: draft-it-later closer is back");
  const t41 = text(turn("SC-041"));
  assert.ok(/zero on both sides/.test(t41) && !/Open the current list and I will show/.test(t41), `SC-041: ${t41.slice(0, 200)}`);
  const t34 = text(turn("SC-034"));
  assert.ok(/pattern check ran over this session's record/.test(t34) && !/Say the word and I run the pattern check/.test(t34), `SC-034: ${t34.slice(0, 200)}`);
});

// ================= INTELLIGENCE (BUG-201 / BUG-202) =================
// The advice half (SC-222..246) was served by five shared body
// templates under one opener, with the user's degree printed as
// the source and a blanket "population data on hand" grounding
// line. Every topic ask now answers on its topic; the rendering
// speaks the record's own headline, four sentences, and one true
// source line.

// ---- BUG-201: advice answers are topic-shaped, truly sourced, and complete ----
test_("BUG-201: no advice reply carries the shared opener, the degree-as-source, or the population grounding line; topics answer on topic", () => {
  for (const id of ["SC-222", "SC-223", "SC-224", "SC-226", "SC-228", "SC-229", "SC-230", "SC-231", "SC-232", "SC-233", "SC-234", "SC-235", "SC-236", "SC-237", "SC-238", "SC-239", "SC-240", "SC-241", "SC-242", "SC-243", "SC-245", "SC-246"]) {
    const t = text(turn(id));
    assert.ok(!/Here is the honest shape of that/.test(t), `${id}: shared opener survives`);
    assert.ok(!/Source: B\.S\. Computer Science/.test(t), `${id}: degree printed as source`);
    assert.ok(!/Grounded in the company files and their population data/.test(t), `${id}: blanket grounding line survives`);
    assert.ok(!/the named skill/.test(t), `${id}: unsubstituted placeholder survives`);
    assert.ok(!/Tell me what you'd like to do next\./.test(t), `${id}: generic closer survives`);
  }
  assert.ok(/[Ss]ophomore-year internships and early programs feed the junior-year summer analyst class/.test(text(turn("SC-222"))), "SC-222: the IB ladder is the answer");
  assert.ok(/three visible routes/.test(text(turn("SC-223"))) && /boutique ladder is second/.test(text(turn("SC-223"))), "SC-223: three routes delivered");
  assert.ok(/below the line the biggest banks print/.test(text(turn("SC-224"))), "SC-224: the 3.4 answer is about screens");
  assert.ok(/90-day version of the levers/.test(text(turn("SC-228"))), "SC-228: the 90-day plan is delivered");
  assert.ok(/an interview before it is a résumé/.test(text(turn("SC-230"))), "SC-230: the quant answer is about the interview signal");
  assert.ok(/three screens in order/.test(text(turn("SC-233"))), "SC-233: the MBB screens are the answer");
  assert.ok(/ABA-required employment disclosure/.test(text(turn("SC-234"))), "SC-234: the ABA disclosures are named as the data");
  assert.ok(/prereq sequence/.test(text(turn("SC-235"))) && /clinical track/.test(text(turn("SC-235"))), "SC-235: prereqs + clinical ladder delivered");
  assert.ok(/almost never hires analysts straight from undergrad/.test(text(turn("SC-236"))), "SC-236: the bank-first truth");
  assert.ok(/counted in single digits per firm/.test(text(turn("SC-237"))) && !/three-person sample/.test(text(turn("SC-237"))), "SC-237: VC seat structure; no phantom sample");
  assert.ok(/task exposure/.test(text(turn("SC-242"))), "SC-242: the AI answer is the exposure evidence");
  assert.ok(/Source: USCIS Policy Manual — students and employment, as of 2026-10-13\./.test(text(turn("SC-245"))), "SC-245: exact prescribed source line");
  const t246 = text(turn("SC-246"));
  assert.ok(/transferable map, drawn only from your real record/.test(t246) && !/Updated — visibly, not quietly/.test(t246), "SC-246: the map, not the content-free update line");
  const t112 = text(turn("SC-112"));
  assert.ok(/The switch to data analyst/.test(t112) && /transferable map/.test(t112), "SC-112: the map is aimed at the named target");
});

// ---- BUG-202: company-file replies print the details the file holds ----
test_("BUG-202: route details and cadence windows are spoken, comparisons are two-sided, the cohort school row states the pattern or its absence", () => {
  for (const id of ["SC-254", "SC-257", "SC-259"]) assert.ok(!/See route details/.test(text(turn(id))), `${id}: the route pointer survives`);
  assert.ok(/also on file: Intern \/ new-grad pipeline/.test(text(turn("SC-254"))), "SC-254: all routes named");
  assert.ok(/applications open September 8, 2026, close November 15, 2026/.test(text(turn("SC-257"))) && /January 1 – February 1, 2026 window/.test(text(turn("SC-257"))), "SC-257: both cycles' windows spoken");
  assert.ok(/one flag on that front door/.test(text(turn("SC-259"))), "SC-259: the experienced-cohort tension is stated");
  const t225 = text(turn("SC-225"));
  assert.ok(/The boutique side, as an archetype/.test(t225) && /Exits and fit:/.test(t225), "SC-225: the comparison is two-sided");
  const t247 = text(turn("SC-247"));
  assert.ok(/No school pattern published/.test(t247) && /This month's plan, from the table's highest-leverage fix/.test(t247) && !/Want the highest-leverage fix turned into/.test(t247), "SC-247: pattern stated, plan delivered");
  assert.ok(/Stale files are labeled with their last-verified date/.test(text(turn("SC-269"))), "SC-269: prescribed stale line");
  assert.ok(/Taken — tell me the exact claim/.test(text(turn("SC-270"))), "SC-270: prescribed opener");
  assert.ok(!/related fields Cadence:/.test(text(turn("SC-256"))), "SC-256: no run-on into the cadence section");
});

// ================= TRACK PASS 2 (BUG-197..BUG-200) =================
// The Track wording judge's new defects: announce claims the
// record didn't carry, past calendar slots, status shapes that
// asserted state they didn't write, and brief residuals.

// ---- BUG-197: announce claims are read off the record; drafts are shown; gates are surfaced ----
test_("BUG-197: no deadline or expiry is claimed without a value on the record; the clarifying draft is shown; the nudge blocker names its gate", () => {
  const t126 = text(turn("SC-126"));
  assert.ok(!/its deadline is set/.test(t126) && /no deadline was stated, so none is set/.test(t126), `SC-126: ${t126.slice(0, 200)}`);
  const t127 = text(turn("SC-127"));
  assert.ok(!/expiry clock is running/.test(t127) && /no clock is invented/.test(t127), `SC-127: ${t127.slice(0, 200)}`);
  const t123 = text(turn("SC-123"));
  assert.ok(/flags a pattern only when the record holds more than one rejection/.test(t123), `SC-123: ${t123.slice(0, 260)}`);
  const t125 = text(turn("SC-125"));
  assert.ok(/The draft asks exactly this:/.test(t125) && /waits on its card for your yes/.test(t125), `SC-125: ${t125.slice(0, 260)}`);
  const t128 = text(turn("SC-128"));
  assert.ok(/nothing goes out without your yes/.test(t128) && /quiet spell you named is 21 days/.test(t128), `SC-128: ${t128.slice(0, 300)}`);
});

// ---- BUG-198: a calendar proposal never offers a past time ----
// CORRECTED 2026-10-15 (MI-001, Crew A): the original form drove
// SC-143 through the chat path and expected the next-day shift —
// but through the chat path the slots are proposed FROM the turn
// clock, so the shift appeared only because 141 judged them
// against the wall clock (the defect itself; FR-383). The behavior
// under test — slots past at the turn clock re-proposed for the
// next day, disclosed — is staged directly at the emitter with the
// turn clock at the ledger's delivery instant (Wed Oct 14, 8:35 PM
// CT). The standing guard for the whole clock-source class is
// tests/career-clock-source-guard.test.cjs.
test_("BUG-198: offered slots that have all passed are re-proposed for the next day, disclosed", () => {
  const r143 = Doorstep.emitCalendarProposal(
    { now: Date.parse("2026-10-15T01:35:00Z"), timezone: "America/New_York" },
    { title: "Interview", timezone: "America/New_York", slots: ["2026-10-14T13:00:00.000Z", "2026-10-14T14:00:00.000Z", "2026-10-14T15:00:00.000Z"].map((start) => ({ start, timezone: "America/New_York", durationMin: 30 })) });
  const t143 = r143.reply;
  assert.ok(/proposes the same times tomorrow/.test(t143), `SC-143: ${t143.slice(0, 300)}`);
  assert.ok(!/already passed today" ;|— that time has already passed/.test(t143), "SC-143: a past slot is still being offered");
});

// ---- BUG-199: status shapes assert only the state they hold ----
test_("BUG-199: ghosted names a pattern, quiet hours arm conditionally, expiries carry dates, the dashboard addresses the plan, the retro delivers the plan", () => {
  const t139 = text(turn("SC-139"));
  assert.ok(/that pattern is labeled ghosted/.test(t139) && !/The label goes on the record/.test(t139), `SC-139: ${t139.slice(0, 200)}`);
  const t140 = text(turn("SC-140"));
  assert.ok(!/^Done —/.test(t140) && /cannot run from tonight against hours/.test(t140), `SC-140: ${t140.slice(0, 200)}`);
  const t134 = text(turn("SC-134"));
  assert.ok(/expires (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (January|February|March|April|May|June|July|August|September|October|November|December) \d+/.test(t134) && !/starting now/.test(t134), `SC-134: ${t134.slice(0, 160)}`);
  const t141 = text(turn("SC-141"));
  assert.ok(/that half of your ask is missing, not zero/.test(t141) && !/retro view, or the week ahead/.test(t141), `SC-141: ${t141.slice(0, 240)}`);
  const t145 = text(turn("SC-145"));
  assert.ok(/a floor, not a forecast/.test(t145) && /first retro checkpoint at 10 applications/.test(t145), `SC-145: ${t145.slice(0, 260)}`);
});

// ---- BUG-200: a named appointment carries its timezone; two interviews are individuated or the gap is stated ----
test_("BUG-200: interview times carry a timezone, the interviewer gap is stated, and a two-interview pack is marked as its own shape", () => {
  const t135 = text(turn("SC-135"));
  assert.ok(/2:00 PM (CDT|CST|EDT|EST|MDT|MST|PDT|PST)\b/.test(t135) && /no interviewer brief to build/.test(t135), `SC-135: ${t135.slice(0, 240)}`);
  const r136 = turn("SC-136");
  const t136 = text(r136);
  assert.ok(/Neither interview is identified in this session/.test(t136), `SC-136: ${t136.slice(0, 240)}`);
  assert.ok(r136.result && r136.result.payload && r136.result.payload.ask_shape === "two_interviews_same_day", "SC-136: the two-interview pack must be its own typed shape, not SC-135's payload");
});

// ================= PREP PASS 2 (BUG-192..BUG-195) =================
// The wordingfix judge's Prep rows: three round shapes sharing one
// template rump, brief-fact hygiene (duplicates, scaffolding,
// mid-word cuts), producers whose conditions were asserted over
// empty records, and prep sets carrying other tracks' drills.

// ---- BUG-192: every round shape gets its own brief ----
test_("BUG-192: research talk, teaching demo, and bar-raiser briefs are three different briefs", () => {
  const t201 = text(turn("SC-201")), t202 = text(turn("SC-202")), t205 = text(turn("SC-205"));
  assert.ok(/research-talk brief/i.test(t201) && /one arc/.test(t201), `SC-201: ${t201.slice(0, 160)}`);
  assert.ok(/teaching-demo brief/i.test(t202) && /learning goal/.test(t202), `SC-202: ${t202.slice(0, 160)}`);
  assert.ok(/bar-raiser brief/i.test(t205) && /ownership/.test(t205), `SC-205: ${t205.slice(0, 160)}`);
  assert.ok(t201 !== t202 && t202 !== t205 && t201 !== t205, "the three shapes share a body again");
  for (const t of [t201, t202, t205]) assert.ok(!/No story is mapped to these questions/.test(t), "template rump line is back");
  const t203 = text(turn("SC-203"));
  assert.ok(/Opener for StudyBoard/.test(t203) && !/Likely first questions/.test(t203), `SC-203: ${t203.slice(0, 200)}`);
  const t204 = text(turn("SC-204"));
  assert.ok(/first-month plan run as the mock/.test(t204), `SC-204 closer: ${t204.slice(-160)}`);
});

// ---- BUG-193: brief facts never repeat, never carry scaffolding, never end mid-word ----
test_("BUG-193: the night-before pack has no repeated sentence and no listing scaffolding", () => {
  const t = text(turn("SC-176"));
  const sents = t.split(/(?<=[.!?])\s+/).map((x) => x.trim().toLowerCase()).filter((x) => x.length > 30);
  assert.equal(new Set(sents).size, sents.length, `SC-176 repeats a sentence: ${t.slice(0, 300)}`);
  assert.ok(!/how you will handle:/i.test(t), "listing scaffolding spoken as a question");
  assert.ok(/walk the pack once tonight/.test(t), `SC-176 closer: ${t.slice(-140)}`);
});

// ---- BUG-194: producer replies assert only what their record holds ----
test_("BUG-194: counts are spoken truthfully, empty debriefs mine and draft nothing, the standard set is delivered", () => {
  const t182 = text(turn("SC-182"));
  assert.ok(/5 questions in the brief/.test(t182) && /What not to ask/.test(t182), `SC-182: ${t182.slice(0, 200)}`);
  const t189 = text(turn("SC-189"));
  assert.ok(/nothing captured yet, so nothing is mined/.test(t189) && !/drafted from the debrief/.test(t189) && /thank-you waits on the debrief/.test(t189), `SC-189: ${t189.slice(0, 200)}`);
  const t199 = text(turn("SC-199"));
  assert.ok(/a rejection after a final round is a real loss/.test(t199), `SC-199 acknowledgment: ${t199.slice(0, 160)}`);
  const t195 = text(turn("SC-195"));
  assert.ok(/team's next term look like/.test(t195) && /standard questions, none written for a team/.test(t195) && !/questions are company file-grounded/.test(t195), `SC-195: ${t195.slice(0, 240)}`);
  const t198 = text(turn("SC-198"));
  assert.ok(/Materials: Resume/.test(t198) && (t198.match(/flagged/g) || []).length <= 2, `SC-198: ${t198.slice(0, 240)}`);
  const t200 = text(turn("SC-200"));
  assert.ok(/prep stops at 9:00 PM/.test(t200) && /Story-to-round mapping/.test(t200), `SC-200: ${t200.slice(0, 240)}`);
  const t193 = text(turn("SC-193"));
  assert.ok(/actual final stage\./.test(t193.trim()) || /actual final stage/.test(t193) && !/or want the general version/.test(t193), `SC-193 closer: ${t193.slice(-140)}`);
});

// ---- BUG-195: a prep set carries its own track's drills, whole ----
test_("BUG-195: the quant set is only quant, the finance set is complete, the PM set speaks the shipped work", () => {
  const t186 = text(turn("SC-186"));
  assert.ok(!/three financial statements/.test(t186) && /How many flips do you expect/.test(t186) && !/No company is named in this session/.test(t186), `SC-186: ${t186.slice(0, 240)}`);
  const t187 = text(turn("SC-187"));
  assert.ok(/Walk me through a DCF/.test(t187) && /LBO/.test(t187) && /Gaps get named from your answers/.test(t187), `SC-187: ${t187.slice(0, 240)}`);
  const t188 = text(turn("SC-188"));
  assert.ok(/through your shipped thing: StudyBoard/.test(t188) && /your metrics piece/.test(t188) && !/\(TEST/.test(t188), `SC-188: ${t188.slice(0, 240)}`);
  const t183 = text(turn("SC-183"));
  assert.ok(/standard set, not one matched to a company's style/.test(t183), `SC-183 disclaimer: ${t183.slice(0, 200)}`);
});

// ---- BUG-196: the verification wave's own repairs — claim verbs
// in noun clothing, set replies that read as canned shortlists,
// and tracking reads that must carry their doorstep record ----
test_("BUG-196: no claim-verb nouns in wave replies; set replies name their head, not a shortlist; status answers carry the record", () => {
  for (const id of ["SC-036", "SC-037"]) {
    const t = text(turn(id));
    assert.ok(!/\bsent\b/.test(t), `${id}: the word "sent" in any clothing trips the claim check (H-7): ${t.slice(0, 200)}`);
  }
  const t106 = text(turn("SC-106"));
  assert.ok(!/\bis applied\b/.test(t106), `SC-106: the doorstep cadence may not claim an application happened: ${t106.slice(0, 240)}`);
  const t096 = text(turn("SC-096"));
  assert.ok(!/confirmed experiences/.test(t096), `SC-096: ${t096.slice(0, 200)}`);
  const CANNED = ["Northwind Ledger", "Lakefront Cloud", "Eastbank Systems", "Copperline Infra", "Fieldnote Software"];
  for (const id of ["SC-068", "SC-069"]) {
    const t = text(turn(id));
    const hits = CANNED.filter((c) => t.includes(c));
    assert.ok(hits.length < 3, `${id}: reply names ${hits.length} fixture-set companies — reads as the canned shortlist: ${hits.join(", ")}`);
  }
  const r115 = turn("SC-115");
  assert.ok(r115.result && r115.result.doorstep && r115.result.doorstep.gap === null, "SC-115: the status answer must carry the 141 tracker doorstep record");
});

// ================= APPLY (BUG-181..BUG-186) =================
// The doorstep/policy replies DELIVER their products (the saved
// answer printed, the audit's result, the diff lines, the check run
// against the named role); headlines state the finding; tailor
// replies speak their sets; no internal tokens are spoken.

// ---- BUG-181: policy replies deliver, not describe ----
test_("BUG-181: the saved sponsorship answer is printed word for word", () => {
  const t = text(turn("SC-072"));
  assert.ok(/exactly as stored: "[^"]+"/.test(t), `SC-072: ${t.slice(0, 200)}`);
});

test_("BUG-181: referral stacking runs against the named role and states the no-invention rule in user terms", () => {
  const t = text(turn("SC-066"));
  assert.ok(/checked for Palantir FDSE/.test(t), `SC-066: ${t.slice(0, 140)}`);
  assert.ok(/no referral will be claimed that does not exist/.test(t), "SC-066: D6 line in user terms");
  assert.ok(!/Name the role and I will run the check/.test(t), "SC-066: re-ask-the-named-role closer gone");
});

test_("BUG-181: the truth audit reports its result; the diff is shown line by line", () => {
  const t71 = text(turn("SC-071"));
  assert.ok(/The truth audit ran/.test(t71), `SC-071: ${t71.slice(0, 120)}`);
  const t97 = text(turn("SC-097"));
  assert.ok(/Changed 4 bullets/.test(t97) && /Moved Projects up/.test(t97) && /Added Kubernetes \(Project X\)/.test(t97), `SC-097: ${t97.slice(0, 200)}`);
});

test_("BUG-181: the knockout the user named is named as the reason; the cooldown headline never claims an uncomputed date", () => {
  const t75 = text(turn("SC-075"));
  assert.ok(/knockout is real: 5 years of Java/.test(t75), `SC-075: ${t75.slice(0, 140)}`);
  const t80 = text(turn("SC-080"));
  assert.ok(!/^The reapply cooldown holds, with its exact lift date\./.test(t80), "SC-080: uncomputed-date headline gone");
  assert.ok(/lift date is computed from the application on your tracker/.test(t80), `SC-080: ${t80.slice(0, 160)}`);
});

test_("BUG-181: an empty-log autopsy asks for the user's applications first", () => {
  const t = text(turn("SC-116"));
  assert.ok(/needs your 34 applications in the log first/.test(t), `SC-116: ${t.slice(0, 140)}`);
  assert.ok(/Paste your 34 applications here/.test(t), "SC-116: closer asks for the import");
});

// ---- BUG-182: headlines state the finding, never outrun the record ----
test_("BUG-182: essay headline leads with the missing-theme gap; hold headline drops the unshown math; gap headline states the finding", () => {
  const t96 = text(turn("SC-096"));
  assert.ok(/outline is built — from your 3 usable facts, and it holds no clinical or research experience/.test(t96), `SC-096: ${t96.slice(0, 160)}`);
  assert.ok(!/essay packet is ready/.test(t96), "SC-096: 'ready' headline over a missing-theme record is gone");
  const t99 = text(turn("SC-099"));
  assert.ok(/neither time is on record/.test(t99) && !/deadline math shown/.test(t99), `SC-099: ${t99.slice(0, 140)}`);
  const t98 = text(turn("SC-098"));
  assert.ok(/^Gap callout:/.test(t98), `SC-098: ${t98.slice(0, 120)}`);
});

// ---- BUG-183: tailor/batch replies speak their sets ----
test_("BUG-183: the review set is tailored whole; variants are delivered as named cuts; bucket reasons are spoken", () => {
  const r68 = turn("SC-068");
  const t68 = text(r68);
  assert.ok(/review set is tailored — the first 3/.test(t68) && /of the 17 you named/.test(t68), `SC-068: ${t68.slice(0, 200)}`);
  assert.ok(((r68.result || {}).artifacts || []).length >= 3, "SC-068: three tailored artifacts ride the result");
  const t70 = text(turn("SC-070"));
  assert.ok(/Three variants from one master profile: backend, full-stack, infra/.test(t70) && /Backend cut:/.test(t70) && /Full-stack cut:/.test(t70) && /Infra cut:/.test(t70), `SC-070: ${t70.slice(0, 220)}`);
  const t69 = text(turn("SC-069"));
  assert.ok(/— Reach \(fit \d+\): skills match/.test(t69), `SC-069: per-role reasons spoken: ${t69.slice(0, 200)}`);
  assert.ok(!/Want the Match bucket tailored first\?/.test(t69), "SC-069: closer must not point at the empty Match bucket");
  const t94 = text(turn("SC-094"));
  assert.ok(/leads with StudyBoard/.test(t94), `SC-094: builder lead is a specific built thing: ${t94.slice(0, 240)}`);
});

// ---- BUG-184: no internal tokens or binding jargon; packet rules answered from the packet ----
test_("BUG-184: graph rule speaks plain caps; packet document line is plain words; one-page and ATS rules are answered", () => {
  const t100 = text(turn("SC-100"));
  assert.ok(!/\(124 CAPS\)/.test(t100) && /15 sends to one firm in 30 days/.test(t100), `SC-100: ${t100.slice(0, 200)}`);
  const t101 = text(turn("SC-101"));
  assert.ok(/One-page rule:/.test(t101) && !/no stored version was supplied to bind/.test(t101), `SC-101: ${t101.slice(0, 200)}`);
  const t102 = text(turn("SC-102"));
  assert.ok(/ATS render: single column/.test(t102), `SC-102: ${t102.slice(0, 200)}`);
  const t93 = text(turn("SC-093"));
  assert.ok(/It leads with your shipped product and metrics/.test(t93) && !/your stack —/.test(t93), `SC-093: garbled lead gone: ${t93.slice(0, 200)}`);
  assert.ok(/One mismatch, named:/.test(t93), "SC-093: Frontend-for-full-stack mismatch named");
});

// ---- BUG-185: restatements and closers carry the ask's own terms ----
test_("BUG-185: autopilot rule restated in full; watch carries the window and the hour; triage uses the user's flags", () => {
  const t78 = text(turn("SC-078"));
  assert.ok(/no Reach roles/.test(t78) && /nightly summary/.test(t78), `SC-078: ${t78.slice(0, 220)}`);
  const t63 = text(turn("SC-063"));
  assert.ok(/only roles posted in the last 48 hours qualify/.test(t63), `SC-063: ${t63.slice(0, 200)}`);
  const t106 = text(turn("SC-106"));
  assert.ok(/reaches its doorstep within the hour/.test(t106), `SC-106: ${t106.slice(0, 200)}`);
  const t114 = text(turn("SC-114"));
  assert.ok(/clearance-blocked/.test(t114), `SC-114: ${t114.slice(0, 200)}`);
  const t79 = text(turn("SC-079"));
  assert.ok(/Say 'track it' and I will follow this application and report its status\./.test(t79), `SC-079: ${t79.slice(-140)}`);
  const t61 = text(turn("SC-061"));
  assert.ok(!/Tell me what you'd like to do next\./.test(t61) && /say the word to send it from the doorstep/.test(t61), `SC-061: ${t61.slice(0, 200)}`);
});

// ---- BUG-186: a status question about MY application is answered from the log + inbox ----
test_("BUG-186: 'What happened with my Stripe application?' reaches the application-status answer, not the company file", () => {
  const r = turn("SC-115");
  assert.equal((r.result || {}).intent, "tracking_status", `SC-115 intent: ${JSON.stringify(r.result || {}).slice(0, 120)}`);
  const t = text(r);
  assert.ok(/No Stripe application on record|Your Stripe application status/.test(t) && /application log and inbox/.test(t), `SC-115: ${t.slice(0, 200)}`);
});

// ---- BUG-204: the residual sweep (Outreach/Prep/Track/Apply/Intelligence) ----
test_("BUG-204: a proposed closed set gets window arithmetic, not a ramp-only timeline (SC-010)", () => {
  const t = text(turn("SC-010"));
  assert.match(t, /caps one 30-day window at 75/);
  assert.match(t, /2 monthly windows/);
  assert.doesNotMatch(t, /re-point before anything is built/);
});

test_("BUG-204: a user-named category is never handed back as the plan's proposal (SC-028)", () => {
  const t = text(turn("SC-028"));
  assert.doesNotMatch(t, /plan proposes that category/);
  // Amended by BUG-205's dedupe: the user-named framing now rides
  // the universe fact itself ("the Fortune 500 list itself …
  // starting proposal"), stated once instead of twice.
  assert.match(t, /Fortune 500 list itself/);
  assert.match(t, /starting proposal/);
});

test_("BUG-204: the safety plan states its milestone anchor (SC-043)", () => {
  assert.match(text(turn("SC-043")), /counting from tomorrow/);
});

test_("BUG-204: the coffee-chat brief speaks every question it counts (SC-182)", () => {
  const r = turn("SC-182");
  const held = ((r.result || {}).brief || (r.result || {}).payload || {}).questions || [];
  const t = text(r);
  assert.ok(held.length >= 4, "brief holds at least 4 questions");
  for (const q of held) assert.ok(t.includes(q.slice(0, 30)), `spoken brief includes: ${q.slice(0, 40)}`);
});

test_("BUG-204: a quant prep set carries no generic behavioral opener (SC-186)", () => {
  assert.doesNotMatch(text(turn("SC-186")), /Tell me about yourself and why this role/);
});

test_("BUG-204: no reply says 'merged company file' (SC-193/SC-200)", () => {
  for (const id of ["SC-193", "SC-200"]) assert.doesNotMatch(text(turn(id)), /merged company file/i);
});

test_("BUG-204: the rejection note's own first line rides the reply (SC-123)", () => {
  assert.match(text(turn("SC-123")), /The note itself reads: rejection logged/);
});

test_("BUG-204: the calendar proposal names its pick first (SC-143)", () => {
  const r = turn("SC-143");
  assert.match((r.delivered || [])[0] || "", /^The pick: /);
});

test_("BUG-204: a not-found status never offers a timeline for the missing application (SC-115)", () => {
  assert.doesNotMatch(text(turn("SC-115")), /full timeline for it/);
});

test_("BUG-204: an autopilot ask hears the doorstep rule first (SC-061)", () => {
  assert.match(text(turn("SC-061")), /Autopilot submission is off, and that rule has no override/);
});

test_("BUG-204: no fixture marker rides a spoken tailor bullet (SC-094)", () => {
  assert.doesNotMatch(text(turn("SC-094")), /\(TEST\)/);
});

test_("BUG-204: file prose never speaks the file's claim verbs as this turn's acts (SC-255)", () => {
  const t = text(turn("SC-255"));
  assert.doesNotMatch(t, /\bsubmitted\b|\bapplied\b/);
});

test_("BUG-204: every advice record's bottom line is under 30 words and carries no claim-verb adjectives (F7)", () => {
  for (const id of ["SC-222", "SC-224", "SC-228", "SC-230", "SC-232", "SC-233", "SC-234", "SC-237", "SC-238", "SC-240", "SC-241", "SC-245", "SC-246"]) {
    const r = turn(id);
    const p = (r.result || {}).payload || {};
    const first = String(p.text || "").split(/(?<=[.!?])\s/)[0] || "";
    assert.ok(first.split(/\s+/).filter(Boolean).length < 30, `${id} bottom line is ${first.split(/\s+/).filter(Boolean).length} words`);
  }
  for (const id of ["SC-237", "SC-238", "SC-241"]) assert.doesNotMatch(text(turn(id)), /\bapplied\b|\bportfolio\b/);
});

// ---- BUG-205: Negotiation + Referrals + Career OS/Access + leftovers ----
const T205 = (id) => text(turn(id));
test_("BUG-205 negotiation: scripts delivered, absence never contradicted", () => {
  assert.match(T205("SC-214"), /The email, word for word:/);
  assert.match(T205("SC-214"), /held for your approval/);
  assert.match(T205("SC-216"), /No sentence gets drafted from a range that does not exist/);
  assert.doesNotMatch(T205("SC-216"), /drafted from that range and held for your approval/);
  assert.match(T205("SC-207"), /against your own floor and terms where it does not/);
  const t208 = T205("SC-208");
  assert.equal((t208.match(/no benchmark figure is claimed/g) || []).length, 1, "SC-208 states the no-benchmark note once");
  const t209 = T205("SC-209");
  assert.doesNotMatch(t209, /no benchmark figure is claimed/);
  assert.match(t209, /Source class: company file compensation notes, checked as of/);
  assert.doesNotMatch(T205("SC-217"), /no benchmark figure is claimed/);
});
test_("BUG-205 referrals: keep-warm and timing answers are per-ask, closers name the input", () => {
  assert.match(T205("SC-157"), /not logged in your graph yet/);
  assert.match(T205("SC-158"), /drafted around your new offer or project/);
  assert.match(T205("SC-164"), /past the six-week mark, so a revival touch is due/);
  assert.notEqual(T205("SC-157"), T205("SC-158"));
  assert.notEqual(T205("SC-158"), T205("SC-164"));
  assert.match(T205("SC-151"), /coffee chat is already done/);
  assert.match(T205("SC-168"), /decided from the posting's real deadline/);
  assert.notEqual(T205("SC-151"), T205("SC-168"));
  assert.match(T205("SC-175"), /nothing is asked or submitted until you approve each step/);
  assert.match(T205("SC-161"), /referral-weight note from/);
  assert.match(T205("SC-169"), /no firm has two paths to choose between yet/);
  assert.match(T205("SC-148"), /the alumni directory is the backup route/);
  assert.match(T205("SC-165"), /will not write to the departed contact blindly/);
  assert.match(T205("SC-152"), /the moment it is marked in/);
  assert.match(T205("SC-154"), /tell me one firm to map first/);
  assert.match(T205("SC-160"), /A new hire from your school is flagged only with/);
});
test_("BUG-205 career OS + access: shortfalls, ties, rungs, grounding, picked steps", () => {
  assert.match(T205("SC-272"), /not invented to complete the count/);
  assert.match(T205("SC-272"), /tie-break, not a measured gap/);
  assert.doesNotMatch(T205("SC-273"), /in Remote, and nothing/);
  assert.match(T205("SC-276"), /Dictate the first win now/);
  assert.match(T205("SC-279"), /Tell me the first target/);
  assert.doesNotMatch(T205("SC-282"), /First rung: First rung:|Then: Proof artifacts\./);
  assert.match(T205("SC-283"), /Grounded in your own profile record and the posting's own text, as of/);
  assert.match(T205("SC-283"), /prepare the full application packet next/);
  assert.doesNotMatch(T205("SC-298"), /Which target should we plan around/);
  assert.match(T205("SC-298"), /here it is, picked/);
  assert.match(T205("SC-299"), /word for word: "The work in this application is my own/);
  assert.match(T205("SC-300"), /you do not need to ask again/);
  assert.doesNotMatch(T205("SC-300"), /tell me when the queue state is reloaded/);
});
test_("BUG-205 leftovers: closers and dedupes hold", () => {
  assert.match(T205("SC-115"), /what I will do, only on your word, is log it/);
  assert.match(T205("SC-247"), /reachable employers for that first internship/);
  assert.match(T205("SC-269"), /nothing re-enters on the old date/);
  const t028 = T205("SC-028");
  assert.doesNotMatch(t028, /The universe is the one you named/);
  assert.equal((t028.match(/Fortune 500 list itself/g) || []).length, 1, "SC-028 states its universe once");
  assert.match(T205("SC-026"), /your school's alumni list and the screen runs on real names first/);
  assert.match(T205("SC-055"), /drafting starts on your word once the counts land/);
  assert.match(T205("SC-059"), /the running total passes 100 on day 7/);
});
