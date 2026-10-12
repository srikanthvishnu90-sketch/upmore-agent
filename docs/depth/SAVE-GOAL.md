# SAVE-GOAL: "I want to save 10000 by June" (megadoc M06)

`packages/domain/107-save-goal.js` (`SaveGoal`) does the arithmetic of a savings target from the person's own rows,
read-only: the monthly amount over the calendar months from next month through the target's (a target this month in
weeks), and per week; what the person keeps a month, money in minus money out over the last full calendar months their
rows cover (up to 3; transfers and card payments left out), averaged; at that pace where they'd be by the date, short or
enough (no pace projected when more goes out than comes in); their savings balances said, never assumed to be for this.
The date: a month ("by June", the next one to come, its last day), a month and day, m/d, "the end of the year", "in 6
months"; none said is asked, never assumed. Nothing is moved or set aside, and goals aren't saved (megadoc M01, M08 stay
not built). Saving on a bill ("save on groceries") and vague wishes go on to the find-money answer.

Where it runs: kind "savegoal" in `supabase/functions/agent-chat/_shared/money_answers.ts`; `tests/edge/megadoc-money-asks.test.ts`.
Check: `node --test tests/depth-SAVE-GOAL.test.cjs && node evals/depth/run.cjs SAVE-GOAL`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Monthly over the months | $1,250 a month for 8 months | `S01` in tests/depth-SAVE-GOAL.test.cjs | the months are counted from this month | proven (also fails S05, S08) |
| S02 | A past month is next year's | by june in October is next June | `S02` in tests/depth-SAVE-GOAL.test.cjs | the year is never moved | proven (also fails S01, S03, S06, S07, S08, S09, S10, S11, S12, S15) |
| S03 | In N months | in 6 months is Apr 12 | `S03` in tests/depth-SAVE-GOAL.test.cjs | in N months is N weeks | proven |
| S04 | No date is asked | by when? | `S04` in tests/depth-SAVE-GOAL.test.cjs | no date defaults to a year out | proven |
| S05 | This month in weeks | $250 a week for 2 weeks | `S05` in tests/depth-SAVE-GOAL.test.cjs | a target this month is divided by zero months | proven |
| S06 | Kept a month, averaged | $3,200 in, $2,300 out, $900 kept | `S06` in tests/depth-SAVE-GOAL.test.cjs | only the latest month is used | proven (also fails S08, S09) |
| S07 | Transfers aren't spending | the $500 to savings is not out | `S07` in tests/depth-SAVE-GOAL.test.cjs | transfers count as spending | proven (also fails S06, S08, S09, S11) |
| S08 | At that pace | $7,200 by Jun 30, $2,800 short | `S08` in tests/depth-SAVE-GOAL.test.cjs | the pace is one month's | proven |
| S09 | More out than in | no pace projected | `S09` in tests/depth-SAVE-GOAL.test.cjs | a negative pace is projected | proven |
| S10 | Less than a month: said | no full month | `S10` in tests/depth-SAVE-GOAL.test.cjs | a partial month is averaged | proven (also fails S11) |
| S11 | Only full months | Sep alone from Aug 3 | `S11` in tests/depth-SAVE-GOAL.test.cjs | a partly covered month counts | proven |
| S12 | Savings said, not assumed | $3,000 in savings | `S12` in tests/depth-SAVE-GOAL.test.cjs | checking counts as savings | proven |
| S13 | 10k is $10,000 | k thousands | `S13` in tests/depth-SAVE-GOAL.test.cjs | k is ignored | proven |
| S14 | Not a bill or a wish | save on groceries is not this | `S14` in tests/depth-SAVE-GOAL.test.cjs | the not-this guard is dropped | proven |
| S15 | Math only, sourced | nothing moved; the source line | `S15` in tests/depth-SAVE-GOAL.test.cjs | the source line is dropped | proven |
<!-- results:end -->
