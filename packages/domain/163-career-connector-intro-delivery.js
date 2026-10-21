/* Career connector INTRO DELIVERY (Lane B, O2; number 163 per coordinator
   assignment). Turns ONE match unlock event (module 158's intro_unlocked)
   into a delivery plan on the in-product inbox surface, and tracks the
   delivery honestly until receipt is proven or a failure is named.

   Pure domain logic, UMD like 157/158/159: no I/O, no sends, no clock reads
   beyond the injected now(). The host performs the actual outbox writes and
   the read-back, and reports outcomes via markWritten / markReadBack /
   markFailed. This module never touches a database or a channel.

   COMPOSITION IS 159's, INJECTED. deps.composeIntro is module 159's
   composeIntro, called with the whitelist-stripped profiles. The guard
   suite injects a byte-faithful fixture copy of 159 @ 29a67280
   (tests/fixtures/159-career-connector-intro.fixture.js, sha256
   8688472aa5b68244f2d0e91dee2b25c4680d255e288424a89b7a777f4e64069f);
   the assembly lane injects the real 159 — identical export surface.

   CONSENT IS 157's, INJECTED, AND RE-READ AT DELIVERY TIME.
   deps.isConsented(personId, scope) is consulted during plan() for scope
   "introduced" on BOTH sides. Consent at match time (158's gate) is not
   enough: a revocation landing between unlock and delivery refuses the
   delivery — and the refusal is RECORDED as a delivery record in the
   terminal "refused" state, with the side named. Silence is not a state.

   THE SURFACE. The primary surface is the in-product inbox: one
   career_outbox row per side (the table the product already reads back to
   its owner under RLS — receipt = the row read back and its text compared
   byte-for-byte, which is exactly what markReadBack verifies). Row shapes
   use only kinds/keys the LIVE schema accepts today (closure, 2026-10-21):
   kind "status", key "status:intro:<proposalId>:<side>" for the intro and
   kind "followup", key "followup:intro:<proposalId>:<side>" for the 72h
   follow-up, whose deliver_at is the composer's due time exactly. The
   table's unique (user_id, key) constraint is the database-level twin of
   this module's idempotency. Channel copies (Telegram/WhatsApp) are
   SPECIFIED in docs/connector/intro-delivery-note-2026-10-21.md only —
   real channels stay closed to real users under the standing rule, and
   nothing here sends anything.

   IDEMPOTENCY. One delivery per proposalId, ever: plan() on an already
   known proposalId returns the existing record with duplicate:true and
   creates nothing — including across snapshot()/restore, and including a
   recorded refusal (a refused delivery is never silently re-planned into a
   send). Retries belong to the write layer on the SAME record
   (markWritten / markFailed), never to re-planning.

   PRIVACY. Profiles are whitelist-stripped to { id, name, headline, need,
   offer } at intake (the same four public fields 159 reads); the delivery
   record stores ids, the composed texts, and row metadata only — never a
   raw profile, never reasoning, never a contact field (guard DELIV-007).

   STATE MACHINE (terminal states: read_back_verified, failed_named,
   refused):
     planned --markWritten(both intro row ids)--> written
     written --markReadBack(texts equal)--> read_back_verified
     written --markReadBack(mismatch)--> failed_named (reason READBACK_MISMATCH, side named)
     planned|written --markFailed(name)--> failed_named (reason = the named failure)
     (at plan) consent not held / profile mismatch / composer refusal --> refused (recorded, zero rows)
   Any other transition is refused with INVALID_TRANSITION and changes
   nothing.

   Export surface for the assembly lane:
     createIntroDelivery(deps, snapshotJson?) -> {
       plan(input), markWritten(id, rowIdsByKey), markReadBack(id, {aText, bText}),
       markFailed(id, errorName), get(id), getByProposal(proposalId), snapshot() }
     deps = { composeIntro (159's, required), isConsented (required),
              now? () -> ms epoch }
     input = { event: {type:"intro_unlocked", proposalId, aId, bId, at},
               a, b (profiles), reasoning: {forA, forB},
               firstStep?, proposedTimes?, introAt? }
   Check: node --test tests/career-connector-intro-delivery.test.cjs */
