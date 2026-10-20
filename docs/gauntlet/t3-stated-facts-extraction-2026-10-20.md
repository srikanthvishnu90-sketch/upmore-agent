# FIX LANE T3 — stated-facts extraction quality (FACT-KEY-GARBLE-DUP) — 2026-10-20

Branch: `fix/t3-stated-facts-extraction` off trunk `integration/v2-candidate`
@ 47e5f6b0. **Built + proven in the harness. NOT deployed** — the deploy
is the owner's word on this exact commit, like every lane before it.

Evidence: the live Telegram battery of 2026-10-20
(`~/workspace/your_files/channel-tests/2026-10-20-telegram.md`, turns
2–3 and cross-check §4, which read the store back from the product's
own tables). Defect row FACT-KEY-GARBLE-DUP (PENDING-ALLOCATION in the
battery record; Crew A numbers it).

## The two defects, mechanism-level

**1. Key garble + duplicate (turn 3, live).** The turn's sentence —
verbatim: "Quick note — my target firm is Northwind Ledger and my
recruiter contact there is Dana. Please remember that." — committed
with `intent: profile_correction, result_status: completed`. The firm
half is perfect in the store: `target_firm` = "Northwind Ledger",
exactly once (the Google → Northwind Ledger correction landed). The
contact half minted a SECOND `recruiter_contact` fact keyed
**`northwind ledger and`**, duplicating the clean `northwind ledger`
fact planted that morning.

Mechanism: the "recruiter contact there is <Name>" frame keys the fact
by `turnCompany()`, which runs the 3-token company pattern
`CO = ([A-Z]…(?:\s+[A-Z]…){0,2})` over the WHOLE unquoted turn, case-
insensitively. In "…is Northwind Ledger **and** my recruiter contact…"
the greedy span takes "Northwind Ledger and" — the third token is the
sentence's conjunction — and `cleanCo` stripped only "(fictional)"
and trailing punctuation, so the conjunction reached the store as
part of the key. With a one-token company the same span swallows on:
"Gusto and my". The lab never saw it because CB-0441's sentence
carries "(fictional)" right after the company name, which blocks the
third token and masks the swallow — the same live-vs-lab shape as
every lane before this one.

**2. Fragment stored as a fact value (same store, 06:00 UTC input).**
`majors` = **"at fintechs in SF who share my"**, evidence "at fintechs
in SF who share my major" — read back to the user in turns 2–3 as
"you study at fintechs in SF who share my". Mechanism: the bounded
lazy "X major" frame `([a-z][a-z &]{2,30}?)\s+major\b` scans from the
earliest lowercase word that can reach " major" within 30 chars; in
the source sentence ("Find 75 data scientists at fintechs in SF who
share my major" — the full sentence survives as the geography fact's
evidence) that start is "at", and the span it takes is exactly 30
chars: a relative-clause fragment, not a field of study. Reproduced
byte-for-byte in the harness pre-fix (the guard test's failure output
shows the identical value + evidence).

## The fix (packages/domain/142-career-router.js, surgical)

1. **`cleanCo` — company spans stop at conjunctions / clause
   boundaries.** Every company capture in the keyed-fact block (and
   `turnCompany()`, its main feeder) funnels through this one
   cleaner. New rules, in order: cut the span at a conjunction that a
   clause word follows (`my|the|a|an|this|that|there|it|he|she|they|
   we|you|i|is|was|are|were|who`) — a NAME token after "and" is never
   cut, so "Johnson and Johnson" survives intact (guard T3-5) — then
   strip any trailing bare conjunction token (`and|or|&`), repeatedly.
2. **`recordKeyedFact` — key sanitation at the store choke point.**
   The normalized key now also loses a trailing bare conjunction
   before it is stored or matched, so no present or future caller can
   mint a conjunction-tailed key again; a late garbled write would
   collide with the clean key and take replace semantics instead of
   duplicating.
3. **`_spanIsFragment` + `pushMajors` — fact spans must be complete
   phrases.** A candidate majors value is a fragment if it STARTS
   with a preposition/conjunction/possessive, CONTAINS a relative
   pronoun (who/whom/whose/which/that/where), or ENDS on a dangling
   function word. The proven fragment trips all three. All four majors
   frames now record through `pushMajors`, which applies
   `_cleanFactVal` and records nothing for a fragment. Legitimate
   majors in every frame are pinned by guard T3-8.

Bundles regenerated both modes (`scripts/build-router-core.py` and
`--career-only`), `--check` clean on both; the fix is present in
`router_core.js` and `router_core.career.js`.

Adjacent class, observed and NOT fixed here (out of this lane's
proven scope): the firm-correction NAME pattern in block (0b) uses
the same 3-token span shape over the whole turn; no live garble from
it is on record. It inherits no protection from this lane's
`cleanCo` change (its `cleanNew` is a separate cleaner). Flagged for
whichever lane next touches corrections.

## Guard evidence (tests/career-t3-stated-facts-extraction.test.cjs)

Fail-first on trunk base, same harness as the lane-A depth suite
(real CareerHost, real router):

- Base: **the six defect tests FAIL** — T3-1, T3-2, T3-3, T3-4 (key
  garbles: exact battery sentence; two-turn live sequence; one-token
  company "gusto and my"; hiring-manager compound) and T3-6, T3-7
  (the fragment sentence class, two surfaces). **Both control groups
  PASS on base** (verified by re-running T3-5 + T3-8 against the
  unmodified source with the final harness: internal conjunction
  preserved; real majors captured in all four frames) — so the suite
  isolates exactly the two defects and nothing else.
