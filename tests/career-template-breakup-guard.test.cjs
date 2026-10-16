"use strict";
// Template-substitution breakup guards (bug law: BUG-087..BUG-089).
// The true-score re-judge found 81 of 278 finishable replies sitting in
// byte-identical reuse groups: one composed text serving many different
// asks. Each test below drives the group's member asks through the
// integrated chat path (pilot-lib chatTurn: 120 -> 130 -> 142 -> 141)
// and asserts VARIATION WITH GROUNDING:
//   (a) no two delivered replies in the group are byte-identical;
//   (b) every firm/company named in a reply traces to that scenario's
//       ask or to the turn's typed product state (result minus reply).
// A fix that swaps in a second canned text fails (a) on its own members
// and fails (b) wherever the canned text names firms the ask did not.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../scripts/career/gauntlet/pilot-lib.cjs");

const doc = fs.readFileSync(path.join(__dirname, "fixtures/career-critical-repairs/canonical-scenarios.md"), "utf8");
const CANON = new Map();
for (const line of doc.split("\n")) { const m = line.match(/^(SC-\d{3})\s+(.+)$/); if (m && !CANON.has(m[1])) CANON.set(m[1], m[2].trim()); }

function turn(id) {
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = L.H.session(id, "grand");
  return L.chatTurn(s, CANON.get(id), { profile });
}
const deliveredText = (r) => (r.delivered || []).join("\n");

// ---- entity lexicon: every firm name the product itself carries ----
const FIRM_SETS = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "packages/career-data/firm-sets.json"), "utf8"));
const CIR_DIR = path.join(__dirname, "..", "packages/career-data/cirs");
const CIR_BY_ID = {};
for (const f of fs.readdirSync(CIR_DIR).filter((x) => x.endsWith(".json"))) {
  const d = JSON.parse(fs.readFileSync(path.join(CIR_DIR, f), "utf8"));
  CIR_BY_ID[d.company_id] = d;
}
const POOL = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "packages/career-data/fixtures/gauntlet/jobs/scored-corpus.json"), "utf8")).postings;
const ENTITIES = new Set();
for (const set of Object.values(FIRM_SETS.sets || {})) for (const f of set.firms || []) ENTITIES.add(f.name);
for (const d of Object.values(CIR_BY_ID)) if (d.company_name) ENTITIES.add(d.company_name);
for (const p of POOL) if (p.company) ENTITIES.add(p.company.replace(/\s*\(fictional\)\s*/g, "").trim());
const ENTITY_LIST = [...ENTITIES].filter((e) => e && e.length >= 3).sort((a, b) => b.length - a.length);
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function entitiesIn(text) {
  const norm = (x) => " " + String(x || "").toLowerCase().replace(/[^a-z0-9&.]+/g, " ").replace(/\s+/g, " ") + " ";
  const t = norm(text);
  // Whole-phrase containment on the normalized text — never a raw
  // substring ("XPO" must not match inside "export").
  return ENTITY_LIST.filter((e) => t.includes(norm(e)));
}
function assertPairwiseDistinct(texts, label) {
  const seen = new Map();
  for (const [id, text] of Object.entries(texts)) {
    assert.ok(text && text.length > 20, `${label} ${id}: reply missing or trivially short`);
    for (const [otherId, otherText] of seen) {
      assert.notEqual(text, otherText, `${label}: ${id} and ${otherId} delivered byte-identical replies`);
    }
    seen.set(id, text);
  }
}
function assertGrounded(id, ask, result, text) {
  const typed = Object.assign({}, result || {});
  delete typed.reply;
  const allowed = new Set([...entitiesIn(ask), ...entitiesIn(JSON.stringify(typed))]);
  for (const e of entitiesIn(text)) {
    assert.ok(allowed.has(e), `${id}: reply names "${e}", which traces to neither the ask nor typed product state`);
  }
}
function runGroup(ids) {
  const out = {};
  for (const id of ids) {
    const r = turn(id);
    out[id] = { r, text: deliveredText(r) };
  }
  return out;
}

