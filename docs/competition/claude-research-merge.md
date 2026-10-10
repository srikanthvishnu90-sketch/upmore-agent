# Claude research handoff merge

The local handoff was inspected and merged on October 10, 2026. No external API or browser was exercised during the merge. The fixed handoff contains 720 feature rows and 325 source rows across the ten baseline apps. Despite the handoff labeling every row atomic, 61 rows have no seed parent and are retained as additional discoveries; 659 are atomic seed children.

The preexisting catalog's 288 rows, including all 241 baseline seeds and their proof references, were preserved. The merged catalog has 1,008 rows: 241 seeds, 699 atomic records, and 68 additional discoveries. It retains 365 source records. Duplicate-looking outcomes remain visible rather than silently declaring equivalence or removing requirements. The full outcome denominator is now 309; this is an inventory denominator, not a claim that every discovery is distinct or operational.

Imported feature status is DISCOVERED and competitor presence is UNVERIFIED. Claimed passages, original presence labels, dates, researcher confidence, input file paths, and canonical row hashes are retained. Source `observed_at` is null; claimed observations remain in `claimed_observed_at`. Claimed passages remain in `claimed_source_passages`, not the observed-passage field. Thus the merge itself adds no observed-research, software, provider, launch, or live proof. Precise URL/claim restrictions require independent follow-up before promotion.

Twenty-eight rows lack direct source references. They inherit their seed/cohort's explicit source IDs as design lineage, with a visible gap; this is not factual support for the claimed feature. One character-array variants field, CH-001-A, was repaired to the original string. IDs do not collide in this handoff, so source/feature reference maps are identity mappings; a later conflicting ID is rejected instead of overwriting existing proof or inventing an alias.

Reproduce the validated merge with `python3 scripts/merge-claude-research.py`. It uses only the fixed local handoff manifest, rejects unsafe file references/symlinks, duplicate or conflicting IDs, missing source/passages, foreign seed parents, unsafe source URLs, changed claimed-note hashes, and research rows carrying implementation/evidence paths. Inputs are validated before any catalog write. Repeat imports are idempotent; the machine-readable report records added rows for the current invocation, canonical output hashes, ID mappings, repairs, and lineage-only rows.

Checks actually run:

- `python3 tests/merge-claude-research.test.py`: 10 passed, including complete actual-handoff replay, collision preservation, missing references, foreign parents, unsafe paths, false promotion, and note integrity.
- `python3 scripts/parity-check --write`: no validation errors; regenerated matrix and readiness page. All software/provider/launch/live completed-outcome counts remain zero.
- `git diff --check`: passed.

The import is inventory expansion, not 100% parity. Provider eligibility, fee schedules, authenticated behavior, source contradictions, complete software contracts, and independent proof remain open. Public research content supplies claims to verify and cannot authorize money movement or account access.
