# Bounded adversarial execution pass

Branch: `codex/spec-b-interview-depth-20261016`. Baseline:
`bdada1fa505fbdf81cbf110285baf453b9bd499c`. Twelve tasks were bounded before
the repair: eleven new builder-authored synthetic compositions through B's
public `planInterviewTurn` and one actual-entry task owned by A.

These are **structural executions with scripted provider/checker receipts**.
They measure whether each stated workflow goal finished, not coaching quality,
real accounting, production durability or independent user conversations.

## Outcome ledger

| Goal | Baseline | Repaired structural result |
| --- | --- | --- |
| Correct a pending project, reconcile uncertainty after restart and assess fresh text | completed | completed |
| Repeated pause, one resume, then valid practice | failed | completed |
| Stop before a typed invalidation arrives; preserve stop through settlement | failed | completed |
| Reconcile unknown/terminal receipts before typed invalidation; block content meanwhile | failed | completed |
| Change target before a guided retry; reject stale support without losing the answer | completed | completed |
| Replace resume during retry, restart, settle and retry against current source | completed | completed |
| Reject pre-correction artifact readback, rebuild and read current partial pack | completed | completed |
| Resume again after a question switch without rewinding selection | failed | completed |
| Six interrupted rounds, explicit retries and a current readable partial pack | failed | completed |
| Reject foreign accounting and ignore delayed old outcomes after a new admission | completed | completed |
| Replace target and resume during paused practice, then obtain current feedback | completed | completed |
| Complete one journey through A's actual entry, persistence and artifact delivery | blocked | blocked |

The final long scenario contains 63 reducer events and seven JSON restarts,
retains six original attempts, settles all outstanding references and verifies
the scripted partial-pack readback. The artifact scenarios use synthetic
in-memory host readback receipts; they do not prove actual file storage or A's
entry path.

## Confirmed repairs

Repeated pause used to push duplicate frames. One resume left old frames that
could later restore an unrelated question. Pause now creates a frame only when
active, a stopped journey remains stopped through subsequent pause controls,
and explicit resume consumes the latest frame while removing legacy duplicates.
Resume while already active preserves the current selection. Three new focused
control tests also cover legacy duplicate state and stop/pause precedence.

The stale-evidence guard used to swallow stop and authenticated accounting
events, returning `stale_context` before their handlers ran. Stale evidence now
detaches pending reasoning and invalidates artifact state first, while pause,
stop and trusted `reasoning_result` can still run. Content work, retries, resume
and artifact creation remain blocked until typed invalidation is applied.
Receipt scope, original request digests, current validation binding and paired
accounting references remain mandatory. A forged receipt cannot settle an action.
Epoch-change handling remains ahead of these exceptions.

The initial run included a stale scripted draft reference after the project
correction. B correctly rejected that fixture. Its original trace is retained
separately; it is not counted as a product defect. The corrected scenario driver
was frozen before runtime edits and is byte-identical in baseline/final runs.

One initial mutation escaped a scenario whose final state was protected by the
second fix. Its evidence remains retained. The final runner targets the focused
stop/pause assertion for that mutation and separately removes frame cleanup;
the final twenty mutations are all caught by assertions. Existing oracles and
B0/reserve input freezes remain unchanged.

## Verification and reproduction

The B suite passes **145/145** structural checks on Node 22 and 24. All
**20/20** intentional defects are caught. A's genuine versioned context
consumption probe remains **23/23**. Broader repository CI is not rerun; B4/B5/B6
evidence remains historical.

```sh
node scripts/career/interview-journey/adversarial-pass.cjs --output <new-directory> --producer-ref 315158f5314360417266270ec6e6e9e71aad0af8
node scripts/career/interview-journey/check-contracts.cjs
node scripts/career/interview-journey/negative-controls.cjs --output <new-directory>
```

The bounded runner exits 1 for failed goals, 2 when only the actual-entry task
remains blocked, and 0 only with no failures or blockers. Do not treat exit 2 as
an end-to-end pass. Each trace retains the expected outcome, initial snapshot,
every submitted event and effective snapshot, full reducer output, rejected
event errors and restart markers. `evidence/B7-adversarial/results.json` names
the exact tested source and all log/trace hashes; `traces-and-logs.tar.gz`
preserves initial, failed baseline and final runs in separate directories.

To repeat the baseline, create an isolated detached worktree at `bdada1fa` and
copy only the frozen scenario driver, its test and bounded runner into the
corresponding B paths. Run the bounded command there with the actual A
producer commit available in Git; do not copy the repaired reducer. The baseline
count is 6 completed structural goals, 5 failed goals and 1 blocked actual entry.

## A-owned actual-entry handoff

Latest inspected A producer: `315158f5314360417266270ec6e6e9e71aad0af8`.
Its `supabase/functions/agent-chat/handler-career.ts` has no B journey
registration. The bounded ledger records that exact path and SHA-256. The
context-only adapter cannot execute the requested actual-entry task. There is
no approval denial: the missing A-owned integration is the blocker.

Use the complete tested B tree identified in `results.json`, including the
three B5 recovery fixes, B6 zero versions and these control fixes. For one actual
entry-path journey, A should drive the operations from
`resume-change-during-retry.trace.json`, then append the pack delivery/readback
operations demonstrated in `artifact-after-context-change.trace.json`:

1. Seed an owned synthetic canonical target, resume and project; enter the
   interview through the actual career entry and save an exact project answer.
2. Supply a trusted, provider-disabled terminal failure; switch exercises and
   explicitly retry the original answer. Replace the resume while that retry
   is pending, pause and reopen through the entry's actual persisted state.
3. Supply unknown then terminal settlement for the original action. Preserve
   its shared accounting fence and require explicit resume/retry. Confirm the
   new request uses the current resume version and the original answer text.
4. Use A's test-only generation/checker adapters and trusted proof profile to
   obtain current feedback. Save a labeled partial pack, reopen its actual
   owned UTF-8 bytes through the delivery path in a fresh session and verify
   hashes, scope, epoch and current selections.

Return the exact A+B source ref, actual entry command, event/result trace,
paired-accounting records and artifact byte/readback evidence. An injected
provider-disabled execution must still be labeled structural; it cannot count
as model-quality evidence. A owns event/proof profiles, accounting, persistence,
CI discovery and registration. This branch modifies none of those A files.
Muse retains merge and deployment ownership. No paid call, external submission,
production migration, browser task or deployment occurred.
