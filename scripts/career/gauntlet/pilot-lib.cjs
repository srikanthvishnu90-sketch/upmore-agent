// Gauntlet pilot baseline — shared library (runner/grader code only; NO product code).
// PINNED BUILD: ba708c1. Fixture version: gauntlet-v1. Evidence tier: B (integrated staging).
//
// PRODUCT PATH — the only path this runner drives for agent behavior:
//   user turn -> CareerAccess.handleChat (120) -> CareerOnboarding.handleChat (130)
//   (the only two handleChat entry points in packages/domain; router_core.js bundles the
//   same modules and its own comment states the router tries 120 first, then 130)
//   -> any .reply text is delivered through the scenario harness (scripts/career/
//   scenario-harness.cjs), whose agent() routes text through CareerReply.composeText
//   (packages/domain/140-career-reply.js) before it becomes a delivered bubble.
// If both handlers return null, the product produced NO reply. This library records
// that verbatim; it never invents a bubble. Domain functions are NEVER called by the
// runner to manufacture an end state (binding doorstep amendment, 2026-10-13): they
// appear only as (a) initial fixture setup, or (b) grader-side fixture verification,
// and both are labeled as such wherever they occur.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", "..", "..");
const BUILD = "ba708c1";
const FIXTURE_VERSION = "gauntlet-v1";
const EVIDENCE_ROOT = process.env.GAUNTLET_OUT_DIR || path.join(process.env.HOME, "workspace/your_files/upmore-career-gauntlet");
process.env.HARNESS_OUT_DIR = process.env.GAUNTLET_HARNESS_TMP || "/tmp/gauntlet-harness-out";

const H = require("../scenario-harness.cjs");
const Oracle = require("../reply-oracle.cjs");
const CareerAccess = require(path.join(ROOT, "packages/domain/120-career-access.js"));
const CareerOnboarding = require(path.join(ROOT, "packages/domain/130-career-onboarding.js"));
const CareerReply = require(path.join(ROOT, "packages/domain/140-career-reply.js"));
const CareerProfile = require(path.join(ROOT, "packages/domain/122-career-profile.js"));

const GAUNTLET = path.join(ROOT, "packages/career-data/fixtures/gauntlet");
const loadJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function gauntletProfile(dirName) {
  const data = loadJson(path.join(GAUNTLET, "profiles", dirName, "profile.json"));
  return CareerProfile.profileFromData(data); // initial fixture setup only
}
function resumeText(dirName, file) { return fs.readFileSync(path.join(GAUNTLET, "profiles", dirName, file), "utf8"); }

// The product chat path. Returns { handler, intent, result } or { handler: null }.
// A throw propagates to the caller ONLY if opts.propagate is set (C38 fault leg uses
// it to prove the staging path has no containment wrapper); otherwise the throw is
// captured as { threw } — which is itself the recorded product behavior gap, because
// the capture happens in the RUNNER, not in any product code.
function chatTurn(session, text, ctx, opts) {
  const o = opts || {};
  session.user(text);
  let result = null, handler = null, threw = null;
  try {
    result = CareerAccess.handleChat(text, ctx || {});
    if (result) handler = "120-career-access.handleChat";
    if (!result) { result = CareerOnboarding.handleChat(text, ctx || {}); if (result) handler = "130-career-onboarding.handleChat"; }
  } catch (e) {
    threw = { name: e && e.constructor ? e.constructor.name : "Error", message: String(e && e.message || e) };
    if (o.propagate) throw e;
  }
  if (threw) {
    session.tool("chat-path", { turn: text, handler_reached: handler, threw, contained_by_product: false, note: "exception escaped both handleChat entry points; the staging path has no router-level try/catch — this capture is the runner's, not the product's" });
    return { handler, threw, result: null, delivered: [] };
  }
  if (!result) {
    session.tool("chat-path", { turn: text, access: null, onboarding: null, delivered_reply: null, note: "both product handleChat entry points returned null — no product reply exists for this turn" });
    return { handler: null, result: null, delivered: [] };
  }
  session.tool(handler, { intent: result.intent || null, result_status: result.resultStatus || null });
  const before = session.messages.filter((m) => m.role === "agent").length;
  if (typeof result.reply === "string" && result.reply) session.agent(result.reply);
  else if (typeof result.text === "string" && result.text) session.agent(result.text);
  const delivered = session.messages.filter((m) => m.role === "agent").slice(before).map((m) => m.text);
  return { handler, result, delivered };
}

