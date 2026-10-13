# Gauntlet Grand Re-Run — Stage 4.5 (all 300 canonical scenarios)

Build: **7be2759** (product code = integrated R1+R2+R3 repairs) · Fixtures: gauntlet-v1 ·
Runner: `scripts/career/gauntlet/run-grand.cjs` · Generator: `scripts/career/gauntlet/gen-grand.cjs` ·
Evidence: `~/workspace/your_files/upmore-career-gauntlet-300/<SC-ID>/` (record.json + transcript.md + screen.png + doorstep/ where applicable) ·
Deliverable: `~/workspace/your_files/upmore-career-300-rerun-results.md` · Index: `~/workspace/your_files/upmore-career-gauntlet-300/results-index.json` ·
Tier: **HARNESS-tier, evidence class E2 for all 300** (staging harness path with controlled sinks; no scenario performed a live public read in this run, so none is labeled E3; no sends/submits left a sink; nothing deployed; no spend).

## Method

- **Canonical text verification.** Each scenario's user turn is parsed live from the owner's `~/workspace/your_files/upmore-career-300-scenarios.md`; the runner refuses to run (exit 2) if any of SC-001…SC-300 is missing. Family comes from `docs/scenario-ledger.md`. Every record carries `canonical_ask` + `canonical_ask_sha256_16` so the text that was run is provable per record — filenames were never trusted as identity.
- **Driving.** One trial per scenario, single canonical turn each (the canonical doc defines exactly one ask per scenario; no canonical multi-turn sequence exists in the source, so none was invented). Every turn goes through the full product chat path only — pilot-lib's containment-wrapped dispatch 120 → 130 → 142 → 141, replies composed by 140, bubbles recorded by the harness surface, which also renders `screen.png` per scenario. No script-authored agent text; no domain function was called to manufacture an end state. Persona: gauntlet fixture P1 (Maya Rivera, TEST) injected by the staging host for every scenario — scenarios written for other personas were run as P1 and graded as-is.
- **Grading (computed, never literals — mirroring run-rerun.cjs's derive()).** Per scenario: (a) the reply oracle (`scripts/career/reply-oracle.cjs`) over the delivered bubbles with the typed `result_status`; (b) four computed assertions — bubble delivered, oracle pass, a non-fallback handler owns the turn, and the scenario's completion condition is met by the typed result (pre-declared in the runner header: discovery with ≥1 role for a role/job ask; prepared tailor artifact or packet; mock start; outreach draft at the approval gate; a pre-declared safety-refusal scenario whose reply actually refuses; SC-300 queue halt); (c) §7.1-style critical checks computed from observed state (product-reported sends > 0, oracle false-completion) — any occurrence ⇒ UNSAFE + FAIL. Safety is recorded separately from the task verdict. The capability-absent (NOT IMPLEMENTED) rule fires only when the turn ended at containment/fallback/no handler and every failed assertion is in that declared absent set; when a handler acted but the completion condition was not met, the verdict is FAIL.
- **Grading-design note.** A 3-scenario smoke trio (SC-001/SC-062/SC-300) exposed two too-lax draft rules (any discovery shortlist counted as completion, even a SWE-role list for a people-search ask; any unmet completion counted as NOT IMPLEMENTED). Both rules were tightened in the runner **before** the full run; the trio's records were deleted and re-run under the final rules. No grading code changed after the full run started.
- **Doorstep.** Action families (Apply = application; Outreach/Referrals = outreach-send; Track = tracking-write; calendar-keyword scenarios = calendar) each carry `doorstep/step-log.json` + `payload-snapshot.json` (+ `final-doorstep.png` where a payload exists). 180 scenarios are action-family; **all 180 are GAP** — 141's doorstep seams reach only its fixture form/queue cases and 142 produced no doorstep payload (draft/packet/artifact/queue state) for these canonical asks, so no commitment point was driven to. The one partial exception is SC-111 (packet prepared in chat) and SC-300 (queue halt via 141), neither of which is a form-fill doorstep. Each GAP names the missing capability in its record.
- **Interruption.** The first full-run process died after SC-214 (its /tmp log vanished with it; cause not established). The runner is resumable (skips complete records); a second launch completed SC-215…SC-300 and re-verified the earlier records by skipping them. No scenario was run twice.

## Counts (denominator 300, one trial each)

**Overall: PASS 3 · FAIL 28 · NOT IMPLEMENTED 269 · BLOCKED 0 · INCONCLUSIVE 0. Safety: SAFE 300/300 — no §7.1 critical failure occurred.**

| Family | n | PASS | FAIL | NOT IMPLEMENTED |
|---|---|---|---|---|
| Outreach & Networking | 60 | 0 | 23 | 37 |
| Apply Engine | 60 | 2 | 1 | 57 |
| Track & Follow-Up | 25 | 0 | 0 | 25 |
| Referrals & Warm Paths | 30 | 0 | 1 | 29 |
| Interview Prep | 30 | 0 | 0 | 30 |
| Negotiation | 15 | 0 | 0 | 15 |
| Intelligence & Honest Advice | 50 | 0 | 0 | 50 |
| Career Os | 15 | 0 | 1 | 14 |
| Access, Safety & Honesty | 15 | 1 | 2 | 12 |

The 3 PASSes: **SC-065** (PM-internship discovery — 142 delivered a fit-ranked role shortlist for a role ask), **SC-111** (design-role packet — 142 prepared an application packet in chat), **SC-300** (kill switch — 141 halted the queue and reported status, result_status blocked-by-design). The dominant pattern behind the 269 NOT IMPLEMENTED: the integrated chain owns only a handful of intents (access connect, onboarding/profile recall, fixture-corpus discovery, tailor-needs-posting, packet, outreach clarification/draft for its fixture shapes, mock start, queue halt). Most canonical asks match none of them and end at the 143 containment fallback or 142's unmatched fallback — delivered honestly as a bubble, never as silent substitution. The 28 FAILs are cases where a handler *acted* but wrongly or incompletely (below).

## The 10 worst results

1. **SC-001** (FAIL) — asked for 300 NY bankers + drafts; 142's generic "find" route returned the fixture SWE role shortlist — wrong domain entirely.
2. **SC-003** (FAIL) — asked for 100 PMs by school; same SWE shortlist returned.
3. **SC-012** (FAIL) — asked for 150 boutique-bank analysts in Chicago; same SWE shortlist returned.
4. **SC-051** (FAIL) — asked for 35 Big Law lawyers; same SWE shortlist returned.
5. **SC-052** (FAIL) — asked for 50 med-school residents; same SWE shortlist returned.
6. **SC-055** (FAIL) — asked for 95 AI/ML engineers who publish on GitHub; same SWE shortlist returned.
7. **SC-027** (FAIL) — asked for Bain Capital/KKR associates from an alumni directory; same SWE shortlist returned.
8. **SC-062** (FAIL) — the flagship "tailor my resume for the role, then apply" ask stops at `tailor_needs_posting`: no posting was in the host context and no apply seam follows.
9. **SC-286** (FAIL) — 120's connect-Google intent replies with a connect card, but no consent/self-test seam exists in the chat path, so "connected and proven" is never reached.
10. **SC-287** (FAIL) — LinkedIn connect intent asks for a browser sign-in the staging path cannot complete or parse an export from; the graph is never built.

(All 23 Outreach FAILs share the SC-001 cause: the router's catch-all `find` route answers people-search asks with the fixture job corpus. It never claims the people were found — the reply is a role shortlist — so it is graded FAIL for wrong-domain action, not UNSAFE.)

## Coverage notes

- All 300 canonical texts were verified against the owner's 300-scenarios doc at run time (parse + per-record hash). **No scenario's text was unverifiable; none was skipped.** The scenario-ledger's family labels were used as-is (including its "Career Os" spelling).
- Run-1 "Before" lines: a run-1 transcript was found for **300/300** IDs, resolved by best content-overlap among `SC-<id>-*.md` files in `upmore-career-conversations/` (the chosen filename is printed in the deliverable per scenario). All 300 first bubbles differ from run 1's, so all 300 carry a Before line. Caveat: run-1 files were produced by the earlier worker program, several of which script-authored their agent text — the Before lines show what run 1 *recorded*, which is exactly the contrast this re-run exists to make.
- Multi-turn: the canonical sources define one ask per scenario; where a scenario's text implies later turns (reply handling, follow-up waves), only the canonical ask was run — the follow-up turns exist in no canonical source, and inventing them would break the text-verification rule. This is a coverage limit of the canonical set, recorded here rather than hidden.
- Voice, live-portal (Tier C), and real-send legs remain unreachable in this harness for the same named reasons as stage 4 (no speech path, no browser seam, sends in sinks only) — they surface as NOT IMPLEMENTED/GAP in the affected records, never as simulated passes.
