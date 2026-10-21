# Metering hook spec — per-application token + drive metering (2026-10-21)

Purpose: replace the two remaining soft numbers in `cost-per-user-2026-10-21.md` — the essay-draft token ESTIMATE and the lane-measured drive seconds — with per-application MEASURED values, using infrastructure that mostly already exists. **No paid call is needed to build or test this hook** (tests stub the model, as the codebase already does). Nothing in this spec is deployed by the cost lane; it is the patch plan for the owning lanes (brain/handler for §1, worker for §2).

## What already exists (do not rebuild)

- The gateway normalizes provider usage on every call: `supabase/functions/_shared/model_gateway.ts:95–98` (`fromOpenAI` → `{input_tokens, output_tokens, cache_read_input_tokens}`) and prices it: `PRICES` + `costMicros` (model_gateway.ts:104–117).
- Production already reserves and records every chat-path model call: `supabase/functions/_shared/model_calls.ts` — `reserveModelCall` (RPC `agent_model_call_reserve`) before the call, `recordModelUsage` (RPC `agent_model_call_record`) with the provider-reported usage after it — into `public.agent_model_calls` (migration `20261010110000_model_call_budget.sql`).
- The essay path calls the model through exactly one seam: `essay_draft.ts:250`, `await o.deps.model(draftPayload(...))`, inside a loop capped at 2 tries. One injection point = one place to meter.

The gap: `agent_model_calls` rows are keyed by (user, thread, request, step) for chat turns. Nothing records **which application leg** a call served, so essay-draft spend cannot be attributed to an application today. On the worker side, nothing records per-drive seconds in production at all (the bench-50 harness's timers exist only in the harness).

## §1 — Token leg: tag the essay-draft calls (handler/brain lane)

1. **Migration (additive, defaulted — existing callers untouched):** add two nullable columns to `public.agent_model_calls`: `leg text` and `job_ref text`. Extend `agent_model_call_reserve` with `p_leg text default null, p_job_ref text default null`; store them on the reserved row. `agent_model_call_record` needs no change (usage lands on the same row by call id).
2. **Call-site wiring:** the handler that constructs `DraftDeps` for `draftEssay` (the `career_apply_questions.ts:334` path) wraps the gateway's `callModel` so each invocation reserves with `leg = 'essay_draft'`, `job_ref =` the `career_apply_questions` row id (which carries `job_ids` — the application it serves), then records usage from the gateway response exactly as the chat path does. `draftEssay` itself needs **no change** — the seam is the injected function.
3. **Retry accounting falls out for free:** each of the ≤2 tries is its own reserve/record pair, so the measured calls-per-draft distribution replaces the ESTIMATE's flat 1.5.
4. **Read path:** per-application token cost = `SELECT job_ref, count(*), sum(input_tokens), sum(output_tokens) FROM agent_model_calls WHERE leg='essay_draft' GROUP BY job_ref`, priced by the gateway's own `costMicros`. The cost refresh script gains a `--from-meter` input mode reading an export of this query.
5. **Guard tests (fail-first, in the WO test idiom):** a stubbed-model draft produces exactly one reserve+record pair per try with the right leg/job_ref; a policy-refused draft (employer bans AI text) produces zero pairs; a failed model call records the reservation as failed, never as usage.

## §2 — Drive leg: per-drive seconds in the run record (worker lane)

1. The bench-50 harness already demonstrates the instrumentation shape: wrap the board factory, record `{phase, postingKey, method, ms}` per call (`bench-50.cjs` `timedBoardFactory`). Port the same wrapper into `workers/career-browser/batch-executor.cjs` behind the executor's existing seams — no behavior change, timing only.
2. Aggregate per posting per drain into `{posting_key, leg: 'prepare' | 'execute', drive_ms, outcome}` and persist as a `drive_meter` array on the run record the executor already saves via `career_batch_save_run_v1`. No new table, no new RPC; the record is already user-scoped and read back by `career_batch_result_v1`.
3. Non-drive compute needs no new instrumentation: drain wall − Σ drive_ms, per run, is the number the cost model consumes.
4. Guard test: the wiring test world (`tests/career-worker-wiring.test.cjs` idiom) asserts a prepared+approved run carries one `drive_meter` entry per driven posting per leg, and that a cap-deferred posting carries none for the execute leg.

## §3 — What the hook closes

| Cost-model line | Today | After the hook |
|---|---|---|
| Essay tokens per application | ESTIMATE (~$0.0003/draft) | MEASURED per application from `agent_model_calls` |
| Calls per drafted answer | ESTIMATE (1.5 expected, 2 max by code) | MEASURED distribution |
| Drive seconds per application | MEASURED by lane drives (164 s solo, doorstep) | MEASURED continuously, per posting, per leg — including the live submit leg the lane could not run |
| Drives per application | MEASURED (2, by code) | MEASURED count from `drive_meter` legs — verifies session reuse the day it lands |

Until both halves land, the cost doc keeps its labels exactly as they are. The hook changes no behavior, no caps, and no gates — it only makes the existing spend and time attributable.
