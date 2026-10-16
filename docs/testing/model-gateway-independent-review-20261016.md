# Independent career model gateway boundary review — 2026-10-16

Author contribution reviewed: `codex/career-model-gateway-20261016` at
`f3a9d183a6c45ced9a195e70ad66bbb634c40037`. Repair review branch:
`codex/model-gateway-boundary-review-20261016`. Final tested repair source:
`6d3c1b9f63d251763008f34a75c4526bcfa2baff`; final certification is in
`docs/testing/runs/model-gateway-independent-20261016-final/results.json`.
Muse retains merge, forward
migration, original-budget reconciliation and deploy ownership.

Executor: healthy shell, Node 24.19.0, disposable PostgreSQL 17 available through
Docker; native Deno unavailable. Original checkout and earlier privacy worktree
were preserved. No `.agents/skills` files were present. Supabase and Supabase
Postgres skills were used to review existing service RPCs and lock ordering.

## Confirmed findings and repairs

Independent expectations were frozen at `3d5b6932`; the new reproducers were
committed at `e27c6a11` before any runtime repair. Runtime/SQL bytes at those
commits were identical to the author's `f3a9d183`. New fixtures construct only
synthetic owners and records. Tests execute the actual staged career entry,
existing gateway and host commit path with a provider that never forwards HTTP.

| Finding | Reproduction on author source | Repair |
| --- | --- | --- |
| Unsupported personal/completion prose accepted as grounded coaching | Seven schema-valid outputs pass the word filters and return `career_model.status=generated`, including `Describe the candidate's doctorate from stanford.`, employment at `NASA`, `Review the already delivered application.`, a zero-width personal claim and a shell instruction | The model selects exact host-authored coaching strings. Arbitrary advice prose is rejected; current fact references remain exact, labelled user-reported/unverified quotes |
| Existing tickets bypass the global three-unknown stop | Reserve for owner B; owner A records three unknown outcomes; B consumes its old ticket successfully. A causal staged-entry test trips the stop between global reservation and monthly admission and observes one provider request | Recheck the global uncertainty stop at consume under the campaign lock, before dispatch; the refused reserved ticket can refund as `not_sent` |
| Crashed started calls evade uncertainty stop | Start three tickets and expire their receipt deadlines without settlement; new reservations and older held tickets can still start | Explicit unknown outcomes and overdue started tickets both count at admission and dispatch. Full bounds remain charged; expired reservations that never started are not misclassified as paid uncertainty |

The cap itself was not overbooked in the independent race: 12 concurrent requests
across two owners, with a 2,500-microdollar synthetic allowance and 1,700 opening
charges, grant exactly four 200-microdollar reservations. These findings concern
the promised uncertainty stop and output grounding, not evidence of a reproduced
original-cap overdraft. No actual model quality conclusion follows from injected
malicious responses or safe scripted replies.

Only two product files change: `career_model_reply.ts` and the unapplied
`supabase/sql/proposals/career_model_budget_v1.sql`. No handler, provider, shared
gateway, existing oracle, domain bundle or module 130 implementation is changed.
The proposed SQL adds a partial started-deadline index and stops after finding
three uncertain rows. Existing owner/account locks and the global campaign lock
remain in their prior order; no provider call holds a SQL transaction.

The closed advice catalog is deliberately conservative and reduces free-form
expression. Whether the existing model selects useful evidence and coaching
moves is still NOT_RUN. This is a boundary repair, not a human-quality result.

## Independently verified boundaries

- Actual static graph: `index-career.ts` (staged as `index.ts`) →
  `handler-career.ts` → `career_model_reply.ts` → existing `model_gateway.ts` /
  `model_calls.ts` → existing atomic career commit. Default-off tests use
  undefined, `false`, `TRUE`, `1` and whitespace-padded enablement values and
  observe zero campaign/provider calls. Only exact server `true` opts in.
- Current owner/thread context precedes admission. Colliding `profile-1` owners
  remain isolated in the same module realm; a foreign thread returns 404.
  Untrusted posting instructions remain separate from personal evidence. Actual
  location correction/withdrawal governs a fresh saved-context reload.
- Fact correction/recall, forgetting, STOP and approval turns make zero model
  calls. Model output receives no tools and creates no task, approval or profile
  write. Only the fixed host follow-up enum is persisted advisory state.
- Raw missing, fractional, negative, overcached and inconsistent receipts remain
  fully uncertain. The actual 10-second abort signal is exercised by an injected
  provider that waits for abort; stable-key retry never calls it twice.
- Real SQL tests cover concurrent different-owner allowance and same-key races,
  immutable ticket/settlement replay, owner mismatch, STOP/epoch rejection,
  expired started calls, and the pre-stop ticket case through the staged entry.
- Additional staged-entry tests use the unchanged **real** legacy monthly
  reserve/record functions rather than stubs. The synthetic 300 prompt / 80
  output / 20 cached receipt produces one monthly row, one usage row and a
  47-microdollar charge under the repository's configured rate table. Exact
  replay is free. A 900-slot month denies before provider dispatch and refunds
  the unsent global reservation. Invalid usage or a real monthly usage-insert
  failure retains the full global bound. A real chat rollback retains the
  monthly usage receipt and does not pay twice on same-key retry.
- Module 130 is byte-identical to privacy owner commit `382b6e37`:
  SHA-256 `665be50fcaa0addc091e26d8a541f5cf380b09ed2903b20d1b91d1c1d129a379`.
  The ten original privacy source tests pass without changing their oracles.

