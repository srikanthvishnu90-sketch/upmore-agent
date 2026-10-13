# Gauntlet Item 6 — Acceptance Pack (ready-to-fire re-grade)

**Purpose.** Owner queue item 6 (ledger): *"Router intent ownership finished: people-search never
lands in job discovery (GG-1). Proof: the 23 grand-rerun outreach FAIL cases re-run + re-graded,
zero wrong-domain actions."* The conversational half of item 6 is **Codex's lane to fix**
(142 routing semantics — grade-only for this program). This pack is how the fix gets graded the
moment it lands: the exact scenario set, the exact assertion, and the exact grading rule, frozen
in advance so the acceptance run cannot drift.

**Source of the set.** `~/workspace/your_files/upmore-career-gauntlet-300/results-index.json`,
filtered mechanically: `family == "Outreach & Networking" AND verdict == "FAIL"` → **23 scenario
IDs** (verified count at pack creation: Outreach totals were PASS 0 / FAIL 23 / NOT IMPLEMENTED 37
of 60). Every one of the 23 failed the same way at the grand re-run (build 7be2759, HARNESS-tier/E2):
142's catch-all "find" route answered a **people-search** ask with the fixture **SWE job shortlist**
("Here are the 5 roles most worth applying to…") — defect **GG-1** in the ledger.

## Build-stamp field (fill at fire time — the pack is not valid without it)

