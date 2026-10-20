# WO-076: ready first: apply where Trainee can finish the form, and ask the person only for the rest

## Why: the measurements (VERIFIED-S, 2026-10-20, samples A–H, product `planForm` after WO-075)
- **Drafting the open questions with the model failed.** WO-064 ran three times; between 18% and 22% of the kept drafts
  were wrong, against a 0.5% target. It is shelved.
- **The open questions are a long tail.** 378 open questions have 375 distinct wordings, so no shared map helps.
- **Location makes the measure honest.** The persona was placed in each posting's own city, for the 228 US postings
  whose location reads "City, ST". This is what a real person's queue looks like: their search is filtered to their
  places.
  - **71 of 228 cards (31%) need nothing from the person.**
  - On the rest, the blockers are a long tail: unrecognised questions 108, essays 70, screens 54, office terms 46,
    facts that do not fit 21, then about 15 small classes.
  - No class fixed alone moves readiness by more than about 5 points.

So for most forms the person's typing cannot be removed without inventing answers. What Trainee can do is choose. With
the daily send limit at 25 (D-011) and a shelf of tens of thousands of postings, the ready third alone can fill the day.
That is roughly 80 well-fitting candidates for 25 sends with no typing, and the other 55 wait for answers, asked once.

### Caveats on that 31%
- **It is a best case.** It assumes a person who has told Trainee everything the rules can use (the complete TEST
  persona). A real person starts with less. The battery and the first real users decide the true share.
- **Whether a form with fewer questions changes the odds of an interview is unknown.** That is why fit always ranks
  first, and form cost only orders postings within the same fit.

## The owner's decision this order needs
- **Today:** the want queue (`queueWants`) stops at the daily limit, and the send queue (`career_apply_enqueue`,
  `daily_cap`) enforces the same limit again.
- **Proposed:** the want queue holds up to 4× the daily limit (100 at the default, 200 at most). Sends stay at the daily
  limit, enforced where they are enforced now.
- Nothing more is sent. Trainee only gets to choose which 25 go first.
- **Without the owner's yes,** the order ships with the want queue as it is. Ready-first then only orders the day's
  queue: the ready cards are shown first. That is half the effect.

## What to build
1. **The extension plans before it opens a tab.**
   - For each wanted posting on Greenhouse, it reads the board's public API
     (`boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}?questions=true`).
   - It then runs `planForm` with the person's facts.
   - A Lever or Ashby posting is "not known yet" until Prepare reads its page. Prepare reads it today.
   - Never on LinkedIn or Indeed (unchanged).
2. **Order.** Within the same fit band, the order is:
   1. ready;
   2. one open question;
   3. more;
   4. not known.
   - Fit always comes first: a weaker fit is never put above a stronger one to save typing.
3. **The day.** Prepare fills the day's sends with ready cards first, and the panel asks the remaining postings' questions
   once (WO-054). The card the person approves is unchanged (D-007): the exact payload, their yes.
4. **Chat.** `queue_applications` reports how many are ready to approve and how many wait for answers.
   - With the owner's yes, it queues up to 4× the limit.
   - The brain never says an application was sent.

## Acceptance tests (written first, in `tests/architect/pending/`)
1. Greenhouse pre-planning: the API shape, the resume pair (WO-075), and the person's facts. A ready form plans ready, and
   one open question plans as one. No network outside the board's public API.
2. Order: tier inside fit band. A weaker-fit ready card never ranks above a stronger-fit card with one question.
3. Without the owner's yes, the want queue cap is unchanged and the order still applies. With it, the cap is 4× and sends
   are unchanged: the enqueue still raises `daily_cap` at the limit.
4. The browser test: with 6 queued postings (3 ready, 3 not), Prepare's first cards are the 3 ready ones and the panel
   asks only the other 3 postings' questions.

## Measure
- The battery, with a T-task: "apply me to 25 data analyst jobs in Chicago".
  - Count how many cards are ready with no question.
  - Count the questions the panel asks.
- Samples A–H, with the local persona: the ready share of the first 25 cards chosen from each 100.

## Out of scope
- Drafting answers (WO-064 is shelved).
- Changing the send limit.
- Lever and Ashby pre-planning without a page read: a later order, if the battery says it matters.
