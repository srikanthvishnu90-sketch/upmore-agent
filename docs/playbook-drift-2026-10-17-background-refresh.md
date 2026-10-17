# Background mutation witness correction

`346a48ce` described a durable-turn clock witness, but the legitimate alert-store
writer increments the same account version without producing a chat receipt.
The frozen real-adapter/native-SQL/actual-entry baseline passes only 2/10;
status, correction and resume save all return 409 after two multiwrite cycles.
This is an implementation integration failure, not an oracle error.

The unapplied context-refresh proposal now adds a distinct typed, value-free
owner mutation witness atomically inside the original watch writer. It counts
those witnesses alongside genuine host receipts while preserving the original
writer fences and strict unexplained-counter rejection. The original migration
and alert-host source are unchanged. Semantic watch-profile changes invalidate
account-scoped evidence rather than merely retagging its clock. The repaired
scoped controls pass 10/10; complete baseline and repaired records are retained
in `docs/career/critical-repairs/background-refresh-v1/`. No paid run or deployment
is claimed, and no pre-install mutation history is invented.
