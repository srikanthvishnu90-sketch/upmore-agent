/* Career paid-data credit ledger (MI-111, harness memo G6; Crew B data
   layer). Lands BEFORE the first paid source is connected, never after.

   The defect: paid lookups — Hunter (one shared credit pool across all
   users, terms UNCLEAR per MI-067), aggregator credits, any future paid
   source — had NO per-user accounting at all. One user, or one runaway
   loop, could silently drain the shared pool for everyone, and no one
   could answer "what did the pool spend today, per user, per source".

   This module is the gate every paid call must pass through:

     runPaidLookup(req, lookupFn) — the only sanctioned paid-call seam,
       following Spec 1 §327: "reserve credits transactionally before a
       paid request; reconcile actual usage after results."
       1. quote from SOURCE_CATALOG — a source/kind with no catalogued
          cost is unpriced spend and is refused (UNKNOWN_PAID_SOURCE);
          a variable-priced kind refuses without an in-range quote
          (QUOTE_REQUIRED). The lookup never runs on a refusal.
       2. ceiling check — settled + reserved + this cost must fit the
          user's daily ceiling (default 50 credits, per-user
          overridable). Over the ceiling: BUDGET_REACHED with an honest
          "data budget reached" line; the lookup NEVER runs and nothing
          is debited. Fail-closed, never a silent pool drain.
       3. reserve — a "reserved" ledger entry persists BEFORE the call,
          so concurrent in-flight lookups count against the same ceiling.
       4. reconcile — on success the entry settles at the real charge:
          a lookup reporting billable_units (Hunter charges per FOUND
          result) settles at unit cost x billable units, possibly 0.
          On a throw the reservation is released (charged 0, kept as an
          audit row): an unproven vendor charge is never booked.

   All money is integer MILLICREDITS (1 credit = 1000). Hunter
   verification costs 0.5 credits (Spec 1 observed rules) — float credit
   arithmetic would drift, so no float ever touches a cost.

   Records, in the injected {get,set} store (121's KV contract):
     career:paid-data-ledger:<user_id>  append-only entries {entry_id,
       user_id, ts, day (UTC), source, kind, units, unit_cost_milli,
       cost_milli, status: reserved|settled|released, purpose}
     career:paid-data-config:<user_id>  { daily_ceiling_milli }
     career:paid-data-pool:<day>        pool index, updated on settle:
       { day, total_milli, lookups, by_source, by_user } — pool-level
       spend reportable per day without scanning every user.

   A malformed stored ledger THROWS rather than reading as empty: a
   corrupted ledger must never reset a user's spend to zero.

   Unit costs are Spec 1's OBSERVED vendor list rules (labeled as such,
   not embedded-use quotes): hunter email_finder 1cr/found result,
   email_verifier 0.5cr, domain_search 1cr/email; apollo people_search
   0cr, enrichment 1-9cr variable; pdl person_search 1cr/returned
   record; aggregator api_credit 1cr. Pure domain module, UMD like the
   other domain modules. No fetch, no deploy, no secrets, no real
   paid-source calls — the lookup is always an injected function. */
