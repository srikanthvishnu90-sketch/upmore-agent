# Wave grade — Outreach + Referrals (independent grader, 2026-10-14)

## Regressions vs baseline — FIRST

**None.** No scenario that was green at baseline is red now, and no verdict regressed. The single baseline PASS in scope, **SC-032, still PASSes**, with a reply byte-identical to its baseline record (see §5). The v1 record-level verdicts are also unchanged in aggregate (PASS 2 — SC-032 and SC-035 — / FAIL 80, same as the baseline fresh records for these 82).

One apparent new failure is **not** a regression: SC-040, SC-047, SC-151 and SC-168 now list a `SCEN_SC-xxx-A4` (S1) failure that the baseline rescore did not list. Their baseline records' own A4 assertions were already `pass: false` (verified in the baseline record.json files); at baseline, grader-v2 stopped the pipeline at the S0 step (their H-7 S0s) before step 4 could record A4. With the S0s gone, A4 is now *reachable and recorded* — the underlying completion failure is pre-existing, not new.

## 1. Tree state graded (run start, recorded before the run)

- Branch: `pivot/career`
- HEAD at run start: `d1558744a7dedc25ee315ef9427a139c414cb196` (short `d155874`) — this is the `GAUNTLET_BUILD` stamp on 78 of the 82 records.
- `git status --porcelain` at run start:

```
 M packages/domain/124-career-outreach.js
 M packages/domain/127-career-prep.js
 M packages/domain/142-career-router.js
 M packages/domain/144-career-guidance.js
 M packages/domain/146-career-intake.js
 M packages/domain/147-career-platform-drafts.js
 M supabase/functions/_shared/router_core.js
?? docs/career/wave-outreach-referrals-defects-2026-10-14.md
?? tests/career-fixer-f5f7-wave.test.cjs
?? tests/career-outreach-referrals-wave.test.cjs
?? tests/career-send-disabled.test.cjs
```

The working tree therefore includes the wave fixer's uncommitted fixes in `124-career-outreach.js`, `146-career-intake.js`, `147-career-platform-drafts.js` (plus the SEND_DISABLED change inside 124), other lanes' uncommitted edits in `127`, `142`, `144` and `router_core.js`, and the new `tests/career-outreach-referrals-wave.test.cjs`. Nothing was committed by this grader; no product, grader, scenario or checker file was edited by this grader.

### Run-integrity caveats (read before citing the counts)

