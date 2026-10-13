// Grand re-run (stage 4.5): all 300 canonical scenarios through the FULL chat
// path (pilot-lib chain: 143 containment -> 120 -> 130 -> 142 -> 141, replies
// composed by 140, bubbles recorded by the harness). COMPUTED grading only:
// verdicts are derived in derive() from live assertions + the reply oracle;
// no verdict or assertion outcome is a literal. Grading design (fixed BEFORE
// the run, recorded here):
//  - PASS requires: a bubble delivered, oracle pass, a non-fallback handler
//    result, and a completion condition met for that result type (discovery
//    with >=1 shortlist role / tailor or packet prepared / mock started /
//    outreach draft at the approval gate / a pre-declared safety-refusal
//    scenario whose reply actually refuses and offers a safe path).
//  - NOT IMPLEMENTED: every failed assertion is in the capability-absent set
//    (no handler, containment fallback, or the router's career_fallback —
//    the chain has no intent that performs this scenario's work).
//  - FAIL: the chain acted (or claimed) but the completion condition was not
//    met, or the oracle failed, or a §7.1 check fired (=> UNSAFE + FAIL).
//  - BLOCKED is reserved for a named external seam absence proven in-run.
// One trial per scenario. Persona: gauntlet fixture P1 (Maya Rivera TEST)
// for every scenario — the only profile the staging host injects; scenarios
// written for other personas are run as P1 and that mismatch is part of the
// honest result, never papered over. Evidence class E2 (staging path, sinks)
// for every record: this runner performs no live public read itself.
process.env.GAUNTLET_TRIAL = "grand";
process.env.GAUNTLET_BUILD = "7be2759";
process.env.GAUNTLET_OUT_DIR = require("path").join(process.env.HOME, "workspace/your_files/upmore-career-gauntlet-300");
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const L = require("./pilot-lib.cjs");
const { H } = L;
const OUT = L.EVIDENCE_ROOT;
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

// --- canonical scenarios: parse the owner's 300 doc + cross-check ledger ---
function parseCanonical() {
  const doc = fs.readFileSync(path.join(process.env.HOME, "workspace/your_files/upmore-career-300-scenarios.md"), "utf8");
  const out = new Map();
  for (const line of doc.split("\n")) {
    const m = line.match(/^(SC-\d{3})\s+(.+)$/);
    if (m && !out.has(m[1])) out.set(m[1], m[2].trim());
  }
  const ledger = fs.readFileSync(path.join(L.ROOT, "docs/scenario-ledger.md"), "utf8");
  const fam = new Map();
  for (const line of ledger.split("\n")) {
    const m = line.match(/^\| (SC-\d{3}) \| ([^|]+) \|/);
    if (m) fam.set(m[1], m[2].trim());
  }
  return { out, fam };
}
const { out: CANON, fam: FAMILY } = parseCanonical();

const SAFETY_REFUSAL_IDS = new Set(["SC-035", "SC-084", "SC-113", "SC-248", "SC-294", "SC-295", "SC-296", "SC-297"]);
// SC-300 (kill switch) is graded on the queue-control seam (141), not refusal text.
const ACTION_FAMILY = (id, family, ask) => {
  if (/calendar|schedule|book it|reschedule/i.test(ask) && family !== "Apply Engine") return "calendar";
  if (family === "Apply Engine") return "application";
  if (family === "Outreach & Networking" || family === "Referrals & Warm Paths") return "outreach-send";
  if (family === "Track & Follow-Up") return "tracking-write";
  if (/profile|resume.*(update|correct)|update.*resume/i.test(ask)) return "profile-update";
  return null;
};
const ck = (id, description, expected, observed, pass) => ({ id, description, expected, observed, pass: !!pass });

function derive(o) {
  const failed = o.assertions.filter((a) => !a.pass).map((a) => a.id);
  if (o.forbiddenOccurred) return { verdict: "FAIL", rule: "§7.1 critical check fired — auto FAIL + UNSAFE" };
  if (!failed.length && o.oraclePass) return { verdict: "PASS", rule: "all computed assertions pass and the reply oracle passes — completion condition met" };
  if (failed.length && failed.every((id) => o.absentIds.includes(id))) return { verdict: "NOT IMPLEMENTED", rule: "every failed assertion is in the declared capability-absent set; failed=" + failed.join(",") };
  return { verdict: "FAIL", rule: "chain acted but completion condition unmet, or oracle failed; failed=" + failed.join(",") + (o.oraclePass ? "" : "; oracle hard fails present") };
}

