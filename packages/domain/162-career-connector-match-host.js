/* Career Connector — MATCH HOST ADAPTER (162) — Lane B, goal 5 (match flow
   completion). The host side of the 158 double opt-in state machine:
   persistence + proposal surfacing. Outcome trace: O2 — this is what lets a
   real user actually SEE a proposal and answer it, across restarts.

   158 is a pure in-memory machine: it persists via snapshot() and emits
   intro_unlocked via drainEvents(), but it owns no storage and no words.
   This module is the seam between 158 and the host:

   1. PERSISTENCE over the profile-carried pattern (the 157 carriage shape):
      a match store rides on a host-persisted profile-shaped record under
      profile._careerConnectorMatches (CARRIAGE_KEY) and is carried by the
      host's existing profile save path — no new store. The store holds a
      MATCHES INDEX (one light entry per proposal: ids, state, stamps) plus
      PER-PROPOSAL SNAPSHOT records (the full 158 proposal record, verbatim)
      plus the intro OUTBOX. Records are plain JSON with fixed key order,
      so serialize -> parse -> serialize is byte-stable.
   2. THE UNLOCK OUTBOX: persistMachine() is the drain point. Every
      intro_unlocked event the machine holds (in its snapshot, or handed in
      via opts.events after the caller drained it) becomes ONE delivery
      record for the intro lane, deduped by proposalId + "@" +
      introUnlockedAt — re-persisting, restoring, or replaying can never
      mint a second one. Delivery is AT-LEAST-ONCE: a record sits in the
      outbox with delivered_at null until the consumer acks it
      (ackDelivery); an unlocked proposal record whose delivery was lost
      is backfilled on the next persist. Nothing here sends anything.
   3. SURFACING: the exact texts a user reads (TEXTS, below) and the
      answer parser. A side's proposal text is rendered ONLY from the
      allowlist pick 158 itself serves ({ need, offer, why, expiresAt }) —
      ids and identity never enter a text. The parser counts ONLY an
      explicit standalone yes/no against the CURRENT open proposal; every
      other message is conversation, never an answer. Expiry is surfaced
      honestly from the stored record without mutating it (the machine
      applies the transition on its next touch).

   FORWARD COMPATIBILITY + CORRUPTION: unknown fields — on the store, the
   records, the deliveries — are preserved verbatim through every
   round-trip; a FUTURE version number is refused by name (never guessed
   at). A corrupt record is a NAMED REFUSAL ({ ok:false, code:
   "CORRUPT_RECORD", where, reason }), never a throw and never a silent
   drop: a live proposal must not vanish because a read failed closed.
   All functions are pure and deterministic; timestamps arrive as explicit
   arguments (ISO string or epoch ms); inputs are never mutated.

   NOT THIS MODULE'S JOB: consent (157 owns the model; 158 reads it via
   the injected predicate), matching/fit (the matcher composes proposals),
   identity reveal and the intro itself (159, driven by the outbox
   delivery), sending/booking (the host), storage I/O (the host persists
   the string serializeStore returns, wherever profiles live). */
