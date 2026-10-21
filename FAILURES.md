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
Root cause: PINNED (diagnosis 2026-10-21, Muse lane). ReferenceError: Buffer is not defined — thrown at packages/domain/148-career-render.js renderPdf, line 542 (first bare-Buffer read on the tailor path; deployed bundle _shared/router_core.career.js:337:4661). Chain: 142 handleTailor (line 580) → 123 tailorResume → render() → 148 renderPdf. Why: module 148's byte layer reads the bare Node Buffer global in ~30 places (deflate/SHA-256 shim/ZIP/renderDocx/renderPdf); its Node captures come back null in the Deno ESM bundle, so the vendored pure-JS fallback runs — written on bare Buffer. Stock Deno 2.1.4 (the Supabase Edge Runtime's version) defines NO bare Buffer global (node:buffer import only); Node and Deno 2.9.7 define it, so every test environment masked the defect and only production throws. A/B proof: identical deployed bundle + production inputs under Deno 2.9.7 produce career_tailor WITH a real PDF artifact; under Deno 2.1.4 both entry paths throw the identical ReferenceError (the throw is downstream of JD resolution — entry path and confirm state are irrelevant). Method: owner's live turns are stored verbatim in agent_messages (thread 3cddb160-8fb0-4f89-b3a6-b8801a5cf82f); function logs carry error_class ReferenceError + career_containment_failure records only (no stack is logged anywhere — verified via the unified logs endpoint); the stack was reproduced locally against the deployed stage (8410e9cb) with the thread's real persisted state under Deno 2.1.4. This is also the Oct 20 v246 S3 throw (channel_artifacts stayed 0). Fix: 148's byte layer stops reading the bare global — one module-local byte-buffer helper over Uint8Array/DataView used by those sites (148 only). Guards: a Buffer-shadowed turn-level replay of the three live turns (fixture: Alex profile, 15 confirmed facts, PolicyMe posting) that fails pre-fix with this ReferenceError, plus the render-level guard in tests/edge/edge-pdf-renderer.test.ts under the same shadowing. Verified: unfilled (fix round in flight; live re-drive of the same three texts follows the deploy gate).
Fix: 148's byte layer stops reading the bare global — one module-local byte-buffer helper over Uint8Array/DataView used by those sites (148 only); guards = the Buffer-shadowed turn-level replay of the three live turns + the render-level guard in tests/edge/edge-pdf-renderer.test.ts under the same shadowing.
Verified by: unfilled (fix round in flight; live re-drive of the same three texts follows the deploy gate).

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

