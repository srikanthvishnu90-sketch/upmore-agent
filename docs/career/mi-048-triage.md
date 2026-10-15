# MI-048 TRIAGE — the 12 pre-existing sweep failures, dispositioned (Crew A, 2026-10-15)

Baseline set (every sweep since bb3b15d): BUG-076, ACCS-007, R1 C11, R2 C38 ×2, R2 C37,
R2 delivery seam, R2A guard, R-A4 ×2, report-currency, module-coverage. Each was re-run
and read against the current tree. **Outcome: 8 FIXED (stale pins / stale generated
artifact, behavior verified correct first), 4 TRIAGED IN WRITING (2 product defects with
owners, 2 stale-pin clusters over verified-correct S0 behavior).** The sweep's
unexplained-failure count is now 0.

## FIXED — the test/artifacts were stale, the behavior was right

1. **ACCS-007** (career-access) — STALE LITERAL. The audit log's shape/sort/secret
   assertions all pass; the final line pinned the old empty-state copy
   ("No login-requiring actions yet.") against the current composed text
   ("No access events have been recorded yet (0 events). …"). Pin now checks the
   honest-empty-state shape. *Fix: test-only.*
2. **R-A4 readable queue** (career-killswitch-ra4) — STALE PHRASE PIN. The reply
   reconciles (2 halted / 1 already out / 1 in flight / 4 total) and sets the pause;
   the pin wanted "1 already sent", the current copy says "1 item had already gone
   out". Pin updated. *Fix: test-only.*
3. **R-A4 unreadable queue** (career-killswitch-ra4) — STALE PHRASE PIN. 141's reply
   carries every contract element (global pause set, queue unreadable, counts
   unverified, exactly one next step); the pinned sentence "no outreach can start or
   continue" was reworded to "blocks every send path this product controls". Pin
   updated. *Fix: test-only.*
4. **R2 C38 leg i ×2 + R2 delivery seam** (career-gauntlet-r2) — STALE TEXT PIN ×3.
   All three pin the old contained-fallback literal; the harness now delivers the
   reworded copy ("Something went wrong on my end — nothing changed on your side.
   Tell me the job, company, or person…"). The containment behavior they prove
   (fallback delivered, failure record written) is intact. ERROR_FALLBACK const
   updated once, with the reason recorded. *Fix: test-only.*
5. **Report-currency + module-coverage** (mutation-report) — STALE GENERATED
   ARTIFACT. docs/depth/MUTATION-COVERAGE.md predates the current tree; regenerated
   with scripts/build-mutation-report.cjs (86/125 modules with planted defects);
   both tests green on the regenerated doc. *Fix: regeneration, committed.*

## TRIAGED — product defects, owners named (NOT stale)

6. **R1 C11** (career-gauntlet-r1) — **DEFECT (product, S2 wrong claim). Owner: Crew B
   (123 tailor engine, in-flight).** GJ-T03's posting states "Go listed as 'a plus, not
   required'" and its ground truth is "suitable_with_tradeoff — sole tradeoff is
   ramp-up in Go". The tailor turn's reply asserts the opposite: "No skill gap: every
   skill the posting names is evidenced on your profile." The artifact carries no gap
   fields at all — the preferred-not-required gap read returns empty and the composer
   speaks a false all-clear. The artifact-side assertions (real PDF, no invented
   skills) all pass; only the spoken gap fails, which is exactly the half the user
   hears. Recommended fix: the gap read must classify preferred-not-required skills
   the profile lacks as named gaps (as the C-variant record expects: "the reply names
   the gap as not added").
7. **BUG-076** (career-a4-carriage-w5) — **DEFECT (contract gap). Owner: Crew B
   (142's starred-watch handler, last touched by the W5 wave) with Crew A on the
   grader side.** The run-grand regex half is fixed and green. The behavioral half:
   SC-063 ("Apply to every new-grad SWE role posted in the last 48 hours at my
   starred companies") routes to handleStarredWatch, whose result carries the watch
   record but NO shortlist element for the discovery A4 branch to validate — while
   its own facts promise the apply-queue behavior. Either the turn must carry the
   shortlist its mode promises, or the A4 branch must read the watch record's shape;
   the contract decision is the product lane's. Test expectation is correct as written.

## TRIAGED — stale pins over verified-correct S0 behavior (kill-switch cluster)

8. **R2 C37** (career-gauntlet-r2) + 9. **R2A guard** (career-gauntlet-r2a) — STALE
   OWNERSHIP + WORDING PINS, behavior verified by direct drives 2026-10-15:
   - C37's phrase now answers through 142's state-change layer, which delegates to
     141's halt machinery: result carries global_pause_set: true,
     counts_verified: false, resultStatus: completed, and 141's exact honest reply
     ("Stopped everything I can reach: the global pause is now set… unverified…").
     Both tests pin handler == "141-career-doorstep.handleChat" and superseded
     bubble literals. With queue state (R2A probe, handler pin relaxed in a
     throwaway copy): halted_count 3 passes, counts reconcile (0 out / 0 in flight /
     3 halted), and the failure moves to the next superseded literal
     ("Nothing was sent" vs the current "Nothing went out from this queue at all").
   - One open question for the contract owner: through the router, the no-queue C37
     turn delivers a SECOND generic bubble ("Tell me what you'd like to do next.")
     after the halt bubble; 141 direct gives exactly one next step (R-A4's pin). The
     lane owning the SC-300 contract should rule whether the router-appended closer
     is acceptable on an S0 halt turn.
   - Recommended repair (owning lane): re-pin both tests to behavior (handler is the
     career chat path; pause set; counts_verified false / halted_count 3; halt
     semantics by clause) instead of chasing literals — the wording will move again.
   *Owner: the r2/SC-300 contract lane (Crew B), evidence supplied here.*

## Standing note

Eight of twelve were the same disease — pins frozen while the reply waves deliberately
reworded the product — which is why MI-048's baseline never moved: nothing was watching
the difference between "the words changed" and "the behavior broke". The two real
defects in the set (R1 C11, BUG-076) were hiding inside that noise. The weekly GC/sweep
review (protocol §11) now owns watching the failing set by name, so a new entry is
triaged the week it appears.
