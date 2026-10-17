# Live conversation evaluation: prepared, not admitted

Superseding authorization: [the $7-total preflight](SEVEN-TOTAL-LIVE-ADMISSION-20261017.md)
holds all old $5, limits the new evaluation to $1 and leaves $1 unused. That
conservative allocation supersedes this packet's earlier $5-only/$0.25 budget
proposal. Exact old charges need not be reconstructed first if old workers are
proved fenced within the held $5. Scenario wording/oracle hashes are unchanged.

No provider call, budget reservation, account-credit query or credential
inspection was performed. The original shared **$5** remains the only allowance;
this preparation does not create a new allowance.

## Spend reconciliation

| Item | Verified result |
| --- | --- |
| Original campaign cap | 5,000,000 microUSD ($5), matching the historical shared-budget source and owner instruction |
| Original campaign total actually spent | **UNKNOWN**: authoritative ledger and matching receipts unavailable |
| Outstanding reservations/unknown liabilities | **UNKNOWN**: current all-worker reservation snapshot unavailable |
| Remaining spendable amount | **UNKNOWN**; no positive remainder is assumed |
| Historical first conversation | **Reported** $0.000502 (502 microUSD); not a campaign total or receipt-verified balance |
| Real provider requests in this preparation | **0** |
| Previous B8 local cost | 48 **synthetic** microUSD, excluded from the real campaign |

The remote audit branch still points to
`357f9fba11e2b428925fa7a224b1ebc7d01e85c9`. Its `paid-campaign.md` documents
four workers sharing the original ledger, pilots and paid graders, and possible
continuation from 3,500 to 10,000 scenarios. It reports only the first
conversation's cost. The historical audit tree has no versioned paid ledger,
receipt export, launch result or completed-turn export from that paid campaign.
Its older benchmark results are not billing records.

The exact shared ledger pathname from the historical budget implementation,
`/workspace/.upmore-tools/audit-budget/budget.json`, is absent. So is the
`/workspace/upmore-audit/paid-full-3500/` output tree and its documented launch,
report and conversation-receipt files. Read-only filename searches found no
replacement authoritative campaign export among the available workspace/test
records. Synthetic SQL fixtures and source-only budget proposals cannot fill
that gap. No credential file or environment-variable presence was consulted.

The historical `AuditBudget.status()` is deliberately **not invoked**: its
lock/missing-file path can create a fresh zero-spend ledger. Its source was read
without importing or executing it. No ledger path was initialized or reset.

[Reconciliation evidence and source hashes](evidence/B9-live-preparation/budget-reconciliation.json)
record the actual checks and missing paths. The minimum missing evidence is:

1. A non-secret, as-of snapshot of the **same original shared ledger**, covering
   every worker, pilot, judge, retry and continuation run.
2. Matching usage/settlement receipts and current in-flight/unknown worst-case
   holds, de-duplicated by actual provider request/leg/reservation identity.
3. Parent confirmation of the reconciled spent, held and remaining amounts,
   and a permitted incremental run ceiling within that remainder.

Reconcile settled unique charges and unresolved worst-case liabilities against
the original $5. Do not count the monthly and cash entries for one physical
request twice. Expiry or timeout alone does not release uncertain cost. Missing
receipts or uncovered workers keep admission closed. Account credit balance is
neither requested nor inferred from configuration.

## Prepared evaluator artifact

The complete packet is outside Git, at
`/workspace/scratch/upmore-evaluator-private/live12-20261017/`, with an evaluator
ZIP at `/workspace/scratch/upmore-evaluator-private/live12-evaluator-private.zip`.
It contains twelve demanding conversations, each with eight planned natural
user turns, concrete task/artifact criteria and a separate actual-transcript
record. **Actual transcripts are empty and NOT_RUN; no assistant reply has been
invented.** Every future user/assistant/tool message, handler input/output,
artifact proof and non-secret cost receipt must be retained in full.

The cases cover actual deliverable completion, correction propagation,
account-versus-thread memory, distinct-owner isolation, replacement resumes,
repeated interruption, target changes during retry, current artifact reopen,
source provenance, technical reasoning/transfer, truthful draft revision,
withdrawal and a long interrupted handoff. Success requires actual saved,
authorized, freshly reopened UTF-8 artifacts with byte/hash proof; a prose
promise or invented download link is insufficient.

Only coverage labels and hashes are published in the
[builder-facing manifest](evidence/B9-live-preparation/prepared-manifest.json).
Exact wordings, synthetic values and task-specific oracles are withheld from A's
builder context where practical. The author is the B reviewer who also built
earlier B code, so this is **not pristine independent gold**. The parent/evaluator
should judge the complete conversations and artifacts, without a paid model
judge or an answer-key-based keyword score. Do not forward the private packet
to A before source freeze/evaluation.

The private packet/protocol and each case are hashed. The
[artifact fingerprint](evidence/B9-live-preparation/private-artifact-hash.json)
lets the evaluator verify the delivered ZIP without publishing its contents.
No A-owned source or frozen B runtime changed.

## Bounded execution protocol after confirmation

Candidate source is A's current `346a48ce43be554bf79d04e765c9a5974439523c`.
The packet is natural-language evaluation of the actual handler, not direct
provider prompting or the B standalone reducer. At that source,
`body.career_journey` selects the typed paired interview branch; ordinary
message-only traffic goes through `CareerHost`/`careerModelReply`. Do not secretly
convert expected outcomes into typed commands to make the natural-language
test pass. Record the actual selected route and its available capabilities.
Unsupported delivery or memory must remain a concrete failed/blocked task,
rather than being relabeled complete.

The plan is bounded to 12 episodes, 96 user turns, at most 96 generation and
96 checker dispatches, zero automatic paid retries and zero paid judge calls.
The **proposed** incremental cash ceiling is $0.25; the **authorized ceiling is
null** until the parent confirms it against the recovered remainder. This
proposal does not imply available funds or authorize even one call.

All paying paths must use the same restored authoritative reservation store.
Before dispatch, reserve complete worst-case input/output/reasoning/checker cost
under the approved model/price/configuration identity. Refuse any reservation
that exceeds either the confirmed run ceiling or the original campaign's
verified remainder. Stop the entire run at unknown/invalid usage and retain the
full obligation; do not redispatch for a better score. Do not initialize a new
zero ledger, grant each worker another $5, or substitute a model silently.

Once admitted, run only the first complete conversation initially. Reconcile
its actual receipts and inspect its full transcript/artifact before releasing
the remaining eleven. Clarifications may use only the packet's supplied facts
and the fixed turn budget; record any departure from the planned sequence.
Real pending/unknown events may be observed, but never fabricate a live timeout
or trusted recovery receipt to satisfy a scenario.

Outcomes are completed tasks with evidence, executed-but-failed tasks, and
blocked/unrun tasks with exact reasons. No live result is claimed here. The
current actionable blocker is the missing original spend/hold/receipt bundle
and parent budget confirmation, not a request for credentials or a new allowance.