// ================= BUG-087 — Intelligence company-file template (23 asks) ====
const INTEL_IDS = ["SC-221", "SC-225", "SC-227", "SC-249", "SC-250", "SC-251", "SC-252", "SC-253", "SC-254", "SC-255", "SC-256", "SC-257", "SC-258", "SC-259", "SC-260", "SC-261", "SC-262", "SC-263", "SC-264", "SC-265", "SC-266", "SC-267", "SC-268"];
test("BUG-087 intel: 23 company-file asks — no two replies byte-identical", () => {
  const g = runGroup(INTEL_IDS);
  assertPairwiseDistinct(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.text])), "BUG-087");
});





// ================= BUG-111 — Apply tailor skeleton (10 + 5 wider) ========
const TAILOR_IDS = ["SC-062", "SC-065", "SC-068", "SC-070", "SC-087", "SC-088", "SC-089", "SC-090", "SC-091", "SC-092", "SC-093", "SC-094", "SC-095", "SC-108", "SC-283"];
const TAILOR_ARTIFACT = ["SC-062", "SC-065", "SC-068", "SC-070", "SC-087", "SC-090", "SC-092", "SC-093", "SC-094", "SC-108", "SC-283"];
test("BUG-111 tailor: 15 asks — no two replies byte-identical, artifacts preserved", () => {
  const g = runGroup(TAILOR_IDS);
  assertPairwiseDistinct(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.text])), "BUG-111");
  for (const id of TAILOR_ARTIFACT) {
    const res = g[id].r.result || {};
    assert.equal(res.intent, "career_tailor", `${id}: intent drifted to ${res.intent}`);
    assert.ok(res.artifact && res.artifact.kind === "tailored_resume", `${id}: tailored artifact lost`);
  }
});
test("BUG-111 tailor: named firm with no posting gets that firm's honest stop — never a substitute role", () => {
  const g = runGroup(TAILOR_IDS);
  const firmOf = { "SC-088": "goldman-sachs-ibd", "SC-089": "mckinsey", "SC-091": "palantir" };
  for (const [id, cirId] of Object.entries(firmOf)) {
    const { r, text } = g[id];
    const res = r.result || {};
    assert.equal(res.intent, "tailor_needs_posting", `${id}: a firm with no posting must stop honestly, got ${res.intent}`);
    assert.ok(!res.artifact, `${id}: no artifact may be claimed`);
    const cir = CIR_BY_ID[cirId];
    assert.ok(text.includes(cir.company_name.split(" ")[0]), `${id}: reply names the asked firm`);
    const barWords = String((cir.hiring_bar_summary || {}).statement || "").replace(/\s+/g, " ").split(" ").filter(Boolean);
    const shingles = new Set(); for (let i = 0; i + 6 <= barWords.length; i++) shingles.add(barWords.slice(i, i + 6).join(" ").toLowerCase());
    assert.ok([...shingles].some((sh) => text.replace(/\s+/g, " ").toLowerCase().includes(sh)), `${id}: reply carries a fact from ${cir.company_name}'s own file`);
    assert.ok(!/tailored for .* at Northwind/i.test(text), `${id}: a substitute role was tailored under the firm's name`);
    assertGrounded(id, CANON.get(id), res, text);
  }
  const r95 = g["SC-095"]; assert.equal((r95.r.result || {}).intent, "tailor_needs_posting", "SC-095: a category is not a posting");
  assert.ok(/category/.test(r95.text), "SC-095: reply says why it stops");
  for (const id of TAILOR_IDS) assertGrounded(id, CANON.get(id), g[id].r.result || {}, g[id].text);
});

