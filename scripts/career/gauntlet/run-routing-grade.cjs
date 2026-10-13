// Routing grade (Gate 2 grading prep, Quality Spec Pack v1.0: 05 Gate 2 +
// 04 Part 6a) — GRADING TOOLING ONLY. No product code is touched or called
// except through the existing staging chat path (pilot-lib chatTurn:
// 143 -> 120 -> 130 -> 142 -> 141, replies composed by 140), exactly as
// run-grand.cjs drove it.
//
// What this grader owns:
//   1. The CANONICAL ROUTING SET — scripts/career/gauntlet/routing-expectations.json
//      (versioned; regenerate with --write-expectations, drift-check with
//      --check-expectations). Per scenario: the expected tool (the run-1
//      handler that owned the scenario in the original build) + a source
//      citation. Derivation is mechanical and reproducible:
//        a. s.tool("...") tokens in the scenario runner itself
//           (scripts/career/scenarios/SC-*.cjs) — the head of each token is
//           mapped to a packages/domain module (numeric prefix or Career*
//           alias); the primary tool is the most frequent mapped module,
//           ties broken by first occurrence. 140-career-reply (the composer,
//           present everywhere) is excluded — it owns no scenario.
//        b. If the runner names no module token, the ledger family default
//           (docs/scenario-ledger.md family -> the domain module that owns
//           that family) applies and the citation says so — these are the
//           weaker-grounded entries and are counted as such in the file.
//        c. Hand overrides (OVERRIDES below), each with its evidence:
//           SC-105 (portal status read) and SC-179 (voice mock) are the two
//           R-C7 examples named in 01 ("voice mock, portal status read");
//           their run-1 runners finish honest-unavailable, so their expected
//           tool is "R-C7-honest-unavailable", NOT a tool. The list is a
//           DRAFT for owner approval (05 Gate 2: "The capability-absent list
//           is owner-approved") — until approved it is graded as written and
//           flagged in every report.
//   2. The Gate 2 metrics, computed from live chatTurn results:
//        - correct-tool rate on canonical asks, per persona (Gate 2: >=97%)
//        - paraphrase routing consistency on a stratified sample (04 6a:
//          4 classes; Gate 2: >=95%): a variant is consistent iff its
//          observed tool equals the canonical ask's observed tool. The
//          degenerate case (canonical AND variant both at fallback/none)
//          is counted separately as vacuous consistency and never hidden.
//        - zero-counter 1: delivered bubbles in the "I didn't catch that"
//          class (140 FALLBACKS.unmatched, matched by regex) — Gate 2: 0
//        - zero-counter 2: canned discovery replies outside the discovery
//          intent — the hardened re-scorer's canonical-shortlist fingerprint
//          (run-grand-rescore.cjs cannedSignature, reused by require) on a
//          non-discovery ask (its expectedDomain) — Gate 2: 0
//      A turn's OBSERVED TOOL is its typed intent when one was returned,
//      else its handler module, else "none" (contained / no handler).
//      A canonical turn is CORRECT iff the observed handler module equals
//      the expected tool, or the observed intent is in the expectation's
//      acceptable_intents (the current chain's intent vocabulary for that
//      run-1 module's work — see MODULE_INTENTS), or the observed tool
//      literally names the expected module (the Gate 2 tool registry the
//      rebuild will introduce). For R-C7 expectations, CORRECT iff the
//      reply is an honest-unavailable message (HONEST_UNAVAILABLE_RE), is
//      not the unmatched fallback, and contains no "didn't catch that".
//
// Personas: --persona P1 (default; fixture p1-early-career-swe, the only
// profile the staging host injects — same as run-grand) is wired.
// --persona P2 is PLUGGABLE: PERSONAS.P2.fixtureDir is null until the
// spec-P2 fixture (04 Part 5: finance & accounting sophomore) lands; asking
// for P2 without --persona-fixture <dir> exits 2 with that stated, never a
// silent P1 substitution. Results are always reported per persona.
//
// Determinism: no LLM, no wall-clock fields in the results JSON, paraphrase
// generation is seeded per scenario id. Same command + same build = same
// numbers. Run: node scripts/career/gauntlet/run-routing-grade.cjs
//   [--persona P1] [--only SC-001,SC-065] [--no-paraphrases]
//   [--out-json <path>] [--write-doc <path>]
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

