"use strict";
const { fail } = require("./store.cjs");
const TYPES = new Set(["open", "discover", "fill", "readback", "verify_payload", "review", "submit_and_capture", "screenshot", "close", "shutdown"]);
function validateAction(cmd) {
  if (!cmd || typeof cmd !== "object" || !TYPES.has(cmd.type) || typeof cmd.boardId !== "string" || !/^[a-z0-9-]+$/i.test(cmd.boardId)) throw fail("ACTION_SCHEMA_INVALID");
  if (["fill", "readback", "verify_payload", "review", "submit_and_capture"].includes(cmd.type) && typeof cmd.observationVersion !== "string") throw fail("OBSERVATION_REQUIRED");
  if (cmd.type === "open") {
    let u; try { u = new URL(cmd.url); } catch (_) { throw fail("ACTION_SCHEMA_INVALID"); }
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw fail("ACTION_SCHEMA_INVALID");
  }
  if (cmd.type === "fill" && (!cmd.binding || typeof cmd.binding.field_id !== "string" || !Array.isArray(cmd.binding.elementRefs) || !cmd.binding.elementRefs.length || cmd.value === undefined)) throw fail("ACTION_SCHEMA_INVALID");
  if (["readback", "verify_payload"].includes(cmd.type) && !Array.isArray(cmd.bindings)) throw fail("ACTION_SCHEMA_INVALID");
  if (cmd.type === "verify_payload" && (!cmd.payload || typeof cmd.payload !== "object")) throw fail("ACTION_SCHEMA_INVALID");
  return cmd;
}
function assertObservation(cmd, observation, scope, url) {
  if (!observation || cmd.observationVersion !== observation.version) throw fail("STALE_OBSERVATION");
  if (observation.frame !== "main" || new URL(url).origin !== observation.origin || (scope && scope.origin !== observation.origin)) throw fail("OBSERVATION_SCOPE_MISMATCH");
  if (cmd.type === "fill") for (const ref of cmd.binding.elementRefs) {
    const field = observation.fields.find((f) => f.ref === ref);
    if (!field) throw fail("ELEMENT_REFERENCE_INVALID");
    if (field.disabled || field.readOnly) throw fail("ELEMENT_NOT_ACTIONABLE");
  }
}
module.exports = { validateAction, assertObservation };
