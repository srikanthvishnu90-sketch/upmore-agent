# Resume upload: the board config gap (2026-10-21)

**Root cause (one line):** the board's file fill (module 150 over `scripts/career/portal-browser-helper.cjs`) had
no per-ATS description of the resume upload. It took "a file input that still holds the file" as the only proof of
an attach. When that input was gone, it re-found "the first `input[type=file]` on the page". Live, Greenhouse
uploads the file the moment it is attached and takes the input out of the form. So every Greenhouse resume the
employer had already taken read as `file_input_not_mounted`, or was attached again into the next upload on the page.

This is the BUG-237 symptom that was never explained: "resume inputs failed to mount on 18 of 24 boards", which
varied by session and by board. If Greenhouse's upload is slower than the 450 ms settle, the input is still there and
the fill verifies. If it is faster, the input is gone and the fill "fails".

## Evidence
- **Live, never sent.** Source: `evals/apply/results/live-fill.json`, the WO-042 CI run against the 17 real pages. It
  aborted every write.
  - **Greenhouse:** after the extension attached the resume, a POST to
    `grnhse-prod-jben-us-west-2.s3.us-west-2.amazonaws.com/` was attempted on 5 of 5 forms. The `resume` field was
    gone from the form on 5 of 5 (`changed_since_capture.gone_fields`).
  - **Lever:** `POST jobs.lever.co/parseResume` on 6 of 6. The input kept the file on 6 of 6.
  - **Ashby:** GraphQL mutation `ApiCreateFileUploadHandle` on 6 of 6. The input kept the file on 6 of 6.
- **Captures** (`tests/fixtures/forms-ci`):
  - Every Greenhouse resume input sits alone in `div[role=group][aria-labelledby="upload-label-resume"]`.
  - On 3 of 5 Greenhouse forms another upload follows it on the page:
    - EōS: a cover letter and 3 question uploads;
    - SpaceX: a question upload;
    - Anduril: a cover letter.
  - On 6 of 6 Ashby forms the first file input is "Autofill from resume" (`.ashby-application-form-autofill-input-root`).
    It has no id or name, and it parses the file into the form's answers.
  - Every Greenhouse upload group carries `data-allow-s3="false"`, a per-board flag whose meaning is not known (the
    live page still posted to S3). It is recorded here and nothing reads it.
- **Code, before the fix:**
  - `rediscoverFileSelector` returned `document.querySelector('input[type="file"]')`.
  - `cmdFill` treated a vanished node as not attached and attached again (3 attempts).
  - The readback read only `el.files`.

## Which ATSs upload before Submit (all three)
| Family | When | Where (observed live) | After attach |
|---|---|---|---|
| Greenhouse | the moment the file is attached | `POST https://grnhse-prod-jben-us-west-2.s3.us-west-2.amazonaws.com/` (Greenhouse's S3 bucket, a third-party host) | the input leaves the form; the group shows the file name |
| Lever | the moment the file is attached | `POST https://jobs.lever.co/parseResume` (the employer's origin) | the input keeps the file; hidden `resumeStorageId` is set from the answer |
| Ashby | the moment the file is attached | GraphQL mutation `ApiCreateFileUploadHandle` on `jobs.ashbyhq.com/api/non-user-graphql`, then a storage upload that was never reached (the mutation was aborted) | the input keeps the file |

A "no-submit rehearsal" in a real browser therefore still sends the resume to the employer on every family, unless
writes are blocked the way `evals/apply/live-fill.cjs` blocks them. On Ashby, if a file reaches the autofill input,
Ashby also rewrites the form's answers from its own parse.

## Measured: the TEST world harness, before and after
Harness: `tests/career-resume-upload.test.cjs` with `tests/fixtures/resume-upload-server.cjs`.
- Every captured Greenhouse, Lever and Ashby form is served on localhost with its scripts stripped.
- A TEST stand-in plays the upload widget. Each stand-in is modeled only on the live evidence above.
- The resume is filled the way the desktop engine and the worker fill it: module 150's board over the helper.
- **Attached** means all four of these hold:
  - the employer's upload of the approved bytes happened once, from the resume's own input;
  - nothing went to another upload;
  - the board reported no failure;
  - the readback returned the resume's SHA-256.

| Family | Forms | Attached before | Attached after | Wrong input before | Reported failed before |
|---|---|---|---|---|---|
| Greenhouse | 5 | **0** | **5** | 3 (cover_letter, question uploads) | 5 (4 `file_input_not_mounted`, 1 `value_did_not_persist`) |
| Lever | 6 | 6 | 6 | 0 | 0 |
| Ashby | 6 | 6 | 6 | 0 | 0 |
| Ashby, resume input remounted under a new id (the BUG-207 remount shape) | 2 | **0** (the resume went to the autofill parser) | **2** | 2 | not recorded (the test stops at the wrong input) |

The existing extension TEST world (`tests/fixtures/extension/world.cjs`) reads 17 of 17. That number does not show
the gap: its stand-in employer models no upload widget, so every input keeps its file until Submit. Live Greenhouse
does not do that.

## What the fix changes
- **New:** `scripts/career/resume-upload.cjs`, the per-ATS resume upload descriptors (the missing board config). It
  holds:
  - what each family uploads before Submit, from the live evidence;
  - the inputs that are never the resume (Ashby's autofill parser);
  - in-page functions for the resume's own place on the form: its upload group, id, name or own label.
- **`scripts/career/portal-browser-helper.cjs`:**
  - At discovery, every file input's place is read while all the inputs are still on the page.
  - Re-discovery finds only the input in the resume's own place. With no place known, it takes only a page's single
    file input. It never takes Ashby's autofill parser.
  - The attach control pressed is the one in the resume's own upload group. On a page without upload groups, the
    page-wide search skips Ashby's autofill parser.
  - A fill whose input the employer took is verified as `employer_took_file`, and nothing is attached again. "Took"
    means the resume's own upload group holds no input and shows the attached file's name. The bytes were
    SHA-checked before the attach.
  - Readback returns that file (`{filename, sha256}` of the bytes this helper attached) only while the group still
    shows the name.
- **Not changed:**
  - `extension/src/dom.ts`. Its `fill()` for a file input is right: live, it set off the employer's own upload on
    17 of 17 forms. No dom.ts change, so nothing collides with wo/frs-yesno.
  - `scripts/apply.ts`, `extension/content.js`, `tests/fixtures/extension/world.cjs`. See "Open" below.

## Open (not fixed here)
1. **Desktop engine network guard (`scripts/apply.ts`).** Even with `--approved`, it lets a resume upload through
   only in Lever's shape: same origin, multipart, one file part.
   - Greenhouse's upload goes to a third-party S3 host with presigned form fields.
   - Ashby's is a GraphQL mutation (JSON).
   - Both are always aborted, so on those families the engine's application leaves without the employer's stored
     resume.
   - Widening that guard means sending the resume to a host other than the employer's own page. The body shape has
     never been observed (every live run aborted it). That decision is the owner's.
   - A safe first step: record the aborted upload and stop under a named reason, `RESUME_UPLOAD_STOPPED`.
2. **Extension card on Greenhouse.** After the attach, `readForm` no longer sees the resume (the input is gone).
   - The card's `Resume:` line comes from the panel's file, not from the page, and the approval binds no resume
     field.
   - The proposed diff for content.js is in the report.
3. **TEST world.** `world.cjs` should model Greenhouse taking the input (the proposed diff is in the report), so the
   extension suite sees what live Greenhouse does.
