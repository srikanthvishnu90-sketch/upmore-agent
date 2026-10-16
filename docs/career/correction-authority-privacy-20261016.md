# Correction authority privacy repair — 2026-10-16

Review branch: `codex/correction-authority-privacy-20261016`, based only on
`release/career-v223` at `f67db048599db308f2691a7be7feada841143da5`.
Muse retains integration, merge and deploy ownership. The separate composition
review branch was last verified remotely at `2d29c27bee16d3d943840ef87e9e7e95ad25d307`;
this repair does not include or change it. Remote branch/PR searches found no
published module 130 privacy repair before implementation or verification.

## Defect and authority change

Module 130 put corrections in a process-global Map before the host's atomic
commit. Its keys were email, name, profile ID or the first fact ID, none of which
establish authenticated ownership. Even when the database rolled back every
write, the next owner's recall could import the failed correction and then save
it into that owner's otherwise correctly scoped rows. Database ownership tests
alone cannot detect this path.

The Map, key selection, writes and automatic replay are removed. Corrections
still update the supplied profile's facts, fact version, audit, resume precedence
and dependent state. The existing owner-scoped atomic profile JSON and request
receipt remain the only persistence authority. No persistence adapter, handler,
SQL migration or new infrastructure is introduced by this repair.

Legacy `applyPersistedCorrections`, `exportCorrectionStore`,
`restoreCorrectionStore` and `_resetCorrectionStore` remain callable but are
inert: false, [], 0 and undefined respectively. Unowned legacy snapshots cannot
be restored, exported, or applied. A stale source import is no longer silently
rewritten by process memory. Callers must reload the saved profile JSON.

Two existing regression setups and the C03/SH03 gauntlet setup now round-trip
that saved JSON instead of discarding it and relying on global replay. Their
assertions are preserved. These remain explicitly labeled simulations; the new
SQL suite proves real persistence and fresh-handler loading independently.

## Reproduction and results

All new fixtures are synthetic, constructed in
`tests/helpers/correction-privacy-fixture.cjs`. No applicant fixtures are used by
the new privacy suites. Tests execute the exact staging script's output through
`index.ts -> handler-career.ts -> router_core.career.js` in an ESM-only VM. One
handler/module realm serves both authenticated synthetic owners, without cache
resets between them. Only authentication/rate-limit transport and the external
Supabase client are injected; all external fetches fail. The SQL suite routes
actual persistence calls to disposable PostgreSQL 17 on 127.0.0.1.

Evidence: `docs/testing/runs/correction-authority-privacy-20261016/`.

| Check | Release baseline | Repair |
| --- | --- | --- |
| Synthetic staged isolation + inert legacy APIs | 1/10 pass; 9 fail | 10/10 pass |
| Real SQL correction privacy, final 7 cases | 1/7 pass; 6 fail | 7/7 pass |
| Existing PostgreSQL persistence contracts | — | 30/30 pass |
| Related domain/host/bundle regressions (11 files) | 89/91 pass | 89/91 pass; same two failures |
| Both generated bundles + changed gauntlet syntax | — | pass |

The failed staged baseline records A's correction returning HTTP 503, no A
messages/state committed, then B replying **2028** instead of its stored **2031**.
The same failure occurs with default IDs, shared names and email keys, after
both failed and successful A commits. Real SQL faults at the user-message,
assistant-message and snapshot write boundaries roll back A's state, messages,
account metadata and receipt, but B still receives A's correction on baseline.

The final real SQL tests additionally prove:

- A failed correction cannot change B or A's next recall.
- A committed correction retains facts, audit and fact version across a fresh
  handler/module realm. Exact-key replay returns the identical response with
  only one message pair and no repeated correction.
- Foreign thread access returns 404; shared profile names remain isolated.
- A correction losing a real revision race returns 409 and leaves no replayable
  correction in process memory.
- A 503 can retry the same request key and commit exactly once.
- Erasure removes active profile state, rejects old correction receipts with
  `privacy_epoch_changed`, and rejects a pre-erase snapshot commit. After resume
  and a new source import reusing the default ID, the same account recalls its
  new **2035** value; the baseline incorrectly revives **2028**. B remains **2031**.

The 91-test regression sweep has two baseline failures outside this repair:
`R2 C37 spot-check (integrated)` and `R2A guard: C37's exact wording still belongs
to 141`. Both expect the old doorstep stop routing, while the release routes the
turn through 142. They are retained unchanged and are not called passing.
The intermediate `regressions.log` records the additional SH03 restart failure
before its setup was corrected; `regressions-after.log` records the final sweep.

