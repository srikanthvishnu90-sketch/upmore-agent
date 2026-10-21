# Resume structuring (module 165) — design + integration note, 2026-10-21

Lane: RESUME STRUCTURING (owner ruling 2026-10-21 13:42 CDT). Branch
`muse/2026-10-21-resume-structuring` off cea914fe. Named outcome: a user
pastes or answers raw facts and gets back a clean, single-column,
ATS-safe resume as PDF + DOCX, with a parse-back check proving the text
extracts in reading order.

## Step 0 — format reference: NOT_FOUND

The owner said he sent a format-reference image of his own resume. It is
not on this machine in any of the searched locations:
`~/workspace/user/media_library/` (all image subdirs — newest uploads are
a Trainee website screenshot, 2026-10-20, and a BotFather screenshot,
2026-10-19), recent files under `~/workspace/user/` and
`~/workspace/your_files/`, `browser_screenshots/`, side-chats and
downloads (nothing modified 2026-10-21). The structure below therefore
implements the brief's written spec (which matches the classic
single-column format: centered header, caps section headings with a
rule, bold entry titles with right-aligned dates, hanging-indent
bullets). If the image surfaces, the layout constants in module 165
(PAGE / STYLE_SIZE / LEAD / GAP_BEFORE) are the one place to retune.

## Structure spec (as built)

- US Letter, one column, 54pt (PDF) / 0.75in (DOCX) margins. No images,
  no layout tables, no text boxes, no graphics of any kind (the only
  non-text marks are the heading rules).
- Header: name (bold, 16pt, centered), then one centered contact line:
  `City, ST | phone | email | linkedin.com/in/...`.
- Sections in order: EDUCATION, EXPERIENCE, SKILLS, CERTIFICATIONS
  (a section with no facts is omitted entirely — never an empty shell).
- Entry: bold title (school / org) left, dates right-aligned on the
  SAME line (PDF: same baseline, right edge on the right margin,
  positioned with true Helvetica AFM widths; DOCX: a right tab stop at
  the text edge inside the same paragraph).
- Sub-line under an entry: degree/detail (education) or role
  (experience, oblique in PDF / italic in DOCX); GPA + notes on their
  own line, joined with " · ".
- Bullets: "•" glyph with a hanging indent; wrapped lines align under
  the text, and parse-back expects exactly that shape.
- Experience order: end date descending ("Present" first), then start
  descending, stable for ties.

## The model + GAP LAW

`normalizeFacts(raw)` → model `{ header{name, city, phone, email,
linkedin}, education[], experience[]{org, role, dates, bullets},
skills[], certifications[], gaps[], unplaced[],
application{work_authorized} }`. Work authorization is application
data, not resume content — it rides the model unrendered.

Only facts present in the input go in. Everything missing is a named
GAP FLAG on `model.gaps` (codes: NAME_MISSING, CITY_MISSING,
PHONE_MISSING, EMAIL_MISSING, LINKEDIN_MISSING, EDUCATION_MISSING,
EXPERIENCE_MISSING, SKILLS_MISSING, ORG_MISSING, ROLE_MISSING,
DATE_MISSING, DATE_PARTIAL, UNRESOLVED_PLACEHOLDER,
EDUCATION_ENTRY_DROPPED, EXPERIENCE_ENTRY_DROPPED). Rules that matter:

- A year-only date renders as the year. For an education end date the
  missing graduation month is flagged DATE_PARTIAL — never invented.
- A placeholder-shaped value (e.g. `"[28]"`, an unresolved fact-bank
  slot) is dropped and flagged UNRESOLVED_PLACEHOLDER, never rendered.
- A facts object marked refused (`ok === false` / `refused === true`,
  the truth-gate shape module 148 uses) renders NOTHING; a missing
  name also refuses rendering (NAME_MISSING).

## Parse-back (the proof)

`parseBackCheck(model, {pdf, docx})` extracts text from the generated
files and diffs it against the composed model order:
- PDF: this module's own content-stream parser (runs grouped by
  baseline, ordered by x) — asserts exact line sequence, entry dates
  on the title's line, no duplication, no image XObjects. An optional
  second, independent parser (poppler `pdftotext`, `external: true`)
  runs when the binary exists and is recorded separately.
- DOCX: paragraph-order extraction from `word/document.xml` — asserts
  the same sequence, plus structural bans (no `w:tbl`, no
  `w:drawing`/`w:pict`, no text boxes).
Measured (2026-10-21): synthetic golden corpus 11/11 in
`tests/career-resume-structure.test.cjs`, including a fail-first
control (a model with swapped experience order FAILS the check).
Real-corpus run (owner's true facts, local evidence only — see
Privacy): PDF PASS, DOCX PASS, pdftotext PASS; gaps exactly
DATE_PARTIAL (graduation month) + UNRESOLVED_PLACEHOLDER ([28]).

