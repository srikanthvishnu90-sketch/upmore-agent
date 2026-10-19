"use strict";
const crypto = require("node:crypto");
const { admitApplication, classifyOutcome } = require("../../supabase/functions/_shared/career_apply.ts");
const canonical = (v) => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : v && typeof v === "object"
  ? '{' + Object.keys(v).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))).map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}' : JSON.stringify(v);
const payloadHash = (v) => crypto.createHash("sha256").update(canonical(v)).digest("hex");
const outcomes = new Set(["confirmed", "submitted_unconfirmed", "needs_user", "failed", "not_submitted"]);

// The service-role transport is operator supplied. No user or model can write queue rows.
function createApplyQueue(client) {
  async function rpc(name, args) {
    const r = await client.rpc(name, args);
    if (r.error) throw Object.assign(new Error("apply queue unavailable"), { code: "APPLY_QUEUE_UNAVAILABLE" });
    return r.data;
  }
  return {
    async enqueue(payload, approvalHash, { log = [], now = Date.now(), daily = 25 } = {}) {
      const hash = payloadHash(payload);
      const admit = admitApplication(log, { user_id: payload.user_id, job_id: payload.job_id, company: payload.company,
        payload_hash: hash, approval_hash: approvalHash }, now, { daily });
      if (!admit.ok) throw Object.assign(new Error(admit.reason), { code: admit.reason });
      return rpc("career_apply_enqueue", { p_payload: payload, p_hash: hash, p_approval: approvalHash, p_daily: daily });
    },
    async claim(limit = 1) {
      const rows = await rpc("career_apply_claim", { p_count: limit });
      if (!Array.isArray(rows)) throw new Error("invalid apply claim");
      return rows;
    },
    async advance(job, state, evidence = {}) {
      if (state !== "submitting" && !outcomes.has(state)) throw new Error("invalid apply state");
      return rpc("career_apply_advance", { p_id: job.id, p_lease: job.lease_token, p_state: state, p_evidence: evidence });
    },
  };
}

// Each slot awaits an isolated driver process. A synchronous in-process 150
// adapter must not be passed here: its Atomics.wait bridge would serialize slots.
function createApplyPool({ queue, execute, concurrency = 6 }) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12 || typeof execute !== "function") throw new Error("invalid apply pool");
  async function drive(job) {
    let fenced = false;
    try {
      if (payloadHash(job.payload) !== job.payload_hash || job.approval_hash !== job.payload_hash) throw new Error("APPROVAL_PAYLOAD_MISMATCH");
      const result = await execute(job, { beforeSubmit: async () => {
        if (fenced) throw new Error("SUBMIT_ALREADY_ATTEMPTED");
        // Persist the one-shot fence before allowing any submit effect. An
        // uncertain RPC or lost worker cannot create an automatic retry.
        fenced = true;
        await queue.advance(job, "submitting");
      } });
      if (!result || !outcomes.has(result.state)) throw new Error("INVALID_APPLY_RESULT");
      if (["confirmed", "submitted_unconfirmed"].includes(result.state) && !fenced) throw new Error("SUBMISSION_WITHOUT_FENCE");
      const o = result.observation;
      if (!o || ["form_present_after", "captcha", "email_code_prompt"].some(k => typeof o[k] !== "boolean")
        || ["url_before", "url_after", "page_text"].some(k => typeof o[k] !== "string")
        || !Number.isSafeInteger(o.required_empty_after) || o.required_empty_after < 0
        || !Array.isArray(o.validation_errors) || o.validation_errors.some(v => typeof v !== "string")
        || classifyOutcome(o).state !== result.state) throw new Error("EMPLOYER_OBSERVATION_REQUIRED");
      // Derive the reason and confirmation id from the same observation too;
      // matching the outcome state alone must not admit an invented receipt.
      await queue.advance(job, result.state, { ...result, ...classifyOutcome(o) });
      return { id: job.id, state: result.state };
    } catch (e) {
      // Submission ambiguity remains internal work awaiting readback; it is
      // never invented employer confirmation or permission to click again.
      if (!fenced) {
        try { await queue.advance(job, "not_submitted", { reason: e.code || e.message }); return { id: job.id, state: "not_submitted" }; } catch (_) { /* retain original claim/fence */ }
      }
      return { id: job.id, state: "submitting", reason: "READBACK_REQUIRED" };
    }
  }
  return {
    async runOnce() { return Promise.all((await queue.claim(concurrency)).map(drive)); },
    async run(signal) {
      const slot = async () => {
        while (!signal.aborted) {
          const jobs = await queue.claim(1);
          if (jobs.length) await drive(jobs[0]);
          else await new Promise(resolve => { const t = setTimeout(done, 1000); function done() { clearTimeout(t); signal.removeEventListener("abort", done); resolve(); } signal.addEventListener("abort", done, { once: true }); });
        }
      };
      await Promise.all(Array.from({ length: concurrency }, slot));
    },
  };
}
module.exports = { createApplyQueue, createApplyPool, payloadHash };
