# WO-048: Workday in the extension (70%+ of fields, zero wrong)

## Why
TARGETS v2 asks for 70%+ of fields on Workday. Most large employers apply through Workday. Today the extension recognizes
Workday and fills only name, email, phone and links (WO-031, `WORKDAY_BASIC` in `extension/src/apply_core.ts`). D-013 is
settled as (b): the person signs in to the employer's Workday themselves, in their own browser, and nothing stores a
password. The extension runs in exactly that browser, so it may fill a Workday application the person has opened and
signed in to.

## The rules (architect, binding)
1. **Never the account.** A sign-in or create-account page (a password field, "Sign In", "Create Account", "Verify
   Password", an emailed code) is never filled, never clicked, never read into a record. The card says: "Sign in to
   <employer>'s Workday yourself; I'll fill the application after." No password, code or account email ever goes
   through Trainee.
2. **Every page that leaves the browser is approved.** Workday's "Save and Continue" sends that page's answers to the
   employer's server as a draft. That is an external effect: the card shows that page's answers exactly as they will be
   sent and says "Save and Continue sends this page to <employer> as a draft; nothing is submitted." One tap approves that
   page's exact payload (the same hash binding as WO-031) and only then is "Save and Continue" clicked. The final
   "Submit" on the review page is a separate tap, bound to the review page's own reading of every answer.
3. **What Workday fills itself is shown as Workday's.** A resume upload makes Workday parse it into work history and
   education. Those values were set by the page, not by the person or Trainee: the card lists them under "Filled by
   Workday from your resume: check them" and never counts them as Trainee's fills. A page-set value that contradicts a
   confirmed fact is shown side by side; the extension never silently overwrites it.
4. **Repeating sections** (work experience, education) are added only from confirmed facts (employer, title, dates as
   stated). A date the person never stated is never invented: the field is left and asked.
5. **Voluntary disclosures and the disability form** follow the existing EEO rule: only an answer the person gave, never
   a default. The disability form (CC-305) is always the person's.
6. Everything else is the shared planner (`planBatch`), the answer keys and the ask-once store, unchanged: the same
   "zero wrong" shape rules (WO-042) apply to Workday fields.

## Measurement
- Fixtures: no captured Workday HTML exists. A separate writer (who did not read the extension or planner) wrote
  Workday-shaped multi-page TEST tenants from public sources, with the sources and every assumed id listed. 2 tenants are
  for development; 4 are sealed and scored once by the architect. The fidelity gap to real Workday is stated with every
  number (VERIFIED-S on TEST Workday-shaped pages; real Workday NOT_RUN, GATED on a person signed in).
- Field coverage = fields filled correctly / fields the key says "fill"; precision = correct / filled. Zero wrong is the
  bar; coverage 70%+.
- Live: the first real measurement is a person (owner or Muse) signed in to a real Workday tenant, with the extension's
  card and proof as the record. Nothing is submitted without their tap.

## Out of scope
Account creation, emailed codes, iCIMS, Taleo, SuccessFactors, the cloud worker.

## Status
Fixtures being written (2026-10-20). Builder starts on the 2 development tenants when they land.

## Builder (2026-10-20, branch `wo/048-workday`)
Evidence: **VERIFIED-S on TEST Workday-shaped pages** (dev-a, dev-b; written from public sources by a separate writer,
fidelity gaps in `tests/fixtures/workday/sources.md`). **Real Workday: NOT_RUN** (gated on a person signed in to a real
tenant). The 4 sealed tenants were not opened.

### What was built
- **Reader** (`extension/src/dom.ts`, `readWorkday`): every visible `formField-*` / `attachments-FileUpload` wrapper on a
  Workday host is one field: text, textarea, `button[aria-haspopup=listbox]` (options read once per Fill by opening the
  list), search prompts with pills (leaves read through categories, up to 3 deep), radios, one checkbox or a group,
  month/day/year spinbuttons (format read from the parts), file uploads. A field in a repeating section's row carries
  `section {kind, row, part, anchor, format}`; the phone number carries the code its `countryPhoneCode` field shows
  (`dial`); the CC-305 disability form is `personal`. Hidden (conditional) fields are not read. A sign-in page is never
  read (`readForm` returns nothing there).
- **Planner** (shared, `planBatch`): row fields are answered only from the person's own lists (`sectionAnswer`):
  jobs from the new `work_history` fact (JSON list, dates as stated, end `present` for the current job), education from
  the existing flat facts, languages from `languages` ("English (native)": native/fluent ticks fluency and picks the
  one fluent/native proficiency option). A date is never completed (a year never fills MM/YYYY); location, role
  description and start year are asked. Rows are matched to entries by their company/school/language; a row Workday
  filled for a job the person never stated, or nearly one they stated ("Example Analytic"), is left, and no duplicate is
  added (`rowsToAdd`). Personal fields are never planned or asked. Field-shape rules added for every family: a national
  number beside a country code field; never the phone in "Phone Extension"; never the full address in "Address Line 2";
  "City" alone takes the city fact; a phone-code list only when the person's phone carries that code; "Phone Device
  Type" (new `phone_type` fact); a pay amount onto the one range it falls in; the US among "United States ... (+1)"
  codes; "Have you previously been employed by X" wording; disclosures under a generic label ("Please select one of the
  options below" over veteran classes), Hispanic/Latino, sexual orientation; "Not declared" as a decline; "Are you local
  to <place> or willing to relocate?" asked (two questions in one).
- **Card and taps** (`extension/content.js`, `background.js`, `panel.js`, `apply_core.ts`): each step's card lists that
  step's answers exactly as Save and Continue sends them, Workday's own values apart under "Filled by Workday from your
  resume: check them" (source `workday`, never counted as Trainee's, never overwritten; a contradicting confirmed
  answer is shown side by side), and ends "Save and Continue sends this page to <employer> as a draft; nothing is
  submitted." The panel button reads "Approve this page: Save and Continue". The tap is bound to the card's hash (same
  binding as WO-031; the background refuses a `draft` for any other hash or for a submit card, and `begin` refuses a
  draft card); the step is re-read in the same task as the click; a changed value, a verification, a value the page set,
  or the person's edit stops it. The approved step is kept on this computer (`workday_drafts`); a draft is never an
  application record. The next step fills itself (a new page, or the same page changing step). The review step's card
  is the review page's own reading of every answer and its tap is the only Submit (the existing record + click + proof
  path). Sign-in, create-account, verify-password or emailed-code pages: nothing read, filled or clicked; the card says
  "Sign in to <employer>'s Workday yourself; I'll fill the application after." and the next step fills itself once the
  person is in.
