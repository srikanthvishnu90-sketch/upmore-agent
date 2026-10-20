# TEST Workday-shaped fixtures: sources and fidelity notes

These are synthetic, static pages shaped like a signed-in Workday (`*.myworkdayjobs.com`) candidate application.
They are not captures of any real site. Company names (Northwind / Contoso / Fabrikam / Tailspin / Woodgrove /
Litware "Test" ...) are fictional. Every page has `(TEST Workday-shaped page)` in its `<title>` and a visible banner.
The pages make no network requests (no `src`, `href` or `url()` anywhere; checked).

Research date: 2026-10-20. Nothing here came from logging into Workday. All evidence is public open-source code or
notes. Several of those notes describe live observations made in 2026.

## Sources

| # | URL | What it shows | Strength |
|---|-----|---------------|----------|
| S1 | https://github.com/Rayhypertyper/Scout/blob/HEAD/docs/workday-investigation.md and `tests/fixtures/browserHelperWorkday/{mercer,semtech}-*.json` in the same repo | Detailed sanitized observations of two live tenants (Mercer University, Semtech), dated 2026-10-08/09. Covers: sign-in/create-account controls; the progress bar; every My Information control; My Experience rows (ids, labels, required flags, spinbuttons, Add/Delete); Field of Study catalog popup; languages; websites; resume upload; Application Questions (button listbox, fieldset/legend, zero-size nameless inputs, textareas, exact option lists); Voluntary Disclosures; Review wrapper; footer buttons | **Strongest**. Current DOM, live, 2026 |
| S2 | https://github.com/chetaniitbhilai/Workday_Automater/blob/HEAD/workday_form_fields.txt | A dump of live My Information field ids: `source--source`, `previousWorker--candidateIsPreviousWorker`, `country--country`, `name--legalName--firstName/lastName/firstNameLocal/lastNameLocal`, `name--preferredCheck`, `address--addressLine1/city/postalCode`, `phoneNumber--phoneType/countryPhoneCode/phoneNumber/extension` | Strong (current DOM) |
| S3 | https://github.com/mrbam88/bamware-ai/blob/HEAD/skills/ats-playbooks/SKILL.md | Notes from 5 live tenants (2026-09-21): `address--addressLine2`, `address--countryRegion`, `address--regionSubdivision1` (county); random row indexes (`workExperience-46--jobTitle`); suffixes `--companyName --location --startDate-dateSectionMonth-input --roleDescription --schoolName --degree --fieldOfStudy --lastYearAttended-dateSectionYear-input --url`; `skills--skills`; `socialNetworkAccounts--linkedInAccount`; `pageFooterNextButton`; `add-button`; `Websites-section`; `promptLeafNode`/`selectedItem` pills; veteran wording that varies by tenant; disability date typed as MMDDYYYY | Strong (live, 2026) |
| S4 | https://github.com/privacydied/job-application-skill/blob/HEAD/sites/myworkdayjobs/NOTES.md | `formField-source` is a required multiselect (`promptOption`); "0 items selected"; `formField-candidateIsPreviousWorker` radios with `value=true/false` and no option text on the input; inline errors read `Error: The field <label> is required…`; `pageFooterNextButton` = Save and Continue; `signInSubmitButton`; `beecatcher` honeypot; `workExperience-<N>--startDate-dateSectionMonth-input` | Strong (live) |
| S5 | https://github.com/lakshinkhurana/workday-automation/blob/HEAD/mapping.py | `personalInfoUS--gender/--ethnicity/--veteranStatus`, `personalInfoPerson--gender`, `termsAndConditions--acceptTermsAndAgreements`, `selfIdentifiedDisabilityData--name`, `…--dateSignedOn-dateSection{Month,Day,Year}-input`, `address--regionSubdivision1`, plus example question wording | Medium |
| S6 | https://github.com/gndpwnd/discovery-oasis/blob/HEAD/form_autofill_llm/self_identify.json | Self Identify (CC-305) fields: `selfIdentifiedDisabilityData--disabilityForm` (Language), `--name`, `--employeeId`, `--dateSignedOn`, `--disabilityStatus` as 3 checkboxes with ids `<wid>-disabilityStatus` and exact labels. Choosing one disables the others | Medium-strong (extracted from a live page) |
| S7 | https://github.com/RohitVarmaSixtyFive/jobauto/blob/HEAD/src/disability_page.py | `selfIdentifiedDisabilityData--dateSignedOn-dateSection{Month,Day,Year}-input`, `pageFooterNextButton` | Medium |
| S8 | https://github.com/elvisxd/pagemycv/blob/HEAD/docs/09-ats.md | Account ids (`email`, `password`, `verifyPassword`, `createAccountLink`, `createAccountCheckbox`, `createAccountSubmitButton`, `signInSubmitButton`, `verificationCode`); wizard ids (`applyFlowPage`, `progressBar`, `pageFooterNextButton`); a `formField-*` list including `formField-disabilityStatus`, `formField-dateSignedOn`, `formField-name`, `formField-acceptTermsAndAgreements`; `beecatcher` and `website` honeypots | Medium |
| S9 | https://github.com/DIodide/sower/blob/HEAD/apps/worker/src/workday/selectors.ts | `signInSubmitButton`; `signInLink`; `createAccountLink`; `click_filter` (a wrapper div over the real button, per their check on a live tenant); next button `pageFooterNextButton` with legacy `bottom-navigation-next-button`; `progressBarActiveStep`; the step list including "Self Identify" | Medium |
| S10 | https://github.com/kitfunso/jobie-agent/blob/HEAD/extension/content/workday-selectors.js | Lines marked "verified" against a live tenant: the `progressBarActiveStep` text, `formField-*` wrappers (the control carries no automation id), `pageFooterNextButton` reads "Save and Continue", `<abbr>*</abbr>` required marker, `formField-linkedInAccount`, `selectedItemList`/`selectedItem`. Also lists page wrappers `applyFlowMyInfoPage`, `myExperiencePage`, `voluntaryDisclosuresPage`, `selfIdentificationPage`, plus `errorMessage`/`errorHeading`, `jobPostingHeader`, `locations` | Medium (mixed verified and legacy) |
| S11 | https://github.com/ChrisMBarr/UserScripts/blob/HEAD/src/autofill-myworkdayjobs-resume.user.js | **Legacy** DOM (pre-~2024): `legalNameSection_firstName`, `countryDropdown`, `addressSection_*`, `phone-device-type`, `phone-number`, `workExperience-N` blocks, `dateSectionMonth-input`/`dateSectionYear-input` driven by ArrowUp/ArrowDown, `languageProficiency-0..4`, `websitePanelSet-N`, `bottom-navigation-next-button`, `header`, button dropdowns opening `li` lists | Legacy only |
| S12 | https://github.com/rpeng220/kaleidoscope/blob/HEAD/workday.js | Legacy: `email`, `password`, `verifyPassword`, `createAccountCheckbox`, `click_filter`, `dateInputWrapper`, aria-labels "Add Work Experience" / "Add Another Work Experience", `multiselectInputContainer`, `searchBox`, `data-automation-label` | Legacy |
| S13 | https://github.com/ubangura/Workday-Application-Automator/blob/HEAD/apply.js | `utilityButtonSignIn`, `signInSubmitButton`, `formField-schoolItem`, `formField-field-of-study`, `formField-gradeAverage`, `formField-firstYearAttended` | Medium/legacy |
| S14 | https://github.com/raghuboosetty/workday/blob/HEAD/workday.py | `createAccountLink`; `div[role=button][data-automation-id=click_filter][aria-label="Sign In"/"Create Account"]`; `button[data-automation-id=errorBanner]` | Medium |
| S15 | https://github.com/Jamalfox85/application-autofiller/blob/HEAD/src/utils/siteRules/workdayFields.ts | `promptOption`, `promptLeafNode`, `menuItem`, `data-automation-label`, `promptSelectionLabel`, category markers (`promptOptionMore`, `.wd-icon-chevron-right-small`), `signInLink`, `createAccountLink` | Medium |
| S16 | https://github.com/SuryaThirukonda/autobot/blob/HEAD/autobot/configs/workday.json | `formField-*` fallbacks (`formField-countryRegion`, `formField-phoneType`, `formField-countryPhoneCode`, `formField-jobTitle`, `formField-company`, `formField-location`, `formField-currentlyWorkHere`); `workExperienceSection` + `add-button`; `promptOption`/`promptLeafNode` | Medium |
| S17 | https://github.com/AbhishekMandapmalvi/AutoApply/blob/HEAD/bot/apply/workday.py ; https://github.com/ashishdev19/AIJobFill/blob/HEAD/frontend/src/content/workday/selectors.js | `signIn-email`/`signIn-password` (older), `thankYouMessage`; `signInContent`, `createAccountContent`, `errorBanner`, `errorHeading`, `errorMessage`, `inputAlert` | Weak-medium |
| S18 | https://github.com/silentashish/huntgry/blob/HEAD/src/shared/autofill/workday-sections.ts | `workExperienceSection`/`educationSection`/`websiteSection`, `formField-skills`, `dateInputWrapper` with `dateSection{Month,Day,Year}-input`, disability checkboxes in `formField-disabilityStatus`, nav areas `pageFooter`/`bottom-navigation*` | Weak (partly built against their own mock) |
| S19 | https://docs.nexthink.com/platform/user-guide/adopt/guide-creation-and-management-from-nexthink-applications/configuring-adoption-settings/use-case-element-selectors-for-workday | Workday's custom attributes are `data-automation-id`, `data-uxi-element-id`, `data-uxi-widget-type` | Vendor doc |
| S20 | https://github.com/aidanobrien5599/smartpaste/blob/HEAD/extension/test/fixtures/workday-pwc.html | A mock, not a capture. It says open popups carry `data-automation-activepopup="true"` | Weak |

