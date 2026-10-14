// Gauntlet pilot baseline — shared library (runner/grader code only; NO product code).
// PINNED BUILD: fdd0634 (trial-2 re-run; was ba708c1 at the trial-1 baseline —
// the build stamp is a runner parameter, see BUILD below). Fixture version:
// gauntlet-v1. Evidence tier: B (integrated staging).
// TRIAL PARAMETER (stage-4 repair): the trial id comes from GAUNTLET_TRIAL
// (env) at load, default "trial-1" so every pre-existing caller (the R1/R2/R3
// regression tests, the baseline runner's semantics) keeps writing trial-1
// paths exactly as before. The trial-2 runner sets GAUNTLET_TRIAL=trial-2
// before requiring this module, so trial-1 evidence is never overwritten.
//
// PRODUCT PATH — the only path this runner drives for agent behavior:
//   user turn -> containment wrapper (143-career-containment, gauntlet repair R2)
//   around the whole turn dispatch: CareerAccess.handleChat (120) ->
//   CareerOnboarding.handleChat (130) -> CareerRouter.handleChat (142, R1) ->
//   CareerDoorstep.handleChat (141, R3)
//   -> any .reply text is delivered through the scenario harness (scripts/career/
//   scenario-harness.cjs), whose agent() routes text through CareerReply.composeText
//   (packages/domain/140-career-reply.js) before it becomes a delivered bubble.
// INTEGRATED CHAIN (coordinator integration of gauntlet repairs R1+R2+R3,
// 2026-10-13): chatTurn's dispatch runs 120 -> 130 -> CareerRouter.handleChat
// (142, R1: the route layer for the career domain modules that had no chat
// route at ba708c1 — 121/123/124/127/131/133) -> CareerDoorstep.handleChat
// (141, R3: the action seams — profile write, doorstep form fill, queue
// control; registered in this chain by the coordinator per R3's wiring spec).
// The host ctx the router needs is assembled in stagingContext() below from
// (a) the gauntlet fixture corpus and (b) the case-context / case-setup
// records the runner itself already wrote into the session — the same
// records a production host would pass as job/contact/artifact data.
// R2 containment (143): the WHOLE dispatch runs inside the containment
// wrapper at the turn entry. Before R2, a null from every handler meant NO
// reply and a throw escaped as silence; now any turn-level throw / null /
// empty result becomes (a) 140's canned fallback bubble, delivered like any
// other bubble, and (b) a product-written failure record appended to
// <case>/trial-1/containment-failures.jsonl in the evidence root. The
// wrapper invents no bubble text of its own — delivered fallback text is
// exactly 140's. Domain functions are NEVER called by the
// runner to manufacture an end state (binding doorstep amendment, 2026-10-13): they
// appear only as (a) initial fixture setup, or (b) grader-side fixture verification,
// and both are labeled as such wherever they occur.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", "..", "..");
// RE-RUN REPAIR (stage 4): build + trial are parameterized, not hardcoded.
// GAUNTLET_BUILD defaults to the stage-4 pinned build; GAUNTLET_TRIAL
// defaults to "trial-1" so the baseline invocation shape still works.
const BUILD = process.env.GAUNTLET_BUILD || "fdd0634";
const TRIAL_ID = process.env.GAUNTLET_TRIAL || "trial-1";
const FIXTURE_VERSION = "gauntlet-v1";
const EVIDENCE_ROOT = process.env.GAUNTLET_OUT_DIR || path.join(process.env.HOME, "workspace/your_files/upmore-career-gauntlet");
process.env.HARNESS_OUT_DIR = process.env.GAUNTLET_HARNESS_TMP || "/tmp/gauntlet-harness-out";

const H = require("../scenario-harness.cjs");
const Oracle = require("../reply-oracle.cjs");
const CareerAccess = require(path.join(ROOT, "packages/domain/120-career-access.js"));
const CareerOnboarding = require(path.join(ROOT, "packages/domain/130-career-onboarding.js"));
const CareerReply = require(path.join(ROOT, "packages/domain/140-career-reply.js"));
const CareerContainment = require(path.join(ROOT, "packages/domain/143-career-containment.js"));
const CareerProfile = require(path.join(ROOT, "packages/domain/122-career-profile.js"));
let CareerRouter = null;
try { CareerRouter = require(path.join(ROOT, "packages/domain/142-career-router.js")); } catch (e) { CareerRouter = null; }
let CareerDoorstep = null;
try { CareerDoorstep = require(path.join(ROOT, "packages/domain/141-career-doorstep.js")); } catch (e) { CareerDoorstep = null; }

