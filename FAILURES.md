# FAILURES.md — the work queue (owner mission, 2026-10-20)

Failures are unfinished work, not progress. An entry is FIXED only when a fresh real run
proves it, with the transcript evidence attached. Wins are real people finishing real
tasks on the live product; nothing in this file counts as a win.

Header notes:
- The owner approved the mission plan + asks 2026-10-20 20:02 CDT ("i approve of
  everything above").
- Ownership per the mission split: the completion machinery is Claude's (brain).
  The preserved in-flight edits from the pre-mission loop fixer (branch
  work/loop-task1: modules 122/132/142/149/155, router bundles, batch executor,
  production-sources, tests/career-loop-input-writer.test.cjs) transfer to Claude
  via HANDOFF.md. Muse owns the surface: job links, message wording/design,
  resume/profile rendering.

---

[ID: MUSE-F-001] [Status: OPEN]
Found: 2026-10-20 19:23 CDT, Muse (tester drive, live Telegram)
Area: shared
Input: "apply to 15 software engineering intern roles" — sent to @TraineeCareerBot, test account, live product (agent-chat v246).
Expected: the batch is prepared and surfaced in the chat: the selected roles named with their links, then an approval step — the task visibly progressing toward applications.
Actual: "I've handed this batch to the browser worker to prepare: it will find 15 software engineering intern roles, screen out the ones that don't fit, tailor each application, and bring the batch back here at the final review screen. Nothing has been filled or submitted yet — ask me for the batch status and I'll read back exactly where it stands." No roles, no links, no approval card ever appeared; nothing further arrived. The reply surface carries no part of the actual selection.
Evidence: baseline drive transcript, recorded verbatim in ~/workspace/your_files/real-world-actions/loop-ledger.md (Task 1, Iteration 0 — formal baseline record, 2026-10-20 19:23 CDT).
Priority: P0
Fix:
Verified by:

[ID: MUSE-F-002] [Status: OPEN]
Found: 2026-10-20 19:23 CDT, Muse (tester drive, live Telegram)
Area: brain
Input: "what's the batch status" and then "where is my batch" — same thread, immediately after the apply claim in MUSE-F-001 (the claim itself invited the question: "ask me for the batch status and I'll read back exactly where it stands").
Expected: the batch's true state read back from the committed intent/run records (the structured status shape proved exactly this read during the worker-flip smokes, §5.3).
Actual: both wordings received the identical generic fallback: "I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there."
Evidence: same transcript as MUSE-F-001 (loop ledger, Task 1, Iteration 0).
Priority: P0
Fix:
Verified by:

[ID: MUSE-F-003] [Status: OPEN]
Found: 2026-10-20 20:05 CDT, Muse (surface job-link audit, mission Hour 0-4)
Area: surface
Input: the job links Trainee serves from public.career_kb_postings (corpus snapshot, fetched_on 2026-10-14/15). Audit sample: 60 postings stratified across all 11 sources plus forced Gusto (5) and data-analyst (6) strata; every URL fetched and content-checked.
Expected: every link the product serves resolves to a real, live posting (mission slice step 3: "Real links, checked to resolve to real postings").
Actual: of 60 sampled links, 31 resolve to a live posting (HTTP 200 with posting content); 3 are dead (1x HTTP 410 Gone - arbeitnow/Legartis; 2x HTTP 404 - themuse); 26 cannot be confirmed either way from the served page (21x HTTP 200 JS-rendered pages with no verifiable posting content in the raw fetch; 5x network errors). No code path checks any link before it is served: career_pool.js copies the snapshot's url verbatim, and the serving path (career_pool.js + 142-career-router.js) contains zero liveness checks - no HEAD request, no fetch of a posting URL, anywhere. The snapshot was 6 days old at audit time.
Evidence: per-link audit results - ~/workspace/your_files/job-link-audit-2026-10-20.json and ~/workspace/your_files/job-link-audit-2026-10-20.md (60 links, status + final URL + verdict each).
Priority: P0
Fix: liveness discipline built @ 516e4d43 + 2e283cff, not yet deployed; verified-by pending a live run
Verified by:

[ID: MUSE-F-004] [Status: OPEN]
Found: 2026-10-20 20:01 CDT, Muse (tester drive)
Area: brain
Input: "My career goal is a data analyst internship for summer 2027." (new slice drive, same Telegram thread)
Expected: the goal recorded as the user's goal; links served on request; goal recalled on ask.
Actual: the bot consumed the goal statement as an ANSWER to a leftover mock-interview state from an earlier session and rubric-scored it ("structure 1 of 5, evidence 3 of 5, specificity 2 of 5"), then asked the next mock question; "Show me real job postings that match my goal — with the links" → generic fallback, zero links; "What is my career goal?" → generic fallback, no recall.
Evidence: slice-drive transcript in the loop ledger (~/workspace/your_files/real-world-actions/loop-ledger.md) + Muse's report to the owner, 2026-10-20.
Priority: P0 (blocks slice steps 1–3; stale conversation state hijacks new intent)
Fix:
Verified by:

[ID: MUSE-F-005] [Status: OPEN]
Found: 2026-10-20 20:13 CDT, Muse (worker recovery lane)
Area: shared
Input: live batch run batch-fnv1a-631b08, ask "apply to 3 software engineering intern roles", executed by the production executor against the real pool.
Expected: the family screen keeps the pool's SWE-intern postings (the 2026-10-20 flip run on older code kept 591 eligible with the same family text).
Actual: family filter kept 0 of 595 deduped postings (families ["SWE"], intern=true) → eligible 0, selected 0, run completed with doorsteps 0. The filter lives in the UNCOMMITTED Fix 2 (155 prepareRun, branch work/loop-task1) whose guard selected 3 from a fixture pool — fixture/reality mismatch.
Evidence: loop ledger Iteration 1 server-side result (~/workspace/your_files/real-world-actions/loop-ledger.md) + the run record for batch-fnv1a-631b08.
Priority: P0
Fix:
Verified by:
