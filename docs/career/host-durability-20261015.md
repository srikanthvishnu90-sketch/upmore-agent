# Career host durability contribution, 2026-10-15

Base: `005aae50cc2d3495c80cc4bb661114f059e66cec`, the Muse bundle repair.
Separate contribution only. No shared branch, generated bundle, router/domain
module, browser helper, production data or deployed function was changed.
Muse keeps integration and deployment ownership.

The baseline staged handler returned success after state-load, state-save and
assistant-write failures, duplicated message pairs on a repeated request key,
and accepted changed content under that key. All five reproductions failed
before the fix. The independent alert review also reproduced the missing chat
KV bridge, lost sink delivery after ledger marking, and parallel duplicate
sends. These are storage/execution findings, not a conversational quality score.

The contribution preserves Muse's `v:1/stores` snapshot shape and chain. It adds:

- Authenticated-owner load/commit RPCs with atomic snapshot, message pair and
  reply receipt writes. A successful HTTP response requires a valid committed
  receipt. State errors and missing RPCs return 503; revision/key/privacy
  conflicts return 409. Rate limiting and existing thread ownership checks stay.
- Optional `turn_key` and returned `turn_key`. Exact retries require both the
  same **owned thread ID** and stable key. Changed content with that key conflicts.
  Legacy callers without a key receive a generated key; a lost first response
  before receiving that key/thread cannot provide client retry deduplication.
  Replayed replies still consume the existing request rate limit.
- Owner-scoped snapshot metadata and account controls: exact STOP/UNSUBSCRIBE,
  `stop everything`, `pause all career work`, `resume career work`,
  `forget/delete my career profile`, and explicit first-person preferred-location
  corrections. These controls precede broad domain routing. Resume restarts no
  cancelled or uncertain action. Corrections preserve facts and do not silently
  rewrite watch locations or application approvals.
- Account version and privacy epoch fences. Erasure clears active career state
  in all owned threads, watches, queued payloads and old receipt reply text.
  Old chat/audit text remains explicitly outside active context; this is not an
  account deletion or a promise to erase every historical record. Old key hashes
  remain tombstones. Another tenant is untouched; stale turns/cycles cannot
  restore erased context through these RPCs.
- A real bridge from chat watch updates to `career:watch-profile:<user>`. Fresh
  owned threads and the scheduler read the canonical record. Unambiguous legacy
  owned-thread watch profiles can be recovered; divergent profiles return a
  conflict instead of selecting one. General profile facts remain per-thread;
  only explicit account corrections/controls and watches are shared here.
- One atomic scheduler checkpoint for snapshots, seat history, queue drain and
  outbox transfer. Claimed reminders have a stable lease. Acknowledgement creates
  exactly one owned product-inbox row plus the compatibility ledger. Retries
  read back committed acknowledgements. Expired claims become uncertain; inbox
  reconciliation reuses the same lease, never sends an external effect.
- Eligibility checks at enqueue/claim/ack prevent reminders after interest
  removal or opt-out. Receipts preserve posting deadlines and fact-cited fit
  lines and gain a database-computed payload SHA-256. Chat reads only its owner's
  unseen inbox records and marks them seen in the same turn transaction. A saved
  inbox row is not proof the user read it; exact turn replays can display that
  same historical reply.

Arbitrary delivery sinks, email and other external channels fail `NOT_WIRED`.
File/memory stores remain proof-only KV adapters and fail closed for delivery.
Use one `createSupabaseStore` instance per scheduler cycle; its initial account
version is a consistency fence, not a session to reuse after another writer.
A failed or stale cycle must reload into a new instance; it does not advance
persisted board state. An optional JSONL log is diagnostic, not delivery proof.

## Verification

A fresh isolated local PostgreSQL database accepted the proposed migration in
one transaction. The fixture includes the source flow-state object/size/secret
constraints. The service RPCs ran under `SET ROLE service_role`; anon and
`authenticated` table/RPC access was rejected. All new RPCs use SECURITY INVOKER.
This is a minimal local schema, not a replay of every production migration.

`node --experimental-vm-modules --test tests/career-bundle-reachability.test.cjs tests/career-durability.test.cjs tests/career-alerts-host-wiring.test.cjs tests/career-persistence-postgres.test.cjs`

Observed: **57 tests passed, 0 failed, 0 skipped** with explicit local database
settings. This comprises the existing 6 staged-entry + 14 alert-host assertions,
7 handler failure/retry assertions, and 30 real PostgreSQL/HTTP contracts.
Existing assertion bodies were preserved; synthetic service fixtures were
adapted for the new RPC protocol. The real database suite additionally runs the
actual staged HTTP handler and ESM-only bundle with injected synthetic identity
and rate-limit services, but real PostgreSQL persistence.

Logs and source hashes: `docs/testing/runs/career-host-durability-20261015/`.
The five original red reproductions remain in that evidence. Failed development
iterations are retained in the private checkpoint, not represented as passes.

For the opt-in database suite install/resolve the normal `pg` package in the
local test environment, provision non-login test roles `service_role`, `anon`,
`authenticated`, create a **fresh local `career_test_*` database**, and apply
`tests/fixtures/career-persistence-schema.sql` followed by the proposed migration
in one transaction. Set `CAREER_TEST_PORT` and `CAREER_TEST_DATABASE`; the suite
connects only to 127.0.0.1 with explicit test credentials and never discovers
production credentials. It truncates only that explicitly named test database.
Without these variables, the real-database suite is explicitly skipped.

## Remaining gates

The proposed `20261015020000_career_watch_kv.sql` migration was **not applied to
production**. It extends an existing unapplied proposal; if integration discovers
that the original proposal has since been applied, the owner must put this
extension in a new forward migration rather than edit applied history. Integrate
and apply the owner-reviewed migration before deploying this handler; otherwise
it deliberately returns unavailable. Provisioning/scheduling a worker remains
owner work. Runtime capabilities stay `NOT_WIRED` until independently verified.

Production JWT/RLS transport, complete migration-history replay, real board
polling, live scheduler execution, actual user-visible delivery, browser/DOM,
employer submissions, email, paid/model calls and the actual-model 50-point
conversation evaluation are **NOT_RUN**. No Browserbase or sandbox bypass was
used. General conversation/router findings (interview, comparison, networking,
negation and guidance quality) are outside this contribution and remain open
for the implementation owner. Old private 50-case expectations were not recovered
or reconstructed. No launch or quality score is assigned.
