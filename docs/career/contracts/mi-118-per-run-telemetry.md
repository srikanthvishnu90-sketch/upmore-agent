# CONTRACT — MI-118: per-run telemetry / proof layer for application runs

**Written:** 2026-10-16, BEFORE the implementation (contract first).
**Registered:** master issue list MI-118 (Crew A schema design + Crew B
implementation in 149/150's run path; adopted 2026-10-15 from the owner's
pasted proposal — the lawful half only). Lane `work/mi118-telemetry`,
base `release/career-v224 @ 3c11e838`. Tier 2 (engine under harness).

## The gap

Application runs through modules 149/150 write a submissions-ledger record
only when a submit is ACCEPTED (`status: "submitted"`). Every other run —
doorstep, awaiting-user, captcha handoff, cap stop, payload mismatch,
timeout — leaves no structured record in the ledger at all, and even the
accepted record carries none of: which platform, where the form schema
came from, what the run cost, how long it took, whether a captcha was
encountered, or the employer's end state as a delivery field. Cost,
latency, and delivery cannot be audited from the logs alone.

## The rule change

Module 149 writes ONE telemetry record per run phase into the same
injected ledger (`log.records`) the caps already count from, and returns
it on the result object as `telemetry`:

- **Prepare phase** — `runApply` (including its recursive multi-round
  form walk, which is ONE run and writes ONE record) finalizes its record
  on EVERY terminal path: prepared, awaiting_user, every blocked code,
  the inline-submit completion, and a thrown board error (recorded with
  the error's code, then rethrown — telemetry never swallows a failure).
- **Submit phase** — `submitDoorstep` writes its own record sharing the
  prepare phase's `application_id`. An ACCEPTED submit's telemetry record
  IS the ledger's submission record: it keeps `status: "submitted"` (the
  caps and the duplicate guard count exactly it, exactly once) and gains
  every telemetry field. Blocked/unknown submit attempts write
  `record_type: "run_telemetry"` records with NO `status: "submitted"`,
  so a telemetry row can never inflate a cap count or trip the
  duplicate guard.
- **Reconciliation** — `reconcile()` updates the session's submit-phase
  record in place when the employer's state resolves it (the record
  object in the ledger is the same object), and
  `resolveUnknownOutcomes` keeps `delivery_status` in sync with `status`
  on any record that carries one.

### The record (every field, every run)

| field | source / honest rule |
|---|---|
| `application_id` (+ `applicationId`, `appId` aliases) | caller-supplied (`applicationId` on the run/submit input) or minted once per session from user + posting + session id; shared by the session's prepare and submit records |
| `platform` (+ `target_platform`) | the board's ATS family, else the posting URL's classified family, else the posting's stated family/vendor, else the board kind |
| `schema_source` | `census-fresh` when the form schema was read live in this run (module 150's discovery; any board whose `form()` was read this run), `cached` when the board attests a censused/fixture schema (the sandbox board's fixed field set; a board carrying `schemaSource: "cached"`), `not_read` when the run stopped before any form read — never upgraded to a claim the run did not earn. A caller attestation (`schemaSource` on the input) wins over the board's |
| `tokens_consumed` | the caller-metered token count for the phase (`tokens` / `tokensConsumed` / `tokenUsage.total` on the input, or a `tokenMeter()`), else `null` = unmetered. Never fabricated as 0 |
| `execution_seconds` | end − start from the injected clock (`clock()` called at start and finish) or `now` + `endNow`/`finishedAt`; else `null` = unmeasured. Never fabricated |
| `captcha_encountered` (+ `captcha_at`) | true iff the run hit a captcha/verification challenge; an encounter is a STOP metric — it routes to `CAPTCHA_HANDOFF` (prepare) or the unknown-outcome handoff posture (submit), never avoidance, never a solver |
| `delivery_status` | the employer's END STATE: `submitted` only with an employer confirmation (id or captured success evidence, as 149/150 already grade it), `unknown_outcome` when a submit's landing is unproven, `not_submitted` when nothing was transmitted |
| also | `phase`, `result_status`, `outcome_code`, `confirmation_id`, `canonicalKey`, `company`, `vendor`, `userId`, `started_at`, `finished_at`, `timestamp` |

### The summary (done-test, second half)

`Portal.summarizeTelemetry(records)` is a pure function over ledger
records alone: per-run rows plus totals — runs, distinct applications,
summed tokens (metered runs only, with the unmetered count named),
summed execution seconds (measured runs only, unmeasured named),
captcha encounters, and delivery counts overall and per platform. If it
cannot be produced from the records, the record shape is wrong.

### Module 150's part

The browser board attests its schema source: a `schemaSource` getter
that reports the caller's censused attestation (`opts.schemaSource`)
before any discovery and `census-fresh` once `form()` has performed a
live discovery on that board. Module 149 reads the attestation at
finalize time, after the run's form reads have happened.

### Module 155's part (forwarding only)

The batch loop passes a stable per-application id
(`app-<hash(run.id | postingKey)>`) and forwards any host-supplied
`clock` / `tokens` / `schemaSource` from its deps into both 149 calls,
so a batch drive's ledger carries the same records with the phases
joined by application_id. No other 155 behavior changes.

## Guard (fail-first)

`tests/career-portal-telemetry.test.cjs`, written before the code:

- prepared / captcha-at-open / captcha-at-review / inline-submit /
  standalone-submit / blocked-submit / thrown-submit trajectories each
  leave exactly the records above with every field present;
- the accepted record is counted exactly once by the caps and the
  duplicate guard; fifteen telemetry-only records trip neither;
- a timeout submit records `unknown_outcome`, and `reconcile()` flips
  the SAME record to `submitted` when the receipt is read back;
- schema source: sandbox = `cached`, live-discovery double =
  `census-fresh`, board-attested cached = `cached`, pre-form stop =
  `not_read`;
- unmetered tokens / unmeasured time are `null` and named as such by
  the summary; the summary's totals are computed from the records alone.

## Scope / law

No deploy, no sends, no real submissions, no captcha solving (a captcha
remains a stop + handoff), no Supabase changes. The stealth /
captcha-avoidance framing of the source proposal stays REJECTED-BY-LAW
(Spec 2 §6.3) — `captcha_encountered` is an honest handoff-rate metric.
