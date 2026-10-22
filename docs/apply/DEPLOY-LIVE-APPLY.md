# Deploy package: the apply schema and the agent-submit switch, on the live project

> **Status: handed to Muse's ops lane; schema went live 2026-10-21 via Muse's closure.** The coordinator reports the
> apply schema and 20261024090000 live on `mrwngntwmnaqrqhupvlt` (verified read-only 12:27 CDT; no
> `CAREER_AGENT_SUBMIT` row, so off). This package was not used for that and is kept as-is: its verification
> (`scripts/launch/verify-apply-schema.sql`), switch procedure (section 8) and rollback (section 9) still apply.

Prepared 2026-10-21 on `wo/frs-deploy` (from `wo/first-real-submission`). **Nothing here has been run against any live
system.** Every command below is the owner's to run, from his own shell; an agent never applies a migration to the live
project, never holds its connection string and never flips a switch (AGENTS.md, CLAUDE.md).

Target: the project the extension points at, `mrwngntwmnaqrqhupvlt` (`extension/config.js`, `supabaseUrl`).

## 1. Where the live project stands (owner's read-only queries, 2026-10-21 morning)

- Of the 40 Trainee migrations (`scripts/launch/trainee-go-live.sh`, `MIGRATIONS`, the files from 20261019 on), only
  three channel tables exist. **None of the apply schema exists**: no `career_apply_jobs`, no
  `career_apply_extension_begin_own` / `career_apply_finish_own` / `career_apply_account_own` / `career_apply_answers_own`
  / `career_apply_questions_answer_from_form_own`, no `career_cloud_settings`, `career_apply_wanted`,
  `career_deploy_ledger` or `career_apply_batch_approvals`.
- Older career tables are there: `career_batch_intents_v1`, `career_batch_ledgers_v1`, `career_batch_runs_v1`,
  `career_kb_*`, `career_reminder_outbox`, `career_task_effects_v1`, `career_task_intents_v1`, `career_watch_kv`.
- The Supabase migration history is empty: migrations are applied by script, not tracked by the CLI. So
  `supabase db push` would try to replay every file and must not be used (the same reason
  `scripts/launch/apply-rails-and-seed.sh` gives).
- The extension today can therefore record nothing: its first call (`career_apply_account_own`) does not exist live.

