# UPMORE — Brokerage Connect: implementation prompt for Claude Code

Owner decision 2026-10-11: users connect THEIR OWN brokerage. No shared trading
account, no paper-first. Every trade executes inside the requesting user's own
brokerage account. (This is Upmore work — Ring is a separate track, do not
touch Ring's repo, infra, or keys.)

## What the research says (verified 2026-10-11)

- **Alpaca OAuth is the v1 path.** Alpaca implements OAuth 2.0 for third-party
  apps (docs.alpaca.markets "Using OAuth2 and Trading API"):
  - Authorize: `GET https://app.alpaca.markets/oauth/authorize?response_type=code&client_id={ID}&redirect_uri={URI}&scope={SCOPES}&state={STATE}`
  - Token (live): `POST https://api.alpaca.markets/oauth/token` (form-encoded:
    grant_type=authorization_code, code, client_id, client_secret, redirect_uri)
  - Token (paper): `POST https://paper-api.alpaca.markets/oauth/token`
  - Scopes: `account:write`, `trading`, `data` (space-delimited; read-only
    assumed by default). One token can cover live + paper (omit `env` param).
  - Use: `Authorization: Bearer <access_token>` against api.alpaca.markets
    (live) / paper-api.alpaca.markets (paper).
  - App registration: app.alpaca.markets → Connect → register app (name,
    description, redirect URIs, scopes) → receive client_id + client_secret.
    Live trading requires Alpaca Compliance approval of the app.
- **Later adapters** (design for, don't build): Schwab Trader API (OAuth, app
  approval 1–3 days, refresh tokens die every 7 days — needs background
  refresh), E*TRADE (OAuth API exists), Tradier (OAuth + REST, dev-friendly).
- **Cannot connect via OAuth**: Fidelity, Vanguard, Robinhood, SoFi (no public
  third-party OAuth). For those users the answer is the Alpaca path (free
  Alpaca account → connect). Say this honestly in the UI — never imply a
  connection exists that doesn't.

## Build

1. **Adapter interface first.** `broker` adapter with `provider` field:
   `getAccount()`, `getPositions()`, `placeOrder()`, `cancelOrder()`,
   `getOrderStatus()`. Alpaca is the first implementation. Every adapter
   resolves credentials per-request from `brokerage_accounts`
   (user_id, provider, account_id, vault_key_ref, env live|paper).
2. **Connect flow (connector UX rule: tap Connect → approve in the broker's
   own site → done; never show keys, never paste tokens).**
   - UI: broker list (Alpaca live now; others greyed "coming soon" with the
     honest no-OAuth note where true).
   - Start: signed `state` (CSRF), redirect to Alpaca authorize URL with
     scopes `account:write trading`.
   - Callback: verify state, exchange code for token server-side, store
     access_token (+ refresh if issued) per-user in the vault, referenced by
     `vault_key_ref` — never raw in the DB. Create/update the
     `brokerage_accounts` row.
   - Disconnect: revoke/disable locally, delete the vault entry.
3. **Trading path.** Orders resolve the user's own account only — a trade for
   user A can never touch user B's account (test this explicitly). Every order:
   approval-gated (existing exec_approvals flow), idempotency key, no blind
   retries. Standing $5/test-order cap until the owner raises it (owner order).
4. **Token refresh.** Handle expiry/refresh server-side; on revoked/expired
   tokens show Reconnect, never silently fail or hallucinate fills.
5. **Tests (permanent):** OAuth start→callback→store round trip (stub Alpaca);
   tampered state rejected; per-user isolation (A's token unusable for B);
   no-account → honest connect prompt, never a fake portfolio; disconnect
   wipes vault entry; order without approval never submits.

## Env needed (owner's tap)
- `ALPACA_OAUTH_CLIENT_ID` + `ALPACA_OAUTH_CLIENT_SECRET` as Supabase secrets
  (project upmore). Owner registers the app at app.alpaca.markets → Connect:
  e-sign the OAuth agreement, add redirect URIs (dev + production), request
  scopes `account:write trading`. Live trading needs Alpaca Compliance
  approval — paper works immediately.

## Report
Files changed, tests added, what you verified live (real OAuth round trip
with a test Alpaca account), and what remains blocked (e.g., Compliance
approval for live). End READY or BLOCKED: <reason>.
