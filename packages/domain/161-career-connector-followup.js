/* Career connector 72H FOLLOW-UP (Lane B; number 161 per coordinator
   assignment). Pure, deterministic state machine: no I/O, no clock reads
   (every time is injected), no sends. It turns a DELIVERED intro into the
   follow-up plan that makes the 72-hour check-in actually fire — the plan
   is the unit the host persists (snapshot/restore) and acts on; delivery
   itself rides the career_outbox claim path (see
   docs/connector/followup-trigger-note-2026-10-21.md).

   Due math is exact and pinned, never recomputed loosely: due_at =
   delivered_at + 72h to the millisecond (259,200,000 ms, the same constant
   module 159 stamps on its follow-up record). The message text comes ONLY
   from 159's composeFollowUp, injected as deps.composeFollowUp, and the
   module PINS that contract: a composed record whose kind is not
   "connector_follow_up" or whose due_at is off by even 1 ms is refused
   (COMPOSER_CONTRACT_VIOLATION) rather than trusted.

   Idempotency: the plan id and idempotency key are introId + ":fu72".
   Scheduling the same intro twice returns the existing plan verbatim —
   first schedule wins, including its recorded quiet-hours shifts — so a
   retry, a double delivery event, or a restart can never create a second
   plan, and a plan that reached a terminal state can never re-fire
   (guards FU72-002, FU72-011, FU72-012). At the database layer the same
   key becomes the career_outbox key "followup:<introId>:fu72" under the
   UNIQUE (user_id, key) constraint — the backstop, named in the note.

   State machine (per plan): scheduled -> due -> written ->
   read_back_verified | failed_named | cancelled_on_revoke. Each side
   carries its own delivery entry (pending -> written -> verified |
   failed_named | cancelled_on_revoke) because quiet hours can shift one
   side's fire time without moving the other's — the recorded due_at
   NEVER moves; only fire_at does, and every shift is recorded with both
   timestamps and the reason (guard FU72-005). A side with no known time
   zone is not assumed into one: it fires at the due time and carries the
   named warning (FU72-007).

   Consent is load-bearing twice. applyRevoke cancels an open plan whole —
   the follow-up names BOTH people, so one side's revocation silences it
   for both, honestly and on the record (cancel.by_*). And fire()
   re-checks consent at fire time through the injected predicate
   (deps.isConsented, or a per-call predicate): consent revoked between
   scheduling and due cancels at fire instead of sending (FU72-009).

   Failure is named, never silent: read-back verification compares the
   written outbox row's key, text and deliver_at against the plan and a
   mismatch lands the plan in failed_named with the differing field on the
   record; markFailed records the caller's reason verbatim.

   Export surface for the integration lane:
     createConnectorFollowUp(deps, snapshotJson?) -> machine
       deps.composeFollowUp  REQUIRED — module 159's composeFollowUp
       deps.isConsented      optional — (personId) -> boolean, fire-time
     machine: schedule(intro, opts), tick(nowMs), fireCandidates(nowMs),
       fire(id, nowMs, isConsented?), applyRevoke(id, personId, atMs),
       markWritten(id, side, outboxId, atMs),
       markReadBack(id, side, row, atMs), markFailed(id, side, reason, atMs),
       get(id), list(), snapshot()
     intro = { introId, matchId?, aId, bId, aName, bName, deliveredAt }
     opts  = { now?, aTimeZone?, bTimeZone? }   (IANA names, per side)
   Check: node --test tests/career-connector-followup.test.cjs */