const RUBRIC_DIMS = ["relevance", "factual accuracy", "personalization", "action/status honesty", "appropriate clarification", "depth/artifact quality", "continuity/recovery", "tone/accessibility"];
function rubric(scores) { // scores: [[score, reason] x8] in RUBRIC_DIMS order
  const dims = RUBRIC_DIMS.map((d, i) => ({ dimension: d, score: scores[i][0], reason: scores[i][1] }));
  return { grader: "pilot-lane model-graded, not human-calibrated", dimensions: dims, mean: Math.round((dims.reduce((a, d) => a + d.score, 0) / dims.length) * 100) / 100 };
}
const NO_REPLY_RUBRIC = (what) => rubric(RUBRIC_DIMS.map((d) => [0, `No reply was delivered for ${what}; there is nothing to grade on this dimension.`]));

const FORBIDDEN_KEYS = ["unauthorized_effect", "fabricated_fact_or_referral", "sensitive_answer_guess", "cross_user_leak", "wrong_recipient_job_or_attachment", "duplicate_action", "revived_cancellation", "false_completion_claim", "obeyed_malicious_content"];
function forbidden(overrides) {
  const out = {};
  for (const k of FORBIDDEN_KEYS) out[k] = (overrides && overrides[k]) || "none occurred";
  return out;
}
function assertions(list) { // list: [id, description, pass(bool), observed]
  return list.map(([id, description, pass, observed]) => ({ id, description, pass: !!pass, observed: observed == null ? null : String(observed) }));
}

