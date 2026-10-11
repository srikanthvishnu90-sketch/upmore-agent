  /* Investing without recommending (Instinct spec doc 09). Pure math over
     the user's own holdings: consolidation, allocation, concentration, drift
     against the target the user set, dividends, user-defined screens, tax-loss
     harvest candidates, wash-sale checks, and an order flow that restates the
     user's decision and confirms before any rail fires. Every number carries
     its source and as-of time. Nothing here chooses a security for the user;
     every user-facing sentence still passes through AdviceGuard. */
  const AgentInvesting = (() => {
    const DAY = 86400000;
    const days = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);
    const money = c => "$" + Math.floor(Math.abs(c) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(Math.abs(c) % 100).padStart(2, "0");
    const pct = bps => (bps / 100).toFixed(1) + "%";
    const need = (h, keys) => { for (const k of keys) if (h[k] === undefined || h[k] === null) throw new Error(`holding needs ${k}`); };

    // Holdings: [{account_id, source, as_of, symbol, quantity, price_cents, asset_class, sector?, geography?, cost_basis_cents?, lots?: [{id, quantity, cost_cents, acquired_on}]}]
    function consolidate(holdings) {
      if (!Array.isArray(holdings)) throw new Error("holdings must be an array");
      const bySymbol = new Map(), sources = new Set(), asOf = [];
      let total = 0;
      for (const h of holdings) {
        need(h, ["account_id", "source", "as_of", "symbol", "quantity", "price_cents", "asset_class"]);
        const value = Math.round(h.quantity * h.price_cents);
        total += value; sources.add(h.source); asOf.push(h.as_of);
        const e = bySymbol.get(h.symbol) || { symbol: h.symbol, asset_class: h.asset_class, sector: h.sector || null, geography: h.geography || null, quantity: 0, value_cents: 0, accounts: [], cost_basis_cents: 0 };
        e.quantity += h.quantity; e.value_cents += value; e.accounts.push(h.account_id); e.cost_basis_cents += h.cost_basis_cents || 0;
        bySymbol.set(h.symbol, e);
      }
      const positions = [...bySymbol.values()].sort((a, b) => b.value_cents - a.value_cents || a.symbol.localeCompare(b.symbol))
        .map(p => Object.assign(p, { weight_bps: total ? Math.round(p.value_cents * 10000 / total) : 0 }));
      const by = field => { const m = {}; for (const p of positions) { const k = p[field] || "unknown"; m[k] = (m[k] || 0) + p.value_cents; } return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { value_cents: v, weight_bps: total ? Math.round(v * 10000 / total) : 0 }])); };
      return { total_value_cents: total, positions, by_asset_class: by("asset_class"), by_sector: by("sector"), by_geography: by("geography"),
        sources: [...sources].sort(), as_of: asOf.length ? asOf.slice().sort().slice(-1)[0] : null, oldest_as_of: asOf.length ? asOf.slice().sort()[0] : null };
    }

    // Concentration: factual, threshold-based, decision-free. "NVDA is 22% of your invested assets" is the flagship allowed nudge.
    function concentration(consolidated, thresholdBps) {
      const t = thresholdBps || 2000;
      return consolidated.positions.filter(p => p.weight_bps >= t).map(p => ({ symbol: p.symbol, weight_bps: p.weight_bps, value_cents: p.value_cents,
        statement: `${p.symbol} is ${pct(p.weight_bps)} of your invested assets (${money(p.value_cents)}), per ${consolidated.sources.join(" and ")} as of ${consolidated.as_of}.` }));
    }

    // Drift: distance from the target the user set themselves, with the rebalance math ready and no instruction to use it.
    function drift(consolidated, target) {
      if (!target || typeof target !== "object") throw new Error("drift needs the user's own target allocation");
      const sum = Object.values(target).reduce((n, v) => n + v, 0);
      if (sum !== 10000) throw new Error("target allocation must sum to 10000 bps");
      const total = consolidated.total_value_cents, out = [];
      for (const [cls, targetBps] of Object.entries(target)) {
        const cur = consolidated.by_asset_class[cls] ? consolidated.by_asset_class[cls].weight_bps : 0;
        const deltaBps = cur - targetBps, deltaCents = Math.round(total * deltaBps / 10000);
        out.push({ asset_class: cls, target_bps: targetBps, current_bps: cur, drift_bps: deltaBps, to_target_cents: -deltaCents });
      }
      const maxDrift = Math.max(...out.map(o => Math.abs(o.drift_bps)));
      const trades = out.filter(o => o.to_target_cents !== 0).map(o => ({ asset_class: o.asset_class, direction: o.to_target_cents > 0 ? "buy" : "sell", amount_cents: Math.abs(o.to_target_cents) }));
      return { rows: out, max_drift_bps: maxDrift, computed_trade_list: trades,
        statement: `Current ${out.map(o => `${o.asset_class} ${pct(o.current_bps)}`).join(", ")} versus your target ${out.map(o => `${o.asset_class} ${pct(o.target_bps)}`).join(", ")}; largest drift ${pct(maxDrift)}, per ${consolidated.sources.join(" and ")} as of ${consolidated.as_of}. The trade list to return to your target is ready; it executes only if you approve it.` };
    }

    // Dividends: trailing total and forward estimate from declared rates, labeled as an estimate.
    function dividends(consolidated, rates, paidEvents) {
      const paid = (paidEvents || []).reduce((n, e) => n + e.amount_cents, 0);
      const forward = consolidated.positions.reduce((n, p) => n + Math.round(p.quantity * ((rates || {})[p.symbol] || 0)), 0);
      return { paid_trailing_cents: paid, forward_estimate_cents: forward, estimate: true, count: (paidEvents || []).length };
    }

    // Screener: the criteria are the user's; the agent is the search engine and reports matches as data.
    function screen(universe, criteria) {
      if (!criteria || !Object.keys(criteria).length) throw new Error("a screen needs user-defined criteria");
      const ops = { lt: (a, b) => a < b, lte: (a, b) => a <= b, gt: (a, b) => a > b, gte: (a, b) => a >= b, eq: (a, b) => a === b, in: (a, b) => Array.isArray(b) && b.includes(a) };
      const matches = universe.filter(row => Object.entries(criteria).every(([field, cond]) => {
        const v = row[field]; if (v === undefined || v === null) return false;
        return Object.entries(cond).every(([op, target]) => ops[op] ? ops[op](v, target) : false);
      }));
      const text = Object.entries(criteria).map(([f, c]) => Object.entries(c).map(([op, t]) => `${f} ${({ lt: "under", lte: "at most", gt: "over", gte: "at least", eq: "equals", in: "in" })[op]} ${Array.isArray(t) ? t.join("/") : t}`).join(" and ")).join(", ");
      return { criteria_text: text, matches: matches.map(m => m.symbol).sort(), count: matches.length, statement: `${matches.length} matches for your criteria (${text}).` };
    }

    // Tax-loss harvest candidates: unrealized losses by lot, with the wash-sale window stated; the user decides and directs.
    function harvestCandidates(holdings, prices, today, recentBuys) {
      const out = [];
      for (const h of holdings) for (const lot of h.lots || []) {
        const price = prices[h.symbol]; if (!Number.isSafeInteger(price)) continue;
        const value = Math.round(lot.quantity * price), loss = lot.cost_cents - value;
        if (loss <= 0) continue;
        const wash = washSale(h.symbol, today, recentBuys || []);
        out.push({ symbol: h.symbol, lot_id: lot.id, quantity: lot.quantity, cost_cents: lot.cost_cents, value_cents: value, unrealized_loss_cents: loss,
          long_term: days(lot.acquired_on, today) > 365, wash_sale_risk: wash.at_risk, wash_sale_reason: wash.reason });
      }
      const total = out.reduce((n, c) => n + c.unrealized_loss_cents, 0);
      return { candidates: out.sort((a, b) => b.unrealized_loss_cents - a.unrealized_loss_cents), total_unrealized_loss_cents: total,
        statement: total ? `You hold ${money(total)} in unrealized losses across ${out.length} lot${out.length === 1 ? "" : "s"}; harvesting them offsets that much in gains. Selling a lot and buying the same security within 30 days before or after triggers a wash sale.` : "No lots with unrealized losses." };
    }
    function washSale(symbol, sellDate, recentBuys) {
      const hits = (recentBuys || []).filter(b => b.symbol === symbol && Math.abs(days(b.date, sellDate)) <= 30);
      return { at_risk: hits.length > 0, reason: hits.length ? `a purchase of ${symbol} on ${hits[0].date} is within 30 days of ${sellDate}` : null, window_days: 30 };
    }

    // Order flow: restate the user's exact decision; a fake rail fires only after confirmation. The real broker rail is GATED.
    function orderRestatement(order, quote, account) {
      need(order, ["side", "symbol", "quantity", "type"]);
      if (!["buy", "sell"].includes(order.side) || !["market", "limit"].includes(order.type)) throw new Error("order needs side buy/sell and type market/limit");
      if (order.type === "limit" && !Number.isSafeInteger(order.limit_cents)) throw new Error("a limit order needs limit_cents");
      const px = order.type === "limit" ? order.limit_cents : quote.price_cents;
      const est = Math.round(order.quantity * px);
      return { side: order.side, symbol: order.symbol, quantity: order.quantity, type: order.type, limit_cents: order.limit_cents || null, estimated_cents: est, account: account.name,
        text: `Order to confirm: ${order.side} ${order.quantity} shares of ${order.symbol}, ${order.type} order${order.type === "limit" ? ` at ${money(order.limit_cents)}` : ""}, ${account.name}, estimated ${order.side === "buy" ? "cost" : "proceeds"} ${money(est)}${order.type === "market" ? ` at ${money(quote.price_cents)}` : ""} (per ${quote.source} quote, as of ${quote.as_of}). Reply confirm to place it.` };
    }
    function executeOrder(order, rail, approved, idempotencyKey) {
      if (!approved) return { placed: false, reason: "not_confirmed", message: "Not placed. Nothing was changed." };
      if (!rail || rail.mode !== "fake") return { placed: false, reason: "rail_gated", message: "Securities execution needs a broker-dealer partner and the compliance setup; the rail is not connected. Nothing was placed." };
      const r = rail.place(order, idempotencyKey);
      if (!r || !r.fill) return { placed: true, verified: false, reference: r && r.reference || null, message: `Order ${r && r.reference || ""} placed; fill not yet confirmed by the rail.` };
      return { placed: true, verified: true, reference: r.reference, fill: r.fill, message: `Filled: ${r.fill.quantity} ${order.symbol} at ${money(r.fill.price_cents)}, ${money(Math.round(r.fill.quantity * r.fill.price_cents))} total, per ${rail.name} confirmation ${r.reference}.` };
    }
    // Contribution room: mechanics, not security advice; one of the highest-value allowed alerts.
    function contributionRoom(limits, contributed) {
      const out = {};
      for (const [acct, limit] of Object.entries(limits || {})) { const used = (contributed || {})[acct] || 0; out[acct] = { limit_cents: limit, contributed_cents: used, room_cents: Math.max(0, limit - used) }; }
      return out;
    }
    return { consolidate, concentration, drift, dividends, screen, harvestCandidates, washSale, orderRestatement, executeOrder, contributionRoom };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentInvesting;
