# Cloud runner: one sandbox per approved application (F-RUNNER, 2026-10-26)

The cloud executor that submits an application after the person approved it, without anyone's computer. It is the
existing path, scaled out: the card, the person's tap, the one queue (`career_apply_jobs`), the one cloud claim
(`career_apply_cloud_claim_at`, `career_apply_cloud_refusal`), the existing engine (`scripts/apply.ts --submit --approved
<hash>`, run by `workers/career-cloud/worker.ts` `runCloudJob`) and the existing finish (`career_apply_cloud_finish`).
No second engine, queue, claim or cap.

Nothing here is deployed, no migration is applied, and no real employer was reached while building it.

## How it runs

```
pg_cron (every minute)
  └─ POST career-cloud-runner/dispatch                     (Supabase edge function, holds the service key)
       └─ career_apply_cloud_dispatch_claim(want, global, per_portal)
            └─ career_apply_cloud_claim_portal_at(≤6, now, family)   = claim_at with a family filter, generated from it
       └─ per claimed application: Vercel Sandbox from the runner snapshot (retry 1 s, 2 s, 4 s)
            └─ deno run workers/career-cloud/sandbox-runner.ts      (env: job id, sandbox id, token, bridge URL; no key)
                 └─ POST career-cloud-runner/job/{job,resume,sources,authorize,ask,finish}   (token = HMAC(id, lease, sandbox))
                 └─ runCloudJob → scripts/apply.ts --submit --approved <hash>   (its own process, no secret in its env)
                 └─ finish → career_apply_cloud_finish → the bridge stops the sandbox
```

- **Limits.** Global (`CLOUD_MAX_CONCURRENT`) and per portal family (`CLOUD_MAX_PER_PORTAL`) are enforced in SQL under one
  dispatch lock, counted from what is `driving` inside the lease. Starts per tick: `CLOUD_MAX_STARTS_PER_TICK`.
- **The per-person cap is the SQL one.** `career_apply_cloud_refusal` decides every claim: the person's own pace (if
  set), one employer per 30 days on the one ledger, the opt-in, pauses, the gate or waiver, the kill switch.
- **Retry and backoff.** The claim is one transaction: if it fails, nothing was claimed and the next tick asks again.
  A sandbox that cannot be created or started after 3 tries (1 s, 2 s, 4 s, ±25%) is stopped and its application is
  finished `not_submitted` / `RUNNER_UNAVAILABLE`: the engine never started, so nothing could have been sent, and it is not
  left to the 15-minute sweep (which would call it unknown). The finish is retried 4 times (worker.ts). An application is
  driven at most once, ever (`attempts = 1`); a sandbox that dies mid-run is swept to `unknown_outcome` and never re-sent.
- **Lease.** The sandbox times out at 13 minutes, inside the queue's 15-minute lease. The engine's own timeout is 10.
- **Credentials.** The sandbox has a job id, its own id, the lease-bound token and the bridge URL. The bridge reads the
  job, its lease and its person from the database for every call; a token for another sandbox, an earlier lease or a
  finished job opens nothing (tests/architect/cloud-runner.test.ts part 1).
- **Evidence.** The row keeps the answers sent, the employer's response, the screenshots' hashes and the times
  (`evidenceOf`). The screenshot files themselves go with the sandbox when it stops.

## Verification checks (captcha): what happens, and the risk

Trainee never solves or gets around a check. The engine detects one at open, review or Submit and the job ends
`needs_user` / `bot_check` with its link ("finish this one yourself"); it is never retried. The existing throttle then
pauses that portal family for the cloud for 6 hours (2% failures in its window, or 2 checks in its last 20) and a person
for the day (2 checks).

`career_apply_cloud_check_rates(days)` gives, per family and per employer host: attempts, checks, the check rate (always
with its counts), sends, and sent applications with no employer email after 24 hours.

**Measured from a Vercel Sandbox (2026-10-26):**
- Egress IP 44.200.136.80, `ec2-…compute-1.amazonaws.com`, AS14618 Amazon: a datacenter address.
- The engine's Chromium (Playwright 1.64.1, headless shell 156.0.8078.4) reports `navigator.webdriver = true`, user agent
  `HeadlessChrome/156…`, 0 plugins. The runner does not mask any of this, and must not: masking it is getting around the
  check.
