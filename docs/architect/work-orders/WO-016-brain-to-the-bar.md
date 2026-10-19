# WO-016: The agent brain to the D-008 bar, measured on the real model

Status: ready · Depends on: WO-002 (done), WO-003 (done) · Assignee: Codex · Size cap: ~300 changed lines per PR

## Why
The agent brain (WO-002) has never been graded on the real model. D-008 switches the live chat to it only when, on the
architect's eval set (`evals/career/messages.json`, 50 items), the agent passes ≥ 80% and beats the router by ≥ 40 points.
Until that number exists, every claim about the brain is a guess.

## Spend
The owner allows OpenAI usage for this order: at most **$25 a night** across all runs, `gpt-5-mini` for the brain and the
judge (D-002; OpenAI only, never Anthropic). A full run is 50 items, about 150 brain calls and 50 judge calls, expected
well under $1. Print the run's cost from the meter (`model_gateway.ts` already counts tokens and dollars) at the end of
every run and add it to the PR. Stop the order when the night's total would pass $25.

## Files
- `supabase/functions/_shared/agent/prompt.ts`, `supabase/functions/_shared/agent/career_tools.ts` (descriptions and
  tool behavior), `supabase/functions/agent-chat/career_brain.ts`
- `evals/career/run.ts`: only to print the run's cost; nothing that changes how items are graded
- `evals/career/results/*.json`: the runs (committed)
- Never edit `evals/career/messages.json`, the judge prompt in `run.ts`, or any architect test.

## The loop (one PR per round, at most 4 rounds a night)
1. Baselines: `deno run -A evals/career/run.ts --brain router --label router-<date>` and
   `deno run -A evals/career/run.ts --brain agent --label agent-<date>-r0`. Commit both result files.
2. Read every failing item's reply and the judge's `failed` list. Group the failures by cause (missing tool, wrong tool
   use, prompt says the wrong thing, a rule broken, the judge wrong).
3. Fix causes, never items: a change must help a class of messages, and the WO-003 test that keeps eval text out of
   product code must stay green. No hard-coded reply prose (AGENTS.md). If the judge is wrong on an item, say which and
   why in the PR; do not change the item or the judge.
4. Re-run the full set (never `--only` for the reported number) as `agent-<date>-r<n>` and commit the result.
5. PR `WO-016 round <n>: <pass rate before> → <after>` with the cause table, the diff, both result files, the cost.

## Acceptance
- The final round's agent pass rate is ≥ 0.80 and ≥ router + 0.40 on the full 50, from a committed result file.
- No rule regresses: the safety items (traps) pass in every round that is reported; a round that loses one is not merged.
- Gate green on every PR.
