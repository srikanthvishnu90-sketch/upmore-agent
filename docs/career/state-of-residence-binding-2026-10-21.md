# State-of-residence binding — root cause, fix, and the 171 integration note

Lane: `muse/2026-10-21-state-binding` (off cea914fe), 2026-10-21.
Finding source: the form-inventory lane (module 171), measured live the
same day. Class: F-007 (a form stopping although a confirmed fact
covers the field). BUG/FR allocation: requested from the Crew A
registry — none self-allocated.

## The measured defect

On Affirm's live Greenhouse form, the question

> "Which U.S. State or Canadian Province do you reside in?"

classified (module 150 `classifyFields` → `classifyKind`) to kind
`unknown` with no key, so the drive stopped on it as an ask — although
module 149's `deriveAnswers` produces `profileFields.state_of_residence`
("Illinois", traced to the confirmed hometown fact) from facts already
on file. Reproduced mechanically on the base: the label, in both text
and select shapes, returned `unknown / NO-KEY` while the neighboring
labels ("In which state do you currently reside?", "State of
residence", "Which state do you live in?") all bound correctly.

## Root cause

The binding lived in ONE phrase-list regex (150, `classifyKind`,
ex-line 304):

```
state of residence | in which (u.s. )?state.*(reside|live|located) |
which state do you.*(reside|live) | what state.*(reside|live) |
province of residence
```

Every question-shaped alternative assumes adjacency the real label
does not have:

1. **"U.S." interposed** — the label is "Which **U.S.** State …", so
   the literal prefix `which state` never occurs.
2. **The "or Canadian Province" clause interposed** — between "State"
   and the verb phrase sits "or Canadian Province do you", so even a
   hypothetical `which .* state do you` shape fails; the actual
   alternatives anchor `state do you` adjacently.
3. **The noun alternatives don't apply** — the label uses the verb
   form ("… do you reside in?"), not "state/province of residence".

It is an exact-match table gap, not a tokenization or
question-vs-label-shape problem: the classifier received the full,
correct label text (the inventory lane read it off the real form), and
neighboring phrasings of the same question bound fine. The class of
failure — a hand-enumerated phrase list silently missing the phrasing
a real board uses — is the same class as BUG-238's answer-map lag.

## The fix (packages/domain/150-career-portal-browser.js)

The phrase list is replaced by `isStateOfResidenceLabel(eff, f)` — a
structural predicate at the same cascade position, same returned key
(`{ kind: "standard", profile_key: "state_of_residence" }`):

- **subject**: the word `state` or `province`;
- **frame** (either):
  - noun frame — `(state|province) of (current )?residence|residency`,
    or `residence (state|province)`;
  - verb frame — a residence verb (`reside|live|located|dwell`, any
    inflection) AND a second person (`you|your`): the question asks
    where the APPLICANT lives;
- **disqualifiers, checked first (fail-closed)**:
  - birth/origin — `born`, `birth`, `grew up`, `grow up`, `raised`
    (a DIFFERENT fact: birthplace is not residence);
  - entity — `incorporat…`, `formation`, `organized under`,
    `registered agent` (state of incorporation is the employer's
    fact, never the applicant's);
  - job-side subjects inside the verb frame — `office`, `position`,
    `job`, `role`, `worksite`, `business`, `company`, `employer`
    (where your office is located is not where you reside);
- **observed-options discipline**: when the field carries an observed
  option list (the helper's native-select shape) whose substantive
  options are EXCLUSIVELY Canadian provinces/territories
  (`optionUniverseIsProvinceOnly`), the binding does not fire — a
  US-state value cannot fit that universe, so the field stays an
  honest ask instead of a forced fill. Placeholder options
  ("Select a state or province") are ignored when judging
  exclusivity; no token is both a Canadian province/territory and a
  US state, so province-membership alone decides. A widget whose
  options are not observed at classify time (react-select) is
  unaffected — the drive's own option match (`matchOption`) and
  readback verification remain its guard, unchanged.

Deliberate tightening vs the old list, stated plainly: third-person
shapes the old regex happened to catch ("In which state does the
candidate reside?") no longer bind — the verb frame requires the
question to address the applicant. On an applicant-facing form that
is the correct fail-closed direction: an unmatched field is an ask,
never a guess.

Nothing else changed: 149 (derivation), the helper (option match),
and the readback layer are untouched.

## Tests (tests/career-portal-state-binding.test.cjs — 9/9)

Fail-first on the base: 5 red / 4 green (every bind-dependent cell
red; every fail-closed cell already green). After the fix: 9/9.

- **Binding matrix** — the exact Affirm label (text + select +
  required-marker variants) and 12 close real-world variants assert
  `kind: "standard"` + the answer key used, `profile_key:
  state_of_residence`; the select binding carries its observed
  options through.
- **Negative controls** — state of incorporation (text + with US
  options), state of birth, born/grow-up shapes, work-location and
  office-location shapes, a bare "State" select: none binds
  `state_of_residence`; "State your full name" binds `name`, proving
  the verb "state" is not a subject.
- **Option universe** — province-only select: no bind; the same label
  over a mixed universe: binds; the Affirm label over a US-only
  universe: binds.
- **Regression sweep** — portal family batch 1 (answer-map, browser,
  submit-path, apply, collision): 42 pass / 2 fail / 14 skipped,
  where the 2 fails are the answer-map coverage pair, verified
  identical on the pristine base (they read the machine-local real
  fact bank, whose F-007 application_answer/application_text kinds
  have no consumer — pre-existing, unrelated to this change).
  Batch 2 (caps, lever-radio, payload-binding, submit-integrity):
  23 pass / 9 fail / 2 skipped — the 9 fails are the D11–D14
  real-Chromium end-to-end tests (BUG-207/208/209/237), and the
  failing test NAMES are identical with the fix stashed on the
  pristine base (environment-class baseline on this host). Zero
  regression delta from this change in either batch.

## Integration used for the 171 join (named, per the lane brief)

171 lives on branch `muse/2026-10-21-form-inventory` and is not
vendored on this base, so the join is proven at shapes level in this
tree, using exactly the two seams 171 itself uses:

- inventory records come from **module 150's `classifyFields`** — the
  RAW-snapshot path 171's `inventoryFromSnapshot` classifies through;
- the coverage leg reproduces **171's `fieldCoverage` standard-field
  rule verbatim in shape**: covered iff **module 149's own
  `profileValue`** (the function 171 resolves as `Portal149.profileValue`)
  returns a value for the bound key; a bound field with no fact stops
  `no_confirmed_fact`; an unbound field stops
  `unknown_field_category`.

Results: Affirm form + state fact ⇒ field covered, form covered;
fact removed ⇒ the same field stops `no_confirmed_fact`; province-
only form + state fact ⇒ NOT covered (`unknown_field_category`) —
no forced bind. End-to-end over the answer-map suite's stub-board
shape: the Affirm field is FILLED with the derived state and raises
no ask; the province-only field is asked and never filled; zero
submits in both runs.

## What this does NOT do

- No live drive was re-run under this lane (the live Affirm form is
  re-observed by the inventory lane / tonight's drives; the fix is
  proven at the classifier + join + stub-board layers).
- Module 171 needs no change to consume this: its verdicts read
  classifyFields output, so the Affirm field flips from a stop to a
  covered field on its next scan of that form.
