# REALWORLD: the real-world 206 engine (packet added for G4)

`packages/domain/65-agent-realworld.js` is the pure half of the real-world bar for all 206 items in
`packages/capabilities/realworld.json`: the connector path (a live adapter the person linked, or NOT_WIRED), the
completion proof per proof kind (done, not done, pending, unknown; a report is never evidence), the failure text, the
dollar statement with source and as-of, and the audit status `scripts/realworld-audit.cjs` publishes in
`docs/realworld/README.md`. Done counts only a live run read back from the real counterparty
(`docs/realworld/evidence/`); none exists, so Done is 0 of 206.
Check: `node --test tests/depth-REALWORLD.test.cjs && node evals/depth/run.cjs REALWORLD`.

Bugs this packet pins, each written as a failing test first (logged in `docs/playbook-drift-2026-10-12.md`):
- S04: a sandbox adapter (`adapters: { schwab: { state: "sandbox" } }`) wired the rail (`rail: "schwab"`); CLAUDE.md says
  a rail that is not live returns NOT_WIRED. Now only `live` wires, and the path says "adapter is sandbox, not live".
- S05: a catalog row counted as live when its adapter-state text contained the letters "live" anywhere, so "not live:
  awaiting the partner agreement" planned a live rail and the audit reported the item LIVE. Now the state must say live.
- S10, S13, S14: a read-back of nothing passed as done: a fill of 0 shares ("filled 0 at $512.10"), a $0 or reversed
  transfer ("$0.00 moved", "-$5.00 moved"), a $0 credit ("$0.00 posted") and a $0 payout ("$0.00 landed"). Any of them
  recorded as live evidence would have counted the item done. Now each needs an amount above zero.
- S11: an open order with no requested parameters ("wanted") was "resting with the requested parameters" without a
  single comparison. Now it is unknown until there is something to compare.

Fixed in merge review (was left for the owner): a `provider_state` read-back named its own `expected_state`, so a
read-back that expected "active" and read "active" passed a cancellation (C73). The module now holds the finished state
of each of the 24 provider-record items (`FINISHED_STATE`, from each item's done_when: C73 cancelled, C141 locked, C170
paid_off, ...); the read-back's expectation must be one of them, and an item with none on file is never done. S09 checks
it and that every provider-record item in realworld.json has an entry; D09b plants the old trust back.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Nothing linked says why | each connector says 'not linked by the user' | `S01` in tests/depth-REALWORLD.test.cjs | the reasons are checked in the wrong order, so an unlinked provider is said to have no adapter | proven |
| S02 | Linked is not wired | linked Schwab with no adapter is NOT_WIRED | `S02` in tests/depth-REALWORLD.test.cjs | linking a provider is taken as a working rail | proven (also fails S03, S04, S05) |
| S03 | Live and linked | a live adapter the person never linked is NOT_WIRED | `S03` in tests/depth-REALWORLD.test.cjs | a live adapter wires without the person's link | proven |
| S04 | A sandbox is not a rail | a sandbox adapter is NOT_WIRED | `S04` in tests/depth-REALWORLD.test.cjs | any adapter other than none wires (the bug found building this packet) | proven |
| S05 | Live means live | 'not live: awaiting the partner' is not LIVE | `S05` in tests/depth-REALWORLD.test.cjs | the word live anywhere in the adapter state counts (the bug found building this packet) | proven |
| S06 | A report is not evidence | 'cancelled' is said to be a report | `S06` in tests/depth-REALWORLD.test.cjs | cancelled is missing from the report words | proven |
| S07 | Every needed field | an order id with no status lacks status | `S07` in tests/depth-REALWORLD.test.cjs | only the first needed field is checked | proven |
| S08 | Numbers tie to the rows | $227.41 is not $227.40 | `S08` in tests/depth-REALWORLD.test.cjs | a dollar of rounding is let through | proven |
| S09 | No next charge | cancelled with a next charge scheduled is not done | `S09` in tests/depth-REALWORLD.test.cjs | the scheduled next charge is not checked | proven |
| S09 | The finished state is the item's | a read-back that expects active and reads active is not a cancellation | `S09` in tests/depth-REALWORLD.test.cjs | the read-back's own expected_state is trusted | proven |
| S10 | A fill of something | a fill of 0 shares is not done | `S10` in tests/depth-REALWORLD.test.cjs | any number is a quantity, zero included (the bug found building this packet) | proven |
| S11 | Compared to what was asked | an open order with nothing to compare is unknown | `S11` in tests/depth-REALWORLD.test.cjs | an open order with no requested parameters passes (the bug found building this packet) | proven |
| S12 | Staged is not delivered | a staged Venmo send is not done | `S12` in tests/depth-REALWORLD.test.cjs | only drafted counts as not delivered | proven (also fails S17) |
| S13 | Something moved | a $0 or reversed transfer is not done | `S13` in tests/depth-REALWORLD.test.cjs | a zero or negative amount passes when the balances agree with it (the bug found building this packet) | proven |
| S14 | A credit above zero | a $0 credit against $0 expected is not done | `S14` in tests/depth-REALWORLD.test.cjs | a $0 credit row counts as posted (the bug found building this packet) | proven |
| S14 | A payout above zero | a $0 payout is not done | `S14` in tests/depth-REALWORLD.test.cjs | a $0 payout row counts as landed (the bug found building this packet) | proven |
| S15 | Never the PIN | a PIN in the evidence fails the freeze | `S15` in tests/depth-REALWORLD.test.cjs | the PIN in the evidence is not checked | proven |
| S16 | Never invents a name | no brokerage known says 'that brokerage' | `S16` in tests/depth-REALWORLD.test.cjs | an unfilled placeholder is left in the text as <brokerage> | proven |
| S17 | In flight is not done | a queued order is said in flight | `S17` in tests/depth-REALWORLD.test.cjs | a pending result is said done | proven |
| S18 | Only a live run | a sandbox fill is not done | `S18` in tests/depth-REALWORLD.test.cjs | the provider mode is not checked, so a sandbox run counts | proven |
| S19 | Fifteen sub-capabilities | a 14 sub-capability packet does not prove the item | `S19` in tests/depth-REALWORLD.test.cjs | any packet size proves | proven |
| S20 | Sandbox is not LIVE | C73's local merchant is SANDBOX | `S20` in tests/depth-REALWORLD.test.cjs | a sandbox counterparty is reported LIVE | proven |
<!-- results:end -->
