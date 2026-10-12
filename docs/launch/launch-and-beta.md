# Upmore: what stands between today and launch (2026-10-11, night)

The path is three gates in order: **beta-ready → beta → launch-ready**. Each gate is a list of checks with the command or
the place that proves it. Nothing here is "done" until its proof exists; built-but-not-run-live counts as not done.

Where things stand tonight, in one line: **the code for the model switch, the health check, cost tracking and the live
fixes, the response-style corpus and the megadoc fixes is built and tested on branch `claude/upmore-16-spec-instinct-0qyuqj`
(CI green), but none of it is deployed, and no model call has succeeded live yet.** The first live run scored 3/17 because
the Anthropic key was rejected. Megadoc: **0 of 240 scenarios proven with a provider record**; 61 built, 22 limited by a
standing rule, 12 diverge, 59 model-only, 86 not built (`docs/scenarios/README.md`).

---

## Gate 1: beta-ready (the owner's taps, in this order)

### 1. Security first (about 10 minutes)

- [ ] **Make the repo private.** GitHub: repo, Settings, General, Danger Zone, Change visibility. It is public today, and a
      test-user JWT (expired) sits in its history (commit a154d1b).
- [ ] **Rotate the OpenAI key that was pasted into the chat.** OpenAI dashboard, API keys: create a new key, use it in step
      2, then revoke the pasted one. Chat transcripts are stored; treat a pasted key as disclosed.
- [ ] **Set a monthly spend limit on the OpenAI account** (Settings, Limits; for example $20). It caps the worst case even if
      something loops.
- [ ] Optional, destructive, needs your yes: scrub the old JWT from git history (`git filter-repo`). It expired at 16:53
      UTC on 2026-10-11, so this is hygiene, not an emergency.

### 2. Deploy the fixes and prove the model answers (about 15 minutes, one command)

From your own shell, on the branch:

```bash
git fetch origin && git checkout claude/upmore-16-spec-instinct-0qyuqj && git pull
read -rs OPENAI_API_KEY; export OPENAI_API_KEY          # paste the NEW key; nothing is echoed or saved in history
export SUPABASE_DB_URL='postgresql://...'                # Project Settings, Database, Connection string
export GAUNTLET_PASSWORD='...'                           # gauntlet-test@upmore.test
bash scripts/launch/go-live.sh
```

What it does (dry run: `GO_LIVE_DRY_RUN=1 bash scripts/launch/go-live.sh`):
1. preflight: clean tree, local tests green, bundle current;
2. migrations: **only the 2 new ones** (model health + cost tables, brokerage Vault cleanup), one transaction, recorded in a
   ledger (re-running applies nothing);
3. secrets: `OPENAI_API_KEY`, `MODEL_PROVIDER=openai`, `HEALTH_CHECK_TOKEN` (generated, saved to `~/.upmore/health-token`);
4. deploys agent-chat, broker-oauth-start, broker-oauth-callback, model-health;
5. **one live model call** through model-health. If OpenAI refuses, it prints OpenAI's exact error and **stops** before the
   gauntlet;
6. the live gauntlet (spec16, sloppy, l3), raw replies in `evals/gauntlet/results/`, every failure recorded for replay.

- [ ] go-live.sh printed `ok   live model call answered: {"provider":"OpenAI","model":"gpt-5-nano",...}`
- [ ] Commit the result files it wrote (`evals/gauntlet/results/*`, `evals/gauntlet/replays/live-failures.json`) and push.

### 3. Monitoring (5 minutes)

- [ ] Point a free uptime monitor (UptimeRobot, Better Stack) at
      `https://mrwngntwmnaqrqhupvlt.supabase.co/functions/v1/model-health?probe=1&token=<contents of ~/.upmore/health-token>`
      every 5 minutes, alert by SMS on any non-200. A dead key then pages you within minutes. Each probe costs a fraction
      of a cent on gpt-5-nano.
- [ ] Check `founder_alerts` (kind `model_down`) once a day during the beta.

### 4. Brokerage, if trading is in the beta (Alpaca's approval is the external gate)

- [ ] Register the OAuth app at Alpaca (redirect URI
      `https://mrwngntwmnaqrqhupvlt.supabase.co/functions/v1/broker-oauth-callback`), then re-run go-live.sh with
      `ALPACA_OAUTH_CLIENT_ID` and `ALPACA_OAUTH_CLIENT_SECRET` exported.
- [ ] Alpaca Compliance approves the app. **Until then Connect says it isn't switched on yet; nothing routes around it.**
- [ ] Connect **your own** live Alpaca account in the app (Settings, Brokerage), fund it with at least $5, place one $5
      approved order, and check the order id on Alpaca's site. That is the provider-confirmed proof.
- If trading is not in the beta, leave Connect off; the app says so honestly.

### 5. The gauntlet must pass on the deployed commit

| Suite | Bar | Known blockers today |
| --- | --- | --- |
| spec16 (20 texts in one thread, incl. 3 photos and an 11-minute wait) | 100% of money texts; every reply read by a person | S16-03 needs a real Netflix charge on the test account (connect a bank); S16-10 needs a connected brokerage (step 4); S16-15 needs the standing_payments migration applied and a rent rule the test user saved on their own yes (the flow is built: `packages/domain/81-standing-rent.js`) |
| sloppy-20 | understood >= 95% on the first message | not run live yet |
| L3 adversarial (stale yes, double yes, interrupts) | 100% | not run live yet; the 3-hours-late case finishes with `--resume <label>` |

- [ ] The style corpus live: `UPMORE_CHAT_URL=... UPMORE_TEST_JWT=... OPENAI_API_KEY=... deno run -A evals/corpus/run.ts --live`
      (the 79 examples against the deployed handler, rule graders + the LLM judge, 1-5, fail under 4; approvals are
      never sent live). Bar: no rule FAIL; judge >= 4 on every example; raw log under `evals/corpus/results/`.
- [ ] Every live failure is either fixed (red test before, green after) or triaged in writing in
      `evals/gauntlet/replays/live-failures.json`; `deno test -A --no-check tests/edge/live-replays.test.ts` is green.
