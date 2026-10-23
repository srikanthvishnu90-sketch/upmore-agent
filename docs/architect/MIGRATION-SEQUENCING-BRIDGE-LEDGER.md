# Migration sequencing: the draft card-cloud bridge and the one ledger

2026-10-23. Branch `arch/migration-sequencing`, stacked on G3 (`arch/backend-g3-approval-ledger`). Nothing here has been
applied anywhere. Production is frozen; migrations are the owner's to apply.

## The hazard

Two migration files each replace the whole of two functions:

- `20261024130000_career_apply_card_cloud_bridge.sql`: the staged draft bridge (DRAFT / NOT APPLIED, unattributed). It is
  kept byte for byte as evidence: sha256 `c5ac429e…0fc8`, and its rollback `5716f725…1186`. The order test pins both.
- `20261025100000_career_apply_one_ledger.sql`: G3.

The two functions are `career_apply_claim_own(integer, text)` (the person's own computer) and
`career_apply_cloud_refusal(career_apply_jobs, timestamptz)` (every cloud check). `create or replace` keeps none of the
previous body. So whichever file is applied last decides both functions, and the other file's checks are gone from them.

| What each file puts in the two functions | Bridge | Ledger (G3) |
|---|---|---|
| Shared maintenance lock before the person's lock (the rollback takes it exclusively) | yes | no |
| The person's claim skips cloud-bound jobs (`cloud_bound_jobs`) | yes | no |
| The cloud first checks the card binding (`cloud_bound_refusal`), then the two switches | yes | no |
| The cloud's daily cap is at most 15 (7bbd2096) | yes | 25 default |
| Every claim closes, as not sent, an application changed since its approval (`career_apply_void_unsendable`) | no | yes |
| The claim and the cloud recompute the payload hash, not just compare the stored two | no | yes |
| The company cooldown reads the one ledger (queue + extension reports + old batch stack) | queue only | yes |

## What each order does (proved on a throwaway Postgres: `tests/architect/bridge-ledger-order.test.ts`)

| Order | Without this plan | With this plan |
|---|---|---|
| A. No bridge (CI and production today) | G3 whole | G3 whole; the reconcile reports `ledger` |
| B. Bridge after the ledger: the bridge held now and approved later, applied on its own (what `tests/db/run.sh` did) | **G3 lost**: a payload changed after approval is handed to a drive | the launch scripts reconcile after every apply → whole (`merged`) |
| C. Filename order with both pending (`apply-rails-and-seed.sh --pending`, go-live) | **bridge's half lost**: the person's claim selects cloud-bound jobs. The bridge's own trigger then refuses them, so the person's whole claim fails and nothing of theirs is sent | `20261025110000` runs after both → whole (`merged`) |
| D. The bridge's rollback after the ledger | **G3 lost** (the rollback reinstalls the pre-G3 functions) | reconcile → whole (`ledger`) |

In B and D, G3 is lost silently: nothing fails, and the claim simply stops re-checking. In C the failure is loud but
it is a denial of the person's own queue.

The G3 branch carries a smaller proof that needs no reconcile (`tests/architect/g3-bridge-order.test.ts`). In filename
order the claim still refuses a tampered payload; with the bridge applied after the ledger, the re-check is gone and
the tampered application is claimed.

## The plan

1. **`20261025110000_career_apply_bridge_reconcile.sql`** (new; the bridge file is untouched):
   - `career_apply_reconcile_bridge()` takes the bridge's maintenance lock exclusively, then installs the two
     functions as they must be for what is installed:
     - the bridge's tables exist: the bridge's text, plus G3's lines;
     - otherwise: 20261025100000's text exactly.
   - Where both files change the same check, one wins, by name: the cloud's daily cap is the bridge's (15); the company
     cooldown is the ledger's (a superset of the bridge's queue-only one, dated the same way since G3's ledger date fix
     c7646999).
   - The order test's text step checks this line by line:
     - every bridge line and every G3 line is present, in its file's order;
     - nothing comes from elsewhere;
     - only the two named lines give way.
   - `career_apply_guards_missing()` lists each guarantee the live definitions lack: G3's always, and the bridge's
     while it is installed. It is empty when whole.
   - The file runs the reconcile once (order C).
2. **`scripts/launch/verify-claim-guards.sql`** reconciles, then stops the run with the missing guarantees named unless
   none is missing. Before 20261025110000 is applied it does nothing. Wired into:
   - `apply-rails-and-seed.sh`, after `--pending` and `--all` (order B through the owner's script, step B' of the test;
     with the hook removed, B' fails);
   - `trainee-go-live.sh`, after its migrations. 20261025110000 is listed with its mark, and
     `tests/trainee-go-live.test.cjs` requires the verify line after the last migration;
   - `tests/db/run.sh`: run.sh's historical phases re-create older versions of G3's functions after its ledger step,
     so its end state lacked `career_apply_claim`'s re-check, `email_reserve_for`'s ledger and the approval freeze. It
     now re-applies 20261025100000 and 20261025110000 last and verifies (`whole (ledger)`). It then applies the bridge
     and verifies (`whole (merged)`), and only then runs the bridge's own pending tests. Those tests (card cloud,
     lifecycle, 15-a-day cap) pass on the merged functions: the bridge's guarantees survive the merge. Before, they ran
     on functions without G3.
3. **Order D (rollback)**: the owner runs `psql -f scripts/launch/verify-claim-guards.sql` after
   `supabase/rollbacks/20261024130000_…` (the rollback file is evidence and is not edited). Until then, G3 is missing
   from the two functions.
4. **One wording change in G3**: its two `approval_fixed` refusals now say "immutable", the bridge contract's word. With
   both triggers installed, G3's fires first, and the bridge's tests assert the refusal by that word. The behaviour is
   unchanged; G3's tests match `approval_fixed`, which stays.

## Release verification (for the owner's apply, when the freeze lifts)

After any apply, rollback or manual migration, run `psql "$SUPABASE_DB_URL" -X -f scripts/launch/verify-claim-guards.sql`.
It must print `claim guards: whole (ledger)` or `whole (merged)`. A read-only check is
`select public.career_apply_guards_missing();`, which must return `{}`.

## Limits, said plainly

- **A window remains in order B.** The bridge commits on its own (it owns BEGIN/COMMIT). The reconcile runs in the
  next statement. Between the two, a claim would run the bridge's version without G3's checks. The window is one
  statement long and the launch scripts close it, but it exists. Applying with the workers stopped closes it fully.
- **Go-live wraps the bridge in `--single-transaction`.** Unrelated to this plan and not changed here: go-live applies
  every listed file that way, the bridge included, while `apply-rails-and-seed.sh` deliberately does not ("this
  reviewed bridge owns BEGIN/COMMIT"). The bridge's inner COMMIT ends the outer transaction early, so its ledger row
  lands outside it. Go-live also lists the bridge for apply although the bridge is DRAFT / NOT APPLIED. Both are for
  the owner's go-live review.
- **The guard is text-based.** `career_apply_guards_missing()` reads the function definitions for each guarantee's
  call or predicate. The behaviour behind each line is proved by the tests: G3's 14 steps, the order test's claims,
  and the bridge's own tests. The guard catches a replacement; it does not prove a correct body.
