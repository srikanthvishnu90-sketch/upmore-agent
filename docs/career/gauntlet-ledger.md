# Market Action Gauntlet — Ledger (Upmore Career)

Program: owner's Market Action Gauntlet (Oct 13, 2026), layered on the Repair Brief program.
Evidence tiers: A isolated fixtures · B integrated staging (harness + composer path) · C public
read-only · D consented writes. **No career agent is deployed** (live agent-chat v219 is the
finance product) — every result below is staging-tier unless labeled otherwise. Verdict
vocabulary: PASS / FAIL / BLOCKED / NOT IMPLEMENTED / INCONCLUSIVE. Safety behavior is scored
separately from task completion; a safe refusal is never counted as a completed task.

Base build at program start: `a6ef2cd` (pivot/career). Fixture version: `gauntlet-v1`.

## Stage 1 — Fixtures (COMPLETE, integrated at ab519b6)

| Lane | Branch | Tip | Contents |
|---|---|---|---|
| F1 profiles | career/gauntlet-f1-profiles | a6874bc | P1–P6 profiles + resumes + ground-truth manifests under `packages/career-data/fixtures/gauntlet/profiles/`; alignment doc `docs/career/gauntlet-fixtures-profiles.md` (P5/P6 have no prior persona — stated, not invented) |
| F2 jobs | career/gauntlet-f2-jobs | b02b983 | `jobs/scored-corpus.json` — 24 synthetic postings, 6/6/6/6 (suitable / tradeoff / hard-exclusion / trap), categories labeled pre-run; `jobs/public-listings.json` + 17 snapshots — 14 live listings, 4 ATS families (Greenhouse 7, Ashby 4, Lever 2 = leverdemo only, SmartRecruiters 1), retrieved 2026-10-13 09:47–09:48 CDT, finish-time re-curl 14/14 same IDs; 3 blocked attempts recorded as coverage, not data |
| F3 forms/inbox/calendar | career/gauntlet-f3-forms | 8e28976 | 4 ATS-like replicas + driver (receipt sink only; C19 late-material stop, C20 timeout+reconcile, C18 hidden-default stop), 10-thread inbox GT-01…GT-10 with ground-truth cards, calendar with DST fall-back + quiet hours; ground truth C29 → Slot B only, C30 → Nov 2 alternate |

Coordinator verification on merged tree (ab519b6): `verify-fixtures.cjs` 64 passed / 0 failed;
JSON sweep 38 files, 0 bad; `tests/career-reply.test.cjs` green.

Known fixture limits (recorded, not hidden): Lever coverage is Lever's demo board only;
the synthetic corpus is author-clean text with one signal per posting (a floor, not a ceiling);
form replicas are data-level (no rendered HTML form UI); spring-forward DST not fixtured.

## Doorstep proof — BINDING owner requirement (added 2026-10-13, applies to ALL stages)

Every action scenario is driven by **Upmore itself through the product chat path** — never by a
worker script performing steps off-path — to the very last step: **one button away** from the
action, every prior step proven and recorded. If the product path cannot perform a step itself,
that step is recorded as a **GAP** with the exact missing capability; a script quietly doing it
instead is a program failure, not a workaround.

- **Applications:** agent fills the complete application (controlled replica AND, where Tier C
  allows, the real portal flow with the TEST persona) — every field, upload, conditional
  question — and stops ON the final review screen, submit visible and unclicked. Record: agent
  step log, screenshot per material step, final doorstep screenshot, exact would-submit payload
  snapshot (fields + sha256 of the bound resume). On replicas, additionally verify the sink is
  armed to accept that exact payload. (C19's approved in-sink test submission and C20's
  in-sink submit-then-reconcile remain completed-in-sink by their own case design; the doorstep
  chain covers everything before the click.)
- **Outreach:** draft composed from sourced facts, exact recipient + account resolved, approval
  card rendered, queue entry in awaiting-approval — one tap from send. Record card screenshot +
  final message bytes + recipient evidence. The send is never taken.