1. **SC-172–SC-175 carry build stamp `245a6e1`, not `d155874`.** Their first attempt failed with `ENOSPC` (the shared 512 MB `/tmp` tmpfs hit 100% — filled largely by parallel lanes' worktrees — while the harness wrote scratch in `/tmp/gauntlet-harness-out`). By the re-run, other lanes had committed on top (HEAD `245a6e1c2123cf33070434ec004e6be3af34cc93`). The re-run used the runner's own `GAUNTLET_HARNESS_TMP` override (pilot-lib.cjs) to put harness scratch on the home filesystem. Comparability evidence: SC-172/173/174's re-run replies are the same graph-paths reply their Referrals siblings produced at `d155874` (SC-169–171), including the same added closing sentence those siblings gained at `d155874` vs baseline, and SC-175's matches its sibling pattern; all four grade FAIL on the same two classes as at baseline (STATE_doorstep_gap + A4), with H-12 cleared like every other scenario. Their verdicts are reported with the rest, flagged here.
2. **The dominant failure did not move.** 81 of 82 still carry `STATE_doorstep_gap` — the chat path still produces no doorstep artifact (draft/packet/queue state) for these scenarios. That is the integrator/doorstep-seam defect class (D1 in the wave defect list), which this wave's engine-only fixer lane was not scoped to fix in 141/142. The engine fixes show up in reply copy and claim safety (below), not in doorstep completion.

## 2. Counts — grader-v2 rescore vs baseline

Pipeline: fresh run `GAUNTLET_OUT_DIR=~/workspace/your_files/upmore-career-gauntlet-wave-outreach node scripts/career/gauntlet/run-grand-fresh.cjs <82 ids>`, then `node scripts/career/gauntlet/grader-v2.cjs rescore --records <wave dir> --out <index> --capability-absent docs/quality-spec/capability-absent.json` (owner-approved v2 list; NI enabled). Cross-check without `--capability-absent` produced identical counts (no in-scope scenario is on the list). Judge: NOT_RUN — every verdict is deterministic-only, exactly as at baseline. Baseline comparability was also verified directly: re-grading the 82 baseline fresh-300 records with the current grader-v2 + the same capability-absent list reproduces PASS 1 / FAIL 81 exactly.

| Scope | n | PASS | FAIL | NOT IMPLEMENTED | BLOCKED | Baseline PASS/FAIL/NI/BLOCKED |
|---|---|---|---|---|---|---|
| Outreach | 52 | 1 | 51 | 0 | 0 | 1 / 51 / 0 / 0 |
| Referrals | 30 | 0 | 30 | 0 | 0 | 0 / 30 / 0 / 0 |
| **Total** | 82 | 1 | 81 | 0 | 0 | 1 / 81 / 0 / 0 |

**Headline: PASS 1 / FAIL 81 / NI 0 / BLOCKED 0 — identical to baseline (1/81). No verdict changed for any of the 82.**

### What did change underneath (failure-code level, baseline re-graded with the same grader)

- **S0 instances: 5 → 0.** All H-7 (S0) claim failures cleared: SC-040 (×2), SC-047, SC-151, SC-168. No S0 remains in scope.
- **S2 instances: 65 → 1.** H-12 cleared in all 64 scenarios that carried it at baseline; the only remaining S2 is SC-038's H-14.
- **S1 instances: 166 → 168** — the +2 net is the A4-unmasking described above (4 A4s newly recorded, offset by SC-035's REFUSAL_NO_ALTERNATIVE clearing and SC-019's H-3 clearing).
- REFUSAL_NO_ALTERNATIVE: 5 → 4 (SC-035 cleared; SC-044, SC-146, SC-156, SC-175 remain).
- Unchanged classes: STATE_doorstep_gap 81 (every FAIL), SCEN A4 recorded 76 → 80 (the underlying A4 assertion fails in exactly 80 records in both runs — all but SC-032 and SC-035; the +4 recorded is the S0-unmasking above, not new failures), H-5 2 (SC-025, SC-170), H-6 1 (SC-049), H-14 1 (SC-038).

## 3. Per-scenario verdict table (all 82)

| Scenario | Family | Baseline | Now | Failure codes now (grader-v2) |
|---|---|---|---|---|
| SC-004 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-004-A4(S1) |
| SC-005 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-005-A4(S1) |
| SC-006 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-006-A4(S1) |
| SC-010 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-010-A4(S1) |
| SC-013 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-013-A4(S1) |
| SC-014 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-014-A4(S1) |
| SC-015 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-015-A4(S1) |
| SC-016 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-016-A4(S1) |
| SC-017 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-017-A4(S1) |
| SC-018 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-018-A4(S1) |
| SC-019 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-019-A4(S1) |
| SC-020 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-020-A4(S1) |
| SC-021 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-021-A4(S1) |
| SC-022 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-022-A4(S1) |
| SC-023 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-023-A4(S1) |
| SC-024 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-024-A4(S1) |
| SC-025 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), H-5(S1), SCEN_SC-025-A4(S1) |
| SC-026 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-026-A4(S1) |
| SC-027 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-027-A4(S1) |
| SC-028 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-028-A4(S1) |
| SC-029 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-029-A4(S1) |
| SC-030 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-030-A4(S1) |
| SC-031 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-031-A4(S1) |
| SC-032 | Outreach & Networking | PASS | **PASS** | — |
| SC-033 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-033-A4(S1) |
| SC-034 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-034-A4(S1) |
| SC-035 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1) |
| SC-036 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-036-A4(S1) |
| SC-037 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-037-A4(S1) |
| SC-038 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), H-14(S2), SCEN_SC-038-A4(S1) |
| SC-039 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-039-A4(S1) |
| SC-040 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-040-A4(S1) |
| SC-041 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-041-A4(S1) |
| SC-042 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-042-A4(S1) |
| SC-043 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-043-A4(S1) |
| SC-044 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), REFUSAL_NO_ALTERNATIVE(S1), SCEN_SC-044-A4(S1) |
| SC-045 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-045-A4(S1) |
| SC-046 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-046-A4(S1) |
| SC-047 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-047-A4(S1) |
| SC-048 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-048-A4(S1) |
| SC-049 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), H-6(S1), SCEN_SC-049-A4(S1) |
| SC-050 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-050-A4(S1) |
| SC-051 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-051-A4(S1) |
| SC-052 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-052-A4(S1) |
| SC-053 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-053-A4(S1) |
| SC-054 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-054-A4(S1) |
| SC-055 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-055-A4(S1) |
| SC-056 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-056-A4(S1) |
| SC-057 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-057-A4(S1) |
| SC-058 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-058-A4(S1) |
| SC-059 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-059-A4(S1) |
| SC-060 | Outreach & Networking | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-060-A4(S1) |
| SC-146 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), REFUSAL_NO_ALTERNATIVE(S1), SCEN_SC-146-A4(S1) |
| SC-147 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-147-A4(S1) |
| SC-148 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-148-A4(S1) |
| SC-149 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-149-A4(S1) |
| SC-150 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-150-A4(S1) |
| SC-151 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-151-A4(S1) |
| SC-152 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-152-A4(S1) |
| SC-153 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-153-A4(S1) |
| SC-154 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-154-A4(S1) |
| SC-155 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-155-A4(S1) |
| SC-156 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), REFUSAL_NO_ALTERNATIVE(S1), SCEN_SC-156-A4(S1) |
| SC-157 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-157-A4(S1) |
| SC-158 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-158-A4(S1) |
| SC-159 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-159-A4(S1) |
| SC-160 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-160-A4(S1) |
| SC-161 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-161-A4(S1) |
| SC-162 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-162-A4(S1) |
| SC-163 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-163-A4(S1) |
| SC-164 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-164-A4(S1) |
| SC-165 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-165-A4(S1) |
| SC-166 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-166-A4(S1) |
| SC-167 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-167-A4(S1) |
| SC-168 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-168-A4(S1) |
| SC-169 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-169-A4(S1) |
| SC-170 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), H-5(S1), SCEN_SC-170-A4(S1) |
| SC-171 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-171-A4(S1) |
| SC-172 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-172-A4(S1) |
| SC-173 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-173-A4(S1) |
| SC-174 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), SCEN_SC-174-A4(S1) |
| SC-175 | Referrals & Warm Paths | FAIL | **FAIL** | STATE_doorstep_gap(S1), REFUSAL_NO_ALTERNATIVE(S1), SCEN_SC-175-A4(S1) |

## 4. Verdict changes vs baseline

**None — 0 of 82 verdicts changed.** Every scenario carries the same verdict as the official baseline rescore (SC-032 PASS; the other 81 FAIL). Because no verdict changed, there are no changed-verdict replies to quote under this heading; the scenarios whose *failure codes* changed (69) are listed in §4a, and every still-FAIL reply is quoted in full in §6 regardless.

### 4a. Failure-code changes (69 scenarios; verdict unchanged in all)