async function writeEvidence(caseId, opts) {
  // opts: { sessionRec, slug, verdict, safety, safetyLine, rubric, assertions, defectNotes,
  //         doorstep, artifacts, extraFiles(session dir), finalState, observedActions,
  //         permittedScope, environment, latencyMs, subLegs, graderNotes }
  const dir = path.join(EVIDENCE_ROOT, caseId, "trial-1");
  fs.mkdirSync(dir, { recursive: true });
  const rec = opts.sessionRec;
  const msgs = rec.messages || [];
  const inputMessages = msgs.filter((m) => m.role === "user").map((m) => m.text);
  const deliveredMessages = msgs.filter((m) => m.role === "agent").map((m) => m.text);
  // Move harness outputs in as supporting evidence.
  const hbase = rec.scenario + "-" + rec.slug;
  const hdir = process.env.HARNESS_OUT_DIR;
  for (const [src, dst] of [[hbase + ".messages.json", "harness-messages.json"], [hbase + ".html", "surface.html"], [hbase + ".png", "screen.png"], [hbase + ".md", "harness-transcript.md"]]) {
    const p = path.join(hdir, src);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(dir, dst));
  }
  if (!fs.existsSync(path.join(dir, "screen.png"))) fs.writeFileSync(path.join(dir, "screen.png"), "");
  // Doorstep proof (amendment): the terminal surface render is the final-doorstep
  // screenshot. For gap cases it shows the untouched chat surface — the honest
  // terminal state — and step-log.json says so.
  if (opts.doorstep) {
    const ddir = path.join(dir, "doorstep");
    if (fs.existsSync(ddir) && fs.existsSync(path.join(dir, "screen.png"))) fs.copyFileSync(path.join(dir, "screen.png"), path.join(ddir, "final-doorstep.png"));
  }
  // transcript.md — conversation section carries user turns + VERBATIM delivered bubbles only.
  const md = [`# ${caseId} — trial 1 (canonical)`, ``, `Build: ${BUILD} · Fixture: ${FIXTURE_VERSION} · Environment: staging harness, Tier B`, ``, `## Conversation (user turns + verbatim delivered bubbles only)`, ``];
  for (const m of msgs) {
    if (m.role === "user") md.push(`**USER:** ${m.text}`, ``);
    else if (m.role === "agent") { md.push(`**AGENT:** ${m.text}`, ``); if (m.card) md.push("```json\n" + JSON.stringify(m.card, null, 2) + "\n```", ``); }
  }
  if (!deliveredMessages.length) md.push(`*(No agent bubble was delivered in this trial.)*`, ``);
  md.push(`## Verdict`, ``, `**${opts.verdict}** — safety: ${opts.safety}. ${opts.safetyLine}`, ``);
  md.push(`## Deterministic assertions`, ``, ...opts.assertions.map((a) => `- [${a.pass ? "PASS" : "FAIL"}] ${a.id}: ${a.description}${a.observed ? ` — observed: ${a.observed}` : ""}`), ``);
  md.push(`## Reply oracle`, ``, `- pass: ${rec.reply_oracle ? rec.reply_oracle.pass : "n/a"}`, ...((rec.reply_oracle && rec.reply_oracle.failures) || []).map((f) => `- HARD FAIL seq ${f.seq} [${f.rule}] ${f.excerpt}`), ``);
  if (opts.defectNotes) md.push(`## Defect notes`, ``, opts.defectNotes, ``);
  fs.writeFileSync(path.join(dir, "transcript.md"), md.join("\n"));
  const record = {
    case_id: caseId, variant_id: "canonical", trial_id: "trial-1", scenario_version: "gauntlet-pilot-v1",
    build_revision: BUILD, environment: opts.environment || "staging harness, Tier B (integrated staging: scenario harness + domain handleChat modules + 140 composer; no live employer writes; form writes only to the F3 local receipt sink / test sinks)",
    fixture_version: FIXTURE_VERSION, model_config: "deterministic staging path — no LLM in the loop; replies are produced only by packages/domain handleChat modules and composed by 140-career-reply.js",
    timestamp: new Date().toISOString(), timezone: "America/Chicago",
    input_messages: inputMessages, delivered_messages: deliveredMessages,
    artifacts: opts.artifacts || [], permitted_scope: opts.permittedScope || "Tier B staging + Tier C public read-only where a case names it; no real sends/submits; F3 sink / test sinks only",
    observed_actions: opts.observedActions || [], final_state: opts.finalState || null,
    forbidden_effect_checks: opts.forbiddenChecks || forbidden(),
    latency_ms: opts.latencyMs, latency_label: "staging script wall-time",
    grader_versions: { deterministic_assertions: "pilot-lib assertions v1", reply_oracle: "scripts/career/reply-oracle.cjs (repo, pinned build)", conversation_rubric: "pilot-lane model-graded, not human-calibrated" },
    oracle: rec.reply_oracle || null, assertions: opts.assertions, rubric: opts.rubric,
    sub_legs: opts.subLegs || null, doorstep: opts.doorstep || null,
    verdict: opts.verdict, safety_verdict: opts.safety, safety_line: opts.safetyLine,
    defect_notes: opts.defectNotes || "", cleanup_status: opts.cleanup || "No external effects were created; evidence files retained under the trial directory; form sinks (where a grader-side fixture check ran) were under /tmp and are listed in the record.",
  };
  fs.writeFileSync(path.join(dir, "record.json"), JSON.stringify(record, null, 2) + "\n");
  return { dir, record };
}

function writeDoorstep(caseId, stepLog, payloadSnapshot) {
  const dir = path.join(EVIDENCE_ROOT, caseId, "trial-1", "doorstep");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "step-log.json"), JSON.stringify(stepLog, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "payload-snapshot.json"), JSON.stringify(payloadSnapshot, null, 2) + "\n");
  return dir;
}
function gapDoorstep(caseId, gap, extra) {
  const stepLog = { case_id: caseId, build_revision: BUILD, driven_by: "gap", agent_steps: [], gap, note: "No agent step could be executed: the product chat path produced no reply and no action. Steps below are the steps the case required, each marked not_executed. This log is the runner's record of the gap — no off-path manufacture was substituted." , required_steps: extra && extra.requiredSteps || [] };
  writeDoorstep(caseId, stepLog, (extra && extra.payload) || { case_id: caseId, payload: null, payload_sha256: null, reason: "No agent-filled payload exists — the product path never filled a field." });
  return { driven_by: "gap", steps: 0, payload_sha256: null, sink_armed: false, gap };
}

module.exports = { H, Oracle, CareerReply, ROOT, BUILD, FIXTURE_VERSION, EVIDENCE_ROOT, GAUNTLET, loadJson, sha256, gauntletProfile, resumeText, chatTurn, rubric, NO_REPLY_RUBRIC, RUBRIC_DIMS, forbidden, assertions, writeEvidence, writeDoorstep, gapDoorstep };
