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

Entry format (required fields): [ID] [Status: OPEN|FIXING|FIXED] · Found · Area: brain|surface|shared · Input · Expected · Actual (verbatim) · Evidence · Priority · Root cause (why it happens · the exact code or prompt line responsible · the fix) — REQUIRED before any fix; a fix is verified only by a measured re-run (battery or CI); no fix without the note, no note without the re-run (owner rule 2026-10-21). · Fix · Verified by (fresh real run transcript)

---

[ID: MUSE-F-001] [Status: OPEN]
Found: 2026-10-20 19:23 CDT, Muse (tester drive, live Telegram)
Area: shared
Input: "apply to 15 software engineering intern roles" — sent to @TraineeCareerBot, test account, live product (agent-chat v246).
Expected: the batch is prepared and surfaced in the chat: the selected roles named with their links, then an approval step — the task visibly progressing toward applications.
Actual: "I've handed this batch to the browser worker to prepare: it will find 15 software engineering intern roles, screen out the ones that don't fit, tailor each application, and bring the batch back here at the final review screen. Nothing has been filled or submitted yet — ask me for the batch status and I'll read back exactly where it stands." No roles, no links, no approval card ever appeared; nothing further arrived. The reply surface carries no part of the actual selection.
Evidence: baseline drive transcript, recorded verbatim in ~/workspace/your_files/real-world-actions/loop-ledger.md (Task 1, Iteration 0 — formal baseline record, 2026-10-20 19:23 CDT).
Priority: P0
Root cause: PINNED (surface) — the discovery replies built by 142-career-router's handleDiscovery carry no URLs because roleSentence and the structured payload omit the posting's url field, and batch claim replies name only a count/family or one company — zero roles. Fix: surface the selected roles with their links in the discovery/batch replies (rides the writer/surfacing work); verified by a measured re-run (battery) after deploy.
Fix:
Verified by:
Addendum: Escalated by owner 2026-10-21 00:30 CDT: unverifiable output is FAILED output — lists must carry links; the links ask dead-parsing (no handler routes it) is part of this entry's root cause. Closing this entry is the surface priority round.

