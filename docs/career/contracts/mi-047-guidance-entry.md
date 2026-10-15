# CONTRACT — MI-047 / BUG-227: the flagship guidance ask cold-starts to the fallback

**Written:** 2026-10-15, BEFORE the fix. **Done-test source:** MI-047 on the master list.

## Defect statement (mechanism, proven by probes 2026-10-15)

"I want to break into investment banking — where do I start?" as a first message returns
the contained fallback, locally and live (LF-01f). Two hand-maintained phrase lists diverge:
(1) the dispatch gate in 142 (the long alternation before handleIntelGuidance) admits
"how do i get" but not "break into", not "where do i start", and not a bare "path" — so
guidance-shaped asks never reach the guidance handler; (2) guidanceIntentFor's plan_paths
recognizes "how do i get / get into / path" but not "break into" or "where do i start".
Probe evidence: "how do i get into investment banking?" -> the 144 guidance answer;
"what's the path into investment banking?", "how do I break into investment banking?",
"where do I start if I want to work in investment banking?" -> all contained fallback.

## Fix shape (entry routing only — the MI-012 routing-depth rebuild stays Crew B's)

1. The dispatch admits any ask guidanceIntentFor recognizes (the intent matcher becomes
   the single source of guidance shapes at the gate), in addition to the existing gate.
2. guidanceIntentFor's plan_paths gains the entry shapes: break into, where/how do I start.

## Done-test

1. The exact flagship ask, cold, returns 144's guidance answer through the harness
   (and live after the next deploy — the deploy half waits on the owner's tap).
2. The sibling entry phrasings route the same way; previously working shapes still work;
   a non-guidance ask is NOT captured by the widened gate.
3. Fail-first guard stands (tests/career-guidance-entry.test.cjs), pass^3; guidance/intel
   consumer suites green; full sweep no worse than the MI-048 set.
4. Bug law: ledger BUG-227 + register FR-385, both copies byte-identical.

## Results (2026-10-15, Crew A)

- **Fail-first:** 4 entry phrasings red, 2 pins green on the unfixed tree.
- **Fix placement matters (the pass's main lesson):** admitting the intent matcher at the
  intel gate hijacked SC-113 (its text matches plan_paths' quant...path shape; its owner,
  handleWeakProfile, runs later in dispatch) — the first full sweep showed it as a 13th
  failure. The admission moved to the END of dispatchChat, after every named owner; the
  ordering is pinned in the guard. Final guard: **7/7, pass^3** (entry phrasings ×4,
  prior shape, non-guidance boundary, SC-113 owner pin).
- **Full sweep:** 3,872 / 3,838 / 12 — exactly the MI-048 set (SC-113 green again).
  The flagship ask now returns 144's guidance answer through the harness (tier 2);
  the live half of the done-test lands with the next deploy (owner's tap).
- **Paperwork:** ledger BUG-227; register FR-385 in both copies (a drift event on the
  your_files copy — it had reverted to the pre-GC state — was caught by the cmp check
  and repaired by copying the corrected register, per protocol §11; totals 369 rules =
  274 ENFORCED / 94 UNENFORCED / 1 HARD-SHUT).
