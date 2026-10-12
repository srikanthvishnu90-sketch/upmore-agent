# WORKFLOWS: paying a bill, decided by code (packet added for G4)

`packages/domain/36-agent-workflows.js` (`AgentWorkflows`) turns what a person or a biller says about a bill into a
checked obligation and plans its payment. `normalize` keeps exact cents, real calendar dates, a real three-letter
currency and a plain https handoff link, and defaults everything else to the cautious value. `plan` stops, in order, on
a stopped agent (or an unread stop setting), money owed to the person, an unconfirmed or disputed bill, a missing amount
or due date, a bill read more than 48 hours ago or with a sync error, a payment already applied (any revision) or in
flight, autopay on or unknown, no verified idempotent reconciling connection for this biller, currency and kind, no
exact account and invoice, no owned payment-enabled funding account in the bill's currency, funds not read in the last
15 minutes or short of the protected buffer once the fee and the other bills are counted, and an unknown fee, other
bills or buffer. Only then is there a proposal; it lapses in 15 minutes, and `validateConsent` accepts a yes only for
that exact proposal before it lapses. `outcome` settles the bill only on a provider event that matches the payment,
invoice, currency and amount and covers what is due. `supabase/functions/_shared/workflow_service.ts` calls
`normalize` and `plan`; the module is in the router bundle (`scripts/build-router-core.py`) and the financial core
(`scripts/build-financial-core.py`). No payment rail is live: no adapter is verified, so every real plan today stops at
`unsupported_execution` and the biller's own page.
Check: `node --test tests/depth-WORKFLOWS.test.cjs && node evals/depth/run.cjs WORKFLOWS`.

Bugs this packet pins, each written as a failing test first (logged in `docs/playbook-drift-2026-10-12.md`):
- S04 (found here): the currency was cut to three letters before it was checked, so a bill in "USDC" or "USDT" (dollar
  stablecoins; crypto stays off) was a valid USD bill, and "dollars" became the code "DOL". The currency is now checked
  as written: those are `invalid_currency`; "usd" is still USD. D04 plants the cut back.
- S11 (found here): a $0 balance read two weeks ago answered "No amount is currently due." before the freshness check
  ran, so a new statement that arrived since was never asked about. The freshness check now comes first; a current $0
  still says nothing is due. D12 plants the old order.
- S18 (found here): an overdrawn funding account (available -$50.00) was read as a missing balance: "Refresh available
  funds before approving this payment.", which no refresh can fix. A negative balance is now a real balance and the
  plan says "This payment would leave less than your protected cash buffer."; an unknown balance (null, a sync error)
  is still refreshed. D19 plants the old check.

Test harness note: a bare vm context has no `URL`, so `safeUrl` refused every link under test (the catch returned null)
and no test could see a link pass. The packet runs with the runtime's `URL`, as Deno does, and S03 proves both sides.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Typed amounts in exact cents | "$45.5" is 4550 | `S01` in tests/depth-WORKFLOWS.test.cjs | the cents digit is not padded, so "$45.5" is $45.05 | proven |
| S02 | Real calendar days only | 2026-02-29 is not a date | `S02` in tests/depth-WORKFLOWS.test.cjs | the round-trip check is dropped, so Feb 29, 2026 (read as Mar 1) passes | proven |
| S03 | The handoff link is plain https | an http biller link is refused | `S03` in tests/depth-WORKFLOWS.test.cjs | the https check is dropped | proven |
| S04 | A real currency, as written | USDC is invalid, never USD | `S04` in tests/depth-WORKFLOWS.test.cjs | the currency is cut to three letters before it is checked (the bug found building this packet) | proven |
| S05 | Whole non-negative cents | a $0.125 minimum is refused | `S05` in tests/depth-WORKFLOWS.test.cjs | any finite number counts as cents, so fractions pass | proven |
| S06 | A stopped agent proposes nothing | an unread stop setting blocks | `S06` in tests/depth-WORKFLOWS.test.cjs | only an explicit stop blocks, so an unread setting lets the plan through | proven |
| S07 | Money owed to you is never paid out | a receivable stops at review | `S07` in tests/depth-WORKFLOWS.test.cjs | the receivable check is dropped | proven |
| S08 | Unconfirmed bills are reviewed first | an asserted bill is not paid | `S08` in tests/depth-WORKFLOWS.test.cjs | an asserted (unconfirmed) bill counts as payable | proven |
| S09 | Missing details are asked by name | no due date is asked for | `S09` in tests/depth-WORKFLOWS.test.cjs | only a missing amount is checked, so a bill with no due date goes on | proven |
| S10 | A bill with a sync error is stale | a biller timeout means refresh | `S10` in tests/depth-WORKFLOWS.test.cjs | the sync error is ignored | proven |
| S10 | 48 hours, not more | 48 hours and a second is stale | `S10` in tests/depth-WORKFLOWS.test.cjs | the default age is 72 hours | proven |
| S11 | A stale $0 is not nothing due | a two-week-old $0 asks for a refresh | `S11` in tests/depth-WORKFLOWS.test.cjs | the $0 check comes before the freshness check (the bug found building this packet) | proven |
| S12 | An applied payment stops a second | revision 1's payment still blocks revision 2 | `S12` in tests/depth-WORKFLOWS.test.cjs | only a payment on the same revision counts | proven |
| S13 | An unknown result is in flight | an unknown attempt is waited on | `S13` in tests/depth-WORKFLOWS.test.cjs | "unknown" is left out of the in-flight states | proven |
| S14 | Unknown autopay is asked | no autopay setting asks | `S14` in tests/depth-WORKFLOWS.test.cjs | unknown autopay is treated as off | proven |
| S15 | Only an idempotent connection pays | a non-idempotent adapter is no route | `S15` in tests/depth-WORKFLOWS.test.cjs | the idempotency requirement is dropped | proven |
| S16 | Exact account and invoice | no invoice reference stops | `S16` in tests/depth-WORKFLOWS.test.cjs | either the account or the invoice is taken as enough | proven |
| S17 | The person's own account | an account they don't own is refused | `S17` in tests/depth-WORKFLOWS.test.cjs | ownership is not checked | proven |
| S18 | Overdrawn is short, not stale | -$50.00 is insufficient funds | `S18` in tests/depth-WORKFLOWS.test.cjs | a negative balance is read as missing (the bug found building this packet) | proven |
| S19 | The fee counts against the buffer | $846.61 is a cent short | `S19` in tests/depth-WORKFLOWS.test.cjs | the fee is left out of what remains | proven |
| S19 | Exactly the buffer is allowed | $846.62 leaves exactly $500.00 | `S19` in tests/depth-WORKFLOWS.test.cjs | leaving exactly the buffer is refused | proven |
| S20 | Unknown coverage is asked | an unconfirmed cash picture asks | `S20` in tests/depth-WORKFLOWS.test.cjs | only an explicit false counts as incomplete | proven |
| S21 | The proposal lapses in 15 minutes | expires 15:15:00 | `S21` in tests/depth-WORKFLOWS.test.cjs | the proposal lives an hour | proven (also fails S22) |
| S22 | A yes before the lapse only | a yes at 15:15:00 is refused | `S22` in tests/depth-WORKFLOWS.test.cjs | the lapse is not checked | proven |
| S23 | Settled only in full | $20.00 of $45.12 is not settled | `S23` in tests/depth-WORKFLOWS.test.cjs | any applied payment settles the bill | proven |
| S24 | Only the matching invoice's event | an event for September's invoice changes nothing | `S24` in tests/depth-WORKFLOWS.test.cjs | the invoice reference is not compared | proven |
<!-- results:end -->
