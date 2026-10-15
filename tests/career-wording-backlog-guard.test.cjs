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

// ================= PREP (BUG-133..BUG-136) =================

// ---- BUG-133: a prep-set headline claims a company match only when
// a company file grounds it; track sets name their track; a quant
// ask leads with the quant drills; a PM set exists ----
test("BUG-133: prep sets speak their true track and grounding", () => {
  const t183 = text(turn("SC-183"));
  assert.ok(/Your SWE coding prep set\./.test(t183), `SC-183: ${t183.slice(0, 90)}`);
  assert.ok(!/matched to how this round actually runs/.test(t183), "SC-183: ungrounded match claim");
  assert.ok(/track's standard set/.test(t183), "SC-183: honest grounding line");
  const t186 = text(turn("SC-186"));
  assert.ok(/Your quant prep set\./.test(t186), `SC-186: ${t186.slice(0, 80)}`);
  assert.ok(/two heads in a row/.test(t186) && /make a market/.test(t186), "SC-186: quant drills lead");
  assert.ok(!/three financial statements/.test(t186.split("Gaps are named")[0].slice(0, 400)) || t186.indexOf("two heads") < t186.indexOf("three financial"), "SC-186: quant before banking");
  const t187 = text(turn("SC-187"));
  assert.ok(/Your finance technicals prep set\./.test(t187) && /Gaps are named from your answers/.test(t187), `SC-187: ${t187.slice(0, 120)}`);
  const t188 = text(turn("SC-188"));
  assert.ok(/Your PM prep set\./.test(t188) && /thing you shipped/.test(t188) && /improve it/.test(t188), `SC-188: ${t188.slice(0, 120)}`);
});

// ---- BUG-134: story matching is spoken from the record; an empty
// STAR bank is answered as an empty bank ----
test("BUG-134: question bank and STAR bank speak their true match state", () => {
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
test("BUG-135: producer replies speak their records with per-shape next steps", () => {
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
test("BUG-136: brief replies speak bar, loop, and story state; coffee chats speak their points", () => {
  const t176 = text(turn("SC-176"));
  assert.ok(/Your night-before brief for Stripe\./.test(t176) && /The bar at Stripe:/.test(t176) && /The loop, from the company file:/.test(t176), `SC-176: ${t176.slice(0, 200)}`);
  const t190 = text(turn("SC-190"));
  assert.ok(/Questions to ask them:/.test(t190) && /Palantir/.test(t190), `SC-190: ${t190.slice(0, 200)}`);
  const t182 = text(turn("SC-182"));
  assert.ok(/Questions to ask them:/.test(t182) && /No company file is on record for this chat/.test(t182), `SC-182: ${t182.slice(0, 200)}`);
  const t203 = text(turn("SC-203"));
  assert.ok(/The portfolio walkthrough, project by project\./.test(t203) && /Each project runs in this order/.test(t203), `SC-203: ${t203.slice(0, 160)}`);
  const t200 = text(turn("SC-200"));
  assert.ok(/Your superday plan\./.test(t200) && /No merged company file/.test(t200) && /back-to-back rounds/.test(t200), `SC-200: ${t200.slice(0, 200)}`);
  const t195 = text(turn("SC-195"));
  assert.ok(!/matched to this panel/.test(t195) && /No team fact was supplied/.test(t195), `SC-195: ${t195.slice(0, 200)}`);
});

// ================= TRACK (BUG-137..BUG-140) =================

// ---- BUG-137: stage announcements speak the event, its true
// source, and the company state the record carries ----
test("BUG-137: announcements name the event, its source, and its next step", () => {
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
test("BUG-138: empty-tracker replies take the ask's shape", () => {
  const t134 = text(turn("SC-134"));
  assert.ok(/Your offer expires Friday — I will flag it daily until you decide/.test(t134), `SC-134: ${t134.slice(0, 120)}`);
  const t139 = text(turn("SC-139"));
  assert.ok(/labeled ghosted/.test(t139) && /one follow-up/.test(t139), `SC-139: ${t139.slice(0, 140)}`);
  const t140 = text(turn("SC-140"));
  assert.ok(/Done — low-priority alerts are folded into the morning digest during your quiet hours\./.test(t140), `SC-140: ${t140.slice(0, 120)}`);
  const t121 = text(turn("SC-121"));
  assert.ok(/Tell me about any application already out under your own name, and I will log it first\./.test(t121), `SC-121: ${t121.slice(-120)}`);
  assert.ok(!/Find a role and I will start the tracker with it\./.test(t121), "SC-121: generic closer gone");
});

// ---- BUG-139: drafts are shown or their missing input is named —
// never described as if they existed ----
test("BUG-139: nudge, thank-you, and classification speak their true state", () => {
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
test("BUG-140: track summaries speak their records", () => {
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
