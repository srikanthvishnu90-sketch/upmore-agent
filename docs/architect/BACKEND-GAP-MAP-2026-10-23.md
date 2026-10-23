# Backend gap map, 2026-10-23

The architect's map of the whole backend, from ingest to a proven application, at trunk `63a1233f`. It is in
priority order: the gap that blocks the most real outcomes comes first. Every line is backed by code, a test, or a
read-only query of the live project (`mrwngntwmnaqrqhupvlt`, read 2026-10-23). Docs are treated as claims.

Labels:
- **PROVEN-CONNECTED**: a test drives real code across a stage boundary and checks the outcome.
- **BUILT-UNPROVEN**: the code exists, but is tested only in isolation, with mocks, or not at all.
- **MISSING**: no code.
- **LIVE**: what the production project shows today.

## What is live today (read-only queries)

| Fact | Value |
|---|---|
| Edge functions deployed | `agent-chat` v249 plus older ones (finance, broker, site, channels). **Not deployed: `career-ingest`, `career-proactive`, `trainee-deliver`** |
| Cron jobs | `cancel-watcher-daily`, `plaid-sync-6h`, `upmore-proactive` (all finance era). **No ingestion schedule** |
| `career_postings` (live ingestion) | **0 rows**; `career_ingest_state` empty, so ingestion has never run |
| `career_kb_postings` (frozen snapshot) | 21,688 rows. This is what the released router serves |
| `career_apply_jobs` | **0 rows**, so real submissions = 0 |
| `career_apply_prepared` / `career_apply_wanted` / `career_outbox` | 3 / 0 / 0 |
| `career_batch_runs_v1` (old 155 stack) | 6 runs, all `completed` (sandbox lanes) |
| Apply functions present | `career_apply_enqueue`, `career_apply_claim_own`, `career_apply_cloud_claim`, `career_apply_extension_begin_own`, `career_apply_extension_begin_agent_own`, `career_batch_claim_v1` |
| Migration ledger | no `supabase_migrations.schema_migrations` table, so which repo migrations are applied cannot be read from the database |

## CI coverage (corrects an earlier statement)

`ci.yml` installs Playwright Chromium and runs all of `scripts/gate.sh`:
- the browser, architect, edge, typecheck and bundle steps;
- every `tests/career-*.test.cjs` except the 15 archived files.

It also runs `tests/db/run.sh` on a throwaway Postgres 16. The ~181 tests that fail in the architect's container (no
sandboxed Chromium, no remote Deno imports) therefore pass in CI.

One exception: `tests/edge/channel-text-yes.test.ts` is not in the gate's edge list, so CI never runs it.

## Gaps, in priority order

### G1. No test drives the loop as one connected flow (BUILT-UNPROVEN everywhere)

Each stage is tested alone: ingest with stub HTTP, search in memory, the queue in SQL, the executor with an
in-memory queue or mock RPC. No test takes one person from chat-confirmed facts through a prepared row, approval,
enqueue, claim and the click on a page, to the recorded result and the receipt, on a real Postgres. Until one does,
"working connected flow" cannot be shown, and every fix below is measured by it.

### G2. The executor's inputs have no product writer (MISSING)

What the executor needs that nothing writes:
- **Basics.** They are kept only with owner provenance and a confirmation event. `set_resume_contact` writes name and
  email without either, so they are dropped. Nothing writes phone.
- **Work authorization and sponsorship.** These need a confirmed `eligibility` fact with a value (149:386-396). Chat
  writes `constraints` instead, which the executor never reads. Live, the polarity was once stored inverted
  (loop-completion §2).
- **Resume.** The executor reads `master.resume` with a sha256; nothing writes it. The resolver
  (`resume-store.cjs`) exists.

The tests pass only on hand-made profiles. A real person's application stops at uncovered questions with no resume.

### G3. Two apply stacks, two caps, two once-per-company ledgers, no unique confirmation ID

