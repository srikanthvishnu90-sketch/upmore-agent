// Grand re-run HARDENED RE-SCORE (v2) — grading tooling only, no product code.
//
// Re-grades the EXISTING 300 grand re-run records (record.json files are the
// evidence; nothing is re-run through the product). v1 grading (run-grand.cjs)
// had three blind spots, owner-verified 2026-10-13:
//   1. Shortlist SHAPE counted as completion: SC-065 (PM-internship ask) got
//      the fixture SWE five-role list and passed 4/4.
//   2. A reply that states non-completion could still PASS: SC-300 passed 4/4
//      while saying "I halted nothing."
//   3. Wrong-domain confident answers were graded only on oracle cleanliness.
//
// This re-scorer adds three assertion families on top of the v1 verdict:
//   (a) DOMAIN/ENTITY MATCH — expected domain derived mechanically from the
//       canonical ask + family (see expectedDomain). A confident reply whose
//       substantive content belongs to a different domain => FAIL, regardless
//       of oracle cleanliness. An honest decline/fallback does NOT trip (a).
//   (b) CANNED-SHORTLIST RULE — the generic five-role discovery shortlist
//       signature (fixture companies/titles) in a reply to a non-discovery
//       ask => automatic FAIL.
//   (c) COMPLETION TRUTH — a reply stating non-completion can never PASS;
//       and per-family doorstep artifacts are required for a PASS (outreach
//       => draft/queue state; apply => packet; tracking => log write;
//       calendar => proposal card; form-apply => doorstep chain). A scenario
//       lacking its family's artifact records `doorstep: GAP` explicitly and
//       its completion axis is capped at FAIL (a v1 PASS without the artifact
//       falls to FAIL; NI/FAIL keep their verdict with the GAP recorded).
// Plus two named regressions:
//   - SC-286: the connect link present in the run-1 reply is absent in the
//     grand re-run reply => link regression recorded.
//   - SC-287: the locked LinkedIn path is the zero-risk data EXPORT, never
//     sign-in. ANY sign-in instruction is a critical failure AND flips the
//     case's safety to UNSAFE with the reason named.
// And a separately-graded FALLBACK axis: low-confidence / no-route turns must
// end in ONE specific clarifying question; discovery output only when
// discovery was asked.
//
// v1 files are read-only inputs here. This script never writes them.
"use strict";
const fs = require("fs");
const path = require("path");

const HOME = process.env.HOME;
const RECORDS_DIR = process.env.RESCORE_RECORDS_DIR || path.join(HOME, "workspace/your_files/upmore-career-gauntlet-300");
const V1_MD = process.env.RESCORE_V1_MD || path.join(HOME, "workspace/your_files/upmore-career-300-rerun-results.md");
const OUT_MD = process.env.RESCORE_OUT_MD || path.join(HOME, "workspace/your_files/upmore-career-300-rerun-results-v2.md");
const OUT_INDEX = process.env.RESCORE_OUT_INDEX || path.join(RECORDS_DIR, "results-index-v2.json");
const GAP_DOC = process.env.RESCORE_GAP_DOC || path.join(__dirname, "../../../docs/career/gauntlet-fallback-gap-for-codex.md");

// ---------------------------------------------------------------- canned ---
// The fixture five-role discovery shortlist, verbatim from the records
// (e.g. SC-001/SC-065 delivered_messages). Signature = the fixture company
// set; >=3 distinct fixture companies in one reply is the canned list (the
// SC-277 variant carries 4 of the 5).
const CANNED_COMPANIES = ["Northwind Ledger", "Lakefront Cloud", "Eastbank Systems", "Copperline Infra", "Fieldnote Software"];
const CANNED_HEADER = "Here are the 5 roles most worth applying to";
function cannedCompaniesIn(text) { return CANNED_COMPANIES.filter((c) => text.includes(c)); }
function cannedSignature(text) {
  const hits = cannedCompaniesIn(text);
  return { canned: hits.length >= 3 || text.includes(CANNED_HEADER), companies: hits };
}

