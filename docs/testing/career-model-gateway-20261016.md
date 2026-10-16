# Career coaching gateway: isolated, default-off review

Historical author report at `f3a9d183`. The [independent boundary review](model-gateway-independent-review-20261016.md) subsequently reproduced seven ungrounded-output failures and four global uncertainty-stop failures despite the original tests passing. This review branch repairs those boundaries; the original counts below remain historical evidence, not an independent safety verdict.

Review branch: `codex/career-model-gateway-20261016`, based on combined privacy/research/conversation `e66e39cf9e30044341773298c9896007fc12663c`. Final test source: **`131ec1205542d71d44b449ee91b5570834572bf0`**; product bytes are unchanged from `c2b41b15145d72688987b71365197f1595253550`. [Frozen expectations](../../tests/fixtures/career-model-gateway/freeze.json) were committed first at `bfb1d163`. Muse retains merge, forward-migration and deployment ownership. Shared release remains `f67db048599db308f2691a7be7feada841143da5`.

The root cause was a missing call path: the staged career entry returned deterministic domain replies without reaching the existing model gateway. Credentials alone could not change that. This branch connects a bounded coaching path to that gateway, with server enablement off by default. **Actual model quality is NOT_RUN; no actual provider request or paid call occurred.** This does not establish deep human response quality.

## Implementation and authority

The actual path is `index-career.ts` → [handler-career.ts](../../supabase/functions/agent-chat/handler-career.ts) → existing deterministic host/router/task planning → new [career_model_reply.ts](../../supabase/functions/_shared/career_model_reply.ts) → existing `model_gateway.ts` / `model_calls.ts` → existing atomic career commit. The shared gateway remains plain fetch; no SDK, provider substitution or dependency was added to the product. Its other financial helpers are exported but no financial route or full domain bundle enters the career graph.

Only `CAREER_MODEL_ENABLED=true` opts in. Coaching, interview practice, reflection, support, next-step and unmatched conversation may receive a model reply. Factual recall, corrections, hypothetical handling, drafts, forgetting, pause/erase, research and task execution keep deterministic authority. Model output cannot dispatch tools, create approvals or update facts/profile. Request ownership, account version, revision and privacy epoch are checked around admission and final commit. A concurrent erase can retain the inference charge while rejecting generated delivery. A failed assistant-message insert rolls back the entire conversation save; changing the payload under that failed turn key returns 409 without another inference. An identical committed replay is free and exact.

Context is bounded to current owned canonical reports and current task data, with current corrections and role constraints first. Profile evidence requiring confirmation is excluded; unresolved education blocks a confident graduation fact. A withdrawn location is unknown. Posting text is separately labelled untrusted source data, and raw historical messages/model prose are absent. A saved previous coaching question is a fixed host enum, never model-authored instructions. Only that advisory enum joins the ordinary atomic conversation state.

The model must return a strict coaching schema. Personalized text uses known fact references quoted verbatim by the host and labelled user-reported/unverified. Free advice is restricted to impersonal coaching imperatives; unknown facts, personal assertions, metrics, URLs, tool output, extra authority fields and completion claims are rejected. This conservative interface limits conversational expressiveness. Whether the existing model follows it usefully is unmeasured.

## Shared budget: source proposal only

[career_model_budget_v1.sql](../../supabase/sql/proposals/career_model_budget_v1.sql) is an unapplied proposal, **with no seeded campaign**. Missing, unreconciled, expired, exhausted or model/price-mismatched allowance denies before provider dispatch. The one global original-cap row includes reconciled opening charges plus current reservations/charges, cannot exceed $5, and is shared across owners. It must represent the original campaign, including earlier workers, pilots, judges, retries and uncertain requests; it is not a new $5 authorization. Untracked parallel spending still has to stop or join the same authority.

Admission reserves a conservative input/output/reasoning bound, obtains the existing monthly slot, then consumes a short-lived one-use ticket bound to owner, context, model and price. No provider fetch holds a database transaction. Known integer usage reconciles once; invalid or uncertain receipts retain the full reservation. Three unknown outcomes halt new campaign spending. Unsent reservations refund safely. Tables and RPCs are service-only, RLS protected and security-invoker. Reservations store hashes/usage, not prompts or model prose.

The gateway's legacy conversion could silently coerce missing, negative or string usage into apparently usable numbers. Four retained probes reproduced that defect. A new **opt-in** `requireUsageReceipt` rejects invalid raw OpenAI receipts before conversion for this caller; other gateway callers retain their defaults. A provider/error/settlement failure produces a truthful deterministic fallback, without saying that user-supplied facts were unchanged. No automatic inference retry occurs.

## Executed evidence