[ID: MUSE-F-014] [Status: FIXED]
Found: 2026-10-21 00:48 CDT, owner-relayed from Codex's synthetic repro (NO live data involved; synthetic only).
Area: brain/shared
Input: (Codex's repro, as relayed verbatim by the owner): "in an isolated synthetic test, correcting profile A changed profile B's graduation year from 2031 to 2028 during B's recall."
Expected: one profile's writes never touch another profile — PR #90's cross-user-leak fix is present in the shipped bundle.
Actual: profile B's stored fact changed as a side effect of profile A's correction; the v246 bundle (commit 8410e9cb) does not contain PR #90's fix.
Evidence: Codex's synthetic repro, located exactly: tests/correction-authority-privacy.test.cjs + tests/helpers/correction-privacy-fixture.cjs (byte-identical in Codex's dfd22d76 and PR #90's 11036192); run: node --experimental-vm-modules --test tests/correction-authority-privacy.test.cjs. This is also the mission's Task 0 verdict: LIVE-LEAKING (synthetic-proven against the deployed bundle's code; whether any real user's data was ever affected is UNKNOWN and not claimed).
Priority: P0 — cross-profile contamination, the worst class we have; joins MUSE-F-011 at the top of the list.
Root cause: PINNED (cross-check + extraction, Muse lanes 2026-10-21). Mechanism: packages/domain/130-career-onboarding.js keeps a process-global CORRECTION_STORE Map (line 212) keyed by USER DATA — correctionKey (lines 213-216) returns basics.email || basics.name || profile.id || first fact's id. Every profile shares the default id 'profile-1' and fact ids restart at F-001 for every profile, so two users with no email/name on file collide on the same key inside one warm edge isolate. applyProfileCorrection writes the corrector's record {audit, changes, graduationDate, resume_sources} into that store (line 267); handleChat calls applyPersistedCorrections(c.profile) on EVERY turn (line 557), and applyPersistedCorrections (lines 271-274+) overwrites the current profile's constraints.graduationDate with the stored record's — so B's recall turn silently replays A's correction into B's profile. Deployed bundle evidence @ 8410e9cb (supabase/functions/_shared/router_core.career.js): store+key lines 10087-10091, write 10141-10142, the overwriting read 10146-10152, every-turn trigger line 10432. Presence: the fix (PR #90, commit 11036192) is an ancestor of NEITHER 8410e9cb NOR the candidate 6b6551cf (merge-base checked); the candidate's 130 is byte-identical to the pre-fix source and its bundles carry CORRECTION_STORE 6x each — the build line itself is vulnerable, not just the deployed bundle. Trunk carries the fix and passes the repro (control). The repro: tests/correction-authority-privacy.test.cjs + tests/helpers/correction-privacy-fixture.cjs (byte-identical in Codex's dfd22d76 and PR #90's 11036192); run: node --experimental-vm-modules --test tests/correction-authority-privacy.test.cjs — seeds A (2027) and B (2031) in one realm, A corrects to 2028, B recalls; asserts the reply matches 2031 and never 2028, and B's stored profile deep-equals its pre-correction copy (3 collision modes x committed/failed-save). Muse's cross-check ran it against the v246 bundle: FAILED (B answered 'Your graduation date is 2028'); against trunk: PASSED. Fix: port 11036192 onto the candidate build line — delete the global store in 130 (corrections persist only inside the owner's own atomic profile snapshot; the store's export/restore functions become no-op stubs), bring the guard test + fixture, regenerate the bundles the project's way, take the call-site updates. Verified: unfilled (fix round in flight; the exact repro command must FAIL on 6b6551cf and PASS on the fixed tree, then the battery + deploy gate govern the live claim).
Fix: land PR #90's fix on the build line (not a re-implementation), then verify by re-running Codex's EXACT repro against the fixed bundle and showing profile B unchanged (graduation year still 2031 after A's correction); deployment follows the standing gate and is tracked separately from the code fix.
Verified by: FIXED — verified live 2026-10-21: commit c9fc28f95e4269cbe4284fd2c2e5e61f0f9cc222 deployed as agent-chat v247 (2026-10-21T10:04:49Z) via the prune-lane staged recipe (12 files, 3,466,034 B; 11/12 staged files byte-identical to v246's stage, only router_core.career.js differs). Provenance: re-downloaded production body — CORRECTION_STORE 0, correctionKey 0; deployed career bundle sha256 7339f0c04f1d85ad3242c2a4466605baeab9ca35dc12bbe22e791fac78603033 == staged fixed bundle. Live re-probe (fixture-seeded snapshots in the product's own persistence row, all turns through live agent-chat with each synthetic user's own JWT, 3 repetitions): A corrects to 2028 and recalls 2028; B recalls 'Your graduation date is 2031' in 3/3, never 2028; B's stored profile deep-equals its planted pre-correction copy in every rep. Independent verification before deploy: Codex repro on the exact commit PASSED (10/10 + own 9/9, B byte-identical, SHA-matched). First deploy attempt HTTP 413 (full-tree upload 12.16 MiB) taught the staging law — repo tree is never deployed raw. All synthetic probe users deleted and verified gone.

[MUSE-F-015] [Status: OPEN] · Found: 2026-10-21, Muse (surfaced by the MUSE-F-011 diagnosis). Area: brain. Input: outreach paths in 124-career-outreach.js (networking send path — v2 reopening is approved work, 2026-10-20). Expected: no module on an edge-executed path reads bare Node-only globals. Actual: 124 carries the same latent bare-Buffer pattern that throws as ReferenceError in the Deno 2.1.4 edge runtime on the tailor path (MUSE-F-011); on 124 it has not thrown live yet because the send path is not executing — latent, same class. Evidence: the F-011 diagnosis (code read of 124 during the stack trace work). Priority: P1 (it will throw the first time the reopened send path executes in the edge runtime). Root cause: PINNED — same mechanism as F-011: bare Buffer reads in a module bundled for the Deno ESM edge runtime, which defines no bare Buffer global under Deno 2.1.4. Fix: the same treatment as 148, as its OWN round (no bundling): 124's byte sites move to the module-local byte helper or a node:buffer import, guarded by the same Buffer-shadowed replay pattern on an outreach turn. Verified: unfilled.

[MUSE-F-016] [Status: OPEN] · Found: 2026-10-21 (live re-probe layer 1, during the F-014 v247 verification) · Area: brain · Input: live chat turns on production v247 — user pastes a 2027 resume, confirms, pastes a 2028 resume, confirms, then sends the correction 'use the new one, old resume's wrong' and asks 'what's my graduation year?' · Expected: the correction resolves against the two stored resume sources (the F-014-fixed path) and the recall answers from the corrected profile · Actual (verbatim, 3/3 reps): correction -> 'I do not have a newer resume source on file that resolves a stored conflict, so I changed nothing…'; recall -> 'I do not have your graduation date stored yet — what is it?…' · Evidence: ~/workspace/deploy-v247-provenance/reprobe-transcript.json (owner-side record) · Priority: P1 (no leak and no wrong data — the safe direction; but the resume-correction flow, a shipped feature, cannot be exercised by a real user through chat at all) · Root cause: module 130's correction resolver — the only writer of constraints.graduationDate — consumes a labeled conflict fact / ctx.resumeTexts that have NO live writer: live resume ingest (module 122) creates only per-resume draft facts, and nothing on the live path ever assembles the conflict fact or passes resumeTexts into the turn context. The resolver's inputs are harness/fixture constructs today. · Fix: not scoped here — brain lane: give the live ingest/confirm path a writer for the conflict state (two confirmed resume sources with differing facts -> labeled conflict fact on the user's own profile), so the resolver runs on real turns; guard = the layer-1 chat-turn sequence above passing end-to-end on the live bot. · Verified by: (open)

[MUSE-F-017] [Status: OPEN] · Found: 2026-10-21 (live battery on v247, scenarios 4-5; root-cause note same day) · Area: brain · Input: 'My career goal is a data analyst internship for summer 2027.' then, later turn, 'what's my career goal?' · Expected: the goal is recorded verbatim on the user's record and acknowledged as recorded; the recall answers it verbatim, cross-thread · Actual: turn 1 routed to discovery and answered with the F-006 wrong zero ('The current list holds 595 scored roles, and none of them are data and machine learning roles') — the goal was never recorded or acknowledged; turn 2 got the generic fallback (intent career_fallback) · Evidence: ~/workspace/your_files/channel-tests/2026-10-21-battery-v247.md scenarios 4-5 · Priority: P0 (this is slice steps 1-2: state a goal, have it remembered) · Root cause: PINNED in the c9fc28f9 tree — three composed absences: (1) captureStatedFacts (142-career-router.js:9571), the only free-chat writer of stated state, has NO goal frame; (2) no intent in 142 claims a goal declaration and 130 stands down (its handleChat claims corrections, onboarding triggers, interview answers, and ^(what's|what is) my questions only); the turn falls to 142's discovery tail whose alternation :9450 (\binternships?\b[^.]*\b(help|next summer|summer)\b) claims ANY sentence co-containing 'internship...summer', declaration included, and handleDiscovery composes the wrong zero; (3) recall: 130's answerFromProfile (:94-113) has exactly seven field branches and no goal branch; 142's recall family resolves only recorded facts (none recorded; no recorded kind is a goal); all three candidate goal stores are dead ends (122 has no goal slot; 130's prefs.goals is written only inside the structured interview and never read by answerFromProfile; 129's store.goals[] has no writer anywhere — only createStore initializations seed it empty). v242 comparison: NOT a regression — the v242 MEMORY pass probed recruiter_contact, which rides the keyed stated-facts machinery; no goal was ever probed on v242 and no goal frame/claim/recall exists in either line. The recall half is F-016's disease (consumers with no live writer); the statement half is an additional mis-claim mechanism. · Fix: in 142 only — a goal capture frame recording the clause verbatim as a keyed stated fact (kind 'goal', the recruiter_contact carriage), one early claim answering declarations with the Recorded surface quoting the clause, and goal-recall resolution in the same claim family standing down when no goal is recorded; guard = fail-first replay of the two battery texts (fresh thread + second fresh thread). Fix round on branch muse/2026-10-21-goal-frame. ROUND 2 (2026-10-21, judge FAIL on PR #151 round 1): the requested checks passed (fail-first 3/3 base, 6/6 fix, precedence 9/9) but the judge found a blocker the guard missed — old thread states goal A, new thread states goal B, old thread's 'what's my career goal?' answered A AND rewrote the account record back to A (fresh thread then recalled A). Root cause pinned: two stale caches ride every thread (the host snapshot's statedFacts store and 142's thread mirror trackStore._careerThread.facts, both frozen at the thread's last turn); (1) the host seed mergeStatedFacts (career_host.js:86) gave the THREAD copy precedence per identity (keyed via pushKeyed(f, true) :112; single-value kinds by replacement :113-116) with no version/timestamp check; (2) the recall read the poisoned working set (142:10088); (3) the recall turn's change-gated write-back (career_host.js:402, 430-433; handler-career.ts:266, 315) committed the regressed working set over the account — a pure read regressed the account. Second vector: 142's syncThreadIn (:4400) unioned the mirror by kind+VALUE (:4408), resurrecting a replaced keyed fact's old value as a duplicate. Exposure is the whole keyed carriage (recruiter_contact, hiring_manager, interview_day, company_preference, goal) + single-value kinds — the judge's sequence breaks recruiter_contact identically. Fix (branch muse/2026-10-21-goal-frame @ cea914fe): mergeStatedFacts' thread pass is append-only per identity (account authoritative; thread copies contribute only identities the account lacks entirely) + syncThreadIn identity-aware; guard extended with the judge's exact sequence for BOTH goal and recruiter_contact — base 6 pass/2 fail (both fail at the step-3 reply) -> fixed 8 pass/0 fail; precedence 9/9 byte-identical; sweep delta exactly +2/+2, failing set byte-identical. The live-replay idiom cannot express interleaved threads, so no B247-06 fixture — the .cjs guard carries the sequence. Status stays OPEN pending the judge's re-verification and a live deploy + live re-proof (judge 4-step sequence + battery 4-5). · Verified by: (open — live re-run of battery scenarios 4-5 after a deploy carrying the fix)
