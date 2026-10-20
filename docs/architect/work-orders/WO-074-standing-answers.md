# WO-074: standing answers, given once for a class of question

## Why (VERIFIED-S, samples A–H, 797 postings, synthetic TEST persona)
WO-064 showed that drafting cannot clear the panel: 762 of its 1,472 questions are, by policy, the person's own (office
and place, work rights, how they heard, relatives). Today a panel answer travels only by its exact wording (`label:`)
or stays with one posting (`job:`). So:
- "Are you authorized to work in the country where this job is located?" is asked again at every posting abroad;
- every office question at a posting away from home is asked per posting;
- an answer about relatives or how they heard never reaches the next form if the wording changes.

With the complete TEST persona, 1,866 required questions stay open on the 797 cards. Of them:
- 159 are office questions, 26 commuting, 16 relocation;
- 144 are work rights (79 sponsorship, 65 authorization), mostly at postings abroad;
- 25 are how-heard questions whose options do not fit the stated "Company website";
- a few dozen are relatives questions the relatives fact does not cover.

## Design
A standing answer is the person's own statement for a class of question. It is given once, in the panel, and kept
like any saved answer under its class key.

| Key | The person's statement | What it answers |
|---|---|---|
| `standing:how_heard` | one pick: "the company's careers website", "...or a job board", "a job board", LinkedIn, Indeed, Glassdoor | how/where did you hear |
| `standing:relatives_at_employer` | one pick: "No relatives or close relationships at companies I apply to; I'll tell Trainee if that changes" | yes/no relatives at this employer |
| `standing:work_rights` | countries where they may work without sponsorship, whether that is every such country, and whether they need sponsorship elsewhere | authorized / sponsorship, at a country other than home |
| `standing:office` | cities where they can work on site, and up to how many days a week | can you work on site / in office N days at X |

**Code decides, never a model.**
- **Class.** `question_map.ts` `standingClass` assigns a class by rules plus an explicit exclusion list:
  - relatives exclude friends, vendors, other companies, names, past relationships;
  - work rights exclude visa type or status, permanence, "what" and "which", statements to tick, process experience;
  - office excludes relocation, commuting, residence, interviews, travel, remote, schedules, feelings and timing.
- **Answer.** `standing_answers.ts` `standingAnswer` derives the answer from the statement and the posting:
  - its country, from the location text alone (`postingCountryName`: one country, or nothing);
  - the place the question names, else the posting's places;
  - the office days asked (none said = the whole week);
  - the form's own options (every option a yes or a no, exactly one fits; a box or a typed yes/no).
- **Not settled, then asked as before.** Examples:
  - a country not known (Remote, two countries, "Dublin" alone);
  - a list of countries the person did not confirm as complete;
  - the person's home country (their facts answer it, WO-052/053/055 unchanged);
  - more office days than stated, or a place not listed;
  - a two-way how-heard statement on a form that offers both ways.
- **Order in `planBatch`.** A standing answer is the last resort. It never overrides an answer the person gave for that
  exact question (even one that fits no option), and never a fact that applies. Its fill carries
  `factId = standing:<class>:<row>`. The card says "(from your standing answer: <the statement>)".

**No extra steps (owner constraint).**
- The standing item is one item in the existing answer-once list, saved by the existing Save.
- It is offered only when the person has not given it yet, and only when it covers more panel entries than its inputs:
  1 pick, or 2 inputs for work rights and office.
- While offered, it replaces the entries it covers. Skipping it shows them again.
- Once saved, any covered entry the statement does not settle is shown again in the panel at once (`standingUnsettled`).
- Every input starts empty. The statement is composed only from the person's own picks, and refused unless complete.

**Store.**
- Migration `20261022120000_career_apply_standing_answers.sql` widens the key check and
  `career_apply_questions_answer_from_form_own` to the four class keys. Nothing else changes.
- `factsWithTextAnswers` reads `standing:` rows into `saved`.

## Evidence
- **Tests.** `tests/architect/wo-074-standing-answers.test.ts` has 14 tests, written first and failing first.
  - Per class: matching wordings apply across postings; near-misses are refused; the answer is always one of the form's
    options; unknown context is asked.
  - Precedence: the person's own answer wins.
  - Store and panel: the store, the panel offer, the card line, and the review's findings.
- **Browser.** `tests/career-extension-browser.test.cjs` "standing answers" runs in real Chromium, on three London
  Snowflake forms:
  - Prepare offers one work-rights item in place of 3 entries, all inputs empty;
  - the existing Save keeps it through `career_apply_questions_answer_from_form_own`;
  - each card fills "No" from it and says so;
  - nothing is sent.
- **Unchanged and passing:** WO-052, WO-053, WO-054, WO-055 and WO-031.
- **Gates:**
  - architect 643 passed;
  - edge list 135 passed;
  - extension bundle fresh;
  - router core verified;
  - browser file 55/55 passed.

