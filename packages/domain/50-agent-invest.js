  /* Investing without recommending (Instinct spec doc 09). Pure arithmetic
     over the user's own holdings: consolidation across accounts, allocation,
     concentration, index overlap, drift from the target the user set with the
     rebalance math ready but never the instruction, screens that run only the
     user's criteria, tax-loss harvest candidates as math, wash-sale checks,
     cost basis and realized gains, contribution room against limits the
     caller supplies (never a hardcoded number), and the order restatement
     the loop confirms before any rail fires. Every analytics result carries
     the source and as-of time of the data it came from. Nothing here is
     advice: no function returns a buy, sell or hold. */
  const AgentInvest = (() => {
    const divRound = (n, d) => { const q = Math.trunc(n / d), r = n - q * d; return Math.abs(r) * 2 >= Math.abs(d) ? q + Math.sign(n) * Math.sign(d) : q; };
    const money = c => { const s = Math.abs(c); return (c < 0 ? "-$" : "$") + Math.floor(s / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + String(s % 100).padStart(2, "0"); };
    const int = (v, what) => { if (!Number.isSafeInteger(v)) throw new Error(`${what} must be an integer number of cents`); return v; };
    const DAY = 86400000;
    const days = (a, b) => Math.round((Date.parse(String(b).slice(0, 10) + "T00:00:00Z") - Date.parse(String(a).slice(0, 10) + "T00:00:00Z")) / DAY);
    // One decimal from whole basis points, half up in integers: 1035 bps is "10.4" ((10.35).toFixed(1) is "10.3" in binary).
    const pct1 = bps => { const t = divRound(Math.abs(bps), 10); return Math.floor(t / 10) + "." + (t % 10); };
    // Long term is held more than one year, by the calendar (IRS Pub. 544): sold after the anniversary, which a 366-day
    // count across Feb 29 does not find. A Feb 29 purchase's anniversary is Feb 28.
    const longTerm = (acquired, sold) => { const a = String(acquired || "").slice(0, 10), s = String(sold || "").slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; return s > (Number(a.slice(0, 4)) + 1) + (a.slice(4) === "-02-29" ? "-02-28" : a.slice(4)); };
    const and = xs => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];
    const grounded = (result, accounts) => Object.assign(result, { sources: [...new Set(accounts.map(a => a.source))].sort(), as_of: accounts.map(a => a.as_of).sort().reverse()[0] || null, stale: accounts.some(a => a.stale === true) });

    // Holdings across every account, by symbol, with value and share in basis points. Accounts: [{id, source, as_of, holdings:[{symbol, quantity, price_cents, asset_class, sector, geography, cost_cents, lots}]}]
    function consolidate(accounts) {
      const bySymbol = new Map(), noCost = new Set(); let total = 0;
      for (const a of accounts || []) for (const h of a.holdings || []) {
        const value = int(h.value_cents !== undefined ? h.value_cents : divRound(Math.round(h.quantity * 10000) * h.price_cents, 10000), `${h.symbol} value`);
        total += value;
        const e = bySymbol.get(h.symbol) || { symbol: h.symbol, value_cents: 0, quantity: 0, accounts: [], asset_class: h.asset_class || "unknown", sector: h.sector || "unknown", geography: h.geography || "unknown", cost_cents: 0 };
        if (!(Number.isSafeInteger(h.cost_cents) && h.cost_cents > 0)) noCost.add(h.symbol); // one lot without cost basis makes the gain unknown
        e.value_cents += value; e.quantity += h.quantity || 0; e.accounts.push(a.id); e.cost_cents += h.cost_cents || 0; bySymbol.set(h.symbol, e);
      }
      const holdings = [...bySymbol.values()].map(h => Object.assign(h, { share_bps: total ? divRound(h.value_cents * 10000, total) : 0, unrealized_cents: h.cost_cents && !noCost.has(h.symbol) ? h.value_cents - h.cost_cents : null })).sort((a, b) => b.value_cents - a.value_cents || a.symbol.localeCompare(b.symbol));
      return grounded({ total_cents: total, holdings, accounts: (accounts || []).map(a => a.id) }, accounts || []);
    }
    const allocation = (accounts, by) => { const c = consolidate(accounts), out = {}; for (const h of c.holdings) { const k = h[by || "asset_class"]; out[k] = (out[k] || 0) + h.value_cents; } return grounded({ by: by || "asset_class", total_cents: c.total_cents, buckets: Object.entries(out).map(([k, v]) => ({ bucket: k, value_cents: v, share_bps: c.total_cents ? divRound(v * 10000, c.total_cents) : 0 })).sort((a, b) => b.value_cents - a.value_cents) }, accounts || []); };
    // Concentration: factual, threshold-based, decision-free. "NVDA is 22 percent of your invested assets."
    function concentration(accounts, threshold_bps) {
      const c = consolidate(accounts), t = Number.isSafeInteger(threshold_bps) ? threshold_bps : 1000, list = accounts || [];
      // Every money statement cites its source and as-of: a total is only as current as its oldest read.
      const cited = list.length && list.every(a => a.source && a.as_of) ? `, per ${and([...new Set(list.map(a => a.source))].sort())}, as of ${list.map(a => a.as_of).sort()[0]}` : ", source or as-of time not on file";
      return grounded({ threshold_bps: t, flagged: c.holdings.filter(h => h.share_bps >= t).map(h => ({ symbol: h.symbol, share_bps: h.share_bps, value_cents: h.value_cents, statement: `${h.symbol} is ${pct1(h.share_bps)} percent of your invested assets (${money(h.value_cents)} of ${money(c.total_cents)})${cited}.` })) }, list);
    }
    // Overlap with an index or between funds, by look-through weights the caller supplies: {VTI: {AAPL: 650, MSFT: 600, ...}} in basis points.
    function overlap(constituentsA, constituentsB) {
      let shared = 0; const common = [];
      for (const [sym, w] of Object.entries(constituentsA || {})) if (constituentsB && constituentsB[sym] !== undefined) { const m = Math.min(w, constituentsB[sym]); shared += m; common.push({ symbol: sym, overlap_bps: m }); }
      return { overlap_bps: shared, common: common.sort((a, b) => b.overlap_bps - a.overlap_bps) };
    }
    // Drift from the target the user set, stated as distance, with the trade list computed and never instructed.
    function drift(accounts, target, by) {
      const alloc = allocation(accounts, by || "asset_class"); const t = target || {};
      const sum = Object.values(t).reduce((a, b) => a + b, 0); if (sum !== 10000) throw new Error("target shares must sum to 10000 basis points");
      const rows = Object.keys(t).map(bucket => { const cur = alloc.buckets.find(b => b.bucket === bucket), share = cur ? cur.share_bps : 0, value = cur ? cur.value_cents : 0, want = divRound(alloc.total_cents * t[bucket], 10000); return { bucket, target_bps: t[bucket], current_bps: share, drift_bps: share - t[bucket], current_cents: value, target_cents: want, trade_cents: want - value }; });
      for (const b of alloc.buckets) if (t[b.bucket] === undefined) rows.push({ bucket: b.bucket, target_bps: 0, current_bps: b.share_bps, drift_bps: b.share_bps, current_cents: b.value_cents, target_cents: 0, trade_cents: -b.value_cents });
      const maxDrift = Math.max(0, ...rows.map(r => Math.abs(r.drift_bps)));
      return grounded({ by: by || "asset_class", total_cents: alloc.total_cents, rows: rows.sort((a, b) => Math.abs(b.drift_bps) - Math.abs(a.drift_bps)), max_drift_bps: maxDrift, trade_list: rows.filter(r => r.trade_cents !== 0).map(r => ({ bucket: r.bucket, side: r.trade_cents > 0 ? "buy" : "sell", amount_cents: Math.abs(r.trade_cents) })), note: "Distance from the target you set. The trade list is the math to get back to it; running it is your decision and a confirmed action." }, accounts || []);
    }
    // Screens: the user's criteria are the decision; the agent is the search engine. No criteria, no screen.
    const OPS = { lt: (a, b) => a < b, lte: (a, b) => a <= b, gt: (a, b) => a > b, gte: (a, b) => a >= b, eq: (a, b) => a === b, in: (a, b) => Array.isArray(b) && b.includes(a) };
    function screen(universe, criteria, meta) {
      const rules = Array.isArray(criteria) ? criteria : []; if (!rules.length) throw new Error("A screen runs only on criteria the user defined.");
      for (const r of rules) if (!r || !r.field || !OPS[r.op] || r.value === undefined) throw new Error("Each criterion needs field, op and value.");
      const matches = (universe || []).filter(row => rules.every(r => row[r.field] !== undefined && row[r.field] !== null && OPS[r.op](row[r.field], r.value)));
      const stated = rules.map(r => `${r.field} ${({ lt: "<", lte: "<=", gt: ">", gte: ">=", eq: "=", in: "in" })[r.op]} ${Array.isArray(r.value) ? r.value.join("/") : r.value}`).join(", ");
      return { criteria: rules, criteria_text: stated, matches: matches.map(m => m.symbol), count: matches.length, universe_size: (universe || []).length, statement: `${matches.length} of ${(universe || []).length} match your criteria (${stated})${meta && meta.as_of ? `, data as of ${meta.as_of}` : ""}${meta && meta.source ? ` per ${meta.source}` : ""}.`, source: meta && meta.source || null, as_of: meta && meta.as_of || null };
    }
    // Tax-loss harvest candidates as math: lots with unrealized losses, the offset they would provide, and the wash-sale windows that would disallow them.
    function harvest(lots, prices, today, recentBuys) {
      const out = [];
      for (const lot of lots || []) {
        const price = prices && prices[lot.symbol]; if (price === undefined) continue;
        const value = divRound(Math.round(lot.quantity * 10000) * price, 10000), loss = value - int(lot.cost_cents, "lot cost");
        if (loss >= 0) continue;
        const wash = washSale(lot.symbol, today, recentBuys || [], lots || [], lot.id);
        out.push({ lot_id: lot.id, symbol: lot.symbol, account: lot.account || null, quantity: lot.quantity, cost_cents: lot.cost_cents, value_cents: value, unrealized_loss_cents: -loss, term: longTerm(lot.acquired, today) ? "long" : "short", wash_sale: wash });
      }
      const total = out.filter(o => !o.wash_sale.disallowed).reduce((s, o) => s + o.unrealized_loss_cents, 0);
      return { today, candidates: out.sort((a, b) => b.unrealized_loss_cents - a.unrealized_loss_cents), harvestable_loss_cents: total, statement: out.length ? `You hold ${money(out.reduce((s, o) => s + o.unrealized_loss_cents, 0))} in unrealized losses across ${out.length} lot${out.length === 1 ? "" : "s"}; ${money(total)} is outside any wash-sale window and would offset gains if realized. You decide and direct.` : "No lots with unrealized losses." };
    }
    // Wash sale: a purchase of the same (or substantially identical, as the caller labels it) security within 30 days before or after the sale date disallows the loss.
    function washSale(symbol, saleDate, recentBuys, lots, excludeLotId) {
      const window = (recentBuys || []).concat((lots || []).filter(l => l.id !== excludeLotId && l.acquired).map(l => ({ symbol: l.symbol, date: l.acquired, quantity: l.quantity, identical_to: l.identical_to })))
        .filter(b => (b.symbol === symbol || b.identical_to === symbol) && Math.abs(days(b.date, saleDate)) <= 30);
      return { disallowed: window.length > 0, triggers: window.map(b => ({ symbol: b.symbol, date: String(b.date).slice(0, 10), quantity: b.quantity, days_from_sale: days(saleDate, b.date) })), rule: "a buy of the same or substantially identical security within 30 days before or after the sale" };
    }
    // Cost basis and realized gains by lot for a year, split short and long term. sales: [{symbol, date, quantity, proceeds_cents, lot_id}]
    function realized(lots, sales, year) {
      const byLot = new Map((lots || []).map(l => [l.id, l])); const rows = [];
      for (const s of sales || []) { if (String(s.date).slice(0, 4) !== String(year)) continue; const lot = byLot.get(s.lot_id); if (!lot) continue; const basis = divRound(int(lot.cost_cents, "lot cost") * Math.round(s.quantity * 10000), Math.round(lot.quantity * 10000)); const gain = int(s.proceeds_cents, "proceeds") - basis; rows.push({ symbol: s.symbol, date: s.date, quantity: s.quantity, proceeds_cents: s.proceeds_cents, basis_cents: basis, gain_cents: gain, term: longTerm(lot.acquired, s.date) ? "long" : "short" }); }
      const sum = term => rows.filter(r => r.term === term).reduce((a, r) => a + r.gain_cents, 0);
      return { year, rows, short_term_cents: sum("short"), long_term_cents: sum("long"), total_cents: sum("short") + sum("long") };
    }
    // Contribution room against limits the caller supplies for the year (never a number this code remembers).
    function contributionRoom(contributions, limits) {
      const out = {};
      for (const [acct, limit] of Object.entries(limits || {})) { const made = (contributions || {})[acct] || 0, room = Math.max(0, limit - made), over = Math.max(0, made - limit);
        out[acct] = { limit_cents: limit, contributed_cents: made, room_cents: room, excess_cents: over, statement: `${acct}: ${money(room)} of room left this year (${money(made)} of ${money(limit)} contributed).${over ? ` That is ${money(over)} over the limit.` : ""}` }; }
      return out;
    }
    // Order restatement for the confirmation step (doc 01 T3): ticker, side, shares, estimated cost, account, order type. The loop confirms before any rail fires.
    function restateOrder(order, quote) {
      const o = order || {}; if (!o.symbol || !o.side || !(o.quantity > 0) || !o.account) throw new Error("An order needs symbol, side, quantity and account.");
      const side = String(o.side).trim().toLowerCase();
      if (side !== "buy" && side !== "sell") throw new Error("An order's side must be buy or sell."); // "BUY" was restated as a sell
      if (o.limit_cents && o.type === "market") throw new Error("A market order has no limit price.");
      const Side = side === "buy" ? "Buy" : "Sell", type = o.type || (o.limit_cents ? "limit" : "market");
      // An estimate is a money statement: only from a quote that names its source and as-of.
      const est = quote && Number.isSafeInteger(quote.price_cents) && quote.source && quote.as_of ? divRound(Math.round(o.quantity * 10000) * quote.price_cents, 10000) : null;
      return { action: Side, symbol: o.symbol, quantity: o.quantity, type, account: o.account, estimated_cents: est, limit_cents: o.limit_cents || null,
        confirm: { action: `${Side} ${o.quantity} ${o.symbol} (${type}${o.limit_cents ? " at " + money(o.limit_cents) : ""})`, amount: est !== null ? `about ${money(est)}` : "price at execution", recipient: null, from: o.account, fee: o.fee_cents ? money(o.fee_cents) : null, when: "at the next market open or now if the market is open" },
        statement: `${Side} ${o.quantity} ${o.symbol} ${type}${o.limit_cents ? " at " + money(o.limit_cents) : ""} in ${o.account}${est !== null ? `, about ${money(est)} at ${money(quote.price_cents)} (${quote.source}, as of ${quote.as_of})` : ""}. Confirm?` };
    }
    // INV-001: the portfolio read across brokerages: each account with its source and as-of, positions consolidated with the per-account breakdown, stale sources named.
    function portfolio(accounts, now) {
      const DAY = 86400000, rows = (accounts || []).map(a => ({ id: a.id, source: a.source || "manual", as_of: a.as_of || null, stale: !!(now && a.as_of && now - Date.parse(a.as_of) > DAY), value_cents: (a.holdings || []).reduce((s, h) => s + int(h.value_cents !== undefined ? h.value_cents : divRound(Math.round(h.quantity * 10000) * h.price_cents, 10000), `${h.symbol} value`), 0), positions: (a.holdings || []).length }));
      const c = consolidate(accounts);
      return { accounts: rows, total_cents: rows.reduce((s, r) => s + r.value_cents, 0), positions: c.holdings.map(pos => Object.assign({}, pos, { by_account: (accounts || []).filter(a => (a.holdings || []).some(h => h.symbol === pos.symbol)).map(a => ({ account_id: a.id, source: a.source || "manual", quantity: (a.holdings || []).filter(h => h.symbol === pos.symbol).reduce((s, h) => s + h.quantity, 0) })) })), stale: rows.filter(r => r.stale).map(r => r.id), text: `${money(rows.reduce((s, r) => s + r.value_cents, 0))} across ${rows.length} account${rows.length === 1 ? "" : "s"} (${rows.map(r => `${r.id} ${money(r.value_cents)} per ${r.source}${r.as_of ? ` as of ${String(r.as_of).slice(0, 16).replace("T", " ")}` : ", as-of time unknown"}`).join("; ")}).${rows.some(r => r.stale) ? ` ${rows.filter(r => r.stale).map(r => r.id).join(", ")} is older than a day.` : ""}`, source: [...new Set(rows.map(r => r.source))].join(", "), as_of: rows.map(r => r.as_of).filter(Boolean).sort().pop() || null };
    }
    // INV-009: price alerts the user set, evaluated against quotes with their own as-of; a stale quote never fires.
    function priceAlerts(alerts, quotes, now) {
      const out = [], DAY = 86400000;
      for (const a of alerts || []) { if (a.status === "paused") continue; const q = (quotes || []).find(x => x.symbol === a.symbol); if (!q) { out.push({ alert_id: a.id, symbol: a.symbol, fired: false, reason: "no quote" }); continue; }
        if (!q.as_of || !isFinite(Date.parse(q.as_of))) { out.push({ alert_id: a.id, symbol: a.symbol, fired: false, reason: "quote has no as-of time" }); continue; } const stale = now && q.as_of && now - Date.parse(q.as_of) > DAY; if (stale) { out.push({ alert_id: a.id, symbol: a.symbol, fired: false, reason: `quote is stale (${q.as_of})` }); continue; }
        let fired = false, text = null; const pct = q.prev_close_cents ? divRound((q.price_cents - q.prev_close_cents) * 10000, q.prev_close_cents) : null;
        if (a.kind === "above" && q.price_cents >= a.price_cents) { fired = true; text = `${a.symbol} is ${money(q.price_cents)}, above your ${money(a.price_cents)} line (${q.source || "quote"}, ${q.as_of}).`; }
        if (a.kind === "below" && q.price_cents <= a.price_cents) { fired = true; text = `${a.symbol} is ${money(q.price_cents)}, below your ${money(a.price_cents)} line (${q.source || "quote"}, ${q.as_of}).`; }
        if (a.kind === "pct_move" && pct != null && Math.abs(pct) >= a.bps) { fired = true; text = `${a.symbol} moved ${pct >= 0 ? "up" : "down"} ${pct1(pct)} percent today to ${money(q.price_cents)} (${q.source || "quote"}, ${q.as_of}).`; }
        out.push({ alert_id: a.id, symbol: a.symbol, fired, text, price_cents: q.price_cents, as_of: q.as_of, reason: fired ? null : "condition not met" }); }
      return { fired: out.filter(o => o.fired), checked: out };
    }
    // INV-019: rollover status. The stages, the 60-day clock on an indirect rollover, and what is still owed by whom.
    const ROLLOVER_STAGES = ["requested", "old_plan_processing", "funds_sent", "received", "invested"];
    function rolloverStatus(r, today) {
      const DAY = 86400000, idx = ROLLOVER_STAGES.indexOf(r.stage), indirect = r.method === "indirect", clock = indirect && r.funds_sent_on ? 60 - Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(r.funds_sent_on + "T00:00:00Z")) / DAY) : null;
      const window60 = clock == null ? " within 60 days" : clock > 1 ? ` within ${clock} days` : clock === 1 ? " within 1 day" : clock === 0 ? " today, the last day of the 60-day window" : null;
      const next = idx < 0 ? "tell me the stage" : idx === 0 ? `${r.from || "the old plan"} has to process the request; call them if nothing in 10 business days` : idx === 1 ? "the old plan sends the funds; a direct transfer goes plan to plan, an indirect one mails you a check" : idx === 2 ? (indirect ? (window60 === null ? `the deadline to deposit the full amount into ${r.to || "the new account"} was ${-clock} day${clock === -1 ? "" : "s"} ago` : `deposit the full amount into ${r.to || "the new account"}${window60}; if 20 percent was withheld, you must make it up from other money or that part becomes a taxable distribution`) : `${r.to || "the new account"} should show it within 5 business days`) : idx === 3 ? "the cash is in; it is not invested until you choose, so it sits uninvested" : "done";
      return { stage: r.stage, stage_index: idx, method: r.method || "direct", days_left_on_60_day_clock: clock, overdue: clock != null && clock < 0, next, text: `${r.from || "Old plan"} to ${r.to || "new account"} (${r.method || "direct"}): ${String(r.stage || "stage unknown").replace(/_/g, " ")}. Next: ${next}.${clock != null && clock < 0 ? " The 60-day window has passed; talk to a tax professional about a waiver." : ""}`, source: "what you and the plans told me", as_of: today };
    }
    return { consolidate, allocation, concentration, overlap, drift, screen, harvest, washSale, realized, contributionRoom, restateOrder, portfolio, priceAlerts, rolloverStatus, ROLLOVER_STAGES, money };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = AgentInvest;