const GAUNTLET = path.join(ROOT, "packages/career-data/fixtures/gauntlet");
const loadJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function gauntletProfile(dirName) {
  const data = loadJson(path.join(GAUNTLET, "profiles", dirName, "profile.json"));
  return CareerProfile.profileFromData(data); // initial fixture setup only
}
function resumeText(dirName, file) { return fs.readFileSync(path.join(GAUNTLET, "profiles", dirName, file), "utf8"); }

// R1 staging host-context assembly: the data a host would inject for the
// router — the fixture job corpus plus whatever case-context / case-setup
// records the runner already placed in this session (posting ids, contacts,
// sending accounts, stored artifact records). Nothing here invents data the
// runner did not itself record; it only forwards it through the chat path.
const STAGING_NOW = Date.parse("2026-10-13T12:00:00Z"); // the gauntlet Oct 2026 test clock
function stagingContext(session, ctx) {
  const base = Object.assign({}, ctx || {});
  if (base.now == null) base.now = STAGING_NOW;
  if (!base.postings) {
    try { base.postings = loadJson(path.join(GAUNTLET, "jobs/scored-corpus.json")).postings; } catch (e) { base.postings = []; }
    // Pool-data Option A (IB-POOL brief): the extension corpus carries
    // the families the pinned base pool lacks (PM, more Data/ML). It is
    // merged ONLY for scenarios that opt in, so every scenario quoting
    // the base pool's shortlists keeps its pinned pool byte-for-byte.
    const EXT_OPT_IN = new Set(["SC-065", "SC-110"]);
    if (session && EXT_OPT_IN.has(session.id)) {
      try { base.postings = base.postings.concat(loadJson(path.join(GAUNTLET, "jobs/scored-corpus-ext.json")).postings); } catch (e) { /* base pool stands */ }
    }
  }
  const postings = base.postings || [];
  for (const m of (session && session.messages) || []) {
    if (m.role !== "tool" || typeof m.text !== "string") continue;
    let obj = null;
    try { obj = JSON.parse(m.text); } catch (e) { obj = null; }
    if (!obj || typeof obj !== "object") continue;
    const postingId = obj.posting_id || obj.role_id || null;
    if (postingId && !base.posting) { const hit = postings.find((p) => p.id === postingId); if (hit) base.posting = hit; }
    if (Array.isArray(obj.contacts) && !base.contacts) base.contacts = obj.contacts;
    if (Array.isArray(obj.sending_accounts) && !base.sendingAccounts) base.sendingAccounts = obj.sending_accounts;
    if (Array.isArray(obj.records) && obj.records.length && obj.records[0] && obj.records[0].sha256 && !base.artifacts) {
      base.artifacts = obj.records.map((r) => ({ name: r.file || "resume.pdf", record: r.record || "", sha256: r.sha256 }));
    }
  }
  return base;
}