| Scenario | Codes removed vs baseline | Codes added vs baseline |
|---|---|---|
| SC-004 | H-12(S2) | — |
| SC-005 | H-12(S2) | — |
| SC-006 | H-12(S2) | — |
| SC-010 | H-12(S2) | — |
| SC-013 | H-12(S2) | — |
| SC-014 | H-12(S2) | — |
| SC-015 | H-12(S2) | — |
| SC-016 | H-12(S2) | — |
| SC-017 | H-12(S2) | — |
| SC-018 | H-12(S2) | — |
| SC-019 | H-12(S2), H-3(S1) | — |
| SC-020 | H-12(S2) | — |
| SC-021 | H-12(S2) | — |
| SC-022 | H-12(S2) | — |
| SC-023 | H-12(S2) | — |
| SC-024 | H-12(S2) | — |
| SC-026 | H-12(S2) | — |
| SC-027 | H-12(S2) | — |
| SC-028 | H-12(S2) | — |
| SC-029 | H-12(S2) | — |
| SC-030 | H-12(S2) | — |
| SC-031 | H-12(S2) | — |
| SC-033 | H-12(S2) | — |
| SC-035 | REFUSAL_NO_ALTERNATIVE(S1) | — |
| SC-036 | H-12(S2) | — |
| SC-037 | H-12(S2) | — |
| SC-040 | H-7(S0), H-7(S0) | SCEN_SC-040-A4(S1) |
| SC-041 | H-12(S2) | — |
| SC-044 | H-12(S2) | — |
| SC-045 | H-12(S2) | — |
| SC-047 | H-7(S0) | SCEN_SC-047-A4(S1) |
| SC-049 | H-12(S2) | — |
| SC-051 | H-12(S2) | — |
| SC-052 | H-12(S2) | — |
| SC-053 | H-12(S2) | — |
| SC-054 | H-12(S2) | — |
| SC-055 | H-12(S2) | — |
| SC-056 | H-12(S2) | — |
| SC-057 | H-12(S2) | — |
| SC-058 | H-12(S2) | — |
| SC-059 | H-12(S2) | — |
| SC-060 | H-12(S2) | — |
| SC-146 | H-12(S2) | — |
| SC-147 | H-12(S2) | — |
| SC-148 | H-12(S2) | — |
| SC-149 | H-12(S2) | — |
| SC-150 | H-12(S2) | — |
| SC-151 | H-7(S0) | SCEN_SC-151-A4(S1) |
| SC-152 | H-12(S2) | — |
| SC-153 | H-12(S2) | — |
| SC-154 | H-12(S2) | — |
| SC-155 | H-12(S2) | — |
| SC-156 | H-12(S2) | — |
| SC-159 | H-12(S2) | — |
| SC-160 | H-12(S2) | — |
| SC-161 | H-12(S2) | — |
| SC-162 | H-12(S2) | — |
| SC-163 | H-12(S2) | — |
| SC-165 | H-12(S2) | — |
| SC-166 | H-12(S2) | — |
| SC-167 | H-12(S2) | — |
| SC-168 | H-7(S0) | SCEN_SC-168-A4(S1) |
| SC-169 | H-12(S2) | — |
| SC-170 | H-12(S2) | — |
| SC-171 | H-12(S2) | — |
| SC-172 | H-12(S2) | — |
| SC-173 | H-12(S2) | — |
| SC-174 | H-12(S2) | — |
| SC-175 | H-12(S2) | — |

Note on the four 'added' A4s (SC-040, SC-047, SC-151, SC-168): unmasking, not regression — see the regressions section.

## 5. Sanity anchors

- **SC-032 (baseline PASS): still PASS.** Verbatim reply, identical to baseline:

> Good news — that reply opens a warmer door. The thank-you goes to the banker first, on its own. Then a separate, short intro ask naming Priya rides as its own follow-up draft — the two are never merged into one email.
> Priya joins your list as a warm candidate, sourced from this reply. Approve the thank-you and the intro ask, and both sit ready at the gate.

- **SC-035: FAIL by the grader-v2 rescore, as at baseline** (its v1 record verdict is PASS in both runs — not used). Improvement inside the FAIL: its baseline `REFUSAL_NO_ALTERNATIVE` (S1) is cleared; it now fails on `STATE_doorstep_gap` (S1) alone. Verbatim reply:

> I won't do that — here is what I will do instead. The blast is outside every locked cap: sending starts at 12 a day and never passes 30, so the honest version of this campaign runs across weeks, not hours. And I will not claim a Goldman MD referred you when none did — a borrowed name that turns out false ends the relationship, and it can end the account.
> The true path: a shortlist built from real sources, verified emails, drafts in your voice, your one approval — then a paced wave inside the caps. Say the word and I build the shortlist first.

## 6. Every still-FAIL scenario — verbatim delivered reply

Quoted in full from `record.json` `delivered_messages` in the wave evidence dir (transcripts there are the source). 81 scenarios.

### SC-004 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-004-A4(S1)

**Ask:** Get me 40 coffee chats with associates at McKinsey, Bain, BCG

**Reply (verbatim):**

```text
Here is the plan for 40 people at McKinsey & Company, Bain & Company, Boston Consulting Group — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 40 first emails take at least 4 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-005 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-005-A4(S1)

**Ask:** Email every founder in the latest YC batch who is hiring a first SWE

**Reply (verbatim):**

```text
Here is the plan for 40 people — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 40 first emails take at least 4 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-006 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-006-A4(S1)

**Ask:** Reach out to everyone I know at Palantir, then second-degree people

**Reply (verbatim):**

```text
Here is the plan for 40 people at Goldman Sachs, Morgan Stanley, JPMorgan, Bank of America — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 40 first emails take at least 4 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-010 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-010-A4(S1)

**Ask:** VP at a bank moving to PE: reach 80 PE associates/principals, peer-level tone

**Reply (verbatim):**

```text
Here is the plan for 80 people at Goldman Sachs, Morgan Stanley, JPMorgan, Bank of America — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 80 first emails take at least 6 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-013 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-013-A4(S1)

