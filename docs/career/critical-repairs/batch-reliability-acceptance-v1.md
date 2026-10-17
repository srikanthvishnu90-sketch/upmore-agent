# Controlled batch reliability acceptance plan

The owner wants a batch of 1,000 applications to impose very little failure
handling burden on the user. This is a reliability target, not permission for
live or duplicate submissions, additional spend or invented success receipts.
Semantic verifier/context work remains the implementation priority.

Before scaling, prove one complete task through the actual owned entry,
durable task state, admitted execution, authoritative outcome and independent
readback. Fixture setup alone is not an end-to-end outcome. Then expand to
15 distinct controlled flows, 100 tasks and 1,000 tasks. Current restrictions
permit local controlled simulations only; genuine browser outcomes require the
normal sandboxed owned runtime, and live submissions remain unauthorized.

The completion plan must cover these acceptance requirements:

- Persist each task's immutable identity, payload/context dependencies, phase,
  attempts and checkpoint. Restart/reload must recover exact saved work.
- Use bounded queues and concurrency, explicit provider rate limits and bounded
  backoff. A retry needs a safe lifecycle transition and cannot duplicate an effect.
- Bind submission to a stable idempotency key and payload digest. A timeout or
  lost receipt is unknown until authoritative reconciliation; never resubmit
  merely because the local response was lost.
- Preserve per-task receipts and report verified submission, blocked, failed,
  unknown and pending states separately. Batch totals must reconcile to task
  records and cannot count queued/accepted HTTP requests as submitted jobs.
- Propagate user corrections and withdrawals to pending dependent tasks. Retain
  unrelated tasks, fence already-started work, and revalidate before dispatch.
- Admit all work against existing shared cost/usage limits before dispatch,
  including separate checking legs. Scaling creates no fresh allowance.
- Inject provider refusals, limits, partial outages, lost replies, process
  crashes, interrupted checkpoints, simultaneous workers and context changes.
  Measure recovery, duplicate prevention, unknown counts, latency and user
  intervention burden. Retain every failed run and exact-source denominator.

No 100% reliability claim is permitted. A controlled 1,000-task run proves only
its recorded environments, failure injections and outcomes. It does not prove
1,000 genuine live applications, real-provider quality or universal reliability.