process.env.GAUNTLET_OUT_DIR = process.env.ROUTING_GRADE_OUT_DIR || "/tmp/routing-grade-evidence";
process.env.GAUNTLET_TRIAL = "routing-grade";
process.env.HARNESS_OUT_DIR = process.env.HARNESS_OUT_DIR || "/tmp/routing-grade-harness";

const ROOT = path.join(__dirname, "..", "..", "..");
const EXPECTATIONS_PATH = path.join(__dirname, "routing-expectations.json");
const SCEN_DIR = path.join(ROOT, "scripts", "career", "scenarios");
const DOMAIN_DIR = path.join(ROOT, "packages", "domain");
const CANON_DOC = path.join(process.env.HOME, "workspace/your_files/upmore-career-300-scenarios.md");
const LEDGER = path.join(ROOT, "docs", "scenario-ledger.md");
const EXPECTATIONS_VERSION = 1;

// ---------------------------------------------------------------- personas --
const PERSONAS = {
  P1: { fixtureDir: "p1-early-career-swe", label: "CS junior, SWE target (existing gauntlet fixture)", wired: true },
  // Spec-P2 (04 Part 5) is the finance/accounting sophomore. The fixture dir
  // named p2-* in the corpus is a different persona (international graduate),
  // so it is NOT registered here; register the real fixture when it lands.
  P2: { fixtureDir: null, label: "Finance & accounting sophomore, IB -> VC target (spec 04 Part 5)", wired: false },
};