## Where sources disagree, and what I chose

- **Two DOM generations.** Older scripts (S11–S13) use bare ids such as `legalNameSection_firstName`, `phone-number` and
  `bottom-navigation-next-button`. Every 2026 live source (S1–S4, S10) shows the current shape instead: the control id is
  `<widget>--<field>` (e.g. `name--legalName--firstName`), the wrapper is `formField-<field>`, the control itself carries
  no automation id, and the footer is `pageFooterNextButton`. **All fixtures use the current shape.** Legacy ids appear
  nowhere. Workday is one multi-tenant SaaS release, so legacy tenants should not exist today.
- **Next and Submit.** S1 and S10 say Review's Submit is the same `pageFooterNextButton` with the text "Submit". S9
  guesses a separate `pageFooterSubmitButton`. I chose `pageFooterNextButton` with the text "Submit".
- **"How Did You Hear About Us?"** appears as a search prompt with pills on Mercer (S1, S4) and as a single button listbox on
  Semtech (S1). Both shapes are used, and the prompt version appears as both a flat list and a category tree (S3, S15).
- **Email on My Information.** S1 saw it as read-only text, while S10 and S16 treat `formField-email` as an input. Both
  appear: dev-b and s4 have an input, the other tenants show text.
- **Prompt filtering.** S1 says typing alone did not filter the Field of Study catalog and Enter was needed. The brief
  asked for filtering on typing, so these pages filter on typing **and** on Enter.
