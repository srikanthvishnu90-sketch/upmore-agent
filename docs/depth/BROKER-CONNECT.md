# Brokerage connect: each person's own live brokerage, through OAuth

Owner: Claude. Status words: planned, built, proven (its test fails under the planted break and passes without it).

Owner decision, 2026-10-11: people connect THEIR OWN brokerage. No shared trading account. LIVE trading only, with no paper anywhere in this flow. Every trade runs in the requesting person's own live account. Until the owner raises it in writing, each live order is capped at $5.00.

**Everything in this packet is proven against stubs and a mock, never against Alpaca.** The OAuth endpoints (`https://api.alpaca.markets/oauth/token`, `/v2/account`) are a stubbed fetch built from Alpaca's OAuth guide. Orders go to the mock Trading API server (`tests/fixtures/alpaca-mock.cjs`). The database is an in-memory stand-in whose real counterpart is tested in `tests/db/brokerage_accounts.test.sql`. Live OAuth round trips: **0**. Live orders: **0**.

Scope:
- `packages/domain/74-broker-connect.js`: signed state, the authorize URL, the server-side code exchange, the live-account check, and linking.
- `packages/domain/73-broker-accounts.js`: the provider table, per-request resolution, and the connect, reconnect, not-wired and no-public-API answers.
- `packages/domain/71-alpaca.js`: the adapter interface, the cap, and 401 handling.
- `packages/domain/66-agent-trade.js`: LIVE labels, the prompts, and the cap said before the card.
- `supabase/functions/broker-oauth-start`, `supabase/functions/broker-oauth-callback` and `_shared/broker_connect.ts`.
- `supabase/migrations/20261011030000_brokerage_accounts_per_user.sql`.

Check: `node --test tests/depth-BROKER-CONNECT.test.cjs && node evals/depth/run.cjs BROKER-CONNECT`, plus `bash tests/db/run.sh` and `deno test -A --no-check tests/edge/`.

## What was verified about Alpaca, and what was not

Source: github.com/alpacahq/alpaca-docs (content/oauth/guide.md and oas/oauth, last commit April 2025). The docs site itself does not resolve from this environment.

