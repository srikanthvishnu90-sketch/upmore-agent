# WO-039: the cloud worker, gated in the database

Status: built on `wo/039-cloud-worker` (not merged) · Decisions: D-003, D-007, D-010, D-011, D-013, D-014, D-017, D-022 ·
Migration: `20261021080000_career_apply_cloud.sql`

## What
The owner's target (2026-10-20): "Cloud autonomous apply (only after the PR #16 gate clears: 3 hand submissions per
portal with employer-email confirmation): 100-150 verified submissions per day per user, every one with screenshot,
captured answers, and parsed employer confirmation." Also: "User-facing apply failure rate under 2% at steady state,
with per-portal bot-check telemetry and auto-throttle before any failure burns the user's name."

Built:
- **The gate, in the database.** `career_apply_cloud_open(portal)` is true only when at least 3 applications on that
  family (greenhouse, lever, ashby; never smartrecruiters) meet all of these:
  - they are `confirmed`;
  - they were sent by hand (`source` is `own_computer` or `extension`);
  - they carry an email confirmation whose `received` mail event (WO-024) is still on record.

  Before this order the gate (WO-009b "The gate before any volume", PR #16) lived only in docs, and nothing enforced
  it.
- **Who sent it.** `career_apply_jobs.source` is set once, by whoever claims the row, and a trigger refuses any change:
  - `career_apply_claim_own` sets `own_computer`;
  - the cloud claim sets `cloud`;
  - the old 009b-1 pool claim `career_apply_claim` now also sets `cloud`, so it can never open the gate.

  A hand submission from the terminal is recorded with `career_apply_record_own` (`approve-first.ts record`).
- **Per-person opt-in in chat** (`_shared/career_cloud_optin.ts`, wired into `agent-chat/handler-career.ts` after the
  card, mock and questions turns):
  - "apply for me in the cloud" shows the exact terms: which postings, up to N a day (their own limit), one per company
    per 30 days, each one still needs their yes on its card, and a check comes back to them;
  - "yes" turns it on only while those terms are the thread's last word and still word for word what would be shown;
  - "cloud off" turns it off at once, and removes the resume kept for the cloud;
  - an erase (a new privacy epoch) ends the opt-in and deletes the kept resume at the next claim;
  - off is never "stop", which is the carrier's opt-out word.
- **The worker** (`workers/career-cloud/worker.ts`, a long-running Deno process for the D-010 VM):
  - It claims through `career_apply_cloud_claim`, the only door. That claim refuses each of the following, named by
    `career_apply_cloud_refusal`:
    - the kill switch is off;
    - not approved (no engine approval);
    - a stale account;
    - SmartRecruiters;
    - a form only the person can submit;
    - the gate is closed;
    - the person has not opted in;
    - the portal or the person is paused;
    - the person's daily limit (the smaller of what they agreed to and their current limit);
    - one per company per 30 days.
  - It runs `scripts/apply.ts --submit --approved <hash>` headless, as its own process per job, so each job has its own
    browser and a fresh context.
  - The answers come from the approved payload (`factsFromPayload`). The approved resume is fetched for that job and
    lease only, and checked by its hash. Both go in a 0700 temp folder with 0600 files, removed in `finally`.
  - Screenshots are masked (`UPMORE_MASK_SCREENSHOTS=1` in `portal-browser-helper.cjs`).
  - N parallel contexts (default 3, at most 6).
  - A check at open, review or Submit goes back to the person as `needs_user` / `bot_check` with the link. The
    receipt says "finish this one yourself at this link".
- **Telemetry and throttle.**
  - `career_apply_cloud_events` records every outcome: submitted, confirmed (by email), bot_check, error with its kind,
    not_sent.
  - `career_apply_cloud_throttle` runs after each one:
    - a portal pauses for the cloud for 6 hours at 2% user-facing failures in its last 50 attempts since its last pause
      (with 50 attempts, one failure), or at 2 bot checks in its last 20;
    - a person pauses until the next UTC day at 2 bot checks in one day;
    - the person and the owner are told once per pause (outbox kind `cloud`);
    - the person's own computer is never paused by this.
  - `career_apply_cloud_report(days)` gives rates with their counts, per portal and per person.
- **Owner ops:** `docs/launch/CLOUD-WORKER.md` covers:
  - the VM's packages, Deno, Chromium and the systemd unit;
  - the 0600 env file;
  - start and stop;
  - the kill switch (`CAREER_CLOUD_APPLY` in `career_cloud_settings`, off until set to `on`, or `systemctl stop`);
  - the report.

  The worker refuses to start without the gate function, with a key that is not the service key, or with an env file
  others can read.

## Contracts for other orders
- **WO-032** (upgrade to `confirmed` from mail): call `career_apply_confirm_by_mail(p_user, p_job, p_message_hash)` with a
  `received` mail event whose `application_ref` is `job:<id>`. It sets `state='confirmed'`, `email_confirmed_at` (the
  mail's time) and `confirmation_mail_hash`, once. The `source` column, values `own_computer | extension | cloud |
  email`, is defined here. This branch was pushed first (2b2e1dbc), so WO-032 uses these names.
- **WO-031** (extension): its claim sets `source='extension'` on the rows it claims (only rows whose `source` is null).

## Tests
- `tests/db/career_apply_cloud.test.sql` (in `tests/db/run.sh`, migration applied twice), 60+ checks:
  - the gate: refused below 3, open at 3, that family only;
  - a cloud submission confirmed by email does not count, a page confirmation alone does not count, and a deleted mail
    event closes the gate;
  - a cloud row cannot be relabelled;
  - the kill switch;
  - opt-in on and off, and its end by an erase;
  - the claim refusing each limit;
  - the resume only with the lease;
  - the finish refusing a bot check reported as submitted;
  - the throttle at 0 of 50 and at 1 of 50, the spike rule, not_sent not counted, the person pause, told once;
  - the sweep of a dead cloud drive;
  - the report;
  - every grant.
- `tests/architect/wo-039-cloud-worker.test.ts` (7, fake engine):
  - a bot check is handed back, never sent;
  - the facts and resume are 0600, carry only that job's answers, and are removed after a crash;
  - parallel runs never exceed N, one engine process per job, no person's facts in another's run;
  - the approval hash is always passed, and a changed payload is not sent;
  - the evidence;
  - preflight;
  - chat opt-in.
- `tests/career-cloud-worker.test.cjs` (3, the real engine and Chromium on local forms):
  - two people in parallel: every first page load arrives with no cookie, and each POST carries only its own
    person's cookie;
  - a check at Submit is handed back with 0 POSTs;
  - an application changed after approval is not sent, with 0 POSTs.

## Planted defects (each made a test fail, then reverted)
| # | Defect (one line) | Failing test |
|---|---|---|
| D1 | the gate counts cloud submissions (`source in (..., 'cloud')`) | db `a cloud submission confirmed by email does not count toward the gate` |
| D2 | the temp folder is removed in `try`, not `finally` | WO-039/2 facts removed even when the run crashes |
| D3 | a bot check is passed through instead of handed back | WO-039/1 a bot check goes back to the person |
| D4 | `--approved <hash>` dropped from the engine call | WO-039/1, /2, /3, /4 (the approval hash still binds) |
| D5 | the claim skips the opt-in check | db `a person who never turned it on is never claimed` |
| D6 | the throttle trips only above 2% | db `1 failure in the last 50 attempts (2%) pauses the portal` |
| D7 | parallel contexts uncapped | WO-039/3 never more than N at once |
| D8 | a yes counts without the terms being the last word | WO-039/7 opt-in in chat |
| D9 | the daily limit not checked at claim | db `their daily limit is refused at claim time` |

## Measured (offline)
Numbers are VERIFIED on this sandbox (4 vCPU, 16 GB, the same CPU count as the D-010 VM) unless marked.
- **The captured forms** (17 real Greenhouse, Lever and Ashby pages, scripts removed). Command:
  `node evals/apply/cloud-throughput.cjs --parallel 1 --out evals/apply/cloud-throughput-p1.json`.
  - Opening and planning a form takes 1.9 to 2.6 s.
  - No captured form reaches the final review without its page's own scripts:
    - Greenhouse and Ashby: `FIELD_DID_NOT_PERSIST` (their React widgets);
    - Lever: 3 stop at `needs_answers` (a list longer than 60 options), 2 at `UNCONFIRMED_DEFAULT`, 1 at
      `FIELD_DID_NOT_PERSIST`.
  - So a full application time on a real form is NOT_RUN offline; 009b-3 recorded the same.
- **The engine's own time per application**, on a synthetic form that posts to its own page (Lever's shape), with the
  Submit answered by a local server:
  - command: `node evals/apply/cloud-throughput.cjs --control-only --control N --parallel P`;
  - 1 context: median 8.2 s per submit run (6 of 6 confirmed);
  - 3 contexts: median 8.6 s (12 of 12);
  - 6 contexts: median 10.3 s, and 1 of 12 runs gave no result. One failure in 12 is 8%, which would trip the 2%
    throttle, so the default is 3.
- **Which forms a server can send at all:**
  - the engine sends headless only a form that posts to its own page;
  - every captured Lever form does (6 of 17);
  - Greenhouse's job-boards form (5) and Ashby (6, no `<form>` element) submit from page script. The engine sends those
    only with the person pressing Submit in a visible window (`--person-submits`, PR #25), and the cloud claim refuses
    them (`person_submits`).
  - So today the cloud covers Lever only. VERIFIED by fixture count.
- **Bot checks:** 17 of 17 captured application forms load an invisible check scored at Submit (reCAPTCHA Enterprise or
  hCaptcha, `tests/fixtures/forms-ci/manifest.json`). The rate at which they challenge or silently reject a headless
  browser on a datacenter IP is NOT_RUN. Only real submissions show it, and the gate forbids them before 3 hand
  submissions per site.

## Throughput math, honest
- **Compute is not the limit.**
  - At 8.6 s per application (VERIFIED, synthetic), 3 contexts send about 30,000 a day.
  - At an ASSUMED 30 to 60 s on a live page, 3 contexts send 4,300 to 8,600 a day.
  - At 60 s, 150 a day for one person needs 2.5 context-hours a day. One D-010 VM covers about 28 people at 150 a day,
    or about 86 at 50 a day.
  - Memory per headless Chromium is ASSUMED at 0.4 to 0.6 GB, so 3 fit in 8 GB.
- **What makes 100 to 150 a day per person unreachable as built:**
  1. D-011 caps a person at 50 a day (25 by default), and the claim enforces it. 100 to 150 needs the owner to amend
     D-011 in writing. Nothing here raises it.
  2. Only Lever's form can be sent from a server; Greenhouse and Ashby need the person's Submit press.
  3. Bot checks. Every form loads one, and a headless server browser is what they are built to score down. With the
     throttle at 2% (one failure in 50 attempts), a portal whose live challenge rate is 5% is paused after about 20
     attempts each time, so about 80 attempts a day per portal, shared by every user. That is ASSUMED arithmetic, not a
     measurement.

  The number that decides it is the first week of cloud runs on Lever after its gate opens, read from
  `career_apply_cloud_report`. If the bot-check rate there is above 2%, the cloud cannot meet both the 2% target and
  the volume target, and the person's own browser (D-017, the extension WO-031) stays the path.
- **Preparation still needs the person's computer.** The cloud only sends. Each application is prepared by the engine's
  dry run on the person's computer (`approve-first.ts prepare-batch`), approved on a card, then sent. A cloud-side
  prepare is not built (see below).

## Not built
- **Cloud-side preparation** (the dry run on the VM from the person's confirmed facts in the database). Without it,
  volume is bounded by what the person's computer prepares.
- **Screenshot upload.** Screenshots stay on the VM (masked, 0700 folder, hash in the queue row). There is no storage
  bucket for evidence yet, and no retention job beyond the runbook's `find` line.
- **Telemetry for own-computer and extension runs.** `career_apply_cloud_events` takes `source`, but only the cloud
  writes it.
- **The call from the mail run** to `career_apply_confirm_by_mail` belongs to WO-032.
- **The card answer wording.** It now says "it is sent next, from your computer or, if you turned it on, the cloud".
  The batch card itself does not say which path will send it.
- **The person cannot read their opt-in in the app.** All new tables are service-role only, so the export list is
  unchanged; "is the cloud on" answers in chat.
- **Retiring `career_apply_claim`.** The old pool claim has no caller and no gate. It now tags its rows `cloud`, so it
  never opens the gate, but it should be revoked once WO-009b's tests move to the cloud claim.
