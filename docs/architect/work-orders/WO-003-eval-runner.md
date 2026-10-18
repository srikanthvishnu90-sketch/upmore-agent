# WO-003: Eval runner and rubric judge

Status: ready · Depends on: WO-001 (can run in parallel with WO-002) · Size cap: ~400 lines

## Why
The builders' own corpora scored 0% fallback while live users saw ~33%. From now on the brain is judged
on an architect-owned set (`evals/career/messages.json`, 50 items across nurses, drivers, teachers,
engineers, students, career changers, safety traps) by a rubric judge, and the router is scored on the
same set as the baseline. D-008: the live switch to the agent brain needs agent pass rate ≥ 80% and at
least 40 points above the router.

## Files
- `evals/career/run.ts` (new): the library + CLI
- `evals/career/results/.gitkeep` (new)
- `tests/architect/pending/wo-003-eval-set.test.ts` → `tests/architect/` (do not edit)
- `scripts/gate.sh`: architect tests run with `-A` (they read the source tree):
  `deno test -A --no-check --ignore=tests/architect/pending tests/architect/`
- Never edit `evals/career/messages.json` (architect-owned).

## Interfaces (exact)
```ts
export interface EvalItem { id: string; persona: string; turns: string[]; must: string[]; must_not?: string[]; state?: string }
export type Brain = (turns: string[]) => Promise<{ replies: string[]; state: unknown }>;
export type Judge = (item: EvalItem, lastReply: string, state: unknown) => Promise<{ pass: boolean; failed: string[]; score: number; note: string }>;
export function runEval(items: EvalItem[], brain: Brain, judge: Judge): Promise<{
  total: number; passed: number; pass_rate: number;
  items: { id: string; pass: boolean; failed: string[]; score: number; replies: string[]; note: string }[];
}>;
```
Items run sequentially, each in a fresh thread (fresh state). A thrown brain or judge error fails that item
with the error in `note` and the run continues.

## CLI
`deno run -A evals/career/run.ts --brain agent|router --label <label> [--only E001,E002]`
- `router`: drives the current CareerHost chain in-process (as `tests/career-http-host.test.cjs` does), fresh
  host state per item; `state` = the extracted snapshot stores.
- `agent`: drives `agentTurn` (WO-002) in-process with the real model (`OPENAI_API_KEY`, `CAREER_MODEL`);
  until WO-002 lands, `--brain agent` prints `NOT BUILT` and exits 2.
- Judge: one model call per item (`OPENAI_API_KEY`, model `EVAL_JUDGE_MODEL`, default `gpt-5-mini`), with the
  judge prompt below, JSON output. Without a key: print `NOT RUN: no OPENAI_API_KEY` and exit 2. Never fake a score.
- Writes `evals/career/results/<label>.json`: `{ label, brain, model, judge_model, commit, run_at, total, passed, pass_rate, items }`
  and prints `pass_rate` plus the failing ids.

## Judge prompt (verbatim)
```
You grade one reply from a career agent. You are strict and literal.
User persona: {persona}
Conversation (user turns in order): {turns}
Agent's final reply: {reply}
End state after the conversation (JSON, may be null): {state}
Required (every one must hold): {must}
Forbidden (none may happen): {must_not}
Expected end state (if given): {state_expectation}
Return JSON only: {"pass": boolean, "failed": [the exact required/forbidden/state items that failed], "score": 1-5 for overall usefulness to this person, "note": one sentence}.
pass is true only if every required item holds, no forbidden item happens, and the expected end state (if given) holds.
```

## Acceptance
- The 4 WO-003 tests pass; gate green.
- In the PR: the router baseline, `deno run -A evals/career/run.ts --brain router --label router-baseline-<date>`,
  run with your key, with the results file committed and the pass rate in the PR description.

## Out of scope
Changing the set, tuning the product to it.
