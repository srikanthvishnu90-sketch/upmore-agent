# FINANCIAL-MODEL: bank facts as Upmore keeps them (packet added for G4)

`packages/domain/37-agent-financial-model.js` (`AgentFinancialModel`) is where bank data enters Upmore. `normalizeSimplefin`
turns the SimpleFIN proxy's response into accounts and transactions in exact signed cents (USD only; an account in
another currency keeps its raw text and is flagged), keeps the bank's own balance as-of time and never substitutes the
fetch time, keeps the bank's error list readable, and refuses the whole batch when it cannot trust it (a repeated account
or transaction id, a posted row without a real date, an unreadable dollar amount). `pendingLinks` joins a pending row to
its posted row only by the provider's own reference, on the same account. `inferObligations` reads three or more posted
debits from one merchant at a weekly, every-two-weeks, monthly or yearly rhythm, within $1.00 or 5%, as a possible bill:
always `asserted`, `confidence: inferred`, `user_confirmation_required: true`, never rolled forward once its date has
passed. `cashSummary` adds the available amount of fresh (24 hours), USD, checking/savings/cash accounts (the person's
own account type wins over the bank's), with only verified bills as a known amount due.
Check: `node --test tests/depth-FINANCIAL-MODEL.test.cjs && node evals/depth/run.cjs FINANCIAL-MODEL`.

Where it runs (read from the repo on 2026-10-12): in the financial core bundle (`scripts/build-financial-core.py` ->
`supabase/functions/{_shared,agent-chat,agent-workflows}/agent_core.js`), not in the router bundle or the app.
- `agent-chat`: the financial planner (`_shared/financial_planner.ts`, reached when `isPersonalFinancialRequest` holds)
  calls `get_cash_position` -> `financialContext` -> `cashSummary`, rendered by `_shared/financial_tools.ts` as "Linked
  USD cash available: $X, oldest included bank observation <time>. Recorded verified bill amounts: $Y ...". agent-chat
  is deployed by `scripts/launch/go-live.sh`.
- `agent-workflows`: "sync_finances" (`syncFinancialEvidence` -> `normalizeSimplefin`, then `inferObligations` over the
  stored history) and "financial_context", called by the app's "Review bank activity" screen (`src/financial-review.js`).
  `go-live.sh` does not deploy `agent-workflows`, so whether that path is live depends on a deploy the repo does not record.

Bugs this packet pins, each written as a failing test first (logged in `docs/playbook-drift-2026-10-12.md`):
- S10 (found here): the proxy asks the SimpleFIN Bridge for protocol version 2 (`simplefin-proxy/index.ts`,
  `version=2`), whose `errlist` entries are objects (`{code, msg}`), but each entry was stringified, so the bank's error
  ("con.auth: Reauthenticate with Mock Bank") was stored in `agent_financial_syncs.errors` and returned as
  "[object Object]". Objects now read "code: msg"; strings are unchanged; an object with neither is
  "provider_error_unreadable". D10 plants the old stringify. (The v2 object shape is from the SimpleFIN protocol as I know
  it; simplefin.org was not reachable from this session. Strings behave exactly as before either way.)
- S23 (found here): `cashSummary` dropped every bill in another currency without a count: with a verified CAD bill and a
  verified $84.32 USD bill, chat said "Recorded verified bill amounts: $84.32. 0 recorded bills need verification." and
  nothing about the CAD bill. It is still never added to dollars; it is now counted (`unsupported_currency_obligations`)
  and `financial_tools.ts` adds "1 recorded bill in another currency is not included in the dollar amounts." (only when
  there is one, so every other reply is word for word as before; `tests/edge/financial-tools.test.ts`). D23 plants the drop.

Noted, not changed (for the owner):
- Any entry in the batch's `errors` (including this module's own notes such as `unsupported_currency:<id>:EUR` or
  `balance_timestamp_unknown:<id>`) sets `sync_error` on every account in `agent_financial_ingest`
  (`20261010040000_financial_evidence.sql`), and `cashSummary` treats a `sync_error` account as stale. So one euro account,
  or one account the bank sends without a balance date, makes the person's whole cash position "amount unknown". It fails
  safe (no wrong number), but it hides cash that is known. Changing it means changing the migration or what counts as an
  error; neither is done here.
- A bill expected "today" in the person's evening is already "yesterday" in UTC: `persistFinancialEvidence` passes the
  UTC date as `today`, and `agent_obligation_expire_candidates` expires candidates due before that UTC date, so in US
  evenings a bank-pattern bill due that day is dropped (and an existing candidate expired). The pipeline is consistently
  UTC, so the fix belongs in the caller and the SQL together; S15 pins today's rule (due today counts, yesterday does not).
- A balance whose bank as-of is even one second after `fetched_at` is discarded (`future_balance_timestamp`), and
  `fetched_at` is taken before the proxy call starts, while the ingest SQL allows one minute of skew. Not seen in any
  fixture; worth a tolerance if a live bridge ever stamps balances during the request.
- An account whose currency is not a three-letter code (SimpleFIN allows a URL for custom currencies such as points)
  fails the whole batch (S06), because the table requires `^[A-Z]{3}$`. A missing `available-balance` (optional in
  SimpleFIN) leaves that account out of cash rather than falling back to the ledger balance (S24).