Two layout lessons measured along the way, both now in code comments:
(1) the Helvetica width table drives date placement — one duplicated
entry shifted every lowercase width and visibly misaligned the dates;
(2) poppler merges words across a mid-line font switch on plain lines
("Languages:Python"), so PDF plain lines render as ONE run in ONE
font (the DOCX keeps bold skill labels; OOXML extraction is
character-faithful).

## Runtime note (F-011 stated plainly)

Module 165 targets **Node first** (worker / board host / tests) and is
written on Uint8Array + TextEncoder with zlib/Buffer captured
opportunistically: DOCX ZIP entries are STORED (no compression) and
PDF streams fall back to uncompressed, so it also renders in the
require-less Deno bundle. It contains no bare-`Buffer` reference.
F-011 itself is module **148's** defect (bare `Buffer` in the Deno
edge runtime; fix PR #150 built, undeployed) — 165 does not fix or
depend on 148, but any future edge wiring of 165 ships under the same
bundle discipline, and the tailor path (123 → 148) keeps its F-011
dependency until PR #150 deploys.

## Integration — WO-028 storage, WO-075 board fields

- **Landing in WO-028:** `buildResume(facts)` returns
  `{ model, pdf{buffer, filename, contentType, bytes}, docx{...},
  parseBack }`. The caller uploads `pdf.buffer` / `docx.buffer` to the
  private bucket `career-resumes` under the user's own prefix with the
  returned filename (R8 shape, e.g. `First_Last_Resume.pdf`), and
  serves them only through the existing signed-link path. Suggested
  tailoring tags on the stored object: `source=structured-165`,
  `model_version=1`, `gap_count=<n>`, `parse_back=<PASS|FAIL>` — a
  resume whose parse-back is not PASS should not become the profile's
  board resume. Alongside the files, store `model` JSON (the gaps list
  is the product's honest "what's missing" surface for the user).
- **Consumed by WO-075 / module 150:** the board upload path is
  sha-bound — `board.fill(<resume field>, { filename, sha256 })`
  uploads only the local file whose bytes hash to the profile resume's
  sha256 (`RESUME_SHA_MISMATCH` otherwise). Wiring = register the
  structured PDF as the profile's resume (filename + sha256 of the
  exact stored bytes) and give the board a local path to those bytes.
  On the worker host that is the known `resolveResumePath` seam:
  `board-config.cjs` currently omits it, so worker-service sessions
  are created with `resumePath = null` and a resume fill stops
  RESUME_FILE_MISSING (measured in the board-acceptance run below —
  the O5 lane wires this tonight). Paste-style board fields take the
  parse-back-extracted plain text (`extractPdfLines(...).map(text)
  .join("\n")`), which is exactly the text the parse-back proved.
- **Registry:** module 165 is not yet registered in
  `packages/capabilities/registry.json` — flagged to the integration
  lane, same posture as modules 156–164.

## Board acceptance (doorstep only, flag OFF, nothing submitted)

Target: Gusto — Finance Intern (Summer 2027), Greenhouse
(https://job-boards.greenhouse.io/gusto/jobs/8257115), gauntlet TEST
profile. The uploaded file was the SYNTHETIC fixture PDF (Alex
Example) — a format probe never sends the owner's real resume.
Evidence record: `~/workspace/your_files/resume-structuring/board-acceptance.json`.

- **Part A — live worker board service** (the throughput lanes' probe
  pattern): session created (family greenhouse, verdict-gated), form
  observed — 28 fields incl. `resume` (profile_key resume). Resume
  fill attempt → coded stop **RESUME_FILE_MISSING**: the live
  board-config has no `resolveResumePath`, so the session holds no
  local file. The seam is named, measured, and already on O5's
  tonight list to wire.
- **Part B — module 150 local board** (the same primitives the service
  wraps), `resumePath` = the generated PDF: upload fill returned OK
  (the helper verifies attachment; a dropped upload throws), and
  `answers()` readback of the live file input returned
  `{ filename: "Alex_Example_Resume.pdf", sha256:
  d3c7c6a3fababd410ff8d51ab909925fc2a7c4fd34ea865a44d27c40374ed1be }`
  — byte-identical to the generated file. Paste box: the form's
  free-text field took the 364-char parse-back-extracted plain text;
  readback matched exactly (364/364 chars, whitespace-normalized).
  `fillFailures: []`. The board was closed at the doorstep;
  armForSubmit/submit were never called. (The first combined run's
  Part B stopped RESUME_SHA_MISMATCH before uploading; the identical
  standalone rerun above is the recorded Part B, and the first
  attempt is preserved in the evidence file.)

## Privacy

The owner's real facts and the outputs generated from them NEVER
enter this repo (it is public). They live at
`~/workspace/your_files/resume-structuring/` (`model.json`,
`Vishnu_Srikanth_Resume.pdf/.docx`, `real-corpus-run.json`,
`run-real-corpus.cjs`). Committed tests use a synthetic persona only.
