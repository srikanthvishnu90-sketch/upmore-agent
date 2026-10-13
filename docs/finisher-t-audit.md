# Finisher Lane B — T-Task Evidence Audit (2026-10-13, branch career/fin-b)

Standard (from the scorecard, applied literally and brutally): PROMOTE-TO-PROVEN requires **all three legs** —
(a) the module file exists in `packages/domain` (named below), (b) unit tests exist and pass (named below;
full career suite re-run in this worktree: `node --test tests/career-*.cjs` = **311/311 pass**; finance
`tests/agent100` dry run = **103/103**), (c) **every** scenario mapped to the task in
`docs/scenario-ledger.md` (T-tasks column, ranges expanded) is COMPLETE in the ledger **and** has at
least one evidence `.messages.json` in `~/workspace/your_files/upmore-career-conversations/` with
top-level `status: "COMPLETE"` and a `role: "verification"` message.

Method notes / evidence hazards found while auditing:
- The ledger's T-task mapping is family-coarse (e.g. SC-061..120 all carry the same 19-task range), so one
  LEARN scenario blocks every task in its family. That is the standard as written; refining the mapping is
  the coordinator's call, not this lane's.
- **SC-121..SC-140 and SC-281..SC-285 are COMPLETE in the ledger but have NO `.messages.json` (or any)
  evidence files at all** in the conversations directory. 30 SC ids have no evidence file: those 25 plus
  SC-306..SC-310 (LEARN, consistent).
- Several SC ids carry duplicate `.messages.json` files with conflicting slugs/statuses (alternate
  gap-fill runs reusing the id, e.g. SC-028, SC-048, SC-176). Leg (c) credits an SC if at least one file
  for that id is COMPLETE+verification; the conflicting LEARN duplicates are noted where they matter.
- Tasks with **no** ledger mapping (their family rows have a blank T-tasks column, or the family's range
  omits them) are marked "mapped=0 (fallback)": per instructions the fallback is the scorecard's own
  module/exam description, which in every such case says "exam partial" / seam-level — so leg (c) cannot
  be satisfied and the verdict is STAYS-BUILT. That is stated per row.
- Fixes: **none made.** Every STAYS row's missing leg is scenario evidence, a ledger-mapping gap, a
  not-built sub-feature, or owner input — none is a lone wiring/unit-test gap against existing machinery,
  and generating the missing scenario evidence from this lane would be exactly the fabrication run 1
  was caught doing. No new bugs found, so no `docs/finisher-bugs-b.md`.

Counts: **54 BUILT audited — 14 PROMOTE-TO-PROVEN, 40 STAYS-BUILT, 0 fixed.**

## The 54 BUILT tasks

