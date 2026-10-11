# Upmore Build Playbook: where it disagrees with the repo and the live project (2026-10-11)

The playbook's rule: "When this doc and the repo disagree, the repo is right and this doc has a bug - fix the doc and note
the drift." Its own premise is a code read of `main`. These notes were checked against `main` at 92a8364 (which now
includes the launch branch) and against the live project (read-only, 19:00-19:10 UTC). Each line says what the playbook
says, what is true, and the source. Items marked **[safety]** or **[blocker]** need the owner.

## Live state the playbook does not know about (it predates the 19:01 UTC go-live run)

1. **[blocker] Every model call is failing.** Live, the router call and the money-question planner both received HTTP 400
   from Anthropic (`agent_messages.meta.flow_route.problems = ["router model HTTP 400"]`; three `agent_model_calls` rows
   stuck in `reserved`; `agent_usage` last recorded 2026-10-08 16:24 UTC). The playbook's 2.2 step 15 and 4.2 describe a
   working Haiku call. The most likely cause is the Anthropic account's credit balance (that error is a 400); the code
   kept only the status, so it is not yet confirmed. Fixed in this commit: the provider's error type and message are now
   logged and saved in the reply's `meta.model_error`, and the planner says "the AI service Upmore uses isn't responding"
   instead of a payment-planner message. Source: tests/edge/model-errors.test.ts.
2. **Live bug found on the first live text.** "what's my balance" and "how much did i spend on food last month" were
   answered "I couldn't complete the requested financial plan ... no payment was approved or submitted by the planner",
   because personal-finance questions go to the tool planner (`isPersonalFinancialRequest`), which needs the model. The
   playbook's 4.1 ("most messages never reach a model") does not hold for balance and spend questions today.
3. **Deployed 19:01 UTC:** the 22 pending migrations (60 files total, not 44), agent-chat v207 (the repo handler, not the
   monolith the playbook's 2.2 describes line by line), broker-oauth-start and broker-oauth-callback. Smoke checks passed.

## Status tags that are out of date (Part 9 and elsewhere)

| Playbook | True on main | Source |
| --- | --- | --- |
| Brokerage connect (Alpaca OAuth): SPECCED | BUILT and deployed (connect, staged confirm, disconnect, reconnect); live use blocked on Alpaca's app approval and the two OAuth secrets | packages/domain/74-broker-connect.js, supabase/functions/broker-oauth-*, docs/depth/BROKER-CONNECT.md (17/17) |
| User-directed trades / Alpaca execution adapter: SPECCED, "mock-first" | BUILT, LIVE-only (no paper path exists), $5 per-order cap enforced in the adapter, never run against Alpaca | packages/domain/71-alpaca.js, docs/depth/RAIL-2.md (21/21) |
| Recipient memory: SPECCED | BUILT; table live with Sam seeded for the test user | 20261011020000_saved_recipients.sql, docs/depth/RAIL-1.md |
| 20-text gauntlet runner: SPECCED | BUILT; first live run started 19:01 UTC | evals/gauntlet/run-live.cjs, scripts/launch/go-live.sh |
| Mutation testing: SPECCED | BUILT: `node evals/runner.cjs --mutations` (11/11) and per-capability depth runners | evals/runner.cjs, evals/depth/ |
| Permission tiers, action ledger, stop everything: SPECCED (Wave 0) | Tables live since 19:01 (agent_settings, agent_ledger, agent_stop_everything); code in agent-workflows, which is NOT deployed | 20261010010000_agent_permissions_ledger.sql, supabase/functions/_shared/workflow_service.ts |
| agent100 "last recorded run 2026-09-28" | 103/103 again 2026-10-11 | docs/testing/evidence-ledger.json |
| The template is "~11,000 lines" | 13,273 lines | src/upmore-app-template.html |

## Statements that are wrong or contradicted by a later owner decision

- **5.4 scopes `account:write trading`.** Built with `trading data`: `data` is required for the quote on every trade card,
  `account:write` (account configuration, watchlists) is not needed. Alpaca's docs repo lists all three scopes.
- **5.4 "Schwab ... needs background refresh" and the Alpaca refresh implication.** Alpaca's OAuth token response has no
  expiry and no refresh token (alpacahq/alpaca-docs content/oauth/guide.md); a revoked token answers 401 and the person
  sees Reconnect. Background refresh is a Schwab-only design.
- **5.4 "The Alpaca Broker API sub-account path ... is the bootstrap/fallback".** Removed by the owner's decision of
  2026-10-11 (no shared trading account, no paper). There is no sub-account path in the code; partner keys are unused.
- **5.4 signed state (CSRF) as the whole defense.** Not sufficient: someone could start Connect in their own login and send
  the approval link to someone else. Built: the callback only stages; the starter confirms from their own signed-in app
  (`broker_confirm_link`). Source: BROKER-CONNECT S17.
- **2.3, 6.2, 11.1 rely on Browserbase.** main's docs/claude-code-keys-checklist.md: "drop Browserbase (owner building own
  browser infra)". The cancel executor still calls Browserbase; decide before any cancel goes live.
- **2.6 and 17.1 "small commit, pushed to main, deploy confirmed live".** CLAUDE.md says merge to main only after the live
  gauntlet passes on the exact commit. main was merged at 18:47 UTC, before the 19:01 gauntlet; Vercel deploys main, so
  the new app (including the Brokerage screen) is live without a passing gauntlet.
- **4.4 / 2.2 "a limiter error is a 500, never a fake 429" and the quota.** Failed provider calls stay `reserved` and
  count toward the 900-call month (conservative, intended); the playbook's cost math assumes only successful calls.

## [safety] Confirmed true and urgent

- **10.5 / 13.2 "Repo is public. Move it private."** Confirmed: GitHub reports `visibility: public`.
- **A test JWT is committed on main** in docs/claude-code-keys-checklist.md. It is a one-hour token for the test user and
  has almost certainly expired, but it is in public history, against CLAUDE.md ("never commit a JWT or any key"). Remove
  the block, make the repo private, and treat the history as public.

## Confirmed as written

- One merchant playbook is `verified: true` (devin); the others are false. (merchant-catalog.ts)
- Chat model default `claude-haiku-4-5-20251001` (live `agent_model_calls.model`).
- 0 of 206 real-world capabilities done; every recorded check is LOCAL (docs/realworld/README.md, evidence ledger).
