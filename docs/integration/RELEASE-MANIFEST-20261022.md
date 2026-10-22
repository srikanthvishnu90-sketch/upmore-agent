# Release manifest: migrations (2026-10-22, reviewed by the architect)

**Rule: fail closed.**
- Only the files under **APPLY** are applied, one at a time, in this order, through the Supabase connector. `trainee-go-live.sh` is not used for migrations.
- Each one is applied only if its live check (the go-live script's mark) reads false.
- Each one gets a snapshot first (`pg_get_functiondef` of every function it replaces), runs in one transaction, and has its live check re-read afterwards.
- Any file not listed here is not applied, whatever a comment in it claims. Repo comments grant nothing.
- The candidate is agent-chat in router mode (`CAREER_BRAIN` unset), plus telegram-inbound and whatsapp-inbound from the frozen SHA.
- Live schema read 2026-10-22 ~23:40 UTC. Live has no migration ledger.

## APPLY (needed by the candidate's code: it calls a table or RPC that is missing live)
| # | File | Effect | Why the candidate needs it | Rows after deploy / rollback |
|---|---|---|---|---|
| 1 | 20261020120000_career_events | new table `career_events` (timeline) | agent-chat writes `career_events` | rows kept; rollback leaves the table (v248 never reads it) |
| 2 | 20261020120100_career_events_erase | replaces `career_host_commit` with the same signature (live args match) and adds erase of `career_events` | erase must cover the new table | rows kept; rollback restores the snapshotted definition (live md5 44e33a74…) |
| 3 | 20261021010000_career_outreach | outreach drafts, do-not-contact list, prefs, claim, email checks; widens `career_events_kind_check` | code calls `career_outreach_*`, `career_email_checks`. Sending stays gated by `CAREER_OUTREACH_SEND` (off) | rows kept; the kind check is never narrowed again once rows exist |
| 4 | 20261021020000_career_voice_mock | `career_voice_create` | code calls it | kept; leave in place |
| 5 | 20261021030000_career_hired_backgrounds | `career_pdl_calls`, `career_pdl_credits_month`, `career_hired_cache` | code calls them; with no PDL key there are no calls and no spend | kept; leave |
| 6 | 20261021050000_career_brief_digest | `career_interviews`, `career_digest_prefs`; replaces `career_host_commit` (same signature; adds the interviews erase) | code calls them | kept; restore the snapshotted function |
| 7 | 20261021090000_career_mail_erase | `career_mail_on_erase` trigger (mail tables are already live) | erase completeness | kept; drop the trigger to roll back |
| 8 | 20261021110000_career_board_state | `career_board_state`, `career_alerts_sent_since` | code calls `career_alerts_sent_since` | kept; leave |
| 9 | 20261021130000_career_mail_model_calls | `career_mail_model_claim` | code calls it; the mail model stays off (D-025) | kept; leave |
| 10 | 20261022110000_career_postings_pay | nullable `pay` column on `career_postings` | the search reads pay | kept; leave |
| 11 | 20261022120000_career_control_state | `career_user_quiet`, `career_quiet_users`; replaces `career_outreach_claim` | pause and quiet control | kept; restore the snapshot |
| 12 | 20261022120500_career_deploy_ledger | `career_deploy_ledger` (deploy provenance) | records this deploy | kept |
| 13 | 20261023100000_career_events_apply_queued | widens `career_events_kind_check` (apply_queued) | event kinds the code writes | kept; never narrowed again |
| 14 | 20261024140000_career_batch_approve_exclude | **only if #165 is in the frozen SHA.** Exclusions in a card-bound batch approval | the bound text-yes path | kept |

## ALREADY LIVE (live check true; nothing is applied; read by effect)
- **20261024090000_career_apply_agent_submit:** batch approvals of exact entries. The agent begin runs only with `CAREER_AGENT_SUBMIT` on. Live rows: 0.
- **20261024100000_career_apply_agent_contract:** a stricter WO-102 contract on the agent begin.
- **20261024110000_career_apply_cloud_ask:** a needs_answers field becomes a question row (ask, never guess). Live rows: 0.
- **20261024120000_career_apply_cloud_gate_waiver:** a cloud-gate waiver for one named person and portal. **A submit-path effect that is already live.** Live rows: 0. Nothing tonight adds a waiver.

## HELD (not applied; reasons in the architect's review)
- **20261024130000_career_apply_card_cloud_bridge:** cloud submit authorization; a real-account enrollment (widens the audience); rewrites the shared claim and begin functions. Outside the approved feature.
- **20261021220430_career_apply_message_cards:** TEST-only tap cards. Held until a PG16 run proves its `career_apply_jobs` trigger leaves the extension and cloud routes unchanged.

## EXCLUDED (the candidate does not call them; effect unreviewed for tonight)
- **20261020110000_career_connector:** introductions between real users (new audience).
- **20261020130000_career_resume_tailoring.**
- **20261021100000_career_proactive_last_word:** for career-proactive, which is held.

## Verification after the apply
Every live check above reads true. The live args of `career_host_commit` are unchanged. A smoke test with synthetic TEST users goes through chat, erase, and card readback.
