# Live apply, 2026-10-21 17:39 CDT: 20261024120000 (D-010 gate waiver), project mrwngntwmnaqrqhupvlt

Owner's word 2026-10-21 17:31 CDT (verified on his phone channel): gate-rule change approved, option (a), scoped to the
first approved test batch; every send still requires his tap on the exact hash-bound payload in Messages.
Source: `wo/first-real-submission` @ 22db3d94. File sha256 bbebd72330867f1c78e03162c1df79701027b5891f81fb1c572ed1b5fc96bd9a.
Ledger `public.upmore_migration_ledger`: 22:39:53 UTC.

**Audit:** one new table (`career_apply_cloud_gate_waivers`, RLS on, service_role only), one new function
(`career_apply_cloud_waiver_left`, service_role only), two functions re-created from 20261021080000 with one change each
(`career_apply_cloud_refusal`: the gate line; `career_apply_cloud_claim_at`: waived candidates). No data written; no
existing table altered. Without a waiver row the gate behaves exactly as before.

**Pre-state:** CAREER_AGENT_SUBMIT no row (off), agent_submit_enabled false, cloud switch off, lever gate closed, settings
rows 0, jobs 0, opt-ins 0, cloud events 0, waiver table absent; live refusal/claim_at prosrc md5 60839d70… / 7faefe13… =
the repo's 20261021080000 bodies; caps: career_apply_daily_limit md5 e8c335af…, career_apply_enqueue md5 56381275….

**Verify after:** CAREER_AGENT_SUBMIT no row, agent_submit_enabled false; cloud off; lever gate closed; settings 0, jobs 0,
opt-ins 0, cloud events 0, waivers 0; waiver table RLS on, ACL {postgres, service_role}; waiver_left ACL
{postgres, service_role}; refusal carries the waiver condition; refusal/claim_at ACL {postgres} (as before);
caps unchanged (daily_limit e8c335af…, enqueue 56381275…); waiver_left(random person, lever) = 0; claimable now = 0.

**Not done by this apply:** no waiver row exists yet. The scoped waiver for the first test batch is one statement, run
once his account is named (the account he will approve from in Messages):
`insert into public.career_apply_cloud_gate_waivers(user_id, portal, max_sends, expires_at, note) values ('<his user id>',
'lever', 1, now() + interval '72 hours', 'first approved test batch, owner 2026-10-21 17:31');`
It still opens nothing alone: CAREER_CLOUD_APPLY must be 'on', he must opt in, store his resume for the cloud, and
approve the exact payload.

**Staged rollback (not run):** `supabase/rollbacks/20261024120000_career_apply_cloud_gate_waiver.down.sql`.
