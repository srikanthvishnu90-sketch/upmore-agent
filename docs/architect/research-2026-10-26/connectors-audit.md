# Trainee audit: connectors, credentials, and why the product feels poor or inconsistent (2026-10-26)

Read-only audit. Nothing was edited, committed, deployed or migrated. The live project was read only through SELECT
statements and function-source reads. No token or secret value was selected; tables that hold credentials were read as
counts and column names only.

## How to read this

- **Trunk:** `fe8405586` (2026-10-26 17:50 UTC: F1 to F15, FEATURE E2E, #187 deploy pipeline, #189, #190), read in a
  dedicated worktree at `/home/claude/wt-audit-connectors`.
- **Live:** Supabase project `mrwngntwmnaqrqhupvlt`, read 18:00 to 19:00 UTC through the Supabase MCP.
- **Probes:** five throwaway Deno scripts (in `scratchpad/probe/`, outside the repo) drive the production
  `handler-career.ts handleChat` unchanged. They run on a real Postgres 16 built in CI's migration order
  (`tests/flow/pg.ts`, `tests/flow/handler.ts`), with all flags at their defaults unless a row says otherwise.
  - 176 turns, 165 answered. The other 11 were refused 429, because the handler allows 60 turns per hour per person.
  - Results: `routing-results.json`, `sequence-results.json`, `memory-results.json`, `profile-grant-results.json`,
    `overlap-results.json` in the same folder.
- **Labels:**
  - **[code]** file:line at trunk;
  - **[live]** a production read;
  - **[run]** a probe or command executed here;
  - **[doc]** a repo document, not re-verified.
- **Related work.** A parallel audit (`origin/audit/launch-readiness-20261026`,
  `docs/architect/LAUNCH-READINESS-2026-10-26.md`, not on trunk) independently covers deploy and launch blockers. I cite
  it where it overlaps, and I re-verified every number used here.

---

## 0. Headline

1. **No person can connect anything to Trainee today, on any channel.**
   - Live `gmail-oauth` is the finance-era v26 (deployed 2026-09-29, never updated). It knows only `action:"start"`
     (gmail.readonly, provider `gmail`) [live].
   - Every career feature reads provider `google_career` [code]. That grant has **no UI caller anywhere**: `index.html`
     calls `start` at 14521 and 15538, and `start_career` appears in no client [code].
   - The chat's "connect my gmail" reply promises "one consent click" and a self-test that do not exist, and it carries
     no link [run].
   - `user_oauth_connections` has 0 rows [live].
2. **The only Connections screen in the product belongs to Upmore.** It is the "Agent access" section of the 8.1 MB
   finance app, and it says Gmail is used "only to grab sign-in codes itself during cancellations you approve"
   (`index.html:15359`) [code].
   The published privacy policy names Google as "sign-in only" and never mentions Trainee [code].
3. **Credentials:**
   - Live Vault holds no career token at all.
   - It does hold **two orphaned merchant-login secrets** (`exec_cred_*_cluely`, `exec_cred_*_myclaw`, 2026-09-29, 0
     reference rows). They were written by the version of `exec-vault-store` that stored `password: String(password)`
     [live + git]. Neither disconnect nor account deletion can reach them.
   - `exec_vault_read` was executable by `anon` until a production-only fix at 18:19 UTC today, which is in no repo file
     [live].
4. **A typed API key is kept forever.** "here's my openai key sk-proj-…" is stored verbatim in `agent_messages` and in
   the per-thread state snapshot, and the reply ignores it [run]. Chat redaction covers passwords, codes, SSNs and card
   numbers, but not API keys, tokens or portal usernames [code].
5. **"What Trainee knows about me" lives in at least 12 overlapping stores.** The one that applications are prepared
   from is "the newest thread's snapshot".
   - Confirm a 15-fact resume in thread 1 and state one fact in thread 2: the server preparer's profile drops from 15
     facts to 1 [run].
6. **The live path is a 21-stage cascade:** 17 hand-ordered code-first turns, then an optional staged brain, then the
   regex router (15,256 lines, 120 intents, 2,098 regex literals), then 4 post-router rewriters.
   - Synonymous phrasings land on different engines: "show my applications", "where are my applications" and "my
     applications" reach three different readers with three different answers [run].
   - There are two mock-interview engines that do not know about each other: "end mock" after the router's mock says
     "No mock is running" [run].
7. **About a quarter of live turns are "I didn't understand".** 725 of 2,715 live career replies in 30 days (26.7%)
   were "I didn't catch that" [live]. The probe reproduces 14 of 60 (23%) on trunk [run].
8. **Live is not trunk.**
   - `agent-chat` v251 (2026-10-23 05:07 UTC) predates all 15 features.
   - 32 of 65 go-live migration marks are absent, and 14 repo tables do not exist live.
   - 15 repo functions are not deployed, and one live function (`imessage-inbound`) has no source on trunk.
   - There are two migration ledgers [live].
   - Nobody has sent the live product a message since 2026-10-23 [live].

---

## Part 1. Connectors and credentials

### 1.1 Inventory

State legend:
- **LIVE-USED:** deployed and has live rows.
- **LIVE-IDLE:** deployed, 0 rows.
- **LIVE-BROKEN:** deployed and cannot work.
- **REPO-ONLY:** built, not deployed.
- **DEAD:** imported by nothing.

| # | Connection | What it does | Scopes / access | Where the secret lives | How a person connects (UX) | How they disconnect | State |
|---|---|---|---|---|---|---|---|
| 1 | Google, legacy grant (`gmail`) | Finance cancellation agent reads merchant OTPs | gmail.readonly | Vault `oauth_gmail_<uid>`, JSON {access, refresh, expires_at, email, scopes} [live fn source] | Upmore app → You → Agent access → Gmail → Connect (`index.html:15538`), copy: "only to grab sign-in codes … during cancellations" (`:15359`) | Same screen, Disconnect (legacy row only) | **LIVE-BROKEN**: v26; `verify_jwt=true` blocks Google's GET callback (parallel audit SEC3); 0 rows ever [live] |
| 2 | Google, career grant (`google_career`) | Inbox tracking, F8 follow-ups, apply by email, outreach send, WO-096 codes | gmail.readonly + gmail.send + calendar.freebusy + calendar.events (`gmail-oauth/career.ts:13-18`) | Vault `oauth_google_career_<uid>` (`career.ts:31-33`) | **None works.** No client calls `start_career`. Chat "connect my gmail" → router `connect_google` (`120-career-access.js:236-251`): promise, no link (`secureLinkFor` is supplied by nothing), self-test promised but unimplemented | Repo supports `disconnect {source:"career"}` (`career.ts:181`); no client calls it; chat "disconnect gmail" → "the host runs it" (`120:339`), then "yes" → "Yes to what?" [run] | **REPO-ONLY**: not in the live v26, not in go-live `DEPLOY_FNS` (`trainee-go-live.sh:249`), no `config.toml` entry; 0 grants [live] |
| 3 | Google Calendar | (requested) free/busy, events | calendar.freebusy, calendar.events | inside #2 | none | inside #2 | **DEAD scopes**: no production code calls the Calendar API (grep: only `gmail-oauth` and scenario scripts); `career_capabilities.ts:5` "Calendar is left out on purpose: nothing reads it here" |
| 4 | Gmail send, scheduled (outreach WO-033) | Sends approved outreach drafts | gmail.send of #2 | #2 | "send all / send 1-7" on a text batch | none specific | **REPO-ONLY**: `career-proactive` not deployed; switch `CAREER_OUTREACH_SEND` (`career-proactive/index.ts:81-89`) |
| 5 | Gmail send, in chat (apply by email WO-032, F8 follow-ups) | Sends one email on a text "yes" | gmail.send of #2 | #2 | text "yes" while the card is the last word | none | **REPO-ONLY in effect**: needs #2 and `CAREER_EMAIL_SEND` (`handler-career.ts:413, 515`); writes into the same outreach store as #4 but uses a different executor and switch |
| 6 | Emailed codes (WO-096) | Reads an ATS's verification code while an approved application runs | gmail.readonly of #2; senders limited to the ATS domains (`career_email_code.ts:28-37`) | in memory only (`EmailCode`, `:51-72`) | automatic, inside an extension or worker run | none | **REPO-ONLY**: `career-email-code` not deployed. Its finance twin `agent-exec` reads legacy #1 (`agent-exec/index.ts:1267-1304`). D-029 says "or the employer's own domain"; the code says "An employer's own domain never counts" (`:30-31`) |
| 7 | Inbox tracking (WO-024 / F8) | Classifies job mail and matches it to applications | gmail.readonly of #2 | #2 | "check my email now" | none | **REPO-ONLY**: "check my email" → `MAIL_OFF` [run]; `CAREER_MAIL_TRACKING` off; the cron is not deployed |
| 8a | iMessage (live) | Founder-only test bridge | LoopMessage keys per agent (`ruwe`, `upmore`) | env | text the number | none | **LIVE-IDLE**: `imessage-inbound` v37, hard-coded single sender and single user id [live source]; **no source on trunk** (deleted by `6c78a63a8`, restored only on `origin/fix/restore-imessage-inbound` `b2a8bcef9`); 0 iMessage threads in 30 days [live] |
| 8b | iMessage (trunk) | Multi-user LoopMessage ingress, signup allow-list, link by same phone | LoopMessage key | env | text the number | STOP | **REPO-ONLY**: `trainee-inbound`. The older `agent-message-inbound/turn/worker` is also repo-only, and `agent-message-turn/index.ts:3` imports the **finance** `agent-chat/handler.ts` |
| 8c | Telegram (live) | Test bridge, inline keyboards for 155 batch cards | bot token | env | message the bot (allow-listed chat ids only) | none | **LIVE-USED (test)**: `telegram-inbound` v10 maps every allowed chat to `CHANNEL_TEST_USER_ID` (`channel_bridge.ts:45-54`); 1 thread, 162 messages, last 2026-10-22 [live] |
| 8d | Telegram (trunk) | Multi-user, `/start <token>` linking | bot token; link nonce SHA-256, 10 min (`trainee-inbound/store.ts:76-83`) | `channel_link_nonces` | "connect telegram" (D-023, still "proposed") | none | **REPO-ONLY**: `trainee-telegram`. Account creation fails (parallel audit B3). Chat "connect telegram" / "link my telegram" → generic fallback [run] |
| 8e | WhatsApp | Live: Twilio sandbox test bridge. Trunk: Meta Cloud API | Twilio / Meta tokens | env | allow-listed numbers | none | Live `whatsapp-inbound` v8 is Twilio, against D-019 ("Meta's Cloud API directly, no reseller"). `trainee-whatsapp` is **REPO-ONLY** |
| 8f | Channel linking | Bind a phone or chat to an account | — | `channel_link_nonces`, `channel_link_requests`, `agent_message_link_codes` | **No screen exists**: `index.html` has 0 occurrences of "telegram". `career_capabilities.ts:56` tells the model the unlock is "they link their phone in the Trainee app" | — | all three tables have 0 rows [live] |
| 9 | Browser extension | Fills and submits applications on GH, Lever, Ashby, Workday | `host_permissions: ["<all_urls>"]` (`manifest.json:15`) | The person's Supabase session in `chrome.storage.session`. It is taken by **reading `sb-<ref>-auth-token` from localStorage of an open `upmore-topaz.vercel.app` tab** (`background.js:72-97`), or by magic link (`:99-108`) | "Use my Upmore sign-in" in the side panel; the name is "Trainee apply (Upmore)" | sign out in the panel | Not published (parallel audit B7). The resume is kept **locally** as base64 (`background.js:1153-1157`). Facts = answered application questions plus an imported JSON file (`:150-215`), **never the chat-confirmed profile**: `career_apply_account_own` exposes only an account stamp (`20261020030000_career_apply_cards.sql:36-45`) |
| 10 | `extension-sync` | "saved answers" derived from the freshest thread snapshot | JWT | — | — | — | **LIVE but DEAD**: v6, 0 callers (grep of `extension/`, `src/`, `index.html`) |
| 11 | `manual-connect` (finance) | Browserbase live window for brokerages; stores the browser session | cookies + localStorage of 3 unverified playbooks: cash-app-investing, fundrise, yieldstreet | Vault `manual_<uid>_<platform>` (`manual_connect.ts:29`) | Upmore app | `disconnect` action | **LIVE-IDLE**: v13, 0 rows. Its health check runs hourly inside the finance `upmore-proactive` cron. It is the only implementation of D-013(b)'s "encrypted session" idea, and it is for brokerages |
| 12 | `exec-vault-store` + `agent-exec` (finance) | Merchant cancellation agent (devin, cluely, myclaw) | Browserbase; legacy Gmail #1 | Vault `exec_cred_<uid>_<merchant>` + `exec_credential_refs` | Upmore app cancel sheet | per merchant; "Revoke all agent access" | **LIVE-IDLE, with orphans**: refs 0, but 2 vault secrets from 2026-09-29 (cluely, myclaw), whose user still exists [live]. The writer then was `286492ca2`, which stored `password: String(password)`. The 2026-10-12 "no password storage" commit (`4ca665279`) checked the refs table ("0 rows, nothing to purge"), not the Vault |
| 13 | Alpaca brokerage OAuth (finance) | Trading | Alpaca OAuth | `brokerage_accounts.vault_key_ref` | Upmore app; a connect card **titled "Connect Alpaca to Trainee"** (`76-connect-cards.js:12-18`, `connect/alpaca.html`) | Upmore app | **LIVE-IDLE**: v23, 0 rows |
| 14 | Plaid, SimpleFIN (finance) | Bank data | aggregator tokens | Vault `exec_cred_<uid>_plaid`, `simplefin_access_url_<uid>` | Upmore app | Upmore app | **LIVE**: `plaid-sync-6h` cron active for 0 items; **1 SimpleFIN connection and its bank-access secret still in the Trainee database** [live] |
| 15 | Stripe (finance billing) | checkout, credits, webhook | Stripe keys | env | — | — | **LIVE-IDLE**; career code never calls it (grep) |
| 16 | People Data Labs (WO-036) | Hired-background aggregates | owner `PDL_API_KEY` | env (owner) | — | — | **DEAD on the live path**: reachable only through the brain (`handler-career.ts:644`), which is pinned off; `CAREER_PDL` off (`career_hired.ts:207-213`); `career_pdl_calls` and `career_hired_cache` missing live [live] |
| 17 | Hunter (email verify) | Verifies contact addresses | owner `HUNTER_API_KEY` | env | — | — | **DEAD on the live path**: passed only to `agentTurn` (`handler-career.ts:647`) |
| 18 | ATS public APIs | Ingest; on-demand posting read | none (public) | — | paste a link, "apply to the X role at Y" | — | Ingest is **REPO-ONLY** (0 rows in `career_postings`). The F1 E2E on-demand fetch is **on by default** inside a chat turn (`handler-career.ts:481-482`, `CAREER_APPLY_LINK` defaults on) |
| 19 | ATS accounts (Workday, iCIMS, Taleo, SuccessFactors) | Applicant accounts and verification | the person's own login (D-013(b)) | nothing is stored, by design | Workday: the extension stops at account pages, "Sign in first" (`content.js:235-247, 371-374`). iCIMS, Taleo, SuccessFactors: **no support at all**; content scripts match only GH, Lever, Ashby and Workday (`manifest.json:19-28`) | — | email verification = #6 (not deployed) |
| 20 | LinkedIn / Handshake "browser source" | Router offers a stored signed-in session | "session_stored_as: vault_reference_only" (`120-career-access.js:217-224`) | nothing (no implementation) | "connect my linkedin" → "Open this, sign in, done in 30 seconds … the agent reuses it from there" (`120:361`) [run] | — | **A promise with no code, against the standing rule "Never automate LinkedIn"** (CLAUDE.md). The legitimate path (CSV export import, F10) exists |
| 21 | WO-026 Connector (peer intros) | Double-opt-in intro network | — | — | — | — | **DEAD**: `career_connector.ts` (1,038 lines) is imported by nothing (`:22` "Not wired into handler-career.ts yet"); its 3 tables are missing live |
| 22 | Cloud apply (WO-039, cloud runner) | Applications driven in a Vercel sandbox | owner `VERCEL_TOKEN` | env | "apply for me in the cloud" → "yes" | "cloud off" | **REPO-ONLY**: `career-cloud-runner` not deployed, but the chat says "**The cloud is on**, with no daily limit" [run] |

**Counts.**
- **Connection types:** 22. None of them works for a career user live.
- **Live functions:** 25.
  - 16 are finance-era: `gmail-oauth` v26, `agent-exec`, `exec-vault-store`, `manual-connect`, two `broker-oauth-*`,
    `plaid`, `plaid-sync`, two `simplefin-*`, three `stripe-*`, `cancel-watcher`, `news-feed` and `agent-proactive`.
  - The career-side functions that connect anything are the unused `extension-sync` and three single-user test
    bridges.

### 1.2 Credential storage, as it really is

- **Mechanism.**
  - Supabase Vault, encrypted at rest. Each entry is read through a SECURITY DEFINER wrapper called with the service
    role (`20260928_000011_oauth_connections.sql:28-80`).
  - Five wrapper families exist: `oauth_*`, `exec_*`, `manual_*`, `simplefin_*`, and broker cleanup. That is 16 live
    functions [live].
  - Entries are named per user, but there is no per-user key. The service-role key opens every secret, and it is held
    by:
    - every edge function;
    - the channel bridges, which use it as a bearer token to `agent-chat` with `as_user_id`
      (`handler-career.ts:140-148`);
    - the prepare-ahead VM (parallel audit SEC5).
- **What is in the live Vault** [live, counted by name prefix only]:
  - 2 `exec_cred` (orphaned, see #12);
  - 1 `simplefin_access` (a finance user's bank access);
  - 1 `upmore_proactive` (the cron secret);
  - **0 OAuth tokens, 0 browser sessions.**
- **Drift.**
  - The repo revokes `anon` on `exec_vault_read` (`20260928_000010_exec_vault_read.sql:21`), but live granted it until
    `security_revoke_anon_definer_functions_20261026` was applied directly at 18:19 UTC today. That migration exists in
    no repo branch [live: `supabase_migrations.schema_migrations`; grep of 671 remote branches].
  - Now, `anon` can execute no vault wrapper. `authenticated` can still execute `simplefin_secret_exists` and
    `simplefin_vault_delete` [live].
- **Lifecycle gaps** [code]:
  - **No revocation at Google.** 0 calls to `oauth2.googleapis.com/revoke` anywhere. Disconnect deletes only the Vault
    entry and the row, so the grant stays authorized in the person's Google account.
  - **A revoked grant is silent.** `career_mail_gmail.ts:132` turns `invalid_grant` into `null`, so the row stays and
    "what's connected" keeps saying "Gmail: connected" [run].
    - `career_capabilities.ts:8` declares an `expired` status that nothing produces.
  - **`exec_credential_refs` has no vault-cleanup trigger** [live triggers], which is how secrets become orphans.
  - **`delete-account` misses three things:**
    - it removes `exec_cred_*` only by iterating ref rows (`delete-account/index.ts:51-77`), so orphans survive account
      deletion;
    - it deletes `oauth_gmail_<uid>` by name but relies on a trigger for `oauth_google_career_<uid>` (`:95-110`);
    - it cannot reach the extension's local copies of the resume.
- **Secrets typed into chat** [run + code]:
  - `identity_redact.ts:5-14` covers SSNs, card and account numbers, passwords, labeled codes and CVVs.
  - It does not cover API keys, bearer tokens or portal usernames. Probe results:
    - `sk-proj-…`: stored in `agent_messages` (1/1) and in `agent_flow_state` (1/1);
    - "remember my icims username is janedoe88": stored in both;
    - both replies are the generic fallback.
  - The password note itself says "Upmore never needs it here … anything else sensitive goes on **Upmore's secure
    link**" (`:67-68`). No such link exists.
- **User-provided keys or logins Trainee should remember: there is no place.**
  - All third-party keys (OpenAI, PDL, Hunter, Browserbase, LoopMessage, Telegram, WhatsApp, Vercel) are owner
    environment secrets.
  - The only per-user credential stores in the database belong to the finance product.

### 1.3 "What Trainee knows about me": one model or several? Several.

| # | Store | Scope | Written by | Read by |
|---|---|---|---|---|
| 1 | Router profile `agent_flow_state.state.career.stores.profile` | **per thread** (22 `STATE_KEYS`) | router (142/122/146), resume confirm | router; **the server preparer** (`career_apply_profile_for`: newest thread with facts, `20261025120000_career_apply_prepare_ahead.sql:168-176`); `extension-sync` (freshest snapshot, `extension_sync.js:268-273`) |
| 2 | Router `statedFacts` | per thread (account only with #3) | router, `profile_correction` | screens (`handler-career.ts:458-459`), F9 |
| 3 | Account memory (`career:account` → `memory.profile/tracker`) | account | host seam, **only with `CAREER_ACCOUNT_MEMORY=on`**; its migration `20261026090009` is absent live | router, on load |
| 4 | Standing instructions (`career_watch_kv` key `career:standing`) | account | brain `remember_instruction`; F9 (only when the router "did not understand"); F5 "judge prompt:" | brain prompt; F9 recall; F5 judge |
| 5 | Provenance (`career_events` `fact_confirmed`) | account | resume-confirm evidence step; F9 stated facts | brain timeline; recall (0 rows live) |
| 6 | Watch profile (`career_watch_kv` key `career:watch-profile:<uid>`) and `career_alert_prefs` | account | router; watch bridge (D-032) | alerts run (not deployed) |
| 7 | Application answers (`career_apply_questions`, answered) | account | chat questions turn; extension | extension (`career_apply_answers_own`); preparer |
| 8 | Extension local storage | one browser | panel "set resume", "import facts" (JSON) | extension only |
| 9 | Server resumes (`career-resumes` bucket, personas) | account | tailor | tailor, apply by email |
| 10 | Preferences scattered across tables: outreach prefs, digest prefs, cloud opt-in and settings, daily pace | account | one code-first turn each | each owner only |
| 11 | Applications: router `trackStore` (per thread), `career_apply_wanted`, `career_apply_jobs`, mail events, `extension_submission_reports` | mixed | five writers | **three different readers (Root cause 3)** |
| 12 | `channel_memory.ts` | — | **imported by nothing** (186 lines) | — |

Probe evidence [run], defaults unless marked:
- **Memory is per thread.** A resume (15 facts) confirmed in thread A; then "what do you know about me" in thread B
  returns "Nothing is on your record yet", and "tailor my resume …" asks for the resume again (`sequence-results.json`,
  `memory_flag_off`).
  - With `CAREER_ACCOUNT_MEMORY=on`, thread B lists the 15 entries. The tailor then says "no TEST Board role is in the
    current list", although F5 had listed it from `career_postings` one probe earlier: the router's tailor reads only
    the KB snapshot.
- **Applications are prepared from whatever thread was touched last.** After "please remember I need visa sponsorship"
  in a second thread, `career_apply_profile_for` returns **1 fact instead of 15** (`profile-grant-results.json`).
- **Standing needs are kept for 1 of 5 phrasings.** Kept: "from now on, no unpaid internships". Lost:
  - "never send me staffing agencies", F9's own example, goes to the containment fallback;
  - "remember that I only want roles in Chicago", F9's other example, becomes a search for "remember that I only want
    in Chicago";
  - "I only want remote roles" becomes a search;
  - "please remember I need visa sponsorship" becomes a per-thread stated fact (`memory-results.json`).
  - Root cause: F9 listens only for `career_catchall`, `career_fallback` and `honest_unavailable`
    (`career_account_memory.ts:20, 54`). The router has a second "not understood" shape, the containment fallback with
    intent `null`. F9's unit test mocks the router's output as `career_catchall` (`account-memory-unit.test.ts:17`), and
    the handler test reaches it only after a resume is on file (`flow-account-memory.test.ts:58-75`).
- **Erase is partial and has side effects.**
  - "forget everything" → "yes" clears standing (1→0) and events (2→0), but **not `career_apply_wanted` (1→1)**.
  - The next thread is told "Career work is paused … Say resume career work to lift this pause".

### 1.4 What a world-class connect experience is missing

1. **No Trainee Connections page.** Users need one list showing each source, what it allows, when it was granted, and
   buttons to reconnect and disconnect on every channel. The only existing screen is the finance one (#1), with finance
   copy.
2. **No connect flow from chat.** `connect_google` returns an `edge_action` that no host executes (0 executors of
   `edge_action` outside the bundle), with no link. "done, I connected it" → fallback. "disconnect gmail" then "yes" →
   "Yes to what?" [run].
3. **Status contradicts reality.**
   - A legacy `gmail` row, the only kind production can create, is reported as "Nothing is connected yet. Say 'connect
     my Google' to start." [run].
   - A `google_career` row reads "Gmail: connected", even when its refresh token is dead.
4. **No scope explanation and no least privilege.**
   - Two Calendar scopes are requested and nothing uses them.
   - gmail.readonly is a restricted scope and gmail.send a sensitive one, so public use needs Google verification and a
     CASA assessment (parallel audit SEC3). The privacy policy says "Google: sign-in only" (`privacy.html:96`).
   - The consent screen is the founder's shared client, "same one Ring uses" (`gmail-oauth/index.ts:5-6`).
5. **No revocation, no expiry handling, no audit of grants for career.**
6. **Hosts disagree.**
   - Connect links, the OAuth return and CORS use `upmore-srikanthvishnu90-sketchs-projects.vercel.app`
     (`integrations.ts:10`, `gmail-oauth/index.ts:45`).
   - The extension signs in from `upmore-topaz.vercel.app` (`extension/config.js:8`).
   - Both are behind Vercel SSO (parallel audit B7).
7. **Channels disagree.**
   - Web: buttons for a finance grant.
   - Chat: promises.
   - Telegram and WhatsApp: no linking.
   - iMessage: one hard-coded number.
8. **No safe place for a user-provided secret**, and no redaction of the ones people will paste.

---

## Part 2. Why it feels poor or inconsistent: root causes

### Root cause 1: several brains, ordered by hand, each claiming text with its own regex

**Evidence.**
- **The turn order:**
  - 17 pre-router code-first turns (`handler-career.ts:362-553`);
  - the staged brain (`:559, 620`), which runs the router once more on a disposable copy to decide
    (`career_staged.ts:89-111`);
  - the brain proper, pinned off (`career_brain.ts:26`);
  - the router (`:681`);
  - F5 replacing the router's reply after it ran (`:682-697`);
  - four post-router rewriters: resume evidence, F1 answer capture, F4 rewrite, F9 memory (`:704-757`);
  - two structured planners.
- **The turn count is growing.** It was 9 code-first turns at `49364988` (DIAGNOSIS §1) and is 17 at trunk.
- **Every guard is a hand-copied conjunction that grows by one term per feature:** 2 terms for `card` up to 18 for
  `offered`. One copy is already wrong: `status` lacks `!employerAns` (`:522`) [run: AST scan of the guard lists].
- **FEATURE labels:** 35 markers for 10 features (1, 4, 5, 8, 9, 10, 12, 13, 14, E2E) inside one 839-line function.
- **The router:** 15,256 lines, 120 distinct intents, 2,098 regex literals, 2,377 prose literals [run: acorn token
  count]. Its catch-all fires only when a word-list heuristic says the text is "career-related"; otherwise it returns
  `null` and containment answers differently (`142-career-router.js:2870-2900`, `140-career-reply.js:129`).
- **The same need, said differently, reaches different engines** [run, each in a fresh thread]:

| Need | Phrasings → turn that answered |
|---|---|
| List applications | "show my applications", "list my applications" → **card** ("Nothing is prepared yet. Prepare applications on your computer first"); "where are my applications" → **status** ("No applications are on record from the last 30 days"); "my applications", "check my applications", "application status" → **router tracker** ("Your tracker holds no applications on record in this session") |
| Search jobs | "find me data analyst jobs in Chicago" and "any data analyst roles in chicago?" → **F5** over `career_postings`; "show me jobs" → **router** over the KB snapshot, "ranked by fit with your profile" with no profile; "data analyst jobs" → **catch-all** ("… what date does it turn on?"); "I'm looking for a data analyst job in Chicago" → **internship discovery** ("1 is not internships or new-grad roles") |
| Mock interview | "mock me for…", "mock interview for Stripe", "start a mock interview" → **`career_mock.ts`** (6 or 4 questions, scored out of 15); "practice interview", "interview me" → **router 127** mock. After the router's mock, "end mock" answers "No mock is running" |
| Email someone | "apply by email to Stripe" → **WO-032**; "email Stripe", "email Maya at Stripe", "write to the recruiter at Stripe" → **F10**; "follow up with Stripe" → **F8** |
| Negotiate | after an offer, "help me negotiate" → **F12** counter card; in a fresh thread → **router** generic advice; "should I take it" after the offer → **router**, which ignores the offer it was just told; "how much should I ask for" → fallback |
| What was sent | "what did you send to Stripe" → **F14**; "did you send anything to Stripe" → fallback; "what did I submit to Stripe" → **company_intel** (Stripe's company file) |
| Apply | "apply to the X role at Y" → **F1** queue; "apply for me" → catch-all; "can you apply to jobs for me?" → router "the browser worker is not connected here"; "apply to 10 data analyst jobs in Chicago" → a search |
| Compound | "find me data internships and also tell me what my tracker looks like" → tracker only, search dropped |

**Structural fix.**
- Use one intent layer: either a model classifier with a strict schema (the staged brain is already metered and gated),
  or one declarative table. It maps to one **capability registry**, where each capability declares its trigger, its
  inputs (from one person model) and a typed result.
- Delete the cascade: the handler becomes "classify → one capability → render".
- The router's 120 intents become capabilities, or they are removed.

### Root cause 2: no single owner per concept, so every concept exists two to ten times

**Evidence** [code unless marked]:
- **Apply paths (8):**
  1. the 155 batch stack, plus `career_task_bridge.js`, plus `batch-executor.cjs`, which only tests reach;
  2. the D-014 queue (`career_apply.ts`, `career_apply_jobs`, `scripts/apply.ts`);
  3. the extension (`career_apply_extension_begin_own` / `_agent_own`);
  4. the desktop `approve-first.ts`;
  5. prepare-ahead;
  6. the cloud bridge plus the cloud runner;
  7. F1 chat-to-queue;
  8. apply by email.
- **Daily caps, three regimes:**
  - `149:123 SPEC_CAPS perDay 15`;
  - `career_apply.ts:56` "No volume ceiling (CAPS-1390)";
  - DECISIONS D-011 says 25/50 and D-014 says 15;
  - CAPS-1390 is not in DECISIONS.md.
- **Approval grammars (≥10):**
  - WO-022 card: "yes", "yes but not 2" or a tap, within 10 minutes, in direct reply;
  - cloud card: a yes only opens it;
  - email card: a yes sends;
  - outreach: "send 1-7,9", "redo 3", "edit 3:";
  - F8: a yes sends;
  - 155: "Approve batch <id>", or Telegram buttons;
  - extension: a panel tap;
  - questions: "2 yes", "draft 2", "use 2";
  - employer ask: yes or no;
  - cloud opt-in: a yes;
  - erase: a yes.
  - The web app renders only WO-022 card answers, F15 message cards (whose tables are missing live) and the cloud card
    id. It has no renderer for `email_card`, `offer_card` or `employer_question` (`index.html` grep).
- **Status readers (5+):** `career_apply_status.ts`, `career_standing.ts`, router `tracking_status`,
  `career_situation.ts`, F14 receipts, plus the brain tools.
- **Fact stores:** 12 (§1.3).
- **Outboxes and delivery (6):**
  - `career_outbox`;
  - `career_reminder_outbox` (no TypeScript reader);
  - `imessage_outbox`;
  - `agent_message_outbox`;
  - `agent_proactive_log` (finance "Updates from Upmore");
  - direct sends in two test bridges.
- **Engines and prose for the same feature:** 2 mock engines, 2 negotiation engines, 2 search data sources
  (`career_kb_postings` and `career_postings`), and 3 "not understood" replies (router catch-all, containment fallback,
  and the live-only "I didn't catch that").
- **Google glue:**
  - the grant-reading glue (connection, vault read, vault write) is copied 4 times: `handler-career.ts:388-404`,
    `career-email-code/index.ts:23-42`, `career-proactive/index.ts:20`, `career_inbox_followups.ts:313`;
  - Gmail scopes are declared 3 times (`gmail-oauth/career.ts:13-14`, `career_outreach_gmail.ts:11-12`,
    `career_mail_gmail.ts:9-12`);
  - token refresh exists twice (`agent-exec/index.ts:1286`, `career_mail_gmail.ts:126`).
- **Channel ingress:** 9 functions for 3 channels (`imessage-inbound`, `trainee-inbound`, `agent-message-inbound`,
  `-turn`, `-worker`, `telegram-inbound`, `trainee-telegram`, `whatsapp-inbound`, `trainee-whatsapp`).

**Structural fix.**
- One module per concept, and delete the rest:
  - one apply stack (D-014 already rules it, so execute the retirement);
  - one card and approval model with one grammar ("yes, no, all but N, change N", plus a tap), rendered on every
    channel;
  - one read model for status;
  - one outbox;
  - one Google client module.
- Enforce it with an import-boundary test: for example, nothing outside `connections/` may read
  `user_oauth_connections`.

### Root cause 3: state lives in per-thread snapshots, with account stores bolted on

**Evidence** [run]:
- the profile is lost in a new thread (flag off);
- the preparer falls from 15 facts to 1 after a second thread;
- status readers disagree about the same Google application:
  - "where are my applications" → "No applications are on record … nothing was sent";
  - "what's the status of my apps" → "Google: at the applied stage";
  - "did my application to Google go through" → "I have no application to Google on record … You told Trainee:
    applied".
- after "apply to the first one" and "apply to these" (2 queued), "where are my applications" says "No applications
  are on record" (`sequence-results.json`, `search_then_apply`), because the reader ignores `career_apply_wanted`;
- erase leaves the queue in place;
- `career_watch_kv` is a junk drawer. Its keys in one probe run: `career:account`,
  `career:turn:<thread>:<turn>` (turn replays), `career:standing`, `career:watch-profile:<uid>`.
- Live: 1,615 thread snapshots and 0 `career_events` [live]. Each person's "profile" is fragmented across their
  threads.
- iMessage hides this (one thread per contact, `channel_inbound.ts:42` per DIAGNOSIS); the web app exposes it.

**Structural fix.**
- One account-scoped Person model:
  - facts with provenance;
  - preferences and standing needs;
  - applications as one state machine (wanted → prepared → approved → sent → confirmed);
  - connections.
- One read API, used by the router, the brain, the extension (expose it through an RPC) and the worker.
- Thread state keeps only dialogue frames.
- Erase is one transaction over that model.

### Root cause 4: hand-written prose per feature, claiming states the code did not check

**Evidence.**
- **Volume.** About 5,560 prose literals: 4,548 in the career domain modules and 1,015 in the TypeScript turn
  modules [run]. ARCHITECTURE §3.1 says "No canned prose. The only fixed strings are the safety and failure sentences
  in loop.ts."
- **Claims without state behind them:**
  - "I will run the self-test: one test email … one test event" (no self-test, `120:251`);
  - "say the word and the host runs it" (no host, `120:339`);
  - "The counter email itself, composed from your offer record" with **no offer on record** (placeholders "your
    company", "Recruiter name") [run];
  - "ranked by fit with your profile … outside the places on your profile" with an empty profile [run];
  - "The cloud is on, with no daily limit" (the runner is not deployed) [run];
  - live: "I've handed this batch to the browser worker to prepare" (31 times in 30 days, last on 2026-10-22, while no
    executor ran) and "Found 0 … roles. 0 were eligible; I took the 0 you named" (58 times) [live];
  - "That part is the money product — and this build is the career agent. The finance side of Upmore …" (20 live,
    still at `142:15064`).
- **Internal jargon and brand leaks:**
  - F8's replies start with "NOT_WIRED: nothing was read" (`career_inbox_followups.ts:172, 254, 274`);
  - "Upmore" appears in redaction notes and in the extension;
  - an echo bug repeats the person's words into the reply: "I found no posting for I only want remote remote" [run].
- **Tone varies per module:**
  - "Plainly, about submitting applications:", "Negotiation runs on sourced numbers … no bluffing", "Here is exactly
    what turning on the cloud means";
  - two pause texts with different statuses ("No new action will be started" versus "… was started. Say resume career
    work …").
  - The stale header still says "career turns make zero model calls" (`handler-career.ts:22-26`), although five
    features now call the model.

**Structural fix.**
- One renderer turns typed results into words.
- A claim check requires every sentence that asserts state to cite a field of the result; this generalizes D-024 and
  the brain's unbacked-claim guard.
- One tone guide, in one file.
- Where the model writes, it writes over the typed result. Delete the per-module prose.

### Root cause 5: connectors were never built as a product surface, and finance is still underneath

**Evidence:** §1.1 rows 1-2, 8-15 and §1.4.
- The career grant has no client and no deploy path.
- The only connect screen and the only privacy policy are Upmore's.
- Three finance cron jobs run hourly, daily and every 6 hours: `upmore-proactive`, `cancel-watcher-daily`,
  `plaid-sync-6h` [live].
- Nine finance functions are deployed.
- The Google client is shared with Ring.
- The connect cards offer "Connect Alpaca to Trainee".
- The career code graph is clean: `handler-career.ts`'s graph has 109 modules and no `router_core.js` [run: deno info].
  The leak is in the product shell, the data and the infrastructure, not in the chat handler.

**Structural fix.**
- A Connections service:
  - one table;
  - one Google module (consent, refresh, revoke, expiry status);
  - one status API that the chat and every channel render;
  - connect and disconnect as real actions from any channel (a signed link per channel, D-023-style);
  - least-privilege scopes requested per feature at first use;
  - deployed by go-live.
- Then retire the finance functions and crons, and move the finance data out of the Trainee project.

### Root cause 6: live is not trunk, and nothing records the difference

**Evidence** [live]:
- **Functions:**
  - `agent-chat` v251, deployed 2026-10-23 05:07 UTC, before every FEATURE merge (2026-10-26 04:26 to 15:54 UTC);
  - 15 repo functions are not deployed, including `career-proactive`, `career-ingest`, `trainee-*`,
    `career-email-code` and `career-cloud-runner`;
  - `imessage-inbound` is live with no source on trunk;
  - `gmail-oauth` is live as v26 from 2026-09-29.
- **Migrations:**
  - 32 of 65 go-live `MIGRATION_MARK`s are absent: all 17 migrations of 10-25 and 10-26, plus 15 older ones,
    including `career_resume_tailoring`, `career_apply_message_cards` and `career_deploy_ledger`;
  - 14 of 155 repo tables are missing, including F14's receipts, WO-030 question drafts, prepare attempts, ingest runs,
    the PDL tables and the connector tables;
  - two ledgers disagree: `upmore_migration_ledger` holds 74 files, newest `20261024120000`, while
    `supabase_migrations.schema_migrations` holds 4 rows, all applied today. One of them is a `_live_safe` variant of a
    repo file, and one exists in no repo file.
- **User-facing text differs.**
  - Live fallback: "I didn't catch that. Try naming the job, company, or person". Trunk removed it in `36bac970d`
    (03:39 UTC), about 90 minutes before v251 shipped. It still appears once after v251 (12:25 UTC), so v251's lineage
    cannot be established from trunk.
  - Trunk fallback: "I'm Trainee … I may have missed what you meant".
- **Traffic:** the last user message was 2026-10-23; there are 0 messages on 10-24, 10-25 and 10-26.

**Structural fix.**
- Deploy only through `trainee-go-live.sh` from a trunk SHA with provenance (#187 exists; it has never shipped).
- Make out-of-band production DDL a policy violation: the fix today should have been a repo migration first.
- Add `gmail-oauth`, `career-email-code` and the extension endpoints to `DEPLOY_FNS`.
- Run a nightly drift check: functions and their SHA, marks, the grant audit, and anon on SECURITY DEFINER functions.
- Run a live smoke transcript per channel after each deploy.

### Root cause 7: the process makes inconsistency the default

**Evidence** [run unless marked]:
- **Volume of change:**
  - 671 remote branches and 43 worktrees;
  - 1,611 trunk commits since 2026-10-18;
  - 15 feature PRs (#170 to #186) merged in about 11.5 hours (2026-10-26 04:26 to 15:54 UTC), each adding a block to
    the same function, as the brief instructs ("add your code-first turn as ONE clearly delimited block") [doc: feature
    brief].
- **Flags:** 25 `CAREER_*` names in production code, plus `CONNECTOR_ENABLED`, `CLOUD_RUNNER_ENABLED`, the constant
  `AGENT_BRAIN_RELEASED`, the extension's `personSubmits` and `agentSubmits`, and the database switch
  `CAREER_AGENT_SUBMIT`. All default off. The handler alone reads 16 environment names directly plus 6 helper families
  [run grep]. Production is a combination of flags nobody exercises; CI covers the all-off default.
- **Tests assert text, and mock the seam that fails:**
  - 31,579 assert calls across 1,038 test files (144k lines);
  - about 2,745 asserts on reply text and about 1,171 on database state (≈2.3:1);
  - in `tests/architect`: 171 reply-text checks against 72 state reads, and 21 of 204 files drive the real handler;
  - F9's unit test fabricates the router's catch-all shape (`account-memory-unit.test.ts:17`), so the real
    containment-null path that drops its own example phrase is never tested.
- **Generated bundles in git:**
  - `router_core.career.js` (2.9 MB), changed in 158 trunk commits since 10-18;
  - the finance `router_core.js` (7.5 MB);
  - `extension/lib/trainee-core.js` (295 KB);
  - `agent_core.js` copied twice, identical;
  - `index.html` and `src/upmore-app.html`, identical 8.1 MB files.
- **Frozen archive.** D-006 keeps rules in a frozen archive ("a rule that still matters becomes a test"), and the
  tests that exist assert prose.
- **Decisions are not the source of truth:** CAPS-1390, the D-029 sender rule and D-019 (Twilio live) all diverge from
  the documents.

**Structural fix.**
- One integrator owns the handler and the capability registry.
- Features land as registry entries, not as blocks in a shared function.
- Acceptance is a transcript eval through `handleChat` on real Postgres with state assertions. This repo's own harness
  already does it, so use it as the gate.
- Every flag carries an owner and an expiry date. More than about 5 live flags blocks a merge.
- Bundles are built in CI, not committed.
- DECISIONS.md is updated in the same PR as any rule change.

---

## Part 3. What to consolidate or delete

**Delete** (each is unused by career, dead, or a duplicate) [live counts above]:
- **Finance edge functions:** `agent-exec`, `exec-vault-store`, `manual-connect`, `broker-oauth-start` and
  `broker-oauth-callback`, `plaid`, `plaid-sync`, `simplefin-claim`, `simplefin-proxy`, `cancel-watcher`, `news-feed`,
  `agent-proactive` and its cron, `agent-payments`, `agent-workflows`. Also the Stripe functions, unless Trainee billing
  needs them.
- **Finance crons:** `cancel-watcher-daily`, `plaid-sync-6h`, `upmore-proactive`.
- **Finance code:**
  - `agent-chat/handler.ts` (1,743 lines) and its 30 answer modules;
  - `_shared/router_core.js` (7.5 MB) and the two `agent_core.js` copies;
  - `connect/alpaca.html` and the Alpaca connect card;
  - the "money product" reply (`142:15064`).
- **Data (owner action):** the two orphaned `exec_cred` Vault secrets, removed without reading them; the SimpleFIN
  secret and row; the finance tables.
- **Dead career code:**
  - `career_connector.ts` and its migration (unless the network is still planned);
  - `channel_memory.ts`;
  - `extension-sync` (or wire it);
  - `agent-message-*` (and `agent-message-turn` routes to the finance handler);
  - the router's LinkedIn "browser source" promise (`120:217-224, 361`).
- **Duplicate engines, keep one each:**
  - mock: `career_mock.ts` or 127;
  - negotiation: F12 or the router's;
  - status: the WO-107 read model, then delete `career_apply_status.ts` and router `tracking_status`;
  - search: F5 over `career_postings`, with KB fallback, then delete router discovery;
  - apply: D-014 queue, then delete 155 and the task bridge.
- **Test bridges, once the `trainee-*` channels are live:** `telegram-inbound`, `whatsapp-inbound`, and
  `imessage-inbound` (restore its source or retire it).
- **The duplicate `src/upmore-app.html`.**

**Consolidate:**
1. A `connections/` module:
   - one Google client (scopes by feature, consent, refresh, revoke, expiry status);
   - one grant reader instead of 4 copies;
   - one status API;
   - one Connections screen and one chat flow;
   - deployed by go-live.
2. One Person model (§1.3, items 1-11), one erase, and one RPC the extension uses.
3. One capability registry that replaces the 17-turn cascade, the router's intents and the post-router rewriters.
4. One card and approval grammar across every card, rendered on web, Telegram and iMessage.
5. One outbox and one delivery worker.
6. One renderer with a claim check, replacing about 5,560 prose literals.
7. Secrets:
   - extend `identity_redact.ts` to API keys and tokens (sk-, ghp_, AKIA, JWT shapes) and portal usernames;
   - add a single connector-secrets Vault family, with a cleanup trigger on every reference table;
   - delete-account sweeps by name prefix, not by reference rows.

## Not verified, and why

- **v251's exact source.** Not read: it is the large bundle, and the parallel audit reports that `get_edge_function`
  fails on it. Inferred from the deploy time and the live reply text.
- **Live environment flag values.** No tool here reads them.
- **The orphaned secrets' contents.** Not read, by rule. "May contain a password" rests on the writer's code at that
  date (`286492ca2`), not on the value.
- **Google Cloud state.** The consent-screen and verification status of the shared OAuth client is outside the repo.
- **Real-channel behavior.** LoopMessage, Telegram and WhatsApp were not exercised. The probes drive `handleChat`
  through the flow harness, whose only seam is the PostgREST HTTP hop.
