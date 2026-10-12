# GOALS: savings goals, tracking only (megadoc M08 "how's my vacation fund"; teardown 2 build-order step 4)

`packages/domain/114-savings-goals.js` (`SavingsGoals`) keeps a goal: a name, a target and, if given, a date, tied to one
of the person's own accounts. That account's balance is the progress.

Setting a goal:
- "set a $3,000 vacation goal by June in High Yield Savings" is restated, tracking only, and nothing is moved.
- With no account given, the reply asks which account holds it. "My vacation fund is in Ally Savings" ties it later.
- Setting it again replaces it and keeps its date and account.
- "Stop my vacation goal" or "delete all my goals" removes it.

The progress answer:
- The balance against the target, the percent, what's left, and with a date the amount a month (rounded up, so it
  reaches the target), with the account's as-of.
- Reached or over is said.
- An account that matches none, or several, is asked about, never guessed.
- It says that the balance is the whole account.

Not goals: index, retirement and other investment funds. Limits: up to 5 goals, targets up to $10,000,000.00. Saving
automatically (M01) stays not built, and its answer offers a goal instead. Stored as a watch of kind `savings_goal`
(no migration).

Where it runs:
- `parseCommand` in `supabase/functions/_shared/proactive.ts` (set, tie, stop).
- `agent-chat/_shared/goal_answer.ts` (progress), before the not-built answers, only for a person with a goal. With none,
  the not-yet answer says how to set one.
- Tested in `tests/edge/goal-answer.test.ts`.

Check: `node --test tests/depth-GOALS.test.cjs && node evals/depth/run.cjs GOALS`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Tracking only said | the set reply says nothing is moved | `S01` in tests/depth-GOALS.test.cjs | the tracking-only line is dropped | proven |
| S02 | 3k is $3,000 | 5k for a house is $5,000.00 | `S02` in tests/depth-GOALS.test.cjs | k is ignored | proven (also fails S10) |
| S03 | No account is asked | the reply asks which account | `S03` in tests/depth-GOALS.test.cjs | no account is filled with the first word after 'for' | proven (also fails S05, S13) |
| S04 | A bad date is refused | feb 30 is refused | `S04` in tests/depth-GOALS.test.cjs | a bad date is saved as no date | proven |
| S05 | A date is never an account | in 6 months is not an account | `S05` in tests/depth-GOALS.test.cjs | the date guard is dropped | proven |
| S06 | Tie only an existing goal | my boat fund is not this | `S06` in tests/depth-GOALS.test.cjs | a tie for a missing goal makes one up | proven |
| S07 | Again keeps the date | 4000 vacation keeps Jun 30 | `S07` in tests/depth-GOALS.test.cjs | a reset drops the old date | proven |
| S08 | Stop all is all | delete all my goals clears them | `S08` in tests/depth-GOALS.test.cjs | 'all my' is read as a goal's name | proven |
| S09 | The as-of | as of 2026-10-12 | `S09` in tests/depth-GOALS.test.cjs | the as-of is dropped | proven (also fails S11) |
| S10 | Rounded up a month | $333.34 a month | `S10` in tests/depth-GOALS.test.cjs | the monthly amount rounds down, so it falls short | proven |
| S11 | Over is said | $500.00 over | `S11` in tests/depth-GOALS.test.cjs | reached hides the overage | proven |
| S12 | Several matches are asked | savings matches two accounts | `S12` in tests/depth-GOALS.test.cjs | the first match is used | proven |
| S13 | Not tied: the names offered | the person's account names are listed | `S13` in tests/depth-GOALS.test.cjs | the account names are dropped | proven |
| S14 | An index fund is not a goal | how's my index fund is not a status ask | `S14` in tests/depth-GOALS.test.cjs | the investment guard is dropped | proven |
| S15 | At most 5 | a sixth goal is refused | `S15` in tests/depth-GOALS.test.cjs | there is no limit | proven |
<!-- results:end -->