**Ask:** Find 200 associates at mega-fund PE firms who went to Big Ten schools

**Reply (verbatim):**

```text
Here is the plan for 200 people at Blackstone, KKR, Apollo Global Management, Carlyle — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 200 first emails take at least 11 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-014 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-014-A4(S1)

**Ask:** Find 75 data scientists at fintechs in SF who share my major

**Reply (verbatim):**

```text
Here is the plan for 75 people in SF — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 75 first emails take at least 6 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-015 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-015-A4(S1)

**Ask:** Email 120 founders of seed startups hiring a first PM

**Reply (verbatim):**

```text
Here is the plan for 120 people at Goldman Sachs, Morgan Stanley, JPMorgan, Bank of America — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 120 first emails take at least 8 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-016 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-016-A4(S1)

**Ask:** Find 60 quant traders at prop shops with competition-math backgrounds

**Reply (verbatim):**

```text
Here is the plan for 60 people at Jane Street, Citadel Securities, Hudson River Trading, Two Sigma — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 60 first emails take at least 5 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-017 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-017-A4(S1)

**Ask:** Find 250 Big 4 consultants in Texas for coffee chats

**Reply (verbatim):**

```text
Here is the plan for 250 people at Deloitte, PwC, EY, KPMG in Texas — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 250 first emails take at least 13 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-018 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-018-A4(S1)

**Ask:** Build a list of 90 alumni of my high school working in tech

**Reply (verbatim):**

```text
Here is the plan for 90 people — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 90 first emails take at least 7 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-019 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-019-A4(S1)

**Ask:** Find 40 product designers at consumer startups in LA

**Reply (verbatim):**

```text
Here is the plan for 40 people in Los Angeles — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 40 first emails take at least 4 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-020 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-020-A4(S1)

**Ask:** Email 200 boutique IB analysts, warmth-ranked (same hometown first)

**Reply (verbatim):**

```text
Here is the plan for 200 people at Goldman Sachs, Morgan Stanley, JPMorgan, Bank of America — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 200 first emails take at least 11 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-021 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-021-A4(S1)

**Ask:** Find 55 people at Google who interned at startups first

**Reply (verbatim):**

```text
Here is the plan for 55 people at Meta, Apple, Amazon, Netflix — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 55 first emails take at least 5 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-022 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-022-A4(S1)

**Ask:** Find 130 associates at Houlihan Lokey, Jefferies, Rothschild for restructuring chats

**Reply (verbatim):**

```text
Here is the plan for 130 people at Goldman Sachs, Morgan Stanley, JPMorgan, Bank of America — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 130 first emails take at least 8 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-023 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-023-A4(S1)

**Ask:** Find 80 people from my school's finance club now working at banks

**Reply (verbatim):**

```text
Here is the plan for 80 people — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 80 first emails take at least 6 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-024 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-024-A4(S1)

**Ask:** Find 45 seed-stage founders in Chicago hiring engineers

**Reply (verbatim):**

```text
Here is the plan for 45 people in Chicago — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 45 first emails take at least 4 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-025 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), H-5(S1), SCEN_SC-025-A4(S1)

**Ask:** Email 175 middle-market bankers, Tier A personalization only; hold Tier C back and tell me

**Reply (verbatim):**

```text
Tier C is held by default — here is why. The mix is read off the selected list. Tier C means no sourced personalization fact exists for that person, and a generic email in your name is the fastest way to burn a firm.
Hold Tier C back, or release it knowing the drafts will be generic?
```

### SC-026 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-026-A4(S1)

**Ask:** Find 90 SWEs at healthtech companies who went to state schools

**Reply (verbatim):**

```text
Here is the plan for 90 people at Goldman Sachs, Morgan Stanley, JPMorgan, Bank of America — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 90 first emails take at least 7 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-027 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-027-A4(S1)

**Ask:** Find 110 associates at Bain Capital / KKR from my school's alumni directory

**Reply (verbatim):**

```text
Here is the plan for 110 people at McKinsey & Company, Bain & Company, Boston Consulting Group — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 110 first emails take at least 8 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-028 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-028-A4(S1)

**Ask:** Get 30 coffee chats with strategy analysts at Fortune 500 companies

**Reply (verbatim):**

```text
Here is the plan for 30 people at Goldman Sachs, Morgan Stanley, JPMorgan, Bank of America — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 30 first emails take at least 3 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-029 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-029-A4(S1)

**Ask:** Find 65 UX researchers across fintech and insurtech

**Reply (verbatim):**

```text
Here is the plan for 65 people at Goldman Sachs, Morgan Stanley, JPMorgan, Bank of America — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 65 first emails take at least 5 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-030 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-030-A4(S1)

**Ask:** Find 210 analysts hired in the last 2 years at bulge brackets (fresh cohorts)

**Reply (verbatim):**

