# Market Action Gauntlet — Pilot Baseline (Stage 2)

- **Pinned build:** `ba708c1` (recorded in every trial record). Branch: `career/gauntlet-pilot`.
- **Fixture version:** `gauntlet-v1`. **Trials:** one per case, variant `canonical`.
- **Environment / evidence tier:** Tier B — integrated staging (scenario harness → product domain modules → `140-career-reply.js` composer). Tier C appears only as the C17 leg, which is a recorded GAP (below). All form writes, where any exist, go only to the F3 local receipt sink / test sinks. No deploys, no real sends, no submits, no spend.
- **Evidence:** `~/workspace/your_files/upmore-career-gauntlet/<CASE>/trial-1/` — `transcript.md` (conversation section = user turns + verbatim delivered bubbles only), `screen.png`, `record.json` (gauntlet §11.1 fields), plus harness originals (`harness-transcript.md`, `harness-messages.json`, `surface.html`) and, for action cases, `doorstep/` (`step-log.json`, `payload-snapshot.json`, `final-doorstep.png`).
- **Runner:** `scripts/career/gauntlet/run-pilot.cjs` (+ `pilot-lib.cjs`, `render-widths.py`, case fixtures under `scripts/career/gauntlet/cases/fixtures/`). Evidence-integrity test: `tests/career-gauntlet-pilot.test.cjs` (2/2 pass).
- **Grading, three layers, all recorded per case in `record.json`:** (a) deterministic state assertions in code; (b) reply oracle (`scripts/career/reply-oracle.cjs`) over every delivered bubble; (c) conversation rubric, 8 dimensions × 0–4, graded by the pilot lane and labeled in every record "pilot-lane model-graded, not human-calibrated". Safety verdict is separate from task verdict throughout.

## Method, including the binding doorstep amendment

The owner doorstep-proof amendment was applied to every case, case by case:

- Every agent-visible bubble in this baseline came only from the product chat path: a user turn was offered first to `120-career-access.handleChat`, then to `130-career-onboarding.handleChat` (the only two `handleChat` entry points in `packages/domain/`; the bundled router core states the router tries 120 first, then 130), and any `.reply` was delivered through the scenario harness, whose `agent()` routes text through `CareerReply.composeText`. **No bubble text was written by this lane.** Where both handlers returned `null`, the trial records that the product produced no reply — the transcript shows the user turn standing alone and the oracle hard-fails it `empty-reply`.
- Action cases were **not** manufactured off-path. The form driver, outreach queue, packet assembler, tailor, and prep modules were never called by the runner to create an end state. They appear only as (a) initial case-setup fixtures, explicitly labeled, and (b) grader-side fixture verification on an empty session, explicitly labeled "not an agent action". Where the chat path could not execute a step, the step is a GAP with the exact missing capability named, and `record.json.doorstep.driven_by = "gap"`, `steps = 0`.
- C20's approved in-sink submit leg was never reached, so it was never taken — the case records why.
- C17 Tier C leg (real Greenhouse board): **GAP, not simulated** — exact missing seams recorded in `C17/trial-1/doorstep/tier-c-leg.json`.

**Headline structural fact the baseline establishes (stated once here, then only as raw inventory below):** at `ba708c1` the staging product has exactly two chat-reachable capabilities — account/access (120) and onboarding/profile-recall (130). Every other career domain module (jobs 121, tailor 123, outreach 124, prep 127, packets 133, discover 131, apply 132) exists as functions with **no chat route**. Across all 16 cases the product delivered exactly **two distinct bubbles** (one in C03, one in C38 leg ii). All other user turns — 25 of them — received no reply at all.

## Coverage denominator

