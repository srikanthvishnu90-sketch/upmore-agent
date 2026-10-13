# Runner re-point — graded suites at STAGING tier

How the graded suites move from the harness to the live staging deployment
once `staging/scripts/staging-up.sh` has run green. Tier rules are the
gauntlet ledger's (`docs/career/gauntlet-ledger.md`, Engineering Speed Method):
**only STAGING-tier results count toward release claims; harness results never
do, retroactively or otherwise.**

## The env contract

The repo's existing live-gauntlet convention (AGENTS.md, `evals/gauntlet/
run-live.cjs`) — reused exactly, no new variable names:

```
UPMORE_CHAT_URL=https://<staging-project-ref>.supabase.co/functions/v1/agent-chat
UPMORE_TEST_JWT=<gauntlet test user's access token>
```

- `UPMORE_TEST_JWT` is minted by signing in as the seeded test user
  (`staging/scripts/smoke.sh` step 1 already does this: password grant against
  `https://<ref>.supabase.co/auth/v1/token?grant_type=password`). Tokens expire;
  re-mint per run, never commit one.
- Without both variables the live runner prints NOT RUN and exits — that
  behavior is the convention and stays.
- Rate limit, plan for it: the handler allows 60 chat requests/hour/test user
  (`agent_rl_bump`, handler.ts). A suite that needs more must either wait out
  the window or use additional seeded staging test users — it must never
  "fix" a 429 into a verdict (the live runner already records 429s as NOT RUN).

## What can re-point today vs. what cannot (honest split)

- **Can, unchanged:** `evals/gauntlet/run-live.cjs` (`--suite sloppy|spec16|
  l3`) already speaks only HTTP to `UPMORE_CHAT_URL` with `UPMORE_TEST_JWT`.
  Point the two env vars at staging and it is a STAGING-tier run.
- **Cannot, yet:** the gauntlet pilot / grand re-run. `scripts/career/
  gauntlet/run-pilot.cjs` + `pilot-lib.cjs` drive the domain modules
  **in-process** (`require("packages/domain/...")`, dispatch
  120 → 130 → 142 → 141 wrapped by 143) — HARNESS tier by construction, with
  no env var that changes that. Re-pointing them is real work, specified here
  so nobody mistakes an env change for a re-point:
  1. A live transport for the pilot runner: same 16 case definitions, same
     frozen assertions, but each user turn is a POST to `UPMORE_CHAT_URL`
     with the test JWT, multi-turn via the returned `thread_id` (the exact
     chatbox protocol in `tests/chatbox-59/RUNBOOK.md`).
  2. Fixture state that the harness used to inject as `stagingContext`
     (profile, postings, contacts, artifacts) must exist as **seeded staging
     DB state or not at all** — a live handler cannot receive a JS context
     object. Cases whose setup has no DB representation are recorded as
     coverage gaps at STAGING tier, not quietly re-harnessed.
  3. The reply oracle (`scripts/career/reply-oracle.cjs`) is transport-blind
     and carries over unchanged — it judges reply text either way.
  4. **Blocker on top of the transport work:** audit D-10 / staging gap G1 —
     the deployed handler has no career route, so a live pilot run today
     grades the finance path's answers to career asks. That is a legitimate
     STAGING-tier result (and will mostly be FAIL), but it must be labeled as
     grading the deployed build, not mistaken for a runner defect.

## Re-run order once staging exists

1. **The 16 pilot cases first** (C01, C03, C05, C11, C15, C17, C18, C20, C23,
   C31, C37, C38 + U02, U03, U04, U12) — the frozen baseline set, one trial
   each, through the live transport above. This is the first STAGING-tier
   number the program has ever had; report it beside — never merged with —
   the HARNESS-tier trial-1/trial-2 numbers.
2. **The grand re-run's worst cases next** — the lowest-scoring scenarios from
   the Stage 4.5 300-scenario re-run, worst-first, same live transport.
3. **Then the full set** — all 300 canonical scenarios at STAGING tier, with
   doorstep proof references beside every action scenario, exactly as the
   ledger's doorstep amendment requires. (Doorstep at STAGING tier also needs
   the `BROWSERBASE_*` secrets — see `staging/README.md` §Secrets — and the
   F3 replica sink reachable from the staging functions; both are open items,
   recorded here rather than assumed.)

## Labeling rule — forever after

- Every graded record (pilot, re-run, expansion, any future suite) carries a
  top-level `tier` field: `"STAGING"` (live staging deployment, real message
  path) or `"HARNESS"` (in-process modules / scenario scripts). No tier field
  = not a graded record.
- Pre-staging records are `tier: "HARNESS"` retroactively by definition —
  including the pilot trial-1 baseline and any trial-2 records produced before
  the re-point. Their files are not rewritten (evidence is frozen); the tier
  is stated wherever their numbers are quoted.
- A number quoted toward a release claim must name its tier in the same
  sentence. A STAGING number and a HARNESS number are never averaged, summed,
  or presented as one pass rate.
- Smoke results are labeled `tier: "STAGING"` + `probe: "smoke"` and count
  toward **nothing** except "staging plumbing is live" — the smoke is a gate
  probe, not a graded case.