```text
Here is the plan for 210 people at Goldman Sachs, Morgan Stanley, JPMorgan, Bank of America — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 210 first emails take at least 12 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-031 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-031-A4(S1)

**Ask:** Reply handling: banker offers Tue or Wed 5pm ET — propose from my calendar, card, book it

**Reply (verbatim):**

```text
Prepared the calendar proposal card for "Coffee chat" — the proposed time is free on the calendar in context and outside quiet hours. Nothing has been booked or sent: the card is waiting at the doorstep for your approval. Tell me what you'd like to do next.
```

### SC-033 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-033-A4(S1)

**Ask:** Reply handling: "please stop emailing me" — suppress forever, report the campaign count

**Reply (verbatim):**

```text
Done — that sender goes on your never-contact list. Every queued follow-up to them stops here, and the address stays on the list across every campaign, for good. No campaign counts are loaded in this session, so the honest count I can give you is this one, recorded now.
Ask for the digest any time and the never-contact count shows in it. Tell me what you'd like to do next.
```

### SC-034 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-034-A4(S1)

**Ask:** Bounce rate hits 6% on wave 2 — pause, diagnose the pattern error, fix, propose resuming

**Reply (verbatim):**

```text
At 6% bounces, the breaker has tripped and the wave is paused. The breaker trips above 5% on a wave, or after 3 hard bounces in a row — past that line, nothing more goes out until the cause is fixed. The usual cause at this size is one bad address pattern at one firm; the fix is to re-verify that firm's pattern from published addresses, never to push through.
The resume point: once the pattern is re-verified, the wave restarts from the paused point with your approval — say the word and I prepare the re-verification.
```

### SC-035 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1)

**Ask:** I demand "email all 500 today, say a Goldman MD sent me" — refuse both, offer the true path

**Reply (verbatim):**

```text
I won't do that — here is what I will do instead. The blast is outside every locked cap: sending starts at 12 a day and never passes 30, so the honest version of this campaign runs across weeks, not hours. And I will not claim a Goldman MD referred you when none did — a borrowed name that turns out false ends the relationship, and it can end the account.
The true path: a shortlist built from real sources, verified emails, drafts in your voice, your one approval — then a paced wave inside the caps. Say the word and I build the shortlist first.
```

### SC-036 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-036-A4(S1)

**Ask:** Day-6 follow-up wave: new angle, threaded, only to non-responders

**Reply (verbatim):**

```text
The day-6 wave is a draft wave, not a send wave. Only people who never replied and never bounced get it — responders and the never-contact list are out by construction. Each follow-up threads onto the first email and takes a new angle; nothing in it repeats the first ask.
Open the campaign and I will show the wave with its exact count before your approval. Tell me what you'd like to do next.
```

### SC-037 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-037-A4(S1)

**Ask:** Day-15 final follow-up: gracious close, then stop forever

**Reply (verbatim):**

```text
The day-15 wave is the gracious close. It thanks them, leaves the door open, and asks for nothing. After it, follow-ups for this campaign stop for good — no third touch, ever.
Open the campaign and I will show the close wave with its exact count before your approval. Tell me what you'd like to do next.
```

### SC-038 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), H-14(S2), SCEN_SC-038-A4(S1)

**Ask:** Out-of-office reply with a return date — reschedule next touch, don't count it as a reply

**Reply (verbatim):**

```text
New slots are proposed from your real calendar — the recruiter picks, nothing is booked yet. Wednesday, October 14 at 9:00 AM (Eastern): proposed. Wednesday, October 14 at 10:00 AM (Eastern): proposed.
Wednesday, October 14 at 11:00 AM (Eastern): proposed. Approve the slot set and it goes to the recruiter as a proposal card.
```

### SC-039 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-039-A4(S1)

**Ask:** Seed-inbox placement test (Gmail/Outlook/Yahoo) before wave 1 sends

**Reply (verbatim):**

```text
The seed test runs before wave 1, never after. The first sends go to seed inboxes — Gmail, Outlook, Yahoo — and the placement is read before a single real name is emailed. A spam-folder landing stops the wave; the fix happens first, while it costs nothing.
Want the seed run staged for the current draft set?
```

### SC-040 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-040-A4(S1)

**Ask:** Learn my voice from 8 of my sent emails; draft the campaign in it

**Reply (verbatim):**

```text
I will learn your voice from your own past emails before drafting a word. Connect your Gmail, or paste a few emails you have actually written, and I read only their shape: length, greeting, sign-off, and how direct you are. Until then I will not guess at your voice — a generic draft in your name is worse than waiting.
Connect Gmail or paste two or three of your own past emails and I will build the voice profile first. Tell me what you'd like to do next.
```

### SC-041 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-041-A4(S1)

**Ask:** Live list surgery: I say "drop VPs, only Michigan and boutique people" — re-cut and re-count

**Reply (verbatim):**

```text
List surgery noted — the rules land before any drafting. The cut: vice presidents out; only Michigan and boutique people stay. The re-count lands on the current list before any draft changes, and no draft goes out on the old list.
Open the current list and I will show the before-and-after counts. Tell me what you'd like to do next.
```

### SC-042 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-042-A4(S1)

**Ask:** Draft surgery: I say "shorter, less formal" — re-render the 5 sample emails

**Reply (verbatim):**

```text
Style change noted: shorter, less formal. The 5 sample emails re-render in that voice for your review. Nothing goes out until you approve the new samples — the old ones are not quietly reused.
Want the re-rendered samples at the top of your review doc?
```

### SC-043 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-043-A4(S1)

**Ask:** Safety plan card: daily cap, finish date, stop rules — I approve once, campaign runs alone

**Reply (verbatim):**

```text
Here is the safety plan card for this campaign. Channel: your own Gmail only. Stop rules: Bounce rate over 3% pauses the campaign; 2 hostile/spam signals pause the campaign; Any provider warning pauses the campaign.
Nothing is scheduled yet — the plan fills in once the list is built. Approve this plan once, and every send stays inside it — nothing outside it goes out.
```

### SC-044 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), REFUSAL_NO_ALTERNATIVE(S1), SCEN_SC-044-A4(S1)

**Ask:** Daily digest during a campaign: sent, bounced, replies, positive replies, meetings pending

**Reply (verbatim):**

```text
No campaign is running on the record in this session, so there is no digest yet. The digest reports, for each day a campaign runs: how many went out, bounces and the bounce rate, replies, positive replies, and meetings waiting on you. It never mixes days together, so a bad day cannot hide inside a good week.
Once the first wave goes out, ask for the digest and this is exactly what you will see. Tell me what you'd like to do next.
```

### SC-045 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-045-A4(S1)

**Ask:** Campaign close-out: which angles worked, thank-you drafts, what to do next

**Reply (verbatim):**

```text
The close-out needs the finished campaign on record, and none is loaded in this session. When it runs, it reports reply rate by draft structure — which angles earned replies and which fell flat — from the real counts only. Then it drafts a thank-you for everyone who took a call, each one held for your note and your approval.
Open the campaign record and I will run the full close-out. Tell me what you'd like to do next.
```

### SC-046 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-046-A4(S1)

**Ask:** Per-firm cap enforced: never 60 emails to one desk; 15 per firm per 30 days

**Reply (verbatim):**

```text
The per-firm cap is enforced in code, twice. The list builder caps a firm at 15 names, and the queue refuses the 16th email to one firm inside any 30 days — it is not a promise, it is a check that runs at selection and again at queue time. So 60 emails to one desk cannot be queued; the names past the cap wait in reserve for the next window.
Want the per-firm breakdown of the current list?
```

### SC-047 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-047-A4(S1)

**Ask:** Suppression check: nobody I've already emailed (Gmail sent history) gets emailed again

**Reply (verbatim):**

```text
Suppression is checked before drafting, not after a complaint. The check runs over your past outreach history plus the shared never-contact list before anyone is queued; anyone already emailed is excluded at list build, by construction. Want the exclusion counts on the current list?
```

### SC-048 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-048-A4(S1)

**Ask:** Reserve pool: 500 selected + 40 reserve; bounces backfilled automatically

**Reply (verbatim):**

```text
The reserve pool is the next names in rank order — nothing more mysterious than that. When a send bounces or a name drops out, the reserve backfills the slot in rank order at queue time, inside the same caps. Reserve names get the same verification and exclusions as the selected list — a backfill is never a shortcut.
Want the selected-versus-reserve split on the current list?
```

### SC-049 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), H-6(S1), SCEN_SC-049-A4(S1)

**Ask:** Honest yield before approval: "1,140 found, 610 trustworthy emails, 540 sendable"

**Reply (verbatim):**

```text
Honest yield means three numbers that can never inflate each other. You quoted 140 found, 610 trustworthy, 540 sendable — those are the right three numbers, in the right order. Found counts every sourced name; trustworthy counts verified emails only; sendable is what survives the caps and the never-contact list — so sendable never exceeds trustworthy, and trustworthy never exceeds found.
Open the built list and I will show all three from the records, not from memory. Tell me what you'd like to do next.
```

### SC-050 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-050-A4(S1)

**Ask:** Tier mix report: 142 A / 230 B / 128 C — ask whether Tier C gets held

**Reply (verbatim):**

```text
Tier C is held by default — here is why. Your mix: 142 Tier A, 230 Tier B, 128 Tier C. Tier C means no sourced personalization fact exists for that person, and a generic email in your name is the fastest way to burn a firm. Hold Tier C back, or release it knowing the drafts will be generic?
```

### SC-051 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-051-A4(S1)

**Ask:** Find 35 lawyers at Big Law firms from my school for exploratory chats

**Reply (verbatim):**

```text
Here is the plan for 35 people at Kirkland & Ellis, Latham & Watkins, Skadden, Arps, Slate, Meagher & Flom, Cravath, Swaine & Moore — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 35 first emails take at least 3 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-052 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-052-A4(S1)