[Machine-readable results](runs/career-model-gateway-20261016/results.json), [evidence manifest](runs/career-model-gateway-20261016/evidence-manifest.json), source hashes, request/response transcripts, synthetic provider-context/budget traces, local database dumps and raw logs are retained. Regression metadata source hashes were checked against final product bytes. Runtime files have been byte-identical since `52911f3f`; later changes add evidence recording and bind the SQL admission ticket to its approved price.

| Check | Result |
| --- | --- |
| New model contracts through actual staged entry, injected provider/database | **32/32** |
| New native PostgreSQL budget/entry cases, injected provider | **15/15** |
| Owner privacy source + native SQL cases, unchanged owner oracles | **10/10 + 7/7** |
| Combined privacy/research interleaving | **2/2** |
| Persistence + task-authority SQL | **30/30 + 21/21** |
| Independent research source + SQL | **12/12 + 17/17** |
| Original author research source + SQL | **12/12 + 7/7** |
| Existing scoped routing/conversation/worker/application/staging regressions | **250/250** |
| Total targeted cases | **415/415** |
| Original frozen conversation suite | **543/543 checks, 83 turns** |
| Frozen held-out conversations | **426/426 checks, 82 turns** |
| Full inherited R2A/R3 gauntlet | **26/27; same C37 failure** |
| TypeScript 5.9.3 shared adapter and transitive shared imports | **PASS** |
| Both generated bundle freshness checks | **PASS**, domain bundles unchanged |
| Actual career staging | **14 files, 3,943,906 raw bytes**, below unchanged 4,200,000 ceiling |

New PostgreSQL cases exercise real local SQL functions, global concurrent reservations across owners, absent/unreconciled balance, owner/epoch/version/revision/price mismatch, STOP, ticket expiry, unknown-usage stop, role denial, exact settlement, real staged replies/replay, SQL rollback and concurrent erase. Authentication and the existing monthly reserve/record RPCs are injected in the new entry fixture; these are not hosted authentication or full monthly-schema integration claims. The original conversation suites keep provider access disabled. Local successes do not measure real model quality.

Reproduce the new suites with an already-running, disposable network-none fixture prepared by the existing conversation-recovery setup:

```sh
node scripts/career/model-gateway/run.cjs <new-label> contracts
node scripts/career/model-gateway/run.cjs <different-new-label> postgres
```

Each run refuses an existing evidence directory and creates its own local test database. Synthetic funding exists only in test code. No real credentials are read by the staged fixtures; provider requests are intercepted before HTTP. [Recorded contracts](runs/career-model-gateway-20261016/final-context-contracts/metadata.json) and [recorded PostgreSQL](runs/career-model-gateway-20261016/recorded-postgres/metadata.json) identify exact commands, hashes and limitations.

All failed runs remain retained. The first new contract run was **17/24**, because the fixture lacked the legacy router's ordinary empty `_careerTrackStore` initialization; its original helper and output remain archived, and strict profile-equality assertions were preserved. The four raw-usage probes were **0/4 before the strict receipt fix**, then pass in the final 32-case run. C37 remains red: actual `142-career-router.handleChat`, expected `141-career-doorstep.handleChat`, matching the base branch. The owned loopback wire and disposable network-none PostgreSQL fixture were removed after dumps were captured. No old oracle was weakened. Module 130 remains byte-for-byte identical to the privacy owner's `382b6e37` file.

## Outstanding execution gates

**Actual provider/model evaluation — NOT_RUN, blocked on prerequisites, not denied by a tool.** The original shared $5 balance is unknown, its old ledger is absent here, provider/test endpoint authorization is unavailable, and no real campaign was created. Muse must review/apply a forward migration, recover and reconcile the original non-secret charges/reservations, ensure all paying workers share the authority, verify the approved existing model/price/account access, and expose supported authorization before enablement. None of those production/credential/budget actions was attempted. Native Deno and Supabase CLI are absent; native Deno edge checks are NOT_RUN. The TypeScript check covers shared modules, not the deployed runtime.

**15 genuine browser outcomes — all NOT_RUN.** The [15 distinct task manifest](../career/public-research/acceptance-15.json) remains unchanged, with causal chat → committed intent → owned browser/session → source/screenshot → artifact → backend readback requirements. Fixture preflight is separate. The earlier normal-sandbox Chromium launch aborted before navigation because the helper has uid/gid 65534; Playwright's cached browser is absent, and the installed managed runtime is deferred with no callable browser API. A preconfigured, authorized compatible runtime is required. No browser launch, Browserbase use, security change/bypass or external action was attempted during this repair. [Prior sanitized readiness evidence](model-browser-readiness-20261016.md) remains historical; its missing career model path is addressed in review source only, and its budget/runtime blockers remain.

Overall release remains **NOT_READY**: inherited C37, unrun actual-model evaluation, browser outcomes and Muse integration/deployment review remain outstanding. No shared release merge, production mutation, provider call, email, job application, purchase, account creation or credential change occurred.
