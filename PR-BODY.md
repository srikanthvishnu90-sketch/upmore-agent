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

## Round 2 — judge blocker: a stale thread copy overrides the account, and the recall writes it back

The independent judge's verdict on round 1: the requested checks pass, but the guard misses a return-to-an-existing-thread sequence — old thread states goal A, a NEW thread replaces it with goal B, the OLD thread's "what's my career goal?" answers **A** (wrong: the account's current goal is B) and that recall turn **rewrites the account record back to A**, so a fresh thread then recalls A too. Reproduced verbatim on this branch's head before the fix (same four turns through the real host): step 3 replied "Your career goal, in your words: a synthetic data analyst internship." and the committed account record's keyed goal was A again (`updated_at` = the recall turn). Round 1's six tests never return to a thread after another thread has moved the account, so they cannot see it.

### Root cause (pinned before the fix)

Two cached copies of the stated-facts record ride every thread, both frozen at that thread's last turn: the host snapshot's `statedFacts` store (`supabase/functions/_shared/career_host.js`, `statedFacts` in `STATE_KEYS`, restored in `createTurnCtx`) and module 142's thread mirror `trackStore._careerThread.facts` (written by `syncThreadOut`, `packages/domain/142-career-router.js:4436`). Three mechanisms compose the defect:

1. **The host seed lets the stale cache win.** `createTurnCtx` (career_host.js:296-317) merges the account record with the thread's snapshot copy in `mergeStatedFacts` (career_host.js:86). The thread pass gives the THREAD copy precedence per identity: keyed facts via `pushKeyed(f, true)` (career_host.js:112 — "the thread's statement wins per keyed identity"), single-value kinds by direct replacement (career_host.js:113-116). The rationale in the comments (career_host.js:76-83, 296-299) is that the thread's copy is "fresher" — true only when no other thread has committed since. The merge consults no version or timestamp, so with interleaved threads it cannot tell a fresh copy from a stale one, and the stale one wins.
2. **The router reads the poisoned working set.** `handleGoalFrame`'s recall takes the first kind-`"goal"` fact in `ctx.statedFacts` (142-career-router.js:10088) — the stale value the seed installed.
3. **The recall turn writes the stale value back over the account.** `extractSnapshot` (career_host.js:402) compares the working set against the account baseline stashed at seed time (`ctx._accountStatedFacts`, career_host.js:305); the seeded regression differs from the baseline, so the whole working set is written back as the new account record (career_host.js:430-433), and the handler commits snapshot + patch atomically (handler-career.ts:266, 315). A pure read thus regresses the account for every later thread — the judge's step 4.

A second vector of the same disease sits in 142: `syncThreadIn` (142:4400, called at the head of dispatch, 142:8362) unions the thread mirror's facts into the working set by kind+VALUE (142:4408). A keyed fact whose value was replaced has its OLD value re-added as a second fact under the same kind+key whenever the working set lacks that exact value — resurrecting the stale goal even with a correct seed, and from there into the write-back as a duplicate keyed slot.

**Exposure is the carriage, not the goal kind.** Every keyed kind recorded by `recordKeyedFact` (142:9526) — `recruiter_contact`, `hiring_manager`, `interview_day`, `company_preference`, `goal` — rides the same account `keyed` list (`statedFactsRecordForCommit`, career_host.js:155), the same seed merge, and the same mirror union; the single-value kinds (`year`, `geography`, `target_firm`, `level`, `tone`, `school`, `majors`) share the same thread-wins replacement in the same function. The judge's sequence breaks `recruiter_contact` identically (state in T1, restate in T2, ask in T1 → stale answer + clobber); the goal is only where it was caught. The round-2 guard therefore carries a `recruiter_contact` instance of the sequence beside the goal one.

**The rule the code must enforce:** the account record is the only authority for a stated fact's current value. A thread copy (snapshot or mirror) is a cache: it may contribute only identities the account does not hold at all (a fact whose commit was rolled back or shed over the record cap must not be lost), and it may never replace or resurrect a value for an identity the account holds. A thread's own NEW statement still wins — not by seed precedence, but because capture replaces the value in the working set during the turn (`recordKeyedFact` / `recordThreadFact`) and the commit lands it in the account before any other thread seeds.

### The fix (two seams, nothing else)

Why not 142 alone: the seed merge runs inside `createTurnCtx` before the router ever sees the ctx — by dispatch time the working set is already poisoned, and any router-side reconciliation would have to re-derive the account record the host already holds. Why not the handler: it passes both records through untouched; precedence is the merge's own contract. Scope follows the cause:

- **career_host.js — `mergeStatedFacts`:** the thread pass is append-only per identity. Keyed facts join only when their kind+key identity is absent from the merged set; single-value kinds join only when the kind is absent; multi-value kinds keep the kind+value union (they accumulate by design and cannot regress a value). The account pass is unchanged (first entry per identity stands, so even a record already holding a duplicate resolves to its first — current — value). The two stale comments (host :76-83 and :296-299) are corrected to state the account-authoritative rule.
- **142-career-router.js — `syncThreadIn`:** the mirror union is identity-aware. A mirrored fact is skipped when the working set already holds its identity — kind+key for keyed facts, kind for `FACT_SINGLE_KINDS`, kind+value otherwise (unchanged for multi-value kinds). Mirror facts whose identity the working set lacks entirely still join: the shallow-copy-harness reconciliation the mirror exists for is preserved.

Unchanged: in-turn capture and correction, single-slot replacement, assertion gating (BUG-169), the facts/keyed commit split and its validator contract, the change-gated write-back, the discovery tail, 130's recalls. No new store, no version counters — the account's serialization point is the only ordering the system has, and the fix makes reads honor it.

### Measured proof (base `f822417f` vs round-2 fixed tree; same invocations, same machine)

| Check | Base f822417f | Round-2 fixed |
|---|---|---|
| Guard: `node --test tests/career-goal-frame.test.cjs` (extension applied to both) | 6 pass / **2 fail** — both new judge tests fail at the step-3 reply assertion: the goal test got "Your career goal, in your words: a synthetic data analyst internship." (A, not B); the recruiter_contact test got "your recruiter contact at Northwind Ledger is Dana." (the stale contact). The six round-1 tests pass on both trees. | **8 pass / 0 fail** |
| Node sweep: `UPMORE_CHROMIUM_SANDBOX=off node --test tests/*.cjs` (run `--test-concurrency=2` on this 8 GB box; parallel default-concurrency runners were memory-killed mid-stream in this session, the sequential limited run completes) | 4,537 tests · 4,488 pass · **8 fail** · 41 skip | 4,539 tests · 4,490 pass · **8 fail** · 41 skip — delta exactly **+2 tests / +2 pass = the two new guard tests**; failing-name set **byte-identical** to base |
| Edge suite: `deno test -A --no-check tests/edge/` | 767 passed / 0 failed | **767 passed / 0 failed** — delta zero: round 2 adds no replay fixtures (see below) |
| Bundles: `python3 scripts/build-router-core.py` (both modes) + `--check` | — | regenerated; both `--check` modes verified (the 142 change rides both bundles; career_host.js is imported by the handler directly and is not bundled) |
| Precedence spot-check (each tree's own built career bundle + host composed as handler-career.ts composes them, repo Alex Testcase persona, fixed clock, byte-diff) | — | **9/9 turns byte-identical**: 130's seven profile-field recalls (graduation date, work authorization, target companies, roles read-back, location, pay floor, GPA — all `profile_recall`) and both discovery asks ("find data analyst internships in Chicago" → `career_internship_discovery`; "show me software engineering internships" → unchanged stand-down) |

### Live-replay fixtures: not expressible — the .cjs guard carries the sequence

The judge's sequence was NOT recorded as a B247-06 replay fixture, deliberately: the replay idiom (`evals/gauntlet/replays/live-failures.json`, replayed by `tests/edge/live-replays.test.ts`) expresses one text plus a same-thread `context` list, and its career entries are kind `other` — a person-triaged record, not an executable sequence. The defect needs two interleaved threads, a shared account record, and assertions on the committed record after the recall turn; the idiom has no surface for any of the three. The executable guard is the extended `tests/career-goal-frame.test.cjs` above (fail-first verified on the unfixed tree).

### Corrections to the round-1 text above

- Round 1's "What changed (packages/domain/142-career-router.js only…)" and "No changes to … the host" were true of round 1 only. Round 2 additionally changes `supabase/functions/_shared/career_host.js` (`mergeStatedFacts`) and a second 142 region (`syncThreadIn`) — the judge's defect lives in the carriage round 1 relied on, and the note above pins why the seam cannot sit in 142 alone.
- Round 1's claim that the keyed carriage "folds back into every later thread's working set (cross-thread)" needs the round-2 qualifier: it folded back with thread-cache precedence, which is exactly what broke on a return to an older thread. After round 2 the fold-back is account-authoritative per identity.

## Notes (round 2)

- Not deployed. After a deploy carrying this branch, live re-proof is owed: the judge's 4-step sequence on the live bot (two existing threads + a fresh one) beside battery scenarios 4–5.
