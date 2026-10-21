/* Career connector INTRO BOOKING (Lane B; number 160 per coordinator
   assignment). Pure, deterministic: no I/O, no LLM, no calendar API, no
   clock reads except the injected deps.now. Fixtures callers only — this
   module sends nothing and creates nothing outside its own records.

   WHY THIS EXISTS: the intro composer (159) honestly emits booking as
   "offered_not_booked" with requires:"google_connect", because the
   in-product Google connect has never been tapped — so no calendar event
   can be created and, under the owner's definition, no match can count
   (a match counts only when both sides opt in AND a call is booked).

   THE BOOKED DEFINITION, AS IMPLEMENTED: booked=true is an in-product
   time agreement, not a calendar event. One side proposes 1–3 time slots
   (each a wall-clock time in an explicit IANA timezone); each side then
   confirms or declines INDEPENDENTLY inside the product; the call is
   booked only when both sides have confirmed the SAME slot — when both
   accept several, the first common slot in proposal order wins. The
   artifact is the confirmed record (slot, timezone, both confirmations
   with timestamps, status "booked") plus a standard .ics file each side
   can add to any calendar in one tap. The record carries
   calendar_event_created:false — no native event exists, and nothing
   here claims one. Google connect, when it lands, upgrades the artifact
   (a native event created from the same booked record) without changing
   any state in this machine.

   The .ics is deliberately bare: DTSTART/DTEND in UTC, SUMMARY with
   first names only, no LOCATION, no link, no organizer — a meeting link
   is never invented, and a placeholder claiming one is forbidden.

   State machine (per booking):
     propose ─> awaiting_confirmations ──both confirm same slot──> booked (terminal)
                      │  both responded, no common slot ─┐
                      │  either side declines all slots ─┴─> needs_new_times
                      │                                        │ proposeTimes (round 2)
                      │                                        └─> awaiting_confirmations
                      │  round 2 closes without agreement ─────> unbooked (terminal,
                      │                                            reason rounds_exhausted)
                      └─ now >= expiresAt (lazy, or expireSweep) ─> expired (terminal,
                                                                       reason expired)
   Each round expires on its own deadline (default TTL 72h): a
   needs_new_times booking whose new times never arrive expires too.
   Answers are exactly-once per side per round — the first stands; a
   confirmation naming slots from a superseded round (or after expiry)
   is a no-op, never an error and never applied. Slot ids are
   round-scoped (r1s1, r2s1, ...) precisely so staleness is detectable.

   Identity/privacy: the machine stores participant ids and display
   names (first names are all the .ics ever renders). Extra fields on
   the input (emails, phones, notes) are never read and can never reach
   a record or the artifact (test BOOK-018).

   Export surface for the integration lane:
     createConnectorBooking(deps?, snapshotJson?)
       deps: { now?: () => ms, nextId?: () => string }
       -> { propose, confirm, declineAll, proposeTimes, expireSweep,
            get, ics, drainEvents, snapshot }
     buildICalendar(record) -> string | null   (byte-stable per record)
     VERSION, MAX_SLOTS, MAX_ROUNDS, DEFAULT_DURATION_MIN,
     DEFAULT_TTL_MS, STATES, TERMINAL_STATES
   propose input = { aId, bId, aName, bName, matchId?, introId?,
                     slots: [{ start: "YYYY-MM-DDTHH:MM", timezone,
                               durationMin? }],  // 1..3, wall time in tz
                     durationMin?, ttlMs? }
   Check: node --test tests/career-connector-booking.test.cjs */
