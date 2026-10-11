// A MOCK of the Alpaca Broker API paper sandbox, for Rail 2 tests only. It is not Alpaca and nothing it says is evidence
// about Alpaca: it encodes this repository's reading of the Broker API reference (alpacahq/alpaca-docs,
// content/api-references/broker-api/trading/orders.md, positions.md, clock.md, accounts/accounts.md and
// market-data-api/stock-pricing-data/historical.md). Responses use Alpaca's shapes (decimal strings, order statuses,
// by_client_order_id returning an array, DELETE 204 / 422, PATCH returning a new order). Faults are injected on purpose:
// a create whose response is lost after the order exists, a 500 before it exists, partial fills, rejections.
const http = require("node:http");
const crypto = require("node:crypto");

function start(opts) {
  const o = opts || {};
  const st = {
    key: o.key || "PKMOCKKEY", secret: o.secret || "mock-secret-value", account: o.account || "acct-paper-1",
    now: o.now || (() => Date.now()), is_open: o.is_open !== undefined ? o.is_open : true, next_open: o.next_open || "2026-10-13T09:30:00-04:00",
    buying_power_cents: o.buying_power_cents !== undefined ? o.buying_power_cents : 1000000,
    positions: Object.assign({}, o.positions || {}), // SYMBOL -> qty (number)
    quotes: {}, assets: Object.assign({ VOO: { name: "Vanguard S&P 500 ETF", fractionable: true, tradable: true }, VT: { name: "Vanguard Total World Stock ETF", fractionable: true, tradable: true }, NVDA: { name: "NVIDIA Corporation Common Stock", fractionable: true, tradable: true }, TSLA: { name: "Tesla, Inc. Common Stock", fractionable: true, tradable: true }, AAPL: { name: "Apple Inc. Common Stock", fractionable: true, tradable: true } }, o.assets || {}),
    orders: [], requests: [], faults: { drop_next_create_response: false, fail_next_create: null, partial_next: null, reject_next: null, cancel_pending: false },
  };
  for (const [sym, q] of Object.entries(o.quotes || { VOO: [51200, 51210], VT: [11800, 11810], NVDA: [10600, 10610], TSLA: [25000, 25010], AAPL: [22000, 22010] })) st.quotes[sym] = { bid: q[0], ask: q[1], t: st.now() - 30000 };
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
    if (x.side === "buy") { st.buying_power_cents -= cost; st.positions[x.symbol] = Math.round(((st.positions[x.symbol] || 0) + fill) * 1e9) / 1e9; }
    else { st.buying_power_cents += cost; st.positions[x.symbol] = Math.round(((st.positions[x.symbol] || 0) - fill) * 1e9) / 1e9; if (st.positions[x.symbol] <= 0) delete st.positions[x.symbol]; }
  }
  const reserved = (sym, exceptId) => st.orders.filter(x => x.side === "sell" && x.symbol === sym && x.id !== exceptId && ["new", "accepted", "partially_filled", "pending_new"].includes(x.status)).reduce((s, x) => s + (x.qty - (x.filled_qty || 0)), 0);
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
    if (b.client_order_id && st.orders.some(x => x.client_order_id === b.client_order_id)) return "client_order_id must be unique";
    return null;
  }
  function send(res, status, obj) { res.writeHead(status, { "content-type": "application/json" }); res.end(obj === undefined ? "" : JSON.stringify(obj)); }
  const server = http.createServer((req, res) => {
    let raw = ""; req.on("data", d => { raw += d; }); req.on("end", () => {
      const url = new URL(req.url, "http://x"), path = url.pathname;
      const body = raw ? (() => { try { return JSON.parse(raw); } catch (_) { return null; } })() : null;
      st.requests.push({ method: req.method, path, query: url.search, body, authorization: req.headers.authorization || null });
      const want = "Basic " + Buffer.from(`${st.key}:${st.secret}`).toString("base64");
      if (req.headers.authorization !== want) return send(res, 401, { code: 40110000, message: "request is not authorized" });
      for (const x of st.orders) fillOne(x);
      if (req.method === "GET" && path === "/v1/clock") return send(res, 200, { timestamp: iso(), is_open: st.is_open, next_open: st.next_open, next_close: "2026-10-12T16:00:00-04:00" });
      let m;
      if (req.method === "GET" && (m = /^\/v1\/assets\/([^/]+)$/.exec(path))) { const a = st.assets[decodeURIComponent(m[1])]; return a ? send(res, 200, { id: "asset-" + m[1], class: "us_equity", exchange: "ARCA", symbol: decodeURIComponent(m[1]), name: a.name, status: "active", tradable: a.tradable, marginable: true, shortable: false, easy_to_borrow: false, fractionable: a.fractionable }) : send(res, 404, { message: "asset not found" }); }
      if (req.method === "GET" && (m = /^\/v2\/stocks\/([^/]+)\/(quotes|trades)\/latest$/.exec(path))) { const sym = decodeURIComponent(m[1]), q = st.quotes[sym]; if (!q) return send(res, 404, { message: "not found" }); return m[2] === "quotes" ? send(res, 200, { symbol: sym, quote: { t: new Date(q.t).toISOString(), ax: "V", ap: q.ask / 100, as: 1, bx: "V", bp: q.bid / 100, bs: 1, c: ["R"], z: "B" } }) : send(res, 200, { symbol: sym, trade: { t: new Date(q.t).toISOString(), x: "V", p: q.ask / 100, s: 10, c: ["@"], i: 1, z: "B" } }); }
      const A = `/v1/trading/accounts/${st.account}`;
      if (!path.startsWith(A)) return send(res, 404, { message: "account not found" });
      const sub = path.slice(A.length);
      if (req.method === "GET" && sub === "/account") return send(res, 200, { id: st.account, account_number: "PA0000000", status: "ACTIVE", currency: "USD", buying_power: str(st.buying_power_cents) + "7311", cash: str(st.buying_power_cents), portfolio_value: str(st.buying_power_cents) });
      if (req.method === "GET" && sub === "/positions") return send(res, 200, Object.entries(st.positions).map(([s, q]) => pos(s, q)));
      if (req.method === "GET" && (m = /^\/positions\/([^/]+)$/.exec(sub))) { const s = decodeURIComponent(m[1]); return st.positions[s] ? send(res, 200, pos(s, st.positions[s])) : send(res, 404, { code: 40410000, message: "position does not exist" }); }
      if (req.method === "POST" && sub === "/orders") {
        if (st.faults.fail_next_create) { const f = st.faults.fail_next_create; st.faults.fail_next_create = null; return send(res, f, { message: "internal error" }); }
        if (st.faults.reject_next) { const f = st.faults.reject_next; st.faults.reject_next = null; return send(res, f.status, { code: 0, message: f.message }); }
        const err = validate(body || {}); if (err) return send(res, 422, { code: 42210000, message: err });
        const q = st.quotes[body.symbol], qty = body.qty !== undefined ? Number(body.qty) : null, notional = body.notional !== undefined ? cents(body.notional) : null;
        if (body.side === "buy") { const px = body.type === "limit" || body.type === "stop_limit" ? cents(body.limit_price) : body.type === "stop" ? Math.max(cents(body.stop_price), q.ask) : q.ask; const est = notional || Math.round(qty * px); if (est > st.buying_power_cents) return send(res, 403, { code: 40310000, message: "insufficient buying power" }); }
        else { const have = (st.positions[body.symbol] || 0) - reserved(body.symbol); if ((qty || Math.round(notional / q.bid * 1e9) / 1e9) > have + 1e-9) return send(res, 403, { code: 40310000, message: `insufficient qty available for order (requested: ${body.qty || body.notional}, available: ${qtyStr(Math.max(0, have))})` }); }
        const x = { id: crypto.randomUUID(), client_order_id: body.client_order_id || crypto.randomUUID(), created_at: iso(), updated_at: iso(), symbol: body.symbol, side: body.side, type: body.type, time_in_force: body.time_in_force, qty, notional_cents: notional, limit_cents: body.limit_price ? cents(body.limit_price) : null, stop_cents: body.stop_price ? cents(body.stop_price) : null, trail_cents: body.trail_price ? cents(body.trail_price) : null, trail_percent: body.trail_percent ? Number(body.trail_percent) : null, status: st.is_open ? "new" : "accepted", filled_qty: 0 };
        st.orders.push(x); fillOne(x);
        if (st.faults.drop_next_create_response) { st.faults.drop_next_create_response = false; req.socket.destroy(); return; }
        return send(res, 200, orderObj(x));
      }
      if (req.method === "GET" && sub === "/orders:by_client_order_id") { const x = st.orders.find(y => y.client_order_id === url.searchParams.get("client_order_id")); return x ? send(res, 200, [orderObj(x)]) : send(res, 404, { code: 40410000, message: "order not found" }); }
      if ((m = /^\/orders\/([^/]+)$/.exec(sub))) {
        const x = st.orders.find(y => y.id === m[1]); if (!x) return send(res, 404, { code: 40410000, message: "order not found" });
        if (req.method === "GET") return send(res, 200, orderObj(x));
        if (req.method === "DELETE") { if (!["new", "accepted", "partially_filled", "pending_new"].includes(x.status)) return send(res, 422, { code: 42210000, message: `order is ${x.status} and cannot be canceled` }); x.status = st.faults.cancel_pending ? "pending_cancel" : "canceled"; x.canceled_at = x.status === "canceled" ? iso() : null; x.updated_at = iso(); return send(res, 204); }
        if (req.method === "PATCH") {
          if (!["new", "accepted"].includes(x.status)) return send(res, 422, { code: 42210000, message: `order is ${x.status} and cannot be replaced` });
          if (body.qty !== undefined && !Number.isInteger(Number(body.qty))) return send(res, 422, { code: 42210000, message: "qty must be whole shares to replace" });
          const y = Object.assign({}, x, { id: crypto.randomUUID(), client_order_id: body.client_order_id || crypto.randomUUID(), created_at: iso(), updated_at: iso(), replaces: x.id, replaced_by: null, status: st.is_open ? "new" : "accepted", filled_qty: 0, filled_avg_cents: null });
          if (body.qty !== undefined) y.qty = Number(body.qty); if (body.limit_price) y.limit_cents = cents(body.limit_price); if (body.stop_price) y.stop_cents = cents(body.stop_price); if (body.time_in_force) y.time_in_force = body.time_in_force;
          if (body.trail) { if (y.trail_percent) y.trail_percent = Number(body.trail); else y.trail_cents = cents(body.trail); }
          x.status = "replaced"; x.replaced_by = y.id; x.replaced_at = iso(); st.orders.push(y); fillOne(y);
          return send(res, 200, orderObj(y));
        }
      }
      return send(res, 404, { message: "not found" });
    });
  });
  function pos(s, q) { const px = st.quotes[s] ? st.quotes[s].bid : 0; return { asset_id: "asset-" + s, symbol: s, exchange: "ARCA", asset_class: "us_equity", avg_entry_price: str(px), qty: qtyStr(q), qty_available: qtyStr(Math.max(0, q - reserved(s))), side: "long", market_value: str(Math.round(q * px)), cost_basis: str(Math.round(q * px)), current_price: str(px) }; }
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({
      base, state: st, close: () => new Promise(r => server.close(r)),
      open() { st.is_open = true; for (const x of st.orders) fillOne(x); }, shut() { st.is_open = false; },
      move(sym, bid, ask) { st.quotes[sym] = { bid, ask, t: st.now() }; for (const x of st.orders) { x.hold = false; fillOne(x); } },
      age(sym, ms) { st.quotes[sym].t -= ms; },
      fault(name, value) { st.faults[name] = value === undefined ? true : value; },
      writes: () => st.requests.filter(r => r.method !== "GET"),
    });
  }));
}
module.exports = { start };
