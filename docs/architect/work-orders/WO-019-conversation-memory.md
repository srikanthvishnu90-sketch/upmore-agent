# WO-019: A conversation that holds together

Status: part A done (architect) · part B ready after WO-016 merges · Depends on: WO-002, WO-003, WO-016 · Size: M

## Why
Good assistants (Instinct, Muse, ChatGPT, Claude) feel competent because each reply fits the whole conversation: "the
second one" means the second thing they listed, "what about Denver" keeps the role, a correction holds, a fact said
twenty messages ago is still known, and nothing they said they would do quietly changes. Trainee today:
- Answers with the scripted router unless `CAREER_BRAIN=agent` is set.
- The agent path sees the last 20 plain-text messages only (`handler-career.ts`): what a tool returned (the job ids
  behind a list) is gone on the next turn; anything older than 10 exchanges is gone entirely; the person's profile is not
  in the prompt, so the model only knows them if it decides to call `get_profile`.
- The eval (`messages.json`) is 45 single messages and 5 two-turn ones, and it grades only the last reply: none of the
  above is measured.

## Part A, the measure (done in this order's PR)
- `evals/career/conversations.json`: 20 conversations, 66 turns, 12 fixture postings (example.test links). Themes:
  reference, ellipsis, correction, no re-asking, long memory (an 11-turn thread whose last turn needs turn 1), topic
  switch and return, two things in one message, a discouraged person, a vague start, contradiction, fit without
  inventing, approvals, facts carried into searches, settings, holding the line, texting shorthand, referring to its own
  words, promises it can't keep, typos, a summary of the thread. Architect-owned; builders never edit it.
- `evals/career/run-conversations.ts`: each conversation through `handleInbound` with search over the fixtures and an
  in-memory alert store; every checked turn graded with the transcript so far (the agent's own replies included), then
  the whole conversation and its end state. Any failed turn, judge error or brain error fails the conversation.
  `deno run -A evals/career/run-conversations.ts --brain agent|router --label <label>`.
- `tests/edge/career-conversations-eval.test.ts` (gated): the set is well formed, the fixtures are what the product's
  search returns, the grading rules hold; two planted runner defects (agent replies dropped from the transcript; a
  conversation passing with a failed turn) each fail it.

## Part B, the build (Codex, after WO-016 merges; tests first)
1. `supabase/functions/_shared/agent/memory.ts` (new): `personBlock(stores, alerts, now)` builds, in code, a short
   "What you know about this person" block: confirmed facts, facts awaiting a yes (marked as such), active alerts, the
   10 most recent applications. Added to the system prompt every turn. Never model-written.
2. Thread references: after a turn whose tools returned postings or applications, store a digest in the assistant
   message's `meta.refs` (numbered: `1. greenhouse:northwind:101 Data Analyst, Northwind Health, Chicago, IL`, at most
   15). History carries the digest after that reply's text, so "the second one" resolves to a job id, not a guess.
3. Window: the last 40 messages; past that, a rolling summary of the older part (one cheap model call when the thread
   passes 40 and every 20 messages after, stored on the thread, labeled as a summary in the prompt).
4. Prompt line (WO-016 owns `prompt.ts` until it merges): a stated preference or constraint (salary floor, place,
   remote, start date, visa) is saved as a profile fact the same way as experience, so it outlives any window.
5. Files: `memory.ts` (new), `agent-chat/career_brain.ts`, `agent-chat/handler-career.ts` (history select and meta),
   `_shared/agent/prompt.ts`; tests `tests/edge/career-memory.test.ts` (person block contents and order; refs digest
   round-trip; window and summary boundaries; a fact never appears confirmed before its yes).

## Acceptance
- `run-conversations.ts --brain agent`: at least 17 of 20, including C01, C05, C10, C12 and C15. The router's score on
  the same set recorded next to it.
- `run.ts --brain agent` on `messages.json`: no regression from WO-016's result.
- Cost printed per run; OpenAI `gpt-5-mini` only, within the night's cap.
- Then, with the owner: the agent becomes the default brain (D-008) only when both bars hold on the same commit.
