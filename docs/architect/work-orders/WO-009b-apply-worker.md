# WO-009b: The apply worker — from a confirmed payload to an employer's confirmation

Status: ready (split into 009b-1 … 009b-6, one PR each, in order) · Depends on: WO-001 (done), WO-009a (done) ·
Assignee: Codex · Size cap: ~500 lines per sub-order, excluding fixtures

## Why this order changes the product
Trainee has never submitted a real application. Every competitor's core value is the submission (Tsenta, YC S26, claims
600 applications for about $20 across 30+ applicant tracking systems). Until this order lands we have alerts and a chat;
after it, the owner can submit his first real, employer-confirmed application from a terminal the next morning, and we have
the first honest numbers: how many real postings we can fully pre-answer, how long one application takes, how often the
employer confirms. Those numbers decide what we build next; without them every claim about being better is a guess.

## Rules for the whole order (in addition to AGENTS.md)
- **Never click submit on a real employer's site.** Real sites are read (public job APIs) or filled up to the final review
  page in `--dry-run`, never submitted. Submitting happens only from `scripts/apply.ts --submit`, run by the owner himself,
  after he types `yes` to the exact payload printed on his terminal.
- Answers come only from confirmed facts (D-007). An unknown required field stops the drive with the field named.
- No captcha solving, no stealth, no proxies, no LinkedIn or Indeed, no account-gated portals (Workday, iCIMS, Taleo are
  a later order and an owner decision).
- At most once: a claimed job that dies mid-drive is never retried blindly; it is `not_submitted` or `unknown_outcome`
  with evidence, and the person is told.
- Reuse `packages/domain/149-career-portal-apply.js`, `150-career-portal-browser.js`, `scripts/career/portal-browser-helper.cjs`,
  `workers/career-browser/` and `supabase/functions/_shared/career_apply.ts`. Do not rewrite them; extend at their seams.
- Copy the delivery queue's pattern for the job queue (`supabase/migrations/20261019020001_channel_delivery.sql`,
  `supabase/functions/_shared/channel_store.ts`): claim with `FOR UPDATE SKIP LOCKED`, release only after a clean run,
  sweep a dead claim to a final state, never resend.
- Every sub-order adds its tests to `scripts/gate.sh` (its explicit lists) and passes `bash scripts/gate.sh`.

## 009b-1: the apply queue (database + store)
Files: `supabase/migrations/20261020000000_career_apply_jobs.sql`, `supabase/functions/_shared/career_apply_store.ts`,
`tests/db/career_apply_jobs.test.sql`, `tests/db/run.sh`, `tests/edge/career-apply-store.test.ts`,
`tests/fixtures/export-tables.json`, `src/upmore-app-template.html` (EXPORT_TABLES) and the rebuilt app files, `scripts/gate.sh`.
- Table `career_apply_jobs(id, user_id, job_id, company, url, payload jsonb, payload_hash, approval_hash, state, reason,
  confirmation_id, attempts, claimed_at, created_at, updated_at, evidence jsonb)`; states `queued | driving | confirmed |
  submitted_unconfirmed | needs_user | failed | not_submitted | unknown_outcome`; unique `(user_id, job_id)` (one application
  per posting, ever); owner reads own rows; cascade on account deletion; in the export.
- `career_apply_claim(now, limit)` (service role) claims `queued` rows; a row `driving` longer than 15 minutes is swept to
  `unknown_outcome` with the reason, never re-driven.
- `enqueue` runs `admitApplication` (25 a day by default, 50 max, 1 per company per 30 days) before inserting.
- Acceptance: DB tests for every state, the once-per-posting rule, RLS and deletion; edge tests for admit-before-insert and
  the sweep.