const OUT_IDS = ["SC-004", "SC-005", "SC-006", "SC-010", "SC-013", "SC-014", "SC-015", "SC-016", "SC-017", "SC-018", "SC-019", "SC-020", "SC-021", "SC-022", "SC-023", "SC-024", "SC-025", "SC-026", "SC-027", "SC-028", "SC-029", "SC-030", "SC-051", "SC-052", "SC-053", "SC-054", "SC-055", "SC-056", "SC-057", "SC-058", "SC-059", "SC-060"];
const _outreachMod = require("../packages/domain/124-career-outreach.js");
const Outreach = _outreachMod.CareerOutreach || _outreachMod;
test("BUG-110 outreach: 32 plan asks — no two replies byte-identical", () => {
  const g = runGroup(OUT_IDS);
  assertPairwiseDistinct(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.text])), "BUG-110");
});
test("BUG-110 outreach: named firms are the plan's firms; a default is spoken as a proposal", () => {
  const g = runGroup(OUT_IDS);
  for (const id of OUT_IDS) {
    const { r, text } = g[id];
    const res = r.result || {};
    assert.equal(res.intent, "outreach_clarification", `${id}: intent drifted to ${res.intent}`);
    assertGrounded(id, CANON.get(id), res, text);
    const q = Outreach.parseTarget(CANON.get(id), {});
    if (q.firms_source === "named") assert.ok(text.includes(q.firms[0]), `${id}: plan does not name the firm the user named first (${q.firms[0]}): ${text.slice(0, 140)}`);
    if (q.firms_source === "default") assert.ok(/propos/i.test(text), `${id}: vague ask's default set is not spoken as a proposal: ${text.slice(0, 140)}`);
  }
  const t21 = g["SC-021"].text, t22 = g["SC-022"].text;
  assert.ok(t21.includes("Google"), "SC-021 names Google");
  for (const wrong of ["Meta", "Apple", "Amazon", "Netflix", "Microsoft", "NVIDIA", "Stripe", "Datadog", "Palantir"]) assert.ok(!new RegExp(`\\b${wrong}\\b`).test(t21), `SC-021 (a Google ask) names ${wrong}`);
  for (const right of ["Houlihan Lokey", "Jefferies", "Rothschild"]) assert.ok(t22.includes(right), `SC-022 names ${right}`);
  for (const wrong of ["Goldman Sachs", "Morgan Stanley", "JPMorgan", "Bank of America"]) assert.ok(!t22.includes(wrong), `SC-022 (a boutique ask) names ${wrong}`);
  assert.ok(!/investment bankers/.test(g["SC-015"].text), "SC-015 (founders) is not re-dressed as investment bankers");
});
test("BUG-110 parseTarget units: named-firm extraction is a recognizer, not an expander", () => {
  const g1 = Outreach.parseTarget("Find 55 people at Google who interned at startups first", {});
  assert.deepEqual(g1.firms, ["Google"]); assert.equal(g1.firms_source, "named");
  const g2 = Outreach.parseTarget("Find 130 associates at Houlihan Lokey, Jefferies, Rothschild for restructuring chats", {});
  assert.deepEqual(g2.firms, ["Houlihan Lokey", "Jefferies", "Rothschild & Co"]);
  assert.deepEqual(Outreach.parseTarget("Find 10 people and send follow-ups to the rest", {}).firms_named, false);
  assert.deepEqual(Outreach.parseTarget("Find 45 seed-stage founders in Chicago hiring engineers", {}).firms, []);
  assert.equal(Outreach.parseTarget("Find bankers", {}).firms_source, "default");
  const mbb = Outreach.parseTarget("Get me 40 coffee chats with associates at McKinsey, Bain, BCG", {});
  assert.deepEqual(mbb.firms, ["McKinsey & Company", "Bain & Company", "Boston Consulting Group"]);
});