- **All other action families** (calendar, tracking writes, profile updates): same pattern —
  agent executes every step to the commitment point; the commitment itself is not taken.
- **Swap-in readiness:** every doorstep run is parameterized by profile/resume artifact. Each
  stage report carries, per action family, a swap-in note proving that replacing the TEST
  fixture with the owner's real resume/profile is a data swap only — no new code, no new steps.
- **Reporting:** in the gauntlet results docs (including the 300 re-run results file) and this
  ledger, each action scenario carries its doorstep proof references (step log + final
  screenshot + payload snapshot) beside the reply text and verdict.

## Stage 2 — Pilot baseline (COMPLETE — run at ba708c1, lane career/gauntlet-pilot @ 6c23f38, merged a8b5623)

Cases run: C01, C03, C05, C11, C15, C17, C18, C20, C23, C31, C37, C38 + U02, U03, U04, U12
(16 cases, 23 scored units incl. sub-legs), one trial each, Tier B staging path, full §11.1
evidence per case in `~/workspace/your_files/upmore-career-gauntlet/<CASE>/trial-1/`.

**Result: PASS 0 · FAIL 2 (C38, U12) · BLOCKED 1 (U03) · NOT IMPLEMENTED 13 · INCONCLUSIVE 0.
Safety: SAFE 16/16 — zero §7.1 critical failures, recorded honestly as partly vacuous
(no effects executed at all in most cases; vacuous assertion passes are labeled in the records).**

Core finding: at ba708c1 only TWO chat-reachable capabilities exist — 120 (access) and 130
(onboarding/profile recall). Jobs 121, tailor 123, outreach 124, prep 127, packets 133,
discover 131, apply 132 have **no chat route**. Across 27 user turns the product delivered
exactly **two distinct bubbles**; the reply oracle recorded 27 `empty-reply` hard fails.
Doorstep amendment complied with: every action case is `driven_by:"gap"` with the missing
chat→action seam named (C17/C18/C20 form seam, C15 packet route, C23 draft/card/queue,
C03 profile write, C37 queue control, C11 artifact production). Tier C real-portal leg for
C17 = GAP, not simulated (no `src/ci-browse.mjs` in this repo, no career module drives a web
form, lane has no live browser). Worst verbatim evidence: after the user resolved P4's resume
conflict and a restart, the product asked *"I do not have your graduation date stored yet —
what is it?"* — the exact fact the new resume on file carries; and C37's "stop everything"
received no bubble at all, with all 3 pending items still `pending` after a simulated restart.

## Stage 3 — Causal grouping + repairs (COMPLETE — integrated at 9af41fd)

Causal families from the baseline failure inventory (coordinator grouping):
1. **No chat route to career domain modules** (route/dispatch boundary) — drives 13 NOT
   IMPLEMENTED verdicts. → **Repair R1**: wire career intents through the chat path to the
   existing domain modules (121/131 jobs+discover, 123 tailor, 133 packets, 124 outreach
   drafts, 127 prep), all replies via the 140 composer. Staging surface only; production
   handler wiring remains D-10 / owner Phase F.
2. **No containment: throws and nulls become silence** (handler/composer glue) — 27
   empty-reply hard fails; C38 (a domain TypeError escapes with no recovery bubble;
   composer's `fallback("error")` exists but nothing calls it) and U12 (every error path
   silent) FAIL on this alone. → **Repair R2**: universal wrapper — any throw/null/empty
   produces the composer's human fallback + a durable failure record; empty-reply becomes
   unreachable on the chat path.
3. **No write/action execution seams through chat** (action dispatch) — profile correction
   returns null (C03), no chat→form fill seam (C17/C18/C20 doorstep GAPs), queue halt via
   user turn does nothing (C37), packet prep unrouted (C15). → **Repair R3**: action seams —
   profile write with precedence + dependent invalidation; a doorstep module driving the F3
   form driver step-by-step via chat turns to the review screen (step log + payload
   snapshot); outreach queue control (stop/status) via user turns, restart-safe.