- **Caps:** D-014 names one stack with one cap. In code, the queue is 25/50 (SQL), the 155/149 path is 15
  (`SPEC_CAPS`) and the cloud bridge is 15.
- **Once-per-company ledgers:** `career_apply_jobs` and `career_batch_ledgers_v1` do not see each other, so the daily
  cap and the 30-day company rule do not hold across paths.
- **Confirmation IDs (D-024):** `career_apply_jobs.confirmation_id` has no uniqueness constraint, so two employers can
  share one ID.
- **Old-stack arming:** the old stack can still arm a real Greenhouse click through module 150 after an exact
  "Approve batch <id>" and a matching card hash.

### G4. Nothing is prepared before the person asks (D-011, MISSING)

The queue path's prepare is the manual CLI `approve-first.ts prepare-batch` over a local facts file. The 155 path
prepares only on a chat ask. `career-proactive` only pushes rows that are already `ready`. `planBatch` has no
server-side caller. The tailored resume is not bound into the queue payload, and the cover note has no production
caller.

### G5. Approval semantics are split (WO-005 unbuilt)

- Text "yes" is refused on queue cards (Option A) but approves 155 batch cards over WhatsApp/Telegram, and that test is
  outside CI.
- Generic pending approvals are collected by `loop.ts` and only counted by the handler.
- **The per-application attestation carrier stays parked on the owner's question.** Today attestation exists only as
  the person's own answer row inside the payload hash (queue, cloud, extension), and as a run record inside 155.

### G6. Proof is not kept with the record or shown to the person (D-024, BUILT-UNPROVEN)

- Screenshots stay on the device or VM as hashes.
- `apply.ts` takes its "before" picture at review, not at the click.
- Receipts are tested only in memory.
- Inbox confirmation (`CAREER_MAIL_TRACKING`) is off, so the cloud gate (3 email-confirmed submissions per portal) can
  only open by waiver.

### G7. Jobs never reach a user

- **In code:** `search_jobs`, `set_job_alerts` and `queue_applications` exist only in the agent brain, which is pinned
  off (`AGENT_BRAIN_RELEASED = false`). The released router reads the frozen `career_kb_postings` snapshot.
- **Live:** ingestion is not deployed or scheduled.
- **In the code paths that do exist:** alerts rank by keyword and recency, not fit. Fit ranking sees only the 150
  newest text matches. The relevance floor is not applied at queue time, and its agency list is empty.

Changing the router's data source touches the frozen router, so it needs the impact assessment through the
coordinator.

### G8. Deploy readiness

- Production is `agent-chat` v249, whose lineage relative to trunk is unrecorded (D-026, WO-093 provenance unrun).
- There is no database migration ledger to diff against.
- The cloud bridge migration is a draft.
- Paid-eval safety (`arch/eval-cap-remaining` a248c291, `arch/paid-workflow-disable` 70418b2f) is on side branches;
  the 7 paid workflows are enabled.
- Deploys, migrations, cron and flags are the owner's to run.

## Proven and working (scoped)

- The postings schema, RLS, de-dup and the pay column are proven on real Postgres (`tests/db`).
- Payload-hash binding at enqueue, the 25/50 daily cap and once-per-company-per-30-days are proven in SQL for the
  queue stack.
- The extension's submit path:
  - an exact-card check;
  - page re-verification before the click;
  - captcha hand-off;
  - recording before the click.

  This is proven on fixture pages with a mock backend, in CI.
- Ingest to alert to delivery is proven in memory (capability journey).
- Chat routing at `63a1233f`: CI green, unmeasured on a fresh held-out set, frozen.

## Order of work

G1 first, because it is the measuring tool for everything else. Then G2, G3, G4, G5 (without the attestation
carrier), G6, G7 (the router part only after an impact assessment) and G8 (a packet the owner runs). Each gap closes
with the connected test from G1 extended to cover it. Nothing is deployed, no paid run is started, and no real
submission is made.