- [ ] **Merge to main only after this passes on the exact commit** (PR #1). Vercel deploys main, so main is what beta users
      get.

### 6. Decisions only you can make before the beta

- [ ] **Browserbase or your own browser infra** for cancellations. The executor still calls Browserbase, and the keys
      checklist says drop it. Until decided, cancellations hand off a pre-filled guided path; nothing is cancelled for the
      person. Only 1 merchant playbook (devin) is verified.
- [ ] **Rent (C110):** built as a standing flow (2026-10-12): the person sets it up on one restated card, each month
      gets that month's card (offered by the scheduler a few days before the due day), and the yes stages it for them to
      send in Zelle, Venmo, Cash App or PayPal; Upmore never pays rent itself (no ACH, portal or check rail). Needs the
      `20261012020000_standing_payments.sql` migration applied by the owner.
- [ ] **Privacy policy:** updated on the branch to match the code (OpenAI as the AI provider, Alpaca with trading
      permission, stored transactions deleted with the account). **Have a lawyer read it before the first outside tester.**
- [ ] **Securities review** before anyone but you places a trade (playbook Part 18).

---

## Gate 2: the beta itself (2 weeks, 5 to 10 invited people)

### Who and what

- 5 to 10 people you know, each told in writing: this is a beta; trades are real money in their own account; there is a
  $5 per-order cap; every action needs their tap on a card; nothing is automatic.
- Same deployment as production (everything is live; no beta-only mode, no paper).

### The script every tester runs in week 1 (each one is a scenario with a proof)

| # | Do this | Passing means (the proof) |
| --- | --- | --- |
| 1 | Sign up, accept terms, connect a bank (SimpleFIN) | balance answer cites its source and as-of time, matching the bank's app |
| 2 | "what's my balance", "how much did I spend on food last month" | numbers match the bank's own records |
| 3 | "cancel netflix" (or any subscription they really have) | a card with the terms; if executed, the merchant's record says cancelled (screenshot) |
| 4 | "send sam $40" to a real friend, then "actually make it $50" | the old card dies, a $50 card appears; the money lands only after they send it in Venmo/Zelle |
| 5 | "never mind" in the middle of a card | nothing happens; the card is gone |
| 6 | A real scam text screenshot: "am i being scammed" | flagged, told what to do, nothing moved |
| 7 | A receipt photo with no words | the receipt is described; nothing moves |
| 8 | "buy $5 of VT" (only with Alpaca approved and connected) | card with price source and time; after yes, the order id exists in their Alpaca account |
| 9 | Wait 11 minutes, then "yes" to an old card | "expired", nothing fires |
| 10 | "what can't you do" | an honest list, matching the not-built items here |

### Daily, 10 minutes (you)

- [ ] model-health green all day (the monitor's history)
- [ ] `founder_alerts` empty or explained
- [ ] `select * from agent_daily_costs order by day desc limit 20;` cost per active person per day
- [ ] Read 20 random replies (`agent_messages`), looking for wrong numbers, overclaims and fake success
- [ ] Every tester report becomes a replay: reproduce it, add it to the gauntlet corpus or a test, red, fix, green

### Budget for the beta (estimates; the real numbers come from `agent_daily_costs`)

- AI: about $0.0004 to $0.001 per model call on gpt-5-nano. 10 testers x 50 messages a day is at most about $0.50 a day.
  Worst case per person per month at the 900-call cap: about $0.80 to $0.90.
- Health probe every 5 minutes: well under $0.01 a day.
- Plaid, if used: capped at $3 per person per month by the governor.
- Trades are the testers' own money, at most $5 per order.

---

## Gate 3: launch-ready (exit criteria for the beta; all must hold)

- [ ] 14 consecutive days with **zero money incidents**: no action without an approval, no "done" without the provider's
      record, no stale yes that fired, no wrong number shown as fact.
- [ ] model-health up at least 99.5% over the beta; every outage answered with the outage sentence (never silence).
- [ ] The full gauntlet (spec16, sloppy, L3) passes on the release commit; every live failure fixed or triaged; replays
      green; CI green on main.
- [ ] Every tester completed the week-1 script; every row has its proof or is labeled **not built**. Nothing in between.
- [ ] Megadoc: every BUILT and LIMITED scenario that a tester can reach has been run live once with its provider record
      (fill, bank debit, merchant's cancelled state) and moved to PROVEN in `evals/scenarios/verdicts.cjs`; the rest stay
      labeled. The style corpus `--live` run passes on the release commit.
- [ ] The weekly corpus export ran each beta week (`node scripts/corpus-weekly-export.cjs --live`), its drafts were
      reviewed by hand and merged, so every beta failure is now a corpus example and an eval.
- [ ] Cost per active person per day measured for 14 days and inside the price (the $10/month plan).
- [ ] Repo private; no secret in any tracked file (`node --test tests/no-secrets.test.cjs`); keys rotated.
- [ ] Privacy policy and terms read by a lawyer; 18+ gate and consent records verified on a fresh signup.
- [ ] Support path: a "this is wrong" button or address, and a written runbook for "the app showed a wrong dollar amount".
- [ ] Backups: one successful restore of the database into a fresh project.

---

## Honest list: not built or not proven (say these out loud to testers)

| Item | State |
| --- | --- |
| Any successful live model call | **None yet.** OpenAI is wired but never called from the live project. gpt-5-nano is smaller than the Haiku the prompts were written for; the gauntlet decides whether its answers are good enough. If not, `OPENAI_MODEL=gpt-5-mini` costs about 5x more and is one secret. |
| Brokerage trading | Built, live-only, $5 cap; **0 live orders**; gated on Alpaca's approval and the OAuth secrets |
| Cancellations | Guided handoff for all but 1 verified merchant; executor provider undecided |
| Rent (C110) | Standing flow built: staged each month for the person to send, on their yes; table not applied live |
| Disputes, bill pay to billers, sweeps | Not built |
| Person-to-person sends | Staged for the person to send in Venmo/Zelle; Upmore never moves the money itself |
| Permission tiers, action ledger feed, stop everything | Tables live; not deployed end to end |
| SMS / WhatsApp | Not built (in-app chat and a test-only iMessage bridge) |
| Real-world capability set | 0 of 206 done with live evidence (`docs/realworld/README.md`) |
| Megadoc (240 scenarios, the owner's bar) | **0 proven.** 61 built, 22 limited, 12 diverge, 59 answered by the model only, 86 not built. Every one labeled with its reason: `docs/scenarios/README.md` |
| Not built, said plainly when asked | scheduled or conditional sends; sends in other currencies; saved nicknames ("mom", "my brother"); percentage or itemized splits; group lists; an IOU log; budgets and alerts; recurring investments; stops on every holding; copy trading; IPO and private shares; options, margin, crypto; performance, cost basis, tax estimates, dividends; disputes and card controls; savings goals and transfers between accounts |
| Response-style corpus (79 examples) | Offline through the real flows: PASS 37, LIMITED 7, NOT_BUILT 3, DIVERGES 1, FAIL 0; 31 need the model and run only live (`docs/corpus/README.md`). The few-shot selector is in the chat and planner prompts. |

## Commands (all run in CI on every push: `.github/workflows/ci.yml`)

```bash
node --test tests/*.cjs                       # domain, router, UI, gauntlet grader, replay recorder, secret scan
deno test -A --no-check tests/edge/           # edge functions incl. model gateway, health, live replays
bash tests/db/run.sh                          # migrations, RLS, Vault cleanup, migration ledger (Postgres 16)
(cd tests/agent100 && node harness/runner.js --mode dry --all)   # must stay 103/103
node evals/runner.cjs && node evals/runner.cjs --mutations        # release verdict, 11 planted defects caught
deno run -A evals/corpus/run.ts               # style corpus offline (CI checks it via tests/edge/corpus-evals.test.ts)
deno run -A evals/scenarios/sim.ts && node evals/scenarios/report.cjs   # megadoc evidence + report
```