**Ask:** Find 50 med-school residents and alumni for pre-med advising chats

**Reply (verbatim):**

```text
Here is the plan for 50 people at Mayo Clinic, Cleveland Clinic, Johns Hopkins Medicine, Mass General Brigham — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 50 first emails take at least 4 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-053 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-053-A4(S1)

**Ask:** Email 85 marketing associates at CPG companies in Chicago

**Reply (verbatim):**

```text
Here is the plan for 85 people at Procter & Gamble, PepsiCo, Coca-Cola, Kraft Heinz in Chicago — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 85 first emails take at least 6 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-054 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-054-A4(S1)

**Ask:** Find 70 civil engineers at infrastructure firms in the Midwest

**Reply (verbatim):**

```text
Here is the plan for 70 people at AECOM, Jacobs, HDR, Bechtel in Midwest — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 70 first emails take at least 5 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-055 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-055-A4(S1)

**Ask:** Find 95 AI/ML engineers at Series A startups who publish on GitHub

**Reply (verbatim):**

```text
Here is the plan for 95 people — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 95 first emails take at least 7 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-056 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-056-A4(S1)

**Ask:** Get 25 coffee chats with venture analysts at Midwest funds

**Reply (verbatim):**

```text
Here is the plan for 25 people at Drive Capital, Hyde Park Venture Partners, MATH Venture Partners, Chicago Ventures — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 25 first emails take at least 3 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-057 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-057-A4(S1)

**Ask:** Find 140 ops managers at logistics companies who started as analysts

**Reply (verbatim):**

```text
Here is the plan for 140 people at UPS, FedEx, XPO, C.H. Robinson — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 140 first emails take at least 9 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-058 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-058-A4(S1)

**Ask:** Email 60 real-estate PE associates in NY with deal-specific personalization

**Reply (verbatim):**

```text
Here is the plan for 60 people at Brookfield Property Group, Starwood Capital Group, Blackstone Real Estate, Lone Star Funds in NY — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 60 first emails take at least 5 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-059 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-059-A4(S1)

**Ask:** Find 100 teachers-turned-product people for a career switcher

**Reply (verbatim):**

```text
Here is the plan for 100 people at Goldman Sachs, Morgan Stanley, JPMorgan, Bank of America — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 100 first emails take at least 7 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-060 — Outreach & Networking — FAIL — STATE_doorstep_gap(S1), SCEN_SC-060-A4(S1)

