# WO-079: a resume that waits on the person's yes says so, and says what to ask

## Why: found by prompting Trainee (live task battery, CI runs 39485101366 and 39485162284, T09)
1. The person typed their facts: "here's me: 2 years as a data analyst at a regional bank, SQL, Excel, Tableau…".
2. Then they asked for a resume tailored to a posting.
3. Their facts were drafts. A resume uses confirmed facts only (WO-028, D-007).
4. `tailor_resume` refused with "no confirmed experience, project or education facts on file".
5. The model tried `confirm_profile_fact`, which was rightly refused: they had not said yes.
6. The turn ran out of steps, and the person read: "I couldn't finish that in one go, so I stopped partway."

The missing-contact refusal already tells the model the exact question to ask. This refusal did not.

## What changed (`career_tools.ts` `tailor_resume`)
When no fact is confirmed:
- **with drafts on file:** the refusal lists them, up to 6 experience, education or project drafts, and says to ask the
  person to check them and reply yes (or correct them), to make the resume after that yes, and to call no other tool
  this turn;
- **with nothing on file:** it says to ask for their work experience and education in their own words.

The first sentence is unchanged ("no confirmed experience, project or education facts on file … Nothing was stored or
sent"). A confirmation can still come only from the person's next message (D-007 unchanged).

## Evidence
- `tests/architect/wo-079-tailor-ask.test.ts`: 2 tests. Both failed first.
- `wo-028-tailor` 13/13, unchanged.
- Architect suite: 619 passed. Edge suite: 135 passed.
- To measure: the next battery run's T09.