| T | Verdict | Evidence / exact missing leg |
|---|---|---|
| T-01 Universal people resolver | **PROMOTE-TO-PROVEN** | (a) `packages/domain/124-career-outreach.js` (`parseTarget`, `buildList`, `resolveCandidates`) + 135/138 graph; (b) `tests/career-outreach.test.cjs` pass; (c) mapped SC-001..060 (60) — all ledger COMPLETE, all have COMPLETE+verification evidence. Caveat kept from scorecard: real-name precision yield still needs the T-02 vendor; the exam as mapped is passed. |
| T-08 Public-exhaust people discovery | **PROMOTE-TO-PROVEN** | (a) 124 + `packages/domain/138-career-graphcore.js` (`publicSourceLookup`); (b) `tests/career-outreach.test.cjs`, `tests/career-graph.test.cjs` pass; (c) mapped SC-001..060 — all COMPLETE + evidence COMPLETE/verified. |
| T-09 Sponsorship intelligence | STAYS-BUILT | Missing leg (c): mapped=0 (fallback) — outreach family ranges skip T-09. Fallback (scorecard): "sponsorship notes sourced in CIRs where public data exists; full map needs LCA dataset pull" = exam partial. Leg (a) also weak: no dedicated module, notes inside `packages/career-data/cirs/*.json` + sponsorship text in 125. |
| T-10 Record-conflict court | STAYS-BUILT | Missing leg (c): mapped=0 (fallback) — no ledger row lists T-10. (a) 135-career-graph.js + 124 stale-title gate exist; (b) `tests/career-graph.test.cjs` pass; scorecard fallback says exam partial. |
| T-13 Networking composer at scale | **PROMOTE-TO-PROVEN** | (a) 124 (`draftFor`, `draftAndGate`, `qualityGate`, `scheduleCampaign`); (b) `tests/career-outreach.test.cjs` pass; (c) mapped SC-001..060 — all COMPLETE + evidence. (Live 500-person yield remains vendor-blocked per scorecard; not part of the mapped exam.) |
| T-15 Answer-bank engine | STAYS-BUILT | Missing leg (c): mapped SC-061..120 includes **SC-105 = LEARN** in ledger and its evidence file `SC-105-portal-status-check.messages.json` has status LEARN (no COMPLETE+verification file). (a) 123-career-tailor.js; (b) `tests/career-tailor.test.cjs` pass. |
| T-16 Story-bank builder | **PROMOTE-TO-PROVEN** | (a) `packages/domain/127-career-prep.js` (`captureStory`, `findStories`, PREP-004 story bank); (b) `tests/career-prep.test.cjs` pass; (c) mapped SC-304 only (appendix) — ledger COMPLETE, evidence `SC-304-fact-mining-interview.messages.json` COMPLETE + verification. |
| T-17 Cover-letter engine | STAYS-BUILT | Missing leg (c): SC-105 LEARN (see T-15). (a) 123 + 133-career-packets.js; (b) `tests/career-tailor.test.cjs`, `tests/career-packets.test.cjs` pass. |
| T-18 Multi-format renderer | STAYS-BUILT | Missing legs (c) SC-105 LEARN, and (a) partial: scorecard itself states "DOCX not built" (ATS text + HTML→PDF in 123/133 only). (b) tailor/packets tests pass. |
| T-19 Deliverability fortress | **PROMOTE-TO-PROVEN** | (a) 124 (`createSeedTest`, `seedGate`, `setSeedResults`, `monitorHealth`, `reconcileBounceDomains`); (b) `tests/career-outreach.test.cjs` pass; (c) mapped SC-001..060 — all COMPLETE + evidence (incl. SC-039 seed test, SC-034 bounce breaker). Live postmaster data needs the Gmail grant — outside the mapped exam. |
| T-23 Meeting negotiator | **PROMOTE-TO-PROVEN** | (a) 124 (`bookFromReply`, `proposeSlots`); (b) `tests/career-outreach.test.cjs` pass; (c) mapped SC-001..060 — all COMPLETE + evidence (incl. SC-031 reply-booking). Live calendar remains owner deploy+grant — outside the mapped exam. |
| T-28 Channel drafter | **PROMOTE-TO-PROVEN** | (a) 124 (`draftFor`, `campaignMetrics`, `dailyDigest`) + 126-career-track.js digests; (b) `tests/career-outreach.test.cjs`, `tests/career-track.test.cjs` pass; (c) mapped SC-001..060 — all COMPLETE + evidence. Note: scorecard's evidence line describes campaign reporting, not channel drafting; the drafting functions are the 124 draft engine above. |
| T-29 Universal form engine | STAYS-BUILT | Missing leg (c): SC-105 LEARN (see T-15). (a) 132-career-apply.js + 133; (b) `tests/career-apply.test.cjs`, `tests/career-packets.test.cjs` pass. |
| T-30 ATS template library / daily self-tests | STAYS-BUILT | Missing legs (c) SC-105 LEARN, and (a) partial: scorecard itself states "daily self-test is not a running service" (133 portal playbooks exist; the daily self-test service does not). |
| T-32 Verification-code autopilot | STAYS-BUILT | Missing leg (c): SC-105 LEARN. (a) 120-career-access.js seam (plan layer only, per scorecard); (b) `tests/career-access.test.cjs` pass. Live rail owner-gated. |
| T-33 Confirmation hunter | STAYS-BUILT | Missing leg (c): SC-105 LEARN. (a) 133; (b) `tests/career-packets.test.cjs` pass. Scorecard: real inbox hunting blocked on the Gmail grant. |
| T-35 Eligibility judge | STAYS-BUILT | Missing leg (c): SC-105 LEARN **and** SC-308 = LEARN in ledger with **no evidence file at all**. (a) 132 rule engine + 121-career-jobs.js fit eligibility; (b) `tests/career-apply.test.cjs`, `tests/career-jobs.test.cjs` pass. |
| T-39 Career inbox brain | STAYS-BUILT | Missing leg (c): mapped SC-121..145; **SC-121..SC-140 have no evidence files whatsoever** despite ledger COMPLETE (SC-141..145 do pass). (a) 126 (`classifyMessage`, `ingestMessage`); (b) `tests/career-track.test.cjs` pass. |
| T-40 Portal-status watcher (opt-in) | STAYS-BUILT | Missing leg (c): mapped=0 (fallback) — the Track family T column (T-39, T-41, T-42, T-44..T-46) omits T-40; its natural scenario SC-105 is LEARN. (a) 126 record layer; (b) `tests/career-track.test.cjs` pass. |
| T-43 Rejection autopsy engine | STAYS-BUILT | Missing leg (c): mapped=0 (fallback) — Track family range omits T-43. Its natural scenarios are split: SC-116 (COMPLETE, but mapped to the Apply tasks, not T-43) and SC-199 (LEARN). (a) 127 rejection pivot + 126 `rejectionAnalysis`; (b) prep/track tests pass. |
| T-44 Digest composer | STAYS-BUILT | Missing leg (c): **SC-121..SC-140 evidence files do not exist** (see T-39); its digest scenarios SC-130/SC-131 are in that gap. (a) 126 (`weeklyDigest`); (b) `tests/career-track.test.cjs` pass. |
| T-51 Recruiting-calendar service | STAYS-BUILT | Missing leg (c): mapped SC-221..270 includes **SC-242, SC-243, SC-244 = LEARN** (evidence files exist with status LEARN; no COMPLETE+verification file). (a) 126 `extractCirDeadlines` + CIR windows in `packages/career-data/cirs/`; (b) `tests/career-track.test.cjs` pass. |
| T-52 Comp data engine | STAYS-BUILT | Missing legs (c) SC-242/243/244 LEARN (see T-51), and (a) weak: no dedicated module — scorecard: "comp figures only from sourced CIR notes; coverage thin by design". |
| T-53 Company-risk radar | STAYS-BUILT | Missing leg (c): SC-242/243/244 LEARN. (a) CIR notes + 129-career-os.js watch; (b) `tests/career-os.test.cjs` pass. |
| T-54 Market-weather service | STAYS-BUILT | Missing leg (c): SC-242/243/244 LEARN. (a) 134-career-paths.js `sweMarketRead`; (b) `tests/career-paths.test.cjs` pass. |
| T-55 Sponsorship map | STAYS-BUILT | Missing legs (c) SC-242/243/244 LEARN, and (a) weak: no dedicated module — CIR notes only; scorecard: full map needs the LCA pull (see T-09). |
| T-56 Switcher mapper | STAYS-BUILT | Missing leg (c): SC-242/243/244 LEARN. (a) 134 switcher paths; (b) `tests/career-paths.test.cjs` pass. |
| T-57 Advice eval harness | STAYS-BUILT | Missing leg (c): SC-242/243/244 LEARN are in its mapped set. (a) 125 advice lint + SC-270 replay; (b) `tests/career-intel.test.cjs`, `tests/career-sc270-replay.test.cjs` pass — the harness exists; the mapped exam is not fully COMPLETE. |
| T-59 Mock examiner, text | STAYS-BUILT | Missing leg (c): mapped=0 (fallback) — Interview Prep rows SC-176..205 have a **blank T-tasks column**. SC-178's evidence file (`SC-178-full-text-mock-scored.messages.json`) is COMPLETE+verification but is mapped to no task in the ledger, so it cannot be credited under the standard. Fallback scorecard: "127 text mocks", exam partial. (a) 127; (b) `tests/career-prep.test.cjs` pass. |
| T-61 Interviewer dossier | STAYS-BUILT | Missing leg (c): mapped=0 (fallback, blank prep-family column); its natural scenario SC-181 is LEARN in the ledger. (a) 127 + 130-career-onboarding.js briefs; (b) prep/onboarding tests pass. |
| T-62 Technical prep engine | STAYS-BUILT | Missing leg (c): mapped=0 (fallback, blank prep-family column); natural scenarios SC-183/SC-184/SC-186/SC-187 are LEARN. (a) 127; (b) `tests/career-prep.test.cjs` pass. |
| T-63 Debrief miner | STAYS-BUILT | Missing leg (c): mapped=0 (fallback, blank prep-family column); natural scenario SC-189 is LEARN. (a) 127 debrief mining; (b) `tests/career-prep.test.cjs` pass. |
| T-64 Negotiation dojo | **PROMOTE-TO-PROVEN** | (a) `packages/domain/128-career-negotiation.js` (`roleplayTurn`, NEGO-004); (b) `tests/career-negotiation.test.cjs` pass; (c) mapped SC-206..220 (15) — all ledger COMPLETE, all have COMPLETE+verification evidence. |
| T-65 Coffee-chat coach | STAYS-BUILT | Missing leg (c): mapped=0 (fallback, blank prep-family column); natural scenarios SC-182/SC-190 are LEARN. (a) 127 + 124 coaching; (b) prep/outreach tests pass. |
| T-69 Opportunity watch | STAYS-BUILT | Missing leg (c): mapped SC-271..285; **SC-281..SC-285 have no evidence files at all** despite ledger COMPLETE. (a) 129; (b) `tests/career-os.test.cjs` pass. |
| T-70 Wins ledger → living resume | STAYS-BUILT | Missing leg (c): SC-281..SC-285 evidence files do not exist (see T-69). (a) 129 wins ledger; (b) `tests/career-os.test.cjs` pass. |
| T-71 Promotion packet builder | STAYS-BUILT | Missing leg (c): SC-281..SC-285 evidence files do not exist (see T-69). (a) 129 review/promotion packet; (b) `tests/career-os.test.cjs` pass. |
| T-72 Company playbooks | STAYS-BUILT | Missing legs (c) SC-281..SC-285 evidence missing, and (a) weak: no dedicated module — scorecard: "company playbooks = 37 CIRs + 134 ladders" (38 CIR files exist in `packages/career-data/cirs/`). |
| T-74 Career timeline keeper | STAYS-BUILT | Missing leg (c): SC-281..SC-285 evidence files do not exist (see T-69). (a) 129 career timeline; (b) `tests/career-os.test.cjs` pass. |
| T-75 One-tap connect layer | **PROMOTE-TO-PROVEN** | (a) `packages/domain/120-career-access.js` (`handleConnectGoogle`, `connectedAccounts`, gmail-oauth career grant); (b) `tests/career-access.test.cjs` pass; (c) mapped SC-286..300 (15) — all ledger COMPLETE, all COMPLETE+verification evidence (incl. SC-286 one-consent connect). LIVE proof still needs owner deploy + T1 grant — outside the mapped staging exam. |
| T-76 Cloud-browser session vault | **PROMOTE-TO-PROVEN** | (a) 120 (`healthPlan`, `browserConnectPlan`, session records); (b) `tests/career-access.test.cjs` pass (incl. Appendix B T8 session-death replay); (c) mapped SC-286..300 — all COMPLETE + evidence (incl. SC-288/SC-289). Live cloud-browser rail owner-gated — outside the mapped exam. |
| T-77 Vault credential manager | **PROMOTE-TO-PROVEN** | (a) 120 (`portalRecord` — vault REF only, secret values refused by construction); (b) `tests/career-access.test.cjs` pass (ACCS-005 vault-ref tests); (c) mapped SC-286..300 — all COMPLETE + evidence. |
| T-79 Action & consent ledger | **PROMOTE-TO-PROVEN** | (a) 120 (`auditEntry`, `auditLog`) + 132 audit trail + 139-career-safety.js consent ledger; (b) `tests/career-access.test.cjs`, `tests/career-apply.test.cjs`, `tests/career-safety.test.cjs` pass; (c) mapped SC-286..300 — all COMPLETE + evidence (incl. SC-292 audit view). |
| T-81 Privacy engine | **PROMOTE-TO-PROVEN** | (a) 120/139 privacy projections (allowlist; `portalRecord` allowlist-by-construction); (b) `tests/career-access.test.cjs` pass incl. BUG-F01-SC297 replay test, `tests/career-safety.test.cjs` pass; (c) mapped SC-286..300 — all COMPLETE + evidence (incl. SC-297). |
| T-84 Cost governor | STAYS-BUILT | Missing leg (a): **no cost/budget function exists in the cited modules** — grep for cost/budget in 124/132 finds only send `CAPS` (message caps, not money/token budgets). Scorecard itself: "per-app and per-campaign cost caps are an owner fill". Mapped SC-286..300 pass, but the task as defined (100-hard-tasks: per-user/per-campaign token + vendor-credit budgets) is not built. |
| T-88 Multi-user isolation | STAYS-BUILT | Missing leg (c): mapped=0 (fallback) — no ledger row lists T-88. Fallback scorecard: "per-user stores + shared-suppression design; not load-proven" = exam partial. (a)/(b) per-user stores exist across 120–139 with passing module tests. |
| T-90 Vendor abstraction | STAYS-BUILT | Missing leg (c): mapped=0 (fallback) — no ledger row lists T-90. (a) seams exist (e.g. 124 `createVerifier(opts.vendor)` injection) but are seam-level by the scorecard's own wording. |
| T-91 Feed mesh | STAYS-BUILT | Missing leg (c): mapped SC-306 + SC-307, both **LEARN** in the ledger with **no evidence files at all**. (a) 121 + 131-career-discover.js; (b) `tests/career-jobs.test.cjs`, `tests/career-discover.test.cjs` pass. Scorecard also notes F02's standalone aggregator module was lost uncommitted. |
| T-92 Company-identity resolver | STAYS-BUILT | Missing leg (c): mapped=0 (fallback) — no ledger row lists T-92. (a) 121 company-identity dedupe/normalizers; (b) `tests/career-jobs.test.cjs` pass; scorecard fallback: exam partial. |
| T-93 Notification discipline | STAYS-BUILT | Missing leg (c): mapped=0 (fallback) — Track family range omits T-93. (a) 126 (`planDelivery`, `quietReport`); (b) `tests/career-track.test.cjs` pass. |
| T-94 Onboarding interviewer | **PROMOTE-TO-PROVEN** | (a) `packages/domain/122-career-profile.js` onboarding fact-mining interview (+130); (b) `tests/career-profile.test.cjs`, `tests/career-onboarding.test.cjs` pass; (c) mapped SC-286..300 + SC-301..304 (19) — all ledger COMPLETE, all COMPLETE+verification evidence. |
| T-95 Preference learner | STAYS-BUILT | Missing leg (c): mapped SC-308 only — **LEARN** in ledger, **no evidence file**. (a) 122/124 preference + voice learning (`learnVoice`); (b) profile/outreach tests pass. |
| T-99 Thank-you & close-out engine | STAYS-BUILT | Missing leg (c): mapped=0 (fallback) — no ledger row lists T-99 (its natural scenarios SC-129/SC-163/SC-219 are mapped to other tasks). (a) 126 `draftThankYou` + 124 `thankYouDraft`/`closeOut` + 135; (b) track/outreach/graph tests pass. |
| T-100 Season orchestrator | STAYS-BUILT | Missing leg (c): mapped=0 (fallback) — no ledger row lists T-100. (a) `packages/domain/136-career-season.js`; (b) `tests/career-graph-w08.test.cjs` (requires 136; season dashboard/retro tests) pass. Scorecard fallback: "one full LIVE season blocked: owner deploy + grant". Note: the scorecard's T-100 row is malformed — its Task-name cell is blank, which is why automated counts read 53 BUILT; with T-100 the BUILT total is 54. |

