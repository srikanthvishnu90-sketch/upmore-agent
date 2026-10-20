# WO-054: answer once, before the session

## Why
TARGETS v2 asks for 85%+ of required questions answered and every unknown asked once. With a complete synthetic persona
the planner fills 76.7% (A) / 78.2% (B) of required questions (`docs/apply/fill-coverage.md`). What is left is the
person's own: experience screens, offices in other cities, work rights for jobs abroad, employer-specific questions. The
extension asked these one card at a time inside the session, so the same question across many postings interrupted the
person again and again. WO-042 §5 fix 5: read the queue's postings first, gather the distinct questions only the person
can answer, ask each once in the panel, and let each answer fill every posting that asks it, at its exact wording.

## What changed
- `extension/src/apply_core.ts`:
  - `answerOnceQuestions({ postings, answers, answered })` (pure). It groups each posting's open questions by the key
    the store and the planner use: `answerKey` through `questionsForTrainee`/`questionsToStore`, with `haveFact`, so a
    stated fact that did not fit a form becomes that posting's own key.
    - `fact:` and `label:` keys merge across postings.
    - `job:` keys stay one posting's, shown with its company.
    - Each entry shows the wording most postings use and that posting's own options. `similar` counts the other
      wordings.
    - Entries are ordered by how many postings ask them (stable, so queue order breaks ties).
    - `selected` is always `null`.
    - Never listed, and returned as `left` with the reason: identity numbers, EEO and self-identification, written
      answers (drafted on the card, WO-049), files, and agreements. Agreements are an addition the order did not list:
      a consent or attestation, an "I understand / agree ..." statement, or a question whose only options accept it
      (formAnswersToKeep's existing rule: an agreement is given to one employer).
  - `answerOnceRows({ questions, picks })` (pure). It turns the person's picks into the rows the store already takes,
    per posting: `career_apply_questions_put_own` (so the row names that posting), then
    `career_apply_questions_answer_from_form_own` under the same key.
    - An empty pick is a skip.
    - These picks are refused: an answer that is not one of the shown options, an identity-shaped number, `MASKED`,
      and (beyond one posting) an answer naming an employer or a how-heard answer naming no channel. These are the
      same rules formAnswersToKeep uses.
  - `beforeSession(fields, factIds)`: the card's fields Trainee filled from a panel answer.
  - `cardLines({ ..., before })`: those lines read "(your answer, answered before the session)". The payload, its hash
    and the approval are unchanged.
- `extension/content.js`:
  - `survey()` is read only. It reads the form (waiting for a late one through the page's own mutations, never sleeps,
    because hidden tabs run timers about once a second), the posting's location (`D.fnPostingLocation()`) and
    `planForm` (strict), and reports the open questions once.
  - It never fills, clicks, sends a card or stores a question.
  - `refresh()` passes the before-session marks to every card.
- `extension/background.js`:
  - `prepareQueue()` reads the next `PREPARE_MAX = 20` waiting postings in tabs opened with `active: false`, four at a
    time, with 45 s per posting. Each tab is opened blank first so its id is known before its content script asks, and
    is closed after.
    - Why 20: each is a whole employer page held in a hidden tab, and an answer given now should be about postings
      this session reaches.
    - Workday postings are left out, and the panel says so (D-013: the person signs in first).
  - `saveAnswerOnce()` stores the answers with the RPCs above. It then remembers their keys in session storage, so
    `context` returns the stored row ids (`before`) for the card's mark.
  - New messages, each limited to the panel: `answer-once-prepare`, `answer-once-save` and `answer-once-skip`.
    `survey` is limited to a tab, and only one Prepare opened.
- `extension/panel.*`: Prepare, progress, the list with "Asked by N postings: ..." or "Only for <company>", "(and N
  similar)", the employer's own options in a select starting on "Choose your answer", or a text box. Skip, and Save
  (only a trusted click). Also says what was left for the cards and why.
- Planner unchanged: no change to `career_apply.ts` or `question_map.ts`. `docs/apply/fill-coverage.md` regenerates
  identical.
- No migration and no new RPC.
- `evals/apply/answer-once.ts` writes `docs/apply/answer-once.md`.
- Tests:
  - `tests/architect/wo-054-answer-once.test.ts` (8).
  - A browser test in `tests/career-extension-browser.test.cjs`.
  - A `watch` variant in `tests/fixtures/extension/world.cjs`, which reports any input, change, click or submit on a
    page to the world.

## Numbers (VERIFIED-S: synthetic persona, synthetic answers; a real person's rate is NOT_RUN)
`deno run --allow-read --allow-write evals/apply/answer-once.ts --write docs/apply/answer-once.md`, through the
extension's own `planForm` with each posting's location.

With the complete persona (`PERSONA`):

