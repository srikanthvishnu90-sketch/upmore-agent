/* Connector double opt-in state machine (158) — Lane B package 2 of 4.
   Spec: trainee-capability-targets-2026-10-19.md §CONNECTOR steps 3-4.
   Pure domain logic, UMD like 124/126/135. No I/O, no persistence, no sends:
   the host injects consent and the clock, persists via snapshot(), and acts
   on the events drainEvents() returns.

   THE INVARIANTS (each pinned by tests/career-connector-match.test.cjs):
   1. CONSENT GATE: a proposal is created only when the injected
      isConsented(personId) predicate returns true for BOTH sides, read at
      creation time. The consent model itself is package 1's — this module
      never stores or infers consent.
   2. ONE OPEN PROPOSAL PER PERSON: while a proposal involving a person is
      in an open state (proposed / a_answered / b_answered), no second
      proposal involving them — on either side — can be created.
   3. IDENTITY CONTAINMENT (consent is load-bearing): a pitch is a TYPED
      shape { need, offer } — intake strips every other field, so identity
      (name, email, userId, firm, title, phone...) cannot enter the record
      through a pitch at all. The payload handed to a side is built from an
      allowlist of exactly { proposalId, need, offer, why, expiresAt }.
      Payloads stay summary-only even after both_yes: revealing identity on
      unlock is the intro composer's job (package 4), driven by the
      intro_unlocked event — never by widening this payload.
   4. EXACTLY ONCE PER SIDE: each side's first answer is the only one that
      counts. A repeat answer is a no-op returning the current state — it
      can never flip a yes to a no, and interleaved/replayed answers can
      never double-fire the unlock (the F-017 round-2 lesson).
   5. ONE UNLOCK EVENT: the both_yes transition emits exactly one
      { type: "intro_unlocked" } event per proposal, idempotent under
      replay and across snapshot()/restore (the introUnlocked flag is part
      of the persisted record).
   6. DECLINE IS TERMINAL AND FREE: a "no" from either side, at any open
      point, ends the proposal. No reason is demanded or stored.
   7. EXPIRY IS HONORED: an answer at or after expiresAt is NOT applied —
      the proposal transitions to expired. Expiry is also applied lazily on
      propose/openProposalFor so a dead proposal never blocks a fresh one.

   State table (open states first):
     proposed   --a:yes--> a_answered   --b:yes--> both_yes (terminal, unlock)
     proposed   --b:yes--> b_answered   --a:yes--> both_yes (terminal, unlock)
     proposed|a_answered|b_answered --either:no--> declined (terminal)
     proposed|a_answered|b_answered --now >= expiresAt--> expired (terminal)
   Answers landing on a terminal state are no-ops returning current state.

   Callers must treat returned proposal records as read views (the host
   persists them via snapshot(); mutating them directly voids the
   invariants). */