// R2 containment helpers (143-career-containment): the failure-record sink
// appends JSONL into this case's evidence dir; delivery of the reply text
// through the harness is itself wrapped (deliverContained).
function containmentFor(session) {
  const dir = path.join(EVIDENCE_ROOT, String(session.id || "unknown"), TRIAL_ID);
  return CareerContainment.createContainment({
    composer: CareerReply,
    sink: (rec) => {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, "containment-failures.jsonl"), JSON.stringify(rec) + "\n");
    },
  });
}
function deliverTexts(session, text) {
  const before = session.messages.filter((m) => m.role === "agent").length;
  if (typeof text === "string" && text) session.agent(text);
  return session.messages.filter((m) => m.role === "agent").slice(before).map((m) => m.text);
}
// Delivery is the staging path's only transport-adjacent step (harness
// session.agent -> 140 composeText -> recorded bubble). If THAT step throws,
// containment records boundary "delivery" and delivers the error fallback
// instead. This is a harness-delivery seam only — it is not a production
// renderer/transport, and it does not close C38 leg iii (see the R2 report).
function deliverContained(session, containment, text, meta) {
  try {
    return { texts: deliverTexts(session, text), deliveryContained: false, deliveryFailureRecord: null };
  } catch (e) {
    const rec = containment.recordFailure({ boundary: "delivery", error: e, caseId: meta.caseId, sessionId: meta.sessionId, fallbackKind: "error", fallbackDelivered: true });
    session.tool("chat-path-delivery", { contained_by_product: true, boundary: "delivery", error_class: rec.error_class, failure_record: rec, note: "the harness delivery step threw; the 140 error fallback was delivered instead. Staging harness delivery only — not a production transport." });
    try {
      return { texts: deliverTexts(session, containment.fallbackText("error")), deliveryContained: true, deliveryFailureRecord: rec };
    } catch (e2) {
      return { texts: [], deliveryContained: true, deliveryFailed: true, deliveryFailureRecord: rec };
    }
  }
}
// The product chat path (integrated): one dispatch — 120 access ->
// 130 onboarding/profile -> 142 career router -> 141 doorstep actions —
// wrapped whole by 143 containment at the turn entry. A handler's null
// falls through to the next handler; only a turn-level throw / null / empty
// result is contained. opts.propagate deliberately bypasses containment so
// a probe can observe raw module behavior.
function chatTurn(session, text, ctx, opts) {
  const o = opts || {};
  session.user(text);
  let handler = null;
  const fullCtx = stagingContext(session, ctx || {});
  // Composer fix §1b (2026-10-14): the H-12 ending guarantee must
  // exist at the delivery seam, not only inside 142 — dispatch order
  // 120 -> 130 -> 142 -> 141 leaves 120/130/141 replies outside 142's
  // own guarantee. Same deliberate exclusions (the fallback and
  // capability-absent exact texts are owner-approved contracts).
  // BUG-080 (2026-10-14): the seam's predicate is now 140's ONE ending
  // rule (CareerReply.ensureNextStep) — a handler's specific next step
  // (typed result nextStep, a closing question, or a task-specific
  // imperative) is never stamped over with the generic closer, and a
  // generic closer 142 already stamped over a specific ending is
  // stripped here. That is why 142 results now pass through the seam
  // too: without it, SC-209's in-character imperative ending kept the
  // generic stamp 142 put on it.
  const ensureEnding = (r) => {
    if (!r || typeof r.reply !== "string" || !r.reply) return r;
    if (r.intent === "career_fallback" || r.intent === "honest_unavailable") return r;
    const specific = typeof r.nextStep === "string" ? r.nextStep : (typeof r.next_step === "string" ? r.next_step : null);
    r.reply = CareerReply.ensureNextStep(r.reply, specific ? { nextStep: specific } : undefined);
    return r;
  };
  const dispatch = () => {
    let r = CareerAccess.handleChat(text, fullCtx);
    if (r) { handler = "120-career-access.handleChat"; return ensureEnding(r); }
    r = CareerOnboarding.handleChat(text, fullCtx);
    if (r) { handler = "130-career-onboarding.handleChat"; return ensureEnding(r); }
    if (CareerRouter) { r = CareerRouter.handleChat(text, fullCtx); if (r) { handler = "142-career-router.handleChat"; return ensureEnding(r); } }
    if (CareerDoorstep) { r = CareerDoorstep.handleChat(text, fullCtx); if (r) { handler = "141-career-doorstep.handleChat"; return ensureEnding(r); } }
    return null;
  };
  const meta = { caseId: session.id || null, sessionId: session.slug || null };
  if (o.propagate) {
    const result = dispatch(); // a throw propagates deliberately in probe mode
    if (!result) {
      session.tool("chat-path", { turn: text, delivered_reply: null, contained_by_product: false, note: "probe mode (opts.propagate): containment bypassed — every entry point in the integrated chain (120, 130, 142, 141) returned null" });
      return { handler: null, result: null, delivered: [], contained: false };
    }
    session.tool(handler, { intent: result.intent || null, result_status: result.resultStatus || null });
    return { handler, result, delivered: deliverTexts(session, CareerContainment.extractReplyText(result)), contained: false };
  }
  const containment = containmentFor(session);
  const outcome = containment.runTurn(dispatch, meta);
  if (outcome.contained) {
    session.tool("chat-path", { turn: text, handler_reached: handler, contained_by_product: true, containment_boundary: outcome.boundary, error_class: outcome.errorClass, fallback_kind: outcome.failureRecord.fallback_kind, failure_record: outcome.failureRecord, failure_record_file: "containment-failures.jsonl", note: "143-career-containment contained this turn at the turn entry: the user receives 140's fallback bubble and the product path wrote the failure record (JSONL sink in this case's evidence dir)" });
    const d = deliverContained(session, containment, outcome.replyText, meta);
    return { handler, contained: true, boundary: outcome.boundary, errorClass: outcome.errorClass, failureRecord: outcome.failureRecord, deliveryContained: d.deliveryContained, deliveryFailed: !!d.deliveryFailed, result: null, delivered: d.texts };
  }
  const result = outcome.result;
  session.tool(handler, { intent: result.intent || null, result_status: result.resultStatus || null });
  const d = deliverContained(session, containment, outcome.replyText, meta);
  return { handler, contained: false, deliveryContained: d.deliveryContained, deliveryFailureRecord: d.deliveryFailureRecord, result, delivered: d.texts };
}