## 009b-2: real form snapshots (fixtures) — revised 2026-10-19 after the CI capture
The build sandbox cannot reach job sites (Codex's capture: 0/24, CONNECT 403). The architect captured them in CI instead
(`.github/workflows/form-capture.yml`, run on a push to `ci/form-capture`): 24 real postings picked from the board
directory, each application page rendered in sandboxed Chromium (GET and GraphQL queries only; nothing clicked or typed).
Fixtures: `tests/fixtures/forms-ci/` (manifest + stripped HTML), built by `scripts/career/build-form-fixtures.cjs`,
checked by `tests/career-form-ci-fixtures.test.cjs`.

What the live pages showed (2026-10-19):

| ATS | Application in raw HTML | Application rendered | Bot check loaded on the form |
|---|---|---|---|
| Greenhouse | 5/6 (Databricks redirects to its own site) | 5/6 | reCAPTCHA Enterprise, all 5 |
| Lever | 6/6 | 6/6 | hCaptcha (invisible, run on submit), all 6 |
| Ashby | 0/6 (the page is built by JavaScript) | 6/6 (no `<form>` element; inputs only) | reCAPTCHA Enterprise, all 6 |
| SmartRecruiters | 0/6 | 0/6: the application page answers 403 behind DataDome | DataDome, all 6 |

Consequences for this order:
- Fixtures are rendered pages, not raw HTML. An application is a resume input plus at least one required field (Ashby
  has no `<form>`). The acceptance is now: at least 5 real applications each on Greenhouse, Lever and Ashby, with
  provenance, hashes and their required fields (`tests/career-form-ci-fixtures.test.cjs`). Codex's raw-HTML 24/24 test
  cannot pass on these sites and is retired with this change.
- SmartRecruiters is not automatable under the standing rules (no captcha solving, no stealth, no proxies): its
  postings are found and shown, and applying is handed to the person (the link, their own browser).
- 009b-3 serves these stripped pages; widgets that need JavaScript (React selects) are driven through 149's widget
  adapters on the live page in 009b-4, not in the fixture.

## The gate before any volume: does an automated submission get through the bot check? (owner, before 009b-5)
Every live Greenhouse, Lever and Ashby form loads an invisible bot check that scores the browser at the moment of
submit. A headless browser on a server is what those checks are built to catch, and the standing rules forbid solving,
evading or outsourcing them. A dry run cannot show whether a submission would be accepted; only a real one can.
- The first real submissions are the owner's own, to postings he actually wants: `scripts/apply.ts --submit` from his
  own machine, then the employer's confirmation email is the evidence (not the page alone).
- Record each in `docs/architect/apply-trials.md`: posting, ATS, result page, confirmation email (yes/no, after 24 h).
- 009b-5 (the worker that applies for people) does not start until 3 of 3 trials on each of Greenhouse, Lever and
  Ashby are confirmed by email. If they are not, the product applies through the person's own browser instead
  (prefilled, they press submit), and this order is rewritten.

## 009b-3: the fill-readback harness (stage 1 of WO-009 acceptance)
Files: `tests/career-apply-forms.test.cjs` (new), `tests/fixtures/portal-fixture-server.cjs` (serve the snapshots),
`tests/fixtures/apply-profile.json` (new, SYNTHETIC facts only), `scripts/gate.sh`.
- Serve each snapshot locally and drive it with 149/150 and a synthetic confirmed-fact profile up to the final review.
- Acceptance (from WO-009): every required field detected and bound; the resume input mounts and reads back the right
  hash; ≥ 95% of required fields read back equal to the planned value; any unknown required field stops the drive with
  its label. The test prints the per-form table (fields required, bound, read back, unknown).

### 009b-3 review, 2026-10-19 (architect, on Codex's `wo/009b-3-rendered-readback` at db0cae0c)
Run as a non-root user (Chromium will not start its sandbox as root; the gate's GitHub runner is not root): 14/15 pass.
The one red test is the real-form acceptance, and what it reports on the 17 saved pages is the finding:

| ATS | Real forms | Stop | Why |
|---|---|---|---|
| Greenhouse | 5 | RENDERED_WIDGET_REQUIRES_LIVE_PAGE, all 5 | its selects are React widgets; the saved pages have no scripts, so no saved page can fill them |
| Lever | 6 | CAPTCHA_HANDOFF 5, awaiting_user 1 | see the detector defect below |
| Ashby | 5 | awaiting_user, all 5 | correct: required questions the synthetic profile does not answer, each named |

The acceptance as written ("every required field bound, >= 95% read back" on every real form) cannot pass on saved
pages, and a test that can never pass may not sit in the gate. That is the architect's error, not the code's. Revised:
- Synthetic controls: unchanged (prepared, 100% read back, the resume's hash, no submit). Already green.
- Every real form: submit is never called; the stop is one of `prepared` (only with >= 95% read back and the resume's
  hash), `awaiting_user` (every unknown required question named, review never reached), or `blocked` with a named code
  (`RENDERED_WIDGET_REQUIRES_LIVE_PAGE`, `CAPTCHA_HANDOFF`); every required native control the profile answers is bound
  and reads back equal. The per-form table is printed, and the count of each stop per ATS is pinned in the test, so a
  regression (one more form blocked) turns it red and an improvement is a deliberate pin change.
- **Defect to fix in this order (trunk code, `scripts/career/portal-browser-helper.cjs` `fnDetectChallenge`):** a
  visible `.h-captcha` or `.g-recaptcha` element counts as a challenge. 5 of the 6 saved Lever applications carry
  `<div class="h-captcha" data-sitekey=...>`, the empty container of hCaptcha's invisible mode, and those 5 stop at
  open before one field is filled; the sixth (weloglobal) has no container and gets past open to its unknown questions. The design is a hand-off when a challenge is actually shown, at open or at submit, never a solve; an empty
  container is not one. A challenge is: a challenge frame of non-zero size (an hCaptcha or reCAPTCHA iframe whose src is
  the challenge, or reCAPTCHA's `bframe`), `#challenge-form`, or the challenge text already matched. Tests: the saved
  Lever pages get past open; a synthetic page with a visible challenge frame still stops with `CAPTCHA_HANDOFF` and
  nothing typed. Whether the live Lever page shows a challenge at submit is what the owner's Lever trials answer.
- Drop the `scripts/gate.sh` reordering (the file is already in `career_tests` by its name) unless it fixes a measured
  problem, and say which.
- Format the new code like the file it sits in (one statement per line); 3 KB lines cannot be reviewed.
- `wo/009b-3-fill-readback` is superseded by this branch; delete it once the PR is open.

## 009b-4: `scripts/apply.ts` — the first real application, from a terminal
Files: `scripts/apply.ts` (new), `tests/career-apply-script.test.cjs` or `tests/edge/apply-script.test.ts` (new), `scripts/gate.sh`.
- `deno run -A scripts/apply.ts --url <posting> --facts <confirmed-facts.json> --resume <file.pdf> [--submit]`.
- Default is `--dry-run`: drive to the final review, print EVERY field with the confirmed fact it came from, the resume
  hash and the destination, save the evidence (screenshots before review, field readback, final URL), stop.
- With `--submit`: same, then ask `Submit this application to <employer>? (yes/no)`; only the exact word `yes` clicks
  submit; then classify with `classifyOutcome` and print the outcome and evidence path. Anything else exits with nothing sent.
- Acceptance (against the local fixture server only): dry-run never clicks submit; `--submit` + `no` never clicks;
  `--submit` + `yes` clicks exactly once and reports the fixture's confirmation; an unknown required field stops before
  review; a page that redirects off the employer's domain stops.

## 009b-5: the worker pull loop
Files: `workers/career-browser/pull.cjs` (new), `workers/career-browser/README.md`, `tests/career-apply-worker.test.cjs` (new), `scripts/gate.sh`.
- Claims from `career_apply_jobs` with the service key from the VM's environment, runs N drives in parallel (default 3,
  max 6), at most 1 drive per employer host at a time, writes the outcome, the reason and the evidence, and queues the
  person's outcome text in `career_outbox` (key `apply:<job id>`, kind `apply`; extend the key/kind checks in the migration).
- Never submits a row without an `approval_hash` that matches its `payload_hash`.
- Acceptance: against the fixture server and an in-memory queue — N drives in parallel, one per host, a crash mid-drive
  becomes `unknown_outcome` and is not retried, an approval mismatch is refused, the outcome text is queued once.

## 009b-6: the coverage benchmark (our first honest number)
Files: `evals/apply/coverage.cjs` (new), `evals/apply/postings.json` (new: 100 public postings, ~25 per family, with source
URLs), `docs/apply/coverage.md` (generated), `tests/apply-coverage.test.cjs` (new; runs on the saved results only).
- Read-only: for each posting, fetch its public questions (Greenhouse questions API; the saved snapshot for others) and
  compute, for the synthetic profile and for "a profile with the 20 most common facts confirmed", the share of required
  questions `planBatch` can answer, the questions it cannot, ranked by how often they appear, and the time to plan.
- `--check` fails when the report is stale. The report is the input to the next order (which facts to ask once).
- Acceptance: the report exists, every number links to its posting, and nothing was submitted (the script has no submit path).

### 009b-6 redirected, 2026-10-19 (architect)
Codex's `wo/009b-6-coverage` (64bb0325) is honest (NOT_RUN, 0/100 measured), because the sandbox could not fetch the
questions. The architect captured them in CI since: `evals/apply/questions-ci.json` (sample A: the 100 biggest boards'
postings, 99 with required questions) and `evals/apply/questions-ci-b.json` (sample B: 100 more by seed, no employer
shared with A), each with every required question, its options and its source URL (`.github/workflows/question-capture.yml`;
the ask-once measure from them is `docs/apply/ask-once.md` and `ask-once-b.md`). So:
- `coverage.cjs` reads those two files, fetches nothing, and runs `planBatch` (149, the planner that fills the form)
  over each posting's required questions with the synthetic profile and with the 20 most common facts confirmed.
- The report puts `planBatch`'s answered share next to ask-once's classifier share for the same postings, and lists
  every question one answers and the other does not: the filler and the classifier must agree before WO-020 builds on
  either.
- `evals/apply/postings.json` and the saved-snapshot inventory are retired.
- Acceptance: at least 95 postings measured in each sample, every number links to its posting, `--check` fails on a
  stale report, nothing is fetched or submitted.
