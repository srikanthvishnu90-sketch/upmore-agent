# Root causes — the run.sh ledger failure, the rollback pin, and the C9 composition (2026-10-22)

Three findings from rebasing `muse/2026-10-22-chat-begin-caller` onto
`origin/arch/pin-landing-candidate-bridge` @ `348c2d4a` and running `tests/db/run.sh`
end to end on PostgreSQL 16.14 (npm embedded-postgres 16.14.0-beta.17 server binaries +
a psql 16.14 built from the official source tarball; the zonky distribution ships no
psql). All runs were against throwaway local clusters; no live database was touched.

## 1. The migration-ledger failure on the pre-rebase branch (owner's exit 3) — REPRODUCED

Command: `bash tests/db/run.sh` on the branch as it stood at `bcf70f1d` (base `5ffab100`).
Result: exit 3 at the "migration ledger (--pending)" step, silently (the failing output
is captured into a shell variable; the script's `set -e` kills it before any FAIL line).

The captured ledger output, recovered by instrumenting a scratch copy, ends with:

```
psql:supabase/migrations/20261024120000_career_apply_agent_cloud_begin.sql:100: ERROR:  type "public.career_apply_batch_approvals" does not exist
```

Why: the ledger leg applies every migration file present on the tree that the ledger
does not yet record, in filename order, in one transaction. The pre-rebase tree carried
the F-030 migration but NOT its chain — `20261024090000` (which creates
`career_apply_batch_approvals`) and `20261024100000` were absent — so when the ledger
transaction reached the F-030 file, its helper declared a variable of a type whose
creating migration was not on the tree. The first `--pending` invocation rolls back and
its captured text still satisfies the leg's greps (the pending list prints before
execution); the failure surfaces on the leg's second invocation, whose psql exit code 3
propagates as the script's exit code, with no message. Fix: the rebase itself — on a
tree that carries the whole chain, the ledger leg applies the chain in order and passes
("ok ledger backfilled, only new files applied, a re-run applies nothing").

## 2. The rollback pin — a defect the F-030 migration itself introduced, fixed in the file

On the rebased tree the run next failed at the owner's rollback dance for
`20261024090000` (up, down, down, up):

```
psql:supabase/rollbacks/20261024090000_career_apply_agent_submit.down.sql:22: ERROR:  cannot drop table career_apply_batch_approvals because other objects depend on it
DETAIL:  function career_apply_agent_contract_approval(jsonb,text) depends on type career_apply_batch_approvals
```

The 20261024090000 rollback drops the two agent RPCs it knows by name, then the table,
"no cascade anywhere". The pre-existing contract function (20261024100000) also declares
the table's rowtype, but the rollback drops that function first, clearing its pin. The
F-030 helper is a NEW function the rollback cannot know about; its typed variable — and
its composite return type — pinned the table and stopped a documented owner rollback.

Fix (in `20261024140000_career_apply_agent_cloud_begin.sql`): the helper works on a
`record` and returns the approval as `jsonb` (`row_to_json(a)::jsonb`); both doors read
the approval id from that jsonb. No variable or return type in the file names a table
type. The six contract rules' text is byte-identical to 20261024100000's; behavior is
unchanged (proven by the leg below). A migration that adds a function over an existing
table must not hold a type dependency a prior rollback cannot see — that is the
permanent rule this note records.

## 3. The composition question — C9 (NOT resolved here; owner's/architect's call)

With the pin fixed, the run reaches the F-030 leg at the final schema and the leg
executes — and the begin→claim chain meets the card-cloud bridge's design decision C9
(`docs/architect/reviews/CARD-CLOUD-BRIDGE-DESIGN.md`: "card is the only cloud
authorization route, including old text cards"). The bridge (20261024130000) re-created
`career_apply_cloud_refusal`/`career_apply_cloud_claim_at` to require a durable
cloud-mode Messages card binding for the exact row/approval; absent a binding the
refusal is `not_card_approved` — the design's own test matrix names this exact case
(`direct_enqueue_not_card_approved`: "live waiver refusal accepts an unbound valid cloud
payload → not_card_approved, zero claims"). Measured on the rebased tree, gate closed
and gate open alike: the chat-begun row is refused `not_card_approved`, the claim takes
nothing, and the row waits intact (queued, source null, batch hash stamped).

So the F-030 door's enqueue is claim-shaped but not claim-authorized on this line. Two
compositions exist, and choosing between them is a product decision, not a repair:

- (A) The chat approval becomes a card approval: the in-chat card (modules 175/176)
  mints the durable binding through the bridge's own machinery, so a chat begin is
  claimable by the same route as a Messages card tap.
- (B) C9 stands absolute: direct-enqueue doors are retired on this line, chat approvals
  feed the card flow, and `career_apply_cloud_begin_agent_own` is not carried forward.

The SQL leg now characterises the chain as it stands (door + contract + gate + tallies
at full strength; the claim asserted to refuse the unbound row, with C9 cited in the
file). F-030's ledger entry records the begin side as fixed and the claim side as
blocked-by-design pending that decision.
