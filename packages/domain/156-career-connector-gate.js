"use strict";
/* 156-career-connector-gate.js — the Lane B Connector allowlist gate.
   (Lane B package 4, 2026-10-21; guard: tests/career-connector-gate.test.cjs;
   integration: docs/connector/gate-integration-note-2026-10-21.md.)

   WHY THIS EXISTS: the people-matching Connector (consent capture,
   matching, double opt-in, intros) must open for named users only while
   everyone else keeps today's behavior exactly — the honest stop in
   142 (handlePeopleMatchingStop, intent people_matching_stop). This
   module is the gate that decides, per user, which of those two paths a
   turn takes. It decides NOTHING else: no consent, no matching, no
   sending lives here.

   SHAPE: modeled on the channel bridge's allowlist seam
   (supabase/functions/_shared/channel_bridge.ts: parseAllowlist +
   resolveTestUser, lines 41-56 there) — env-shaped config parsed
   fresh per decision, exact-match membership, and the codebase's
   fail-closed posture: anything unset, malformed, or unexpected
   resolves to CLOSED, never to a guess and never to an exception.

   CONFIG (env-shaped; read through a getter so the module stays
   host-agnostic — node tests pass a fake, the edge host passes
   (name) => Deno.env.get(name)):
     CONNECTOR_ENABLED .... master switch. Only "true" or "1"
                            (trimmed, case-insensitive) means on. Unset,
                            empty, or any other value means OFF.
     CONNECTOR_ALLOWLIST .. comma-separated user ids. Entries are
                            trimmed, lowercased, deduped. An entry with
                            internal whitespace or over 256 chars is
                            MALFORMED: dropped (flagged on the parsed
                            config), never matchable, never fatal.
   A getter that throws is treated as "everything unset" — closed.

   DECISION: decide(env, userId) -> frozen { allowed, reason, userId }
     reason "disabled" ... master switch off (checked FIRST: off
                           overrides the list, so closing the switch
                           closes the Connector for everyone at once)
     reason "not_listed" . switch on, but the id is absent, empty,
                           non-string, or simply not on the list
     reason "allowed" .... switch on AND the id is on the list
   Membership is an exact match after lowercase normalization (user ids
   are UUIDs; hex case is not significant). There is deliberately NO
   digit/prefix/fuzzy matching here — channel_bridge's digit rule
   exists for phone-shaped sender keys; user ids are not phone numbers.

   IDENTITY RULE (load-bearing): the gate keys on the REAL
   authenticated user id of the person acting — each side of a match
   acts as THEMSELVES. It must never be fed the channel test bridge's
   resolved identity: resolveTestUser collapses every allowlisted
   channel sender onto the single shared CHANNEL_TEST_USER_ID, so a
   gate fed that id would wave every bridged sender through as one
   person. The integration note pins the one call site where the real
   id exists (handler-career.ts, the authenticated user.id).

   PURITY: decide/parseConnectorConfig are pure functions of their
   inputs — no module state, no caching, no clock, no I/O. Same env
   snapshot + same id => same decision, forever.
*/

const CareerConnectorGate = (() => {
  const MASTER_ENV = "CONNECTOR_ENABLED";
  const ALLOWLIST_ENV = "CONNECTOR_ALLOWLIST";
  const MAX_ENTRY_CHARS = 256;

  const REASONS = Object.freeze({
    DISABLED: "disabled",
    NOT_LISTED: "not_listed",
    ALLOWED: "allowed",
  });

  // Normalize the env argument into a getter that cannot throw:
  // a function is used as-is (wrapped), a plain object is read by key,
  // anything else reads as permanently unset.
  function getterOf(env) {
    if (typeof env === "function") {
      return (name) => {
        try {
          const v = env(name);
          return typeof v === "string" ? v : undefined;
        } catch {
          return undefined;
        }
      };
    }
    if (env && typeof env === "object") {
      return (name) => {
        const v = env[name];
        return typeof v === "string" ? v : undefined;
      };
    }
    return () => undefined;
  }

  // One allowlist entry, normalized; null when the entry is malformed
  // (empty after trim, internal whitespace, or oversized).
  function cleanEntry(raw) {
    const e = String(raw).trim().toLowerCase();
    if (!e) return null;
    if (e.length > MAX_ENTRY_CHARS || /\s/.test(e)) return null;
    return e;
  }

  // parseConnectorConfig(env) -> { enabled, allowlist, malformed }
  // allowlist: deduped normalized entries. malformed: true when any
  // non-empty segment had to be dropped. Fail-closed throughout: a
  // non-string or garbage value parses to off/empty, never a throw.
  function parseConnectorConfig(env) {
    const get = getterOf(env);
    const masterRaw = get(MASTER_ENV);
    const master = typeof masterRaw === "string" ? masterRaw.trim().toLowerCase() : "";
    const enabled = master === "true" || master === "1";

    const listRaw = get(ALLOWLIST_ENV);
    const allowlist = [];
    let malformed = false;
    if (typeof listRaw === "string" && listRaw.trim() !== "") {
      const seen = new Set();
      for (const seg of listRaw.split(",")) {
        if (seg.trim() === "") continue; // empty segment: formatting, not malformed
        const e = cleanEntry(seg);
        if (e === null) {
          malformed = true;
          continue;
        }
        if (!seen.has(e)) {
          seen.add(e);
          allowlist.push(e);
        }
      }
    }
    return { enabled, allowlist, malformed };
  }

  // The queried id, normalized the same way as list entries; "" when
  // the id is missing, empty, or not a string — "" is on no list.
  function cleanUserId(userId) {
    if (typeof userId !== "string") return "";
    const id = userId.trim().toLowerCase();
    return id.length <= MAX_ENTRY_CHARS && !/\s/.test(id) ? id : "";
  }

  // decide(env, userId) -> frozen { allowed, reason, userId }
  // userId in the result is the normalized id that was evaluated
  // ("" when the caller passed nothing usable).
  function decide(env, userId) {
    const id = cleanUserId(userId);
    const cfg = parseConnectorConfig(env);
    if (!cfg.enabled) return Object.freeze({ allowed: false, reason: REASONS.DISABLED, userId: id });
    if (!id || !cfg.allowlist.includes(id)) return Object.freeze({ allowed: false, reason: REASONS.NOT_LISTED, userId: id });
    return Object.freeze({ allowed: true, reason: REASONS.ALLOWED, userId: id });
  }

  function isAllowed(env, userId) {
    return decide(env, userId).allowed;
  }

  return { MASTER_ENV, ALLOWLIST_ENV, REASONS, parseConnectorConfig, decide, isAllowed };
})();

if (typeof module !== "undefined" && module.exports) module.exports = CareerConnectorGate;