- reCAPTCHA Enterprise's and hCaptcha's public scripts load from the sandbox (a neutral local page, no site key, no token).
- **No score could be measured.** A reCAPTCHA Enterprise score is only visible to the site key's owner (an assessment in
  their Google Cloud project). Using an employer's key on our own page would be using their check against them, so it
  was not done. Google's and hCaptcha's public test keys always pass and say nothing.

**Expectation:** invisible reCAPTCHA Enterprise (Greenhouse, Ashby) usually scores a headless browser on a cloud IP low.
Two outcomes follow, and only one is visible to the engine:
1. a challenge appears → detected → `needs_user`, counted;
2. the employer's server silently rejects or drops a low-score submit while the page says "received" → recorded
   `submitted_unconfirmed`. This is why the rates include `unconfirmed_after_24h`: compare it with the same host's rate on
   people's own browsers before trusting the cloud on that host.

**Fallback:** the person's own browser, the extension (`extension/`, `career_apply_extension_begin_own`), with their own IP,
cookies and a real window. Decide per host from the numbers: a host whose check rate or 24-hour unconfirmed rate is above
the owner's threshold goes to the extension only.

**To measure the score (owner):** create a reCAPTCHA Enterprise key in your own Google Cloud project for a domain you own,
put a page with it in a sandbox, and read the assessments for 20 loads. That is the only honest score number.

## Load model (measured 2026-10-26, Vercel Sandbox, iad1, 2 vCPU / 4 GB, from the snapshot)

| Measure | Value |
|---|---|
| Sandbox from snapshot: API says running | 26 ms after the request (`requestedAt` → `startedAt`) |
| First Chromium launch + first page (example.com) | 1.1 s |
| Engine dry run, local form | 3.4 s median (6 jobs) |
| Approved submit by runCloudJob, local form | 6.2 s median (6 jobs, serial) |
| One sandbox, 6 applications serial / 2 at a time / 3 at a time | 9.6 / 5.0 / 3.5 s wall per application |
| Active CPU | 60 s for 19 dry runs + 19 submits ≈ 3 s per application (local form) |
| Fresh install without snapshot | 23 s (npm 1 s, Chromium 9 s, system libraries 12 s, Deno 1 s) + clone 3.7 s |
| Snapshot size | 1.49 GB |
| The cloud worker's own suite in the sandbox | 3/3 pass in 34 s (tests/career-cloud-worker.test.cjs) |

A real employer form is slower than a local one (its scripts, the upload, the response): plan on 30–90 s per application.

**Cost per 1,000 applications (Pro, iad1):** one 2 vCPU / 4 GB sandbox per application, billed ≥ 1 minute of memory:
memory 4 GB × (1–2 min) × $0.0212/GB-h = $1.41–$2.83; active CPU ~10 s × $0.128/h = $0.36; creations $0.0006.
**≈ $1.80–$3.20 per 1,000 applications**, before the Supabase calls (a few per application) and the Pro plan itself.

**Throughput limits (Vercel Pro):** 10,000 concurrent sandboxes; sandbox creation is limited by vCPUs per minute, from
150/min idle (75 two-vCPU sandboxes per minute) ramping by 500/min each minute to 5,000/min (2,500 sandboxes per minute).
At 60 s per application that is up to ~2,500 applications per minute, about 3.6 million a day, once ramped. 1M people at
5 applications a day is ~3,500 a minute at a flat rate; it fits only if each sandbox runs a small batch (3 at a time
measured above) or the limit is raised (Enterprise). The per-host limits will bind long before Vercel does.

## Owner steps (nothing below has been done)

1. **Vercel.** In team `team_mn5D4XBK4MgqL0KgNlzvzfky`, project `trainee` (`prj_wU2a8WhzB8x1qIbqx3ChnhAVCIGv`): create an
   access token scoped to the team (Account Settings → Tokens). Set Spend Management on the team.
