# O5 gate kit — re-verify a deploy candidate in minutes

`gate-check.cjs` is the deploy gate for the agent-chat edge function, packaged
so the NEXT candidate head can be re-verified by running one command instead of
repeating the investigation that stopped the 50fea733 deploy on 2026-10-21.

## Run it

```
node tools/o5-gate-kit/gate-check.cjs <commit-sha>
```

Exit 0 = GATE PASS, 1 = GATE FAIL, 2 = the gate itself could not run.
Options: `--repo`, `--runs-dir` (stages land in `~/workspace/gate-kit-runs/`),
`--stage-graph`, `--ref-stage`, `--keep-worktree`.

## What it does

1. Creates a detached worktree of the given commit and builds the deploy stage
   with the standing recipe (`stage-graph.cjs`, entry `agent-chat/index-career.ts`,
   mode `all-js`) — the stage is what would actually be deployed.
2. Runs five checks on the staged `_shared/router_core.career.js` +
   `_shared/career_host.js`:
   - `CORRECTION_STORE` occurrences = 0 and `correctionKey` occurrences = 0
     (the v247 privacy fix: the process-global correction store stays gone).
   - `career_goal_record` >= 1 and `career_goal_recall` >= 1 (the v248
     goal-frame capture/recall intents, PR #151).
   - `mergeStatedFacts` thread pass is append-only (below).
3. Byte-diffs the whole stage (sha256 per file) against the preserved v248
   stage `~/workspace/stage-cea914fe` and prints the delta.
4. Prints a verdict block. Named failures roll up as `GOAL_FRAME_MISSING`,
   `HOST_MERGE_THREAD_WINS`, `PRIVACY_FIX_REGRESSED`.

## How the append-only check detects the threadWins anti-pattern

In both the broken and the fixed host, the helper is defined as
`pushKeyed=(f,threadWins)=>{ ... if(threadWins) out[i]=cloneJson(f) ... }`, so
the presence of `threadWins` — or of `out[i]=` inside the helper body — proves
nothing. The bug is at the call sites in the **thread-facts pass**:

- BROKEN (50fea733): the thread pass calls `pushKeyed(f,true)` — a thread copy
  of a keyed fact replaces the account's — and its `ACCOUNT_SINGLE_FACT_KINDS`
  branch replaces an existing entry by index (`out[i]=cloneJson(f)`).
- FIXED (cea914fe): the thread pass calls `pushKeyed(f,false)`, exactly like
  the account pass, and its single-kind branch only appends a kind the account
  set does not already hold.

The detector slices the `mergeStatedFacts` body out of the staged
`career_host.js` (from `function mergeStatedFacts(` to the following
`const STATED_FACT_SQL_KINDS`), then slices the thread pass (from
`for(const f of Array.isArray(threadFacts)`) and requires all of: zero
`pushKeyed(f,true)` in the whole function; the thread pass contains
`pushKeyed(f,false)`; the thread pass contains no indexed replacement
`/out\[[^\]]+\]\s*=/`. The helper body's own `out[i]=` sits before both passes
in the function text, so it never falls inside the thread-pass slice.

## Provenance

Test runs against the known-good head (cea914fe, live v248) and the known-bad
head (50fea733, the stopped deploy) are recorded verbatim in
`test-runs-2026-10-21.md`: cea914fe PASSES with its rebuilt stage byte-identical
to the preserved v248 stage (12/12 files); 50fea733 FAILS with exactly
`GOAL_FRAME_MISSING` + `HOST_MERGE_THREAD_WINS`.
