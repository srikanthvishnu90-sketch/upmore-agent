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
Fix:
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
Follow-up (2026-10-20, Muse read-only diagnosis): the mechanism — the filter never had a chance. The executor's recency-ordered 600-posting window holds 246 SWE postings but ZERO intern-banded ones (bands in window: mid 224, senior 148, manager 113, staff 73, director 29, junior 5, intern 2 — both Operations; new_grad 1), so (family=SWE ∧ band=intern) is empty against the window, while the full shelf holds ~197 engineering-intern postings outside it. Classifiers, stamps, and filter all agree (counterfactual with fresh classifier output: still 0). Reproduced exactly by replaying the production path (600/5/0).

[ID: MUSE-F-006] [Status: OPEN]
Found: 2026-10-20 23:07 CDT, Muse (battery drive)
Area: brain
Input: "find data analyst internships in Chicago"
Expected: data-family postings from the bot's own current list (the shelf's 595-role window carries 48 postings stamped Data/ML by the product's own classifiers — MUSE-F-005 diagnosis counts).
Actual: "I found no data and machine learning roles in the current list, and I will not pad it with other kinds of roles. The current list holds 595 scored roles, and none of them are data and machine learning roles. Add boards that carry data and machine learning roles, or widen the ask to a neighbouring family, and I will search again." — a wrong-content zero, not a fallback: the bot asserted its own list holds no data roles at all while 48 of the 595 carry the product's own Data/ML stamp.
Evidence: battery transcript (evidence/battery-14-2026-10-20.md) + F-005's family distribution.
Priority: P0
Fix:
Verified by:

[ID: MUSE-F-007] [Status: OPEN]
Found: 2026-10-20 23:40 CDT, Muse (base-repair lane, branch muse/2026-10-20-ci-base-repair @ 8f003533; source name BASE-F-001).
Area: brain
Input: the owner's real fact bank, which the answer-map suite loads by design, carrying confirmed application_answer facts (~45, F-033…F-083) and application_text facts (~11).
Expected: every bank kind is consumed by module 149's derivation or exempted with a reason (the suite's BUG-238 contract).
Actual: answerMapCoverage reports both kinds uncovered; a repo-wide grep on the candidate base finds no consumer and no exemption — application drives stop on questions these facts already answer. The consumer exists only on trunk (WO-074, PR #108).
Evidence: tests/career-portal-answer-map.test.cjs failures (coverage + forcing function) at 6b6551cf; record docs/career/ci-base-repair-record-2026-10-20.md on the repair branch.
Priority: P1
Fix: unfilled (brain lane's call — wire a consumer or declare reasoned exemptions in module 149; an exemption whose reason is "nothing consumes this yet" would defeat the forcing function, so none was declared).
Verified by:

[ID: MUSE-F-008] [Status: OPEN]
Found: 2026-10-20 23:40 CDT, Muse (base-repair lane; source name BASE-F-002).
Area: brain
Input: testing-agent flow check ALRT-012 (standard fixture + $899 Best Buy charge + $35 overdraft fee).
Expected: exactly 1 finding delivered per day per the map; the rest daily_budget-suppressed.
Actual: 2 findings delivered (finding:unusual:chk-1:b1 and the rent upcoming_large finding) — the rent finding rides the urgent/deadline exemption at proactive.ts:305 while both save items are budget-suppressed; the stale committed report said PASS, the regenerated report says FAIL (behavior drifted).
Evidence: commit bc12cb87 on the repair branch; proactive.ts:305-306 + :313.
Priority: P1
Fix: unfilled (product lane's call — either the budget counts exempt findings, or the map is amended to bless the exemption).
Verified by:

[ID: MUSE-F-009] [Status: OPEN]
Found: 2026-10-20, owner-reported from tonight's evals (run ID not supplied with the report — recorded as reported).
Area: brain
Input: a quiet-hours setup in evals (user's quiet hours 22:00–07:00).
Expected: quiet hours are a silence window — everything but safety is held until the window ends (the product's own capability contract, packages/capabilities/registry.json "quiet hours enforcement": "everything but safety is held until the window ends, with the time it will be delivered").
Actual: "I'll text only in your quiet hours 22:00-07:00" — the exact inversion: it promises to text ONLY inside the do-not-disturb window.
Evidence: owner's eval report 2026-10-20 23:41 CDT; registry contract as above.
Priority: P1
Fix: unfilled — the quiet-hours logic + wording live in the proactive/alerts engine (brain side; NOT in Muse's surface lanes — ownership probed 2026-10-20: no quiet-hours logic exists in the link/pool/serving code).
Verified by: unfilled (the battery scenario below catches this class from the next run on).