- **Button listbox options.** S1 sees `ul[role=listbox] > li[role=option]` with a disabled "Select One" in
  questionnaires. S15 and S20 say `li > div[promptOption]`. I chose `li[role=option] > div` (text only). The questionnaire
  placeholder is disabled. Elsewhere "Select One" can be chosen and clears the value.
- **errorBanner.** S14 has it as a `button`, S17 as an id only. I render a `div[role=alert]` containing
  `h3[data-automation-id=errorHeading]` "Errors Found", and put inline `[data-automation-id=errorMessage]` text in each
  field (S4 wording).

## Automation ids and element ids used, with support

Current-shape element ids: `source--source` (S1,S2,S3), `previousWorker--candidateIsPreviousWorker` (S2; radios named
`candidateIsPreviousWorker`, S1,S4), `country--country` (S1,S2), `name--legalName--firstName/lastName` (S1,S2,S3),
`name--preferredCheck` and `name--preferredName--firstName/lastName` (S1,S2), `address--addressLine1/city/postalCode`
(S1,S2,S3), `address--addressLine2` (S3), `address--countryRegion` (S1,S3,S5), `address--regionSubdivision1` (S3,S5),
`phoneNumber--phoneType/countryPhoneCode/phoneNumber/extension` (S1,S2,S3), `workExperience-N--jobTitle/companyName/location/currentlyWorkHere/startDate/endDate/roleDescription`
(S1,S3), `…--startDate-dateSectionMonth-input` (S3,S4), `education-N--schoolName/degree/fieldOfStudy/gradeAverage`
(S1,S3), `education-N--lastYearAttended-dateSectionYear-input` (S3), `language-N--language/native` (S1),
`webAddress-N--url` (S1), `skills--skills` (S3), `socialNetworkAccounts--linkedInAccount` (S3), `resumeAttachments--attachments` (S1),
`primaryQuestionnaire--<opaque>` (S1), `personalInfoUS--gender/hispanicOrLatino/veteranStatus` (S1,S5),
`personalInfoUS--ethnicity` (S5), `termsAndConditions--acceptTermsAndAgreements` (S1,S5),
`selfIdentifiedDisabilityData--disabilityForm/name/employeeId/dateSignedOn` and `<wid>-disabilityStatus` (S5,S6,S7),
`<wid>-ethnicityMulti` race checkboxes (S1), sign-in inputs with generated ids `input-N` (S1).