## BLOCKED tasks — blocker verification (verdicts only; nothing built)

- **T-02 Email discovery + verification — CONFIRMED BLOCKED (owner input).** The seam is real:
  124 `createVerifier(opts)` uses an injected `opts.vendor.verify` if supplied and otherwise falls back
  to a local MX/pattern verifier; the module header states it holds no key/token/vendor credential, and
  no vendor key or config exists anywhere in the repo. The task's done-when (≥70% verified yield on a
  200-person known set, <2% hard bounces in real sends) cannot be met without a people-data vendor key +
  budget and real sends — all owner-supplied.
- **T-05 Population analytics — CONFIRMED BLOCKED (licensed data, not code).** The engine exists
  (125 `cohortStats`, CIR validator), and the validator *forbids* "population-backed" confidence when
  `sample_size` is null or <50. All 38 files in `packages/career-data/cirs/` have `sample_size: null`
  (curated-qualitative basis); `packages/career-data/` contains only `cirs/`, `firm-sets.json`,
  `fixtures/` — no licensed population dataset. Owner vendor + budget required; CIR distributions
  correctly stay qualitative until then.
- **T-60 Mock examiner, voice — CONFIRMED BLOCKED; NOT finishable without the owner.** What actually
  exists: (1) 127 `voiceMockAvailability()` returns `{available:false, reason:"No voice rail is wired
  for interview prep in this build.", fallback:"text mock (PREP-003)…"}`; (2) the only speech seam in
  the repo is Web Speech `SpeechRecognition` dictation into the *finance* chat input in
  `src/upmore-app-template.html` — by its own comment hidden where unsupported (e.g. iOS Safari) — and
  it is not wired to prep; (3) **no TTS seam exists at all** (no `speechSynthesis`, STT/TTS provider,
  Whisper/Deepgram/ElevenLabs anywhere in packages/src/supabase); (4) `tests/voice.test.cjs` +
  `evals/voice/gold` concern `46-voice.js`, a text *style* composer for finance answers — not speech.
  Note SC-179's COMPLETE was earned by honestly reporting not-wired + running the text fallback, not
  by a voice mock. Finishing needs the owner to reverse the v1 scope-out, choose/fund an STT+TTS
  provider, and do real-device verification. Verdict: **no.**