| Sample | Open required questions on cards, no Prepare | Distinct panel questions | Open that are `job:` (cannot merge) | Cards fully ready: before / after every panel answer | Asked again |
|---|---|---|---|---|---|
| A (99) | 233 | 189 (95 `job:`) | 128 (54.9%) | 17 / 49 | 3 |
| B (100) | 178 | 126 (46 `job:`) | 89 (50.0%) | 27 / 44 | 0 |

Sessions of 20 give the same totals, because nothing merges.
- A per session: 54, 44, 50, 23 and 18 panel questions.
- B per session: 38, 18, 26, 30 and 14.

**With a complete persona, no panel question is asked by more than one posting, on either sample.** What is left is
two kinds of question:
- one posting's own (`job:`): offices, work rights abroad, how-heard or a stated fact that did not fit that form's list;
- wordings no other employer uses (`label:`): experience with a named tool, employer-specific screens.

So the panel saves no questions here. It moves 189 (A) and 126 (B) questions out of the session, and none is asked
twice. Left for the cards:
- A: 32 essays, 11 agreements and 1 self-identification;
- B: 41 essays, 6 agreements, 4 files and 1 self-identification.

With a person who gave only their contact details (a first session):

| Sample | Open on cards, no Prepare | Panel questions | Merged keys (card questions they stand for) | Ready before / after | Asked again |
|---|---|---|---|---|---|
| A, one queue | 572 | 299 | 23 (176) | 3 / 26 | 39 |
| B, one queue | 400 | 209 | 19 (138) | 18 / 39 | 14 |
| A, sessions of 20 | 430 at each session's start | 280 | | 10 / 35 | 19 |
| B, sessions of 20 | 294 | 198 | | 26 / 41 | 1 |

Merging matters only where facts are missing. "Asked again" is partly an artefact: every TEST answer is the first shown
option, which other lists often lack. It shows that an answer is never forced. It does not measure how often a real
answer fits.

Browser (TEST world, 3 captured forms: Veeva, Lyra Health, Crusoe; sponsorship not stated):
- 4 open questions; the panel asks 1, "sponsorship" (3 postings, "and 2 similar"). 1 agreement is left for the card.
- During Prepare: 0 touches on any page, 0 submits, no card, every hidden tab closed.
- After the answer "No": each of the 3 cards carries it, factId `text-answer:`, marked; 0 sent, 0 begun.

## Planted defects (each planted alone, then reverted)
| Defect | Caught by |
|---|---|
| `job:` keys merged by wording | WO-054/2, WO-054/3 |
| Panel pre-selects the first option | browser test ("nothing pre-selected"); WO-054/6 does not see a panel-only plant |
| Merge function pre-selects (`selected` = first option) | WO-054/6 |
| An answer forced onto another posting's list (its first option, under its own key) | WO-054/5 |
| EEO no longer left for the card | WO-054/4 |
| Card mark dropped (content.js no longer passes `before`) | WO-054/7 and the browser test |
| Prepare fills the planned fields (`D.fill` in survey) | WO-054/8 and the browser test ("Prepare never fills or clicks") |
| Prepare clicks Submit by a dispatched event (no `.click(`) | browser test only (WO-054/8's text check misses it) |

## Gates
- Architect tests: 564 passed, 0 failed (base 556; +8 here).
- Bundle: `extension/build.ts --check` fresh.
- Browser, Workday and schema suites: 80/80, 0 skipped (base 79/79).
- `deno check scripts/apply.ts`: clean.
- `node --test tests/career-*.test.cjs`: see the PR (compared with base).

## What is not done (blunt)
- **On these samples, with a complete persona, the panel merges nothing.** It asks the same questions earlier, not
  fewer. The "asked by 7 postings" case appears only when the person has not stated common facts (23 merged keys on A
  for a contact-only person). TARGETS' "every unknown asked once" is met only in the sense that each is asked once
  before the session instead of on its card.
- No real person has used it: the rate is NOT_RUN. No live page was prepared. The browser test runs on the TEST world's
  captured pages, with scripts stripped.
- A merged `label:` key whose answer fits one employer's list but not another's can lose the stored answer:
  - The second card's ask-once (`questions` -> `put_own` with `misfit`) reopens the row, so the answer no longer reads
    back for the postings it did fit until it is answered again.
  - This is existing store behaviour, unchanged (no migration allowed).
  - It is rare (the same wording with different lists), but it is real.
- `label:` and `job:` answers are read back through `saved`, where the planner, as today, does not run `fitsField` on
  an answer saved for that exact wording; only options are matched (`matchOption`). `fact:` answers go through
  `chooseOption` and `fitsField`. I did not change the planner.
- Agreements are left out of the panel (my reading of the existing one-employer rule). If the architect wants them
  asked per posting in the panel, it is one line in `leftForCard`.
- Workday postings, the pipelined queue (fix 3) and the cloud worker are out of scope.
- If the service worker restarts mid-Prepare, the readings in flight are lost. Each posting times out at 45 s, is
  reported "not read", and its questions stay for its card.
- The panel offers no way to change an answer once saved, apart from the card itself. The store never replaces an
  answer already given.
