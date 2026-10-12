# SUB-CASE: a subscription cancellation case, from the card to the proof (packet added for G4)

`packages/domain/41-agent-subscription-case.js` (`AgentSubscriptionCase`) is the evidence ledger behind "cancel it":
it prepares the exact terms the person approves (plan, fee, what they lose and when, the refund policy, the purchase
channel, the review deadline) from fresh, server-owned provider records; takes one explicit approval from the signed-in
owner for exactly those terms, and drops it if the merchant's terms change; calls the cancellation done only on the
merchant's own effective record after it accepted; counts a saving only when a billing date passes with complete
coverage of the person's account and no charge, net of the fee and what is still owed; reopens the case on a charge
after cancellation; and keeps refunds as cash received, capped at the charge, never as savings. Execution stays
`disabled_no_adapter`: nothing here cancels anything. Today it is exercised by its tests (`tests/subscription-case.test.cjs`,
recorded by `scripts/capture-checks.py`); no edge function or app path imports it yet (the live cancel flow is
`68-agent-cancel.js`, BILL-003), so this packet proves the module's own guarantees, not a reachable path.
Check: `node --test tests/depth-SUB-CASE.test.cjs && node evals/depth/run.cjs SUB-CASE`.

No bug was found building this packet.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Server-owned evidence only | a client upload makes no card | `S01` in tests/depth-SUB-CASE.test.cjs | the authority of the record is not checked, so a client upload is taken as the provider's | proven |
| S01 | Fresh evidence only | a 3-day-old snapshot makes no card | `S01` in tests/depth-SUB-CASE.test.cjs | a week counts as fresh | proven |
| S02 | Anchored billing dates | Jan 31 renews Feb 29 | `S02` in tests/depth-SUB-CASE.test.cjs | the day is not clamped to the month's last day, so Jan 31 rolls into March | proven |
| S03 | Every term on the card | no card without what the person loses | `S03` in tests/depth-SUB-CASE.test.cjs | what the person loses and when is not required | proven |
| S04 | The review window | a card on the last review day | `S04` in tests/depth-SUB-CASE.test.cjs | the last review day itself is counted as passed | proven (also fails S01, S02, S03, S05, S06, S07, S08, S09, S10, S11, S12, S13, S14, S15) |
| S05 | A short-lived card | the card lasts 15 minutes | `S05` in tests/depth-SUB-CASE.test.cjs | the card lasts 150 minutes | proven |
| S05 | An expired yes does nothing | an approval past its time is refused | `S05` in tests/depth-SUB-CASE.test.cjs | the approval's own expiry is not checked | proven |
| S06 | The owner's own yes | a model's approval is not a yes | `S06` in tests/depth-SUB-CASE.test.cjs | who approved is not checked, so a model's approval cancels | proven |
| S07 | A block is not a cancel | the contract stays active under a block | `S07` in tests/depth-SUB-CASE.test.cjs | an active card block is recorded as the contract ending | proven |
| S08 | Changed terms void the yes | a fee changed after the yes is refused | `S08` in tests/depth-SUB-CASE.test.cjs | only that a fresh card can be made is checked, not that its terms match | proven |
| S09 | A request is not a cancellation | the contract stays active after the request | `S09` in tests/depth-SUB-CASE.test.cjs | a request is recorded as cancelled | proven |
| S10 | Effective only after accepted | an effective record before acceptance is refused | `S10` in tests/depth-SUB-CASE.test.cjs | the accepted step is skipped | proven |
| S11 | Accepted on the agreed terms | a later end date is refused | `S11` in tests/depth-SUB-CASE.test.cjs | the end date is not compared | proven |
| S12 | Complete coverage | partial coverage avoids nothing | `S12` in tests/depth-SUB-CASE.test.cjs | coverage is not checked | proven |
| S13 | Net of what is owed | $15.00 less $1.00 and $2.00 is $12.00 | `S13` in tests/depth-SUB-CASE.test.cjs | what is still owed is left out of the costs | proven (also fails S14) |
| S14 | A charge reopens the case | a charged window avoids nothing | `S14` in tests/depth-SUB-CASE.test.cjs | every window counts the renewal as avoided | proven (also fails S15) |
| S15 | Refunds capped at the charge | a cent more than the charge is refused | `S15` in tests/depth-SUB-CASE.test.cjs | refunds are not capped | proven |
| S15 | Only posted refunds | a pending refund is not cash | `S15` in tests/depth-SUB-CASE.test.cjs | a pending refund counts as received | proven |
<!-- results:end -->
