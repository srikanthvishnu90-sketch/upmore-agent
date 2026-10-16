# Fresh-executor conversation recovery — 2026-10-16

The executor was recovered and the requested evaluation was run. The shared release moved during the work; a fourth run uses its newly observed `f67db048` head, while preserving all earlier runs. **The requested deep human conversation experience does not pass this frozen suite on any of the four inspected commits.** This is an evaluation-only review branch based on the worker integration review; no product code, module 130, shared release, migration in production, merge or deployment was changed. Muse retains final integration and deployment.

## Scope and identity

Repository: `https://github.com/srikanthvishnu90-sketch/upmore-agent.git`.

| Inspected target | Exact commit | Frozen checks passed / failed | Conversations with failures | Unmatched replies |
| --- | --- | --- | --- | --- |
| `release/career-v223` | `afc460ec872f61eb2dcdbbca4d34140fb8b345c0` | 399 / 144 | 12 / 12 | 57 / 83 |
| `codex/career-worker-integration-fix-20261015` | `d61cf32fd1903e2bc131f57bff4704f40280cc53` | 412 / 131 | 12 / 12 | 52 / 83 |
| `codex/capability2-review-fixes-20261016` | `49b7872c822cbf26107c3d49727c9f5ed2acbc9f` | 402 / 141 | 12 / 12 | 56 / 83 |
| Newly observed `release/career-v223` | `f67db048599db308f2691a7be7feada841143da5` | 414 / 129 | 12 / 12 | 51 / 83 |

Both review commits descend from the initially inspected release. The shared release moved to `f67db048` during evaluation; that exact new head was fetched, inspected and tested in a fourth detached worktree. No moving branch was overwritten. They were evaluated separately, without merging them. These check totals include transport, no-effect and lexical checks; **they are not percentages of conversational quality or release-readiness scores**. Every branch ran all 83 turns, 543 checks and 12 independent conversations. All four runner exit codes were 1 because the frozen expectations failed, with no fatal runner error. The first failed runs remain intact.

Read `AGENTS.md` and the relevant ownership/rules in `docs/instinct-spec-series/BUILD-STATUS.md` before editing. `/workspace/.agents` is empty; `.agents/skills` and `.agents` trees are absent from all three inspected commits. The cloud Supabase skill was read for the handler review. Node 24.19.0, Python, Docker 28.4.0 and Chromium 154 are available. Deno and a host PostgreSQL CLI are unavailable. PostgreSQL 16 ran only in a disposable Docker container with `--network none` and no published ports. [Executor evidence](runs/conversation-recovery-20261016/executor-health.json) and [source hashes/ancestry](runs/conversation-recovery-20261016/source-identity.json).

## Frozen experiment and actual entry

[12 frozen conversations](../../tests/fixtures/conversation-recovery/frozen-cases.json) contain 83 turns. Expected outcomes were frozen at `2026-10-16T00:45:39.972859+00:00`, before the first execution at `00:47:13Z`. Conversation-spec SHA-256: `c2a7b53320b6f60c4a4f09b69524d1ca5c1ace67866af3d2e0eeb8bc147ac74c`. [Immutable manifest](../../tests/fixtures/conversation-recovery/freeze.json). The manifest's `executionStarted: false` records its state when frozen; run timestamps are in separate metadata, never written back into the freeze.

Execution goes through the repository's **actual deployment staging graph**: `index-career.ts`, staged as `index.ts`, then `handler-career.ts`, `career_host.js`, the generated career bundle, and real local PostgreSQL. The harness injects synthetic authenticated identity, local Supabase transport and a permissive local rate-limit response. Actual handler/module bytes, SQL migrations for each target, snapshot reads/writes and commit RPCs run unchanged. Real SQL triggers inject the save failure. Only minimal local table fixtures are supplied; this does not reproduce the entire production schema, real JWT verification, gateway, rate limiter, real-account data or production RLS coverage. No employer, mail, browser or payment transport is injected.

Every turn retains the input, exact HTTP body/status, handler log, transport operations and arguments, before/after durable state, message rows, assertions, timestamp and request key. C04 destroys and reconstructs the staged ESM realm twice while retaining the real database; its new-thread step creates a new empty owned thread. Independent conversations start in separate realms. There is no cross-user correction-cache experiment or modification; that repair is separately owned.

The career entry makes deterministic replies and contains no model call. Its VM rejects all external fetches and exposes only synthetic environment values. **332 turns completed, zero external network attempts, zero model calls and zero paid calls. Actual model response quality remains NOT_EVALUATED.** Provider-disabled regressions cannot prove it. [Machine summary](runs/conversation-recovery-20261016/summary.json).

## Reviewed failures

These are substantive transcript observations, beyond keyword check failures. No oracle was relaxed after seeing them.