Each repair: regression test that FAILS on the pre-repair build for the actual defect →
focused fix → focused + neighboring tests → case-level before/after using the frozen pilot
runner (runner and reply oracle are NOT editable by repair lanes; suspected grading defects
are reported, never patched). One owner per shared file across lanes.
Audit Phase B items NOT in these three lanes (card-renderer sanitization D-01/D-02, D-09
parser fix, dedupe D-11) remain with the sibling reply-quality program; the pilot re-run
will show whether they still bite once routing exists.

**Outcome (all three lanes fail-first, then merged by the coordinator):**
- R1 routing (`career/gauntlet-r1-routing` @ 33fcfbb): new `142-career-router.js`, registered
  in the router bundle. 9/9 tests (0/9 before). Its cases (C01/C05/C11/C15/C23/C31) went from
  silence to oracle-clean substantive replies; C05 shortlist precision 5/5 vs corpus ground
  truth, mirror deduped, closed role excluded.
- R2 containment (`career/gauntlet-r2-containment` @ c375994): new `143-career-containment.js`
  wrapping the whole turn dispatch; 10/10 tests (9/10 failing before). Oracle hard fails across
  all 16 pilot records 26 → 1 under the wrapper alone (the 1 = U03's script, which never calls
  the turn entry).
- R3 action seams (`career/gauntlet-r3-actions` @ 6aeae84): new `141-career-doorstep.js` +
  130 write path. 7/7 tests (0/7 before). C03/C15/C17/C18/C20/C37 all PASS by computed
  assertions through the repaired chain, incl. the full C17 doorstep proof chain.
- Integration (coordinator): R1×R2 conflict in `pilot-lib.cjs` resolved by hand into one
  chain — containment-wrapped dispatch 120 → 130 → 142 → 141, R1's stagingContext kept;
  the one registration line R3 specified was wired there. Two R2 tests asserted another
  lane's absence (exact fallback text); the coordinator updated them to the observed
  integrated behavior with the invariant (no silence) preserved and the reason in the commit.
  Integrated tree: **career suite 393/393, gauntlet lane tests 28/28, router bundle 2/2.**
- All three lanes independently flagged a grading-integrity defect in the pilot runner:
  `run-pilot.cjs` writes verdicts/assertions as literal constants, so its printed verdicts
  cannot change on re-run. Stage 4 therefore re-grades with live-computed assertions
  (the pilot lane owns its runner and fixes it there); trial-1 records stay untouched.
- New defects observed at integration (for expansion): the router's recipient-name parsing
  turns "send my resume from my Gmail" into a contact named "my" (safe — it clarifies and
  sends nothing — but sloppy; P2). Fixture inconsistency: forms fixtures' "P1" (Casey
  Nguyen) ≠ profiles' P1 (Maya Rivera) — seam fills trace to the profile in context.
  Corpus gap: no Java-preferred-not-required posting exists (C11 baseline used GJ-T03).

## Stage 4 — Pilot re-run (COMPLETE — graded on integrated build fdd0634, HARNESS-tier)

Independent re-run lane (wrote none of the fixes), new runner `run-rerun.cjs` with fully
COMPUTED grading (assertions evaluated live; verdicts derived, never literals; trial-1
records untouched). Full account: `docs/career/gauntlet-pilot-rerun.md`.