`data-automation-id` values: `formField-*` wrappers (S1,S8,S10,S16); `multiSelectContainer`, `multiselectInputContainer`,
`searchBox`, `selectedItemList`, `selectedItem`, `promptSelectionLabel`, `DELETE_charm`, `menuItem`, `promptOption`,
`promptLeafNode`, `promptIcon`, `promptSearchButton`, `activeListContainer` (S1,S3,S4,S15); `dateInputWrapper`,
`dateSectionMonth/Day/Year`, `dateSectionMonth/Day/Year-input` (role=spinbutton, aria-valuemin/max), `dateIcon`
(S1,S11,S12,S18); `add-button` (S1,S3,S16); `workExperienceSection`, `educationSection` (S16,S18);
`attachments-FileUpload`, `file-upload-drop-zone`, `select-files`, `file-upload-input-ref`, `file-upload-item`,
`file-upload-item-name`, `file-upload-successful`, `delete-file`, `ariaLive`, `ariaLiveMessage` (S1);
`progressBar`, `progressBarActiveStep` (S1,S9,S10); `applyFlowPage` (S8); `applyFlowMyInfoPage`, `myExperiencePage`,
`voluntaryDisclosuresPage`, `selfIdentificationPage` (S10); `applyFlowReviewPage` (S1); `pageFooterNextButton`,
`pageFooterBackButton` (S1,S3,S4); `pageFooter` (S18); `errorHeading`, `errorMessage` (S10,S17); `errorBanner` (S14,S17);
`thankYouMessage` (S17); `header` (S11); `jobPostingHeader`, `locations` (S10); `email`, `password`, `verifyPassword`,
`createAccountCheckbox`, `createAccountSubmitButton`, `signInSubmitButton`, `createAccountLink`, `signInLink`,
`forgotPasswordLink`, `beecatcher`, `click_filter` (S1,S8,S9,S14); `signInContent`, `createAccountContent` (S10,S17).

### ASSUMED (no source, or extrapolated by analogy)

- `progressBarCompletedStep`, `progressBarInactiveStep`: S1 says inactive items show only "step N of M". Their
  automation ids are invented, and so are the visible step labels on inactive items.
- `primaryQuestionnairePage`: the wrapper for the Application Questions page.
- `data-automation-widget="wd-popup"` on button-listbox popups, and `data-automation-activepopup="true"` (the latter is from a mock, S20).
- `referral--referralName` / `formField-referralName`: the conditional referral-name field.
- `emailAddress--emailAddress`: the email input id. `formField-email` itself is cited by S10 and S16.
- `formField-preferredCheck`, `formField-country`, `formField-language`, `formField-native`, `formField-schoolName`,
  `formField-degree`, `formField-fieldOfStudy`, `formField-companyName`, `formField-roleDescription`,
  `formField-employeeId`, `formField-disabilityForm`, `formField-regionSubdivision1`: these follow the observed
  `formField-<name>` convention, but no source shows them exactly. S16 has `formField-company`, and S13 has
  `formField-field-of-study` and `formField-schoolItem`.
- `education-N--firstYearAttended` (by analogy with `--lastYearAttended`, S3).
- `education-N--school`: the school-as-search-prompt variant (s4 only).
- `coverLetterAttachments--attachments` (s4 only).
- `personalInfoUS--sexualOrientation` / `formField-sexualOrientation` (s3 only).
- Language proficiency buttons use opaque ids `language-N--<32hex>` and `formField-<32hex>`. S1 says these ids are
  opaque, so the exact form is invented.
- Review summary section ids such as `my-information-section`. S1 saw different names, e.g. `source-section`.
- The class `css-wdval` on the zero-size hidden value input after each dropdown button. S1 confirms zero-size,
  nameless text inputs exist; the class name is invented.
- `data-uxi-widget-type="multiselect"`: S19 confirms the attribute, but the value is a guess.
- Questionnaire **radio**, **checkbox-group** and **date** question renderings (`primaryQuestionnaire--<id>` used as the
  radio name, `<wid>-primaryQuestionnaire--<id>` checkbox ids, `primaryQuestionnaire--<id>-dateSection*-input`). S1
  observed only button and textarea questions. S3 mentions checkbox questions.

## Behaviour modelled (inline JS, no network)

- Button dropdowns open a body-level `ul[role=listbox]`. Mouse, Arrow keys, Enter/Space, Escape and type-ahead all work.
  Choosing an option sets the button text, the hidden value input and `aria-label` ("State Illinois Required").
