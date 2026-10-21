# WO-075: Greenhouse's resume upload and its paste box are one question

## Why: found while measuring WO-064 (VERIFIED-S, samples A–H, 2026-10-20)
Across 797 captured postings, planned with the complete synthetic TEST persona, the cards that come out fully ready differ
sharply by ATS:

| ATS | Postings | Ready before | Ready after |
|---|---|---|---|
| Greenhouse | 320 | 23 (7%) | **67 (21%)** |
| Lever | 238 | 71 (30%) | 71 (30%) |
| Ashby | 239 | 80 (33%) | 80 (33%) |
| All | 797 | 174 (21.8%) | **218 (27.4%)** |

Greenhouse's schema lists "Resume/CV" twice:
- an upload (`resume`, `input_file`);
- a paste box (`resume_text`, `textarea`).

Both are marked required. One answers the other: the board accepts either. 522 of Greenhouse's open items were this pair.

`planForm` (WO-031 review) leaves both fields to the person when two fields share a label, so a referrer's phone is never
read as "Phone". It counted the pair as two fields, so every Greenhouse card planned from the board's schema waited on the
person for a resume Trainee already holds. The server's `planBatch` already reads the paste box as the upload's alternative
(`career_apply.ts` `fileAlternative`, "63 of 80 real Greenhouse postings carry it"). `planForm`'s same-label count ran
before it and never asked.

## What changed
- `extension/src/apply_core.ts` `planForm`: a field that is `fileAlternative` of an upload beside it is not counted under
  its label. The pair is answered by planBatch with the approved file, and nothing is typed into the box.
- `extension/lib/trainee-core.js` is rebuilt (`extension/build.ts --check` is fresh).

## Acceptance tests (`tests/architect/wo-075-resume-pair.test.ts`; test 1 failed first)
1. Resume and cover-letter pairs: nothing is ambiguous, nothing about the resume is asked, and nothing is typed into the
   paste box.
   - 1b. Without a resume on file, the upload is asked once, as one question.
2. Two real fields under one label ("Phone" twice) still go to the person.
3. A `*_text` field with no upload beside it is an ordinary field: a duplicate label stays ambiguous.

## What this does not claim
- The live page may never have shown this. On the live Greenhouse page, the paste box sits behind "Enter manually" with
  its own label. Whether the extension's survey ever saw two "Resume/CV" fields there is not verified.
- What is verified:
  - every path that plans from the board's schema had the defect: the evals, and every readiness number taken from them;
  - the readiness numbers above come from the product's own `planForm`.
- Earlier docs that report readiness from these samples understated Greenhouse. This includes WO-064's census and run
  numbers. Those docs are left as they were written.

## Size cap
About 80 lines.
