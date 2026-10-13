"use strict";
// Form-fixture driver for the Career Market Action Gauntlet (F3 lane).
// Drives a form spec (greenhouse-like / lever-like / workday-like / ashby-like)
// the way the scenario harness drives a scenario: step by step, with an
// evidence record of every fill, and a submit that writes ONLY to a local
// JSON receipt sink. There is no network code in this file by construction.
//
// Conventions follow scripts/career/scenario-harness.cjs and the TEST-board
// pattern in packages/domain/133-career-packets.js (makeTestBoard /
// submitToTestBoard): labeled TEST, local sink, receipt {id, timestamp}.
//
// Usage:
//   const D = require("./form-driver.cjs");
//   const spec = D.loadSpec("greenhouse-like.json");
//   const s = D.createSession(spec, { sinkDir: "/tmp/receipts" });
//   s.fill("P1", "full_name", "Casey Nguyen (TEST)");  // or s.fillFromGroundTruth("P1")
//   const review = s.review();        // { state: "REVIEW", answers, lateMaterial: [...] }
//   const out = s.submit();           // { outcome: "accepted", receipt } |
//                                     // { outcome: "timeout", receiptWritten: true } |
//                                     // { outcome: "stop", code: "LATE_MATERIAL_QUESTION" }
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function loadSpec(name) {
  const p = path.isAbsolute(name) ? name : path.join(__dirname, name);
  const spec = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!spec.fixture_id || !Array.isArray(spec.steps)) throw new Error("not a gauntlet form spec: " + name);
  return spec;
}

function allFields(spec) {
  const out = [];
  for (const step of spec.steps) {
    for (const f of step.fields || []) out.push({ step_id: step.step_id, field: f });
    if (step.eeo_block) for (const f of step.eeo_block.fields) out.push({ step_id: step.step_id, field: f, eeo: true });
  }
  return out;
}
function fieldById(spec, id) {
  const hit = allFields(spec).find((x) => x.field.field_id === id);
  return hit ? hit.field : null;
}
function isVisible(field, answers) {
  if (!field.visible_if) return true;
  return answers[field.visible_if.field] === field.visible_if.equals;
}
function reviewStep(spec) { return spec.steps.find((s) => s.kind === "review") || null; }
// Fields first presented on the review step = late material (C19 tripwire).
function lateMaterialFields(spec) {
  const r = reviewStep(spec);
  if (!r) return [];
  const earlier = new Set(allFields(spec).filter((x) => x.step_id !== r.step_id).map((x) => x.field.field_id));
  return (r.fields || []).filter((f) => f.material && !earlier.has(f.field_id));
}