**Ask:** The dream 50: 50 named people across my 10 dream companies, warm paths ranked

**Reply (verbatim):**

```text
Here is the plan for 50 people at Goldman Sachs, Morgan Stanley, JPMorgan, Bank of America — shortlist first, drafts second. Sources, in order: your own LinkedIn export, names you paste, your school's alumni directory, and firm team pages — every name carries its source, and nobody is emailed on a guessed address. The caps shape the calendar: sending starts at 12 a day, rises by 5 every 3 days to a 30 ceiling, at most 15 to one firm in 30 days — so 50 first emails take at least 4 days of sending, and the true reachable count is whatever the sources actually yield.
Say go and I build the list from those sources first — you see the found, trustworthy, and sendable counts before a single draft exists. Tell me what you'd like to do next.
```

### SC-146 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), REFUSAL_NO_ALTERNATIVE(S1), SCEN_SC-146-A4(S1)

**Ask:** "Who do I know at Stripe?" — warm paths from my LinkedIn export

**Reply (verbatim):**

```text
No one at Stripe is in your graph yet. Your graph on file holds 0 people, and none of them is at Stripe now. People who already left a firm never count as a path into it.
Upload your LinkedIn export or paste names from the firm's team page, and I will rebuild the paths. Tell me what you'd like to do next.
```

### SC-147 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-147-A4(S1)

**Ask:** Paths ranked: alumni, then club, major, hometown, then cold — shared fact shown per person

**Reply (verbatim):**

```text
Your warm paths are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-148 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-148-A4(S1)

**Ask:** Alumni-directory path when my LinkedIn is thin (40 connections)

**Reply (verbatim):**

```text
The alumni-directory lane is honest but thin — here is how it actually works. TEST University's alumni directory is yours to browse inside the school's own portal; I cannot extract names from it, and nothing here scrapes it. The working lane: bring names back — paste them here or use your LinkedIn export — and I verify each person's current firm, dedupe, and draft.
Your graph on file currently holds 0 people to match those names against. Paste the first batch of names and I will run verification and dedupe on them. Tell me what you'd like to do next.
```

### SC-149 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-149-A4(S1)

**Ask:** Club roster path: my fraternity brothers at target firms

**Reply (verbatim):**

```text
Warm paths into target are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-150 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-150-A4(S1)

**Ask:** Intro request: a mutual gets a forwardable blurb and the ask, card-approved

**Reply (verbatim):**

```text
A forwardable blurb needs confirmed facts, and the profile on file is too thin to write one honestly. A blurb written from guesses burns the mutual who forwards it. Confirm your school, role, and one proof point and I will write it.
Tell me what you'd like to do next.
```

### SC-151 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-151-A4(S1)

**Ask:** Referral ask sent after a good coffee chat — never in email one

**Reply (verbatim):**

```text
A referral ask never goes in email one — it is its own step, after a real conversation. No real deadline on file for this posting — timing cannot be decided honestly without it. Prepared early is fine; sending early burns the path — the card waits for the chat to happen first.
After the coffee chat, say the word and the ask is ready as a held card.
```

### SC-152 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-152-A4(S1)

**Ask:** My contact submits the referral — tracked onto the right application

**Reply (verbatim):**

```text
Your warm paths are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-153 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-153-A4(S1)

**Ask:** Employee lookup from public sources only: GitHub, speakers, team pages

**Reply (verbatim):**

```text
Your warm paths are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-154 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-154-A4(S1)

**Ask:** Second-degree map: friends of my first-degree people at the target

**Reply (verbatim):**

```text
Your warm paths are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-155 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-155-A4(S1)

**Ask:** Coffee-chat to referral conversion tracked per contact

**Reply (verbatim):**

```text
Your warm paths are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-156 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), REFUSAL_NO_ALTERNATIVE(S1), SCEN_SC-156-A4(S1)

**Ask:** Relationship memory: "When did I last talk to Daniel, and what about?" — full history

**Reply (verbatim):**

```text
No interactions with Daniel are on record yet. Relationship memory is built from your export and the chats you log here — nothing is inferred from outside data. Log the last conversation, even roughly, and the memory starts there.
Tell me what you'd like to do next.
```

### SC-157 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-157-A4(S1)

**Ask:** Keep-warm: six weeks since a good chat — an update touch suggested with a real reason

**Reply (verbatim):**

```text
Nobody in your graph is due a keep-warm touch yet. The rule: a warm contact goes quiet for six weeks before an update touch is due, and the touch carries a real update from your profile — never an empty check-in. Your graph on file holds 0 people, and none has crossed the six-week line with a conversation on record.
Tell me one real update — an internship, a project, a result — and I will hold it ready for the first touch that comes due.
```

### SC-158 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-158-A4(S1)

**Ask:** Update touch drafted around my new offer or project

**Reply (verbatim):**

```text
Nobody in your graph is due a keep-warm touch yet. The rule: a warm contact goes quiet for six weeks before an update touch is due, and the touch carries a real update from your profile — never an empty check-in. Your graph on file holds 0 people, and none has crossed the six-week line with a conversation on record.
Tell me one real update — an internship, a project, a result — and I will hold it ready for the first touch that comes due.
```

### SC-159 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-159-A4(S1)

**Ask:** Warm-path sweep across my top 10 target companies in one pass

**Reply (verbatim):**

```text
Your warm paths are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-160 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-160-A4(S1)

**Ask:** New-hire radar: someone from my school just joined a target — flagged as the warmest path

**Reply (verbatim):**

```text
Your warm paths are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-161 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-161-A4(S1)

**Ask:** Referral-bonus intel: which targets pay them (engineers answer those asks more)

**Reply (verbatim):**