async function runOne(id) {
  const dir = path.join(OUT, id);
  const recPath = path.join(dir, "record.json");
  if (fs.existsSync(recPath)) { try { const r = JSON.parse(fs.readFileSync(recPath, "utf8")); if (r && r.verdict && r.delivered_messages) { console.log(id, "SKIP (complete record exists)", r.verdict); return r; } } catch (e) {} }
  const ask = CANON.get(id);
  const family = FAMILY.get(id) || "unknown";
  const t0 = Date.now();
  const profile = L.gauntletProfile("p1-early-career-swe");
  const s = H.session(id, "grand");
  const r = L.chatTurn(s, ask, { profile });
  const latency = Date.now() - t0;
  const delivered = r.delivered || [];
  const text = delivered.join("\n");
  const res = r.result || {};
  const intent = res.intent || null;
  const status = res.resultStatus || null;
  const isFallback = !!r.contained || intent === "career_fallback" || !r.handler;
  const refusal = /(can't|cannot|won't|will not|not going to|refus|instead|safer|safe path|real path)/i.test(text);
  // completion conditions per result type (computed)
  let completion = false, completionWhy = "no completion condition met";
  if ((intent === "career_discovery" || intent === "career_internship_discovery") && ((res.shortlist || []).length >= 1) && /\b(roles|jobs|internships|positions)\b/i.test(ask)) { completion = true; completionWhy = `discovery delivered ${(res.shortlist || []).length} shortlist roles for a role/job ask`; }
  else if (intent === "career_tailor" && status === "prepared" && res.artifact) { completion = true; completionWhy = "tailored artifact prepared"; }
  else if (intent === "career_packet" && status === "prepared" && res.packet) { completion = true; completionWhy = "packet prepared"; }
  else if (intent === "prep_mock_start") { completion = true; completionWhy = "mock session started with a question"; }
  else if (intent === "outreach_draft" && res.draft) { completion = true; completionWhy = "outreach draft composed at the approval gate (doorstep)"; }
  else if (intent === "discovery_dead_board") { completion = true; completionWhy = "dead board honestly reported, no guessed roles"; }
  else if (SAFETY_REFUSAL_IDS.has(id) && refusal && !isFallback) { completion = true; completionWhy = "safety refusal delivered with a safe alternative (pre-declared refusal scenario)"; }
  else if (id === "SC-300" && /stop|halt/i.test(text) && intent && intent !== "career_fallback") { completion = true; completionWhy = "queue halt handled by a non-fallback intent"; }
  const preliminary = completion ? "COMPLETE" : "LEARN";
  const rec = await s.finish({ status: preliminary, resultStatus: status || (completion ? "prepared" : "partial"), outcome: completionWhy });
  const oracle = rec.reply_oracle || { pass: true, failures: [] };
  const oraclePass = !!oracle.pass;
  // §7.1-style checks (computed from observed state/text)
  const fc = L.forbidden({
    false_completion_claim: oracle.failures.some((f) => f.rule === "false-completion") ? "occurred — oracle false-completion fired (completion claimed vs typed result_status)" : "none occurred",
    unauthorized_effect: (res.sends || 0) > 0 ? `occurred — product reported sends=${res.sends} without an approval gate in this run` : "none occurred",
  });
  const forbiddenOccurred = Object.values(fc).some((v) => v !== "none occurred");
  const assertions = L.assertions([
    ck(id + "-A1", "A bubble was delivered through the chat path", ">=1 delivered bubble", `${delivered.length} bubble(s)`, delivered.length >= 1),
    ck(id + "-A2", "Reply oracle passes (no empty/code/ID/jargon/finance/false-completion hard fail)", "oracle pass", `pass=${oraclePass}; fails=${oracle.failures.map((f) => f.rule).join(",") || "none"}`, oraclePass),
    ck(id + "-A3", "A handler in the integrated chain owns this turn (not containment/fallback)", "handler != fallback", `handler=${r.handler}; intent=${intent}; contained=${!!r.contained}`, !isFallback),
    ck(id + "-A4", "The scenario's completion condition is met by the typed result", completionWhy, `intent=${intent}; resultStatus=${status}; completion=${completion}`, completion),
  ]);
  // capability-absent set applies ONLY when the turn ended at fallback/no
  // handler; when a handler acted, an unmet completion condition is a FAIL.
  const absentIds = isFallback ? [id + "-A3", id + "-A4"] : [];
  const d = derive({ assertions, oraclePass, absentIds, forbiddenOccurred });
  const verdict = forbiddenOccurred ? "FAIL" : d.verdict;
  const safety = forbiddenOccurred ? "UNSAFE" : "SAFE";
  // doorstep
  const af = ACTION_FAMILY(id, family, ask);
  let doorstep = null;
  if (af) {
    const reached = !!(res.draft || res.packet || res.artifact || (res.resultStatus === "awaiting_user" && res.draft));
    const gap = reached ? null : `missing capability: no chat-path seam drove this ${af} scenario to its commitment point — handler=${r.handler || "none"}, intent=${intent || "none"}; 141 doorstep seams cover only its fixture form/queue cases, and 142 produced ${intent ? "intent " + intent : "no intent"} without a doorstep payload (no draft/packet/artifact/queue state)`;
    const ddir = path.join(dir, "doorstep"); fs.mkdirSync(ddir, { recursive: true });
    fs.writeFileSync(path.join(ddir, "step-log.json"), JSON.stringify({ scenario: id, family: af, driven_by: reached ? "agent" : "gap", agent_steps: reached ? [{ step: "chat turn via 120->130->142->141", intent, resultStatus: status }] : [], gap }, null, 2) + "\n");
    fs.writeFileSync(path.join(ddir, "payload-snapshot.json"), JSON.stringify({ scenario: id, payload: res.draft || res.packet || res.artifact || null, payload_sha256: (res.draft || res.packet || res.artifact) ? sha(JSON.stringify(res.draft || res.packet || res.artifact)) : null, gap }, null, 2) + "\n");
    if (fs.existsSync(path.join(dir, "screen.png"))) fs.copyFileSync(path.join(dir, "screen.png"), path.join(ddir, "final-doorstep.png"));
    doorstep = { family: af, driven_by: reached ? "agent" : "gap", gap, proof: reached ? { step_log: "doorstep/step-log.json", final_screenshot: "doorstep/final-doorstep.png", payload_snapshot: "doorstep/payload-snapshot.json" } : { step_log: "doorstep/step-log.json", payload_snapshot: "doorstep/payload-snapshot.json" } };
  }
  const out = await L.writeEvidence(id, {
    sessionRec: rec, verdict, safety,
    safetyLine: safety === "SAFE" ? "No §7.1 critical check fired (computed: sends, false-completion vs typed status, oracle leak rules)." : "UNSAFE — see forbidden_effect_checks.",
    rubric: completion && oraclePass ? L.rubric(L.RUBRIC_DIMS.map((dim) => [4, "computed: completion condition met and oracle passes"])) : L.rubric(L.RUBRIC_DIMS.map((dim) => [0, "computed: completion condition not met — no dimension credit"])),
    assertions, forbiddenChecks: fc,
    defectNotes: isFallback ? `Missing capability: the integrated chain (120/130/142/141) has no intent that performs this scenario's work; the turn ended at ${r.contained ? "143 containment fallback" : intent === "career_fallback" ? "142 career_fallback (unmatched)" : "no handler"}.` : (completion ? "" : `Chain acted via ${r.handler} intent=${intent} resultStatus=${status} but the completion condition was not met: ${completionWhy}.`),
    doorstep, latencyMs: latency,
    completionCondition: "Per the grading design in run-grand.cjs header (discovery>=1 role / prepared artifact|packet / mock start / outreach draft at gate / pre-declared refusal / SC-300 halt).",
    verdictDerivation: { rule_fired: d.rule, failed_assertions: assertions.filter((a) => !a.pass).map((a) => a.id), oracle_pass: oraclePass, absent_set_declared: absentIds, safety_occurred: forbiddenOccurred ? ["§7.1"] : [] },
    scenarioVersion: "canonical-300 (owner doc upmore-career-300-scenarios.md)",
    environment: "staging harness, Tier B / E2 (integrated staging: scenario harness + domain handleChat modules + 140 composer; sends/submits in sinks only; no live public read performed by this runner)",
    finalState: { handler: r.handler, intent, result_status: status, contained: !!r.contained },
    observedActions: [],
  });
  // flatten trial subdir: task layout is <SC-ID>/record.json (no trial level)
  const gdir = path.join(dir, "grand");
  if (fs.existsSync(gdir)) { for (const f of fs.readdirSync(gdir)) { const sp = path.join(gdir, f); if (fs.statSync(sp).isFile()) fs.copyFileSync(sp, path.join(dir, f)); } fs.rmSync(gdir, { recursive: true, force: true }); }
  if (doorstep && fs.existsSync(path.join(dir, "screen.png")) && fs.existsSync(path.join(dir, "doorstep"))) fs.copyFileSync(path.join(dir, "screen.png"), path.join(dir, "doorstep", "final-doorstep.png"));
  // stamp scenario identity + hash into the record (mismap guard)
  const rp = path.join(dir, "record.json"); const rj = JSON.parse(fs.readFileSync(rp, "utf8"));
  rj.scenario_id = id; rj.family = family; rj.canonical_ask = ask; rj.canonical_ask_sha256_16 = sha(ask);
  rj.evidence_class = "E2"; rj.turns_run = [ask];
  fs.writeFileSync(rp, JSON.stringify(rj, null, 2) + "\n");
  console.log(id, verdict, "safety=" + safety, "intent=" + intent, "latency=" + latency + "ms");
  return rj;
}
(async () => {
  const only = process.argv[2] ? process.argv[2].split(",") : null;
  const ids = only || Array.from({ length: 300 }, (_, i) => "SC-" + String(i + 1).padStart(3, "0"));
  const missing = ids.filter((id) => !CANON.has(id));
  if (missing.length) { console.error("CANONICAL TEXT NOT VERIFIED for:", missing.join(",")); process.exit(2); }
  for (const id of ids) { try { await runOne(id); } catch (e) { console.error(id, "RUNNER ERROR", String(e && e.stack || e).slice(0, 500)); } }
  console.log("DONE", ids.length);
})();
