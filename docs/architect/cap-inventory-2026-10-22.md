> **Status: inventory only. No cap was removed or changed.** Written 2026-10-22 for the owner, who said "never set a
> cap on how many applications we can do at once, or a cap on anything whatsoever"; he decides which to lift.
> Method: a read-only sweep of the code, then an architect spot-check against the code of the eight most surprising
> claims: no writer of `daily_limit`; cloud `least(15, …)` against the opt-in text "25"; the router's 15/day plus 5 per
> vendor per day; D-014's "15"; `MAX_PER_CARD = 8`; the four new page-reader bounds; the D-011 constants; the
> `.limit(5000)` reads. All eight held.
> Correction on the cloud's 15/day: the owner's 15/day cloud limit reached the architect through the relaying agent
> in this session's instructions. It is not yet recorded in DECISIONS.md, which is why the sweep marked it uncited.
> Lifting any cap that is enforced in SQL needs a migration, which needs the owner's word. Lifting a TS-only cap needs
> a code change and a deploy.

# Trainee: every cap and limit in the product code

Branch `arch/networking-real-people` @ `4332c9c1`, which builds on `348c2d4a`. That base is the "landing candidate (NOT the pin)": it merges `wo/card-cloud-bridge` onto `8c36446f`. Every file path below is relative to the repository root. Everything here was read only; nothing was edited or run against a service.

## How this was searched

**Where I looked**
- `supabase/functions/**`. I read the Trainee entry points (`agent-chat/index-career.ts` → `handler-career.ts`, `career-ingest`, `career-proactive`, `trainee-deliver`, `trainee-inbound`, `trainee-telegram`, `trainee-whatsapp`, `career-voice`, `career-essay-draft`, `career-email-code`, `gmail-oauth/career.ts`) and every `_shared` module they reach.
- Every Trainee migration listed in `scripts/launch/trainee-go-live.sh`, plus `20261024130000_career_apply_card_cloud_bridge.sql` and the shared chat rate-limit and model-budget migrations.
- `packages/domain/12x–15x`, the old router stack. It is bundled into `router_core.career.js` and stays live until `CAREER_BRAIN=agent` (D-008).
- `packages/career-data`. It holds data only; I found no caps there.
- `extension/`. I read the source, plus `extension/background.js`, `content.js` and `config.js` (hand-written, not built).
- `workers/career-cloud/`, `scripts/apply.ts` and `scripts/career/portal-browser-helper.cjs` (the apply engine).
- `evals/` and the `.github/workflows` eval jobs, for spend caps.

**Search terms.** `MAX_ / CAP / LIMIT / DAILY / _MS / _DAYS / TTL`, uppercase numeric constants, `slice(0, N)`, `.limit(N)`, `Math.min/max`, `max_tokens`, `timeout`, `least(` / `greatest(`, `between`, `interval '…'`, `count(*) >= N`, and `limit N` in RPCs. For SQL I read the latest `create or replace` of every function. Earlier versions are superseded.

**What I left out**
- The generated bundles `router_core.js` and `router_core.career.js`. Their sources in `packages/domain` are covered.
- Finance modules and finance edge functions (`agent-chat/handler.ts`, `agent-exec`, `plaid*`, `stripe*`, `simplefin*`, `broker*`, `news-feed`, `cancel-watcher`, `agent-chat/_shared/*_answer.ts`). ARCHITECTURE §4 retires them, and `index-career.ts` deploys "zero finance code".
- Display-only clipping of one field to N characters (for example `clip(company, 80)`), regex length guards, and scoring thresholds that are not a quantity limit.
- Test fixtures.

**How to read the table**
- "Owner-set" means a `DECISIONS.md` entry, a work order quoting the owner verbatim, or a code comment that cites an owner ruling. The citation is given. Anything else is marked engineer-chosen.
- "Not on trunk" means the line comes only from this branch, or from the card-cloud-bridge landing candidate (`348c2d4a`), and not from `8c36446f`.
- The local `origin/trunk` ref is stale (2026-10-19), so trunk membership is judged against the pin `8c36446f`.

## The caps, by area

### A. Applications