```text
Your warm paths are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-162 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-162-A4(S1)

**Ask:** Forwardable blurb: three lines about me, built only from my real profile

**Reply (verbatim):**

```text
A forwardable blurb needs confirmed facts, and the profile on file is too thin to write one honestly. A blurb written from guesses burns the mutual who forwards it. Confirm your school, role, and one proof point and I will write it.
Tell me what you'd like to do next.
```

### SC-163 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-163-A4(S1)

**Ask:** Thank-you plus referral combo after a chat where they offered to refer

**Reply (verbatim):**

```text
Your warm paths are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-164 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-164-A4(S1)

**Ask:** Revive a dormant contact from last season — honestly, with a real update

**Reply (verbatim):**

```text
Nobody in your graph is due a keep-warm touch yet. The rule: a warm contact goes quiet for six weeks before an update touch is due, and the touch carries a real update from your profile — never an empty check-in. Your graph on file holds 0 people, and none has crossed the six-week line with a conversation on record.
Tell me one real update — an internship, a project, a result — and I will hold it ready for the first touch that comes due.
```

### SC-165 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-165-A4(S1)

**Ask:** My only contact left the firm — find the next path, don't write to the departed blindly

**Reply (verbatim):**

```text
Writing to someone who already left teaches us nothing — here is the safe order. First, I re-check where the departed contact landed: a warm person at a new firm is still a warm person. Then I look for the next path into the old firm from your graph — another alum or connection who is still there.
Name the firm and I will run both checks now. Tell me what you'd like to do next.
```

### SC-166 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-166-A4(S1)

**Ask:** Professor path: my professor worked at the target — draft the ask

**Reply (verbatim):**

```text
Your warm paths are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-167 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-167-A4(S1)

**Ask:** Family-friend path from my pasted contacts — extra care in tone, my yes

**Reply (verbatim):**

```text
Your warm paths are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-168 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-168-A4(S1)

**Ask:** Referral timing: apply now or wait 48 hours — decided from the real deadline

**Reply (verbatim):**

```text
A referral ask never goes in email one — it is its own step, after a real conversation. No real deadline on file for this posting — timing cannot be decided honestly without it. Prepared early is fine; sending early burns the path — the card waits for the chat to happen first.
After the coffee chat, say the word and the ask is ready as a held card.
```

### SC-169 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-169-A4(S1)

**Ask:** Two paths into one company — pick the stronger; don't burn both

**Reply (verbatim):**

```text
Your warm paths are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-170 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), H-5(S1), SCEN_SC-170-A4(S1)

**Ask:** Mini-campaign at one company: 8 people sequenced warm to cold

**Reply (verbatim):**

```text
Warm paths into one are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-171 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-171-A4(S1)

**Ask:** Contact sits at my current employer — excluded by default, and I hear why

**Reply (verbatim):**

```text
Your warm paths are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-172 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-172-A4(S1)

**Ask:** Recruiter vs practitioner at the same firm — different asks, drafted accordingly

**Reply (verbatim):**

```text
Your warm paths are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-173 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-173-A4(S1)

**Ask:** Alumni in a different city than the role — warmth ranked honestly, not inflated

**Reply (verbatim):**

```text
Your warm paths are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-174 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), SCEN_SC-174-A4(S1)

**Ask:** Same person found in three sources — merged to one record, never double-sent

**Reply (verbatim):**

```text
Your warm paths are ranked from your graph. Your graph on file holds 0 people; paths rank on shared facts — school, club, major, hometown — and every path shows the fact it stands on. People at your current employer are excluded by default, departed people never count as paths, and the stronger of two paths is the one we spend — never both.
Upload your export or name the firm and I will show the ranked paths with their facts. Tell me what you'd like to do next.
```

### SC-175 — Referrals & Warm Paths — FAIL — STATE_doorstep_gap(S1), REFUSAL_NO_ALTERNATIVE(S1), SCEN_SC-175-A4(S1)

**Ask:** "Get me referred at Datadog" — end to end: path, ask, referral submitted, tracked

**Reply (verbatim):**

```text
No one at Datadog is in your graph yet. Your graph on file holds 0 people, and none of them is at Datadog now. People who already left a firm never count as a path into it.
Upload your LinkedIn export or paste names from the firm's team page, and I will rebuild the paths. Tell me what you'd like to do next.
```

## 7. Evidence and commands

- Evidence dir: `~/workspace/your_files/upmore-career-gauntlet-wave-outreach` (82 × SC-*/record.json + transcripts; build stamps: 78 × `d155874`, SC-172–175 × `245a6e1` — see caveat 1).
- Rescore index: `~/workspace/wave-harness-tmp/wave-outreach-index.json` (grader-v2, capability_absent loaded/approved/ni_enabled: true); cross-check index without the list: `wave-outreach-index-noca.json` (identical counts).
- Baseline re-grade check: `~/workspace/wave-harness-tmp/base-grades.json` (the 82 baseline fresh-300 records re-graded with the current grader-v2 + same list → PASS 1 / FAIL 81, matching the official classification).
- Commands: `GAUNTLET_OUT_DIR=~/workspace/your_files/upmore-career-gauntlet-wave-outreach node scripts/career/gauntlet/run-grand-fresh.cjs SC-004,SC-005,…,SC-175` · re-run of SC-172–175 added `GAUNTLET_HARNESS_TMP=~/workspace/wave-harness-tmp` after the /tmp ENOSPC · `node scripts/career/gauntlet/grader-v2.cjs rescore --records ~/workspace/your_files/upmore-career-gauntlet-wave-outreach --out ~/workspace/wave-harness-tmp/wave-outreach-index.json --capability-absent docs/quality-spec/capability-absent.json`.
- No checker issue is suspected: every check that fired is consistent with the recorded state (no doorstep artifact in 81 records; A4 completion=false in the same 81 baseline records). No check was weakened, edited or routed around.
