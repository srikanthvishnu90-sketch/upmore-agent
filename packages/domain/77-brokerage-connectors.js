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
    // How a person signs in on each route. Passwords never reach Upmore on any of them (owner, 2026-10-11, decision 1):
    // OAuth and aggregators log in on the company's own page; a personal API key goes through the secure link into the
    // vault, never through chat; a manual session is the person logging in themselves in a live browser window, and only
    // the encrypted session is kept.
    const AUTH = Object.freeze({
      native_api: ["oauth", "partner_oauth", "personal_api_key"], snaptrade: ["aggregator"], plaid: ["aggregator"],
      browser_assisted: ["manual_session"], none: ["none"],
    });
    const DEFAULT_CAP_CENTS = 500; // the owner's per-order cap while Upmore is in testing (raised only by the owner)
    const refusal = (code, text, extra) => Object.assign({ ok: false, code, text }, extra || {});

    // What a connection can do, in the words the person sees on every card and reply. A row the owner has switched off
    // (blocked_reason: prediction markets under the gambling guard, crypto under the crypto rule) can do nothing until he
    // lifts it in writing; { route: true } asks what the route itself could do, for the matrix.
    function capability(row, opts) {
      if (row && row.blocked_reason && !(opts && opts.route)) return { trade: false, read: false, label: "Off: owner decision", blocked: true };
      if (!row || row.route === "none" || !ROUTES[row.route]) return { trade: false, read: false, label: "Can't connect" };
      const trade = !!row.trade && ROUTES[row.route].trade_possible, read = !!row.read;
      return { trade, read, label: trade ? "Trade + track" : read ? "Track only" : "Can't connect" };
    }

    // Where a platform stands today, not what its route could do one day: connect now (its adapter is live), track now
    // through a live fallback route (Schwab through Plaid while its trading approval is pending), not built, off, or none.
    function today(row, rows) {
      const c = capability(row);
      if (c.blocked) return { state: "blocked", label: "Off: owner decision" };
      if (!row || row.route === "none" || !ROUTES[row.route]) return { state: "none", label: "Can't connect" };
      const parent = row.same_account_as ? (rows || []).find(x => x.id === row.same_account_as) : null;
      const r = parent && !parent.blocked_reason ? parent : row;
      // A live route whose coverage of this platform nobody has confirmed is offered as a try, never as a promise.
      if (r.adapter_state === "live") return r.verification === "unverified"
        ? { state: "try", label: `Try now through ${ROUTES[r.route].name} (coverage unverified)` }
        : { state: "connect", label: c.trade ? "Connect now: trade + track" : "Connect now: track only" };
      const fb = r.fallback_route;
      if (fb && (rows || []).some(x => x.route === fb && x.adapter_state === "live" && !x.blocked_reason)) return { state: "fallback", label: `Track now through ${ROUTES[fb].name}; ${c.trade ? "trading" : "the direct route"} not built` };
      return { state: "not_built", label: "Not built yet" };
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
        if (r.auth !== undefined && !(AUTH[r.route] || []).includes(r.auth)) errors.push(`${tag}: auth ${r.auth} does not fit a ${r.route} route`);
        if (r.fallback_route !== undefined && (!ROUTES[r.fallback_route] || r.fallback_route === "none" || r.fallback_route === r.route || ROUTES[r.fallback_route].trade_possible)) errors.push(`${tag}: a fallback route is a different read-only route`);
        if (r.blocked_reason !== undefined && !(typeof r.blocked_reason === "string" && r.blocked_reason.trim())) errors.push(`${tag}: a blocked row says why`);
      }
      for (const r of rows || []) {
        if (!r || !r.same_account_as) continue;
        const p = (rows || []).find(x => x.id === r.same_account_as);
        if (!p) errors.push(`#${r.n} ${r.platform}: same_account_as ${r.same_account_as} is not a row`);
        else if (p.same_account_as) errors.push(`#${r.n} ${r.platform}: same_account_as points at another shared row`);
        else if (p.route !== r.route) errors.push(`#${r.n} ${r.platform}: a shared account uses its parent's route (${p.route})`);
      }
      return errors;
    }

    // "I invest on Robinhood": the row for a platform named in the person's words (aliases on word boundaries).
    function find(rows, words) {
      const t = ` ${String(words || "").toLowerCase().replace(/[^a-z0-9.*&+ -]/g, " ").replace(/\s+/g, " ").trim()} `;
      let best = null;
      for (const r of rows || []) for (const a of [r.platform].concat(r.aliases || [])) {
        const k = String(a).toLowerCase();
        if (k && t.includes(` ${k} `) && (!best || k.length > best.k.length)) best = { r, k };
      }
      if (!best) return null;
      const r = best.r;
      // A shared account (Robinhood Crypto, ForecastEx) is one connection: the parent row connects it.
      if (r.blocked_reason) return r;
      return r.same_account_as ? Object.assign({}, (rows || []).find(x => x.id === r.same_account_as) || r, { via: r.platform }) : r;
    }

    // The adapter for a row, wrapped so the rules hold whatever the adapter does.
    function adapterFor(row, deps) {
      const d = deps || {}, cap = capability(row);
      if (row && row.blocked_reason) return closed(`${row.platform} isn't available in Upmore, so nothing was connected.`, "blocked");
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
    function closed(text, code) {
      const no = () => Promise.resolve(refusal(code || "unavailable", text));
      return { row: null, capability: { trade: false, read: false, label: code === "blocked" ? "Off: owner decision" : "Can't connect" }, connect: no, verify: no, positions: no, placeOrder: no };
    }

    // The matrix in numbers, for reports. trade / track_only / none count what each platform can do in Upmore (a row the
    // owner switched off counts as blocked, not as trade); route_trade counts what the routes could do with nothing off;
    // today counts where each platform stands now.
    function summary(rows) {
      const out = { total: 0, trade: 0, track_only: 0, none: 0, blocked: 0, route_trade: 0, shared: 0, by_route: {}, live: 0, built: 0, not_built: 0, today: {} };
      for (const r of rows || []) {
        out.total++; if (r.same_account_as) out.shared++;
        const c = capability(r); if (c.blocked) out.blocked++; else if (c.trade) out.trade++; else if (c.read) out.track_only++; else out.none++;
        if (capability(r, { route: true }).trade) out.route_trade++;
        out.by_route[r.route] = (out.by_route[r.route] || 0) + 1; out[r.adapter_state] = (out[r.adapter_state] || 0) + 1;
        const t = today(r, rows).state; out.today[t] = (out.today[t] || 0) + 1;
      }
      return out;
    }
    // "connect my fidelity" (live gauntlet S16-19, 2026-10-12: the model invented app steps). The honest answer for the
    // platform the person named, from the matrix: a live connect link (Alpaca), the read-only Plaid path, a fallback while
    // trading waits on approval, not built yet, off, or can't connect. Pure: returns the words and whether the Alpaca
    // connect card follows; null when no platform was named.
    const CONNECT_RX = /^\s*(?:please |pls |can you |could you |can u |i want to |i wanna |help me )?(?:connect|link|add|hook up|sync|set up)\s+(?:my\s+|our\s+)?(.+?)\s*[?.!]*\s*$/i;
    function connectAnswer(rows, words) {
      const m = CONNECT_RX.exec(String(words || ""));
      if (!m) return null;
      const named = find(rows, m[1]);
      if (!named) return null;
      const r = named, via = r.via && r.via !== r.platform ? `${r.via} connects as part of ${r.platform}. ` : "";
      const t = today(r, rows), name = r.via || r.platform;
      const plaidSteps = "In the app: Investments, then Connect investments, then pick it on Plaid's list. You log in on its own page; Upmore never sees the password.";
      if (t.state === "blocked") return { platform: r.platform, state: t.state, text: `${name} isn't available in Upmore, so nothing was connected.` };
      if (t.state === "none") return { platform: r.platform, state: t.state, text: `${name} can't be connected${r.notes ? `: ${r.notes.replace(/\.$/, "")}` : ""}. Nothing was connected.` };
      if (t.state === "connect" && capability(r).trade) return { platform: r.platform, state: t.state, card: r.id, text: `${via}Not connected yet - here's the link.` };
      if (t.state === "connect") return { platform: r.platform, state: t.state, text: `${via}${name} doesn't let apps place trades, so Upmore tracks it read-only through Plaid (holdings and balances). ${plaidSteps}` };
      if (t.state === "try") return { platform: r.platform, state: t.state, text: `${via}Upmore can track ${name} read-only through Plaid, but Plaid's coverage of ${name} isn't confirmed yet, so it's worth a try. ${plaidSteps}` };
      // What is missing, in the person's words (the matrix's "needs" is for the owner, not for them).
      const waits = r.auth === "partner_oauth" ? `${r.platform.replace(/\s*\(.*\)$/, "")}'s approval of Upmore, which it doesn't have yet` : "a connection Upmore hasn't switched on";
      if (t.state === "fallback") return { platform: r.platform, state: t.state, text: `${via}${capability(r).trade ? `Trading at ${r.platform} needs ${waits}.` : `Upmore's direct connection to ${r.platform} isn't switched on yet.`} Meanwhile it can be tracked read-only through Plaid. ${plaidSteps}` };
      return { platform: r.platform, state: t.state, text: `${via}Upmore can't connect ${name} yet: it needs ${waits}${r.route === "browser_assisted" ? " (a secure window where you log in yourself)" : ""}. Nothing was connected.` };
    }
    // A row's decision must not contradict its own recorded research (benchmark matrix-honesty, 2026-10-12): the route is
    // the one the research names as best (a shared account follows its parent), a row marked researched has no clause in
    // its route's research saying the part it relies on is unverified, and trading is never claimed where the research
    // for that route says read-only. Clauses about trading are ignored for track-only rows (they claim no trading).
    const ROUTE_WORD = { plaid: /plaid/, snaptrade: /snaptrade/, native_api: /native|api|direct/, browser_assisted: /browser/, none: /none|defunct|no |not available|institutional/ };
    const DOUBT = /\b(unverified|not found|likely|not confirmed|unconfirmed|unclear)\b/i;
    function contradictions(rows) {
      const out = [];
      for (const r of rows || []) {
        const R = r.research; if (!R) continue;
        const said = String({ plaid: R.plaid, snaptrade: R.snaptrade, native_api: R.native_api }[r.route] || "");
        const best = String(R.best_route || "").toLowerCase();
        if (!r.same_account_as && ROUTE_WORD[r.route] && !ROUTE_WORD[r.route].test(best)) out.push({ id: r.id, n: r.n, kind: "route", text: `route ${r.route}, but the research names "${R.best_route}"` });
        const clauses = said.split(/[;.]|\s-\s|,\s(?=whether|but|holdings|trading)/).filter(c => c.trim() && (r.trade || !/trad/i.test(c)));
        if (r.verification === "researched" && clauses.some(c => DOUBT.test(c))) out.push({ id: r.id, n: r.n, kind: "verification", text: `marked researched, but the research says: "${clauses.find(c => DOUBT.test(c)).trim()}"` });
        if (r.trade && capability(r, { route: true }).trade && /read[- ]only|no trad/i.test(said) && !/trad(e|ing) (?:via|through|permitted|supported)|trading\)/i.test(said)) out.push({ id: r.id, n: r.n, kind: "trade", text: `trading claimed, but the research says: "${said.slice(0, 120)}"` });
      }
      return out;
    }
    return { ROUTES, AUTH, DEFAULT_CAP_CENTS, capability, today, validate, find, adapterFor, summary, connectAnswer, contradictions };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = BrokerageConnectors;
