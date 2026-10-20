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

## Round 2 (builder, 2026-10-20, branch `wo/048b-workday-r2`)
Evidence: **VERIFIED-S on TEST Workday-shaped pages**; real Workday **NOT_RUN**. The spent tenants are copied into the repo
as `tests/fixtures/workday/spent-s1`..`spent-s4` and were developed against: their numbers are **not blind**. No other
sealed set was opened.

### What changed
- **Eval harness, the test person's sign-in** (`evals/apply/workday-fill.cjs`): the person types with real keys and clicks
  at the Sign In button's centre with a real pointer, so the click lands on Workday's `click_filter` overlay as a person's
  does (s1's timeout was a click aimed at the covered button); if nothing answers the click they press Enter. An
  email-first sign-in takes two rounds (email + Next, then the password). The person's list and prompt picks no longer
  take a chosen pill of another prompt for an option (s4's stall was also this). The report lists the questions sent to
  ask-once. The extension still never touches a sign-in page.
- **Email-first sign-in in the extension** (`dom.ts`): a Workday page whose only box is an email or user name box, with a
  Next / Continue / Sign In button and sign-in or account wording, is an account page even with none of Workday's
  markers: never read, filled or clicked; the card says to sign in yourself. `readForm` returns nothing on any account
  page, flow markers or not. TEST page: `tests/fixtures/workday/signin/0-sign-in-email-first.html` (builder's own).
- **How-heard on a search prompt with categories** (`dom.ts`, `answer_options.ts`): a leaf under categories is offered to
  the planner as "Category > Leaf"; the fill types the leaf, waits up to 3 s for results and takes it only when exactly
  one result is that leaf (a twin leaf under another category goes by its category path, or is left). The careers site by
  its own name wins ("Litware Careers Website" over "Other Website"); a plain website option only when none names it,
  never "Other Website". No sure match: left and asked; the person's own pick makes the card ready.
- **Planner (shared, zero wrong)**: "previous employee of X or any of its affiliates/subsidiaries" is `worked_here_before`;
  No only when every job in `work_history` is in the confirmed `former_employers`, none is named in the question, and no
  listed employer shares a name word with X (else asked). A language's level on a list ("How would you rate your English
  proficiency?", and a language row's level list) only from a level the person stated: native onto the one native
  option, else the one fluent option; no level, another language, or two candidates: asked. A Websites row's URL takes
  the person's one link (exactly one of LinkedIn/GitHub/website/portfolio, a URL as stated) only when the form has no
  field of its own for that link; one row is added for it. "When could you start?" over spans ("Within 2 weeks") from
  `notice_period` by `bySpan` when no `start_date` is stated: the tightest "within" span that holds it; never a yes/no,
  never a free-text date. "More than N" no longer holds N itself.
- **Ask-once on Workday** (`content.js`, `background.js`): each step's open questions go to `questionsToStore` as on
  every other form, once per step; never a repeating row's part, never the disability form, never a field the page
  already shows a value for.
- `docs/apply/fill-coverage.md` regenerated: A 855 filled (unchanged; one wrong fill removed: Woven's "Limited / No English
  language ability" for a person who gave English without a level, now asked; one gained: Daniels Health "Careers Page"),
  at most 2 left 76 -> 77; B unchanged. The 52-test browser suite passes and its accuracy report (17 forms) is identical
  to trunk's, compared row by row (the suite has one test that fails intermittently on trunk and here alike).
- No existing test was edited. Added: architect WO-048/10..14; browser: email-first sign-in, nested how-heard prompt
  (filled, and left-then-answered by the person), ask-once per step, and zero-wrong runs of spent-s1..s4 that also name
  each tenant's known misses.

### Numbers (`node evals/apply/workday-fill.cjs --tenant tests/fixtures/workday/<t>`; VERIFIED-S on TEST pages; real Workday NOT_RUN)
| Tenant | Coverage (correct / should fill) | On the form incl. Workday's own | Strict | Precision | Wrong | Never-violations | Reached | Submitted |
|---|---|---|---|---|---|---|---|---|
| dev-a | 95.7% (44/46) | 46/46 | 95.2% | 100% (41/41) | 0 | 0 | review | no |
| dev-b | 100% (44/44) | 44/44 | 100% | 100% (42/42) | 0 | 0 | review | no |
| spent-s1 (not blind; was 0/0, stopped at sign-in) | 94.6% (35/37) | 37/37 | 94.1% | 100% (33/33) | 0 | 0 | review | no |
| spent-s2 (not blind; was 68.2%) | 72.7% (32/44) | 43/44 | 70.0% | 100% (29/29) | 0 | 0 | review | no |
| spent-s3 (not blind; was 90.2%) | 95.1% (39/41) | 41/41 | 94.6% | 100% (36/36) | 0 | 0 | review | no |
| spent-s4 (not blind; was 15/16, stopped on page 1) | 100% (44/44) | 44/44 | 100% | 100% (41/41) | 0 | 0 | review | no |

The one row still missed on the spent set: s2's "Are you local to Chicago, IL or willing to relocate?" (two questions in
one; asked, as round 1 decided). s2's other 11 non-Trainee rows are Workday's own resume parse, shown as Workday's.

### Planted defects (one at a time, reverted)
| # | Defect (one line) | Caught by |
|---|---|---|
| P1 | `dom.ts` `emailFirstSignIn`: `return false` | browser "an email-first sign-in ... is never read, filled or clicked" |
| P2 | harness `POPUP`: any `[role=listbox]` (a chosen pill counts as an option) | browser "how the person heard ... nested search prompt"; "zero wrong on spent-s1", "spent-s4" |
| P3 | `answer_options.ts`: `web ?site` back in the careers-site pattern | architect WO-048/14; browser "how the person heard ..."; "zero wrong on spent-s4" |
| P4 | `career_apply.ts`: affiliates guard without the complete-list check | architect WO-048/10 |
| P5 | `answer_options.ts` `levelOption`: the native option no longer preferred | architect WO-048/11; browser "zero wrong on spent-s2", "spent-s4" |
| P6 | `career_apply.ts` `linkEntries`: the form's own LinkedIn field ignored | architect WO-048/12 |
| P7 | `answer_options.ts` `bySpan`: tightest "within" span removed | architect WO-048/13; browser "zero wrong on spent-s3" |
| P8 | `content.js`: repeating-row parts sent to ask-once | browser "Workday's open questions go to ask-once ..." |
| P9 | `background.js`: ask-once kept once per posting, not per step | browser "Workday's open questions go to ask-once ..." |
| P10 | `dom.ts` `sectionKind`: Websites no longer a section | browser "zero wrong on spent-s1", "spent-s3" |

### Still not handled (blunt)
- Real Workday NOT_RUN; everything above is on TEST pages, and the spent numbers are not blind. The email-first page is the
  builder's own guess at that shape; a real tenant's may differ (SSO redirects, a code step).
- "Local to <place> or willing to relocate" is still asked. A start question over dates (not spans) is asked. A person with
  two or more links gets no Websites row. The affiliate rule asks whenever a listed employer shares a name word with the
  tenant (by design: more asks, no guesses).
- The prompt fill still sets the search box's value and fires synthetic events; real Workday may need typed keys.

## Architect review: round 2 on 4 new sealed tenants, scored once (2026-10-20)
A second writer, who never read the extension or the planner, wrote 4 new Workday-shaped TEST tenants (sealed-wd2, sha256
of `tar --sort=name --mtime=@0 --owner=0 --group=0 -cf - t1 t2 t3 t4` = `dbb34180cbc5c4a5...`, checked before the run).
Their key uses a second schema; the first run on round 2's head graded nothing (the harness read no rows), so it measured
nothing and spent nothing. A separate agent then taught the harness the second schema (`wo/048c-harness-schema`,
83c96d0e) from a written description only, never the sealed files; dev-a and dev-b score row for row as before. The
product was not changed between the two runs. Then the 4 tenants were run once. They are now spent.

| Tenant | Pages reached | Coverage (graded rows) | Trainee's precision | Wrong | Never-violations | Why it stopped |
|---|---|---|---|---|---|---|
| t1 | sign-in only | none graded | - | 0 | 0 | the harness timed out waiting for the page after the test person's sign-in |
| t2 | 1 of 6 | 75.0% (12/16) | 9/9 | 0 | 0 | "How Did You Hear About Us?" was asked and the harness did not answer it as the person |
| t3 | 3 of 6 | 47.4% (18/38) | 14/14 | 0 | 1 (harness, see below) | a travel answer the page set itself blocks approval, by design (rule 3); the harness does not clear it as the person |
| t4 | 3 of 6 | 45.7% (16/35) | 12/14 | 2 | 0 | Resume/CV required; the harness did not upload as the person |

What is true, read row by row:
- **One wrong fill is the product's**: on t4 a past job's **Location** took the person's home "Chicago, IL". The key says
  that part is the person's to state (rule 4: a part they never stated is asked). The field's id
  (`workExperience-31--location`) was not read as part of the work-experience section, so the keyword reader filled it
  as the person's own location. Round 3 must make a field inside a repeating section never take a person-level fact.
- **One wrong is unresolved**: t4's how-heard multiselect is graded "Lucerne Careers Website" expected, empty found,
  with Trainee as the source: either the pick did not stick or the new "set" reader misread the pills.
- **The never-violation is the harness's**: the key allows one Websites row (nth 2 is "never"); the adapter computed
  "at most 0" because no nth was marked "fill". Not a product defect.
- **Most "missed" rows are on unreached or unmatched sections**: the key names sections `workExperience`, `education`,
  `languages`, `websites` (no "Section" suffix), which the adapter does not map, and the runs stopped before the person
  could finish each page. These misses are not a measured product coverage; they are unmeasured.
- Product misses that are real: t2's "Have you ever been employed by Proseware Test Inc or one of its subsidiaries?"
  (asked; the person's complete employer list settles it), t3's salary range ($80,000-$99,999 from 95000) and English
  "Native or Bilingual" (the persona gives no level: asked is right by WO-052's rule, the key disagrees).

**Verdict: the 70% Workday target is not shown on independent tenants.** Round 2's numbers stand on dev and spent tenants
only. Round 3: (1) a field inside a repeating section never takes a person-level fact; (2) the harness completes a tenant
as the person (answers what Trainee asks, clears a page-set value, uploads the resume, waits out sign-in) and maps the
section ids above; (3) a new sealed set (sealed-wd3) from a third writer, scored once. Real Workday stays NOT_RUN until a
person is signed in to a real tenant.

## Round 3 (builder, 2026-10-20, branch `wo/048d-workday-r3`)
Evidence: **VERIFIED-S on TEST Workday-shaped pages**; real Workday **NOT_RUN**. No sealed tenant was opened (sealed-wd2's
pages are not in the repo and were not looked for): its failures were reproduced from the review's description above, on
the builder's own TEST pages (`tests/fixtures/workday/sections`, `tests/fixtures/workday/person-r3`, written on dev-a's
page shell). Whether these fixes are what sealed-wd2 needed is unmeasured until a new sealed set (sealed-wd3) is scored.

### What changed
- **Product, zero wrong (`dom.ts`, `career_apply.ts`)**: a repeating section is known by any of its marks: a row is any
  element labelled by a `<Section>-<n>-panel` id (among other ids, with or without `role="group"`); its box is the nearest
  group, region, fieldset, section or Workday `...Section` box; the kind comes from the box's title, else the panel name,
  else Workday's ids (`workExperience-31--location`, `education-7--x`, `educationSection`), else a box above whose own
  title or legend names a section ("Previous Work Experience"). A field in a section but in no row is read as row 0, part
  unknown. The planner (shared): a row-0 field, or any field whose name is Workday's `<section>-<n>--<part>` id with no
  section from the reader, is answered only from the person's own list by its row; with no row it is left (asked when
  required); never the person's city, location, phone, email, name, address, current employer or title, never an answer
  saved under its wording; a row 0 takes none of the person's entries from the real rows. Rows and Add buttons use the
  same detection, so a row without `role="group"` is counted (no duplicate added).
- **Product, a page-set value stays the page's (`content.js`)**: on Workday a press outside an open list no longer counts
  as the person picking the list that still has focus (Workday focuses a list after any pick, the page's own too). Before,
  the person's first click anywhere silently turned a value the page set into "typed by you"; found while building the
  person's page-set step below.
- **Harness (`evals/apply/workday-fill.cjs`)**: schema-2 section ids without "Section" (`workExperience`, `education`,
  `languages`, `websites`) are mapped. The never-add-row limit is (lowest never nth - 1) when no nth says fill (round 2
  said "at most 0" where one Websites row was allowed); with a fill nth it is unchanged. The test person, after the step
  is graded (the order is unchanged), answers from the key where it has the answer (`personAnswerFor`: the expected
  value, a clear where the right state is empty, the TEST resume for a file; otherwise a generic answer as before), with
  real input: a list option by its text, a search prompt by typing the leaf and picking the one result, radios, boxes,
  dates. A field is the person's to answer when its required mark is a "*" in an abbr, Workday's `abbr[title=required]`
  with the star drawn by CSS, an aria-required control, or the key's `required`. While the card still blocks, the person
  answers what it names: a required question still open (by label), a value the page set (changed to the key's answer,
  cleared, or kept as theirs when the key has none). A file goes by a trusted drop, else by "Select files" and the
  browser's chooser. A save Workday refuses gets one retry (the person answers, presses Fill, approves the new card).
  Sign-in: a password with a number and a symbol (`TEST-password-typed-by-the-person-2026!`), custom "I agree" boxes,
  never typing into the application once the click signed them in (a race that typed the email into spent-s1's first
  step during development), and a wait of up to 45 s for a new page or the application shown in place; a sign-in that
  does not let them in is reported with the page's own message. The report lists, per step, how each answer was given
  (`person_gave`: key, generic, TEST resume, cleared, kept).

### Numbers (`node evals/apply/workday-fill.cjs --tenant tests/fixtures/workday/<t>`; VERIFIED-S on TEST pages; real Workday NOT_RUN)
Before = this branch's base (bab13b46), after = this branch; both run here on the same machine.

| Tenant | Coverage before -> after | Strict | Precision | Wrong | Never-violations | Reached | Graded rows identical before/after |
|---|---|---|---|---|---|---|---|
| dev-a | 95.7% (44/46) -> 95.7% (44/46) | 95.2% | 100% (41/41) | 0 | 0 | review | yes (64/64) |
| dev-b | 100% (44/44) -> 100% (44/44) | 100% | 100% (42/42) | 0 | 0 | review | yes (63/63) |
| spent-s1 (not blind) | 94.6% (35/37) -> 94.6% | 94.1% | 100% (33/33) | 0 | 0 | review | yes (68/68) |
| spent-s2 (not blind) | 72.7% (32/44) -> 72.7% | 70.0% | 100% (29/29) | 0 | 0 | review | yes (65/65) |
| spent-s3 (not blind) | 95.1% (39/41) -> 95.1% | 94.6% | 100% (36/36) | 0 | 0 | review | yes (61/61) |
| spent-s4 (not blind) | 100% (44/44) -> 100% | 100% | 100% (41/41) | 0 | 0 | review | yes (72/72) |
| person-r3 (builder's) | stopped at sign-in (timeout) -> 100% (1/1) | 100% | 100% (1/1) | 0 | 0 | review | n/a |

No dev or spent number moved (the spent tenants never had a section shape or a stop of the kinds above). person-r3 is the
harness's own test: before, the run timed out after sign-in (sealed-wd2 t1's error, word for word); after, the person
signs in, picks "Career Fair" on the how-heard prompt Trainee asks, changes the page's "Up to 75%" travel answer to the
key's "Up to 25%", drops the TEST resume the page requires, and the run reaches the review with every row graded before
any of that. On `tests/fixtures/workday/sections` (browser test) the t4 shape is reproduced first (before: a past job's
"Location" took "Chicago, IL", its "Job Title" took the current "Data Analyst", an education "City" took "Chicago", an
"Employer Phone Number" in a "Previous Work Experience" fieldset took the person's phone); after: each row takes its own
job or school from the person's list, every person-level value is gone from the rows, the past job's required location
is asked. `docs/apply/fill-coverage.md` regenerated: unchanged (no field on samples A or B carries Workday's row ids).

Gates: architect 534/534 (`deno test -A --no-check --ignore=tests/architect/pending tests/architect/`); browser
`tests/career-extension-browser.test.cjs` + `tests/workday-key-schema.test.cjs` 62/62, `tests/career-extension-workday.test.cjs`
17/17; `deno run -A extension/build.ts --check` fresh; `python3 scripts/build-router-core.py --career-only --check` verified.
Added (no existing test edited): architect WO-048/15; browser: "a field inside a repeating section never takes a
person-level fact, whatever shape the section has", "the harness's test person completes a tenant ..."; key schema: the
suffix-less section ids and the never limit, `personAnswerFor`.

### Planted defects (one at a time, reverted)
| # | Defect (one line) | Caught by |
|---|---|---|
| R1 | `career_apply.ts`: the row-part name guard removed (`if (f.section)` only) | architect WO-048/15 |
| R2 | `dom.ts`: a row is again only `[role=group][aria-labelledby$="-panel"]` | browser "a field inside a repeating section ..." |
| R3 | `dom.ts`: a field in a section but in no row is no longer marked (the reader-side guard removed) | browser "a field inside a repeating section ..." (Employer Phone Number took the phone) |
| R4 | `career_apply.ts`: a row 0 takes one of the person's entries | architect WO-048/15 |
| R5 | harness: never limit back to rows needed (0 with no fill nth) | key schema "section ids without the Section suffix" |
| R6 | harness: suffix-less section ids unmapped | key schema "section ids without the Section suffix" |
| R7 | harness: the card's page-set values not given to the person | browser "the harness's test person completes a tenant" (card never ready) |
| R8 | harness: the old password without a number | browser "... completes a tenant" (the sign-in's "must contain at least one number", reported) |
| R9 | `content.js`: any press counts as picking the focused list | browser "... completes a tenant" (the page's travel value silently became the person's) |
| R10 | harness: the key's `required` ignored (resume star only on the heading) | browser "... completes a tenant" (Save and Continue refused, also after the retry) |
| R11 | harness: the person ignores the key's answers | key schema `personAnswerFor`; browser "... completes a tenant" |

R1 alone is not caught in the browser: the reader marks the same fields (two layers, each tested on its own).

### Still not handled (blunt)
- Real Workday NOT_RUN; sealed-wd2's own pages were not seen, so the causes fixed are the review's description, rebuilt on
  the builder's pages. t4's unresolved how-heard row (expected "Lucerne Careers Website", found empty, source Trainee) is
  not investigated: nothing here could reproduce it without the sealed page.
- The extension does not read a required mark that is only on a section's heading ("Resume/CV *"): the card is ready
  without the resume and Workday refuses the save (the card says so). The harness's person uploads by the key.
- The in-place sign-in path (the application shown at the same URL) and the one retry after a refused save are coded but
  no green fixture exercises them (R10 exercised the retry, failing).
- Where the key has no answer the person still answers generically (the first option, a TEST text), as in round 2.
- A field that only an ancestor names as a section (a "Previous Work Experience" fieldset) is left even when it is not a
  row part; more asks, no guesses.