2. **Migration.** Apply `supabase/migrations/20261026100000_career_apply_cloud_runner.sql` (it is in
   `scripts/launch/trainee-go-live.sh`). If the card-cloud bridge (20261024130000) is applied later, run
   `select public.career_apply_cloud_claim_portal_install();` after it and check
   `select public.career_apply_cloud_runner_missing();` reads `{}`.
3. **Snapshot.** `VERCEL_TOKEN=… VERCEL_TEAM_ID=team_mn5D4XBK4MgqL0KgNlzvzfky VERCEL_PROJECT_ID=prj_wU2a8WhzB8x1qIbqx3ChnhAVCIGv
   deno run -A scripts/cloud-runner/build-snapshot.ts <trunk commit>` prints `SNAPSHOT snap_…`. Rebuild on every engine
   change. Snapshots expire 30 days after last use.
4. **Edge function secrets** (Supabase → Edge Functions → Secrets), by name:
   `CLOUD_RUNNER_SECRET` (random, ≥ 32 characters), `CLOUD_DISPATCH_SECRET` (random), `VERCEL_TOKEN`, `VERCEL_TEAM_ID`,
   `VERCEL_PROJECT_ID`, `CLOUD_SANDBOX_SNAPSHOT_ID`, `CLOUD_BRIDGE_URL` (`https://<project>.supabase.co/functions/v1/career-cloud-runner`),
   and the limits `CLOUD_MAX_CONCURRENT` (start at 5), `CLOUD_MAX_PER_PORTAL` (start at 2), `CLOUD_MAX_STARTS_PER_TICK` (start at 5).
   Optional: `CLOUD_SANDBOX_REGION` (iad1), `CLOUD_SANDBOX_VCPUS` (2). Then `CLOUD_RUNNER_ENABLED=on`.
5. **Deploy** `supabase functions deploy career-cloud-runner --no-verify-jwt` (config.toml sets `verify_jwt = false`; the
   dispatcher checks its header secret, the bridge its per-job token).
6. **Schedule** (SQL, pg_cron + pg_net), every minute:
   `select cron.schedule('career-cloud-dispatch', '* * * * *', $$select net.http_post(url := '<CLOUD_BRIDGE_URL>/dispatch',
   headers := jsonb_build_object('x-cloud-dispatch-secret', '<CLOUD_DISPATCH_SECRET>'))$$);`
7. **Turn it on** only as the database already requires: `CAREER_CLOUD_APPLY = 'on'` in `career_cloud_settings`, the gate
   open per family (3 hand submissions confirmed by email) or a waiver, and each person's opt-in.

**Off:** unset `CLOUD_RUNNER_ENABLED`, or `CAREER_CLOUD_APPLY` to anything but `on` (the claim then returns nothing).

## Mass submission and preparation at scale (2026-10-27)

The VM cloud worker (`workers/career-cloud/worker.ts`) is no longer one loop that takes at most 6. Any number of instances
run against the one database, each running as many applications as its machine holds. They use fair leased claims,
reclaim after a crash, and hold off a site for every instance only when that site refuses (429, Retry-After, or a
verification check). There is no number of ours. The preparation host (`prepare-ahead.ts`) makes preparation reachable
for a person with only a phone (audit B2). Runbook, env names and the owner's steps: **docs/launch/MASS-SUBMISSION.md**.
The sandbox dispatcher above is unchanged.

## What the database still limits today (not changed here)

- The cloud gate: a family opens only after 3 hand submissions by the owner's gate testers, each confirmed by the
  employer's email; until then only waivers (one person, one family, at most 5 sends, at most 7 days).
- The draft card-cloud bridge (20261024130000), which the live authorization needs, allows one enrolled person at a time
  (`career_cloud_card_one_enrollment`) plus test users, and 15 cloud sends a day. At 1M people that is the owner's policy
  to change; the runner scales only as far as those rules let jobs through.
- The throttle pauses a whole family for 6 hours at 2% failures in its last 50 attempts. With datacenter checks, expect
  it to pause often; that is by design.
