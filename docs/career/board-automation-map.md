# Board Automation Map — CA-03 real-board apply seam

Product research for the career apply engine (modules 149 + 150), gathered
2026-10-13/14 by loading real application entry pages through the same
Playwright stack the driver uses. No personal data, no accounts created,
no applications submitted during this research. Facts are labeled
**[probed]** (observed live in this session) or **[vendor flow]**
(the board's documented/standard candidate flow, not driven here).

Driver posture key: module 150's host gate allows only Greenhouse, Lever,
Ashby, SmartRecruiters (+ localhost test pages). Everything else is
refused at the driver with DRIVER_HOST_REFUSED until its own seam lands.

## The four no-account hosted boards (submit-lane priority)

### Greenhouse — job-boards.greenhouse.io
- Account required to apply? **No.** [probed] The application form is
  embedded directly on the posting page (48 form fields observed on a
  live intern posting at Aquatic Capital Management).
- SSO options? None for candidates. [probed: no sign-in surface at all]
- Email verification to apply? None. [probed]
- Captcha? No captcha technology detected on the probed tenant's page.
  Some tenants enable invisible reCAPTCHA risk scoring; if a visible
  challenge ever appears, the driver stops (§6.3) — see "Captcha
  handoff" below.
- Driver posture: **allowed** — driven live against a real posting
  (Aquatic, 2026-10-14): 34 fields analyzed, 9 filled from confirmed
  facts including the resume upload; the run stopped at `awaiting_user`
  on this employer's 24 custom/education questions, each enumerated as
  an ask — nothing invented (evidence:
  docs/career/evidence/portal-doorstep/greenhouse/).

### Lever — jobs.lever.co
- Account required to apply? **No.** [probed] The /apply URL is the form
  itself (60 fields observed on Lever's own demo/training tenant,
  including a voluntary demographic survey section).
- SSO options? None on the probed tenant. Some tenants enable
  autofill-from-LinkedIn; Upmore never uses it (it would be the user's
  own data pasted by hand instead). [vendor flow]
- Email verification to apply? None. [probed]
- Captcha? **hCaptcha is loaded on the apply page** [probed: script +
  widget present]. It is risk-based — most sessions never see a
  challenge; if one renders visibly, the driver stops with
  CAPTCHA_HANDOFF + screenshot_ref.
- Driver posture: **allowed** — driven live (2026-10-14): the demo
  tenant presents a visible hCaptcha challenge at open, and the run
  stopped with CAPTCHA_HANDOFF and a real captured `screenshot_ref`
  (evidence: docs/career/evidence/portal-doorstep/lever/).

### Ashby — jobs.ashbyhq.com
- Account required to apply? **No.** [probed] The application lives at
  /<company>/<job-id>/application and renders client-side (React SPA —
  fields appear after hydration; the driver waits for them).
- SSO options? None for candidates. [probed]
- Email verification to apply? None. [probed]
- Captcha? No captcha technology observed on the probed tenant.
- Driver posture: **allowed** — doorstep-proven live (Docker posting,
  2026-10-14): `prepared` at the final review with the exact
  would-submit payload snapshot whose sha256 recomputes from the
  committed snapshot, zero fill failures, zero submits (evidence:
  docs/career/evidence/portal-doorstep/ashby/).

### SmartRecruiters — jobs.smartrecruiters.com
- Account required to apply? **No account at entry.** [probed] The
  posting page carries no sign-in, no create-account surface, and no
  password field; applying starts from the posting's "I'm interested"
  call-to-action. SmartRecruiters may offer the candidate an account
  *after* an application to track it — optional, never required to
  submit. [vendor flow]
- SSO options? None observed at entry. [probed]
- Email verification to apply? None observed at entry. [probed]
- Captcha? No captcha technology observed at entry. [probed]
- Driver posture: **allowed**. Note for the driver: this family's apply
  CTA is worded "I'm interested" — the helper's apply-control matcher
  covers it (including the curly-apostrophe rendering "I’m interested").

### Constellation — constellation.jobs / constellation.com / constellation.io (MI-098)
- What it is: Anthropic's recruiting partner for the Fellows Program
  (fellowship census 2026-10-15 §1). The Greenhouse posting for the
  Fellows Program is a POINTER, not the application — its own text says
  applicants "will not be considered" without the separate Constellation
  form. Module 149 enforces that as code: a pointer posting stops
  CONSTELLATION_FORM_REQUIRED unless it carries the Constellation form
  URL, in which case the run drives THAT form, never the shell.
- Account required to apply? Not observed in any published material
  [census]; the exact tenant host and field list are NOT published (the
  only published link is a shortlink), so fields are read at drive time
  through module 150 — nothing about the live form is assumed here.
- Driver posture: **allowed** (MI-098, branch work/mi098-constellation) —
  host gate in 149 + 150 + the helper's navigation gate; doorstep proven
  tier-2 over a captured-form fixture (tests/career-constellation-portal
  .test.cjs 9/9 + tests/career-constellation-browser.test.cjs). No live
  Constellation form has been driven and nothing has been submitted
  through this family; the Anthropic Fellows application itself remains
  the owner's self-submit (deadline Oct 18, 2026).

### Tally — tally.so (MI-099)
- What it is: the form platform carrying the a16z Academy Fellowship's
  Stage 1 application (fellowship census 2026-10-15 §10; EARLY deadline
  Nov 5, 2026). Stage 1 materials per the program's own FAQ: contact
  information, a link to a personal portfolio website, an essay, a
  short video, test scores if any, and a high-school transcript.
- Account required to apply? None observed in the census [census]; the
  exact form path/ID is not staged anywhere in this repo — fields are
  read at drive time through module 150, and nothing about the live
  form is assumed here. Tally custom domains (a tenant's own domain)
  are NOT covered: they classify UNTESTED_ATS_HOST and are refused
  until a tenant domain is individually verified.
- Owner-only material, by design: the essay is the owner's own writing
  (the program's AI policy allows AI to move faster, not to write for
  the applicant), and the short video + transcript are owner-supplied
  artifacts. All three stay asks and are never invented; the portfolio
  link and test scores fill only from confirmed facts.
- Driver posture: **allowed** (MI-099, branch work/mi099-tally) — host
  gate in 149 + 150 + the helper's navigation gate; doorstep proven
  tier-2 over a captured-form fixture (tests/career-tally-portal
  .test.cjs 9/9 + tests/career-tally-browser.test.cjs). No live Tally
  form has been driven and nothing has been submitted through this
  family.

### FormAssembly — *.tfaforms.net / *.tfaforms.com / formassembly.com (MI-100)
- What it is: the hosted form platform behind Emergent Ventures
  (Mercatus Center, George Mason University; fellowship census
  2026-10-15 §12). The live application is a tenant form —
  https://mercatus.tfaforms.net/5099527 — rolling, no deadline.
- **⛔ AI policy printed on the form itself:** Emergent Ventures no
  longer accepts AI-written applications and tests submissions for
  them. The 1,500-word proposal is the owner's own writing, always:
  module 149 stages it as a free_text owner ask that fills ONLY from
  the owner's own confirmed draft — the product organizes facts +
  outline only, and never invents proposal text (guarded by
  tests/career-formassembly-portal.test.cjs F2/F2b/F2c).
- Account required to apply? None observed on the live form [census].
  Fields are read at drive time through module 150 — the sandbox
  board's field set is staged from the census summary (basic
  questions = FACT; region affected + funding area = owner decisions;
  proposal = owner writing; supplementary attachments allowed, PDFs
  not accepted per the census).
- Driver posture: **allowed** (MI-100, branch work/mi100-formassembly) —
  host gate in 149 + 150 + the helper's navigation gate, end-anchored
  so lookalikes (tfaforms.* on another registrable domain) stay
  refused; doorstep proven tier-2 over a captured-form fixture
  (tests/career-formassembly-portal.test.cjs 9/9 +
  tests/career-formassembly-browser.test.cjs). No live FormAssembly
  form has been driven and nothing has been submitted through this
  family.

### Google Forms — docs.google.com/forms/… (MI-101)
- What it is: the hosted form platform behind Z Fellows (fellowship
  census 2026-10-15 §13). The live application — "Z Fellows – 2026
  cohorts" — is a Google Form linked from zfellows.com, rolling, no
  deadline. The form is short and fact-heavy: FACT fields (email,
  name, company-or-project, birthday, phone, technical?, previously
  applied?, based, school/work, website/links, achievements) plus
  short essays capped at ~500 characters, and an optional 1-minute
  intro video.
- **Path-precise gate:** the family is ONLY a docs.google.com URL
  under `/forms/` — the same host serves Docs, Sheets and Drive,
  which are not application forms and stay refused
  (UNTESTED_ATS_HOST); the helper's hop gate allows the docs.google.com
  host and module 150's final-URL gate additionally requires the
  /forms/ path on every landing. forms.gle shortlinks are not
  classified — a drive needs the resolved /forms/ URL in hand.
- **Owner-answer law for this form:** the company-or-project name is
  a DECISION (Trainee or Sporv — the owner's Phase 2 call), Birthday
  is a required fact NOT in the fact bank (Phase 2), and every
  short-answer/essay field fills ONLY from the owner's own confirmed
  draft — the packet assembles from confirmed facts + his approved
  short answers, never invented text (guarded by
  tests/career-googleforms-portal.test.cjs F2/F2b/F2c/F3). The form
  carries no resume upload and no attestation checkbox.
- Terms nuance (census): the $10K is optional and is an investment
  (converting at the next priced round at a $1B cap), not a grant.
- Driver posture: **allowed** (MI-101, branch work/mi101-google-forms) —
  host+path gate in 149 + 150 + the helper's navigation gate;
  doorstep proven tier-2 over a captured-form fixture
  (tests/career-googleforms-portal.test.cjs 9/9 +
  tests/career-googleforms-browser.test.cjs). No live Google Form
  has been driven and nothing has been submitted through this family.

### Neo Residency — portal.neo.com/residency (Bubble app) (MI-102)
- What it is: Neo's bespoke application portal (fellowship census
  2026-10-15 §5). The current cycle is **Winter 2027** — up to 20
  startups + student teams, 3 months based at Neo's SF workspace with
  a 2-week bootcamp (the current page says Texas). Terms: startups —
  $750K uncapped SAFE + participation rights up to 5% of the next
  equity round; students — $40K grants each + $100K+ in credits.
- **Deadline/fields: NOT captured.** The application runs in Neo's
  own portal, a JavaScript (Bubble) app whose form content does not
  render in a text fetch — application status, deadline, and field
  list are a recorded census gap, not guessed. The live portal's
  fields are read at drive time through module 150; the sandbox
  board's field set is staged from the census summary only
  (identity/contact/education/resume = FACT; work-authorization/
  sponsorship screening; the startup-vs-student applicant track is
  the applicant's own choice and stays an ask until confirmed; the
  project description and why-Neo fields are free-text owner asks
  that fill only from the owner's own confirmed draft — never
  invented).
- Driver posture: **allowed** (MI-102, branch work/mi102-neo-bubble) —
  host gate in 149 + 150 + the helper's navigation gate, end-anchored
  so lookalikes (neo.* on another registrable domain) stay refused;
  doorstep proven tier-2 over a captured-form fixture
  (tests/career-neo-portal.test.cjs 9/9 +
  tests/career-neo-browser.test.cjs). No live Neo form has been
  driven and nothing has been submitted through this family; the
  live doorstep proof (with the field list captured at drive time)
  remains owed.

## Fellowship program-site forms (MI-103)

### Thiel Fellowship — thielfellowship.org (account-gated)
- What it is: the Thiel Fellowship application — a bespoke account-gated
  web application on thielfellowship.org (fellowship census 2026-10-15
  §3). The program is OPEN, rolling, with no deadline; $250,000 over two
  years, no equity taken; enrolled students may apply but must drop out
  or defer to ACCEPT — that decision is the owner's alone.
- Account required to apply? **Yes — and the account step is the
  owner's, full stop.** Applicants register with an email + password,
  then complete the application in stages inside the account.
  Registering an account, signing in, or handling a password is an
  owner-credential action: **no drive may perform it, ever.** The seam
  therefore carries the wall as a typed stop: any landing that is not
  the in-account application (a visible password field on the page,
  reported by the helper as an account wall) stops the run with
  **ACCOUNT_WALL_OWNER_HANDOFF** and a handoff URL — no form is read, no
  field is filled, no credential is typed, no sign-in or create-account
  control is clicked. The owner creates / signs into the account in his
  own session; only then may the drive run, on the in-account form.
- Fields: not readable without an account [census]. The sandbox board's
  field set is staged from the census §3 summary only (its secondary
  walkthrough list: name, date of birth, hometown, current location,
  project/company name + URL, LinkedIn, previous projects, and short
  written answers about the project); the live form's fields are read at
  drive time through module 150. Date of birth and hometown are NOT in
  the fact bank (census Phase 2) — a drive without confirmed values for
  them waits honestly and never invents. The project/company name fills
  only from a confirmed answer (which project is the owner's decision);
  the written answers fill only from the owner's own confirmed draft —
  never invented; attestations are explicit-only.
- Driver posture: **allowed for the in-account form only** (MI-103,
  branch work/mi103-thiel) — host gate in 149 + 150 + the helper's
  navigation gate, end-anchored to thielfellowship.org so lookalikes
  stay refused; the in-account doorstep and the account-wall stop are
  proven tier-2 over captured-form fixtures
  (tests/career-thiel-portal.test.cjs +
  tests/career-thiel-browser.test.cjs). **No live Thiel form has been
  driven, no account has been created, and nothing has been submitted
  through this family. The live in-account doorstep proof remains owed
  until the owner creates the account himself.**

## Bespoke program-site fellowship forms (MI-104)

One family class — a fellowship program's own site form — with two
instances whose hosts and field sets genuinely differ, so each carries
its own family in the seam (`eightvc`, `kleinerperkins`). Both entries
are staged from the fellowship census 2026-10-15 (§8 / §7); neither
census published an exact field list, so fields are read at drive time
through module 150 and the sandbox boards stage the census summaries.

### 8VC Fellowship — 8vc.com (Webflow)
- What it is: the 8VC Fellowship application form on 8VC's own site
  (census 2026-10-15 §8). A 3-month summer internship placing
  undergraduate students (sophomore through graduating senior) as
  engineers at 8VC portfolio startups; one application covers dozens
  of companies; Engineering + Design pathways; fellows are paid by the
  host company, with a partial housing stipend.
- Deadline: rolling admission **until late January** — the official
  page publishes no exact day/time [census].
- Account required to apply? None observed in the census. Fields are
  read at drive time — the sandbox board's field set is staged from
  the census summary (identity/contact/education/resume = FACT;
  work-authorization/sponsorship screening; the Engineering/Design
  pathway is the applicant's own choice and stays an ask until
  confirmed; the project description and why-8VC fields are free-text
  owner asks that fill only from the owner's own confirmed draft —
  never invented).
- Driver posture: **allowed** (MI-104, branch work/mi104-bespoke-sites) —
  host gate in 149 + 150 + the helper's navigation gate, end-anchored
  so lookalikes (8vc.* on another registrable domain) stay refused;
  doorstep proven tier-2 over captured-form fixtures
  (tests/career-bespoke-sites-portal.test.cjs E-series +
  tests/career-bespoke-sites-browser.test.cjs B1). No live 8VC form
  has been driven and nothing has been submitted through this family.

### Kleiner Perkins Fellows — fellows.kleinerperkins.com
- What it is: the Kleiner Perkins Fellows application on KP's own
  fellows site (census 2026-10-15 §7) — summer engineering internships
  inside KP portfolio companies, SF Bay Area, in person. Top criterion:
  "experience launching a meaningful product/project from scratch"; the
  program also asks about positions of influence in campus
  organizations (the offices themselves are not in the fact bank).
- Deadline: **January 31, 2027, 11:59pm PST** [census — stated in KP's
  own program listing].
- Account required to apply? None observed in the census. Fields are
  read at drive time — the sandbox board's field set is staged from
  the census summary (identity/contact/education/resume = FACT,
  including the CS/engineering/math/physics degree in progress;
  work-authorization/sponsorship screening; the launched-project
  write-up and the campus-leadership write-up are free-text owner asks
  that fill only from the owner's own confirmed draft — never
  invented, because those write-ups are the substance of this
  application).
- Driver posture: **allowed** (MI-104, branch work/mi104-bespoke-sites) —
  host gate in 149 + 150 + the helper's navigation gate, end-anchored
  so lookalikes stay refused; doorstep proven tier-2 over captured-form
  fixtures (tests/career-bespoke-sites-portal.test.cjs K-series +
  tests/career-bespoke-sites-browser.test.cjs B2). No live Kleiner
  Perkins form has been driven and nothing has been submitted through
  this family.

## Account-walled boards (not drivable in this build)

### Workday — *.myworkdayjobs.com
- Account required to apply? **Yes.** [probed: the public posting page
  is an unauthenticated JavaScript shell; the application itself lives
  inside the tenant's candidate app] [vendor flow: candidates are
  prompted to sign in, create an account, or — on some tenants —
  proceed as guest; guest mode is tenant-configured and cannot be
  assumed.] Accounts are **per employer tenant** — one Workday account
  at Nasdaq does nothing at Motorola.
- SSO options? Candidate accounts are email + password per tenant;
  employee SSO is separate and irrelevant to external candidates.
  [vendor flow]
- Email verification? Account creation verifies the email address
  before the application can be submitted. [vendor flow]
- Captcha? Workday runs bot management on tenant shells; challenges
  appear at the provider's discretion. [vendor flow]
- Driver posture: **refused by the host gate** (myworkdayjobs is not in
  the module-150 allowlist). Unblocks with the signed-in session design
  below + the owner's own sessions (CA-03 exit criterion).

### iCIMS — careers-*.icims.com
- Account required to apply? **Yes, in the standard flow** — applying
  routes through a candidate profile (login / create profile) per
  employer portal. [vendor flow; live probe of an Applied Systems
  posting was inconclusive: the page did not finish loading through
  this sandbox's egress within the probe budget — recorded honestly,
  not worked around.]
- SSO options? Many tenants offer social sign-in (Google / LinkedIn)
  on the profile page; tenant-configured. [vendor flow]
- Email verification? Profile creation verifies email on most tenants.
  [vendor flow]
- Captcha? reCAPTCHA appears on iCIMS login/registration surfaces.
  [vendor flow]
- Driver posture: **refused by the host gate** — same unblock path as
  Workday.

### Taleo (Oracle) — *.taleo.net
- Account required to apply? **Yes.** Taleo career sections gate the
  application behind an applicant login; first-time applicants
  register an account per employer. [vendor flow — Taleo job *search*
  pages are public (probed via search index), the apply step was not
  driven: the one live probe was cut short when the probe browser was
  closed by a harness timeout, recorded honestly.]
- SSO options? Generally none for candidates (employer-side SSO only).
  [vendor flow]
- Email verification? Registration uses the email as the account ID;
  verification varies by tenant. [vendor flow]
- Captcha? Varies by tenant; Taleo's age means many tenants have none,
  some have reCAPTCHA on registration. [vendor flow]
- Driver posture: **refused by the host gate** — same unblock path.

## The least-user path for account-walled boards (design — not built)

Where an account is unavoidable, the user should do as close to
nothing as possible, lawfully:

1. **One account per employer tenant**, created at the moment of the
   first real application to that tenant — never pre-created in bulk,
   never shared across employers, never reused credentials.
2. **Created with the user's own confirmed details** (name + email from
   their fact bank). The password is generated inside the credential
   vault: never shown in chat, never written to the repo, a log, or a
   screenshot.
3. **One approval covers it**: the batch approval card names the tenant
   and lists "create your <Employer> candidate account" as part of
   that application, so the user approves once and the account +
   application happen in one session.
4. **Email verification is retrieved, not forwarded**: the verification
   link or code is read from the user's own Gmail (the standing OTP
   pattern) and completed by the driver in the same session. The user
   never copy-pastes a code for a job board again.