const CareerConnectorMatch = (() => {
  "use strict";

  const OPEN_STATES = Object.freeze(["proposed", "a_answered", "b_answered"]);
  const TERMINAL_STATES = Object.freeze(["both_yes", "declined", "expired"]);
  const STATES = Object.freeze([...OPEN_STATES, ...TERMINAL_STATES]);

  // A pitch is exactly { need, offer }. Anything else a caller stuffs in is
  // stripped here, at intake — identity fields never enter the record.
  function sanitizePitch(pitch) {
    if (!pitch || typeof pitch !== "object") return null;
    const need = typeof pitch.need === "string" ? pitch.need.trim() : "";
    const offer = typeof pitch.offer === "string" ? pitch.offer.trim() : "";
    if (!need || !offer) return null;
    return { need, offer };
  }

  function createConnectorMatch(deps, snapshotJson) {
    if (!deps || typeof deps.isConsented !== "function") {
      throw new TypeError("createConnectorMatch: deps.isConsented(personId) predicate is required");
    }
    const isConsented = deps.isConsented;
    const now = typeof deps.now === "function" ? deps.now : Date.now;
    const proposals = new Map();
    let events = [];
    let seq = 0;
    const nextId = typeof deps.nextId === "function" ? deps.nextId : () => "cm-" + (++seq);

    if (snapshotJson != null) {
      const snap = typeof snapshotJson === "string" ? JSON.parse(snapshotJson) : snapshotJson;
      if (!snap || !Array.isArray(snap.proposals)) throw new TypeError("createConnectorMatch: malformed snapshot");
      for (const rec of snap.proposals) proposals.set(rec.id, rec);
      events = Array.isArray(snap.events) ? snap.events.slice() : [];
      seq = Number.isInteger(snap.seq) ? snap.seq : proposals.size;
    }

    function fail(code, extra) {
      return Object.assign({ ok: false, code }, extra || {});
    }

    // Lazy expiry: an open proposal at/past its deadline is expired. Applied
    // on every read path so a dead proposal never blocks or accepts input.
    function touchExpiry(rec) {
      if (OPEN_STATES.includes(rec.state) && now() >= rec.expiresAt) {
        rec.state = "expired";
        rec.history.push({ at: now(), type: "expired" });
        return true;
      }
      return false;
    }

    function openProposalFor(personId) {
      for (const rec of proposals.values()) {
        if (rec.aId !== personId && rec.bId !== personId) continue;
        touchExpiry(rec);
        if (OPEN_STATES.includes(rec.state)) return rec;
      }
      return null;
    }

    function propose(input) {
      const inp = input || {};
      const { aId, bId } = inp;
      if (typeof aId !== "string" || !aId || typeof bId !== "string" || !bId) return fail("INVALID_INPUT");
      if (aId === bId) return fail("SELF_MATCH");
      if (typeof inp.why !== "string" || !inp.why.trim()) return fail("INVALID_INPUT");
      if (typeof inp.ttlMs !== "number" || !Number.isFinite(inp.ttlMs) || inp.ttlMs <= 0) return fail("INVALID_TTL");
      const aPitch = sanitizePitch(inp.aPitch);
      const bPitch = sanitizePitch(inp.bPitch);
      if (!aPitch || !bPitch) return fail("INVALID_INPUT");
      if (!isConsented(aId)) return fail("NOT_CONSENTED", { side: "a" });
      if (!isConsented(bId)) return fail("NOT_CONSENTED", { side: "b" });
      const blockA = openProposalFor(aId);
      if (blockA) return fail("OPEN_PROPOSAL_EXISTS", { person: aId, proposalId: blockA.id });
      const blockB = openProposalFor(bId);
      if (blockB) return fail("OPEN_PROPOSAL_EXISTS", { person: bId, proposalId: blockB.id });
      const id = nextId();
      if (proposals.has(id)) return fail("ID_CONFLICT", { proposalId: id });
      const createdAt = now();
      const rec = {
        id, aId, bId, aPitch, bPitch,
        why: inp.why.trim(),
        state: "proposed",
        aAnswer: null, bAnswer: null,
        createdAt, expiresAt: createdAt + inp.ttlMs,
        introUnlocked: false, introUnlockedAt: null,
        history: [{ at: createdAt, type: "proposed" }],
      };
      proposals.set(id, rec);
      return { ok: true, proposal: rec };
    }

    function answer(proposalId, side, value) {
      const rec = proposals.get(proposalId);
      if (!rec) return fail("NOT_FOUND");
      if ((side !== "a" && side !== "b") || (value !== "yes" && value !== "no")) return fail("INVALID_ANSWER");
      if (TERMINAL_STATES.includes(rec.state)) return { ok: true, proposal: rec, noop: true };
      if (touchExpiry(rec)) return { ok: true, proposal: rec, expired: true };
      const field = side === "a" ? "aAnswer" : "bAnswer";
      if (rec[field] !== null) return { ok: true, proposal: rec, noop: true }; // exactly once per side
      rec[field] = value;
      rec.history.push({ at: now(), type: "answered", side, answer: value });
      if (value === "no") {
        rec.state = "declined";
        rec.history.push({ at: now(), type: "declined", side });
        return { ok: true, proposal: rec };
      }
      const other = side === "a" ? rec.bAnswer : rec.aAnswer;
      if (other === "yes") {
        rec.state = "both_yes";
        if (!rec.introUnlocked) { // exactly one unlock event, ever
          rec.introUnlocked = true;
          rec.introUnlockedAt = now();
          events.push({ type: "intro_unlocked", proposalId: rec.id, aId: rec.aId, bId: rec.bId, at: rec.introUnlockedAt });
        }
      } else {
        rec.state = side === "a" ? "a_answered" : "b_answered";
      }
      return { ok: true, proposal: rec };
    }

    // The ONLY shape a side ever sees before the intro: an allowlist pick.
    // Available while the proposal is open and after both_yes; a declined or
    // expired proposal serves nothing.
    function payloadFor(proposalId, side) {
      const rec = proposals.get(proposalId);
      if (!rec) return fail("NOT_FOUND");
      touchExpiry(rec);
      if (rec.state === "declined" || rec.state === "expired") return fail("PROPOSAL_CLOSED");
      const pitch = side === "a" ? rec.aPitch : rec.bPitch;
      return {
        ok: true,
        payload: { proposalId: rec.id, need: pitch.need, offer: pitch.offer, why: rec.why, expiresAt: rec.expiresAt },
      };
    }

    function expireSweep() {
      const swept = [];
      for (const rec of proposals.values()) if (touchExpiry(rec)) swept.push(rec.id);
      return swept;
    }

    function drainEvents() {
      const out = events;
      events = [];
      return out;
    }

    function get(proposalId) {
      return proposals.get(proposalId) || null;
    }

    function snapshot() {
      return JSON.stringify({ v: 1, seq, proposals: [...proposals.values()], events });
    }

    return { propose, answer, payloadForA: (id) => payloadFor(id, "a"), payloadForB: (id) => payloadFor(id, "b"),
      openProposalFor, expireSweep, drainEvents, get, snapshot };
  }

  return { createConnectorMatch, STATES, OPEN_STATES, TERMINAL_STATES };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerConnectorMatch;