- **Unchanged**: Greenhouse/Lever/Ashby. A Workday page without Workday's own wrappers (WO-031's flat TEST page) keeps
  the basic-contact-fields behaviour, so the WO-031 tests (architect `WO-031/5`, `/10` and the browser test "Workday:
  recognized ... only the basic contact fields") pass unchanged; no existing test was edited or replaced. The 52-test
  browser suite's accuracy report (every row of 17 captured forms) is identical to trunk's (compared row by row).

### Files
`extension/src/dom.ts`, `extension/src/apply_core.ts`, `extension/src/core.ts`, `extension/content.js`,
`extension/background.js`, `extension/panel.js`, `extension/lib/trainee-core.js` (rebuilt),
`supabase/functions/_shared/career_apply.ts`, `question_map.ts`, `answer_options.ts`, `fact_schema.ts` (facts
`work_history`, `phone_type`), `docs/apply/fill-coverage.md` (regenerated: B 711 -> 712, A unchanged in total),
`tests/fixtures/extension/world.cjs` (serves a TEST tenant dir under `*.myworkdayjobs.com`; variant `parsed`),
`tests/fixtures/workday/{dev-a,dev-b,sources.md,persona.json,signin/0-sign-in.html}` (the sign-in page is the
builder's own TEST page, not the writer's), `evals/apply/workday-fill.cjs`, `tests/architect/wo-048-workday.test.ts`
(9), `tests/career-extension-workday.test.cjs` (8).

### Numbers (VERIFIED-S on TEST Workday-shaped pages; real Workday NOT_RUN)
`node evals/apply/workday-fill.cjs --tenant tests/fixtures/workday/<t>` (TEST persona of sources.md as confirmed facts;
the test person answers only what is theirs, approves page by page, stops at the review because the key's Submit says
"ask"):

| Tenant | Coverage (correct / should-fill) | Strict (Trainee's correct / rows with a value) | Precision | Wrong | Never-violations | Submitted |
|---|---|---|---|---|---|---|
| dev-a | 95.7% (44/46) | 95.2% (40/42) | 100% (41/41) | 0 | 0 | no |
| dev-b | 100% (44/44) | 100% (41/41) | 100% (42/42) | 0 | 0 | no |

dev-a's two rows not counted: Country and Country Phone Code were pre-selected by the tenant; the final state is right
but the value is Workday's, so it is not Trainee's. "Coverage" counts a row whose correct state is empty or unchecked
(Address Line 2, Phone Extension, "I have a preferred name") as correct when left so; "strict" excludes those rows.

### Planted defects (one at a time, reverted; `defects` run on this branch)
| # | Defect (one line) | Caught by |
|---|---|---|
| D1 | `dom.ts` `workdayAccountPage`: `return false` (a sign-in page not recognized) | browser "a sign-in page is never read, filled or clicked ..." |
| D2 | `content.js`: a draft step's tap no longer goes to Save and Continue (falls into the submit path) | browser "a step's card: ... the tap saves exactly that step"; "zero wrong on dev-a/dev-b" |
| D3 | `career_apply.ts`: `if (f.personal) continue;` removed (disability form planned) | architect WO-048/6 (first run: escaped, since planForm also drops personal fields; the direct planBatch assertion was added, then caught) |
| D4 | `career_apply.ts`: every job ticks "I currently work here" | architect WO-048/1; browser "zero wrong on dev-a", "zero wrong on dev-b" |
| D5 | `career_apply.ts` `nationalNumber`: keeps "+1" beside Workday's code field | architect WO-048/4; browser "a step's card ..."; "zero wrong on dev-a/dev-b" |
| D6 | `content.js`: Workday's values present at first read not kept apart | browser "a step's card ..."; "Workday's own values are Workday's ..."; "zero wrong on dev-a/dev-b" |
| D7 | `apply_core.ts`: a draft step's card says Approve submits | architect WO-048/8; browser "a step's card ..." |
| D8 | `career_apply.ts` `rowsToAdd`: adds a row per entry whatever rows exist | architect WO-048/2, WO-048/9; browser "Workday's own values are Workday's ..."; "zero wrong on dev-b" |

### Still not handled (blunt)
- Real Workday is NOT_RUN. The fixtures accept synthetic `.click()`, value setting and `input` events; real Workday
  (React, virtualized lists in a portal, some tenants wanting trusted clicks) may not. Date spinbuttons are set by value
  plus an input event; a real tenant may need typed keys. Expect misses there, not wrong answers (every fill is read back).
- The single-page (SPA) step change is coded (step title change -> next card) but the fixtures are one file per step, so
  only the page-load path is exercised.
- No intake collects `work_history` or `phone_type` yet: until a person's facts carry them, work rows and phone type are
  asked. Languages need a level ("English (native)") for fluency and proficiency.
- A resume Workday parses after the card was made shows as "set by the page" and blocks until the person presses Fill
  again (then it is shown as Workday's). Trainee does not upload a resume unless the person set one in the panel.
- Workday's open questions are not sent to Trainee's ask-once store (as before); the person answers them on the page.
- A Workday sign-in that shows no password box and none of Workday's account markers (an email-first step with only
  "Next") is not recognized as a sign-in page.
- Approved draft steps are kept only on this computer (no queue record, no screenshot); only the final Submit is recorded.
- The review card masks long numbers it cannot tie to a confirmed fact or a date (as "typed by you").

## Architect review: the 4 sealed tenants, scored once (2026-10-20)
Sealed TEST Workday-shaped tenants s1-s4 (written from public sources by a separate writer who never read the extension or
planner; sha256 of the sealed tar cef21e45...), scored once on a1a550f1 with `evals/apply/workday-fill.cjs`. VERIFIED-S on
TEST pages; real Workday NOT_RUN.

| Tenant | Trainee's fills correct / should fill | Correct on the form incl. Workday's own fills | Trainee precision | Wrong | Never-violations | Outcome |
|---|---|---|---|---|---|---|
| s1 (sign-in first) | 0 / 0 | n/a | n/a | 0 | 0 | the eval's test person could not click Sign In (harness); the extension correctly left the sign-in page alone |
| s2 | 30 / 44 (68.2%) | 41 / 44 (93.2%): 11 values were set by Workday's own resume parse | 100% (27/27) | 0 | 0 | reached review, not submitted |
| s3 | 37 / 41 (90.2%) | 39 / 41 (95.1%) | 100% (34/34) | 0 | 0 | reached review, not submitted |
| s4 | 15 / 16 on page 1 | n/a | 100% (12/12) | 0 | 0 | stopped on page 1: a required "How did you hear" search widget was left unanswered, so the rest was never reached |

Across what was reached: **0 wrong answers, 0 fields the person must fill touched, nothing submitted**; Trainee's own fills
73 of 73 correct. Misses: a "previous employee of X or any of its subsidiaries" radio, "local to Chicago or willing to
relocate" (asked; the key says Yes), an English proficiency list, a LinkedIn link in a generic URL field, "when could you
start" ("Within 2 weeks"), and the how-heard search widget that stopped s4. Coverage against the 70% target is met on the
two tenants that ran end to end (counting only Trainee's fills: 68.2% and 90.2%; on the form: 93.2% and 95.1%), not shown
on s1 and s4. The sealed set is now spent: its misses were read for the next round.