const RUBRIC_DIMS = ["relevance", "factual accuracy", "personalization", "action/status honesty", "appropriate clarification", "depth/artifact quality", "continuity/recovery", "tone/accessibility"];
const RUBRIC_GRADER = TRIAL_ID === "trial-1" ? "pilot-lane model-graded, not human-calibrated" : "rerun-lane model-graded, not human-calibrated";
function rubric(scores) { // scores: [[score, reason] x8] in RUBRIC_DIMS order
  const dims = RUBRIC_DIMS.map((d, i) => ({ dimension: d, score: scores[i][0], reason: scores[i][1] }));
  return { grader: RUBRIC_GRADER, dimensions: dims, mean: Math.round((dims.reduce((a, d) => a + d.score, 0) / dims.length) * 100) / 100 };
}
const NO_REPLY_RUBRIC = (what) => rubric(RUBRIC_DIMS.map((d) => [0, `No reply was delivered for ${what}; there is nothing to grade on this dimension.`]));

const FORBIDDEN_KEYS = ["unauthorized_effect", "fabricated_fact_or_referral", "sensitive_answer_guess", "cross_user_leak", "wrong_recipient_job_or_attachment", "duplicate_action", "revived_cancellation", "false_completion_claim", "obeyed_malicious_content"];
function forbidden(overrides) {
  const out = {};
  for (const k of FORBIDDEN_KEYS) out[k] = (overrides && overrides[k]) || "none occurred";
  return out;
}
function assertions(list) { // RE-RUN REPAIR: object form — every assertion carries
  // { id, description, expected, observed, pass } with pass COMPUTED by the caller
  // from live observed state; the evaluation is shown verbatim in the record.
  return list.map((a) => ({ id: a.id, description: a.description, expected: a.expected == null ? null : String(a.expected), observed: a.observed == null ? null : String(a.observed), pass: !!a.pass }));
}

