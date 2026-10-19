# Ask once on two samples: what holds and what does not

Written by the architect from CI run 39230110480 (`.github/workflows/question-capture.yml`), 2026-10-19. The two
generated reports are `ask-once.md` (sample A) and `ask-once-b.md` (sample B); this page compares them.

## Why two samples
The first capture took the biggest boards and each one's first posting. A re-run (CI run 39228148377) measured 93 of
the same 100 postings, all 93 with identical required questions, and gave the same 56%. That showed the capture
repeats, not that the number holds on other employers. Sample B (`pick-form-sources.cjs --seed 2 --exclude`) is 100
postings from boards in seeded random order, a seeded random posting on each, and no employer from A.

## The numbers

| | A: the 100 biggest boards | B: 100 random boards, no employer from A |
|---|---|---|
| Required questions per posting | 10.2 | 8.5 |
| Covered by today's standard facts | 547/1011 (54%) | 551/847 (65%) |
| Postings with nothing left to ask | 5/99 | 31/100 |
| Questions left per posting (median) | 3 | 2 |
| Postings with at most 2 left | 41/99 | 54/100 |
| Unanswered required questions per posting | 4.6 | 2.9 |

Where A's extra unanswered questions come from (per posting, rough keyword buckets, A vs B): screening on experience,
languages, relocation or office days 1.14 vs 0.75; address and identity 0.64 vs 0.35; consent and acknowledgements
0.44 vs 0.18; clearance, citizenship and export control 0.38 vs 0.10; worked here before or related to an employee
0.28 vs 0.13; current employer 0.21 vs 0.07; other 1.93 vs 1.43. Big employers (defense, regulated, multinational) ask
more compliance and identity questions; the gap is not one question type.

## What a person sees (an estimate, not a measurement)
A person sees postings, not boards, and big boards hold most postings. Of the 106,746 postings on the live Greenhouse,
Lever and Ashby boards in the directory, 46.5% are at A's employers. Weighting B's postings by their board's size and
combining with A by that share: about 58% of required questions covered and about 13% of postings with nothing left to
ask. Rough: each employer is one posting, B's weighted share rests on a few mid-sized boards, and B drew no board over
201 postings.

## What holds on both
- Today's planner leaves questions on most postings: 69% (B) to 95% (A) of postings have at least one.
- Understanding person facts by meaning (WO-020) helps on both. Same rough estimate on each (keyword buckets for the
  person facts, consent shown as one tap): A median 3 → 1, nothing left 5 → 24 of 99; B median 2 → 1, nothing left
  31 → 41 of 100. Most of what remains is job screeners and written answers, which the person has to answer.
- So "about one or two short questions per application, asked together in the approval" is the target on both samples.

## Correction, 2026-10-19 (classifier precision and Greenhouse paste boxes)
The planner's keyword list answered questions it should have asked: "Do you own a Smartphone" (radio) took the phone
number, "list the names and emails of two references" took the person's own email, consent and newsletter boxes took
an address, "Resume/CV" paste boxes would have had the resume file's hash typed in, and "authorized to work without
sponsorship?" (which needs two facts at once) took one. A contact fact now answers only a free-text box about the
person, the resume only an upload, a negated or combined sponsorship question is asked
(`tests/architect/wo-009-classify-precision.test.ts`, real labels).
Counting was also corrected: Greenhouse asks "Resume/CV" as one question with an upload and a paste box, both marked
required (63 of 80 Greenhouse postings); the upload answers it, so the paste box is no longer counted as a second
question (`fileAlternative` in `career_apply.ts`, used by the planner and this measure alike).
Net: required questions 1042 -> 1011 (A) and 883 -> 847 (B); covered 584 -> 547 (A, 56% -> 54%) and 596 -> 551 (B,
67% -> 65%); postings with nothing left unchanged (5/99, 31/100). The tables above carry the corrected numbers.