// ------------------------------------------------------- expectation derive --
const CAREER_ALIAS = {
  CareerAccess: "120-career-access", CareerOnboarding: "130-career-onboarding",
  CareerProfile: "122-career-profile", CareerJobs: "121-career-jobs",
  CareerTailor: "123-career-tailor", CareerOutreach: "124-career-outreach",
  CareerIntel: "125-career-intel", CareerTrack: "126-career-track",
  CareerPrep: "127-career-prep", CareerNegotiation: "128-career-negotiation",
  CareerOS: "129-career-os", CareerDiscover: "131-career-discover",
  CareerApply: "132-career-apply", CareerPackets: "133-career-packets",
  CareerPaths: "134-career-paths", CareerGraph: "135-career-graph",
  CareerSeason: "136-career-season", CareerSafety: "139-career-safety",
  CareerDoorstep: "141-career-doorstep", CareerRouter: "142-career-router",
  CareerGuidance: "144-career-guidance",
};
const FAMILY_DEFAULT = {
  "Outreach & Networking": "124-career-outreach",
  "Referrals & Warm Paths": "135-career-graph",
  "Apply Engine": "132-career-apply",
  "Track & Follow-Up": "126-career-track",
  "Interview Prep": "127-career-prep",
  "Negotiation": "128-career-negotiation",
  "Intelligence & Honest Advice": "125-career-intel",
  "Career Os": "129-career-os",
  "Access, Safety & Honesty": "120-career-access",
};
// Pre-declared safety-refusal scenarios (run-grand.cjs SAFETY_REFUSAL_IDS):
// a guard refusal intent is an acceptable route for these, in addition to
// their run-1 owner's intents.
const SAFETY_REFUSAL_IDS = new Set(["SC-035", "SC-084", "SC-113", "SC-248", "SC-294", "SC-295", "SC-296", "SC-297"]);
// Acceptable observed intents per expected module: the intents the current
// integrated chain (120/130/141/142) returns for that module's work, read
// from those files' intent literals. Modules with no current intent surface
// (125/128/129/134/135/136/144/145) accept only their module/tool name —
// that absence is precisely the Gate 2 routing gap.
const MODULE_INTENTS = {
  "120-career-access": ["connect_google", "connect_browser_source", "connected_accounts", "disconnect", "portal_accounts", "access_log", "profile_export", "session_health", "captcha_handoff"],
  "121-career-jobs": ["career_discovery", "career_internship_discovery", "discovery_dead_board"],
  "122-career-profile": ["profile_correction", "profile_recall", "profile_export", "onboarding_answer"],
  "123-career-tailor": ["career_tailor", "tailor_needs_posting", "tailor_refused"],
  "124-career-outreach": ["outreach_draft", "outreach_clarification", "intent_opt_out", "intent_followup_status", "intent_recipient_change", "calendar_proposal", "campaign_digest"],
  "125-career-intel": ["company_intel", "company_thesis", "path_plan"],
  "126-career-track": ["tracking_log", "tracking_status", "tracking_digest", "intent_followup_status", "queue_halt", "intent_cancelled", "doorstep_status"],
  "127-career-prep": ["prep_mock_start", "prep_mock_next", "prep_mock_followup", "prep_mock_complete", "prep_mock_retry", "prep_needs_profile", "prep_brief"],
  "128-career-negotiation": ["negotiation_plan", "negotiation_advice"],
  "129-career-os": ["capability_status"],
  "130-career-onboarding": ["onboarding", "onboarding_answer", "profile_correction", "profile_recall", "profile_export", "capability_status"],
  "131-career-discover": ["career_discovery", "career_internship_discovery", "discovery_dead_board"],
  "132-career-apply": ["doorstep_fill", "doorstep_submit", "doorstep_status", "application_packet", "intent_prior_application", "intent_role_closed", "intent_sensitive_correction"],
  "133-career-packets": ["career_packet", "packet_needs_role", "packet_refused", "packet_prep", "application_packet", "intent_packet_validity"],
  "134-career-paths": ["path_answer"],
  "135-career-graph": ["graph_paths", "graph_alumni", "graph_referral", "graph_keep_warm", "graph_memory", "graph_blurb", "graph_intro"],
  "136-career-season": ["tracking_log", "season_dashboard"],
  "139-career-safety": ["intent_refusal", "queue_halt", "intent_cancelled", "safety_support", "ai_use_answer"],
  "141-career-doorstep": ["doorstep_fill", "doorstep_submit", "doorstep_status", "application_packet", "packet_prep", "queue_halt", "tracking_log", "calendar_proposal", "outreach_draft"],
  "144-career-guidance": [],
  "145-career-w11-ext": [],
};
const RC7 = "R-C7-honest-unavailable";
const OVERRIDES = {
  "SC-105": { expected_tool: RC7, citation: "OVERRIDE (capability-absent draft, owner approval pending): 01 R-C7 names 'portal status read' as an unwired capability; scripts/career/scenarios/SC-105.cjs finishes LEARN with real_portal_read:false — no real portal status was read and none may be faked." },
  "SC-179": { expected_tool: RC7, citation: "OVERRIDE (capability-absent draft, owner approval pending): 01 R-C7 names 'voice mock' as an unwired capability; scripts/career/scenarios/SC-179.cjs outcome: 'Voice mock honestly reported as not wired (no fake capability)' with the text mock as the offered alternative." },
};

