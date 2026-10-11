  /* Brokerage connectors (owner, 2026-10-11: "meet users where they already invest"). One contract for every investing
     platform, one adapter per route, chosen from the connector matrix (packages/connectors/platforms.json, the researched
     100 rows; docs/connector-matrix/README.md is generated from it). Routes, in the owner's order of preference:
       native_api        the platform's own third-party API (Alpaca today)
       snaptrade         SnapTrade's connection portal: the person picks their brokerage and logs in on its own site;
                         trading only where SnapTrade and the brokerage both support it
       plaid             Plaid Investments: holdings and history, read-only
       browser_assisted  guided manual connect, last resort, read-only, never places an order
       none              nothing works (defunct, not offered, or not available in the US): said plainly
     The contract: connect(ctx) -> { url } | refusal; verify(ctx) -> { ok, checks }; positions(ctx); placeOrder(ctx, order).
     Honesty is enforced here, not left to callers: a track-only route can never place an order, an order needs the
     person's fresh approval and stays under the per-order cap, and a route whose adapter or keys are not in place answers
     NOT_WIRED instead of pretending to connect. Adding platform 101 is a row in platforms.json and, for a new route, an
     adapter passed in by the host: no rewrite. Pure: adapters, keys and clocks are injected. */
  const BrokerageConnectors = (() => {
    const ROUTES = Object.freeze({
      native_api: { name: "direct connection", trade_possible: true },
      snaptrade: { name: "SnapTrade", trade_possible: true },
      plaid: { name: "Plaid", trade_possible: false },
      browser_assisted: { name: "guided manual connect", trade_possible: false },
      none: { name: "no connection", trade_possible: false },
    });
    const DEFAULT_CAP_CENTS = 500; // the owner's per-order cap while Upmore is in testing (raised only by the owner)
    const refusal = (code, text, extra) => Object.assign({ ok: false, code, text }, extra || {});

    // What a connection can do, in the words the person sees on every card and reply.
    function capability(row) {
      if (!row || row.route === "none" || !ROUTES[row.route]) return { trade: false, read: false, label: "Can't connect" };
      const trade = !!row.trade && ROUTES[row.route].trade_possible, read = !!row.read;
      return { trade, read, label: trade ? "Trade + track" : read ? "Track only" : "Can't connect" };
    }

    // Validate the matrix: every row complete, routes real, no trading promised where the route can't trade, shared
    // accounts pointing at a row that exists.
    function validate(rows) {
      const errors = [], ids = new Set();
      for (const r of rows || []) {
        const tag = `#${r && r.n} ${r && r.platform}`;
        if (!r || !Number.isInteger(r.n) || !r.platform || !r.id) { errors.push(`${tag}: n, id and platform are required`); continue; }
        if (ids.has(r.id)) errors.push(`${tag}: duplicate id ${r.id}`); ids.add(r.id);
        if (!ROUTES[r.route]) errors.push(`${tag}: unknown route ${r.route}`);
        if (r.trade && ROUTES[r.route] && !ROUTES[r.route].trade_possible) errors.push(`${tag}: trade promised on a ${r.route} route, which can only read`);
        if (!["live", "built", "not_built"].includes(r.adapter_state)) errors.push(`${tag}: adapter_state must be live, built or not_built`);
        if (!["verified_live", "researched", "unverified"].includes(r.verification)) errors.push(`${tag}: verification must be verified_live, researched or unverified`);
        if (r.verification === "verified_live" && r.adapter_state !== "live") errors.push(`${tag}: verified live needs a live adapter`);
        if (r.verification !== "unverified" && !(Array.isArray(r.sources) && r.sources.length)) errors.push(`${tag}: a researched row cites its sources`);
      }
      for (const r of rows || []) if (r && r.same_account_as && !(rows || []).some(x => x.id === r.same_account_as)) errors.push(`#${r.n} ${r.platform}: same_account_as ${r.same_account_as} is not a row`);
      return errors;
    }

    // "I invest on Robinhood": the row for a platform named in the person's words (aliases on word boundaries).
    function find(rows, words) {
      const t = ` ${String(words || "").toLowerCase().replace(/[^a-z0-9.*&+ -]/g, " ")} `;
      let best = null;
      for (const r of rows || []) for (const a of [r.platform].concat(r.aliases || [])) {
        const k = String(a).toLowerCase();
        if (k && t.includes(` ${k} `) && (!best || k.length > best.k.length)) best = { r, k };
      }
      if (!best) return null;
      const r = best.r;
      // A shared account (Robinhood Crypto, ForecastEx) is one connection: the parent row connects it.
      return r.same_account_as ? Object.assign({}, (rows || []).find(x => x.id === r.same_account_as) || r, { via: r.platform }) : r;
    }

    // The adapter for a row, wrapped so the rules hold whatever the adapter does.
    function adapterFor(row, deps) {
      const d = deps || {}, cap = capability(row);
      if (!row || row.route === "none") return closed(row ? `${row.platform} can't be connected${row.notes ? `: ${row.notes}` : "."}` : "That platform isn't in the connector matrix yet.");
      const impl = d.adapters && d.adapters[row.route];
      const notWired = what => refusal("not_wired", `NOT_WIRED: ${row.platform} through ${ROUTES[row.route].name} is not switched on yet (${what}). Nothing was connected.`);
      const call = async (verb, ctx, arg) => {
        if (!impl || typeof impl[verb] !== "function") return notWired(impl ? `the ${verb} step is not built` : "no adapter or keys");
        try { return await impl[verb](Object.assign({ row }, ctx || {}), arg); }
        catch (e) { return refusal("failed", `${row.platform}: ${String(e && e.message || e).slice(0, 160)}`); }
      };
      return {
        row, capability: cap,
        connect: ctx => call("connect", ctx),
        verify: ctx => call("verify", ctx),
        positions: ctx => cap.read ? call("positions", ctx) : Promise.resolve(refusal("not_readable", `${row.platform} can't be read through Upmore.`)),
        async placeOrder(ctx, order) {
          if (!cap.trade) return refusal("read_only", `${row.platform} is track-only in Upmore, so I can't place orders there. Nothing was placed.`);
          const o = order || {}, limit = Number.isSafeInteger(d.order_cap_cents) && d.order_cap_cents > 0 ? d.order_cap_cents : DEFAULT_CAP_CENTS;
          if (!o.approval || o.approval.approved !== true || !o.approval.id) return refusal("needs_approval", "Every order needs your yes on its own card first. Nothing was placed.");
          if (!Number.isSafeInteger(o.estimated_cents) || o.estimated_cents <= 0) return refusal("amount_unknown", "I couldn't price that order, so nothing was placed.");
          if (o.estimated_cents > limit) return refusal("order_cap", `Live orders are limited to $${(limit / 100).toFixed(2)} each while Upmore is in testing, so nothing was placed.`);
          return call("placeOrder", ctx, o);
        },
      };
    }
    function closed(text) {
      const no = () => Promise.resolve(refusal("unavailable", text));
      return { row: null, capability: { trade: false, read: false, label: "Can't connect" }, connect: no, verify: no, positions: no, placeOrder: no };
    }

    // The matrix in numbers, for reports.
    function summary(rows) {
      const out = { total: 0, trade: 0, track_only: 0, none: 0, shared: 0, by_route: {}, live: 0, built: 0, not_built: 0 };
      for (const r of rows || []) {
        out.total++; if (r.same_account_as) out.shared++;
        const c = capability(r); if (c.trade) out.trade++; else if (c.read) out.track_only++; else out.none++;
        out.by_route[r.route] = (out.by_route[r.route] || 0) + 1; out[r.adapter_state] = (out[r.adapter_state] || 0) + 1;
      }
      return out;
    }
    return { ROUTES, DEFAULT_CAP_CENTS, capability, validate, find, adapterFor, summary };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = BrokerageConnectors;
