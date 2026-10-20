# WO-028: A tailored resume in chat, as a private PDF link

Status: built on `wo/028-tailor-in-chat`, offline tests only (no deploy, no live database, no model calls) ·
Depends on: WO-002 (brain tools), WO-021/022 (approve-first card), D-007 (never invent), D-014 (one apply stack).

## What it does
The person texts "make my resume fit this one". The agent brain calls `tailor_resume` with the posting's `job_id` from
`search_jobs` (read from `career_postings`) or the posting's text. The tool:

1. **Uses confirmed facts only.** It builds a fresh profile from the person's confirmed facts. Drafts are not in it at
   all, so a draft cannot support a line or vouch for a skill name (`confirmedOnly`).
2. **Picks, orders and rewords; never adds.** Tailoring is 123's `tailorResume`: parse the posting, select facts, order
   sections for the role family. Its truth audit is a hard gate. The tool then runs the audit **again on exactly what
   will print** (`auditResume` on the submission document). Any failure refuses the whole resume, with the reason. The
   tailor's eligibility verdict and gap notes are for the person; they never print on the employer's PDF.
3. **Renders one PDF** (148) and runs the **ATS parse harness** (`atsHarness`). The harness is 148's parse check:
   - two independent parsers agree with each other and with the source: every line, in order, nothing extra;
   - standard headings, one column, standard 10–12 pt fonts, no images, under 2.5 MB;
   - plus: the name and the email come back out of the file as text.

   A failure refuses the resume. It is never offered or stored.
4. **Stores it privately** at `career-resumes/<user_id>/<sha256>.pdf`, through an injected store (`supabaseResumeStore`
   in production). It returns a link **signed for 7 days**. A link that is not a signed link to that exact object, such
   as a public object URL, is refused (`privateLinkProblem`).
5. **Says what changed in one line** (`changelog`), built only from 123's `diffResume` against the person's base resume
   (every confirmed fact, in the order they gave them). Each clause carries the diff record it came from, and the test
   checks each one is in the diff. The changelog for the fixture below:

   > Led with Software Engineering Intern, TEST Systems Inc, which shows Python, PostgreSQL, React from the posting;
   > dropped Finance Intern, Example Capital (TEST), DeployBoard (TEST project) and MarketSim valuation project (TEST),
   > which this posting doesn't ask for.

   "Doesn't ask for" is said only when the posting's text names none of the skills that entry shows. Otherwise the drop
   is said without a reason. What the posting wants and the record lacks comes back as `not_on_your_record`, never as a
   claim.
6. **Gives the person one plain text** (`text`), the same on every channel (iMessage today; WhatsApp and Telegram
   next): "Your resume for <company> is ready. <changelog>", then the link alone on its own line (any texting app makes a
   bare URL tappable), then "The link works for 7 days." No markdown and no channel names, in that text or in any tool
   description or restatement (`WO-028/12` checks them all).

**The name and email at the top** (`set_resume_contact`). An employer's system reads them from the top of the resume, and
nothing else in chat sets them (resume ingest skips the header). The tool saves `basics.name` and `basics.email` only
when both appear in the person's message this turn: the email exactly (any case), the name as typed (any case, spaces
normalized). It never uses the account email or a guess (D-007).
- The email must match a strict pattern.
- The name must be 2 to 80 letters, spaces, hyphens or apostrophes.
- Anything else is refused with the question to ask. `tailor_resume` without them refuses with the same words: "What name
  and email should go at the top of your resume?"

**Personas** (`save_resume_persona`, `use_resume_persona`):
- A persona is a saved pick and order over the same confirmed facts: `lead` (fact ids, in order) and `hide` (fact ids
  left out). It never holds other facts: an id that is not a confirmed fact is refused.
- Saving or switching works only when the person names the persona in that message ("apply as my banking resume").
  "base" goes back to the plain tailored resume.
- Saving restates it exactly: "banking: leads with Finance Intern, Example Capital (TEST) (F-003), then …; leaves out
  DeployBoard (TEST project) (F-004). Same confirmed facts, nothing added."
- Personas are kept in `career_watch_kv` under `career:resume-personas`. The account erase deletes every non-turn key,
  so it deletes these too.
- The staged-handler fakes allow only `career_watch_kv` keys matching `/^career:(mock:|questions-shown$)/` (tests
  `capability2-bundle`, `career-batch-delegation`, `career-durability`, `career-bundle-reachability`,
  `independent-worker-atomic-interplay`). No staged suite reaches the personas: the store is read only inside the three
  persona and tailoring tools, which run only on the agent brain, and the staged suites run the router. So the regex was
  not widened.

**Instrumentation.** Migration `20261020130000_career_resume_tailoring.sql` adds three columns to `career_apply_jobs`:
`resume_sha256`, `tailored boolean not null default false` and `resume_persona`. No column is dropped or renamed. A
trigger sets them from the approved payload on every insert (and on a payload change). `tailored` is true only when
both hold:
- the payload says so;
- that exact file is one Trainee stored for this person (`career-resumes/<user_id>/<sha256>.pdf`).

So every application is tagged, and a claim alone tags nothing.

On the person's computer, `approve-first.ts prepare|prepare-batch … --tailored-resume <persona|base>` tags the payload,
inside the approval hash. The card then reads `Resume: banking, tailored for this role (<sha12>)` or
`Resume: your base resume, tailored for this role (<sha12>)`. An untailored payload and its card line are exactly as
before.