5. **Sessions persist per tenant**: the isolated per-user browser
   profile for that tenant is kept (vaulted storage state), so the
   next application to the same employer starts already signed in.
   Revocable per tenant from the connections screen.
6. **Walls stay walls**: if account creation hits a captcha or a
   verification step the driver may not complete, the run stops with
   the handoff link + screenshot_ref and the user does exactly that
   one step — everything before and after stays automated.
7. **The user owns the account**: they can pull the credential from
   the vault at any time and delete the account on the tenant's own
   pages; Upmore's registry keeps only the tenant host + account email.

This design is documentation only. No account was created during the
CA-03 seam work, and building it needs the owner's signed-in session
work (CA-03 exit criterion) plus the vault flow.

## Captcha handoff — where screenshot_ref is produced (captcha-pack M4)

Module 120's handoff ticket cannot mint without a screenshot of the
stopped page. The reference is produced by the driver/host layer:

- Helper (`scripts/career/portal-browser-helper.cjs`): `fnDetectChallenge`
  reports the challenge; the helper never interacts with it.
- Driver (`packages/domain/150-career-portal-browser.js`):
  `captureStopScreenshot(at)` — called by `board.open()` and
  `board.atReview()` the moment a challenge is detected; writes
  `captcha-<boardId>-<at>.png` into the board's evidenceDir and returns
  its path as `screenshotRef` on the open/atReview result (null only if
  the capture itself failed — never fabricated).
