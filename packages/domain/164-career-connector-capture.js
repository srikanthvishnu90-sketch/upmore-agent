/* Career Connector — CONSENT CAPTURE (Lane B consent-capture package, 2026-10-21).
   Pure domain logic, UMD like 124/126/135/157. No I/O, no sends, no LLM:
   every function is deterministic — timestamps arrive as explicit arguments
   (opts.at, ISO string or epoch ms) or through the injected deps.now clock,
   and the consent arithmetic is done ENTIRELY by the injected 157 module
   (deps.consentApi), the same injection shape 158 uses for its isConsented
   predicate. This module never re-implements a consent rule.

   WHAT THIS IS: the missing capture conversation. 157 defined WHAT a
   consent record is; the gate (156) decides WHO may run the Connector;
   this module is the chat flow that walks one person through it:

     ask need -> ask offer -> show summary -> explicit yes/no -> done
     (edit at the summary, or after a grant, re-opens the flow;
      revoke / stop ends it from any step)

   The builders of the sibling packages write the ask texts as constants in
   the module they belong to (159's templates); the capture texts live here
   the same way, in TEXTS — plain, short, no hype, and every reply the
   machine can send is one of those constants or the summary built by
   buildSummary from the person's own two lines.

   THE GRANT RULE (load-bearing — spec §CONNECTOR: one consent violation is
   a launch-blocking bug):
   - A grant is recorded ONLY at the confirm step, ONLY when the reply
     normalizes (trim, collapse whitespace, case-fold, strip trailing
     "." / "!") to EXACTLY GRANT_WORD ("yes") — the exact word the summary
     itself asks for. "yeah", "sure", "ok", "yes please", "yes I do", a
     thumbs-up, an empty message: all of them re-show the summary
     byte-identical and record NOTHING. Free text at the summary is never
     consumed as an edit; edits require the explicit EDIT NEED / EDIT
     OFFER commands.
   - The grant binds to the EXACT summary shown: the machine stores
     summaryDigest(summary) on the flow and stamps it into every grant
     event's note (157's append-only log), so what the person agreed to is
     answerable from the record alone.
   - EDITING VOIDS A PRIOR YES. An edit after a grant first appends 157
     revocations for all three scopes (the grants stay in the log as
     history and immediately evaluate to not-consented), returns the flow
     to the edited ask, and the NEW summary needs a NEW exact "yes".
   - REVOKE / STOP / CANCEL ends capture from any step. Before a grant it
     records nothing (a flow that never granted has nothing to revoke —
     a pre-existing consent the host passed in is NOT this flow's to
     revoke); after a grant it appends the three revocations and the
     person's consent reads back revoked for every scope.
   - THE GATE IS INJECTED, NEVER ASSUMED. deps.gateDecision (or a fresher
     per-turn opts.gateDecision) is 156's decide() result. Absent,
     malformed, or allowed !== true => CLOSED: start refuses, and a
     decision that closes mid-flow blocks that turn without mutating
     anything. A decision whose userId names a different person refuses
     with GATE_USER_MISMATCH. A capture with no decision wired is a
     capture that never runs — fail closed, the lane's standing posture.

   WHAT A GRANT RECORDS: all three 157 scopes — matched, introduced,
   contacted — granted in chain order at one timestamp on the capture
   surface, plus the 157 match profile { needs: [need], offers: [offer],
   visibility_scope: "internal_only" } (157's default; capture does not
   ask about visibility in v1). If the host passes the person's existing
   carriage in at start (opts.existing, the readFromProfile shape), the
   grants append to that log (seq continues, history kept) and the
   existing profile is updated in place via updateMatchProfile — never
   duplicated. A malformed non-null existing record refuses the start
   (BAD_EXISTING): fail closed, never silently repaired.

   CARRIAGE: the flow itself is a plain JSON record. snapshot() serializes
   it (the two 157 records ride as their own canonical serializations) and
   createConnectorCapture(deps, snapshotJson) restores it exactly — a
   malformed snapshot throws TypeError instead of guessing a state. Where
   the snapshot and the consent/profile bundle live between turns is the
   assembly lane's wiring (docs/connector/capture-integration-note-2026-10-21.md);
   this module owns the conversation and the record shapes, not storage.

   PURITY: inputs (deps, existing records) are never mutated; a turn
   returns a fresh result object { ok, code, step, reply, reason? }.
   Same inputs => same outputs, forever. */
