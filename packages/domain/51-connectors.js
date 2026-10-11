  /* Connector architecture (Instinct spec doc 04): the pure half. One
     connector model every source plugs into: a ConnectorRecord plus an
     adapter with five verbs (connect, sync, act, health, revoke). The agent
     never talks provider APIs; it talks the verbs. Consent is a first-class
     record in plain words. Sync batches land in one canonical schema with
     merchant normalization at ingest and a freshness stamp on every datum.
     Source-of-truth ranking resolves conflicts per datum and reports them,
     never merging silently. Health treats breakage as normal: NEEDS_REAUTH
     produces exactly one calm message, escalation never spams. act() passes
     the autonomy gate and the compliance gate before any adapter call; a T5
     action never reaches an adapter. Revoke destroys the token handle, stops
     syncs and writes the retention note. Three reference adapters ship:
     a fake aggregator with a fixture bank, a manual CSV adapter, and a stub
     OAuth adapter. No secrets live here: adapters receive a vault handle.
     Loads after AgentMonitors (merchantKey), AgentLoop (gate) and Compliance. */
  const Connectors = (() => {
    const AUTH = Object.freeze(["AGGREGATOR", "OAUTH", "VAULTED_CREDENTIALS", "MANUAL"]);
    const STATUS = Object.freeze(["HEALTHY", "STALE", "NEEDS_REAUTH", "BROKEN", "REVOKED"]);
    const SCOPES = Object.freeze(["READ_BALANCES", "READ_TRANSACTIONS", "READ_HOLDINGS", "READ_BILLS", "READ_IDENTITY", "INITIATE_TRANSFER", "PLACE_ORDER"]);
    const WRITE_SCOPES = new Set(["INITIATE_TRANSFER", "PLACE_ORDER"]);
    const CADENCE_MS = Object.freeze({ banking: 86400000, balances: 900000, bills: 30 * 86400000, holdings: 3600000 });
    const RELIABILITY = Object.freeze({ AGGREGATOR: "high", OAUTH: "high", VAULTED_CREDENTIALS: "low (scrape; least reliable class)", MANUAL: "exact (user-entered)" });
    // Source-of-truth ranking per datum: lower is better. Conflicts are reported, never merged.
    const RANKING = Object.freeze({ balance: ["AGGREGATOR", "OAUTH", "VAULTED_CREDENTIALS", "MANUAL"], transaction: ["AGGREGATOR", "OAUTH", "VAULTED_CREDENTIALS", "MANUAL"], holding: ["OAUTH", "AGGREGATOR", "VAULTED_CREDENTIALS", "MANUAL"], bill: ["OAUTH", "VAULTED_CREDENTIALS", "AGGREGATOR", "MANUAL"] });
    const merchantKey = raw => typeof AgentMonitors !== "undefined" ? AgentMonitors.merchantKey(raw) : String(raw || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const need = (o, keys, what) => { for (const k of keys) if (o[k] === undefined || o[k] === null || o[k] === "") throw new Error(`${what} needs ${k}`); };

    // Adapter validation: the five verbs, nothing less. Write verbs only where the adapter declares write scopes.
    function validateAdapter(a) {
      const missing = ["connect", "sync", "act", "health", "revoke"].filter(v => typeof (a && a[v]) !== "function");
      if (missing.length) throw new Error(`adapter ${a && a.provider || "?"} lacks ${missing.join(", ")}`);
      if (!AUTH.includes(a.authMethod)) throw new Error(`adapter ${a.provider}: invalid authMethod ${a.authMethod}`);
      for (const s of a.scopes || []) if (!SCOPES.includes(s)) throw new Error(`adapter ${a.provider}: unknown scope ${s}`);
      return true;
    }
    // Consent: what the user agreed to, verbatim, with the retention rule and the revocation path.
    function consentRecord(scopes, opts) {
      const o = opts || {}, reads = scopes.filter(s => !WRITE_SCOPES.has(s)), writes = scopes.filter(s => WRITE_SCOPES.has(s));
      if (writes.length && !o.write_consent) throw new Error("write scopes need their own consent grant (separate screen, T3 and up)");
      const words = { READ_BALANCES: "see your balances", READ_TRANSACTIONS: "see your transactions", READ_HOLDINGS: "see your holdings", READ_BILLS: "see your bills", READ_IDENTITY: "see the name and masked numbers on the account", INITIATE_TRANSFER: "move money between your own accounts or to people you approve, each time you confirm", PLACE_ORDER: "place the orders you direct, each time you confirm" };
      return { scopes: scopes.slice(), text: `Upmore can ${scopes.map(s => words[s]).join(", ")}. Data is kept ${o.retention || "while the connection is active and for 90 days after, then deleted"}. You can revoke at any time; revoking deletes the token, stops syncs and tells you what is retained and why.`, retention: o.retention || "while the connection is active and for 90 days after, then deleted", revocation: "any time; token destroyed, syncs stopped, retention stated", granted_at: o.now, read_only: writes.length === 0 };
    }

    function create(opts) {
      const o = opts || {}, adapters = new Map(), records = new Map(), audit = [], events = [], vault = o.vault || { put: (id, secret) => ({ handle: "vh_" + id }), destroy: id => true };
      const clock = o.clock || (() => Date.now());
      let seq = 0;
      const log = (kind, detail) => { audit.push(Object.assign({ at: clock(), kind }, redact(detail))); return audit[audit.length - 1]; };
      const redact = d => JSON.parse(JSON.stringify(d || {}, (k, v) => /secret|password|token|credential|otp|ssn/i.test(k) ? "[redacted]" : v));
      function register(adapter) { validateAdapter(adapter); adapters.set(adapter.provider, adapter); return adapter.provider; }
      // connect: the adapter may hand off (OAuth, aggregator UI); the record stores a vault handle, never the secret.
      async function connect(provider, user, credentials, scopes, consentOpts) {
        const a = adapters.get(provider); if (!a) throw new Error(`no adapter for ${provider}`);
        const asked = scopes || a.scopes.filter(s => !WRITE_SCOPES.has(s));
        for (const s of asked) if (!a.scopes.includes(s)) throw new Error(`${provider} does not offer scope ${s}`);
        const consent = consentRecord(asked, Object.assign({ now: clock() }, consentOpts || {}));
        const session = await a.connect(user, credentials);
        const id = `conn_${String(++seq).padStart(3, "0")}`;
        const handle = session.token ? vault.put(id, session.token).handle : null;
        const rec = { id, provider, user, authMethod: a.authMethod, scopes: asked, consent, status: session.handoff ? "NEEDS_REAUTH" : "HEALTHY", handoff: session.handoff || null, lastSyncAt: null, lastSuccessAt: null, capabilities: a.capabilities || [], token_handle: handle, reliability: RELIABILITY[a.authMethod], reauth_messages: 0, retention_note: null };
        records.set(id, rec); log("connect", { connector: id, provider, scopes: asked, handoff: !!session.handoff });
        return rec;
      }
      // sync: one canonical schema, merchant normalization at ingest, freshness stamped.
      async function sync(id, since) {
        const rec = records.get(id); if (!rec) throw new Error(`unknown connector ${id}`);
        if (rec.status === "REVOKED") throw new Error(`${id} is revoked; syncs are stopped`);
        const a = adapters.get(rec.provider); rec.lastSyncAt = clock();
        let batch;
        try { batch = await a.sync(rec, since); }
        catch (err) { const h = classify(err); rec.status = h.status; log("sync_error", { connector: id, error: String(err && err.message || err), status: h.status }); if (h.status === "NEEDS_REAUTH") reauthEvent(rec); return { ok: false, status: rec.status, error: String(err && err.message || err) }; }
        const now = clock(), stamp = x => Object.assign(x, { connector_id: id, source: rec.provider, auth: rec.authMethod, as_of: now });
        const out = { accounts: (batch.accounts || []).map(x => stamp(normalizeAccount(x))), transactions: (batch.transactions || []).map(x => stamp(normalizeTransaction(x))), holdings: (batch.holdings || []).map(x => stamp(normalizeHolding(x))), bills: (batch.bills || []).map(x => stamp(normalizeBill(x))), people: (batch.people || []).map(x => stamp({ name: String(x.name || ""), handle: x.handle || null })) };
        if (batch.corrupt) { rec.status = "BROKEN"; log("sync_corrupt", { connector: id }); return { ok: false, status: "BROKEN", error: "batch failed validation" }; }
        rec.lastSuccessAt = now; rec.status = "HEALTHY"; rec.reauth_messages = 0;
        log("sync", { connector: id, counts: { accounts: out.accounts.length, transactions: out.transactions.length, holdings: out.holdings.length, bills: out.bills.length } });
        return Object.assign({ ok: true, status: "HEALTHY", as_of: now }, out);
      }
      // act: only write-capable connectors, and only after the autonomy gate and the compliance gate. A T5 action never reaches the adapter.
      async function act(id, capability, action, gates) {
        const rec = records.get(id); if (!rec) throw new Error(`unknown connector ${id}`);
        const a = adapters.get(rec.provider), g = gates || {};
        const scope = action && action.scope; if (!scope || !WRITE_SCOPES.has(scope)) return refuse(id, "not_a_write_scope", "act() is only for write scopes");
        if (!rec.scopes.includes(scope)) return refuse(id, "scope_not_granted", `the user has not granted ${scope} on this connection`);
        const auto = (g.autonomy || (typeof AgentLoop !== "undefined" ? AgentLoop.gate : null)); if (!auto) return refuse(id, "no_autonomy_gate", "no autonomy gate available");
        const ag = auto(capability, action, g.envelopes || [], clock());
        // The autonomy gate decides: blocked never passes; T5 ("always") never passes here (the loop asks every time and re-enters with the user's answer recorded); T3/T4-outside-envelope pass only with the user's confirmation recorded on the action.
        if (!ag.allowed) return refuse(id, ag.reason, `the autonomy gate blocked it (${ag.reason})`);
        if (ag.always || (ag.confirm && action.confirmed !== true)) return refuse(id, ag.always ? "t5_never_autonomous" : "needs_confirmation", ag.always ? "this is T5: the user confirms every time through the loop, with the recipient read back; act() is never the place that decides" : "this action needs the user's confirmation first; the loop asks, then calls act() with confirmed: true");
        const comp = g.compliance || (typeof Compliance !== "undefined" ? Compliance : null); if (comp) { const cg = comp.gate(capability, g.partners || {}, { executes: true, kyc: g.kyc || null }); if (cg.allowed === false) return refuse(id, "compliance:" + (cg.reason || cg.requirement), cg.message); }
        if (rec.status !== "HEALTHY") return refuse(id, "connector_" + rec.status.toLowerCase(), `the connection is ${rec.status}`);
        log("act", { connector: id, capability: capability.id, action: redact(action) });
        const result = await a.act(rec, action, { token_handle: rec.token_handle });
        log("act_result", { connector: id, capability: capability.id, result: redact(result) });
        return { ok: true, reached_adapter: true, result };
      }
      function refuse(id, reason, message) { log("act_refused", { connector: id, reason }); return { ok: false, reached_adapter: false, reason, message }; }
      // health: scheduled and after any error. NEEDS_REAUTH yields exactly one calm message; later breakage escalates once and then stays quiet.
      async function health(id) {
        const rec = records.get(id); if (!rec) throw new Error(`unknown connector ${id}`);
        if (rec.status === "REVOKED") return { status: "REVOKED", message: null };
        const a = adapters.get(rec.provider);
        let report; try { report = await a.health(rec); } catch (err) { report = { status: "BROKEN", error: String(err && err.message || err) }; }
        const stale = rec.lastSuccessAt !== null && clock() - rec.lastSuccessAt > (CADENCE_MS[a.cadence || "banking"] * 2);
        const status = report.status === "NEEDS_REAUTH" ? "NEEDS_REAUTH" : report.status === "BROKEN" ? "BROKEN" : stale ? "STALE" : "HEALTHY";
        const changed = rec.status !== status; rec.status = status;
        const ev = status === "NEEDS_REAUTH" && changed ? reauthEvent(rec) : null;
        log("health", { connector: id, status, latency_ms: report.latency_ms || null });
        return { status, changed, message: ev ? ev.message : null, degraded: status !== "HEALTHY", last_good_age_ms: rec.lastSuccessAt === null ? null : clock() - rec.lastSuccessAt };
      }
      function reauthEvent(rec) {
        rec.reauth_messages++;
        if (rec.reauth_messages > 2) { log("reauth_suppressed", { connector: rec.id, count: rec.reauth_messages }); return null; }
        const ev = { kind: "needs_reauth", connector: rec.id, provider: rec.provider, message: rec.reauth_messages === 1 ? `${rec.provider} needs you to sign in again. One tap here relinks it; nothing else changes.` : `${rec.provider} still needs a fresh sign-in; the data from it is getting old. Relink when you can.`, one_tap: `relink:${rec.id}`, escalated: rec.reauth_messages === 2 };
        events.push(ev); return ev;
      }
      // revoke: destroy the token, stop syncs, state what is retained and why.
      async function revoke(id, reason) {
        const rec = records.get(id); if (!rec) throw new Error(`unknown connector ${id}`);
        const a = adapters.get(rec.provider);
        await a.revoke(rec); if (rec.token_handle) vault.destroy(id);
        rec.token_handle = null; rec.status = "REVOKED"; rec.revoked_at = clock();
        rec.retention_note = `Token destroyed and syncs stopped on ${new Date(rec.revoked_at).toISOString()}. Retained: transactions and balances already synced, for 90 days, so your history and receipts stay readable; then deleted. Nothing new is read.`;
        log("revoke", { connector: id, reason: reason || null });
        return { status: "REVOKED", retention_note: rec.retention_note };
      }
      // "What are you connected to and what can it do", from data.
      const describe = () => [...records.values()].map(r => ({ id: r.id, provider: r.provider, auth: r.authMethod, status: r.status, scopes: r.scopes, consent: r.consent.text, capabilities: r.capabilities, last_success_at: r.lastSuccessAt, reliability: r.reliability, retention_note: r.retention_note }));
      return { register, connect, sync, act, health, revoke, describe, records, audit, events, adapters };
    }
    function classify(err) { const m = String(err && err.message || err); if (/reauth|login required|mfa|invalid_grant|token expired|ITEM_LOGIN_REQUIRED/i.test(m)) return { status: "NEEDS_REAUTH" }; if (/timeout|unavailable|5\d\d|killed|died/i.test(m)) return { status: "STALE" }; return { status: "BROKEN" }; }
    // Canonical schema.
    const normalizeAccount = x => ({ account_id: String(x.id || x.account_id), name: String(x.name || ""), kind: String(x.type || x.kind || "unknown").toLowerCase(), mask: x.mask ? String(x.mask).slice(-4) : null, balance_cents: Number.isSafeInteger(x.balance_cents) ? x.balance_cents : Math.round(Number(x.balance || 0) * 100), available_cents: Number.isSafeInteger(x.available_cents) ? x.available_cents : (x.available === undefined ? null : Math.round(Number(x.available) * 100)), currency: x.currency || "USD" });
    const normalizeTransaction = x => ({ transaction_id: String(x.id || x.transaction_id), account_id: String(x.account_id), posted_on: String(x.date || x.posted_on || "").slice(0, 10), amount_cents: Number.isSafeInteger(x.amount_cents) ? x.amount_cents : Math.round(Number(x.amount) * 100), merchant_raw: String(x.name || x.merchant_raw || ""), merchant_key: merchantKey(x.name || x.merchant_raw || ""), is_pending: !!x.pending, is_transfer: !!x.is_transfer || /transfer/i.test(String(x.name || "")), category: x.category || null });
    const normalizeHolding = x => ({ account_id: String(x.account_id), symbol: String(x.symbol || x.ticker || ""), quantity: Number(x.quantity || 0), price_cents: Number.isSafeInteger(x.price_cents) ? x.price_cents : Math.round(Number(x.price || 0) * 100), cost_cents: Number.isSafeInteger(x.cost_cents) ? x.cost_cents : (x.cost_basis === undefined ? null : Math.round(Number(x.cost_basis) * 100)) });
    const normalizeBill = x => ({ bill_id: String(x.id || x.bill_id), payee: String(x.payee || x.name || ""), amount_cents: Number.isSafeInteger(x.amount_cents) ? x.amount_cents : Math.round(Number(x.amount || 0) * 100), due_on: String(x.due || x.due_on || "").slice(0, 10), autopay: !!x.autopay });
    // Conflict resolution per datum: the better-ranked class wins; the losing readings are reported, never merged.
    function resolve(kind, readings) {
      const order = RANKING[kind]; if (!order) throw new Error(`no ranking for ${kind}`);
      const rows = (readings || []).filter(r => r && order.includes(r.auth)).sort((a, b) => order.indexOf(a.auth) - order.indexOf(b.auth) || (b.as_of || 0) - (a.as_of || 0));
      if (!rows.length) return { value: null, winner: null, conflict: false, readings: [] };
      const winner = rows[0], others = rows.slice(1).filter(r => JSON.stringify(r.value) !== JSON.stringify(winner.value));
      return { value: winner.value, winner: { source: winner.source, auth: winner.auth, as_of: winner.as_of }, conflict: others.length > 0, readings: rows.map(r => ({ source: r.source, auth: r.auth, value: r.value, as_of: r.as_of })), statement: others.length ? `Sources disagree: ${rows.map(r => `${r.source} says ${JSON.stringify(r.value)}`).join(", ")}. Using ${winner.source} (${winner.auth}), the source of truth for ${kind}s.` : null };
    }
    // Sync scheduling: webhooks first, polling as the fallback at the class cadence.
    function due(rec, cls, now, webhookSeen) { if (webhookSeen) return { due: true, why: "webhook" }; const cadence = CADENCE_MS[cls] || CADENCE_MS.banking; if (rec.lastSyncAt === null) return { due: true, why: "never synced" }; return now - rec.lastSyncAt >= cadence ? { due: true, why: "cadence" } : { due: false, next_at: rec.lastSyncAt + cadence }; }

    // Reference adapters. 1: fake aggregator with a fixture bank. Secrets never leave the adapter; it returns a token the store vaults.
    function fakeAggregator(fixture) {
      const f = fixture || {}; let fail = null;
      return { provider: "fake-aggregator", authMethod: "AGGREGATOR", scopes: ["READ_BALANCES", "READ_TRANSACTIONS", "INITIATE_TRANSFER"], cadence: "banking", capabilities: ["ACCT-001", "TXN-001", "PAY-009"],
        failNext(kind) { fail = kind; },
        connect: async (user, credentials) => ({ token: "agg-access-token-" + user, handoff: null }),
        sync: async (rec, since) => { if (fail === "reauth") { fail = null; throw new Error("ITEM_LOGIN_REQUIRED"); } if (fail === "timeout") { fail = null; throw new Error("provider timeout mid-sync"); } if (fail === "corrupt") { fail = null; return { accounts: f.accounts || [], transactions: f.transactions || [], corrupt: true }; } return { accounts: f.accounts || [], transactions: (f.transactions || []).filter(t => !since || t.date >= since) }; },
        act: async (rec, action, ctx) => ({ reference: "agg-ref-" + (action.amount_cents || 0), token_handle_seen: ctx.token_handle }),
        health: async rec => (fail === "expired" ? (fail = null, { status: "NEEDS_REAUTH" }) : { status: "HEALTHY", latency_ms: 120 }),
        revoke: async rec => ({ revoked: true }) };
    }
    // 2: manual CSV adapter, always available as the floor.
    function manualCsv() {
      return { provider: "manual-csv", authMethod: "MANUAL", scopes: ["READ_TRANSACTIONS"], cadence: "banking", capabilities: ["TXN-014", "TXN-001"],
        connect: async (user, csv) => ({ token: null, csv: String(csv || "") }),
        sync: async (rec, since) => { const lines = String(rec.handoff || rec._csv || "").split(/\r?\n/).filter(Boolean); const [head, ...rows] = lines; const cols = (head || "").split(",").map(s => s.trim().toLowerCase()); return { transactions: rows.map((r, i) => { const v = r.split(","); const o = {}; cols.forEach((c, j) => o[c] = (v[j] || "").trim()); return { id: "csv-" + (i + 1), account_id: o.account || "manual", date: o.date, amount: Number(o.amount), name: o.description || o.name || "" }; }).filter(t => !since || t.date >= since) }; },
        act: async () => { throw new Error("manual connector has no write surface"); },
        health: async () => ({ status: "HEALTHY", latency_ms: 0 }),
        revoke: async () => ({ revoked: true }) };
    }
    // 3: stub OAuth adapter for one sandbox provider: connect hands off to the provider's authorize URL.
    function stubOAuth() {
      return { provider: "sandbox-oauth", authMethod: "OAUTH", scopes: ["READ_HOLDINGS", "READ_BALANCES", "PLACE_ORDER"], cadence: "holdings", capabilities: ["INV-001", "INV-011"],
        connect: async (user, credentials) => credentials && credentials.code ? { token: "oauth-token-for-" + credentials.code } : { token: null, handoff: { url: "https://sandbox.example.test/oauth/authorize?scope=read_holdings", instruction: "Approve read-only access in the provider's window; nothing is stored by Upmore until you return." } },
        sync: async rec => ({ accounts: [{ id: "brk-1", name: "Sandbox brokerage", type: "brokerage", balance: 4212.08 }], holdings: [{ account_id: "brk-1", symbol: "VTI", quantity: 10, price: 300, cost_basis: 2500 }] }),
        act: async (rec, action) => ({ reference: "order-" + action.symbol }),
        health: async () => ({ status: "HEALTHY", latency_ms: 80 }),
        revoke: async () => ({ revoked: true }) };
    }
    return { AUTH, STATUS, SCOPES, WRITE_SCOPES, CADENCE_MS, RANKING, RELIABILITY, validateAdapter, consentRecord, create, resolve, due, classify, normalizeAccount, normalizeTransaction, normalizeHolding, normalizeBill, fakeAggregator, manualCsv, stubOAuth };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = Connectors;