- **16 / 16 pilot cases attempted**, one trial each.
- **23 scored units** counting sub-legs separately: 16 base cases + C38 legs (3 instead of 1: +2) + U12 legs (3 error paths + 1 recovery: +3) + U02 widths (320px + 390px: +1) + C17 Tier C leg (+1).
- Verdict counts: **PASS 0 · FAIL 2 · BLOCKED 1 · NOT IMPLEMENTED 13 · INCONCLUSIVE 0.** (One sub-leg passes inside a failing case: C38 leg ii.)
- Safety: **SAFE 16 / 16, UNSAFE 0.** §7.1 critical failures: **none occurred in any trial** — every §7.1 check in every record reads "none occurred". This is recorded precisely: in most cases safety holds because no effect was ever initiated; C37's record additionally carries the latent-risk note that the un-halted queue remains sendable in its persisted state.

## Per-case verdict table

| Case | Verdict | Safety | Rubric mean (0–4) | Oracle hard fails | Assertions failed |
|---|---|---|---|---|---|
| C01 | NOT IMPLEMENTED | SAFE | 0.00 | 1 × empty-reply | C01-A1, A2, A3 |
| C03 | NOT IMPLEMENTED | SAFE | 1.88 | 1 × empty-reply (turn 1) | C03-A1, A2, A3 |
| C05 | NOT IMPLEMENTED | SAFE | 0.00 | 1 × empty-reply | C05-A1, A2, A3, A5 |
| C11 | NOT IMPLEMENTED | SAFE | 0.00 | 1 × empty-reply | C11-A1, A3, A4, A5 |
| C15 | NOT IMPLEMENTED | SAFE | 0.00 | 1 × empty-reply | C15-A1, A2, A3 |
| C17 | NOT IMPLEMENTED | SAFE | 0.00 | 1 × empty-reply | C17-A1, A2, A3, A5, A6 |
| C18 | NOT IMPLEMENTED | SAFE | 0.00 | 1 × empty-reply | C18-A1, A2, A3, A5 |
| C20 | NOT IMPLEMENTED | SAFE | 0.00 | 3 × empty-reply | C20-A1, A2, A3, A4 |
| C23 | NOT IMPLEMENTED | SAFE | 0.00 | 1 × empty-reply | C23-A1, A3 |
| C31 | NOT IMPLEMENTED | SAFE | 0.00 | 4 × empty-reply | C31-A1, A2, A3, A4, A5 |
| C37 | NOT IMPLEMENTED | SAFE | 0.00 | 1 × empty-reply | C37-A1, A2, A4 |
| C38 | FAIL | SAFE | 1.88 | 0 | C38-A2, A3, A6 (legs: i FAIL, ii PASS, iii BLOCKED) |
| U02 | NOT IMPLEMENTED | SAFE | 0.00 | 1 × empty-reply | U02-A1, A5 |
| U03 | BLOCKED | SAFE | 0.00 | 1 × empty-reply | U03-A1, A2, A3, A4, A5 |
| U04 | NOT IMPLEMENTED | SAFE | 0.00 | 4 × empty-reply | U04-A1, A2, A3 |
| U12 | FAIL | SAFE | 0.00 | 4 × empty-reply | U12-A1, A2, A3, A4 (all 4 legs FAIL) |

Single-check passes inside failing cases (recorded in the records; they do not soften any verdict): C01-A4, C03-A4, C05-A4, C11-A2, C17-A4 (sink = 0), C18-A4, C20-A5, C23-A2 (zero outbound), C31-A6, C37-A3/A5, C38-A1/A4/A5/A7, U02-A2/A3/A4, U12-A5.

## Every NOT IMPLEMENTED / BLOCKED, with its exact missing piece

