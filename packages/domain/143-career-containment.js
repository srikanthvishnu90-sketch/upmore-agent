/* Career containment — the universal safety net around a chat turn (gauntlet
   repair R2, 2026-10-13). Pure, zero deps, UMD like the other domain modules.
   NOT in the router bundle: production wiring is owner/D-10, out of scope here.

   THE DEFECT THIS FIXES (pilot baseline at ba708c1): the chat path had no
   containment. A domain throw escaped as silence (C38 leg i: a corrupt
   profile made 130's handler throw TypeError — no recovery bubble, no
   product-written failure record), and a null/empty route result delivered
   nothing (U12 all legs; 27 oracle empty-reply hard fails across the pilot).
   The 140 composer already HAD fallback("error"/"unmatched"/"empty") —
   nothing called it. That unwired safety net was the bug.

   DESIGN — route-agnostic by construction:
   - The wrapper sits at the TURN ENTRY, around the whole dispatch (one
     function that tries every route in order), never around a single
     handler: a handler returning null means "not mine, fall through", which
     is normal routing, not a failure. Wrapping per-handler would turn the
     first route's null into a fallback and break every later route.
   - Because it wraps the turn entry, routes added by other lanes inherit it
     with no changes here: the wrapper knows nothing about any route, intent,
     or domain module — only about the turn's outcome.
   - Outcomes: a dispatch result only counts as delivered when it carries a
     non-empty human reply (reply / text / bubbles). A throw, a null or
     undefined return, and a result with no non-empty reply are the three
     contained boundaries: "throw", "null_result", "empty_result".
   - On containment the user gets (a) a bubble composed through 140's
     EXISTING fallback API as-is — its canned text says what happened in
     plain words and the next step the user can take; the wrapper invents
     nothing (no fabricated shortlist, no fake completion, no per-case
     wording of its own) — and (b) a durable failure record is written BY
     THE PRODUCT PATH through the host-supplied sink.
   - 140's fallback API was sufficient for this: "error", "unmatched" and
     "empty" cover the three boundaries exactly, so 140 is called, never
     edited. Its optional ctx.next is deliberately unused — a generic
     wrapper has no truthful case-specific next step to add, and the canned
     texts already carry one.
   - If the composer itself is missing or its fallback is unusable, a
     lint-clean last-resort bubble (LAST_RESORT) is still delivered: an
     empty delivered reply must be unreachable on a wrapped turn.

   FAILURE RECORD — structured JSON, one per contained turn:
     { kind, version, timestamp, session_id, case_id, boundary,
       error_class, fallback_kind, fallback_delivered }
   Deliberately NOT in the record: the error message, any stack, the user's
   turn text, or any ctx/profile data. An error message can embed raw user
   data; the class (e.g. "TypeError") is all triage needs from this record.
   The record is only as durable as the sink the host supplies: the staging
   harness supplies an append-to-JSONL-file sink; a production host would
   supply its own store (database/log) the same way.

   PRODUCTION ADOPTION (honest note, not done here): the production chat
   handler could adopt this exact wrapper unchanged — createContainment({
   composer: <140>, sink: <host store> }) around its router dispatch, with
   its delivery function in place of the harness's. That wiring is D-10 /
   owner scope and is NOT claimed by this module.

   Sync only: the staging dispatch is synchronous, and so is runTurn. A
   thenable returned by dispatch is contained as an empty result rather
   than delivered as a promise object. */