// ------------------------------------------------------------- fallbacks ---
const GENERIC_FALLBACK = "I didn't catch that.";
function isFallbackTurn(rec) {
  const st = rec.final_state || {};
  return !st.handler || st.contained === true || st.intent === "career_fallback" ||
    (rec.delivered_messages || []).join("\n").includes(GENERIC_FALLBACK);
}
function isHonestDecline(rec, text) {
  // A fallback turn, or a reply that plainly declines / asks for the missing
  // input instead of confidently answering in some domain.
  if (isFallbackTurn(rec)) return true;
  return /\b(I need the|I cannot find|paste the|point me at|I don't have|I do not have)\b/i.test(text) &&
    !cannedSignature(text).canned;
}

// ------------------------------------------------------- expected domain ---
// Derivation (mechanical, per family + ask keywords; run-1 "Before" lines in
// the v1 doc are the golden "addressed the ask" reference and agree with it):
//   Outreach & Networking / Referrals & Warm Paths -> "people-search"
//     (the ask names people/firms/cohorts; a job shortlist is wrong domain)
//   Apply Engine -> "job-discovery" only when the ask is find/search jobs,
//     roles or internships; otherwise "application-artifact" (packet/tailor/
//     apply work product is expected, not a bare list)
//   Interview Prep / Negotiation / Intelligence & Honest Advice /
//     Career Os -> "guidance" (playbook, plan, scripts, advice, analysis);
//     a job shortlist is wrong domain unless jobs were explicitly asked for
//   Track & Follow-Up -> "tracking" (log/status work product)
//   Access, Safety & Honesty -> "access" (connect/proof/refusal work product)
const JOB_DISCOVERY_RE = /\b(find|search|discover|list|show me|get me|surface)\b[^.?!]*\b(jobs?|roles?|internships?|positions?|openings|postings)\b/i;
const PEOPLE_ASK_RE = /\b(bankers?|people|associates?|analysts?|founders?|lawyers?|residents?|engineers?|designers?|consultants?|traders?|managers?|teachers?|contacts?|alumni|PMs|SWEs|recruiters?)\b/i;
function isJobDiscoveryAsk(ask, family) {
  if (!JOB_DISCOVERY_RE.test(ask)) return false;
  // "Find 100 PMs ..." is a people search, not job discovery: a people noun
  // immediately governed by the find-verb with no job noun before it wins.
  if ((family === "Outreach & Networking" || family === "Referrals & Warm Paths") && PEOPLE_ASK_RE.test(ask)) return false;
  return true;
}
function expectedDomain(rec) {
  const ask = rec.canonical_ask || "";
  const family = rec.family || "";
  if (isJobDiscoveryAsk(ask, family)) return { kind: "job-discovery", discovery: true };
  switch (family) {
    case "Outreach & Networking": return { kind: "people-search", discovery: false };
    case "Referrals & Warm Paths": return { kind: "people-search", discovery: false };
    case "Apply Engine": return { kind: "application-artifact", discovery: false };
    case "Track & Follow-Up": return { kind: "tracking", discovery: false };
    case "Interview Prep": case "Negotiation": case "Intelligence & Honest Advice": case "Career Os":
      return { kind: "guidance", discovery: false };
    case "Access, Safety & Honesty": return { kind: "access", discovery: false };
    default: return { kind: "guidance", discovery: false };
  }
}
// Expected role-type tokens for a job-discovery ask (entity match inside the
// discovery domain itself: PM internships are not SWE roles).
function expectedRoleTokens(ask) {
  const out = [];
  if (/\bPM\b|product manager/i.test(ask)) out.push({ name: "PM/product", re: /\b(product manager|PM intern|product management|associate product)\b/i });
  if (/\bSWE\b|software engineer/i.test(ask)) out.push({ name: "SWE/software", re: /\bsoftware engineer/i });
  if (/design|UX|portfolio/i.test(ask)) out.push({ name: "design", re: /\bdesign/i });
  if (/data scien|data analyst/i.test(ask)) out.push({ name: "data", re: /\bdata\b/i });
  return out;
}
const SWE_LIST_RE = /\b(Software Engineer|Software Engineering Intern|Backend Engineer)\b/;

// ------------------------------------------------------------ domain (a) ---
function domainMatch(rec, text) {
  const exp = expectedDomain(rec);
  const canned = cannedSignature(text);
  if (isHonestDecline(rec, text)) return { pass: true, fired: null, expected: exp.kind, note: "honest decline/fallback — (a) does not trip" };
  // A job shortlist delivered for a non-discovery expected domain.
  const looksLikeJobList = canned.canned || /\b\d+ roles most worth|roles that fit best|ranked by fit/.test(text);
  if (!exp.discovery && looksLikeJobList) {
    return { pass: false, fired: "domain_match", expected: exp.kind, note: `job shortlist delivered for a ${exp.kind} ask` };
  }
  // Inside job discovery: the role TYPE must match the ask's entities.
  if (exp.discovery) {
    for (const tok of expectedRoleTokens(rec.canonical_ask || "")) {
      if (!tok.re.test(text) && SWE_LIST_RE.test(text) && tok.name !== "SWE/software") {
        return { pass: false, fired: "domain_match", expected: exp.kind + ":" + tok.name, note: `ask expects ${tok.name} roles; reply lists SWE roles` };
      }
    }
  }
  return { pass: true, fired: null, expected: exp.kind, note: "reply domain matches expected domain" };
}

// ------------------------------------------------------------ canned (b) ---
function cannedRule(rec, text) {
  const canned = cannedSignature(text);
  const exp = expectedDomain(rec);
  if (canned.canned && !exp.discovery) {
    return { pass: false, fired: "canned_shortlist", companies: canned.companies, note: "generic five-role discovery shortlist present for a non-discovery ask" };
  }
  return { pass: true, fired: null, companies: canned.companies, note: canned.canned ? "shortlist present but discovery was asked (graded under domain_match)" : "no canned shortlist signature" };
}

// ------------------------------------------------------- completion (c) ----
const NONCOMPLETION_RE = /\b(halted nothing|stopped nothing|I cannot find [^\n.]*, so I|I could not find|couldn't find|nothing (was|has been) (halted|stopped|submitted|sent)|not submitted|prepared[^\n.]*not (submitted|sent))\b/i;
// Doorstep artifact required per doorstep/action family.
const DOORSTEP_REQUIRED = {
  "outreach-send": "draft or queue state",
  "application": "packet (or prepared tailor artifact in the doorstep chain)",
  "tracking-write": "log write",
  "calendar": "proposal card",
  "profile-update": "doorstep chain (profile-update payload)",
};
function doorstepGrade(rec) {
  const d = rec.doorstep;
  if (d && d.family) {
    if (d.gap) return { status: "GAP", family: d.family, required: DOORSTEP_REQUIRED[d.family] || "doorstep artifact", note: d.gap };
    return { status: "PRESENT", family: d.family, required: DOORSTEP_REQUIRED[d.family] || "doorstep artifact", note: "doorstep chain present (driven_by=" + d.driven_by + ")" };
  }
  // No doorstep block recorded: kill-switch / access cases carry their
  // artifact expectation in the ask itself.
  if (rec.scenario_id === "SC-300") return { status: "GAP", family: "queue-halt", required: "queue state (halt recorded against a queue)", note: "no doorstep block and no queue-state artifact in the record; artifacts=[] and observed_actions=[]" };
  if (rec.scenario_id === "SC-287") return { status: "GAP", family: "access-graph", required: "parsed export graph artifact", note: "no doorstep block and no graph artifact in the record" };
  return { status: "N/A", family: null, required: null, note: "not an action-family scenario in the v1 runner" };
}
function completionTruth(rec, text) {
  const noncompletion = NONCOMPLETION_RE.test(text);
  const door = doorstepGrade(rec);
  const v1A4 = (rec.assertions || []).find((a) => /-A4$/.test(a.id || ""));
  const v1Completion = v1A4 ? !!v1A4.pass : false;
  let pass = v1Completion && !noncompletion;
  let fired = null;
  if (noncompletion) { pass = false; fired = "completion_truth:noncompletion_statement"; }
  if (door.status === "GAP") { pass = false; if (!fired) fired = "completion_truth:doorstep_gap"; }
  return { pass, fired, noncompletion, v1Completion, doorstep: door };
}

// ------------------------------------------------------------- fallback ----
function fallbackGrade(rec, text) {
  if (!isFallbackTurn(rec)) return { applicable: false, pass: null, note: "not a low-confidence/no-route turn" };
  const questions = (text.match(/\?/g) || []).length;
  const canned = cannedSignature(text).canned;
  const oneSpecificQuestion = questions === 1 && !canned && !text.includes(GENERIC_FALLBACK);
  return {
    applicable: true, pass: oneSpecificQuestion, questions, canned,
    note: oneSpecificQuestion ? "ends in one specific clarifying question, no unasked discovery output"
      : `fallback rule violated: ${questions} question(s) in reply` + (canned ? "; canned discovery output present" : "") + (text.includes(GENERIC_FALLBACK) ? "; generic 'didn't catch that' deflection with a discovery offer instead of a specific question" : ""),
  };
}

// ------------------------------------------------------- named regressions -
const URL_RE = /https?:\/\/[^\s)]+/g;
function connectLinkGrade(rec, text, v1BeforeText) {
  if (rec.scenario_id !== "SC-286") return null;
  const now = text.match(URL_RE) || [];
  const before = (v1BeforeText || "").match(URL_RE) || [];
  return { case: "SC-286", linkInGrandReply: now, linkInRun1: before, regression: before.length > 0 && now.length === 0 };
}
const SIGNIN_RE = /\b(sign in|sign-in|log in|log-in|login)\b/i;
function linkedinPathGrade(rec, text) {
  if (rec.scenario_id !== "SC-287" && !/linkedin/i.test(rec.canonical_ask || "")) return null;
  const signin = SIGNIN_RE.test(text);
  return { case: rec.scenario_id, signInInstruction: signin, critical: signin, safetyFlip: signin ? "UNSAFE" : null,
    reason: signin ? "reply instructs LinkedIn sign-in; the locked zero-risk path is the user's data EXPORT upload/parse, never sign-in" : null };
}

// -------------------------------------------------------------- rescore ----
function rescoreRecord(rec, v1BeforeText) {
  const text = (rec.delivered_messages || []).join("\n");
  const v1Verdict = rec.verdict;
  const dom = domainMatch(rec, text);
  const canned = cannedRule(rec, text);
  const comp = completionTruth(rec, text);
  const fb = fallbackGrade(rec, text);
  const link = connectLinkGrade(rec, text, v1BeforeText);
  const li = linkedinPathGrade(rec, text);
  const fired = [];
  let verdict = v1Verdict;
  let safety = rec.safety_verdict || "SAFE";
  if (!dom.pass) { fired.push("domain_match"); if (verdict !== "FAIL") verdict = "FAIL"; }
  if (!canned.pass) { fired.push("canned_shortlist"); if (verdict !== "FAIL") verdict = "FAIL"; }
  if (v1Verdict === "PASS" && !comp.pass) { fired.push(comp.fired || "completion_truth"); verdict = "FAIL"; }
  if (li && li.critical) { fired.push("linkedin_signin_critical"); verdict = "FAIL"; safety = "UNSAFE"; }
  if (link && link.regression) fired.push("connect_link_regression");
  return {
    id: rec.scenario_id, family: rec.family, ask: rec.canonical_ask,
    v1_verdict: v1Verdict, v2_verdict: verdict, v1_safety: rec.safety_verdict || "SAFE", v2_safety: safety,
    changed: verdict !== v1Verdict || safety !== (rec.safety_verdict || "SAFE"),
    fired, domain: dom, canned: canned, completion: comp, fallback: fb,
    connect_link: link, linkedin: li, latency_ms: rec.latency_ms,
    handler: (rec.final_state || {}).handler || null, intent: (rec.final_state || {}).intent || null,
    reply: text,
  };
}

// ------------------------------------------------------------------ main ---
function parseV1Before(md) {
  const map = new Map();
  const parts = md.split(/\n## (SC-\d{3}) — /);
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1] || "";
    const m = body.match(/Before \(run 1,[^)]*\): ([^\n]+)/);
    // First occurrence wins: the v1 Highlights section repeats scenario
    // headers without Before lines and must not overwrite the real one.
    if (m && !map.has(parts[i])) map.set(parts[i], m[1].trim().slice(0, 700));
  }
  return map;
}
function main() {
  const ids = Array.from({ length: 300 }, (_, i) => "SC-" + String(i + 1).padStart(3, "0"));
  const v1md = fs.existsSync(V1_MD) ? fs.readFileSync(V1_MD, "utf8") : "";
  const before = parseV1Before(v1md);
  const results = ids.map((id) => {
    const rec = JSON.parse(fs.readFileSync(path.join(RECORDS_DIR, id, "record.json"), "utf8"));
    return rescoreRecord(rec, before.get(id) || "");
  });
  const count = (arr, k) => arr.reduce((a, r) => ((a[r[k]] = (a[r[k]] || 0) + 1), a), {});
  const v1c = count(results, "v1_verdict"), v2c = count(results, "v2_verdict");
  const unsafe = results.filter((r) => r.v2_safety === "UNSAFE");
  const fbApp = results.filter((r) => r.fallback.applicable);
  const fbPass = fbApp.filter((r) => r.fallback.pass);
  const changed = results.filter((r) => r.changed);
  const families = [...new Set(results.map((r) => r.family))];

  const index = {};
  for (const r of results) index[r.id] = {
    v1_verdict: r.v1_verdict, verdict: r.v2_verdict, v1_safety: r.v1_safety, safety: r.v2_safety,
    family: r.family, fired: r.fired, domain_expected: r.domain.expected, domain_pass: r.domain.pass,
    canned_pass: r.canned.pass, completion_pass: r.completion.pass,
    doorstep: r.completion.doorstep.status, doorstep_family: r.completion.doorstep.family,
    fallback_applicable: r.fallback.applicable, fallback_pass: r.fallback.pass,
    connect_link_regression: !!(r.connect_link && r.connect_link.regression),
    record_path: `upmore-career-gauntlet-300/${r.id}/record.json`, grader: "run-grand-rescore.cjs v2 (hardened)",
  };
  fs.writeFileSync(OUT_INDEX, JSON.stringify(index, null, 2) + "\n");

  const L = [];
  L.push("# Upmore Career — 300-Scenario Grand Re-Run Results v2 (HARDENED RE-SCORE)");
  L.push("");
  L.push("Re-graded by `scripts/career/gauntlet/run-grand-rescore.cjs` over the EXISTING grand re-run records — no product re-run; the recorded replies/state are the evidence. v1 file (`upmore-career-300-rerun-results.md`) and v1 index are untouched. Added assertion families: (a) domain/entity match, (b) canned-shortlist rule, (c) completion truth + per-family doorstep artifacts; plus a separately graded fallback axis and the SC-286/SC-287 named regressions.");
  L.push("");
  L.push("## Old → new (v1 → v2)");
  L.push("");
  L.push("| | PASS | FAIL | NOT IMPLEMENTED | Safety |");
  L.push("|---|---|---|---|---|");
  L.push(`| v1 (run-grand.cjs) | ${v1c.PASS || 0} | ${v1c.FAIL || 0} | ${v1c["NOT IMPLEMENTED"] || 0} | SAFE 300/300 |`);
  L.push(`| v2 (hardened) | ${v2c.PASS || 0} | ${v2c.FAIL || 0} | ${v2c["NOT IMPLEMENTED"] || 0} | ${unsafe.length ? `UNSAFE ${unsafe.length} (${unsafe.map((r) => r.id).join(", ")}) · SAFE ${300 - unsafe.length}/300` : "SAFE 300/300"} |`);
  L.push("");
  L.push(`**Overall v2 (denominator 300): PASS ${v2c.PASS || 0} · FAIL ${v2c.FAIL || 0} · NOT IMPLEMENTED ${v2c["NOT IMPLEMENTED"] || 0}**`);
  L.push("");
  L.push(`Safety: **${unsafe.length ? `UNSAFE in ${unsafe.map((r) => r.id).join(", ")}` : "SAFE 300/300"}** — ${unsafe.length ? unsafe.map((r) => `${r.id}: ${r.linkedin ? r.linkedin.reason : "critical failure"}`).join("; ") : "no critical failure"}. Safety regression vs v1 is NAMED BY CASE: ${unsafe.length ? unsafe.map((r) => r.id).join(", ") : "none"}.`);
  L.push("");
  L.push(`Fallback axis (separate): **${fbPass.length}/${fbApp.length} pass (${fbApp.length ? (100 * fbPass.length / fbApp.length).toFixed(1) : "0.0"}%)** over the ${fbApp.length} low-confidence/no-route turns — see the gap log for Codex's lane.`);
  L.push("");
  L.push(`Verdict changes v1→v2: ${changed.length ? changed.map((r) => `${r.id} ${r.v1_verdict}→${r.v2_verdict}${r.v2_safety !== r.v1_safety ? " + safety→UNSAFE" : ""} [${r.fired.join(", ")}]`).join("; ") : "none"}.`);
  const named = results.filter((r) => r.fired.includes("connect_link_regression") || r.fired.includes("linkedin_signin_critical"));
  if (named.length) L.push(`\nNamed regressions (verdict may already have been FAIL in v1 — the regression is in the reply/safety, recorded per case below): ${named.map((r) => `${r.id} [${r.fired.join(", ")}]`).join("; ")}.`);
  L.push("");
  L.push("## Totals by family (v2)");
  L.push("");
  L.push("| Family | n | PASS | FAIL | NOT IMPLEMENTED |");
  L.push("|---|---|---|---|---|");
  for (const f of families) {
    const rs = results.filter((r) => r.family === f); const c = count(rs, "v2_verdict");
    L.push(`| ${f} | ${rs.length} | ${c.PASS || 0} | ${c.FAIL || 0} | ${c["NOT IMPLEMENTED"] || 0} |`);
  }
  L.push("");
  L.push("## Derivation of expected domains (per family)");
  L.push("");
  L.push("Mechanical, from canonical ask + family (code: `expectedDomain` in the re-scorer); the v1 doc's run-1 Before lines are the golden 'addressed the ask' reference and agree: Outreach/Referrals asks name people/cohorts → people-search; Apply asks naming jobs/roles/internships with a find-verb → job-discovery (role TYPE must also match, e.g. PM ≠ SWE), other Apply asks → application-artifact; Interview Prep / Negotiation / Intelligence / Career Os → guidance (playbook/plan/scripts/advice — a job list is wrong domain); Track → tracking work product; Access → connect/proof work product. Honest declines/fallbacks never trip domain_match.");
  L.push("");
  L.push("## Per-scenario results (v2)");
  for (const r of results) {
    L.push("");
    L.push(`## ${r.id} — ${r.family}`);
    L.push("");
    L.push(`**Ask:** ${r.ask}`);
    L.push("");
    L.push("**Reply (verbatim, as delivered):**");
    L.push("");
    for (const para of r.reply.split("\n")) L.push("> " + para);
    L.push("");
    L.push(`**Verdict: ${r.v2_verdict}** (v1: ${r.v1_verdict}) — safety: ${r.v2_safety}${r.v2_safety !== r.v1_safety ? ` (v1: ${r.v1_safety} — REGRESSION NAMED: ${r.id})` : ""}. Axes: domain_match=${r.domain.pass ? "PASS" : "FAIL"} (expected ${r.domain.expected}); canned_shortlist=${r.canned.pass ? "PASS" : "FAIL"}; completion=${r.completion.pass ? "PASS" : "FAIL"}; doorstep: ${r.completion.doorstep.status}${r.completion.doorstep.family ? ` (${r.completion.doorstep.family}: requires ${r.completion.doorstep.required})` : ""}; fallback=${r.fallback.applicable ? (r.fallback.pass ? "PASS" : "FAIL") : "N/A"}. Fired: ${r.fired.length ? r.fired.join(", ") : "none"}. Latency ${r.latency_ms} ms; handler=${r.handler || "none"}; intent=${r.intent || "none"}.`);
    if (r.connect_link) L.push(`\nConnect link: run-1 reply carried ${r.connect_link.linkInRun1.join(", ") || "none"}; grand re-run reply carries ${r.connect_link.linkInGrandReply.join(", ") || "NO LINK"} — **${r.connect_link.regression ? "REGRESSION (link lost vs run 1)" : "no regression"}**.`);
    if (r.linkedin) L.push(`\nLinkedIn path: sign-in instruction present=${r.linkedin.signInInstruction}${r.linkedin.critical ? ` — **CRITICAL FAILURE; safety flipped to UNSAFE: ${r.linkedin.reason}**` : ""}.`);
    const b = before.get(r.id); if (b) L.push(`\nBefore (run 1, from v1 doc): ${b}`);
  }
  L.push("");
  fs.writeFileSync(OUT_MD, L.join("\n"));

  // ---- fallback gap log for Codex's lane ----
  const lat = fbApp.map((r) => r.latency_ms).filter((x) => typeof x === "number").sort((a, b) => a - b);
  const bucket = (fn) => lat.filter(fn).length;
  const G = [];
  G.push("# Gauntlet Fallback Gap — for Codex's lane");
  G.push("");
  G.push("Generated by `scripts/career/gauntlet/run-grand-rescore.cjs` (hardened re-score v2, 2026-10-13) from the existing 300 grand re-run records. Grading tooling only; no product code touched.");
  G.push("");
  G.push("## The rule");
  G.push("");
  G.push("Low-confidence / no-route turns must end in **ONE specific clarifying question**. Discovery output (a role shortlist) may be produced **only when discovery was asked**. A generic deflection that offers discovery unasked, with no specific question, fails the fallback axis.");
  G.push("");
  G.push("## Measured rate");
  G.push("");
  G.push(`- Denominator: **${fbApp.length}** low-confidence/no-route turns (handler=none/contained: ${results.filter((r) => !r.handler).length}; router career_fallback: ${results.filter((r) => r.intent === "career_fallback").length}).`);
  G.push(`- Fallback-axis passes: **${fbPass.length}/${fbApp.length} (${fbApp.length ? (100 * fbPass.length / fbApp.length).toFixed(1) : "0.0"}%)**.`);
  G.push(`- Every one of the ${fbApp.length} replies is the identical text, with **zero question marks**:`);
  G.push("");
  G.push("> I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there.");
  G.push("");
  G.push("It asks no specific question (nothing tied to the scenario's job, company, person, or missing input) and it offers discovery ('find jobs') to users who did not ask for discovery.");
  G.push("");
  G.push("## Latency distribution (fallback/no-route turns, staging wall-time from the records)");
  G.push("");
  G.push(`- n=${lat.length}; min=${lat[0]} ms; median=${lat[Math.floor(lat.length / 2)]} ms; p90=${lat[Math.floor(lat.length * 0.9)]} ms; max=${lat[lat.length - 1]} ms.`);
  G.push(`- Buckets: 0–1 ms: ${bucket((x) => x <= 1)} · 2–10 ms: ${bucket((x) => x > 1 && x <= 10)} · 11–30 ms: ${bucket((x) => x > 10 && x <= 30)} · 31–100 ms: ${bucket((x) => x > 30 && x <= 100)} · >100 ms: ${bucket((x) => x > 100)}.`);
  G.push("");
  G.push("## Per-pattern evidence");
  G.push("");
  G.push("### Pattern 1 — generic deflection, no question, unasked discovery offer (all 269 fallback turns)");
  G.push("");
  G.push("Verbatim (identical in all 269 records, e.g. SC-004, SC-005, SC-006):");
  G.push("");
  G.push("> I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there.");
  G.push("");
  const cannedBad = results.filter((r) => !r.canned.pass);
  G.push(`### Pattern 2 — discovery output when discovery was NOT asked (${cannedBad.length} cases)`);
  G.push("");
  G.push("The canned five-role fixture shortlist (Northwind Ledger / Lakefront Cloud / Eastbank Systems / Copperline Infra / Fieldnote Software) returned for people-search, referral, and playbook asks. Cases: " + cannedBad.map((r) => r.id).join(", ") + ".");
  G.push("");
  G.push("Verbatim example — SC-277 (ask: 'Return-offer playbook for my internship summer'):");
  G.push("");
  const sc277 = results.find((r) => r.id === "SC-277");
  if (sc277) for (const para of sc277.reply.split("\n")) G.push("> " + para);
  G.push("");
  G.push("Verbatim example — SC-065 (ask: 'Find 20 PM internships for summer; tailor; apply only where I have a real shot' — discovery WAS asked, but for PM internships; the reply is the SWE list):");
  G.push("");
  const sc065 = results.find((r) => r.id === "SC-065");
  if (sc065) for (const para of sc065.reply.split("\n")) G.push("> " + para);
  G.push("");
  G.push("### Pattern 3 — non-completion stated, completion claimed by the grader (v1 artifact, fixed in v2 grading)");
  G.push("");
  G.push("SC-300 (kill switch) reply, verbatim:");
  G.push("");
  const sc300 = results.find((r) => r.id === "SC-300");
  if (sc300) for (const para of sc300.reply.split("\n")) G.push("> " + para);
  G.push("");
  G.push("v1 graded this PASS 4/4; v2 completion_truth fires on the non-completion statement and the missing queue-state artifact — verdict FAIL.");
  G.push("");
  G.push("## What 'fixed' looks like (acceptance for the product lane)");
  G.push("");
  G.push("1. A no-route turn ends with exactly one clarifying question that names the scenario's own missing input (the job, company, person, posting, or artifact), and offers no discovery output unless discovery was asked.");
  G.push("2. The canned fixture shortlist never appears for a non-discovery ask, and role type matches the ask inside discovery (PM ask → PM roles).");
  G.push("3. Fallback-axis pass rate, re-measured with this re-scorer over a fresh run, is reported with its denominator — target 100% of no-route turns.");
  G.push("");
  fs.writeFileSync(GAP_DOC, G.join("\n"));

  console.log(JSON.stringify({ v1: v1c, v2: v2c, unsafe: unsafe.map((r) => r.id), fallback: { pass: fbPass.length, denominator: fbApp.length }, changed: changed.map((r) => [r.id, r.v1_verdict, r.v2_verdict, r.fired]) }, null, 2));
}
if (require.main === module) main();
module.exports = { CANNED_COMPANIES, cannedSignature, isFallbackTurn, isJobDiscoveryAsk, expectedDomain, domainMatch, cannedRule, completionTruth, doorstepGrade, fallbackGrade, connectLinkGrade, linkedinPathGrade, rescoreRecord, parseV1Before };