- Pipeline (`packages/domain/149-career-portal-apply.js`): both
  CAPTCHA_HANDOFF branches of `runApply` surface it verbatim as the
  result field **`screenshot_ref`**, alongside `handoffUrl`.
- Proven by tests/career-portal-browser.test.cjs (captcha at open +
  captcha at review assert screenshot_ref points at a real PNG of the
  stopped page) and exercised in live runs whenever a board challenges.
- The submit leg follows the same rule: the helper's
  `submit_and_capture` refuses to click through a challenge
  (clicked: false), so a captcha at submit becomes an unknown outcome
  with the handoff, never a forced submission.

## Confirmation capture (armed submit lane)

`board.submit()` in module 150 fires only on a board created with
`submitArmed: true` (the owner-approved submit lane's switch, under
149's approval gate) and clicks exactly once. Immediately after the
click the driver captures the employer's answer — landing-page text,
any confirmation/application ID (read only when the page labels it as
one), and a full-page screenshot (`submit-confirmation-<boardId>.png`).
149 speaks "submitted" **only** when that capture carries an ID or
unambiguous success wording; anything else is `unknown_outcome`, and
`reconcile()` keeps an unverifiable board in unknown_outcome with the
reconcile lock on — an ambiguous landing can never be laundered into a
success or cleared for a blind retry.
