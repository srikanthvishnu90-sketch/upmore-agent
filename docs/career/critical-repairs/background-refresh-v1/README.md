# Actual background writes and interview context refresh

Independent review of `346a48ce` found that the clock witness counted chat
receipts only. The real alert host also advances the same account counter:
`createSupabaseStore.set` calls `career_watch_write`, and `beginCycle.commit`
calls `career_watch_cycle_commit`, which calls that writer once per staged key.
These are legitimate owner writes and do not create chat turns. The resulting
clock mismatch blocked status, fact correction and resume saves indefinitely.

Ten controls were frozen at `850ab292`; `cfe8d854` only expanded first-case
diagnostic capture so all three blocked command responses were retained before
asserting. Both baseline runs pass 2/10 and fail 8/10. Two actual adapter cycles,
each with two writes, advance the counter from 1 to 5 while chat receipts stay
at one. The captured actual staged-entry status, correction and resume responses
are all 409. All failed runs and original expected outcomes are retained.

The proposal replaces `career_watch_write` with its existing body plus one
atomic insert into owned KV. The original migration and alert-host source are
unchanged; a byte comparison confirms all original writer validation, allowlist,
owner lock, CAS, pause/epoch fences and value/account writes are preserved.
The added `career:owner-mutation:<epoch>:<version>` record contains only its
typed writer kind, owner, epoch, resulting version and SHA-256 of the storage
key. It contains no watch value, fact or source content. It is not a chat receipt.
Every multiwrite cycle records each increment in its existing transaction; a
later error rolls back values, counters and witnesses together. Client roles
cannot call the writer or write the journal namespace through its allowlist.

Refresh now requires the version delta to match the combined durable host-turn
and typed watch-mutation delta. Journal records must match their owner, epoch,
kind and version key. The normalized cursor anchors that aggregate to its
projection clock. Old turn-only cursors can consume newly recorded mutations;
no historical witness is fabricated. Bare counter edits remain blocked even
after later legitimate host/background writes. Missing pre-install mutation
history remains unavailable: this proposal must be installed before accepting
watch writes with interview contexts. Strict context equality, current source
fingerprints, fact values/versions/provenance/stamps and privacy epoch remain.
The semantic account fingerprint also includes the owned watch profile, so a
profile change stales account-scoped evidence until explicit reconfirmation.
Board/queue/history bookkeeping can refresh independent interview evidence.
Existing erasure removes the KV journal; old epoch fences cannot write again.

The repaired scoped run passes 10/10. It covers multiwrite cycles through the
actual alerts-store adapter; read/correction/resume through the actual staged
entry; ordinary host writes after background writes; concurrent background and
context updates with explicit retry; two competing background fences; a stale
refresh CAS; unwitnessed counter changes; foreign ownership and client-role
denial; pause and erasure; full cycle rollback; and semantic profile invalidation.
Each run uses positively identified, network-none PostgreSQL 16.15 fixtures and
reports their removal. The full source/DDL identities are in the retained logs
and `source-manifest.json`. These are zero-cost integration regressions and do
not establish actual model quality or a browser outcome.
The unchanged original entry controls pass 10/10 and original cross-thread
refresh controls pass 9/9 with this proposal, for 29 scoped native checks.

```sh
node scripts/career/critical-repairs/ci-node.cjs --postgres-only --sql-file=career-critical-repairs/interview-background-refresh-postgres.test.cjs
```

Current [Supabase function guidance](https://supabase.com/docs/guides/database/functions)
and [changelog](https://supabase.com/changelog) were checked. The markdown fetch
paths failed (unsupported content type/403); their HTML pages were available.
The proposal uses security invoker and backend-only grants, and changes no
Supabase product API or dependency. Native execution is the verification source.

No paid call, deployment, production SQL application, allowance change or shared
release merge occurred. The evaluator's separate $1 allocation is untouched.
Muse owns final integration and deployment. Modules 127/130/155 and B-owned
source remain untouched. Existing archived-original and supported-browser
blockers are unchanged; no new browser outcome is claimed.