### Measured: `deno run -A evals/apply/standing-answers.ts` (VERIFIED-S)
The synthetic standing answers (`STANDING` in the script) are consistent with PERSONA:
- how they heard: the careers website or a job board;
- relatives: none;
- work rights: United States only, complete, sponsorship needed elsewhere;
- on site in Chicago, New York and San Francisco, up to 5 days a week.

| Split | Postings | Open questions on cards | Panel entries (later sessions) | Cards fully ready | Panel taps per 100 postings, first session | Panel taps per 100 postings, later sessions |
|---|---|---|---|---|---|---|
| A–D (tune) | 398 | 870 → 822 (−48) | 697 → 649 (−48) | 113 → 116 (+3) | 175.1 → 168.6 | 175.1 → 163.1 |
| E–H (held out) | 399 | 996 → 935 (−61) | 775 → 714 (−61) | 105 → 115 (+10) | 194.2 → 183.7 | 194.2 → 178.9 |
| All | 797 | 1,866 → 1,757 (−109) | 1,472 → 1,363 (−109) | 218 → 231 (+13) | 184.7 → 176.2 (−8.5) | 184.7 → 171.0 (−13.7) |

How taps are counted:
- One input or pick is one tap.
- First session: the standing items' inputs, plus the entries they do not cover, plus covered entries the statement did
  not settle (shown again).
- No sample's first session costs more taps than the WO-054 panel (B: 135.0 → 135.0).
- Per-sample rows: `docs/apply/standing-answers.md`.

### Precision: one independent reviewer, fresh context
A separate Claude Code session (`session_01AM1aTMiRnthQvuDVdoCCMp`) read only
`evals/apply/results/wo-074-review-packet.jsonl`. The packet holds every derived answer of the run under review, each
with its question, options, posting location, standing statement and derived answer. The reviewer labelled each RIGHT
or WRONG, strictly ("when in doubt, WRONG"). Verdicts: `evals/apply/results/wo-074-review-verdicts.txt`.

| Run | Derived | A–D (tune) | E–H (held out) | All |
|---|---|---|---|---|
| Reviewed run | 124 | 49/53 (92.5%) | 65/71 (91.5%) | 114/124 (91.9%) |
| After tightening on A–D's 4 wrong only | 113 | 48/48 (100%) | **64/65 (98.5%)** | 112/113 (99.1%) |
| Shipped (also "immediately", found on E–H) | 112 | 48/48 | 64/64 | 112/112 |

What the review changed:
- **Tightening.** It only removed answers: no new or changed answer needed review. Every remaining answer carries the
  reviewer's verdict.
- **Tune-set wrongs (A–D):**
  - "Dublin" alone may be in the US;
  - "excited" is a feeling;
  - a two-way how-heard statement on a form offering both ways (two cases).
- **Held-out:**
  - the fixes generalised to 5 of the 6 wrongs;
  - the 6th ("...our San Francisco office immediately?") asks a start time. It is excluded now, but this was seen on
    held-out data, so the held-out figure is the 98.5% above.
- **Before the review.** I read the first run's answers myself and tightened two patterns found in B and D (an
  experience question, "I want to be based in the UK but will need visa support"). I saw the G "immediately" item and
  did not change it before the review.
- **Final split by class:**
  - 87 work rights, 19 office, 4 relatives, 2 how heard;
  - 0 answers outside the form's options.
- **Two-way how-heard statement.** With "careers website or job board", how-heard derives little (2). The review found
  such a statement settles only forms that offer one of the two ways. A one-way statement would derive more; that is
  not measured.

## Not covered
- **The live database.** The migration must be applied by the owner. Until then, saving a standing answer from the
  extension fails with "invalid answer", and its covered questions stay for the cards.
- **The database tests.** `tests/db/career_apply_standing_answers.test.sql` is written and added to `run.sh`, but
  **NOT RUN** here: the session's sandbox refuses to run as the unprivileged user that `run.sh` needs.
- **Changing a standing answer.** A standing answer cannot be changed or withdrawn yet: an answered row is never
  replaced. The relatives statement's "I'll tell Trainee" has no path yet. This needs an owner-approved update RPC.
- **The texting path.** It does not ask standing questions. A standing row's answer must be the panel's JSON; free text
  is ignored, never parsed.
- **Office relocation.** Relocation is not part of the office statement. The person's existing relocation fact answers
  relocation questions, and leaving it out costs one tap fewer.
- **Taps.** They are counted per input, not per keystroke. A real person's taps and answers are **NOT_RUN**.
- **Live employer pages.** Not run.

## Size
- Code: about 600 lines across `standing_answers.ts`, `question_map.ts`, `career_apply.ts`, `apply_core.ts`, the panel,
  the background, the content script and the migration.
- Tests and eval: about 600 lines.