- Prompts: click or focus opens the top level, typing filters the leaves, Enter searches, and categories drill down
  with a Back row. A leaf adds a pill (single-select replaces the pill, multi-select appends). The `DELETE_charm` removes a pill.
- Date spinbuttons accept digits and auto-advance (so `062022` fills MM and YYYY). ArrowUp/Down step the value; an empty
  year jumps to the current year. Month and day are zero-padded on blur.
- Sections start with **Add**. After the first row it becomes **Add Another**. Rows get `Work-Experience-N-panel` labels and
  ids that use a tenant-specific, non-sequential index. Delete renumbers the rows. "I currently work here" hides **To**. The
  dev-b rows are pre-rendered and empty; the s2 rows are pre-filled the way resume parsing leaves them, including
  wrong values the user must fix.
- **Save and Continue** checks the required fields that are visible. If any are empty it shows "Errors Found" and inline
  errors and stays on the page; otherwise it saves a summary to `sessionStorage` and goes to the next file.
  **Back** goes to the previous file. Review renders the saved summary, and **Submit** sets `window.__submitted = true`
  and shows "Application Submitted".
- Sign-in (s1 `0-sign-in.html`) covers the real button with a `click_filter` overlay, which is realistic. It has
  Create Account / Sign In views, a `beecatcher` honeypot in each view, and a password-match check.
- Conditionals: the referral name appears only when the referral option is chosen. The preferred-name fields appear
  only when their box is checked. Self Identify's disability checkboxes are mutually exclusive.

## Persona used for every key.json

Test Person: legal first "Test", last "Person"; test.person@example.test; +1 555 010 0000 (US, mobile); 1 Example St,
Chicago, IL 60601, United States. Jobs: Example Analytics, Data Analyst, since 06/2022, current; Sample Retail, Sales
Associate, 01/2020–05/2022. Education: Example State University, Bachelor's, Statistics, graduated 05/2022, GPA 3.6.
Speaks English (native). LinkedIn https://www.linkedin.com/in/test-person. Authorized to work in the US: yes. Needs
sponsorship: no. Over 18: yes. Willing to relocate: no. Notice period: 2 weeks. Salary expectation: 95000 USD. Heard
about the job from the company website. Not referred. Never worked for the tenant. EEO: declines to self-identify,
filled only where a decline option exists, otherwise "never". Disability form: "never". Passwords: "never". Essays: "ask".
Anything else the persona does not settle: "ask".

Judgement calls a scorer should know about:
- Optional Address Line 2 and Phone Extension, and an unchecked "I have a preferred name", are marked `fill` with the
  empty or false state as the correct answer. The persona settles them by omission.
- "Corporate Website", "Career Site", "<Company> Careers Website" and "Litware Careers Website" count as "Company website".
- Degree lists that split Bachelor of Arts from Bachelor of Science (s1, s4) are `ask`. A list with a generic
  Bachelor's option is `fill`.
- Some questions are `ask` because the persona does not settle them: work authorization that asks citizen vs permanent
  resident (s4), "Are you a U.S. citizen?" (s2), and availability dates (the persona gives only a notice period).
- s2 asks "Are you local to Chicago, IL or willing to relocate?" for a Chicago job. The persona lives in Chicago, so
  this is `fill` "Yes".
- Gender "Not declared" (s1) is treated as the decline option.
- Terms, certification checkboxes and dropdowns, and the sign-in email are `ask`. Sign-in email is `ask` because the
  Workday account login is the user's own, and the persona's contact email is not necessarily that account.

## How close is this to the real thing? (honest)

- **Close:** the control ids, wrapper ids, widget kinds (button + listbox, search prompt with pills, spinbutton dates,
  native radios and checkboxes, fieldset/legend questions), the labels, the option lists for EEO and veteran questions,
  the footer ids, the honeypot, the `click_filter` overlay, the order of steps, and the Errors Found validation.
- **Not close:** Workday is a React SPA on one route (`/apply/applyManually`), and these fixtures are 6–7 separate files.
  Real dropdown and prompt popups live in a shared portal with virtualized lists and animation, and some tenants need
  trusted (real) clicks. Real Workday saves drafts on the server, uses session expiry and `aria-activedescendant` focus
  management, and has many more styling and accessibility details. Here, synthetic `.click()` and `.value=` plus
  `input` events are enough, so the fixtures are **easier** than real Workday. A builder that passes here can still fail
  live. Row-panel heading ids, the zero-size hidden input, and several wrapper ids are approximations (see ASSUMED).
- **Not verified against a live tenant by me.** Every id comes from third-party public code or notes, mostly written
  in 2026.