// The breakup itself landed in the referrals wave's per-shape branches
// (each ask shape now composes from its own 135 product + typed store
// state). This lane's guard pins the whole group forever: any future
// shared fallback text serving two of these asks fails here.
const REF_IDS = ["SC-147", "SC-152", "SC-153", "SC-154", "SC-155", "SC-159", "SC-160", "SC-161", "SC-163", "SC-166", "SC-167", "SC-169", "SC-171", "SC-172", "SC-173", "SC-174", "SC-100", "SC-149", "SC-170"];
test("BUG-109 referrals: 19 warm-path asks — no two replies byte-identical", () => {
  const g = runGroup(REF_IDS);
  assertPairwiseDistinct(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.text])), "BUG-109");
});
test("BUG-109 referrals: every reply grounded in its ask or typed graph state", () => {
  const g = runGroup(REF_IDS);
  for (const id of REF_IDS) {
    const { r, text } = g[id];
    const res = r.result || {};
    assert.equal(res.intent, "graph_paths", `${id}: intent drifted to ${res.intent}`);
    assert.ok(!/ranked from your graph\./.test(text) || /alumni, then club/.test(text), `${id}: the retired shared warm-paths paragraph is back: ${text.slice(0, 140)}`);
    assertGrounded(id, CANON.get(id), res, text);
  }
});

const NEG_IDS = ["SC-206", "SC-207", "SC-210", "SC-211", "SC-212", "SC-213", "SC-214", "SC-215", "SC-216", "SC-217", "SC-218", "SC-219", "SC-220"];
test("BUG-088 negotiation: 13 advice asks — no two replies byte-identical", () => {
  const g = runGroup(NEG_IDS);
  assertPairwiseDistinct(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.text])), "BUG-088");
});
test("BUG-088 negotiation: each reply is its own ask's answer, bench product still carried", () => {
  const g = runGroup(NEG_IDS);
  const markers = {
    "SC-206": /field by field|parser reads/i, "SC-207": /benchmark/i, "SC-210": /side by side|total-comp table/i,
    "SC-211": /7 days|extension/i, "SC-212": /floor/i, "SC-213": /unvalued|scenarios/i, "SC-214": /signing-bonus/i,
    "SC-215": /return offer|conversion/i, "SC-216": /expectation/i, "SC-217": /48 hours|extension first/i,
    "SC-218": /leverage|deadline/i, "SC-219": /withdrawal|decline/i, "SC-220": /not legal or tax advice|referred/i,
  };
  for (const id of NEG_IDS) {
    const { r, text } = g[id];
    const res = r.result || {};
    assert.equal(res.intent, "negotiation_advice", `${id}: intent drifted to ${res.intent}`);
    assert.ok(res.bench, `${id}: bench product missing (deterministic completion reads it)`);
    assert.ok(markers[id].test(text), `${id}: reply does not answer its own ask shape: ${text.slice(0, 160)}`);
    assert.ok(!/Paste the offer letter and I will parse it line by line/.test(text) || id === "SC-206", `${id}: the retired shared closing is back`);
    assertGrounded(id, CANON.get(id), res, text);
  }
});

