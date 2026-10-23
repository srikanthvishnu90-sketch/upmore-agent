# Router before/after eval (2026-10-22): scope, spend ledger, fallback

**Approved:** Vishnu, 21:43 CDT, up to **$5 total** (relayed by the steering agent). This approves the comparison only. It is not a quality waiver, it does not authorize a deploy, and it allows no submissions.

## Scope
- **Set:** the 30 clean held-out items, `evals/career/heldout-live.json` minus `heldout-burned.json` (H019–H026).
- **Configurations compared:** the router code from `cea914fe` (v248) and from `373453f3` (the candidate). Both run under this branch's harness (`run.ts --brain-root`), with the same conversation plumbing and the same two judges (gpt-5-mini and gpt-4.1-mini). An item passes only when both judges pass it.
- **Runs:** 2 per configuration, 4 in total, run in sequence and interleaved: v248-r1, cand-r1, v248-r2, cand-r2.
- **Cost:** router mode makes no brain model calls, so the cost is judge calls only.
- **Prices:** gpt-5-mini $0.25 in / $2.00 out per 1M tokens; gpt-4.1-mini $0.40 in / $1.60 out per 1M tokens (OpenAI model pages, 2026-10-22; they match `model_gateway.ts` PRICES).

## Cap enforcement (`.github/workflows/router-before-after.yml`)
1. Before anything starts, the job restores the result files of every earlier run from `ci/router-before-after`. If that branch carries a `DONE` marker, the job refuses to run again.
2. Before each run, the job sums the cost recorded in every result file. If any file's cost is missing, or it records an unpriced call, the total is UNKNOWN and nothing starts.
3. A run starts only when the total spent plus a $0.60 reserve is at most $5.
4. Each run also gets `--budget-usd 5`. The runner counts the same files and stops before the item that would bring spend plus $0.25 to the cap; a stopped run is not a score.
5. At most 4 runs, executed one after another in a single job.
- **Provider-side cap:** none from us. A hard limit on the OpenAI project is the owner's to set.

## Spend ledger
| When (UTC) | What | Cost | Running total of $5 |
|---|---|---|---|
| 02:49:22–02:51:47 | v248-r1 (cea914fe) 14/30 | $0.012409 | $0.012409 |
| | cand-r1 (373453f3) 16/30 | $0.013032 | $0.025441 |
| | v248-r2 (cea914fe) 15/30 (1 judge error, counted as a fail) | $0.012546 | $0.037987 |
| | cand-r2 (373453f3) 15/30 | $0.012856 | **$0.050843** |

Job run 39891633497 completed 02:51:51 UTC; DONE marker set; no further paid run exists or is queued.

**Cap review (2026-10-23):** each run received `--budget-usd 5`, the full cap rather than the remainder. `run.ts` counts every restored result file as `spent_before` (recorded: 0, 0.0124, 0.0254, 0.0380), so its stop already applied to the aggregate total, and the worst case was bounded at $5. The workflow now passes the remainder explicitly ($5 minus the recorded total) so the guarantee does not depend on that. This change is on `arch/eval-cap-remaining`, not on the triggering branch, so it starts nothing.

## Fallback executor (if the architect's session stops mid-run)
- **The job runs in GitHub Actions, not in this session.** A stopped session does not stop it; the results and `REPORT.txt` land on `ci/router-before-after`.
- **Do not re-push the branch to "retry".** The `DONE` marker refuses a rerun, and the restored files keep the $5 total global across runs.
- **Codex can take over:**
  - read `REPORT.txt` and `evals/career/results/rba-*.json` on `ci/router-before-after`;
  - fill in the ledger above;
  - report the per-configuration scores and the per-run costs.
  - Any new run needs fresh owner approval: the cap is spent once.
- **Manual equivalent, for a human only after a new approval:**
  1. `git worktree add /tmp/v248 cea914fe && git worktree add /tmp/cand 373453f3`
  2. Then for each run: `OPENAI_API_KEY=… EVAL_JUDGE_MODEL=gpt-5-mini EVAL_JUDGE_MODEL_2=gpt-4.1-mini deno run -A evals/career/run.ts --brain router --set heldout --exclude-file evals/career/heldout-burned.json --brain-root /tmp/<v248|cand> --brain-commit <sha> --budget-usd <cap> --label rba-<run>`