function domainModules() {
  const out = new Set();
  for (const f of fs.readdirSync(DOMAIN_DIR)) { const m = f.match(/^(\d{3}-career-[a-z0-9-]+)\.js$/); if (m) out.add(m[1]); }
  return out;
}
function headToModule(head, modules) {
  if (/^\d{3}$/.test(head)) { for (const m of modules) if (m.startsWith(head + "-")) return m; return null; }
  if (/^\d{3}-career-[a-z0-9-]+$/.test(head)) return modules.has(head) ? head : null;
  return CAREER_ALIAS[head] || null;
}
function parseCanonicalAsks() {
  const doc = fs.readFileSync(CANON_DOC, "utf8");
  const out = new Map();
  for (const line of doc.split("\n")) { const m = line.match(/^(SC-\d{3})\s+(.+)$/); if (m && !out.has(m[1])) out.set(m[1], m[2].trim()); }
  const ledger = fs.readFileSync(LEDGER, "utf8");
  const fam = new Map();
  for (const line of ledger.split("\n")) { const m = line.match(/^\| (SC-\d{3}) \| ([^|]+) \|/); if (m && !fam.has(m[1])) fam.set(m[1], m[2].trim()); }
  return { asks: out, fam };
}
function familyGroup(id, family) {
  if (Number(id.slice(3)) >= 291) return "Appendix (SC-291-300)";
  return family;
}
function deriveExpectations() {
  const modules = domainModules();
  const { asks, fam } = parseCanonicalAsks();
  const entries = [];
  for (let i = 1; i <= 300; i++) {
    const id = "SC-" + String(i).padStart(3, "0");
    const ask = asks.get(id) || null;
    const family = fam.get(id) || "unknown";
    let file = null;
    for (const cand of [id + ".cjs", id + "-canonical.cjs"]) if (fs.existsSync(path.join(SCEN_DIR, cand))) { file = cand; break; }
    const base = { id, ask, family, family_group: familyGroup(id, family), scenario_file: file ? "scripts/career/scenarios/" + file : null };
    if (OVERRIDES[id]) { entries.push(Object.assign(base, { expected_tool: OVERRIDES[id].expected_tool, acceptable_intents: [], grounding: "override-capability-absent", source_citation: OVERRIDES[id].citation })); continue; }
    if (!file) { entries.push(Object.assign(base, { expected_tool: null, acceptable_intents: [], grounding: "UNGROUNDED", source_citation: "no scenario runner file found for this id" })); continue; }
    const text = fs.readFileSync(path.join(SCEN_DIR, file), "utf8");
    const tokens = [...text.matchAll(/s\.tool\(\s*["']([^"']+)["']/g)].map((m) => m[1]);
    const counts = new Map(), firstAt = new Map();
    tokens.forEach((tok, idx) => {
      const mod = headToModule(tok.split(/[.(\s]/)[0], modules);
      if (mod && mod !== "140-career-reply") { counts.set(mod, (counts.get(mod) || 0) + 1); if (!firstAt.has(mod)) firstAt.set(mod, idx); }
    });
    let primary = null, grounding = null, citation = null;
    if (counts.size) {
      primary = [...counts.entries()].sort((a, b) => b[1] - a[1] || firstAt.get(a[0]) - firstAt.get(b[0]))[0][0];
      grounding = "scenario-tool-calls";
      const named = tokens.filter((t) => headToModule(t.split(/[.(\s]/)[0], modules) === primary);
      citation = `scripts/career/scenarios/${file}: s.tool tokens [${named.slice(0, 3).join(" | ")}] -> ${primary} (run-1 handler; ${counts.get(primary)} token(s), primary by frequency then first occurrence)`;
    } else if (FAMILY_DEFAULT[family]) {
      primary = FAMILY_DEFAULT[family]; grounding = "family-default";
      citation = `scripts/career/scenarios/${file} names no module in its s.tool tokens; ledger family "${family}" (docs/scenario-ledger.md) -> family owner ${primary}. Weaker grounding — flagged family-default.`;
    } else {
      entries.push(Object.assign(base, { expected_tool: null, acceptable_intents: [], grounding: "UNGROUNDED", source_citation: `scripts/career/scenarios/${file} names no module and family "${family}" has no default` }));
      continue;
    }
    const acceptable = [...(MODULE_INTENTS[primary] || [])];
    if (SAFETY_REFUSAL_IDS.has(id) && !acceptable.includes("intent_refusal")) acceptable.push("intent_refusal");
    entries.push(Object.assign(base, { expected_tool: primary, acceptable_intents: acceptable, grounding, source_citation: citation }));
  }
  return {
    version: EXPECTATIONS_VERSION,
    generated_by: "scripts/career/gauntlet/run-routing-grade.cjs --write-expectations",
    sources: ["~/workspace/your_files/upmore-career-300-scenarios.md (canonical asks)", "docs/scenario-ledger.md (families)", "scripts/career/scenarios/SC-*.cjs (run-1 handler map: s.tool tokens)", "docs/quality-spec/01-NON-NEGOTIABLES.md R-C7 (SC-105, SC-179 overrides)"],
    capability_absent_draft: Object.keys(OVERRIDES),
    capability_absent_status: "DRAFT — owner approval pending (05 Gate 2 requires the capability-absent list to be owner-approved)",
    entries,
  };
}

// ------------------------------------------------------------- paraphrases --
// 04 Part 6a classes. Deterministic transforms of the canonical ask; the
// typo class is seeded by scenario id (FNV-1a + mulberry32, same scheme as
// the scenario harness's messifier).
function hashSeed(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function paraphrases(id, ask) {
  const casual = ask.toLowerCase().replace(/[.]$/, "").replace(/^find\b/, "get me").replace(/\bplease\b/g, "").replace(/\s+/g, " ").trim();
  const rng = mulberry32(hashSeed(id + ":typo"));
  const typo = ask.split(" ").map((w) => {
    if (w.length < 5 || /\d|@|http/.test(w)) return w;
    if (rng() < 0.5) return w;
    const i = 1 + Math.floor(rng() * (w.length - 2));
    return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
  }).join(" ");
  const bare = ask.replace(/[.]$/, "");
  const indirect = "I've been told I should sort this out — " + bare.charAt(0).toLowerCase() + bare.slice(1) + ". Can you handle that for me?";
  const stressed = "Stressed and short on time, please just handle this: " + bare.charAt(0).toLowerCase() + bare.slice(1);
  return [
    { cls: "short-casual", text: casual },
    { cls: "typo-laden", text: typo },
    { cls: "indirect", text: indirect },
    { cls: "stressed-text", text: stressed },
  ];
}
// Stratified sample: within each family_group (ids sorted), every 4th entry
// starting at index 0 — deterministic, covers every group, >=60 entries.
function stratifiedSample(entries) {
  const byGroup = new Map();
  for (const e of entries) { if (!byGroup.has(e.family_group)) byGroup.set(e.family_group, []); byGroup.get(e.family_group).push(e); }
  const out = [];
  for (const list of byGroup.values()) list.forEach((e, i) => { if (i % 4 === 0) out.push(e); });
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// ----------------------------------------------------------------- grading --
const DIDNT_CATCH_RE = /didn'?t catch that/i;
const HONEST_UNAVAILABLE_RE = /not wired|no live|not (yet )?(wired|available)|isn'?t wired|can'?t (read|check|run|do)|cannot (read|check|run)|don'?t have (a |the )?(live|real|access)|no real (portal|account)|never (see|store) your password|sign in (yourself|once) in/i;
function loadRescore() { return require("./run-grand-rescore.cjs"); }
function observedTool(r) {
  if (!r || r.contained || !r.result) return "none";
  return r.result.intent || (r.handler ? r.handler.split(".")[0] : "none");
}
function handlerModule(r) { return r && r.handler ? r.handler.split(".")[0] : null; }
function isCorrect(exp, r, text) {
  if (exp.expected_tool === RC7) {
    return !DIDNT_CATCH_RE.test(text) && HONEST_UNAVAILABLE_RE.test(text) && observedTool(r) !== "career_fallback";
  }
  if (!exp.expected_tool) return false;
  if (handlerModule(r) === exp.expected_tool) return true;
  const tool = observedTool(r);
  return tool === exp.expected_tool || (exp.acceptable_intents || []).includes(tool);
}

function grade(opts) {
  const L = require("./pilot-lib.cjs");
  const Rescore = loadRescore();
  const expectations = JSON.parse(fs.readFileSync(EXPECTATIONS_PATH, "utf8"));
  const persona = PERSONAS[opts.persona];
  const fixtureDir = opts.personaFixture || persona.fixtureDir;
  if (!fixtureDir) {
    console.error(`PERSONA ${opts.persona} NOT WIRED: ${persona.label}. Its fixture has not landed; register it in PERSONAS or pass --persona-fixture <dir>. Refusing to substitute another persona.`);
    process.exit(2);
  }
  const profile = L.gauntletProfile(fixtureDir);
  let entries = expectations.entries;
  if (opts.only) { const want = new Set(opts.only); entries = entries.filter((e) => want.has(e.id)); }
  const run = (id, slug, text) => {
    const s = L.H.session(id, slug);
    const r = L.chatTurn(s, text, { profile });
    const delivered = (r.delivered || []).join("\n");
    return { r, delivered };
  };
  const canonical = [];
  for (const exp of entries) {
    const { r, delivered } = run(exp.id, "routing-grade", exp.ask);
    const canned = Rescore.cannedSignature(delivered);
    const discovery = Rescore.expectedDomain({ canonical_ask: exp.ask, family: exp.family }).discovery;
    canonical.push({
      id: exp.id, family: exp.family, family_group: exp.family_group,
      expected_tool: exp.expected_tool, grounding: exp.grounding,
      observed_handler: r.handler || null, observed_intent: (r.result && r.result.intent) || null,
      observed_tool: observedTool(r), contained: !!r.contained,
      correct: isCorrect(exp, r, delivered),
      didnt_catch: DIDNT_CATCH_RE.test(delivered),
      canned_outside_discovery: canned.canned && !discovery,
      canned_companies: canned.companies,
      reply_excerpt: delivered.slice(0, 240),
    });
  }
  let paraphrase = null;
  if (!opts.noParaphrases) {
    const sample = stratifiedSample(entries);
    const byId = new Map(canonical.map((c) => [c.id, c]));
    const rows = [];
    for (const exp of sample) {
      for (const v of paraphrases(exp.id, exp.ask)) {
        const { r, delivered } = run(exp.id, "routing-grade-" + v.cls, v.text);
        const tool = observedTool(r);
        rows.push({
          id: exp.id, family_group: exp.family_group, cls: v.cls, text: v.text,
          expected_tool: exp.expected_tool, canonical_tool: byId.get(exp.id).observed_tool,
          observed_tool: tool, consistent: tool === byId.get(exp.id).observed_tool,
          vacuous: tool === "none" || tool === "career_fallback",
          correct: isCorrect(exp, r, delivered),
          didnt_catch: DIDNT_CATCH_RE.test(delivered),
        });
      }
    }
    const nonVacuousBase = rows.filter((x) => !(x.canonical_tool === "none" || x.canonical_tool === "career_fallback"));
    paraphrase = {
      sample_scenarios: sample.length, sample_ids: sample.map((e) => e.id),
      variants: rows.length,
      consistent: rows.filter((x) => x.consistent).length,
      consistency_pct: rows.length ? Math.round(1000 * rows.filter((x) => x.consistent).length / rows.length) / 10 : null,
      nonfallback_canonical_variants: nonVacuousBase.length,
      nonfallback_consistent: nonVacuousBase.filter((x) => x.consistent).length,
      variant_correct_tool: rows.filter((x) => x.correct).length,
      rows,
    };
  }
  const correct = canonical.filter((c) => c.correct).length;
  const confusion = {};
  for (const c of canonical) { const k = (c.expected_tool || "UNGROUNDED") + " -> " + c.observed_tool; confusion[k] = (confusion[k] || 0) + 1; }
  const results = {
    grader: "run-routing-grade.cjs v" + EXPECTATIONS_VERSION,
    expectations_version: expectations.version,
    persona: opts.persona, persona_fixture: fixtureDir,
    scenarios_run: canonical.length,
    canonical: { correct, total: canonical.length, correct_tool_pct: canonical.length ? Math.round(1000 * correct / canonical.length) / 10 : null },
    zero_counters: {
      didnt_catch_count: canonical.filter((c) => c.didnt_catch).length,
      didnt_catch_ids: canonical.filter((c) => c.didnt_catch).map((c) => c.id),
      canned_outside_discovery_count: canonical.filter((c) => c.canned_outside_discovery).length,
      canned_outside_discovery_ids: canonical.filter((c) => c.canned_outside_discovery).map((c) => c.id),
    },
    gates_gate2: {
      canonical_target_pct: 97, canonical_met: canonical.length && (100 * correct / canonical.length) >= 97,
      paraphrase_target_pct: 95, paraphrase_met: paraphrase ? paraphrase.consistency_pct >= 95 : null,
      didnt_catch_met: canonical.every((c) => !c.didnt_catch),
      canned_met: canonical.every((c) => !c.canned_outside_discovery),
    },
    confusion, paraphrase, canonical_rows: canonical,
  };
  return results;
}

function writeDoc(results, docPath, buildSha) {
  const c = results.canonical, z = results.zero_counters, p = results.paraphrase;
  const L = [];
  L.push("# Gauntlet Routing Baseline — PRE-REBUILD (Gate 2 comparison baseline)");
  L.push("");
  L.push("**This is the PRE-REBUILD baseline.** It measures the CURRENT build (before Codex's Gate 2 router rebuild) with the routing grader that Gate 2 will be judged by. Gate 2 is judged by re-running the identical command on the rebuilt router and comparing against these numbers.");
  L.push("");
  L.push(`- Build: \`${buildSha}\` (branch tip at baseline generation)`);
  L.push("- Grader: `scripts/career/gauntlet/run-routing-grade.cjs` (expectations v" + results.expectations_version + ")");
  L.push("- Expectations: `scripts/career/gauntlet/routing-expectations.json` — canonical routing set for all 300 scenarios, derived mechanically from the run-1 handler map (scenario runners' s.tool tokens; family default where a runner names no module; R-C7 overrides for SC-105/SC-179). Regenerate: `--write-expectations`; drift-check: `--check-expectations`.");
  L.push("- Reproduce these numbers: `node scripts/career/gauntlet/run-routing-grade.cjs --persona P1 --out-json <path>` — deterministic (no LLM, seeded paraphrases, no wall-clock fields); the same command on the same build returns the same numbers.");
  L.push("- Evidence class: E2 staging chat path (pilot-lib chain 143 -> 120 -> 130 -> 142 -> 141, replies composed by 140), persona P1 (gauntlet fixture p1-early-career-swe — the only profile the staging host injects). P2 is pluggable in the runner and NOT yet wired (spec-P2 fixture has not landed).");
  L.push("- Capability-absent list status: DRAFT (SC-105, SC-179) — owner approval pending, per 05 Gate 2.");
  L.push("");
  L.push("## Baseline numbers (Gate 2 targets in brackets)");
  L.push("");
  L.push(`- **Canonical correct-tool: ${c.correct}/${c.total} = ${c.correct_tool_pct}%** [Gate 2: >=97% on P1 and P2]`);
  if (p) {
    L.push(`- **Paraphrase routing consistency: ${p.consistent}/${p.variants} = ${p.consistency_pct}%** over a stratified sample of ${p.sample_scenarios} scenarios x 4 classes (04 Part 6a) [Gate 2: >=95%]`);
    L.push(`  - Non-degenerate slice (canonical ask did NOT land on fallback/none): ${p.nonfallback_consistent}/${p.nonfallback_canonical_variants} consistent — the headline consistency number is inflated whenever both canonical and variant land on the same fallback, so this slice is reported alongside it, always.`);
    L.push(`  - Variant correct-tool (variant routed to the EXPECTED tool): ${p.variant_correct_tool}/${p.variants}.`);
  }
  L.push(`- **Zero-counter 1 — "I didn't catch that"-class replies: ${z.didnt_catch_count}** [Gate 2: 0]${z.didnt_catch_count ? " — scenarios: " + z.didnt_catch_ids.join(", ") : ""}`);
  L.push(`- **Zero-counter 2 — canned discovery replies outside the discovery intent: ${z.canned_outside_discovery_count}** [Gate 2: 0]${z.canned_outside_discovery_count ? " — scenarios: " + z.canned_outside_discovery_ids.join(", ") : ""}`);
  L.push("");
  L.push("## Routing confusion (expected tool -> observed tool, top rows)");
  L.push("");
  L.push("| Expected | Observed | n |");
  L.push("|---|---|---|");
  for (const [k, n] of Object.entries(results.confusion).sort((a, b) => b[1] - a[1]).slice(0, 20)) { const [e, o] = k.split(" -> "); L.push(`| ${e} | ${o} | ${n} |`); }
  L.push("");
  L.push("## Method notes");
  L.push("");
  L.push("- Observed tool = the turn's typed intent when returned, else its handler module, else `none` (contained / no handler). Correct = observed handler module equals the expected run-1 tool, or observed intent is in the expectation's acceptable-intents list (the current chain's vocabulary for that module's work), or the observed tool names the expected module directly.");
  L.push("- Modules with no intent in the current chain (125 intel, 128 negotiation, 134 paths, 135 graph, 144 guidance) can only score via a handler/tool name — that absence is the routing gap Gate 2 exists to close, and it is why this baseline is expected to be poor (the earlier fallback axis measured 0/269 in the hardened re-score).");
  L.push("- Canned fingerprint reused verbatim from the hardened grader (`run-grand-rescore.cjs`: >=3 of Northwind Ledger / Lakefront Cloud / Eastbank Systems / Copperline Infra / Fieldnote Software, or the '5 roles most worth applying to' header); discovery determination reuses its expectedDomain.");
  L.push("- Full per-scenario rows (expected vs observed, both counters, reply excerpts, all paraphrase rows) are in the results JSON produced by the same run (`--out-json`); the baseline run's copy is committed alongside this doc as `docs/career/gauntlet-routing-baseline-results.json`.");
  L.push("");
  fs.writeFileSync(docPath, L.join("\n"));
}

// -------------------------------------------------------------------- main --
function main() {
  const args = process.argv.slice(2);
  const get = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  if (args.includes("--write-expectations")) {
    const derived = deriveExpectations();
    fs.writeFileSync(EXPECTATIONS_PATH, JSON.stringify(derived, null, 2) + "\n");
    const grounded = derived.entries.filter((e) => e.grounding === "scenario-tool-calls").length;
    const fam = derived.entries.filter((e) => e.grounding === "family-default").length;
    const over = derived.entries.filter((e) => e.grounding === "override-capability-absent").length;
    const ung = derived.entries.filter((e) => !e.expected_tool);
    console.log(JSON.stringify({ written: EXPECTATIONS_PATH, total: derived.entries.length, scenario_tool_calls: grounded, family_default: fam, overrides: over, ungrounded: ung.map((e) => e.id) }, null, 2));
    return;
  }
  if (args.includes("--check-expectations")) {
    const derived = deriveExpectations();
    const onDisk = JSON.parse(fs.readFileSync(EXPECTATIONS_PATH, "utf8"));
    const same = JSON.stringify(derived.entries) === JSON.stringify(onDisk.entries);
    console.log(same ? "expectations IN SYNC with derivation" : "expectations DRIFT from derivation");
    process.exit(same ? 0 : 1);
  }
  const persona = get("--persona") || "P1";
  if (!PERSONAS[persona]) { console.error("unknown persona " + persona + " (known: " + Object.keys(PERSONAS).join(", ") + ")"); process.exit(2); }
  const results = grade({
    persona,
    personaFixture: get("--persona-fixture"),
    only: get("--only") ? get("--only").split(",") : null,
    noParaphrases: args.includes("--no-paraphrases"),
  });
  const outJson = get("--out-json");
  if (outJson) fs.writeFileSync(outJson, JSON.stringify(results, null, 2) + "\n");
  const docPath = get("--write-doc");
  if (docPath) {
    let sha = "unknown";
    try { sha = require("child_process").execFileSync("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); } catch (e) {}
    writeDoc(results, docPath, sha);
  }
  console.log(JSON.stringify({
    persona: results.persona, scenarios_run: results.scenarios_run,
    canonical: results.canonical, zero_counters: results.zero_counters,
    paraphrase: results.paraphrase ? { sample_scenarios: results.paraphrase.sample_scenarios, variants: results.paraphrase.variants, consistent: results.paraphrase.consistent, consistency_pct: results.paraphrase.consistency_pct, nonfallback_consistent: results.paraphrase.nonfallback_consistent, nonfallback_canonical_variants: results.paraphrase.nonfallback_canonical_variants, variant_correct_tool: results.paraphrase.variant_correct_tool } : null,
    gates_gate2: results.gates_gate2,
  }, null, 2));
}
if (require.main === module) main();
module.exports = { deriveExpectations, paraphrases, stratifiedSample, isCorrect, observedTool, PERSONAS, RC7, DIDNT_CATCH_RE, HONEST_UNAVAILABLE_RE, EXPECTATIONS_PATH };
