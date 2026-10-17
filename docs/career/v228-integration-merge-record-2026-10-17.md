# v228 Integration Merge Record — 2026-10-17

Branch: `integration/v228-candidate` (worktree `~/workspace/upmore-depth-int`), off live v227 @ `671f833` (branch `fix/lf-08-target-firm`). Merge of the two parallel post-v227 fix lanes into one deploy candidate. No deploy, no push, no prod change — the deploy remains the owner's tap.

## §1 Merges, in order

1. `iterate/named-gaps` @ `b1de247` — merge commit `25172e2` (clean). Contents: BUG-266 closure (internship-headed finds route to the internship-banded route; the http-host pin moved deliberately, reason recorded in FR-421), BUG-271 (eligibility ask: graded from a resolvable posting or deflected with its missing inputs named), BUG-272 (restated fact acknowledged from the record), BUG-273 (tailored skills line scoped to the posting), guard `tests/career-iteration-named-gaps.test.cjs`.
2. `fix/lf-09-attribution` @ `1bb38e2` — merge commit `85c96af` (conflicts in two docs, resolved per §3; module 142 auto-merged as the exact union of both lanes' hunks — verified hunk-for-hunk, §3.1). Contents: LF-09 instances (i)/(ii)/(iii) — a preference fact is never an attribution source (142 + narrow 126 calendar-word refusal), an asked universe is never replaced by the on-record firm, geography writes only from the user's own location statements; guard `tests/career-lf09-attribution.test.cjs`.
3. Bundle rebuild commit `11cfae1` — bundles regenerated from the composed domain sources in BOTH modes (`python3 scripts/build-router-core.py` and `--career-only`); `--check` verified both modes. The auto-merged bundle files were NOT trusted: two independently rebuilt bundles interleave textually, so the deploy artifact is regenerated from the composed tree.

## §2 Renumber map (BUG/FR collision)

Both lanes provisionally took BUG-271/272/273 + FR-426/427/428. The ITERATION lane keeps its numbers (its commits landed first); the LF-09 lane's rows are renumbered to the next free numbers, verified against the merged ledger/register before assignment (merged maxima before renumbering: BUG-273, FR-428):

| Lane provisional | Merged (final) | Subject |
|---|---|---|
| LF-09 BUG-271 | **BUG-274** | Preference fact never an attribution source; unnamed offer lands company-not-stated (126 calendar-word refusal rides this row) |
| LF-09 FR-426 | **FR-429** | Rule for BUG-274 |
| LF-09 BUG-272 | **BUG-275** | Asked universe never replaced by the on-record target firm |
| LF-09 FR-427 | **FR-430** | Rule for BUG-275 |
| LF-09 BUG-273 | **BUG-276** | Geography writes only from the user's own location/basing statements |
| LF-09 FR-428 | **FR-431** | Rule for BUG-276 |

Renumbered surfaces: `docs/bug-ledger.md` (rows, incl. their `Rule:` refs and a RENUMBERED provenance note in each row), `docs/career/forbidden-rules.md` (section headings + BUG refs), `docs/instinct-spec-series/BUILD-STATUS.md` (the LF-09 claim line), `packages/domain/142-career-router.js` (the three LF-09 comment blocks), `packages/domain/126-career-track.js` (the CALENDAR_WORDS comment), `tests/career-lf09-attribution.test.cjs` (header — which also records the lane provisionals). The iteration lane's BUG-271/272/273 + FR-426/427/428 are untouched everywhere. Registry confirmation of the final numbers is still requested per MI-093, as on both lanes.

## §3 Conflict resolutions

### §3.1 `packages/domain/142-career-router.js` — composed, not picked
Git auto-merged the file; the composition was then verified deliberately, not assumed: diff(merged, iterate) equals exactly the LF-09 142 diff, and the merged hunk count (13) equals iteration's 9 + LF-09's 4 — no hunk lost, none duplicated. The one genuinely shared function is `captureStatedFacts`, where the two lanes' mechanisms are adjacent:

- **Head of function (iteration, BUG-272):** `push()` tracks restatements — when `recordThreadFact` dedupes (returns false) and the identical fact is already on record, the push is recorded in `restated` instead of vanishing.
- **Geography chain (LF-09, BUG-276):** the aiming/targeting sector frames are FACT_CITIES-gated, and the bare `in <CITY>` frame fires only when the clause predicates the city of the USER (first-person location verb, "my home/base is", or a bare "based in" in a self-description whose subject is not a role/job/posting).

Composed behavior, proven by the combined journeys (§5): "I'm based in Denver" with Denver on record — LF-09's predication gate lets the own-location push through, the write dedupes, and iteration's tracking turns it into the "Already on your record" acknowledgment. A job-location mention ("data analyst roles in Chicago") never reaches `push()` at all (LF-09 gate), so it can neither write geography nor manufacture a restatement. A sector target ("targeting fintech firms") is gated out entirely. The LF-09 universe-anchor block (handleCampaignPlan) and attribution block (handleTrackEventReport) sit in functions the iteration lane never touched; iteration's eligibility claim, restatement reply branch, and BUG-266 head-noun routing sit in dispatch regions LF-09 never touched.

### §3.2 `docs/bug-ledger.md` — both append after BUG-270
Resolved by keeping the iteration lane's three rows verbatim (BUG-271/272/273) and appending the LF-09 lane's three rows after them, renumbered per §2 (BUG-274/275/276, Rule refs FR-429/430/431).

### §3.3 `docs/career/forbidden-rules.md` — both append after FR-425
Same shape: iteration's FR-426/427/428 sections verbatim; LF-09's three sections appended after them, renumbered FR-429/430/431 with their BUG refs (274/275/276).

### §3.4 `docs/instinct-spec-series/BUILD-STATUS.md` — auto-merged
Both lanes' claim lines present; only the LF-09 line's numbers were edited (per §2). An integration claim line for this branch is added with this record.

### §3.5 Bundles — regenerated, never hand-merged (see §1.3).

## §4 Measurements on the merged tree

- Guards: LF-08 parity `tests/career-lf08-stated-fact-parity.test.cjs` **12/12**; LF-09 attribution `tests/career-lf09-attribution.test.cjs` **8/8**; iteration named-gaps `tests/career-iteration-named-gaps.test.cjs` **12/12**.
- Lane A corpus (`scripts/career/depth-lane-a-corpus.cjs`): **33/33 conversations**, 78 turns, fallback 0, memory 12/12, multi-intent 8/8, cross-thread 4/4, T3 4/4, zero commit-whitelist violations.
- Lane B corpus (`scripts/career/depth-lane-b/run-corpus.cjs`): **77/77 turns**, 0 failed turns, chains 24/24 (negotiation 8/8, career-OS 8/8, prep 8/8).
- Answer-map suite (`tests/career-portal-answer-map.test.cjs`): 8 tests, 6 pass / 2 fail — the 2 fails ("coverage: every fact kind in the bank is consumed or exempted" + its forcing-function twin) are caused by new fact kinds in the SHARED LIVE fact bank whose derivations live on `finish/answer-bindings`, which is NOT in this merge's scope. Proven identical on the pristine 671f833 base (same suite, same bank: 6 pass / same 2 fails) — pre-existing on base, shown identical, deliberately not fixed here.
- Full sweep (`node --test tests/*.cjs`): **4,409 tests / 4,355 pass / 13 fail / 41 skipped**. Test-count delta vs the 671f833 baseline (4,389) is exactly +20 = the two new guards (8 + 12). Fail decomposition:
  - 2 tolerated SC-300 C37 pins (R2 + R2A, `tests/career-gauntlet-r2.test.cjs`) — dispositioned baseline fails, identical on base.
  - 9 Chromium drive fails (D11×5, D12, D13, D14×2, `tests/career-portal-submit-integrity.test.cjs`) — environment-class (Chromium launch under this VM's sandbox), identical on base. Three-way proof of the class: (a) the LF-08 lane recorded the identical 9 failing on pristine 5711b77 in a workspace tree; (b) re-run on pristine 671f833 in a /tmp checkout, the same 9 tests SKIP via the suite's own Playwright-resolution gate (9 pass / 9 skipped / 0 fail — they never pass as behavior in either environment); (c) on the MERGED tree with the documented C-3 flag (`UPMORE_CHROMIUM_SANDBOX=off`) the suite passes **18/18** — the merged code drives every one of these journeys green as soon as Chromium can launch.
  - 2 answer-map fact-bank coverage fails — identical on base (above).
  Zero regressions vs the 671f833 baseline decomposition.

## §5 Combined journeys (fresh, host path, one account in sequence)

Run 2026-10-17 on the merged tree through the real CareerHost with production commit semantics; every journey on ONE account in sequence, so cross-lane interference would surface. All assertions pass; final committed account record: `{year: sophomore, majors: economics, target_firm: Meridian Capital, geography: Denver}` — exactly the four facts stated, each under its own kind.

- **J1 LF-08:** A: "I'm a sophomore studying economics, and I'm targeting Meridian Capital" → "Recorded — that is on your record now… your target firm is Meridian Capital." Then "I'm based in Denver and I want data roles" → recorded; record holds geography Denver AND target_firm Meridian Capital.
- **J2 restatement + recall:** B: "I'm based in Denver" → "Already on your record — nothing changed. On record: you're targeting Denver — exactly as you stated it before, so this turn writes nothing new." Then "what's my target firm?" → "From your record — your words, as stated. On record: your target firm is Meridian Capital."
- **J3 LF-09 (i) unnamed offer:** C: "I got an offer from a fintech startup, 85k, they want an answer by Monday" → "…so I will not guess a company onto it. Name the company and the row moves in the same turn, from your words." Committed tracker: exactly one row, company null, company_not_stated true, stage Offer.
- **J4 LF-09 (ii) universe:** D: "Help me network into healthcare consulting" → "Building the list now: consultants at healthcare consulting firms in Denver… The universe is the one you named — healthcare consulting firms…" (the record's geography fills the open facet; the firm does not replace the universe).
- **J5 eligibility:** E: "there's a posting for a licensed insurance adjuster — am I eligible for that?" → intent eligibility_check; "Eligibility can't be graded without the posting… The fact this turns on: insurance adjuster license — your record does not show it…" No verdict invented, no record non-sequitur.
- **J6 internship:** F: "find me internships" (mixed pool) → intent career_internship_discovery; "For Summer 2027… these are the internship and new-grad roles that fit best. Data Analytics Intern at Lumen Grid…" — the full-time Backend Engineer is not served.

## §6 Deploy contents statement

Deploying this commit (the tip of `integration/v228-candidate`) would put live exactly the v227 build plus: the LF-09 attribution fixes (142: no target_firm attribution fallback, chat reports ingested on 126's user channel with the user's verbatim clause as evidence, emitTrack source user_reported; 126: calendar words refused as company names), the universe-anchor narrowing (an asked universe — named firms, named set, category proposal — is never replaced by the on-record target firm), the geography-capture gating (sector frames city-gated; the bare `in <CITY>` frame only for the user's own location statements), the eligibility-ask journey (graded from a resolvable posting via 123's machinery, else deflected naming the missing posting and fact), the restated-fact acknowledgment, the BUG-266 internship-headed routing (with its http-host pin), the posting-scoped tailored skills line (123), the three guards (LF-08 parity already live-side; LF-09 attribution 8; iteration named-gaps 12), the renumbered ledger/FR docs (BUG-274/275/276, FR-429/430/431), and the regenerated router bundles (full 6,492,466 B / career-only 4,064,708 B, both `--check`-verified). It would NOT include module 149's new-kind answer derivations (branch `finish/answer-bindings`, separate candidate) and would change no migration, no scheduler unit, and no host file.
