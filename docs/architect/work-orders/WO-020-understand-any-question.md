# WO-020: Understand any application question, ask the rest once and in one text

Status: part 1 built by the architect (owner, 2026-10-19: "ultra depth application filler"): the fact schema, `_shared/question_map.ts` and its measure (`evals/apply/question-map.ts`, report `docs/apply/question-map.md`, independent blind labels on 240 random questions: precision 97.5%, fill precision 99.5%, recall 97.9%, in-sample; sample A 66/99 and B 80/100 postings with nothing left to ask, median 0). Part 2, wiring the map into planBatch, option choice and the approval card, is next · Depends on: WO-009a (planner), WO-009b-6 data · Size: M · Owner: architect

## Why (measured, not guessed)
`evals/apply/questions-ci.json`: the required questions of 99 real postings (40 Greenhouse, 30 Lever, 29 Ashby),
captured in CI on 2026-10-19; report `docs/apply/ask-once.md` (`evals/apply/ask-once.ts`).
- A posting asks a median of 9 required questions. Today's planner (`classifyField`, a keyword list of 17 facts) covers
  54% of them (56% before the 2026-10-19 corrections; see `docs/apply/ask-once-samples.md`); a median of 3 are left to ask per posting, and only 5 of 99 postings have nothing left to ask.
- Saving an answer by its exact wording barely helps: 432 different unanswered wordings, 420 of them on one posting
  only. People ask the same thing in different words ("If hired, can you show proof of authorization to work in the
  United States?" is work authorization; "Full Legal Name" is a name). Reuse has to be by meaning.
- Rough sort of the 455 unanswered required questions (keyword buckets, approximate): ~45% are facts about the person a
  better reader would map (authorization variants, 18+, referred by, current employer, school, GPA, address); ~25% are
  yes/no screeners about the job (a certification, availability, worked here before); ~8% are written answers (24 of
  99 postings ask for one); ~6% are consent or acknowledgement boxes; ~15% other (test scores, export control).
- If the person facts were understood: median 2 left, 21 of 99 postings with nothing left, 61 of 99 with at most 2.
  With consent shown as one tap inside the approval: 27 of 99 with nothing left, 68 of 99 with at most 2.

- A second, independent sample (`evals/apply/questions-ci-b.json`: 100 postings from random boards, no employer shared
  with the first; comparison in `docs/apply/ask-once-samples.md`) asks fewer questions: 65% covered today, median 2
  left, 31 of 100 with nothing left. The first sample is the biggest employers, who ask more compliance and identity
  questions; a person's postings sit between the two (about 58% covered, about 13% with nothing left, estimated).
  Understanding person facts helps on both (estimated: B 31 → about 40 of 100 with nothing left).

So the product target is not "never ask": it is about two short questions per application, asked together in the
approval text, with each answer reused by meaning from then on.

## What
1. `supabase/functions/_shared/fact_schema.json` (built; next to the map so a deployed function carries it): about 40 facts a person states once (identity, contact, location
   and relocation, work authorization and sponsorship, age 18+, education and GPA, current employer and title,
   start date and notice, salary, clearance, links, referral, how heard, EEO with decline-to-answer), each with type
   and the value forms ATS options take.
2. `supabase/functions/_shared/question_map.ts` (new): question (label, type, options) → `{ fact, option?, kind:
   fact|screen|essay|consent|unknown, confidence }`. The keyword list first; the model (OpenAI gpt-5-mini) only for what
   it leaves; a mapping is cached by the question's normalized wording (public text, no personal data). The model
   chooses which fact a question asks for and which listed option matches the person's confirmed value; it never
   writes a value. Below the confidence bar the question is asked, not guessed.
3. Planner (`career_apply.ts` planBatch): uses the map; a mapped answer cites its fact id; screeners and consent are
   gathered per application into the approval text ("Stripe asks 2 things: ... Reply with the answers, or YES to send
   with these"), essays are drafted only from confirmed facts and shown in full in the same approval.
4. An answer to a screener that is about the person, not the job, is offered to be saved as a fact ("save for next
   time?"); job-specific ones are not saved.

## Acceptance (on the real questions in both samples, `evals/apply/questions-ci.json` and `questions-ci-b.json`)
- A hand-labeled sample of 150 questions, 75 from each sample (`evals/apply/question-labels.json`, the architect labels it) scores the
  mapper: precision of fact mappings ≥ 98% (a wrong mapping sends a wrong answer; better to ask), recall ≥ 80%.
- `ask-once.ts` with the mapper: sample A median questions left per posting ≤ 2 and at least 20 of 99 postings with
  nothing left; sample B median ≤ 1 and at least 38 of 100 with nothing left. A gain on one sample only does not pass.
- Cost per 100 postings printed; cached mappings make a second run cost nothing.
- Tests first, failing output pasted; gate green.
