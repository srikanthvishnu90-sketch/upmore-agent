# Depth protocol: CORE-005, autonomy envelopes

Owner: Claude. Status words: planned, built, proven (its test fails under the planted break and passes without it).

Why second: an envelope is the only place the agent moves money without a per-action yes. Every other safeguard assumes a human said yes to this exact action; here the human said yes once, in advance, within limits. If the limits, the expiry, the revocation or the audit slip, the agent is spending on its own.

Scope: T4 capabilities only (the registry decides the tier): autosave sweeps, own-account transfers, allowances, overdraft-prevention moves, shared-goal contributions. Sends to people (T3) and first-time recipients (T5) are never inside an envelope. The loop enforces the limits against the exact values it writes; the control plane owns the grant, the usage, the revocation, the surprise rule and the audit; the trust ladder (doc 11) decides when an envelope may even be offered.

Files: `packages/domain/58-agent-control.js` (envelopes: grant after the ladder's offer, tier refusal, usage, revoke by text, surprise, report), `packages/domain/43-agent-loop.js` (gate against written params, receipts that name the envelope), `tests/depth-CORE-005.test.cjs`, `evals/depth/CORE-005.mutations.cjs`.

Check: `node --test tests/depth-CORE-005.test.cjs && node evals/depth/run.cjs CORE-005`

## The 15 sub-capabilities (enumerated before implementation)

| # | Sub-capability | What the user sees |
| --- | --- | --- |
| S01 | A grant needs the user's own words and every limit, and is restated | "you can move up to $50 to savings whenever, max $120 a week" becomes one restatement naming per-action limit, weekly cap, recipient, expiry, the receipt promise and how to stop; a grant without words or without an amount is refused. |
| S02 | Offered only after the trust ladder earns it | Three clean confirmations of the same capability and shape earn the offer ("I can just do this under $50 from now on, with a receipt each time. Want that?"); a correction or surprise resets the count; a grant before the offer is refused. |
| S03 | Inside the envelope: no question, a receipt after the fact | A $40 sweep under a $50 envelope runs with no confirmation; the receipt says it was done without asking under the envelope and how to stop it. |
| S04 | The per-action limit is checked against what is written | $50.01 against a $50 envelope asks; a caller's summary that says $1 while the params say $90 asks; the limit is a ceiling, never a rounding. |
| S05 | The weekly cap cuts what remains | After $100 of a $120 week, a $40 sweep asks and a $20 one runs; the receipt names what is left this week. |
| S06 | A recipient-bound envelope asks for anyone else | An envelope "to savings" asks when the same amount goes to checking. |
| S07 | A first-time recipient is never inside an envelope | Even under a matching envelope, a recipient with no history is confirmed in full. |
| S08 | Expiry: an expired envelope asks, and the grant stated its date | Day 91 of a 90-day grant asks; the restatement carried "until <date>"; a renewal is a new grant in the user's words. |
| S09 | Revoke by text, immediately | "stop", "revoke", "end the envelope" end it before the next action; "revoke all" ends every envelope; the reply names what ended. |
| S10 | Paused means no envelope | While the kill switch is on, every envelope reads as absent and the action asks (or is blocked for T2+); resume restores them unchanged. |
| S11 | An envelope never lowers a tier | Granting one for a T3 or T5 capability is refused with the reason; a T5 action asks even when an envelope names its capability. |
| S12 | Standing instructions do not widen an envelope | An instruction that fires inside the envelope's limits runs; one that fires outside them confirms. |
| S13 | Every envelope action is in the audit | "what did you do on your own this week" lists each action with date, amount and reference under its envelope, and the remaining weekly room. |
| S14 | A surprise suspends the envelope | When the user questions an envelope action after the fact, the envelope is suspended and the ladder resets; the next action of that shape asks, and the envelope resumes only in the user's words. |
| S15 | The thread always knows an envelope is acting | The grant is restated in the thread when made; each envelope receipt says no question was asked because of it and how to stop; "what can you do on your own" lists the live envelopes with their limits. |

## The three worst failures with real money or trust, and what guards each

1. **Money moves the user did not intend.** A cent over the limit, a different recipient, a first-time recipient, a T3 send sliding under an envelope, a summary that lies about the amount. Guards: S04, S05, S06, S07, S11.
2. **An envelope outlives the user's intent.** It should have expired, been revoked, been paused, or been suspended after the user flinched. Guards: S08, S09, S10, S14.
3. **The user does not know the agent acted alone.** No receipt, no audit, no restatement of what was granted. Guards: S01, S03, S13, S15.

## Adversarial cases logged (all in the `[ADV]` test)

| Input | Expected | Why |
| --- | --- | --- |
| Grant text "ok do whatever" with no amount | refused: a positive per-action limit is required | Open-ended authority |
| Grant for PAY-001 (T3) "you can send Sarah $50 whenever" | refused: sends to people stay confirmed | Tier floor |
| Sweep request with summary amount_cents 100 and params amount_cents 9000 under a $50 envelope | asks (outside envelope) | Summary vs written values |
| Two sweeps of $70 in one week under a $120 cap | second asks | Weekly cap |
| "stop" then a sweep | asks | Revocation |
| Pause then a sweep | blocked | Kill switch |
| Day 91 sweep | asks | Expiry |
| Envelope to "savings", sweep to "checking" | asks | Recipient bound |
| User: "wait, why did you move $40?" | envelope suspended, next sweep asks | Surprise |
| Standing daily sweep of $200 under a $50 envelope | confirms every day, never runs alone | Instruction cannot widen |

## Results

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | A grant needs the user's words and every limit, restated | grant without words or amount is refused; restatement names every limit | `S01` in tests/depth-CORE-005.test.cjs | a grant without the user's words is accepted | proven |
| S02 | Offered only after the trust ladder earns it | three clean confirmations earn the offer; a correction resets; early grants refused | `S02` in tests/depth-CORE-005.test.cjs | the ladder's offer is not required for a grant | proven (also fails S08) |
| S03 | Inside the envelope: no question, a receipt that says so | the sweep runs unasked and the receipt names the envelope and how to stop | `S03` in tests/depth-CORE-005.test.cjs | the receipt no longer says the action ran under an envelope | proven (also fails S15) |
| S04 | The per-action limit is checked against what is written | one cent over asks; a lying summary asks | `S04` in tests/depth-CORE-005.test.cjs | the gate trusts the caller's summary amount over the params | proven |
| S05 | The weekly cap cuts what remains | after $100 of $120 a $40 sweep asks and $20 runs | `S05` in tests/depth-CORE-005.test.cjs | weekly usage no longer cuts the per-action limit | proven |
| S06 | A recipient-bound envelope asks for anyone else | same amount to checking asks | `S06` in tests/depth-CORE-005.test.cjs | the recipient check is removed from the gate | proven |
| S07 | A first-time recipient is never inside an envelope | first_time asks under a matching envelope | `S07` in tests/depth-CORE-005.test.cjs | the first-time check is removed from the gate | proven |
| S08 | Expiry: an expired envelope asks | day 91 asks; renewal is a new grant | `S08` in tests/depth-CORE-005.test.cjs | expiry is ignored both where envelopes are listed and where the gate picks one | proven |
| S09 | Revoke by text, immediately | stop ends it before the next action; revoke all ends every envelope | `S09` in tests/depth-CORE-005.test.cjs | "stop" replies as if it revoked but changes nothing | proven (also fails S15) |
| S10 | Paused means no envelope | while paused the action is blocked without asking | `S10` in tests/depth-CORE-005.test.cjs | the kill switch gate always allows | proven |
| S11 | An envelope never lowers a tier | grants for T3/T5 refused; T5 asks even with an envelope | `S11` in tests/depth-CORE-005.test.cjs | the tier floor on grants is removed | proven |
| S12 | Standing instructions do not widen an envelope | an instruction over the limit confirms; inside it runs | `S12` in tests/depth-CORE-005.test.cjs | a scheduled request skips the per-action limit | proven |
| S13 | Every envelope action is in the audit | the report lists date, amount, reference and what is left | `S13` in tests/depth-CORE-005.test.cjs | the audit lists no actions | proven |
| S14 | A surprise suspends the envelope | after a surprise the next action asks; resume needs words | `S14` in tests/depth-CORE-005.test.cjs | a surprise records itself but leaves the envelope active | proven |
| S15 | The thread always knows an envelope is acting | the grant restatement says how to stop; receipts say no question was asked; live envelopes are listable | `S15` in tests/depth-CORE-005.test.cjs | the restatement drops how to stop the envelope | proven |
<!-- results:end -->