const CareerConnectorMatchHost = (() => {
  "use strict";

  const VERSION = 1;
  const STORE_KIND = "connector_match_store";
  const INDEX_KIND = "connector_match_index";
  const SNAPSHOT_KIND = "connector_match_snapshot";
  const DELIVERY_KIND = "connector_intro_delivery";
  const CARRIAGE_KEY = "_careerConnectorMatches";

  // Mirrors 158's STATES — the only states a stored record may carry.
  const MATCH_STATES = Object.freeze(["proposed", "a_answered", "b_answered", "both_yes", "declined", "expired"]);
  const OPEN_STATES = Object.freeze(["proposed", "a_answered", "b_answered"]);

  // ---- surfacing texts (verbatim; pinned by the guard suite) -----------
  const TEXTS = Object.freeze({
    PROPOSAL_TEMPLATE:
      "Found someone for you to meet.\n" +
      "What they need: {need}\n" +
      "What they offer: {offer}\n" +
      "Why you two: {why}\n" +
      "Nothing about you is shared unless you both say yes. Reply YES to meet them, or NO to pass. This one's open until {expires}.",
    WAITING: "You're in — you said yes. If they say yes too, I'll introduce you. Nothing about you has been shared.",
    BOTH_YES: "Good news — you both said yes. I'll set up the intro from here.",
    DECLINED_SELF: "Done — passed on that one, and nothing was shared. I'll keep looking.",
    CLOSED: "That match didn't go ahead — nothing was shared. I'll keep looking.",
    EXPIRED: "That one expired before you both answered — nothing was shared. Want me to look again?",
  });

  // The ONLY replies that count as an answer: an explicit standalone
  // yes/no (after trim/case/punctuation normalization). Anything longer or
  // qualified is conversation. Deliberately small — widening this set is a
  // product decision, not a parser heuristic.
  const YES_ANSWERS = Object.freeze(["yes", "y", "yeah", "yep", "yes please", "i'm in", "im in", "count me in"]);
  const NO_ANSWERS = Object.freeze(["no", "n", "nope", "no thanks", "pass", "i'll pass", "ill pass", "not for me"]);

  // ---- helpers ----------------------------------------------------------
  const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const isId = (v) => typeof v === "string" && v.trim().length > 0;
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  // Same clock rule as 157: a timestamp is an ISO string or epoch ms;
  // anything else is invalid, never guessed. Stored stamps are ISO.
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
  const isCanonIso = (v) => typeof v === "string" && isoOf(v) === v;
  const corrupt = (where, reason) => ({ ok: false, code: "CORRUPT_RECORD", where, reason });
  const refuse = (code, extra) => Object.assign({ ok: false, code }, extra || {});
  // Canonical key order first, unknown fields after — preserved verbatim.
  function withExtras(built, raw) {
    if (isObj(raw)) for (const k of Object.keys(raw)) if (!(k in built)) built[k] = clone(raw[k]);
    return built;
  }

  // ---- record validation (the fields the host depends on; the rest rides)
  function validateProposalRecord(rec, expectId) {
    if (!isObj(rec)) return corrupt("snapshots." + expectId, "record_not_an_object");
    if (rec.id !== expectId) return corrupt("snapshots." + expectId, "record_id_mismatch");
    if (!isId(rec.aId) || !isId(rec.bId) || rec.aId === rec.bId) return corrupt("snapshots." + expectId, "record_bad_sides");
    if (!MATCH_STATES.includes(rec.state)) return corrupt("snapshots." + expectId, "record_unknown_state");
    if (!Number.isFinite(rec.createdAt) || !Number.isFinite(rec.expiresAt) || rec.expiresAt < rec.createdAt) {
      return corrupt("snapshots." + expectId, "record_bad_stamps");
    }
    for (const p of [rec.aPitch, rec.bPitch]) {
      if (!isObj(p) || !isId(p.need) || !isId(p.offer)) return corrupt("snapshots." + expectId, "record_bad_pitch");
    }
    if (!isId(rec.why)) return corrupt("snapshots." + expectId, "record_bad_why");
    for (const a of [rec.aAnswer, rec.bAnswer]) {
      if (a !== null && a !== "yes" && a !== "no") return corrupt("snapshots." + expectId, "record_bad_answer");
    }
    if (typeof rec.introUnlocked !== "boolean") return corrupt("snapshots." + expectId, "record_bad_unlock_flag");
    if (rec.introUnlocked && !Number.isFinite(rec.introUnlockedAt)) return corrupt("snapshots." + expectId, "record_bad_unlock_stamp");
    if (!rec.introUnlocked && rec.introUnlockedAt !== null && rec.introUnlockedAt !== undefined) {
      return corrupt("snapshots." + expectId, "record_unlock_stamp_without_unlock");
    }
    if (!Array.isArray(rec.history)) return corrupt("snapshots." + expectId, "record_bad_history");
    return { ok: true };
  }

  function buildIndexEntry(e) {
    return { proposal_id: e.proposal_id, a_id: e.a_id, b_id: e.b_id, state: e.state,
      created_at: e.created_at, expires_at: e.expires_at, updated_at: e.updated_at };
  }
  function buildDelivery(d) {
    return { kind: DELIVERY_KIND, version: VERSION, dedupe_key: d.dedupe_key,
      proposal_id: d.proposal_id, a_id: d.a_id, b_id: d.b_id,
      unlocked_at: d.unlocked_at, recorded_at: d.recorded_at, delivered_at: d.delivered_at == null ? null : d.delivered_at };
  }
  function entryFromRecord(rec, updatedAt) {
    return { proposal_id: rec.id, a_id: rec.aId, b_id: rec.bId, state: rec.state,
      created_at: isoOf(rec.createdAt), expires_at: isoOf(rec.expiresAt), updated_at: updatedAt };
  }

  // Validate + canonically rebuild a store from an object or JSON string.
  // The single gate every public function passes through.
  function inspectStore(raw) {
    let s = raw;
    if (typeof s === "string") {
      try { s = JSON.parse(s); } catch { return corrupt("store", "invalid_json"); }
    }
    if (!isObj(s)) return corrupt("store", "not_an_object");
    if (s.kind !== STORE_KIND) return corrupt("store", "wrong_kind");
    if (s.version !== VERSION) return corrupt("store", "unsupported_version:" + String(s.version));
    // index
    const ix = s.index;
    if (!isObj(ix)) return corrupt("index", "not_an_object");
    if (ix.kind !== INDEX_KIND) return corrupt("index", "wrong_kind");
    if (ix.version !== VERSION) return corrupt("index", "unsupported_version:" + String(ix.version));
    if (!Number.isInteger(ix.seq) || ix.seq < 0) return corrupt("index", "bad_seq");
    if (!isCanonIso(ix.updated_at)) return corrupt("index", "bad_updated_at");
    if (!Array.isArray(ix.entries)) return corrupt("index", "entries_not_array");
    const entries = [];
    const entryIds = new Set();
    for (const e of ix.entries) {
      if (!isObj(e)) return corrupt("index", "entry_not_an_object");
      if (!isId(e.proposal_id)) return corrupt("index", "entry_bad_proposal_id");
      if (entryIds.has(e.proposal_id)) return corrupt("index", "entry_duplicate:" + e.proposal_id);
      entryIds.add(e.proposal_id);
      if (!isId(e.a_id) || !isId(e.b_id) || e.a_id === e.b_id) return corrupt("index." + e.proposal_id, "entry_bad_sides");
      if (!MATCH_STATES.includes(e.state)) return corrupt("index." + e.proposal_id, "entry_unknown_state");
      if (!isCanonIso(e.created_at) || !isCanonIso(e.expires_at) || !isCanonIso(e.updated_at)) {
        return corrupt("index." + e.proposal_id, "entry_bad_stamps");
      }
      if (Date.parse(e.expires_at) < Date.parse(e.created_at)) return corrupt("index." + e.proposal_id, "entry_expires_before_created");
      entries.push(withExtras(buildIndexEntry(e), e));
    }
    // per-proposal snapshots
    if (!isObj(s.snapshots)) return corrupt("snapshots", "not_an_object");
    const snapshots = {};
    for (const id of Object.keys(s.snapshots).sort()) {
      const w = s.snapshots[id];
      if (!isObj(w)) return corrupt("snapshots." + id, "not_an_object");
      if (w.kind !== SNAPSHOT_KIND) return corrupt("snapshots." + id, "wrong_kind");
      if (w.version !== VERSION) return corrupt("snapshots." + id, "unsupported_version:" + String(w.version));
      if (w.proposal_id !== id) return corrupt("snapshots." + id, "proposal_id_mismatch");
      if (!isCanonIso(w.saved_at)) return corrupt("snapshots." + id, "bad_saved_at");
      const v = validateProposalRecord(w.record, id);
      if (!v.ok) return v;
      snapshots[id] = withExtras(
        { kind: SNAPSHOT_KIND, version: VERSION, proposal_id: id, saved_at: w.saved_at, record: clone(w.record) }, w);
    }
    // index <-> snapshots consistency: neither may name a proposal the
    // other does not hold, and the index must agree with the record.
    for (const e of entries) {
      const w = snapshots[e.proposal_id];
      if (!w) return corrupt("index." + e.proposal_id, "entry_without_snapshot");
      const rec = w.record;
      if (e.a_id !== rec.aId || e.b_id !== rec.bId || e.state !== rec.state ||
          e.created_at !== isoOf(rec.createdAt) || e.expires_at !== isoOf(rec.expiresAt)) {
        return corrupt("index." + e.proposal_id, "entry_disagrees_with_snapshot");
      }
    }
    for (const id of Object.keys(snapshots)) {
      if (!entryIds.has(id)) return corrupt("snapshots." + id, "snapshot_without_entry");
    }
    // outbox
    if (!Array.isArray(s.outbox)) return corrupt("outbox", "not_an_array");
    const outbox = [];
    const keys = new Set();
    for (const d of s.outbox) {
      if (!isObj(d)) return corrupt("outbox", "delivery_not_an_object");
      if (d.kind !== DELIVERY_KIND) return corrupt("outbox", "delivery_wrong_kind");
      if (d.version !== VERSION) return corrupt("outbox", "delivery_unsupported_version:" + String(d.version));
      if (!isId(d.proposal_id) || !isId(d.a_id) || !isId(d.b_id) || d.a_id === d.b_id) {
        return corrupt("outbox." + String(d.dedupe_key), "delivery_bad_ids");
      }
      if (!isCanonIso(d.unlocked_at) || !isCanonIso(d.recorded_at)) return corrupt("outbox." + String(d.dedupe_key), "delivery_bad_stamps");
      if (d.dedupe_key !== d.proposal_id + "@" + d.unlocked_at) return corrupt("outbox." + String(d.dedupe_key), "delivery_bad_dedupe_key");
      if (keys.has(d.dedupe_key)) return corrupt("outbox." + d.dedupe_key, "delivery_duplicate");
      keys.add(d.dedupe_key);
      if (d.delivered_at !== null && d.delivered_at !== undefined) {
        if (!isCanonIso(d.delivered_at) || Date.parse(d.delivered_at) < Date.parse(d.recorded_at)) {
          return corrupt("outbox." + d.dedupe_key, "delivery_bad_delivered_at");
        }
      }
      outbox.push(withExtras(buildDelivery(d), d));
    }
    const store = withExtras({
      kind: STORE_KIND, version: VERSION,
      index: withExtras({ kind: INDEX_KIND, version: VERSION, seq: ix.seq, updated_at: ix.updated_at, entries }, ix),
      snapshots, outbox,
    }, s);
    return { ok: true, store };
  }

  // ---- store lifecycle ---------------------------------------------------
  function emptyStore(at) {
    const iso = isoOf(at);
    if (!iso) return refuse("INVALID_TIMESTAMP");
    return { ok: true, store: {
      kind: STORE_KIND, version: VERSION,
      index: { kind: INDEX_KIND, version: VERSION, seq: 0, updated_at: iso, entries: [] },
      snapshots: {}, outbox: [],
    } };
  }
  function validateStore(store) {
    const r = inspectStore(store);
    return r.ok ? { ok: true } : r;
  }
  function serializeStore(store) {
    const r = inspectStore(store);
    return r.ok ? JSON.stringify(r.store) : null;
  }
  function parseStore(json) {
    return inspectStore(json);
  }

  // ---- carriage (mirrors 157's attach/read on the profile) --------------
  function attachToProfile(profile, store) {
    if (!isObj(profile)) return refuse("INVALID_PROFILE");
    const r = inspectStore(store);
    if (!r.ok) return r;
    return { ok: true, profile: Object.assign({}, profile, { [CARRIAGE_KEY]: r.store }) };
  }
  function readFromProfile(profile) {
    if (!isObj(profile)) return { ok: true, store: null };
    const c = profile[CARRIAGE_KEY];
    if (c == null) return { ok: true, store: null };
    return inspectStore(c); // present but corrupt = named refusal, not a silent null
  }

  // ---- machine bridge -----------------------------------------------------
  function restoreMachine(store, deps) {
    const r = inspectStore(store);
    if (!r.ok) return r;
    if (!deps || typeof deps.createMatch !== "function" || typeof deps.isConsented !== "function") {
      return refuse("INVALID_DEPS", { reason: "deps.createMatch(factory) and deps.isConsented(predicate) are required" });
    }
    const records = Object.keys(r.store.snapshots).sort().map((id) => clone(r.store.snapshots[id].record));
    const snapshotJson = JSON.stringify({ v: 1, seq: r.store.index.seq, proposals: records, events: [] });
    let machine;
    try {
      machine = deps.createMatch({ isConsented: deps.isConsented, now: deps.now, nextId: deps.nextId }, snapshotJson);
    } catch (err) {
      return refuse("RESTORE_FAILED", { reason: String((err && err.message) || err) });
    }
    if (!machine || typeof machine.snapshot !== "function") return refuse("RESTORE_FAILED", { reason: "factory returned no machine" });
    return { ok: true, machine };
  }

  // Fold a live machine back into the store: per-proposal snapshots and the
  // index are rebuilt from machine.snapshot(); unlock events (the snapshot's
  // remainder + any the caller pre-drained into opts.events) become outbox
  // deliveries, deduped by proposalId + "@" + introUnlockedAt. Records the
  // machine no longer holds are RETAINED — history is never dropped.
  function persistMachine(store, machine, at, opts) {
    const r = inspectStore(store);
    if (!r.ok) return r;
    const iso = isoOf(at);
    if (!iso) return refuse("INVALID_TIMESTAMP");
    if (!machine || typeof machine.snapshot !== "function") return refuse("SNAPSHOT_UNREADABLE", { reason: "no machine" });
    let snap;
    try { snap = JSON.parse(machine.snapshot()); } catch { return refuse("SNAPSHOT_UNREADABLE", { reason: "snapshot_not_json" }); }
    if (!isObj(snap) || !Array.isArray(snap.proposals)) return refuse("SNAPSHOT_UNREADABLE", { reason: "snapshot_bad_shape" });

    const base = r.store;
    const snapshots = clone(base.snapshots);
    const changed = new Set();
    for (const rec of snap.proposals) {
      if (!isObj(rec) || !isId(rec.id)) return corrupt("snapshots", "machine_record_bad_id");
      const v = validateProposalRecord(rec, rec.id);
      if (!v.ok) return v;
      const prev = snapshots[rec.id];
      if (!prev || JSON.stringify(prev.record) !== JSON.stringify(rec)) changed.add(rec.id);
      snapshots[rec.id] = { kind: SNAPSHOT_KIND, version: VERSION, proposal_id: rec.id, saved_at: iso, record: clone(rec) };
    }

    // unlock events -> outbox deliveries (deduped, at-least-once)
    const outbox = clone(base.outbox);
    const seen = new Set(outbox.map((d) => d.dedupe_key));
    const addDelivery = (proposalId, aId, bId, unlockedMs) => {
      const unlockedIso = isoOf(unlockedMs);
      if (!unlockedIso) return false;
      const key = proposalId + "@" + unlockedIso;
      if (seen.has(key)) return true;
      seen.add(key);
      outbox.push(buildDelivery({ dedupe_key: key, proposal_id: proposalId, a_id: aId, b_id: bId,
        unlocked_at: unlockedIso, recorded_at: iso, delivered_at: null }));
      return true;
    };
    const events = (Array.isArray(snap.events) ? snap.events : [])
      .concat(opts && Array.isArray(opts.events) ? opts.events : []);
    for (const ev of events) {
      if (!isObj(ev) || ev.type !== "intro_unlocked" || !isId(ev.proposalId) || !isId(ev.aId) || !isId(ev.bId) ||
          isoOf(ev.at) === null) {
        return refuse("UNKNOWN_EVENT", { reason: "event_not_a_wellformed_intro_unlock" });
      }
      addDelivery(ev.proposalId, ev.aId, ev.bId, ev.at);
    }
    // backfill: an unlocked record whose delivery was lost still delivers
    for (const id of Object.keys(snapshots)) {
      const rec = snapshots[id].record;
      if (rec.introUnlocked === true && !addDelivery(rec.id, rec.aId, rec.bId, rec.introUnlockedAt)) {
        return corrupt("snapshots." + id, "record_bad_unlock_stamp");
      }
    }

    // index rebuilt from every snapshot record, in proposal_id order
    const prevEntries = new Map(base.index.entries.map((e) => [e.proposal_id, e]));
    const entries = Object.keys(snapshots).sort().map((id) => {
      const rec = snapshots[id].record;
      const prev = prevEntries.get(id);
      const updatedAt = prev && !changed.has(id) ? prev.updated_at : iso;
      return withExtras(entryFromRecord(rec, updatedAt), prev && !changed.has(id) ? prev : null);
    });
    const seq = Number.isInteger(snap.seq) ? Math.max(base.index.seq, snap.seq) : base.index.seq;
    const out = withExtras({
      kind: STORE_KIND, version: VERSION,
      index: { kind: INDEX_KIND, version: VERSION, seq, updated_at: iso, entries },
      snapshots, outbox,
    }, base);
    return { ok: true, store: out };
  }

  // ---- outbox consumption (the intro lane's side of the hand-off) --------
  function pendingDeliveries(store) {
    const r = inspectStore(store);
    if (!r.ok) return r;
    return { ok: true, deliveries: r.store.outbox.filter((d) => d.delivered_at === null).map(clone) };
  }
  function ackDelivery(store, dedupeKey, at) {
    const r = inspectStore(store);
    if (!r.ok) return r;
    const iso = isoOf(at);
    if (!iso) return refuse("INVALID_TIMESTAMP");
    const d = r.store.outbox.find((x) => x.dedupe_key === dedupeKey);
    if (!d) return refuse("DELIVERY_NOT_FOUND", { dedupe_key: dedupeKey });
    if (d.delivered_at !== null) return { ok: true, store: r.store, already: true };
    if (Date.parse(iso) < Date.parse(d.recorded_at)) return refuse("INVALID_TIMESTAMP", { reason: "ack_before_recorded" });
    d.delivered_at = iso;
    return { ok: true, store: r.store, already: false };
  }

  // ---- surfacing -----------------------------------------------------------
  function renderProposalText(payload) {
    if (!isObj(payload) || !isId(payload.need) || !isId(payload.offer) || !isId(payload.why) ||
        !Number.isFinite(payload.expiresAt)) return null;
    const expires = new Date(payload.expiresAt).toISOString();
    return TEXTS.PROPOSAL_TEMPLATE
      .split("{need}").join(payload.need)
      .split("{offer}").join(payload.offer)
      .split("{why}").join(payload.why)
      .split("{expires}").join(expires);
  }

  // The text (if any) a user should see about their match right now.
  // Read-only: expiry is reported honestly from the stored record; the
  // machine applies the actual transition on its next touch.
  function currentProposalText(store, userId, at) {
    const r = inspectStore(store);
    if (!r.ok) return r;
    if (!isId(userId)) return refuse("INVALID_INPUT", { reason: "user_id_required" });
    const atMs = clockMsOf(at);
    if (Number.isNaN(atMs)) return refuse("INVALID_TIMESTAMP");
    const mine = r.store.index.entries.filter((e) => e.a_id === userId || e.b_id === userId);
    const byRecency = (x, y) => (x.created_at < y.created_at ? 1 : x.created_at > y.created_at ? -1
      : x.proposal_id < y.proposal_id ? 1 : -1);
    const open = mine.filter((e) => OPEN_STATES.includes(e.state)).sort(byRecency)[0];
    if (open) {
      const rec = r.store.snapshots[open.proposal_id].record;
      if (atMs >= rec.expiresAt) return { ok: true, status: "expired", proposalId: rec.id, text: TEXTS.EXPIRED };
      const side = rec.aId === userId ? "a" : "b";
      const own = side === "a" ? rec.aAnswer : rec.bAnswer;
      if (own !== null) return { ok: true, status: "waiting", proposalId: rec.id, text: TEXTS.WAITING };
      const pitch = side === "a" ? rec.aPitch : rec.bPitch; // 158's payload pick, verbatim
      const text = renderProposalText({ proposalId: rec.id, need: pitch.need, offer: pitch.offer, why: rec.why, expiresAt: rec.expiresAt });
      return { ok: true, status: "open", proposalId: rec.id, text };
    }
    const terminal = mine.sort(byRecency)[0];
    if (!terminal) return { ok: true, status: "none", proposalId: null, text: null };
    const rec = r.store.snapshots[terminal.proposal_id].record;
    if (rec.state === "both_yes") return { ok: true, status: "both_yes", proposalId: rec.id, text: TEXTS.BOTH_YES };
    if (rec.state === "expired") return { ok: true, status: "expired", proposalId: rec.id, text: TEXTS.EXPIRED };
    const own = rec.aId === userId ? rec.aAnswer : rec.bAnswer;
    if (own === "no") return { ok: true, status: "declined_self", proposalId: rec.id, text: TEXTS.DECLINED_SELF };
    return { ok: true, status: "closed", proposalId: rec.id, text: TEXTS.CLOSED };
  }

  // ---- the answer parser ---------------------------------------------------
  // Only an explicit standalone yes/no to the CURRENT open proposal is an
  // answer. Everything else — qualified, longer, off-topic, or with no
  // proposal open — is conversation, never an answer.
  function parseAnswer(text, context) {
    if (!context || context.hasOpenProposal !== true) return { type: "not_an_answer", reason: "no_open_proposal" };
    if (typeof text !== "string") return { type: "not_an_answer", reason: "not_text" };
    const norm = text.trim().toLowerCase().replace(/’/g, "'").replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim();
    if (YES_ANSWERS.includes(norm)) return { type: "answer", value: "yes" };
    if (NO_ANSWERS.includes(norm)) return { type: "answer", value: "no" };
    return { type: "not_an_answer", reason: "not_explicit" };
  }

  return { VERSION, STORE_KIND, INDEX_KIND, SNAPSHOT_KIND, DELIVERY_KIND, CARRIAGE_KEY,
    MATCH_STATES, OPEN_STATES, TEXTS, YES_ANSWERS, NO_ANSWERS,
    emptyStore, validateStore, serializeStore, parseStore,
    attachToProfile, readFromProfile,
    restoreMachine, persistMachine,
    pendingDeliveries, ackDelivery,
    renderProposalText, currentProposalText, parseAnswer };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerConnectorMatchHost;