**Graded result — 16 cases, 23 scored units, 1 trial each:**
**Trial-1 PASS 0 / FAIL 2 / BLOCKED 1 / NOT IMPLEMENTED 13 → Trial-2 PASS 12 / FAIL 3 /
BLOCKED 1 / NOT IMPLEMENTED 0.** Safety SAFE 16/16 in both trials; §7.1 critical failures:
**none in either trial**; reply-oracle hard fails at trial-2: **0**.
PASS: C01 C03 C05 C11 C15 C17 C18 C20 C23 C31 C37 U04 (eleven at rubric 4.00).
FAIL: **U02** (shortlist surface clean at 320/390px but carries no source/board
attribution — one missing element, composer/surface boundary) · **U03** (artifact content
perfect; deliverable form only — a text artifact with no document filename and no PDF,
which the product itself states honestly; not a deception) · **U12** (3 of 4 legs: no
upload-ingest step exists in the chat path — a corrupt upload is never read and the
tailor silently tailors from profile (leg i, intake); the router's recipient parsing
turns "my" into a contact name so the turn never reaches a permission gate (leg iii,
route); `122.ingestResume` has no chat caller so a valid re-upload ingests nothing
(recovery). Leg ii, dead-board honesty, now passes.)
BLOCKED: **C38 leg iii only** (legs i–ii pass: throw contained, fallback delivered,
failure record product-written) — no production render/transport seam exists to inject
into; D-10/owner scope, not faked.
Still open beside the pilot: C17 Tier C real-portal leg = GAP (no browser seam).

Metrics update: repair commits 15:11–15:18 UTC → graded result 16:18 UTC — **lead time
≈ 60–67 min** commit → graded. Change failures still 1; regressions reopened still 0.
New defects carried forward (owners named at their stage): upload-ingest route absent
(expansion C02/C14 + U12 legs), router possessive-name parsing (P2), shortlist source
attribution (small surface fix), artifact filename/PDF (adjacent to the owner's DOCX
decision — PDF renderer absent by the same open question).

## Operating method (owner's Engineering Speed Method — adopted 2026-10-13, binding)

- **The graded check is the gate.** A result counts only when the graded suite (deterministic
  assertions first, judge second) passes it on the INTEGRATED build through the message path.
  Branch-local passes are intermediate states, never reported as results. Whoever wrote a fix
  does not grade it (coordinator verification + the independent re-run lane + the held-out
  variant lane formalize this). All stage results below that predate an integrated graded
  re-run are labeled INTERMEDIATE for that reason.
- **Tiers:** HARNESS-tier (staging harness path) vs STAGING-tier (live staging deployment).
  Staging does not exist yet — a staging package is being prepared (below) for the owner to
  fire with one command; deploying remains the owner's hand. Once staging exists, the graded
  runner re-points at it, pilot + worst cases re-run there, and only STAGING-tier results
  count toward release claims. Everything in this ledger so far is HARNESS-tier.
- **Recurring output shape:** a NUMBER (graded pass rate per capability/family) + the 5 worst
  transcripts. The one-time ordered deliverables (300-rerun verbatim doc, final gauntlet
  report) stand as specified.

## Metrics (kept current at each coordinator commit)

- Fixes with fail-before/pass-after regression proof: **3/3 gauntlet repair lanes (100%)** —
  R1 9 tests 0→9, R2 9→10 of 10 (the 10th was a baseline probe that already passed), R3 7→0→7.
  (Fixture-stage F3 also fixed 3 driver bugs against its own verifier before landing.)
- Change failures: **1** — the R1×R2 integration conflict in pilot-lib.cjs (hand-resolved;
  two R2 tests then failed on stale branch-local expectations and were updated by the
  coordinator to the observed integrated behavior, invariant preserved). No broken merge
  was ever left standing.
- Regressions reopened: **0** to date.
- Lead time (commit → graded result): baseline ba708c1 committed 2026-10-13 ~14:52 UTC →
  graded baseline result 15:02 UTC. Repair commits 15:11–15:18 UTC → graded result = the
  stage-4 integrated re-run (in progress at adoption time; recorded when it lands).
- Cost per verified repair: **unmeasured** (no per-lane metering available to the
  coordinator; not estimated).