- **C01, human conversation:** “I'm exhausted … talk it through … don't make an application plan yet” receives the unmatched fallback. The daily 20-minute constraint and debugging preference are missed. Asking to understand the person one question at a time triggers an interview template. The final recap says no facts are recorded. [Integration transcript](runs/conversation-recovery-20261016/integration-first/C01.json).
- **C02 and C12, stale facts after a successful correction:** the integration entry saves preferred location Denver in profile/account state, then recommends Cedar Harbor **in Boston**, and recaps Quartz Studio **in Austin**. Storage succeeded; the downstream plan/stated-fact view is stale. This is not a cross-user cache reproduction and no module-130 fix was attempted. [C02](runs/conversation-recovery-20261016/integration-first/C02.json), [C12](runs/conversation-recovery-20261016/integration-first/C12.json).
- **C03, hypothetical versus actual:** hypothetical Rust experience and the roommate's NASA work do not enter the profile, but the request to distinguish actual and hypothetical facts fails. The actual economics statement becomes the malformed fact “reality I am a junior economics.” Profile non-invention alone does not establish a useful answer. [C03](runs/conversation-recovery-20261016/integration-first/C03.json).
- **C04, fresh sessions:** the firm survives an ESM restart, but Portland and the Friday schedule do not. A fresh-thread recap request is routed to a company dossier answer rather than asking about missing conversational history. The broad negative regex passes that turn; human review still finds it unhelpful. [C04](runs/conversation-recovery-20261016/integration-first/C04.json).
- **C05, selective forgetting:** forgetting only the target city falls back, with Boston still in active state; retaining education and the firm is not explained. No successful deletion is claimed by the evaluation. [C05](runs/conversation-recovery-20261016/integration-first/C05.json).
- **C06, truthful resume delivery:** the pasted posting and tailoring request route to an empty discovery list. Follow-ups never produce the requested actual class-project bullet or supporting artifact. No invented leadership is observed, but failure to generate a resume is not a truthfulness success. [C06](runs/conversation-recovery-20261016/integration-first/C06.json).
- **C07, constraints:** remote-only, part-time, paid and no-relocation requirements are not carried into a useful recap. The sponsorship reply starts by asserting historical employer petitions even though no employer/history was supplied, before qualifying the source as missing. The capability-2 branch removes that particular unsupported assertion, but the conversation still fails. [Integration C07](runs/conversation-recovery-20261016/integration-first/C07.json), [capability-2 C07](runs/conversation-recovery-20261016/capability2-first/C07.json).
- **C08, answer-specific coaching:** all seven turns return the unmatched fallback, including the learner's actual CSV delimiter answer and later “500 rows / two hours” evidence. [C08](runs/conversation-recovery-20261016/integration-first/C08.json).
- **C09, interruption and concrete draft:** the offer amount/company/deadline are retained. The requested Monday extension is missed; the emitted “actual email” stops after the greeting and enthusiasm line, without the extension request or complete body. The warmer/shorter follow-up records a tone fact instead of rewriting the draft. [C09](runs/conversation-recovery-20261016/integration-first/C09.json).
- **C10, honest failure:** fabricated NASA experience is refused, but questions about actual browser execution and unavailable integrations fall back. Asking what can be completed “at zero cost” routes to a dossier for a supposed company named “zero.” [C10](runs/conversation-recovery-20261016/integration-first/C10.json).
- **C11, interruptions and continuation:** the two-part career-choice/coaching ask and all six follow-ups fall back. [C11](runs/conversation-recovery-20261016/integration-first/C11.json).

## Newly moved release: frozen rerun

The fourth run at `f67db048599db308f2691a7be7feada841143da5` uses the same immutable oracle, profile and real PostgreSQL setup. It completes all 83 turns with 414 passed / 129 failed checks and 51 unmatched replies. All 12 conversations still have failures. **82 of its 83 reply strings are identical to the integration-review run.** The changed reply is C10 turn 2: it now correctly says current openings are unverified because no fresh matching public observation exists, and asks which source/location to check. This is a useful improvement, not resolution of the mentoring/memory/delivery failures. The other substantive observations above also apply to this exact new release, including stale city, unsupported selective forgetting, seven fallback coaching turns and incomplete extension email. [Fourth-run transcript](runs/conversation-recovery-20261016/release-current-first/transcripts.jsonl).

The new release passes all **19 / 19 existing conversation/host tests**; its narrower tests do not detect the broader frozen failures. Its C12 atomic failure/retry/conflict results match the integration review, with the same stale recap afterward. [Existing test log](runs/conversation-recovery-20261016/current-existing-conversation-tests.log). No model or browser was invoked in either check.

## Storage failure comparison

C12 injects the same PostgreSQL write fault for each target and preserves the original expected 503 response, unchanged snapshot and no newly committed message rows.

- Integration review: HTTP 503, snapshot and message pair roll back; same-key retry succeeds; exact replay creates no new messages; changed message under the same key returns HTTP 409. These are observed local durable protections. The subsequent stale-city recap still fails.
- Release and capability-2 review: HTTP 200 on the save fault, with new durable message rows; repeats add rows, and a changed message under the same key still returns 200. These targets do not contain the integration review's atomic persistence/replay repair. The request itself falls back rather than successfully making the correction; this result should not be described as a falsely successful location save.