## Exact commands

No-database privacy checks:

```sh
node --experimental-vm-modules --test tests/correction-authority-privacy.test.cjs
python3 scripts/build-router-core.py --check
python3 scripts/build-router-core.py --career-only --check
node --check scripts/career/gauntlet/run-rerun.cjs
node --check scripts/career/gauntlet/run-deepdive.cjs
```

Provision only a fresh disposable LOCAL database (never an existing or remote
project). The image used here was `postgres:17-alpine` with digest
`sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.
Docker's trust authentication is confined to the localhost test port. No real
credentials are read or passed.

```sh
docker run --detach --rm --name upmore-privacy-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:55439:5432 postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
docker exec upmore-privacy-pg pg_isready -U postgres
# Continue once the disposable server reports ready.
docker exec upmore-privacy-pg psql -U postgres -v ON_ERROR_STOP=1 -c 'create role service_role; create role anon; create role authenticated'
docker exec upmore-privacy-pg createdb -U postgres career_test_privacy
docker exec -i upmore-privacy-pg psql -U postgres -d career_test_privacy -v ON_ERROR_STOP=1 -f - < tests/fixtures/career-persistence-schema.sql
docker exec -i upmore-privacy-pg psql -U postgres -d career_test_privacy -v ON_ERROR_STOP=1 -f - < supabase/migrations/20261015020000_career_watch_kv.sql
npm install --cache /tmp/upmore-npm-cache --prefix /tmp/upmore-privacy-test --no-audit --no-fund pg@8.16.3
NODE_PATH=/tmp/upmore-privacy-test/node_modules CAREER_TEST_PORT=55439 CAREER_TEST_DATABASE=career_test_privacy node --experimental-vm-modules --test --test-concurrency=1 tests/correction-authority-postgres.test.cjs tests/career-persistence-postgres.test.cjs
docker stop upmore-privacy-pg
```

The two SQL suites must run sequentially because they truncate the same isolated
test database. With no explicit local test database, SQL suites report SKIP.
To repeat the failed baseline, create a detached worktree at `f67db048`, copy
only the two new correction test files and their synthetic fixture helper into
its `tests/` tree, and run the same commands there. Do not copy the repaired
module or generated bundles. `staged-baseline.json` and `staged-after.json`
record every staged file's SHA-256; only the generated bundle changes.

## Limits and release handoff

This is prevention at the process authority boundary. It does not audit or
rewrite previously persisted profile data. Same-user persistence means reloading
that user's committed profile JSON, not replaying edits onto an arbitrary stale
source or another thread's snapshot. The existing SQL owner/version/erase fences
remain unchanged and are exercised by both SQL suites.

No production migration, deployment, shared-branch update, paid model call,
credential transfer, employer send, browser task or security bypass was done.
Node executes the staged TypeScript through its experimental type stripping;
Deno is unavailable in this executor, so Deno runtime checks are not claimed.
Actual-model quality and the 15 live browser tasks are outside this repair.
The two inherited stop-routing failures and broader integration/launch gates
remain with Muse; the narrow privacy regression suites pass.

## Executor recovery verification

The recovered executor is responsive. Before any source edit, remote inspection
found this repair already published at `382b6e37bd03c0d0dd11b03cbc3fe32ad5157052`.
The repair was reused; no competing implementation or branch was created.
The unrelated clean interview worktree and all other local work were preserved.

Fresh verification at that exact commit reproduced the release baseline first,
using byte-identical synthetic privacy suites in both worktrees. Results:
staged baseline 1/10 versus repair 10/10; SQL privacy baseline 1/7 versus
repair 7/7; existing SQL contracts 30/30; related regressions 89/91 with the same
two inherited C37 failures. Both generated bundles and source whitespace checks
pass. Raw historical TAP logs contain whitespace from assertion formatting;
they are retained verbatim rather than rewritten to satisfy whitespace lint.

Fresh logs, commands, exit codes, counts and SHA-256 hashes are in
`docs/testing/runs/correction-authority-recovery-20261016/results.json`.
SQL used a newly created disposable PostgreSQL 17 container bound only to
`127.0.0.1:55439`, with a new `career_test_recovery` database. No production
schema or data was accessed. This recovery adds evidence only; source and tests
remain unchanged from the published repair.

Immediately before publication, the remote shared release remained `f67db048`;
the separate composition review had independently advanced to `c978b75e`.
Neither ref was updated by this task. Muse retains merge and deployment ownership.
