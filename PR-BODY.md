# Router fix 2 — the record keeps a stated company across turns

Branch: `muse/2026-10-22-router-fix2-company-record` off trunk `373453f3`.
Scope: repo + tests only. No deploy, no migration, no merge, no flag/submit/approval-path changes.

## Root-cause note (written before the fix)

The stated-facts record (`ctx.statedFacts`, module 142's `captureStatedFacts` in
`packages/domain/142-career-router.js`) is the only writer of the persistent record the
recall handlers read. Its company frames cover only a narrow dialect:

1. **Target company** — only "my target (firm|company|…) is X", "I'm targeting X",
   the goal-verb frame ("I want to network/break/get into / work at X") and
   "my #1/top target is X". Natural assertions of the same fact — "my dream company
   is X", "the company I'm focused on is X", "the firm I care about most is X",
   "X is the company I most want to work for" — match no frame and are dropped.
2. **Work-at company** — the `experience` frames are past-tense only
   ("I interned/worked at X", anchored to a summer/year or a "doing" clause).
   Present-tense assertions — "I work at X", "I intern at X", "I work for X",
   "my current employer is X" — record nothing, so the employer is never on record.
3. **Interviewed-at company** — the company reaches the record only as the KEY of an
   `interview_day` fact, and that frame fires only for the exact shape
   "my interview at X is on \<Day\>". "I have an interview at X next week",
   "I'm interviewing with X", "I landed an interview at X", and even
   "I have an interview at X on Friday" write nothing to the stated-facts record
   (the tracker logs its own row, but the record the recall handlers read holds
   nothing), so every later recall about that company answers "nothing on record".

Measured on base `373453f3` with the host harness (synthetic users/companies):
all three classes above → `statedFacts.facts` empty after the statement turn, and the
later recall turns answer the honest-absence/fallback text instead of the company.

## The fix (all inside the record's own capture/recall semantics)

In `captureStatedFacts` — every new frame behind the same assertion gate as its
neighbours (unquoted user words only; not a question, not a conditional, not a
request — the WO-095/BUG-169 discipline; a company the agent mentioned, or one
named inside a request or a question, is still never written):

- **target_firm**: add "my dream company is X", "the company/firm I'm focused on
  is X", "the company/firm I care about most is X", and the inverted
  "X is the company I (most) want to work for" / "X is my dream company".
- **experience** (the record's work-at kind): add present-tense parallels of the
  existing past-tense frames — "I work at X", "I intern at X", "I work for X",
  "my (current) employer is X" — proper-name span, same cleaning as the target frames.
- **interview company**: new multi-value kind `interview_company` (value = the
  company as stated), captured in the keyed-facts block under `asserted()` from
  "interview at/with X", "interviewing at/with X", "my interview is at/with X",
  "(landed|got|have|scheduled) an interview at/with X". It rides the host's
  existing keyed carriage (the account validator's `facts[]` list is untouched —
  no migration), folds back into the working set on seed, and merges by
  kind+value like every multi-value kind. Plus the day frame learns the same
  verb shapes: "interview at X on \<Day\>" now also records `interview_day`
  keyed by X, exactly like "my interview at X is on \<Day\>" already did.
- `factLine` learns the kind: "you have an interview at X".

In `handleConversationRecall` — two narrow branches after the existing ones,
both resolving only against the record:

- **Interview-company ask** ("which/what company do I have an interview at?",
  "which company is my interview with?") answers from `interview_company`
  facts and `interview_day` keys, or states the honest absence.
- **Stated-company ask** ("which company did I mention?", "what companies have
  I told you about?", "what company was that again?") lists the company-bearing
  facts on the record (target firm, interview company, experience, and facts
  keyed by a company) in the record's own voice, or states that no company is
  on record. Shapes the existing branches own (target-firm read-back,
  "what company did I say I'm targeting") still answer first.

## Fail-first evidence

`tests/career-router-fix2-company-record.test.cjs` — my own synthetic cases
(users and companies invented for this file: Vantek Systems, Corvid Health,
Alderpoint Labs, Juniper Row). No held-out eval cases used.

- On base `373453f3`: **20 tests — 8 pass / 12 fail.** All 12 positive cases fail
  (the three dropped classes + their recalls); all 6 negative controls and both
  no-regression anchors pass, pinning the behavior that must not change.
- On this branch: **20 tests — 20 pass / 0 fail.**
- Neighboring record/profile/router suites, base vs branch — identical counts,
  zero regressions (216 tests): assertion-gate 37 · complexity-battery 26 ·
  conversation-depth 13 · depth-memory 13 · goal-frame 8 · lane-a-depth 35 ·
  lf08-stated-fact-parity 12 · lf09-attribution 8 · next-step-routing 12 ·
  t1-channel-completeness 13 · t3-stated-facts-extraction 8 · v240-live-gaps 11 ·
  v241-live-gaps 6 · v242-live-gaps 2 · draft-subject 4 · probe-d-draft-binding 8
  (pass counts; fail 0 on both trees for every suite).

## Files changed

- `packages/domain/142-career-router.js` — capture frames + factLine + two recall branches.
- `supabase/functions/_shared/router_core.career.js` + `supabase/functions/_shared/router_core.js` —
  rebuilt bundles (`scripts/build-router-core.py --career-only` and full; both `--check` verified —
  the full bundle verifies on base, so both are in this tree's contract).
- `tests/career-router-fix2-company-record.test.cjs` — new fail-first suite.
- `PR-BODY.md` — this file.