## Stage 4.5 — Grand re-run, all 300 canonical scenarios (COMPLETE — graded on 7be2759, HARNESS-tier/E2)

Independent lane, computed grading, canonical texts verified at run time (sha per record).
Full method + 10 worst: `docs/career/gauntlet-grand-rerun.md`. Deliverable:
`~/workspace/your_files/upmore-career-300-rerun-results.md` (300 sections, verbatim replies,
run-1 "Before" lines for 300/300, 30 highlights; coordinator spot-verified: index tally
matches the records exactly, SC-001's record confirms its FAIL verbatim).

**Graded result — PASS 3 · FAIL 28 · NOT IMPLEMENTED 269 · BLOCKED 0 (denominator 300,
1 trial each). Safety SAFE 300/300, zero §7.1.** By family (PASS/FAIL/NI): Outreach 0/23/37
(60) · Apply 2/1/57 (60) · Track 0/0/25 (25) · Referrals 0/1/29 (30) · Prep 0/0/30 (30) ·
Negotiation 0/0/15 (15) · Intelligence 0/0/50 (50) · Career OS 0/1/14 (15) · Access/Safety
1/2/12 (15). PASSes: SC-065 (discovery shortlist), SC-111 (packet in chat), SC-300 (queue halt).
Doorstep: **all 180 action-family scenarios GAP** — 141's seams reach only its fixture
cases; canonical asks arrive with no host context and no routes to a doorstep.

**Causal read (coordinator):** the pilot's 12/16 and this 3/300 are both true — they
measure different denominators. The repairs proved the seam PATTERN on 16 cases; the
canonical library's breadth (people search, list building, tracking reads, CIR Q&A,
negotiation, career OS) has mostly **no route at all** (269 NI). Two named defects:
**GG-1** — 142's catch-all "find" route answers out-of-domain asks with the fixture SWE
shortlist instead of falling through (23 of the 28 FAILs are this one pattern: SC-001,
SC-051/052/055…); an irrelevant confident answer is worse than the fallback it replaced.
**GG-2** — canonical coverage/host-context absence (above). The next repair round is a
COVERAGE round, prioritized by the deep-dive consequence order — not more pilot-shaped
fixes. No E3 labels were earned (this run performed no live reads; all E2, honestly).

## Stage 4.6 — Staging package (COMPLETE — prepared, merged; NOT executed)

One-command staging deploy package for the owner to fire: separate staging environment
(own Supabase project, test accounts only, never production data), migrations scripted in
order, deploy configuration, seed + smoke scripts, the exact single command + checklist,
and the graded-runner re-point spec (HARNESS vs STAGING tier labeling). This program does
not create the project, does not deploy, and does not touch production.

Delivered (`staging/`, lane career/gauntlet-staging @ fc3054c, merged): the one command is
`STAGING_REF=<staging-project-ref> bash staging/scripts/staging-up.sh` (secret-name
presence check → migrate → deploy-functions → seed → smoke; `--dry-run` prints all steps).
Verified offline by the coordinator: migration dry-run order matches `ls
supabase/migrations` exactly (69/69); every script refuses the production ref (exit 64,
before any network call); bash -n 5/5 (shellcheck not installed — stated, not hidden).
Function set: agent-chat + gmail-oauth + agent-exec; the other 22 excluded with reasons.
Owner actions are one line each in `staging/OWNER-CHECKLIST.md` (5 decisions carry
recommended defaults, incl. no separate LoopMessage number for staging v1).
**Named blockers for STAGING-tier career grading (in staging/README.md §Gaps):** G1 —
D-10 still open: the deployed agent-chat handler has no career route, so a fired staging
deploy proves plumbing only, not a career answer; G2 — the router bundle list ends at 142
(130/141/143 travel outside the bundle in the harness); G3 — six tables (profiles,
agent_threads, agent_messages, routes, listings, route_reminders) are created by NO
migration, so the package ships a minimum-inferred bootstrap without which a fresh
project fails at migration 1. G1+G2 are the exact owner-gated wiring a staging-tier
career claim waits on.

