  /* Per-user brokerage connections (BUILD-STATUS, Brokerage connect). Owner decision 2026-10-11: every person connects
     THEIR OWN brokerage; there is no shared trading account and no paper trading anywhere in this flow. Every request
     resolves the caller's own connection from the caller's own rows in public.brokerage_accounts and the caller's own
     token in the Vault; nothing is shared between people and nothing is cached between requests, so one person's order
     can never reach another person's account.
       Row (supabase/migrations/20261011030000_brokerage_accounts_per_user.sql): id, user_id, provider, label, paper (always
       false), account_id (the broker's own account id, read from the broker at connect), account_mask, vault_key_ref
       (always broker_token_<user_id>_<row id>, so a row can only point at its own person's secret), status (active |
       reconnect | paused | revoked).
       The broker adapter interface every provider implements: provider, getAccount(), getPositions(), placeOrder(),
       cancelOrder(), getOrderStatus() (plus the quote, asset and clock reads the trade flow prices and checks with).
       Providers:
         alpaca   built      OAuth 2.0 (Alpaca's OAuth guide). The token response carries no expiry and no refresh token,
                             so there is nothing to refresh: a revoked token answers 401 and the person sees Reconnect.
         schwab   designed   OAuth 2.0 with refresh tokens; Schwab's refresh token lasts 7 days, so a person reconnects
                             weekly. App approval takes days. Not built.
         etrade   designed   OAuth 1.0a; tokens expire at midnight US Eastern and after two idle hours. Not built.
         tradier  designed   OAuth 2.0. Not built.
       Fidelity, Vanguard, Robinhood and SoFi offer no public API that lets an app place trades for a person: said plainly,
       with Alpaca as the way to trade from Upmore.
     resolve() returns { wired, adapter, connectors, partners, label, account } or { wired: false, code, reason, message }:
     code is connect (nothing connected), reconnect (the connection was revoked or expired), not_wired (a provider that
     isn't built), isolation (another person's row reached this request) or unavailable (the connection can't be read). */
  const BrokerAccounts = (() => {
    const Alpaca = typeof AlpacaTrading !== "undefined" ? AlpacaTrading : typeof require === "function" ? require("./71-alpaca.js") : null;
    const WHERE = "Settings > Brokerage";
    const PROVIDERS = Object.freeze({
      alpaca: Object.freeze({ name: "Alpaca", status: "built", auth: "oauth2", refresh: "none" }),
      schwab: Object.freeze({ name: "Charles Schwab", status: "designed", auth: "oauth2", refresh: "refresh_token, 7-day lifetime" }),
      etrade: Object.freeze({ name: "E*TRADE", status: "designed", auth: "oauth1a", refresh: "renew daily; expires at midnight ET" }),
      tradier: Object.freeze({ name: "Tradier", status: "designed", auth: "oauth2", refresh: "refresh_token" }),
    });
    const NO_PUBLIC_API = Object.freeze({ fidelity: "Fidelity", vanguard: "Vanguard", robinhood: "Robinhood", sofi: "SoFi" });
    const vaultName = (userId, rowId) => `broker_token_${userId}_${rowId}`;
    const MESSAGES = {
      connect: `No brokerage is connected, so nothing was placed. Connect your own Alpaca account in ${WHERE}: you approve it on Alpaca's site and Upmore never sees your password.`,
      reconnect: name => `Your ${name} connection was revoked or has expired, so nothing was placed. Reconnect it in ${WHERE}.`,
      unavailable: "I can't read your brokerage connection right now, so nothing was placed. Try again in a minute.",
      not_wired: name => `Connecting ${name} isn't available yet, so nothing was placed. Alpaca is the broker you can connect today, in ${WHERE}.`,
      isolation: "Something is wrong with how your brokerage connection was read, so I stopped and nothing was placed.",
    };
    // A broker the person names that has no public trading API: the honest answer, not a promise.
    function unsupported(word) {
      const k = String(word || "").toLowerCase().replace(/[^a-z]/g, "");
      const name = NO_PUBLIC_API[k] || null;
      return name ? `${name} doesn't offer a way for apps to place trades for you, so Upmore can't connect it. To trade from Upmore, open an Alpaca account and connect it in ${WHERE}.` : null;
    }
    // The per-order cap the owner sets (UPMORE_LIVE_ORDER_CAP_CENTS); anything missing or malformed is the $5.00 default.
    function capFrom(value) { const n = Number(value); return value !== undefined && value !== null && value !== "" && Number.isSafeInteger(n) && n > 0 ? n : (Alpaca ? Alpaca.DEFAULT_CAP_CENTS : 500); }

    // Pick this person's connection for this request. Pure; rows are whatever the host read for the caller.
    function select(rows, userId) {
      const all = Array.isArray(rows) ? rows : [];
      if (!userId) return { row: null, code: "connect", reason: "NOT_WIRED: no signed-in user" };
      const foreign = all.filter(r => !r || r.user_id !== userId);
      if (foreign.length) return { row: null, code: "isolation", reason: `ISOLATION: ${foreign.length} brokerage row(s) for another user reached this request, so no account was opened` };
      const live = all.filter(r => r.paper !== true); // a paper row is never opened: no paper trading in this flow
      const active = live.filter(r => r.status === "active" && r.account_id);
      const built = active.filter(r => PROVIDERS[r.provider] && PROVIDERS[r.provider].status === "built");
      if (built.length) {
        const sorted = built.slice().sort((a, b) => (a.label === "main" ? 0 : 1) - (b.label === "main" ? 0 : 1) || String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id)));
        return { row: sorted[0], code: null, reason: null };
      }
      const again = live.find(r => r.status === "reconnect");
      if (again) { const name = (PROVIDERS[again.provider] || {}).name || again.provider; return { row: null, code: "reconnect", reason: `RECONNECT: the ${name} connection was revoked or expired`, provider: name }; }
      const designed = active.find(r => PROVIDERS[r.provider]);
      if (designed) { const name = PROVIDERS[designed.provider].name; return { row: null, code: "not_wired", reason: `NOT_WIRED: ${name} is designed for but not built`, provider: name }; }
      const unknown = active.find(r => !PROVIDERS[r.provider]);
      if (unknown) return { row: null, code: "not_wired", reason: `NOT_WIRED: ${unknown.provider} is not a broker Upmore can trade through`, provider: unknown.provider };
      return { row: null, code: "connect", reason: "NOT_WIRED: no brokerage connected" };
    }
    const fail = (code, reason, provider) => ({ wired: false, code, reason, message: typeof MESSAGES[code] === "function" ? MESSAGES[code](provider || "Alpaca") : MESSAGES[code] });

    // Build this request's adapter. credential({ user_id, account }) returns the Vault entry for that person's row (the
    // host calls the service-role RPC broker_token_read(p_user, p_account), which recomputes the secret name from the
    // caller's id and refuses a row that is not theirs). on_auth_failure({ user_id, account }) lets the host mark the row
    // for Reconnect when the broker answers 401. Nothing is cached.
    async function resolve(o) {
      const opts = o || {}, userId = opts.user_id;
      if (!Alpaca) return fail("unavailable", "NOT_WIRED: the Alpaca adapter is not loaded");
      const sel = select(opts.rows, userId);
      if (!sel.row) return fail(sel.code, sel.reason, sel.provider);
      const row = sel.row, spec = PROVIDERS[row.provider];
      // A row read through the caller's RLS client carries no vault_key_ref (the column is not granted to clients); the
      // table's constraint fixes it and the RPC recomputes the name, so it is checked here only when present.
      if (row.vault_key_ref !== undefined && row.vault_key_ref !== vaultName(userId, row.id)) return fail("isolation", "ISOLATION: the connection's token reference is not this user's, so no account was opened");
      let stored = null;
      try { stored = typeof opts.credential === "function" ? await opts.credential({ user_id: userId, account: row.id }) : null; }
      catch (_) { return fail("unavailable", `NOT_WIRED: the ${spec.name} connection could not be read`); }
      let token = null;
      if (typeof stored === "string" && stored) { try { const j = JSON.parse(stored); token = j && typeof j.access_token === "string" ? j.access_token : null; } catch (_) { token = stored; } }
      if (!token) return fail("reconnect", `RECONNECT: no ${spec.name} token on file`, spec.name);
      let adapter;
      try {
        adapter = Alpaca.create(Object.assign({}, opts.adapter || {}, {
          token, account_id: row.account_id, order_cap_cents: capFrom(opts.order_cap_cents),
          on_auth_failure: () => { if (typeof opts.on_auth_failure === "function") return opts.on_auth_failure({ user_id: userId, account: row.id }); },
        }));
      } catch (e) { return fail("unavailable", `NOT_WIRED: ${String(e && e.message || e)}`); }
      const name = `your ${spec.name} account${row.account_mask ? ` (${row.account_mask})` : ""}`;
      return {
        wired: true, adapter, label: adapter.label,
        connectors: Alpaca.connectors(adapter, { account_name: name, clock: opts.clock }),
        partners: Object.freeze({ broker_dealer: Object.freeze({ live: true, paper: false, name: `${spec.name} (your account)` }) }),
        account: Object.freeze({ id: row.id, user_id: userId, provider: row.provider, account_id: row.account_id, label: row.label || "main", live: true, paper: false, order_cap_cents: adapter.order_cap_cents }),
      };
    }
    return { PROVIDERS, NO_PUBLIC_API, MESSAGES, WHERE, select, resolve, unsupported, capFrom, vaultName };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = BrokerAccounts;
