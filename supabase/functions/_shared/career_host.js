// career_host.js — the hosted seam for the career agent (GO-LIVE FLIP,
// 2026-10-13, owner ruling: the career version is the live product).
//
// The career chain (120 access → 130 onboarding → 142 router → 141
// doorstep, wrapped in 143 containment with 140 composing fallbacks) was
// built and graded through the gauntlet harness (scripts/career/gauntlet/
// pilot-lib.cjs). This file is the harness's hosted equivalent: the chain
// modules are INJECTED, so the exact dispatch code below runs in three
// places with zero drift —
//   * Node tests (tests/career-http-host.test.cjs) inject packages/domain;
//   * the Deno handler injects the bundled exports of router_core.js;
//   * the dispatch order + §1b ensure-ending mirror pilot-lib.cjs exactly.
//
// Hosted differences from the harness, deliberately:
//   * ctx.postings is the LIVE pool (empty until a hosted board source is
//     wired) — the harness injects the pinned exam corpus; production must
//     never serve fixture jobs as if they were live.
//   * ctx.now is the real clock, not the frozen fixture clock.
//   * turn state rides a per-thread snapshot (extractSnapshot /
//     createTurnCtx) that the handler persists in agent_flow_state.state
//     under the "career" key — the chain's stores are plain JSON by design.
"use strict";

const CareerHost = (() => {
  // Whitelist of ctx keys that carry durable per-thread career state.
  // Anything not listed here is a per-turn input or a host service and is
  // never persisted.
  const STATE_KEYS = [
    "profile", "osStore", "doorstepState", "queueState", "globalPause",
    "trackStore", "suppression", "applyLog", "applicationLog", "outreach",
    "outreachContacts", "contacts", "sendingAccounts", "artifacts",
    "discovery", "plan", "offer", "portalRecords", "statusRecords",
    "tasks", "resumeTexts", "pastedText",
  ];

  function cloneJson(v) {
    return JSON.parse(JSON.stringify(v));
  }

  // §1b ensure-ending — copied verbatim from pilot-lib.cjs (the harness
  // seam that guarantees H-12's last-sentence requirement for 120/130/141
  // results; 142 guarantees its own endings and is NOT passed through here).
  function ensureEndingGuarantee(r) {
    if (!r || typeof r.reply !== "string" || !r.reply) return r;
    if (r.intent === "career_fallback" || r.intent === "honest_unavailable") return r;
    const sentences = r.reply.split(/(?<=[.!?])\s+|\n+/);
    const lastSentence = sentences[sentences.length - 1] || "";
    if (/\?/.test(lastSentence) || /\b(want me to|shall i|say the word|tell me|tap|reply (yes|with)|next:|approve|book it|want the|want to see|shall we)\b/i.test(lastSentence) || /\[Yes\]/.test(lastSentence)) return r;
    r.reply = r.reply.replace(/\s+$/, "") + " Tell me what you'd like to do next.";
    return r;
  }

  function createCareerHost(deps) {
    const { CareerAccess, CareerOnboarding, CareerRouter, CareerDoorstep, CareerReply, CareerContainment } = deps || {};
    for (const [name, mod] of Object.entries({ CareerAccess, CareerOnboarding, CareerRouter, CareerDoorstep, CareerReply, CareerContainment })) {
      if (!mod || typeof mod.handleChat !== "function" && name !== "CareerReply" && name !== "CareerContainment") {
        throw new Error(`career host: missing chain module ${name}`);
      }
    }
    if (!CareerContainment || typeof CareerContainment.createContainment !== "function" || typeof CareerContainment.extractReplyText !== "function") {
      throw new Error("career host: CareerContainment must provide createContainment + extractReplyText");
    }

    // Build the hosted ctx for one turn. `snapshot` is the object previously
    // returned by extractSnapshot (or null for a brand-new thread).
    function createTurnCtx(opts) {
      const o = opts || {};
      const ctx = {
        now: typeof o.now === "number" ? o.now : Date.now(),
        userId: o.userId || null,
        threadId: o.threadId || null,
        postings: Array.isArray(o.postings) ? o.postings : [],
        containmentRecords: [],
      };
      const stores = o.snapshot && typeof o.snapshot === "object" ? o.snapshot.stores : null;
      if (stores && typeof stores === "object") {
        for (const key of STATE_KEYS) {
          if (stores[key] !== undefined) {
            try { ctx[key] = cloneJson(stores[key]); } catch { /* unserializable state is dropped, never fatal */ }
          }
        }
      }
      if (o.profile !== undefined) ctx.profile = o.profile;
      return ctx;
    }

    // Run one chat turn through the career chain, in harness order, inside
    // module 143's containment. Never throws: a chain crash is contained to
    // module 140's honest fallback text, and the failure record is kept on
    // ctx.containmentRecords for the handler to log.
    function runTurn(text, ctx) {
      let handler = null;
      const dispatch = () => {
        let r = CareerAccess.handleChat(text, ctx);
        if (r) { handler = "CareerAccess"; return ensureEndingGuarantee(r); }
        r = CareerOnboarding.handleChat(text, ctx);
        if (r) { handler = "CareerOnboarding"; return ensureEndingGuarantee(r); }
        r = CareerRouter.handleChat(text, ctx);
        if (r) { handler = "CareerRouter"; return r; }
        r = CareerDoorstep.handleChat(text, ctx);
        if (r) { handler = "CareerDoorstep"; return ensureEndingGuarantee(r); }
        return null;
      };
      const containment = CareerContainment.createContainment({
        composer: CareerReply,
        sink: (rec) => { try { ctx.containmentRecords.push(rec); } catch { /* logging must never break a turn */ } },
      });
      const outcome = containment.runTurn(dispatch, {
        caseId: "live-turn",
        sessionId: ctx.threadId || "live",
      });
      if (outcome.contained) {
        return { reply: outcome.replyText, intent: null, resultStatus: null, handler, contained: true, result: null };
      }
      const result = outcome.result;
      return {
        reply: CareerContainment.extractReplyText(result),
        intent: (result && result.intent) || null,
        resultStatus: (result && result.resultStatus) || null,
        handler,
        contained: false,
        result,
      };
    }

    // Extract the durable per-thread state from a post-turn ctx. JSON-safe
    // by construction: unserializable values are skipped, never thrown.
    function extractSnapshot(ctx) {
      const stores = {};
      for (const key of STATE_KEYS) {
        if (ctx && ctx[key] !== undefined) {
          try { stores[key] = cloneJson(ctx[key]); } catch { /* skip */ }
        }
      }
      return { v: 1, stores };
    }

    return { createTurnCtx, runTurn, extractSnapshot, STATE_KEYS: STATE_KEYS.slice() };
  }

  return { createCareerHost, STATE_KEYS: STATE_KEYS.slice() };
})();

export { CareerHost };
