# WO-112: run the brutal eval on the live bot; close the status gap

Status: ready after 016 · Depends on: 016 · Size cap: ~150 lines · Assignee: architect, with the owner's key

## Why
The router baseline is 3.1/5 task orientation, 2.6/5 individual context (2026-10-28). The model brain is not measured: this sandbox had no key. D-008's live
switch needs the agent brain measured on the same scenarios, and the owner's bar is 5/5 on both.

## What
1. `deno run -A evals/career/task-context-brutal.ts --brain agent --label agent-<date>` (CAREER_MODEL, one run is 30 scenarios, 43 turns; no judge spend).
2. Against the deployed bot: `--http <agent-chat test endpoint>` (POST `{scenario, turn, thread_id, message}` -> `{reply, state}`; state is the alert
   prefs, `sent_drafts`, `submitted_jobs`; see `worldState`) or record transcripts and `--replay`. Without state, effects and memory checks are unmeasured.
3. Read the 10 worst and the 10 best by hand once; add what the deterministic floor cannot see to the next fixture revision.
4. **Status gap found on the way** (the ask phrasing was fixed in the PR that added this eval): the code-first status read (`career_standing.ts`) lists the apply queue and the
   tracker but not prepared applications waiting for a yes (Figma) or roles asked for and not taken (Airtable), so "what's happening with my applications"
   leaves out two of six (T01). Add `prepared` and `wanted` rows to `StandingRows` and the text.

## Acceptance
`results/task-context-brutal.agent-<date>.json` committed with dimension scores; every dimension below 5 has a root cause with file and line, or a work order.