const CareerConnectorBooking = (() => {
  const VERSION = "2026-10-21";
  const MAX_SLOTS = 3;
  const MAX_ROUNDS = 2;
  const DEFAULT_DURATION_MIN = 20;
  const DEFAULT_TTL_MS = 72 * 60 * 60 * 1000;
  const STATES = ["awaiting_confirmations", "needs_new_times", "booked", "unbooked", "expired"];
  const TERMINAL_STATES = ["booked", "unbooked", "expired"];

  const str = (v) => typeof v === "string" ? v : "";
  const phrase = (v, n) => str(v).replace(/\s+/g, " ").trim().slice(0, n);
  const firstNameOf = (name) => phrase(name, 80).split(" ")[0] || "";
  const iso = (ms) => new Date(ms).toISOString();

  // --- Timezone conversion (Intl only; grounded against `date -d`) --------
  const dtfCache = new Map();
  function dtf(tz, withSeconds) {
    const key = tz + (withSeconds ? "|s" : "|m");
    if (!dtfCache.has(key)) {
      dtfCache.set(key, new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
        ...(withSeconds ? { second: "2-digit" } : {}),
      }));
    }
    return dtfCache.get(key);
  }
  function tzValid(tz) {
    try { dtf(tz, false); return true; } catch { return false; }
  }
  function partsIn(tz, utcMs, withSeconds) {
    const p = {};
    for (const part of dtf(tz, withSeconds).formatToParts(new Date(utcMs))) p[part.type] = part.value;
    p.hour = String((+p.hour) % 24).padStart(2, "0"); // h23 can report 24 at midnight in some engines
    return p;
  }
  function tzOffsetMs(tz, utcMs) {
    const p = partsIn(tz, utcMs, true);
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return asUTC - Math.floor(utcMs / 1000) * 1000;
  }
  function zonedToUtcMs(tz, y, mo, d, h, mi) {
    const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
    let utc = guess - tzOffsetMs(tz, guess);
    const refined = guess - tzOffsetMs(tz, utc);
    if (refined !== utc) utc = refined; // the guess straddled a DST transition
    return utc;
  }
  function renderLocal(tz, utcMs) {
    const p = partsIn(tz, utcMs, false);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }

  // --- Slot parsing ---------------------------------------------------------
  const START_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
  function parseSlot(raw, round, idx, defaultDuration, nowMs) {
    if (!raw || typeof raw !== "object") return null;
    const tz = str(raw.timezone).trim();
    if (!tz || !tzValid(tz)) return null;
    const m = START_RE.exec(str(raw.start).trim());
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5];
    if (m[6] != null && +m[6] !== 0) return null; // minute precision only
    const probe = new Date(Date.UTC(y, mo - 1, d, h, mi));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d
      || probe.getUTCHours() !== h || probe.getUTCMinutes() !== mi) return null; // rolled over: not a real wall time
    const dur = raw.durationMin == null ? defaultDuration : raw.durationMin;
    if (!Number.isFinite(dur) || dur <= 0 || dur > 480) return null;
    const startMin = zonedToUtcMs(tz, y, mo, d, h, mi);
    if (startMin <= nowMs) return null; // never propose the past
    return {
      id: `r${round}s${idx + 1}`,
      startMin, endMin: startMin + dur * 60000, durationMin: dur,
      timezone: tz, localStart: renderLocal(tz, startMin),
      startUtc: iso(startMin), endUtc: iso(startMin + dur * 60000),
    };
  }
  function parseSlots(rawSlots, round, defaultDuration, nowMs) {
    if (!Array.isArray(rawSlots) || rawSlots.length < 1 || rawSlots.length > MAX_SLOTS) return { code: "INVALID_SLOTS" };
    const slots = [];
    for (let i = 0; i < rawSlots.length; i++) {
      const s = parseSlot(rawSlots[i], round, i, defaultDuration, nowMs);
      if (!s) return { code: "INVALID_SLOT" };
      if (slots.some((x) => x.startMin === s.startMin)) return { code: "INVALID_SLOT" }; // same instant twice is one slot
      slots.push(s);
    }
    return { slots };
  }

  // --- The .ics artifact ------------------------------------------------------
  const escText = (s) => str(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
  const basic = (isoStr) => str(isoStr).replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  function utf8Len(s) {
    let n = 0;
    for (const ch of s) { const cp = ch.codePointAt(0); n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; }
    return n;
  }
  function foldLine(line) { // RFC 5545: physical lines <= 75 octets, continuations start with one space
    if (utf8Len(line) <= 75) return line;
    const out = [];
    let cur = "", curBytes = 0;
    for (const ch of line) {
      const b = utf8Len(ch);
      if (curBytes + b > 75) { out.push(cur); cur = " " + ch; curBytes = 1 + b; }
      else { cur += ch; curBytes += b; }
    }
    out.push(cur);
    return out.join("\r\n");
  }
  function buildICalendar(record) {
    if (!record || typeof record !== "object" || !record.booked || record.booked.status !== "booked") return null;
    const b = record.booked;
    const aFirst = str(record.aFirstName) || firstNameOf(record.aName);
    const bFirst = str(record.bFirstName) || firstNameOf(record.bName);
    const description = "Booked in Trainee: both sides confirmed this slot. "
      + `${b.localStart} ${b.timezone} (${basic(b.startUtc)} UTC). `
      + `${aFirst} confirmed ${b.aConfirmedAt}; ${bFirst} confirmed ${b.bConfirmedAt}.`;
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      `PRODID:-//Trainee//Connector Booking ${VERSION}//EN`,
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${record.id}@trainee.connector`,
      `DTSTAMP:${basic(b.bookedAt)}`,
      `DTSTART:${basic(b.startUtc)}`,
      `DTEND:${basic(b.endUtc)}`,
      `SUMMARY:${escText(`Intro call: ${aFirst} + ${bFirst}`)}`,
      `DESCRIPTION:${escText(description)}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ];
    // DTSTAMP is the booked-at instant, so the same record always renders
    // the same bytes — no wall clock is ever read here.
    return lines.map(foldLine).join("\r\n") + "\r\n";
  }

  // --- The state machine ------------------------------------------------------
  function createConnectorBooking(deps, snapshotJson) {
    const d = deps && typeof deps === "object" ? deps : {};
    const now = typeof d.now === "function" ? d.now : () => Date.now();
    let counter = 0;
    const nextId = typeof d.nextId === "function" ? d.nextId : () => "bk-" + (++counter);
    let records = new Map();
    let events = [];
    if (snapshotJson) {
      try {
        const parsed = JSON.parse(snapshotJson);
        if (parsed && Array.isArray(parsed.records)) records = new Map(parsed.records.map((r) => [r.id, r]));
        if (parsed && Array.isArray(parsed.events)) events = parsed.events.slice();
      } catch { /* a corrupt snapshot starts empty rather than throwing */ }
    }

    function touch(rec) { // lazy expiry; returns true when this call expired the record
      if (TERMINAL_STATES.includes(rec.state)) return false;
      if (now() < Date.parse(rec.expiresAt)) return false;
      const at = iso(now());
      rec.state = "expired";
      rec.unbookedReason = "expired";
      rec.updatedAt = at;
      rec.history.push({ type: "expired", round: rec.round, at });
      events.push({ type: "booking_expired", bookingId: rec.id, at, reason: "expired" });
      return true;
    }

    function closeRound(rec, reason) {
      const at = iso(now());
      rec.history.push({ type: "round_closed", round: rec.round, at, reason });
      rec.updatedAt = at;
      if (rec.round >= MAX_ROUNDS) {
        rec.state = "unbooked";
        rec.unbookedReason = "rounds_exhausted";
        rec.history.push({ type: "unbooked", round: rec.round, at, reason: "rounds_exhausted" });
        events.push({ type: "booking_unbooked", bookingId: rec.id, at, reason: "rounds_exhausted" });
      } else {
        rec.state = "needs_new_times";
        rec.expiresAt = iso(now() + rec.ttlMs); // the window for supplying round 2
        events.push({ type: "booking_needs_new_times", bookingId: rec.id, at, round: rec.round });
      }
    }

    function tryBook(rec) {
      const a = rec.responses.a, b = rec.responses.b;
      if (!a || !b || a.declinedAll || b.declinedAll) return false;
      const bSet = new Set(b.slotIds);
      const slot = rec.slots.find((s) => a.slotIds.includes(s.id) && bSet.has(s.id)); // proposal order decides
      if (!slot) return false;
      const at = iso(now());
      rec.booked = {
        status: "booked", slotId: slot.id, round: rec.round,
        startUtc: slot.startUtc, endUtc: slot.endUtc, timezone: slot.timezone,
        localStart: slot.localStart, durationMin: slot.durationMin,
        aConfirmedAt: a.at, bConfirmedAt: b.at, bookedAt: at,
        calendar_event_created: false, artifact: "ics_file",
      };
      rec.state = "booked";
      rec.updatedAt = at;
      rec.history.push({ type: "booked", round: rec.round, at, slotId: slot.id });
      events.push({ type: "booking_booked", bookingId: rec.id, slotId: slot.id, at });
      return true;
    }

    function propose(input) {
      const c = input && typeof input === "object" ? input : {};
      const aId = str(c.aId).trim(), bId = str(c.bId).trim();
      const aName = phrase(c.aName, 80), bName = phrase(c.bName, 80);
      if (!aId || !bId || !aName || !bName || aId === bId) return { ok: false, code: "INVALID_INPUT", record: null };
      const ttlMs = c.ttlMs == null ? DEFAULT_TTL_MS : c.ttlMs;
      if (!Number.isFinite(ttlMs) || ttlMs <= 0) return { ok: false, code: "INVALID_TTL", record: null };
      const dur = c.durationMin == null ? DEFAULT_DURATION_MIN : c.durationMin;
      if (!Number.isFinite(dur) || dur <= 0 || dur > 480) return { ok: false, code: "INVALID_SLOT", record: null };
      const nowMs = now();
      const parsed = parseSlots(c.slots, 1, dur, nowMs);
      if (parsed.code) return { ok: false, code: parsed.code, record: null };
      const id = String(nextId());
      if (records.has(id)) return { ok: false, code: "ID_CONFLICT", record: null };
      const rec = {
        kind: "connector_booking", version: VERSION, id,
        matchId: str(c.matchId).trim() || null,
        introId: str(c.introId).trim() || null,
        aId, bId, aName, bName,
        aFirstName: firstNameOf(aName), bFirstName: firstNameOf(bName),
        state: "awaiting_confirmations", round: 1,
        durationMin: dur, ttlMs,
        slots: parsed.slots,
        responses: { a: null, b: null },
        expiresAt: iso(nowMs + ttlMs),
        booked: null, unbookedReason: null,
        history: [{ type: "proposed", round: 1, at: iso(nowMs) }],
        createdAt: iso(nowMs), updatedAt: iso(nowMs),
      };
      records.set(id, rec);
      return { ok: true, record: rec };
    }

    function confirm(id, side, slotIds) {
      const rec = records.get(id);
      if (!rec) return { ok: false, code: "NOT_FOUND", record: null };
      if (side !== "a" && side !== "b") return { ok: false, code: "INVALID_SIDE", record: rec };
      if (touch(rec)) return { ok: true, noop: true, expired: true, record: rec };
      if (rec.state !== "awaiting_confirmations" || rec.responses[side]) return { ok: true, noop: true, record: rec };
      const wanted = Array.isArray(slotIds) ? slotIds : [];
      const valid = rec.slots.map((s) => s.id).filter((sid) => wanted.includes(sid)); // live slots, proposal order
      if (!valid.length) return { ok: true, noop: true, reason: "stale_slots", record: rec };
      const at = iso(now());
      rec.responses[side] = { slotIds: valid, declinedAll: false, at };
      rec.history.push({ type: "confirmed", round: rec.round, side, slotIds: valid, at });
      rec.updatedAt = at;
      if (!tryBook(rec)) {
        const a = rec.responses.a, b = rec.responses.b;
        if (a && b) closeRound(rec, a.declinedAll || b.declinedAll ? "declined_all" : "no_common_slot");
      }
      return { ok: true, record: rec };
    }

    function declineAll(id, side) {
      const rec = records.get(id);
      if (!rec) return { ok: false, code: "NOT_FOUND", record: null };
      if (side !== "a" && side !== "b") return { ok: false, code: "INVALID_SIDE", record: rec };
      if (touch(rec)) return { ok: true, noop: true, expired: true, record: rec };
      if (rec.state !== "awaiting_confirmations" || rec.responses[side]) return { ok: true, noop: true, record: rec };
      const at = iso(now());
      rec.responses[side] = { slotIds: [], declinedAll: true, at };
      rec.history.push({ type: "declined_all", round: rec.round, side, at });
      rec.updatedAt = at;
      closeRound(rec, "declined_all"); // no agreement is possible on this round's slots
      return { ok: true, record: rec };
    }

    function proposeTimes(id, slots, opts) {
      const rec = records.get(id);
      if (!rec) return { ok: false, code: "NOT_FOUND", record: null };
      if (touch(rec)) return { ok: false, code: "EXPIRED", record: rec };
      if (rec.state !== "needs_new_times") return { ok: false, code: "WRONG_STATE", record: rec };
      const ttlMs = opts && opts.ttlMs != null ? opts.ttlMs : rec.ttlMs;
      if (!Number.isFinite(ttlMs) || ttlMs <= 0) return { ok: false, code: "INVALID_TTL", record: rec };
      const parsed = parseSlots(slots, rec.round + 1, rec.durationMin, now());
      if (parsed.code) return { ok: false, code: parsed.code, record: rec };
      const at = iso(now());
      rec.round += 1;
      rec.slots = parsed.slots;
      rec.responses = { a: null, b: null };
      rec.state = "awaiting_confirmations";
      rec.ttlMs = ttlMs;
      rec.expiresAt = iso(now() + ttlMs);
      rec.updatedAt = at;
      rec.history.push({ type: "times_proposed", round: rec.round, at });
      return { ok: true, record: rec };
    }

    function expireSweep() {
      const swept = [];
      for (const rec of records.values()) if (touch(rec)) swept.push(rec.id);
      return swept;
    }

    function get(id) { return records.get(id) || null; }

    function ics(id) {
      const rec = records.get(id);
      if (!rec) return { ok: false, code: "NOT_FOUND" };
      const s = buildICalendar(rec);
      return s ? { ok: true, ics: s } : { ok: false, code: "NOT_BOOKED" };
    }

    function drainEvents() {
      const out = events.slice();
      events = [];
      return out;
    }

    function snapshot() {
      return JSON.stringify({ records: Array.from(records.values()), events });
    }

    return { propose, confirm, declineAll, proposeTimes, expireSweep, get, ics, drainEvents, snapshot };
  }

  return {
    VERSION, MAX_SLOTS, MAX_ROUNDS, DEFAULT_DURATION_MIN, DEFAULT_TTL_MS,
    STATES, TERMINAL_STATES, createConnectorBooking, buildICalendar,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerConnectorBooking;
