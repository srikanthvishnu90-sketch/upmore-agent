# Isolated SQL guard mutations

`scripts/run-sql-boundary-mutations.py` is prepared for owner-approved local PostgreSQL execution. Source inspection and Python parsing are not mutation proof. Results exist only after the runner executes successfully.

Run with the local PostgreSQL permissions required by the repository's disposable database harness:

```sh
python3 scripts/run-sql-boundary-mutations.py --run --pgbin /opt/homebrew/opt/postgresql@17/bin
```

Repeat `--case` to select specific guards, for example `--case proposal-hash --case approval-expiry`. The PostgreSQL directory is explicit and validated. Do not replace tool escalation with a workaround when the sandbox rejects shared-memory or local database startup.

The runner creates a named `codex/sql-boundary-mutations-*` branch and no-checkout worktree under `/private/tmp`. It copies only `.sql`, `.py` and `.sh` from migrations and synthetic database tests. It copies no `.env`, connected-account data, application runtime or provider credentials. Database subprocesses receive an environment allowlist and explicit local PostgreSQL binary path. The harness explicitly uses a freshly initialized disposable database and local Unix socket, never a Supabase endpoint.

Each run stores HEAD, current source digest, operating system, PostgreSQL client version, exact commands/dates, copied-file hashes and logs in `docs/testing/sql-mutation-runs/<run>/results.json`. It does not modify the combined `docs/testing/mutations.json`; the root reviewer must reconcile results and avoid double-counting equivalent boundaries or repeated runs.

Seven candidate cases currently bind exact guards and existing test labels:

| Candidate | Guard weakened | Catching behavioral assertion |
| --- | --- | --- |
| Owner/account binding | Both Auth-owner lock filters in the approval RPC | Cannot approve another user's task |
| Proposal hash | Exact approved proposal hash check | Approval requires exact snapshot hash |
| Approval expiry | Proposal expiry check | Late approval cannot execute |
| Single use | Submitted/started attempt check before durable submission marker | Same approval cannot submit twice |
| Queued revocation | Stop-trigger cancellation of pending workflow proposals | Stop cancels pending workflow proposals |
| Client approval | Both task UPDATE privilege and owner UPDATE RLS barrier | Clients cannot bypass approval RPC |
| Premature completion equivalent | Apply creditor completion on bank settlement | Bank settlement alone does not mark bill paid |

The last case is explicitly an equivalent downstream boundary. It cannot prove that an upstream API's accepted response is never mapped to settled funds. Stop-trigger mutation also preserves the independent point-of-submit stop check; its precise proof is pending proposal revocation rather than demonstrated real-world execution after revocation.

A passing full disposable suite establishes the initial copied-source baseline. Each guard is weakened only in that copy, then the same full suite runs. A `t.must_fail` case qualifies only when the named forbidden operation succeeds and the assertion reports that it should have failed. A `t.ok` case qualifies only when its exact named outcome assertion fails. Syntax, type, permissions/setup problems, missing modules, wrong-error failures and unrelated assertions do not count.

The original copied file bytes are restored in `finally`, and the full suite must pass again. Later cases refer to the already executed clean baseline/restoration evidence honestly; those references are not additional newly run checks. All copied and original files must still match the initial manifest at the end. The worktree is retained for review; the standard harness cleans up only its temporary PostgreSQL database. A nonzero runner result needs investigation and cannot be reported as a killed guard.

No production migrations, live execution, provider verification or launch readiness follow from these tests.

## Executed October 10 evidence

`sql-mutation-runs/20261010T192228-549f30/results.json` records an actual isolated run at HEAD `b63731c4fa239fb195d015984bd2fa4e9b8f116d`, with a copied-source manifest for the then-current fifteen-migration local fixture. The baseline and each restored full suite passed. Six direct guards produced the exact expected behavioral assertion failures; the downstream completion case produced its explicitly equivalent failure. All original and copied files matched their starting bytes afterward. This is historical proof for that manifest; later hotfixes need their own affected checks.

`scripts/index-mutation-evidence.py` combines the preserved run records, checks log hashes and restoration evidence, and keeps all twenty requested boundaries. Current unique direct coverage is nine; eleven requested mutations remain unproved. Repeated runs and adjacent scopes do not inflate that unique direct count.
