# Evidence — FAILURES.md backlog + HANDOFF.md notes (state as of 2026-10-20 ~21:00 CDT)

## What this package is

FAILURES.md did not exist in the repo before tonight. It was created and iterated **directly on `integration/v2-candidate`** during the evening, in three commits:

- `edf20466` — failures: seed FAILURES.md (MUSE-F-001..F-004) + HANDOFF.md ownership note
- `50d5fb6f` — failures: file MUSE-F-005 (family filter 0/595 on real pool) + 2 handoff notes for Claude
- `6b6551cf` — failures: MUSE-F-005 diagnosis — window holds 246 SWE but zero intern-banded; + repair-shape handoff

So this branch's diff against the candidate is deliberately small: the LIVENESS COLLISION note appended to HANDOFF.md (this package), plus this evidence file and PR-BODY.md. **The backlog itself is already on the candidate; this PR is its review unit** — the five entries below are quoted verbatim from FAILURES.md at candidate tip `6b6551cf`, and each entry's evidence is a live run from tonight, not a synthetic test.

## The underlying live evidence — slice drive (Telegram, 2026-10-20 20:01 CDT)

```
[20:01:29] USER: My career goal is a data analyst internship for summer 2027.
[20:01:32] BOT: Tell me about a hard problem you solved and how you approached it. Rubric on that answer: structure 1 of 5, evidence 3 of 5, specificity 2 of 5. Order the next one as situation, task, action, result. Tell me what you'd like to do next.
[20:01:44] USER: Show me real job postings that match my goal — with the links.
[20:01:47] BOT: I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there.
[20:02:01] USER: What is my career goal?
[20:02:04] BOT: I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there.
```

And the iteration-0 / iteration-1 apply transcripts are quoted in full in `evidence/batch-trigger-fix.md` (package `muse/2026-10-20-batch-trigger-fix`). All transcripts are recorded verbatim in `~/workspace/your_files/real-world-actions/loop-ledger.md`.

## FAILURES.md — all five entries, verbatim from candidate tip 6b6551cf

### [ID: MUSE-F-001] [Status: OPEN]
Found: 2026-10-20 19:23 CDT, Muse (tester drive, live Telegram)
Area: shared
Input: "apply to 15 software engineering intern roles" — sent to @TraineeCareerBot, test account, live product (agent-chat v246).
Expected: the batch is prepared and surfaced in the chat: the selected roles named with their links, then an approval step — the task visibly progressing toward applications.
Actual: "I've handed this batch to the browser worker to prepare: it will find 15 software engineering intern roles, screen out the ones that don't fit, tailor each application, and bring the batch back here at the final review screen. Nothing has been filled or submitted yet — ask me for the batch status and I'll read back exactly where it stands." No roles, no links, no approval card ever appeared; nothing further arrived. The reply surface carries no part of the actual selection.
Evidence: baseline drive transcript, recorded verbatim in ~/workspace/your_files/real-world-actions/loop-ledger.md (Task 1, Iteration 0 — formal baseline record, 2026-10-20 19:23 CDT).
Priority: P0
Fix:
Verified by:

### [ID: MUSE-F-002] [Status: OPEN]
Found: 2026-10-20 19:23 CDT, Muse (tester drive, live Telegram)
Area: brain
Input: "what's the batch status" and then "where is my batch" — same thread, immediately after the apply claim in MUSE-F-001 (the claim itself invited the question: "ask me for the batch status and I'll read back exactly where it stands").
Expected: the batch's true state read back from the committed intent/run records (the structured status shape proved exactly this read during the worker-flip smokes, §5.3).
Actual: both wordings received the identical generic fallback: "I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there."
Evidence: same transcript as MUSE-F-001 (loop ledger, Task 1, Iteration 0).
Priority: P0
Fix:
Verified by:

### [ID: MUSE-F-003] [Status: OPEN]
Found: 2026-10-20 20:05 CDT, Muse (surface job-link audit, mission Hour 0-4)
Area: surface
Input: the job links Trainee serves from public.career_kb_postings (corpus snapshot, fetched_on 2026-10-14/15). Audit sample: 60 postings stratified across all 11 sources plus forced Gusto (5) and data-analyst (6) strata; every URL fetched and content-checked.
Expected: every link the product serves resolves to a real, live posting (mission slice step 3: "Real links, checked to resolve to real postings").
Actual: of 60 sampled links, 31 resolve to a live posting (HTTP 200 with posting content); 3 are dead (1x HTTP 410 Gone - arbeitnow/Legartis; 2x HTTP 404 - themuse); 26 cannot be confirmed either way from the served page (21x HTTP 200 JS-rendered pages with no verifiable posting content in the raw fetch; 5x network errors). No code path checks any link before it is served: career_pool.js copies the snapshot's url verbatim, and the serving path (career_pool.js + 142-career-router.js) contains zero liveness checks - no HEAD request, no fetch of a posting URL, anywhere. The snapshot was 6 days old at audit time.
Evidence: per-link audit results - ~/workspace/your_files/job-link-audit-2026-10-20.json and ~/workspace/your_files/job-link-audit-2026-10-20.md (60 links, status + final URL + verdict each).
Priority: P0
Fix:
Verified by:

### [ID: MUSE-F-004] [Status: OPEN]
Found: 2026-10-20 20:01 CDT, Muse (tester drive)
Area: brain
Input: "My career goal is a data analyst internship for summer 2027." (new slice drive, same Telegram thread)
Expected: the goal recorded as the user's goal; links served on request; goal recalled on ask.
Actual: the bot consumed the goal statement as an ANSWER to a leftover mock-interview state from an earlier session and rubric-scored it ("structure 1 of 5, evidence 3 of 5, specificity 2 of 5"), then asked the next mock question; "Show me real job postings that match my goal — with the links" → generic fallback, zero links; "What is my career goal?" → generic fallback, no recall.
Evidence: slice-drive transcript in the loop ledger (~/workspace/your_files/real-world-actions/loop-ledger.md) + Muse's report to the owner, 2026-10-20.
Priority: P0 (blocks slice steps 1–3; stale conversation state hijacks new intent)
Fix:
Verified by:

### [ID: MUSE-F-005] [Status: OPEN]
Found: 2026-10-20 20:13 CDT, Muse (worker recovery lane)
Area: shared
Input: live batch run batch-fnv1a-631b08, ask "apply to 3 software engineering intern roles", executed by the production executor against the real pool.
Expected: the family screen keeps the pool's SWE-intern postings (the 2026-10-20 flip run on older code kept 591 eligible with the same family text).
Actual: family filter kept 0 of 595 deduped postings (families ["SWE"], intern=true) → eligible 0, selected 0, run completed with doorsteps 0. The filter lives in the UNCOMMITTED Fix 2 (155 prepareRun, branch work/loop-task1) whose guard selected 3 from a fixture pool — fixture/reality mismatch.
Evidence: loop ledger Iteration 1 server-side result (~/workspace/your_files/real-world-actions/loop-ledger.md) + the run record for batch-fnv1a-631b08.
Priority: P0
Fix:
Verified by:
Follow-up (2026-10-20, Muse read-only diagnosis): the mechanism — the filter never had a chance. The executor's recency-ordered 600-posting window holds 246 SWE postings but ZERO intern-banded ones (bands in window: mid 224, senior 148, manager 113, staff 73, director 29, junior 5, intern 2 — both Operations; new_grad 1), so (family=SWE ∧ band=intern) is empty against the window, while the full shelf holds ~197 engineering-intern postings outside it. Classifiers, stamps, and filter all agree (counterfactual with fresh classifier output: still 0). Reproduced exactly by replaying the production path (600/5/0).

## HANDOFF.md state carried by this package

At candidate tip, HANDOFF.md carries (all dated 2026-10-20, Muse → Claude): (1) the transfer of the preserved `work/loop-task1` in-flight edits to Claude under the mission area split; (2) the discovery-link note (142 `handleDiscovery` must include each posting's `url`); (3) the MUSE-F-005 heads-up; (4) the F-005 diagnosis (data-shape note); (5) the F-005 repair shape (targeted family/band shelf read in the pool/sources layer; do NOT relax the band; Muse's surface lane builds the pool-loader half, the executor wiring is Claude's).

This package appends one further note, verbatim in the branch's HANDOFF.md:

> LIVENESS COLLISION (2026-10-20 ~21:00 CDT): two designs for MUSE-F-003 now exist. (1) Muse's: committed + proven on work/serve-link-liveness @ 516e4d43 (verifier module + pool servable reads; handler wiring left to you by boundary). (2) An uncommitted working-tree design in ~/workspace/upmore-liveness (probe-at-pool-load, CareerPool.createFetchProbe + deadExcluded, with edits already in agent-chat/handler-career.ts + production-sources.cjs + six test files; createFetchProbe does not yet exist in career_pool.js). Muse's lane left (2) untouched. Merge deliberately — the second landing must reconcile the two, and (2) crosses the handler boundary by design.

The full fixer inventory that substantiates the transfer (every file, hunk, test number) rides verbatim as `evidence/fixer-handoff-inventory.md` in package `muse/2026-10-20-loop-writer`.
