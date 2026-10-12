# COMPLIANCE: the gate every act goes through (Instinct spec doc 14, packet added for G4)

`packages/domain/53-compliance.js` holds the regulated map (surface, requirement, partner state), the one gate the agent
loop (`43-agent-loop.js`), the connector store (`51-connectors.js`) and the trade flow (`66-agent-trade.js`) call before
every act, KYC before the first send through a partner rail, the versioned disclosures said once, the incident playbooks
and the claims audit. Every sub-capability here is a rule the owner set; each planted defect loosens one gate (or drops
an honest word the person relies on) and must be caught. Prediction markets and crypto are not decided here: they are
switched off per platform in the connector matrix (`blocked_reason`, ROUTES packet) and by the chat guards; the $5
per-order cap and the fresh approval live in `77-brokerage-connectors.js` (ROUTES packet) and the trade flow.
Check: `node --test tests/depth-COMPLIANCE.test.cjs && node evals/depth/run.cjs COMPLIANCE`.

## Bugs this packet found (each test written red first; logged in docs/playbook-drift-2026-10-12.md)

- **S08** With a live money-movement partner, a call that carried no KYC record (`kyc: null`, which every caller passes
  when none is loaded) was allowed: only a record that said something other than "verified" blocked. No KYC record now
  counts as `not_started`, and the person is told the partner checks identity first, in its hosted form, never stored by
  Upmore, and that nothing moves until then. No partner is live today, so nothing was ever sent this way.
- **S16** `resolveAll` reported a partner as "live" for any truthy flag (`live: "true"`, `1`) while the gate itself
  required `live === true`. The report now uses the same strict test, so it never claims live where the gate would block.

## Finding left as it is (a rule question, not changed)

- An information-only capability (SAVE-008, TAX-011, CRDT-004, BILL-005 ...) called without saying whether it executes
  is allowed as information (`!c.executes`), while every other capability treats an unspecified call as execution.
  `tests/compliance.test.cjs` asserts that behavior, and every caller passes an explicit boolean, so no path reaches it
  today. Making it fail closed would change that test's rule, so it is reported for the owner instead.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Mapped capabilities are regulated | ACH push is regulated and blocked; account read is not | `S01` in tests/depth-COMPLIANCE.test.cjs | the map is read by the wrong field, so everything is unregulated | proven (also fails S02, S03, S04, S05, S06, S07, S08, S10, S11, S12, S13) |
| S02 | Advice is never | no live partner record unblocks investment advice | `S02` in tests/depth-COMPLIANCE.test.cjs | advice gets an RIA partner key, so a live record unblocks it | proven |
| S03 | Unspecified is execution | {}, null, 0 and 'false' are not staging | `S03` in tests/depth-COMPLIANCE.test.cjs | any falsy executes counts as staging | proven (also fails S01, S08, S11) |
| S04 | Staging needs no partner | a staged send is allowed, the person acts | `S04` in tests/depth-COMPLIANCE.test.cjs | staging is refused like execution | proven |
| S05 | Only live === true | 'true', 1 and 'pending' do not unblock | `S05` in tests/depth-COMPLIANCE.test.cjs | any truthy live flag unblocks | proven |
| S06 | A partner unblocks its own requirement | a live broker-dealer does not unblock ACH | `S06` in tests/depth-COMPLIANCE.test.cjs | any live partner stands in for the missing one | proven |
| S07 | Verified before money moves | pending, review and needs_info block | `S07` in tests/depth-COMPLIANCE.test.cjs | only a rejected check blocks | proven (also fails S08, S10) |
| S08 | No KYC record fails closed | a live money partner and no KYC record blocks | `S08` in tests/depth-COMPLIANCE.test.cjs | a missing KYC record counts as verified (the bug this packet found) | proven |
| S09 | KYC moves on valid events only | needs_info cannot jump to verified | `S09` in tests/depth-COMPLIANCE.test.cjs | a cleared event skips the partner's check | proven |
| S10 | Identity details in the partner's form | needs_info says hosted form, never stored by Upmore | `S10` in tests/depth-COMPLIANCE.test.cjs | the details are asked for in chat | proven |
| S11 | The blocked send names the app | 'Zelle', not 'Zelle via bank partner' | `S11` in tests/depth-COMPLIANCE.test.cjs | the capability's full name is said | proven |
| S12 | Information-only still needs the partner to execute | binding insurance and filing taxes are blocked | `S12` in tests/depth-COMPLIANCE.test.cjs | an information-only capability is allowed even when it executes | proven |
| S13 | The person files credit disputes | credit repair says user_files | `S13` in tests/depth-COMPLIANCE.test.cjs | user_files is dropped | proven |
| S14 | Disclosures once per version | an older version is said again | `S14` in tests/depth-COMPLIANCE.test.cjs | any earlier disclosure silences a new version | proven |
| S15 | A playbook stops at a failed step | nothing after the failed step runs | `S15` in tests/depth-COMPLIANCE.test.cjs | the playbook runs on after a failure | proven |
| S16 | The report says live only when it is | live: 'true' is not_signed | `S16` in tests/depth-COMPLIANCE.test.cjs | any truthy flag is reported live (the bug this packet found) | proven |
| S17 | Unbuilt claims are findings | 'I can pay a bill' is a finding | `S17` in tests/depth-COMPLIANCE.test.cjs | a gated or claimed capability counts as backed | proven |
<!-- results:end -->