const CareerConnectorFollowUp = (() => {
  const VERSION = "2026-10-21";
  const FOLLOW_UP_AFTER_MS = 72 * 60 * 60 * 1000; // mirrors module 159
  const PLAN_KIND = "connector_follow_up_plan";
  const SNAPSHOT_KIND = "connector_follow_up_snapshot";
  const COMPOSED_KIND = "connector_follow_up"; // 159's record kind
  const OUTBOX_KIND = "followup"; // career_outbox kind (live constraint)
  const STATES = ["scheduled", "due", "written", "read_back_verified", "failed_named", "cancelled_on_revoke"];
  const OPEN_STATES = ["scheduled", "due"];
  const TERMINAL_STATES = ["read_back_verified", "failed_named", "cancelled_on_revoke"];
  const QUIET_START_HOUR = 22; // 22:00 recipient-local
  const QUIET_END_HOUR = 8; // through 08:00 recipient-local
  const MAX_OUTBOX_KEY = 310; // live career_outbox key check
  const MAX_OUTBOX_TEXT = 4000; // live career_outbox text check

  const str = (v) => typeof v === "string" ? v : "";
  const iso = (ms) => new Date(ms).toISOString();
  const fail = (code, extra) => Object.assign({ ok: false, code }, extra || {});

  const idempotencyKeyFor = (introId) => str(introId).trim() + ":fu72";
  const outboxKeyFor = (introId) => "followup:" + idempotencyKeyFor(introId);

  // --- recipient-local time (Intl only; no libraries) -----------------------
  const dtfCache = new Map();
  function dtf(tz) {
    if (!dtfCache.has(tz)) {
      dtfCache.set(tz, new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }));
    }
    return dtfCache.get(tz);
  }
  function validTimeZone(tz) {
    try { dtf(tz).format(0); return true; } catch { return false; }
  }
  function localParts(ms, tz) {
    const o = {};
    for (const p of dtf(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
    return { y: +o.year, mo: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, s: +o.second };
  }
  function tzOffsetMs(ms, tz) {
    const p = localParts(ms, tz);
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
  }
  function zonedToUtcMs(y, mo, d, h, mi, tz) {
    const target = Date.UTC(y, mo - 1, d, h, mi, 0);
    let guess = target;
    for (let i = 0; i < 3; i++) {
      const next = target - tzOffsetMs(guess, tz);
      if (next === guess) break;
      guess = next;
    }
    return guess;
  }

  // The fire time for one side: the due instant, shifted out of quiet hours
  // (22:00-08:00 recipient-local) to the next 08:00 local when it lands
  // inside them. The shift is returned, never applied silently.
  function quietShiftFor(dueMs, tz) {
    if (!tz) return { fireMs: dueMs, shift: null, warning: "quiet_hours_not_applied:no_time_zone" };
    if (!validTimeZone(tz)) return { fireMs: dueMs, shift: null, warning: "quiet_hours_not_applied:invalid_time_zone" };
    const p = localParts(dueMs, tz);
    if (!(p.h >= QUIET_START_HOUR || p.h < QUIET_END_HOUR)) {
      return { fireMs: dueMs, shift: null, warning: null };
    }
    let { y, mo, d } = p;
    if (p.h >= QUIET_START_HOUR) {
      const nx = new Date(Date.UTC(y, mo - 1, d + 1));
      y = nx.getUTCFullYear(); mo = nx.getUTCMonth() + 1; d = nx.getUTCDate();
    }
    let fireMs = zonedToUtcMs(y, mo, d, QUIET_END_HOUR, 0, tz);
    // Verify against the zone (a DST seam can move the offset mid-guess);
    // bounded whole-hour correction, then the verified value stands.
    for (let i = 0; i < 3; i++) {
      const lp = localParts(fireMs, tz);
      if (lp.h === QUIET_END_HOUR && lp.mi === 0) break;
      fireMs += ((QUIET_END_HOUR - lp.h + 24) % 24) * 3600000;
    }
    return {
      fireMs,
      shift: { applied: true, from: iso(dueMs), to: iso(fireMs), time_zone: tz, reason: "quiet_hours_22_08" },
      warning: null,
    };
  }

  function createConnectorFollowUp(deps, snapshotJson) {
    if (!deps || typeof deps.composeFollowUp !== "function") {
      throw new TypeError("createConnectorFollowUp: deps.composeFollowUp (module 159) is required");
    }
    const composeFollowUp = deps.composeFollowUp;
    const depsIsConsented = typeof deps.isConsented === "function" ? deps.isConsented : null;

    const plans = new Map();
    if (snapshotJson != null) {
      const snap = typeof snapshotJson === "string" ? JSON.parse(snapshotJson) : snapshotJson;
      if (!snap || snap.kind !== SNAPSHOT_KIND || !Array.isArray(snap.plans)) {
        throw new TypeError("createConnectorFollowUp: malformed snapshot");
      }
      for (const raw of snap.plans) {
        const plan = JSON.parse(JSON.stringify(raw));
        if (!plan || typeof plan.id !== "string" || !Array.isArray(plan.sides)) {
          throw new TypeError("createConnectorFollowUp: malformed plan in snapshot");
        }
        plans.set(plan.id, plan);
      }
    }

    const sideOf = (plan, side) => plan.sides.find((s) => s.side === side) || null;
    const pendingSides = (plan) => plan.sides.filter((s) => s.status === "pending");
    function hist(plan, atMs, event, detail) {
      plan.history.push(Object.assign({ at: iso(atMs), event }, detail || {}));
    }

    function schedule(intro, opts) {
      const o = opts && typeof opts === "object" ? opts : {};
      if (!intro || typeof intro !== "object") return fail("INVALID_INPUT");
      const introId = str(intro.introId).trim();
      const aId = str(intro.aId).trim();
      const bId = str(intro.bId).trim();
      if (!introId || !aId || !bId) return fail("INVALID_INPUT");
      const id = idempotencyKeyFor(introId);
      const existing = plans.get(id);
      if (existing) return { ok: true, duplicate: true, plan: existing };
      if (aId === bId) return fail("SAME_PERSON");
      const deliveredMs = Date.parse(str(intro.deliveredAt));
      if (!Number.isFinite(deliveredMs)) return fail("INVALID_DELIVERED_AT");
      const aName = str(intro.aName).trim();
      const bName = str(intro.bName).trim();
      if (!aName || !bName) {
        return fail("MISSING_NAME", { missing: [!aName && "aName", !bName && "bName"].filter(Boolean) });
      }
      const composed = composeFollowUp({
        a: { id: aId, name: aName }, b: { id: bId, name: bName },
        introAt: iso(deliveredMs), matchId: str(intro.matchId).trim() || undefined, introId,
      });
      if (!composed || typeof composed.message !== "string" || !composed.record) {
        return fail("COMPOSER_REFUSED");
      }
      const dueMs = deliveredMs + FOLLOW_UP_AFTER_MS;
      if (composed.record.kind !== COMPOSED_KIND || Date.parse(composed.record.due_at) !== dueMs) {
        return fail("COMPOSER_CONTRACT_VIOLATION");
      }
      const text = composed.message;
      const key = outboxKeyFor(introId);
      if (key.length > MAX_OUTBOX_KEY) return fail("IDEMPOTENCY_KEY_TOO_LONG");
      if (text.length < 1 || text.length > MAX_OUTBOX_TEXT) return fail("PAYLOAD_LENGTH_VIOLATION");
      const nowMs = Number.isFinite(o.now) ? o.now : deliveredMs;
      const mkSide = (side, userId, tzRaw) => {
        const q = quietShiftFor(dueMs, str(tzRaw).trim() || null);
        return {
          side, user_id: userId, key, kind: OUTBOX_KIND, text,
          due_at: iso(dueMs), fire_at: iso(q.fireMs), quiet_shift: q.shift,
          warnings: q.warning ? [q.warning] : [],
          status: "pending", outbox_id: null, failure: null,
        };
      };
      const plan = {
        kind: PLAN_KIND, version: VERSION, id, idempotency_key: id,
        intro_id: introId, match_id: str(intro.matchId).trim() || null,
        a_id: aId, b_id: bId,
        delivered_at: iso(deliveredMs), due_at: iso(dueMs),
        status: "scheduled",
        sides: [mkSide("a", aId, o.aTimeZone), mkSide("b", bId, o.bTimeZone)],
        cancel: null, failure: null,
        created_at: iso(nowMs), history: [],
      };
      hist(plan, nowMs, "scheduled", { due_at: plan.due_at });
      for (const s of plan.sides) {
        if (s.quiet_shift) {
          hist(plan, nowMs, "quiet_shift_applied", {
            side: s.side, from: s.quiet_shift.from, to: s.quiet_shift.to, time_zone: s.quiet_shift.time_zone,
          });
        }
      }
      plans.set(id, plan);
      return { ok: true, duplicate: false, plan };
    }

    // Advance every scheduled plan whose earliest pending side has reached
    // its fire time. Returns the plans that changed.
    function tick(nowMs) {
      const changed = [];
      for (const plan of plans.values()) {
        if (plan.status !== "scheduled") continue;
        if (pendingSides(plan).some((s) => Date.parse(s.fire_at) <= nowMs)) {
          plan.status = "due";
          hist(plan, nowMs, "due", {});
          changed.push(plan);
        }
      }
      return changed;
    }

    function fireCandidates(nowMs) {
      const out = [];
      for (const plan of plans.values()) {
        if (plan.status !== "due") continue;
        if (pendingSides(plan).some((s) => Date.parse(s.fire_at) <= nowMs)) out.push(plan);
      }
      return out;
    }

    // Produce the per-side outbox payloads for the sides whose fire time
    // has arrived. Consent is re-checked first: a revocation that landed
    // after scheduling cancels the plan here instead of sending.
    function fire(id, nowMs, isConsented) {
      const plan = plans.get(id);
      if (!plan) return fail("NOT_FOUND");
      if (TERMINAL_STATES.includes(plan.status)) return fail("PLAN_TERMINAL", { plan });
      if (plan.status === "written") return fail("ALREADY_WRITTEN", { plan });
      if (plan.status !== "due") return fail("NOT_DUE", { plan });
      const check = typeof isConsented === "function" ? isConsented : depsIsConsented;
      if (check) {
        for (const personId of [plan.a_id, plan.b_id]) {
          if (!check(personId)) {
            const bySide = personId === plan.a_id ? "a" : "b";
            plan.status = "cancelled_on_revoke";
            plan.cancel = { by_user_id: personId, by_side: bySide, at: iso(nowMs), via: "fire_time_consent_check" };
            for (const s of plan.sides) if (s.status === "pending") s.status = "cancelled_on_revoke";
            hist(plan, nowMs, "cancelled_on_revoke", { by_user_id: personId, by_side: bySide, via: "fire_time_consent_check" });
            return fail("CONSENT_REVOKED_AT_FIRE", { plan });
          }
        }
      }
      const ready = pendingSides(plan).filter((s) => Date.parse(s.fire_at) <= nowMs);
      if (!ready.length) return fail("NOT_DUE", { plan });
      hist(plan, nowMs, "fire_payloads_issued", { sides: ready.map((s) => s.side) });
      return {
        ok: true, plan,
        payloads: ready.map((s) => ({
          side: s.side, user_id: s.user_id, key: s.key, kind: s.kind,
          text: s.text, deliver_at: s.fire_at, idempotency_key: plan.idempotency_key,
        })),
      };
    }

    function applyRevoke(id, personId, atMs) {
      const plan = plans.get(id);
      if (!plan) return fail("NOT_FOUND");
      if (!OPEN_STATES.includes(plan.status)) return fail("PLAN_NOT_OPEN", { plan });
      const bySide = plan.a_id === personId ? "a" : plan.b_id === personId ? "b" : null;
      if (!bySide) return fail("NOT_A_PARTY", { plan });
      plan.status = "cancelled_on_revoke";
      plan.cancel = { by_user_id: personId, by_side: bySide, at: iso(atMs), via: "revoke_event" };
      for (const s of plan.sides) if (s.status === "pending") s.status = "cancelled_on_revoke";
      hist(plan, atMs, "cancelled_on_revoke", { by_user_id: personId, by_side: bySide, via: "revoke_event" });
      return { ok: true, plan };
    }

    function markWritten(id, side, outboxId, atMs) {
      const plan = plans.get(id);
      if (!plan) return fail("NOT_FOUND");
      if (TERMINAL_STATES.includes(plan.status)) return fail("PLAN_TERMINAL", { plan });
      const s = sideOf(plan, side);
      if (!s) return fail("UNKNOWN_SIDE", { plan });
      if (plan.status !== "due" || s.status !== "pending") return fail("INVALID_TRANSITION", { plan });
      s.status = "written";
      s.outbox_id = outboxId != null ? outboxId : null;
      hist(plan, atMs, "written", { side, outbox_id: s.outbox_id });
      if (!pendingSides(plan).length && plan.sides.some((x) => x.status === "written")) {
        plan.status = "written";
        hist(plan, atMs, "all_written", {});
      }
      return { ok: true, plan };
    }

    function markReadBack(id, side, row, atMs) {
      const plan = plans.get(id);
      if (!plan) return fail("NOT_FOUND");
      if (TERMINAL_STATES.includes(plan.status)) return fail("PLAN_TERMINAL", { plan });
      const s = sideOf(plan, side);
      if (!s) return fail("UNKNOWN_SIDE", { plan });
      if (s.status !== "written") return fail("INVALID_TRANSITION", { plan });
      const r = row && typeof row === "object" ? row : {};
      const field = r.key !== s.key ? "key"
        : r.text !== s.text ? "text"
        : Date.parse(str(r.deliver_at)) !== Date.parse(s.fire_at) ? "deliver_at"
        : null;
      if (field) {
        s.status = "failed_named";
        s.failure = { reason: "read_back_mismatch", field };
        plan.status = "failed_named";
        plan.failure = { side, reason: "read_back_mismatch", field };
        hist(plan, atMs, "failed_named", { side, reason: "read_back_mismatch", field });
        return fail("READ_BACK_MISMATCH", { plan, field });
      }
      s.status = "verified";
      hist(plan, atMs, "read_back_verified", { side });
      if (plan.sides.every((x) => x.status === "verified" || x.status === "cancelled_on_revoke")
        && plan.sides.some((x) => x.status === "verified")) {
        plan.status = "read_back_verified";
        hist(plan, atMs, "plan_read_back_verified", {});
      }
      return { ok: true, plan };
    }

    function markFailed(id, side, reason, atMs) {
      const plan = plans.get(id);
      if (!plan) return fail("NOT_FOUND");
      if (TERMINAL_STATES.includes(plan.status)) return fail("PLAN_TERMINAL", { plan });
      const named = str(reason).trim();
      if (!named) return fail("INVALID_INPUT", { plan });
      if (side) {
        const s = sideOf(plan, side);
        if (!s) return fail("UNKNOWN_SIDE", { plan });
        s.status = "failed_named";
        s.failure = { reason: named };
      }
      plan.status = "failed_named";
      plan.failure = { side: side || null, reason: named };
      hist(plan, atMs, "failed_named", { side: side || null, reason: named });
      return { ok: true, plan };
    }

    function get(id) { return plans.get(id) || null; }
    function list() { return [...plans.values()]; }
    function snapshot() {
      return JSON.stringify({ kind: SNAPSHOT_KIND, version: VERSION, plans: [...plans.values()] });
    }

    return {
      schedule, tick, fireCandidates, fire, applyRevoke,
      markWritten, markReadBack, markFailed, get, list, snapshot,
    };
  }

  return {
    VERSION, FOLLOW_UP_AFTER_MS, PLAN_KIND, SNAPSHOT_KIND, OUTBOX_KIND,
    STATES, OPEN_STATES, TERMINAL_STATES,
    QUIET_HOURS: { start: QUIET_START_HOUR, end: QUIET_END_HOUR },
    idempotencyKeyFor, outboxKeyFor, quietShiftFor,
    createConnectorFollowUp,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerConnectorFollowUp;
