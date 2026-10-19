# WO-023: Trainee knows what is needed, remembers what matters, and is measured against other agents

Status: part A built (architect) · part B building (architect) · Depends on: WO-019 part A, WO-021, WO-022 ·
Takes over WO-019 part B from Codex (owner, 2026-10-19: "it requires proper chat awareness, so trainee knowing what is
needed, and having the memory to constantly remember fundamental issues"; "test it against other agents, like instinct,
claude, dots... the grammar, how structural is it at actually being able to listen, comprehend and create/adjust new
tasks").

## What is true today (VERIFIED, 2026-10-19, trunk 3818cd1e)
- **The default brain cannot hold a conversation.** Unless `CAREER_BRAIN=agent` is set, the scripted router answers.
  - Run on the 26 conversations of `evals/career/conversations.json`, 68 of its 92 replies are "I didn't catch that"
    (`deno run -A evals/career/compare.ts --lint trainee-router`: non_answer 68).
  - It set 0 alerts in the 5 conversations that ask for one.
  - It gets `postings: []`, so it finds no job at all.
  - "I'm a data analyst with 2 years of SQL and Tableau, based in Chicago" was recorded as "targeting Chicago" only.
  - Muse must test with `trainee-go-live.sh --brain agent`; the router is not the product.
- **The model brain knows nothing about the person unless it calls a tool.** Its system prompt is a fixed string plus
  today's date (`_shared/agent/prompt.ts`).
  - It sees the last 20 messages and has no summary of anything older.
  - Profile facts live in the thread's snapshot, not on the account.
  - The account's stated facts are read by the router only.
- **It cannot see the application pipeline.** No tool reads any of these:
  - `career_apply_prepared`, `career_apply_cards` or `career_apply_jobs`;
  - the questions that stopped a preparation, which are printed on the person's computer and stored nowhere.
  - So "what's happening with my applications?" and "what do you need from me?" have no true answer.
- **A fact the person texts never reaches an application.** The engine reads a hand-written facts file
  (`docs/apply/owner-first-trials.md`). No exporter exists, and the shapes differ.

## Part A, the measure (built in this order's first PR)
- **Six conversations added to the set (C21-C26):**
  - building an alert step by step;
  - correcting an alert;
  - a fundamental constraint (visa sponsorship) stated 22 messages before it matters, past the 20-message window;
  - five points in one message;
  - stop, then undo;
  - "apply for me, use whatever" (must hold the line and say what it needs).
- **`evals/career/compare.ts`, head to head.** The same conversations go to each contestant:
  - Trainee's model brain;
  - Trainee's router;
  - a bare model with no tools (the floor);
  - any outside agent, from a transcript a tester records (Instinct, Claude, Dots, ChatGPT).
- **How it grades:** one blind judge (it never sees which agent wrote the replies) grades:
  - the same pass/fail checks, on the replies alone;
  - six 1-5 dimensions: grammar, structure, listening, comprehension, tasks, memory;
  - Trainee's end state (the alerts it actually left) on its own line, since an outside agent has none.
- **Counted in code for every reply:** text hygiene (markdown, over 1,600 characters, talk about being an AI, filler
  openers, more than two questions, non-answers, empty).
- **What counts:** a conversation a transcript skips is "not recorded", never failed. A judge error is a failure. No key
  means NOT RUN.
- **The testers' kit, `evals/career/compare/SCRIPT.md`:** one opening message that gives every agent the same postings
  and the same honesty rule, then every message verbatim. The transcript template is beside it. Each transcript is
  checked with `--check-transcript`.
- **Tests:** `tests/edge/career-compare.test.ts` (in the gate) covers:
  - the judge is blind;
  - each hygiene rule catches its planted fault;
  - a skipped conversation is not a failure, and a judge error is;
  - end state is graded only for Trainee;
  - the kit is in sync with the set.

Run:
```
deno run -A evals/career/compare.ts --contestants trainee-agent,trainee-router,openai-plain,transcript:evals/career/compare/transcripts/claude.json --label <label>
```
It needs `OPENAI_API_KEY` (OpenAI only, owner rule). Results go to `evals/career/results/<label>.compare.{json,md}`.

## Part B, the build (architect; tests first, each measured by part A)
- **B1. What you know about this person, in every turn.**
  - A block built in code (never by the model) goes into the system prompt each turn:
    - confirmed facts, and facts awaiting a yes (marked as such);
    - standing instructions (below);
    - active alerts in exact terms;
    - the application pipeline (below).
  - It has a size budget; when over, the oldest items drop first, and standing instructions never drop.
- **B2. Standing instructions: the fundamental issues.** What the person says must always hold is saved on the account
  (not the thread) and kept until they change it. Examples: "I need visa sponsorship", "never text me before 9",
  "no staffing agencies", "nothing under 80k".
  - It is restated when saved.
  - It is shown in every turn's block.
  - It is listed on "what do you remember about me".
  - One message removes it.
  - The agent never writes one the person did not say (D-007).
- **B3. The pipeline, in plain counts and names:**
  - prepared and waiting for a yes;
  - an open card;
  - queued;
  - finished today, against the daily limit;
  - each application stopped on something only the person can give (an emailed code, a verification, an open
    question), with that thing named.
- **B4. What is needed.**
  - The questions that stopped a preparation are stored with the posting (from `prepare-batch`).
  - The agent asks for them in one text, once.
  - The person's answer is saved as a confirmed fact the next preparation reads (WO-020's answer bank, keyed by meaning
    where the planner understands the question, by the question's own words otherwise).
- **B5. Past the window.**
  - The last 40 messages, then a rolling summary written in code from what the thread did: searches, alerts set,
    corrections, cards answered.
  - Never a model's paraphrase of the person's words.

## Done means
- Part A: the tests above pass in the gate. The kit is in sync.
- Part B, measured by part A with the agent brain:
  - C21-C26 pass, with their end state;
  - C05 and C23 hold their constraint past the window;
  - grammar, structure, listening, comprehension, tasks and memory each average 4 or more;
  - no reply is a non-answer;
  - the scorecard against at least one outside agent's recorded transcript is published under `docs/career/compare/`.
