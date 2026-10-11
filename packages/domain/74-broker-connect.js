  /* Brokerage connect: OAuth 2.0 authorization-code flow, server side (BUILD-STATUS, Brokerage connect). The person taps
     Connect, approves on the broker's own site, and is sent back; Upmore never shows or asks for a key, a password or a
     token. Alpaca first, per its OAuth guide (github.com/alpacahq/alpaca-docs, content/oauth/guide.md):
       authorize  GET  https://app.alpaca.markets/oauth/authorize?response_type=code&client_id&redirect_uri&state&scope
       token      POST https://api.alpaca.markets/oauth/token, application/x-www-form-urlencoded:
                       grant_type=authorization_code, code, client_id, client_secret, redirect_uri
                  -> { access_token, token_type: "bearer", scope } (no expiry and no refresh token in the guide)
     Scope: "trading data". trading places and cancels orders; data reads the quote every card shows. account:write
     (account configuration and watchlists) is not needed and not asked for. env=live is sent as the owner's research
     says; the 2025 docs repo does not list it, so the callback proves the account is live itself: the token must open
     /v2/account on api.alpaca.markets (the live host), or nothing is connected. There is no paper fallback.
     State (CSRF): base64url(JSON {v, p: provider, u: user id, n: nonce, e: expiry}) + "." + HMAC-SHA256 over it, keyed by
     BROKER_OAUTH_STATE_SECRET or, when unset, a key derived from the service-role key (never sent anywhere). The
     callback rejects a bad signature, an expired state (10 minutes), and a nonce that is unknown, already used, or issued
     to another person or provider (the nonce's hash is stored at start and consumed once, atomically). The person the
     account is linked to is the one in the signed state, never anything else in the query string.
     The token is exchanged and checked server side, then STAGED in the Vault for that person (db.stage: the RPC
     broker_stage_link), never put in a table, a log, a redirect or a reply. The callback never completes a connection
     itself: it sends the browser back to the app with a one-time link id, and the app confirms it with the signed-in
     person's own session (broker_confirm_link, which checks auth.uid() against the person who started it). That closes
     the reversed attack a signed state alone leaves open: someone starts Connect in their own login and sends the Alpaca
     approval link to someone else; the other person's approval is staged under the starter's id, but only the other
     person's browser holds the link id, and their app confirms as them, which is refused and wipes it.
     All I/O is injected (db, fetch, crypto, clock). */
  const BrokerConnect = (() => {
    const Accounts = typeof BrokerAccounts !== "undefined" ? BrokerAccounts : typeof require === "function" ? require("./73-broker-accounts.js") : null;
    const STATE_TTL_MS = 10 * 60 * 1000;
    const OAUTH = Object.freeze({
      alpaca: Object.freeze({ authorize: "https://app.alpaca.markets/oauth/authorize", token: "https://api.alpaca.markets/oauth/token", account: "https://api.alpaca.markets/v2/account", scope: "trading data", env: "live", client_id: "ALPACA_OAUTH_CLIENT_ID", client_secret: "ALPACA_OAUTH_CLIENT_SECRET" }),
    });
    const enc = s => new TextEncoder().encode(s);
    const b64url = bytes => { let bin = ""; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
    const unb64url = s => { const t = String(s).replace(/-/g, "+").replace(/_/g, "/"); const bin = atob(t + "===".slice((t.length + 3) % 4)); return Uint8Array.from(bin, ch => ch.charCodeAt(0)); };
    const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    const subtleOf = deps => (deps && deps.subtle) || (typeof crypto !== "undefined" && crypto.subtle) || null;
    async function hmac(key, msg, subtle) { const k = await subtle.importKey("raw", enc(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return new Uint8Array(await subtle.sign("HMAC", k, enc(msg))); }
    async function sha256(msg, subtle) { return hex(new Uint8Array(await subtle.digest("SHA-256", enc(msg)))); }
    function same(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; }
    const MESSAGES = {
      not_configured: "Connecting a brokerage isn't switched on yet: Upmore's Alpaca app credentials are not set. Nothing was connected.",
      not_wired: name => `Connecting ${name} isn't available yet. Alpaca is the broker you can connect today.`,
      denied: "You didn't approve the connection on the broker's site, so nothing was connected.",
      state_invalid: "That connection link was not valid or had expired, so nothing was connected. Tap Connect again.",
      state_used: "That connection link was already used or wasn't yours, so nothing was connected. Tap Connect again.",
      exchange_failed: "The broker didn't complete the connection, so nothing was connected. Tap Connect again.",
      not_live: "That connection doesn't open a live Alpaca account. Upmore trades in live accounts only, so nothing was connected.",
      account_not_active: "That Alpaca account isn't active for trading yet, so nothing was connected.",
      connected_elsewhere: "That brokerage account is already connected to another Upmore login, so it wasn't connected here.",
      save_failed: "The connection couldn't be saved, so nothing was connected. Tap Connect again.",
      connected: "Connected. Upmore can now place the trades you approve in your own Alpaca account.",
      confirm: "Almost done: Upmore is confirming the connection in your own signed-in app.",
    };

    // Configuration from the function's environment. Secrets stay here; only the client id goes into a URL.
    async function config(provider, env, deps) {
      const e = env || {}, spec = OAUTH[provider];
      if (!spec) return { ok: false, code: "not_wired" };
      const id = e[spec.client_id], secret = e[spec.client_secret];
      if (!id || !secret) return { ok: false, code: "not_configured" };
      const base = String(e.SUPABASE_URL || "").replace(/\/+$/, "");
      const redirect = e.BROKER_OAUTH_REDIRECT_URI || (base ? `${base}/functions/v1/broker-oauth-callback` : null);
      if (!redirect) return { ok: false, code: "not_configured" };
      let key = e.BROKER_OAUTH_STATE_SECRET || null;
      if (!key && e.SUPABASE_SERVICE_ROLE_KEY) { const subtle = subtleOf(deps); if (!subtle) return { ok: false, code: "not_configured" }; key = b64url(await hmac(e.SUPABASE_SERVICE_ROLE_KEY, "upmore:broker-oauth-state:v1", subtle)); }
      if (!key) return { ok: false, code: "not_configured" };
      return { ok: true, provider, spec, client_id: id, client_secret: secret, redirect_uri: redirect, state_key: key, app_url: e.UPMORE_APP_URL ? String(e.UPMORE_APP_URL) : null };
    }

    async function signState(payload, key, deps) { const body = b64url(enc(JSON.stringify(payload))); return `${body}.${b64url(await hmac(key, body, subtleOf(deps)))}`; }
    async function verifyState(state, key, now, deps) {
      const parts = String(state || "").split(".");
      if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
      let sig; try { sig = unb64url(parts[1]); } catch (_) { return { ok: false, reason: "malformed" }; }
      if (!same(sig, await hmac(key, parts[0], subtleOf(deps)))) return { ok: false, reason: "tampered" };
      let p; try { p = JSON.parse(new TextDecoder().decode(unb64url(parts[0]))); } catch (_) { return { ok: false, reason: "malformed" }; }
      if (!p || p.v !== 1 || typeof p.u !== "string" || typeof p.p !== "string" || typeof p.n !== "string" || !Number.isSafeInteger(p.e)) return { ok: false, reason: "malformed" };
      if (now > p.e) return { ok: false, reason: "expired" };
      return { ok: true, payload: p };
    }
    function authorizeUrl(cfg, state) {
      const q = new URLSearchParams({ response_type: "code", client_id: cfg.client_id, redirect_uri: cfg.redirect_uri, state, scope: cfg.spec.scope, env: cfg.spec.env });
      return `${cfg.spec.authorize}?${q.toString().replace(/\+/g, "%20")}`;
    }

    // Start: the signed-in person (user_id from the verified JWT, never from the body) asks to connect a provider.
    async function start(o) {
      const a = o || {}, now = a.now || Date.now(), word = String(a.provider || "").toLowerCase();
      const no = Accounts && Accounts.unsupported(word);
      if (no) return { ok: false, code: "unsupported", message: no };
      const prov = Accounts && Accounts.PROVIDERS[word];
      if (!prov || prov.status !== "built") return { ok: false, code: "not_wired", message: MESSAGES.not_wired(prov ? prov.name : word || "that broker") };
      if (!a.user_id) return { ok: false, code: "unauthenticated", message: "Sign in first." };
      const cfg = await config(word, a.env, a);
      if (!cfg.ok) return { ok: false, code: cfg.code, message: typeof MESSAGES[cfg.code] === "function" ? MESSAGES[cfg.code](prov.name) : MESSAGES[cfg.code] };
      const rnd = new Uint8Array(32); (a.random || (b => crypto.getRandomValues(b)))(rnd);
      const nonce = hex(rnd), exp = now + STATE_TTL_MS;
      await a.db.createState({ user_id: a.user_id, provider: word, nonce_hash: await sha256(nonce, subtleOf(a)), expires_at: new Date(exp).toISOString() });
      const state = await signState({ v: 1, p: word, u: a.user_id, n: nonce, e: exp }, cfg.state_key, a);
      return { ok: true, url: authorizeUrl(cfg, state), expires_at: exp };
    }

    // Callback: the broker sends the person back with ?code&state (or ?error). Returns where to send them and why.
    async function callback(o) {
      const a = o || {}, q = a.query || {}, now = a.now || Date.now(), log = typeof a.log === "function" ? a.log : () => {};
      const fetchFn = a.fetch || (typeof fetch !== "undefined" ? fetch : null);
      const done = (outcome, code, cfg, link) => {
        const message = MESSAGES[code] && typeof MESSAGES[code] !== "function" ? MESSAGES[code] : MESSAGES.exchange_failed;
        log(`[broker-connect] ${outcome}: ${code}`);
        const app = cfg && cfg.app_url;
        // Back to the app's You screen, where Brokerage lives: #you?broker=connected or #you?broker=error&reason=<code>.
        const redirect = app ? `${app.replace(/[#?].*$/, "").replace(/\/+$/, "")}/#you?${new URLSearchParams(outcome === "staged" ? { broker: "confirm", link } : outcome === "connected" ? { broker: "connected" } : { broker: "error", reason: code }).toString()}` : null;
        return { outcome, code, message, redirect };
      };
      // The provider is only trusted from the signed state; read it unverified just to find the right key, then verify.
      let claimed = null; try { claimed = JSON.parse(new TextDecoder().decode(unb64url(String(q.state || "").split(".")[0]))).p; } catch (_) { claimed = null; }
      const cfg = OAUTH[claimed] ? await config(claimed, a.env, a) : { ok: false, code: "state_invalid" };
      const home = a.env && a.env.UPMORE_APP_URL ? { app_url: String(a.env.UPMORE_APP_URL) } : null;
      if (!cfg.ok) return done("error", cfg.code === "not_configured" ? "not_configured" : "state_invalid", home);
      const v = await verifyState(q.state, cfg.state_key, now, a);
      if (!v.ok) return done("error", "state_invalid", cfg);
      const p = v.payload;
      // One use, this person, this provider: consumed before anything else happens, so a replay can never link twice.
      const fresh = await a.db.consumeState({ user_id: p.u, provider: p.p, nonce_hash: await sha256(p.n, subtleOf(a)) }).catch(() => false);
      if (!fresh) return done("error", "state_used", cfg);
      if (q.error) return done("denied", "denied", cfg);
      if (!q.code || typeof q.code !== "string") return done("error", "exchange_failed", cfg);
      let tok = null;
      try {
        const body = new URLSearchParams({ grant_type: "authorization_code", code: q.code, client_id: cfg.client_id, client_secret: cfg.client_secret, redirect_uri: cfg.redirect_uri });
        const r = await fetchFn(cfg.spec.token, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: body.toString() });
        const j = await r.json().catch(() => null);
        if (r.ok && j && typeof j.access_token === "string" && j.access_token) tok = { access_token: j.access_token, token_type: j.token_type || "bearer", scope: j.scope || null, obtained_at: new Date(now).toISOString() };
        else log(`[broker-connect] token exchange answered ${r.status}`);
      } catch (e) { log("[broker-connect] token exchange threw"); }
      if (!tok) return done("error", "exchange_failed", cfg);
      // Live only: the token must open an account on the live host. A paper-only token is refused, never used.
      let acct = null, status = 0;
      try { const r = await fetchFn(cfg.spec.account, { headers: { authorization: `Bearer ${tok.access_token}`, accept: "application/json" } }); status = r.status; acct = r.ok ? await r.json().catch(() => null) : null; }
      catch (_) { return done("error", "exchange_failed", cfg); }
      if (status === 401 || status === 403) return done("error", "not_live", cfg);
      if (!acct || typeof acct.id !== "string" || !acct.id) return done("error", "exchange_failed", cfg);
      if (acct.status && acct.status !== "ACTIVE") return done("error", "account_not_active", cfg);
      const mask = acct.account_number ? `****${String(acct.account_number).slice(-4)}` : null;
      // Staged, not connected: the person who started this confirms it from their own signed-in app.
      const staged = await a.db.stage({ user_id: p.u, provider: p.p, account_id: acct.id, account_mask: mask, scope: tok.scope, token: JSON.stringify(tok) }).catch(e => ({ ok: false, error: String(e && e.message || e) }));
      if (!staged || !staged.ok || !staged.link_id) return done("error", staged && staged.conflict ? "connected_elsewhere" : "save_failed", cfg);
      return done("staged", "confirm", cfg, staged.link_id);
    }
    return { OAUTH, STATE_TTL_MS, MESSAGES, config, signState, verifyState, authorizeUrl, start, callback };
  })();
  if (typeof module !== "undefined" && module.exports) module.exports = BrokerConnect;
