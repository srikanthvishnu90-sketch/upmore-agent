# WO-061: the brain does the task; the eval's spend cap

## Why: the first real eval (D-008), run once the key was in CI
The repository secret `OPENAI_API_KEY` reached CI on 2026-10-20. The brain-versus-router eval ran on it for the first time
(run 39454760318, trunk 912be95d, model and judge gpt-5-mini). It made 176 model calls with 0 errors, so **the key is
proven** (VERIFIED-LIVE).

| Run 39454760318 (VERIFIED-LIVE) | Official set (50) | Held-out live phrasings (38) | Cost |
|---|---|---|---|
| Router (deployed today) | **5 / 50 (10%)** | 9 / 38 (24%) | $0.02 (judge only) |
| Agent (WO-002) | **24 / 50 (48%)** | 26 / 38 (68%) | $0.18 |

D-008 is not met under any bar on record:
- D-027 (owner, 2026-10-20) needs 95% and +40 points;
- D-008 as first written (WO-003) needs 80% and +40;
- the gap is 38 points.

The agent stays off.

**Why the agent failed.** About 20 of its 26 official failures were one habit. It echoed the message back ("You said:
... Is that right?") and asked permission instead of doing the task:
- no mock question was asked;
- no draft was written;
- the application the person reported was not recorded.

That habit came from the prompt. It told the brain to play back every fact and ask whether it was right, and to "ask one
short question" when anything was missing. The rest were honesty misses the prompt never ruled out:
- "I can do that" for booking a call with a match that does not exist;
- "I can look it up" for the weather;
- a standing instruction saved for a resume that is not on file.

## What changed
- `_shared/agent/prompt.ts`:
  - **Do the task in this reply.** A question never replaces the work: do the most useful version, say what was assumed,
    and ask at most one question at the end. Stop first only for the person's own choice, or an action that leaves the
    account.
  - **Never echo** the message back.
  - **What the person says can be used at once** to answer, advise, plan and draft. Confirmation is kept for facts used in
    anything sent or submitted for them (D-007 unchanged).
  - **Reported events are recorded** without asking.
  - **Check before claiming** anything exists. Offer only what a tool can do.
  - **Greetings** introduce Trainee. A mock interview asks its first question. Drafts are written now, with
    [brackets] for what is unknown.
- `_shared/agent/style.ts`: the manner says the same thing; the example that ended on "Is that right?" now saves and moves
  on.
- `evals/career/run.ts` and `brain-eval.yml`: **the spend cap.**
  - `--budget-usd` (`EVAL_BUDGET_USD=15` in the workflow) is a total across every run.
  - The spend recorded in `evals/career/results/` counts against it.
  - The run stops before an item that could cross it, keeping a $0.25 reserve.
  - An unpriced model is refused.
  - A stopped run is never read as a score.
  - The verdict prints D-027's bar and the 80% figure beside it, and the running total of all spend.

No eval text entered the brain (WO-003/2 and WO-059/H2 still pass). The held-out set measures whether the rules
generalize.

## Result after the change
Each run is VERIFIED-LIVE in CI (gpt-5-mini brain and judge); every number is a count of items.

| Run | Prompt | Router (official) | Agent (official) | Router (held-out) | Agent (held-out) | Spend |
|---|---|---|---|---|---|---|
| 39454760318 | before | 5/50 (10%) | 24/50 (48%) | 9/38 (24%) | 26/38 (68%) | $0.20 |
| 39456603956 | pass 1 | 7/50 (14%) | 36/50 (72%) | 8/38 (21%) | 29/38 (76%) | $0.23 |
| 39458269838 | pass 2 (+ alert store) | 5/50 (10%) | 36/50 (72%) | 7/38 (18%) | 30/38 (79%) | $0.24 |

**Verdict: D-008 not met under either bar.** The gap is now 62 points (+40 met), but 72% is short of both 95% (D-027) and
80% (first written). The agent stays off.

Prompt work has plateaued, so it stops here. Further passes would tune to this set: the official set is what was tuned on.
The held-out set moved 68% → 79% and is the honest measure.

What is left:
- **Real misses:**
  - offering to book a call with a match that does not exist;
  - accepting "use my research resume" without saying none is on file;
  - recording a "Rejected" application the person never named;
  - advice that asks instead of answering (a counter offer, resume improvements).
- **Judge strictness:**
  - "Trainee, your career agent" not counted as an introduction;
  - "lacks 2–4 example asks";
  - a reply that did ask the next question graded as not asking it.

  One gpt-5-mini judge is too noisy to separate 72% from 80%.

Next:
- Grade with two judges and report their agreement (C2).
- Grow the held-out set to 100 items.
- Fix the real misses in the tools, not the prompt: a tool that says "no such record" makes the honest answer the easy
  one.

## Tests
- `tests/architect/wo-061-eval-budget.test.ts`:
  - what earlier runs spent;
  - the stop before the cap;
  - no budget, no stop;
  - a run already at the cap runs nothing;
  - the workflow carries the cap and the bar.
- WO-023's style tests and WO-002/003/059 still pass.

## Out of scope
- Tool changes.
- The deployed router (WO-060 ports the deployed line).
- Switching the agent on: that is the owner's word at deploy, and only on a D-027 pass.