Not known from those queries, and read by the verification in section 6 before anything is applied: whether
`career_host_commit` carries the stated-facts change (go-live's fifth EARLIER mark), and whether
`public.upmore_migration_ledger` exists (section 9, risk 4).

## 2. What the extension's apply path calls

From `extension/background.js` (every `rpc(...)` and REST read; nothing else touches the database):

| Call | What for | Latest definition |
|---|---|---|
| `career_apply_account_own()` | the panel's account read (first call) | 20261020030000_career_apply_cards |
| `career_apply_answers_own()` | the person's answered questions, read fresh per form | 20261020060000_career_apply_questions |
| `career_apply_questions_put_own(text,jsonb)` | questions the form asks that nobody answered yet | 20261020070000_career_apply_questions_ai_policy |
| `career_apply_questions_answer_from_form_own(text,jsonb)` | answers typed on the form, kept once sent | 20261021120000_career_apply_form_answers |
| `career_apply_extension_begin_own(jsonb,text)` | the person's own tap: record the approved application | 20261021120000_career_apply_form_answers |
| `career_apply_batch_approve_own(jsonb)` | WO-101: the person approves a batch of exact answers | 20261024090000_career_apply_agent_submit |
| `career_apply_batch_revoke_own()` | WO-101: "Stop applying" | 20261024090000_career_apply_agent_submit |
| `career_apply_extension_begin_agent_own(jsonb,text,text)` | WO-101: the agent's start, behind `CAREER_AGENT_SUBMIT` | 20261024090000_career_apply_agent_submit |
| `career_apply_finish_own(uuid,uuid,text,jsonb)` | the outcome after the send | 20261020010000_career_apply_own_worker |
| `career_apply_want_take_own(text[])` + REST `career_apply_wanted` | the panel's "Trainee's picks" (optional; pasted links do not need it) | 20261022100000_career_apply_wanted |
| REST `career_outbox` (own `alert` rows) | the panel's "Trainee's matches" (optional) | 20261019010001_career_alerts |

Two edge functions are also called and are **not** schema: `career-essay-draft` (the card's essay drafts) and
`career-email-code` (an emailed security code). Neither is deployed by `trainee-go-live.sh`
(`docs/launch/DEPLOY-PACKET-2026-10-20.md` says the same); without them the card shows no draft and the code is typed by
the person. Out of scope here.

## 3. The minimal migration set (derived, then proven)

How it was derived: (1) a static closure from the ten RPCs above through every function each one's latest definition
calls (`career_apply_canonical`, `career_apply_enqueue`, `career_apply_daily_limit`, `career_apply_finish`,
`career_apply_current`, `career_apply_agent_submit_enabled`) and every migration that creates or alters a table they
touch; (2) then, because a migration file applies whole, on a throwaway local Postgres (`tests/db/stubs.sql` + go-live's
five EARLIER files, which are live) the set was grown until every file applied cleanly in go-live order, adding the
creator of each missing relation. The closure gained three files that way (`career_postings`, `career_outbox` and
`career_mail_events` are read at create time by 20261021075000's SQL functions and constraints).

It stands on one EARLIER file that is already live: `20261015020000_career_watch_kv.sql` (`career_watch_kv`).

| # | File | Why the apply path needs it |
|---|---|---|
| 1 | 20261019000001_career_postings.sql | `career_postings` (20261021075000 reads it at create time) |
| 2 | 20261019010001_career_alerts.sql | `career_outbox` (altered by 9 and 11; read by the panel) |
| 3 | 20261020000001_career_apply_jobs.sql | `career_apply_jobs`, `career_apply_canonical` (the shared SHA-256 canonical form) |
| 4 | 20261020010000_career_apply_own_worker.sql | `career_apply_finish_own` |
| 5 | 20261020030000_career_apply_cards.sql | `career_apply_account_own` |
| 6 | 20261020050000_career_apply_daily_limit.sql | `career_apply_daily_limit`, `career_apply_enqueue` (the queue's rules) |
| 7 | 20261020060000_career_apply_questions.sql | `career_apply_questions`, `career_apply_answers_own` |
| 8 | 20261020070000_career_apply_questions_ai_policy.sql | `ai_policy`; `career_apply_questions_put_own` (latest) |
| 9 | 20261020100000_career_mail_tracking.sql | `career_mail_events` (20261021075000 reads it at create time) |
| 10 | 20261020130000_career_resume_tailoring.sql | the resume columns of `career_apply_jobs` |
| 11 | 20261021075000_career_apply_ops.sql | `career_apply_finish` (latest), `source`, the outbox kinds with `questions` |
| 12 | 20261021080000_career_apply_cloud.sql | `career_cloud_settings` (where both switches live), its columns on jobs |
| 13 | 20261021120000_career_apply_form_answers.sql | `career_apply_extension_begin_own` (latest), `..._answer_from_form_own` |
| 14 | 20261022100000_career_apply_wanted.sql | `career_apply_wanted`, `career_apply_want_take_own` ("Trainee's picks"; optional) |
| 15 | 20261022150000_career_apply_authority.sql | `career_apply_current` (begin's approval-freshness check, WO-092) |
| 16 | 20261024090000_career_apply_agent_submit.sql | `CAREER_AGENT_SUBMIT`, `career_apply_batch_approvals`, the three WO-101 RPCs |

Proof (local throwaway Postgres 16, VERIFIED): these 16 apply cleanly in this order, and then these DB tests pass on
that database: `career_apply_extension` (24 ok), `career_apply_form_answers` (26), `career_apply_agent_submit` (25),
`career_apply_questions` (30), `career_apply_questions_ai_policy` (12), `career_apply_own` (15), `career_apply_cards`
(23), `career_apply_daily_limit` (10), `career_apply_cloud` (81), `career_apply_wanted` (14). Every extension RPC is
exercised by at least one of them.

**Versus the full go-live set (40 files):** the other 24 are the channels (threads, pending approvals, delivery, inbound,
artifacts, parity), receipts, the card push, connector, events and their erase, the extension's first begin
(20261021000000, superseded by 13), outreach, voice mock, hired backgrounds, brief digest, mail erase, proactive last
word, board state, mail model calls, postings pay, control state, the deploy ledger and `apply_queued`.

## 4. Options, and the recommendation

**Recommended: Option A, the full Trainee set, schema only.** All 40 files in go-live's order, each in its own
transaction, each skipped when its go-live mark already reads true, by a short psql loop that takes the file list and
the marks from `trainee-go-live.sh` itself (section 5). No secret is set, no function deployed, no schedule created.

Why not the minimal 16 (Option B): applying them first breaks the later go-live, silently. Go-live decides by marks,
one object per file. Proven locally (VERIFIED): the 16 first, then go-live's own step-2 rule over the 40, ends with a
schema that differs from the 40 applied in order:
- `20261021000000_career_apply_extension` and `20261020040000_career_apply_card_push` are never applied: their marks
  (`career_apply_extension_begin_own`, `career_apply_card_push_for`) already read true because 13 and 11 redefine them.
  Lost: `career_proactive_runs.cards` and its check, `career_apply_card_push_as`.
- Five earlier files (channel inbound, receipts, voice mock, brief digest, channel parity) are applied after 11 and
  reset `career_outbox_kind_check` and `career_outbox_key_check` to their older lists: the kind `questions` is gone, so
  the questions text to the person fails at insert; channel parity also puts back an older
  `career_apply_card_push_for`. `scripts/launch/verify-apply-schema.sql` reports exactly this database as not ready (the `questions`
  check fails).

Why not `trainee-go-live.sh` itself (Option C) for this step: it has **no migrations-only flag**. Its real flags are
`--sha`, `--label`, `--dry-run`, `--skip-migrations`, `--skip-deploy`, `--only-smoke`, `--brain agent|router`,
`--allow-send`, `--no-wait` and `--verify <sha>`. `--skip-deploy` skips only step 4: steps 3 (secrets: Enter on any of
the four function secrets generates and sets a new one), 5 (the three pg_cron schedules, which start calling
career-ingest, career-proactive and trainee-deliver every few minutes) and 6 (smoke, waiting up to 420 s per schedule)
still run (the dry run in section 10 shows each). That is the Trainee launch, the owner's separate decision. When he
makes it, go-live finds every mark true after Option A and applies nothing again (its step 2 then writes the
`career_deploy_ledger` rows).

Option A, proven locally (VERIFIED): on a database shaped like the live one (stubs, the five EARLIER files, and the
three channel tables already there), the loop applied 37 files and reported 3 present; a second run applied nothing;
the schema it left is identical, object for object (1103 functions, constraints, triggers, columns and policies), to
all 40 applied in order on an empty database; the verification in section 6 read every check true. Run again with a
non-empty `upmore_migration_ledger`, it wrote one ledger row per file (as go-live does).

## 5. Exact commands (the owner, from his own shell)

Tools: `git`, `psql` (libpq: `brew install libpq` on a Mac), `bash`, and `sha256sum` or `shasum`. Nothing else.

**5.0 The commit.** The reviewed commit on `trunk` that contains these files and the 40 migrations; the tree clean.

```bash
cd <your clone of upmore-agent>
git fetch origin
git checkout --detach <the 40-character commit>
git status --porcelain            # must print nothing
git rev-parse HEAD                # keep this with the log
```

**5.1 Optional, offline: go-live's own plan.** Reads nothing live, prints no secret, changes nothing:

```bash
bash scripts/launch/trainee-go-live.sh --dry-run --sha "$(git rev-parse HEAD)" --skip-deploy
```

**5.2 The connection string, on a hidden prompt** (Supabase > Project Settings > Database > Connection string, the
URI form `postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres`). It stays in this shell only:

```bash
IFS= read -rs SUPABASE_DB_URL; export SUPABASE_DB_URL; echo
```

**5.3 Before: read only.** Expect `apply path ready | f` today, every EARLIER precondition `t`, both switches at rest:

```bash
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -f scripts/launch/verify-apply-schema.sql
```

Stop here if any `pre` row other than `upmore_migration_ledger` reads `f` (section 7).

**5.4 Apply: Option A.** Paste as one block. It runs in its own `bash`, so a stop never closes your shell:

```bash
bash <<'APPLY' 2>&1 | tee "$HOME/apply-schema-$(date -u +%Y%m%dT%H%M%SZ).log"
set -euo pipefail
[[ -n "${SUPABASE_DB_URL:-}" ]] || { printf 'Database URI (hidden): ' >/dev/tty; IFS= read -rs SUPABASE_DB_URL </dev/tty; echo >/dev/tty; }
export PGOPTIONS="-c client_min_messages=warning"
q() { psql "$SUPABASE_DB_URL" -X -tA -v ON_ERROR_STOP=1 -c "$1"; }
sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -c1-64; else shasum -a 256 "$1" | cut -c1-64; fi; }
eval "$(sed -n '/^MIGRATIONS=(/,/^)$/p; /^MIGRATION_MARK=(/,/^)$/p; /^EARLIER=(/,/)$/p; /^EARLIER_MARK=(/,/)$/p' scripts/launch/trainee-go-live.sh)"
(( ${#MIGRATIONS[@]} == ${#MIGRATION_MARK[@]} && ${#EARLIER[@]} == ${#EARLIER_MARK[@]} )) || { echo "STOP: lists and marks differ"; exit 1; }
echo "commit $(git rev-parse HEAD)"
for i in "${!EARLIER[@]}"; do
  [[ "$(q "select (${EARLIER_MARK[$i]})")" == t ]] || { echo "STOP: ${EARLIER[$i]} is not on this database (go-live never applies it; see Preconditions)"; exit 1; }
done
LEDGER=missing
if [[ "$(q "select to_regclass('public.upmore_migration_ledger') is not null")" == t ]]; then
  LEDGER="$(q "select case when exists (select 1 from public.upmore_migration_ledger) then 'ok' else 'empty' end")"
fi
echo "earlier: all ${#EARLIER[@]} present; upmore_migration_ledger: $LEDGER"
for i in "${!MIGRATIONS[@]}"; do
  f="${MIGRATIONS[$i]}"; mark="${MIGRATION_MARK[$i]}"; sum="$(sha "supabase/migrations/$f")"
  row="insert into public.upmore_migration_ledger(filename,sha256) values ('$f','$sum') on conflict do nothing"
  if [[ "$(q "select ($mark)")" == t ]]; then
    echo "present  $f"; [[ "$LEDGER" == ok ]] && q "$row" >/dev/null; continue
  fi
  args=(-f "supabase/migrations/$f"); [[ "$LEDGER" == ok ]] && args+=(-c "$row")
  psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction "${args[@]}" \
    || { echo "STOP at $f: that file rolled back; every file before it stays applied"; exit 1; }
  [[ "$(q "select ($mark)")" == t ]] || { echo "STOP: $f ran but its mark is false"; exit 1; }
  echo "applied  $f  sha256 $sum"
done
echo "all ${#MIGRATIONS[@]} Trainee migrations present"
APPLY
```

It is go-live's step 2 without go-live's other steps: the same list, the same marks, the same order, one transaction
per file, the same `upmore_migration_ledger` row when that ledger is in use. Expected today: `present` for the three
channel files whose tables exist, `applied` for the other 37, then `all 40 Trainee migrations present`. A re-run prints
40 `present` and changes nothing. The log holds file names and sha256 sums only (psql does not print the password).

**5.5 After: read only.** Expect `apply path ready | t`, `full go-live set present (89 of 89 checks) | t`,
`switches at rest | t`:

```bash
psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -f scripts/launch/verify-apply-schema.sql
```

**5.6 Close the shell** (or `unset SUPABASE_DB_URL`).

## 6. Verification SQL (read only)

`scripts/launch/verify-apply-schema.sql` is the full check: 94 rows inside `begin transaction read only ... rollback`
(preconditions; the ten extension RPCs with their exact signatures, `security definer`, executable by `authenticated`
and not by `anon`; their helpers; seven tables with row-level security and the client grants the extension relies on;
the new columns and constraints; the two switches; all 40 go-live marks), then four verdicts: `apply path ready`,
`full go-live set present`, `switches at rest`, `trainee-go-live.sh step 2 can read its ledger`. It reads no secret and
no row of any table except the two switch values.

The core of it, for the Supabase SQL editor (every row must read `t`):

```sql
begin transaction read only;
select object, ok from (values
  ('rpc career_apply_extension_begin_own',            to_regprocedure('public.career_apply_extension_begin_own(jsonb,text)') is not null),
  ('rpc career_apply_finish_own',                     to_regprocedure('public.career_apply_finish_own(uuid,uuid,text,jsonb)') is not null),
  ('rpc career_apply_account_own',                    to_regprocedure('public.career_apply_account_own()') is not null),
  ('rpc career_apply_answers_own',                    to_regprocedure('public.career_apply_answers_own()') is not null),
  ('rpc career_apply_questions_put_own',              to_regprocedure('public.career_apply_questions_put_own(text,jsonb)') is not null),
  ('rpc career_apply_questions_answer_from_form_own', to_regprocedure('public.career_apply_questions_answer_from_form_own(text,jsonb)') is not null),
  ('rpc career_apply_batch_approve_own',              to_regprocedure('public.career_apply_batch_approve_own(jsonb)') is not null),
  ('rpc career_apply_batch_revoke_own',               to_regprocedure('public.career_apply_batch_revoke_own()') is not null),
  ('rpc career_apply_extension_begin_agent_own',      to_regprocedure('public.career_apply_extension_begin_agent_own(jsonb,text,text)') is not null),
  ('rpc career_apply_want_take_own',                  to_regprocedure('public.career_apply_want_take_own(text[])') is not null),
  ('fn  career_apply_canonical',                      to_regprocedure('public.career_apply_canonical(jsonb)') is not null),
  ('fn  career_apply_enqueue',                        to_regprocedure('public.career_apply_enqueue(jsonb,text,text,integer)') is not null),
  ('fn  career_apply_daily_limit',                    to_regprocedure('public.career_apply_daily_limit(uuid)') is not null),
  ('fn  career_apply_finish',                         to_regprocedure('public.career_apply_finish(uuid,uuid,text,jsonb)') is not null),
  ('fn  career_apply_current',                        to_regprocedure('public.career_apply_current(uuid,jsonb)') is not null),
  ('fn  career_apply_agent_submit_enabled',           to_regprocedure('public.career_apply_agent_submit_enabled()') is not null),
  ('tbl career_apply_jobs',                           to_regclass('public.career_apply_jobs') is not null),
  ('tbl career_apply_questions',                      to_regclass('public.career_apply_questions') is not null),
  ('tbl career_cloud_settings',                       to_regclass('public.career_cloud_settings') is not null),
  ('tbl career_apply_batch_approvals',                to_regclass('public.career_apply_batch_approvals') is not null),
  ('tbl career_apply_wanted',                         to_regclass('public.career_apply_wanted') is not null),
  ('tbl career_outbox',                               to_regclass('public.career_outbox') is not null),
  ('col career_apply_jobs.agent_batch_hash',          exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'career_apply_jobs' and column_name = 'agent_batch_hash')),
  ('con key check takes CAREER_AGENT_SUBMIT',         exists (select 1 from pg_constraint where conname = 'career_cloud_settings_key_check' and pg_get_constraintdef(oid) like '%CAREER_AGENT_SUBMIT%'))
) v(object, ok);
rollback;
```

Locally (VERIFIED): 24 of 24 `t` on the live-shaped database after Option A; 13 `f` on a partly migrated one. The full
file after Option A: 94 of 94 `t` with an `upmore_migration_ledger`, 93 and that one row `f` without it; on the minimal-first database it reports the lost `questions` kind; with
`CAREER_AGENT_SUBMIT` set to `on` it reports `switches at rest | f`.

## 7. Preconditions

1. The owner has said yes, in writing, to applying the schema to `mrwngntwmnaqrqhupvlt` (CLAUDE.md: live migrations are
   his).
2. The commit is reviewed and on `trunk`; `git status --porcelain` is empty; HEAD is that commit (5.0).
3. Section 5.3 reads `t` for every EARLIER row. If `20261016120000_career_account_stated_facts` reads `f`, the loop
   stops before applying anything; that file uses plain `create` and go-live never applies it: apply it by hand after
   reading it (`psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261016120000_career_account_stated_facts.sql`),
   which is what go-live's own stop message says, then re-run 5.3.
4. A backup point exists: Supabase > Database > Backups shows today's daily backup (or point-in-time recovery is on).
   Only 20261024090000 has a down file (section 9); for the other 39 the way back is that backup.
5. `CAREER_CLOUD_APPLY` is not `on` (it does not exist before; nothing here writes it).
6. `extension/config.js` keeps `agentSubmits: false` in the published extension until the switch procedure (section 8).

## 8. The switch procedure: `CAREER_AGENT_SUBMIT`

The agent can send only when two things are on: the extension's `agentSubmits` (a build of the extension, the owner's
call) and this database switch. `career_apply_extension_begin_agent_own` refuses with `agent submit is off` whenever the
`CAREER_AGENT_SUBMIT` row is missing or anything but `on`. Approving a batch (`career_apply_batch_approve_own`) does not
need the switch; an approval stays live 24 hours and is used once. So:

1. The person prepares the postings and approves the batch in the extension (switch still off).
2. The owner reads the batch on the card, then, **just before the send**:

   ```bash
   psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -c "insert into public.career_cloud_settings(key, value) values ('CAREER_AGENT_SUBMIT', 'on') on conflict (key) do update set value = excluded.value, updated_at = now()"
   ```

3. The extension sends the approved postings (each only on an exact match of the approved entry).
4. **Right after** (also the first move if anything looks wrong):

   ```bash
   psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -c "insert into public.career_cloud_settings(key, value) values ('CAREER_AGENT_SUBMIT', 'off') on conflict (key) do update set value = excluded.value, updated_at = now()"
   ```

5. Read back (read only): both switches, and what was used in the last hour:

   ```bash
   psql "$SUPABASE_DB_URL" -X -c "select key, value, updated_at from public.career_cloud_settings where key in ('CAREER_AGENT_SUBMIT', 'CAREER_CLOUD_APPLY') order by key" \
     -c "select job_id, approved_at, used_at, revoked_at from public.career_apply_batch_approvals where used_at > now() - interval '1 hour' order by used_at"
   ```

   Expect `CAREER_AGENT_SUBMIT | off` and no `CAREER_CLOUD_APPLY` row (or `off`). `verify-apply-schema.sql` also reads
   `switches at rest | f` while either one is `on`.

`CAREER_CLOUD_APPLY` (the cloud worker's switch) **stays off throughout**: no command here writes it, and the cloud
worker is not deployed. Locally (VERIFIED, throwaway database): on made `career_apply_agent_submit_enabled()` true; off
made it false.

## 9. Rollback

In order of reach; each later step includes the earlier ones.

1. **The switch off** (section 8 step 4). Instant; every agent start is refused from the next call.
2. **The extension**: `agentSubmits: false` (the default) in the published build.
3. **The down file for 20261024090000**, `supabase/rollbacks/20261024090000_career_apply_agent_submit.down.sql`:
   drops `career_apply_extension_begin_agent_own`, `career_apply_batch_revoke_own`, `career_apply_batch_approve_own`,
   the table `career_apply_batch_approvals` (with its index and policy), `career_apply_jobs.agent_batch_hash` and its
   check; deletes the `CAREER_AGENT_SUBMIT` row; drops `career_apply_agent_submit_enabled`; puts
   `career_cloud_settings_key_check` back to the cloud migration's list (`CAREER_CLOUD_APPLY`, `owner_user_id`,
   `gate_user_ids`). No `cascade`: anything unexpected depending on these stops it, unchanged. It **loses** the
   approval rows and each job's batch hash; save them first (read only):

   ```bash
   psql "$SUPABASE_DB_URL" -X -c "\copy (select * from public.career_apply_batch_approvals) to '$HOME/batch-approvals-saved.csv' csv header" \
     -c "\copy (select id, job_id, agent_batch_hash from public.career_apply_jobs where agent_batch_hash is not null) to '$HOME/batch-hashes-saved.csv' csv header"
   psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/rollbacks/20261024090000_career_apply_agent_submit.down.sql
   psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -f scripts/launch/verify-apply-schema.sql
   ```

   (The saved files hold the person's approved answers: keep them on your machine only.) After it, the verification
   reads `apply path ready | f` on exactly the WO-101 rows; the person's own tap (`career_apply_extension_begin_own`)
   still works. The next Option A run or go-live run applies 20261024090000 again (its mark is gone), switch off.
4. **Everything else**: there is no down file for the other 39; they only add tables, columns and functions the live
   chat does not need, except as noted in risk 3. The way back is the backup point (precondition 4), the owner's call.

Proof of 3 (local throwaway Postgres 16, VERIFIED):
- `tests/db/career_apply_agent_submit_down.test.sql` (wired into `tests/db/run.sh`, last): up, then down, down again,
  up again, each in one transaction, on rows like live ones (a switch row `on`, an approval, a job with a batch hash, a
  `CAREER_CLOUD_APPLY` row): 20 ok, among them "the settings key check is the prior list exactly", "CAREER_AGENT_SUBMIT
  cannot be set again", "the cloud switch row is kept", "the job row is kept", "the grants are the migration's". The
  whole `bash tests/db/run.sh` passes with it (`db tests passed`, 26 s), and `career_apply_agent_submit.test.sql`
  (25 ok) passes again after a down and an up.
- On the live-shaped database after Option A: switch on, off, down, down again (`DELETE 0`, no error), the verification
  (12 rows `f`, all WO-101's, besides the ledger row of section 11 risk 4), Option A again (only `20261024090000` applied), the verification all `t`, and the schema
  identical to the full set's (1103 objects).

## 10. go-live dry run (fake environment, nothing reached)

`bash scripts/launch/trainee-go-live.sh --dry-run --sha 84da2fbf2e6cb53c9a63f823a50372598fbc5ad3 --skip-deploy`, with
the fake values of `tests/trainee-go-live.test.cjs` (`FAKE`; project ref `abcdefghijklmnopqrst`, `db.example.test`) and
a throwaway `HOME`. Exit 0; none of the fake secret values appears in the 699 lines of output (checked by grep). The
598 lines of the provenance manifest (every function's bundle sha256, every migration's sha256 and mark) are cut here;
the step-2 lines for the files between 20261019030000 and 20261024090000 have the same shape and are cut too.

```
STEP 1/6 preflight
commit 84da2fbf2e6cb53c9a63f823a50372598fbc5ad3
  tool supabase: missing here (the real run needs it)
  tree: clean
  --sha: HEAD is 84da2fbf2e6cb53c9a63f823a50372598fbc5ad3
  > git archive 84da2fbf2e6cb53c9a63f823a50372598fbc5ad3 -- supabase scripts packages corpus | tar -x into a fresh temp dir (/tmp/trainee-go-live-stage.<random>)
  > python3 scripts/build-router-core.py --check (in the staged commit)
    Router bundle verified
  > python3 scripts/build-router-core.py --career-only --check (in the staged commit)
    Router bundle verified
  PROVENANCE MANIFEST 84da2fbf2e6cb53c9a63f823a50372598fbc5ad3 (sha256 320eed5aba2f53630160d9033115b5b5004851d34d01dfdc8aadee02a2494e4b):
    [... 598 lines cut ...]
STEP 1/6 preflight: OK

STEP 2/6 migrations
DRY: psql *** -tA: read the ledger public.upmore_migration_ledger (missing or empty: left alone, apply-rails-and-seed.sh --pending backfills it)
DRY: psql *** -tA: check 20261015010000_career_knowledge_base.sql is on the live project (ledger or: to_regclass('public.career_kb_roles') is not null); missing stops the run, never applied here
DRY: psql *** -tA: check 20261015020000_career_watch_kv.sql is on the live project (ledger or: to_regclass('public.career_reminder_outbox') is not null); missing stops the run, never applied here
DRY: psql *** -tA: check 20261015234000_career_task_intents_v1.sql is on the live project (ledger or: to_regclass('public.career_task_intents_v1') is not null); missing stops the run, never applied here
DRY: psql *** -tA: check 20261016010000_career_batch_intents_v1.sql is on the live project (ledger or: to_regclass('public.career_batch_ledgers_v1') is not null); missing stops the run, never applied here
DRY: psql *** -tA: check 20261016120000_career_account_stated_facts.sql is on the live project (ledger or: exists (select 1 from pg_proc where proname = 'career_host_commit' and prosrc like '%stated_facts%')); missing stops the run, never applied here
DRY: psql *** -X -q -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261019000000_channel_threads.sql (only if neither the ledger nor the live schema has it: to_regclass('public.channel_threads') is not null; its ledger row in the same transaction)
DRY: psql *** -X -q -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261019000001_career_postings.sql (only if neither the ledger nor the live schema has it: to_regclass('public.career_ingest_state') is not null; its ledger row in the same transaction)
DRY: psql *** -X -q -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261019010000_channel_pending_approvals.sql (only if neither the ledger nor the live schema has it: to_regclass('public.channel_pending_approvals') is not null; its ledger row in the same transaction)
DRY: psql *** -X -q -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261019010001_career_alerts.sql (only if neither the ledger nor the live schema has it: to_regclass('public.career_proactive_runs') is not null; its ledger row in the same transaction)
DRY: psql *** -X -q -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261019020000_channel_delivery.sql (only if neither the ledger nor the live schema has it: exists (select 1 from pg_proc where proname = 'career_outbox_contacts_on'); its ledger row in the same transaction)
DRY: psql *** -X -q -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261019030000_channel_inbound.sql (only if neither the ledger nor the live schema has it: exists (select 1 from pg_proc where proname = 'career_outbox_claim_key'); its ledger row in the same transaction)
    [... 33 lines of the same shape cut ...]
DRY: psql *** -X -q -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261024090000_career_apply_agent_submit.sql (only if neither the ledger nor the live schema has it: to_regclass('public.career_apply_batch_approvals') is not null; its ledger row in the same transaction)
DRY: psql *** -tA: every migration mark (5 earlier + 40) read again on the live schema; any missing one fails the run, each named
DRY: psql *** -c: insert into public.career_deploy_ledger one migration row per mark (sha, file, sha256, manifest sha256, --label)
STEP 2/6 migrations: OK

STEP 3/6 secrets
  kept: PDL_API_KEY (not given; hired-candidate backgrounds say NO DATA until it is set)
  kept: TELEGRAM_BOT_TOKEN ... WHATSAPP_DAILY_TEMPLATES (10 lines, each "not given; what is set stays")
DRY: supabase secrets set --project-ref abcdefghijklmnopqrst --env-file <0600 temp file: CAREER_INGEST_SECRET=*** CAREER_PROACTIVE_SECRET=*** TRAINEE_DELIVER_SECRET=*** TRAINEE_INBOUND_SECRET=*** INGEST_CONTACT_EMAIL=*** LOOPMESSAGE_API_KEY=*** LOOPMESSAGE_DAILY_CONTACTS=*** TRAINEE_ALLOWED_CONTACTS=*** OPENAI_API_KEY=*** MODEL_PROVIDER=openai>
STEP 3/6 secrets: OK

STEP 4/6 deploy: SKIPPED (--skip-deploy)

STEP 5/6 schedules
DRY: CAREER_INGEST_SECRET=*** psql *** -X -q -v ON_ERROR_STOP=1 -v url=https://abcdefghijklmnopqrst.supabase.co/functions/v1/career-ingest -f scripts/launch/schedule-career-ingest.sql
DRY: CAREER_PROACTIVE_SECRET=*** psql *** -X -q -v ON_ERROR_STOP=1 -v url=https://abcdefghijklmnopqrst.supabase.co/functions/v1/career-proactive -f scripts/launch/schedule-career-proactive.sql
DRY: TRAINEE_DELIVER_SECRET=*** psql *** -X -q -v ON_ERROR_STOP=1 -v url=https://abcdefghijklmnopqrst.supabase.co/functions/v1/trainee-deliver -f scripts/launch/schedule-trainee-deliver.sql
STEP 5/6 schedules: OK

STEP 6/6 smoke
DRY: SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co CAREER_INGEST_SECRET=*** CAREER_PROACTIVE_SECRET=*** TRAINEE_DELIVER_SECRET=*** TRAINEE_INBOUND_SECRET=*** SUPABASE_DB_URL=*** UPMORE_TEST_JWT=*** node scripts/launch/trainee-smoke.cjs --wait-runs 420
STEP 6/6 smoke: OK
```

What it shows: step 2 is the plan Option A carries out (the same files, marks and order); steps 3, 5 and 6 still run
under `--skip-deploy`, which is why this package does not use go-live for the schema.

## 11. Risks

1. **Applying 39 files besides the switch's.** Option A creates every Trainee table, function and trigger. None
   schedules anything or calls out (no `cron.schedule`, no `net.http_post` in any of them; checked by grep), and no
   function that would use them is deployed by this package. Mitigation: the backup point; the verification after.
2. **The live chat's write path changes.** The live career chat writes `career_watch_kv` through
   `career_host_commit` on each committed turn. `20261020120100_career_events_erase` and
   `20261021050000_career_brief_digest` replace that function's body (same signature); `20261021010000_career_outreach`,
   `20261021080000_career_apply_cloud` and `20261021090000_career_mail_erase` add after-insert-or-update erase triggers
   on `career_watch_kv`; `20261022150000_career_apply_authority` adds a before-insert-or-update trigger that writes an
   `authority_version` key into the `career:account` value. Cloud and authority are in the minimal set too, so Option B
   shares this. The deployed agent-chat keeps calling the same signature; the new bodies need `agent_flow_state` (live
   since the 2026-10-11 go-live) and the tables Option A creates. Not exercised against the deployed chat here: after
   5.5, one ordinary chat turn by the owner on his own account, then the account read back, is the check.
3. **Minimal-first (Option B) breaks the later go-live** (section 4): never apply a subset ahead of the full list.
4. **go-live's ledger read** (not this package's file; reported for the architect): `trainee-go-live.sh` step 2's first
   read, `select case when to_regclass('public.upmore_migration_ledger') is null then 'missing' when exists (select 1
   from public.upmore_migration_ledger) ...`, fails when the table is missing: Postgres resolves the name before it
   runs the `case` (reproduced locally: `relation "public.upmore_migration_ledger" does not exist`). The run then stops
   with "a read of the live database failed", before applying anything. Option A checks the table first and is not
   affected. `verify-apply-schema.sql` reports it (`trainee-go-live.sh step 2 can read its ledger`). A one-line fix in
   go-live is needed before the Trainee launch if that table is missing live.
5. **The three channel tables already live** are taken as their migrations (the loop skips a file whose mark reads
   true, as go-live does). Each of those three files has one commit in history (2026-10-19), so the live tables came
   from the files as they are; the other objects in those files are proven only through the marks.
6. **A switch left on.** Nothing turns `CAREER_AGENT_SUBMIT` off by itself. Mitigation: section 8 steps 4-5; the
   verification's `switches at rest`. An approval also lapses after 24 hours and is used once.
7. **The rollback of 20261024090000 loses records** (approvals, batch hashes): save them first (section 9).
8. **The deploy ledger after Option A.** Option A writes no `career_deploy_ledger` rows; until go-live runs once,
   `trainee-go-live.sh --verify <sha>` lists each migration as not recorded. Expected, not a fault.
9. **`apply-rails-and-seed.sh --pending` after Option A**: with no ledger, its first run backfills only up to
   20261011030000 and would then try to replay every later file, the EARLIER career ones included (plain `create`):
   do not run it on this project without reading it first.

## Files in this package

- `docs/apply/DEPLOY-LIVE-APPLY.md` (this file)
- `scripts/launch/verify-apply-schema.sql`: the read-only verification (section 6)
- `supabase/rollbacks/20261024090000_career_apply_agent_submit.down.sql`: the rollback (section 9)
- `tests/db/career_apply_agent_submit_down.test.sql`, and four appended lines in `tests/db/run.sh`: its proof
