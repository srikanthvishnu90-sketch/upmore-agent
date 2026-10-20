# WO-093: production is built from the measured commit (deploy provenance)

Status: built on `wo/093-deploy-provenance` (PR to `trunk`). Builder: Claude (architect). Depends on 062 (the deploy
packet) and 070 (the guard v245 lacked). No deploy, no live migration: the runs below are the owner's.

## Why (C6, proven)
Production is not built from the commit that was measured and worded. Each deploy re-staged at run time from whatever
checkout ran `scripts/launch/trainee-go-live.sh` (a detached checkout, by hand), so the bundle that shipped was not the
named commit's bundle, and nothing recorded which bytes went live. The evidence:

- **v245 ran the tailor leg without a guard its named commit contained.** The guard is `8410e9cb` (fix/v242-live-gaps,
  ported by WO-070): a post-commit throw in the resume-confirm tailor leg degrades to the Confirmed reply instead of a
  contained denial. The commit v245 was named for contains it; the live v245 ran without it, so what shipped was not
  that commit's bundle.
- **A packet's 8 migrations never landed**, and no run failed on it. One way that passes silently today: step 2 skips a
  migration the `upmore_migration_ledger` lists without reading its mark on the live schema, and nothing re-reads the
  marks before deploying.
- **Several functions run versions no record explains.** No report, log or ledger maps a live function version to a
  commit.