[ID: MUSE-F-002] [Status: OPEN]
Found: 2026-10-20 19:23 CDT, Muse (tester drive, live Telegram)
Area: brain
Input: "what's the batch status" and then "where is my batch" — same thread, immediately after the apply claim in MUSE-F-001 (the claim itself invited the question: "ask me for the batch status and I'll read back exactly where it stands").
Expected: the batch's true state read back from the committed intent/run records (the structured status shape proved exactly this read during the worker-flip smokes, §5.3).
Actual: both wordings received the identical generic fallback: "I didn't catch that. Try naming the job, company, or person — or say 'find jobs' and I'll start there."
Evidence: same transcript as MUSE-F-001 (loop ledger, Task 1, Iteration 0).
Priority: P0
Root cause: PINNED — handleBatchStatus (defined in 142) is never dispatched: packaging verification found exactly one occurrence in the packaged tree, the definition itself. dispatchChat has no call to it, career_host.js lacks the ctx.batchRunRecord passthrough, and handler-career.ts lacks the runId derivation + readBatchRun, so both status wordings fall through to the generic fallback. Fix: the 3 wiring steps (dispatch call · host passthrough · handler runId derivation); verified by a measured re-run (battery).
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
Root cause: PINNED — no code path verifies a link before serving (grep-verified): career_pool.js loadPool copies each snapshot row's url verbatim from career_kb_postings, and neither serving path fetches or HEAD-checks a posting URL, so dead links serve unchecked. Fix: liveness at load/serve (built on branch muse/2026-10-20-link-liveness, PR #146 — probe-at-load excludes definitive 404/410; the merge call is Claude's); verified only by a fresh live run (battery link scenarios).
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
Root cause: PARTIALLY PINNED — mechanism established: a stale in-progress mock-interview state from an earlier session takes precedence over a new intent, so the goal statement is consumed as a mock answer and rubric-scored, and nothing is stored for recall. The exact responsible line / precedence check is NOT YET PINNED — diagnosis owed before any fix.
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
Root cause: PINNED — the executor's pool read (production-sources.cjs postingsFor → career_pool.js loadPool, DEFAULT_LIMIT 600, recency-ordered) returns a window holding ZERO intern-banded SWE postings, while the full shelf's ~197 engineering-intern postings sit outside the window; the family filter (155:195-211) is correct given its input — classifiers, stamps, and filter all agree (fresh-classifier counterfactual still 0). Full mechanism in the Follow-up below. Fix: a targeted shelf read keyed to named family/band (generalize career_pool.js loadTargeted) merged before the unchanged filter; do NOT relax the band. Verified by a measured re-run (battery/CI) — owed.
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
Root cause: PARTIALLY PINNED — established: the reply's zero claim is false against its own input — the 595-role window it counted carries 48 Data/ML-stamped postings (F-005 diagnosis distribution: SWE 246, Sales 81, Other 52, Data/ML 48, Finance 37, Marketing 29, Operations 28, Design 24, PM 21, Medicine 15, Law 9, Consulting 5). The exact mapping/check inside the discovery path that produced the wrong family count is NOT YET PINNED — diagnosis owed before any fix.
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
Root cause: PINNED — a repo-wide grep on the candidate base finds no consumer and no exemption for the application_answer (~45 facts) and application_text (~11) bank kinds; module 149's derivation never reads them (the consumer exists only on trunk, WO-074 PR #108), so application drives stop on questions these facts already answer. Fix: wire a consumer in module 149 or declare reasoned exemptions (brain lane's call); verified by a measured CI re-run (answer-map suite).
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
Root cause: PINNED — proactive.ts:305-306: the urgent/deadline exemption lets the rent upcoming_large finding bypass the 1/day delivery budget whose accounting (:313) suppresses both save findings, so 2 findings deliver where the map allows 1; the stale committed report masked the drift (PASS → fresh FAIL on regeneration). Fix: the budget counts exempt findings, or the map is amended to bless the urgent-deadline exemption (product lane's call); verified by a measured CI re-run (testing-agent).
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
Root cause: PARTIALLY PINNED — established: the proactive/alerts engine's quiet-hours behavior contradicts its own registry contract ("everything but safety is held until the window ends, with the time it will be delivered") — it announced texting ONLY inside the window. The exact responsible line in the proactive/alerts engine is NOT YET PINNED — diagnosis owed before any fix.
Fix: unfilled — the quiet-hours logic + wording live in the proactive/alerts engine (brain side; NOT in Muse's surface lanes — ownership probed 2026-10-20: no quiet-hours logic exists in the link/pool/serving code).
Verified by: unfilled (the battery scenario below catches this class from the next run on).

[ID: MUSE-F-010] [Status: OPEN]
Found: 2026-10-20, Muse link audit.
Area: surface
Input: job links served from the shelf (career_kb_postings) to a user.
Expected: every served link is the actual job posting.
Actual: some shelf rows carry non-posting URLs — nyc-open-data rows carry Socrata API endpoints as their url, hn-algolia rows carry Hacker News thread URLs — and the serving paths pass them through unchecked, so a "job link" can land on an API endpoint or a forum thread.
Evidence: the audit's per-row classifications — ~/workspace/your_files/job-link-audit-2026-10-20.md and ~/workspace/your_files/job-link-audit-2026-10-20.json (kept out of the repo per privacy rules; the audit's counts: 60 sampled shelf links = 31 resolve / 3 dead / 26 uncheckable).
Priority: P1 (wrong links are the "wrong is worse than empty" class on the slice's step 3)
Root cause: PINNED — career_pool.js loadPool reads each row's url verbatim and no load/serve path validates that the URL is a posting for its source; the junk entered at shelf ingest and nothing downstream filters it.
Fix: a load-side URL-shape guard in career_pool.js — drop postings whose URL is an API endpoint or aggregator thread for their source, counted in an excluded counter alongside deadExcluded, guard-tested against the audit's actual junk rows (surface lane, one round, NOT yet started — owner tempo rule 2026-10-21: one root-cause fix per lane per round, verified by a measured re-run, no bundling; the note precedes the fix).
Verified by: unfilled — CI (guard + sweep delta) first, then the battery's link scenarios after deploy.

[ID: MUSE-F-011] [Status: OPEN]
Found: 2026-10-21 00:30 CDT, owner live test on v246 (both entry paths, before and after resume confirm).
Area: brain (tailor leg; rendering surface Muse's)
Input: tailor a resume — (a) by role name, (b) by pasted posting.
Expected: a tailored resume artifact or an honest stop naming the missing input.
Actual: "Something went wrong on my end" — on both paths; no artifact, no tailoring.
Evidence: owner's live run 2026-10-21; channel_artifacts has 0 rows ever (standing record).
Priority: P0 (slice step 4 machinery)
Root cause: PARTIALLY PINNED — the synchronous confirm→tailor→render leg throws only in the Deno edge runtime (never in node tests); v246's guard (9143889e) catches it and degrades to that bubble, so the product survives but tailoring never completes. The EXACT throwing statement is NOT YET PINNED — diagnosis in flight (live repro + agent-chat function-log capture, Muse lane 2026-10-21).
Fix: unfilled until the exception is captured; then the smallest change at the throwing statement + a fail-first replay.
Verified by: unfilled.

[ID: MUSE-F-012] [Status: OPEN]
Found: 2026-10-21 00:30 CDT, owner live test.
Area: brain/shared
Input: a confirmed synthetic test resume (15 facts) sits on the test profile.
Expected: a way to remove it (test-data reset; generally: a user can delete their stored resume/profile).
Actual: no delete path exists — no chat intent, no handler, nothing.
Evidence: owner's run; module 122's store has writers and no deleter (standing code record).
Priority: P1
Root cause: PINNED at the capability level — the profile store was built write-only: ingest/confirm paths exist, but no delete intent is routed in dispatch and no delete function exists in the store.
Fix: a general delete path — "delete my resume/profile" intent → explicit confirmation (approval law) → facts + artifacts for that user deleted, verified by read-back showing empty; built for any user, used first for the test-data reset.
Verified by: unfilled.

[ID: MUSE-F-013] [Status: OPEN]
Found: 2026-10-21 00:30 CDT, owner live test.
Area: surface
Input: a served role list on the live bot.
Expected: every role renders with its location (or an honest "location not listed").
Actual: one role renders with an EMPTY location — blank, no fallback text.
Evidence: owner's live run (role not named in the report).
Priority: P2
Root cause: NOT YET PINNED — either the shelf row's location is empty and the renderer passes the blank through, or the render drops a present location; diagnosis = inspect the served window's rows for empty locations + read the list-render path. Diagnosis owed before any fix.
Fix: unfilled until pinned.
Verified by: unfilled.

[ID: MUSE-F-014] [Status: OPEN]
Found: 2026-10-21 00:48 CDT, owner-relayed from Codex's synthetic repro (NO live data involved; synthetic only).
Area: brain/shared
Input: (Codex's repro, as relayed verbatim by the owner): "in an isolated synthetic test, correcting profile A changed profile B's graduation year from 2031 to 2028 during B's recall."
Expected: one profile's writes never touch another profile — PR #90's cross-user-leak fix is present in the shipped bundle.
Actual: profile B's stored fact changed as a side effect of profile A's correction; the v246 bundle (commit 8410e9cb) does not contain PR #90's fix.
Evidence: Codex's synthetic repro (exact repro text/record to be attached verbatim when located in the repo record — do not paraphrase it into this entry; the owner's relay above is quoted exactly). This is also the mission's Task 0 verdict: LIVE-LEAKING (synthetic-proven against the deployed bundle's code; whether any real user's data was ever affected is UNKNOWN and not claimed).
Priority: P0 — cross-profile contamination, the worst class we have; joins MUSE-F-011 at the top of the list.
Root cause: PARTIALLY PINNED — the deployed bundle was staged from a tree that lacks PR #90's user-scoping fix, so the profile write/read path in the shipped code can cross profiles; the exact missing change set and the exact unscoped statement in the bundle are being pinned now (Muse cross-check lane: PR #90's diff vs the 8410e9cb bundle, 2026-10-21).
Fix: land PR #90's fix on the build line (not a re-implementation), then verify by re-running Codex's EXACT repro against the fixed bundle and showing profile B unchanged (graduation year still 2031 after A's correction); deployment follows the standing gate and is tracked separately from the code fix.
Verified by: unfilled.
