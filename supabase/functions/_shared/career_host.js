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
  // Reachable pure domain code is not a connected execution worker. This
  // hosted seam attaches neither the Node-only 150 driver nor an alerts
  // scheduler/channel. Runtime capabilities never ride user snapshots.
  const WORKER_CAPABILITIES = Object.freeze({
    portal_browser: Object.freeze({ status: "NOT_WIRED", reason: "The Node browser worker is not connected to this Edge handler." }),
    job_alert_delivery: Object.freeze({ status: "NOT_WIRED", reason: "No alert scheduler or delivery channel is connected to this Edge handler; watch state is saved in this conversation only." }),
  });
  // Whitelist of ctx keys that carry durable per-thread career state.
  // Anything not listed here is a per-turn input or a host service and is
  // never persisted.
  const STATE_KEYS = [
    "profile", "osStore", "doorstepState", "queueState", "globalPause",
    "trackStore", "suppression", "applyLog", "applicationLog", "outreach",
    "outreachContacts", "contacts", "sendingAccounts", "artifacts",
    "discovery", "plan", "offer", "portalRecords", "statusRecords",
    "tasks", "resumeTexts", "pastedText",
    // COMPLEXITY WAVE: a user-pasted posting staged on ctx, the user's
    // own stated facts, the deferred parts of a multi-intent turn, and
    // relayed opt-out records — all four are conversation state the
    // router reads back on later turns, so all four must survive the
    // snapshot round trip like every other store here.
    "posting", "statedFacts", "intentQueue", "_relayedSuppressions",
    // MI-032 STEP 2 (alerts host wiring, docs/career/alerts-host-wiring.md
    // §4/§5): the watch-state box. 142's watch intents read/write module
    // 152's records through a sync {get,set} view of this plain JSON
    // object (watchStoreOf in 142); the records inside are keyed per
    // user in 152's own scheme (career:watch-profile:<user_id>,
    // career:reminder-queue:<user_id>, career:reminder-history:<user_id>)
    // plus the host delivery ledger — so the box is per-user state, and
    // whitelisting it here is what makes chat-created watches, queued
    // reminders and delivery history survive the snapshot round trip
    // instead of dying with the turn. Created lazily by 142 on first
    // write only; a read never materializes it.
    "alertWatchState",
  ];

  function cloneJson(v) {
    return JSON.parse(JSON.stringify(v));
  }

  // §1b ensure-ending — copied verbatim from pilot-lib.cjs (the harness
  // seam that guarantees H-12's last-sentence requirement for 120/130/141
  // results; 142 guarantees its own endings and is NOT passed through here).
  function ensureEndingGuarantee(r, Reply140) {
    if (!r || typeof r.reply !== "string" || !r.reply) return r;
    if (r.intent === "career_fallback" || r.intent === "honest_unavailable") return r;
    // BUG-080 (W6 hand-off, coordinator assembly): the ending rule lives ONCE in
    // 140 (CareerReply.ensureNextStep) — a handler's specific next step wins,
    // the generic closer is appended only when the reply carries no next step
    // at all, and a generic stamped over a specific ending is stripped.
    // The composer arrives as a parameter: it is a createCareerHost dep, not an
    // IIFE-scope name (the first assembly draft referenced it bare and the
    // containment swallowed the ReferenceError — host suite caught it).
    if (!Reply140 || typeof Reply140.ensureNextStep !== "function") return r;
    const specific = typeof r.nextStep === "string" ? r.nextStep : (typeof r.next_step === "string" ? r.next_step : null);
    r.reply = Reply140.ensureNextStep(r.reply, specific ? { nextStep: specific } : undefined);
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
        workerCapabilities: WORKER_CAPABILITIES,
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
        if (r) { handler = "CareerAccess"; return ensureEndingGuarantee(r, CareerReply); }
        r = CareerOnboarding.handleChat(text, ctx);
        if (r) { handler = "CareerOnboarding"; return ensureEndingGuarantee(r, CareerReply); }
        r = CareerRouter.handleChat(text, ctx);
        if (r) { handler = "CareerRouter"; return r; }
        r = CareerDoorstep.handleChat(text, ctx);
        if (r) { handler = "CareerDoorstep"; return ensureEndingGuarantee(r, CareerReply); }
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
        return { reply: outcome.replyText, intent: null, resultStatus: null, handler, contained: true, result: null, capabilities: WORKER_CAPABILITIES };
      }
      let result = outcome.result;
      if (result && ["application_packet", "doorstep_fill", "doorstep_status"].includes(result.intent)) {
        // Packet preparation remains available; a local doorstep is never
        // presented as an opened employer form or a connected submit leg.
        result = { ...result, worker: WORKER_CAPABILITIES.portal_browser,
          reply: `Live browser execution is not wired in this handler; no employer form has been opened or submitted.\n${result.reply}` };
      }
      return {
        reply: CareerContainment.extractReplyText(result),
        intent: (result && result.intent) || null,
        resultStatus: (result && result.resultStatus) || null,
        handler,
        contained: false,
        result,
        capabilities: WORKER_CAPABILITIES,
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
