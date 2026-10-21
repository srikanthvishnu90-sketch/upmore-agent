# Held work (WO-061, 2026-10-21): not on the branch, kept for the next session

- h027-empty-reply.patch: SUPERSEDED: the H027 fix was re-measured and KEPT (3a90aaf0). Original note: the empty-reply fix (H027; root cause in ../ROOT-CAUSES.md, "H027"). Never measured
  (the eval spend stopped first). Gate: WO-061/H027 in tests/architect/wo-002-agent-loop.test.ts (in the patch);
  fails without the fix. Apply with `git apply evals/career/held/h027-empty-reply.patch` on the baseline, measure as
  its own round. Note: it pushes its "answer was empty" note as a user-role message; since the kept self-review
  round, code's notes belong in the retry's system prompt (`review` in loop.ts): adapt before measuring.
- Measured candidates, held by the second judge, reachable from ci/brain-eval (side commits):
  - f254f7a0 H004 v1 (run 39557753503): H004 fixed, H003 broken; three-way 78.1 / clean-30 76.7. HOLD.
  - 43e28f26 H004 v2 (run 39558487629): three-way 83.3 / clean-30 84.5 (p3 later rescored by the second judge to
    31/38 combined: ties the baseline on clean-30, -0.9 on full-38). HOLD.
  - 1fcbaccf shared root cause, in-thread precedence (run 39560112467): targets H002/H003/H004/H005/H037 15/15 on
    both CI judges; three-way 79.8 / clean-30 80.0 (second judge) or 81.1 (builder's recount from the verdict files).
    REVERTED.

- 7ec6edb8: H027 empty-answer retry (run 39583493501). REVERTED (second judge's ruling); diff kept in this note's
  history only. Not resurrected without a fresh measured run against a same-night control.
- 7fea2d65: H002 repeated-refusal stop (3-pass run 39586807128; 5-pass run 39598175332 on e41d1723 + H006: no repeated
  refusals, clean-30 25.4 vs control 25.6). Never ruled; not on the branch. Re-measure on the kept stack.
- 86ddd57e: H031 v2. KEPT (second judge's ruling, run 39584579483); on wo/agent-slice.

## Closing state, 2026-10-21 (second session of the night): off-branch candidates
All are side commits reachable from ci/brain-eval (or the worktree history), each with its own gate test.
- 47bb72a4 emphasis capitals ("OR", "AND" ...) are never read as a skill acronym, so never bracketed as "[your skill]"
  (second judge's H036 defect). Gate: wo-061-emphasis-caps.test.ts. Built after the last eval; never measured.
- c1dc40da stray confirm question (a confirm question with no draft saved this turn goes to review, then is stripped).
  3-pass run 39589683291: stray questions 27 -> 0, H002 3/3; REVERTED by the second judge on score; may be re-ruled on a
  5-pass rerun against the kept stack. Directly targets tomorrow's gap (1): bare "Is that right?" replies.
- 59703fff H009 step word (the person's "onsite" kept on the row and returned). 3-pass run 39592260931 (H009 3/3);
  never 5-pass measured; the stage-label keep made H009 5/5 without it.
- b9962337 H004 prompt (a day told in the chat is known). 5-pass run 39603731114: no gain; superseded by the kept code
  fix. Do not use.
- 2a914d15 harness tracker parity: superseded by a258fc0f (applied).
