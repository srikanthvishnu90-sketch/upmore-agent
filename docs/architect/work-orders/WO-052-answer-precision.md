# WO-052: zero wrong answers, measured on every fill

## Why
TARGETS v2 asks for 85%+ of required questions answered and zero wrong submissions. Until now "zero wrong" was checked on
the 17 captured forms that have an answer key (195/195 live). The 1,858 required questions on samples A and B (199
real postings) had only a coverage number: a fill counted whether or not it was right. An independent review of every
fill showed that number was not honest.

## The review (2026-10-20)
- Every distinct fill on samples A and B (719: question, the employer's options, the value) went to two reviewers who read
  only the TEST persona and the fills, never the code. Each judged every row correct, wrong or not settled by the persona.
- Result: **73 wrong, 35 not settled, 611 correct** (85% of distinct fills right). The 84.6% (A) / 84.1% (B) coverage
  counted all of them as filled.
- The wrong ones, by cause (the rule that was missing):
  - "Authorized to work in the US **without** sponsorship?" answered "No" from the sponsorship fact read backwards (5).
  - An office in another city answered "Yes" from the person's yes to working on site, for a person in Chicago who will
    not relocate (Sunnyvale, Detroit, Lehi, Louisville, ... 16).
  - Another country's work rights or visa taken as the person's US ones (South Korea, Spain, the UK).
  - Standing consents stretched past what they name: an agreement to arbitrate, NDAs, terms and conditions, sharing the
    person's data, AI notetakers recording interviews, screen monitoring.
  - Wrong shape: "2 weeks" in a start-date box, the employer list typed as one employer, a title and a date, "Chicago, IL"
    for "City, State, Zip", "Test" for "First Name and Last Name", a yes or "I agree" in a box asking what/which/when or
    "if so, list...", annual pay where monthly, a range or "$00.00" format was asked.
  - Wrong fact: the street address in an essay ("what challenge did you address"), the LinkedIn URL for "how did you come
    across this vacancy", "currently employed" for "employed by TEGNA?", "Limited / No English" for an English speaker,
    "Ad on Website" for the careers site, "I intend to work remotely" from a yes to the office.
  - Not settled (asked now): drug use, court orders, discharge, regulator bars (were read as criminal history), an NDA
    beside a non-compete, outside business, a drug screen beside a background check, 60% travel, salary ranges,
    reference lists, relevant-discipline degrees.

## What changed
`question_map.ts`, `answer_options.ts`, `career_apply.ts` (shared by the extension, the cloud worker and ask-once):
general rules, each with the reason in place. No rule names an employer. `tests/architect/wo-052-precision.test.ts`
holds all 104 reviewed rows (`tests/fixtures/apply/wo-052-audit.json`): none may get the answer it got. Three "not
settled" verdicts are not upheld (years of experience is relevant years by `fact_schema`); one depends on the form's
other question naming the office (WO-052/4, both fields).

New fills, each re-reviewed by a third reviewer: 33 distinct, **0 wrong**, 1 not settled ("Certification & Attestation"
with no text: now asked).
- U.S.-person category lists from a stated U.S. citizenship.
- "Only US Citizens will be considered".
- A language the person does not speak (their list is complete).
- "Ever been a <company> employee".
- A city in a state that does not border theirs.
- A list of graduation years.
- Pay with the stated currency where the form asks for it.

## Numbers
| | Before | After |
|---|---|---|
| A: required questions filled (fill-coverage.ts) | 855 / 1,011 (84.6%), 73+ judged wrong among them | 794 / 1,011 (78.5%), none judged wrong |
| B | 712 / 847 (84.1%) | 665 / 847 (78.5%) |
| 17 live-form key (browser suite) | 195/195 correct | 175/175 correct: Lever 71/74, Ashby 65/66, Greenhouse 39/39 outside widgets |

The 17-form key was corrected in three entries (`answer-key.json`, corrections): an arbitration agreement, a "Privacy
Policy + Terms & Conditions + Whistleblowers Policy" agreement and a "$00.00 Formatting" pay box are the person's, not a
standing consent or the stated amount. Lever's floor moved 0.96 -> 0.95 for that reason alone (73/76 -> 71/74, the same
three misses).

**The 85% answer-bank target is further away than it looked: 78.5% with zero judged wrong.** Every number above is on a
complete synthetic persona; a real person's rate is NOT_RUN.

## What is next
- A sealed sample C (100 new postings, no employer from A or B, captured by CI), scored once: coverage and an
  independent review of its fills. A and B are now tuned on.
- The person-specific remainder (essays, experience screens, preferences named on the form) is answered once in the
  panel before a session (WO-042 fix 5), which is where a real person reaches 85%: measured live, not here.
