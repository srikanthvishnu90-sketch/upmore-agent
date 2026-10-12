// A MOCK of the Alpaca Broker API paper sandbox, for Rail 2 tests only. It is not Alpaca and nothing it says is evidence
// about Alpaca: it encodes this repository's reading of the Broker API reference (alpacahq/alpaca-docs,
// content/api-references/broker-api/trading/orders.md, positions.md, clock.md, accounts/accounts.md and
// market-data-api/stock-pricing-data/historical.md). Responses use Alpaca's shapes (decimal strings, order statuses,
// by_client_order_id returning an array, DELETE 204 / 422, PATCH returning a new order). Faults are injected on purpose:
// a create whose response is lost after the order exists, a 500 before it exists, partial fills, rejections. Several
// accounts can sit behind one server (Broker API sub-accounts by id; Trading API accounts by OAuth Bearer token), so the
// cross-user isolation tests can see which account every request landed in.
const http = require("node:http");
const crypto = require("node:crypto");

function start(opts) {
  const o = opts || {};
  const st = {
    key: o.key || "PKMOCKKEY", secret: o.secret || "mock-secret-value", account: o.account || "acct-paper-1",
    now: o.now || (() => Date.now()), is_open: o.is_open !== undefined ? o.is_open : true, next_open: o.next_open || "2026-10-13T09:30:00-04:00",
    buying_power_cents: o.buying_power_cents !== undefined ? o.buying_power_cents : 1000000,
    // The account's status and its restriction flags (trading_blocked, account_blocked, trade_suspended_by_user), as the
    // Trading API's account object carries them; any flag true and the mock refuses orders the way the broker does.
    status: o.status || "ACTIVE", flags: Object.assign({}, o.flags || {}),
    positions: Object.assign({}, o.positions || {}), // SYMBOL -> qty (number)
    quotes: {}, assets: Object.assign({ VOO: { name: "Vanguard S&P 500 ETF", fractionable: true, tradable: true }, VT: { name: "Vanguard Total World Stock ETF", fractionable: true, tradable: true }, NVDA: { name: "NVIDIA Corporation Common Stock", fractionable: true, tradable: true }, TSLA: { name: "Tesla, Inc. Common Stock", fractionable: true, tradable: true }, AAPL: { name: "Apple Inc. Common Stock", fractionable: true, tradable: true } }, o.assets || {}),
    // Non-trade activities (Trading API GET /v2/account/activities/{type}; fields per alpaca-py NonTradeActivity): id,
    // activity_type, date, net_amount (string), description, status, symbol, qty, per_share_amount. refuse_types answer 422.
    activities: (o.activities || []).slice(), refuse_types: (o.refuse_types || []).slice(),
    orders: [], requests: [], tokens: Object.assign({}, o.tokens || {}), faults: { drop_next_create_response: false, fail_next_create: null, partial_next: null, reject_next: null, cancel_pending: false },
  };
  for (const [sym, q] of Object.entries(o.quotes || { VOO: [51200, 51210], VT: [11800, 11810], NVDA: [10600, 10610], TSLA: [25000, 25010], AAPL: [22000, 22010] })) st.quotes[sym] = { bid: q[0], ask: q[1], t: st.now() - 30000 };
  // Several paper accounts behind one server. The firm's Basic key reaches every account under /v1/trading/accounts/{id}
  // (Broker API); an OAuth Bearer token reaches exactly one account under /v2 (Trading API). The default account keeps
  // its fields on st so single-account tests read st.orders and st.positions as before.
  const accts = { [st.account]: st };
  for (const [id, a] of Object.entries(o.accounts || {})) accts[id] = { account: id, activities: (a.activities || []).slice(), buying_power_cents: a.buying_power_cents !== undefined ? a.buying_power_cents : 1000000, positions: Object.assign({}, a.positions || {}), orders: [] };
  let ac = st;
  const fillAll = () => { for (const a of Object.values(accts)) { ac = a; for (const x of a.orders) fillOne(x); } ac = st; };
  const str = c => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
  const iso = () => new Date(st.now()).toISOString();
  const qtyStr = q => String(Math.round(q * 1e9) / 1e9);
  const cents = s => Math.round(Number(s) * 100);
  function orderObj(x) {
    return { id: x.id, client_order_id: x.client_order_id, created_at: x.created_at, updated_at: x.updated_at, submitted_at: x.created_at, filled_at: x.filled_at || null, expired_at: null, canceled_at: x.canceled_at || null, failed_at: null, replaced_at: x.replaced_at || null, replaced_by: x.replaced_by || null, replaces: x.replaces || null,
      asset_id: "asset-" + x.symbol, symbol: x.symbol, asset_class: "us_equity", notional: x.notional_cents ? str(x.notional_cents) : null, qty: x.qty !== null ? qtyStr(x.qty) : null, filled_qty: qtyStr(x.filled_qty || 0), filled_avg_price: x.filled_avg_cents ? str(x.filled_avg_cents) : null,
      order_class: "simple", order_type: x.type, type: x.type, side: x.side, time_in_force: x.time_in_force, limit_price: x.limit_cents ? str(x.limit_cents) : null, stop_price: x.stop_cents ? str(x.stop_cents) : null, status: x.status, extended_hours: false, legs: null,
      trail_percent: x.trail_percent || null, trail_price: x.trail_cents ? str(x.trail_cents) : null, hwm: x.hwm ? str(x.hwm) : null, commission: "0" };
  }
  // Fill what is marketable now. Market fills at the ask (buy) or bid (sell); a limit fills when marketable; a stop
  // triggers when the price crosses it; a trailing stop triggers off its high-water mark. Closed market fills nothing.
  function fillOne(x) {
    if (x.hold) return; // a partial fill stays partial until the test moves the market
    if (!st.is_open || !["new", "accepted", "partially_filled"].includes(x.status)) return;
    const q = st.quotes[x.symbol]; const px = x.side === "buy" ? q.ask : q.bid;
    let go = false;
    if (x.type === "market") go = true;
    else if (x.type === "limit") go = x.side === "buy" ? px <= x.limit_cents : px >= x.limit_cents;
    else if (x.type === "stop") go = x.side === "buy" ? px >= x.stop_cents : px <= x.stop_cents;
    else if (x.type === "trailing_stop") { x.hwm = x.side === "sell" ? Math.max(x.hwm || px, px) : Math.min(x.hwm || px, px); const trig = x.trail_cents ? (x.side === "sell" ? x.hwm - x.trail_cents : x.hwm + x.trail_cents) : Math.round(x.side === "sell" ? x.hwm * (1 - x.trail_percent / 100) : x.hwm * (1 + x.trail_percent / 100)); go = x.side === "sell" ? px <= trig : px >= trig; }
    if (!go) { if (x.status === "accepted") x.status = "new"; return; }
    const price = x.type === "limit" ? (x.side === "buy" ? Math.min(px, x.limit_cents) : Math.max(px, x.limit_cents)) : px;
    const want = x.qty !== null ? x.qty : Math.round(x.notional_cents / price * 1e9) / 1e9;
    let fill = want - (x.filled_qty || 0);
    if (st.faults.partial_next) { fill = Math.round(want * st.faults.partial_next * 1e4) / 1e4; st.faults.partial_next = null; x.status = "partially_filled"; x.hold = true; }
    else x.status = "filled";
    const prevQ = x.filled_qty || 0, prevC = (x.filled_avg_cents || 0) * prevQ;
    x.filled_qty = Math.round((prevQ + fill) * 1e9) / 1e9; x.filled_avg_cents = Math.round((prevC + fill * price) / x.filled_qty);
    if (x.status === "filled") x.filled_at = iso();
    x.updated_at = iso();
    const cost = Math.round(fill * price);
    if (x.side === "buy") { ac.buying_power_cents -= cost; ac.positions[x.symbol] = Math.round(((ac.positions[x.symbol] || 0) + fill) * 1e9) / 1e9; }
    else { ac.buying_power_cents += cost; ac.positions[x.symbol] = Math.round(((ac.positions[x.symbol] || 0) - fill) * 1e9) / 1e9; if (ac.positions[x.symbol] <= 0) delete ac.positions[x.symbol]; }
  }
  const reserved = (sym, exceptId) => ac.orders.filter(x => x.side === "sell" && x.symbol === sym && x.id !== exceptId && ["new", "accepted", "partially_filled", "pending_new"].includes(x.status)).reduce((s, x) => s + (x.qty - (x.filled_qty || 0)), 0);
  function validate(b) {
    const hasQ = b.qty !== undefined && b.qty !== null, hasN = b.notional !== undefined && b.notional !== null, tif = b.time_in_force;
    for (const k of ["qty", "notional", "limit_price", "stop_price", "trail_price", "trail_percent"]) if (b[k] !== undefined && b[k] !== null && typeof b[k] !== "string") return `${k} must be a string`;
    if (!b.symbol || !st.assets[b.symbol]) return "asset not found";
    if (!st.assets[b.symbol].tradable) return "asset is not tradable";
    if (!["buy", "sell"].includes(b.side)) return "invalid side";
    if (!["market", "limit", "stop", "stop_limit", "trailing_stop"].includes(b.type)) return "invalid order type";
    if (!["day", "gtc", "opg", "cls", "ioc", "fok"].includes(tif)) return "invalid time_in_force";
    if (hasQ === hasN) return "qty or notional is required, not both";
    if (hasN && (b.type !== "market" || tif !== "day")) return "notional orders must be market day orders";
    const frac = hasN || !Number.isInteger(Number(b.qty));
    if (frac && (!["market", "limit", "stop", "stop_limit"].includes(b.type) || tif !== "day")) return "fractional orders must be day orders of type market, limit, stop or stop_limit";
    if (frac && !st.assets[b.symbol].fractionable) return "asset is not fractionable";
    if ((b.type === "limit" || b.type === "stop_limit") && !b.limit_price) return "limit_price is required";
    if ((b.type === "stop" || b.type === "stop_limit") && !b.stop_price) return "stop_price is required";
    if (b.type === "trailing_stop" && !b.trail_price && !b.trail_percent) return "trail_price or trail_percent is required";
    if (b.client_order_id && String(b.client_order_id).length > 48) return "client_order_id must be no more than 48 characters";
    if (b.client_order_id && ac.orders.some(x => x.client_order_id === b.client_order_id)) return "client_order_id must be unique";
    return null;
  }
  function send(res, status, obj) { res.writeHead(status, { "content-type": "application/json" }); res.end(obj === undefined ? "" : JSON.stringify(obj)); }
  const server = http.createServer((req, res) => {
    let raw = ""; req.on("data", d => { raw += d; }); req.on("end", () => {
      const url = new URL(req.url, "http://x"), path = url.pathname;
      const body = raw ? (() => { try { return JSON.parse(raw); } catch (_) { return null; } })() : null;
      st.requests.push({ method: req.method, path, query: url.search, body, authorization: req.headers.authorization || null });
      const want = "Basic " + Buffer.from(`${st.key}:${st.secret}`).toString("base64"), given = req.headers.authorization || "";
      const bearer = given.startsWith("Bearer ") ? given.slice(7) : null, tokenAccount = bearer !== null && Object.prototype.hasOwnProperty.call(st.tokens, bearer) ? st.tokens[bearer] : null;
      if (given !== want && !tokenAccount) return send(res, 401, { code: 40110000, message: "request is not authorized" });
      fillAll();
      if (req.method === "GET" && (path === "/v1/clock" || path === "/v2/clock")) return send(res, 200, { timestamp: iso(), is_open: st.is_open, next_open: st.next_open, next_close: "2026-10-12T16:00:00-04:00" });
      let m;
      // The asset list (Trading API GET /v2/assets?status=active&asset_class=us_equity): every mock asset, inactive ones
      // only when status is not asked for, as Alpaca's reference describes the filter.
      if (req.method === "GET" && path === "/v2/assets") { const want = url.searchParams.get("status"); return send(res, 200, Object.entries(st.assets).filter(([, a]) => !want || (a.status || "active") === want).map(([s, a]) => ({ id: "asset-" + s, class: "us_equity", exchange: "NASDAQ", symbol: s, name: a.name, status: a.status || "active", tradable: a.tradable, marginable: true, shortable: false, easy_to_borrow: false, fractionable: a.fractionable }))); }
      if (req.method === "GET" && (m = /^\/v[12]\/assets\/([^/]+)$/.exec(path))) { const a = st.assets[decodeURIComponent(m[1])]; return a ? send(res, 200, { id: "asset-" + m[1], class: "us_equity", exchange: "ARCA", symbol: decodeURIComponent(m[1]), name: a.name, status: "active", tradable: a.tradable, marginable: true, shortable: false, easy_to_borrow: false, fractionable: a.fractionable }) : send(res, 404, { message: "asset not found" }); }
      if (req.method === "GET" && (m = /^\/v2\/stocks\/([^/]+)\/(quotes|trades)\/latest$/.exec(path))) { const sym = decodeURIComponent(m[1]), q = st.quotes[sym]; if (!q) return send(res, 404, { message: "not found" }); return m[2] === "quotes" ? send(res, 200, { symbol: sym, quote: { t: new Date(q.t).toISOString(), ax: "V", ap: q.ask / 100, as: 1, bx: "V", bp: q.bid / 100, bs: 1, c: ["R"], z: "B" } }) : send(res, 200, { symbol: sym, trade: { t: new Date(q.t).toISOString(), x: "V", p: q.ask / 100, s: 10, c: ["@"], i: 1, z: "B" } }); }
      let sub, trading = false;
      if ((m = /^\/v1\/trading\/accounts\/([^/]+)(\/.*)$/.exec(path))) {
        if (given !== want) return send(res, 401, { code: 40110000, message: "request is not authorized" }); // OAuth tokens never reach the Broker API
        const id = decodeURIComponent(m[1]); if (!accts[id]) return send(res, 404, { message: "account not found" });
        ac = accts[id]; sub = m[2];
      } else if (/^\/v2\/(account|positions|orders)/.test(path)) {
        if (!tokenAccount || !accts[tokenAccount]) return send(res, 401, { code: 40110000, message: "request is not authorized" }); // the Trading API's account is the token's
        ac = accts[tokenAccount]; sub = path.slice(3); trading = true;
      } else return send(res, 404, { message: "not found" });
      st.requests[st.requests.length - 1].account = ac.account;
      if (req.method === "GET" && (m = /^\/account\/activities\/([A-Z]+)$/.exec(sub))) {
        const type = m[1]; if ((ac.refuse_types || st.refuse_types).includes(type)) return send(res, 422, { code: 42210000, message: `invalid activity type ${type}` });
        const after = url.searchParams.get("after"), size = Math.min(Number(url.searchParams.get("page_size") || 100), 100), token = url.searchParams.get("page_token");
        let list = (ac.activities || []).filter(a => a.activity_type === type && (!after || a.date > after)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
        if (token) { const i = list.findIndex(a => a.id === token); list = i >= 0 ? list.slice(i + 1) : []; }
        return send(res, 200, list.slice(0, size));
      }
      if (req.method === "GET" && sub === "/account") return send(res, 200, { id: ac.account, account_number: "PA0000000", status: ac.status || "ACTIVE", trading_blocked: false, account_blocked: false, trade_suspended_by_user: false, ...(ac.flags || {}), currency: "USD", buying_power: str(ac.buying_power_cents) + "7311", cash: str(ac.buying_power_cents), portfolio_value: str(ac.buying_power_cents) });
      if (req.method === "GET" && sub === "/positions") return send(res, 200, Object.entries(ac.positions).map(([s, q]) => pos(s, q)));
      if (req.method === "GET" && (m = /^\/positions\/([^/]+)$/.exec(sub))) { const s = decodeURIComponent(m[1]); return ac.positions[s] ? send(res, 200, pos(s, ac.positions[s])) : send(res, 404, { code: 40410000, message: "position does not exist" }); }
      if (req.method === "POST" && sub === "/orders") {
        if (st.faults.fail_next_create) { const f = st.faults.fail_next_create; st.faults.fail_next_create = null; return send(res, f, { message: "internal error" }); }
        if (st.faults.reject_next) { const f = st.faults.reject_next; st.faults.reject_next = null; return send(res, f.status, { code: 0, message: f.message }); }
        if (ac.flags && (ac.flags.trading_blocked || ac.flags.account_blocked || ac.flags.trade_suspended_by_user)) return send(res, 403, { code: 40310000, message: "account is not allowed to trade" });
        const err = validate(body || {}); if (err) return send(res, 422, { code: 42210000, message: err });
        const q = st.quotes[body.symbol], qty = body.qty !== undefined ? Number(body.qty) : null, notional = body.notional !== undefined ? cents(body.notional) : null;
        if (body.side === "buy") { const px = body.type === "limit" || body.type === "stop_limit" ? cents(body.limit_price) : body.type === "stop" ? Math.max(cents(body.stop_price), q.ask) : q.ask; const est = notional || Math.round(qty * px); if (est > ac.buying_power_cents) return send(res, 403, { code: 40310000, message: "insufficient buying power" }); }
        else { const have = (ac.positions[body.symbol] || 0) - reserved(body.symbol); if ((qty || Math.round(notional / q.bid * 1e9) / 1e9) > have + 1e-9) return send(res, 403, { code: 40310000, message: `insufficient qty available for order (requested: ${body.qty || body.notional}, available: ${qtyStr(Math.max(0, have))})` }); }
        const x = { id: crypto.randomUUID(), client_order_id: body.client_order_id || crypto.randomUUID(), created_at: iso(), updated_at: iso(), symbol: body.symbol, side: body.side, type: body.type, time_in_force: body.time_in_force, qty, notional_cents: notional, limit_cents: body.limit_price ? cents(body.limit_price) : null, stop_cents: body.stop_price ? cents(body.stop_price) : null, trail_cents: body.trail_price ? cents(body.trail_price) : null, trail_percent: body.trail_percent ? Number(body.trail_percent) : null, status: st.is_open ? "new" : "accepted", filled_qty: 0 };
        ac.orders.push(x); fillOne(x);
        if (st.faults.drop_next_create_response) { st.faults.drop_next_create_response = false; req.socket.destroy(); return; }
        return send(res, 200, orderObj(x));
      }
      if (req.method === "GET" && sub === "/orders:by_client_order_id") { const x = ac.orders.find(y => y.client_order_id === url.searchParams.get("client_order_id")); return x ? send(res, 200, trading ? orderObj(x) : [orderObj(x)]) : send(res, 404, { code: 40410000, message: "order not found" }); }
      if ((m = /^\/orders\/([^/]+)$/.exec(sub))) {
        const x = ac.orders.find(y => y.id === m[1]); if (!x) return send(res, 404, { code: 40410000, message: "order not found" });
        if (req.method === "GET") return send(res, 200, orderObj(x));
        if (req.method === "DELETE") { if (!["new", "accepted", "partially_filled", "pending_new"].includes(x.status)) return send(res, 422, { code: 42210000, message: `order is ${x.status} and cannot be canceled` }); x.status = st.faults.cancel_pending ? "pending_cancel" : "canceled"; x.canceled_at = x.status === "canceled" ? iso() : null; x.updated_at = iso(); return send(res, 204); }
        if (req.method === "PATCH") {
          if (!["new", "accepted"].includes(x.status)) return send(res, 422, { code: 42210000, message: `order is ${x.status} and cannot be replaced` });
          if (body.qty !== undefined && !Number.isInteger(Number(body.qty))) return send(res, 422, { code: 42210000, message: "qty must be whole shares to replace" });
          const y = Object.assign({}, x, { id: crypto.randomUUID(), client_order_id: body.client_order_id || crypto.randomUUID(), created_at: iso(), updated_at: iso(), replaces: x.id, replaced_by: null, status: st.is_open ? "new" : "accepted", filled_qty: 0, filled_avg_cents: null });
          if (body.qty !== undefined) y.qty = Number(body.qty); if (body.limit_price) y.limit_cents = cents(body.limit_price); if (body.stop_price) y.stop_cents = cents(body.stop_price); if (body.time_in_force) y.time_in_force = body.time_in_force;
          if (body.trail) { if (y.trail_percent) y.trail_percent = Number(body.trail); else y.trail_cents = cents(body.trail); }
          x.status = "replaced"; x.replaced_by = y.id; x.replaced_at = iso(); ac.orders.push(y); fillOne(y);
          return send(res, 200, orderObj(y));
        }
      }
      return send(res, 404, { message: "not found" });
    });
  });
  // Today's change is carried only for a symbol given a prior close (lastday: SYMBOL -> cents), as Alpaca derives it.
  function pos(s, q) { const px = st.quotes[s] ? st.quotes[s].bid : 0, ld = (o.lastday || {})[s]; const today = Number.isSafeInteger(ld) && ld > 0 ? { lastday_price: str(ld), unrealized_intraday_pl: (q * (px - ld) < 0 ? "-" : "") + str(Math.abs(Math.round(q * (px - ld)))), unrealized_intraday_plpc: String(Math.round(((px - ld) / ld) * 1e6) / 1e6), change_today: String(Math.round(((px - ld) / ld) * 1e6) / 1e6) } : {}; return { ...today, asset_id: "asset-" + s, symbol: s, exchange: "ARCA", asset_class: "us_equity", avg_entry_price: str(px), qty: qtyStr(q), qty_available: qtyStr(Math.max(0, q - reserved(s))), side: "long", market_value: str(Math.round(q * px)), cost_basis: str(Math.round(q * px)), current_price: str(px) }; }
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({
      base, state: st, accounts: accts, close: () => new Promise(r => server.close(r)),
      open() { st.is_open = true; fillAll(); }, shut() { st.is_open = false; },
      move(sym, bid, ask) { st.quotes[sym] = { bid, ask, t: st.now() }; for (const a of Object.values(accts)) for (const x of a.orders) x.hold = false; fillAll(); },
      age(sym, ms) { st.quotes[sym].t -= ms; },
      fault(name, value) { st.faults[name] = value === undefined ? true : value; },
      writes: () => st.requests.filter(r => r.method !== "GET"),
    });
  }));
}
module.exports = { start };
