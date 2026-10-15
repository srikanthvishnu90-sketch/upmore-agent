"use strict";
const { fail } = require("./store.cjs");
// The transport must execute these RPCs against the memory repair's existing
// account row. There is no cached, file-backed or permissive fallback.
// Synchronous transport is required by the existing 149/150 board contract.
function createTaskAuthority({ call }) {
  if (typeof call !== "function") throw fail("TASK_AUTHORITY_NOT_WIRED");
  function rpc(name, args) {
    let data;
    try { data = call(name, args); }
    catch (e) { throw fail(/revoked|stale|missing|paused|uncertain|already consumed|binding/.test(e.message || "") ? "TASK_AUTHORITY_REVOKED" : "TASK_AUTHORITY_UNAVAILABLE"); }
    if (data?.then) throw fail("SYNC_AUTHORITY_TRANSPORT_REQUIRED");
    if (!data || typeof data !== "object" || data.error) throw fail("TASK_AUTHORITY_UNAVAILABLE");
    return data;
  }
  return {
    current(userId) {
      const data = rpc("career_task_account_v1", { p_user: userId });
      if (data.exists && (!Number.isSafeInteger(data.account?.version) || !Number.isSafeInteger(data.account?.epoch))) throw fail("TASK_AUTHORITY_UNAVAILABLE");
      return { exists: data.exists === true, version: data.account?.version, epoch: data.account?.epoch, paused: data.account?.paused === true };
    },
    claim({ userId, intentId, taskId, leaseToken, expected }) {
      if (!/^[a-f0-9]{64}$/.test(intentId || "")) throw fail("TASK_INTENT_REQUIRED");
      const grant = rpc("career_task_claim_v1", { p_user: userId, p_intent: intentId, p_task: taskId, p_lease: leaseToken || null });
      if (grant.version !== "career_task_intent/v1" || grant.userId !== userId || grant.taskId !== taskId || grant.intentId !== intentId || typeof grant.leaseToken !== "string") throw fail("TASK_AUTHORITY_REVOKED");
      for (const [key, value] of Object.entries(expected)) if (value != null && grant.binding?.[key] !== value) throw fail("TASK_AUTHORITY_BINDING_MISMATCH");
      return grant;
    },
    begin(grant, operation, effectKey) {
      return rpc("career_task_begin_effect_v1", { p_user: grant.userId, p_intent: grant.intentId, p_lease: grant.leaseToken, p_task: grant.taskId, p_operation: operation, p_effect_key: effectKey, p_bindings: grant.binding });
    },
    consume(grant, ticket) {
      const data = rpc("career_task_consume_effect_v1", { p_user: grant.userId, p_token: ticket.token });
      if (data.consumed !== true || data.token !== ticket.token) throw fail("TASK_AUTHORITY_REVOKED");
    },
    settle(grant, ticket, outcome, before, after) {
      const args = { p_user: grant.userId, p_token: ticket.token, p_outcome: outcome, p_before: before, p_after: after };
      let data;
      try { data = rpc("career_task_settle_effect_v1", args); }
      catch (_) { data = rpc("career_task_effect_status_v1", { p_user: grant.userId, p_token: ticket.token }); }
      if (data.state !== outcome || data.token !== ticket.token || data.beforeSha256 !== before || data.afterSha256 !== after) throw fail("TASK_EFFECT_OUTCOME_UNCERTAIN");
      return data;
    },
    finish(grant, task) {
      try { return rpc("career_task_finish_v1", { p_user: grant.userId, p_intent: grant.intentId, p_lease: grant.leaseToken, p_result: task }); }
      catch (_) {
        const data = rpc("career_task_result_v1", { p_user: grant.userId, p_intent: grant.intentId });
        const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])])) : value;
        if (JSON.stringify(sorted(data.task)) !== JSON.stringify(sorted(task))) throw fail("TASK_RESULT_UNCONFIRMED");
        return { state: "completed", reconciled: true };
      }
    },
    pending() { return rpc("career_task_pending_v1", {}).intents || []; },
  };
}
module.exports = { createTaskAuthority };
