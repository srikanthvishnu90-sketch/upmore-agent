# agent-chat v249: deploy reconciliation (2026-10-23)

This is a read-only reconciliation. Nothing was deployed, migrated, written or read from secrets to produce it.

The sources used were:
- the Supabase Management API function listing (`list_edge_functions`);
- the project's platform logs (`query_logs`);
- read-only SQL;
- git history;
- GitHub Actions run history.

Each line below names its source. "Not established" means the read-only evidence does not settle it.

## FLAG: a production deploy happened after the release was held

- **Six functions changed together.** Six edge functions changed version between 05:07:12 and 05:07:30 UTC on 2026-10-23.
- **The hold came first.** The hold was recorded 2 h 13 min earlier, in `ebf869ca` at 02:54:04 UTC ("Router eval: … (release held)"), `docs/integration/ROUTER-EVAL-20261022.md`.
- **Nothing in this repo or database authorizes the deploy.** No deploy ledger row, no migration, and no manifest entry matches it.
- **The actor could not be established from read-only metadata.**

## (a) career_deploy_ledger

- **It does not exist live.** `to_regclass('public.career_deploy_ledger')` returns null (read-only SQL, 2026-10-23).
- **Its migration was never applied.** `20261022120500_career_deploy_ledger.sql` is not in `upmore_migration_ledger`.
- **So there is no deploy record anywhere.** The audit line claiming "Ships inside agent-chat v249 (deploy record 2026-10-23, trunk 373453f3)" cites a record that exists in neither the repo nor the database.
- **The ledger's absence does not mean there was no deploy.** A manual deploy bypasses the ledger. The rest of this doc uses platform metadata instead.

## (b) What deployed, when, and under what configuration

### Deployed functions

Source: Management API listing, `updated_at`. It was read twice on 2026-10-23 and both reads agree.

| function | version | updated (UTC) | bundle sha256 (ezbr) |
|---|---|---|---|
| agent-chat | 249 | 05:07:12.392 | 569eea2b…693a9f |
| agent-exec | 76 | 05:07:23.741 | 8fc39a01…f33811 |
| delete-account | 41 | 05:07:25.678 | 0827979e…0fef |
| telegram-inbound | 8 | 05:07:27.561 | ad583489…70f2 |
| site-careers | 10 | 05:07:29.108 | b85ff960…e2ce |
| site-signup | 10 | 05:07:30.587 | f8f4ac0c…a0 |

`whatsapp-inbound` was not redeployed. It stayed at v6, last updated 2026-10-20 13:24:50.

### Platform logs

Source: `function_logs`, function id `285cb36c` (agent-chat).
- **First traffic.** v249 first booted at 05:09:58.782 and first served at 05:10:02 (POST 200).
- **v249 is the only version in the logs.** It is the only agent-chat version seen from 2026-10-22 18:00 to 2026-10-23 18:00: 356 log lines, the last at 12:30:10.

### Not the deploy the manifest describes

The manifest is `docs/integration/RELEASE-MANIFEST-20261022.md`, `d2ae6715`, 01:19 UTC. It describes:
- agent-chat in router mode, plus telegram-inbound and whatsapp-inbound;
- migrations applied first, including the deploy ledger, which "records this deploy".

What actually changed differs on four counts:
- whatsapp-inbound was not deployed;
- agent-exec, delete-account, site-careers and site-signup were deployed but are not in the manifest;
- no migration was applied that day (`upmore_migration_ledger` has 72 files, the last applied 2026-10-21 22:39:53);
- no ledger exists.

### Deployed code is ahead of the live schema (new finding, a live defect)

- **v249 reads three tables that do not exist.** Every v249 request logs `situation: … Could not find the table` for `career_events`, `career_outreach_drafts` and `career_interviews`.
  - That is 177 such lines out of 356 v249 lines (`function_logs`).
  - All three tables are absent live (`to_regclass`).
