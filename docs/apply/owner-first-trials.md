# The owner's first real submissions: 3 per site (gate 4)

This is the owner's build standard, section 3.3: "the owner personally makes the first 3 real submissions per job site, each confirmed by the employer's confirmation email, before any automated applying on that site."

These runs also produce the submit request shape for Greenhouse's and Ashby's script-driven forms: method, URL, content type and keys, never values. That shape is the missing evidence for their adapters (`docs/competitors/submission-engines.md`).

## Before you start
1. **Pick roles you would genuinely take.** Each one is a real application to a real employer.
   - Greenhouse: `job-boards.greenhouse.io/...`.
   - Lever: `jobs.lever.co/...`.
   - Ashby: `jobs.ashbyhq.com/...`.
2. **Write your confirmed facts file outside the repo**, for example `~/trainee/facts.json`. Use only what you would type yourself (D-007):
   ```json
   {"user_id":"owner","answers":{
     "first_name":{"value":"…","factId":"me-1","confirmed":true},
     "last_name":{"value":"…","factId":"me-2","confirmed":true},
     "full_name":{"value":"…","factId":"me-3","confirmed":true},
     "email":{"value":"…","factId":"me-4","confirmed":true},
     "phone":{"value":"…","factId":"me-5","confirmed":true}},
    "saved":{}}
   ```
   No password, no ID numbers. The engine refuses forms that ask for them.
3. **Your resume PDF**, for example `~/trainee/resume.pdf`.

## Each run
1. **Dry run first.** It prints every field, its answer and where the answer came from:
   ```
   deno run -A scripts/apply.ts --headed --person-submits --url <posting URL> \
     --facts ~/trainee/facts.json --resume ~/trainee/resume.pdf
   ```
   - If it prints `Required confirmed answer: "<question>"`, add your own answer under `saved`. The key is the question in lowercase, with punctuation replaced by spaces and repeated spaces collapsed (`normLabel` in `career_apply.ts`). For example, `"are you legally authorized to work in the united states"` maps to `{"value":"Yes","factId":"me-6","confirmed":true}`. Then run the dry run again.
   - Nothing is ever guessed.
2. **Submit:** run the same command with `--submit` added.
   - Read the review: your answers, the employer's hidden fields it will send unchanged, the verification check the page runs, the resume hash.
   - Type `yes`.
3. **Press Submit:** when it says `Press Submit in the browser window now`, press the page's Submit button yourself, on every site. With `--person-submits` the engine never clicks.
   - **If a verification appears, complete it.**
   - **Exactly one request is let through, and only if it carries your approved answers.** Anything else is stopped, nothing is sent, and the posting can be tried again.
4. **If the employer emails you a code** (the page asks for a verification or security code), it says `The employer emailed you a verification code`.
   - Type the code into the page and press the page's own button, then press Enter in the terminal.
   - Trainee never sees or keeps the code. One request per try, three tries.
   - If the code form sends the application again, it goes only with your approved answers unchanged.
5. **Confirm:** wait for the employer's confirmation email, then record it below.

**Lever, record this:** Lever uploads the resume as soon as it is chosen and fills a hidden `resumeStorageId` from the answer. Without a prior approval (`--approved`) the engine stops that upload, so the application goes with the resume in its own body and an empty `resumeStorageId`. Whether Lever accepts it that way is unknown (ASSUMED). Say in Notes whether the confirmation came and whether the resume shows on Lever's confirmation.

## What to send back (no personal values)
For each run, send back:
- the `RESULT` line;
- the `request_shape` block from the evidence folder printed at the end (`evidence.json`). It holds keys only;
- `reads`, if it is an Ashby run;
- whether the confirmation email arrived, and the minutes it took;
- `code_requests` and `code_handoff`, if a code was asked for (keys only).

The architect pins each site's adapter from these. After 3 confirmed submissions per site, gate 4 starts for that site: the 20-application proof run.

## Record
| Site | Employer | Date | Result | Confirmation email (min) | Notes |
|---|---|---|---|---|---|
| Greenhouse | | | | | |
| Greenhouse | | | | | |
| Greenhouse | | | | | |
| Lever | | | | | |
| Lever | | | | | |
| Lever | | | | | |
| Ashby | | | | | |
| Ashby | | | | | |
| Ashby | | | | | |
