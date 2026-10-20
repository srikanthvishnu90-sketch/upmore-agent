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

## The owner's decision (2026-10-20): yes
> "WO-076: YES. Queue at 4× the daily limit as candidates, sends capped at 25. Settled — build it that way."

And, for this order: the person never does more steps than a competitor's flow, and Trainee builds in-house rather than
paying for outside services. Ready-first adds no tap and no screen (the same Add Trainee's picks, Prepare, Start and
cards); Greenhouse's public board API is free.

- **Before:** the want queue (`queueWants`) stopped at the daily limit, and the send queue (`career_apply_enqueue`,
  `daily_cap`) enforced the same limit again.
- **Now:** the want queue holds up to 4× the daily limit as candidates (100 at the default, 200 at most). Sends stay at
  the daily limit, enforced where they were (`career_apply_enqueue`, `admitApplication`). No migration: the SQL's
  `career_apply_want_put_for` bounds one call (100 postings), not the day; the store saves 100 per call.
- Nothing more is sent. Trainee only gets to choose which 25 go first.

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
4. **Chat.** `queue_applications` reports how many candidates were queued and that sends stay at the daily limit.
   - How many are ready to approve is known only once the extension plans them, so chat never says it
     (`ready_known: false`); Prepare's panel line says it ("Today's 25: 18 ready to approve as they are, 7 need an answer
     first").
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

### Measured (VERIFIED-S, 2026-10-20, `deno run --allow-read evals/apply/ready-first.ts`)
227 US postings whose location starts "City, ST" (99 Greenhouse, 97 Lever, 31 Ashby), the complete TEST persona placed in
each posting's own city; 70 are ready (25 on Greenhouse). Queue order is the samples' order. Before WO-076 the day was the
first 25 queued; now it is the first 25 of the 100 candidates in ready-first order: Greenhouse planned from the API before
any tab, then Prepare reads up to 20 postings not known yet when the known-ready do not fill the day.

| Of the first 25 sends, ready | queue order (before) | ready first, before Prepare | ready first, after Prepare |
|---|---|---|---|
| candidates 1–100 | 6 (24%) | 14 (56%) | 21 (84%) |
| candidates 101–200 | 7 (28%) | 10 (40%) | 16 (64%) |
| every window of 100 (128 windows), mean | 8.8 (35%) | 12.7 (51%) | 19.7 (79%) |

The person's taps per 25 sends (Add Trainee's picks, Prepare, Start; Save when the panel asks; one approval per send;
one answer per question, each panel question once, the rest on their cards): **75.9 before, 34.3 after** (window mean;
answers 46.9 → 5.3). The buttons are the same: no tap or screen is added.

Caveats: the complete TEST persona is a best case; a real person starts with less. The fit band is not carried from search
into the want rows yet, so the candidates are one band and the order the brain gave breaks ties (the fit proxy). The
readiness the API predicts is checked against the page's own card on TEST Greenhouse pages in the browser test; none of the
four captured real Greenhouse forms is ready, so that agreement on real pages is measured live, not here.

## Out of scope
- Drafting answers (WO-064 is shelved).
- Changing the send limit.
- Lever and Ashby pre-planning without a page read: a later order, if the battery says it matters.