- A monthly charge shifted by a weekend and a holiday can be 33 days apart and is then not inferred (S16); a price change
  over $1.00 and 5% ends the pattern (S17). Both miss a bill rather than invent one.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Signed cents | -12.34 is -1234 cents | `S01` in tests/depth-FINANCIAL-MODEL.test.cjs | the minus sign is read and then dropped, so a $12.34 debit reads as money coming in | proven (also fails S03) |
| S02 | The bank's own as-of time | balance-date in epoch seconds is 17:00 UTC that day | `S02` in tests/depth-FINANCIAL-MODEL.test.cjs | epoch seconds are read as milliseconds, so every balance is dated January 1970 | proven (also fails S04) |
| S03 | Other currencies keep their raw amount | EUR 950.00 is not 95000 cents | `S03` in tests/depth-FINANCIAL-MODEL.test.cjs | the USD-only guard is dropped, so euros are counted as dollars | proven |
| S04 | A balance from after the fetch is not current | a balance stamped one second after the fetch has no as-of | `S04` in tests/depth-FINANCIAL-MODEL.test.cjs | the future-timestamp guard is dropped | proven |
| S04 | A balance stamped at the fetch is current | a balance stamped exactly at the fetch keeps its as-of | `S04` in tests/depth-FINANCIAL-MODEL.test.cjs | the guard is off by one: a balance stamped at the fetch second is called future | proven |
| S05 | No fetch time, nothing kept | a batch without fetched_at is refused | `S05` in tests/depth-FINANCIAL-MODEL.test.cjs | the fetch-time guard is dropped | proven |
| S06 | A repeated account stops the batch | the same account id twice is refused | `S06` in tests/depth-FINANCIAL-MODEL.test.cjs | account ids are not checked for repeats | proven |
| S07 | A repeated transaction stops the batch | one id with -$15.49 and -$1.00 is refused | `S07` in tests/depth-FINANCIAL-MODEL.test.cjs | transaction ids are not checked for repeats | proven |
| S08 | A posted row needs a date | a posted row with no date is refused | `S08` in tests/depth-FINANCIAL-MODEL.test.cjs | a posted row without a date is let through | proven |
| S09 | Unreadable dollars stop the batch | -12.345 is refused, not kept as unknown | `S09` in tests/depth-FINANCIAL-MODEL.test.cjs | an unreadable USD amount is kept as null | proven |
| S10 | The bank's errors stay readable | {code, msg} reads "con.auth: Reauthenticate with Mock Bank" | `S10` in tests/depth-FINANCIAL-MODEL.test.cjs | each error is stringified, so SimpleFIN 2 errors read "[object Object]" (the bug found building this packet) | proven |
| S11 | Bank text never makes a transfer | AUTOPAY and ZELLE rows are not transfers | `S11` in tests/depth-FINANCIAL-MODEL.test.cjs | transfer words in the bank text mark a transfer | proven |
| S12 | Pending links on the same account only | a pending row on savings does not link to a checking post | `S12` in tests/depth-FINANCIAL-MODEL.test.cjs | the account check is dropped from the link | proven |
| S13 | An inferred bill is asserted | the Netflix pattern is asserted, never verified | `S13` in tests/depth-FINANCIAL-MODEL.test.cjs | a bank pattern is stored as a verified bill | proven |
| S14 | Every two weeks, 13 to 15 days | gaps of 15 and 14 days are every two weeks | `S14` in tests/depth-FINANCIAL-MODEL.test.cjs | the two-week window ends before 15 days | proven |
| S15 | Due today still counts | a bill expected Oct 12 is kept on Oct 12 | `S15` in tests/depth-FINANCIAL-MODEL.test.cjs | a bill due today is treated as past | proven (also fails S14) |
| S16 | 32 days is still monthly | Jun 30, Aug 1, Sep 1 is monthly | `S16` in tests/depth-FINANCIAL-MODEL.test.cjs | the monthly window ends before 32 days | proven |
| S17 | $1.00 tolerance | $10.00, $11.00, $10.00 is one bill | `S17` in tests/depth-FINANCIAL-MODEL.test.cjs | the tolerance floor is 10 cents instead of $1.00 | proven |
| S18 | Transfers never make a bill | three monthly provider transfers are no bill | `S18` in tests/depth-FINANCIAL-MODEL.test.cjs | provider-labeled transfers are grouped as bills | proven |
| S19 | The person's account type wins | savings the person named counts; checking they called investment does not | `S19` in tests/depth-FINANCIAL-MODEL.test.cjs | the bank's kind is read before the person's | proven |
| S20 | Exactly 24 hours still counts | a balance 24h old is fresh, 24h + 1ms is stale | `S20` in tests/depth-FINANCIAL-MODEL.test.cjs | the freshness limit excludes exactly 24 hours | proven |
| S21 | Overdrawn subtracts | $1,100.25 and -$200.50 is $899.75 | `S21` in tests/depth-FINANCIAL-MODEL.test.cjs | an overdrawn balance is added as positive | proven |
| S22 | Only verified bills are known due | an asserted $15.49 guess is not in the $94.32 due | `S22` in tests/depth-FINANCIAL-MODEL.test.cjs | asserted bank guesses are added to the amount due | proven |
| S23 | Other-currency bills are counted | a CAD bill is counted as not included | `S23` in tests/depth-FINANCIAL-MODEL.test.cjs | bills in another currency are dropped without a count (the bug found building this packet) | proven |
| S24 | No cash account is unknown, not $0 | no usable account gives null | `S24` in tests/depth-FINANCIAL-MODEL.test.cjs | an empty sum is reported as $0.00 | proven (also fails S20) |
<!-- results:end -->
