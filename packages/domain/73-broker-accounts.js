  /* Per-user brokerage accounts (Rail 2, BUILD-STATUS), PAPER ONLY. Every request resolves the caller's own account from
     the caller's own rows in public.brokerage_accounts; nothing is shared between users and nothing is cached between
     requests, so one person's order can never land in another person's account.
       Row (supabase/migrations/20261011030000_brokerage_accounts_per_user.sql): id, user_id, provider, kind (linked |
       bootstrap), label, paper, account_id (the broker's own account id), vault_key_ref (linked only: the Vault secret
       name, always broker_token_<user_id>_<row id>), status.
       Providers (a multi-provider interface; one entry per broker Upmore can trade through):
         alpaca_oauth   linked     the person's own Alpaca paper account through OAuth; the token is read from the Vault
                                   for this user and this row on every request (never stored in a table, never logged);
                                   Trading API. The account the token opens must equal the row's account_id.
         alpaca_broker  bootstrap  an Alpaca Broker API paper sub-account opened for the person; the firm's keys come from
                                   the function's environment, the account id from the person's row.
         Any other provider on a row is NOT_WIRED by name, never guessed at.
       Choice per request: a linked account is primary; the Alpaca sub-account is the bootstrap used only when nothing is
       linked. Within a kind: label "main" first, then the oldest. A row for any other user in the input stops everything
       (the read that produced it is broken); a live (paper = false) row is never opened: PAPER ONLY until the owner
       confirms live trading in writing.
     resolve() returns { wired, adapter, connectors, partners, label, account } or { wired: false, reason }. */
  const BrokerAccounts = (() => {
    const Alpaca = typeof AlpacaPaper !== "undefined" ? AlpacaPaper : typeof require === "function" ? require("./71-alpaca-paper.js") : null;
    const PROVIDERS = Object.freeze({
      alpaca_oauth: Object.freeze({ kind: "linked", name: "Alpaca", api: "trading", credential: "vault" }),
      alpaca_broker: Object.freeze({ kind: "bootstrap", name: "Alpaca", api: "broker", credential: "env" }),
    });
    const RANK = { linked: 0, bootstrap: 1 };
    const vaultName = (userId, rowId) => `broker_token_${userId}_${rowId}`;

    // Pick this user's account for this request. Pure; rows are whatever the host read for the caller.
    function select(rows, userId) {
      const all = Array.isArray(rows) ? rows : [];
      if (!userId) return { row: null, reason: "NOT_WIRED: no signed-in user" };
      const foreign = all.filter(r => !r || r.user_id !== userId);
      if (foreign.length) return { row: null, reason: `ISOLATION: ${foreign.length} brokerage row(s) for another user reached this request, so no account was opened` };
      const usable = all.filter(r => r.status === "active" && r.account_id);
      const paper = usable.filter(r => r.paper === true), live = usable.filter(r => r.paper !== true);
      const known = paper.filter(r => PROVIDERS[r.provider] && PROVIDERS[r.provider].kind === r.kind);
      if (!known.length) {
        if (live.length && !paper.length) return { row: null, reason: "NOT_WIRED: your only brokerage account is a live one; Upmore trades paper only until live trading is confirmed in writing" };
        const unknown = paper.filter(r => !PROVIDERS[r.provider]).map(r => r.provider);
        if (unknown.length) return { row: null, reason: `NOT_WIRED: ${[...new Set(unknown)].join(", ")} is not a broker Upmore can trade through yet` };
        return { row: null, reason: "NOT_WIRED: no paper brokerage account on file for you" };
      }
      const sorted = known.slice().sort((a, b) => RANK[a.kind] - RANK[b.kind] || (a.label === "main" ? 0 : 1) - (b.label === "main" ? 0 : 1) || String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id)));
      return { row: sorted[0], reason: null, skipped_live: live.length };
    }

    // A row read through the caller's RLS client carries no vault_key_ref (the column is not granted to clients); the
    // table's constraint fixes it to broker_token_<user>_<row> and the RPC recomputes that name, so it is checked here
    // only when present (a service-role read).
    // Build this request's adapter. credential({ user_id, account }) returns the Vault token for that user's linked row
    // (the host calls the service-role RPC broker_token_read(p_user, p_account), which recomputes the secret name from
    // the user id and refuses a row that is not theirs). env holds the firm's sub-account keys. Nothing is cached.
    async function resolve(o) {
      const opts = o || {}, userId = opts.user_id, env = opts.env || {};
      if (!Alpaca) return { wired: false, reason: "NOT_WIRED: the Alpaca adapter is not loaded" };
      const sel = select(opts.rows, userId);
      if (!sel.row) return { wired: false, reason: sel.reason };
      const row = sel.row, spec = PROVIDERS[row.provider];
      const base = Object.assign({ account_id: row.account_id, api: spec.api }, opts.adapter || {});
      if (spec.credential === "vault") {
        if (row.vault_key_ref !== undefined && row.vault_key_ref !== vaultName(userId, row.id)) return { wired: false, reason: "ISOLATION: the linked account's token reference is not this user's, so no account was opened" };
        let token = null;
        try { token = typeof opts.credential === "function" ? await opts.credential({ user_id: userId, account: row.id }) : null; }
        catch (_) { return { wired: false, reason: `NOT_WIRED: I can't read the link to your ${spec.name} account right now` }; }
        if (!token) return { wired: false, reason: `NOT_WIRED: the link to your ${spec.name} account needs to be renewed` };
        base.token = token;
      } else {
        const key = env.ALPACA_BROKER_KEY_ID, secret = env.ALPACA_BROKER_SECRET;
        if (!key || !secret) return { wired: false, reason: `NOT_WIRED: ${[!key && "ALPACA_BROKER_KEY_ID", !secret && "ALPACA_BROKER_SECRET"].filter(Boolean).join(", ")} not set` };
        base.key_id = key; base.secret = secret;
      }
      let adapter;
      try { adapter = Alpaca.create(base); } catch (e) { return { wired: false, reason: `NOT_WIRED: ${String(e && e.message || e)}` }; }
      const name = `${spec.name} PAPER${row.label && row.label !== "main" ? ` (${row.label})` : ""}`;
      return {
        wired: true, adapter, label: adapter.label,
        connectors: Alpaca.connectors(adapter, { account_name: name, clock: opts.clock }),
        partners: Object.freeze({ broker_dealer: Object.freeze({ live: true, paper: true, name: `${name}${spec.kind === "bootstrap" ? " sub-account" : ""}` }) }),
        account: Object.freeze({ id: row.id, user_id: userId, provider: row.provider, kind: spec.kind, account_id: row.account_id, label: row.label || "main", paper: true }),
      };
    }
    return { PROVIDERS, select, resolve, vaultName };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = BrokerAccounts;
