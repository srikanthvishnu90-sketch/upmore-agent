# GOAL FRAME — the spine: a stated goal is recorded verbatim, and recalls verbatim in any thread

On the live bot (battery v247, scenarios 4–5), "My career goal is a data analyst internship for summer 2027." was routed to discovery and answered with a wrong-zero list verdict — the goal was never acknowledged or stored — and "what's my career goal?" one turn later hit the generic fallback. After this change, the declaration is answered from the record surface quoting the user's clause verbatim ("Recorded — your career goal is on your record now: a data analyst internship for summer 2027."), the goal is committed to the account record, and the same question in a brand-new thread answers with the recorded goal verbatim. Genuine discovery asks and all seven of module 130's profile-field recalls are byte-identical to base.

## Root cause (pinned before the fix)

No capture frame and no dispatch claim existed for a first-person goal declaration: `captureStatedFacts` (142) had no goal frame, nothing in `dispatchChat` claimed the turn, and the recommendations block stood it down — so the turn fell through every owner to the discovery tail at 142:9450, whose `\binternships?\b[^.]*\b(help|next summer|summer)\b` alternation read the declaration's "internship … summer" words as a search ask (intent `career_internship_discovery`, F-006's wrong zero as the reply). With nothing recorded, the recall had no record to read and fell to `career_fallback`.

## What changed (packages/domain/142-career-router.js only, plus regenerated bundles)

- **(a) Capture frame** in `captureStatedFacts`' keyed block, beside the recruiter_contact frame: `my (career) goal is …` records the goal clause **verbatim** as a keyed stated fact — kind `"goal"`, key `"career"`, via the same `recordKeyedFact` carriage. `"goal"` is not in the host validator's `STATED_FACT_SQL_KINDS`, so the committed account record carries it on `stated_facts.keyed` with `stated_facts.facts` unchanged, and the host's seed folds it back into every later thread's working set (cross-thread). One slot: a later goal statement replaces the earlier under the same kind+key. Assertion-gated like every frame (a conditional or a question records nothing — BUG-169 discipline).
- **(b) Declaration claim**: new `handleGoalFrame`, called beside the existing early-recall claim (`handleConversationRecall` early), ahead of the recommendations block, the pending-mock capture and the discovery tail — the discovery tail never sees a declaration. It answers with the record surface mirroring `profile_correction`'s "Recorded" reply, quoting the recorded clause verbatim.
- **(c) Recall resolution** in the same claim: `what's/what is my (career) goal` resolves against the recorded kind-`"goal"` fact and answers quoting it verbatim; with no goal on record it stands down (fall-through unchanged).
- `factLine` gains the `goal` entry so record read-backs speak the goal properly.
- No changes to 122, 129, 130, the host, or the validator; no new store; the discovery tail's alternation is untouched. Shape-based frames only — no fixture literals, no test-user ids; any user's goal text records and recalls verbatim.

## Guards (fail-first, permanent)

- `tests/career-goal-frame.test.cjs` (new) — the battery's exact texts through the real career host with the production-semantics account store: scenario 4 asserts intent `career_goal_record` (not `career_internship_discovery`), the verbatim clause in the reply, and the committed account record (`stated_facts.keyed` = the one goal fact, `stated_facts.facts` deep-equal to before); scenario 5 runs the recall in a **second fresh thread** and asserts `career_goal_recall` (not `career_fallback`) quoting the clause. Plus stand-down invariants (no-goal recall, conditional records nothing), verbatim `my goal is to …` + single-slot replacement, and discovery precedence.
- `evals/gauntlet/replays/live-failures.json` — the two live failures recorded as fixtures `B247-04` / `B247-05` with triage `fixed` naming the guard as `test_ref` (the live-failure-is-a-test rule).

## Measured verification (base `c9fc28f9` vs this branch; same invocations, same machine)

| Check | Base c9fc28f9 | This branch |
|---|---|---|
| Guard: `node --test tests/career-goal-frame.test.cjs` | 3 pass / **3 fail** — scenario 4 fails on intent `career_internship_discovery`, scenario 5 on `career_fallback` (the battery's observed outputs, reproduced exactly) | **6 pass / 0 fail** |
| Node sweep: `UPMORE_CHROMIUM_SANDBOX=off node --test tests/*.cjs` | 4,531 tests · 4,482 pass · **8 fail** · 41 skip | 4,537 tests · 4,488 pass · **8 fail** · 41 skip — failing-name set **byte-identical** to base; delta exactly **+6 tests / +6 pass = the new guard file**; zero existing outcomes changed |
| Edge suite: `deno test -A --no-check tests/edge/` | 765 passed / 0 failed | **767 passed / 0 failed** — delta exactly the 2 new replay fixtures (B247-04, B247-05) |
| Bundles: `python3 scripts/build-router-core.py` (both modes) + `--check` | — | regenerated; both `--check` modes verified; `career_goal_record` present in both bundles |
| Precedence spot-check (staged shipped bundle, base vs fix, byte-diff) | — | **9/9 turns identical**: 130's seven profile-field recalls (graduation date → "Your graduation date is 2028.", work authorization, target companies, roles read-back, location, pay floor, GPA) and both discovery asks ("find data analyst internships in Chicago" → internship-discovery surface; "show me software engineering internships" → unchanged stand-down) |

The 8 sweep failures are the v246 line's known pre-classified baseline set (the F-007 answer-map pair, the C37 pair, the v242-live-gaps trio, extension-sync in sweep context) — untouched by this branch, exactly as on the F-011/F-014 rounds.

## Notes

- Not deployed. Live re-proof (the battery scenarios 4–5 sequence on the live bot) is owed after a deploy carrying this commit, per the fixtures' triage notes.