const CareerContainment = (() => {
  const LAST_RESORT = "Something went wrong on my end. Nothing was changed — try again in a moment and I will pick it back up.";

  function defaultComposer() {
    try {
      if (typeof require !== "undefined") return require("./140-career-reply.js");
    } catch (e) { /* no composer reachable — LAST_RESORT covers it */ }
    return null;
  }

  // Error CLASS only ("TypeError", "RangeError", ...) — never the message.
  function errorClass(err) {
    const name = err && err.constructor && err.constructor.name ? String(err.constructor.name) : "";
    return /^[A-Za-z][A-Za-z0-9_]*$/.test(name) ? name : "Error";
  }

  // The human reply a dispatch result carries, or "" when it carries none.
  function extractReplyText(result) {
    if (result == null) return "";
    if (typeof result === "string") return result;
    if (Array.isArray(result)) return result.filter((b) => typeof b === "string" && b.trim()).join(" ");
    if (typeof result === "object") {
      if (typeof result.reply === "string" && result.reply.trim()) return result.reply;
      if (typeof result.text === "string" && result.text.trim()) return result.text;
      if (Array.isArray(result.bubbles)) return result.bubbles.filter((b) => typeof b === "string" && b.trim()).join(" ");
    }
    return "";
  }

  function createContainment(options) {
    const o = options || {};
    const composer = o.composer || defaultComposer();
    const sink = typeof o.sink === "function" ? o.sink : null;
    const now = typeof o.now === "function" ? o.now : () => new Date();
    const records = [];

    function timestamp() {
      try {
        const t = now();
        return (t instanceof Date ? t : new Date(t)).toISOString();
      } catch (e) { return new Date().toISOString(); }
    }

    function fallbackText(kind) {
      let text = "";
      try { text = composer && typeof composer.fallback === "function" ? composer.fallback(kind) : ""; } catch (e) { text = ""; }
      if (typeof text !== "string" || !text.trim()) return LAST_RESORT;
      try {
        if (composer && typeof composer.lint === "function" && !composer.lint(text).ok) return LAST_RESORT;
      } catch (e) { return LAST_RESORT; }
      return text;
    }

    // Build a record, keep it in memory, and hand it to the host's durable
    // sink. A failing sink never blocks the bubble: the in-memory record
    // notes the sink's error class so the loss itself is visible.
    function recordFailure(input) {
      const rec = {
        kind: "career_containment_failure",
        version: 1,
        timestamp: timestamp(),
        session_id: input.sessionId != null ? String(input.sessionId) : null,
        case_id: input.caseId != null ? String(input.caseId) : null,
        boundary: input.boundary,
        error_class: input.error ? errorClass(input.error) : null,
        fallback_kind: input.fallbackKind || "error",
        fallback_delivered: input.fallbackDelivered !== false,
      };
      records.push(rec);
      if (sink) {
        try { sink(rec); } catch (e) { rec.sink_error_class = errorClass(e); }
      }
      return rec;
    }

    function contain(boundary, err, meta, fallbackKind) {
      const text = fallbackText(fallbackKind);
      const rec = recordFailure({
        boundary, error: err,
        caseId: meta && meta.caseId, sessionId: meta && meta.sessionId,
        fallbackKind, fallbackDelivered: true,
      });
      return {
        contained: true, boundary, errorClass: rec.error_class,
        result: null, replyText: text, bubbles: [text], failureRecord: rec,
      };
    }

    // Run one whole turn's dispatch under containment. dispatch: () => result
    // (the host's route chain — 120 then 130 in staging). meta: {caseId,
    // sessionId} — ids for the failure record, never user content.
    function runTurn(dispatch, meta) {
      let result;
      try { result = dispatch(); } catch (e) { return contain("throw", e, meta, "error"); }
      if (result === null || result === undefined) return contain("null_result", null, meta, "unmatched");
      if (typeof result === "object" && typeof result.then === "function") return contain("empty_result", null, meta, "error");
      const replyText = extractReplyText(result);
      if (!replyText.trim()) return contain("empty_result", null, meta, "empty");
      return { contained: false, boundary: null, errorClass: null, result, replyText, bubbles: [replyText], failureRecord: null };
    }

    return { runTurn, recordFailure, fallbackText, records, extractReplyText };
  }

  return { createContainment, LAST_RESORT, errorClass, extractReplyText };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerContainment;
