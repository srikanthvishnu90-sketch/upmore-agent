/* Career Connector — CONSENT MODEL (Lane B package 1, 2026-10-21).
   Pure domain logic, UMD like 124/126/135. No I/O, no clock reads, no sends:
   every function is deterministic — timestamps arrive as explicit arguments
   (ISO string or epoch ms) and every write returns a NEW object; inputs are
   never mutated.

   WHAT THIS IS: the data model Trainee's Connector (spec:
   trainee-capability-targets-2026-10-19 §CONNECTOR) stands on, built because
   the prep audit (lane-b-connector-prep-2026-10-21 §3) verified none of it
   existed: no match profile object, no consent record type, no opt-in state
   anywhere in 122/130/135. This module is ONLY the consent layer — matching,
   the double-opt-in intro flow, and the intro composer are sibling packages
   that consume this surface; the router/host wiring is the integration
   lane's. Nothing here reveals anything to anyone.

   CONSENT IS LOAD-BEARING (spec: "one consent violation is a launch-blocking
   bug"). The semantics, all pinned by tests/career-connector-consent.test.cjs:
   - DEFAULT IS NO. A fresh state consents to nothing; absent, ambiguous, or
     malformed records read as NOT consented (fail closed, never throw).
   - SCOPES: "matched" (may be considered for matches), "introduced" (may be
     introduced to another person), "contacted" (contact details may be
     shared / reached out to). Scopes are isolated — one grant implies no
     other — and CHAINED: introduced requires matched, contacted requires
     introduced (SCOPE_REQUIRES). A grant recorded before its prerequisite
     exists is inert history until the chain completes.
   - REVOCATION WINS. Consent for a scope is decided by the person's LATEST
     decision, compared by decision time: a revocation beats every grant
     stamped at or before it, in ANY storage order — a stale grant replayed
     after a revocation (later seq, earlier stamp) does not resurrect
     consent, and at an exact timestamp tie the revocation wins whichever
     seq it carries. A grant stamped genuinely LATER than the revocation is
     a new decision and restores consent. Revoking a prerequisite scope
     retroactively inertias every dependent scope's standing grants (they
     remain in the log as audit history; they evaluate to not-consented).
   - EVERY CHANGE IS AN EVENT. Grants and revocations append to an
     append-only log { seq, type, scope, at, source_surface, note } — who
     consented, to what, when, and on which surface is always answerable,
     and revocation is itself recorded with its timestamp, never a delete.

   CARRIAGE (how this persists): the career stack carries per-user records
   ON the 122 profile object — 135's graph store rides as
   prof._careerGraphPeople (written by 120/142). The Connector follows the
   same shape: attachToProfile places { match_profile, consent } under
   profile._careerConnector (PROFILE_CARRIAGE_KEY) on a COPY of the profile;
   readFromProfile reads it back, failing closed (nulls) on anything absent
   or malformed. The host's existing profile persistence then carries it
   with no new store — the durable cross-user connections registry remains
   the brain lane's seam (prep §6); this module owns the record SHAPES and
   the consent arithmetic, not the database.

   VISIBILITY: match profiles are internal-only by default and NEVER a
   browsable directory (spec PRIVACY). visibility_scope is the person's
   recorded preference: "internal_only" (nothing leaves the matcher) or
   "matched_peers" (profile details may be shown to a peer only after both
   sides opt in — the reveal itself is enforced by the intro package, this
   module just records the preference). Any other value is rejected. */