// A reply may only name entities the ask named or typed product state
// carries. An MBB-wide ask must not be answered with a plan owned by
// one member firm the user never singled out.
const Prep = require("../packages/domain/127-career-prep.js");
test("BUG-089 casePrepPlan: a set ask names the set in the spoken text, never its first file alone", () => {
  const set = [CIR_BY_ID.mckinsey, CIR_BY_ID.bain, CIR_BY_ID.bcg];
  const cp = Prep.casePrepPlan({ cirs: set });
  assert.ok(cp.text.includes("McKinsey"), "set text names McKinsey");
  assert.ok(cp.text.includes("Bain"), "set text names Bain");
  assert.ok(cp.text.includes("Boston Consulting Group"), "set text names BCG");
  assert.ok(!/^Case prep plan for (Bain & Company|McKinsey & Company|Boston Consulting Group):/.test(cp.text), `set plan attributed to one firm: ${cp.text}`);
  assert.equal(cp.company, cp.text.match(/for (.+?):/)[1], "record company and spoken text name the same target");
});
test("BUG-089 casePrepPlan: a single-firm ask keeps its single-firm plan", () => {
  const cp = Prep.casePrepPlan({ cir: CIR_BY_ID.mckinsey });
  assert.ok(cp.text.startsWith("Case prep plan for McKinsey & Company:"), cp.text);
});
test("BUG-089 SC-185 through the chat path: MBB-wide ask, no single-firm attribution", () => {
  const r = turn("SC-185");
  const text = deliveredText(r);
  assert.ok(!/Case prep plan for (Bain & Company|McKinsey & Company|Boston Consulting Group)\b/.test(text), `SC-185 reply attributes the plan to one firm: ${text.slice(0, 200)}`);
  assertGrounded("SC-185", CANON.get("SC-185"), r.result || {}, text);
});
test("BUG-087 intel: every reply grounded + carries its own file's content", () => {
  const g = runGroup(INTEL_IDS);
  for (const id of INTEL_IDS) {
    const { r, text } = g[id];
    const res = r.result || {};
    assert.equal(res.intent, "company_intel", `${id}: intent drifted to ${res.intent}`);
    assertGrounded(id, CANON.get(id), res, text);
    assert.ok(!/file is thin right now/i.test(text), `${id}: reply claims a thin file — all 38 files on disk carry bar/routes/cadence/comp content`);
    // content flow: some 6-word run from the file's own sections must
    // survive into the delivered reply (the reply is composed FROM the
    // file, not framed around it).
    const cir = Object.values(CIR_BY_ID).find((d) => d.company_name === res.company) || res.payload;
    assert.ok(cir, `${id}: no company file resolved`);
    const corpus = [cir.hiring_bar_summary, cir.compensation_notes, cir.hiring_cadence, cir.thesis_text, cir.interview_styles, cir.values_culture_signals]
      .map((v) => (typeof v === "string" ? v : (Array.isArray(v) ? (v[0] && (v[0].statement || v[0].text || "")) : (v && (v.statement || v.text || "")))))
      .join(" ").replace(/\s+/g, " ");
    const words = corpus.split(" ").filter(Boolean);
    const shingles = new Set();
    for (let i = 0; i + 6 <= words.length; i++) shingles.add(words.slice(i, i + 6).join(" ").toLowerCase());
    const flat = text.replace(/\s+/g, " ").toLowerCase();
    assert.ok([...shingles].some((sh) => flat.includes(sh)), `${id}: no 6-word run from the ${res.company} file's sections appears in the reply`);
  }
});