| # | file:line | constant / expression | value | what it limits | kind | owner-set? (cite) | also enforced at |
|---|---|---|---|---|---|---|---|
| 1 | supabase/functions/_shared/career_apply.ts:46,52 | `DEFAULT_DAILY`, `MAX_DAILY`, `dailyLimit()` | 25 default, 50 max, minimum 1 | applications per person in a rolling 24 h (states planned/queued/submitting/confirmed/…) | safety | **Owner, D-011** (raised from 15 on 2026-10-19, "never more" than 50) | supabase/migrations/20261020050000_career_apply_daily_limit.sql:9 (`career_apply_daily_limit`: `greatest(1, least(50, …daily_limit… , 25))`) and :21,28 (`career_apply_enqueue`: `p_daily between 1 and 50`, `count(*) … interval '1 day' >= p_daily`) |
| 2 | supabase/functions/_shared/career_apply.ts:46,62 | `COMPANY_COOLDOWN_DAYS` | 30 days, 1 application | applications per person per employer (normalized name) | safety | **Owner, D-011** ("one per company per 30 days") | SQL 20261020050000_career_apply_daily_limit.sql:26-27; 20261021075000_career_apply_ops.sql:206 (email apply); cloud refusal 20261024130000…bridge.sql:618-619; TS career_apply_want.ts:151-191 (chat queue); extension/background.js:815 (batch) |
| 3 | supabase/functions/_shared/career_apply.ts:59 | `duplicate_job` | 1 | applications per person per posting (ever) | safety | engineer (D-011 "genuine") | SQL career_apply_daily_limit.sql:24; career_apply_jobs `unique(user_id,job_id)` (20261020000001_career_apply_jobs.sql:9) |
| 4 | supabase/functions/_shared/career_apply_want.ts:58-66 | `queueWants`: `room = cap - queuedSince(local midnight)` | the daily limit (25/50), counted per **local calendar day** | postings the chat brain may put in the apply queue per day ("over today's limit") | safety | engineer | **TS only.** SQL `career_apply_want_put_for` checks only ≤100 per call (row 9). Note the window differs from row 1, which is a rolling 24 h. |
| 5 | supabase/migrations/20261024130000_career_apply_card_cloud_bridge.sql:70,200,617,716,730-731 | `least(15, coalesce(o.daily,15), career_apply_daily_limit(u))`; opt-in default `daily set default 15` (:703) | 15 per day | applications the **cloud** worker may send per person per rolling 24 h | safety | owner per migration comment :701 ("Owner's later explicit cloud-only 15/day ruling"); **not in DECISIONS.md**; commit 7bbd2096. **Not on trunk** (bridge landing candidate). File header: "DRAFT / NOT APPLIED". | TS disagrees: career_cloud_optin.ts:43,83,93,116 shows the person "up to {career_apply_daily_limit} a day" (25 default, up to 50), with a `?? 25` fallback at :76,101. On pin 8c36446f the cloud limit is `least(coalesce(o.daily,25), daily_limit)`: 20261024120000_career_apply_cloud_gate_waiver.sql:62-63 |
| 6 | supabase/migrations/20261021080000_career_apply_cloud.sql:191 | `career_apply_cloud_optin.daily check (daily between 1 and 50)` | 1–50 | stored cloud daily setting | safety | D-011 numbers | row 5 |
| 7 | supabase/functions/_shared/career_apply_cards.ts:43,87 | `MAX_PER_CARD` | 8 | applications on one approval card (one "yes") | rate | engineer | SQL 20261020030000_career_apply_cards.sql:21 (`items … between 1 and 8`), :78; card push 20261021075000_career_apply_ops.sql:380 (`cardinality(p_ids) not between 1 and 8`) |
| 8 | supabase/migrations/20261021075000_career_apply_ops.sql:391-398 | card push refused if `career_apply_cards … state='open' and shown_at >= now-24h`, or a reply in the last 30 min, or another prompt is the thread's last word (24 h) | 1 open card per person at a time (a new one only after an answer or 24 h); 30-min quiet after any reply | how many cards (×8 applications) are pushed to a person | rate | engineer | TS career_proactive_run.ts:131,141 (`CARD_SETTLE_MS` 10 min after the last prepared item); WhatsApp: no push if last inbound > 23 h (:389) |
| 9 | supabase/migrations/20261022100000_career_apply_wanted.sql:32 | `jsonb_array_length(p_items) > 100` → "at most 100 postings at once" | 100 | postings put in the apply queue per call | technical | engineer | TS agent/career_tools.ts:352 (`i.postings.slice(0, 100)`); 20261024090000_career_apply_agent_submit.sql:52 (agent batch ≤100); 20261024130000…bridge.sql:292 (cloud items 1..100); workers/career-cloud/prepare.ts:23 (≤100 URLs) |
| 10 | supabase/migrations/20261021220430_career_apply_message_cards.sql:87 | `validate_items`: `jsonb_array_length(p_items) not between 1 and 100` | 1–100 | postings on one text-message approval card (TEST-only allowlist) | technical | engineer | — |
| 11 | supabase/functions/_shared/career_apply_store.ts:36-37 | `claim(now, limit=3)`; `limit<0 \|\| limit>6` refused | default 3, max 6 | applications one queue claim hands to a worker at once | technical | engineer | SQL `least(6, …)` in career_apply_claim (20261021080000_career_apply_cloud.sql:108), career_apply_claim_own (20261024130000…bridge.sql:567), career_apply_cloud_claim_at (…bridge.sql:627) |
| 12 | workers/career-cloud/worker.ts:236,437 | `contexts`: `Math.max(1, Math.min(6, … ?? 3))`; env `CLOUD_CONTEXTS` (3) | 3 default, 1–6 | applications the cloud VM drives in parallel | technical | engineer (D-010 VM size) | SQL claim `least(6,…)` (row 11) |
| 13 | extension/background.js:381-384; extension/config.js:21 | `SEND_LANES_MAX`; `agentTabs: 1` | 1 default, max 3 tabs | applications the extension sends in parallel in the person's browser | technical | engineer ("more than one is untested") | — |
| 14 | extension/background.js:678 | `PREPARE_MAX`, `PREPARE_AT_ONCE` | 100 postings, 8 at a time | postings prepared (hidden tabs) per batch session | technical | engineer (WO-042 "50-in-30") | extension/background.js:1242 (`career_apply_wanted … limit=100` read); extension/src/apply_core.ts:524 (`postingLinks(text, max = 100)`) |
| 15 | supabase/migrations/20261021080000_career_apply_cloud.sql:146-152 (`career_apply_cloud_open`) | `count(*) … >= 3` hand/extension applications confirmed by the employer's email, by a named gate tester | 3 per portal family | whether the cloud may send on Greenhouse/Lever/Ashby at all | safety | **Owner, D-022** ("PR #16 gate (3 employer-confirmed hand submissions per portal)") | 20261021075000_career_apply_ops.sql:165-167 (`career_apply_gate_status`, needed=3) |
| 16 | supabase/migrations/20261024120000_career_apply_cloud_gate_waiver.sql:22,27 | `max_sends between 1 and 5`; `expires_at <= created_at + 7 days` | 1–5 sends, ≤7 days | cloud sends allowed past a closed gate, per waiver (one person, one family) | safety | waiver concept owner (D-010 as changed 2026-10-21, per file header); the 5 / 7-day bounds are engineer-chosen | …bridge.sql:61-64 (re-checked at authorize) |
| 17 | supabase/migrations/20261024130000_career_apply_card_cloud_bridge.sql:83,85 | `expires_at <= created_at + interval '24 hours'`; unique index `((true)) where revoked_at is null` | ≤24 h; **one enrolled person platform-wide** | who may use the cloud card (outside the TEST allowlist) | safety | engineer ("Owner authorized bridge code only; enrollment … remain separate", :1). Not on trunk. | — |
| 18 | supabase/migrations/20261024130000_career_apply_card_cloud_bridge.sql:91,193 | cloud-bound approval `expires_at <= approved_at + 24 hours` | 24 h | how long a cloud approval is valid | safety | engineer | 20261024090000_career_apply_agent_submit.sql:95 (agent batch approval 24 h); 20261021220430_career_apply_message_cards.sql:24,48,50 |
| 19 | supabase/migrations/20261021080000_career_apply_cloud.sql:329-339 (throttle) | `fails*100 >= 2*tries` over the last 50, or `bots20 >= 2` in the last 20 | 2% failures or 2 bot checks → portal paused 6 h | cloud sending per portal family (all users) | rate | engineer (file header :19-20) | — |
| 20 | supabase/migrations/20261021080000_career_apply_cloud.sql:350-355 | `bots_today >= 2` | 2 bot checks / person / UTC day → paused to next UTC day | cloud sending for one person | rate | engineer | — |
| 21 | supabase/migrations/20261020000001_career_apply_jobs.sql:7 | `attempts between 0 and 1` | 1 attempt | retries of an application (never re-driven) | safety | engineer | sweep to unknown after 15 min: 20261021080000_career_apply_cloud.sql:432; …bridge.sql:562; TS career_apply_store.ts:3 `APPLY_TIMEOUT_MS = 15 min` |
| 22 | supabase/functions/_shared/career_apply_cards.ts:168 | `card.shown_at < now - 24h` → expired | 24 h | how long an approval card can be answered | safety | engineer | SQL 20261020050000_career_apply_daily_limit.sql:42 (`card_expired`) |
| 23 | supabase/functions/_shared/career_apply_cards.ts:44-45 | `CARD_CHAR_BUDGET`, `CARD_HARD_LIMIT` | 1,600 chars (2+ apps); 4,000 (one) | text size of a card (fewer than 8 if long) | technical | engineer | SQL card push `length(p_text) between 1 and 4000` (apply_ops.sql:381) |
| 24 | supabase/functions/_shared/career_apply_cards.ts:213 | `.limit(30)` on prepared ready/shown | 30 | prepared applications read when the person asks to see them | technical | engineer | — |
| 25 | supabase/functions/_shared/career_apply_questions.ts:54-55,196 | `PER_TEXT`, `TEXT_BUDGET` | 5 questions, 1,600 chars | form questions asked in one text | rate | engineer | SQL 20261021075000_career_apply_ops.sql:294 (`cardinality(p_ids) not between 1 and 5`), :303 (one questions push per 24 h) |
| 26 | supabase/migrations/20261020060000_career_apply_questions.sql:47 (latest: 20261024110000_career_apply_cloud_ask.sql:17) | `count(*) … >= 500` | 500 | open/stored form questions per person | technical | engineer | 20261020070000…ai_policy.sql:21; 20261021120000…form_answers.sql:49 |
| 27 | supabase/migrations/20261020060000_career_apply_questions.sql:17-21,44,73 | options ≤60; job_ids ≤200; answer 1–2000 chars; ≤60 questions per posting; open list 1–20 | as stated | one question record / one posting's questions | technical | engineer | TS career_apply_questions.ts:56 `MAX_ANSWER 2000`; essay_draft.ts:32 `HARD_CHARS 2000` |
| 28 | supabase/functions/_shared/career_essay_card.ts:19-21,111-115 | `DAILY_DRAFTS`, `TEXT_MAX` | 60 drafts / rolling 24 h; 2,000 chars | essay-answer drafts per person from the extension card | spend | engineer | **TS only** (counter = career_events rows) |
| 29 | supabase/functions/_shared/essay_draft.ts:31,33,213,249 | `DEFAULT_WORDS`; `MIN_FACTS`; `max_tokens: 900`; `tries <= 2` | 250 words; ≥2 facts; 900 tokens; 2 model tries | one drafted form answer | spend | engineer | — |
| 30 | supabase/functions/_shared/career_apply_email.ts:25,130 | `BODY_WORDS`; body `clean(…, 5000)` | 150 words; 5,000 chars | an apply-by-email message | technical | engineer | SQL 20261021075000_career_apply_ops.sql:192-193 (subject 1–200, body 1–5000), :195 (no cc/bcc) |
| 31 | supabase/migrations/20261021075000_career_apply_ops.sql:200-201 | email card `shown_at < now - 24h` | 24 h | how long a "yes" to an apply-by-email card holds | safety | engineer | — |
| 32 | supabase/functions/_shared/career_apply_confirm.ts:20 | `CONFIRM_WINDOW_DAYS` | 14 days | how long after sending an employer email can confirm an application | safety | engineer | SQL 20261021075000_career_apply_ops.sql:133 (`outside_window`) |
| 33 | supabase/migrations/20261020000001_career_apply_jobs.sql:9; 20261021080000_career_apply_cloud.sql:235,245 | payload ≤262,144 bytes; cloud resume 1–5,242,880 bytes (b64 ≤7.2M) | 256 KB; 5 MB | one application payload; the resume the cloud keeps | technical | engineer | workers/career-cloud/prepare.ts:37 (5 MB); extension/background.js:1155 (resume <10 MB) |
| 34 | scripts/apply.ts:1100 | `i < 1200` × 500 ms | 10 min | how long the engine waits for the person to press Submit (person-submits) | technical | engineer | extension/content.js:532 `PERSON_WAIT_MS` 20 min (extension's own wait) |
| 35 | supabase/functions/_shared/career_email_code_poll.ts:8-9; career_email_code.ts:144,278 | `CODE_MAX_WAIT_MS`; `.slice(0, 10)`; `DRIVE_WINDOW_MS` | 180 s; 10 mails; 20 min | waiting for an emailed sign-in code; messages searched; code reads only while a drive is ≤20 min old | technical | engineer | scripts/apply.ts:300-302 (≤180 s) |
| 36 | supabase/functions/_shared/gmail_code_window.ts:4 | `CODE_WINDOW_MS` | 15 min | age of mail a sign-in code may be read from | safety | **Owner, D-021** ("Keep it, 15-minute limit") | career_email_code.ts:150 |
| 37 | packages/domain/132-career-apply.js:39,94-98 | `DAILY_CAP` (old router stack) | 15 / day, "cannot be raised in chat" | applications per day as the router counts and **tells** the person | safety | owner per 149's comment (15/day locked 2026-10-12); superseded for the queue by D-011 | **Disagrees with row 1** (DB enforces 25/50). In bundle router_core.career.js. |
| 38 | packages/domain/132-career-apply.js:297,304 | autopilot rule `maxPerDay: Math.min(spec ?? 10, DAILY_CAP)` | 10 default, ≤15 | applications per day under an approved autopilot rule | safety | engineer | — |
| 39 | packages/domain/149-career-portal-apply.js:77,460-462 | `SPEC_CAPS = { perDay: 15, perVendorPerDay: 5, perCompanyPer30Days: 1 }` | 15/day; **5 per ATS family per day**; 1 per company per 30 days | submissions on the old portal-apply/batch-apply (155) path | safety | **Owner per comment :76** ("15/day locked 2026-10-12"); D-011 "Module 149's SPEC_CAPS … stays at 15 and is not raised" | per-vendor cap exists **only here**; not in SQL |
| 40 | packages/domain/126-career-track.js:22-25 | `NUDGE_AFTER_DAYS`, `GHOST_AFTER_DAYS`, `DEFAULT_COOLDOWN_DAYS` | 10, 21, 180 days | follow-up nudge; "ghosted"; reapply to a company after a rejection (router) | safety | engineer ("policy default", SC-074) | — |
| 41 | supabase/migrations/20261015234000_career_task_intents_v1.sql:13,114 (latest 20261022150000_career_apply_authority.sql:160) | `budget_limit integer not null default 120` | 120 effects | browser steps per old-worker task intent | technical | engineer | — |

### B. Outreach and contacts

| # | file:line | constant / expression | value | what it limits | kind | owner-set? (cite) | also enforced at |
|---|---|---|---|---|---|---|---|
| 42 | supabase/functions/_shared/career_outreach.ts:74; agent/career_tools.ts:721 | `BATCH_MAX` | 10 | cold-email drafts per batch / per approval | rate | **Owner target, WO-033** ("approved in batches of 10 with one reply") | SQL 20261021010000_career_outreach.sql:54 (`n between 1 and 10`) |
| 43 | supabase/functions/_shared/career_outreach.ts:74,363 | `DEFAULT_DAILY`, `MAX_DAILY` | 20 default, person may set 1–30, never 31 | outreach emails sent per person per local day | rate | **Owner target, WO-033** ("Sends capped at 20-30/day … no blast mode, ever") | SQL 20261022120000_career_control_state.sql:53 (`least(greatest(daily_cap,1),30)`, default 20); prefs check 20261021010000_career_outreach.sql:99; tool career_tools.ts:806 |
| 44 | supabase/functions/_shared/career_outreach.ts:74,365-366 | `WARMUP_DAILY`, `WARMUP_DAYS` | 10 / day for the first 7 days from the first send | outreach sends while the Gmail warms up | rate | engineer | SQL career_control_state.sql:56 |
| 45 | supabase/functions/_shared/career_outreach.ts:74,380 | `GAP_MS` | 90 s | spacing between a person's sends | rate | engineer | SQL career_control_state.sql:60-61 (`interval '90 seconds'`) |
| 46 | supabase/functions/_shared/career_outreach.ts:55-56,377 | `RECIPIENT_CAP`, `RECIPIENT_WINDOW_DAYS` | 3 emails / 30 days, from all Trainee users together | emails reaching one recipient address | safety | architect, D-018a (on the owner's question) | SQL career_control_state.sql:50-51 |
| 47 | supabase/migrations/20261022120000_career_control_state.sql:44-46 | do-not-contact checked across every user | a "stop" to anyone stops everyone forever | sends to an address that said stop | safety | architect, D-018a | TS career_outreach.ts:376 (`o.dnc`); TS store reads only the person's own list (:679, `.limit(10000)`) |
| 48 | supabase/functions/_shared/career_outreach.ts:77,374 | `APPROVAL_TTL_MS` | 7 days | how long an approved draft may still be sent | safety | engineer (WO-091c) | SQL career_control_state.sql:42 |
| 49 | supabase/functions/_shared/career_outreach.ts:75,422 | `BATCH_TTL_MS` | 72 h | how long a shown batch can be approved | safety | engineer | — |
| 50 | supabase/functions/_shared/career_outreach.ts:75,229,268 | `MAX_WORDS` | 120 words | body of an outreach email (redrafted if over) | safety | engineer | old stack 124-career-outreach.js:38 `maxWords: 120`; 147-career-platform-drafts.js:18 `MAX_WORDS 120`; prompt.ts:106 |
| 51 | supabase/functions/_shared/career_outreach.ts:75,297 | `MESSAGE_MAX` | 1,500 chars | one text carrying drafts | technical | engineer | — |
| 52 | supabase/functions/_shared/career_outreach.ts:244,249,260 | `max_tokens: 700`; subject `.slice(0,150)`; `tries <= 2` | 700 tokens; 150 chars; 2 tries | one outreach draft | spend | engineer | SQL subject 1–200, body ≤4000, footer ≤600 (career_outreach.sql:58-60) |
| 53 | supabase/functions/_shared/career_outreach.ts:497-500 | `approvedDue(500)`; `maxUsers ?? 200`; one send per person per run | 500 drafts read, 200 people, 1 send each per 5-min run | outreach throughput per run (≈12 sends/hour/person max) | rate | engineer | schedule `4-59/5 * * * *` (scripts/launch/schedule-career-proactive.sql:17) |
| 54 | supabase/functions/_shared/career_outreach.ts:566 | `sentAwaiting(o.limit ?? 20, now-30d)` | 20 threads, 30-day lookback | replies, bounces and stops checked per run | technical | engineer | — |
| 55 | supabase/functions/_shared/career_outreach.ts:310,319 | `MAX_N` | 99 | draft numbers a reply can name ("send 1-7") | technical | engineer | — |
| 56 | supabase/functions/_shared/career_outreach.ts:675 | `.limit(5000)` on contacted addresses | 5,000 rows | addresses read to avoid emailing someone twice (more are not seen) | technical | engineer | — |
| 57 | supabase/functions/_shared/career_contacts.ts:21,122,383 | `MAX_CONTACTS` | 3,000 | contacts kept per person (imports past it skipped) | technical | engineer ("snapshot is at most 1 MB") | SQL snapshot ≤1,048,576 bytes (20261015020000_career_watch_kv.sql:102-103) |
| 58 | supabase/functions/_shared/career_contacts.ts:301,305; agent/career_tools.ts:681 | `hunterPass(…, { max: 100 })` | 100 | paid Hunter checks per chat call | spend | engineer | — |
| 59 | supabase/functions/_shared/career_contacts.ts:234,249,264-268 | `gapMs ?? 250`; 429 → one retry after 0.5–10 s | 4 requests/s | Hunter API pace (published limit 10/s, 300/min) | rate | engineer | — |
| 60 | supabase/functions/_shared/career_contacts.ts:243 | `cacheKey` per calendar month | 1 check / address / month | repeat Hunter spend | spend | engineer (ASSUMED billing month) | — |
| 61 | supabase/functions/_shared/career_contacts.ts:151,160 | `LIST_TARGET_USD` | $50 | reported only (`under_target`); **does not block** | spend | **Owner target, WO-033** ("under $50 data cost per list") | — |
| 62 | supabase/functions/_shared/career_referrals.ts:11 | `MAX_TARGETS`, `PATHS_PER_FIRM` | 20 firms, 5 paths each | warm-path map size | technical | **Owner target, WO-033 #4** ("top-20 target companies"); 5 engineer | career_tools.ts:826 ("Name up to 20") |
| 63 | supabase/functions/_shared/career_people_sources.ts:70 | `PAGE_MAX_BYTES`, `PAGE_TIMEOUT_MS`, `PAGE_REDIRECTS` | 2,000,000 bytes, 10 s, 3 redirects | one public page read for people (off unless `CAREER_SOURCE_PAGES=on`) | technical | engineer. **New on arch/networking-real-people, not on trunk** | — |
| 64 | supabase/functions/_shared/career_people_sources.ts:159,168,191 | `EXTRACT_CHARS`; extractor `max_tokens: 4000` | 120,000 chars; 4,000 tokens | text sent to the model per page; its answer | spend | engineer. **New, not on trunk** | — |
| 65 | supabase/functions/_shared/career_people_sources.ts:117,143 | `NEAR` | 250 chars | how near the title/firm must be to the name on the page for a person to count as sourced | safety | engineer. **New, not on trunk** | — |
| 66 | supabase/functions/_shared/career_people_sources.ts:37,42 | `NEVER` = linkedin.*, lnkd.in, indeed.* | 0 pages | pages Trainee will read | safety | **Owner rule** (CLAUDE.md "Never automate LinkedIn or Indeed") | memory.ts:79 (standing instruction refused); 149-career-portal-apply.js:74 `AGGREGATOR_HOSTS` |
| 67 | supabase/functions/_shared/career_connector.ts:81-83 | `WEEKLY_CAP`, `MIN_NETWORK`, `FOLLOW_MS` | 3 intros / person / 7 days; network needs 500 opted in; 72 h follow-up | double-opt-in introductions (module not wired into the chat yet, :22) | safety | engineer | SQL 20261020110000_career_connector.sql:195-196 (≥3 in 7 days), :78 (≥500), :217 (intro expires 7 days) |
| 68 | packages/domain/124-career-outreach.js:34-38 | `CAPS` (old router stack) | start 12/day, +5 every 3 days, ceiling 30, user cannot raise; 4 per domain per day; 15 per firm per 30 days; 1 initial + ≤2 follow-ups per person per 183 days; risky ≤10%; gap 2–8 min; pause at 3% bounces or 2 hostile; wave 1 = 40; 120 words; 1 link | outreach campaign plans in the old router | rate | **Owner per 139 comment** ("decided caps (owner, 2026-10-12): start 10–15/day, ceiling 30, users cannot raise"); the rest engineer | 139-career-safety.js:9 (`DAILY_START 15, DAILY_CEILING 30`) |
| 69 | packages/domain/139-career-safety.js:9,49,55 | `DAILY_START`, `DAILY_CEILING` | 15 → +5 per 2 days → 30 | sends per day (old router safety module) | rate | **Owner per comment** (2026-10-12) | **Disagrees with row 68** on the start (15 vs 12) and ramp (+5/2 days vs +5/3 days) |

### C. Chat and the agent

| # | file:line | constant / expression | value | what it limits | kind | owner-set? (cite) | also enforced at |
|---|---|---|---|---|---|---|---|
| 70 | supabase/functions/agent-chat/handler-career.ts:169-178 | `RATE_LIMIT` → `agent_rl_bump(_as)` | 60 messages / person / rolling 60-min window (429, Retry-After 3600) | chat turns on every channel | rate | engineer (M2) | SQL 20261010090000_chat_bridge_rate.sql:8 (`p_limit not between 1 and 60`), :12 (count clamps at 61); channel_present.ts:79 (the "60 messages an hour" text) |
| 71 | supabase/functions/agent-chat/handler-career.ts:80 | `MAX_MESSAGE_LEN` | 4,000 chars | one incoming message | technical | engineer (M2) | channel_inbound.ts:198 (`said.slice(0, 4000)`); channel_bridge.ts:118 |
| 72 | supabase/functions/agent-chat/_shared/chat_input.ts:11-12 | `images.slice(0, 3)`; `im.data.length > 2_000_000` skipped | 3 photos, 2,000,000 b64 chars each | photos per message | technical | engineer | — |
| 73 | supabase/functions/_shared/agent/loop.ts:222 | `maxSteps ?? 6` (no caller overrides) | 6 model steps | model/tool rounds per turn ("stopped partway") | spend | engineer | — |
| 74 | supabase/functions/_shared/agent/loop.ts:147 | `MAX_TOKENS` | 1,200 | model output per step | spend | engineer | — |
| 75 | supabase/functions/_shared/model_gateway.ts:41,73 | `REASONING_HEADROOM`; `max_completion_tokens = (max_tokens \|\| 1024) + 512` | +512 tokens | reasoning budget per call | spend | owner's instruction "keep OpenAI spend small" (2026-10-11, comment :40); number engineer | — |
| 76 | supabase/functions/_shared/model_gateway.ts:162,170 | `AbortSignal.timeout(o.timeoutMs \|\| 30000)`; `raw.length > 200000` | 30 s; 200,000 chars | one model call | technical | engineer | — |
| 77 | supabase/functions/_shared/agent/loop.ts:115,148 | `ERROR_CHARS`, `RESULT_CHARS` | 300; 12,000 chars | tool error and tool result fed back to the model (cut and said) | technical | engineer | — |
| 78 | supabase/functions/agent-chat/career_brain.ts:34 | `HISTORY_WINDOW` | 40 messages | conversation the model sees (older ones summarized) | technical | engineer | handler-career.ts:437 (reads 41); timeline.ts:22 `SUMMARY_MAX 1600` |
| 79 | supabase/functions/_shared/conversation.ts:27,32-34 | `HISTORY_TURNS`, `OUTBOX_CHARS`, `MAX_BUBBLES`, `BUBBLE_CHARS` | 20 turns; 4,000 chars; 16 bubbles; 700 chars | channel conversation interface: history and reply size | technical | engineer | channel_inbound.ts:84 `MAX_PARTS 30` |
| 80 | supabase/functions/_shared/agent/timeline.ts:22,83 | `RECALL_MAX`; `limitOf` ≤200; `DETAIL_MAX` 4096; `SUBJECT_MAX` 200 | 50 default, 200 max | events returned by "recall" | technical | engineer | SQL 20261023100000_career_events_apply_queued.sql:29 (`least(…,200)`), event checks 20261020120000_career_events.sql:16-17 |
| 81 | supabase/functions/_shared/agent/memory.ts:20,104,171 | `MAX_STANDING`, `STANDING_TEXT`, `BLOCK_BUDGET` | 20 standing instructions; 160 chars; 4,500-char memory block | what the agent remembers per person | technical | engineer | — |
| 82 | supabase/functions/_shared/career_situation.ts:212 | `SITUATION_BUDGET` | 5,000 chars | "situation" block in the prompt | technical | engineer | — |
| 83 | supabase/functions/_shared/career_host.js:173-179 | stated facts `accepted.length < 40`; record ≤30,000 chars | 40 facts | facts the old host keeps per account | technical | engineer | SQL 20261021050000_career_brief_digest.sql:105-112 (≤40 facts, value ≤200, ≤32 KB) |
| 84 | supabase/functions/_shared/agent/career_tools.ts:405-406 | `Math.min(20, …)` results; pool `Math.min(50, want*3)` | 20 shown, 50 ranked | job search results per call | technical | engineer | career_search.ts:87 (≤50); handler-career.ts:455 (`postingsDb.search(…, 150)`: 150 rows read) |
| 85 | supabase/functions/_shared/career_pool.js:58,62 | `DEFAULT_LIMIT`, `TARGETED_LIMIT` | 600; 50 | postings loaded into the router's pool per turn | technical | engineer | — |
| 86 | supabase/functions/_shared/career_tailor.ts:17,19 | `LINK_TTL_SECONDS`, `MAX_PERSONAS` | 7 days; 10 personas | tailored-resume link life; saved resume personas | technical | engineer | — |
| 87 | supabase/functions/_shared/career_mock.ts:23-27,294,347 | `IDLE_MS`, `MAX_QUESTIONS`, `DEFAULT_MINUTES`; minutes clamp 5–30 | 30 min idle; 2–6 questions; 20 min default | one text mock interview | technical | **Owner target, WO-025** ("20-minute role-specific mock"); the rest engineer | — |
| 88 | supabase/migrations/20261021020000_career_voice_mock.sql:32-33,36,44 | `count(*) … > now-1 day >= 5`; link 10 min; `p_call_minutes between 5 and 60` | 5 voice mocks / person / day; 5–60 min | voice mock interviews (`CAREER_VOICE=on` only) | spend | engineer (WO-035 "5-a-day limit") | TS career_mock.ts:580 (text); career_voice.ts:249 clamps 5–**30** (disagrees with SQL 60); career_voice_link.ts:11 (10 min) |
| 89 | supabase/functions/_shared/career_voice.ts:48-53 | `SECRET_TTL_S`, `CALL_GRACE_MIN`, `MAX_TURNS`, `MAX_TURN_CHARS`, `MAX_TRANSCRIPT_CHARS`, `MAX_BODY` | 60 s; +15 min; 300 turns; 4,000; 80,000; 400,000 | one voice call and its transcript | technical | engineer | — |
| 90 | supabase/functions/_shared/career_hired.ts:26,171,210 | `MIN_N` | 5 people | smallest group shown in hired-background aggregates | safety | **Owner, D-018** ("nothing under n=5") | career_offer.ts:15 `MIN_N 5` (pay medians) |
| 91 | supabase/functions/_shared/career_hired.ts:28-30,171,180 | `CACHE_MS`, `DEFAULT_SIZE` (1–100), `DEFAULT_MONTHLY_BUDGET` | 30 days; 25 records/call; **300 credits per month for all users** | People Data Labs spend | spend | budget envelope owner (D-018, PDL Pro ~$98 for 350 records); 300/25 engineer | SQL 20261021030000_career_hired_backgrounds.sql:30 (`size_requested between 0 and 100`), :46-51 (monthly sum) |
| 92 | supabase/functions/_shared/career_offer.ts:16,19 | `ASK_TTL_MS`, `MAX_MESSAGE` | 24 h; 1,500 chars | half-told offer waiting for details; reply size | technical | engineer | career_path.ts:22 `MAX_MOVES 3` |
| 93 | packages/domain/140-career-reply.js:13 | `MAX_SENTENCES_PER_BUBBLE` | 3 | router reply bubbles | technical | engineer | — |
| 94 | packages/domain/120-career-access.js:23 | `HANDOFF_TTL_MS` | 30 min | handoff link validity (router) | safety | engineer | — |

### D. Job ingestion, discovery and alerts

| # | file:line | constant / expression | value | what it limits | kind | owner-set? (cite) | also enforced at |
|---|---|---|---|---|---|---|---|
| 95 | supabase/functions/career-ingest/handler.ts:43 | `INGEST_MAX_BOARDS` (sharded) `int(…, 400, 1, 2000)` capped by `capacityPer` | 400 default, 1–2,000 | ATS boards read per 5-min run | rate | engineer | career_shards.ts:42 (headroom 1.5) |
| 96 | supabase/functions/career-ingest/handler.ts:62 | `INGEST_MAX_BOARDS` (unsharded) `int(…, 100, 1, 400)` | 100, 1–400 | boards per run without board state | rate | engineer | — |
| 97 | supabase/functions/career-ingest/handler.ts:37 | `INGEST_CONCURRENCY` `int(…, 8, 1, 16)`; `deadline: started + 100000` | 8 (1–16); 100 s | boards read in parallel; no board started after 100 s | rate | engineer | cron `timeout_milliseconds := 140000` (schedule-career-ingest.sql:23) |
| 98 | supabase/functions/career-ingest/handler.ts:41-42; career_shards.ts:13-14 | `INGEST_LANES` 1–64; `INGEST_EVERY_MIN` 5 (1–60); `INGEST_WINDOW_HOURS` 6 (1–48); `BUCKETS` 64 | every board within 6 h | how often each board is re-read | rate | engineer | SQL board_state `bucket between 0 and 63` (20261021110000_career_board_state.sql:12) |
| 99 | supabase/functions/_shared/career_ingest.ts:353 | `timeoutMs ?? 15000` | 15 s | one board fetch | technical | engineer | — |
| 100 | supabase/functions/_shared/career_ingest.ts:270 | `SR_PAGE`, `SR_MAX_PAGES` | 100 × 10 = 1,000 | SmartRecruiters postings read per board (past that, partial; closes nothing) | technical | engineer | — |
| 101 | supabase/functions/_shared/career_ingest.ts:49 | `MAX_DESCRIPTION` | 20,000 chars | stored job description | technical | engineer | SQL 20261019000001_career_postings.sql:11-16 (company ≤300, title ≤500, location ≤1000, url ≤2000, description ≤20000) |
| 102 | supabase/functions/_shared/career_ingest.ts:131 | `BACKLOG_MS` | 3 days | a posting first seen more than 3 days after it was posted is never alerted | safety | engineer | — |
| 103 | supabase/functions/_shared/career_ingest.ts:218,239 | `open()` `.limit(3000)`; `newSince` `from < 20000` | 3,000; 20,000 rows | open postings read; new postings read per alert run | technical | engineer | — |
| 104 | supabase/functions/_shared/career_alerts.ts:32-33 | `DEFAULT_PREFS.max_instant_per_day: 3`; `MAX_INSTANT_PER_DAY` | 3 default, 0–10 | instant job alerts per person per day | rate | engineer | SQL 20261019010001_career_alerts.sql:26 (`^([0-9]\|10)$`), :11 (`instant_sent_today` ≤100); store career_alert_store.ts:46 |
| 105 | supabase/functions/_shared/career_alerts.ts:34-35 | `WEEKLY_DEFAULT`, `WEEKLY_MAX` | 15 default, 0–25 | alerts per person per rolling 7 days | rate | engineer (WO-037 "zero spam weeks") | career_alert_store.ts:48; **TS only** (no SQL check) |
| 106 | supabase/functions/_shared/career_alerts.ts:33,108 | `REPORT_LIMIT` | 10 | postings listed in a daily report ("…and N more") | technical | engineer | — |
| 107 | supabase/functions/_shared/career_alert_store.ts:32-33 | keywords/locations | ≤10 each, ≤60 chars | alert search terms | technical | engineer | SQL career_alerts.sql:20-21 (keywords 1–10, locations ≤10) |
| 108 | supabase/functions/_shared/career_proactive_run.ts:46,49 | posting window 26 h; held ids `.slice(0, 2000)` | 26 h; 2,000 | postings considered per alert run | technical | engineer | SQL `held` ≤200 per person (career_alerts.sql:14; career_alert_store.ts:104) |
| 109 | packages/domain/121-career-jobs.js:613; 151-career-alert-watch.js:44,451 | `DEDUPE_RECENCY_MS`; `DEFAULT_BOARD_DEADLINE_MS`; `REPOST_WINDOW_MS` | 14 days; 100 s; 14 days | old router job de-dupe and watcher | technical | engineer | — |

### E. Extension and worker (time and size bounds not listed above)

| # | file:line | constant / expression | value | what it limits | kind | owner-set? (cite) | also enforced at |
|---|---|---|---|---|---|---|---|
| 110 | extension/src/apply_core.ts:361,463 | `NO_ANSWER_WAIT_MS`, `EVIDENCE_LIMIT` | 30 s; 60,000 chars | wait for the employer's answer after a click (then "unknown", never re-sent); evidence size | technical | engineer | worker.ts:124 (evidence ≤60,000) |
| 111 | extension/background.js:678 | `SURVEY_WAIT_MS`, `SURVEY_FRESH_MS` | 45 s; 10 min | reading one posting page; reuse of a read | technical | engineer | — |
| 112 | workers/career-cloud/worker.ts:259,296,308 | idle 15 s; engine `timeoutMs ?? 600_000`; authorize 5 s | 15 s; 10 min; 5 s | cloud worker poll; one application drive; submit authorization | technical | engineer | scripts/apply.ts:120 (5 s) |
| 113 | supabase/functions/_shared/career_cloud_optin.ts:31 | `TERMS_TTL_MS` | 30 min | how long a "yes" to the cloud terms counts | safety | engineer | — |

### F. Mail, digest and notifications (delivery)

| # | file:line | constant / expression | value | what it limits | kind | owner-set? (cite) | also enforced at |
|---|---|---|---|---|---|---|---|
| 114 | supabase/functions/trainee-deliver/handler.ts:13-14 | `ROWS_PER_RUN`, `RUN_BUDGET_MS` | 20 rows per 1-min run; 100 s | outbound texts delivered per minute, **all users together (≈1,200/hour)** | rate | engineer | SQL outbox claim `least(…,100)` (20261021070000_channel_parity.sql:111), per-user `least(…,40)` (:144) |
| 115 | supabase/functions/trainee-deliver/handler.ts:15; channel_registry.ts:14,36 | `DEFAULT_DAILY_CONTACTS` (`LOOPMESSAGE_DAILY_CONTACTS`) | 300 new contacts / UTC day | people texted per day over iMessage (rest wait for tomorrow) | rate | provider plan, D-009 (owner chose LoopMessage; plan 300 / 1,000) | channel.ts:120-121 |
| 116 | supabase/functions/_shared/whatsapp.ts:34; channel_adapters.ts:126 | `DEFAULT_DAILY_TEMPLATES`; `WHATSAPP_WINDOW_MS` | 250 templates / day; 24 h − 10 min | WhatsApp business-initiated nudges; free-form window | rate | platform rule, D-019 (owner); 250 engineer (SECONDARY source) | channel.ts:149-151 |
| 117 | supabase/functions/_shared/telegram.ts:65; whatsapp.ts:94; loopmessage.ts:16 | `pacer({ perChatMs: 1000, overallPerSecond: 30 / 50 })`; LoopMessage `pauseMs 250` | 1 msg/s per chat; 30/s (Telegram), 50/s (WhatsApp); 250 ms between iMessage bubbles | send pace | rate | engineer (provider limits) | channel_bridge.ts:273 (250 ms) |
| 118 | supabase/functions/_shared/channel.ts:56-57 | `MAX_ATTEMPTS`, `BACKOFF_MS` | 3 attempts (1, 5, 30 min) | delivery retries | technical | engineer | SQL attempts 0–10 (channel_parity.sql:73) |
| 119 | supabase/functions/_shared/telegram.ts:24-25; whatsapp.ts:33,37; loopmessage.ts:13; loopmessage_adapter.ts:17 | chars / pack | 4,096/1,500 (TG, WA); 5,000/700 (iMessage) | one platform message; split size | technical | engineer (platform limits); 1,500 "texting rule" | — |
| 120 | supabase/functions/_shared/career_proactive_run.ts:164,210,275 | `MAIL_PEOPLE_PER_RUN`; overlap 10 min; first lookback 3 days; max lookback 14 days; batch 5 | 200 people per run, 5 at a time | inboxes read per 5-min run (≈2,400/hour) | rate | engineer | — |
| 121 | supabase/functions/_shared/career_mail_gmail.ts:60,67 | `maxMessages ?? 100`, `maxList ?? 500` | 100 read, 500 listed | Gmail messages per person per run | rate | engineer | — |
| 122 | supabase/functions/_shared/career_mail_store.ts:97 | `user_oauth_connections … .limit(5000)` | 5,000 | people with a career Gmail grant who are ever mail-tracked (the 5,001st is never read) | technical | engineer | — |
| 123 | supabase/functions/_shared/career_mail_model.ts:43,45 | `MAIL_MODEL_MAX_CALLS`, `MAIL_MODEL_MAX_RUN_CALLS`, `MAIL_MODEL_DAILY_CAP` | 20 / person / run; 300 / run; 200 / person / day | second-opinion model calls on mail (`CAREER_MAIL_MODEL=on` only) | spend | architect, **D-025 pending owner** (suggests 60 to stay under D-002) | SQL 20261021130000_career_mail_model_calls.sql:9,18 (`calls between 0 and 200`, `least(…,200)`); career_mail_store.ts:80 |
| 124 | supabase/functions/_shared/career_mail_model.ts:110,226 | `max_tokens: 60`; `timeoutMs: 15000`; subject ≤300, snippet ≤400 | 60 tokens; 15 s | one mail model call and what it is sent | spend | D-025 (pending) | — |
| 125 | supabase/functions/_shared/career_mail.ts:1176 | `FOLLOW_UP_DAYS`, `THANK_YOU_DAYS`, `DRAFT_WINDOW_DAYS` | 14; 7; 30 days | when follow-up / thank-you drafts are offered | rate | engineer | — |
| 126 | supabase/functions/_shared/career_digest.ts:12-13; career_brief_store.ts:109 | `DEFAULT_DIGEST` (Sun 18:00); `DIGEST_LIMIT`; `DIGEST_ACTIVE_DAYS` | 1 per week; 1,500 chars; active in last 30 days | weekly digest | rate | engineer | — |
| 127 | supabase/functions/_shared/career_proactive_run.ts:178 | `BRIEF_AGAIN_MS` | 7 days | interview brief re-sent for the same invite | rate | engineer | — |
| 128 | supabase/functions/_shared/channel_inbound.ts:32-33; channel_parity.sql:221 | `LINK_NONCE_MS`, `LINK_ASK_MS` | 10 min; 1 h | Telegram link token; a "yes" to linking | safety | D-023 (proposed, owner decides) | SQL `expires_at <= created_at + 10 minutes` |
| 129 | supabase/functions/_shared/channel_artifacts.ts:44-45 | `ARTIFACT_TTL_MS`, `ARTIFACT_URL_TTL_SEC` | 7 days; 10 min | stored files sent over chat; signed link | technical | engineer | — |

### G. Eval and spend

| # | file:line | constant / expression | value | what it limits | kind | owner-set? (cite) | also enforced at |
|---|---|---|---|---|---|---|---|
| 130 | .github/workflows/brain-eval.yml:39; evals/career/run.ts:65,186 | `EVAL_BUDGET_USD`; `budgetStop` reserve $0.25 | $15.95 cumulative | eval spend (stops before the item that would cross it) | spend | **Owner, $15** (2026-10-21, quoted :34); $15.95 is builder's arithmetic | evals/career/rejudge.ts:21-25 (+$0.05 margin) |
| 131 | .github/workflows/brain-reliability-320.yml:26,89; evals/brain-reliability/run-comparison.ts:269-279 | `COMPARISON_CAP_USD`; mini arm `cap_usd <= 5`; `> 10` needs owner word; new work ≤$35 | $20 hard cap; $5; $10; $35 | 320-scenario reliability comparison spend | spend | **Owner allocated $20** (:25); $5/$10/$35 per the approval refs | live-meter.ts:43 |
| 132 | supabase/migrations/20261010110000_model_call_budget.sql:40 | `if n>=900 then … 'monthly_limit'` | 900 model calls / person / month | **finance paths only** (`financial_planner`, `flow_router`, `handler.ts`); the career chat does not reserve | spend | engineer | listed so it is not mistaken for a Trainee cap |

### H. Technical bounds (storage and validation sizes, for completeness)

| # | file:line | constant / expression | value | what it limits | kind | owner-set? (cite) | also enforced at |
|---|---|---|---|---|---|---|---|
| 133 | supabase/migrations/20261015020000_career_watch_kv.sql:102-103,243 | input ≤20,000 chars; response/snapshot ≤1,048,576 bytes; writes ≤4,194,304; reminders ≤1,000 | as stated | one saved chat turn and account state | technical | engineer | redefined identically in 20261016120000, 20261020120100, 20261021050000 |
| 134 | supabase/migrations/20261021010000_career_outreach.sql:55-69,89,100-102 | recipient ≤2 KB; signature 1–300; list_costs ≤16 KB; stop reason ≤120 | as stated | outreach rows | technical | engineer | career_tools.ts:792 (signature ≤300) |
| 135 | supabase/migrations/20261020100000_career_mail_tracking.sql:18,34 | evidence 1–300 chars, no 6+ digit runs; draft text 1–1,500 | as stated | mail events and drafts | safety | engineer | — |
| 136 | supabase/migrations/20261020110000_career_connector.sql:25-28,314 | needs/offers ≤20, facts ≤60, filters ≤8 KB; proposals list 1–1,000 | as stated | connector profile size | technical | engineer | — |

## Caps the owner most likely means by "how many applications at once"

- **#1**: 25 a day by default, 50 at most, rolling 24 h. Enforced in TS and in SQL (`career_apply_daily_limit`, `career_apply_enqueue`). The ceiling of 50 is hard-coded in both places.
  - **No product path lets a person set `daily_limit`.** Nothing in `supabase/functions`, `extension`, `workers` or `src` writes `career:account.daily_limit`. In practice everyone gets 25, and 50 needs a direct database write.
- **#4**: the chat's own apply-queue limit. It is the same number, counted per local calendar day, in TS only.
- **#5**: cloud sends of 15 a day (bridge migration, not on trunk). The person is shown "up to 25/50".
- **#7 and #8**: 8 applications per approval card, and one open card at a time. A new card is pushed only after the last one is answered or 24 h pass, never within 30 min of a reply, and only after 10 min of settling.
- **#9 and #10**: 100 postings per queue call, per agent batch, per cloud card, and per text approval card.
- **#11 and #12**: at most 6 applications per claim (default 3), and 3 parallel cloud browsers (max 6).
- **#13**: the extension sends on 1 tab (max 3).
- **#14**: the extension prepares 100 postings per session, 8 at a time.
- **#15, #16 and #17**: the cloud gate. It needs 3 confirmed hand submissions per family. A waiver allows 1–5 sends for ≤7 days. One enrolled person platform-wide, for ≤24 h.
- **#19 and #20**: automatic cloud pauses. A portal pauses for 6 h after 2% failures (one error in up to 50 attempts) or 2 bot checks in 20. A person pauses until the next UTC day after 2 bot checks.
- **#2**: one application per company per 30 days. Owner-set safety, D-011.
- **#21**: 1 attempt per application, never retried.
- **#37, #38 and #39**: the old router stack, live until `CAREER_BRAIN=agent`. 15 a day, which it tells the person "cannot be raised". **5 per ATS family per day.** An autopilot default of 10 a day.

## Uncertain, or could not confirm

- **D-002's "$1 per active user per month, alert at 80%".** I found no code that enforces it on the career path. The only per-user model cap is the finance-only 900 calls a month (#132).
- **Trunk membership.** No network, and the local `origin/trunk` is stale (2026-10-19). I judged "not on trunk" against pin `8c36446f`, which lacks `20261024130000_career_apply_card_cloud_bridge.sql`. That file's header says "DRAFT / NOT APPLIED". So whether the cloud cap of 15 (#5) is live could not be confirmed.
- **The cloud 15 a day (#5)** is cited as an owner ruling only in a migration comment and commit 7bbd2096. `DECISIONS.md` does not record it. Its D-011 entry says only that "Module 149's SPEC_CAPS … stays at 15". D-014 still says "the queue … 15 a day … One cap (15)", which contradicts D-011's 25/50.
- **Whether the old router stack (#37–#40, #68, #69, #93, #94) is what users hit today.** That depends on the deployed `CAREER_BRAIN` value, which I could not read.
- **Voice mock length (#88).** SQL allows 5–60 minutes; both TS clamps use 5–30. I could not tell which is intended.
- **`LIST_TARGET_USD` (#61) and `MIN_PER_ARM` 30 (`career_tailor.ts:18`).** These are reporting thresholds, not enforced limits. I left `MIN_PER_ARM` out of the table.
- **`scripts/career/portal-browser-helper.cjs`** has many per-step `waitForTimeout` / `timeout` values (20 s loads, 2.5 s settles). I did not itemize them; they bound speed, not volume.
- **`packages/career-data`** is data files only; I found no caps there. Scripts under `scripts/career` other than the engine helper are tooling. I did not inventory them.
- **Owner targets above the caps.** WO-042 ("60 reviewed applications in a 30-minute session") and WO-031 ("50+ … per 30-minute session") are owner targets that the 25 default and 50 maximum cannot meet. WO-042:693 says "60 needs the owner's amendment".
