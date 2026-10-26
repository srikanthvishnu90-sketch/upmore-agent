-- The claim guards after any migration apply (docs/architect/MIGRATION-SEQUENCING-BRIDGE-LEDGER.md): the staged draft
-- card-cloud bridge (20261024130000) and the one ledger (20261025100000) both replace career_apply_claim_own and
-- career_apply_cloud_refusal, so whichever was applied last decides them. This installs the two as they must be for
-- what is installed (career_apply_reconcile_bridge, 20261025110000) and stops the run with the missing guarantees
-- unless nothing is missing (career_apply_guards_missing). Before 20261025110000 is applied it does nothing.
-- Run by apply-rails-and-seed.sh and trainee-go-live.sh after their migrations, and by tests/db/run.sh.
do $$
declare r text; m text[];
begin
 if to_regprocedure('public.career_apply_reconcile_bridge()') is null then
  raise notice 'claim guards: 20261025110000 not applied yet, nothing to check'; return;
 end if;
 execute 'select public.career_apply_reconcile_bridge()' into r;
 execute 'select public.career_apply_guards_missing()' into m;
 if cardinality(m) > 0 then raise exception 'claim guards missing (%): %', r, array_to_string(m, '; '); end if;
 raise notice 'claim guards: whole (%)', r;
end $$;