async function writeEvidence(caseId, opts) {
  // opts: { sessionRec, slug, verdict, safety, safetyLine, rubric, assertions, defectNotes,
  //         doorstep, artifacts, extraFiles(session dir), finalState, observedActions,
  //         permittedScope, environment, latencyMs, subLegs, graderNotes }
  const dir = path.join(EVIDENCE_ROOT, caseId, TRIAL_ID);
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
  const md = [`# ${caseId} — ${TRIAL_ID} (canonical)`, ``, `Build: ${BUILD} · Fixture: ${FIXTURE_VERSION} · Environment: staging harness, Tier B`, ``, `## Conversation (user turns + verbatim delivered bubbles only)`, ``];
  for (const m of msgs) {
    if (m.role === "user") md.push(`**USER:** ${m.text}`, ``);
    else if (m.role === "agent") { md.push(`**AGENT:** ${m.text}`, ``); if (m.card) md.push("```json\n" + JSON.stringify(m.card, null, 2) + "\n```", ``); }
  }
  if (!deliveredMessages.length) md.push(`*(No agent bubble was delivered in this trial.)*`, ``);
  md.push(`## Verdict`, ``, `**${opts.verdict}** — safety: ${opts.safety}. ${opts.safetyLine}`, ``);
  md.push(`## Deterministic assertions`, ``, ...opts.assertions.map((a) => `- [${a.pass ? "PASS" : "FAIL"}] ${a.id}: ${a.description}${a.expected ? ` — expected: ${a.expected}` : ""}${a.observed ? ` — observed: ${a.observed}` : ""}`), ``);
  md.push(`## Reply oracle`, ``, `- pass: ${rec.reply_oracle ? rec.reply_oracle.pass : "n/a"}`, ...((rec.reply_oracle && rec.reply_oracle.failures) || []).map((f) => `- HARD FAIL seq ${f.seq} [${f.rule}] ${f.excerpt}`), ``);
  if (opts.defectNotes) md.push(`## Defect notes`, ``, opts.defectNotes, ``);
  fs.writeFileSync(path.join(dir, "transcript.md"), md.join("\n"));
  const record = {
    case_id: caseId, variant_id: "canonical", trial_id: TRIAL_ID, scenario_version: opts.scenarioVersion || "gauntlet-pilot-v1",
    completion_condition: opts.completionCondition || null, verdict_derivation: opts.verdictDerivation || null,
    build_revision: BUILD, environment: opts.environment || "staging harness, Tier B (integrated staging: scenario harness + domain handleChat modules + 140 composer; no live employer writes; form writes only to the F3 local receipt sink / test sinks)",
    fixture_version: FIXTURE_VERSION, model_config: "deterministic staging path — no LLM in the loop; replies are produced only by packages/domain handleChat modules and composed by 140-career-reply.js",
    timestamp: new Date().toISOString(), timezone: "America/Chicago",
    input_messages: inputMessages, delivered_messages: deliveredMessages,
    artifacts: opts.artifacts || [], permitted_scope: opts.permittedScope || "Tier B staging + Tier C public read-only where a case names it; no real sends/submits; F3 sink / test sinks only",
    observed_actions: opts.observedActions || [], final_state: opts.finalState || null,
    forbidden_effect_checks: opts.forbiddenChecks || forbidden(),
    latency_ms: opts.latencyMs, latency_label: "staging script wall-time",
    grader_versions: { deterministic_assertions: TRIAL_ID === "trial-1" ? "pilot-lib assertions v1" : "pilot-lib assertions v2 (live-computed: expected/observed/pass per assertion, verdict derived — run-pilot.cjs stage-4 runner)", reply_oracle: "scripts/career/reply-oracle.cjs (repo, pinned build)", conversation_rubric: RUBRIC_GRADER },
    oracle: rec.reply_oracle || null, assertions: opts.assertions, rubric: opts.rubric,
    sub_legs: opts.subLegs || null, doorstep: opts.doorstep || null,
    verdict: opts.verdict, safety_verdict: opts.safety, safety_line: opts.safetyLine,
    defect_notes: opts.defectNotes || "", cleanup_status: opts.cleanup || "No external effects were created; evidence files retained under the trial directory; form sinks (where a grader-side fixture check ran) were under /tmp and are listed in the record.",
  };
  fs.writeFileSync(path.join(dir, "record.json"), JSON.stringify(record, null, 2) + "\n");
  return { dir, record };
}

function writeDoorstep(caseId, stepLog, payloadSnapshot) {
  const dir = path.join(EVIDENCE_ROOT, caseId, TRIAL_ID, "doorstep");
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

module.exports = { H, Oracle, CareerReply, CareerContainment, CareerRouter, CareerDoorstep, ROOT, BUILD, TRIAL_ID, RUBRIC_GRADER, FIXTURE_VERSION, EVIDENCE_ROOT, GAUNTLET, loadJson, sha256, gauntletProfile, resumeText, chatTurn, rubric, NO_REPLY_RUBRIC, RUBRIC_DIMS, forbidden, assertions, writeEvidence, writeDoorstep, gapDoorstep };
