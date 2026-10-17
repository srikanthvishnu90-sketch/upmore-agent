# Depth integration merge record — depth/integration (2026-10-16)

**What this is.** The five depth lanes of 2026-10-16 (memory, families,
knowledge, alerts, submissions) integrated onto the v224 line and
measured as ONE build against every raised bar simultaneously, plus
the owner's MI-023 ruling (2026-10-16 ~19:43 CDT) and the per-feature
perfection pass (~19:49 CDT). **Nothing here is deployed.** No prod
migration was applied, nothing was sent, nothing was pushed to main.
Deploys and the migration are the owner's tap.

- Branch: `depth/integration` (new worktree `~/workspace/upmore-depth-int`)
- Base: `c259cf6` (v224 line — registry completion pass: BUG-241…250 /
  FR-399…408; next free at base was BUG-251 / FR-409)
- Code-final commit: `997da38` (this record rides one docs commit on top)
- Lane worktrees, `~/workspace/upmore-career`, `~/workspace/upmore-combine`
  untouched. The alerts scheduler systemd unit still reads the
  depth-d worktree — NOT repointed (post-merge step, see §8).

## 1. Lane merges (in order)

| Merge commit | Lane | Content |
|---|---|---|
| `9fda284` | E `depth/submissions` (748c9ba + cad4c25) | MI-108 collision check, Lever radio fix (BUG-252/FR-410). Clean merge — E already sat on the c259cf6 line. |
| `9c2e6ca` | A `depth/memory` 4779719 | MI-012/013/017/021, LF-02. Carries NEW migration `supabase/migrations/20261016120000_career_account_stated_facts.sql` — in the branch, NOT applied to prod; it rides the deploy. |
| `1500ce3` | B `depth/families` 9b845b5 | MI-014/015/016/022 (negotiation, career-path, prep, wins/career-OS). |
| `a949121` | C `depth/knowledge` 2686199 | MI-019/020, MI-023 residual, MI-024/025/026, LF-05 frames. |
| `fe31076` | D `depth/alerts` (9de6d86 + 18ecbed) | MI-032 scheduler, MI-117, MI-029/033, P8 chat fix in 142. |
| `7084b1c` | — | Registry renumbering (§2). |
| `50ae5de` | — | Integration fixes §4.1–4.2 + MI-023 ruling (§3); bundles rebuilt. |
| `5447984` | — | Perfection-pass fixes (§4.3, BUG-263…269) + guards; bundles rebuilt. |
| `997da38` | — | Revert of the internship find-reroute (pinned contract, §5.3) + guard re-scope; bundles rebuilt, both `--check` verify. |

142-career-router.js was edited by lanes A, B, C and D; every merge
resolved surgically and all lane handlers survive (verified by the
lane corpora and suites on the merged tree, §5). Bundles were
regenerated LAST in each fix commit (`scripts/build-router-core.py`,
both modes; career bundle 4,044,896 bytes raw).

## 2. Registry renumbering (lane-provisional → final)

Lanes provisionally reused numbers (BUG-237/238/239 meant different
things in lanes B, C and D; lane A reused FR-395). All lane-provisional
entries were renumbered to fresh allocations starting at the base's
next-free counters. The v224 line's OWN BUG-237 (Greenhouse widget,
FR-395) and BUG-238 (answer map, FR-396) entries, contracts and
BUILD-STATUS lines are legitimate and untouched.

| Lane | Provisional | Final |
|---|---|---|
| A (memory) | BUG-237 / FR-395 (lane-local) | **BUG-251 / FR-409** |
| E (Lever radio) | PENDING-ALLOCATION row | **BUG-252 / FR-410** |
| B (wins log) | BUG-237 / FR-395 | **BUG-253 / FR-411** |
| B | BUG-238 / FR-396 | **BUG-254 / FR-412** |
| B | BUG-239 / FR-397 | **BUG-255 / FR-413** |
| B | BUG-240 / FR-398 | **BUG-256 / FR-414** |
| C (intel wiring) | BUG-237 | **BUG-257** (rule cited as **FR-415**) |
| C (MI-024 render) | BUG-238 | **BUG-258** (rule cited as **FR-416**) |
| C (MI-023 tailor) | BUG-239 | **BUG-259** (rule cited as **FR-417**) |
| D (MI-029) | BUG-237 | **BUG-260** |
| D (MI-033) | BUG-238 | **BUG-261** |
| D (scheduler cadence) | BUG-239 | **BUG-262** |
| Integration fixes (§4.3) | — | **BUG-263…269 / FR-418…424** |

