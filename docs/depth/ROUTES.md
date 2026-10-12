# ROUTES: one connector contract, a route per platform (owner, 2026-10-11; packet added for G4)

`packages/domain/77-brokerage-connectors.js` over the researched matrix `packages/connectors/platforms.json` (101 rows):
each platform has one route, in the owner's order of preference native API > SnapTrade > Plaid > guided manual connect >
none, chosen as the research's best (`contradictions`). A track-only route never trades; a platform the owner switched
off (prediction markets under the gambling guard, crypto under the crypto rule: `blocked_reason`) can do nothing and its
adapter is never called; a route without an adapter or a step answers NOT_WIRED; no route signs in with a password
(manual connect is a live session the person logs into); every order needs the person's yes on its own card and stays
under the $5 per-order cap, both checked before the adapter. Only a platform a person can actually connect gets the
connect card (the owner's reference design). Report: `docs/connector-matrix/README.md`.
Check: `node --test tests/depth-ROUTES.test.cjs && node evals/depth/run.cjs ROUTES`.

## Bug this packet found (test written red first; logged in docs/playbook-drift-2026-10-12.md)

- **S13** `find()` stripped punctuation from the person's words but not from the platform names, so a full name with
  parentheses or a slash never matched itself. "connect my ForecastEx (Interactive Brokers)" answered about Interactive
  Brokers ("needs Interactive Brokers's approval"), not that the prediction market is off; once IBKR is approved that
  would have handed over a connect path for an off platform. "eToro (crypto + stocks)" had the same gap. Names are now
  read the same way as the words; every one of the 101 rows is found by its own full name and aliases.

## Finding left as it is (design, reported)

- `adapterFor` wires a row through whatever adapter the host passes for its route and does not read the row's
  `adapter_state`, so a host that passed its Alpaca adapter as `native_api` would have it called for Schwab or IBKR rows
  that the matrix says are not built. `tests/brokerage-connectors.test.cjs` relies on that (a `not_built` row with an
  adapter places an order), and nothing calls `adapterFor` in production today (the live order path is
  `73-broker-accounts.js` / `66-agent-trade.js`). Refusing rows that are not live would change that contract, so it is
  reported instead.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Track-only routes never trade | a Plaid row that says trade is still track-only | `S01` in tests/depth-ROUTES.test.cjs | the row's trade flag is trusted over its route | proven (also fails S16) |
| S02 | Off rows can do nothing | every prediction market and crypto row is Off | `S02` in tests/depth-ROUTES.test.cjs | the off check reads a field the matrix never sets | proven (also fails S03, S11, S13) |
| S03 | Off today even on a live route | Robinhood event contracts are Off though Plaid is live | `S03` in tests/depth-ROUTES.test.cjs | today() skips the off check and follows the parent | proven (also fails S11, S13) |
| S04 | Unverified coverage is a try | SoFi through Plaid is a try, not connect | `S04` in tests/depth-ROUTES.test.cjs | unverified coverage is promised as connect | proven (also fails S05) |
| S05 | A shared account follows its parent | Ellevest is a try because Betterment is | `S05` in tests/depth-ROUTES.test.cjs | a shared row is judged on its own | proven |
| S06 | A fallback needs a live row | no live Plaid row means not built | `S06` in tests/depth-ROUTES.test.cjs | any row on the fallback route counts, live or not | proven |
| S07 | A fallback is read-only | a SnapTrade fallback fails validation | `S07` in tests/depth-ROUTES.test.cjs | a fallback that could trade passes | proven |
| S08 | Verified live needs a live adapter | verified_live with a built adapter fails | `S08` in tests/depth-ROUTES.test.cjs | a built adapter counts as live | proven |
| S09 | No password sign-in on any route | auth password on a manual route fails | `S09` in tests/depth-ROUTES.test.cjs | a stored password is accepted as a manual sign-in | proven |
| S10 | The route is the research's best | a Plaid row whose research names SnapTrade is a contradiction | `S10` in tests/depth-ROUTES.test.cjs | the route check runs only on shared rows | proven |
| S11 | An off platform is itself | ForecastEx is Off, not Interactive Brokers | `S11` in tests/depth-ROUTES.test.cjs | an off shared row connects through its parent | proven (also fails S13) |
| S12 | Whole words only | 'really' is not Ally | `S12` in tests/depth-ROUTES.test.cjs | a name matches inside another word | proven |
| S13 | Full names with punctuation | 'ForecastEx (Interactive Brokers)' is ForecastEx, Off | `S13` in tests/depth-ROUTES.test.cjs | names keep their punctuation while the words lose it (the bug this packet found) | proven |
| S14 | A missing step is NOT_WIRED | an adapter without connect answers NOT_WIRED | `S14` in tests/depth-ROUTES.test.cjs | only a missing adapter is NOT_WIRED; a missing step throws and reads as a failure | proven |
| S15 | Off platforms never reach an adapter | Kalshi, Coinbase and Robinhood Crypto never call it | `S15` in tests/depth-ROUTES.test.cjs | the adapter is built for an off row | proven |
| S16 | Track-only never orders | a Plaid row that claims trading still refuses | `S16` in tests/depth-ROUTES.test.cjs | the row's trade flag decides, not the route | proven |
| S17 | A yes on the order's own card | approved 'yes' or no card id is not an approval | `S17` in tests/depth-ROUTES.test.cjs | any truthy approval passes | proven |
| S18 | $5.00 in cents | 501 cents is over the cap | `S18` in tests/depth-ROUTES.test.cjs | the estimate is compared in dollars against a cap in cents | proven (also fails S19) |
| S19 | A bad host cap falls back to $5 | Infinity or '100000' is not a cap | `S19` in tests/depth-ROUTES.test.cjs | any positive value is taken as the cap | proven |
| S20 | The card only where it connects | Fidelity through Plaid gets no card | `S20` in tests/depth-ROUTES.test.cjs | every connect-now platform gets the card | proven |
<!-- results:end -->
