# E2E: chat turn → employer-confirmed application — design + runnable skeleton

Branch: `muse/2026-10-22-e2e-skeleton`, based on
`origin/muse/2026-10-22-chat-begin-caller` @ cb56921a. Base rationale: it is
the only tree that carries module 176 (the chat-side begin caller) **and**
both door migrations in-tree (20261024130000 card-cloud bridge,
20261024140000 agent cloud begin); S1 verified its begin trio green and its
db chain at 2,028 ok. No other candidate base composes the chat door, the
card bridge, and the cloud claim in one schema.

Code: `tests/e2e/chat-to-confirmation.test.cjs` (orchestrator),
`tests/e2e/mock-employer.cjs` (fixture), `tests/e2e/provision-pg.sh`
(disposable PG16 in tests/db/run.sh's own migration order),
`tests/e2e/stage-1..4-*.sql` (the DB legs).

Run it:

```
E2E_PGBIN=<pg16 bin dir> node --test tests/e2e/chat-to-confirmation.test.cjs
```

A run prints one `E2E-MAP` line per handoff — PASS, FAIL (always with its
issue name), or ENVIRONMENT (the machine could not run the leg; never
counted as a wiring result either way) — and re-prints the whole map at
the end with the wall-clock runtime. Handoffs whose wiring does not exist
fail their test on purpose: when the wiring lands, the test goes red in
the other direction and the expectation is updated in the same PR.

Everything is synthetic and local: a disposable Postgres 16 (the repo's
stubs + migrations, run.sh's order), a localhost mock employer, synthetic
TEST identities. No live Supabase reads or writes, no deploy, no flag
changes anywhere real. The submit flag is never involved: every state
change happens inside the disposable cluster.

## The test's steps, end to end

1. **Chat turn.** A synthetic user types an apply ask in chat
   ("Apply to 3 data analyst roles for me"). Module 155 parses the ask;
   agent-chat's handler plans the batch intent and a prepared run should
   surface an **approval card**.
2. **Batch prepare.** The worker prepares the application(s): form read,
   answers mapped from confirmed facts only, payload + approval hash
   frozen. Anything the form asks that no confirmed fact covers stops the
   prepare at the **doorstep** (a question to the user), never an
   invented answer.
3. **Approval card.** The card shows exactly the frozen payload (fields,
   resume fingerprint, destination). What is shown is what is approved —
   byte-identical, hash-bound.
4. **Owner approval.** The user's tap (and only the tap) mints the
   approval and queues exactly one card-bound job row.
5. **Cloud worker claim/drain.** A running cloud worker claims the queued
   row (exactly once, lease-bound, family gate + kill switches checked),
   loads the approved resume, and drives it.
6. **Board drive.** The product's engine fills the employer's form with
   exactly the approved answers and submits — once.
7. **Mock-employer submit.** The fixture receives the POST and answers
   with its confirmation page (confirmation number bound to the received
   payload's hash).
8. **Confirmation page.** The worker's finish records the page evidence:
   the row becomes `submitted_unconfirmed` — never "submitted" on a page
   alone.
9. **Employer-confirmed state.** The employer's confirmation email is
   matched (`career_apply_confirm_as`, kind `received`) and only then
   does the row become `confirmed`, with `email_confirmed_at` and
   `confirmation_mail_hash` set. That state — and only that state — is a
   real completion.

Two routes into step 5 exist in the schema and the skeleton exercises
both: **Route A**, the chat begin (module 176's cloud door,
`career_apply_cloud_begin_agent_own`); **Route B**, the Messages card
(the C9 route: card tap → card-bound queue row → claim).

## The mock employer

`tests/e2e/mock-employer.cjs` — a localhost-only HTTP server (127.0.0.1,
ephemeral port). No external network, no real employer.

Pages:

| Page | Behavior |
|---|---|
| `GET /jobs/mockco/1` | The application form (below). |
| `POST /jobs/mockco/1/apply` | Records the submission, answers 200 with the confirmation page: "Thank you for applying" + `Confirmation number: MOCK-<first 8 hex of the received payload's sha256>`. |
| `GET /received.json` | Test-only readback of everything received. |

Form fields (Greenhouse-shaped names/labels, multipart):

| Field | Shape | Why it is there |
|---|---|---|
| `first_name`, `last_name`, `email` | text/email, required | the basic identity answers |
| `phone` | tel, optional | a present-but-optional field |
| `resume` | file, required | the approved resume; byte-identity is asserted |
| `gender` | select incl. `I don't wish to answer` (value `decline`) | one EEO field whose only honest answer on file is the decline |
| `attestation` | checkbox, required — "I certify that the information I have provided is true and complete." | one required attestation: with no confirmed answer on file the prepare must stop at the doorstep; it may never be checked by invention |

Received-payload log: one JSON object per request, appended to the file
named by `MOCK_EMPLOYER_LOG` and kept in memory for `/received.json`:

```json
{ "at": "<iso ts>", "method": "POST", "path": "/jobs/mockco/1/apply",
  "content_type": "multipart/form-data; boundary=…",
  "fields": { "first_name": "TEST", "gender": "decline", "attestation": "on", … },
  "files": [{ "name": "resume", "filename": "resume.pdf", "size": 30,
              "sha256": "<hex>" }],
  "received_sha256": "<sha256 of fields+file hashes — the confirmation number derives from it>" }
```

The assertions read the employer's side of the wire (this log), never the
driver's own claims.

## Assertions at every handoff

Each assertion names what is checked, where, and the known issue it
catches. Status column = the skeleton's measured result on 2026-10-22
(this branch, this VM) — see "Measured vs claimed" below.

### H1 — chat → card
| # | Assertion | Where | Catches | Status |
|---|---|---|---|---|
| A1.1 | The apply ask parses to (count, family) | module 155 `parseApplyAsk`, in-process | ask-parsing regressions | PASS |
| A1.2 | A plain-text turn carries NO structured batch request | `career_task_bridge.normalizeCareerBatchRequest(undefined) === null` (handler-career.ts builds `careerBatch` only from `body.career_batch`) | the structural root of the Telegram fallback | measured |
| A1.3 | After a plain ask, no card artifact exists and no run is readable; the status readback answers "No batch run is readable" | `planCareerBatchIntent` (status) against an empty persistence | **F-037** (the Telegram card is structurally unreachable on v248) / **F-002** (status turns fall to the generic fallback; reproduced live 2026-10-22) | **FAIL — F-037/F-002** |

### H2 — card → approval
| # | Assertion | Where | Catches | Status |
|---|---|---|---|---|
| A2.1 | The stored card payload is byte-identical to what was shown; its hash recomputes | `career_apply_message_cards` row vs `career_apply_canonical` hash (disposable PG) | shown-vs-approved drift | PASS |
| A2.2 | One tap mints exactly one durable binding and queues exactly one row, `queued`/source null/attempts 0, payload = carded payload | `career_apply_message_card_approve_own` → `cloud_bound_jobs` + `career_apply_jobs` | double-enqueue, late restamping, replayed taps (bridge C9 matrix) | PASS |
| A2.3 | A foreign user's tap on the card is refused `not yours` | same RPC, second synthetic user (in the message-cards suites; asserted there, referenced here) | cross-user approval | PASS (by reference) |

### H3 — approval → cloud worker
| # | Assertion | Where | Catches | Status |
|---|---|---|---|---|
| A3.1 | Route A: the chat begin enqueues a claim-shaped row (queued, source null, attempts 0, no lease) | `career_apply_cloud_begin_agent_own` (stage-2 SQL) | begin/claim shape drift (module 176 ↔ 20261024140000) | PASS |
| A3.2 | Route A: the claim refuses that row, refusal exactly `not_card_approved` | `career_apply_cloud_refusal` + `career_apply_cloud_claim_at` | **F-030 seam** — a chat begin carries no card binding (C9: the card is the only cloud authorization route) | **PASS as the C9 control** (stage 2, still refused by design) — and the seam is closed by composition (A): stage 2b runs the same chat user through the card route (module 176's `beginCloudCardPostings` → show_as → the person's tap) and the claim takes that row. Root cause: `docs/apply/ROOT-CAUSE-F030-SEAM-CARD-BINDING-2026-10-22.md` |
| A3.3 | Route B: the claim takes the card-bound row exactly once and stamps it `cloud` | `career_apply_cloud_claim_at` (stage-3 SQL) | claim predicate drift, double-claim | PASS |
| A3.4 | A drain process exists that claims queued rows in a real deployment | `workers/career-cloud/drain.ts` (`runDrain` → `cloudLoop`) over `workers/career-cloud/pg-queue.ts` (the five cloud doors as direct PG, beside `restQueue`); unit source `scripts/career/systemd/trainee-cloud-drain.service` (in-tree, NOT installed) | **Missing cloud claimer** (submit-armed inventory 2026-10-22: "worker drain for cloud jobs ABSENT") | **PASS** (H3 lane, 2026-10-22: the drain claimed the stage-5 card-bound row from disposable PG and finished it `submitted_unconfirmed`, telemetry recorded; stub engine, tier 2. Design: `docs/e2e/H3-CLOUD-CLAIMER-DESIGN.md`) |
| A3.5 | Two concurrent drains racing the last cap slot never both submit; the ledger never silently loses a drain's record | S3's synchronized drain-pair harness (nightly — see split) | **F-034** — executor snapshot→execute→whole-ledger-replace; S3 measured 40/40 pairs over-submitting (16 vs cap 15) with the ledger afterwards reading a compliant 15 | OPEN (S3) |
| A3.6 | Kill switches off ⇒ the claim takes nothing, either route | `career_cloud_settings` in the cloud SQL legs | flag-path regressions | PASS (by reference: `career_apply_cloud.test.sql`) |

### H4 — cloud worker → board
| # | Assertion | Where | Catches | Status |
|---|---|---|---|---|
| A4.1 | Doorstep: prepare WITHOUT confirmed EEO/attestation answers stops and asks — no invented answer is filled | engine `prepare` (approve-first) vs the mock form, facts minus those two answers | invented-fact submissions; F-029-class uncovered questions | designed; not measurable in this VM today (see H4 status) |
| A4.2 | With the answers confirmed, the drive fills exactly the approved fields and the finished state matches the employer's record | `cloudLoop` + engine vs mock employer (tier-2 harness queue — the PG drain is A3.4) | fill drift, wrong-person data | designed; ENVIRONMENT today |
| A4.3 | Each job drives in a fresh browser context; no cookie crosses jobs | WO-039 pattern (two-job drive) | S2's session-isolation surface | PASS (by reference: WO-039 design; S2 measured isolation holds 5/5) |
| A4.4 | A dead browser shard fails drives loudly instead of silently | host/board tier — S2 bench | **S2 shard-death finding**: board HTTP stays green (p50 8–12 ms) and systemd reports healthy while every drive on a dead shard fails 100% | OPEN (S2) — belongs to the bench tier, not this skeleton |

### H5 — board → confirmation
| # | Assertion | Where | Catches | Status |
|---|---|---|---|---|
| A5.1 | Exactly one POST reaches the employer | mock employer's received log | double-submit | designed; ENVIRONMENT today |
| A5.2 | The POST's fields equal the approved payload — EEO arrives as the decline (`decline`), the attestation as checked from its confirmed answer | mock log vs approved payload | answer substitution after approval | designed; ENVIRONMENT today |
| A5.3 | The received file's sha256 equals the approved resume's sha256 | mock log | wrong-resume sends | designed; ENVIRONMENT today |
| A5.4 | The confirmation number on the employer's page derives from the received payload's hash, binding page → payload → (H6) DB row | confirmation page vs mock log | confirmation misread (BUG-208 class: IDs minted from prose) | designed; ENVIRONMENT today |
| A5.5 | A payload changed after approval is never sent | WO-039 tamper case (by reference) | post-approval mutation | PASS (by reference) |

### H6 — confirmation → recorded state
| # | Assertion | Where | Catches | Status |
|---|---|---|---|---|
| A6.1 | Finish with page-confirmation evidence records `submitted_unconfirmed` — never `confirmed` on a page alone | `career_apply_cloud_finish` (stage-4 SQL) | claimed-submitted inflation | PASS |
| A6.2 | The employer's `received` email confirms: state `confirmed`, `email_confirmed_at` + `confirmation_mail_hash` set | `career_apply_confirm_as` (stage-4 SQL) | confirmation-path regressions | PASS |
| A6.3 | A rejection email does not confirm; a page-only confirmation does not open the family gate | cloud SQL legs (by reference) | gate inflation | PASS (by reference) |
| A6.4 | A bot-check finish records `needs_user` and the throttle event; the pause it triggers is computed over the portal's last 50 attempts POOLED ACROSS ALL USERS | `career_apply_cloud_finish` + `career_apply_cloud_throttle` (cloud SQL legs; S3 vol. battery) | **S3 throttle finding**: one user's single failure pauses the portal 6 h for everyone (1×100 ≥ 2×50) — a design defect the assertion documents, not a pass criterion for the pooled math | PASS (behavior measured; the pooled-pause design is the open finding) |

## Merge vs nightly

Justification is runtime + hermeticity, both measured (next section).

**Every merge (hermetic, no browser):** H1 (in-process JS, ~25 ms), H2,
H3a, H3b, H6 (disposable-PG legs, ~0.05–0.25 s each once provisioned),
A3.4's drain leg (the built drain over the disposable cluster, stub
engine, ~8 s incl. Deno start), plus provisioning itself
(~6 s). Total budget ≈ **25 s** on top of the existing suites. These legs
catch the wiring failures that actually ship (F-002/F-037 class,
F-030-class seams, claim/finish predicate drift) and they cannot flake
on a browser.

**Nightly (full):** H4/H5 (the browser board leg — a single drive took
~10 s even while failing in this VM; WO-039's three drives took ~28 s
combined in CI conditions, and S2 showed drive latency is the first
thing to degrade under load), A3.5 (F-034 concurrent-drain pairs — S3's
harness, volume-shaped by nature), A4.4 (S2 bench — multi-user, minutes),
and the full S1-style branch sweep (5,252–5,291 tests per branch) that
no per-merge run should pay for. S2's own numbers are the argument:
at 16 in flight the board probe's p99 hit 45 s and legs burned full
120 s timeouts — a leg with that tail does not belong in a merge gate.

## Runtime budget

Measured numbers used (all 2026-10-22): skeleton provisioning 5.8–6 s
(94 migrations, PG16.14, this VM); stage SQL legs 40–250 ms each
(H3a 59 ms, H2+H3b 143–245 ms, H6 40 ms, in `node --test` durations);
chat leg 25 ms; the failing-environment board leg 9.8 s end to end
(engine spawn + refusal). S3: claim of 6 rows 2.6–14.9 s at ~7–9k queued
vs ~0.16 s at 1k backlog — the skeleton runs at backlog ≈ 2, so its
claim budget is the 1k figure with headroom. S1: full sweep 5,252 tests
per arch-lineage branch (minutes, not seconds — hence nightly). S2:
single-user drive legs complete in seconds when the browser tier is
healthy; Chromium target deaths, not CPU, set the tail.

| Leg | Budget (merge) | Budget (nightly) |
|---|---|---|
| Provision disposable PG | 20 s | 20 s |
| H1 chat leg | 2 s | 2 s |
| H2 + H3a + H3b (SQL stages 2–3, 2b) | 5 s | 5 s |
| H3 drain leg (stage 5 + drain run, stub engine) | 15 s | 15 s |
| H4 + H5 board drive (1 job + doorstep probe) | — | 120 s |
| H6 finish/confirm (stage 4) | 5 s | 5 s |
| A3.5 F-034 drain pairs (S3 harness) | — | 300 s |
| **Total** | **≤ 30 s** | **≤ 8 min** |

A leg that exceeds budget fails as TIMEOUT with the leg's name — a slow
leg is a finding, not a retry.

## Replaces or complements

The S2/S3 batteries stay exactly as they are (owner's words). This E2E
is the composition none of them tests: they prove the legs; this proves
the handoffs between the legs, in order, on one application.

| Existing suite | Relationship |
|---|---|
| Submit-integrity D-names (`career-portal-submit-integrity`) | **Complements.** The refusal matrix (what must never be sent) stays theirs; the E2E drives the one path that SHOULD send. The E2E never replaces it — and note S1's finding: its Chromium tier fails on every branch in a clean checkout, so neither suite currently gives the board leg a green home; the E2E's ENVIRONMENT classification is the honest shared answer until the browser tier is fixed. |
| Begin trio (`career-agent-begin`, `-begin-wiring`, `-begin-cloud`) | **Complements.** They prove module 176 against stub/model RPCs. The E2E's stage 2 runs the same door against real PG and composes it with the claim — the composition (A3.2) is what the trio cannot see. |
| Portal-apply (`career-portal-apply`, 149/150 suites) | **Complements.** Form mechanics stay theirs; the E2E consumes one drive through the cloud worker path. |
| Loop-acceptance (`career-loop-acceptance`) | **Complements.** It grades conversation loops; the E2E grades the state machine those loops are supposed to move. Overlap at H1 only. |
| Submit-path (`career-portal-submit-path`) | **Complements.** Doorstep mechanics stay theirs; A4.1 reuses its contract against the mock form. |
| S3 `scale_s3_*` batteries | **Untouched, never replaced.** Volume, cap and throttle behavior at scale (incl. F-034's proof) is S3's. The E2E borrows A3.5/A6.4 as named assertions pointing at S3's harnesses for the nightly run; at skeleton scale (1–2 rows) those defects are invisible by construction. |
| S2 host bench | **Untouched, never replaced.** Multi-user isolation and the shard-death finding (A4.4) are host-tier facts; a single-application skeleton cannot see them and does not pretend to. |
| Cloud SQL legs (`career_apply_cloud`, pending `career_apply_card_cloud*`) | **Overlap, deliberately.** Stages 3–4 re-derive a thin slice (one card, one claim, one finish, one confirm) because the E2E needs those states as *waypoints in one run*, not as isolated proofs. The exhaustive matrices (refusals, gates, immutability, lifecycle) stay in those files; if they and the E2E ever disagree, the E2E is wrong by definition until proven otherwise. |
| WO-039 cloud-worker test | **Complements.** Its in-memory-queue drive is the pattern H4 reuses (labeled tier 2 wherever reported). It proves worker+engine; the E2E adds the PG legs before and after it. |

What the E2E makes redundant: **nothing.** What it never replaces: the
refusal matrices, the scale batteries, and a live run. A green E2E map
on synthetic fixtures is evidence the wiring composes — it is not a
real completion, and it is never reported as one.

## Measured vs claimed (2026-10-22 run, this branch, this VM)

Measured (actually ran): provisioning (94 migrations, PG16.14); H1
FAIL F-037/F-002 (in-process, the planner's own code); H2 PASS; H3a
PASS (H3 lane, 2026-10-22: stage 2's bare begin still refuses
`not_card_approved` — the C9 control — and stage 2b's composed card
route for the same chat user is claimed, `driving/cloud/1`); H3b
PASS; H3 drain PASS (H3 lane: the built drain — drain.ts + pg-queue.ts —
claimed the stage-5 card-bound row from the disposable cluster and
finished it `submitted_unconfirmed`, telemetry `submitted` recorded;
stub engine, tier 2); H6
PASS (finish → submitted_unconfirmed → confirm_as → confirmed). H4/H5:
ENVIRONMENT — Chromium's sandbox cannot initialize in this VM session
(probe: plain Playwright `chromiumSandbox: true` → "Chromium sandboxing
failed!"; the engine refuses unsandboxed runs by design,
`BROWSER_SANDBOX_REQUIRED` measured; the repo's own WO-039 test fails
identically here today, DRIVER_ERROR 3/3; running the engine as an
unprivileged user cannot be staged because /home/hatch is unreadable to
non-root users on this overlay). Total wall clock ≈ 15 s.

Claimed (designed, not run): A4.1's doorstep stop shape, A4.2/A5.1–A5.4
against the mock form (the mock employer's own log assertions are
written and run wherever the browser tier works — on the production
board host's user, or any non-root shell), A3.5/A4.4/A6.4 at skeleton
scale (they point at S3/S2 harnesses by design).

Real completions: **0.** This lane built and ran a test; it submitted
nothing anywhere real.
