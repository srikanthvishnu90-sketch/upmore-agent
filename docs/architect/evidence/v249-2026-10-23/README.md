# Evidence: the 2026-10-23 05:07 UTC deploy, and the freeze

These are preserved records only. Do not delete or overwrite them; add corrections as new files.

The analysis these support is in `../../V249-RECONCILIATION-2026-10-23.md` and `../../V249-RECOVERY-OPTIONS-2026-10-23.md`.

## What is here

- **`live-reads-2026-10-23.jsonl`** holds every read-only Supabase call this architect session made on 2026-10-23: input and result, 52 rows, machine-extracted from the session transcript.
  - The calls are `execute_sql`, `query_logs`, `list_edge_functions` and `get_edge_function`.
  - Redactions:
    - the owner's email appears as `<owner-email>`;
    - three results that contained credential-bearing text are replaced by a note. One was the `cron.job` listing, and its job names and schedules are kept in the note.
- **`function-logs-0500-0520Z.json`** is the first 60 `function_logs` and `function_edge_logs` rows from 05:00 to 05:20 UTC.
  - It keeps selected fields only: time, function id, version, event type, deployment id and the first 160 characters of the message.
  - The raw result was not copied because it contained credential-shaped text.
  - It shows agent-proactive v18 at 05:07:00, agent-chat v249's first boot at 05:09:58, and the "Could not find the table" lines.
- **`this-session-supabase-writes-all-time.json`** lists every Supabase write this session ever made. It records names only, never inputs or values:
  - two `apply_migration` calls of `20261011010000_flow_state`, both on 2026-10-11;
  - one `create_edge_function_secret` call for `OPENAI_API_KEY`, on 2026-10-11.

  There were no deploys. The 2026-10-12 attempt was a CLI call, not this tool.
- **`sandbox/`** holds the throwaway Postgres materials: the scripts and the fingerprints.
  - `provision-live-emul.sh` builds the live-emulating sandbox.
  - `schema-fp.sql` is the fingerprint query.
  - `emul-fp.txt` and `pre.txt` are the sandbox fingerprints before the forward migrations, 751 entries; `post.txt` is after them.
  - `emul-hmap.tsv` maps each hash to its entry.
  - `diff.sql` is the read-only live comparison query. Its live result: only two `profiles` referral triggers differ.
  - `push-test.sql` is the control-vs-forward outbox test.
  - `graph.cjs`, `graph-*.json` and `ids-*.txt` hold each commit's agent-chat import graph and the database objects it references.
  - `live.txt` lists the referenced objects that exist live.

## Not preserved here, and why

- **The sandbox databases themselves.** I stopped and deleted them at about 18:20 UTC, before the preservation instruction. They are reproducible from `sandbox/provision-live-emul.sh` and the migration files at `63a1233f`.
- **The worker host:**
  - Muse's `~/workspace/stage-373453f3` and `stage-cea914fe`;
  - the midnight-run report `goals/upmore-spec-16-gauntlet-build/hidden_files/midnight-2026-10-23/report.md`;
  - `restore-log.jsonl`;
  - cron and timer states.

  This session has no access to that host. I could not copy, verify or protect any of it.

## At risk

- **Supabase platform logs** (`function_logs`, `function_edge_logs`, `auth_audit_logs`) age out on the platform's retention schedule.
  - I could read back to 2026-10-20, so retention is at least 3 days. The exact limit depends on the plan; if it is 7 days, the 05:07 records go around 2026-10-30.
  - The extracts above cover the key rows, but not every log line. A full export is the owner's to take from the dashboard.
- **The Management API listing keeps only current versions.** Today's listing, with versions, `updated_at` times and bundle hashes, is captured in `live-reads-2026-10-23.jsonl`.