- **T-87 Design-review sweep — MISCLASSIFIED: runnable without the owner; it is a not-run task, not a
  blocked one.** `docs/design-review/` does not exist (only referenced in `docs/pivot-audit.md`).
  Per the 100-hard-tasks list the sweep is "every card and screen photographed and reviewed against
  the design bar on each build" — no vendor, key, data, or owner decision is missing. Existing surface
  renders are available to review: the `.html`/`.png` companions of the 386 evidence transcripts in
  `~/workspace/your_files/upmore-career-conversations/`. What it would take: (1) inventory those
  renders (+ any app screens), (2) review each against the design bar (the scorecard's 4+1 design
  point / BENCHMARKS.md), (3) write findings into `docs/design-review/`. That is labor and a
  scheduling decision — the coordinator's — not an external blocker. Verdict: **yes, runnable.**

## PROVEN sample sanity check (6 of 42, `random.Random(13).sample`)

| T | Result under the same standard |
|---|---|
| T-22 Reply brain | PASS — 124 reply brain; outreach tests pass; mapped SC-001..060 all COMPLETE + evidence. |
| T-25 Follow-up sequencer | PASS — 124 `runFollowUps`/`scheduleFollowUps`; mapped SC-001..060 all COMPLETE + evidence. |
| T-31 Portal account manager | **FLAG — fails leg (c)**: its mapped set (SC-061..120 family range) includes SC-105 = LEARN with LEARN evidence. |
| T-36 AI-disclosure compliance | **FLAG — fails leg (c)**: SC-105 LEARN is in its mapped set. |
| T-38 Batch orchestrator | **FLAG — fails leg (c)**: SC-105 LEARN is in its mapped set. |
| T-89 Rate-limit citizenship | **FLAG — leg (c) unverifiable**: T-89 appears in no ledger T-tasks column at all (mapped=0), so no scenario evidence can be credited under the standard. |

Wider note for the coordinator (same script, all 42 PROVEN rows): **24 of 42 PROVEN rows have at least
one mapped scenario that is LEARN or missing evidence** — driven by SC-105 (Apply family), SC-242/243/244
(Intel family), SC-121..140 + SC-281..285 missing evidence files (Track / Career-OS families), SC-309/SC-310
(appendix), and unmapped tasks (T-24, T-66, T-86, T-89). This audit does not edit the scorecard; the flags
are reported here only. The pattern is consistent with family-coarse mapping plus two evidence gaps
(SC-121..140, SC-281..285) — closing those two gaps and refining per-task mapping would change most flags.

## Suite results in this worktree

- `node --test tests/career-*.cjs` → 311/311 pass.
- `tests/agent100` dry run (`node harness/runner.js --mode dry --all`) → 103/103.
- Spot suites for blocker/sample work (`tests/voice.test.cjs`, `tests/career-prep.test.cjs`,
  `tests/career-access.test.cjs`, `tests/career-graph-w08.test.cjs`) → 50/50 pass.
- No code or test changes were made on this branch; the only new file is this audit.
