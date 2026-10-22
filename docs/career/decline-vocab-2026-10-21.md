# DECLINE-VOCAB — 149's EEO-decline acceptance aligned to one meaning class (2026-10-21)

Owner's WORD 2026-10-21 14:37 CDT, from the DROPDOWN-MEASURE lane's root
cause (@ cc2932c9). Branch `muse/2026-10-21-decline-vocab`, off cea914fe.

## The defect, measured

The dropdown-measure lane recorded 50 dropdown interactions on 8 real
Greenhouse forms (production assembly, doorstep only). Of the 24 verified
EEO-decline fills, the board rendered the decline answer correctly every
time — wrong value 0, vanished 0 — but module 149's observation gate
accepted only 5. The boards' renderings of the one §6.1 default
("Decline to self-identify"):

- "I don't wish to answer" x19
- "Decline To Self Identify" x4
- "I prefer not to say" x1

149's gate clause was an inline regex
(`/decline|prefer not|not (to )?answer|not (to )?disclose/` over a
punctuation-keeping norm) with no "wish" forms, so "I don't wish to
answer" read as drift: `ANSWER_OBSERVATION_MISMATCH` blocked 6 of 8
production drives with every fill correct.

Reproduced exactly before the fix: the recorded corpus through the old
clause = accept 5 / reject 19, and the fail-first suite
(`tests/career-decline-vocab.test.cjs`) failed its corpus test on
precisely the 19 wish records (pre-fix suite: 5 pass / 7 fail; the 4
pure negative controls and the FR-395 control already passed, as guards
must on both sides).

## The fix — one home, meaning-class semantics

The decline class now lives as DATA in module 149, in the WO-020
question_map shape (ordered named pattern rules over normalized text;
the first match names why):

- `packages/domain/149-career-portal-apply.js` — `EEO_DECLINE_MEANING`
  (six rules: decline_word, prefer_not, wish_not, not_answer,
  not_disclose, no_answer; patterns are serializable regex sources),
  `normMeaningText` (the browser helper's normOpt verbatim),
  `eeoDeclineMatch(text)` -> rule name | null, `isEeoDeclineText(text)`.
  All three are exported from the module.
- The observation gate's decline disjunct (149, the `same` computation)
  now reads: for an EEO fill (`eeo_default_decline` or
  `user_eeo_choice`), the intended value and the observed value are the
  same answer iff BOTH are decline-class. Everything else in the
  comparison is byte-for-byte what it was.

Scoping, deliberately: the class is applied at the gate to EEO fills
only — the surface where "one semantic choice, a dozen wordings" holds
(D8 / BUG-067 doctrine). Keying on the intended VALUE's class (not only
the default's source tag) also covers the user's own EEO choice when
they picked a decline wording themselves; a non-decline choice gains
nothing, because its value is not decline-class. The gate's job is
intact, proven by negative controls through `runApply` itself: a
non-decline choice rendered as a different value blocks; the decline
default rendered as a substantive answer blocks; a decline intent on a
field whose options carry no decline rendering blocks; a non-EEO
confirmed answer is unchanged in both directions.

The class's union is semantically identical to the on-page matcher's
vocabulary (see the seam below) — pinned by a snapshot alignment test
over 24 probe strings. This is NOT a new parallel list: it is the same
vocabulary, given one exported home and a name per rule.

## Results

- Corpus simulation (149's own predicate, recorded corpus): BEFORE
  accept 5 / reject 19 -> AFTER accept 24 / reject 0. Rule tally on the
  observed renderings: wish_not 19, decline_word 4, prefer_not 1.
- New suite `tests/career-decline-vocab.test.cjs`: 12/12 (corpus,
  5 negative/control shapes, class data + membership, helper alignment).
- 149 suites (portal-apply, answer-map, caps, collision,
  payload-binding, submit-integrity, submit-path, lever-radio):
  65 pass / 11 fail — the failing NAME set is identical to pristine
  cea914fe (D11 x5 BUG-207, D12 BUG-208, D13 BUG-209, D14 x2 BUG-237,
  coverage x2 = the F-007 pair). Answer-map alone: 6 pass / 2 fail on
  both trees — the F-007 pair stays exactly 2.
- Adjacent suites (owned-worker, board-provider, lane-a-depth,
  loop-acceptance): green. Extension-sync fails identically on base
  (`jsdom` not installed — environment, pre-existing).
- Router bundle regenerated (`python3 scripts/build-router-core.py`;
  diff = exactly the 149 change, 50+/2- in router_core.js);
  tests/router-bundle.test.cjs 3/3. Agent100 dry: 103/103.
- career-portal-browser: 14/14 SKIPPED in this environment (Playwright
  not resolvable) — same posture as base; NOT_RUN, not a pass.

The recorded corpus contained no non-decline observed pairs (every
other measured interaction was not_observed/vanished — the lane's
stated limit), so non-decline invariance rests on the negative controls
through runApply + the identical suite sets above, not on the corpus.

## The unification seam (for Claude's mapping fix)

Claude owns the question-side mapping fix (WO-020: 11 Greenhouse widget
answers pass the contract unmapped and are matched by meaning on the
page; the same answer on a Lever select is asked). This lane aligned to
those semantics; three seams remain, each with one owner:

1. **Fold into the shared meaning map.** When the WO-020 machinery
   (`supabase/functions/_shared/question_map.ts` + `fact_schema.json`)
   lands on this line, `EEO_DECLINE_MEANING`'s six named rules move
   verbatim into that home as the decline VALUE class (the map today
   classifies questions; answer-value classes are the sibling data, in
   the same shape). 149's call sites keep calling `isEeoDeclineText`;
   only its definition is re-pointed. No rule text changes in the move.
2. **The browser helper (worker lane).**
   `scripts/career/portal-browser-helper.cjs` still carries the same
   class as inline literals, twice: `isDeclineText` (~line 396, over
   normOpt) and `isDecline` inside the page.evaluate matcher (~line
   603, over its own in-page norm — both "don t wish" and "dont wish"
   alternatives exist precisely so both norms work). Consumption
   recipe: the line-396 copy becomes
   `require("../../packages/domain/149-career-portal-apply.js").isEeoDeclineText`;
   the in-page copy cannot require, so the evaluate args gain
   `EEO_DECLINE_MEANING`'s pattern sources and compile them in-page.
   Until that lands, the alignment test in
   `tests/career-decline-vocab.test.cjs` is the tripwire: it fails if
   either vocabulary moves without the other. (This lane did not edit
   the helper — it is the worker lane's file; the rendered-values
   protocol change (FR-395 hatch) already rides that lane per the
   owner's same ruling.)
3. **Lever parity at the acceptance layer.** The class is
   board-agnostic — it judges renderings, not ATS families — so once
   Lever drives pass through 149's gate, the same decline renderings
   are accepted there. The question-side Lever ask is Claude's fix,
   untouched here.

## Files

- `packages/domain/149-career-portal-apply.js` (class data + predicate +
  gate disjunct + exports)
- `supabase/functions/_shared/router_core.js` (regenerated bundle)
- `tests/career-decline-vocab.test.cjs` (new)
- `docs/career/decline-vocab-2026-10-21.md` (this note)
- BUILD-STATUS claim line
