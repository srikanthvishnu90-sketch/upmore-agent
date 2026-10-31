# Scorecard, 2026-10-31: where Trainee really stands

Written against `trunk` at `5d6857219` (PR #348). Honesty over comfort. A number with no evidence is marked UNMEASURED.

## 0. Evidence base and its limits

| Fact | Evidence |
|---|---|
| Trunk CI is green at `5d6857219` | `gh` run 41182720697 (`ci`): database, gate (core 1-2/2), gate (architect 1-6/6), gate (forms-ci coverage 1-5/5), gate (browser), load (send rail) all `success`. Run 41182720682 (`deploy-preflight`) `success` |
| Production runs old code | last successful `deploy-production` is run 40972523269 at `33f7d00d1` (2026-10-29 23:20Z). Every later run on `release/production` is `cancelled` or waiting for approval (e.g. 41171830902 waiting, 41183608373 pending at `5d6857219`). `git rev-list --count 33f7d00d1..HEAD` = 120 commits; 22 migration files differ (`git diff --name-only ... supabase/migrations`) |
| Owner launch hold | `docs/launch/GOOGLE-VERIFICATION-2026-10-26.md`: no deploys, Vercel or DNS changes without the owner |
| Live production state | last READ on 2026-10-28/29 and recorded in `docs/architect/FEATURES.md` section 0: 0 real employer submissions (only the `Example Corp (TEST)` row), 1 Telegram contact, 0 Google grants, 0 subscriptions, 0 alerts ever delivered, 186,866 postings from 27,751 boards. I did NOT re-query production for this scorecard (read-mostly task, no production access taken), so every "live" claim is as of those dates |
| Brain not released | `supabase/functions/agent-chat/career_brain.ts:32` `AGENT_BRAIN_RELEASED = false`; the regex router `142-career-router.js` answers every production text |
| Latest brain eval | last successful `brain-eval` run 40386610748 (2026-10-26). Router 23/38 = 60.5% held-out and brain 89.5-94.7% on an unsealed set are quoted from FEATURES.md and `evals/career/SCORE-LOG.md` (last row 2026-10-21). No eval of current trunk exists: UNMEASURED |
| Test volume | 1,224 test files under `tests/` (405 in `tests/architect`, 93 of them `scenarios-*`/`flow-scenarios-*` batteries, 150 SQL in `tests/db`). Volume is not outcome. Most batteries drive the handler with fake channel APIs, not a real channel |
| Open work | 46 open PRs (`gh api repos/.../pulls?state=open`), including built-but-unmerged #195 web, #199 waves, #201 resume files, #215 attachments, #216 workflows, #234 outcomes, #252 planner, #274 checkout, #338 search |

Scoring rule: 10 = every link present AND outcome-tested on every channel AND verified live in production. Because almost nothing has been seen working live with a real person, no feature can honestly score above 6.

## 1. Map of the codebase (one line each)

Tests are counted as test/battery files that reference the module (`grep -rl`).

1. `supabase/functions/agent-chat/handler-career.ts` (1,200 lines): the one door for web/agent chat; auth, 60 turns/h limit, turn gate, ~25 code-first turns, then brain or router. Called by every channel bridge; 96 test files.
2. `supabase/functions/_shared/router_core.career.js` built from `packages/domain/142-career-router.js` (~15k lines, ~120 intents): the regex router that answers live today. 77 and 85 test files (`tests/career-*.test.cjs`). Rebuild with `python3 scripts/build-router-core.py --career-only`.
3. `_shared/agent/loop.ts`, `career_tools.ts` (36 tools), `prompt.ts`: the model brain; policy at the tool boundary. Pinned off. 19 and 44 test files; evals in `evals/career/`.
4. `agent-chat/career_staged.ts`, `_shared/career_reply_writer.ts`: switch-gated routing of questions to the model and the final-reply rewriter. Both default off. 6 and 2 test files.
5. `_shared/career_host.js`, `career_persistence.js`, `career_pool.js`: the host that carries router snapshot, memory and the posting pool turn to turn. Covered by `tests/career-account-memory-host.test.cjs`, `career-persistence-postgres.test.cjs`.
6. `_shared/career_account_memory.ts`, `career_standing.ts`, `career_situation.ts`, `agent/memory.ts`: account memory, standing answers, the per-turn situation block. 7-9 test files each (`wo-107-standing.test.ts`).
7. `career-ingest/` + `_shared/career_ingest*.ts`: scheduled poll of ATS boards into `career_postings`; called by pg_cron lanes. 44 test files (`career-ingest-bounded.test.ts`, `scenarios-ingest-r2*.test.ts`).
8. `_shared/career_search.ts`, `career_search_judge.ts`, `career_floor.ts`, `posting_*.ts`: search, fit floor, pay/place/region parsing. 11 files; judge is switch-off.
9. `_shared/career_alerts.ts`, `career_alert_store.ts`, `career_watch_alerts.ts`, `career-proactive/`: instant alerts and daily report; called by the proactive schedule. 19 and 32 test files (`flow-scenarios-proactive-r2.test.ts`).
10. `_shared/career_tailor.ts`, `career_tailor_rewrite.ts`, `career_materials_guard.ts`, `essay_draft.ts`, `career-essay-draft/`: tailoring and truth guard. 43 files; guard has 4 (`scenarios-tailoring-r2.test.ts`).
11. `_shared/channel_resume_upload.ts`, `career_resume_record.ts`: resume intake and the one confirmed resume. PDF/DOCX/RTF reading is PR #201 (open).
12. `_shared/career_apply.ts` family, `career_apply_gate.ts`, `career_apply_screen*.ts`, `apply_here.ts`, `apply_trust.ts`: plan an application, screen it, bind the approval to a payload hash. Screen is now wired (`apply-screen-wired.test.ts`); 30 files touch the store.
13. `workers/career-browser/` (`approve-first.ts`, `apply-vm*.cjs`, `ats-fill.cjs`, `parallel-apply.cjs`, `dry-run.cjs`): the engine and the VM worker that fill and submit Greenhouse/Lever/Ashby. 53 files reference `approve-first`; `flow-scenarios-submit-worker.test.ts`, `mass-submit-*.test.ts`, `dry-run-network.test.ts`.
14. `career-cloud-runner/`, `workers/career-cloud/`, `_shared/cloud_runner.ts`, `career_prepare_ahead.ts`: hosted preparation of applications before the person asks. Gated; `career-cloud-worker-card-bridge.test.cjs`.
15. `extension/` (Chrome MV3 panel, fill, sync) + `extension-sync/`: the person's-own-browser apply path (D-017). 69 files; `career-extension-browser.test.cjs`. Not in the Chrome Web Store.
16. `_shared/career_mail*.ts`, `career_inbox_followups.ts`, `mail_providers.ts`, `gmail-oauth/`, `outlook-oauth/`, `outlook_*.ts`: read the person's mail, upgrade submissions to confirmed, follow-ups. 48 files. Needs a grant; none exists.
17. `_shared/career_email_code*.ts`, `career-email-code/`: employer code read once from the person's Gmail. 2 files (`wo-096-email-code.test.ts`).
18. `_shared/career_people*.ts`, `career_networking*.ts`, `career_referrals.ts`, `contact_sources/`: find people from the person's own sources, intros. 25, 16 and 1 files (`scenarios-networking-r2.test.ts`; referrals only `wo-033-outreach.test.ts`).
19. `_shared/career_outreach*.ts`, `career_send_rail.ts`, `career-send/`: outreach drafts, approval, once-per-address sending. 67 files; `tests/load/send-rail-load.test.ts`, `scenarios-outreach-r3.test.ts`.
20. `_shared/career_mock*.ts`, `career_offer*.ts`, `career_path.ts`, `research_reply.ts`, `agent/research/`, `agent/knowledge/`, `career-voice/`: mock interviews, offers math, company research, voice mock. 15, 5, 6 files (`scenarios-research-r2.test.ts`).
21. `_shared/career_digest.ts`, `proactive.ts`, `career_people_reminders.ts`, `agent-workflows/`: reminders and digests. 3 files for digest (`wo-034-brief-digest.test.ts`). Planner is PR #252 (open).
22. `_shared/channel_*.ts`, `telegram*.ts`, `trainee-telegram/`, `trainee-telegram-link/`: Telegram channel, login, link ownership (just hardened in #348). 35 files for inbound; `scenarios-telegram-r3.test.ts` (10,600 scenarios).
23. `_shared/loopmessage*.ts`, `trainee-inbound/`, `trainee-deliver/`, `message_delivery.ts`: iMessage via LoopMessage, once-only delivery. 21 and 2 files; `scenarios-channel-delivery`, `-r2`.
24. `_shared/whatsapp*.ts`, `trainee-whatsapp/`, `whatsapp-inbound/`: WhatsApp Cloud API plus Twilio adapter. 40 files. No SMS channel type: `channel_adapters.ts:11` lists three channels.
25. `_shared/file_*.ts`, `trainee-file/`, `connect_*.ts`, `trainee-connect/`, `telegram_login.ts`: signed hosted pages (phone login, Apply buttons, connect Gmail). 12 and 2 files.
26. `index.html` built from `src/upmore-app-template.html` by `src/build-app.py`: the web app, still mostly "Upmore" (81 "Upmore" vs 9 "Trainee" in the template). Browser tests only; Trainee `/app` is PR #195 (open).
27. `_shared/career_billing.ts`, `stripe-*`: billing and cancel by text. 18 files. Checkout is PR #274 (open); 0 subscriptions at last read.
28. `_shared/model_gateway.ts`, `model_budget.ts`, `career_spend_cap.ts`, `ops_monitor.ts`, `ops-monitor/`, `model-health/`: OpenAI-only gateway, budgets, alerts. 3 and 2 files.
29. `_shared/claim_guard.ts`, `agent/reply_guards.ts`, `fact_quarantine.ts`, `identity_redact.ts`, `ai_policy.ts`: no-invented-facts and injection guards. Covered by `scenarios-secrets`, `scenarios-adversarial-r2`, `fact-quarantine.test.ts`.
30. `_shared/account_delete.ts`, `delete-account/`, erase triggers in `supabase/migrations/` (198 files): privacy, forget, erase. `flow-scenarios-erase-r2.test.ts`; no data export on trunk (PR #274).
31. `packages/career-data/`, `packages/domain/12x-15x`: question banks, company records, board directory (27k+ boards), legacy domain modules still bundled into the router.
32. Dead weight: 40+ finance modules in `packages/domain/` (32-118), `plaid*`, `simplefin-*`, `agent-payments`, `broker-oauth-*`, `news-feed`; removal is PR #257 (open). It enlarges the attack surface and the review load.
33. `evals/career/` (brain eval, SCORE-LOG, held-out), `evals/apply/`, `.github/workflows/` (24): measurement; `apply-bench-live.yml` last success run 41035532678 (2026-10-30, extension filled on 17 captured real pages, never sent).
34. `scripts/launch/` (go-live, secrets-audit, smoke) and `deploy-production.yml`: the deploy path, owner-gated.

## 2. The scorecard

Overall: **3.5 / 10** (mean of the 11 rows: 3+4+3+2+5+4+3+3+3+6+3 = 39 / 11).

Hours are ESTIMATES of engineering/owner effort to earn the next point, not measured.

| Feature | Score | Evidence | Missing for the next point | Owner action needed | Est. hours |
|---|---|---|---|---|---|
| Mass applying | 3 | Engine, queue, fairness, host backoff on trunk. `docs/architect/evidence/parallel-apply-20261028/summary.json`: 5 apps in 2.6 s parallel vs 5.5 s serial, but against a MOCK server. `flow-scenarios-submit-worker`, `scenarios-apply-r3` (10,000) pass in CI. Extension filled 17 captured real pages, never sent (run 41035532678). **0 real employer submissions ever** (FEATURES.md, 2026-10-28). Apply VM not running. Workday only on TEST tenants. SmartRecruiters handed to the person | One real, employer-confirmed submission per family (Greenhouse, Lever, Ashby) with proof | Run `approve-first.ts` on your own computer for a role you want; or host the VM, set `APPLY_VM_KEY` | 6 |
| Resume / materials | 4 | Tailoring + truth guard tested (`scenarios-tailoring-r2`, honest-corpus false positives 90% to 0% per #326); PDF/DOCX render. Resume file intake only in open #201/#215. 0 uploads, 0 resume records live. Rewrite and essays flag-off | Merge #201/#215; one real resume through a real channel to a real tailored PDF | Send your real resume to the live bot | 4 |
| Networking / outreach | 3 | People finding, drafts, once-per-address send rail, 10,600-scenario round (#323), r3 (#346), load test. 0 people rows, 0 sends. Sending needs a mailbox grant; `gmail.send` not approved by Google | One real outreach email sent from the person's mailbox after approval, reply tracked | Connect a mailbox; set `HUNTER_API_KEY` | 8 |
| Email / inbox | 2 | Code complete and tested (48 files, `career_mail` multilingual evals in `evals/career/mail-*.json`). **0 Google grants**; `owner-inputs.json` still has null `LEGAL_NAME`, `SUPPORT_EMAIL`, `GOVERNING_STATE` so legal pages cannot build; Google verification not submitted; Outlook path built but unconnected | One real inbox read that upgrades a submission to confirmed | Fill the 3 inputs; buy domain; submit verification; or connect Outlook first | 5 |
| Discovery / alerts | 5 | The one thing live at scale: 186,866 postings, 27,751 boards, 33 cron lanes (FEATURES.md, 10-28). Search and alerts tested (`flow-scenarios-proactive-r2`, #343 no weekly cap). **0 alerts ever delivered**, 0 alert prefs. Only 5 ATS providers. Prod lacks 120 commits of fixes | One alert delivered to a real contact and acted on | Set alert prefs on your account; lift launch hold to deploy | 3 |
| Interview prep / offers | 4 | Text mock, briefs, negotiation math tested (`scenarios-research-r2`, `wo-025-mock.test.ts`); router-era replies seen (`prep_brief` 112, `negotiation_*` 124). Voice mock flag-off. No outcome (no interview or offer) tied to Trainee | Mock graded against the bank on a real channel with a real user; voice mock on | Turn on voice flag | 6 |
| Workflows / reminders | 3 | Reminders and digests tested; 2 reminder rows, 0 digests live. Multi-step workflows #216 and planner #252 are OPEN and default off; compound asks drop the second part (FEATURES.md section 6) | Merge #216/#252, measure a multi-step task end to end | Flip `CAREER_PLANNER` after eval | 12 |
| Channels (Telegram / WhatsApp / iMessage / SMS / web) | 3 | Telegram: batteries to 10,600 scenarios plus 55 Postgres journeys (#347), link ownership fix (#348). Live: 1 contact, 1 delivered reply. iMessage and WhatsApp deployed with zero traffic. **SMS does not exist** (`channel_adapters.ts:11`). Web still Upmore-branded, Trainee `/app` open as #195. Webhook was pointed at the test bridge `telegram-inbound` (TELEGRAM-LIVE-CHECK) | A real person on each channel through one full journey | Repoint Telegram webhook; LoopMessage and Meta verification; domain | 16 (SMS 16 more) |
| Onboarding / waves | 3 | `flow-scenarios-onboarding(-r2)` pass. Sign-up is closed unless `TRAINEE_SIGNUP=open` (`channel_inbound.ts:195`). Owner ruled waves and waitlist a non-goal (FEATURES.md section 1), yet #199 is open and contradicts that; first-conversation audit found 20 of 61 messages hit a dead-end reply (PRODUCT-AUDIT-2026-10-28; fixes merged, not re-measured live) | First-run funnel measured on real new users | Set `TRAINEE_SIGNUP`; decide #199 and #195 | 5 |
| Safety / approvals | 6 | Strongest area. Hash-bound approvals (D-MS-1), fact-lock (D-007), never LinkedIn/Indeed, STOP handling; `scenarios-secrets`, `-adversarial-r2`, multi-user isolation and 200-user concurrency (#342); a security hole closed today (#348, 660 of 840 scenarios failed on old trunk). Never exercised by a real user or a real employer; production lacks these fixes | Same guarantees observed in production under real traffic; live verify suite (#193 open) | Approve deploy | 6 |
| Reply quality | 3 | Live replies are the regex router (60.5% on 38 held-out, 2026-10-26, REPORTED). Brain 89.5-94.7% on an unsealed set, never 95% on both judges (D-030). Reply writer and staged brain off. 20 of 61 new-user messages got a dead end before the 10-28 fixes. Current-trunk score UNMEASURED | A sealed-set eval of current trunk and the brain or writer actually serving real turns | Approve eval spend; flip `CAREER_BRAIN=staged` | 10 |

## 3. Fifteen changes ranked by overall score gained per hour

"Gain" is my judgement of feature-points gained across the table (overall = sum / 11). Ratio = gain / hours. These are estimates.

| # | Change | Exact files / commands | Gain | Hours | Ratio |
|---|---|---|---|---|---|
| 1 | Owner sets the 13 launch-blocking secrets, then deploy current trunk (120 commits, 22 migrations behind) | `docs/launch/OWNER-SETUP-CHECKLIST.md`, `scripts/launch/secrets-audit.sh`, `scripts/launch/trainee-go-live.sh --sha 5d6857219`, `.github/workflows/deploy-production.yml` (run 41183608373 pending) | 8 | 5 | 1.6 |
| 2 | Real Telegram transcript on `trainee-telegram`, saved | repoint webhook per `docs/architect/TELEGRAM-LIVE-CHECK-2026-10-26.md`; `supabase/functions/trainee-telegram/` | 3 | 2 | 1.5 |
| 3 | First owner-run real Greenhouse submission with proof, then Lever and Ashby | `workers/career-browser/approve-first.ts`, `docs/architect/HANDOFF-SUBMIT-PATH-2026-10-27.md` | 3 | 3 | 1.0 |
| 4 | Connect Outlook first (no Google restricted-scope review), prove inbox confirmation | `supabase/functions/outlook-oauth/`, `_shared/outlook_connector.ts`, `docs/launch/OUTLOOK-CONNECT-2026-10-27.md` | 3 | 4 | 0.75 |
| 5 | Run the sealed brain eval on current trunk and record it | `.github/workflows/brain-eval.yml`, `evals/career/SCORE-LOG.md` (stale since 2026-10-21) | 2 | 3 | 0.7 |
| 6 | Deliver one real alert end to end | `supabase/functions/career-proactive/`, `scripts/launch/schedule-career-proactive.sql`, `_shared/career_proactive_run.ts` | 1.5 | 3 | 0.5 |
| 7 | Review and merge the built PRs: #201, #215 (resume files), #338 (search), #271 (task context) | the PRs' own files; resume intake `_shared/channel_resume_upload.ts` | 3 | 6 | 0.5 |
| 8 | Turn on the reply writer after item 5 passes | `_shared/career_reply_writer.ts`, `agent-chat/career_staged.ts` (`CAREER_REPLY_WRITER`, `CAREER_BRAIN=staged`) | 1.5 | 4 | 0.4 |
| 9 | Fill legal inputs and submit Google verification | `docs/launch/legal-pages/owner-inputs.json` (3 nulls), `scripts/launch/build-legal-pages.ts`, `docs/launch/GOOGLE-VERIFICATION-2026-10-26.md` | 2 | 5 | 0.4 |
| 10 | Start the Apply VM and prepare-ahead | `workers/career-browser/apply-vm-main.cjs`, `docs/launch/APPLY-VM-RUNBOOK.md`, `CAREER_PREPARE_AHEAD_URL/TOKEN` | 2 | 6 | 0.33 |
| 11 | Close remaining router dead ends (resume-paste summary, "email the recruiter" returning a stopped batch, reminder recital, correction fallback), rebuild the bundle | `packages/domain/142-career-router.js`, `python3 scripts/build-router-core.py --career-only`, `tests/career-new-user-replies-20261028.test.cjs` | 1.5 | 6 | 0.25 |
| 12 | Publish the extension | `scripts/extension-package.sh`, `docs/launch/chrome-web-store.md`, `.github/workflows/release-extension.yml` | 1 | 4 | 0.25 |
| 13 | Merge the live-verify suite and outcome funnel, run after every deploy | PR #193 (`scripts/launch/trainee-smoke.cjs`, `verify-security-live.cjs`), PR #234 | 1 | 5 | 0.2 |
| 14 | Merge and measure workflows and the planner | PR #216, PR #252, `CAREER_PLANNER` | 2 | 12 | 0.17 |
| 15 | Trainee-branded web app on a real domain | PR #195, `src/upmore-app-template.html`, `src/build-app.py` | 1.5 | 10 | 0.15 |

Not on the list because the per-hour return is poor now: SMS channel (add `sms` to `_shared/channel_adapters.ts:11`, about 16 hours), Workday live proof (about 24 hours), billing checkout (#274), deleting the finance code (#257; worth doing for risk, not for score).

## 4. The honest summary

1. The engineering is far ahead of the evidence. Large seeded batteries pass in CI (10,000 to 10,600 scenarios each), but no real employer has ever received a Trainee application and one real person has used a channel.
2. Production runs a commit 120 behind trunk, behind an owner hold. Every fix in the last two days (including a Telegram account-takeover hole) is not live.
3. The product people would talk to is the regex router, not the model; the model path has no measurement after 2026-10-26.
4. The cheapest points are owner actions (secrets, deploy, one real submission, one real Telegram run), not code. Most of the top ten items need the owner's hands, keys or approval.