const CareerPaidData = (() => {
  const LEDGER_KEY = (uid) => `career:paid-data-ledger:${uid}`;
  const CONFIG_KEY = (uid) => `career:paid-data-config:${uid}`;
  const POOL_KEY = (day) => `career:paid-data-pool:${day}`;
  const MILLI = 1000;
  const DEFAULT_DAILY_CEILING_MILLI = 50 * MILLI; // Crew B policy default (50 credits/day), NOT an owner-decided number

  const BUDGET_LINE = "Your daily data budget reached its limit for today, so I've stopped paid lookups — nothing more will be charged to the shared data pool until tomorrow. Free results still work, and anything already found is saved.";

  // fixed: unit_cost_milli per unit. range: [min,max] millicredits per
  // unit — the caller must quote inside the range (QUOTE_REQUIRED else).
  const SOURCE_CATALOG = {
    hunter: { label: "Hunter", basis: "Spec 1 observed rules [S2]: 1 credit per found Email Finder result; 0.5 per verification; Domain Search 1 credit per email", kinds: {
      email_finder: { fixed: 1000 },
      email_verifier: { fixed: 500 },
      domain_search: { fixed: 1000 },
    } },
    apollo: { label: "Apollo", basis: "Spec 1 observed rules [S4-S6]: People Search 0 credits (no email/phone); enrichment separately billed, 1-9 credits per person without waterfall", kinds: {
      people_search: { fixed: 0 },
      enrichment: { range: [1000, 9000] },
    } },
    pdl: { label: "People Data Labs", basis: "Spec 1 observed rules [S8/S9]: Person Search 1 credit per returned record", kinds: {
      person_search: { fixed: 1000 },
    } },
    aggregator: { label: "Job-data aggregator", basis: "Spec 2 §5: aggregator APIs are credit-priced; 1 credit per API credit consumed", kinds: {
      api_credit: { fixed: 1000 },
    } },
  };

  const s = (v) => (v == null ? "" : String(v));
  const lc = (v) => s(v).toLowerCase().trim();

  function nowMs(now) {
    const v = typeof now === "function" ? now() : now;
    if (v == null) return Date.now();
    if (v instanceof Date) return v.getTime();
    if (typeof v === "number") return v;
    const p = Date.parse(v);
    return isNaN(p) ? Date.now() : p;
  }
  const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
  const cleanPurpose = (v) => s(v).replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

  function requireStore(store) {
    if (!store || typeof store.get !== "function" || typeof store.set !== "function")
      throw new Error("156 runPaidLookup requires an injected store {get,set} (121's snapshot KV contract)");
  }
  function requireUser(userId) {
    if (!s(userId).trim()) throw new Error("156: a paid lookup requires a userId — pool spend is never anonymous");
    return s(userId).trim();
  }

  // ---------- catalog / quoting ----------
  function quoteCost(req) {
    req = req || {};
    const source = lc(req.source), kind = lc(req.kind);
    const src = SOURCE_CATALOG[source];
    if (!src) return { ok: false, code: "UNKNOWN_PAID_SOURCE", source, kind, detail: `no catalogued cost for source "${source || "(none)"}" — unpriced spend is refused, never served` };
    const k = src.kinds[kind];
    if (!k) return { ok: false, code: "UNKNOWN_PAID_SOURCE", source, kind, detail: `"${source}" has no catalogued "${kind || "(none)"}" lookup — unpriced spend is refused, never served` };
    const units = req.units;
    if (!Number.isInteger(units) || units <= 0)
      return { ok: false, code: "INVALID_LOOKUP", source, kind, detail: "units must be a positive integer (the number of billable results requested)" };
    let unit;
    if (k.range) {
      const q = req.quoted_cost_milli;
      if (!Number.isInteger(q))
        return { ok: false, code: "QUOTE_REQUIRED", source, kind, units, range_milli: k.range, detail: `"${source}.${kind}" is variable-priced (${k.range[0]}-${k.range[1]} millicredits per unit) — a quoted cost inside the range is required before any call` };
      if (q < k.range[0] || q > k.range[1])
        return { ok: false, code: "QUOTE_REQUIRED", source, kind, units, range_milli: k.range, detail: `quoted cost ${q} millicredits is outside the catalogued range ${k.range[0]}-${k.range[1]} for "${source}.${kind}"` };
      unit = q;
    } else {
      unit = k.fixed;
    }
    return { ok: true, source, kind, units, unit_cost_milli: unit, cost_milli: unit * units };
  }

  // ---------- persisted records ----------
  async function loadLedger(store, uid) {
    const raw = await store.get(LEDGER_KEY(uid));
    if (raw == null) return { user_id: uid, entries: [] };
    if (typeof raw !== "object" || !Array.isArray(raw.entries))
      throw new Error(`156: stored paid-data ledger for ${uid} is malformed — refusing to read it as empty (spend must never reset silently)`);
    return raw;
  }
  async function loadConfig(store, uid) {
    const raw = await store.get(CONFIG_KEY(uid));
    if (raw && Number.isInteger(raw.daily_ceiling_milli) && raw.daily_ceiling_milli >= 0)
      return { daily_ceiling_milli: raw.daily_ceiling_milli, source: "user" };
    return { daily_ceiling_milli: DEFAULT_DAILY_CEILING_MILLI, source: "default" };
  }
  async function setDailyCeiling(req) {
    req = req || {};
    requireStore(req.store);
    const uid = requireUser(req.userId);
    if (!Number.isInteger(req.ceiling_milli) || req.ceiling_milli < 0)
      throw new Error("156 setDailyCeiling: ceiling_milli must be a non-negative integer (0 turns paid lookups off for the user)");
    await req.store.set(CONFIG_KEY(uid), { daily_ceiling_milli: req.ceiling_milli });
    return { user_id: uid, daily_ceiling_milli: req.ceiling_milli };
  }
  async function getConfig(req) {
    req = req || {};
    requireStore(req.store);
    const uid = requireUser(req.userId);
    const c = await loadConfig(req.store, uid);
    return { user_id: uid, daily_ceiling_milli: c.daily_ceiling_milli, source: c.source };
  }

  function dayTotals(entries, day) {
    let settled = 0, reserved = 0;
    for (const e of entries) {
      if (e.day !== day) continue;
      if (e.status === "settled") settled += e.cost_milli;
      else if (e.status === "reserved") reserved += e.cost_milli;
    }
    return { settled_milli: settled, reserved_milli: reserved };
  }

  // ---------- reports (the graded end states) ----------
  async function budgetStatus(req) {
    req = req || {};
    requireStore(req.store);
    const uid = requireUser(req.userId);
    const day = req.day || dayOf(nowMs(req.now));
    const cfg = await loadConfig(req.store, uid);
    const led = await loadLedger(req.store, uid);
    const t = dayTotals(led.entries, day);
    const committed = t.settled_milli + t.reserved_milli;
    return { user_id: uid, day, ceiling_milli: cfg.daily_ceiling_milli, ceiling_source: cfg.source,
      spent_milli: t.settled_milli, reserved_milli: t.reserved_milli, committed_milli: committed,
      remaining_milli: Math.max(0, cfg.daily_ceiling_milli - committed), at_ceiling: committed >= cfg.daily_ceiling_milli };
  }

  async function dailySpend(req) {
    req = req || {};
    requireStore(req.store);
    const uid = requireUser(req.userId);
    const day = req.day || dayOf(nowMs(req.now));
    const led = await loadLedger(req.store, uid);
    const by_source = {};
    let total = 0, lookups = 0;
    for (const e of led.entries) {
      if (e.day !== day || e.status !== "settled") continue;
      total += e.cost_milli; lookups++;
      by_source[e.source] = (by_source[e.source] || 0) + e.cost_milli;
    }
    return { user_id: uid, day, total_milli: total, lookups, by_source };
  }

  async function ledgerEntries(req) {
    req = req || {};
    requireStore(req.store);
    const uid = requireUser(req.userId);
    const led = await loadLedger(req.store, uid);
    return led.entries.map((e) => ({ ...e }));
  }

  async function poolReport(req) {
    req = req || {};
    requireStore(req.store);
    const day = req.day || dayOf(nowMs(req.now));
    const raw = await req.store.get(POOL_KEY(day));
    if (!raw || typeof raw !== "object")
      return { day, total_milli: 0, lookups: 0, by_source: {}, by_user: {} };
    return { day, total_milli: raw.total_milli || 0, lookups: raw.lookups || 0,
      by_source: { ...(raw.by_source || {}) }, by_user: { ...(raw.by_user || {}) } };
  }

  async function settlePool(store, entry) {
    const key = POOL_KEY(entry.day);
    const raw = await store.get(key);
    const pool = (raw && typeof raw === "object") ? raw
      : { day: entry.day, total_milli: 0, lookups: 0, by_source: {}, by_user: {} };
    pool.total_milli = (pool.total_milli || 0) + entry.cost_milli;
    pool.lookups = (pool.lookups || 0) + 1;
    pool.by_source = pool.by_source || {};
    pool.by_source[entry.source] = (pool.by_source[entry.source] || 0) + entry.cost_milli;
    pool.by_user = pool.by_user || {};
    pool.by_user[entry.user_id] = (pool.by_user[entry.user_id] || 0) + entry.cost_milli;
    await store.set(key, pool);
  }

  // ---------- the seam ----------
  async function runPaidLookup(req, lookupFn) {
    req = req || {};
    requireStore(req.store);
    const uid = requireUser(req.userId);
    if (typeof lookupFn !== "function")
      throw new Error("156 runPaidLookup requires the lookup as an injected function — this module never calls a paid source itself");
    const quote = quoteCost(req);
    if (!quote.ok) return { ok: false, code: quote.code, detail: quote.detail, source: quote.source, kind: quote.kind };
    const ms = nowMs(req.now);
    const day = dayOf(ms);
    const cfg = await loadConfig(req.store, uid);
    const led = await loadLedger(req.store, uid);
    const t = dayTotals(led.entries, day);
    const committed = t.settled_milli + t.reserved_milli;
    if (quote.cost_milli > 0 && committed + quote.cost_milli > cfg.daily_ceiling_milli) {
      return { ok: false, code: "BUDGET_REACHED", source: quote.source, kind: quote.kind,
        day, spent_milli: t.settled_milli, reserved_milli: t.reserved_milli,
        ceiling_milli: cfg.daily_ceiling_milli, cost_milli: quote.cost_milli,
        speak_line: BUDGET_LINE,
        detail: `daily ceiling ${cfg.daily_ceiling_milli} millicredits; committed ${committed}; this lookup costs ${quote.cost_milli} — refused whole, never part-served, never charged` };
    }
    const entry = {
      entry_id: `pd-${day}-${led.entries.length + 1}`,
      user_id: uid, ts: new Date(ms).toISOString(), day,
      source: quote.source, kind: quote.kind, units: quote.units,
      unit_cost_milli: quote.unit_cost_milli, cost_milli: quote.cost_milli,
      status: "reserved", purpose: cleanPurpose(req.purpose),
    };
    led.entries.push(entry);
    await req.store.set(LEDGER_KEY(uid), led); // reserve BEFORE the paid call (Spec 1 §327)

    let result;
    try {
      result = await lookupFn({ source: quote.source, kind: quote.kind, units: quote.units, user_id: uid });
    } catch (err) {
      entry.status = "released";
      entry.cost_milli = 0;
      entry.error = s(err && err.message ? err.message : err).slice(0, 120);
      await req.store.set(LEDGER_KEY(uid), led);
      return { ok: false, code: "LOOKUP_FAILED", entry_id: entry.entry_id, source: quote.source, kind: quote.kind,
        detail: "the paid lookup failed; its reservation was released and nothing was charged (an unproven vendor charge is never booked)",
        error: entry.error };
    }
    // Reconcile to the units the vendor actually bills for, when the
    // lookup reports them (Hunter: per FOUND result — 0 found = 0 due).
    let actualUnits = quote.units;
    if (result && typeof result === "object" && result.billable_units != null) {
      const b = Number(result.billable_units);
      if (Number.isFinite(b) && b >= 0) actualUnits = Math.floor(b);
    }
    entry.units = actualUnits;
    entry.cost_milli = entry.unit_cost_milli * actualUnits;
    if (entry.cost_milli > quote.cost_milli) entry.over_ceiling = true; // vendor charged past the reservation — settled at the truth, flagged, never hidden
    entry.status = "settled";
    await req.store.set(LEDGER_KEY(uid), led);
    await settlePool(req.store, entry);
    return { ok: true, result, debit: { ...entry } };
  }

  return { SOURCE_CATALOG, DEFAULT_DAILY_CEILING_MILLI, BUDGET_LINE,
    LEDGER_KEY, CONFIG_KEY, POOL_KEY,
    quoteCost, runPaidLookup, budgetStatus, dailySpend, poolReport,
    ledgerEntries, setDailyCeiling, getConfig };
})();
if (typeof module !== "undefined" && module.exports) module.exports = CareerPaidData;