const CareerConnectorCapture = (() => {
  "use strict";

  const VERSION = 1;
  const KIND = "connector_capture_flow";
  const GRANT_WORD = "yes";
  const STEPS = ["idle", "ask_need", "ask_offer", "confirm", "done", "declined", "revoked"];
  const REVOKE_WORDS = ["revoke", "stop", "cancel"];
  // 157 caps a stored needs/offers item at 280 chars (its MAX_ITEM_CHARS);
  // capture collects one line per ask, so the same cap applies at the door.
  const MAX_LINE_CHARS = 280;

  const TEXTS = {
    ASK_NEED: "Let's set up your Connector profile. First: what do you need from people you meet? One short line — for example, \"an intro to an analyst at a bank I am applying to\" or \"help prepping for interviews\".",
    ASK_OFFER: "And what can you offer other people? One short line — for example, \"I can walk through the interview process at my firm\" or \"happy to review resumes\".",
    REPROMPT_SUFFIX: "\n\nI need one exact reply: YES to opt in, NO to decline, EDIT NEED or EDIT OFFER to change a line.",
    GRANTED: "You're in. Your need and offer are saved to your Connector profile and your consent is recorded: you may be considered for matches, introduced when both sides agree, and your contact details shared with the person you are introduced to. Reply REVOKE at any time to opt out.",
    DECLINED: "Okay — nothing was recorded and you are not opted in. You can start again any time.",
    REVOKED_RECORDED: "Done. Your consent is revoked, effective now, and the revocation is recorded on your consent log. You are not opted in.",
    REVOKED_EMPTY: "Stopped. Nothing was recorded and you are not opted in.",
    GATE_CLOSED: "The Connector isn't open for you yet, so I can't record an opt-in. Nothing was recorded.",
    ENDED: "This opt-in conversation has ended; nothing further was changed.",
    DONE_HELP: "You're opted in. Reply EDIT NEED or EDIT OFFER to change your profile, or REVOKE to opt out.",
    EMPTY_LINE: "That was empty — an empty line can't be recorded.",
    TOO_LONG: "That line is over the 280-character limit. Shorten it and send it again.",
  };

  // ---- small deterministic helpers (clock handling mirrors 157) ---------
  const s = (v) => (v == null ? "" : String(v));
  const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const clockMsOf = (v) => {
    if (v == null) return NaN;
    if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
    if (typeof v === "string") { const t = Date.parse(v); return Number.isNaN(t) ? NaN : t; }
    return NaN;
  };
  const isoOf = (v) => {
    const ms = clockMsOf(v);
    if (Number.isNaN(ms)) return null;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

  // The reply grammar is a closed set: normalize hard, compare exactly.
  function normalizeReply(text) {
    return s(text).trim().replace(/\s+/g, " ").toLowerCase().replace(/[.!]+$/, "");
  }

  // The summary is the exact text the grant binds to. Fixed template, two
  // slots; the three scopes are named in 157's own terms (considered for
  // matches / introduced / contact details shared).
  function buildSummary(need, offer) {
    return "Here is what I have for your Connector profile:\n"
      + `Need: ${s(need)}\n`
      + `Offer: ${s(offer)}\n`
      + "\n"
      + "If you say yes, Trainee may consider you for matches with other members, introduce you to a member when you have both agreed to it, and share your contact details with that member once an introduction is agreed. Nothing is shared before you agree to a specific introduction, and you can revoke this at any time by replying REVOKE.\n"
      + "\n"
      + "Reply YES to opt in. Reply NO to decline. Reply EDIT NEED or EDIT OFFER to change a line.";
  }

  // djb2 — a deterministic content digest, stable across hosts and runs.
  function summaryDigest(text) {
    const str = s(text);
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = (((h << 5) + h) + str.charCodeAt(i)) >>> 0;
    return ("0000000" + h.toString(16)).slice(-8);
  }

  const CONSENT_API_FNS = ["createMatchProfile", "updateMatchProfile", "validateMatchProfile",
    "emptyConsentState", "validateConsentState", "grantConsent", "revokeConsent",
    "serializeConsentState", "parseConsentState", "serializeMatchProfile", "parseMatchProfile"];

  function createConnectorCapture(deps, snapshotJson) {
    if (!isObj(deps) || !isObj(deps.consentApi)
      || CONSENT_API_FNS.some((f) => typeof deps.consentApi[f] !== "function")
      || !Array.isArray(deps.consentApi.SCOPES) || !Array.isArray(deps.consentApi.SURFACES)) {
      throw new TypeError("createConnectorCapture: deps.consentApi (the 157 module) is required");
    }
    const C157 = deps.consentApi;
    const surface = deps.surface == null ? "app" : deps.surface;
    if (!C157.SURFACES.includes(surface)) {
      throw new TypeError(`createConnectorCapture: unknown surface ${JSON.stringify(surface)}`);
    }
    const nowFn = typeof deps.now === "function" ? deps.now : Date.now;
    const staticDecision = deps.gateDecision === undefined ? null : deps.gateDecision;

    let flow = null;
    if (snapshotJson != null) flow = restore(snapshotJson);

    function restore(json) {
      const bad = (why) => new TypeError(`createConnectorCapture: invalid snapshot (${why})`);
      if (typeof json !== "string") throw bad("not a string");
      let raw; try { raw = JSON.parse(json); } catch { throw bad("unparseable"); }
      if (!isObj(raw)) throw bad("not an object");
      if (raw.kind !== KIND) throw bad("wrong kind");
      if (raw.version !== VERSION) throw bad("wrong version");
      if (typeof raw.user_id !== "string" || !raw.user_id.trim()) throw bad("bad user_id");
      if (!C157.SURFACES.includes(raw.surface)) throw bad("bad surface");
      if (!STEPS.includes(raw.step) || raw.step === "idle") throw bad("bad step");
      if (!(raw.need === null || typeof raw.need === "string")) throw bad("bad need");
      if (!(raw.offer === null || typeof raw.offer === "string")) throw bad("bad offer");
      if (["ask_offer", "confirm", "done", "declined"].includes(raw.step) && typeof raw.need !== "string") throw bad("step without need");
      if (["confirm", "done"].includes(raw.step) && typeof raw.offer !== "string") throw bad("step without offer");
      if (!(raw.editing === null || raw.editing === "need" || raw.editing === "offer")) throw bad("bad editing");
      if (raw.step === "done" && typeof raw.grant_digest !== "string") throw bad("done without grant digest");
      if (raw.step !== "done" && raw.grant_digest !== null) throw bad("grant digest without done");
      if (!isoOf(raw.started_at) || raw.started_at !== isoOf(raw.started_at)) throw bad("bad started_at");
      const cs = C157.parseConsentState(raw.consent);
      if (!cs.ok) throw bad("consent record invalid");
      if (cs.state.user_id !== raw.user_id) throw bad("consent user mismatch");
      let profile = null;
      if (raw.match_profile != null) {
        const mp = C157.parseMatchProfile(raw.match_profile);
        if (!mp.ok) throw bad("match profile invalid");
        if (mp.profile.user_id !== raw.user_id) throw bad("profile user mismatch");
        profile = mp.profile;
      }
      return { user_id: raw.user_id, surface: raw.surface, step: raw.step, need: raw.need,
        offer: raw.offer, editing: raw.editing, grant_digest: raw.grant_digest,
        started_at: raw.started_at, consent_state: cs.state, match_profile: profile };
    }

    // The gate, evaluated fresh from the freshest decision available.
    // Returns null when open, else the refusal to return verbatim.
    function gateRefusal(decision, userId, step) {
      if (!isObj(decision) || decision.allowed !== true) {
        const reason = isObj(decision) && typeof decision.reason === "string" ? decision.reason : "no_decision";
        return { ok: false, code: "GATE_CLOSED", reason, step, reply: TEXTS.GATE_CLOSED };
      }
      if (decision.userId != null && decision.userId !== userId) {
        return { ok: false, code: "GATE_USER_MISMATCH", reason: "user_mismatch", step, reply: TEXTS.GATE_CLOSED };
      }
      return null;
    }
    const decisionOf = (opts) => (opts && opts.gateDecision !== undefined ? opts.gateDecision : staticDecision);
    const atOf = (opts) => (opts && opts.at !== undefined ? opts.at : nowFn());

    function start(userId, opts) {
      const o = opts || {};
      if (flow) return { ok: false, code: "ALREADY_STARTED", step: flow.step, reply: TEXTS.ENDED };
      const refusal = gateRefusal(decisionOf(o), userId, "idle");
      if (refusal) return refusal;
      if (typeof userId !== "string" || !userId.trim()) {
        return { ok: false, code: "BAD_USER", step: "idle", reply: TEXTS.GATE_CLOSED };
      }
      const at = atOf(o);
      const iso = isoOf(at);
      if (!iso) return { ok: false, code: "BAD_TIMESTAMP", step: "idle", reply: TEXTS.GATE_CLOSED };
      let consent = null;
      let profile = null;
      const ex = o.existing;
      if (ex != null) {
        if (!isObj(ex)) return { ok: false, code: "BAD_EXISTING", step: "idle", reply: TEXTS.GATE_CLOSED };
        if (ex.consent != null) {
          if (!C157.validateConsentState(ex.consent).ok || ex.consent.user_id !== userId) {
            return { ok: false, code: "BAD_EXISTING", step: "idle", reply: TEXTS.GATE_CLOSED };
          }
          consent = clone(ex.consent);
        }
        if (ex.match_profile != null) {
          if (!C157.validateMatchProfile(ex.match_profile).ok || ex.match_profile.user_id !== userId) {
            return { ok: false, code: "BAD_EXISTING", step: "idle", reply: TEXTS.GATE_CLOSED };
          }
          profile = clone(ex.match_profile);
        }
      }
      if (!consent) {
        const r = C157.emptyConsentState(userId, at);
        if (!r.ok) return { ok: false, code: "BAD_TIMESTAMP", reason: r.reason, step: "idle", reply: TEXTS.GATE_CLOSED };
        consent = r.state;
      }
      flow = { user_id: userId, surface, step: "ask_need", need: null, offer: null,
        editing: null, grant_digest: null, started_at: iso, consent_state: consent, match_profile: profile };
      return { ok: true, code: "OK", step: flow.step, reply: TEXTS.ASK_NEED };
    }

    // Append one 157 event per scope, in chain order, at one timestamp.
    // Builds on a working value and commits only when every append lands.
    function appendAll(kind, at, note) {
      let state = flow.consent_state;
      for (const scope of C157.SCOPES) {
        const r = kind === "grant"
          ? C157.grantConsent(state, scope, { at, source_surface: flow.surface, note })
          : C157.revokeConsent(state, scope, { at, source_surface: flow.surface, note });
        if (!r.ok) return r;
        state = r.state;
      }
      return { ok: true, state };
    }

    function doGrant(at) {
      const summary = buildSummary(flow.need, flow.offer);
      const digest = summaryDigest(summary);
      const g = appendAll("grant", at, `connector capture grant (summary ${digest})`);
      if (!g.ok) return { ok: false, code: "RECORD_FAILED", reason: g.reason, step: "confirm", reply: TEXTS.ENDED };
      let profile;
      if (flow.match_profile) {
        const u = C157.updateMatchProfile(flow.match_profile, { needs: [flow.need], offers: [flow.offer] }, at);
        if (!u.ok) return { ok: false, code: "RECORD_FAILED", reason: u.reason, step: "confirm", reply: TEXTS.ENDED };
        profile = u.profile;
      } else {
        const c = C157.createMatchProfile({ user_id: flow.user_id, needs: [flow.need], offers: [flow.offer] }, at);
        if (!c.ok) return { ok: false, code: "RECORD_FAILED", reason: c.reason, step: "confirm", reply: TEXTS.ENDED };
        profile = c.profile;
      }
      flow.consent_state = g.state;
      flow.match_profile = profile;
      flow.grant_digest = digest;
      flow.step = "done";
      return { ok: true, code: "GRANTED", step: "done", reply: TEXTS.GRANTED };
    }

    function doRevoke(at, recorded) {
      if (recorded) {
        const r = appendAll("revoke", at, "connector capture revoke");
        if (!r.ok) return { ok: false, code: "RECORD_FAILED", reason: r.reason, step: flow.step, reply: TEXTS.ENDED };
        flow.consent_state = r.state;
        flow.grant_digest = null;
      }
      flow.step = "revoked";
      flow.editing = null;
      return { ok: true, code: "REVOKED", step: "revoked", reply: recorded ? TEXTS.REVOKED_RECORDED : TEXTS.REVOKED_EMPTY };
    }

    function doEdit(field, at) {
      if (flow.step === "done") {
        // A prior yes stands on the profile about to change: void it first.
        const r = appendAll("revoke", at, `connector capture: grant voided by profile edit (summary ${flow.grant_digest})`);
        if (!r.ok) return { ok: false, code: "RECORD_FAILED", reason: r.reason, step: flow.step, reply: TEXTS.ENDED };
        flow.consent_state = r.state;
        flow.grant_digest = null;
      }
      flow.editing = field;
      flow.step = field === "need" ? "ask_need" : "ask_offer";
      return { ok: true, code: "EDIT", step: flow.step, reply: field === "need" ? TEXTS.ASK_NEED : TEXTS.ASK_OFFER };
    }

    function handle(text, opts) {
      const o = opts || {};
      if (!flow) return { ok: false, code: "NOT_STARTED", step: "idle", reply: TEXTS.ENDED };
      const refusal = gateRefusal(decisionOf(o), flow.user_id, flow.step);
      if (refusal) return refusal;
      const at = atOf(o);
      const norm = normalizeReply(text);
      const isRevoke = REVOKE_WORDS.includes(norm);

      if (flow.step === "declined" || flow.step === "revoked") {
        return { ok: true, code: "ENDED", step: flow.step, reply: TEXTS.ENDED };
      }
      if (flow.step === "done") {
        if (isRevoke) return doRevoke(at, true);
        if (norm === "edit need") return doEdit("need", at);
        if (norm === "edit offer") return doEdit("offer", at);
        return { ok: true, code: "DONE_HELP", step: "done", reply: TEXTS.DONE_HELP };
      }
      if (isRevoke) return doRevoke(at, false);

      if (flow.step === "ask_need" || flow.step === "ask_offer") {
        const field = flow.step === "ask_need" ? "need" : "offer";
        const ask = field === "need" ? TEXTS.ASK_NEED : TEXTS.ASK_OFFER;
        const line = s(text).trim();
        if (!line) return { ok: true, code: "EMPTY", step: flow.step, reply: `${TEXTS.EMPTY_LINE}\n\n${ask}` };
        if (line.length > MAX_LINE_CHARS) return { ok: true, code: "TOO_LONG", step: flow.step, reply: TEXTS.TOO_LONG };
        flow[field] = line;
        if (flow.editing === field) {
          flow.editing = null;
          flow.step = "confirm";
          return { ok: true, code: "OK", step: "confirm", reply: buildSummary(flow.need, flow.offer) };
        }
        if (field === "need") {
          flow.step = "ask_offer";
          return { ok: true, code: "OK", step: "ask_offer", reply: TEXTS.ASK_OFFER };
        }
        flow.step = "confirm";
        return { ok: true, code: "OK", step: "confirm", reply: buildSummary(flow.need, flow.offer) };
      }

      // confirm — the only step that can grant, and only on the exact word.
      if (norm === GRANT_WORD) return doGrant(at);
      if (norm === "no") {
        flow.step = "declined";
        return { ok: true, code: "DECLINED", step: "declined", reply: TEXTS.DECLINED };
      }
      if (norm === "edit need") return doEdit("need", at);
      if (norm === "edit offer") return doEdit("offer", at);
      return { ok: true, code: "REPROMPT", step: "confirm", reply: buildSummary(flow.need, flow.offer) + TEXTS.REPROMPT_SUFFIX };
    }

    function flowView() {
      if (!flow) return null;
      return clone({ kind: KIND, version: VERSION, user_id: flow.user_id, surface: flow.surface,
        step: flow.step, need: flow.need, offer: flow.offer, editing: flow.editing,
        grant_digest: flow.grant_digest, started_at: flow.started_at,
        consent_state: flow.consent_state, match_profile: flow.match_profile });
    }

    function result() {
      if (!flow) return { status: "idle", match_profile: null, consent: null };
      const status = flow.step === "done" ? "granted"
        : flow.step === "declined" ? "declined"
        : flow.step === "revoked" ? "revoked" : "in_progress";
      return { status,
        match_profile: status === "granted" ? clone(flow.match_profile) : null,
        consent: clone(flow.consent_state) };
    }

    function snapshot() {
      if (!flow) return null;
      return JSON.stringify({ kind: KIND, version: VERSION, user_id: flow.user_id, surface: flow.surface,
        step: flow.step, need: flow.need, offer: flow.offer, editing: flow.editing,
        grant_digest: flow.grant_digest, started_at: flow.started_at,
        consent: C157.serializeConsentState(flow.consent_state),
        match_profile: flow.match_profile ? C157.serializeMatchProfile(flow.match_profile) : null });
    }

    return { start, handle, result, snapshot,
      step: () => (flow ? flow.step : "idle"),
      flow: flowView };
  }

  return { VERSION, KIND, STEPS, GRANT_WORD, TEXTS, MAX_LINE_CHARS,
    normalizeReply, buildSummary, summaryDigest, createConnectorCapture };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerConnectorCapture;