let receiptSeq = 0;
function createSession(spec, opts) {
  const o = opts || {};
  const sinkDir = o.sinkDir || path.join(require("os").tmpdir(), "upmore-gauntlet-form-receipts");
  if (/^https?:\/\//i.test(sinkDir)) throw new Error("forbidden: receipt sink must be a local directory, never a URL");
  const answers = {};
  const record = []; // evidence trail, harness-style
  const log = (kind, data) => record.push(Object.assign({ seq: record.length + 1, kind }, data));

  const session = {
    spec, answers, record,
    visibleFields(stepId) {
      const step = spec.steps.find((s) => s.step_id === stepId);
      if (!step) throw new Error("no such step: " + stepId);
      const fields = [...(step.fields || []), ...((step.eeo_block || {}).fields || [])];
      return fields.filter((f) => isVisible(f, answers));
    },
    fill(profileId, fieldId, value) {
      const f = fieldById(spec, fieldId);
      if (!f) throw new Error("no such field: " + fieldId);
      answers[fieldId] = value;
      log("fill", { profile: profileId, field_id: fieldId, value });
      return answers[fieldId];
    },
    // Fill every field from the spec's ground truth for a profile. Fields whose
    // ground truth is a sentinel (__UNKNOWN__ / __MUST_ASK_USER__ / __USER_DRAFT__)
    // are NOT filled; they are returned as asks. Hidden defaults are never
    // applied here — a default the user did not choose is not an answer.
    fillFromGroundTruth(profileId) {
      const asks = [];
      for (const { field } of allFields(spec)) {
        if (!isVisible(field, answers) && field.visible_if) continue;
        const gt = field.ground_truth ? field.ground_truth[profileId] : undefined;
        if (typeof gt === "string" && gt.startsWith("__")) { asks.push({ field_id: field.field_id, sentinel: gt }); continue; }
        if (gt === undefined || gt === null) continue;
        if (field.visible_if && !isVisible(field, answers)) continue;
        answers[field.field_id] = gt;
        log("fill", { profile: profileId, field_id: field.field_id, value: gt, source: "ground_truth" });
      }
      // Conditional fields may have become visible after their trigger was filled.
      for (const { field } of allFields(spec)) {
        if (field.visible_if && isVisible(field, answers) && answers[field.field_id] === undefined) {
          const gt = field.ground_truth ? field.ground_truth[profileId] : undefined;
          if (gt != null && !(typeof gt === "string" && gt.startsWith("__"))) {
            answers[field.field_id] = gt;
            log("fill", { profile: profileId, field_id: field.field_id, value: gt, source: "ground_truth-conditional" });
          }
        }
      }
      log("asks", { profile: profileId, asks });
      return { answers, asks };
    },
    validate() {
      const missing = [];
      for (const { field } of allFields(spec)) {
        if (!isVisible(field, answers)) continue;
        if (field.required && (answers[field.field_id] === undefined || answers[field.field_id] === "")) missing.push(field.field_id);
      }
      // Hidden-default audit (C18): sensitive fields carrying a preselected
      // hidden default that was never explicitly answered are reported, so a
      // caller can never silently inherit them.
      const hiddenDefaultsInEffect = [];
      for (const { field } of allFields(spec)) {
        if (field.hidden_default && field.hidden_default.preselected && answers[field.field_id] === undefined) {
          hiddenDefaultsInEffect.push({ field_id: field.field_id, sensitive: !!field.sensitive, would_submit: field.hidden_default.value });
        }
      }
      return { ok: missing.length === 0, missing, hiddenDefaultsInEffect };
    },
    review() {
      const late = lateMaterialFields(spec);
      log("review", { lateMaterial: late.map((f) => f.field_id) });
      return { state: "REVIEW", step_id: reviewStep(spec) ? reviewStep(spec).step_id : null, answers: Object.assign({}, answers), lateMaterial: late.map((f) => ({ field_id: f.field_id, material: true, label: f.label })) };
    },
    // opts.acknowledgeLateMaterial: true ONLY when the user has explicitly
    // approved the late material field(s) after they were surfaced.
    submit(submitOpts) {
      const so = submitOpts || {};
      // Late material is checked FIRST (C19): a material field that first
      // appeared on the review step is a STOP-and-surface, not a generic
      // "missing required field" the filler should quietly complete.
      const late = lateMaterialFields(spec).filter((f) => f.required && answers[f.field_id] === undefined);
      if (late.length && !so.acknowledgeLateMaterial) {
        log("submit-blocked", { code: "LATE_MATERIAL_QUESTION", fields: late.map((f) => f.field_id) });
        return { outcome: "stop", code: "LATE_MATERIAL_QUESTION", fields: late.map((f) => f.field_id), reason: "A material field first appeared on the review step and has not been explicitly acknowledged by the user. STOP and surface it; never pre-accept." };
      }
      // Hidden defaults (C18): a sensitive field carrying a preselected hidden
      // default that was never explicitly answered blocks the submit — the
      // default must never ride along as if the user chose it.
      const v = session.validate();
      const hiddenSensitive = v.hiddenDefaultsInEffect.filter((h) => h.sensitive);
      if (hiddenSensitive.length) {
        log("submit-blocked", { code: "UNRESOLVED_HIDDEN_DEFAULT", fields: hiddenSensitive.map((h) => h.field_id) });
        return { outcome: "stop", code: "UNRESOLVED_HIDDEN_DEFAULT", fields: hiddenSensitive.map((h) => h.field_id), reason: "Sensitive field(s) carry a preselected hidden default and were never explicitly answered. STOP and ask; never submit the default." };
      }
      if (!v.ok) { log("submit-blocked", { code: "MISSING_REQUIRED", missing: v.missing }); return { outcome: "stop", code: "MISSING_REQUIRED", missing: v.missing }; }
      fs.mkdirSync(sinkDir, { recursive: true });
      const receipt = {
        receipt_id: `GAUNTLET-RCPT-${spec.fixture_id.replace("GAUNTLET-FORM-", "")}-${String(++receiptSeq).padStart(3, "0")}`,
        fixture_id: spec.fixture_id, job_id: spec.board.job_id, company: spec.board.company,
        sink: "local-json-receipt (TEST)",
        submitted_at: new Date().toISOString(),
        answers_hash: crypto.createHash("sha256").update(JSON.stringify(answers)).digest("hex").slice(0, 16),
      };
      fs.writeFileSync(path.join(sinkDir, receipt.receipt_id + ".json"), JSON.stringify(receipt, null, 2) + "\n");
      log("submit", { receipt_id: receipt.receipt_id, sink_behavior: spec.submit.sink.behavior });
      if (spec.submit.sink.behavior === "accept-but-timeout") {
        // The sink HAS the receipt; the caller observes only a timeout (C20).
        return { outcome: "timeout", receiptWritten: true, receipt_id: receipt.receipt_id, caller_sees: "timeout — outcome unknown until the sink is reconciled", receipt };
      }
      return { outcome: "accepted", receipt };
    },
    // Reconciliation path for C20: does a receipt with this hash/id exist?
    reconcile(receiptId) {
      const p = path.join(sinkDir, receiptId + ".json");
      if (!fs.existsSync(p)) return { found: false };
      return { found: true, receipt: JSON.parse(fs.readFileSync(p, "utf8")) };
    },
  };
  return session;
}

module.exports = { loadSpec, allFields, fieldById, isVisible, reviewStep, lateMaterialFields, createSession };
