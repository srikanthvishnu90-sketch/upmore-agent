# Gauntlet Routing Baseline — PRE-REBUILD (Gate 2 comparison baseline)

**This is the PRE-REBUILD baseline.** It measures the CURRENT build (before Codex's Gate 2 router rebuild) with the routing grader that Gate 2 will be judged by. Gate 2 is judged by re-running the identical command on the rebuilt router and comparing against these numbers.

- Build: `81d512b` (branch tip at baseline generation)
- Grader: `scripts/career/gauntlet/run-routing-grade.cjs` (expectations v1)
- Expectations: `scripts/career/gauntlet/routing-expectations.json` — canonical routing set for all 300 scenarios, derived mechanically from the run-1 handler map (scenario runners' s.tool tokens; family default where a runner names no module; R-C7 overrides for SC-105/SC-179). Regenerate: `--write-expectations`; drift-check: `--check-expectations`.
- Reproduce these numbers: `node scripts/career/gauntlet/run-routing-grade.cjs --persona P1 --out-json <path>` — deterministic (no LLM, seeded paraphrases, no wall-clock fields); the same command on the same build returns the same numbers.
- Evidence class: E2 staging chat path (pilot-lib chain 143 -> 120 -> 130 -> 142 -> 141, replies composed by 140), persona P1 (gauntlet fixture p1-early-career-swe — the only profile the staging host injects). P2 is pluggable in the runner and NOT yet wired (spec-P2 fixture has not landed).
- Capability-absent list status: DRAFT (SC-105, SC-179) — owner approval pending, per 05 Gate 2.

## Baseline numbers (Gate 2 targets in brackets)

- **Canonical correct-tool: 5/300 = 1.7%** [Gate 2: >=97% on P1 and P2]
- **Paraphrase routing consistency: 301/316 = 95.3%** over a stratified sample of 79 scenarios x 4 classes (04 Part 6a) [Gate 2: >=95%]
  - Non-degenerate slice (canonical ask did NOT land on fallback/none): 24/32 consistent — the headline consistency number is inflated whenever both canonical and variant land on the same fallback, so this slice is reported alongside it, always.
  - Variant correct-tool (variant routed to the EXPECTED tool): 6/316.
- **Zero-counter 1 — "I didn't catch that"-class replies: 267** [Gate 2: 0] — scenarios: SC-004, SC-005, SC-006, SC-007, SC-008, SC-009, SC-010, SC-011, SC-015, SC-018, SC-020, SC-025, SC-028, SC-031, SC-033, SC-034, SC-035, SC-036, SC-037, SC-038, SC-039, SC-040, SC-041, SC-042, SC-043, SC-044, SC-045, SC-046, SC-047, SC-048, SC-049, SC-050, SC-053, SC-056, SC-058, SC-060, SC-061, SC-063, SC-064, SC-066, SC-067, SC-068, SC-069, SC-070, SC-071, SC-072, SC-073, SC-074, SC-075, SC-076, SC-077, SC-078, SC-080, SC-081, SC-082, SC-083, SC-084, SC-085, SC-086, SC-087, SC-088, SC-089, SC-090, SC-091, SC-092, SC-093, SC-094, SC-095, SC-096, SC-097, SC-098, SC-099, SC-100, SC-101, SC-102, SC-103, SC-104, SC-105, SC-106, SC-107, SC-108, SC-109, SC-110, SC-112, SC-113, SC-114, SC-115, SC-116, SC-117, SC-118, SC-119, SC-120, SC-121, SC-122, SC-123, SC-124, SC-125, SC-126, SC-127, SC-128, SC-129, SC-130, SC-131, SC-132, SC-133, SC-134, SC-135, SC-136, SC-137, SC-138, SC-139, SC-140, SC-141, SC-142, SC-143, SC-144, SC-145, SC-146, SC-147, SC-148, SC-149, SC-150, SC-151, SC-152, SC-153, SC-154, SC-155, SC-156, SC-157, SC-158, SC-159, SC-160, SC-161, SC-162, SC-163, SC-164, SC-166, SC-167, SC-168, SC-169, SC-170, SC-171, SC-172, SC-173, SC-174, SC-175, SC-176, SC-177, SC-178, SC-179, SC-180, SC-181, SC-182, SC-183, SC-184, SC-185, SC-186, SC-187, SC-188, SC-189, SC-190, SC-191, SC-192, SC-193, SC-194, SC-195, SC-196, SC-197, SC-198, SC-199, SC-200, SC-201, SC-202, SC-203, SC-204, SC-205, SC-206, SC-207, SC-208, SC-209, SC-210, SC-211, SC-212, SC-213, SC-214, SC-215, SC-216, SC-217, SC-218, SC-219, SC-220, SC-221, SC-222, SC-223, SC-224, SC-225, SC-226, SC-227, SC-228, SC-229, SC-230, SC-231, SC-232, SC-233, SC-234, SC-235, SC-236, SC-237, SC-238, SC-239, SC-240, SC-241, SC-242, SC-243, SC-244, SC-245, SC-246, SC-247, SC-248, SC-249, SC-250, SC-251, SC-252, SC-253, SC-254, SC-255, SC-256, SC-257, SC-258, SC-259, SC-260, SC-261, SC-262, SC-263, SC-264, SC-265, SC-266, SC-267, SC-268, SC-269, SC-270, SC-271, SC-272, SC-273, SC-274, SC-275, SC-276, SC-278, SC-279, SC-280, SC-281, SC-282, SC-283, SC-284, SC-285, SC-288, SC-289, SC-290, SC-291, SC-292, SC-293, SC-294, SC-295, SC-296, SC-297, SC-298, SC-299
- **Zero-counter 2 — canned discovery replies outside the discovery intent: 25** [Gate 2: 0] — scenarios: SC-001, SC-002, SC-003, SC-012, SC-013, SC-014, SC-016, SC-017, SC-019, SC-021, SC-022, SC-023, SC-024, SC-026, SC-027, SC-029, SC-030, SC-051, SC-052, SC-054, SC-055, SC-057, SC-059, SC-165, SC-277

## Routing confusion (expected tool -> observed tool, top rows)

| Expected | Observed | n |
|---|---|---|
| 125-career-intel | none | 45 |
| 124-career-outreach | none | 37 |
| 135-career-graph | none | 29 |
| 124-career-outreach | career_discovery | 23 |
| 128-career-negotiation | none | 16 |
| 121-career-jobs | none | 14 |
| 132-career-apply | none | 13 |
| 123-career-tailor | none | 13 |
| 129-career-os | none | 13 |
| 126-career-track | none | 11 |
| 130-career-onboarding | none | 9 |
| 133-career-packets | none | 7 |
| 126-career-track | career_fallback | 7 |
| 127-career-prep | none | 5 |
| 129-career-os | career_fallback | 5 |
| 125-career-intel | career_fallback | 5 |
| 139-career-safety | none | 5 |
| 132-career-apply | career_fallback | 4 |
| 136-career-season | none | 4 |
| 120-career-access | none | 4 |

## Method notes

- Observed tool = the turn's typed intent when returned, else its handler module, else `none` (contained / no handler). Correct = observed handler module equals the expected run-1 tool, or observed intent is in the expectation's acceptable-intents list (the current chain's vocabulary for that module's work), or the observed tool names the expected module directly.
- Modules with no intent in the current chain (125 intel, 128 negotiation, 134 paths, 135 graph, 144 guidance) can only score via a handler/tool name — that absence is the routing gap Gate 2 exists to close, and it is why this baseline is expected to be poor (the earlier fallback axis measured 0/269 in the hardened re-score).
- Canned fingerprint reused verbatim from the hardened grader (`run-grand-rescore.cjs`: >=3 of Northwind Ledger / Lakefront Cloud / Eastbank Systems / Copperline Infra / Fieldnote Software, or the '5 roles most worth applying to' header); discovery determination reuses its expectedDomain.
- Full per-scenario rows (expected vs observed, both counters, reply excerpts, all paraphrase rows) are in the results JSON produced by the same run (`--out-json`); the baseline run's copy is committed alongside this doc as `docs/career/gauntlet-routing-baseline-results.json`.