| Claim | State |
| --- | --- |
| Authorize `GET https://app.alpaca.markets/oauth/authorize?response_type=code&client_id&redirect_uri&state&scope` | Confirmed in the guide |
| Token `POST https://api.alpaca.markets/oauth/token`, form-encoded: grant_type, code, client_id, client_secret, redirect_uri | Confirmed |
| Scopes `account:write`, `trading`, `data` | Confirmed. We ask for **`trading data`**. `data` is needed for the quote every card shows. `account:write` (account configuration, watchlists) is not needed. The owner's brief named `account:write trading`. |
| `env=live` on the authorize URL | **Not in the 2025 docs repo.** We send it anyway, and the callback proves the account is live: the token must open `/v2/account` on `api.alpaca.markets`. |
| Token response `{access_token, token_type, scope}` | Confirmed. **No `expires_in` and no `refresh_token`**, so there is nothing to refresh for Alpaca. A revoked token answers 401, and the person sees Reconnect. |
| Bearer token on `api.alpaca.markets/v2/*` | Confirmed (the guide's examples) |
| Live OAuth needs Alpaca Compliance approval | The owner's research; not in the docs repo. Nothing here can test it. |

## The sub-capabilities (enumerated before implementation)

| # | Sub-capability | What the person sees, or what the broker sees |
| --- | --- | --- |
| S01 | The broker adapter interface | `provider`, `getAccount`, `getPositions`, `placeOrder`, `cancelOrder`, `getOrderStatus` against the person's own account, Bearer on `/v2`. |
| S02 | Connect opens the broker's own page | The exact Alpaca authorize URL with our callback, `trading data`, `env=live` and a signed state. No secret appears in it. Only the nonce's hash is stored. |
| S03 | The OAuth round trip, server side | The code is exchanged form-encoded with the client secret. The live account is read. The token is staged for this person. The app returns to `#you?broker=confirm&link=<id>` and confirms it with the person's own session. |
| S04 | A tampered state is rejected | Another person's id under the old signature, a forged signature, another key, or garbage: `state_invalid`, with no exchange and no database call. |
| S05 | An expired state is rejected | More than 10 minutes old: nothing is exchanged. |
| S06 | One use, by the person it was issued to | A replayed callback is refused; there is no second exchange and no second link. |
| S07 | Live only, no paper fallback | A token that doesn't open a live account connects nothing ("Upmore trades in live accounts only"). Paper is never tried. An inactive account connects nothing. |
| S08 | One account, one login | An account someone else holds is refused, and the person is told why. |
| S09 | Honest when Connect can't run | App credentials not set, the person said no, or a provider not built: each is said plainly, and no state is written. |
| S10 | No secret anywhere | No code, token, client secret or service key reaches a log line, a redirect or a message. |
| S11 | No brokerage: the honest connect prompt | An order, a portfolio question or a cancel gets "No brokerage is connected... Connect your own Alpaca account in Settings > Brokerage". Nothing is read. |
| S12 | No public API, said plainly | Fidelity, Vanguard, Robinhood and SoFi: "doesn't offer a way for apps to place trades for you", with Alpaca as the way in. |
| S13 | Revoked or expired: Reconnect | The 401 is said as Reconnect whether it happens at a read, at the re-check or at the write. The row is marked once and the token is wiped. No fill is ever claimed. |
| S14 | The $5.00 per-order cap | Said before any card. The adapter also refuses an order over the cap even when a caller skips the flow. Market orders are estimated 2% through the quote. |
| S15 | No order without approval | Nothing is sent before the yes, on a no, on a late yes, or on a new request. One yes places one order. |
| S16 | Cross-person isolation end to end | Two people connect, and each order lands only in that person's account, with that person's token. A leaked read opens nothing. |
| S17 | The callback never completes a connection by itself | The callback only stages the connection, and the person who started Connect confirms it from their own signed-in app. If someone starts Connect and sends the Alpaca approval link to someone else, the other person's approval connects nothing: their app confirms as them, is refused, and the staged token is wiped. |

## The three worst failures with real money or trust, and what guards each

1. **One person's order in another person's account.** Possible causes: a forged or replayed state linking someone else's account; someone else's approval completing a Connect the attacker started; a leaked read; a token that opens someone else's account. Guards: S04, S06, S08, S16, S17, RAIL-2 S17 to S19, and the DB CROSS-USER checks.
2. **Real money moved that the person didn't approve, or more than allowed.** Possible causes: an order without a fresh yes, or an order over the cap. Guards: S14, S15, and RAIL-2 S07 and S11.
3. **A false story.** Possible causes: "connected" when it isn't live; "try later" when the link was revoked; a fill claimed after a refusal; a secret leaked into a URL or a log. Guards: S07, S09, S10, S11, S13.

## Adversarial cases logged (all in the `[ADV]` test)

| Input | Expected | Why |
| --- | --- | --- |
| A callback with a code and no state | `state_invalid`, nothing is exchanged | CSRF |
| A state re-signed for another provider with a guessed key | `state_invalid` | Forgery |
| `?user_id=<someone else>` added to a valid callback | Linked to the state's person only | The query string is never trusted |
| A paper row in the database | Never opened; the person is asked to connect | Live only |
| "sell all my VOO" in a live account | One card, one approval, nothing sent before it | No auto-execution |
| Start with no signed-in person | Refused | Auth |

## Results

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | The broker adapter interface | getOrderStatus reads the order by its id | `S01` in tests/depth-BROKER-CONNECT.test.cjs | getOrderStatus is wired to the client-id lookup | proven |
| S02 | Connect sends the person to the broker's page, and only that | no secret in the approval URL | `S02` in tests/depth-BROKER-CONNECT.test.cjs | the client secret is put in the authorize URL | proven (also fails S10) |
| S03 | The OAuth round trip, server side | the exchange is form-encoded | `S03` in tests/depth-BROKER-CONNECT.test.cjs | the code is exchanged as JSON, which Alpaca's token endpoint does not accept | proven (also fails S05, S06, S07, S08, S13, S14, S15, S16, S17) |
| S04 | A tampered state is rejected | another person's id under the old signature is refused | `S04` in tests/depth-BROKER-CONNECT.test.cjs | the state's signature is not checked | proven |
| S05 | An expired state is rejected | a state 10 minutes old connects nothing | `S05` in tests/depth-BROKER-CONNECT.test.cjs | the state's expiry is not checked | proven |
| S06 | A state is used once | a replayed callback is refused | `S06` in tests/depth-BROKER-CONNECT.test.cjs | the nonce's single use is not enforced | proven |
| S07 | Live only, no paper fallback | a token that opens no live account connects nothing | `S07` in tests/depth-BROKER-CONNECT.test.cjs | a refused live account read falls through to a generic failure | proven |
| S08 | One account, one login | an account someone else holds is refused and said | `S08` in tests/depth-BROKER-CONNECT.test.cjs | the conflict is reported as a save failure | proven |
| S09 | Honest when Connect can't run | no client secret means not switched on | `S09` in tests/depth-BROKER-CONNECT.test.cjs | a missing client secret is not noticed | proven |
| S10 | No secret in any log, redirect or message | the code never reaches a log line | `S10` in tests/depth-BROKER-CONNECT.test.cjs | the callback logs its query string | proven |
| S11 | No brokerage: the honest connect prompt | an order with nothing connected gets the prompt | `S11` in tests/depth-BROKER-CONNECT.test.cjs | the connect prompt is skipped and a generic block is said | proven |
| S12 | No public API, said plainly | Robinhood and Fidelity are said plainly | `S12` in tests/depth-BROKER-CONNECT.test.cjs | brokers with no public API are not recognized | proven |
| S13 | Revoked or expired: Reconnect | a refused token says Reconnect | `S13` in tests/depth-BROKER-CONNECT.test.cjs | a refused token is reported as a broker outage | proven |
| S14 | The $5.00 per-order cap | the adapter refuses an order over the cap | `S14` in tests/depth-BROKER-CONNECT.test.cjs | the adapter sends without checking the cap | proven |
| S15 | No order without approval | nothing is sent before the yes | `S15` in tests/depth-BROKER-CONNECT.test.cjs | a T3 order is treated as not needing a confirmation | proven (also fails S13, S14) |
| S16 | Cross-person isolation end to end | a leaked read opens nothing | `S16` in tests/depth-BROKER-CONNECT.test.cjs | rows are not checked against the caller | proven |
| S17 | The callback never completes a connection by itself | someone else's approval connects nothing | `S17` in tests/depth-BROKER-CONNECT.test.cjs | the callback confirms the staged connection itself, for whoever started it | proven (also fails S03, S08, S16) |
<!-- results:end -->