All per-turn assertions and SQL traces are retained; final fixture database dumps are also included in each run folder. They contain only the last conversation because the harness resets the synthetic user between conversations; earlier per-turn snapshots/message rows remain in the transcripts.

## Browser outcomes: 0 / 15, NOT_RUN

[15 frozen public, read-only tasks](../../tests/fixtures/conversation-recovery/frozen-browser-tasks.json) cover distinct job boards, official interview guidance, remote-work research and CSV coaching. The [execution record](runs/conversation-recovery-20261016/browser-outcomes.json) records every missing evidence field explicitly. They require the causal chain **Upmore request → backend browser dispatch → owned browser navigation/DOM/screenshot → cited delivered artifact → backend persisted readback** under one task identity. Fixture pages, direct HTTP fetches, static module tests and manually created summaries count as no live browser outcome.

The supported installed Playwright launcher was attempted with `/usr/bin/chromium`, `chromiumSandbox: true`, headless mode and a 15-second timeout. Chromium aborted before any page opened: the SUID helper `/usr/lib/chromium/chrome-sandbox` is owned by `nobody:nogroup`, mode 4755, and Chromium requires root ownership. [Full launch evidence](runs/conversation-recovery-20261016/browser-sandbox.json). No permissions were changed, no sandbox-disabling flags were supplied, and no third-party browser was used. There is no running owned CDP endpoint from this failed launch. The Playwright version's default launch arguments appear verbatim in the evidence; this task did not add security-bypass arguments.

A second independent blocker applies to the 15 tasks: the published owned worker only accepts registered loopback application portals. The actual Edge entry advertises `portal_browser: NOT_WIRED`; it has no supported public read-only research-browser route. Do not bypass its allowlist or label these tasks executed. Completing them requires an approved sandbox-capable owned runtime and a supported Upmore public read-only browser integration supplied through Muse. No applications, email, account creation, purchases or production changes are part of these tasks.

## Existing checks and limitations

- Integration's existing `career-conversation-depth` + `career-http-host` tests: **18 passed, 1 failed**. The host's natural-language unpause chain remains paused; its regression expects “nothing was sent.” This was an existing source test run, with no email transport attached. [Unmodified log](runs/conversation-recovery-20261016/integration-existing-conversation-tests.log).
- Capability-2 independent boundary + staged-followup tests: **68 passed, 0 failed, 1 skipped**. The existing frozen H20 test is explicitly skipped by that suite for its separately owned correction-cache blocker. This task did not implement or re-test that cross-user behavior. [Log](runs/conversation-recovery-20261016/capability2-existing-boundary-tests.log).
- Harness JavaScript syntax checks, evidence consistency/hash checks and `git diff --check` pass. No product code changed; full release gauntlet, agent100, Deno checks and production tests were not run. No release-readiness claim is made.
- Regex assertions can miss semantic failures or reject a valid paraphrase. A question need not have a question mark, and a generic “unknown” can pass a weak negative check while answering the wrong question. Full transcripts and human observations above are the evidence. The suite deliberately retains those limitations instead of converting raw assertion totals into a quality score.

## Reproduction and handoff

Use a fresh, admitted Node 24/Docker environment. Create detached target worktrees at the four exact SHAs above. Run from this review branch:

```sh
node scripts/career/conversation-recovery/setup.cjs
node --experimental-vm-modules scripts/career/conversation-recovery/run.cjs /path/to/release release-first
node --experimental-vm-modules scripts/career/conversation-recovery/run.cjs /path/to/integration integration-first
node --experimental-vm-modules scripts/career/conversation-recovery/run.cjs /path/to/capability2 capability2-first
node --experimental-vm-modules scripts/career/conversation-recovery/run.cjs /path/to/current-release release-current-first
node scripts/career/conversation-recovery/summarize.cjs
```

The setup script pins the PostgreSQL image digest, refuses an existing named container and publishes no ports. The task removed its first fixture container after exporting dumps, then recreated the same isolated fixture for the newly moved release; no shared database was used. The runner refuses an existing output directory or database, and verifies frozen expectation hashes before evaluation. The [overwrite protection check](runs/conversation-recovery-20261016/overwrite-protection.json) confirms an existing failed-run label is rejected before handler/database work, with the retained transcript hash unchanged. Failed runs must remain; use new labels for another run and pass those labels to `summarize.cjs` for a separate experiment. On a checkout containing the retained first runs, use new labels immediately. Cleanup only the task's own fixture container with `docker rm -fv upmore-career-integration-pg-recovery` after retaining any desired dumps.

Muse can integrate this evaluation independently of either product review, then run the unchanged oracle against the chosen combined commit. Product fixes should address conversational intent/state and concrete artifact delivery before treating the 15 browser tasks as ready. The separate module-130 cache repair, actual model quality and the owned-browser runtime/integration remain blockers; nothing in this packet resolves them.