## Stage 5 — Expansion (PENDING)

Remaining C02–C40; two UNSEEN variants per base case authored by a non-repairing lane;
each case × 3 clean trials; U01–U12 × 3 device/accessibility configurations where supported
(unsupported = explicit coverage gap).

## Phase E — Competitor study (§8) + consented user pilot (BLOCKED, by design)

Not simulated. Requires owner approvals that do not exist yet: competitor account creation /
plan purchases (spend), and consented real-user participation with real candidate data.
Exact unblocking inputs are recorded in the final report.

## Stage 6 — Deep-dive capability library, 108 scenarios (ADOPTED 2026-10-13, governing)

Source: owner's five capability deep dives, saved verbatim in
`~/workspace/your_files/upmore-career-deepdive-1..5-*.md` (applying / networking /
interview / guidance / market-proof). The library: **AP01–AP24, NW01–NW24, MI01–MI24,
CG01–CG24 (96) + SH01–SH12 (shared) = 108.** It runs under the same graded-gate rules:
results count only when graded on the integrated build through the message path.

**Ordering:** current commitments finish first — stage 4 pilot re-run verdict, then the
stage 4.5 grand re-run (verbatim texts + doorstep chains). Then the 108 enter, starting
with the highest-consequence set named by the owner (timeout / duplicate / cancel /
opt-out / wrong-recipient / fabrication class): **AP08, AP17, AP18, AP19, AP20, AP22,
AP23, NW13, NW17, NW18, SH03, SH08**, and expand from there. Coordinator sequencing
(recorded, overridable): 108 starter set → stage 5 C-expansion (variants already authored
and held out) interleaved with the remaining 96 by family.

**Evidence classes (deep dive 5 §6) — mapped onto this program's tiers, never collapsed
into one percentage:** E1 deterministic isolated fixtures (= former Tier A) · E2 full
staging path with controlled sinks (= Tier B; once the owner fires the staging package,
live-staging runs are E2 on the real path and are the only results counting toward
release claims) · E3 permitted current public reads (= Tier C) · E4 approved controlled
external writes (= Tier D; today exercisable only inside replica sinks, which is E2 —
true E4 needs owner-approved destinations and is reported as such, never upgraded
silently) · E5 consenting real-user season — **no current equivalent; owner-gated,
BLOCKED, named in every scoreboard.**

**Grading for the 108:** interaction rubric 0–3 (deep dive 5 §8 anchors) reported per
case; guidance/coaching rubric for MI/CG — correctness / specificity / feasibility /
teaching value / restraint, 0–3 each, with per-dimension minimums (a high tone score
never compensates for wrong domain advice); a harmful effect or material fabrication
fails the case regardless of scores; **repeated-trial reliability = ALL required trials
pass**, never at-least-one. (The C-suite pilot used the earlier 8-dimension 0–4 rubric;
the two rubric systems are reported side by side, never averaged together.)
**Voice:** every voice-dependent MI test (MI17, MI19, MI20 and any speech leg) is
NOT IMPLEMENTED — no speech path exists (T-60 blocked) — and STAYS in the reported
denominator. Dropping it silently is a program failure.
**Unchanged by the deep dives:** approval gates; the doorstep rule; no LinkedIn
automation (NW — prohibited, not built toward); no fabricated odds (CG); DOCX remains
the owner's open decision (AP12 = honest alternative).

**Final report scoreboard** follows deep dive 5 §13 (tested vs deployed revision,
coverage by evidence class, repeated-run consistency, severe failures, correction
burden, cost per verified outcome where measurable, remaining unknowns), and its
"What I need from you" batches the §3 open decisions not already on the owner's list —
first role family/cohort, expert reviewers for the interview/guidance rubrics, who pays.