| Field | Value |
|---|---|
| `build_under_test` | *(commit sha of the integrated build carrying Codex's item-6 conversational fix — record BEFORE running; e.g. the successor of 7778d96)* |
| `fix_commits` | *(the 142/handler commit(s) claimed to close GG-1, as named by their author)* |
| `runner` | `scripts/career/gauntlet/run-grand.cjs` (canonical 300 runner, computed grading) — re-run scoped to the 23 IDs below, 1 trial each (the grand-rerun protocol), PLUS the pilot-lib chat path they already use; do not edit assertions to fit the build |
| `fixture_version` | `gauntlet-v1` (canonical scenario texts verified by sha at run time, as the grand re-run did) |
| `evidence_root` | `~/workspace/your_files/upmore-career-gauntlet-300-item6/<SC-id>/trial-1/` (new root — the grand-rerun records are never overwritten) |
| `evidence_class` | E2 (HARNESS-tier staging path) unless run after the owner fires staging, in which case label STAGING-tier/E2 and say so |
| `graded_at` | *(ISO timestamp at fire time)* |
| `grader` | a lane that wrote none of the item-6 fix (the independence rule) |

## The 23 scenarios (canonical ask — verbatim from the grand-rerun records)

| ID | Canonical ask (people-search) | Grand-rerun delivered reply (the wrong-domain evidence) |
|---|---|---|
| SC-001 | Find 300 top bankers in NY + a personalized coffee-chat email drafted for each | Job shortlist ("Here are the 5 roles most worth applying to…") |
| SC-002 | Find 500 bulge bracket bankers; draft the networking email; run the campaign in safe waves | Job shortlist |
| SC-003 | Find 100 PMs at Series B–D startups in NYC who went to my school; message them | Job shortlist |
| SC-012 | Find 150 analysts at elite boutiques (Evercore, Lazard, Centerview) in Chicago | Job shortlist |
| SC-013 | Find 200 associates at mega-fund PE firms who went to Big Ten schools | Job shortlist |
| SC-014 | Find 75 data scientists at fintechs in SF who share my major | Job shortlist |
| SC-016 | Find 60 quant traders at prop shops with competition-math backgrounds | Job shortlist |
| SC-017 | Find 250 Big 4 consultants in Texas for coffee chats | Job shortlist |
| SC-019 | Find 40 product designers at consumer startups in LA | Job shortlist |
| SC-021 | Find 55 people at Google who interned at startups first | Job shortlist |
| SC-022 | Find 130 associates at Houlihan Lokey, Jefferies, Rothschild for restructuring chats | Job shortlist |
| SC-023 | Find 80 people from my school's finance club now working at banks | Job shortlist |
| SC-024 | Find 45 seed-stage founders in Chicago hiring engineers | Job shortlist |
| SC-026 | Find 90 SWEs at healthtech companies who went to state schools | Job shortlist |
| SC-027 | Find 110 associates at Bain Capital / KKR from my school's alumni directory | Job shortlist |
| SC-029 | Find 65 UX researchers across fintech and insurtech | Job shortlist |
| SC-030 | Find 210 analysts hired in the last 2 years at bulge brackets (fresh cohorts) | Job shortlist |
| SC-051 | Find 35 lawyers at Big Law firms from my school for exploratory chats | Job shortlist |
| SC-052 | Find 50 med-school residents and alumni for pre-med advising chats | Job shortlist |
| SC-054 | Find 70 civil engineers at infrastructure firms in the Midwest | Job shortlist |
| SC-055 | Find 95 AI/ML engineers at Series A startups who publish on GitHub | Job shortlist |
| SC-057 | Find 140 ops managers at logistics companies who started as analysts | Job shortlist |
| SC-059 | Find 100 teachers-turned-product people for a career switcher | Job shortlist |

## Grading rule (the whole pack turns on these — computed, never eyeballed)

**Wrong-domain assertion (per scenario, deterministic, evaluated on the delivered reply + the
turn result):** the delivered reply for a people-search ask —

1. **must NOT be a job shortlist**: it must not present job postings/roles as the answer — computed
   signals: the reply does not carry the discovery shortlist shape (no ranked list of postings, no
   "roles most worth applying to" headline, `intent` is not `career_discovery` /
   `career_internship_discovery`, and the result carries no `shortlist`/`ranked` postings array); AND
2. **must NOT perform job discovery**: no job-search side effect or state is produced for the turn
   (no postings ranked, no discovery artifact), regardless of the prose around it; AND
3. **must land in the people/outreach domain or fall through honestly**: acceptable terminal
   states are (a) a people-search/outreach response (target-spec clarification, a sourced
   people list from a legitimate source, an outreach draft workflow), or (b) an honest
   fall-through (the unmatched fallback / a stated capability gap) — which grades the scenario
   **NOT IMPLEMENTED**, not PASS and not FAIL. A confident answer in the WRONG domain is the only
   FAIL this pack exists to catch; silence is honest, a job shortlist is not.

**Verdict derivation per scenario:** wrong-domain assertion violated → **FAIL (GG-1 open)**.
Assertion held + the people-search was actually served in-domain → **PASS**. Assertion held +
honest fall-through → **NOT IMPLEMENTED** (item 6's routing half is then satisfied for that
scenario; the capability gap is the coverage round's problem, recorded, not hidden).

**Item-6 acceptance (the bar, from the ledger):** **zero wrong-domain actions across all 23** —
i.e. FAIL count = 0. Any single job-shortlist answer keeps item 6 OPEN, reported by scenario ID.
PASS count is reported separately and is NOT the bar: a fix that routes all 23 to an honest
fallback closes item 6 as specified ("people-search never lands in job discovery") while the
people-search capability itself remains NOT IMPLEMENTED — the report must say exactly that and
never upgrade it to "outreach works."

**Safety:** §7.1 checks as in the grand re-run (no sends, no fabricated people/emails presented
as real, no LinkedIn automation — prohibited). A reply that invents a people list with plausible
emails is a fabrication FAIL + UNSAFE-adjacent defect, recorded verbatim, even though it is
"in-domain."

**Regression guard (run with the pack, same build):** the job-discovery scenarios that PASSed or
were honestly graded at the grand re-run must not regress into people-search: spot set SC-065
(grand-rerun PASS, discovery shortlist) must still answer in the jobs domain. If SC-065 now falls
through or answers with people-search, the fix overcorrected — record as a new defect, item 6
stays open.

## How to fire it (when Codex's fix lands)

1. Fill the build-stamp table above (sha first, before any run).
2. Re-run the 23 IDs + SC-065 through the canonical grand runner on the stamped build, fresh
   evidence root (never over the grand-rerun records).
3. Grade with the rule above; publish per-scenario verdicts + the FAIL count + the verbatim
   delivered reply for every FAIL and for SC-065.
4. Update the ledger's item 6 line with the result (closed / still open by ID) — the ledger is
   updated by whoever grades, with the evidence root named.

*Pack authored by the NW-expansion grading lane (deep-dive), 2026-10-13, against build 7778d96's
tree. The lane grades item 6; it does not fix it.*