- **The migrations that create them are not applied.** Their migrations, none of which are in `upmore_migration_ledger`, are:
  - `20261020120000_career_events.sql`;
  - `20261021010000_career_outreach.sql`;
  - `20261021050000_career_brief_digest.sql`.
- **The reader handles the failure.** `career_situation.ts:176` logs the error and marks the key unreadable, so the turn continues.
- **What the person is affected by.** Every live turn's situation is missing:
  - their last search;
  - their outreach drafts;
  - their interviews.

### Source SHA (not established)

- **The bundle itself could not be fetched.** `get_edge_function` for agent-chat fails with an internal error, likely because of its size. So the bundle hash cannot be compared with a build of any commit.
- **The code is newer than 7498ea8d.** The deployed code calls `readSituation` (`career_situation.ts`), which was added in `7498ea8d` (WO-100, 2026-10-21 00:26 UTC).
- **It appears to predate fallback-honest.** Since 05:07, 29 assistant messages were sent:
  - 1 uses the old fallback "I didn't catch that";
  - 0 use the fallback-honest opener "I'm Trainee".

  This is consistent with a source that excludes `36bac970` (03:39 UTC). It is a single observation, not proof.
- **The likely range.** `373453f3` (release pins, 00:58 UTC) fits both bounds, but so does any commit between `7498ea8d` and `36bac970`, and so does a side-branch tip.

### Configuration (not established)

- **Secrets and environment variables are not readable**, and none were requested.
- **Router mode is indirectly supported.** Every recorded intent since the deploy is a router intent (`career_fallback`, `company_intel`, `prep_brief`, …), and there is no agent-brain marker. This is consistent with router mode (CAREER_BRAIN unset or `router`). It does not prove that CAREER_PDL is off.
- **Only one person used it.** One distinct user has sent messages since the deploy.

### Actor (not established)

- **Not GitHub Actions.** No workflow in this repo deploys edge functions. The only runs near 05:07 were `ci` at 04:17, 05:20, 05:27 and 05:49 (Actions history).
- **Not this architect session.**
  - Its transcript has no edge-function deploy call on 2026-10-23.
  - Between 05:05 and 05:12 it ran only git and GitHub reads.
  - Its earlier Supabase writes were two `apply_migration` calls and one secret, all on 2026-10-11, plus one CLI deploy attempt on 2026-10-12.
- **Not visible in the platform metadata either.** The function listing and the logs available to this access level carry no actor field.
- **A first auth event follows at 05:08:33.** `auth_audit_logs` shows its first event of the window then, 81 s after agent-chat changed. That is a sign-in near the deploy, not evidence of who deployed.

## (c) Current live agent-chat

- **Version.** agent-chat is **v249**, ezbr `569eea2bedc74462a87bac62371e977eb31675c48db59270d62caa6800693a9f`, updated 2026-10-23 05:07:12 UTC.
  - Evidence: the Management API listing read on 2026-10-23, and function logs showing only v249 serving from 05:09:58 onward.
- **Source commit and config.** Both remain unconfirmed.

## Assessment against the hold

- **The deploy breaches the hold.** The routing release was held at 02:54 UTC after the measured comparison. No later record authorizes a deploy. A deploy of agent-chat at 05:07 conflicts with that hold.
- **It also breaches the manifest's own preconditions:** migrations first, and a recorded ledger row.
- **Whose permission it needed.** Under the standing rule, deploys need the owner to do them or say yes in writing (CLAUDE.md). If the owner ran it, it was within their authority, but it is unrecorded and differs from the manifest. If anyone else ran it, it was unauthorized.
- **Only the owner can tell which.** Supabase dashboard → Edge Functions → agent-chat → deployment history, or the CLI login on the deploying machine, would name the actor.

## Needed from the owner (no action taken here)

1. Say whether you ran the 05:07 deploy, and from which checkout.
2. Decide whether v249 stays live. It serves every turn without three tables.
   - Applying the missing migrations is an owner apply.
   - Rolling back is an owner deploy.
   - Neither is done here.