const CareerConnectorIntroDelivery = (() => {
  "use strict";

  const VERSION = "2026-10-21";
  const RECORD_KIND = "connector_intro_delivery";
  const STATES = Object.freeze(["planned", "written", "read_back_verified", "failed_named", "refused"]);
  const CONSENT_SCOPE = "introduced";
  const INTRO_OUTBOX_KIND = "status";
  const FOLLOWUP_OUTBOX_KIND = "followup";
  const PUBLIC_FIELDS = Object.freeze(["name", "headline", "need", "offer"]);

  const str = (v) => (typeof v === "string" ? v : "");
  const phrase = (v, n) => str(v).replace(/\s+/g, " ").trim().slice(0, n);
  const isoOf = (v) => {
    const t = typeof v === "number" ? v : Date.parse(str(v));
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  };

  // The whitelist, applied once at intake: everything downstream — the
  // composer call and the stored record — sees only this shape.
  function sideOf(p) {
    const o = p && typeof p === "object" ? p : {};
    return {
      id: str(o.id).trim(),
      name: phrase(o.name, 80),
      headline: phrase(o.headline, 200),
      need: phrase(o.need, 400),
      offer: phrase(o.offer, 400),
    };
  }

  function createIntroDelivery(deps, snapshotJson) {
    if (!deps || typeof deps.composeIntro !== "function") {
      throw new TypeError("createIntroDelivery: deps.composeIntro (module 159) is required");
    }
    if (typeof deps.isConsented !== "function") {
      throw new TypeError("createIntroDelivery: deps.isConsented(personId, scope) predicate is required");
    }
    const composeIntro = deps.composeIntro;
    const isConsented = deps.isConsented;
    const now = typeof deps.now === "function" ? deps.now : Date.now;

    const byId = new Map();
    const byProposal = new Map();

    if (snapshotJson != null) {
      const snap = typeof snapshotJson === "string" ? JSON.parse(snapshotJson) : snapshotJson;
      if (!snap || !Array.isArray(snap.deliveries)) throw new TypeError("createIntroDelivery: malformed snapshot");
      for (const rec of snap.deliveries) {
        byId.set(rec.id, rec);
        byProposal.set(rec.proposal_id, rec);
      }
    }

    const stamp = () => new Date(now()).toISOString();
    function fail(code, extra) {
      return Object.assign({ ok: false, code }, extra || {});
    }

    function store(rec) {
      byId.set(rec.id, rec);
      byProposal.set(rec.proposal_id, rec);
      return rec;
    }

    // A refusal is a first-class recorded delivery: state "refused", the
    // reason named, zero outbox rows. The caller can prove the delivery was
    // considered and refused — and why — instead of finding nothing.
    function recordRefusal(base, reason, extra) {
      const t = stamp();
      const rec = Object.assign({}, base, {
        state: "refused",
        reason,
        refused_side: extra && extra.refused_side ? extra.refused_side : null,
        failed_side: null,
        composer_missing: extra && Array.isArray(extra.composer_missing) ? extra.composer_missing.slice() : null,
        booking_status: null,
        follow_up_due_at: null,
        rows: [],
        history: [{ at: t, type: "refused", reason }],
        created_at: t,
        updated_at: t,
      });
      store(rec);
      return fail(reason, { delivery: rec });
    }

    function plan(input) {
      const inp = input && typeof input === "object" ? input : {};
      const ev = inp.event;
      if (!ev || typeof ev !== "object" || ev.type !== "intro_unlocked") return fail("NO_UNLOCK_EVENT");
      const proposalId = str(ev.proposalId).trim();
      const aId = str(ev.aId).trim();
      const bId = str(ev.bId).trim();
      const atMs = Number(ev.at);
      if (!proposalId || !aId || !bId || aId === bId || !Number.isFinite(atMs)) return fail("INVALID_UNLOCK_EVENT");

      const existing = byProposal.get(proposalId);
      if (existing) return { ok: true, duplicate: true, delivery: existing };

      const a = sideOf(inp.a);
      const b = sideOf(inp.b);
      const base = {
        id: "introdlv:" + proposalId,
        kind: RECORD_KIND,
        version: VERSION,
        proposal_id: proposalId,
        intro_id: "intro:" + proposalId,
        a_id: aId,
        b_id: bId,
      };

      if (a.id !== aId || b.id !== bId) return recordRefusal(base, "EVENT_PROFILE_MISMATCH");
      // Consent is re-read NOW, at delivery time — never inherited from the
      // match. 157 semantics make a revocation retroactive, so a person who
      // opted out after the unlock is not introduced to anyone.
      if (!isConsented(aId, CONSENT_SCOPE)) return recordRefusal(base, "CONSENT_NOT_HELD_AT_DELIVERY", { refused_side: "a" });
      if (!isConsented(bId, CONSENT_SCOPE)) return recordRefusal(base, "CONSENT_NOT_HELD_AT_DELIVERY", { refused_side: "b" });

      const introISO = isoOf(inp.introAt) || new Date(atMs).toISOString();
      const composed = composeIntro({
        a, b,
        reasoning: inp.reasoning,
        firstStep: inp.firstStep,
        proposedTimes: inp.proposedTimes,
        introAt: introISO,
        matchId: proposalId,
        introId: base.intro_id,
      });
      if (!composed || !composed.ok) {
        return recordRefusal(base, "COMPOSER_REFUSED", {
          composer_missing: composed && Array.isArray(composed.missing) ? composed.missing : [],
        });
      }

      const rows = [];
      for (const [side, uid] of [["a", aId], ["b", bId]]) {
        rows.push({
          side, purpose: "intro", surface: "inbox", user_id: uid,
          outbox: {
            user_id: uid,
            kind: INTRO_OUTBOX_KIND,
            key: `${INTRO_OUTBOX_KIND}:intro:${proposalId}:${side}`,
            text: composed.message,
            deliver_at: introISO,
          },
          outbox_row_id: null,
        });
      }
      if (composed.follow_up && composed.follow_up.message && composed.follow_up.record) {
        for (const [side, uid] of [["a", aId], ["b", bId]]) {
          rows.push({
            side, purpose: "follow_up", surface: "inbox", user_id: uid,
            outbox: {
              user_id: uid,
              kind: FOLLOWUP_OUTBOX_KIND,
              key: `${FOLLOWUP_OUTBOX_KIND}:intro:${proposalId}:${side}`,
              text: composed.follow_up.message,
              deliver_at: composed.follow_up.record.due_at,
            },
            outbox_row_id: null,
          });
        }
      }

      const t = stamp();
      const rec = Object.assign({}, base, {
        state: "planned",
        reason: null,
        refused_side: null,
        failed_side: null,
        composer_missing: null,
        booking_status: composed.booking ? composed.booking.status : null,
        follow_up_due_at: composed.follow_up ? composed.follow_up.record.due_at : null,
        rows,
        history: [{ at: t, type: "planned" }],
        created_at: t,
        updated_at: t,
      });
      store(rec);
      return { ok: true, delivery: rec };
    }

    function get(id) {
      return byId.get(id) || null;
    }

    function getByProposal(proposalId) {
      return byProposal.get(str(proposalId).trim()) || null;
    }

    function transition(rec, type, extra) {
      rec.history.push(Object.assign({ at: stamp(), type }, extra || {}));
      rec.updated_at = stamp();
    }

    // The host reports the outbox row ids its insert returned, keyed by
    // outbox key. Both INTRO row ids are required — a half-written intro
    // (one person written, the other not) is a named failure of the write
    // report, never a silent partial state on this record.
    function markWritten(id, rowIdsByKey) {
      const rec = byId.get(id);
      if (!rec) return fail("NOT_FOUND");
      if (rec.state !== "planned") return fail("INVALID_TRANSITION", { delivery: rec });
      const ids = rowIdsByKey && typeof rowIdsByKey === "object" ? rowIdsByKey : {};
      const introRows = rec.rows.filter((r) => r.purpose === "intro");
      for (const row of introRows) {
        const v = ids[row.outbox.key];
        if (v == null || v === "") return fail("INCOMPLETE_WRITE_REPORT", { delivery: rec, missing_key: row.outbox.key });
      }
      for (const row of rec.rows) {
        const v = ids[row.outbox.key];
        if (v != null && v !== "") row.outbox_row_id = v;
      }
      rec.state = "written";
      transition(rec, "written");
      return { ok: true, delivery: rec };
    }

    // Receipt proof: the host read both intro rows back (as the owner, under
    // RLS) and hands the texts here. Equality with the planned text is the
    // verification — anything else fails NAMED, with the side.
    function markReadBack(id, texts) {
      const rec = byId.get(id);
      if (!rec) return fail("NOT_FOUND");
      if (rec.state !== "written") return fail("INVALID_TRANSITION", { delivery: rec });
      const t = texts && typeof texts === "object" ? texts : {};
      for (const [side, field] of [["a", "aText"], ["b", "bText"]]) {
        const row = rec.rows.find((r) => r.purpose === "intro" && r.side === side);
        if (t[field] !== row.outbox.text) {
          rec.state = "failed_named";
          rec.reason = "READBACK_MISMATCH";
          rec.failed_side = side;
          transition(rec, "failed_named", { reason: "READBACK_MISMATCH", side });
          return fail("READBACK_MISMATCH", { delivery: rec, side });
        }
      }
      rec.state = "read_back_verified";
      transition(rec, "read_back_verified");
      return { ok: true, delivery: rec };
    }

    function markFailed(id, errorName) {
      const rec = byId.get(id);
      if (!rec) return fail("NOT_FOUND");
      if (rec.state !== "planned" && rec.state !== "written") return fail("INVALID_TRANSITION", { delivery: rec });
      const name = phrase(errorName, 200);
      if (!name) return fail("INVALID_FAILURE_NAME", { delivery: rec });
      rec.state = "failed_named";
      rec.reason = name;
      transition(rec, "failed_named", { reason: name });
      return { ok: true, delivery: rec };
    }

    function snapshot() {
      return JSON.stringify({ deliveries: Array.from(byId.values()) });
    }

    return { plan, markWritten, markReadBack, markFailed, get, getByProposal, snapshot };
  }

  return { VERSION, RECORD_KIND, STATES, CONSENT_SCOPE, INTRO_OUTBOX_KIND, FOLLOWUP_OUTBOX_KIND, PUBLIC_FIELDS, createIntroDelivery };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerConnectorIntroDelivery;
