# Held work (WO-061, 2026-10-21): not on the branch, kept for the next session

- h027-empty-reply.patch: the empty-reply fix (H027; root cause in ../ROOT-CAUSES.md, "H027"). Never measured
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