const CareerConnectorConsent = (() => {
  "use strict";

  const VERSION = 1;
  const PROFILE_KIND = "connector_match_profile";
  const CONSENT_KIND = "connector_consent_state";
  const PROFILE_CARRIAGE_KEY = "_careerConnector";

  const SCOPES = ["matched", "introduced", "contacted"];
  const SCOPE_REQUIRES = { matched: [], introduced: ["matched"], contacted: ["introduced"] };
  const SURFACES = ["imessage", "email", "telegram", "whatsapp", "app", "web"];
  const VISIBILITY_SCOPES = ["internal_only", "matched_peers"];
  const MAX_LIST_ITEMS = 12;
  const MAX_ITEM_CHARS = 280;
  const MAX_NOTE_CHARS = 280;

  const s = (v) => (v == null ? "" : String(v));
  // CLOCK-SOURCE (same BUG-198 class 135 guards): a timestamp arrives as an
  // ISO string or numeric epoch ms; anything else is invalid, never guessed.
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
  const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const no = (reason) => ({ ok: false, reason });

  // ---- canonical builders: fixed key order is what makes serialize ->
  // parse -> serialize byte-stable. Everything stored flows through these.
  function buildProfile(f) {
    return { kind: PROFILE_KIND, version: VERSION, user_id: f.user_id,
      needs: f.needs.slice(), offers: f.offers.slice(),
      visibility_scope: f.visibility_scope, created_at: f.created_at, updated_at: f.updated_at };
  }
  function buildEvent(e) {
    return { seq: e.seq, type: e.type, scope: e.scope, at: e.at, source_surface: e.source_surface, note: e.note == null ? null : e.note };
  }
  function buildState(f) {
    return { kind: CONSENT_KIND, version: VERSION, user_id: f.user_id,
      events: f.events.map(buildEvent).sort((a, b) => a.seq - b.seq),
      created_at: f.created_at, updated_at: f.updated_at };
  }

  // ---- shared field validation -------------------------------------------
  function normStringList(v, label) {
    if (v == null) return { ok: true, list: [] };
    if (!Array.isArray(v)) return no(`${label}_not_array`);
    if (v.length > MAX_LIST_ITEMS) return no(`${label}_too_many`);
    const seen = new Set(); const list = [];
    for (const item of v) {
      if (typeof item !== "string") return no(`${label}_item_not_string`);
      const t = item.trim();
      if (!t) return no(`${label}_item_empty`);
      if (t.length > MAX_ITEM_CHARS) return no(`${label}_item_too_long`);
      const k = t.toLowerCase();
      if (!seen.has(k)) { seen.add(k); list.push(t); }
    }
    return { ok: true, list };
  }
  // A STORED list must already be canonical (trimmed, deduped): validate does
  // not silently repair records, it rejects non-canonical ones.
  function checkStoredList(v, label) {
    const r = normStringList(v, label);
    if (!r.ok) return r;
    if (!Array.isArray(v) || v.length !== r.list.length || v.some((x, i) => x !== r.list[i])) return no(`${label}_not_canonical`);
    return r;
  }
  function checkStamps(created_at, updated_at) {
    const c = isoOf(created_at), u = isoOf(updated_at);
    if (!c || created_at !== c) return no("invalid_created_at");
    if (!u || updated_at !== u) return no("invalid_updated_at");
    if (Date.parse(updated_at) < Date.parse(created_at)) return no("updated_before_created");
    return { ok: true };
  }
  function checkUserId(user_id) {
    return (typeof user_id === "string" && user_id.trim()) ? { ok: true } : no("user_id_required");
  }

  // ---- match profile ------------------------------------------------------
  function createMatchProfile(input, at) {
    if (!isObj(input)) return no("invalid_input");
    const uid = checkUserId(input.user_id); if (!uid.ok) return uid;
    const needs = normStringList(input.needs, "needs"); if (!needs.ok) return needs;
    const offers = normStringList(input.offers, "offers"); if (!offers.ok) return offers;
    const vis = input.visibility_scope == null ? "internal_only" : input.visibility_scope;
    if (!VISIBILITY_SCOPES.includes(vis)) return no("unknown_visibility_scope");
    const iso = isoOf(at); if (!iso) return no("invalid_timestamp");
    return { ok: true, profile: buildProfile({ user_id: input.user_id, needs: needs.list, offers: offers.list, visibility_scope: vis, created_at: iso, updated_at: iso }) };
  }

  function validateMatchProfile(p) {
    if (!isObj(p)) return no("not_an_object");
    if (p.kind !== PROFILE_KIND) return no("wrong_kind");
    if (p.version !== VERSION) return no("wrong_version");
    const uid = checkUserId(p.user_id); if (!uid.ok) return uid;
    const needs = checkStoredList(p.needs, "needs"); if (!needs.ok) return needs;
    const offers = checkStoredList(p.offers, "offers"); if (!offers.ok) return offers;
    if (!VISIBILITY_SCOPES.includes(p.visibility_scope)) return no("unknown_visibility_scope");
    return checkStamps(p.created_at, p.updated_at);
  }

  function updateMatchProfile(profile, patch, at) {
    const v = validateMatchProfile(profile); if (!v.ok) return no("invalid_match_profile");
    if (!isObj(patch)) return no("invalid_patch");
    if ("user_id" in patch && patch.user_id !== profile.user_id) return no("user_id_immutable");
    const iso = isoOf(at); if (!iso) return no("invalid_timestamp");
    if (Date.parse(iso) < Date.parse(profile.created_at)) return no("timestamp_before_creation");
    let needs = profile.needs, offers = profile.offers, vis = profile.visibility_scope;
    if ("needs" in patch) { const r = normStringList(patch.needs, "needs"); if (!r.ok) return r; needs = r.list; }
    if ("offers" in patch) { const r = normStringList(patch.offers, "offers"); if (!r.ok) return r; offers = r.list; }
    if ("visibility_scope" in patch) {
      if (!VISIBILITY_SCOPES.includes(patch.visibility_scope)) return no("unknown_visibility_scope");
      vis = patch.visibility_scope;
    }
    return { ok: true, profile: buildProfile({ user_id: profile.user_id, needs, offers, visibility_scope: vis, created_at: profile.created_at, updated_at: iso }) };
  }

  // ---- consent state ------------------------------------------------------
  function emptyConsentState(user_id, at) {
    const uid = checkUserId(user_id); if (!uid.ok) return uid;
    const iso = isoOf(at); if (!iso) return no("invalid_timestamp");
    return { ok: true, state: buildState({ user_id, events: [], created_at: iso, updated_at: iso }) };
  }

  function validateConsentState(st) {
    if (!isObj(st)) return no("not_an_object");
    if (st.kind !== CONSENT_KIND) return no("wrong_kind");
    if (st.version !== VERSION) return no("wrong_version");
    const uid = checkUserId(st.user_id); if (!uid.ok) return uid;
    const stamps = checkStamps(st.created_at, st.updated_at); if (!stamps.ok) return stamps;
    if (!Array.isArray(st.events)) return no("events_not_array");
    const seqs = new Set();
    for (const e of st.events) {
      if (!isObj(e)) return no("event_not_object");
      if (!Number.isInteger(e.seq) || e.seq < 1) return no("event_bad_seq");
      if (seqs.has(e.seq)) return no("event_duplicate_seq");
      seqs.add(e.seq);
      if (e.type !== "grant" && e.type !== "revoke") return no("event_bad_type");
      if (!SCOPES.includes(e.scope)) return no("event_unknown_scope");
      const iso = isoOf(e.at); if (!iso || e.at !== iso) return no("event_bad_at");
      if (!SURFACES.includes(e.source_surface)) return no("event_unknown_surface");
      if (e.note != null && (typeof e.note !== "string" || e.note.length > MAX_NOTE_CHARS)) return no("event_bad_note");
    }
    return { ok: true };
  }

  function appendEvent(state, type, scope, opts) {
    const v = validateConsentState(state); if (!v.ok) return no("invalid_consent_state");
    if (!SCOPES.includes(scope)) return no("unknown_scope");
    const o = opts || {};
    const iso = isoOf(o.at); if (!iso) return no("invalid_timestamp");
    if (Date.parse(iso) < Date.parse(state.created_at)) return no("timestamp_before_creation");
    if (!SURFACES.includes(o.source_surface)) return no("unknown_source_surface");
    if (o.note != null && (typeof o.note !== "string" || o.note.length > MAX_NOTE_CHARS)) return no("bad_note");
    const seq = state.events.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
    const ev = buildEvent({ seq, type, scope, at: iso, source_surface: o.source_surface, note: o.note == null ? null : o.note });
    const updated = Date.parse(iso) > Date.parse(state.updated_at) ? iso : state.updated_at;
    return { ok: true, state: buildState({ user_id: state.user_id, events: state.events.concat([ev]), created_at: state.created_at, updated_at: updated }) };
  }
  function grantConsent(state, scope, opts) { return appendEvent(state, "grant", scope, opts); }
  function revokeConsent(state, scope, opts) { return appendEvent(state, "revoke", scope, opts); }

  // The deciding event for a scope: latest decision time wins; at an exact
  // time tie a revocation outranks a grant WHATEVER seq either carries;
  // seq breaks only same-type ties. Storage order never enters the math.
  function decidingEvent(events, scope) {
    let win = null;
    for (const e of events) {
      if (e.scope !== scope) continue;
      if (!win) { win = e; continue; }
      const em = Date.parse(e.at), wm = Date.parse(win.at);
      if (em !== wm) { if (em > wm) win = e; continue; }
      const er = e.type === "revoke" ? 1 : 0, wr = win.type === "revoke" ? 1 : 0;
      if (er !== wr) { if (er > wr) win = e; continue; }
      if (e.seq > win.seq) win = e;
    }
    return win;
  }
  function rawConsented(state, scope) {
    const win = decidingEvent(state.events, scope);
    return !!win && win.type === "grant";
  }
  function effectiveConsented(state, scope) {
    if (!rawConsented(state, scope)) return false;
    return (SCOPE_REQUIRES[scope] || []).every((req) => effectiveConsented(state, req));
  }

  function isConsented(state, scope) {
    if (!SCOPES.includes(scope)) return false;
    if (!validateConsentState(state).ok) return false; // fail closed
    return effectiveConsented(state, scope);
  }

  function consentSummary(state) {
    const out = { matched: false, introduced: false, contacted: false, fully_opted_in: false };
    if (!validateConsentState(state).ok) return out;
    for (const sc of SCOPES) out[sc] = effectiveConsented(state, sc);
    out.fully_opted_in = out.matched && out.introduced && out.contacted;
    return out;
  }

  // ---- serialization: canonical rebuild, byte-stable round-trip ---------
  function serializeConsentState(state) {
    if (!validateConsentState(state).ok) return null;
    return JSON.stringify(buildState(state));
  }
  function parseConsentState(json) {
    if (typeof json !== "string") return no("not_a_string");
    let raw; try { raw = JSON.parse(json); } catch { return no("invalid_json"); }
    const v = validateConsentState(raw); if (!v.ok) return v;
    return { ok: true, state: buildState(raw) };
  }
  function serializeMatchProfile(profile) {
    if (!validateMatchProfile(profile).ok) return null;
    return JSON.stringify(buildProfile(profile));
  }
  function parseMatchProfile(json) {
    if (typeof json !== "string") return no("not_a_string");
    let raw; try { raw = JSON.parse(json); } catch { return no("invalid_json"); }
    const v = validateMatchProfile(raw); if (!v.ok) return v;
    return { ok: true, profile: buildProfile(raw) };
  }

  // ---- profile carriage (mirrors _careerGraphPeople on the 122 profile) --
  function attachToProfile(profile, bundle) {
    if (!isObj(profile)) return no("invalid_profile");
    if (!isObj(bundle)) return no("invalid_bundle");
    const mp = validateMatchProfile(bundle.match_profile); if (!mp.ok) return no("invalid_match_profile");
    const cs = validateConsentState(bundle.consent); if (!cs.ok) return no("invalid_consent_state");
    if (bundle.match_profile.user_id !== bundle.consent.user_id) return no("carriage_user_mismatch");
    const carried = { match_profile: buildProfile(bundle.match_profile), consent: buildState(bundle.consent) };
    return { ok: true, profile: Object.assign({}, profile, { [PROFILE_CARRIAGE_KEY]: carried }) };
  }
  function readFromProfile(profile) {
    const none = { match_profile: null, consent: null };
    if (!isObj(profile)) return none;
    const c = profile[PROFILE_CARRIAGE_KEY];
    if (!isObj(c)) return none;
    return {
      match_profile: validateMatchProfile(c.match_profile).ok ? buildProfile(c.match_profile) : null,
      consent: validateConsentState(c.consent).ok ? buildState(c.consent) : null,
    };
  }

  return { VERSION, PROFILE_KIND, CONSENT_KIND, PROFILE_CARRIAGE_KEY,
    SCOPES, SCOPE_REQUIRES, SURFACES, VISIBILITY_SCOPES,
    createMatchProfile, validateMatchProfile, updateMatchProfile,
    emptyConsentState, validateConsentState, grantConsent, revokeConsent,
    isConsented, consentSummary,
    serializeConsentState, parseConsentState, serializeMatchProfile, parseMatchProfile,
    attachToProfile, readFromProfile };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerConnectorConsent;