// ================= BUG-119..BUG-122 — six-flip repairs =================
// The residual lane's Intelligence + Negotiation re-run (grader-v2 over
// upmore-career-gauntlet-intel-fix) flipped six scenarios PASS -> FAIL
// as a side effect of the BUG-087/088 per-shape compositions: the new
// texts spoke bare claim verbs with no typed state behind them (H-7),
// one shape dropped its dated grounding line (R-C5), two closers were
// not next steps (H-12, one of them latent behind SC-211's S0 stop),
// one composition quoted a firm's screen in the second person (H-16's
// tone floor), and one printed a degree-field adjective the claim scan
// reads as a verb. The scans below replicate grader-v2's own predicates
// (checkClaimToState / checkH12_oneNextStep in grader-v2.cjs) so the
// class can never return in these branches. SC-264/SC-268's half of the
// flip set is a grader defect, guarded in
// tests/career-reply-oracle-finance-leak.test.cjs (BUG-123).
const CLAIM_VERBS_G = [
  /\b(sent|sending was completed)\b/i, /\b(submitted)\b/i, /\b(applied)\b/i, /\b(booked)\b/i,
  /\b(logged)\b/i, /\b(halted|stopped everything)\b/i, /\b(confirmed)\b/i, /\b(tracked)\b/i,
  /\b(suppressed)\b/i, /\b(withdrawn)\b/i,
];
const NEGATED_G = /(not|never|nothing|no|won't|will not|hasn't|haven't|did not|didn't|marked not|flagged|unconfirmed)/i;
function claimHits(text) {
  const hits = [];
  for (const sentence of String(text).split(/(?<=[.!?])\s+|\n+/)) {
    for (const re of CLAIM_VERBS_G) {
      const m = re.exec(sentence);
      if (!m) continue;
      if (re.source.includes("confirmed") && /^\s+(facts?|records?|profile|history|details|address|email)\b/i.test(sentence.slice(m.index + m[0].length))) continue;
      const before = sentence.slice(Math.max(0, m.index - 40), m.index);
      const after = sentence.slice(m.index, m.index + 30);
      if (NEGATED_G.test(before) || /\b(not|never|unconfirmed)\b/i.test(after)) continue;
      if (/\b(want me to|shall i|should i|would you like|ready to|will|going to|may|can i)\b/i.test(sentence) && /\?/.test(sentence)) continue;
      if (/\b(will|going to|may send|queued|drafted)\b/i.test(before)) continue;
      hits.push(`${m[0]} in "${sentence.slice(0, 80)}"`);
    }
  }
  return hits;
}
const H12_NEXT_G = /\b(want me to|shall i|say the word|tell me|tap|reply (yes|with)|next:|approve|book it|want the|want to see|shall we)\b/i;
function endsWithNextStep(r) {
  const d = r.delivered || [];
  const last = d[d.length - 1] || "";
  return /\?/.test(last) || H12_NEXT_G.test(last) || /\[Yes\]/.test(last);
}

test("BUG-119 SC-211 extension shape: the mechanics are stated with no bare claim verb; reply ends on a next step", () => {
  const r = turn("SC-211"); const text = deliveredText(r);
  assert.deepEqual(claimHits(text), [], `SC-211: ungrounded claim verbs: ${claimHits(text).join(" | ")}`);
  assert.ok(/7 days/.test(text), "SC-211: the draft's default window is still stated");
  assert.ok(/deadline/.test(text) && /log/.test(text), "SC-211: the deadline-recording mechanism is still stated");
  assert.ok(endsWithNextStep(r), "SC-211: reply ends with one concrete next action or a single question");
});
test("BUG-120 SC-213 equity shape: the dated grounding line rides; reply ends on a next step", () => {
  const r = turn("SC-213"); const text = deliveredText(r);
  assert.ok(/Source class: [^.\n]*, checked as of 20\d\d-\d\d-\d\d/.test(text), `SC-213: no dated source-class grounding line in: ${text.slice(0, 220)}`);
  assert.ok(endsWithNextStep(r), "SC-213: reply ends with one concrete next action or a single question");
});
test("BUG-121 SC-225 comparison: the firm's screen is reported in third person, never re-addressed to the user; reply ends on a next step", () => {
  const r = turn("SC-225"); const text = deliveredText(r);
  assert.ok(!/\byou must\b/i.test(text), "SC-225: the firm's screen is re-addressed to the user (pressure voice)");
  assert.ok(/candidates must be pursuing/.test(text), "SC-225: the screen itself is still reported");
  assert.ok(/penultimate/.test(text), "SC-225: the screen's substance survives");
  assert.ok(endsWithNextStep(r), "SC-225: reply ends with one concrete next action or a single question");
});
test("BUG-122 SC-256 entry routes: the file's degree fields are named without the bare claim token", () => {
  const r = turn("SC-256"); const text = deliveredText(r);
  assert.deepEqual(claimHits(text), [], `SC-256: ungrounded claim verbs: ${claimHits(text).join(" | ")}`);
  assert.ok(/Entry routes/.test(text), "SC-256: the routes section survives");
  assert.ok(/mathematics/.test(text) && /engineering/.test(text), "SC-256: the file's degree fields are still named");
});
