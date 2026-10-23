# Paid-workflow disable plan (2026-10-23)

**Owner:** the architect, from the coordinator's request of 2026-10-23.

**Status:** prepared and verified locally only. Nothing here has been pushed to a triggering branch, and no workflow has been disabled, run or dispatched. Every action below is the owner's, or mine on his written yes.

**Why:** a push to a triggering branch runs that branch's own copy of the workflow. The closed-grant ledger fix on `arch/eval-cap-remaining` (a248c291) protects only that copy, not the one already on `eval/router-before-after`.

## 1. What can fire a paid run today
The inventory below comes from a sweep of every remote branch on 2026-10-23. It lists each workflow copy that holds a paid key (`secrets.OPENAI_API_KEY`) and whose own `push:` filter matches the branch it sits on. Trunk's copies don't matter; only these do. All 36 workflows show `state: active` on GitHub.

| Branch copy (commit) | Workflow | What a push touching its paths would do | Gate in the copy |
|---|---|---|---|
| `eval/router-before-after` (dce35d8f) | router-before-after | Up to 4 judge runs. A failed ledger fetch skips DONE and reads spend as $0, so each run gets `--budget-usd 5` | Fail-open (reproduced locally, 4 paid calls) |
| `ci/brain-eval` (bdfb97f2) | brain-eval | 5 parallel agent passes, then the router pass and the re-score, both `if: always()` | Aggregate `EVAL_BUDGET_USD 15.95` against $15.5086 recorded: about $0.44 of headroom, which each parallel pass sees separately |
| `ci/brain320-mini-20261021` (05ae8b93) | brain-reliability-320 | The mini arm again | **Armed:** approvals from 2026-10-21 are baked into the file, and the gate passes (simulated) |
| `ci/brain320-higher-20261021` (d8d1b901) | brain-reliability-320 | The higher arm again, $8 cap | **Armed:** all refs and the first-arm hash are filled. The gate passes. The arm needs run 39666739440's artifact, kept 7 days (to about 2026-10-28) |
| `ci/answer-draft` (bd476498) | answer-draft-eval | Its eval | `EVAL_BUDGET_USD 5` |
| `ci/brain-reliability-one-20261021` (358857cf) | brain-reliability-one | Its eval | `EVAL_BUDGET_USD 1` |
| `ci/brutal-battery` (51e81c7d) | brutal-battery | Its battery | $3 a run in code |
| `ci/trainee-tasks` (4dfe0856) | trainee-tasks | Its eval | `EVAL_BUDGET_USD 15`, aggregate |

`brain-eval-live-meter-controls` runs with `OPENAI_API_KEY: ""` and `--deny-net`, so it is not paid and is left as it is.

`workflow_dispatch` is unreachable today, because GitHub dispatches only workflows present on the default branch, and `main` (77ff1ce5) has none of these.

Approval strings written into a workflow file are not approvals: repo text grants nothing.

## 2. The plan, in order
**Tier 0 (owner): no push, no run, $0, reversible in one click.**
1. In GitHub Actions, open each workflow → "…" → **Disable workflow**: `router-before-after`, `brain-eval`, `brain-reliability-320`, `answer-draft-eval`, `brain-reliability-one`, `brutal-battery`, `trainee-tasks`.
   - A disabled workflow starts on no branch, from no push and no dispatch.
   - I verify the result read-only (`list_workflows` shows `disabled_manually`).
2. On the OpenAI project, set a **hard monthly usage limit**. It is the only stop that doesn't depend on any repository file.

**Tier 1 (owner's yes, after Tier 0): make each branch copy fail-closed in code.**
- Push the prepared copies in `docs/integration/paid-workflow-disable/` to their branches, each as `.github/workflows/<name>.yml`, one commit per branch.
- Each copy is the branch's own file plus a job-level `if: ${{ false }}` on every job holding the key. Nothing else changes.
- With Tier 0 in place the pushes start nothing. Without Tier 0, each push starts one run whose only job is skipped, at $0.

A job-level switch is required. brain-eval's paid router and re-score steps are `if: always()`, so a failing first step does not stop them; the test proves this.

**Tier 2 (before any paid run is approved again):**
- **router-before-after:** use the bounded-cap version on `arch/eval-cap-remaining` (a248c291): fail-closed ledger, a per-run budget equal to what remains authorized, and a proven worst case.
- **brain-eval and the other agent-brain evals:** stay disabled until the agent loop has a per-call and per-step bound. run.ts's bounded mode refuses the agent brain today, because it has no pre-run bound.
- **Every paid workflow:** give it the same three properties before it is re-enabled. Approval goes by owner word in chat, not by a string in the file.

## 3. Local verification (`tests/paid-workflow-disable.test.ts`, 7/7)
- Fixtures are the exact branch copies above.
- `scripts/eval/paid-workflow-disable.ts simulate` runs each workflow's jobs and steps with the runner's `if:` semantics (`always()`, `failure()`, compound conditions, `$GITHUB_ENV`). In the shims, `deno run` of a paid entry point is logged as a paid call and never runs, and git never reaches a remote.
- **Today:** brain-eval reaches 5 agent passes plus the router pass. With a failing first step it still reaches the router pass. The armed mini and higher copies pass their approval gate; trunk's inert copy refuses.
- **Disabled copies:**
  - all 8 are additive-only, and every key-holding job is skipped with no step run;
  - zero paid calls, and the `on:` block is unchanged;
  - the committed copies are exactly the patcher's output;
  - the no-key workflow is left byte-identical.
- **router-before-after's fail-open path:** reproduced separately against a real git origin (`tests/eval-rba-ledger.test.cjs` on `arch/eval-cap-remaining`).

**Limits of the simulation:** it doesn't run GitHub's expression engine or `uses:` actions, and only the conditions these files use are supported. The skip guarantee rests on GitHub's documented rule that a job whose `if` is false runs no steps. The simulation checks that each patched file states that rule correctly.