`callbackRate(rows)` is the report: tailored against untailored, counting only sent applications (confirmed or
submitted_unconfirmed). For each it gives applications, replies, interviews and each rate with its counts, for example
"25% (10 of 40)". With fewer than 30 in either arm it says "NOT enough data: …".

**Bucket.** `career-resumes` is private: `public = false`, PDFs only, 2.5 MB. The only policy lets a signed-in person
read their own folder. There is no insert, update or delete policy, so only the service role writes.

**Deletion.** The PDFs carry the person's name and email, and Storage objects have no cascade from `auth.users`.
- **Account deletion.** `delete-account` lists `career-resumes/<uid>/` through the Storage REST API with the service key
  and removes every file, before the auth user is deleted. It is best-effort, like its Vault calls
  (`tests/career-resume-deletion.test.cjs`).
- **The career erase** ("forget everything"). `handler-career.ts` removes the folder (`removeAll`) once the erase is
  recorded, best-effort (`WO-028/13`).

## Where the PDF renders
148 loads `zlib` and `crypto` with CommonJS `require`. The Deno bundle has no `require`, so its default `CareerRender`
in Deno has neither, and `renderPdf` refuses: "zlib is unavailable in this runtime; PDF rendering needs Node".

WO-028 adds `CareerRender.withRuntime({ zlib, crypto, Buffer })`, the same code over the host's own built-ins.
`edgeRenderer()` passes it Deno's `node:zlib`, `node:crypto` and `node:buffer`. It loads them on the first render, not at
import, so the chat's static module graph stays plain.

The bytes match Node's: a test renders the same document in Node and in Deno and compares the sha256. If the built-ins
are missing where it runs, the renderer names them, and the tool refuses with "the PDF could not be made: … Nothing was
stored or sent." That refusal is tested with the bundle's default instance.

The renderer is a seam (`ResumeRenderer`), so it could run on the person's computer if the deployed Edge runtime ever
lacks `node:zlib`.

## Measured time (local, offline)
- Machine and runtime: Deno 2.9.6, x86_64 Linux, 4 vCPU.
- Input: the fixture persona `packages/career-data/fixtures/test-resume.txt`, ingested and each fact confirmed. The
  posting is the data-analyst fixture in `tests/architect/wo-028-tailor.test.ts`.
- The whole `tailor_resume` call, end to end: tailor, audit twice, render the PDF, ATS harness, store, sign, changelog.
  - first call: 43 ms (this includes loading the node built-ins);
  - warm median: 8.3 ms (20 runs, max 12.5 ms);
  - in the test run: 32 ms (`WO-028/2` asserts under 60 s).
- Not measured: the model turn that calls the tool, the Storage upload and signing over the network, and delivery over
  the texting channel (no live run).

## Tests
- `tests/architect/wo-028-tailor.test.ts`, 13 tests:
  - confirmed facts only: a planted posting skill (Tableau, Snowflake) and a draft fact never reach the PDF;
  - the truth audit refuses an injected defective assembler and an assembler refusal;
  - the ATS harness refuses a file that drops lines or loses the email;
  - Node and Deno render the same bytes, and the tool refuses honestly without the built-ins;
  - every changelog clause is in the diff;
  - personas only pick and order, and switch only on the person's words;
  - the card line and the payload tag;
  - `callbackRate` math and its small-sample label;
  - the storage path, and that a public link is never offered;
  - the name and email only as typed this turn, and the end-to-end resume after saving them;
  - the person's text is plain, with the link alone on its own line;
  - the erase removes the person's resumes, and only theirs.
- `tests/career-resume-deletion.test.cjs`: `delete-account` empties the folder before the auth user is deleted.
- `tests/db/career_resume_tailoring.test.sql`, wired into `tests/db/run.sh`:
  - the bucket is private;
  - the columns are added and none are lost;
  - the tag is set from a stored file only, and not from another person's file or a bare claim;
  - the real `career_apply_enqueue` path is tagged;
  - owner-only reads, and no writes by a person.
- `tests/architect/wo-002-career-tools.test.ts`: the pinned tool list now includes the four tools.
- Go-live: `scripts/launch/trainee-go-live.sh` applies the migration, marked by its trigger function
  (`tests/trainee-go-live.test.cjs`).

## Not built
- **Getting the PDF to the person's computer.** The person downloads it from the link and passes `--tailored-resume`.
  Nothing fetches it automatically.
- **Outcome rows for `callbackRate`.** It is a pure report. Nothing yet reads replies or interviews (the tracker's
  stages, WO-015 inbox proof) into its rows, and there is no scheduled report.
- **Expiry of stored PDFs.** Links expire after 7 days, but the files stay until the erase or account deletion. There is
  no time-based sweep.
- **Not shipped:**
  - a DOCX version;
  - cover letters;
  - model-written rewording: the wording is the tailor's deterministic one, from the facts' own words.
- **Not verified live:**
  - the deployed Supabase Edge runtime running `node:zlib`: verified on local Deno 2.9.6 only;
  - the migration on the live project: the owner pushes it.
- **Not on the live chat yet.** The tools are reachable only on the agent brain (`CAREER_BRAIN=agent`, D-008).
- **The timeline.** A tailored resume is not recorded on the account's timeline (WO-027): `career_events.kind` has a
  fixed list with no kind for it, and widening it needs a migration.
- **Persona lead order.** A persona's `lead` orders only what the tailor picked for that posting. It never forces a fact
  in; the result lists `lead_not_picked`.
