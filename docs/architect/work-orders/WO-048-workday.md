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