- **Stock deploy can't ship this repo**, so staging is by hand: `agent-chat` must be the career-only tree
  (`index-career.ts` staged as `agent-chat/index.ts`; the repo's own `agent-chat/index.ts` is the shelved finance entry),
  and `supabase db push` would skip `20261019020000_channel_delivery.sql` (version shared with `main`'s site capture).
  Hand staging is exactly where a checkout that is not the commit gets in.

## What changed
| File | Change |
|---|---|
| `scripts/launch/trainee-go-live.sh` | `--sha <40 hex>` is required for every run but `--only-smoke`. Preflight refuses a dirty tree (any change or untracked file), a missing/short `--sha`, `HEAD` ≠ `--sha`, and a stale router bundle (`python3 scripts/build-router-core.py --check` and `--career-only --check`, run in the staged commit). It stages **only** `git archive <sha> -- supabase scripts packages corpus` into a fresh `mktemp -d` and `cd`s there: migrations, deploys (agent-chat's `stage-career.cjs` included), schedules and the smoke never read the live checkout. It prints the provenance manifest and keeps a copy in `~/trainee-provenance/manifest-<sha>-<UTC>.json`. Step 2 reads **every** mark again after the applies and fails, naming each missing one (no silent skip); with `--skip-migrations` the same check runs before step 4 deploys anything. One `career_deploy_ledger` row per mark read true (step 2) and per function, right after its deploy (step 4), with the platform version from `supabase functions list`. `--verify <sha>` reads only (see below). `--label <who>` names the deployer (default `owner`). `--dry-run --sha` stages and checks for real and prints the manifest, touching nothing live. Everything it did before is kept (the six steps, masking, hidden prompts, rotation guards, the flags). Bash 3.2-safe (no associative arrays). |
| `scripts/launch/deploy-provenance.cjs` | The manifest, the tsv views go-live reads, the `supabase functions list` parser and the comparison `--verify` prints. A function's `bundle_sha256` is the sha256 of the sorted `"<file sha256>  <path>"` lines of its static import graph under `supabase/functions` (the same rule `stage-career.cjs` stages agent-chat by), plus `remote <spec>` for each npm:/jsr:/https: import; `entry_sha256` is the entry file's. They depend on the commit alone: the same sha gives the same hashes on any machine. |
| `supabase/migrations/20261022120000_career_deploy_ledger.sql` | `public.career_deploy_ledger`: `sha` (40 hex), `kind` (function / migration), `function_name` or `migration_file`, `bundle_sha256` (the bundle, or the migration file's sha256), `platform_version`, `manifest_sha256`, `deployed_at`, `deployed_by_label`. RLS on and **no policy**; all revoked from public, anon, authenticated and service_role, then `select, insert` to service_role only; append-only for everyone (update, delete and truncate raise). Idempotent. |
| `tests/db/run.sh`, `tests/db/career_deploy_ledger.test.sql` | The migration applied twice (as every recent one is); the test checks RLS with no policy, no anon/authenticated access, service role read + append only, each value's shape, append-only for the owner too, and the latest-row-per-function read `--verify` uses. |
| `tests/deploy-provenance.test.cjs` (new, in `scripts/gate.sh`) | 11 tests, real runs over stub `supabase`/`psql`/`deno` and the smoke (real `git`, `node`, `python3`): dirty tree refused; `--sha` missing, short or ≠ HEAD refused (dry runs too); either bundle check failing refused; manifest stable for a fixed sha and equal to the bytes `git show` gives, agent-chat's bundle = `stage-career.cjs`'s file list, one changed file changes only the bundles that import it; a mark missing live fails step 2 by name even when the ledger says applied, and `--skip-migrations` fails before deploying; a full run writes one ledger row per mark and one per function after its deploy, with the manifest hash and platform version; `--verify` passes on a matching ledger and lists each mismatch otherwise; every comparison mismatch named. Nothing reaches a network or a database. |
| `tests/trainee-go-live.test.cjs` | The one real-run harness (`stubbed`) passes `--sha HEAD` and uses the real `git`/`node` (but `git status` and the smoke stubbed), since a real run now stages the commit. Its assertions are unchanged. |
| `docs/launch/TRAINEE-GO-LIVE.md` | The commands, the provenance paragraph, the flags, steps 1, 2 and 4, and the rollback through `--sha`. |

## What `--verify <sha>` compares
It rebuilds the manifest of `<sha>` from `git archive` (the commit must be in the clone; HEAD need not be it), then:
- for each function, the **latest** ledger row: it must be `<sha>` with the manifest's `bundle_sha256`; no row means a
  deploy outside go-live (or none); a later row from another commit means production is no longer `<sha>`;
- with `SUPABASE_PROJECT_REF`, `supabase functions list`: a version other than the one the ledger recorded is a deploy
  no ledger row explains (unreadable output is a WARN, the ledger and marks are still compared);
- for each migration, its mark on the live schema must read true, and its latest ledger row must carry this commit's
  sha256 of the file.
One line per check; `VERIFIED` and exit 0, or `VERIFY FAILED: N mismatch(es)` with each `MISMATCH` line and exit 1.

## The owner's commands
Upmore is `mrwngntwmnaqrqhupvlt` (never the sporv or ring projects). `<SHA>` is the full 40-character trunk commit you
word, at or after this PR's merge.

Deploy:
```bash
git fetch origin
git checkout --detach <SHA>
git rev-parse HEAD            # must print <SHA>
git status --porcelain        # must print nothing
SUPABASE_PROJECT_REF=mrwngntwmnaqrqhupvlt bash scripts/launch/trainee-go-live.sh --sha <SHA> --dry-run
SUPABASE_PROJECT_REF=mrwngntwmnaqrqhupvlt bash scripts/launch/trainee-go-live.sh --sha <SHA> --label owner
```

Verify (right after, and any time later; it changes nothing):
```bash
SUPABASE_PROJECT_REF=mrwngntwmnaqrqhupvlt bash scripts/launch/trainee-go-live.sh --verify <SHA>
```

Both ask for `SUPABASE_DB_URL` on a hidden prompt when it is not in the environment. Before the first WO-093 deploy,
`--verify` reports every function as "no deploy ledger row" and lists every missing mark: that output is today's C6
state, measured.

## Demo (no live project)
`bash scripts/launch/trainee-go-live.sh --dry-run --sha $(git rev-parse HEAD)` on a clean checkout: both bundle checks
pass in the staged commit, the manifest prints, and every step prints its ledger writes as `DRY:` lines.
`node --test tests/deploy-provenance.test.cjs` runs the refusals, a full stubbed run and `--verify` both ways.

## Out of scope
Deploying anything; changing what is deployed (the function list and migrations are unchanged but for the ledger's);
re-recording past deploys in the ledger; hashing the platform's eszip (the CLI builds it; the ledger ties the version
number it reports to the source bundle hash instead).

Size cap: one script change, one helper, one migration, two test files, docs.