Cross-references in guards, lane scripts and docs were rewritten to
the final numbers (151-career-alert-watch.js, alerts-scheduler.mjs,
and the affected test files). OWED DOC ITEM: Lane C never wrote
FR-415/416/417 rule sections in `docs/career/forbidden-rules.md` —
its rule text lives in the BUG-257/258/259 ledger rows only. Recorded
here rather than silently left; not merge-blocking.
Merge artifact fixed in this record's commit: the BUG-262 ledger row
arrived duplicated (Lane D's two commits each carried it); one copy
removed. Next free after this record: **BUG-270 / FR-425**.

## 3. MI-023 — owner ruling folded in (BUG-259 disposition updated)

**Ruling (owner, 2026-10-16 ~19:43 CDT): skills listed in a fact's
skills[] list COUNT as attested for tailoring. The prose-only
attestation rule is superseded.** Invention stays 0 absolute because
skills[] entries come only from the user's own record.

- Code: module 123 `assemble()` nameSafe filter — the sole prose-only
  enforcement point — now prints a name when the prose rule passes OR
  the canonical name is attested in the skills[] lists of
  `Profile.confirmedFacts(profile)`. The comment block records the
  ruling and the history (the Crew B Cycle 2 exemption reached 0.961
  coverage but was reverted when the prose-only grader counted 1,441
  inventions).
- Guards (tests/career-tailor-depth2.test.cjs): the skills[]-only
  "Legal Calendaring" case now MUST print (still never a gap); the
  non-lexicon skills[]-listed case prints under the ruling; **new
  invention guard**: a name attested by NEITHER prose NOR skills[]
  ("Quantum Basket Weaving", and lexicon "Rust" when unattested)
  never prints and lands as a gap.
- Measurement on the merged tree (Lane B 1,000-pairing harness,
  personas + scenarios as the lanes ran them): 1,000/1,000 ran,
  0 refused. **Coverage mean 0.961 (bar ≥0.85 ✓). Killer violations 0.**
  The (prose-only) grader flags 1,641 INVENTED_FACT; the classifier
  verdict on those flags: **all 1,641 are `midline_name_attested_skill_word`,
  0 true inventions** → **law under the ruling = 1.000 (bar ≥0.70 ✓),
  invention from neither prose nor skills[] = 0 ✓.** This reproduces
  Lane C's counterfactual (0.961 / 1.000) exactly, on the merged tree.
- Honest residue: harness composite verdicts PASS 75 / PARTIAL 124 /
  FAIL 801, driven by GENERIC_NOT_TAILORED flags (893) — a pre-existing
  Lane B metric family, not an MI-023 bar; MISSING_REQUIREMENT
  instances 67 at coverage 0.961. Tailoring is therefore NOT PERFECT
  under the per-feature bar (§6).

## 4. Integration fixes

### 4.1 Market-value + promotion/plan (Lane B corpus C5) — LANDED
Module 130's SC-271 branch stands down when the turn also carries a
promotion/plan ask; 142's plan handler answers and (per §4.3/BUG-268)
now carries the honest worth state in the same reply. Lane B corpus
on the merged tree: negotiation 26/26, career-OS 23/23, prep 28/28,
chains 8/8 + 8/8 + 8/8.

### 4.2 Wins log through chat (BUG-253) — LANDED
130's `osStore()` resolves the shared OS store via the track store
under both anchors (`ctx.trackStore`, the production host anchor, and
`ctx.profile._careerTrackStore`, the harness anchor — the pilot
harness shallow-copies ctx per turn while the profile object
persists, which is where the write was being lost). The SC-275 read
branch stands down for true log statements so 142's writer records
them, and the read reply appends the packet's own win lines. Lane B's
red-by-design guard is green: tests/career-depth-families.test.cjs
10/10.

### 4.3 Perfection-pass wave (fresh probe journeys on the merged tree)
Each defect below failed verbatim on the merged tree, was fixed in
142/130, and is replay-guarded by
tests/career-integration-perfection.test.cjs (8 tests):
- **BUG-263** negotiation claim learned offer arrival verbs
  ("offer just landed — fintech startup, 71k base…" was the generic
  fallback; the gate knew only "got an offer / offer came in").
- **BUG-264** direct stated-fact read-back ("so what's my target
  firm?") — new narrow handler answering from `ctx.statedFacts`, or
  the honest not-on-record reply; never a guess.
- **BUG-265** watch read-back shapes ("what's on my watch right
  now?", "show me my watch") added to both the dispatch gate and the
  manage gate; the create/manage store split suspected at probe time
  was verified NOT to exist on the host path (the profile round-trips
  through the snapshot; the pilot-lib miss was the harness ctx copy).
- **BUG-266** — OPEN, named not fixed: "find me internships" is
  served by the generic ranked discovery, not the internship-banded
  route (see §5.3). 
- **BUG-267** career-path gate/extraction: "thinking about <role> —
  is that a real move from here?" claimed; the target role is now
  extracted from thinking-about/considering shapes (was: the ladder
  composed "to null"); the "anything I should learn" follow-up joins
  the live-thread signal class.
- **BUG-268** composition completeness: the networking campaign
  recap stands down for worth/promotion turns; the career-plan reply
  carries the honest worth half and names itself the plan; the
  multi-intent taxonomy gains the worth part and the "show my
  applications" tracking shape, so a worth+watch+tracker ask is
  served/named in-turn and "next" delivers the held worth read in
  full (130 runs the part under the `_intentPartRun` flag).
- **BUG-269** SC-275 refinement: the read-branch stand-down fires
  only for a true log statement (≥3 words of recordable content
  after the wins cue), so the canonical method-description ask
  ("Wins log: I text wins all semester; they land in my living
  resume") reads the log instead of being logged as a garbage win
  (caught by tests/career-os-safety-wave.test.cjs H-12).

## 5. Combined measurement (final merged tree)

### 5.1 Full sweep — `node --test tests/*.test.cjs`
| Tree | Tests | Pass | Fail | Skipped |
|---|---|---|---|---|
| Baseline c259cf6 (pristine worktree) | 4,295 | 4,244 | 3 | 48 |
| Merged final tree (997da38 + docs, run with `UPMORE_CHROMIUM_SANDBOX=off`) | 4,387 | 4,344 | 2 | 41 |

The merged tree's only 2 fails are the tolerated SC-300 stale pins
(R2 C37 spot-check, R2A C37 guard — both also failing at baseline).
On the earlier 5447984 sweep (without the opt-out) the count showed
11: those 2 pins plus 9 subtests of
tests/career-portal-submit-integrity.test.cjs (D11×5, D12, D13,
D14×2), which are ENVIRONMENT, not regressions: at baseline those
tests skip because the throwaway worktree cannot resolve Playwright;
in this worktree Chromium launches only with the ledger's C-3
disposition `UPMORE_CHROMIUM_SANDBOX=off`. With the opt-out the
submit-integrity suite passes **18/18** and the final sweep above is
the clean number. The S3 claims-register test
fails at BASELINE and PASSES merged (a flip in our favor). The
42-battery (tests/career-complexity-battery.test.cjs) passes inside
the sweep. New in the sweep vs baseline: +92 tests, all lane guards
plus the 8 integration replays.

### 5.2 External FULL-300 grader (gauntlet grand-fresh)
- Merged tree, run 1 (commit 50ae5de + SC-275 refinement): **289/300**.
  Fails: SC-084, SC-088, SC-089, SC-091, SC-095, SC-105, SC-111,
  SC-166, SC-167, SC-179, SC-196 — the identical 11 Lane C measured on
  its branch and dispositioned baseline-identical.
- Pristine-base run (same grader, c259cf6 worktree): **289/300,
  fails SC-084, SC-088, SC-089, SC-091, SC-095, SC-105, SC-111,
  SC-166, SC-167, SC-179, SC-196 — the identical 11.**
- Final-commit run (997da38): **289/300, the identical 11 fails,
  same intents.** (An earlier pair of runs died at ~SC-097 with
  ENOSPC — the 512MB /tmp tmpfs filled with evidence output; both
  runs were re-executed end-to-end with output on disk-backed
  storage. No partial result was used.)
- Disposition: **the merge introduces ZERO grader failures.** The
  floor is ≥291/300 and the merged build scores 289 — BELOW THE
  FLOOR, with the entire shortfall inherited from the v224 base
  line (proven above, not asserted). Named plainly: the exam floor
  is not met by this build, the gap is pre-existing, and the ship
  call is the owner's with that fact in front of him.

### 5.3 Lane corpora re-run on the merged tree
- Lane A corpus (scripts/career/depth-lane-a-corpus.cjs): **33/33
  conversations PASS**, 78 turns, fallback 0, memory checks 12/12
  (bar ≥75%), multi-intent parts 8/8 (bar ≥90%), cross-thread XT 4/4
  (bar ≥70%), fails 0.
- Lane B corpus (scripts/career/depth-lane-b): **77/77 turns pass,
  fallback 0 in every family** (negotiation 26/26, career-OS 23/23,
  prep 28/28; bars: family fallback ≤10%, chains ≥90%, prep ≥70%),
  chains 24/24.
- Lane C: intel router wiring suite green in sweep; KB probe bands
  as Lane C measured (worst band 87.5%, wrong-lens 0).
- Lane D: P8 guard + scheduler cadence/fatigue suites green in
  sweep. The 48h unattended proof belongs to Lane D's own run
  (scheduler reads the depth-d worktree; §8).
- Lane E: submit-integrity 18/18 with the documented sandbox
  opt-out (§5.1).
- Tailoring 1,000-pairing: §3 (coverage 0.961, law 1.000 under the
  ruling, invention 0).

### 5.4 The "find me internships" pin (BUG-266)
tests/career-http-host.test.cjs pins intent `career_discovery` for
"Find me internships I can apply to this week." An integration
reroute to `career_internship_discovery` (5447984) was REVERTED
(997da38): the no-fabrication property the test exists for holds
under both intents, and an integration merge does not rewrite a
v224-line pin for a framing gain. Residue: the ask is served by the
generic ranked search rather than the internship-banded route
(bands intern/new-grad/junior + summer headline), which owns the
need/want/looking shapes. Fixing it = a deliberate pin update in a
lane change, not an integration edit.

## 6. Per-feature verdicts (worst turn judged; fresh conversations)

PERFECT (end-to-end on the production/host path unless noted):
stated-fact capture + use (Lane A corpus 12/12 memory checks);
corrections + direct read-back (BUG-264); cross-thread recall
(XT 4/4); tracker moves + assertion floor (hearsay earns a
confirming question, 0 non-assertion writes); negotiation chains
(26/26 turns, 8/8 chains; arrival-verb opener fixed, BUG-263);
career-path (8/8 chains; thinking-about journey fixed, BUG-267);
prep sessions (28/28 turns, wrong-domain guard holds); wins log
through chat (BUG-253 + BUG-269); watch create + read-back in chat
(BUG-265); multi-intent on corpus shapes (8/8) AND on the
worth-first mixed ask (BUG-268); KB intel role-lens on the host
path (the pilot-harness cannot see it — `discovery` is a
host-persisted state key by design, so the elliptical follow-up is
graded on the deployed path); alerts cadence/fatigue suites;
submit integrity (18/18, sandbox opt-out documented); caps +
collision suites.

NOT PERFECT (verbatim failing turns):
1. **Eligibility, bare ask.** "there's a posting for a licensed
   insurance adjuster — am I eligible for that?" → "That is not on
   your record — you have not told me yet…" — honest and
   invention-free, but a non-sequitur: with no posting on the
   thread there is nothing for the spoken-eligibility mechanism to
   grade, and the reply never names the missing piece. What it
   takes: a clarifying deflection that names the missing input
   (the posting text or the license fact) — a lane change.
2. **Discovery ask-type fidelity (BUG-266).** "find me internships"
   (after "I'm a senior, econ major, based in Austin… fintech") is
   served by the generic ranked search — full-time roles, no
   internship framing. See §5.4.
3. **Tailoring depth.** Coverage 0.961 is not 1.000 (67
   MISSING_REQUIREMENT instances) and the harness composite still
   flags GENERIC_NOT_TAILORED 893 times across 1,000 pairings.
   Coverage/law/invention bars all pass (§3); perfection does not.

## 7. What the product can now DO (vs v223 live)
Remember stated facts across threads and use them — and answer
"what's my target firm?" from the record. Run complete negotiation,
career-path and prep conversations in genuine phrasing, including
offer-arrival openers and thinking-about-a-move asks. Keep a wins
log through chat that survives threads, and read it back as a
review packet. Serve company intel through the asked role's lens
with cited library stats and zero wrong-lens answers. Tailor with
skills[]-attested skills named (owner's MI-023 ruling) at 0.961
coverage with zero invented facts, and print the eligibility
verdict on the document itself. Poll the full board directory on
a drift-proof cadence, recover gate evidence for convention-titled
postings, and retry transport-failed boards in 15 minutes instead
of parking them for hours. Answer every part of a multi-ask
message — in the turn, or named and held for "next".

## 8. Remaining steps to live (owner's deploy tap)
1. Deploy branch `depth/integration` (this record's commit).
2. Apply migration `20261016120000_career_account_stated_facts.sql`
   with the deploy (it rides the branch; never applied to prod
   during integration).
3. Repoint the alerts scheduler systemd unit from the depth-d
   worktree to the integrated tree and restart it (the 48h clean
   clock restarts at the repoint — Lane D's run is not disturbed
   before then).
4. Post-deploy: P8 + combined live re-probe on the product path
   (the §6 journeys), then the live FULL-300.