- Fixed: **8/8 pass.** The fixed extractor, run on the battery's
  exact turn-3 sentence, produces exactly one `recruiter_contact`
  fact, key `northwind ledger`, value Dana; `target_firm` lands
  once as "Northwind Ledger"; no stored key ends in a bare
  conjunction; the fragment's sentence class mints no majors fact.

Full sweep (`node --test tests/*.cjs`, same worktree, same method
both runs): base 4,526 tests / 4,471 pass / 14 fail / 41 skipped →
fixed 4,534 / 4,479 / 14 / 41. The delta is exactly this lane's
guard suite (+8 tests, +8 pass). The failing-name set is
**byte-identical** before and after (the 14 pre-existing entries:
BUG-207 ×5, BUG-208, BUG-209, BUG-237 ×2, the R2/R2A kill-switch
pair, the two coverage rows, and the career-extension-sync
file-level line) — **zero regressions, zero flips**. The v241
keyed-split suite and the 9-kind validator transcription inside it
pass unchanged (they are in the sweep, and the targeted run of
lane-a-depth + v240 + v241 + router-bundle suites was 55/55 — the
session's terminal summary: 55 tests, 55 pass, 0 fail).
agent100 dry run: **103/103**.

## Already-stored garbles — characterization (cleanup NOT performed)

BEFORE state, read live from the product's tables for the TEST user
(2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3), `career_watch_kv` key
`career:account` → `stated_facts`, 2026-10-20:

- `facts[]`: year "sophomore" (clean) · geography "SF", evidence
  "Find 75 data scientists at fintechs in SF who share my major"
  (value clean; see the observation below) · **majors "at fintechs in
  SF who share my" — GARBLED (defect 2)** · target_firm "Northwind
  Ledger" (clean) · level "analysts" (value coherent, not in scope).
- `keyed[]`: recruiter_contact @ `northwind ledger` = Dana (clean,
  15:31 UTC) · **recruiter_contact @ `northwind ledger and` = Dana —
  GARBLED KEY (defect 1)**, evidence "recruiter contact there is
  Dana" (20:30 UTC, battery turn 3).

Exactly two stored facts are garbled. Both repairs ARE pure
re-derivations from stored user assertions, proven in the harness:
(a) turn 3's full sentence (stored verbatim in agent_messages,
cross-checked word-for-word) re-run through the FIXED extractor
after the morning plant yields exactly one contact fact under the
clean key — the garbled-key entry is not derivable and drops;
(b) the fragment's full source sentence (stored as the geography
fact's evidence) re-run through the FIXED extractor yields geography
"SF" and NO majors fact — the stored fragment is not derivable and
drops. No other stored fact changes under re-derivation.

The writes were nevertheless NOT performed, for two mechanical
reasons the derivation cannot cure:

1. **Propagation.** The account record is not the only carrier. The
   host folds account facts into every thread's working set at seed
   time and the thread's statement wins per keyed identity, so both
   garbles already sit inside **at least six live thread snapshots**
   (`agent_flow_state`) — several belonging to other lanes' in-flight
   test threads — as well as in `career:turn:*` turn receipts.
   Receipts are the audit record of what actually happened and must
   never be rewritten; scrubbing six live snapshots from this lane
   risks corrupting parallel lanes' state to heal a fixture.
2. **Wholesale re-derivation is not provably conservative.** The
   extractor has gained frames since some of these facts were
   minted; replaying the account's entire assertion history through
   today's extractor cannot be shown to change ONLY the two garbles,
   and the cleanup rule for this lane was perform-only-if-pure.

**The repair rule (for stored garbles generally, incl. real users) —
to be executed at the host seed/merge boundary by its owner lane,
never by history surgery:**

- Canonicalize every stored keyed fact's key at seed time with the
  same rule `recordKeyedFact` now applies (strip a trailing bare
  conjunction). Keyed identities are computed on the canonical key,
  so a garbled legacy entry collides with its clean twin and merge
  replace-semantics keep exactly one — the later statement's value
  and evidence. The stored record heals on that thread's next commit;
  no receipt or message is ever edited.
- Drop at seed time any stored fact whose value fails the
  completeness test (`_spanIsFragment`). Only the fragment class can
  produce such a value; an asserted real value always passes. Same
  heal-on-next-commit property.
- Until that boundary repair ships, the two garbled entries remain
  visible in read-backs on the test account — named here, not hidden.

Observation, untouched and out of scope: geography "SF" was itself
minted from the 06:00 REQUEST ("Find 75 data scientists…") — a task
imperative, not a self-statement. The value is not garbled text, and
whether a request may set geography is an assertion-discipline
ruling for another lane; this lane records the provenance and
changes nothing.

## Deploy ask

One commit on `fix/t3-stated-facts-extraction`: module 142 +
both bundles + the guard suite + BUILD-STATUS claim + this record.
Deploy = agent-chat on the owner's word on the exact commit SHA
(named in the reports log on landing). The re-gauntlet for this lane
is one Telegram/web turn: restate the battery's turn-3 sentence on
the test account and read the store back — exactly one contact fact
under `northwind ledger`, and the read-back line clean.