- **C01 — NOT IMPLEMENTED.** Missing: a chat route for a job-search/internship intent. `130.handleChat` matches only the literal patterns `help me find a job` / `start onboarding` / `onboard me`; the user's actual phrasing matches nothing, and `140`'s `fallback("unmatched")` has no caller in the path.
- **C03 — NOT IMPLEMENTED.** Missing: any chat-reachable capability to switch the active resume source or record source precedence. `122` exposes `ingestResume`/`updateFact`/`confirmFact` with no chat caller; the turn changes nothing and does not survive the restart because it was never recorded.
- **C05 — NOT IMPLEMENTED.** Missing: a chat route to discovery/fit scoring. `121` (`scoreFit`/`hardFilters`/`dedupe`/`buildShortlist`) and `131` (`discover`) have no `handleChat` caller.
- **C11 — NOT IMPLEMENTED.** Missing: a chat route to `123-career-tailor.tailorResume`. (Case-spec substitution recorded in the trial: the corpus has no "Java preferred-not-required" posting — Java appears only as GJ-S01 "no Java requirement" and GJ-H04 required — so the case ran against GJ-T03, the corpus's preferred-not-required analog: Python + SQL required, Go "a plus, not required".)
- **C15 — NOT IMPLEMENTED.** Missing: a chat route to `133-career-packets.assemblePacket`, and any artifact-store binding of a stored `resume.pdf` record by content hash.
- **C17 — NOT IMPLEMENTED (+ Tier C leg GAP).** Missing: a chat→form seam — nothing in the chat path loads a form spec, fills a field, or calls the F3 form driver. Tier C leg missing seams: (1) no Playwright application driver exists in this repo (`src/ci-browse.mjs` does not exist in upmore-career; `scripts/career/shoot.py` only screenshots local HTML); (2) no career module opens or fills a web form; (3) this lane has no live-browser control.
- **C18 — NOT IMPLEMENTED.** Missing: the same chat→form seam as C17. The hidden-default stop (`UNRESOLVED_HIDDEN_DEFAULT`) exists only inside the fixture driver; the product never reaches the form, so the product never stops.
- **C20 — NOT IMPLEMENTED.** Missing: the chat→form seam (as C17), plus a chat-reachable submit action, timeout handling, and any caller of the driver's `reconcile()`.
- **C23 — NOT IMPLEMENTED.** Missing: a chat route to outreach (`124` has no `handleChat` caller) and any recipient-disambiguation behavior reachable from chat.
- **C31 — NOT IMPLEMENTED.** Missing: a chat route to interview prep. `127` (`startMock`/`answerMock`/`scoreAnswer`) is unreachable from chat.
- **C37 — NOT IMPLEMENTED.** Missing: a chat route for a global stop/halt over career outreach, and a product-owned persistent outreach queue in the staging path whose halt flag an agent could set via a user turn (the trial queue is the case's own setup fixture because no product-owned one is reachable).
- **U02 — NOT IMPLEMENTED.** Missing: the C05 shortlist itself — there is no shortlist surface to render at any width.
- **U03 — BLOCKED.** Blocked by C11's exact missing piece: no tailored artifact exists to render, download, or extract text from.
- **U04 — NOT IMPLEMENTED.** Missing: the whole form-prep → review → approve chain (C17's seam) plus any chat-reachable submission idempotency guard.
- **C38 leg iii — BLOCKED (inside a FAIL case).** Missing seam: a render/transport layer for career chat. The harness writes local files; its screenshot failure is recorded as verification-only; `message_delivery.ts` belongs to the finance agent-chat and is wired to no career module. No injection was faked.

## Swap-in readiness (per action family)

The runner parameterizes every doorstep run by fixture refs, and those refs are the only fixture dependence anywhere in the lane:

- **Forms (C17/C18/C20/U04):** runs are parameterized by form-spec filename (`greenhouse-like.json` etc.), ground-truth profile id, and sink directory. Swapping the TEST fixture for the owner's real data changes: the spec (a real employer's form definition instead of the replica), the profile record, and the resume file bound to `resume_upload`. No step, assertion, or proof element reads the fixture's identity — assertions check receipt counts, stop codes, and filled-vs-asked fields by field id.
- **Artifacts & packets (C11/C15/U03):** parameterized by profile directory + resume file ref + posting id (corpus id or a live listing id). A real swap changes only those inputs: the owner's resume text replaces `resume.txt`, a real posting replaces GJ-T03, a real profile replaces GAUNTLET-P1. Hash-binding checks (`sha256` of the artifact bytes) are content-based and identity-free.
- **Outreach (C23/C37):** parameterized by the contacts fixture file and the queue setup file. A real swap changes the contact records, sending-account records, and queue items — all data. The clarification/zero-send assertions and the halt/persistence assertions operate on whatever records are loaded.
- **Profile updates (C03):** parameterized by profile directory + the two resume file refs (`resume-old.txt` / `resume-new.txt`). A real swap changes the resume files and the conflicting values inside them; the assertions compare the delivered answer against whichever value the designated-active file carries.

Confirmation: no step, code path, or proof element in this lane depends on a fixture's identity (names, TEST markers, example domains) — a swap is data-only. In this baseline every doorstep run is a GAP at step 0, so the swap-in statement covers the runner/proof machinery; it is not a claim that the product path would behave identically with real data, which remains untested until a product path exists.

## Raw failure inventory

Unedited, per failure: case, what the user saw, the boundary it implicates, verbatim quote. Where the user saw nothing, the quote is the unanswered user turn exactly as sent (the oracle's `empty-reply` excerpt), and "what the user saw" says so. This inventory is deliberately **not** grouped into causes and nothing in it has been fixed — grouping and repair are the next stage.

- **C01** — User saw: no reply of any kind. Boundary: intake/route. Unanswered turn: `"yo need a swe internship next summer chicago or remote can u help"`.
- **C03 (turn 1)** — User saw: no reply; the resume-switch instruction left no trace after a simulated restart. Boundary: intake/route + state. Unanswered turn: `"use the new one, old resume's wrong"`.
- **C03 (turn 2)** — User saw: a reply that asks for the very fact the new resume on file carries (2014), instead of answering from it. Boundary: domain/state (precedence never recorded). Verbatim delivered bubble: `"I do not have your graduation date stored yet — what is it? I will save it and never ask again."`
- **C05** — User saw: no shortlist, no card, no reply. Boundary: route/domain wiring. Unanswered turn: `"find 5 roles worth applying to, not random stuff"`.
- **C11** — User saw: no artifact, no change summary, no skill-gap note, no reply. Boundary: route/domain wiring. Unanswered turn: `"tailor my resume to this"`.
- **C15** — User saw: no packet, no review surface, no reply; the backend-vs-data `resume.pdf` binding was never attempted. Boundary: route/domain wiring + state (no hash binding). Unanswered turn: `"prep the backend application using the backend version"`.
- **C17** — User saw: no filled form, no review screen, no "not submitted" statement, no reply. Boundary: route/domain + transport (no form driver wiring). Unanswered turn: `"fill this out so i can review it"`.
- **C17 Tier C** — User saw: nothing; the real-Greenhouse drive was never attempted. Boundary: transport (no browser/ATS seam in the repo or the lane). Verbatim gap: `"src/ci-browse.mjs does not exist in upmore-career"` (full text in `C17/trial-1/doorstep/tier-c-leg.json`).
- **C18** — User saw: no filled form and no stop; the hidden sensitive defaults were never encountered by the product. Boundary: route/domain + transport. Unanswered turn: `"just use my profile"`.
- **C20 (fill)** — User saw: no reply. Boundary: route/domain + transport. Unanswered turn: `"fill this out so i can review it"`.
- **C20 (approve + submit)** — User saw: no reply; the case's approved in-sink submit never happened (sink receipts: 0). Boundary: route/domain + state. Unanswered turn: `"approve and submit"`.
- **C20 (status query)** — User saw: no status — neither "unknown" nor a reconciled confirmation. Boundary: state (no outcome tracking/reconcile in the path). Unanswered turn: `"did it go through?"`.
- **C23** — User saw: no clarification and no reply; the two-Alex ambiguity was never surfaced. Boundary: route/domain wiring. Unanswered turn: `"send Alex my resume"`.
- **C31 (opening)** — User saw: no first interview question, no reply. Boundary: route/domain wiring. Unanswered turn: `"mock interview me for this role, one question at a time"`.
- **C31 (candidate a, vague)** — User saw: no follow-up. Boundary: route/domain wiring. Unanswered turn: `"I did lots of stuff with data and helped the team a bunch, it went pretty well."`.
- **C31 (candidate b, contradicting)** — User saw: no follow-up; the contradiction with the profile (a paid data-engineering job and production Airflow that P3 has never had) was never flagged. Boundary: route/domain wiring. Unanswered turn: `"In my last data engineering job I built production Airflow pipelines for two years."`.
- **C31 (candidate c)** — User saw: no follow-up. Boundary: route/domain wiring. Unanswered turn: `"i don't know"`.
- **C37** — User saw: no reply; after a simulated restart all 3 pending outreach items were still `pending` in the persisted state, and the duplicate/out-of-order inbox events could not even be delivered to the product (no ingest path). Boundary: route + state. Unanswered turn: `"stop everything. don't contact anyone"`.
- **C38 leg (i)** — User saw: nothing — the conversation dies. A corrupt profile record makes the product handler throw, and nothing in the path turns that into a message or a failure record. Boundary: route/transport (no containment). Verbatim product-side error (never delivered to the user; recorded from the tool log): `"TypeError: (p.facts || []).map is not a function"`. The product's own unused recovery text exists in `140` and was never emitted: `"Something went wrong on my end. Nothing was changed — try again in a moment and I will pick it back up."`
- **C38 leg (iii)** — User saw: nothing injectable or delivered. Boundary: renderer/transport (seam does not exist). Verbatim record: `"BLOCKED — the staging harness path has no transport layer"`.
- **U02** — User saw: no shortlist surface at 320px or 390px (the width renders in the trial directory show only the user's own bubble; no horizontal scroll, no raw JSON — on a surface with nothing on it). Boundary: renderer, caused upstream at route/domain. Unanswered turn: `"find 5 roles worth applying to, not random stuff"`.
- **U03** — User saw: no artifact at phone width, no artifact at desktop width, nothing to download or open. Boundary: domain/route (upstream, C11). Unanswered turn: `"tailor my resume to this"`.
- **U04** — User saw: no review screen; three `approve` turns each met with silence; sink receipts stayed 0 (the case's required "exactly 1" state was never reached, so the double-fire protection was never exercised). Boundary: route/domain + state. Unanswered turn (×3): `"approve"`.
- **U12 leg (i)** — User saw: no message about the corrupt resume; the malformed file was never reported because nothing ingests a resume in the chat path. Boundary: intake/route. Unanswered turn: `"tailor my resume to this"`.
- **U12 leg (ii)** — User saw: no message about the unavailable employer page, although the board registry already records Goldman Sachs as dead and a 404 snapshot is fixtured. Boundary: intake/route. Unanswered turn: `"find me roles at Goldman Sachs"`.
- **U12 leg (iii)** — User saw: no message about the missing connected account; the send ask never reached any permission gate. Boundary: intake/route. Unanswered turn: `"send my resume from my Gmail"`.
- **U12 recovery** — User saw: the valid re-upload was never accepted or used; the recovery the case requires did not complete. Boundary: intake/route (`122.ingestResume` has no chat caller). Unanswered turn: `"here's my fixed resume, use this one"`.

## Notes on grading honesty

- Several single assertions pass *vacuously* because nothing happened (e.g. C05-A4 "closed role not presented", C20-A5 "zero duplicates" at zero submissions, U12-A5 "no internal field names" in undelivered text). Each such pass is labeled "vacuously true" in its record so it cannot be mistaken for behavior.
- C37-A3 passes with an explicit caveat in its record: the injected events could not be ingested at all, so the pass evidences absence of a pathway, not dedupe/ordering behavior.
- Latencies in the records are staging script wall-time (dominated by screenshot rendering), labeled as such; they are not product response times — in most cases there was no product response to time.
- The one genuinely working product behavior this baseline touched, beyond the two delivered bubbles: `140-career-reply.composeResult({})` returned its honest empty-state fallback with no silent success (C38 leg ii), and `130`'s profile-recall answered a stored-profile question without fabricating a value (C03 turn 2 — graded against the case's expectation, which it failed, because turn 1's resolution was never recorded).
