  /* Alpaca Trading API adapter, LIVE ONLY, for a person's OWN Alpaca account connected through OAuth (owner decision
     2026-10-11: users connect their own brokerage; no shared trading account; no paper trading anywhere in this flow).
     Every order type the trade flow places: market, limit, stop, stop_limit and trailing_stop; buys and sells; whole and
     fractional (qty or notional); replace and cancel. Paths from Alpaca's Trading API v2 reference and OAuth guide
     (github.com/alpacahq/alpaca-docs: content/oauth/guide.md, api-references/trading-api/orders.md, account.md,
     positions.md, clock.md, assets.md; market-data-api/stock-pricing-data/historical.md):
       POST   /v2/orders                         placeOrder (client_order_id <= 48 chars)
       GET    /v2/orders/{order_id}              getOrderStatus
       GET    /v2/orders:by_client_order_id      reconcile a write whose response was lost (returns the order object)
       PATCH  /v2/orders/{order_id}              replace (returns a new order with a new id)
       DELETE /v2/orders/{order_id}              cancelOrder (204 accepted; 422 not cancelable)
       GET    /v2/account                        getAccount: id, status, buying power, cash (strings)
       GET    /v2/positions[/{symbol}]           getPositions (404 = none)
       GET    /v2/clock, GET /v2/assets/{symbol} session, tradable and fractionable (and the company name a position lacks)
       GET    /v2/assets?status=active&asset_class=us_equity  the broker's asset list, for a buy named by company name
       GET    {data}/v2/stocks/{symbol}/quotes/latest?feed=iex (+ trades/latest) quote with its own timestamp (needs the
              OAuth "data" scope)
     "Authorization: Bearer <token>" with the person's own OAuth token, read from the Vault for that person on every request
     (BrokerAccounts, 73-broker-accounts.js); nothing here reads the environment, logs a token or an Authorization header.
     Only api.alpaca.markets and data.alpaca.markets are accepted: the paper hosts and the Broker API are refused, so this
     code cannot trade paper or a shared account. A local mock is accepted only when the caller says it is a mock, and then
     every label says "mock Alpaca server, not Alpaca" as well as LIVE.
     Safety, in this code and not only in the flow: the account the token opens must be the account on the person's row
     (checked before anything is sent); every order and replace is estimated and refused above order_cap_cents (the
     owner's per-order test cap, $5.00 by default, raised only by the owner); a write that throws (network, timeout, 5xx)
     is UNKNOWN and is never retried blind, it is reconciled by client_order_id; a 4xx is a definite refusal; a 401 means
     the connection was revoked or expired and calls on_auth_failure so the host can show Reconnect. fetch is injected. */
  const AlpacaTrading = (() => {
    const LIVE = { trading: "https://api.alpaca.markets", data: "https://data.alpaca.markets" };
    // The only hosts this adapter may reach. Paper (paper-api.alpaca.markets) and the Broker API (broker-api.*) are refused.
    const HOSTS = ["api.alpaca.markets", "data.alpaca.markets"];
    const DEFAULT_CAP_CENTS = 500; // the owner's per-order test cap: $5.00 until the owner raises it
    const TYPES = ["market", "limit", "stop", "stop_limit", "trailing_stop"], SIDES = ["buy", "sell"], TIFS = ["day", "gtc", "opg", "cls", "ioc", "fok"];
    const FRACTIONAL_TYPES = ["market", "limit", "stop", "stop_limit"]; // Fractional Trading doc: these, time_in_force day only
    const OPEN = ["new", "accepted", "pending_new", "accepted_for_bidding", "held", "stopped", "calculated", "suspended", "pending_replace"];
    const LABEL = "LIVE";
    const MARKET_BUFFER = 1.02; // a market or trailing order is estimated 2% through the quote for the cap check
    // Exact decimal handling: money is integer cents, quantities are decimal strings; never a float multiply on money.
    function centsToStr(c) { if (!Number.isSafeInteger(c) || c < 0) throw new Error("price must be whole non-negative cents"); return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`; }
    function strToCents(s, mode) {
      if (s === null || s === undefined || s === "") return null;
      const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(s).trim()); if (!m) return null;
      const frac = (m[3] || "") + "000", cents = Number(m[2]) * 100 + Number(frac.slice(0, 2)), rest = Number(frac.slice(2)) > 0;
      const v = mode === "ceil" && rest ? cents + 1 : mode === "round" && Number(frac[2]) >= 5 ? cents + 1 : cents;
      return m[1] ? -v : v;
    }
    function qtyStr(q) { if (!(Number(q) > 0)) throw new Error("quantity must be above zero"); return String(Math.round(Number(q) * 1e9) / 1e9); }
    const num = s => s === null || s === undefined || s === "" ? null : Number(s);
    // client_order_id: deterministic from the idempotency key, <= 48 characters, so a lost response is found again by it.
    function clientOrderId(key) {
      let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995; const s = String(key);
      for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822519) >>> 0; h2 = (h2 ^ (h2 >>> 13)) >>> 0; }
      let h3 = h1 ^ 0x9e3779b9; for (let i = s.length - 1; i >= 0; i--) h3 = Math.imul(h3 ^ s.charCodeAt(i), 2654435761) >>> 0;
      return "upm-" + [h1, h2, h3, (h1 + h2 + s.length) >>> 0].map(x => x.toString(16).padStart(8, "0")).join("");
    }
    // Local validation before anything is sent, from the Broker API reference and the Fractional Trading page.
    function validate(o) {
      const p = [];
      if (!o || typeof o !== "object") return ["no order"];
      if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(String(o.symbol || ""))) p.push("symbol");
      if (!SIDES.includes(o.side)) p.push("side");
      if (!TYPES.includes(o.type)) p.push("type");
      const tif = o.time_in_force || "day"; if (!TIFS.includes(tif)) p.push("time_in_force");
      const hasQty = o.qty !== undefined && o.qty !== null, hasNotional = o.notional_cents !== undefined && o.notional_cents !== null;
      if (hasQty === hasNotional) p.push("exactly one of qty or notional");
      if (hasNotional && (o.type !== "market" || tif !== "day")) p.push("notional orders are market orders with time_in_force day only");
      if (hasQty && !(Number(o.qty) > 0)) p.push("qty above zero");
      const fractional = hasNotional || (hasQty && !Number.isInteger(Number(o.qty)));
      if (fractional && (!FRACTIONAL_TYPES.includes(o.type) || tif !== "day")) p.push("fractional orders are market, limit, stop or stop_limit with time_in_force day only");
      if ((o.type === "limit" || o.type === "stop_limit") && !Number.isSafeInteger(o.limit_cents)) p.push("limit_price");
      if ((o.type === "stop" || o.type === "stop_limit") && !Number.isSafeInteger(o.stop_cents)) p.push("stop_price");
      if (o.type === "trailing_stop" && !(Number.isSafeInteger(o.trail_cents) || Number(o.trail_percent) > 0)) p.push("trail_price or trail_percent");
      if (o.extended_hours && !(o.type === "limit" && tif === "day")) p.push("extended_hours needs a day limit order");
      return p;
    }
    function body(o, coid) {
      const b = { symbol: o.symbol, side: o.side, type: o.type, time_in_force: o.time_in_force || "day", client_order_id: coid };
      if (o.qty !== undefined && o.qty !== null) b.qty = qtyStr(o.qty); else b.notional = centsToStr(o.notional_cents);
      if (Number.isSafeInteger(o.limit_cents)) b.limit_price = centsToStr(o.limit_cents);
      if (Number.isSafeInteger(o.stop_cents)) b.stop_price = centsToStr(o.stop_cents);
      if (Number.isSafeInteger(o.trail_cents)) b.trail_price = centsToStr(o.trail_cents);
      else if (o.trail_percent !== undefined && o.trail_percent !== null) b.trail_percent = String(o.trail_percent);
      if (o.extended_hours) b.extended_hours = true;
      return b;
    }
    // The broker's order object, in the trade flow's words. state: queued (accepted outside the session), working (resting
    // or routed, nothing filled), partial (some filled, more may come), partial_final (some filled, the rest canceled or
    // expired or done for the day), filled, canceled, expired, rejected, replaced, pending_cancel.
    function normalize(raw, marketOpen) {
      const r = raw || {}, filled = num(r.filled_qty) || 0, s = String(r.status || "");
      let state;
      if (s === "filled") state = "filled";
      else if (s === "partially_filled") state = "partial";
      else if (["done_for_day", "canceled", "expired"].includes(s)) state = filled > 0 ? "partial_final" : s === "done_for_day" ? "working" : s;
      else if (s === "rejected") state = "rejected";
      else if (s === "replaced") state = "replaced";
      else if (s === "pending_cancel") state = "pending_cancel";
      else if (OPEN.includes(s)) state = s === "accepted" && marketOpen === false ? "queued" : r.type === "market" && marketOpen === false ? "queued" : "working";
      else state = "unknown";
      return { order_id: r.id || null, client_order_id: r.client_order_id || null, symbol: r.symbol || null, side: r.side || null, type: r.type || r.order_type || null, time_in_force: r.time_in_force || null,
        qty: num(r.qty), notional_cents: strToCents(r.notional), filled_qty: filled, fill_price_cents: strToCents(r.filled_avg_price, "round"), limit_cents: strToCents(r.limit_price), stop_cents: strToCents(r.stop_price),
        trail_percent: num(r.trail_percent), trail_cents: strToCents(r.trail_price), status: s, state, submitted_at: r.submitted_at || r.created_at || null, filled_at: r.filled_at || null, canceled_at: r.canceled_at || r.cancelled_at || null,
        replaced_by: r.replaced_by || null, replaces: r.replaces || null, reason: r.reject_reason || r.failed_reason || null, live: true };
    }

    // What an order could cost (or bring in), in cents, for the per-order cap. Exact for a dollar amount; a share count is
    // priced at its limit, or at its stop or the quote plus a 2% buffer (a market fill can land above the quote). ref_cents
    // is the quote on the order's side, read by the adapter just before sending. null means it can't be priced.
    function estimate(o, refCents) {
      if (Number.isSafeInteger(o.notional_cents)) return o.notional_cents;
      const q = Number(o.qty); if (!(q > 0)) return null;
      if ((o.type === "limit" || o.type === "stop_limit") && Number.isSafeInteger(o.limit_cents)) return Math.ceil(q * o.limit_cents);
      const px = Math.max(o.type === "stop" && Number.isSafeInteger(o.stop_cents) ? o.stop_cents : 0, Number.isSafeInteger(refCents) ? refCents : 0);
      return px > 0 ? Math.ceil(q * px * MARKET_BUFFER) : null;
    }

    class BrokerError extends Error { constructor(kind, message, status) { super(message); this.kind = kind; this.status = status || null; } }

    function create(cfg) {
      const c = cfg || {};
      const mock = c.mock === true;
      const base = String(c.base || LIVE.trading).replace(/\/+$/, ""), dataBase = String(c.data_base || (mock ? base : LIVE.data)).replace(/\/+$/, "");
      const liveHost = u => { try { return HOSTS.includes(new URL(u).hostname); } catch (_) { return false; } };
      const localHost = u => { try { const h = new URL(u).hostname; return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]"; } catch (_) { return false; } };
      // LIVE ONLY: a paper host, the Broker API or any other host is refused outright. A local mock only when declared.
      for (const u of [base, dataBase]) if (!(liveHost(u) || (mock && localHost(u)))) throw new Error(`AlpacaTrading refuses ${u}: only the live Alpaca Trading API${mock ? " or a local mock" : ""} is allowed.`);
      if (!c.token) throw new Error("AlpacaTrading needs the person's OAuth token from the Vault.");
      if (!c.account_id) throw new Error("AlpacaTrading needs the account_id on the person's row.");
      const cap = c.order_cap_cents === undefined ? DEFAULT_CAP_CENTS : c.order_cap_cents;
      if (!Number.isSafeInteger(cap) || cap <= 0) throw new Error("AlpacaTrading needs a whole, positive order_cap_cents.");
      const fetchFn = c.fetch || (typeof fetch !== "undefined" ? fetch : null); if (!fetchFn) throw new Error("AlpacaTrading needs fetch.");
      const auth = "Bearer " + c.token;
      const clock = c.clock || (() => Date.now()), timeout = c.timeout_ms || 10000;
      const label = mock ? `${LABEL} (mock Alpaca server, not Alpaca)` : `${LABEL} (your Alpaca account)`;
      const source = mock ? "Alpaca mock server" : "your Alpaca account";
      const logs = [];
      // Every log line says LIVE. No token or Authorization header is ever written.
      const log = (event, detail) => { const line = `[${label}] ${event}${detail ? " " + JSON.stringify(detail) : ""}`; logs.push(line); if (typeof c.log === "function") c.log(line); };
      let authFailed = false;
      async function call(method, url, payload, kind) {
        let res;
        try {
          const ctl = typeof AbortController !== "undefined" ? new AbortController() : null, t = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
          try { res = await fetchFn(url, { method, headers: Object.assign({ authorization: auth, accept: "application/json" }, payload ? { "content-type": "application/json" } : {}), body: payload ? JSON.stringify(payload) : undefined, signal: ctl ? ctl.signal : undefined }); }
          finally { if (t) clearTimeout(t); }
        } catch (e) { log(`${method} ${kind} threw`, { error: String(e && e.message || e).slice(0, 120) }); throw new BrokerError("network", `the broker did not answer (${String(e && e.message || e).slice(0, 80)})`); }
        const text = await res.text().catch(() => "");
        let json = null; try { json = text ? JSON.parse(text) : null; } catch (_) { json = null; }
        log(`${method} ${kind} -> ${res.status}`);
        if (res.status >= 500) throw new BrokerError("server", `the broker answered ${res.status}`, res.status);
        if (res.status === 401) {
          if (!authFailed) { authFailed = true; log("connection refused (401): revoked or expired; the person must reconnect"); if (typeof c.on_auth_failure === "function") { try { c.on_auth_failure(); } catch (_) { /* the host's marker never blocks the answer */ } } }
          throw new BrokerError("auth", "your Alpaca connection was revoked or has expired, so nothing was sent. Reconnect it in Settings, Brokerage", 401);
        }
        if (res.status === 404) return { status: 404, json: null };
        if (res.status === 429) throw new BrokerError("rate_limited", "the broker rate-limited the request (429)", 429);
        if (res.status >= 400) throw new BrokerError("rejected", (json && (json.message || json.error)) || `the broker refused it (${res.status})`, res.status);
        return { status: res.status, json };
      }
      const P = path => `${base}/v2${path}`;
      // The account the token opens must be the one on the person's row. Checked once, before anything is staged or sent.
      let owner = null;
      function checkOwner(id) {
        if (id && id === c.account_id) { owner = true; return; }
        owner = false; log("account mismatch: the token does not open the account on this user's row; nothing will be sent");
        throw new BrokerError("isolation", "the linked account does not match this user's account, so nothing was sent");
      }
      async function ensureOwner() { if (owner === true) return; if (owner === false) throw new BrokerError("isolation", "the linked account does not match this user's account, so nothing was sent"); await account(); }
      let lastClock = null;
      async function marketClock() { const r = await call("GET", `${base}/v2/clock`, null, "clock"); const j = r.json || {}; lastClock = { is_open: j.is_open === true, next_open: j.next_open || null, next_close: j.next_close || null, as_of: clock(), source }; return lastClock; }
      async function account() {
        const r = await call("GET", P("/account"), null, "account"); const j = r.json || {}; checkOwner(j.id);
        // Buying power rounds down to the cent: never claim a fraction of a cent the account does not have.
        return { value: { id: c.account_id, status: j.status || null, buying_power_cents: strToCents(j.buying_power, "floor"), cash_cents: strToCents(j.cash, "floor"), currency: j.currency || "USD", paper: false, live: true, order_cap_cents: cap }, source, as_of: clock() };
      }
      async function asset(symbol) { const r = await call("GET", `${base}/v2/assets/${encodeURIComponent(symbol)}`, null, "asset"); if (r.status === 404) return null; const j = r.json || {}; return { symbol: j.symbol || symbol, name: j.name || symbol, tradable: j.tradable === true, fractionable: j.fractionable === true, status: j.status || null }; }
      // The broker's list of active US equities, for a buy named by company ("buy $3 of palantir"). One request per adapter
      // (the adapter lives for one message), kept for that message only; a 404 is an empty list, never a guess.
      let assetList = null;
      async function assets() {
        if (assetList) return assetList;
        const r = await call("GET", `${base}/v2/assets?status=active&asset_class=us_equity`, null, "assets");
        assetList = { value: (Array.isArray(r.json) ? r.json : []).map(j => ({ symbol: j.symbol, name: j.name || j.symbol, tradable: j.tradable === true, fractionable: j.fractionable === true, status: j.status || null })), source, as_of: clock() };
        return assetList;
      }
      async function positions() { const r = await call("GET", P("/positions"), null, "positions"); return { value: (r.json || []).map(pos), source, as_of: clock() }; }
      async function position(symbol) { const r = await call("GET", P(`/positions/${encodeURIComponent(symbol)}`), null, "position"); return { value: r.status === 404 ? { symbol, qty: 0, qty_available: 0, live: true } : pos(r.json), source, as_of: clock() }; }
      const pos = j => ({ symbol: j.symbol, qty: num(j.qty) || 0, qty_available: j.qty_available !== undefined ? num(j.qty_available) : num(j.qty) || 0, avg_entry_cents: strToCents(j.avg_entry_price, "round"), market_value_cents: strToCents(j.market_value, "round"), current_price_cents: strToCents(j.current_price, "round"), paper: false, live: true });
      // The quote a card is priced on: the ask for a buy, the bid for a sell, with the quote's own timestamp as its as-of.
      // A zero or missing side falls back to the latest trade, said so in the source.
      async function quote(symbol, side) {
        const q = await call("GET", `${dataBase}/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest?feed=iex`, null, "quote");
        const qq = (q.json && q.json.quote) || {}, px = side === "sell" ? qq.bp : qq.ap;
        if (Number(px) > 0 && qq.t) return { value: { price_cents: strToCents(String(px), "round"), side: side === "sell" ? "bid" : "ask" }, source: `${source}, IEX ${side === "sell" ? "bid" : "ask"}`, as_of: Date.parse(qq.t) };
        const t = await call("GET", `${dataBase}/v2/stocks/${encodeURIComponent(symbol)}/trades/latest?feed=iex`, null, "trade");
        const tt = (t.json && t.json.trade) || {};
        if (Number(tt.p) > 0 && tt.t) return { value: { price_cents: strToCents(String(tt.p), "round"), side: "last" }, source: `${source}, IEX last trade`, as_of: Date.parse(tt.t) };
        return null;
      }
      // Create. Validation first; a thrown or 5xx write is UNKNOWN (the order may exist); a 4xx is a definite refusal.
      async function submit(order, key) {
        const problems = validate(order); if (problems.length) { log("order refused locally", { problems }); throw new BrokerError("invalid", `not sent: ${problems.join("; ")}`); }
        await ensureOwner();
        await withinCap(order);
        const coid = order.client_order_id || clientOrderId(key || JSON.stringify(order));
        const b = body(order, coid);
        log("submit", { symbol: b.symbol, side: b.side, type: b.type, qty: b.qty || null, notional: b.notional || null, client_order_id: coid });
        try { const r = await call("POST", P("/orders"), b, "order"); return { order: normalize(r.json, lastClock ? lastClock.is_open : undefined), client_order_id: coid }; }
        catch (e) { if (e.kind === "network" || e.kind === "server") { e.client_order_id = coid; e.unknown = true; } throw e; }
      }
      async function getOrder(id) { const r = await call("GET", P(`/orders/${encodeURIComponent(id)}`), null, "order"); return r.status === 404 ? null : normalize(r.json, lastClock ? lastClock.is_open : undefined); }
      // The reference returns "an array containing the requested Order object"; a bare object is accepted too.
      async function byClientOrderId(coid) { const r = await call("GET", `${P("/orders:by_client_order_id")}?client_order_id=${encodeURIComponent(coid)}`, null, "order by client id"); if (r.status === 404) return null; const j = Array.isArray(r.json) ? r.json[0] : r.json; return j ? normalize(j, lastClock ? lastClock.is_open : undefined) : null; }
      // The owner's per-order cap, checked here so no caller can skip it. The flow says it first, before any card.
      async function withinCap(o) {
        let ref = null;
        if (!Number.isSafeInteger(o.notional_cents) && !(o.type === "limit" || o.type === "stop_limit")) { const q = await quote(o.symbol, o.side).catch(() => null); ref = q && q.value ? q.value.price_cents : null; }
        const est = estimate(o, ref);
        if (est === null) { log("order refused locally", { cap_cents: cap, reason: "unpriced" }); throw new BrokerError("cap", `not sent: I can't price it against the $${centsToStr(cap)} per-order limit`); }
        if (est > cap) { log("order refused locally", { cap_cents: cap, estimated_cents: est }); throw new BrokerError("cap", `not sent: about $${centsToStr(est)} is over the $${centsToStr(cap)} per-order limit for live orders while Upmore is in testing`); }
        return est;
      }
      // Replace: whole shares only for qty ("You can only patch full shares for now"); the answer is a NEW order with a new id.
      async function replace(id, changes) {
        const ch = changes || {}, b = {};
        if (ch.qty !== undefined) { if (!Number.isInteger(Number(ch.qty)) || !(Number(ch.qty) > 0)) throw new BrokerError("invalid", "not sent: a replace can only set whole shares"); b.qty = String(Number(ch.qty)); }
        if (Number.isSafeInteger(ch.limit_cents)) b.limit_price = centsToStr(ch.limit_cents);
        if (Number.isSafeInteger(ch.stop_cents)) b.stop_price = centsToStr(ch.stop_cents);
        if (Number.isSafeInteger(ch.trail_cents)) b.trail = centsToStr(ch.trail_cents); else if (ch.trail_percent) b.trail = String(ch.trail_percent);
        if (ch.time_in_force) b.time_in_force = ch.time_in_force;
        if (ch.client_order_id) b.client_order_id = ch.client_order_id;
        if (!Object.keys(b).length) throw new BrokerError("invalid", "not sent: nothing to change");
        await ensureOwner();
        // A change can raise what the order could cost: the changed order is held to the same cap.
        const cur = await getOrder(id); if (!cur) throw new BrokerError("rejected", "not sent: that order was not found");
        await withinCap({ symbol: cur.symbol, side: cur.side, type: cur.type, qty: ch.qty !== undefined ? Number(ch.qty) : cur.qty, notional_cents: ch.qty === undefined && cur.qty === null ? cur.notional_cents : undefined, limit_cents: Number.isSafeInteger(ch.limit_cents) ? ch.limit_cents : cur.limit_cents, stop_cents: Number.isSafeInteger(ch.stop_cents) ? ch.stop_cents : cur.stop_cents });
        log("replace", { order_id: id, fields: Object.keys(b) });
        const r = await call("PATCH", P(`/orders/${encodeURIComponent(id)}`), b, "replace");
        return normalize(r.json, lastClock ? lastClock.is_open : undefined);
      }
      // Cancel: 204 means the request was accepted, not that the order is canceled; the caller reads the order back.
      async function cancel(id) { await ensureOwner(); log("cancel", { order_id: id }); const r = await call("DELETE", P(`/orders/${encodeURIComponent(id)}`), null, "cancel"); return { accepted: r.status === 204 || r.status === 200, status: r.status }; }
      // The broker adapter interface every provider implements (73-broker-accounts.js): getAccount, getPositions, placeOrder,
      // cancelOrder, getOrderStatus, plus the reads the trade flow prices and checks with.
      return { provider: "alpaca", getAccount: account, getPositions: positions, placeOrder: submit, cancelOrder: cancel, getOrderStatus: getOrder,
        submit, getOrder, byClientOrderId, replace, cancel, account, positions, position, quote, asset, assets, marketClock, logs, label, source, live: true, paper: false, mock, order_cap_cents: cap, account_id: c.account_id, auth_failed: () => authFailed };
    }

    // The trade flow's connector interface (read / write / verify) over the adapter. write never retries; a thrown write
    // propagates to the loop, which marks it unknown and reconciles through verify by client_order_id.
    function connectors(adapter, opts) {
      const o = opts || {}, now = o.clock || (() => Date.now()), graceMs = o.not_found_grace_ms || 60000;
      const attempts = new Map(); // client_order_id -> first attempt time, so a 404 right after a lost response stays unknown
      const refused = new Map();  // client_order_id -> the broker's reason for a definite 4xx refusal (nothing was placed)
      let attemptedAt = () => undefined; // bound by the flow to its loop log, so a stateless restart still knows when it wrote
      const name = o.account_name || "your Alpaca account";
      async function read(kind, p) {
        const q = p || {};
        if (kind === "brokerage_accounts") { const a = await adapter.account(); return { value: [{ id: adapter.account_id, name, paper: false, live: true, order_cap_cents: adapter.order_cap_cents, mock: adapter.mock, fractional: true, cash_cents: a.value.buying_power_cents, fee_cents: 0, tradable: a.value.status === null || a.value.status === "ACTIVE" }], source: a.source, as_of: a.as_of }; }
        if (kind === "quote") return adapter.quote(q.symbol, q.side || "buy");
        if (kind === "market_clock") { const k = await adapter.marketClock(); return { value: k, source: k.source, as_of: k.as_of }; }
        if (kind === "position") return adapter.position(q.symbol);
        if (kind === "holdings") return adapter.positions();
        if (kind === "asset") { const a = await adapter.asset(q.symbol); return a ? { value: a, source: adapter.source, as_of: now() } : null; }
        if (kind === "assets") return adapter.assets();
        if (kind === "order") { const r = await adapter.getOrder(q.order_id); return r ? { value: r, source: adapter.source, as_of: now() } : null; }
        if (kind === "order_by_client_id") { const r = await adapter.byClientOrderId(q.client_order_id); return r ? { value: r, source: adapter.source, as_of: now() } : null; }
        throw new Error(`NOT_WIRED: ${kind} is not an Alpaca read`);
      }
      async function write(capabilityId, params, key) {
        const p = params || {};
        if (p.action === "cancel") { const r = await adapter.cancel(p.order_id); return { reference: p.order_id, cancel_requested: r.accepted }; }
        if (p.action === "replace") { const r = await adapter.replace(p.order_id, p.changes || {}); return { reference: r.order_id, replaced: p.order_id, order: r }; }
        const coid = AlpacaTrading.clientOrderId(key);
        if (!attempts.has(coid)) attempts.set(coid, now());
        const order = { symbol: p.symbol, side: p.side, type: p.type || "market", time_in_force: p.time_in_force || "day", client_order_id: coid };
        if (p.notional_cents) order.notional_cents = p.notional_cents; else order.qty = p.quantity;
        for (const k of ["limit_cents", "stop_cents", "trail_cents", "trail_percent"]) if (p[k] !== undefined && p[k] !== null) order[k] = p[k];
        try { const r = await adapter.submit(order, key); return { reference: r.order.order_id, client_order_id: coid, order: r.order }; }
        catch (e) { if (e && ["rejected", "invalid", "auth", "rate_limited", "isolation", "cap"].includes(e.kind)) { refused.set(coid, e.message); return { reference: null, rejected: true, reason: e.message, client_order_id: coid }; } throw e; }
      }
      // verify: the order exists at the broker (by id, or found again by client_order_id). Exists is "confirmed" for the loop;
      // filled or not is read back by the flow. Not found within the grace window is still unknown, never "not placed".
      async function verify(capabilityId, key, ref) {
        const coid = AlpacaTrading.clientOrderId(key);
        if (refused.has(coid)) return { confirmed: false, reason: refused.get(coid), source: adapter.source, refused: true };
        const r = ref && ref.reference ? await adapter.getOrder(ref.reference) : typeof ref === "string" ? await adapter.getOrder(ref) : await adapter.byClientOrderId(coid);
        if (r && r.state === "rejected") return { confirmed: false, reason: r.reason || "rejected by the broker", source: adapter.source, reference: r.order_id };
        if (r) return { confirmed: true, reference: r.order_id, source: adapter.source, order: r };
        const first = attempts.has(coid) ? attempts.get(coid) : attemptedAt(key);
        if (first === undefined || first === null || now() - first < graceMs) throw new Error(`not found yet at ${adapter.source}; still unknown`);
        return { confirmed: false, reason: `no order with client id ${coid} exists at ${adapter.source}, so nothing was placed`, source: adapter.source, not_found: true };
      }
      return { read, write, verify, bindLog(fn) { if (typeof fn === "function") attemptedAt = fn; }, auth_failed: () => adapter.auth_failed(), live: true, paper: false, mock: adapter.mock, label: adapter.label };
    }
    return { create, connectors, validate, body, normalize, estimate, clientOrderId, centsToStr, strToCents, qtyStr, LIVE, HOSTS, DEFAULT_CAP_CENTS, TYPES, LABEL, BrokerError };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AlpacaTrading;