## Results and retained evidence

Evidence directory: `docs/testing/runs/model-gateway-independent-20261016/`.
`source-baseline.log` retains the seven output failures; the final frozen SQL
oracles are in `postgres-final-oracles-baseline.log`, with four failures including
`staged-stop-baseline.log`'s direct provider-call count of one instead of zero.
`baseline-local-database.sql.gz` is a synthetic disposable test database dump.
The author's original 32 gateway tests independently pass on the author runtime
(`author-source-baseline.log`) despite those new failures.

| Check | Author runtime baseline | Repair |
| --- | --- | --- |
| New independent source boundaries | 22/29 pass, 7 fail | 29/29 pass |
| New independent native SQL boundaries | 5/9 pass, 4 fail | 9/9 pass |
| New real monthly-RPC integration | not used as negative controls | 5/5 pass |
| Existing author gateway source / SQL contracts | source 32/32 independently rerun | 32/32 + 15/15 pass |
| Author's scoped regression command plus original privacy source tests | not rerun as a negative control | 260/260 pass |
| Separate inherited R2A/R3 gauntlet | historical author baseline 26/27 | 26/27; C37 remains red |
| TypeScript 5.9.3 shared adapter/import closure | — | pass |
| Both generated bundles | unchanged | freshness checks pass |
| Actual staged graph | author's recorded 14 files, 3,943,906 raw bytes | 14 files, 3,943,909 raw bytes; below unchanged 4,200,000 limit |

The scoped passing total is **350 tests** (61 source model contracts, 29 real
SQL model/monthly cases, and 260 existing regressions/privacy tests). The separate
27-test legacy run retains one failure, `R2A guard: C37's exact wording still
belongs to 141`, observing handler 142 instead of 141. It is not counted passing.
The author-reported 415/415 and 969 conversation checks are historical claims;
this review reports its own executed commands/counts and does not infer model
quality from them. Full frozen 165-turn conversation re-evaluation was not
repeated because the domain and conversation source are unchanged here.

## Reproduce without paid calls

```sh
node --experimental-vm-modules --test --test-concurrency=1 tests/model-gateway-independent.test.cjs tests/career-model-gateway.test.cjs
python3 scripts/build-router-core.py --check
python3 scripts/build-router-core.py --career-only --check
```

For SQL use only a new, disposable network-none local Docker fixture. The image
used here is `postgres:17-alpine` with digest
`sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.
Never point these truncating test suites at an existing or remote database.

```sh
docker run --detach --name upmore-career-integration-pg-boundary --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
docker exec upmore-career-integration-pg-boundary pg_isready -U postgres
# Continue when ready; this fixture contains no real credentials or allowance.
docker exec upmore-career-integration-pg-boundary psql -U postgres -v ON_ERROR_STOP=1 -c 'create role service_role nologin; create role anon nologin; create role authenticated nologin'
docker exec upmore-career-integration-pg-boundary createdb -U postgres career_test_gateway_review
```

Apply these files, in order, to that LOCAL `career_test_gateway_review` using
`docker exec -i upmore-career-integration-pg-boundary psql -X -qAt -U postgres -d career_test_gateway_review -v ON_ERROR_STOP=1 -f - < <file>`:

1. `tests/fixtures/career-persistence-schema.sql`
2. `supabase/migrations/20261015020000_career_watch_kv.sql`
3. `supabase/migrations/20261015234000_career_task_intents_v1.sql`
4. `supabase/sql/proposals/career_public_research_v1.sql`
5. `supabase/sql/proposals/career_model_budget_v1.sql`
6. `tests/fixtures/model-gateway-independent/monthly-schema.sql`
7. `supabase/migrations/20261010110000_model_call_budget.sql`

```sh
CAREER_TEST_CONTAINER=upmore-career-integration-pg-boundary CAREER_TEST_DATABASE=career_test_gateway_review node --experimental-vm-modules --test --test-concurrency=1 tests/model-budget-independent-postgres.test.cjs tests/model-monthly-independent-postgres.test.cjs tests/career-model-budget-postgres.test.cjs
```

Suites must run sequentially against that fixture. They seed only explicitly
synthetic funding in local test code. For the failing baseline, use frozen
reproducer commit `e27c6a11` (runtime identical to author `f3a9d183`) with a fresh
local database initialized from that commit and run the two independent source
and budget suites. The additional monthly tests do not supply negative controls.
No original oracle was modified. Final run metadata records file hashes, tested
source commit, commands, raw log hashes and limitations.

## Remaining gates

Original shared $5 remaining balance: **UNKNOWN / UNRECONCILED**. No real campaign
was created, reconciled or configured. Owner review must ensure every paying
worker/pilot/judge participates in the same original authority, including old
charges and uncertain calls; this contribution cannot infer those from local
fixtures. The configured pricing also requires owner/provider reconciliation
before real use; local arithmetic is not an invoice or live-price verification.

Actual provider/model quality and all 15 live browser outcomes remain **NOT_RUN**.
Native Deno, hosted JWT/RLS transport, production schema replay and existing
persisted-output audits were not verified. This review neither repairs historic
model prose already saved nor grants new model, task or browser authority. No
paid call, credential configuration/transfer, production migration, shared
release merge, deploy, external send, Browserbase or security bypass occurred.
The legacy C37 failure, real allowance reconciliation, actual model evaluation,
live browser tasks and Muse integration/forward-migration review remain release
gates. Overall release is **NOT_READY**.
